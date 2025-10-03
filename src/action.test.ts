import { beforeEach, expect, test, vi } from 'vitest'

// Mock must be defined before imports that use it
vi.mock('@actions/exec', () => ({
  exec: vi.fn(() => Promise.resolve(0))
}))

vi.mock('@actions/core', () => ({
  debug: vi.fn(),
  info: vi.fn(),
  setFailed: vi.fn()
}))

import { setFailed } from '@actions/core'
import { exec } from '@actions/exec'
import { run } from './action'

// --

const CLEVER_CLI = 'clever-mocked'

const execMock = exec as ReturnType<typeof vi.fn>

beforeEach(() => {
  vi.clearAllMocks()
  // Reset to default success behavior
  execMock.mockResolvedValue(0)
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
  expectCleverCLICallWithArgs(
    1,
    'login',
    '--token',
    'token',
    '--secret',
    'secret'
  )
  expectCleverCLICallWithArgs(2, 'deploy')
  expect(setFailed).not.toHaveBeenCalled()
})

test('deploy application with alias', async () => {
  await run({
    token: 'token',
    secret: 'secret',
    alias: 'app-alias',
    cleverCLI: CLEVER_CLI
  })
  expectCleverCLICallWithArgs(2, 'deploy', '--alias', 'app-alias')
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
    2,
    'link',
    'app_facade42-cafe-babe-cafe-deadf00dbaad',
    '--alias',
    'app_facade42-cafe-babe-cafe-deadf00dbaad'
  )
  expectCleverCLICallWithArgs(
    3,
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
    2,
    'link',
    'app_facade42-cafe-babe-cafe-deadf00dbaad',
    '--alias',
    'app_facade42-cafe-babe-cafe-deadf00dbaad'
  )
  expectCleverCLICallWithArgs(
    3,
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
  expectCleverCLICallWithArgs(2, 'env', 'set', 'foo', 'bar')
  expectCleverCLICallWithArgs(3, 'env', 'set', 'egg', 'spam')
  expectCleverCLICallWithArgs(4, 'deploy')
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
    2,
    'link',
    'app_facade42-cafe-babe-cafe-deadf00dbaad',
    '--alias',
    'app_facade42-cafe-babe-cafe-deadf00dbaad'
  )
  expectCleverCLICallWithArgs(
    3,
    'env',
    'set',
    '--alias',
    'app_facade42-cafe-babe-cafe-deadf00dbaad',
    'foo',
    'bar'
  )
  expectCleverCLICallWithArgs(
    4,
    'env',
    'set',
    '--alias',
    'app_facade42-cafe-babe-cafe-deadf00dbaad',
    'egg',
    'spam'
  )
  expectCleverCLICallWithArgs(
    5,
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
  expectCleverCLICallWithArgs(2, 'env', 'set', '--alias', 'foo', 'foo', 'bar')
  expectCleverCLICallWithArgs(3, 'env', 'set', '--alias', 'foo', 'egg', 'spam')
  expectCleverCLICallWithArgs(4, 'deploy', '--alias', 'foo')
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

test('deployment failure with timeout fails the workflow', async () => {
  execMock.mockResolvedValue(42)
  await run({
    token: 'token',
    secret: 'secret',
    cleverCLI: CLEVER_CLI,
    timeout: 10_000
  })
  expect(setFailed).toHaveBeenCalledWith('Deployment failed with code 42')
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
    2,
    'link',
    'app_facade42-cafe-babe-cafe-deadf00dbaad',
    '--alias',
    'app_facade42-cafe-babe-cafe-deadf00dbaad'
  )
  expectCleverCLICallWithArgs(
    3,
    'deploy',
    '--alias',
    'app_facade42-cafe-babe-cafe-deadf00dbaad',
    '--force'
  )
})
