import { afterEach, describe, expect, test, vi } from 'vitest'
import {
  createFetchHealth,
  createRunCommand,
  resolveCleverCLI
} from './workflow-adapters'

afterEach(() => {
  vi.unstubAllEnvs()
  vi.useRealTimers()
})

describe('createRunCommand', () => {
  test('runs the CLI with utf8 output, ambient env, timeout and a 10MB buffer', async () => {
    const calls: Array<{
      cli: string
      args: string[]
      options: unknown
    }> = []

    const runCommand = createRunCommand({
      execFileAsync: async (cli, args, options) => {
        calls.push({ cli, args, options })
        return { stdout: 'out', stderr: 'err' }
      }
    })

    await expect(
      runCommand('/tmp/node_modules/.bin/clever', ['activity', '--app'], {
        timeoutMs: 1234
      })
    ).resolves.toEqual({ stdout: 'out', stderr: 'err' })

    expect(calls).toEqual([
      {
        cli: '/tmp/node_modules/.bin/clever',
        args: ['activity', '--app'],
        options: {
          encoding: 'utf8',
          env: process.env,
          timeout: 1234,
          maxBuffer: 1024 * 1024 * 10
        }
      }
    ])
  })

  test('rethrows failures with trimmed stderr and no process exit details', async () => {
    const runCommand = createRunCommand({
      execFileAsync: async () => {
        throw Object.assign(new Error('spawn failed'), {
          stderr: '  boom  \n',
          code: 'ETIMEDOUT',
          signal: 'SIGTERM',
          killed: true
        })
      }
    })

    const error = await runCommand('clever', [], { timeoutMs: 1 }).catch(
      thrown => thrown
    )

    expect(error).toBeInstanceOf(Error)
    expect(error.message).toBe('boom')
    expect('code' in error).toBe(false)
    expect('signal' in error).toBe(false)
    expect('killed' in error).toBe(false)
  })

  test('falls back to the failure message when stderr is empty', async () => {
    const runCommand = createRunCommand({
      execFileAsync: async () => {
        throw Object.assign(new Error('spawn failed'), { stderr: '  \n' })
      }
    })

    await expect(runCommand('clever', [], { timeoutMs: 1 })).rejects.toThrow(
      'spawn failed'
    )
  })

  test('copies code, signal and killed when preserving process exit details', async () => {
    const runCommand = createRunCommand({
      execFileAsync: async () => {
        throw Object.assign(new Error('spawn failed'), {
          stderr: 'boom',
          code: 'ETIMEDOUT',
          signal: 'SIGTERM',
          killed: true
        })
      },
      preserveProcessExitDetails: true
    })

    const error = await runCommand('clever', [], { timeoutMs: 1 }).catch(
      thrown => thrown
    )

    expect(error).toBeInstanceOf(Error)
    expect(error.message).toBe('boom')
    expect(error.code).toBe('ETIMEDOUT')
    expect(error.signal).toBe('SIGTERM')
    expect(error.killed).toBe(true)
  })
})

describe('createFetchHealth', () => {
  test('returns the response status and lazy JSON body', async () => {
    const requests: Array<{
      url: string
      hasSignal: boolean
    }> = []

    const fetchHealth = createFetchHealth(10_000, async (input, init) => {
      requests.push({
        url: String(input),
        hasSignal: init?.signal instanceof AbortSignal
      })
      return new Response(JSON.stringify({ E2E_SCENARIO: 'healthy' }), {
        status: 200
      })
    })

    const response = await fetchHealth('https://example.com/health')

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual({ E2E_SCENARIO: 'healthy' })
    expect(requests).toEqual([
      { url: 'https://example.com/health', hasSignal: true }
    ])
  })

  test('aborts the request once the timeout elapses', async () => {
    vi.useFakeTimers()

    const fetchHealth = createFetchHealth(
      10_000,
      (input, init) =>
        new Promise<Response>((resolve, reject) => {
          init?.signal?.addEventListener('abort', () =>
            reject(new Error('aborted'))
          )
        })
    )

    const outcome = fetchHealth('https://example.com/health').catch(
      thrown => thrown
    )

    await vi.advanceTimersByTimeAsync(9_999)
    await vi.advanceTimersByTimeAsync(1)

    await expect(outcome).resolves.toEqual(new Error('aborted'))
  })

  test('leaves the request alone before the timeout elapses', async () => {
    vi.useFakeTimers()

    let aborted = false
    const fetchHealth = createFetchHealth(
      10_000,
      (input, init) =>
        new Promise<Response>((resolve, reject) => {
          init?.signal?.addEventListener('abort', () => {
            aborted = true
            reject(new Error('aborted'))
          })
        })
    )

    void fetchHealth('https://example.com/health').catch(() => {})

    await vi.advanceTimersByTimeAsync(9_999)

    expect(aborted).toBe(false)
  })
})

describe('resolveCleverCLI', () => {
  test('builds the candidate clever CLI path from the workspace directory', () => {
    expect(resolveCleverCLI('/workspace')).toBe(
      '/workspace/.candidate-source/node_modules/.bin/clever'
    )
  })

  test('reads the workspace directory from GITHUB_WORKSPACE by default', () => {
    vi.stubEnv('GITHUB_WORKSPACE', '/runner/work/repo')
    expect(resolveCleverCLI()).toBe(
      '/runner/work/repo/.candidate-source/node_modules/.bin/clever'
    )
  })

  test('fails when the workspace directory is missing', () => {
    vi.stubEnv('GITHUB_WORKSPACE', '')
    expect(() => resolveCleverCLI()).toThrow(
      'Missing workspace directory for clever CLI resolution'
    )
  })
})
