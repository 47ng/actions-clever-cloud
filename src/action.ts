import * as core from '@actions/core'
import { exec } from '@actions/exec'
import path from 'path'
import { clearTimeout, setTimeout } from 'timers'

export type ExtraEnv = {
  [key: string]: string
}

export interface Arguments {
  token: string
  secret: string
  alias?: string
  appID?: string
  timeout?: number
  cleverCLI: string
  extraEnv?: ExtraEnv
}

function throwMissingEnvVar(name: string): never {
  throw new Error(
    `Missing ${name} environment variable: https://err.sh/47ng/actions-clever-cloud/env`
  )
}

function listExtraEnv(): ExtraEnv {
  const envLineRegex = /^(\w+)=(.*)$/

  const extraEnv = core
    .getMultilineInput('setEnv')
    .map(line => line.trim())
    .reduce((env, line) => {
      const match = line.match(envLineRegex)
      if (!match) {
        return env
      }
      const key = match[1]
      const value = match[2]
      env[key] = value
      return env
    }, {} as Record<string, string>)

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
  const timeout = parseInt(core.getInput('timeout')) || undefined
  return {
    token,
    secret,
    alias,
    appID,
    timeout,
    cleverCLI: path.resolve(__dirname, '../node_modules/.bin/clever'),
    extraEnv: listExtraEnv()
  }
}

export default async function run({
  token,
  secret,
  appID,
  alias,
  cleverCLI,
  timeout,
  extraEnv = {}
}: Arguments): Promise<void> {
  try {
    core.debug(`Clever CLI path: ${cleverCLI}`)

    // Authenticate (this will only store the credentials at a known location)
    await exec(cleverCLI, ['login', '--token', token, '--secret', secret])

    // There is an issue when there is a .clever.json file present
    // and only the appID is passed: link will work, but deploy will need
    // an alias to know which app to publish. In this case, we set the alias
    // to the appID, and the alias argument is ignored if also specified.
    if (appID) {
      core.debug(`Linking ${appID}`)
      await exec(cleverCLI, ['link', appID, '--alias', appID])
      alias = appID
    }

    // If there are environment variables to pass to the application,
    // set them before deployment so the new instance can use them.
    for (const envName of Object.keys(extraEnv)) {
      const args = ['env', 'set']
      if (alias) {
        args.push('--alias', alias)
      }
      args.push(envName, extraEnv[envName])
      await exec(cleverCLI, args)
    }

    const args = ['deploy']
    if (appID) {
      args.push('--alias', appID)
    } else if (alias) {
      args.push('--alias', alias)
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
      const result = await Promise.race([exec(cleverCLI, args), timeoutPromise])
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
      const code = await exec(cleverCLI, args)
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
