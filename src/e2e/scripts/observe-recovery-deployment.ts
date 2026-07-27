import { createCleverController } from '../clever-client.ts'
import { waitForHealthyDeployment } from '../deployment-observer.ts'
import { writeStepOutputs } from '../step-output.ts'
import {
  createFetchHealth,
  createRunCommand,
  resolveCleverCLI
} from '../workflow-adapters.ts'

const appId = process.env.APP_ID
const expectedCommitID = process.env.EXPECTED_COMMIT_ID
const actionTimedOut = process.env.ACTION_TIMED_OUT
const githubOutput = process.env.GITHUB_OUTPUT
const cleverCLI = resolveCleverCLI()

if (!appId || !expectedCommitID || !actionTimedOut || !githubOutput) {
  throw new Error('Missing recovery deployment observation inputs')
}

if (actionTimedOut !== 'false') {
  throw new Error('Expected completed deployment action to set timedOut=false')
}

const controller = createCleverController({
  cleverCLI,
  runCommand: createRunCommand()
})

const healthURL = new URL(
  '/health',
  await controller.getPublicOrigin(appId)
).toString()
const health = await waitForHealthyDeployment({
  appId,
  healthURL,
  expectedScenario: 'healthy',
  expectedCommitID,
  listActivity: controller.listActivity,
  fetchHealth: createFetchHealth()
})

await writeStepOutputs(githubOutput, {
  instance_id: health.INSTANCE_ID,
  deployment_id: health.CC_DEPLOYMENT_ID,
  commit_id: health.CC_COMMIT_ID
})
