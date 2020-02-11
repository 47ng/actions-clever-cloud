import run, { processArguments } from './action'
import core from '@actions/core'

async function main(): Promise<void> {
  try {
    const args = processArguments()
    return await run(args)
  } catch (error) {
    core.setFailed(error.message)
  }
}

if (require.main === module) {
  main()
}
