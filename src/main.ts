import * as core from '@actions/core'
import { exec } from '@actions/exec'
import run, { processArguments } from './action'

async function main(): Promise<void> {
  try {
    await fixGitDubiousOwnership()
    const args = processArguments()
    return await run(args)
  } catch (error) {
    if (error instanceof Error) {
      core.setFailed(error.message)
    } else {
      core.setFailed(String(error))
    }
  }
}

// https://www.kenmuse.com/blog/avoiding-dubious-ownership-in-dev-containers/
function fixGitDubiousOwnership() {
  return exec('git', [
    'config',
    '--global',
    '--add',
    'safe.directory',
    '/github/workspace'
  ])
}

main()
