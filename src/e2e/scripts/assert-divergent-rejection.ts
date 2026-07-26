import { readFile } from 'node:fs/promises'
import { createCleverController } from '../clever-client.ts'
import { confirmRejectedDeploymentPreservesLiveApp } from '../deployment-observer.ts'
import { writeStepOutputs } from '../step-output.ts'
import {
  assertDivergentRejectionPreservedProduction,
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
  throw new Error('Missing divergent rejection assertion inputs')
}

if (actionOutcome !== 'failure') {
  throw new Error('Expected divergent deployment without force to fail')
}

const previousState = parseBaselineState(
  JSON.parse(await readFile(statePath, 'utf8'))
)
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
  previousActivity: previousState.activity as Awaited<
    ReturnType<typeof controller.listActivity>
  >,
  previousCommitID: previousState.commitId,
  previousDeploymentID: previousState.deploymentId,
  listActivity: controller.listActivity,
  fetchHealth: createFetchHealth(),
  noNewActivityTimeoutMs: 15_000,
  settleTimeoutMs: 600_000,
  pollIntervalMs: 5_000
})

const logContent = await readFile(logPath, 'utf8')
assertDivergentRejectionPreservedProduction({
  health,
  baseline: previousState,
  logContent
})

await writeStepOutputs(githubOutput, {
  instance_id: health.INSTANCE_ID,
  deployment_id: health.CC_DEPLOYMENT_ID,
  commit_id: health.CC_COMMIT_ID
})
