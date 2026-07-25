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

function countOccurrences(haystack: string, needle: string): number {
  return haystack.split(needle).length - 1
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
  const deployCommandSource = readRepoFile(
    '../../node_modules/clever-tools/src/commands/deploy/deploy.command.js'
  )
  expect(deployCommandSource).toContain(SAME_COMMIT_MESSAGE)
  // A second occurrence would let the live path drift silently while a dead
  // one (help text, a comment, another branch) kept this test green.
  expect(countOccurrences(deployCommandSource, SAME_COMMIT_MESSAGE)).toBe(1)
})

test('the rebuild scenario asserts a cache message clever-tools still emits', () => {
  expect(readRepoFile('./scripts/observe-same-commit-rebuild.ts')).toContain(
    REBUILD_CACHE_MESSAGE
  )
  const deployCommandSource = readRepoFile(
    '../../node_modules/clever-tools/src/commands/deploy/deploy.command.js'
  )
  expect(deployCommandSource).toContain(REBUILD_CACHE_MESSAGE)
  // Same guard as above: one occurrence ties this test to the live path,
  // not to wording that merely survives elsewhere in the file.
  expect(countOccurrences(deployCommandSource, REBUILD_CACHE_MESSAGE)).toBe(1)
})
