import { appendFile } from 'node:fs/promises'
import { createCleverController } from '../clever-client.ts'
import { cancelTimedOutDeploymentPreservesLiveApp } from '../deployment-observer.ts'
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

const application = await controller.getApplication(appId)
const healthURL = new URL('/health', `${application.deployURL}/`).toString()
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
  settleTimeoutMs: 600_000,
  pollIntervalMs: 5_000
})

if (result.health.INSTANCE_ID !== previousInstanceId) {
  throw new Error(
    'Expected timed-out deployment to preserve the prior healthy forced instance ID'
  )
}

await appendFile(
  githubOutput,
  `instance_id=${result.health.INSTANCE_ID ?? ''}\n` +
    `deployment_id=${result.cancelledDeployment.uuid ?? ''}\n` +
    `commit_id=${result.cancelledDeployment.commit ?? expectedCancelledCommitID}\n`
)
