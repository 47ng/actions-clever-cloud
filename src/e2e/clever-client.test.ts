import { describe, expect, test, vi } from 'vitest'
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

  test('reads one exact application env value by app ID', async () => {
    const controller = createCleverController({
      cleverCLI: '/tmp/node_modules/.bin/clever',
      runCommand: async () => ({
        stdout: JSON.stringify({
          env: [
            { name: 'CC_HEALTH_CHECK_PATH', value: '/health' },
            { name: 'E2E_HEALTH_VALUE', value: 'ABEiM0RVZneImaq7zN3u/w==' }
          ],
          fromAddons: [],
          fromDependencies: []
        }),
        stderr: ''
      })
    })

    await expect(
      controller.getEnvironmentValue(
        'app_facade42-cafe-babe-cafe-deadf00dbaad',
        'E2E_HEALTH_VALUE'
      )
    ).resolves.toBe('ABEiM0RVZneImaq7zN3u/w==')
  })

  test('looks up the exact app ID and returns its deploy URL', async () => {
    const controller = createCleverController({
      cleverCLI: '/tmp/node_modules/.bin/clever',
      runCommand: async () => ({
        stdout: JSON.stringify([
          {
            id: 'orga_123',
            applications: [
              {
                app_id: 'app_facade42-cafe-babe-cafe-deadf00dbaad',
                name: 'actions-clever-cloud-e2e-123-4',
                deploy_url: 'https://fixture.example.com'
              }
            ]
          }
        ]),
        stderr: ''
      })
    })

    await expect(
      controller.getApplication('app_facade42-cafe-babe-cafe-deadf00dbaad')
    ).resolves.toEqual({
      appId: 'app_facade42-cafe-babe-cafe-deadf00dbaad',
      name: 'actions-clever-cloud-e2e-123-4',
      deployURL: 'https://fixture.example.com'
    })
  })

  test('refuses to cancel when another deployment is active for the app', async () => {
    const controller = createCleverController({
      cleverCLI: '/tmp/node_modules/.bin/clever',
      runCommand: async (_cli, args) => {
        if (args[0] === 'activity') {
          return {
            stdout: JSON.stringify([
              {
                uuid: 'deployment-timeout',
                action: 'DEPLOY',
                state: 'WIP',
                commit: 'commit-timeout'
              },
              {
                uuid: 'deployment-other',
                action: 'DEPLOY',
                state: 'RUNNING',
                commit: 'commit-other'
              }
            ]),
            stderr: ''
          }
        }

        throw new Error('cancel-deploy should not run when the active deployment is ambiguous')
      }
    })

    await expect(
      controller.cancelDeployment({
        appId: 'app_facade42-cafe-babe-cafe-deadf00dbaad',
        deploymentId: 'deployment-timeout'
      })
    ).rejects.toThrow(
      'Cannot cancel deployment deployment-timeout on app_facade42-cafe-babe-cafe-deadf00dbaad because 2 deployments are currently active'
    )
  })

  test('enforces the cancellation deadline against wall-clock time, not only sleep time', async () => {
    const sleep = vi.fn(async () => {})
    const dateNowSpy = vi.spyOn(Date, 'now')
    let activityCalls = 0

    dateNowSpy.mockImplementation(() => {
      activityCalls += 1
      return activityCalls === 1 ? 0 : 11
    })

    try {
      const controller = createCleverController({
        cleverCLI: '/tmp/node_modules/.bin/clever',
        runCommand: async (_cli, args) => {
          if (args[0] === 'cancel-deploy') {
            return { stdout: '', stderr: '' }
          }

          return {
            stdout: JSON.stringify([
              {
                uuid: 'deployment-timeout',
                action: 'DEPLOY',
                state: 'WIP',
                commit: 'commit-timeout'
              }
            ]),
            stderr: ''
          }
        },
        sleep,
        settleTimeoutMs: 10,
        pollIntervalMs: 5
      })

      await expect(
        controller.cancelDeployment({
          appId: 'app_facade42-cafe-babe-cafe-deadf00dbaad',
          deploymentId: 'deployment-timeout'
        })
      ).rejects.toThrow(
        'Timed out while waiting for deployment deployment-timeout on app_facade42-cafe-babe-cafe-deadf00dbaad to reach CANCELLED. Last state: WIP'
      )

      expect(sleep).not.toHaveBeenCalled()
    } finally {
      dateNowSpy.mockRestore()
    }
  })

  test('enforces the cancellation deadline before issuing cancel-deploy', async () => {
    const dateNowSpy = vi.spyOn(Date, 'now')
    let cancelCalls = 0

    const nowValues = [0, 11]
    dateNowSpy.mockImplementation(() => nowValues.shift() ?? 11)

    try {
      const controller = createCleverController({
        cleverCLI: '/tmp/node_modules/.bin/clever',
        runCommand: async (_cli, args) => {
          if (args[0] === 'activity') {
            return {
              stdout: JSON.stringify([
                {
                  uuid: 'deployment-timeout',
                  action: 'DEPLOY',
                  state: 'WIP',
                  commit: 'commit-timeout'
                }
              ]),
              stderr: ''
            }
          }

          cancelCalls += 1
          return { stdout: '', stderr: '' }
        },
        settleTimeoutMs: 10,
        pollIntervalMs: 5
      })

      await expect(
        controller.cancelDeployment({
          appId: 'app_facade42-cafe-babe-cafe-deadf00dbaad',
          deploymentId: 'deployment-timeout'
        })
      ).rejects.toThrow(
        'Timed out while waiting for deployment deployment-timeout on app_facade42-cafe-babe-cafe-deadf00dbaad to reach CANCELLED. Last state: WIP'
      )

      expect(cancelCalls).toBe(0)
    } finally {
      dateNowSpy.mockRestore()
    }
  })

  test('cancels the exact timed-out deployment and waits for its final cancelled state', async () => {
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

        if (args[0] === 'cancel-deploy') {
          return { stdout: '', stderr: '' }
        }

        activityCalls += 1
        return {
          stdout: JSON.stringify(
            activityCalls === 1
              ? [
                  {
                    uuid: 'deployment-other',
                    action: 'DEPLOY',
                    state: 'CANCELLED',
                    commit: 'commit-other'
                  },
                  {
                    uuid: 'deployment-timeout',
                    action: 'DEPLOY',
                    state: 'WIP',
                    commit: 'commit-timeout'
                  }
                ]
              : [
                  {
                    uuid: 'deployment-other',
                    action: 'DEPLOY',
                    state: 'CANCELLED',
                    commit: 'commit-other'
                  },
                  {
                    uuid: 'deployment-timeout',
                    action: 'DEPLOY',
                    state: 'CANCELLED',
                    commit: 'commit-timeout'
                  }
                ]
          ),
          stderr: ''
        }
      },
      sleep: async () => {},
      settleTimeoutMs: 2,
      pollIntervalMs: 1
    })

    await expect(
      controller.cancelDeployment({
        appId: 'app_facade42-cafe-babe-cafe-deadf00dbaad',
        deploymentId: 'deployment-timeout'
      })
    ).resolves.toEqual({
      uuid: 'deployment-timeout',
      action: 'DEPLOY',
      state: 'CANCELLED',
      commit: 'commit-timeout'
    })

    expect(calls).toEqual([
      {
        cli: '/tmp/node_modules/.bin/clever',
        args: ['activity', '--app', 'app_facade42-cafe-babe-cafe-deadf00dbaad', '--format', 'json'],
        timeoutMs: 2
      },
      {
        cli: '/tmp/node_modules/.bin/clever',
        args: ['cancel-deploy', '--app', 'app_facade42-cafe-babe-cafe-deadf00dbaad'],
        timeoutMs: 2
      },
      {
        cli: '/tmp/node_modules/.bin/clever',
        args: ['activity', '--app', 'app_facade42-cafe-babe-cafe-deadf00dbaad', '--format', 'json'],
        timeoutMs: 2
      }
    ])
  })

  test('fails with a useful deadline error when a timed-out deployment never reaches CANCELLED', async () => {
    let activityCalls = 0

    const controller = createCleverController({
      cleverCLI: '/tmp/node_modules/.bin/clever',
      runCommand: async (_cli, args) => {
        if (args[0] === 'cancel-deploy') {
          return { stdout: '', stderr: '' }
        }

        activityCalls += 1
        return {
          stdout: JSON.stringify([
            {
              uuid: 'deployment-timeout',
              action: 'DEPLOY',
              state: activityCalls === 1 ? 'WIP' : 'QUEUED',
              commit: 'commit-timeout'
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
      controller.cancelDeployment({
        appId: 'app_facade42-cafe-babe-cafe-deadf00dbaad',
        deploymentId: 'deployment-timeout'
      })
    ).rejects.toThrow(
      'Timed out while waiting for deployment deployment-timeout on app_facade42-cafe-babe-cafe-deadf00dbaad to reach CANCELLED. Last state: QUEUED'
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

  test('teardown cancels queued deployments before deleting the captured app ID', async () => {
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
                ? [{ uuid: 'dep_123', action: 'DEPLOY', state: 'QUEUED' }]
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
