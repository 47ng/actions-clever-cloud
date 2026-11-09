import { exitReason, runProcess, stderrDetail } from './process.ts'

// https://www.kenmuse.com/blog/avoiding-dubious-ownership-in-dev-containers/
export async function fixGitDubiousOwnership(
  run: typeof runProcess = runProcess
): Promise<void> {
  const result = await run(
    'git',
    ['config', '--global', '--add', 'safe.directory', '/github/workspace'],
    { captureStderr: true }
  )
  if (result.code !== 0 || result.signal) {
    throw new Error(
      `Failed to mark /github/workspace as a git safe.directory (${exitReason(result)})` +
        stderrDetail(result.stderr)
    )
  }
}

export async function checkForShallowCopy(
  run: typeof runProcess = runProcess
): Promise<void> {
  const result = await run('git', ['rev-parse', '--is-shallow-repository'], {
    captureStdout: true,
    captureStderr: true
  })
  if (result.code !== 0 || result.signal) {
    throw new Error(
      `Failed to check for a shallow working copy (${exitReason(result)})` +
        stderrDetail(result.stderr)
    )
  }
  if (result.stdout.trim() === 'true') {
    throw new Error(`This action requires an unshallow working copy.
-> Use the following step before running this action:
 - uses: actions/checkout@v3
   with:
     fetch-depth: 0
`)
  }
}

export type RestoreGitHooks = () => Promise<void>

export async function disableGitHooks(
  cwd: string | undefined,
  run: typeof runProcess = runProcess
): Promise<RestoreGitHooks> {
  const previous = await readLocalHooksPath(cwd, run)
  await setLocalConfig(
    cwd,
    run,
    ['core.hooksPath', '/dev/null'],
    'Failed to disable git hooks'
  )
  const restoreArgs =
    previous === undefined
      ? ['--unset', 'core.hooksPath']
      : ['core.hooksPath', previous]
  return () =>
    setLocalConfig(
      cwd,
      run,
      restoreArgs,
      `Failed to restore git hooks, turn them back on with "git config --local ${restoreArgs.join(' ')}"`
    )
}

const GIT_CONFIG_KEY_NOT_FOUND = 1

async function readLocalHooksPath(
  cwd: string | undefined,
  run: typeof runProcess
): Promise<string | undefined> {
  const result = await run(
    'git',
    ['config', '--local', '--get', 'core.hooksPath'],
    { cwd, captureStdout: true, captureStderr: true }
  )
  if (result.code === GIT_CONFIG_KEY_NOT_FOUND) {
    return undefined
  }
  if (result.code !== 0 || result.signal) {
    throw new Error(
      `Failed to read core.hooksPath (${exitReason(result)})` +
        stderrDetail(result.stderr)
    )
  }
  return result.stdout.trim()
}

async function setLocalConfig(
  cwd: string | undefined,
  run: typeof runProcess,
  args: string[],
  failure: string
): Promise<void> {
  const result = await run('git', ['config', '--local', ...args], {
    cwd,
    captureStderr: true
  })
  if (result.code !== 0 || result.signal) {
    throw new Error(
      `${failure} (${exitReason(result)})` + stderrDetail(result.stderr)
    )
  }
}
