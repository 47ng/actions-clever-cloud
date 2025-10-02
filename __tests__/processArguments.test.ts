import { afterEach, beforeEach, expect, test, vitest, } from 'vitest'
import { processArguments } from '../src/action'

// --

const OLD_ENV = process.env

beforeEach(() => {
  vitest.resetModules() // this is important - it clears the cache
  process.env = { ...OLD_ENV }
  // Simulate default values
  process.env.INPUT_FORCE = 'false'
  process.env.INPUT_QUIET = 'false'
  delete process.env.NODE_ENV
})

afterEach(() => {
  process.env = OLD_ENV
})

test('fail if authentication is not provided', () => {
  const run = () => processArguments()
  expect(run).toThrow()
})

test('obtain auth credentials from the environment', () => {
  process.env.CLEVER_TOKEN = 'token'
  process.env.CLEVER_SECRET = 'secret'
  const args = processArguments()
  expect(args.token).toEqual('token')
  expect(args.secret).toEqual('secret')
})

test('extra env', () => {
  process.env.INPUT_SETENV = `
  FOO=foo
  BAR=bar

  # empty line or comment is ignored
  lowercase=blah
  123=456
  many_equals=dod==d=doodod=d
`
  process.env.CLEVER_TOKEN = 'token'
  process.env.CLEVER_SECRET = 'secret'
  const args = processArguments()
  expect(args.extraEnv).toBeDefined()
  expect(args.extraEnv!.FOO).toEqual('foo')
  expect(args.extraEnv!.BAR).toEqual('bar')
  expect(args.extraEnv!.lowercase).toEqual('blah')
  expect(args.extraEnv!['123']).toEqual('456')
  expect(args.extraEnv!.many_equals).toEqual('dod==d=doodod=d')
  expect(args.extraEnv!.EVIL).toBeUndefined()
})

test('timeout, default value is undefined', () => {
  process.env.CLEVER_TOKEN = 'token'
  process.env.CLEVER_SECRET = 'secret'
  process.env.INPUT_TIMEOUT = undefined
  const args = processArguments()
  expect(args.timeout).toBeUndefined()
})

test('timeout, default value is a number', () => {
  process.env.CLEVER_TOKEN = 'token'
  process.env.CLEVER_SECRET = 'secret'
  process.env.INPUT_TIMEOUT = '1800'
  const args = processArguments()
  expect(args.timeout).toEqual(1800)
})

test('timeout, default value is not a number', () => {
  process.env.CLEVER_TOKEN = 'token'
  process.env.CLEVER_SECRET = 'secret'
  process.env.INPUT_TIMEOUT = 'nope'
  const args = processArguments()
  expect(args.timeout).toBeUndefined()
})

test('force, default value is false', () => {
  process.env.CLEVER_TOKEN = 'token'
  process.env.CLEVER_SECRET = 'secret'
  const args = processArguments()
  expect(args.force).toBe(false)
})

test('force, value is true', () => {
  process.env.CLEVER_TOKEN = 'token'
  process.env.CLEVER_SECRET = 'secret'
  process.env.INPUT_FORCE = 'true'
  const args = processArguments()
  expect(args.force).toBe(true)
})

test('force, value is false', () => {
  process.env.CLEVER_TOKEN = 'token'
  process.env.CLEVER_SECRET = 'secret'
  process.env.INPUT_FORCE = 'false'
  const args = processArguments()
  expect(args.force).toBe(false)
})
test('force, wrong value type fails the action', () => {
  process.env.CLEVER_TOKEN = 'token'
  process.env.CLEVER_SECRET = 'secret'
  process.env.INPUT_FORCE = 'nope'
  const run = () => processArguments()
  expect(run).toThrow()
})

test('log file is unset by default', () => {
  process.env.CLEVER_TOKEN = 'token'
  process.env.CLEVER_SECRET = 'secret'
  const args = processArguments()
  expect(args.logFile).toBeUndefined()
})

test('log file', () => {
  process.env.CLEVER_TOKEN = 'token'
  process.env.CLEVER_SECRET = 'secret'
  process.env.INPUT_LOGFILE = '/some/path'
  const args = processArguments()
  expect(args.logFile).toBe('/some/path')
})

test('quiet (not by default)', () => {
  process.env.CLEVER_TOKEN = 'token'
  process.env.CLEVER_SECRET = 'secret'
  const args = processArguments()
  expect(args.quiet).toBe(false)
})

test('quiet', () => {
  process.env.CLEVER_TOKEN = 'token'
  process.env.CLEVER_SECRET = 'secret'
  process.env.INPUT_QUIET = 'true'
  const args = processArguments()
  expect(args.quiet).toBe(true)
})

test('deployPath is unset by default', () => {
  process.env.CLEVER_TOKEN = 'token'
  process.env.CLEVER_SECRET = 'secret'
  const args = processArguments()
  expect(args.deployPath).toBeUndefined()
})

test('deployPath is set from input', () => {
  process.env.CLEVER_TOKEN = 'token'
  process.env.CLEVER_SECRET = 'secret'
  process.env.INPUT_DEPLOYPATH = './packages/backend'
  const args = processArguments()
  expect(args.deployPath).toBe('./packages/backend')
})

test('sameCommitPolicy is unset by default', () => {
  process.env.CLEVER_TOKEN = 'token'
  process.env.CLEVER_SECRET = 'secret'
  const args = processArguments()
  expect(args.sameCommitPolicy).toBeUndefined()
})

test('sameCommitPolicy is set from input', () => {
  process.env.CLEVER_TOKEN = 'token'
  process.env.CLEVER_SECRET = 'secret'
  process.env.INPUT_SAMECOMMITPOLICY = 'restart'
  const args = processArguments()
  expect(args.sameCommitPolicy).toBe('restart')
})
