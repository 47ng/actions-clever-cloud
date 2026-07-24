import { describe, expect, test, vi } from 'vitest'
import {
  buildE2EApplicationName,
  createApplicationWithRecovery,
  createCleverController,
  RecoverableCreateApplicationError
} from './clever-client.ts'

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

  test('rethrows clear create failures without waiting for name recovery', async () => {
    const createError = new Error('Authentication failed for current Clever profile')
    const findApplicationByName = vi.fn()

    await expect(
      createApplicationWithRecovery(
        {
          createApplication: async () => {
            throw createError
          },
          findApplicationByName
        },
        {
          name: 'actions-clever-cloud-e2e-123-4',
          region: 'par'
        }
      )
    ).rejects.toBe(createError)

    expect(findApplicationByName).not.toHaveBeenCalled()
  })

  test('treats a preserved plain exit failure as non-recoverable', async () => {
    const createError = Object.assign(new Error('App name already used'), {
      code: 1,
      signal: null,
      killed: false
    })
    const findApplicationByName = vi.fn()

    await expect(
      createApplicationWithRecovery(
        {
          createApplication: async () => {
            throw createError
          },
          findApplicationByName
        },
        {
          name: 'actions-clever-cloud-e2e-123-4',
          region: 'par'
        }
      )
    ).rejects.toBe(createError)

    expect(findApplicationByName).not.toHaveBeenCalled()
  })

  test('recovers the app by name after an ambiguous create capture failure', async () => {
    const recoveredApplication = {
      appId: 'app_facade42-cafe-babe-cafe-deadf00dbaad',
      name: 'actions-clever-cloud-e2e-123-4'
    }
    const findApplicationByName = vi.fn(async () => recoveredApplication)

    await expect(
      createApplicationWithRecovery(
        {
          createApplication: async () => {
            throw new RecoverableCreateApplicationError(
              'Clever create did not return a valid app ID'
            )
          },
          findApplicationByName
        },
        {
          name: 'actions-clever-cloud-e2e-123-4',
          region: 'par'
        }
      )
    ).resolves.toEqual(recoveredApplication)

    expect(findApplicationByName).toHaveBeenCalledWith(
      'actions-clever-cloud-e2e-123-4'
    )
  })

  test('recovers the app by name after a timed out create command may have succeeded remotely', async () => {
    const controller = createCleverController({
      cleverCLI: '/tmp/node_modules/.bin/clever',
      runCommand: async (_cli, args) => {
        if (args[0] === 'create') {
          const error = new Error('clever create timed out') as Error & {
            code?: string
            signal?: string
            killed?: boolean
          }
          error.code = 'ETIMEDOUT'
          error.signal = 'SIGTERM'
          error.killed = true
          throw error
        }

        return {
          stdout: JSON.stringify([
            {
              id: 'orga_123',
              applications: [
                {
                  app_id: 'app_facade42-cafe-babe-cafe-deadf00dbaad',
                  name: 'actions-clever-cloud-e2e-123-4'
                }
              ]
            }
          ]),
          stderr: ''
        }
      }
    })

    await expect(
      createApplicationWithRecovery(controller, {
        name: 'actions-clever-cloud-e2e-123-4',
        region: 'par'
      })
    ).resolves.toEqual({
      appId: 'app_facade42-cafe-babe-cafe-deadf00dbaad',
      name: 'actions-clever-cloud-e2e-123-4'
    })
  })

  test('chains both errors when name recovery also fails', async () => {
    const createError = new RecoverableCreateApplicationError(
      'Clever create did not return a valid app ID'
    )

    const outcome = createApplicationWithRecovery(
      {
        createApplication: async () => {
          throw createError
        },
        findApplicationByName: async () => {
          throw new Error(
            'Timed out while waiting for application actions-clever-cloud-e2e-123-4'
          )
        }
      },
      {
        name: 'actions-clever-cloud-e2e-123-4',
        region: 'par'
      }
    )

    await expect(outcome).rejects.toThrow(
      'Clever create did not return a valid app ID; recovery by name also failed: ' +
        'Timed out while waiting for application actions-clever-cloud-e2e-123-4'
    )
    await expect(outcome).rejects.toMatchObject({ cause: createError })
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

  test('does not call cancel-deploy until the exact deployment becomes the latest WIP deployment', async () => {
    const controller = createCleverController({
      cleverCLI: '/tmp/node_modules/.bin/clever',
      runCommand: async (_cli, args) => {
        if (args[0] === 'activity') {
          return {
            stdout: JSON.stringify([
              {
                uuid: 'deployment-other',
                action: 'DEPLOY',
                state: 'RUNNING',
                commit: 'commit-other'
              },
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

        throw new Error('cancel-deploy should not run before the expected deployment is latest WIP')
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
      'Timed out while waiting for deployment deployment-timeout on app_facade42-cafe-babe-cafe-deadf00dbaad to become the latest WIP deployment. Last state: WIP'
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
        'Timed out while waiting for deployment deployment-timeout on app_facade42-cafe-babe-cafe-deadf00dbaad to become the latest WIP deployment. Last state: WIP'
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
        'Timed out while waiting for deployment deployment-timeout on app_facade42-cafe-babe-cafe-deadf00dbaad to become the latest WIP deployment. Last state: WIP'
      )

      expect(cancelCalls).toBe(0)
    } finally {
      dateNowSpy.mockRestore()
    }
  })

  test('waits for the exact timed-out deployment to become the latest WIP deploy, then waits for its final cancelled state', async () => {
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
                    uuid: 'deployment-timeout',
                    action: 'DEPLOY',
                    state: 'QUEUED',
                    commit: 'commit-timeout'
                  }
                ]
              : activityCalls === 2
                ? [
                    {
                      uuid: 'deployment-timeout',
                      action: 'DEPLOY',
                      state: 'WIP',
                      commit: 'commit-timeout'
                    }
                  ]
                : [
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
      settleTimeoutMs: 3,
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

    expect(calls.map(call => call.args)).toEqual([
      ['activity', '--app', 'app_facade42-cafe-babe-cafe-deadf00dbaad', '--format', 'json'],
      ['activity', '--app', 'app_facade42-cafe-babe-cafe-deadf00dbaad', '--format', 'json'],
      ['cancel-deploy', '--app', 'app_facade42-cafe-babe-cafe-deadf00dbaad'],
      ['activity', '--app', 'app_facade42-cafe-babe-cafe-deadf00dbaad', '--format', 'json']
    ])
    for (const call of calls) {
      expect(call.cli).toBe('/tmp/node_modules/.bin/clever')
      expect(call.timeoutMs).toBeGreaterThan(0)
    }
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

  test('fails when the latest deployment never reaches CANCELLED during teardown', async () => {
    const controller = createCleverController({
      cleverCLI: '/tmp/node_modules/.bin/clever',
      runCommand: async (_cli, args) => {
        if (args[0] === 'activity') {
          return {
            stdout: JSON.stringify([
              { uuid: 'dep_123', action: 'DEPLOY', state: 'WIP' }
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
      'Failed to delete actions-clever-cloud-e2e-123-4 (app_facade42-cafe-babe-cafe-deadf00dbaad): Timed out while waiting for deployment dep_123 on app_facade42-cafe-babe-cafe-deadf00dbaad to reach CANCELLED. Last state: WIP'
    )
  })

  test('teardown waits for the latest deployment to reach WIP before cancelling and deleting the captured app ID', async () => {
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
                : activityCalls === 2
                  ? [{ uuid: 'dep_123', action: 'DEPLOY', state: 'WIP' }]
                  : activityCalls === 3
                    ? [{ uuid: 'dep_123', action: 'DEPLOY', state: 'CANCELLED' }]
                    : []
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

    expect(calls.map(call => call.args)).toEqual([
      ['activity', '--app', 'app_facade42-cafe-babe-cafe-deadf00dbaad', '--format', 'json'],
      ['activity', '--app', 'app_facade42-cafe-babe-cafe-deadf00dbaad', '--format', 'json'],
      ['cancel-deploy', '--app', 'app_facade42-cafe-babe-cafe-deadf00dbaad'],
      ['activity', '--app', 'app_facade42-cafe-babe-cafe-deadf00dbaad', '--format', 'json'],
      ['activity', '--app', 'app_facade42-cafe-babe-cafe-deadf00dbaad', '--format', 'json'],
      ['delete', '--app', 'app_facade42-cafe-babe-cafe-deadf00dbaad', '--yes'],
      ['applications', 'list', '--format', 'json']
    ])
    for (const call of calls) {
      expect(call.cli).toBe('/tmp/node_modules/.bin/clever')
      expect(call.timeoutMs).toBeGreaterThan(0)
    }
  })

  test('teardown skips a latest deployment that settles before cancellation and keeps cleaning up', async () => {
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
                ? [
                    { uuid: 'dep_new', action: 'DEPLOY', state: 'RUNNING' },
                    { uuid: 'dep_old', action: 'DEPLOY', state: 'WIP' }
                  ]
                : activityCalls === 2
                  ? [
                      { uuid: 'dep_new', action: 'DEPLOY', state: 'SUCCESS' },
                      { uuid: 'dep_old', action: 'DEPLOY', state: 'WIP' }
                    ]
                  : activityCalls === 3
                    ? [{ uuid: 'dep_old', action: 'DEPLOY', state: 'WIP' }]
                    : activityCalls === 4
                      ? [{ uuid: 'dep_old', action: 'DEPLOY', state: 'WIP' }]
                      : activityCalls === 5
                        ? [{ uuid: 'dep_old', action: 'DEPLOY', state: 'CANCELLED' }]
                        : []
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

    expect(calls.map(call => call.args)).toEqual([
      ['activity', '--app', 'app_facade42-cafe-babe-cafe-deadf00dbaad', '--format', 'json'],
      ['activity', '--app', 'app_facade42-cafe-babe-cafe-deadf00dbaad', '--format', 'json'],
      ['activity', '--app', 'app_facade42-cafe-babe-cafe-deadf00dbaad', '--format', 'json'],
      ['activity', '--app', 'app_facade42-cafe-babe-cafe-deadf00dbaad', '--format', 'json'],
      ['cancel-deploy', '--app', 'app_facade42-cafe-babe-cafe-deadf00dbaad'],
      ['activity', '--app', 'app_facade42-cafe-babe-cafe-deadf00dbaad', '--format', 'json'],
      ['activity', '--app', 'app_facade42-cafe-babe-cafe-deadf00dbaad', '--format', 'json'],
      ['delete', '--app', 'app_facade42-cafe-babe-cafe-deadf00dbaad', '--yes'],
      ['applications', 'list', '--format', 'json']
    ])
    for (const call of calls) {
      expect(call.cli).toBe('/tmp/node_modules/.bin/clever')
      expect(call.timeoutMs).toBeGreaterThan(0)
    }
  })

  test('teardown cancels each active deployment before deleting the captured app ID', async () => {
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
                ? [
                    { uuid: 'dep_new', action: 'DEPLOY', state: 'RUNNING' },
                    { uuid: 'dep_old', action: 'DEPLOY', state: 'WIP' }
                  ]
                : activityCalls === 2
                  ? [
                      { uuid: 'dep_new', action: 'DEPLOY', state: 'WIP' },
                      { uuid: 'dep_old', action: 'DEPLOY', state: 'WIP' }
                    ]
                  : activityCalls === 3
                    ? [
                        { uuid: 'dep_new', action: 'DEPLOY', state: 'CANCELLED' },
                        { uuid: 'dep_old', action: 'DEPLOY', state: 'WIP' }
                      ]
                    : activityCalls === 4
                      ? [{ uuid: 'dep_old', action: 'DEPLOY', state: 'WIP' }]
                      : activityCalls === 5
                        ? [{ uuid: 'dep_old', action: 'DEPLOY', state: 'WIP' }]
                        : activityCalls === 6
                          ? [{ uuid: 'dep_old', action: 'DEPLOY', state: 'CANCELLED' }]
                          : []
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

    expect(calls.map(call => call.args)).toEqual([
      ['activity', '--app', 'app_facade42-cafe-babe-cafe-deadf00dbaad', '--format', 'json'],
      ['activity', '--app', 'app_facade42-cafe-babe-cafe-deadf00dbaad', '--format', 'json'],
      ['cancel-deploy', '--app', 'app_facade42-cafe-babe-cafe-deadf00dbaad'],
      ['activity', '--app', 'app_facade42-cafe-babe-cafe-deadf00dbaad', '--format', 'json'],
      ['activity', '--app', 'app_facade42-cafe-babe-cafe-deadf00dbaad', '--format', 'json'],
      ['activity', '--app', 'app_facade42-cafe-babe-cafe-deadf00dbaad', '--format', 'json'],
      ['cancel-deploy', '--app', 'app_facade42-cafe-babe-cafe-deadf00dbaad'],
      ['activity', '--app', 'app_facade42-cafe-babe-cafe-deadf00dbaad', '--format', 'json'],
      ['activity', '--app', 'app_facade42-cafe-babe-cafe-deadf00dbaad', '--format', 'json'],
      ['delete', '--app', 'app_facade42-cafe-babe-cafe-deadf00dbaad', '--yes'],
      ['applications', 'list', '--format', 'json']
    ])
    for (const call of calls) {
      expect(call.cli).toBe('/tmp/node_modules/.bin/clever')
      expect(call.timeoutMs).toBeGreaterThan(0)
    }
  })
})
