import { expect, test, vi } from 'vitest'
import { checkForShallowCopy, fixGitDubiousOwnership } from './git'
import type { runProcess, RunResult } from './process'

function fakeRun(result: Partial<RunResult> = {}): typeof runProcess {
  return vi.fn(async () => ({
    code: 0,
    signal: null,
    stdout: '',
    stderr: '',
    ...result
  }))
}

test('fixGitDubiousOwnership marks /github/workspace as safe', async () => {
  const run = fakeRun()
  await fixGitDubiousOwnership(run)
  expect(run).toHaveBeenCalledWith('git', [
    'config',
    '--global',
    '--add',
    'safe.directory',
    '/github/workspace'
  ])
})

test('fixGitDubiousOwnership throws when git fails', async () => {
  const run = fakeRun({ code: 128 })
  await expect(fixGitDubiousOwnership(run)).rejects.toThrow(
    'Failed to mark /github/workspace as a git safe.directory (exit code 128)'
  )
})

test('checkForShallowCopy passes on an unshallow working copy', async () => {
  const run = fakeRun({ stdout: 'false\n' })
  await expect(checkForShallowCopy(run)).resolves.toBeUndefined()
  expect(run).toHaveBeenCalledWith(
    'git',
    ['rev-parse', '--is-shallow-repository'],
    { captureStdout: true }
  )
})

test('checkForShallowCopy fails on a shallow working copy', async () => {
  const run = fakeRun({ stdout: 'true\n' })
  await expect(checkForShallowCopy(run)).rejects.toThrow(
    `This action requires an unshallow working copy.
-> Use the following step before running this action:
 - uses: actions/checkout@v3
   with:
     fetch-depth: 0
`
  )
})

test('checkForShallowCopy throws when git fails', async () => {
  const run = fakeRun({ code: 128 })
  await expect(checkForShallowCopy(run)).rejects.toThrow(
    'Failed to check for a shallow working copy (exit code 128)'
  )
})
