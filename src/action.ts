import * as core from '@actions/core'
import { exec, type ExecOptions } from '@actions/exec'
import { spawn } from 'node:child_process'
import fs from 'node:fs/promises'
import { PassThrough, Transform, Writable } from 'node:stream'
import { finished } from 'node:stream/promises'
import { StringDecoder } from 'node:string_decoder'
import type { Arguments } from './arguments'

const DEPLOY_TERMINATION_GRACE_PERIOD_MS = 5000
const DEPLOY_FORCE_KILL_WAIT_MS = 5000

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

async function getLinkedAppAlias(
  cleverCLI: string,
  appID: string,
  execOptions: ExecOptions
): Promise<string | undefined> {
  let stdout = ''
  await exec(cleverCLI, ['applications', '--json'], {
    ...execOptions,
    silent: true,
    listeners: {
      stdout: (data: Buffer) => (stdout += data.toString())
    }
  })

  let applications: unknown
  try {
    applications = JSON.parse(stdout)
  } catch {
    throw new Error('Clever CLI returned invalid linked application data')
  }
  if (!Array.isArray(applications)) {
    throw new Error('Clever CLI returned invalid linked application data')
  }

  const linkedApplication = applications.find(
    (application): application is { app_id: string; alias?: unknown } =>
      typeof application === 'object' &&
      application !== null &&
      'app_id' in application &&
      application.app_id === appID
  )
  if (!linkedApplication) {
    return undefined
  }
  if (
    typeof linkedApplication.alias !== 'string' ||
    linkedApplication.alias.length === 0
  ) {
    throw new Error(`Application ${appID} is linked without a valid alias`)
  }
  return linkedApplication.alias
}

export async function run({
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
  let outputStream: OutputStream | undefined
  try {
    await checkForShallowCopy()

    outputStream = await getOutputStream(quiet, logFile)
    const execOptions: ExecOptions = {
      outStream: outputStream.stream
    }

    if (deployPath) {
      try {
        await fs.access(deployPath)
        execOptions.cwd = deployPath
        core.info(`Running Clever CLI from directory: ${deployPath}`)
      } catch (error) {
        throw new Error(`Deploy path does not exist: ${deployPath}`)
      }
    }

    core.debug(`Clever CLI path: ${cleverCLI}`)

    // clever-tools authenticates via the CLEVER_TOKEN / CLEVER_SECRET
    // environment variables (virtual "$env" profile); no login call needed.

    // There is an issue when there is a .clever.json file present
    // and only the appID is passed: deploy needs an alias to know which app
    // to publish. Reuse an existing link when possible; clever link rejects
    // duplicate app IDs, including when they use a different alias.
    if (appID) {
      const linkedAlias = await getLinkedAppAlias(cleverCLI, appID, execOptions)
      if (linkedAlias) {
        core.debug(`Application ${appID} is already linked as ${linkedAlias}`)
        alias = linkedAlias
      } else {
        core.debug(`Linking ${appID}`)
        await exec(cleverCLI, ['link', appID, '--alias', appID], execOptions)
        alias = appID
      }
    }

    // If there are environment variables to pass to the application,
    // set them before deployment so the new instance can use them.
    for (const [envName, envValue] of Object.entries(extraEnv)) {
      const args = ['env', 'set']
      if (alias) {
        args.push('--alias', alias)
      }
      args.push(envName, envValue)
      if (envValue) {
        core.setSecret(envValue)
      }
      core.info(`Setting environment variable ${envName}`)
      let stderr = ''
      const code = await exec(cleverCLI, args, {
        ...execOptions,
        silent: true,
        ignoreReturnCode: true,
        listeners: {
          stderr: (data: Buffer) => (stderr += data.toString())
        }
      })
      if (code !== 0) {
        // stderr may echo the value back (e.g. a rejected value in the CLI's
        // own error message); safe to surface because setSecret() above
        // already registered it with the runner's log masking.
        throw new Error(
          `Failed to set environment variable ${envName} (exit code ${code}): ${stderr.trim()}`
        )
      }
    }

    const args = ['deploy']
    if (alias) {
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
        // Let the child finish handling SIGTERM and drain its output before the
        // shared tee is closed in `finally`. Escalate if graceful termination
        // takes too long.
        child.kill('SIGTERM')
        let forceKillTimeoutID: NodeJS.Timeout | undefined
        const forceKillPromise = new Promise<void>(resolve => {
          forceKillTimeoutID = setTimeout(() => {
            child.kill('SIGKILL')
            resolve()
          }, DEPLOY_TERMINATION_GRACE_PERIOD_MS)
        })
        const settledExit = exited.then(
          () => undefined,
          () => undefined
        )
        const forced = (await Promise.race([
          settledExit.then(() => false),
          forceKillPromise.then(() => true)
        ])) as boolean
        if (forceKillTimeoutID) {
          clearTimeout(forceKillTimeoutID)
        }
        if (forced) {
          let forceKillWaitTimeoutID: NodeJS.Timeout | undefined
          const forceKillWaitPromise = new Promise<boolean>(resolve => {
            forceKillWaitTimeoutID = setTimeout(
              () => resolve(false),
              DEPLOY_FORCE_KILL_WAIT_MS
            )
          })
          const exitedAfterForceKill = await Promise.race([
            settledExit.then(() => true),
            forceKillWaitPromise
          ])
          if (forceKillWaitTimeoutID) {
            clearTimeout(forceKillWaitTimeoutID)
          }
          if (!exitedAfterForceKill) {
            if (execOptions.outStream) {
              child.stdout.unpipe(execOptions.outStream)
              child.stderr.unpipe(execOptions.outStream)
            }
            child.stdout.destroy()
            child.stderr.destroy()
            child.unref()
          }
        }
        if (quiet && logFile && outputStream) {
          outputStream.stream.write('Deployment timed out, moving on with workflow run\n')
        }
        core.info('Deployment timed out, moving on with workflow run')
        return
      }
      core.info(`result: ${result}`)
      if (typeof result === 'number' && result !== 0) {
        throw new Error(`Deployment failed with code ${result}`)
      }
    } else {
      const { exited } = spawnDeploy(cleverCLI, args, execOptions)
      const code = await exited
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
  } finally {
    // Close the tee we opened above so its buffered carry-over line (if any)
    // and the log file get flushed, even when the timeout path returns early
    // or the deploy throws.
    if (outputStream) {
      outputStream.stream.end()
      await outputStream.done()
    }
  }
}

// --

/**
 * Spawn the Clever CLI deploy ourselves so child output is piped with native
 * stream backpressure and timeout-mode deployments can terminate the process.
 *
 * Output is piped into the same tee stream used by @actions/exec (via
 * `options.outStream`) so console logging, log files and annotation injection
 * keep working identically for deploys and pre-deploy commands.
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
    child.once('close', (code, signal) => {
      if (signal) {
        reject(new Error(`Deployment terminated by signal ${signal}`))
      } else {
        resolve(code ?? 0)
      }
    })
  })
  return { child, exited }
}

const TIMESTAMP_PREFIX_REGEX =
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:[+-]\d{2}:\d{2}|Z):? /

export type OutputStream = {
  stream: Writable
  /**
   * Resolves once every sink fed by `stream` (the console pipeline, the log
   * file) has finished processing whatever was written before `stream.end()`
   * was called. A sink failing (e.g. ENOSPC, EPIPE) is reported via
   * `core.warning` rather than rejecting — losing log output must never
   * override the deploy's real outcome.
   */
  done: () => Promise<void>
}

export async function getOutputStream(
  quiet: boolean,
  logFile?: string
): Promise<OutputStream> {
  const tee = new PassThrough()
  const completions: Promise<void>[] = []
  const completionErrors: unknown[] = []
  let liveSinkCount = 0
  const monitor = (completion: Promise<void>): void => {
    liveSinkCount += 1
    completions.push(
      completion.catch(error => {
        completionErrors.push(error)
        liveSinkCount -= 1
        if (liveSinkCount === 0) {
          tee.resume()
        }
      })
    )
  }
  if (!quiet) {
    let lineSeparator = '\n'
    async function* splitNewlines(
      input: AsyncIterable<Buffer>
    ): AsyncGenerator<string> {
      let carry = ''
      const decoder = new StringDecoder('utf8')
      for await (const chunk of input) {
        const str = carry + decoder.write(chunk)
        if (str.includes('\r\n')) {
          lineSeparator = '\r\n'
        }
        const lines = str.split(/\r?\n/)
        carry = lines.pop() ?? ''
        for (const line of lines) {
          yield line
        }
      }
      carry += decoder.end()
      if (carry.length > 0) {
        yield carry
      }
    }
    async function* injectAnnotations(
      lines: AsyncIterable<string>
    ): AsyncGenerator<string> {
      for await (const line of lines) {
        yield line + lineSeparator
        // Remove timestamp, if present
        const message = line.replace(TIMESTAMP_PREFIX_REGEX, '')
        // Only re-emit when a timestamp was actually stripped: a line that
        // already contains a runner-recognized workflow command (without a
        // timestamp) is echoed above as-is, and the runner parses it on its
        // own. Re-emitting it here would duplicate the annotation.
        const isAnnotation = /^::(?:notice|error|warning)(?:::| .*::)/i.test(
          message.trimStart()
        )
        if (message !== line && isAnnotation) {
          yield message + lineSeparator
        }
      }
    }
    const lastTransform = tee
      .pipe(Transform.from(splitNewlines))
      .pipe(Transform.from(injectAnnotations))
    // `end: false`: process.stdout is shared for the whole action process
    // lifetime — this tee ending must not close it.
    lastTransform.pipe(process.stdout, { end: false })
    monitor(finished(lastTransform))
  }
  if (logFile) {
    try {
      const logFileStream = (await fs.open(logFile, 'w')).createWriteStream()
      tee.pipe(logFileStream)
      monitor(finished(logFileStream))
    } catch (error) {
      completionErrors.push(error)
    }
  }
  if (liveSinkCount === 0) {
    tee.resume()
  }
  const done = async (): Promise<void> => {
    await Promise.all(completions)
    if (completionErrors.length > 0) {
      const error = completionErrors[0]
      core.warning(
        `deploy log output degraded: ${error instanceof Error ? error.message : String(error)}`
      )
    }
  }
  return { stream: tee, done }
}
