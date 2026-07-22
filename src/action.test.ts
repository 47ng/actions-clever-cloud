import { EventEmitter } from 'node:events'
import { PassThrough } from 'node:stream'
import { afterEach, beforeEach, expect, test, vi } from 'vitest'

// Mock must be defined before imports that use it
vi.mock('@actions/exec', () => ({
  exec: vi.fn(() => Promise.resolve(0))
}))

vi.mock('@actions/core', () => ({
  debug: vi.fn(),
  info: vi.fn(),
  warning: vi.fn(),
  setSecret: vi.fn(),
  setFailed: vi.fn()
}))

// The timeout path spawns the deploy itself so it can kill it on timeout.
vi.mock('node:child_process', () => ({
  spawn: vi.fn()
}))

import { setFailed, setSecret } from '@actions/core'
import { exec } from '@actions/exec'
import { spawn } from 'node:child_process'
import { run } from './action'

// Every non-quiet run() tees output into the shared process.stdout. The real
// action does this once per process; this suite does it dozens of times, which
// trips Node's 10-listener leak warning. Lift the cap for the test process.
process.stdout.setMaxListeners(0)

// --

const CLEVER_CLI = 'clever-mocked'

const execMock = exec as ReturnType<typeof vi.fn>
const spawnMock = spawn as ReturnType<typeof vi.fn>

/**
 * Minimal stand-in for a spawned deploy process: real stdout/stderr streams so
 * piping works, an EventEmitter for `error`/`close`, and a `kill` spy that
 * settles the process the way SIGTERM would.
 */
function makeFakeChild() {
  const child = new EventEmitter() as EventEmitter & {
    stdout: PassThrough
    stderr: PassThrough
    kill: ReturnType<typeof vi.fn>
    unref: ReturnType<typeof vi.fn>
  }
  child.stdout = new PassThrough()
  child.stderr = new PassThrough()
  child.kill = vi.fn(() => {
    child.emit('close', null)
    return true
  })
  child.unref = vi.fn()
  return child
}

beforeEach(() => {
  vi.clearAllMocks()
  // Reset to default success behavior
  execMock.mockResolvedValue(0)
})

afterEach(() => {
  vi.useRealTimers()
})

// --

function expectCleverCLICallWithArgs(
  callIndex: number,
  ...expectedArgs: any[]
) {
  const calls = execMock.mock.calls
  expect(calls.length).toBeGreaterThanOrEqual(callIndex + 1)
  const cli = calls[callIndex]?.[0]
  const args = calls[callIndex]?.[1]
  expect(cli).toEqual(CLEVER_CLI)
  expectedArgs.forEach((arg, i) => {
    expect(args?.[i]).toEqual(arg)
  })
}

test('deploy default application (no arguments)', async () => {
  await run({
    token: 'token',
    secret: 'secret',
    cleverCLI: CLEVER_CLI
  })
  expect(execMock.mock.calls.some(call => call[1]?.[0] === 'login')).toBe(false)
  expectCleverCLICallWithArgs(1, 'deploy')
  expect(setFailed).not.toHaveBeenCalled()
})

test('deploy application with alias', async () => {
  await run({
    token: 'token',
    secret: 'secret',
    alias: 'app-alias',
    cleverCLI: CLEVER_CLI
  })
  expectCleverCLICallWithArgs(1, 'deploy', '--alias', 'app-alias')
  expect(setFailed).not.toHaveBeenCalled()
})

test('deploy application with app ID', async () => {
  await run({
    token: 'token',
    secret: 'secret',
    appID: 'app_facade42-cafe-babe-cafe-deadf00dbaad',
    cleverCLI: CLEVER_CLI
  })
  expectCleverCLICallWithArgs(
    1,
    'link',
    'app_facade42-cafe-babe-cafe-deadf00dbaad',
    '--alias',
    'app_facade42-cafe-babe-cafe-deadf00dbaad'
  )
  expectCleverCLICallWithArgs(
    2,
    'deploy',
    '--alias',
    'app_facade42-cafe-babe-cafe-deadf00dbaad'
  )
})

test('when both app ID and alias are provided, appID takes precedence', async () => {
  await run({
    token: 'token',
    secret: 'secret',
    alias: 'foo',
    appID: 'app_facade42-cafe-babe-cafe-deadf00dbaad',
    cleverCLI: CLEVER_CLI
  })
  expectCleverCLICallWithArgs(
    1,
    'link',
    'app_facade42-cafe-babe-cafe-deadf00dbaad',
    '--alias',
    'app_facade42-cafe-babe-cafe-deadf00dbaad'
  )
  expectCleverCLICallWithArgs(
    2,
    'deploy',
    '--alias',
    'app_facade42-cafe-babe-cafe-deadf00dbaad'
  )
})

test('passing extra env variables, using no input args', async () => {
  await run({
    token: 'token',
    secret: 'secret',
    cleverCLI: CLEVER_CLI,
    extraEnv: {
      foo: 'bar',
      egg: 'spam'
    }
  })
  expectCleverCLICallWithArgs(1, 'env', 'set', 'foo', 'bar')
  expectCleverCLICallWithArgs(2, 'env', 'set', 'egg', 'spam')
  expectCleverCLICallWithArgs(3, 'deploy')
  expect(setSecret).toHaveBeenCalledWith('bar')
  expect(setSecret).toHaveBeenCalledWith('spam')
  expect(execMock.mock.calls[1]?.[2]).toMatchObject({ silent: true })
  expect(execMock.mock.calls[2]?.[2]).toMatchObject({ silent: true })
})

test('passing extra env variables, using appID', async () => {
  await run({
    token: 'token',
    secret: 'secret',
    appID: 'app_facade42-cafe-babe-cafe-deadf00dbaad',
    cleverCLI: CLEVER_CLI,
    extraEnv: {
      foo: 'bar',
      egg: 'spam'
    }
  })
  expectCleverCLICallWithArgs(
    1,
    'link',
    'app_facade42-cafe-babe-cafe-deadf00dbaad',
    '--alias',
    'app_facade42-cafe-babe-cafe-deadf00dbaad'
  )
  expectCleverCLICallWithArgs(
    2,
    'env',
    'set',
    '--alias',
    'app_facade42-cafe-babe-cafe-deadf00dbaad',
    'foo',
    'bar'
  )
  expectCleverCLICallWithArgs(
    3,
    'env',
    'set',
    '--alias',
    'app_facade42-cafe-babe-cafe-deadf00dbaad',
    'egg',
    'spam'
  )
  expectCleverCLICallWithArgs(
    4,
    'deploy',
    '--alias',
    'app_facade42-cafe-babe-cafe-deadf00dbaad'
  )
})

test('passing extra env variables, using alias only', async () => {
  await run({
    token: 'token',
    secret: 'secret',
    alias: 'foo',
    cleverCLI: CLEVER_CLI,
    extraEnv: {
      foo: 'bar',
      egg: 'spam'
    }
  })
  expectCleverCLICallWithArgs(1, 'env', 'set', '--alias', 'foo', 'foo', 'bar')
  expectCleverCLICallWithArgs(2, 'env', 'set', '--alias', 'foo', 'egg', 'spam')
  expectCleverCLICallWithArgs(3, 'deploy', '--alias', 'foo')
})

test('deployment failure fails the workflow', async () => {
  execMock.mockResolvedValue(42)
  await run({
    token: 'token',
    secret: 'secret',
    cleverCLI: CLEVER_CLI
  })
  expect(setFailed).toHaveBeenCalledWith('Deployment failed with code 42')
})

test('timeout is interpreted in seconds, not milliseconds', async () => {
  vi.useFakeTimers()
  const child = makeFakeChild()
  spawnMock.mockReturnValue(child)
  const finished = run({
    token: 'token',
    secret: 'secret',
    cleverCLI: CLEVER_CLI,
    timeout: 1800 // 30 minutes, per action.yml
  })
  // One millisecond before the 30-minute mark: still waiting.
  await vi.advanceTimersByTimeAsync(1800 * 1000 - 1)
  expect(child.kill).not.toHaveBeenCalled()
  // Crossing 1800s (not 1800ms) is what triggers the timeout.
  await vi.advanceTimersByTimeAsync(1)
  expect(child.kill).toHaveBeenCalledWith('SIGTERM')
  await finished
})

test('timeout fires: kills the deploy and moves on without failing', async () => {
  vi.useFakeTimers()
  const child = makeFakeChild()
  spawnMock.mockReturnValue(child)
  const finished = run({
    token: 'token',
    secret: 'secret',
    cleverCLI: CLEVER_CLI,
    timeout: 1800
  })
  await vi.advanceTimersByTimeAsync(1800 * 1000)
  await finished
  expect(child.kill).toHaveBeenCalledWith('SIGTERM')
  expect(setFailed).not.toHaveBeenCalled()
})

test('timeout waits for asynchronous final output before closing the tee', async () => {
  const stdoutSpy = vi
    .spyOn(process.stdout, 'write')
    .mockImplementation(() => true)
  try {
    vi.useFakeTimers()
    const child = makeFakeChild()
    child.kill.mockImplementation(() => {
      setTimeout(() => {
        child.stdout.end()
        child.stderr.end('::error ::final timeout detail')
        child.emit('close', null)
      }, 50)
      return true
    })
    spawnMock.mockReturnValue(child)

    const finishedRun = run({
      token: 'token',
      secret: 'secret',
      cleverCLI: CLEVER_CLI,
      timeout: 1800
    })
    await vi.advanceTimersByTimeAsync(1800 * 1000)
    expect(child.kill).toHaveBeenCalledWith('SIGTERM')
    await vi.advanceTimersByTimeAsync(50)
    await finishedRun

    const out = stdoutSpy.mock.calls
      .map((call: unknown[]) => String(call[0]))
      .join('')
    expect(out).toContain('::error ::final timeout detail')
    expect(out).not.toContain('\ufffd')
  } finally {
    stdoutSpy.mockRestore()
  }
})

test('timeout escalates to SIGKILL after the termination grace period', async () => {
  vi.useFakeTimers()
  const child = makeFakeChild()
  child.kill.mockImplementation((signal: NodeJS.Signals) => {
    if (signal === 'SIGKILL') {
      child.stdout.end()
      child.stderr.end()
      child.emit('close', null)
    }
    return true
  })
  spawnMock.mockReturnValue(child)

  const finishedRun = run({
    token: 'token',
    secret: 'secret',
    cleverCLI: CLEVER_CLI,
    timeout: 1800
  })
  await vi.advanceTimersByTimeAsync(1800 * 1000)
  expect(child.kill).toHaveBeenCalledWith('SIGTERM')
  await vi.advanceTimersByTimeAsync(5000)
  await finishedRun
  expect(child.kill).toHaveBeenCalledWith('SIGKILL')
  expect(setFailed).not.toHaveBeenCalled()
})

test('timeout stops waiting when the child stays open after SIGKILL', async () => {
  vi.useFakeTimers()
  const child = makeFakeChild()
  child.kill.mockReturnValue(true)
  spawnMock.mockReturnValue(child)

  const finishedRun = run({
    token: 'token',
    secret: 'secret',
    cleverCLI: CLEVER_CLI,
    timeout: 1800
  })
  let completed = false
  void finishedRun.then(() => {
    completed = true
  })

  await vi.advanceTimersByTimeAsync(1800 * 1000)
  await vi.advanceTimersByTimeAsync(5000)
  expect(child.kill).toHaveBeenCalledWith('SIGKILL')
  await vi.advanceTimersByTimeAsync(5000)

  try {
    expect(completed).toBe(true)
    expect(child.stdout.destroyed).toBe(true)
    expect(child.stderr.destroyed).toBe(true)
    expect(child.unref).toHaveBeenCalled()
  } finally {
    if (!completed) {
      child.stdout.end()
      child.stderr.end()
      child.emit('close', null)
      await finishedRun
    }
  }
})

test('deploy completes before timeout: success, no kill', async () => {
  vi.useFakeTimers()
  const child = makeFakeChild()
  spawnMock.mockReturnValue(child)
  const finished = run({
    token: 'token',
    secret: 'secret',
    cleverCLI: CLEVER_CLI,
    timeout: 1800
  })
  // Let the pre-deploy steps run and the deploy spawn, then succeed.
  await vi.advanceTimersByTimeAsync(1000)
  child.emit('close', 0)
  await finished
  expect(child.kill).not.toHaveBeenCalled()
  expect(setFailed).not.toHaveBeenCalled()
})

test('deploy fails before timeout: fails the workflow', async () => {
  vi.useFakeTimers()
  const child = makeFakeChild()
  spawnMock.mockReturnValue(child)
  const finished = run({
    token: 'token',
    secret: 'secret',
    cleverCLI: CLEVER_CLI,
    timeout: 1800
  })
  await vi.advanceTimersByTimeAsync(1000)
  child.emit('close', 42)
  await finished
  expect(child.kill).not.toHaveBeenCalled()
  expect(setFailed).toHaveBeenCalledWith('Deployment failed with code 42')
})

test('spawn error: fails the workflow and leaves no pending timer', async () => {
  vi.useFakeTimers()
  const child = makeFakeChild()
  spawnMock.mockReturnValue(child)
  const finished = run({
    token: 'token',
    secret: 'secret',
    cleverCLI: CLEVER_CLI,
    timeout: 1800
  })
  await vi.advanceTimersByTimeAsync(1000)
  child.emit('error', new Error('spawn ENOENT'))
  await finished
  expect(setFailed).toHaveBeenCalledWith('spawn ENOENT')
  // The timeout must be cleared even when the deploy errors out, otherwise the
  // event loop stays pinned until it fires.
  expect(vi.getTimerCount()).toBe(0)
})

test('force deploy application', async () => {
  await run({
    token: 'token',
    secret: 'secret',
    appID: 'app_facade42-cafe-babe-cafe-deadf00dbaad',
    cleverCLI: CLEVER_CLI,
    force: true
  })
  expectCleverCLICallWithArgs(
    1,
    'link',
    'app_facade42-cafe-babe-cafe-deadf00dbaad',
    '--alias',
    'app_facade42-cafe-babe-cafe-deadf00dbaad'
  )
  expectCleverCLICallWithArgs(
    2,
    'deploy',
    '--alias',
    'app_facade42-cafe-babe-cafe-deadf00dbaad',
    '--force'
  )
})

test('env-set failure fails the workflow with stderr, without leaking the value, and never deploys', async () => {
  execMock.mockImplementation(
    (
      _cli: string,
      args: string[],
      options?: { listeners?: { stderr?: (data: Buffer) => void } }
    ) => {
      if (args[0] === 'env' && args[1] === 'set') {
        options?.listeners?.stderr?.(
          Buffer.from('Error: environment variable rejected\n')
        )
        return Promise.resolve(1)
      }
      return Promise.resolve(0)
    }
  )
  await run({
    token: 'token',
    secret: 'secret',
    cleverCLI: CLEVER_CLI,
    extraEnv: {
      foo: 'bar'
    }
  })
  expect(setFailed).toHaveBeenCalledWith(
    'Failed to set environment variable foo (exit code 1): ' +
      'Error: environment variable rejected'
  )
  const failureMessage = (setFailed as ReturnType<typeof vi.fn>).mock
    .calls[0]?.[0]
  expect(failureMessage).not.toContain('bar')
  expect(execMock.mock.calls.some(call => call[1]?.[0] === 'deploy')).toBe(
    false
  )
})

test('spawnDeploy pipes child stderr through the tee (annotations still reach stdout)', async () => {
  const stdoutSpy = vi
    .spyOn(process.stdout, 'write')
    .mockImplementation(() => true)
  try {
    vi.useFakeTimers()
    const child = makeFakeChild()
    spawnMock.mockReturnValue(child)
    const finishedRun = run({
      token: 'token',
      secret: 'secret',
      cleverCLI: CLEVER_CLI,
      timeout: 1800
    })
    // Let the pre-deploy steps run and the deploy spawn before touching the
    // child's streams, same as the other timeout-path tests.
    await vi.advanceTimersByTimeAsync(1000)
    child.stderr.write('::error ::deploy failed\n')
    child.emit('close', 1)
    await finishedRun
    const out = stdoutSpy.mock.calls
      .map((call: unknown[]) => String(call[0]))
      .join('')
    expect(out).toContain('::error ::deploy failed')
  } finally {
    stdoutSpy.mockRestore()
  }
})
