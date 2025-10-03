import * as core from '@actions/core'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

type ExtraEnv = {
  [key: string]: string
}

export type Arguments = {
  token: string
  secret: string
  alias?: string
  appID?: string
  force?: boolean
  timeout?: number
  cleverCLI: string
  extraEnv?: ExtraEnv
  deployPath?: string
  logFile?: string
  quiet?: boolean
}

function throwMissingEnvVar(name: string): never {
  throw new Error(
    `Missing ${name} environment variable: https://err.sh/47ng/actions-clever-cloud/env`
  )
}

const ENV_LINE_REGEX = /^(\w+)=(.*)$/

function listExtraEnv(): ExtraEnv {
  const extraEnv = core
    .getMultilineInput('setEnv')
    .map(line => line.trim())
    .reduce(
      (env, line) => {
        const match = line.match(ENV_LINE_REGEX)
        if (!match) {
          return env
        }
        const key = match[1]!
        const value = match[2]!
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

export function processArguments(): Arguments {
  const token = process.env.CLEVER_TOKEN
  const secret = process.env.CLEVER_SECRET
  if (!token) {
    throwMissingEnvVar('CLEVER_TOKEN')
  }
  if (!secret) {
    throwMissingEnvVar('CLEVER_SECRET')
  }

  const appID = core.getInput('appID')
  const alias = core.getInput('alias')
  const force = core.getBooleanInput('force', { required: false })
  const timeout = parseInt(core.getInput('timeout')) || undefined
  const logFile = core.getInput('logFile') || undefined
  const quiet = core.getBooleanInput('quiet', { required: false })
  const deployPath = core.getInput('deployPath') || undefined

  return {
    token,
    secret,
    alias,
    force,
    appID,
    timeout,
    deployPath,
    cleverCLI: path.resolve(__dirname, '../node_modules/.bin/clever'),
    extraEnv: listExtraEnv(),
    logFile,
    quiet
  }
}
