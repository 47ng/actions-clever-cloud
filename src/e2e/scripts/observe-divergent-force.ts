import { appendFile, readFile } from 'node:fs/promises'
import { createCleverController } from '../clever-client.ts'
import { waitForNewHealthyDeployment } from '../deployment-observer.ts'
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

const previousState = JSON.parse(await readFile(statePath, 'utf8'))
const controller = createCleverController({
  cleverCLI,
  runCommand: createRunCommand()
})

const application = await controller.getApplication(appId)
const healthURL = new URL('/health', `${application.deployURL}/`).toString()
const result = await waitForNewHealthyDeployment({
  appId,
  healthURL,
  expectedScenario: 'healthy',
  expectedCommitID,
  previousActivity: previousState.activity,
  listActivity: controller.listActivity,
  fetchHealth: createFetchHealth()
})

if (result.health.CC_COMMIT_ID === previousState.commitId) {
  throw new Error(
    'Expected forced divergent deployment to change the live commit ID'
  )
}
if (result.health.CC_DEPLOYMENT_ID === previousState.deploymentId) {
  throw new Error(
    'Expected forced divergent deployment to change the live deployment ID'
  )
}

await appendFile(
  githubOutput,
  `instance_id=${result.health.INSTANCE_ID ?? ''}\n` +
    `deployment_id=${result.deployment.uuid ?? result.health.CC_DEPLOYMENT_ID ?? ''}\n` +
    `commit_id=${result.health.CC_COMMIT_ID ?? ''}\n`
)
