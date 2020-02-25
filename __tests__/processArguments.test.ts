import { processArguments } from '../src/action'

// --

const OLD_ENV = process.env

beforeEach(() => {
  jest.resetModules() // this is important - it clears the cache
  process.env = { ...OLD_ENV }
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

test('extra env, no safelisting', () => {
  process.env.INPUT_CLEVER_ENV_FOO = 'foo'
  process.env.INPUT_CLEVER_ENV_BAR = 'bar'
  process.env.INPUT_CLEVER_ENV_EVIL = 'evil'
  process.env.CLEVER_TOKEN = 'token'
  process.env.CLEVER_SECRET = 'secret'
  const args = processArguments()
  expect(args.extraEnv).toBeDefined()
  expect(args.extraEnv!.FOO).toEqual('foo')
  expect(args.extraEnv!.BAR).toEqual('bar')
  expect(args.extraEnv!.EVIL).toEqual('evil')
})
test('extra env, with safelisting', () => {
  process.env.INPUT_CLEVER_ENV_FOO = 'foo'
  process.env.INPUT_CLEVER_ENV_BAR = 'bar'
  process.env.INPUT_CLEVER_ENV_EVIL = 'evil'
  process.env.INPUT_EXTRAENVSAFELIST = 'FOO,BAR'
  process.env.CLEVER_TOKEN = 'token'
  process.env.CLEVER_SECRET = 'secret'
  const args = processArguments()
  expect(args.extraEnv).toBeDefined()
  expect(args.extraEnv!.FOO).toEqual('foo')
  expect(args.extraEnv!.BAR).toEqual('bar')
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
