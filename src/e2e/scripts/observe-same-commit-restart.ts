import { appendFile, readFile, writeFile } from 'node:fs/promises'
import { createCleverController } from '../clever-client.ts'
import {
  waitForHealthyDeployment,
  waitForNewSuccessfulDeploymentActivity
} from '../deployment-observer.ts'
import { FIXTURE_BUILD_MARKER } from '../fixture-app.ts'
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
  throw new Error('Missing same-commit restart observation inputs')
}

if (actionOutcome !== 'success') {
  throw new Error('Expected sameCommitPolicy: restart to succeed')
}

const previousState = JSON.parse(await readFile(statePath, 'utf8'))
const controller = createCleverController({
  cleverCLI,
  runCommand: createRunCommand()
})

const deployment = await waitForNewSuccessfulDeploymentActivity({
  appId,
  expectedCommitID: previousState.commitId,
  previousActivity: previousState.activity,
  listActivity: controller.listActivity
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
  expectedDeploymentID: deployment.uuid,
  listActivity: controller.listActivity,
  fetchHealth: createFetchHealth()
})

if (!health.INSTANCE_ID) {
  throw new Error(
    'Expected sameCommitPolicy: restart to report a new instance ID'
  )
}
if (health.INSTANCE_ID === previousState.instanceId) {
  throw new Error(
    'Expected sameCommitPolicy: restart to change the instance ID'
  )
}
if (health.CC_DEPLOYMENT_ID === previousState.deploymentId) {
  throw new Error(
    'Expected sameCommitPolicy: restart to change the deployment ID'
  )
}
if (health.CC_COMMIT_ID !== previousState.commitId) {
  throw new Error(
    'Expected sameCommitPolicy: restart to keep the same commit ID'
  )
}

const logContent = await readFile(logPath, 'utf8')
if (logContent.includes(FIXTURE_BUILD_MARKER)) {
  throw new Error(
    'Expected restart to reuse cache without a new install marker'
  )
}

const activity = await controller.listActivity(appId)
await writeFile(
  statePath,
  JSON.stringify(
    {
      activity,
      instanceId: health.INSTANCE_ID,
      deploymentId: health.CC_DEPLOYMENT_ID,
      commitId: health.CC_COMMIT_ID
    },
    null,
    2
  ),
  'utf8'
)

await appendFile(
  githubOutput,
  `instance_id=${health.INSTANCE_ID ?? ''}\n` +
    `deployment_id=${health.CC_DEPLOYMENT_ID ?? ''}\n` +
    `commit_id=${health.CC_COMMIT_ID ?? ''}\n`
)
