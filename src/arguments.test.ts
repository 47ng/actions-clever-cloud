import * as core from '@actions/core'
import { afterEach, beforeEach, expect, test, vitest } from 'vitest'
import { processArguments } from './arguments'

// `@actions/core` is real ESM, whose named exports are not configurable,
// so `vi.spyOn(core, 'warning')` cannot redefine it in place. Mock only
// `warning`, passing every other export through untouched, so input
// parsing still reads real `INPUT_*` / `process.env` values as everywhere
// else in this file.
vitest.mock('@actions/core', async importOriginal => {
  const actual = await importOriginal<typeof import('@actions/core')>()
  return {
    ...actual,
    warning: vitest.fn()
  }
})

const warn = vitest.mocked(core.warning)

// --

const OLD_ENV = process.env

beforeEach(() => {
  vitest.resetModules() // this is important - it clears the cache
  process.env = { ...OLD_ENV }
  // Simulate default values
  process.env.INPUT_FORCE = 'false'
  process.env.INPUT_QUIET = 'false'
  delete process.env.NODE_ENV
  warn.mockClear()
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
  expect(warn).not.toHaveBeenCalled()
})

test('extra env, dash key is dropped with a warning that redacts the value', () => {
  process.env.INPUT_SETENV = 'MY-VAR=super-secret'
  process.env.CLEVER_TOKEN = 'token'
  process.env.CLEVER_SECRET = 'secret'
  const args = processArguments()
  expect(args.extraEnv).toBeDefined()
  expect(args.extraEnv!['MY-VAR']).toBeUndefined()
  expect(warn).toHaveBeenCalledTimes(1)
  const message = warn.mock.calls[0]![0] as string
  expect(message).not.toContain('super-secret')
  expect(message).toContain('MY-VAR=***')
})

test('extra env, line without = never echoes its content', () => {
  process.env.INPUT_SETENV = 'sk_live_totallyASecretToken'
  process.env.CLEVER_TOKEN = 'token'
  process.env.CLEVER_SECRET = 'secret'
  processArguments()
  expect(warn).toHaveBeenCalledTimes(1)
  const message = warn.mock.calls[0]![0] as string
  expect(message).not.toContain('sk_live_totallyASecretToken')
})

test('extra env, whitespace-only line between valid vars is skipped without a warning', () => {
  process.env.INPUT_SETENV = 'FOO=foo\n   \nBAR=bar'
  process.env.CLEVER_TOKEN = 'token'
  process.env.CLEVER_SECRET = 'secret'
  const args = processArguments()
  expect(args.extraEnv!.FOO).toEqual('foo')
  expect(args.extraEnv!.BAR).toEqual('bar')
  expect(warn).not.toHaveBeenCalled()
})

test('extra env preserves whitespace in unquoted values', () => {
  process.env.INPUT_SETENV = 'VALUE=  leading and trailing  '
  process.env.CLEVER_TOKEN = 'token'
  process.env.CLEVER_SECRET = 'secret'
  const args = processArguments()
  expect(args.extraEnv!.VALUE).toEqual('  leading and trailing  ')
})

test('extra env removes matching quote delimiters from values', () => {
  process.env.INPUT_SETENV = 'DOUBLE=" quoted "\nSINGLE=\'quoted\''
  process.env.CLEVER_TOKEN = 'token'
  process.env.CLEVER_SECRET = 'secret'
  const args = processArguments()
  expect(args.extraEnv!.DOUBLE).toEqual(' quoted ')
  expect(args.extraEnv!.SINGLE).toEqual('quoted')
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
  const run = () => processArguments()
  expect(run).toThrow()
})

test('timeout, negative value throws', () => {
  process.env.CLEVER_TOKEN = 'token'
  process.env.CLEVER_SECRET = 'secret'
  process.env.INPUT_TIMEOUT = '-5'
  const run = () => processArguments()
  expect(run).toThrow()
})

test('timeout, zero means no timeout', () => {
  process.env.CLEVER_TOKEN = 'token'
  process.env.CLEVER_SECRET = 'secret'
  process.env.INPUT_TIMEOUT = '0'
  const args = processArguments()
  expect(args.timeout).toBeUndefined()
})

test('timeout, garbage value throws', () => {
  process.env.CLEVER_TOKEN = 'token'
  process.env.CLEVER_SECRET = 'secret'
  process.env.INPUT_TIMEOUT = '12abc'
  const run = () => processArguments()
  expect(run).toThrow()
})

test('timeout, scientific notation throws', () => {
  process.env.CLEVER_TOKEN = 'token'
  process.env.CLEVER_SECRET = 'secret'
  process.env.INPUT_TIMEOUT = '1e3'
  const run = () => processArguments()
  expect(run).toThrow()
})

test('timeout, hexadecimal notation throws', () => {
  process.env.CLEVER_TOKEN = 'token'
  process.env.CLEVER_SECRET = 'secret'
  process.env.INPUT_TIMEOUT = '0x10'
  const run = () => processArguments()
  expect(run).toThrow()
})

test('timeout, leading plus sign throws', () => {
  process.env.CLEVER_TOKEN = 'token'
  process.env.CLEVER_SECRET = 'secret'
  process.env.INPUT_TIMEOUT = '+5'
  const run = () => processArguments()
  expect(run).toThrow()
})

test('timeout, 24 hours is accepted', () => {
  process.env.CLEVER_TOKEN = 'token'
  process.env.CLEVER_SECRET = 'secret'
  process.env.INPUT_TIMEOUT = '86400'
  const args = processArguments()
  expect(args.timeout).toEqual(86400)
})

test('timeout, first value above 24 hours throws', () => {
  process.env.CLEVER_TOKEN = 'token'
  process.env.CLEVER_SECRET = 'secret'
  process.env.INPUT_TIMEOUT = '86401'
  const run = () => processArguments()
  expect(run).toThrow()
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
