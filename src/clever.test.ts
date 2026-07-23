import { EventEmitter } from 'node:events'
import { PassThrough } from 'node:stream'
import { afterEach, beforeEach, expect, test, vi } from 'vitest'

// The client drives the CLI through the real spawn-based transport;
// mock the process boundary itself.
vi.mock('node:child_process', () => ({
  spawn: vi.fn()
}))

import { spawn } from 'node:child_process'
import {
  buildDeployArgs,
  cleverClient,
  parseLinkedAppAlias,
  type Clever
} from './clever'
import type { Host } from './github'
import { createDeployLog, type DeployLog } from './output'

// Every non-quiet DeployLog tees output into the shared process.stdout. The
// real action does this once per process; this suite does it several times,
// which trips Node's 10-listener leak warning. Lift the cap for the tests.
process.stdout.setMaxListeners(0)

// --

const CLI = 'clever-mocked'
const SPAWN_OPTIONS = { cwd: undefined, stdio: ['ignore', 'pipe', 'pipe'] }

const spawnMock = spawn as unknown as ReturnType<typeof vi.fn>

/**
 * Minimal stand-in for a spawned process: real stdout/stderr streams so
 * piping and capture work, an EventEmitter for `error`/`close`, and a `kill`
 * spy that settles the process the way SIGTERM would.
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

type FakeChild = ReturnType<typeof makeFakeChild>

type ChildOutcome = {
  code?: number | null
  signal?: NodeJS.Signals | null
  stdout?: string
  stderr?: string
}

/**
 * End the child's streams, then emit `close` one macrotask later, mirroring
 * Node's guarantee that `close` fires only after stdio has been consumed.
 */
function settleChild(child: FakeChild, outcome: ChildOutcome = {}): void {
  const { code = 0, signal = null, stdout = '', stderr = '' } = outcome
  setImmediate(() => {
    child.stdout.end(stdout)
    child.stderr.end(stderr)
    setImmediate(() => child.emit('close', code, signal))
  })
}

function scriptChildren(
  outcomes: (args: string[]) => ChildOutcome
): FakeChild[] {
  const children: FakeChild[] = []
  spawnMock.mockImplementation((_cli: string, args: string[]) => {
    const child = makeFakeChild()
    children.push(child)
    settleChild(child, outcomes(args))
    return child
  })
  return children
}

function fakeHost(): Host {
  return {
    info: vi.fn(),
    debug: vi.fn(),
    warning: vi.fn(),
    maskSecret: vi.fn(),
    fail: vi.fn()
  }
}

function fakeLog(): { log: DeployLog; output: () => string } {
  const stream = new PassThrough()
  const chunks: Buffer[] = []
  stream.on('data', chunk => chunks.push(chunk))
  return {
    log: { stream, done: async () => {} },
    output: () => Buffer.concat(chunks).toString()
  }
}

function makeClient(overrides: { log?: DeployLog; host?: Host } = {}): Clever {
  return cleverClient({
    cliPath: CLI,
    log: overrides.log ?? fakeLog().log,
    host: overrides.host ?? fakeHost()
  })
}

beforeEach(() => {
  vi.clearAllMocks()
  scriptChildren(args => (args[0] === 'applications' ? { stdout: '[]\n' } : {}))
})

afterEach(() => {
  vi.useRealTimers()
})

// --- buildDeployArgs ---

test('buildDeployArgs: bare deploy by default', () => {
  expect(buildDeployArgs({})).toEqual(['deploy'])
})

test('buildDeployArgs: alias', () => {
  expect(buildDeployArgs({ alias: 'app-alias' })).toEqual([
    'deploy',
    '--alias',
    'app-alias'
  ])
})

test('buildDeployArgs: force', () => {
  expect(buildDeployArgs({ force: true })).toEqual(['deploy', '--force'])
})

test('buildDeployArgs: same-commit policy', () => {
  expect(buildDeployArgs({ sameCommitPolicy: 'restart' })).toEqual([
    'deploy',
    '--same-commit-policy',
    'restart'
  ])
})

test('buildDeployArgs: all options, in stable order', () => {
  expect(
    buildDeployArgs({ alias: 'a', force: true, sameCommitPolicy: 'rebuild' })
  ).toEqual([
    'deploy',
    '--alias',
    'a',
    '--force',
    '--same-commit-policy',
    'rebuild'
  ])
})

// --- parseLinkedAppAlias ---

const APP_ID = 'app_facade42-cafe-babe-cafe-deadf00dbaad'

test('parseLinkedAppAlias: finds the alias for a linked app', () => {
  const json = JSON.stringify([
    { app_id: 'app_other', alias: 'other' },
    { app_id: APP_ID, alias: 'review-app' }
  ])
  expect(parseLinkedAppAlias(json, APP_ID)).toBe('review-app')
})

test('parseLinkedAppAlias: returns undefined when the app is not linked', () => {
  expect(parseLinkedAppAlias('[]', APP_ID)).toBeUndefined()
})

test('parseLinkedAppAlias: tolerates non-object entries', () => {
  const json = JSON.stringify([null, 42, { app_id: APP_ID, alias: 'ok' }])
  expect(parseLinkedAppAlias(json, APP_ID)).toBe('ok')
})

test.each([
  ['missing', JSON.stringify([{ app_id: APP_ID }])],
  ['empty', JSON.stringify([{ app_id: APP_ID, alias: '' }])],
  ['non-string', JSON.stringify([{ app_id: APP_ID, alias: 42 }])]
])('parseLinkedAppAlias: %s alias fails', (_, json) => {
  expect(() => parseLinkedAppAlias(json, APP_ID)).toThrow(
    `Application ${APP_ID} is linked without a valid alias`
  )
})

test.each([
  ['invalid JSON', 'not json'],
  ['non-array JSON', '{"app_id": "nope"}']
])('parseLinkedAppAlias: %s fails', (_, json) => {
  expect(() => parseLinkedAppAlias(json, APP_ID)).toThrow(
    'Clever CLI returned invalid linked application data'
  )
})

// --- linkedAppAlias ---

test('linkedAppAlias: queries linked applications silently', async () => {
  const { log, output } = fakeLog()
  scriptChildren(() => ({
    stdout: JSON.stringify([{ app_id: APP_ID, alias: 'review-app' }])
  }))
  const client = makeClient({ log })
  await expect(client.linkedAppAlias(APP_ID)).resolves.toBe('review-app')
  expect(spawnMock).toHaveBeenCalledWith(
    CLI,
    ['applications', '--json'],
    SPAWN_OPTIONS
  )
  // Silent: the applications dump never reaches the user-facing stream.
  await new Promise(resolve => setImmediate(resolve))
  expect(output()).toBe('')
})

test('linkedAppAlias: resolves undefined when the app is not linked', async () => {
  const client = makeClient()
  await expect(client.linkedAppAlias(APP_ID)).resolves.toBeUndefined()
})

test('linkedAppAlias: fails when the CLI exits non-zero', async () => {
  scriptChildren(() => ({ code: 2 }))
  const client = makeClient()
  await expect(client.linkedAppAlias(APP_ID)).rejects.toThrow(
    'Failed to list linked applications (exit code 2)'
  )
})

// --- link ---

test('link: links the app under its own ID as alias', async () => {
  const client = makeClient()
  await client.link(APP_ID)
  expect(spawnMock).toHaveBeenCalledWith(
    CLI,
    ['link', APP_ID, '--alias', APP_ID],
    SPAWN_OPTIONS
  )
})

test('link: fails when the CLI exits non-zero', async () => {
  scriptChildren(() => ({ code: 1 }))
  const client = makeClient()
  await expect(client.link(APP_ID)).rejects.toThrow(
    `Failed to link application ${APP_ID} (exit code 1)`
  )
})

// --- setEnv ---

test('setEnv: sets the variable silently, masking its value', async () => {
  const host = fakeHost()
  const { log, output } = fakeLog()
  const client = makeClient({ host, log })
  await client.setEnv('foo', 'bar')
  expect(spawnMock).toHaveBeenCalledWith(
    CLI,
    ['env', 'set', 'foo', 'bar'],
    SPAWN_OPTIONS
  )
  expect(host.maskSecret).toHaveBeenCalledWith('bar')
  expect(host.info).toHaveBeenCalledWith('Setting environment variable foo')
  await new Promise(resolve => setImmediate(resolve))
  expect(output()).toBe('')
})

test('setEnv: scopes the variable to the alias when given', async () => {
  const client = makeClient()
  await client.setEnv('foo', 'bar', 'app-alias')
  expect(spawnMock).toHaveBeenCalledWith(
    CLI,
    ['env', 'set', '--alias', 'app-alias', 'foo', 'bar'],
    SPAWN_OPTIONS
  )
})

test('setEnv: does not register empty values as secrets', async () => {
  const host = fakeHost()
  const client = makeClient({ host })
  await client.setEnv('EMPTY', '')
  expect(host.maskSecret).not.toHaveBeenCalled()
})

test('setEnv: failure surfaces stderr without leaking the value', async () => {
  scriptChildren(() => ({
    code: 1,
    stderr: 'Error: environment variable rejected\n'
  }))
  const client = makeClient()
  const failure = client.setEnv('foo', 'bar')
  await expect(failure).rejects.toThrow(
    'Failed to set environment variable foo (exit code 1): ' +
      'Error: environment variable rejected'
  )
  await expect(failure).rejects.not.toThrow('bar')
})

// --- deploy, no timeout ---

test('deploy: resolves on success', async () => {
  const client = makeClient()
  await expect(client.deploy({})).resolves.toBe('deployed')
  expect(spawnMock).toHaveBeenCalledWith(CLI, ['deploy'], SPAWN_OPTIONS)
})

test('deploy: passes alias, force and same-commit policy to the CLI', async () => {
  const client = makeClient()
  await client.deploy({
    alias: APP_ID,
    force: true,
    sameCommitPolicy: 'restart'
  })
  expect(spawnMock).toHaveBeenCalledWith(
    CLI,
    ['deploy', '--alias', APP_ID, '--force', '--same-commit-policy', 'restart'],
    SPAWN_OPTIONS
  )
})

test('deploy: non-zero exit code fails', async () => {
  scriptChildren(() => ({ code: 42 }))
  const client = makeClient()
  await expect(client.deploy({})).rejects.toThrow(
    'Deployment failed with code 42'
  )
})

test('deploy: termination by a signal fails', async () => {
  scriptChildren(() => ({ code: null, signal: 'SIGTERM' }))
  const client = makeClient()
  await expect(client.deploy({})).rejects.toThrow(
    'Deployment terminated by signal SIGTERM'
  )
})

test('deploy: spawn error fails', async () => {
  spawnMock.mockImplementation(() => {
    const child = makeFakeChild()
    setImmediate(() => child.emit('error', new Error('spawn ENOENT')))
    return child
  })
  const client = makeClient()
  await expect(client.deploy({})).rejects.toThrow('spawn ENOENT')
})

// --- deploy, with timeout ---

test('deploy: timeout is interpreted in seconds, not milliseconds', async () => {
  vi.useFakeTimers()
  const child = makeFakeChild()
  spawnMock.mockReturnValue(child)
  const client = makeClient()
  const outcome = client.deploy({ timeoutSeconds: 1800 })
  // One millisecond before the 30-minute mark: still waiting.
  await vi.advanceTimersByTimeAsync(1800 * 1000 - 1)
  expect(child.kill).not.toHaveBeenCalled()
  // Crossing 1800s (not 1800ms) is what triggers the timeout.
  await vi.advanceTimersByTimeAsync(1)
  expect(child.kill).toHaveBeenCalledWith('SIGTERM')
  await expect(outcome).resolves.toBe('timed-out')
})

test('deploy: timeout kills the deploy and reports a timed-out outcome', async () => {
  vi.useFakeTimers()
  const child = makeFakeChild()
  spawnMock.mockReturnValue(child)
  const client = makeClient()
  const outcome = client.deploy({ timeoutSeconds: 1800 })
  await vi.advanceTimersByTimeAsync(1800 * 1000)
  await expect(outcome).resolves.toBe('timed-out')
  expect(child.kill).toHaveBeenCalledWith('SIGTERM')
})

test('deploy: timeout waits for asynchronous final output before the tee closes', async () => {
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

    const warning = vi.fn()
    const log = await createDeployLog({ quiet: false }, { warning })
    const client = makeClient({ log })
    const outcome = client.deploy({ timeoutSeconds: 1800 })
    await vi.advanceTimersByTimeAsync(1800 * 1000)
    expect(child.kill).toHaveBeenCalledWith('SIGTERM')
    await vi.advanceTimersByTimeAsync(50)
    await expect(outcome).resolves.toBe('timed-out')
    log.stream.end()
    await log.done()

    const out = stdoutSpy.mock.calls
      .map((call: unknown[]) => String(call[0]))
      .join('')
    expect(out).toContain('::error ::final timeout detail')
    expect(out).not.toContain('�')
  } finally {
    stdoutSpy.mockRestore()
  }
})

test('deploy: timeout escalates to SIGKILL after the termination grace period', async () => {
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

  const client = makeClient()
  const outcome = client.deploy({ timeoutSeconds: 1800 })
  await vi.advanceTimersByTimeAsync(1800 * 1000)
  expect(child.kill).toHaveBeenCalledWith('SIGTERM')
  await vi.advanceTimersByTimeAsync(5000)
  await expect(outcome).resolves.toBe('timed-out')
  expect(child.kill).toHaveBeenCalledWith('SIGKILL')
})

test('deploy: timeout stops waiting when the child stays open after SIGKILL', async () => {
  vi.useFakeTimers()
  const child = makeFakeChild()
  child.kill.mockReturnValue(true)
  spawnMock.mockReturnValue(child)

  const client = makeClient()
  const outcome = client.deploy({ timeoutSeconds: 1800 })
  let completed = false
  void outcome.then(() => {
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
      await outcome
    }
  }
})

test('deploy: completes before the timeout — success, no kill', async () => {
  vi.useFakeTimers()
  const child = makeFakeChild()
  spawnMock.mockReturnValue(child)
  const client = makeClient()
  const outcome = client.deploy({ timeoutSeconds: 1800 })
  await vi.advanceTimersByTimeAsync(1000)
  child.emit('close', 0)
  await expect(outcome).resolves.toBe('deployed')
  expect(child.kill).not.toHaveBeenCalled()
})

test('deploy: fails before the timeout — failure, no kill', async () => {
  vi.useFakeTimers()
  const child = makeFakeChild()
  spawnMock.mockReturnValue(child)
  const client = makeClient()
  const outcome = client.deploy({ timeoutSeconds: 1800 })
  await vi.advanceTimersByTimeAsync(1000)
  child.emit('close', 42)
  await expect(outcome).rejects.toThrow('Deployment failed with code 42')
  expect(child.kill).not.toHaveBeenCalled()
})

test('deploy: terminated by a signal before the timeout fails', async () => {
  vi.useFakeTimers()
  const child = makeFakeChild()
  spawnMock.mockReturnValue(child)
  const client = makeClient()
  const outcome = client.deploy({ timeoutSeconds: 1800 })
  await vi.advanceTimersByTimeAsync(1000)
  child.emit('close', null, 'SIGTERM')
  await expect(outcome).rejects.toThrow(
    'Deployment terminated by signal SIGTERM'
  )
  expect(child.kill).not.toHaveBeenCalled()
})

test('deploy: spawn error leaves no pending timer', async () => {
  vi.useFakeTimers()
  const child = makeFakeChild()
  spawnMock.mockReturnValue(child)
  const client = makeClient()
  const outcome = client.deploy({ timeoutSeconds: 1800 })
  await vi.advanceTimersByTimeAsync(1000)
  child.emit('error', new Error('spawn ENOENT'))
  await expect(outcome).rejects.toThrow('spawn ENOENT')
  // The timeout must be cleared even when the deploy errors out, otherwise
  // the event loop stays pinned until it fires.
  expect(vi.getTimerCount()).toBe(0)
})

// --- deploy output pipeline integration ---

test('deploy: output pauses when the console applies backpressure', async () => {
  const stdoutSpy = vi
    .spyOn(process.stdout, 'write')
    .mockImplementation(() => false)
  const child = makeFakeChild()
  spawnMock.mockReturnValue(child)
  const warning = vi.fn()
  const log = await createDeployLog({ quiet: false }, { warning })
  const client = makeClient({ log })
  const outcome = client.deploy({})

  try {
    await new Promise(resolve => setImmediate(resolve))
    const chunk = Buffer.alloc(64 * 1024, 'x')
    chunk[chunk.length - 1] = 10
    for (let i = 0; i < 64 && !child.stdout.isPaused(); i += 1) {
      child.stdout.write(chunk)
      await new Promise(resolve => setImmediate(resolve))
    }

    expect(child.stdout.isPaused()).toBe(true)
  } finally {
    stdoutSpy.mockImplementation(() => true)
    process.stdout.emit('drain')
    child.stdout.end()
    child.stderr.end()
    child.emit('close', 0)
    await outcome
    log.stream.end()
    await log.done()
    stdoutSpy.mockRestore()
  }
})

test('deploy: child stderr flows through the tee (annotations reach stdout)', async () => {
  const stdoutSpy = vi
    .spyOn(process.stdout, 'write')
    .mockImplementation(() => true)
  try {
    const child = makeFakeChild()
    spawnMock.mockReturnValue(child)
    const warning = vi.fn()
    const log = await createDeployLog({ quiet: false }, { warning })
    const client = makeClient({ log })
    const outcome = client.deploy({})
    child.stderr.write('::error ::deploy failed\n')
    child.stdout.end()
    child.stderr.end()
    child.emit('close', 1)
    await expect(outcome).rejects.toThrow('Deployment failed with code 1')
    log.stream.end()
    await log.done()
    const out = stdoutSpy.mock.calls
      .map((call: unknown[]) => String(call[0]))
      .join('')
    expect(out).toContain('::error ::deploy failed')
  } finally {
    stdoutSpy.mockRestore()
  }
})
