import { readFile } from 'node:fs/promises'
import { FIXTURE_BUILD_MARKER, FIXTURE_START_MARKER } from '../fixture-app.ts'

const logPath = process.env.LOG_PATH

if (!logPath) {
  throw new Error('Missing quiet deployment log path')
}

const logContent = await readFile(logPath, 'utf8')
for (const marker of [FIXTURE_BUILD_MARKER, FIXTURE_START_MARKER]) {
  if (!logContent.includes(marker)) {
    throw new Error(`Expected quiet deployment log to contain ${marker}`)
  }
}
