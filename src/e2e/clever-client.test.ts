import { describe, expect, test } from 'vitest'
import { buildE2EApplicationName, createCleverController } from './clever-client'

describe('buildE2EApplicationName', () => {
  test('uses the fixed e2e prefix plus run ID and attempt number', () => {
    expect(buildE2EApplicationName({ runId: '123', runAttempt: '4' })).toBe(
      'actions-clever-cloud-e2e-123-4'
    )
  })
})

describe('createCleverController', () => {
  test('creates a personal node app in the chosen region and returns its captured ID', async () => {
    const calls: Array<{
      cli: string
      args: string[]
      timeoutMs: number
    }> = []

    const controller = createCleverController({
      cleverCLI: '/tmp/node_modules/.bin/clever',
      runCommand: async (cli, args, { timeoutMs }) => {
        calls.push({ cli, args, timeoutMs })
        return {
          stdout: JSON.stringify({
            id: 'app_facade42-cafe-babe-cafe-deadf00dbaad',
            name: 'actions-clever-cloud-e2e-123-4'
          }),
          stderr: ''
        }
      }
    })

    await expect(
      controller.createApplication({
        name: 'actions-clever-cloud-e2e-123-4',
        region: 'par'
      })
    ).resolves.toEqual({
      appId: 'app_facade42-cafe-babe-cafe-deadf00dbaad',
      name: 'actions-clever-cloud-e2e-123-4'
    })

    expect(calls).toEqual([
      {
        cli: '/tmp/node_modules/.bin/clever',
        args: [
          'create',
          '--type',
          'node',
          '--region',
          'par',
          '--format',
          'json',
          'actions-clever-cloud-e2e-123-4'
        ],
        timeoutMs: 30_000
      }
    ])
  })

  test('fails when create does not return a valid application ID', async () => {
    const controller = createCleverController({
      cleverCLI: '/tmp/node_modules/.bin/clever',
      runCommand: async () => ({
        stdout: JSON.stringify({
          id: 'not-an-app-id',
          name: 'actions-clever-cloud-e2e-123-4'
        }),
        stderr: ''
      })
    })

    await expect(
      controller.createApplication({
        name: 'actions-clever-cloud-e2e-123-4',
        region: 'par'
      })
    ).rejects.toThrow('Clever create did not return a valid app ID')
  })

  test('rejects malformed app IDs that only match the prefix', async () => {
    const controller = createCleverController({
      cleverCLI: '/tmp/node_modules/.bin/clever',
      runCommand: async () => ({
        stdout: JSON.stringify({
          id: 'app_-',
          name: 'actions-clever-cloud-e2e-123-4'
        }),
        stderr: ''
      })
    })

    await expect(
      controller.createApplication({
        name: 'actions-clever-cloud-e2e-123-4',
        region: 'par'
      })
    ).rejects.toThrow('Clever create did not return a valid app ID')
  })

  test('finds an app by its exact run-based name', async () => {
    const calls: Array<{
      cli: string
      args: string[]
      timeoutMs: number
    }> = []

    const controller = createCleverController({
      cleverCLI: '/tmp/node_modules/.bin/clever',
      runCommand: async (cli, args, { timeoutMs }) => {
        calls.push({ cli, args, timeoutMs })
        return {
          stdout: JSON.stringify([
            {
              id: 'orga_123',
              applications: [
                {
                  app_id: 'app_facade42-cafe-babe-cafe-deadf00dbaad',
                  name: 'actions-clever-cloud-e2e-123-4'
                },
                {
                  app_id: 'app_decafbad-cafe-babe-cafe-deadf00dbaad',
                  name: 'other-app'
                }
              ]
            }
          ]),
          stderr: ''
        }
      }
    })

    await expect(
      controller.findApplicationByName('actions-clever-cloud-e2e-123-4')
    ).resolves.toEqual({
      appId: 'app_facade42-cafe-babe-cafe-deadf00dbaad',
      name: 'actions-clever-cloud-e2e-123-4'
    })

    expect(calls).toEqual([
      {
        cli: '/tmp/node_modules/.bin/clever',
        args: ['applications', 'list', '--format', 'json'],
        timeoutMs: 30_000
      }
    ])
  })

  test('waits for the exact run-based app name to appear before recovering its ID', async () => {
    let lookupCalls = 0

    const controller = createCleverController({
      cleverCLI: '/tmp/node_modules/.bin/clever',
      runCommand: async (_cli, args) => {
        if (args[0] !== 'applications') {
          throw new Error(`Unexpected command: ${args.join(' ')}`)
        }

        lookupCalls += 1
        return {
          stdout: JSON.stringify([
            {
              id: 'orga_123',
              applications:
                lookupCalls === 1
                  ? []
                  : [
                      {
                        app_id: 'app_facade42-cafe-babe-cafe-deadf00dbaad',
                        name: 'actions-clever-cloud-e2e-123-4'
                      }
                    ]
            }
          ]),
          stderr: ''
        }
      },
      sleep: async () => {},
      settleTimeoutMs: 2,
      pollIntervalMs: 1
    })

    await expect(
      controller.findApplicationByName('actions-clever-cloud-e2e-123-4')
    ).resolves.toEqual({
      appId: 'app_facade42-cafe-babe-cafe-deadf00dbaad',
      name: 'actions-clever-cloud-e2e-123-4'
    })
  })

  test('fails with a timeout when the created app never appears in lookup results', async () => {
    const controller = createCleverController({
      cleverCLI: '/tmp/node_modules/.bin/clever',
      runCommand: async () => ({
        stdout: JSON.stringify([{ id: 'orga_123', applications: [] }]),
        stderr: ''
      }),
      sleep: async () => {},
      settleTimeoutMs: 2,
      pollIntervalMs: 1
    })

    await expect(
      controller.findApplicationByName('actions-clever-cloud-e2e-123-4')
    ).rejects.toThrow(
      'Timed out while waiting for application actions-clever-cloud-e2e-123-4'
    )
  })

  test('reports the exact name and ID when teardown fails', async () => {
    const controller = createCleverController({
      cleverCLI: '/tmp/node_modules/.bin/clever',
      runCommand: async (_cli, args) => {
        if (args[0] === 'activity') {
          return { stdout: '[]', stderr: '' }
        }

        if (args[0] === 'delete') {
          return { stdout: '', stderr: '' }
        }

        return {
          stdout: JSON.stringify([
            {
              id: 'orga_123',
              applications: [
                { app_id: 'app_facade42-cafe-babe-cafe-deadf00dbaad' }
              ]
            }
          ]),
          stderr: ''
        }
      }
    })

    await expect(
      controller.deleteApplication({
        appId: 'app_facade42-cafe-babe-cafe-deadf00dbaad',
        name: 'actions-clever-cloud-e2e-123-4'
      })
    ).rejects.toThrow(
      'Failed to delete actions-clever-cloud-e2e-123-4 (app_facade42-cafe-babe-cafe-deadf00dbaad): Application app_facade42-cafe-babe-cafe-deadf00dbaad still exists after deletion'
    )
  })

  test('fails when deployment cancellation never reaches a final state', async () => {
    let activityCalls = 0

    const controller = createCleverController({
      cleverCLI: '/tmp/node_modules/.bin/clever',
      runCommand: async (_cli, args) => {
        if (args[0] === 'activity') {
          activityCalls += 1
          return {
            stdout: JSON.stringify([
              { uuid: `dep_${activityCalls}`, action: 'DEPLOY', state: 'WIP' }
            ]),
            stderr: ''
          }
        }

        return { stdout: '', stderr: '' }
      },
      sleep: async () => {},
      settleTimeoutMs: 2,
      pollIntervalMs: 1
    })

    await expect(
      controller.deleteApplication({
        appId: 'app_facade42-cafe-babe-cafe-deadf00dbaad',
        name: 'actions-clever-cloud-e2e-123-4'
      })
    ).rejects.toThrow(
      'Failed to delete actions-clever-cloud-e2e-123-4 (app_facade42-cafe-babe-cafe-deadf00dbaad): Timed out while waiting for deployment cancellation for app_facade42-cafe-babe-cafe-deadf00dbaad'
    )
  })

  test('cancels active deployments, deletes the captured app ID, and verifies absence', async () => {
    const calls: Array<{
      cli: string
      args: string[]
      timeoutMs: number
    }> = []
    let activityCalls = 0

    const controller = createCleverController({
      cleverCLI: '/tmp/node_modules/.bin/clever',
      runCommand: async (cli, args, { timeoutMs }) => {
        calls.push({ cli, args, timeoutMs })

        if (args[0] === 'activity') {
          activityCalls += 1
          return {
            stdout: JSON.stringify(
              activityCalls === 1
                ? [{ uuid: 'dep_123', action: 'DEPLOY', state: 'WIP' }]
                : [{ uuid: 'dep_123', action: 'DEPLOY', state: 'CANCELLED' }]
            ),
            stderr: ''
          }
        }

        if (args[0] === 'cancel-deploy') {
          return { stdout: '', stderr: '' }
        }

        if (args[0] === 'delete') {
          return { stdout: '', stderr: '' }
        }

        return {
          stdout: JSON.stringify([{ id: 'orga_123', applications: [] }]),
          stderr: ''
        }
      },
      sleep: async () => {}
    })

    await expect(
      controller.deleteApplication({
        appId: 'app_facade42-cafe-babe-cafe-deadf00dbaad',
        name: 'actions-clever-cloud-e2e-123-4'
      })
    ).resolves.toBeUndefined()

    expect(calls).toEqual([
      {
        cli: '/tmp/node_modules/.bin/clever',
        args: ['activity', '--app', 'app_facade42-cafe-babe-cafe-deadf00dbaad', '--format', 'json'],
        timeoutMs: 30_000
      },
      {
        cli: '/tmp/node_modules/.bin/clever',
        args: ['cancel-deploy', '--app', 'app_facade42-cafe-babe-cafe-deadf00dbaad'],
        timeoutMs: 30_000
      },
      {
        cli: '/tmp/node_modules/.bin/clever',
        args: ['activity', '--app', 'app_facade42-cafe-babe-cafe-deadf00dbaad', '--format', 'json'],
        timeoutMs: 30_000
      },
      {
        cli: '/tmp/node_modules/.bin/clever',
        args: ['delete', '--app', 'app_facade42-cafe-babe-cafe-deadf00dbaad', '--yes'],
        timeoutMs: 30_000
      },
      {
        cli: '/tmp/node_modules/.bin/clever',
        args: ['applications', 'list', '--format', 'json'],
        timeoutMs: 30_000
      }
    ])
  })
})
