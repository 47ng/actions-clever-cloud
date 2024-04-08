import * as core from '@actions/core'
import run, { processArguments } from './action'

async function main(): Promise<void> {
  try {
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

main()
