// @ts-check

import run from '../src/action'

const core = require('@actions/core')
const { exec } = require('@actions/exec')

jest.mock('@actions/exec')
jest.mock('@actions/core')

// --

function expectCleverCLICallWithArgs(
  callIndex: number,
  ...expectedArgs: any[]
) {
  const cli = exec.mock.calls[callIndex][0]
  const args = exec.mock.calls[callIndex][1]
  expect(cli).toEqual('clever')
  expectedArgs.map((arg, i) => {
    expect(args[i]).toEqual(arg)
  })
}

test('deploy default application (no arguments)', async () => {
  exec.mockResolvedValue(0)
  await run({
    token: 'token',
    secret: 'secret',
    cleverCLI: 'clever'
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
  expect(core.setFailed).not.toHaveBeenCalled()
})

test('deploy application with alias', async () => {
  await run({
    token: 'token',
    secret: 'secret',
    alias: 'app-alias',
    cleverCLI: 'clever'
  })
  expectCleverCLICallWithArgs(2, 'deploy', '--alias', 'app-alias')
  expect(core.setFailed).not.toHaveBeenCalled()
})

test('deploy application with app ID', async () => {
  await run({
    token: 'token',
    secret: 'secret',
    appID: 'app_facade42-cafe-babe-cafe-deadf00dbaad',
    cleverCLI: 'clever'
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
    cleverCLI: 'clever'
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
    cleverCLI: 'clever',
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
    cleverCLI: 'clever',
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
    cleverCLI: 'clever',
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
  exec.mockResolvedValue(42)
  await run({
    token: 'token',
    secret: 'secret',
    cleverCLI: 'clever'
  })
  expect(core.setFailed).toHaveBeenCalledWith('Deployment failed with code 42')
})

test('deployment failure with timeout fails the workflow', async () => {
  exec.mockResolvedValue(42)
  await run({
    token: 'token',
    secret: 'secret',
    cleverCLI: 'clever',
    timeout: 10_000
  })
  expect(core.setFailed).toHaveBeenCalledWith('Deployment failed with code 42')
})

test('force deploy application', async () => {
  await run({
    token: 'token',
    secret: 'secret',
    appID: 'app_facade42-cafe-babe-cafe-deadf00dbaad',
    cleverCLI: 'clever',
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
