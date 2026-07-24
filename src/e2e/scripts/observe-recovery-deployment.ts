import { appendFile } from 'node:fs/promises'
import { createCleverController } from '../clever-client.ts'
import { waitForHealthyDeployment } from '../deployment-observer.ts'
import {
  createFetchHealth,
  createRunCommand,
  resolveCleverCLI
} from '../workflow-adapters.ts'

const appId = process.env.APP_ID
const expectedCommitID = process.env.EXPECTED_COMMIT_ID
const githubOutput = process.env.GITHUB_OUTPUT
const cleverCLI = resolveCleverCLI()

if (!appId || !expectedCommitID || !githubOutput) {
  throw new Error('Missing recovery deployment observation inputs')
}

const controller = createCleverController({
  cleverCLI,
  runCommand: createRunCommand()
})

const healthURL = new URL(
  '/health',
  await controller.getPublicOrigin(appId)
).toString()
const health = await waitForHealthyDeployment({
  appId,
  healthURL,
  expectedScenario: 'healthy',
  expectedCommitID,
  listActivity: controller.listActivity,
  fetchHealth: createFetchHealth()
})

await appendFile(
  githubOutput,
  `instance_id=${health.INSTANCE_ID ?? ''}\n` +
    `deployment_id=${health.CC_DEPLOYMENT_ID ?? ''}\n` +
    `commit_id=${health.CC_COMMIT_ID ?? ''}\n`
)
