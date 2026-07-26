import { readFile } from 'node:fs/promises'
import { createCleverController } from '../clever-client.ts'
import { waitForNewHealthyDeployment } from '../deployment-observer.ts'
import { writeStepOutputs } from '../step-output.ts'
import {
  assertForcedDeploymentReplacedProduction,
  parseBaselineState
} from '../scenario-assertions.ts'
import {
  createFetchHealth,
  createRunCommand,
  resolveCleverCLI
} from '../workflow-adapters.ts'

const appId = process.env.APP_ID
const actionOutcome = process.env.ACTION_OUTCOME
const expectedCommitID = process.env.EXPECTED_COMMIT_ID
const statePath = process.env.STATE_PATH
const githubOutput = process.env.GITHUB_OUTPUT
const cleverCLI = resolveCleverCLI()

if (
  !appId ||
  !actionOutcome ||
  !expectedCommitID ||
  !statePath ||
  !githubOutput
) {
  throw new Error('Missing divergent force observation inputs')
}

if (actionOutcome !== 'success') {
  throw new Error('Expected divergent deployment with force to succeed')
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
const result = await waitForNewHealthyDeployment({
  appId,
  healthURL,
  expectedScenario: 'healthy',
  expectedCommitID,
  previousActivity: previousState.activity as Awaited<
    ReturnType<typeof controller.listActivity>
  >,
  listActivity: controller.listActivity,
  fetchHealth: createFetchHealth()
})

assertForcedDeploymentReplacedProduction({
  health: result.health,
  baseline: previousState
})

await writeStepOutputs(githubOutput, {
  instance_id: result.health.INSTANCE_ID,
  deployment_id: result.deployment.uuid ?? result.health.CC_DEPLOYMENT_ID,
  commit_id: result.health.CC_COMMIT_ID
})
