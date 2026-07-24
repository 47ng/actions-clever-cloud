import { readFile } from 'node:fs/promises'

const actionOutcome = process.env.ACTION_OUTCOME
const logPath = process.env.LOG_PATH

if (!actionOutcome || !logPath) {
  throw new Error('Missing timeout assertion inputs')
}

if (actionOutcome !== 'success') {
  throw new Error('Expected timed-out deployment action to succeed')
}

const logContent = await readFile(logPath, 'utf8')
if (!logContent.includes('Deployment timed out, moving on with workflow run')) {
  throw new Error(
    'Expected timed-out deployment log to contain the documented timeout message'
  )
}
