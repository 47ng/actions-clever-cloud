import * as core from '@actions/core'
import { exec, type ExecOptions } from '@actions/exec'
import { spawn } from 'node:child_process'
import fs from 'node:fs/promises'
import { PassThrough, Transform, Writable } from 'node:stream'
import type { Arguments } from './arguments'

async function checkForShallowCopy(): Promise<void> {
  let output = ''
  await exec('git', ['rev-parse', '--is-shallow-repository'], {
    listeners: {
      stdout: (data: Buffer) => (output += data.toString())
    }
  })
  if (output.trim() === 'true') {
    throw new Error(`This action requires an unshallow working copy.
-> Use the following step before running this action:
 - uses: actions/checkout@v3
   with:
     fetch-depth: 0
`)
  }
}

export async function run({
  token,
  secret,
  appID,
  alias,
  force = false,
  cleverCLI,
  timeout,
  deployPath,
  logFile,
  quiet = false,
  extraEnv = {},
  sameCommitPolicy
}: Arguments): Promise<void> {
  try {
    await checkForShallowCopy()

    const execOptions: ExecOptions = {
      outStream: await getOutputStream(quiet, logFile)
    }

    if (deployPath) {
      try {
        await fs.access(deployPath)
        execOptions.cwd = deployPath
        core.info(`Running Clever CLI from directory: ${deployPath}`)
        core.warning(
          'deployPath changes the CLI working directory only. ' +
            'The deployed payload is the git repository HEAD, not a subset of files.'
        )
      } catch (error) {
        throw new Error(`Deploy path does not exist: ${deployPath}`)
      }
    }

    core.debug(`Clever CLI path: ${cleverCLI}`)

    // clever-tools authenticates via the CLEVER_TOKEN / CLEVER_SECRET
    // environment variables (virtual "$env" profile); no login call needed.

    // There is an issue when there is a .clever.json file present
    // and only the appID is passed: link will work, but deploy will need
    // an alias to know which app to publish. In this case, we set the alias
    // to the appID, and the alias argument is ignored if also specified.
    if (appID) {
      core.debug(`Linking ${appID}`)
      await exec(cleverCLI, ['link', appID, '--alias', appID], execOptions)
      alias = appID
    }

    // If there are environment variables to pass to the application,
    // set them before deployment so the new instance can use them.
    for (const [envName, envValue] of Object.entries(extraEnv)) {
      const args = ['env', 'set']
      if (alias) {
        args.push('--alias', alias)
      }
      args.push(envName, envValue)
      core.info(`Setting environment variable ${envName}`)
      await exec(cleverCLI, args, execOptions)
    }

    const args = ['deploy']
    if (appID) {
      args.push('--alias', appID)
    } else if (alias) {
      args.push('--alias', alias)
    }

    if (force) {
      args.push('--force')
    }

    if (sameCommitPolicy) {
      args.push('--same-commit-policy', sameCommitPolicy)
    }

    if (timeout) {
      // We manage the deploy process ourselves (rather than via @actions/exec)
      // so we can terminate it when the timeout fires: @actions/exec offers no
      // cancellation, and a live child process keeps the Node event loop alive,
      // which would pin the workflow until the deploy finishes anyway.
      const { child, exited } = spawnDeploy(cleverCLI, args, execOptions)
      let timeoutID: NodeJS.Timeout | undefined
      let timedOut = false
      const timeoutPromise = new Promise<void>(resolve => {
        // `timeout` is expressed in seconds (see action.yml), setTimeout is in ms.
        timeoutID = setTimeout(() => {
          timedOut = true
          resolve()
        }, timeout * 1000)
      })
      let result: number | void
      try {
        result = await Promise.race([exited, timeoutPromise])
      } finally {
        // Always clear the timer, even if `exited` rejects (e.g. spawn error),
        // otherwise the pending timeout keeps the event loop alive until it fires.
        if (timeoutID) {
          clearTimeout(timeoutID)
        }
      }
      if (timedOut) {
        // Stop waiting and let the workflow move on. Killing the child releases
        // the event loop so the action can exit promptly (the documented
        // tradeoff: we lose any deployment failure information).
        child.kill('SIGTERM')
        // The killed process settles `exited` later; swallow it so it doesn't
        // surface as an unhandled rejection after we've moved on.
        exited.catch(() => {})
        core.info('Deployment timed out, moving on with workflow run')
        return
      }
      core.info(`result: ${result}`)
      if (typeof result === 'number' && result !== 0) {
        throw new Error(`Deployment failed with code ${result}`)
      }
    } else {
      const code = await exec(cleverCLI, args, execOptions)
      core.info(`code: ${code}`)
      if (code !== 0) {
        throw new Error(`Deployment failed with code ${code}`)
      }
    }
  } catch (error) {
    if (error instanceof Error) {
      core.setFailed(error.message)
    } else {
      core.setFailed(String(error))
    }
  }
}

// --

/**
 * Spawn the Clever CLI deploy ourselves so we keep a handle on the child
 * process and can terminate it when the deployment timeout fires.
 *
 * Output is piped into the same tee stream used by @actions/exec (via
 * `options.outStream`) so console logging, log files and annotation injection
 * keep working identically to the non-timeout path.
 */
function spawnDeploy(
  cleverCLI: string,
  args: string[],
  options: ExecOptions
): { child: ReturnType<typeof spawn>; exited: Promise<number> } {
  const child = spawn(cleverCLI, args, {
    cwd: options.cwd,
    stdio: ['ignore', 'pipe', 'pipe']
  })
  if (options.outStream) {
    // `end: false` keeps the shared tee open when either stream closes.
    child.stdout.pipe(options.outStream, { end: false })
    child.stderr.pipe(options.outStream, { end: false })
  }
  const exited = new Promise<number>((resolve, reject) => {
    child.once('error', reject)
    child.once('close', code => resolve(code ?? 0))
  })
  return { child, exited }
}

export async function getOutputStream(
  quiet: boolean,
  logFile?: string
): Promise<Writable> {
  const tee = new PassThrough()
  if (!quiet) {
    let lineSeparator = '\n'
    async function* splitNewlines(
      input: AsyncIterable<Buffer>
    ): AsyncGenerator<string> {
      for await (const chunk of input) {
        const str = Buffer.isBuffer(chunk) ? chunk.toString('utf8') : chunk
        if (str.includes('\r\n')) {
          lineSeparator = '\r\n'
        }
        const lines = str.split(/\r?\n/)
        for (const line of lines) {
          yield line
        }
      }
    }
    async function* injectAnnotations(
      lines: AsyncIterable<string>
    ): AsyncGenerator<string> {
      for await (const line of lines) {
        yield line + lineSeparator
        // Remove timestamp
        const message = line.slice('xxxx-xx-xxTxx:xx:xx+xx:xx '.length)
        if (
          message.startsWith('::notice ') ||
          message.startsWith('::error ') ||
          message.startsWith('::warning ')
        ) {
          yield message + lineSeparator
        }
      }
    }
    tee
      .pipe(Transform.from(splitNewlines))
      .pipe(Transform.from(injectAnnotations))
      .pipe(process.stdout)
  }
  if (logFile) {
    const logFileStream = (await fs.open(logFile, 'w')).createWriteStream()
    tee.pipe(logFileStream)
  }
  return tee
}
