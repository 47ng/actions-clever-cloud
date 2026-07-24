import { appendFile, readFile } from 'node:fs/promises'
import { createCleverController } from '../clever-client.ts'
import {
  confirmNoNewDeploymentActivity,
  waitForHealthyDeployment
} from '../deployment-observer.ts'
import {
  createFetchHealth,
  createRunCommand,
  resolveCleverCLI
} from '../workflow-adapters.ts'

const appId = process.env.APP_ID
const actionOutcome = process.env.ACTION_OUTCOME
const statePath = process.env.STATE_PATH
const githubOutput = process.env.GITHUB_OUTPUT
const cleverCLI = resolveCleverCLI()

if (!appId || !actionOutcome || !statePath || !githubOutput) {
  throw new Error('Missing same-commit ignore observation inputs')
}

if (actionOutcome !== 'success') {
  throw new Error('Expected sameCommitPolicy: ignore to succeed')
}

const previousState = JSON.parse(await readFile(statePath, 'utf8'))
const controller = createCleverController({
  cleverCLI,
  runCommand: createRunCommand()
})

await confirmNoNewDeploymentActivity({
  appId,
  previousActivity: previousState.activity,
  listActivity: controller.listActivity,
  settleTimeoutMs: 15_000,
  pollIntervalMs: 5_000
})

const healthURL = new URL(
  '/health',
  await controller.getPublicOrigin(appId)
).toString()
const health = await waitForHealthyDeployment({
  appId,
  healthURL,
  expectedScenario: 'healthy',
  expectedCommitID: previousState.commitId,
  expectedDeploymentID: previousState.deploymentId,
  listActivity: controller.listActivity,
  fetchHealth: createFetchHealth()
})

if (health.INSTANCE_ID !== previousState.instanceId) {
  throw new Error(
    'Expected sameCommitPolicy: ignore to keep the same instance ID'
  )
}
if (health.CC_DEPLOYMENT_ID !== previousState.deploymentId) {
  throw new Error(
    'Expected sameCommitPolicy: ignore to keep the same deployment ID'
  )
}
if (health.CC_COMMIT_ID !== previousState.commitId) {
  throw new Error(
    'Expected sameCommitPolicy: ignore to keep the same commit ID'
  )
}

await appendFile(
  githubOutput,
  `instance_id=${health.INSTANCE_ID ?? ''}\n` +
    `deployment_id=${health.CC_DEPLOYMENT_ID ?? ''}\n` +
    `commit_id=${health.CC_COMMIT_ID ?? ''}\n`
)
