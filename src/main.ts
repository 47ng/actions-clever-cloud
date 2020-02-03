import path from 'path'
import * as core from '@actions/core'
import { exec } from '@actions/exec'

function throwMissingEnvVar(name: string): never {
  throw new Error(
    `Missing ${name} environment variable: https://err.sh/47ng/actions-clever-cloud/env`
  )
}

async function run(): Promise<void> {
  try {
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
    // Will be copied from deps at build time
    const cleverCLI = path.resolve(__dirname, '../node_modules/.bin/clever')
    await exec(cleverCLI, ['login', '--token', token, '--secret', secret])

    if (appID) {
      const args = alias ? ['link', appID, '--alias', alias] : ['link', appID]
      core.debug(`Linking ${appID}`)
      await exec(cleverCLI, args)
    }

    const args = ['deploy']
    if (alias) {
      args.push('--alias')
      args.push(alias)
    }
    await exec(cleverCLI, args)
  } catch (error) {
    core.setFailed(error.message)
  }
}

run()
