import { createCleverController } from '../clever-client.ts'
import { cancelTimedOutDeploymentPreservesLiveApp } from '../deployment-observer.ts'
import { assertTimeoutOutcome } from '../scenario-assertions.ts'
import { writeStepOutputs } from '../step-output.ts'
import {
  createFetchHealth,
  createRunCommand,
  resolveCleverCLI
} from '../workflow-adapters.ts'

const appId = process.env.APP_ID
const expectedCancelledCommitID = process.env.EXPECTED_CANCELLED_COMMIT_ID
const previousInstanceId = process.env.PREVIOUS_INSTANCE_ID
const previousCommitId = process.env.PREVIOUS_COMMIT_ID
const previousDeploymentId = process.env.PREVIOUS_DEPLOYMENT_ID
const githubOutput = process.env.GITHUB_OUTPUT
const cleverCLI = resolveCleverCLI()

if (
  !appId ||
  !expectedCancelledCommitID ||
  !previousInstanceId ||
  !previousCommitId ||
  !previousDeploymentId ||
  !githubOutput
) {
  throw new Error('Missing timeout observation inputs')
}

const controller = createCleverController({
  cleverCLI,
  runCommand: createRunCommand()
})

const healthURL = new URL(
  '/health',
  await controller.getPublicOrigin(appId)
).toString()
const result = await cancelTimedOutDeploymentPreservesLiveApp({
  appId,
  healthURL,
  expectedCancelledCommitID,
  expectedScenario: 'healthy',
  previousCommitID: previousCommitId,
  previousDeploymentID: previousDeploymentId,
  listActivity: controller.listActivity,
  cancelDeployment: async (appId, deploymentId, timeoutMs) =>
    controller.cancelDeployment({ appId, deploymentId, timeoutMs }),
  fetchHealth: createFetchHealth(),
  pollIntervalMs: 5_000
})

assertTimeoutOutcome({
  outcome: result.outcome,
  health: result.health,
  expectedCancelledCommitID,
  previousInstanceId
})

if (result.outcome === 'completed') {
  console.log(
    'Timed-out deployment completed before cancellation; it is live and healthy'
  )
} else {
  console.log(`Timed-out deployment settled as ${result.outcome}`)
}

await writeStepOutputs(githubOutput, {
  outcome: result.outcome,
  instance_id: result.health.INSTANCE_ID,
  deployment_id: result.deployment.uuid,
  commit_id: result.deployment.commit ?? expectedCancelledCommitID
})
