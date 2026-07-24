import { expect, test, vi } from 'vitest'
import type { Clever, DeployOptions, DeployOutcome } from './clever.ts'
import type { Config } from './config.ts'
import { deploy, type DeploymentDeps } from './deployment.ts'
import type { Host } from './github.ts'

const APP_ID = 'app_facade42-cafe-babe-cafe-deadf00dbaad'

type FakeCleverScript = {
  linkedAlias?: string | Error
  linkError?: Error
  setEnvError?: Error
  outcome?: DeployOutcome | Error
}

/**
 * In-memory Clever gateway: records every call in order and plays back
 * scripted results, so the use case is tested without module mocking or
 * process spawning.
 */
function fakeClever(script: FakeCleverScript = {}) {
  const calls: unknown[][] = []
  const clever: Clever = {
    async linkedAppAlias(appID) {
      calls.push(['linkedAppAlias', appID])
      if (script.linkedAlias instanceof Error) {
        throw script.linkedAlias
      }
      return script.linkedAlias
    },
    async link(appID) {
      calls.push(['link', appID])
      if (script.linkError) {
        throw script.linkError
      }
    },
    async setEnv(name, value, alias) {
      calls.push(['setEnv', name, value, alias])
      if (script.setEnvError) {
        throw script.setEnvError
      }
    },
    async deploy(options) {
      calls.push(['deploy', options])
      if (script.outcome instanceof Error) {
        throw script.outcome
      }
      return script.outcome ?? 'deployed'
    }
  }
  return { clever, calls }
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

function makeDeps(script: FakeCleverScript = {}): DeploymentDeps & {
  calls: unknown[][]
  shallowCheck: ReturnType<typeof vi.fn>
} {
  const { clever, calls } = fakeClever(script)
  const shallowCheck = vi.fn(async () => {
    calls.push(['checkForShallowCopy'])
  })
  return {
    clever,
    git: { checkForShallowCopy: shallowCheck },
    host: fakeHost(),
    calls,
    shallowCheck
  }
}

function config(overrides: Partial<Config> = {}): Config {
  return {
    cleverCLI: 'clever',
    force: false,
    quiet: false,
    extraEnv: {},
    ...overrides
  }
}

function deployOptions(calls: unknown[][]): DeployOptions {
  const call = calls.find(([name]) => name === 'deploy')
  expect(call).toBeDefined()
  return call![1] as DeployOptions
}

test('deploys the default application with no arguments', async () => {
  const deps = makeDeps()
  await deploy(config(), deps)
  expect(deps.calls).toEqual([
    ['checkForShallowCopy'],
    [
      'deploy',
      {
        alias: undefined,
        force: false,
        sameCommitPolicy: undefined,
        timeoutSeconds: undefined
      }
    ]
  ])
})

test('checks for a shallow working copy before anything else', async () => {
  const deps = makeDeps()
  await deploy(config({ appID: APP_ID, extraEnv: { foo: 'bar' } }), deps)
  expect(deps.calls[0]).toEqual(['checkForShallowCopy'])
})

test('a shallow working copy aborts before any Clever call', async () => {
  const deps = makeDeps()
  deps.shallowCheck.mockRejectedValue(new Error('shallow'))
  await expect(deploy(config({ appID: APP_ID }), deps)).rejects.toThrow(
    'shallow'
  )
  expect(deps.calls).toEqual([])
})

test('passes the alias input to the deploy', async () => {
  const deps = makeDeps()
  await deploy(config({ alias: 'app-alias' }), deps)
  expect(deployOptions(deps.calls).alias).toBe('app-alias')
  expect(deps.calls.some(([name]) => name === 'linkedAppAlias')).toBe(false)
})

test('links an unlinked appID under its own ID and deploys with it', async () => {
  const deps = makeDeps()
  await deploy(config({ appID: APP_ID }), deps)
  expect(deps.calls).toContainEqual(['linkedAppAlias', APP_ID])
  expect(deps.calls).toContainEqual(['link', APP_ID])
  expect(deployOptions(deps.calls).alias).toBe(APP_ID)
  expect(deps.host.debug).toHaveBeenCalledWith(`Linking ${APP_ID}`)
})

test('reuses an existing app link without linking again', async () => {
  const deps = makeDeps({ linkedAlias: APP_ID })
  await deploy(config({ appID: APP_ID }), deps)
  expect(deps.calls.some(([name]) => name === 'link')).toBe(false)
  expect(deployOptions(deps.calls).alias).toBe(APP_ID)
})

test('reuses a pre-existing alias for an app that is already linked', async () => {
  const deps = makeDeps({ linkedAlias: 'review-app' })
  await deploy(config({ appID: APP_ID }), deps)
  expect(deps.calls.some(([name]) => name === 'link')).toBe(false)
  expect(deployOptions(deps.calls).alias).toBe('review-app')
  expect(deps.host.debug).toHaveBeenCalledWith(
    `Application ${APP_ID} is already linked as review-app`
  )
})

test('appID takes precedence over alias when both are provided', async () => {
  const deps = makeDeps()
  await deploy(config({ appID: APP_ID, alias: 'foo' }), deps)
  expect(deps.calls).toContainEqual(['link', APP_ID])
  expect(deployOptions(deps.calls).alias).toBe(APP_ID)
})

test('does not swallow link lookup failures', async () => {
  const deps = makeDeps({
    linkedAlias: new Error(
      `Application ${APP_ID} is linked without a valid alias`
    )
  })
  await expect(deploy(config({ appID: APP_ID }), deps)).rejects.toThrow(
    `Application ${APP_ID} is linked without a valid alias`
  )
  expect(deps.calls.some(([name]) => name === 'deploy')).toBe(false)
})

test('does not swallow unrelated link failures', async () => {
  const deps = makeDeps({ linkError: new Error('Clever API is unavailable') })
  await expect(deploy(config({ appID: APP_ID }), deps)).rejects.toThrow(
    'Clever API is unavailable'
  )
  expect(deps.calls.some(([name]) => name === 'deploy')).toBe(false)
})

test('sets extra environment variables in order, before the deploy', async () => {
  const deps = makeDeps()
  await deploy(config({ extraEnv: { foo: 'bar', egg: 'spam' } }), deps)
  expect(deps.calls).toEqual([
    ['checkForShallowCopy'],
    ['setEnv', 'foo', 'bar', undefined],
    ['setEnv', 'egg', 'spam', undefined],
    ['deploy', expect.anything()]
  ])
})

test('scopes extra environment variables to the resolved alias', async () => {
  const deps = makeDeps()
  await deploy(
    config({ appID: APP_ID, extraEnv: { foo: 'bar', egg: 'spam' } }),
    deps
  )
  expect(deps.calls).toContainEqual(['setEnv', 'foo', 'bar', APP_ID])
  expect(deps.calls).toContainEqual(['setEnv', 'egg', 'spam', APP_ID])
})

test('scopes extra environment variables to the alias input', async () => {
  const deps = makeDeps()
  await deploy(config({ alias: 'foo', extraEnv: { egg: 'spam' } }), deps)
  expect(deps.calls).toContainEqual(['setEnv', 'egg', 'spam', 'foo'])
})

test('an environment variable failure stops the deployment', async () => {
  const deps = makeDeps({
    setEnvError: new Error(
      'Failed to set environment variable foo (exit code 1): rejected'
    )
  })
  await expect(
    deploy(config({ extraEnv: { foo: 'bar' } }), deps)
  ).rejects.toThrow(
    'Failed to set environment variable foo (exit code 1): rejected'
  )
  expect(deps.calls.some(([name]) => name === 'deploy')).toBe(false)
})

test('passes force, same-commit policy and timeout to the deploy', async () => {
  const deps = makeDeps()
  await deploy(
    config({ force: true, sameCommitPolicy: 'restart', timeout: 1800 }),
    deps
  )
  expect(deployOptions(deps.calls)).toEqual({
    alias: undefined,
    force: true,
    sameCommitPolicy: 'restart',
    timeoutSeconds: 1800
  })
})

test('a timed-out deployment moves on without failing', async () => {
  const deps = makeDeps({ outcome: 'timed-out' })
  await expect(deploy(config({ timeout: 1800 }), deps)).resolves.toBeUndefined()
  expect(deps.host.info).toHaveBeenCalledWith(
    'Deployment timed out, moving on with workflow run'
  )
})

test('a completed deployment does not log the timeout message', async () => {
  const deps = makeDeps()
  await deploy(config(), deps)
  expect(deps.host.info).not.toHaveBeenCalledWith(
    'Deployment timed out, moving on with workflow run'
  )
})

test('a quiet timed-out deployment writes the timeout message to the deploy log', async () => {
  const deps = makeDeps({ outcome: 'timed-out' })
  const deployLog = { write: vi.fn() }
  await deploy(config({ quiet: true, logFile: 'deploy.log', timeout: 60 }), {
    ...deps,
    deployLog
  })
  expect(deployLog.write).toHaveBeenCalledWith(
    'Deployment timed out, moving on with workflow run\n'
  )
  expect(deps.host.info).toHaveBeenCalledWith(
    'Deployment timed out, moving on with workflow run'
  )
})

test('a loud timed-out deployment leaves the deploy log to the CLI output', async () => {
  const deps = makeDeps({ outcome: 'timed-out' })
  const deployLog = { write: vi.fn() }
  await deploy(config({ timeout: 60 }), { ...deps, deployLog })
  expect(deployLog.write).not.toHaveBeenCalled()
})

test('deployment failures propagate to the caller', async () => {
  const deps = makeDeps({
    outcome: new Error('Deployment failed with code 42')
  })
  await expect(deploy(config(), deps)).rejects.toThrow(
    'Deployment failed with code 42'
  )
})
