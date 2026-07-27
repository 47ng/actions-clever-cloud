import { readFile } from 'node:fs/promises'
import { DEPLOYMENT_TIMEOUT_MESSAGE } from '../../deployment.ts'

const actionOutcome = process.env.ACTION_OUTCOME
const timedOut = process.env.ACTION_TIMED_OUT
const logPath = process.env.LOG_PATH

if (!actionOutcome || !timedOut || !logPath) {
  throw new Error('Missing timeout assertion inputs')
}

if (actionOutcome !== 'success') {
  throw new Error('Expected timed-out deployment action to succeed')
}

if (timedOut !== 'true') {
  throw new Error('Expected timed-out deployment action to set timedOut=true')
}

const logContent = await readFile(logPath, 'utf8')
if (!logContent.includes(DEPLOYMENT_TIMEOUT_MESSAGE)) {
  throw new Error(
    'Expected timed-out deployment log to contain the documented timeout message'
  )
}
