import * as core from '@actions/core'
import { exec, type ExecOptions } from '@actions/exec'
import fs from 'node:fs/promises'
import path from 'node:path'
import { PassThrough, Transform, Writable } from 'node:stream'
import { clearTimeout, setTimeout } from 'node:timers'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

export type ExtraEnv = {
  [key: string]: string
}

export interface Arguments {
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
  sameCommitPolicy?: string
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
  const sameCommitPolicy = core.getInput('sameCommitPolicy') || undefined

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
    quiet,
    sameCommitPolicy
  }
}

async function checkForShallowCopy(): Promise<void> {
  let output = ''
  await exec('git', ['rev-parse', '--is-shallow-repository'], {
    listeners: {
      stdout: (data: Buffer) => (output += data.toString())
    }
  })
  if (output.trim() === 'true') {
    throw new Error(`This action requires an unshallow working copy.
-> Use the following step before running this action:
 - uses: actions/checkout@v3
   with:
     fetch-depth: 0
`)
  }
}

export default async function run({
  token,
  secret,
  appID,
  alias,
  force = false,
  cleverCLI,
  timeout,
  deployPath,
  logFile,
  quiet = false,
  extraEnv = {},
  sameCommitPolicy
}: Arguments): Promise<void> {
  try {
    await checkForShallowCopy()

    const execOptions: ExecOptions = {
      outStream: await getOutputStream(quiet, logFile)
    }

    if (deployPath) {
      try {
        await fs.access(deployPath)
        execOptions.cwd = deployPath
        core.info(`Deploying from directory: ${deployPath}`)
      } catch (error) {
        throw new Error(`Deploy path does not exist: ${deployPath}`)
      }
    }

    core.debug(`Clever CLI path: ${cleverCLI}`)

    // Authenticate (this will only store the credentials at a known location)
    await exec(cleverCLI, ['login', '--token', token, '--secret', secret])

    // There is an issue when there is a .clever.json file present
    // and only the appID is passed: link will work, but deploy will need
    // an alias to know which app to publish. In this case, we set the alias
    // to the appID, and the alias argument is ignored if also specified.
    if (appID) {
      core.debug(`Linking ${appID}`)
      await exec(cleverCLI, ['link', appID, '--alias', appID], execOptions)
      alias = appID
    }

    // If there are environment variables to pass to the application,
    // set them before deployment so the new instance can use them.
    for (const [envName, envValue] of Object.entries(extraEnv)) {
      const args = ['env', 'set']
      if (alias) {
        args.push('--alias', alias)
      }
      args.push(envName, envValue)
      core.info(`Setting environment variable ${envName}`)
      await exec(cleverCLI, args, execOptions)
    }

    const args = ['deploy']
    if (appID) {
      args.push('--alias', appID)
    } else if (alias) {
      args.push('--alias', alias)
    }

    if (force) {
      args.push('--force')
    }

    if (sameCommitPolicy) {
      args.push('--same-commit-policy', sameCommitPolicy)
    }

    if (timeout) {
      let timeoutID: NodeJS.Timeout | undefined
      let timedOut = false
      const timeoutPromise = new Promise<void>(resolve => {
        timeoutID = setTimeout(() => {
          timedOut = true
          resolve()
        }, timeout)
      })
      const result = await Promise.race([
        exec(cleverCLI, args, execOptions),
        timeoutPromise
      ])
      if (timeoutID) {
        clearTimeout(timeoutID)
      }
      if (timedOut) {
        core.info('Deployment timed out, moving on with workflow run')
      }
      core.info(`result: ${result}`)
      if (typeof result === 'number' && result !== 0) {
        throw new Error(`Deployment failed with code ${result}`)
      }
    } else {
      const code = await exec(cleverCLI, args, execOptions)
      core.info(`code: ${code}`)
      if (code !== 0) {
        throw new Error(`Deployment failed with code ${code}`)
      }
    }
  } catch (error) {
    if (error instanceof Error) {
      core.setFailed(error.message)
    } else {
      core.setFailed(String(error))
    }
  }
}

// --

async function getOutputStream(
  quiet: boolean,
  logFile?: string
): Promise<Writable> {
  const tee = new PassThrough()
  if (!quiet) {
    let lineSeparator = '\n'
    async function* splitNewlines(
      input: AsyncIterable<Buffer>
    ): AsyncGenerator<string> {
      for await (const chunk of input) {
        const str = Buffer.isBuffer(chunk) ? chunk.toString('utf8') : chunk
        if (str.includes('\r\n')) {
          lineSeparator = '\r\n'
        }
        const lines = str.split(/\r?\n/)
        for (const line of lines) {
          yield line
        }
      }
    }
    async function* injectAnnotations(
      lines: AsyncIterable<string>
    ): AsyncGenerator<string> {
      for await (const line of lines) {
        yield line + lineSeparator
        // Remove timestamp
        const message = line.slice('xxxx-xx-xxTxx:xx:xx+xx:xx '.length)
        if (
          message.startsWith('::notice ') ||
          message.startsWith('::error ') ||
          message.startsWith('::warning ')
        ) {
          yield message + lineSeparator
        }
      }
    }
    tee
      .pipe(Transform.from(splitNewlines))
      .pipe(Transform.from(injectAnnotations))
      .pipe(process.stdout)
  }
  if (logFile) {
    const logFileStream = (await fs.open(logFile, 'w')).createWriteStream()
    tee.pipe(logFileStream)
  }
  return tee
}
