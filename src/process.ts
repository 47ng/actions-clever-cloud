import { spawn } from 'node:child_process'
import type { Writable } from 'node:stream'

export type RunOptions = {
  cwd?: string
  outStream?: Writable
  captureStdout?: boolean
  captureStderr?: boolean
}

export type RunResult = {
  code: number | null
  signal: NodeJS.Signals | null
  stdout: string
  stderr: string
}

export type RunningProcess = {
  exited: Promise<RunResult>
  kill(signal: NodeJS.Signals): void
  detach(): void
}

export function startProcess(
  command: string,
  args: string[],
  options: RunOptions = {}
): RunningProcess {
  const child = spawn(command, args, {
    cwd: options.cwd,
    stdio: ['ignore', 'pipe', 'pipe']
  })
  const { outStream } = options
  if (outStream) {
    // `end: false` keeps the shared outStream open when either stream closes.
    child.stdout.pipe(outStream, { end: false })
    child.stderr.pipe(outStream, { end: false })
  }
  let stdout = ''
  let stderr = ''
  if (options.captureStdout) {
    child.stdout.on('data', (data: Buffer) => (stdout += data.toString()))
  }
  if (options.captureStderr) {
    child.stderr.on('data', (data: Buffer) => (stderr += data.toString()))
  }
  // Unconsumed pipes would fill up and block the child.
  if (!outStream && !options.captureStdout) {
    child.stdout.resume()
  }
  if (!outStream && !options.captureStderr) {
    child.stderr.resume()
  }
  const exited = new Promise<RunResult>((resolve, reject) => {
    child.once('error', reject)
    // An unobserved stdio 'error' event would crash the process before the
    // top-level failure reporting gets a chance to run.
    child.stdout.once('error', reject)
    child.stderr.once('error', reject)
    child.once('close', (code, signal) =>
      resolve({ code, signal, stdout, stderr })
    )
  })
  return {
    exited,
    kill(signal) {
      child.kill(signal)
    },
    detach() {
      if (outStream) {
        child.stdout.unpipe(outStream)
        child.stderr.unpipe(outStream)
      }
      child.stdout.destroy()
      child.stderr.destroy()
      child.unref()
    }
  }
}

export function runProcess(
  command: string,
  args: string[],
  options: RunOptions = {}
): Promise<RunResult> {
  return startProcess(command, args, options).exited
}

export function exitReason(result: Pick<RunResult, 'code' | 'signal'>): string {
  return result.signal
    ? `terminated by signal ${result.signal}`
    : `exit code ${result.code}`
}

export function stderrDetail(stderr: string): string {
  const trimmed = stderr.trim()
  return trimmed ? `: ${trimmed}` : ''
}
