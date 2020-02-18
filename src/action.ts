import path from 'path'
import * as core from '@actions/core'
import { exec } from '@actions/exec'

export type ExtraEnv = {
  [key: string]: string
}

export interface Arguments {
  token: string
  secret: string
  alias?: string
  appID?: string
  cleverCLI: string
  extraEnv?: ExtraEnv
}

function throwMissingEnvVar(name: string): never {
  throw new Error(
    `Missing ${name} environment variable: https://err.sh/47ng/actions-clever-cloud/env`
  )
}

function listExtraEnv(): ExtraEnv {
  return Object.keys(process.env)
    .filter(name => name.startsWith('INPUT_CLEVER_ENV_'))
    .reduce((env, key) => {
      const targetEnvName = key.replace(/^INPUT_CLEVER_ENV_/, '')
      return {
        ...env,
        [targetEnvName]: process.env[key]
      }
    }, {})
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
  return {
    token,
    secret,
    alias,
    appID,
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
    if (Object.keys(extraEnv).length) {
      core.info('Setting extra environment variables:')
      for (const envName of Object.keys(extraEnv)) {
        core.info(`  ${envName}`)
      }
    }
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
    await exec(cleverCLI, args)
  } catch (error) {
    core.setFailed(error.message)
  }
}
