import { readFile } from 'node:fs/promises'
import { DEPLOYMENT_TIMEOUT_MESSAGE } from '../../deployment.ts'

const actionOutcome = process.env.ACTION_OUTCOME
const logPath = process.env.LOG_PATH

if (!actionOutcome || !logPath) {
  throw new Error('Missing timeout assertion inputs')
}

if (actionOutcome !== 'success') {
  throw new Error('Expected timed-out deployment action to succeed')
}

const logContent = await readFile(logPath, 'utf8')
if (!logContent.includes(DEPLOYMENT_TIMEOUT_MESSAGE)) {
  throw new Error(
    'Expected timed-out deployment log to contain the documented timeout message'
  )
}
