import path from 'path'
import * as core from '@actions/core'
import { exec } from '@actions/exec'

enum LogsToShow {
  full = 'full',
  build = 'build',
  none = 'none'
}

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

    // There is an issue when there is a .clever.json file present
    // and only the appID is passed: link will work, but deploy will need
    // an alias to know which app to publish. In this case, we set the alias
    // to the appID (if it was not already specified).
    const appID = core.getInput('appID')
    const alias = core.getInput('alias') || appID
    const logsToShow = core.getInput('logs') as LogsToShow
    const cleverCLI = path.resolve(__dirname, '../node_modules/.bin/clever')
    core.debug(`Clever CLI path: ${cleverCLI}`)

    // Authenticate (this will only store the credentials at a known location)
    await exec(cleverCLI, ['login', '--token', token, '--secret', secret])

    if (appID) {
      core.debug(`Linking ${appID}`)
      await exec(cleverCLI, ['link', appID, '--alias', alias])
    }

    const args = ['deploy']
    if (alias) {
      args.push('--alias', alias)
    }
    await exec(cleverCLI, args, {
      silent: true,
      listeners: {
        debug: line => {
          core.info(`dbg: ${line}`)
        },
        stdline: line => {
          core.info(`std: ${line}`)
          if (
            line === 'Your source code has been pushed to Clever Cloud.' &&
            logsToShow === LogsToShow.none
          ) {
            core.info('-> quit now')
            // quit now
          }
          if (
            line.includes('Build succeeded in') &&
            logsToShow === LogsToShow.build
          ) {
            core.info('-> quit now')
          }
        }
      }
    })
  } catch (error) {
    core.setFailed(error.message)
  }
}

run()
