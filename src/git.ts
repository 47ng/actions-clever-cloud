import { runProcess } from './process'

// https://www.kenmuse.com/blog/avoiding-dubious-ownership-in-dev-containers/
export async function fixGitDubiousOwnership(
  run: typeof runProcess = runProcess
): Promise<void> {
  const { code } = await run('git', [
    'config',
    '--global',
    '--add',
    'safe.directory',
    '/github/workspace'
  ])
  if (code !== 0) {
    throw new Error(
      `Failed to mark /github/workspace as a git safe.directory (exit code ${code})`
    )
  }
}

export async function checkForShallowCopy(
  run: typeof runProcess = runProcess
): Promise<void> {
  const { code, stdout } = await run(
    'git',
    ['rev-parse', '--is-shallow-repository'],
    { captureStdout: true }
  )
  if (code !== 0) {
    throw new Error(
      `Failed to check for a shallow working copy (exit code ${code})`
    )
  }
  if (stdout.trim() === 'true') {
    throw new Error(`This action requires an unshallow working copy.
-> Use the following step before running this action:
 - uses: actions/checkout@v3
   with:
     fetch-depth: 0
`)
  }
}
