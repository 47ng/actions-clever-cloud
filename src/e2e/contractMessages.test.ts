import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { expect, test } from 'vitest'

const DEPLOY_TIMEOUT_MESSAGE =
  'Deployment timed out, moving on with workflow run'
const SAME_COMMIT_MESSAGE = 'Remote HEAD has the same commit as the one to push'
const REBUILD_CACHE_MESSAGE = 'without using cache'

function readRepoFile(relativePath: string): string {
  return readFileSync(
    fileURLToPath(new URL(relativePath, import.meta.url)),
    'utf8'
  )
}

test('the timeout scenario asserts the message this action actually writes', () => {
  expect(readRepoFile('./scripts/assert-timeout-contract.ts')).toContain(
    DEPLOY_TIMEOUT_MESSAGE
  )
  expect(readRepoFile('../deployment.ts')).toContain(DEPLOY_TIMEOUT_MESSAGE)
})

test('the same-commit error scenario asserts a message clever-tools still emits', () => {
  expect(readRepoFile('./scripts/assert-same-commit-error.ts')).toContain(
    SAME_COMMIT_MESSAGE
  )
  expect(
    readRepoFile(
      '../../node_modules/clever-tools/src/commands/deploy/deploy.command.js'
    )
  ).toContain(SAME_COMMIT_MESSAGE)
})

test('the rebuild scenario asserts a cache message clever-tools still emits', () => {
  expect(readRepoFile('./scripts/observe-same-commit-rebuild.ts')).toContain(
    REBUILD_CACHE_MESSAGE
  )
  expect(
    readRepoFile(
      '../../node_modules/clever-tools/src/commands/deploy/deploy.command.js'
    )
  ).toContain(REBUILD_CACHE_MESSAGE)
})
