import { readFile } from 'node:fs/promises'
import { createCleverController } from '../clever-client.ts'
import {
  waitForHealthyDeployment,
  waitForNewFailedDeploymentActivity
} from '../deployment-observer.ts'
import {
  assertStartupFailurePreservedProduction,
  parseBaselineState
} from '../scenario-assertions.ts'
import { writeStepOutputs } from '../step-output.ts'
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
  throw new Error('Missing startup-failure assertion inputs')
}

if (actionOutcome !== 'failure') {
  throw new Error('Expected startup-failure deployment to fail')
}

const previousState = parseBaselineState(
  JSON.parse(await readFile(statePath, 'utf8'))
)
const controller = createCleverController({
  cleverCLI,
  runCommand: createRunCommand()
})

const failedDeployment = await waitForNewFailedDeploymentActivity({
  appId,
  expectedCommitID,
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
  expectedDeploymentID: previousState.deploymentId,
  listActivity: controller.listActivity,
  fetchHealth: createFetchHealth()
})

const logContent = await readFile(logPath, 'utf8')
assertStartupFailurePreservedProduction({
  health,
  baseline: previousState,
  logContent
})

await writeStepOutputs(githubOutput, {
  instance_id: health.INSTANCE_ID,
  deployment_id: failedDeployment.uuid,
  commit_id: failedDeployment.commit ?? expectedCommitID
})
