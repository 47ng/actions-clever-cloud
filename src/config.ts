import * as core from '@actions/core'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

type ExtraEnv = {
  [key: string]: string
}

export type Config = {
  alias?: string
  appID?: string
  force: boolean
  timeout?: number
  cleverCLI: string
  extraEnv: ExtraEnv
  deployPath?: string
  logFile?: string
  quiet: boolean
  sameCommitPolicy?: string
}

function throwMissingEnvVar(name: string): never {
  throw new Error(
    `Missing ${name} environment variable: https://err.sh/47ng/actions-clever-cloud/env`
  )
}

const ENV_LINE_REGEX = /^([a-zA-Z0-9-_.]+)=(.*)$/
const TIMEOUT_INPUT_REGEX = /^\d+$/
const MAX_TIMEOUT_SECONDS = 24 * 60 * 60

function invalidTimeoutError(input: string): Error {
  return new Error(
    `Invalid timeout value: ${input} (expected an integer number of seconds between 1 and ${MAX_TIMEOUT_SECONDS}, or 0 to disable)`
  )
}

function redactValue(line: string): string {
  const equalsIndex = line.indexOf('=')
  if (equalsIndex === -1) {
    return `(content hidden, no '=' found)`
  }
  return `${line.slice(0, equalsIndex)}=***`
}

function parseEnvValue(value: string): string | undefined {
  const quote = value[0]
  if (quote !== '"' && quote !== "'") {
    return value
  }

  let closingQuoteIndex = 1
  let escaped = false
  while (closingQuoteIndex < value.length) {
    if (value[closingQuoteIndex] === quote && !escaped) {
      break
    }
    escaped = value[closingQuoteIndex] === '\\'
    closingQuoteIndex += 1
  }
  if (closingQuoteIndex !== value.length - 1) {
    return undefined
  }

  const quotedValue = value.slice(1, closingQuoteIndex)
  const quotePattern = quote === '"' ? /([\\]*)"/g : /([\\]*)'/g
  return quotedValue.replace(quotePattern, (_, slashes: string) => {
    return '\\'.repeat((slashes.length - 1) / 2) + quote
  })
}

function listExtraEnv(): ExtraEnv {
  const extraEnv = core
    .getMultilineInput('setEnv', { trimWhitespace: false })
    .map(line => line.replace(/\r$/, '').trimStart())
    .reduce(
      (env, line) => {
        if (line === '') {
          return env
        }
        const match = line.match(ENV_LINE_REGEX)
        if (!match) {
          if (!line.startsWith('#')) {
            core.warning(
              `Ignoring setEnv line that is not KEY=value (keys are [A-Za-z0-9_.-]): ${redactValue(line)}`
            )
          }
          return env
        }
        const key = match[1]!
        if (key === '__proto__') {
          core.warning(`Ignoring setEnv line with key: ${redactValue(line)}`)
          return env
        }
        const value = parseEnvValue(match[2]!)
        if (value === undefined) {
          core.warning(
            `Ignoring setEnv line with invalid quotes: ${redactValue(line)}`
          )
          return env
        }
        env[key] = value
        return env
      },
      {} as Record<string, string>
    )

  if (Object.keys(extraEnv).length) {
    core.info('Setting extra environment variables:')
    for (const envName in extraEnv) {
      core.info(`  ${envName}`)
    }
  }
  return extraEnv
}

export function parseConfig(): Config {
  // The values are only read by the Clever CLI (its virtual `$env` profile),
  // but fail fast with a helpful error when they are missing.
  if (!process.env.CLEVER_TOKEN) {
    throwMissingEnvVar('CLEVER_TOKEN')
  }
  if (!process.env.CLEVER_SECRET) {
    throwMissingEnvVar('CLEVER_SECRET')
  }

  const appID = core.getInput('appID') || undefined
  const alias = core.getInput('alias') || undefined
  const force = core.getBooleanInput('force', { required: false })
  const timeoutInput = core.getInput('timeout')
  let timeout: number | undefined = undefined
  if (timeoutInput) {
    if (!TIMEOUT_INPUT_REGEX.test(timeoutInput.trim())) {
      throw invalidTimeoutError(timeoutInput)
    }
    const parsed = Number(timeoutInput)
    if (parsed === 0) {
      // 0 means "no timeout", for backwards compatibility with v2.
      timeout = undefined
    } else if (!Number.isSafeInteger(parsed) || parsed > MAX_TIMEOUT_SECONDS) {
      throw invalidTimeoutError(timeoutInput)
    } else {
      timeout = parsed
    }
  }
  const logFile = core.getInput('logFile') || undefined
  const quiet = core.getBooleanInput('quiet', { required: false })
  const deployPath = core.getInput('deployPath') || undefined
  const sameCommitPolicy = core.getInput('sameCommitPolicy') || undefined

  return {
    alias,
    force,
    appID,
    timeout,
    deployPath,
    cleverCLI: path.resolve(__dirname, '../node_modules/.bin/clever'),
    extraEnv: listExtraEnv(),
    logFile,
    quiet,
    sameCommitPolicy
  }
}
