import { appendFile, readFile } from 'node:fs/promises'
import { createCleverController } from '../clever-client.ts'
import {
  waitForHealthyDeployment,
  waitForNewFailedDeploymentActivity
} from '../deployment-observer.ts'
import { FIXTURE_BUILD_FAILURE_MARKER } from '../fixture-app.ts'
import {
  createFetchHealth,
  createRunCommand,
  resolveCleverCLI
} from '../workflow-adapters.ts'

const appId = process.env.APP_ID
const actionOutcome = process.env.ACTION_OUTCOME
const expectedCommitID = process.env.EXPECTED_COMMIT_ID
const statePath = process.env.STATE_PATH
const logPath = process.env.LOG_PATH
const githubOutput = process.env.GITHUB_OUTPUT
const cleverCLI = resolveCleverCLI()

if (
  !appId ||
  !actionOutcome ||
  !expectedCommitID ||
  !statePath ||
  !logPath ||
  !githubOutput
) {
  throw new Error('Missing build-failure assertion inputs')
}

if (actionOutcome !== 'failure') {
  throw new Error('Expected build-failure deployment to fail')
}

const previousState = JSON.parse(await readFile(statePath, 'utf8'))
const controller = createCleverController({
  cleverCLI,
  runCommand: createRunCommand()
})

const failedDeployment = await waitForNewFailedDeploymentActivity({
  appId,
  expectedCommitID,
  previousActivity: previousState.activity,
  listActivity: controller.listActivity
})

const application = await controller.getApplication(appId)
const healthURL = new URL('/health', `${application.deployURL}/`).toString()
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
    'Expected build-failure deployment to preserve the prior healthy instance ID'
  )
}

const logContent = await readFile(logPath, 'utf8')
if (!logContent.includes(FIXTURE_BUILD_FAILURE_MARKER)) {
  throw new Error(
    'Expected build-failure log to contain the deterministic fixture marker'
  )
}

await appendFile(
  githubOutput,
  `instance_id=${health.INSTANCE_ID ?? ''}\n` +
    `deployment_id=${failedDeployment.uuid ?? ''}\n` +
    `commit_id=${failedDeployment.commit ?? expectedCommitID}\n`
)
