import { readFile } from 'node:fs/promises'
import { createCleverController } from '../clever-client.ts'
import { confirmNoNewDeploymentActivity } from '../deployment-observer.ts'
import { createRunCommand, resolveCleverCLI } from '../workflow-adapters.ts'

const appId = process.env.APP_ID
const actionOutcome = process.env.ACTION_OUTCOME
const statePath = process.env.STATE_PATH
const logPath = process.env.LOG_PATH
const cleverCLI = resolveCleverCLI()

if (!appId || !actionOutcome || !statePath || !logPath) {
  throw new Error('Missing same-commit error assertion inputs')
}

if (actionOutcome !== 'failure') {
  throw new Error('Expected the default same-commit policy to fail')
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

const logContent = await readFile(logPath, 'utf8')
if (
  !logContent.includes('Remote HEAD has the same commit as the one to push')
) {
  throw new Error(
    'Expected default same-commit error log to mention the known same-commit message'
  )
}
