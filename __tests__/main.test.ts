import run, { processArguments } from '../src/action'

const core = require('@actions/core')
const { exec } = require('@actions/exec')

jest.mock('@actions/exec')
jest.mock('@actions/core')

// --

test('deploy default application (no arguments)', async () => {
  await run({
    token: 'token',
    secret: 'secret',
    cleverCLI: 'clever'
  })
  expect(exec).toHaveBeenNthCalledWith(1, 'clever', [
    'login',
    '--token',
    'token',
    '--secret',
    'secret'
  ])
  expect(exec).toHaveBeenNthCalledWith(2, 'clever', ['deploy'])
  expect(core.setFailed).not.toHaveBeenCalled()
})

test('deploy application with alias', async () => {
  await run({
    token: 'token',
    secret: 'secret',
    alias: 'app-alias',
    cleverCLI: 'clever'
  })
  expect(exec).toHaveBeenNthCalledWith(1, 'clever', [
    'login',
    '--token',
    'token',
    '--secret',
    'secret'
  ])
  expect(exec).toHaveBeenNthCalledWith(2, 'clever', [
    'deploy',
    '--alias',
    'app-alias'
  ])
  expect(core.setFailed).not.toHaveBeenCalled()
})

test('deploy application with app ID', async () => {
  await run({
    token: 'token',
    secret: 'secret',
    appID: 'app_facade42-cafe-babe-cafe-deadf00dbaad',
    cleverCLI: 'clever'
  })
  expect(exec).toHaveBeenNthCalledWith(1, 'clever', [
    'login',
    '--token',
    'token',
    '--secret',
    'secret'
  ])
  expect(exec).toHaveBeenNthCalledWith(2, 'clever', [
    'link',
    'app_facade42-cafe-babe-cafe-deadf00dbaad',
    '--alias',
    'app_facade42-cafe-babe-cafe-deadf00dbaad'
  ])
  expect(exec).toHaveBeenNthCalledWith(3, 'clever', [
    'deploy',
    '--alias',
    'app_facade42-cafe-babe-cafe-deadf00dbaad'
  ])
})

test('when both app ID and alias are provided, appID takes precedence', async () => {
  await run({
    token: 'token',
    secret: 'secret',
    alias: 'foo',
    appID: 'app_facade42-cafe-babe-cafe-deadf00dbaad',
    cleverCLI: 'clever'
  })
  expect(exec).toHaveBeenNthCalledWith(1, 'clever', [
    'login',
    '--token',
    'token',
    '--secret',
    'secret'
  ])
  expect(exec).toHaveBeenNthCalledWith(2, 'clever', [
    'link',
    'app_facade42-cafe-babe-cafe-deadf00dbaad',
    '--alias',
    'app_facade42-cafe-babe-cafe-deadf00dbaad'
  ])
  expect(exec).toHaveBeenNthCalledWith(3, 'clever', [
    'deploy',
    '--alias',
    'app_facade42-cafe-babe-cafe-deadf00dbaad'
  ])
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
  expect(exec).toHaveBeenNthCalledWith(1, 'clever', [
    'login',
    '--token',
    'token',
    '--secret',
    'secret'
  ])
  expect(exec).toHaveBeenNthCalledWith(2, 'clever', [
    'env',
    'set',
    'foo',
    'bar'
  ])
  expect(exec).toHaveBeenNthCalledWith(3, 'clever', [
    'env',
    'set',
    'egg',
    'spam'
  ])
  expect(exec).toHaveBeenNthCalledWith(4, 'clever', ['deploy'])
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
  expect(exec).toHaveBeenNthCalledWith(1, 'clever', [
    'login',
    '--token',
    'token',
    '--secret',
    'secret'
  ])
  expect(exec).toHaveBeenNthCalledWith(2, 'clever', [
    'link',
    'app_facade42-cafe-babe-cafe-deadf00dbaad',
    '--alias',
    'app_facade42-cafe-babe-cafe-deadf00dbaad'
  ])
  expect(exec).toHaveBeenNthCalledWith(3, 'clever', [
    'env',
    'set',
    '--alias',
    'app_facade42-cafe-babe-cafe-deadf00dbaad',
    'foo',
    'bar'
  ])
  expect(exec).toHaveBeenNthCalledWith(4, 'clever', [
    'env',
    'set',
    '--alias',
    'app_facade42-cafe-babe-cafe-deadf00dbaad',
    'egg',
    'spam'
  ])
  expect(exec).toHaveBeenNthCalledWith(5, 'clever', [
    'deploy',
    '--alias',
    'app_facade42-cafe-babe-cafe-deadf00dbaad'
  ])
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
  expect(exec).toHaveBeenNthCalledWith(1, 'clever', [
    'login',
    '--token',
    'token',
    '--secret',
    'secret'
  ])
  expect(exec).toHaveBeenNthCalledWith(2, 'clever', [
    'env',
    'set',
    '--alias',
    'foo',
    'foo',
    'bar'
  ])
  expect(exec).toHaveBeenNthCalledWith(3, 'clever', [
    'env',
    'set',
    '--alias',
    'foo',
    'egg',
    'spam'
  ])
  expect(exec).toHaveBeenNthCalledWith(4, 'clever', [
    'deploy',
    '--alias',
    'foo'
  ])
})
