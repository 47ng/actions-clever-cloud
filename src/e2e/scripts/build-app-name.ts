import { buildE2EApplicationName } from '../clever-client.ts'
import { writeStepOutputs } from '../step-output.ts'

const runId = process.env.RUN_ID
const runAttempt = process.env.RUN_ATTEMPT
const githubOutput = process.env.GITHUB_OUTPUT

if (!runId || !runAttempt || !githubOutput) {
  throw new Error('Missing run identity for app naming')
}

const name = buildE2EApplicationName({ runId, runAttempt })
await writeStepOutputs(githubOutput, { name })
