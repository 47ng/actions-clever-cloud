import { exitReason, runProcess, stderrDetail } from './process'

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
