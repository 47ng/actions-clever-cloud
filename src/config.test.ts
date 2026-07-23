import * as core from '@actions/core'
import { afterEach, beforeEach, expect, test, vitest } from 'vitest'
import { parseConfig } from './config'

// `@actions/core` is real ESM, whose named exports are not configurable,
// so `vi.spyOn(core, 'warning')` cannot redefine it in place. Mock only
// the outputs, passing every other export through untouched, so input
// parsing still reads real `INPUT_*` / `process.env` values as everywhere
// else in this file.
vitest.mock('@actions/core', async importOriginal => {
  const actual = await importOriginal<typeof import('@actions/core')>()
  return {
    ...actual,
    warning: vitest.fn(),
    info: vitest.fn()
  }
})

const warn = vitest.mocked(core.warning)
const info = vitest.mocked(core.info)

// --

const OLD_ENV = process.env

beforeEach(() => {
  vitest.resetModules()
  process.env = { ...OLD_ENV }
  // Simulate default values
  process.env.INPUT_FORCE = 'false'
  process.env.INPUT_QUIET = 'false'
  delete process.env.NODE_ENV
  warn.mockClear()
  info.mockClear()
})

afterEach(() => {
  process.env = OLD_ENV
})

test('fail if authentication is not provided', () => {
  delete process.env.CLEVER_TOKEN
  delete process.env.CLEVER_SECRET
  const run = () => parseConfig()
  expect(run).toThrow()
})

test('missing CLEVER_TOKEN fails fast with the documented message', () => {
  delete process.env.CLEVER_TOKEN
  process.env.CLEVER_SECRET = 'secret'
  expect(() => parseConfig()).toThrow(
    'Missing CLEVER_TOKEN environment variable: https://err.sh/47ng/actions-clever-cloud/env'
  )
})

test('missing CLEVER_SECRET fails fast with the documented message', () => {
  process.env.CLEVER_TOKEN = 'token'
  delete process.env.CLEVER_SECRET
  expect(() => parseConfig()).toThrow(
    'Missing CLEVER_SECRET environment variable: https://err.sh/47ng/actions-clever-cloud/env'
  )
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
  const config = parseConfig()
  expect(config.extraEnv).toBeDefined()
  expect(config.extraEnv!.FOO).toEqual('foo')
  expect(config.extraEnv!.BAR).toEqual('bar')
  expect(config.extraEnv!.lowercase).toEqual('blah')
  expect(config.extraEnv!['123']).toEqual('456')
  expect(config.extraEnv!.many_equals).toEqual('dod==d=doodod=d')
  expect(config.extraEnv!.EVIL).toBeUndefined()
  expect(warn).not.toHaveBeenCalled()
})

test('extra env, Clever-compatible dotted and dashed keys are accepted', () => {
  process.env.INPUT_SETENV = 'MY-VAR=dashed\nMY.DOT=dotted'
  process.env.CLEVER_TOKEN = 'token'
  process.env.CLEVER_SECRET = 'secret'
  const config = parseConfig()
  expect(config.extraEnv).toBeDefined()
  expect(config.extraEnv!['MY-VAR']).toEqual('dashed')
  expect(config.extraEnv!['MY.DOT']).toEqual('dotted')
  expect(warn).not.toHaveBeenCalled()
})

test('extra env, __proto__ key is rejected with a redacted warning', () => {
  process.env.INPUT_SETENV = '__proto__=super-secret'
  process.env.CLEVER_TOKEN = 'token'
  process.env.CLEVER_SECRET = 'secret'
  const config = parseConfig()
  expect(config.extraEnv).toBeDefined()
  expect(Object.hasOwn(config.extraEnv!, '__proto__')).toBe(false)
  expect(warn).toHaveBeenCalledTimes(1)
  const message = warn.mock.calls[0]![0] as string
  expect(message).not.toContain('super-secret')
  expect(message).toContain('__proto__=***')
})

test('extra env, invalid key is dropped with a warning that redacts the value', () => {
  process.env.INPUT_SETENV = 'MY/VAR=super-secret'
  process.env.CLEVER_TOKEN = 'token'
  process.env.CLEVER_SECRET = 'secret'
  const config = parseConfig()
  expect(config.extraEnv).toBeDefined()
  expect(config.extraEnv!['MY/VAR']).toBeUndefined()
  expect(warn).toHaveBeenCalledTimes(1)
  const message = warn.mock.calls[0]![0] as string
  expect(message).not.toContain('super-secret')
  expect(message).toContain('MY/VAR=***')
})

test('extra env, line without = never echoes its content', () => {
  process.env.INPUT_SETENV = 'sk_live_totallyASecretToken'
  process.env.CLEVER_TOKEN = 'token'
  process.env.CLEVER_SECRET = 'secret'
  parseConfig()
  expect(warn).toHaveBeenCalledTimes(1)
  const message = warn.mock.calls[0]![0] as string
  expect(message).not.toContain('sk_live_totallyASecretToken')
})

test('extra env, whitespace-only line between valid vars is skipped without a warning', () => {
  process.env.INPUT_SETENV = 'FOO=foo\n   \nBAR=bar'
  process.env.CLEVER_TOKEN = 'token'
  process.env.CLEVER_SECRET = 'secret'
  const config = parseConfig()
  expect(config.extraEnv!.FOO).toEqual('foo')
  expect(config.extraEnv!.BAR).toEqual('bar')
  expect(warn).not.toHaveBeenCalled()
})

test('extra env parses CRLF lines without changing their values', () => {
  process.env.INPUT_SETENV = 'FIRST=one\r\nSECOND=two\r\n'
  process.env.CLEVER_TOKEN = 'token'
  process.env.CLEVER_SECRET = 'secret'
  const config = parseConfig()
  expect(config.extraEnv).toEqual({ FIRST: 'one', SECOND: 'two' })
  expect(warn).not.toHaveBeenCalled()
})

test('extra env preserves whitespace in unquoted values', () => {
  process.env.INPUT_SETENV = 'VALUE=  leading and trailing  '
  process.env.CLEVER_TOKEN = 'token'
  process.env.CLEVER_SECRET = 'secret'
  const config = parseConfig()
  expect(config.extraEnv!.VALUE).toEqual('  leading and trailing  ')
})

test('extra env removes matching quote delimiters from values', () => {
  process.env.INPUT_SETENV = 'DOUBLE=" quoted "\nSINGLE=\'quoted\''
  process.env.CLEVER_TOKEN = 'token'
  process.env.CLEVER_SECRET = 'secret'
  const config = parseConfig()
  expect(config.extraEnv!.DOUBLE).toEqual(' quoted ')
  expect(config.extraEnv!.SINGLE).toEqual('quoted')
})

test('extra env unescapes matching quotes in quoted values', () => {
  process.env.INPUT_SETENV = 'DOUBLE="say \\"hello\\""\nSINGLE=\'it\\\'s\''
  process.env.CLEVER_TOKEN = 'token'
  process.env.CLEVER_SECRET = 'secret'
  const config = parseConfig()
  expect(config.extraEnv!.DOUBLE).toEqual('say "hello"')
  expect(config.extraEnv!.SINGLE).toEqual("it's")
})

test('extra env drops malformed quoted values with redacted warnings', () => {
  process.env.INPUT_SETENV =
    'LONE="\nUNMATCHED="unterminated\nTRAILING="closed"tail\nESCAPED_END="ends\\"'
  process.env.CLEVER_TOKEN = 'token'
  process.env.CLEVER_SECRET = 'secret'
  const config = parseConfig()
  expect(config.extraEnv).toEqual({})
  expect(warn).toHaveBeenCalledTimes(4)
  for (const [message] of warn.mock.calls) {
    expect(message).not.toContain('unterminated')
    expect(message).not.toContain('closed')
    expect(message).not.toContain('ends')
    expect(message).toContain('=***')
  }
})

test('timeout, default value is undefined', () => {
  process.env.CLEVER_TOKEN = 'token'
  process.env.CLEVER_SECRET = 'secret'
  process.env.INPUT_TIMEOUT = undefined
  const config = parseConfig()
  expect(config.timeout).toBeUndefined()
})

test('timeout, default value is a number', () => {
  process.env.CLEVER_TOKEN = 'token'
  process.env.CLEVER_SECRET = 'secret'
  process.env.INPUT_TIMEOUT = '1800'
  const config = parseConfig()
  expect(config.timeout).toEqual(1800)
})

test('timeout, default value is not a number', () => {
  process.env.CLEVER_TOKEN = 'token'
  process.env.CLEVER_SECRET = 'secret'
  process.env.INPUT_TIMEOUT = 'nope'
  const run = () => parseConfig()
  expect(run).toThrow()
})

test('timeout, negative value throws', () => {
  process.env.CLEVER_TOKEN = 'token'
  process.env.CLEVER_SECRET = 'secret'
  process.env.INPUT_TIMEOUT = '-5'
  const run = () => parseConfig()
  expect(run).toThrow()
})

test('timeout, zero means no timeout', () => {
  process.env.CLEVER_TOKEN = 'token'
  process.env.CLEVER_SECRET = 'secret'
  process.env.INPUT_TIMEOUT = '0'
  const config = parseConfig()
  expect(config.timeout).toBeUndefined()
})

test('timeout, garbage value throws', () => {
  process.env.CLEVER_TOKEN = 'token'
  process.env.CLEVER_SECRET = 'secret'
  process.env.INPUT_TIMEOUT = '12abc'
  const run = () => parseConfig()
  expect(run).toThrow()
})

test('timeout, scientific notation throws', () => {
  process.env.CLEVER_TOKEN = 'token'
  process.env.CLEVER_SECRET = 'secret'
  process.env.INPUT_TIMEOUT = '1e3'
  const run = () => parseConfig()
  expect(run).toThrow()
})

test('timeout, hexadecimal notation throws', () => {
  process.env.CLEVER_TOKEN = 'token'
  process.env.CLEVER_SECRET = 'secret'
  process.env.INPUT_TIMEOUT = '0x10'
  const run = () => parseConfig()
  expect(run).toThrow()
})

test('timeout, leading plus sign throws', () => {
  process.env.CLEVER_TOKEN = 'token'
  process.env.CLEVER_SECRET = 'secret'
  process.env.INPUT_TIMEOUT = '+5'
  const run = () => parseConfig()
  expect(run).toThrow()
})

test('timeout, 24 hours is accepted', () => {
  process.env.CLEVER_TOKEN = 'token'
  process.env.CLEVER_SECRET = 'secret'
  process.env.INPUT_TIMEOUT = '86400'
  const config = parseConfig()
  expect(config.timeout).toEqual(86400)
})

test('timeout, first value above 24 hours throws', () => {
  process.env.CLEVER_TOKEN = 'token'
  process.env.CLEVER_SECRET = 'secret'
  process.env.INPUT_TIMEOUT = '86401'
  const run = () => parseConfig()
  expect(run).toThrow()
})

test('force, default value is false', () => {
  process.env.CLEVER_TOKEN = 'token'
  process.env.CLEVER_SECRET = 'secret'
  const config = parseConfig()
  expect(config.force).toBe(false)
})

test('force, value is true', () => {
  process.env.CLEVER_TOKEN = 'token'
  process.env.CLEVER_SECRET = 'secret'
  process.env.INPUT_FORCE = 'true'
  const config = parseConfig()
  expect(config.force).toBe(true)
})

test('force, value is false', () => {
  process.env.CLEVER_TOKEN = 'token'
  process.env.CLEVER_SECRET = 'secret'
  process.env.INPUT_FORCE = 'false'
  const config = parseConfig()
  expect(config.force).toBe(false)
})
test('force, wrong value type fails the action', () => {
  process.env.CLEVER_TOKEN = 'token'
  process.env.CLEVER_SECRET = 'secret'
  process.env.INPUT_FORCE = 'nope'
  const run = () => parseConfig()
  expect(run).toThrow()
})

test('quiet, wrong value type fails the action', () => {
  process.env.CLEVER_TOKEN = 'token'
  process.env.CLEVER_SECRET = 'secret'
  process.env.INPUT_QUIET = 'nope'
  const run = () => parseConfig()
  expect(run).toThrow()
})

test('extra env, the info block lists key names but never values', () => {
  process.env.INPUT_SETENV = 'FOO=secret-foo\nBAR=secret-bar'
  process.env.CLEVER_TOKEN = 'token'
  process.env.CLEVER_SECRET = 'secret'
  parseConfig()
  const infoLines = info.mock.calls.map(([message]) => String(message))
  expect(infoLines).toContain('Setting extra environment variables:')
  expect(infoLines).toContain('  FOO')
  expect(infoLines).toContain('  BAR')
  expect(infoLines.join('\n')).not.toContain('secret-foo')
  expect(infoLines.join('\n')).not.toContain('secret-bar')
})

test('extra env, no info block when no variables are set', () => {
  process.env.CLEVER_TOKEN = 'token'
  process.env.CLEVER_SECRET = 'secret'
  parseConfig()
  expect(info).not.toHaveBeenCalled()
})

test('alias and appID are unset by default', () => {
  process.env.CLEVER_TOKEN = 'token'
  process.env.CLEVER_SECRET = 'secret'
  const config = parseConfig()
  expect(config.alias).toBeUndefined()
  expect(config.appID).toBeUndefined()
})

test('alias and appID are set from inputs', () => {
  process.env.CLEVER_TOKEN = 'token'
  process.env.CLEVER_SECRET = 'secret'
  process.env.INPUT_ALIAS = 'app-alias'
  process.env.INPUT_APPID = 'app_facade42-cafe-babe-cafe-deadf00dbaad'
  const config = parseConfig()
  expect(config.alias).toBe('app-alias')
  expect(config.appID).toBe('app_facade42-cafe-babe-cafe-deadf00dbaad')
})

test('log file is unset by default', () => {
  process.env.CLEVER_TOKEN = 'token'
  process.env.CLEVER_SECRET = 'secret'
  const config = parseConfig()
  expect(config.logFile).toBeUndefined()
})

test('log file', () => {
  process.env.CLEVER_TOKEN = 'token'
  process.env.CLEVER_SECRET = 'secret'
  process.env.INPUT_LOGFILE = '/some/path'
  const config = parseConfig()
  expect(config.logFile).toBe('/some/path')
})

test('quiet (not by default)', () => {
  process.env.CLEVER_TOKEN = 'token'
  process.env.CLEVER_SECRET = 'secret'
  const config = parseConfig()
  expect(config.quiet).toBe(false)
})

test('quiet', () => {
  process.env.CLEVER_TOKEN = 'token'
  process.env.CLEVER_SECRET = 'secret'
  process.env.INPUT_QUIET = 'true'
  const config = parseConfig()
  expect(config.quiet).toBe(true)
})

test('deployPath is unset by default', () => {
  process.env.CLEVER_TOKEN = 'token'
  process.env.CLEVER_SECRET = 'secret'
  const config = parseConfig()
  expect(config.deployPath).toBeUndefined()
})

test('deployPath is set from input', () => {
  process.env.CLEVER_TOKEN = 'token'
  process.env.CLEVER_SECRET = 'secret'
  process.env.INPUT_DEPLOYPATH = './packages/backend'
  const config = parseConfig()
  expect(config.deployPath).toBe('./packages/backend')
})

test('sameCommitPolicy is unset by default', () => {
  process.env.CLEVER_TOKEN = 'token'
  process.env.CLEVER_SECRET = 'secret'
  const config = parseConfig()
  expect(config.sameCommitPolicy).toBeUndefined()
})

test('sameCommitPolicy is set from input', () => {
  process.env.CLEVER_TOKEN = 'token'
  process.env.CLEVER_SECRET = 'secret'
  process.env.INPUT_SAMECOMMITPOLICY = 'restart'
  const config = parseConfig()
  expect(config.sameCommitPolicy).toBe('restart')
})
