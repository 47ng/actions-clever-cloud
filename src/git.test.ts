import { chmod, mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import {
  checkForShallowCopy,
  disableGitHooks,
  fixGitDubiousOwnership
} from './git.ts'
import { runProcess, type RunResult } from './process.ts'

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
  expect(run).toHaveBeenCalledWith(
    'git',
    ['config', '--global', '--add', 'safe.directory', '/github/workspace'],
    { captureStderr: true }
  )
})

test('fixGitDubiousOwnership throws when git fails, surfacing stderr', async () => {
  const run = fakeRun({ code: 128, stderr: 'could not lock config file\n' })
  await expect(fixGitDubiousOwnership(run)).rejects.toThrow(
    'Failed to mark /github/workspace as a git safe.directory (exit code 128): ' +
      'could not lock config file'
  )
})

test('checkForShallowCopy passes on an unshallow working copy', async () => {
  const run = fakeRun({ stdout: 'false\n' })
  await expect(checkForShallowCopy(run)).resolves.toBeUndefined()
  expect(run).toHaveBeenCalledWith(
    'git',
    ['rev-parse', '--is-shallow-repository'],
    { captureStdout: true, captureStderr: true }
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

test('checkForShallowCopy throws when git fails, surfacing stderr', async () => {
  const run = fakeRun({ code: 128, stderr: 'fatal: not a git repository\n' })
  await expect(checkForShallowCopy(run)).rejects.toThrow(
    'Failed to check for a shallow working copy (exit code 128): ' +
      'fatal: not a git repository'
  )
})

test('git helpers report a terminating signal instead of a null exit code', async () => {
  const run = fakeRun({ code: null, signal: 'SIGKILL' })
  await expect(checkForShallowCopy(run)).rejects.toThrow(
    'Failed to check for a shallow working copy (terminated by signal SIGKILL)'
  )
})

function scriptedRun(results: Partial<RunResult>[]): typeof runProcess {
  const queue = [...results]
  return vi.fn(async () => ({
    code: 0,
    signal: null,
    stdout: '',
    stderr: '',
    ...queue.shift()
  }))
}

test('disableGitHooks points core.hooksPath to /dev/null', async () => {
  const run = scriptedRun([{ code: 1 }])
  await disableGitHooks(undefined, run)
  expect(run).toHaveBeenNthCalledWith(
    1,
    'git',
    ['config', '--local', '--get', 'core.hooksPath'],
    { cwd: undefined, captureStdout: true, captureStderr: true }
  )
  expect(run).toHaveBeenNthCalledWith(
    2,
    'git',
    ['config', '--local', 'core.hooksPath', '/dev/null'],
    { cwd: undefined, captureStderr: true }
  )
})

test('git hooks are turned off and restored in the deploy directory', async () => {
  const run = scriptedRun([{ code: 1 }])
  const restore = await disableGitHooks('apps/web', run)
  await restore()
  for (const call of vi.mocked(run).mock.calls) {
    expect(call[2]).toMatchObject({ cwd: 'apps/web' })
  }
  expect(run).toHaveBeenCalledTimes(3)
})

test('restoring git hooks unsets core.hooksPath when it was not set', async () => {
  const run = scriptedRun([{ code: 1 }])
  const restore = await disableGitHooks(undefined, run)
  await restore()
  expect(run).toHaveBeenLastCalledWith(
    'git',
    ['config', '--local', '--unset', 'core.hooksPath'],
    { cwd: undefined, captureStderr: true }
  )
})

test('restoring git hooks puts back a previous core.hooksPath', async () => {
  const run = scriptedRun([{ stdout: '.husky/_\n' }])
  const restore = await disableGitHooks(undefined, run)
  await restore()
  expect(run).toHaveBeenLastCalledWith(
    'git',
    ['config', '--local', 'core.hooksPath', '.husky/_'],
    { cwd: undefined, captureStderr: true }
  )
})

test('disableGitHooks throws when git cannot read the config, surfacing stderr', async () => {
  const run = scriptedRun([
    { code: 128, stderr: 'fatal: not in a git directory\n' }
  ])
  await expect(disableGitHooks(undefined, run)).rejects.toThrow(
    'Failed to read core.hooksPath (exit code 128): ' +
      'fatal: not in a git directory'
  )
  expect(run).toHaveBeenCalledTimes(1)
})

test('disableGitHooks throws when git cannot write the config, surfacing stderr', async () => {
  const run = scriptedRun([
    { code: 1 },
    { code: 255, stderr: 'error: could not lock config file\n' }
  ])
  await expect(disableGitHooks(undefined, run)).rejects.toThrow(
    'Failed to disable git hooks (exit code 255): ' +
      'error: could not lock config file'
  )
})

test('restoring git hooks throws when git fails, surfacing stderr', async () => {
  const run = scriptedRun([
    { code: 1 },
    {},
    { code: 255, stderr: 'error: could not lock config file\n' }
  ])
  const restore = await disableGitHooks(undefined, run)
  await expect(restore()).rejects.toThrow(
    'Failed to restore git hooks, turn them back on with ' +
      '"git config --local --unset core.hooksPath" (exit code 255): ' +
      'error: could not lock config file'
  )
})

test('a failed restore names the command that puts back the previous hooks path', async () => {
  const run = scriptedRun([
    { stdout: '.husky/_\n' },
    {},
    { code: 255, stderr: 'error: could not lock config file\n' }
  ])
  const restore = await disableGitHooks(undefined, run)
  await expect(restore()).rejects.toThrow(
    'Failed to restore git hooks, turn them back on with ' +
      '"git config --local core.hooksPath .husky/_"'
  )
})

describe('with a real repository', () => {
  const ambientEnv = { ...process.env }
  let dir: string
  let workDir: string
  let runInRepo: typeof runProcess

  beforeEach(async () => {
    process.env.GIT_CONFIG_GLOBAL = '/dev/null'
    process.env.GIT_CONFIG_NOSYSTEM = '1'
    dir = await mkdtemp(join(tmpdir(), 'git-hooks-'))
    workDir = join(dir, 'work')
    runInRepo = (command, args, options) =>
      runProcess(command, args, { ...options, cwd: workDir })
    await runProcess('git', ['init', '--quiet', '--bare', 'remote.git'], {
      cwd: dir
    })
    await runProcess('git', ['init', '--quiet', 'work'], { cwd: dir })
    await runInRepo('git', [
      '-c',
      'user.name=test',
      '-c',
      'user.email=test@example.com',
      'commit',
      '--quiet',
      '--allow-empty',
      '--message',
      'init'
    ])
  })

  afterEach(async () => {
    process.env = { ...ambientEnv }
    await rm(dir, { recursive: true, force: true })
  })

  async function installFailingPrePushHook(hooksDir: string): Promise<void> {
    await mkdir(join(workDir, hooksDir), { recursive: true })
    const hook = join(workDir, hooksDir, 'pre-push')
    await writeFile(hook, '#!/bin/sh\nexit 1\n')
    await chmod(hook, 0o755)
  }

  async function push(branch: string): Promise<number | null> {
    const result = await runInRepo(
      'git',
      ['push', '--quiet', '../remote.git', `HEAD:refs/heads/${branch}`],
      { captureStderr: true }
    )
    return result.code
  }

  async function localHooksPath(): Promise<RunResult> {
    return runInRepo('git', ['config', '--local', '--get', 'core.hooksPath'], {
      captureStdout: true
    })
  }

  test('a push skips the default hooks until they are restored', async () => {
    await installFailingPrePushHook('.git/hooks')
    const restore = await disableGitHooks(workDir)
    expect(await push('with-hooks-off')).toBe(0)
    await restore()
    expect(await push('with-hooks-on')).not.toBe(0)
    expect((await localHooksPath()).code).toBe(1)
  })

  test('a push skips hooks from a custom core.hooksPath until they are restored', async () => {
    await installFailingPrePushHook('hooks')
    await runInRepo('git', ['config', '--local', 'core.hooksPath', 'hooks'])
    const restore = await disableGitHooks(workDir)
    expect(await push('with-hooks-off')).toBe(0)
    await restore()
    expect(await push('with-hooks-on')).not.toBe(0)
    expect((await localHooksPath()).stdout.trim()).toBe('hooks')
  })
})
