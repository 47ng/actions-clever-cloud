import { appendFile, readFile, writeFile } from 'node:fs/promises'
import { createCleverController } from '../clever-client.ts'
import {
  waitForHealthyDeployment,
  waitForNewSuccessfulDeploymentActivity
} from '../deployment-observer.ts'
import {
  assertSameCommitRestartChangedProduction,
  parseBaselineState
} from '../scenario-assertions.ts'
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

const previousState = parseBaselineState(
  JSON.parse(await readFile(statePath, 'utf8'))
)
const controller = createCleverController({
  cleverCLI,
  runCommand: createRunCommand()
})

const deployment = await waitForNewSuccessfulDeploymentActivity({
  appId,
  expectedCommitID: previousState.commitId,
  previousActivity: previousState.activity as Awaited<
    ReturnType<typeof controller.listActivity>
  >,
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

const logContent = await readFile(logPath, 'utf8')
assertSameCommitRestartChangedProduction({
  health,
  baseline: previousState,
  logContent
})

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
