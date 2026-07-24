import { appendFile, readFile } from 'node:fs/promises'
import { createCleverController } from '../clever-client.ts'
import { confirmRejectedDeploymentPreservesLiveApp } from '../deployment-observer.ts'
import {
  createFetchHealth,
  createRunCommand,
  resolveCleverCLI
} from '../workflow-adapters.ts'

const appId = process.env.APP_ID
const actionOutcome = process.env.ACTION_OUTCOME
const statePath = process.env.STATE_PATH
const logPath = process.env.LOG_PATH
const githubOutput = process.env.GITHUB_OUTPUT
const cleverCLI = resolveCleverCLI()

if (!appId || !actionOutcome || !statePath || !logPath || !githubOutput) {
  throw new Error('Missing divergent rejection assertion inputs')
}

if (actionOutcome !== 'failure') {
  throw new Error('Expected divergent deployment without force to fail')
}

const previousState = JSON.parse(await readFile(statePath, 'utf8'))
const controller = createCleverController({
  cleverCLI,
  runCommand: createRunCommand()
})

const healthURL = new URL(
  '/health',
  await controller.getPublicOrigin(appId)
).toString()
const health = await confirmRejectedDeploymentPreservesLiveApp({
  appId,
  healthURL,
  expectedScenario: 'healthy',
  previousActivity: previousState.activity,
  previousCommitID: previousState.commitId,
  previousDeploymentID: previousState.deploymentId,
  listActivity: controller.listActivity,
  fetchHealth: createFetchHealth(),
  noNewActivityTimeoutMs: 15_000,
  settleTimeoutMs: 600_000,
  pollIntervalMs: 5_000
})

if (health.INSTANCE_ID !== previousState.instanceId) {
  throw new Error(
    'Expected divergent rejection to preserve the prior healthy instance ID'
  )
}
if (health.CC_DEPLOYMENT_ID !== previousState.deploymentId) {
  throw new Error(
    'Expected divergent rejection to preserve the prior healthy deployment ID'
  )
}
if (health.CC_COMMIT_ID !== previousState.commitId) {
  throw new Error(
    'Expected divergent rejection to preserve the prior healthy commit ID'
  )
}

const logContent = await readFile(logPath, 'utf8')
const nonFastForwardMarkers = [
  'not a simple fast-forward',
  'non-fast-forward',
  '[rejected]',
  'fetch first',
  'Updates were rejected'
]
if (!nonFastForwardMarkers.some(marker => logContent.includes(marker))) {
  throw new Error(
    'Expected divergent deployment without force log to mention a non-fast-forward rejection'
  )
}

await appendFile(
  githubOutput,
  `instance_id=${health.INSTANCE_ID ?? ''}\n` +
    `deployment_id=${health.CC_DEPLOYMENT_ID ?? ''}\n` +
    `commit_id=${health.CC_COMMIT_ID ?? ''}\n`
)
