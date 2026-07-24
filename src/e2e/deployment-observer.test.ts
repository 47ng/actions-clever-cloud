import { expect, test, vi } from 'vitest'
import {
  cancelTimedOutDeploymentPreservesLiveApp,
  confirmNoNewDeploymentActivity,
  confirmRejectedDeploymentPreservesLiveApp,
  waitForHealthyDeployment,
  waitForNewFailedDeploymentActivity,
  waitForNewHealthyDeployment,
  waitForNewSuccessfulDeploymentActivity
} from './deployment-observer.ts'

test('accepts clever-tools OK deploy activity JSON before checking public health', async () => {
  let activityCalls = 0
  const successfulActivity = JSON.parse(`[
    {
      "uuid": "deployment-123",
      "date": "2025-02-19T08:13:55+00:00",
      "state": "OK",
      "action": "DEPLOY",
      "commit": "commit-123",
      "cause": "manual"
    }
  ]`) as Array<{
    uuid: string
    date: string
    state: string
    action: string
    commit: string
    cause: string
  }>

  await expect(
    waitForHealthyDeployment({
      appId: 'app_facade42-cafe-babe-cafe-deadf00dbaad',
      healthURL: 'https://fixture.example.com/health',
      expectedScenario: 'healthy',
      expectedCommitID: 'commit-123',
      listActivity: async () => {
        activityCalls += 1
        return activityCalls === 1
          ? [{ action: 'DEPLOY', state: 'WIP', commit: 'commit-123' }]
          : successfulActivity
      },
      fetchHealth: async url => {
        expect(url).toBe('https://fixture.example.com/health')
        return {
          status: 200,
          json: async () => ({
            scenario: 'healthy',
            healthValue: null,
            INSTANCE_ID: 'instance-123',
            INSTANCE_TYPE: 'production',
            CC_DEPLOYMENT_ID: 'deployment-123',
            CC_COMMIT_ID: 'commit-123'
          })
        }
      },
      sleep: async () => {},
      settleTimeoutMs: 10_000,
      pollIntervalMs: 1
    })
  ).resolves.toEqual({
    scenario: 'healthy',
    healthValue: null,
    INSTANCE_ID: 'instance-123',
    INSTANCE_TYPE: 'production',
    CC_DEPLOYMENT_ID: 'deployment-123',
    CC_COMMIT_ID: 'commit-123'
  })
})

test('waits for the generated health value to match in public health and remote env', async () => {
  await expect(
    waitForHealthyDeployment({
      appId: 'app_facade42-cafe-babe-cafe-deadf00dbaad',
      healthURL: 'https://fixture.example.com/health',
      expectedScenario: 'healthy',
      expectedCommitID: 'commit-123',
      expectedHealthValue: 'ABEiM0RVZneImaq7zN3u/w==',
      listActivity: async () => [
        {
          action: 'DEPLOY',
          state: 'SUCCESS',
          uuid: 'deployment-123',
          commit: 'commit-123'
        }
      ],
      lookupEnvironmentValue: async (appId, name) => {
        expect(appId).toBe('app_facade42-cafe-babe-cafe-deadf00dbaad')
        expect(name).toBe('E2E_HEALTH_VALUE')
        return 'ABEiM0RVZneImaq7zN3u/w=='
      },
      fetchHealth: async () => ({
        status: 200,
        json: async () => ({
          scenario: 'healthy',
          healthValue: 'ABEiM0RVZneImaq7zN3u/w==',
          INSTANCE_ID: 'instance-123',
          INSTANCE_TYPE: 'production',
          CC_DEPLOYMENT_ID: 'deployment-123',
          CC_COMMIT_ID: 'commit-123'
        })
      }),
      sleep: async () => {},
      settleTimeoutMs: 10_000,
      pollIntervalMs: 1
    })
  ).resolves.toEqual({
    scenario: 'healthy',
    healthValue: 'ABEiM0RVZneImaq7zN3u/w==',
    INSTANCE_ID: 'instance-123',
    INSTANCE_TYPE: 'production',
    CC_DEPLOYMENT_ID: 'deployment-123',
    CC_COMMIT_ID: 'commit-123'
  })
})

test('uses the deploy activity for the expected commit instead of the first listed deploy', async () => {
  await expect(
    waitForHealthyDeployment({
      appId: 'app_facade42-cafe-babe-cafe-deadf00dbaad',
      healthURL: 'https://fixture.example.com/health',
      expectedScenario: 'healthy',
      expectedCommitID: 'commit-123',
      listActivity: async () => [
        {
          action: 'DEPLOY',
          state: 'SUCCESS',
          uuid: 'deployment-old',
          commit: 'commit-old'
        },
        {
          action: 'DEPLOY',
          state: 'SUCCESS',
          uuid: 'deployment-123',
          commit: 'commit-123'
        }
      ],
      fetchHealth: async () => ({
        status: 200,
        json: async () => ({
          scenario: 'healthy',
          healthValue: null,
          INSTANCE_ID: 'instance-123',
          INSTANCE_TYPE: 'production',
          CC_DEPLOYMENT_ID: 'deployment-123',
          CC_COMMIT_ID: 'commit-123'
        })
      }),
      sleep: async () => {},
      settleTimeoutMs: 10_000,
      pollIntervalMs: 1
    })
  ).resolves.toEqual({
    scenario: 'healthy',
    healthValue: null,
    INSTANCE_ID: 'instance-123',
    INSTANCE_TYPE: 'production',
    CC_DEPLOYMENT_ID: 'deployment-123',
    CC_COMMIT_ID: 'commit-123'
  })
})

test('can wait for an exact deployment ID when the same commit appears more than once', async () => {
  await expect(
    waitForHealthyDeployment({
      appId: 'app_facade42-cafe-babe-cafe-deadf00dbaad',
      healthURL: 'https://fixture.example.com/health',
      expectedScenario: 'healthy',
      expectedCommitID: 'commit-123',
      expectedDeploymentID: 'deployment-new',
      listActivity: async () => [
        {
          action: 'DEPLOY',
          state: 'SUCCESS',
          uuid: 'deployment-old',
          commit: 'commit-123'
        },
        {
          action: 'DEPLOY',
          state: 'SUCCESS',
          uuid: 'deployment-new',
          commit: 'commit-123'
        }
      ],
      fetchHealth: async () => ({
        status: 200,
        json: async () => ({
          scenario: 'healthy',
          healthValue: null,
          INSTANCE_ID: 'instance-456',
          INSTANCE_TYPE: 'production',
          CC_DEPLOYMENT_ID: 'deployment-new',
          CC_COMMIT_ID: 'commit-123'
        })
      }),
      sleep: async () => {},
      settleTimeoutMs: 10_000,
      pollIntervalMs: 1
    })
  ).resolves.toEqual({
    scenario: 'healthy',
    healthValue: null,
    INSTANCE_ID: 'instance-456',
    INSTANCE_TYPE: 'production',
    CC_DEPLOYMENT_ID: 'deployment-new',
    CC_COMMIT_ID: 'commit-123'
  })
})

test('confirms that same-commit error and ignore leave activity unchanged for a bounded observation window', async () => {
  const baselineActivity = [
    {
      action: 'DEPLOY',
      state: 'SUCCESS',
      uuid: 'deployment-123',
      commit: 'commit-123'
    }
  ]

  await expect(
    confirmNoNewDeploymentActivity({
      appId: 'app_facade42-cafe-babe-cafe-deadf00dbaad',
      previousActivity: baselineActivity,
      listActivity: async () => baselineActivity,
      sleep: async () => {},
      settleTimeoutMs: 2,
      pollIntervalMs: 1
    })
  ).resolves.toEqual(baselineActivity)
})

test('fails same-commit error and ignore checks when a new deploy activity appears', async () => {
  const baselineActivity = [
    {
      action: 'DEPLOY',
      state: 'SUCCESS',
      uuid: 'deployment-123',
      commit: 'commit-123'
    }
  ]
  let activityCalls = 0

  await expect(
    confirmNoNewDeploymentActivity({
      appId: 'app_facade42-cafe-babe-cafe-deadf00dbaad',
      previousActivity: baselineActivity,
      listActivity: async () => {
        activityCalls += 1
        return activityCalls === 1
          ? baselineActivity
          : [
              ...baselineActivity,
              {
                action: 'DEPLOY',
                state: 'WIP',
                uuid: 'deployment-456',
                commit: 'commit-123'
              }
            ]
      },
      sleep: async () => {},
      settleTimeoutMs: 10_000,
      pollIntervalMs: 1
    })
  ).rejects.toThrow(
    'Observed unexpected deployment activity change for app_facade42-cafe-babe-cafe-deadf00dbaad'
  )
})

test('confirms that a rejected divergent deploy leaves the prior healthy commit publicly visible', async () => {
  const baselineActivity = [
    {
      action: 'DEPLOY',
      state: 'SUCCESS',
      uuid: 'deployment-recovery',
      commit: 'commit-recovery'
    }
  ]

  await expect(
    confirmRejectedDeploymentPreservesLiveApp({
      appId: 'app_facade42-cafe-babe-cafe-deadf00dbaad',
      healthURL: 'https://fixture.example.com/health',
      expectedScenario: 'healthy',
      previousActivity: baselineActivity,
      previousCommitID: 'commit-recovery',
      previousDeploymentID: 'deployment-recovery',
      listActivity: async () => baselineActivity,
      fetchHealth: async () => ({
        status: 200,
        json: async () => ({
          scenario: 'healthy',
          healthValue: null,
          INSTANCE_ID: 'instance-recovery',
          INSTANCE_TYPE: 'production',
          CC_DEPLOYMENT_ID: 'deployment-recovery',
          CC_COMMIT_ID: 'commit-recovery'
        })
      }),
      sleep: async () => {},
      noNewActivityTimeoutMs: 2,
      settleTimeoutMs: 10_000,
      pollIntervalMs: 1
    })
  ).resolves.toEqual({
    scenario: 'healthy',
    healthValue: null,
    INSTANCE_ID: 'instance-recovery',
    INSTANCE_TYPE: 'production',
    CC_DEPLOYMENT_ID: 'deployment-recovery',
    CC_COMMIT_ID: 'commit-recovery'
  })
})

test('uses a short no-new-activity window without shrinking later health checks', async () => {
  const baselineActivity = [
    {
      action: 'DEPLOY',
      state: 'SUCCESS',
      uuid: 'deployment-recovery',
      commit: 'commit-recovery'
    }
  ]
  let now = 0
  let healthCalls = 0
  const dateNowSpy = vi.spyOn(Date, 'now').mockImplementation(() => now)

  try {
    await expect(
      confirmRejectedDeploymentPreservesLiveApp({
        appId: 'app_facade42-cafe-babe-cafe-deadf00dbaad',
        healthURL: 'https://fixture.example.com/health',
        expectedScenario: 'healthy',
        previousActivity: baselineActivity,
        previousCommitID: 'commit-recovery',
        previousDeploymentID: 'deployment-recovery',
        listActivity: async () => baselineActivity,
        fetchHealth: async () => {
          healthCalls += 1

          return healthCalls < 4
            ? {
                status: 503,
                json: async () => ({})
              }
            : {
                status: 200,
                json: async () => ({
                  scenario: 'healthy',
                  healthValue: null,
                  INSTANCE_ID: 'instance-recovery',
                  INSTANCE_TYPE: 'production',
                  CC_DEPLOYMENT_ID: 'deployment-recovery',
                  CC_COMMIT_ID: 'commit-recovery'
                })
              }
        },
        sleep: async timeoutMs => {
          now += timeoutMs
        },
        noNewActivityTimeoutMs: 2,
        settleTimeoutMs: 4,
        pollIntervalMs: 1
      })
    ).resolves.toEqual({
      scenario: 'healthy',
      healthValue: null,
      INSTANCE_ID: 'instance-recovery',
      INSTANCE_TYPE: 'production',
      CC_DEPLOYMENT_ID: 'deployment-recovery',
      CC_COMMIT_ID: 'commit-recovery'
    })

    expect(healthCalls).toBe(4)
    expect(now).toBe(5)
  } finally {
    dateNowSpy.mockRestore()
  }
})

test('accepts a new clever-tools OK deploy activity before restart or rebuild checks', async () => {
  const baselineActivity = JSON.parse(`[
    {
      "uuid": "deployment-123",
      "date": "2025-02-19T08:00:00+00:00",
      "state": "OK",
      "action": "DEPLOY",
      "commit": "commit-123",
      "cause": "git push"
    }
  ]`) as Array<{
    uuid: string
    date: string
    state: string
    action: string
    commit: string
    cause: string
  }>
  const nextSuccessfulActivity = JSON.parse(`[
    {
      "uuid": "deployment-123",
      "date": "2025-02-19T08:00:00+00:00",
      "state": "OK",
      "action": "DEPLOY",
      "commit": "commit-123",
      "cause": "git push"
    },
    {
      "uuid": "deployment-456",
      "date": "2025-02-19T08:13:55+00:00",
      "state": "OK",
      "action": "DEPLOY",
      "commit": "commit-123",
      "cause": "restart"
    }
  ]`) as Array<{
    uuid: string
    date: string
    state: string
    action: string
    commit: string
    cause: string
  }>
  let activityCalls = 0

  await expect(
    waitForNewSuccessfulDeploymentActivity({
      appId: 'app_facade42-cafe-babe-cafe-deadf00dbaad',
      expectedCommitID: 'commit-123',
      previousActivity: baselineActivity,
      listActivity: async () => {
        activityCalls += 1
        return activityCalls === 1
          ? [
              ...baselineActivity,
              {
                action: 'DEPLOY',
                state: 'WIP',
                uuid: 'deployment-456',
                commit: 'commit-123'
              }
            ]
          : nextSuccessfulActivity
      },
      sleep: async () => {},
      settleTimeoutMs: 10_000,
      pollIntervalMs: 1
    })
  ).resolves.toEqual({
    uuid: 'deployment-456',
    date: '2025-02-19T08:13:55+00:00',
    state: 'OK',
    action: 'DEPLOY',
    commit: 'commit-123',
    cause: 'restart'
  })
})

test('waits for a forced divergent deploy to replace the live app with the new commit', async () => {
  const baselineActivity = [
    {
      action: 'DEPLOY',
      state: 'SUCCESS',
      uuid: 'deployment-recovery',
      commit: 'commit-recovery'
    }
  ]
  let activityCalls = 0

  await expect(
    waitForNewHealthyDeployment({
      appId: 'app_facade42-cafe-babe-cafe-deadf00dbaad',
      healthURL: 'https://fixture.example.com/health',
      expectedScenario: 'healthy',
      expectedCommitID: 'commit-divergent',
      previousActivity: baselineActivity,
      listActivity: async () => {
        activityCalls += 1
        return activityCalls === 1
          ? [
              ...baselineActivity,
              {
                action: 'DEPLOY',
                state: 'WIP',
                uuid: 'deployment-divergent',
                commit: 'commit-divergent'
              }
            ]
          : [
              ...baselineActivity,
              {
                action: 'DEPLOY',
                state: 'SUCCESS',
                uuid: 'deployment-divergent',
                commit: 'commit-divergent'
              }
            ]
      },
      fetchHealth: async () => ({
        status: 200,
        json: async () => ({
          scenario: 'healthy',
          healthValue: null,
          INSTANCE_ID: 'instance-divergent',
          INSTANCE_TYPE: 'production',
          CC_DEPLOYMENT_ID: 'deployment-divergent',
          CC_COMMIT_ID: 'commit-divergent'
        })
      }),
      sleep: async () => {},
      settleTimeoutMs: 10_000,
      pollIntervalMs: 1
    })
  ).resolves.toEqual({
    deployment: {
      action: 'DEPLOY',
      state: 'SUCCESS',
      uuid: 'deployment-divergent',
      commit: 'commit-divergent'
    },
    health: {
      scenario: 'healthy',
      healthValue: null,
      INSTANCE_ID: 'instance-divergent',
      INSTANCE_TYPE: 'production',
      CC_DEPLOYMENT_ID: 'deployment-divergent',
      CC_COMMIT_ID: 'commit-divergent'
    }
  })
})

test('waits for a new failed deploy activity for the expected commit before failed-deploy checks', async () => {
  const baselineActivity = [
    {
      action: 'DEPLOY',
      state: 'SUCCESS',
      uuid: 'deployment-123',
      commit: 'commit-healthy'
    }
  ]
  let activityCalls = 0

  await expect(
    waitForNewFailedDeploymentActivity({
      appId: 'app_facade42-cafe-babe-cafe-deadf00dbaad',
      expectedCommitID: 'commit-failed',
      previousActivity: baselineActivity,
      listActivity: async () => {
        activityCalls += 1
        return activityCalls === 1
          ? [
              ...baselineActivity,
              {
                action: 'DEPLOY',
                state: 'WIP',
                uuid: 'deployment-failed',
                commit: 'commit-failed'
              }
            ]
          : [
              ...baselineActivity,
              {
                action: 'DEPLOY',
                state: 'FAIL',
                uuid: 'deployment-failed',
                commit: 'commit-failed'
              }
            ]
      },
      sleep: async () => {},
      settleTimeoutMs: 10_000,
      pollIntervalMs: 1
    })
  ).resolves.toEqual({
    action: 'DEPLOY',
    state: 'FAIL',
    uuid: 'deployment-failed',
    commit: 'commit-failed'
  })
})

test('ignores cancelled, unknown, wrong-commit, and missing-id activity while waiting for a failed deploy', async () => {
  const baselineActivity = [
    {
      action: 'DEPLOY',
      state: 'SUCCESS',
      uuid: 'deployment-123',
      commit: 'commit-healthy'
    }
  ]
  let activityCalls = 0

  await expect(
    waitForNewFailedDeploymentActivity({
      appId: 'app_facade42-cafe-babe-cafe-deadf00dbaad',
      expectedCommitID: 'commit-failed',
      previousActivity: baselineActivity,
      listActivity: async () => {
        activityCalls += 1

        if (activityCalls === 1) {
          return [
            ...baselineActivity,
            {
              action: 'DEPLOY',
              state: 'CANCELLED',
              uuid: 'deployment-cancelled',
              commit: 'commit-failed'
            }
          ]
        }

        if (activityCalls === 2) {
          return [
            ...baselineActivity,
            {
              action: 'DEPLOY',
              state: 'UNKNOWN',
              uuid: 'deployment-unknown',
              commit: 'commit-failed'
            }
          ]
        }

        if (activityCalls === 3) {
          return [
            ...baselineActivity,
            {
              action: 'DEPLOY',
              state: 'FAIL',
              uuid: 'deployment-wrong-commit',
              commit: 'commit-other'
            }
          ]
        }

        return [
          ...baselineActivity,
          {
            action: 'DEPLOY',
            state: 'FAIL',
            commit: 'commit-failed'
          }
        ]
      },
      sleep: async () => {},
      settleTimeoutMs: 3,
      pollIntervalMs: 1
    })
  ).rejects.toThrow(
    'Timed out while waiting for a new failed deployment activity for app_facade42-cafe-babe-cafe-deadf00dbaad'
  )
})

test('a later recovery deployment becomes publicly observable after failed deploys', async () => {
  let activityCalls = 0

  await expect(
    waitForHealthyDeployment({
      appId: 'app_facade42-cafe-babe-cafe-deadf00dbaad',
      healthURL: 'https://fixture.example.com/health',
      expectedScenario: 'healthy',
      expectedCommitID: 'commit-recovery',
      listActivity: async () => {
        activityCalls += 1
        return activityCalls === 1
          ? [
              {
                action: 'DEPLOY',
                state: 'SUCCESS',
                uuid: 'deployment-healthy',
                commit: 'commit-healthy'
              },
              {
                action: 'DEPLOY',
                state: 'FAIL',
                uuid: 'deployment-build-failure',
                commit: 'commit-build-failure'
              },
              {
                action: 'DEPLOY',
                state: 'FAIL',
                uuid: 'deployment-startup-failure',
                commit: 'commit-startup-failure'
              },
              {
                action: 'DEPLOY',
                state: 'WIP',
                uuid: 'deployment-recovery',
                commit: 'commit-recovery'
              }
            ]
          : [
              {
                action: 'DEPLOY',
                state: 'SUCCESS',
                uuid: 'deployment-healthy',
                commit: 'commit-healthy'
              },
              {
                action: 'DEPLOY',
                state: 'FAIL',
                uuid: 'deployment-build-failure',
                commit: 'commit-build-failure'
              },
              {
                action: 'DEPLOY',
                state: 'FAIL',
                uuid: 'deployment-startup-failure',
                commit: 'commit-startup-failure'
              },
              {
                action: 'DEPLOY',
                state: 'SUCCESS',
                uuid: 'deployment-recovery',
                commit: 'commit-recovery'
              }
            ]
      },
      fetchHealth: async () => ({
        status: 200,
        json: async () => ({
          scenario: 'healthy',
          healthValue: null,
          INSTANCE_ID: 'instance-recovery',
          INSTANCE_TYPE: 'production',
          CC_DEPLOYMENT_ID: 'deployment-recovery',
          CC_COMMIT_ID: 'commit-recovery'
        })
      }),
      sleep: async () => {},
      settleTimeoutMs: 10_000,
      pollIntervalMs: 1
    })
  ).resolves.toEqual({
    scenario: 'healthy',
    healthValue: null,
    INSTANCE_ID: 'instance-recovery',
    INSTANCE_TYPE: 'production',
    CC_DEPLOYMENT_ID: 'deployment-recovery',
    CC_COMMIT_ID: 'commit-recovery'
  })
})

test('keeps polling until public health matches after deploy success', async () => {
  let healthCalls = 0

  await expect(
    waitForHealthyDeployment({
      appId: 'app_facade42-cafe-babe-cafe-deadf00dbaad',
      healthURL: 'https://fixture.example.com/health',
      expectedScenario: 'healthy',
      expectedCommitID: 'commit-123',
      listActivity: async () => [
        {
          action: 'DEPLOY',
          state: 'SUCCESS',
          uuid: 'deployment-123',
          commit: 'commit-123'
        }
      ],
      fetchHealth: async () => {
        healthCalls += 1
        return healthCalls === 1
          ? {
              status: 503,
              json: async () => ({})
            }
          : {
              status: 200,
              json: async () => ({
                scenario: 'healthy',
                healthValue: null,
                INSTANCE_ID: 'instance-123',
                INSTANCE_TYPE: 'production',
                CC_DEPLOYMENT_ID: 'deployment-123',
                CC_COMMIT_ID: 'commit-123'
              })
            }
      },
      sleep: async () => {},
      settleTimeoutMs: 10_000,
      pollIntervalMs: 1
    })
  ).resolves.toEqual({
    scenario: 'healthy',
    healthValue: null,
    INSTANCE_ID: 'instance-123',
    INSTANCE_TYPE: 'production',
    CC_DEPLOYMENT_ID: 'deployment-123',
    CC_COMMIT_ID: 'commit-123'
  })
})

test('times out when public health stays on another deployment after deploy success', async () => {
  await expect(
    waitForHealthyDeployment({
      appId: 'app_facade42-cafe-babe-cafe-deadf00dbaad',
      healthURL: 'https://fixture.example.com/health',
      expectedScenario: 'healthy',
      expectedCommitID: 'commit-123',
      listActivity: async () => [
        {
          action: 'DEPLOY',
          state: 'SUCCESS',
          uuid: 'deployment-123',
          commit: 'commit-123'
        }
      ],
      fetchHealth: async () => ({
        status: 200,
        json: async () => ({
          scenario: 'healthy',
          healthValue: null,
          INSTANCE_ID: 'instance-123',
          INSTANCE_TYPE: 'production',
          CC_DEPLOYMENT_ID: 'deployment-old',
          CC_COMMIT_ID: 'commit-old'
        })
      }),
      sleep: async () => {},
      settleTimeoutMs: 2,
      pollIntervalMs: 1,
      healthCheckTimeoutMs: 1
    })
  ).rejects.toThrow('Timed out while waiting for a healthy deployment')
})

test('times out when a health request stalls after deploy success', async () => {
  await expect(
    waitForHealthyDeployment({
      appId: 'app_facade42-cafe-babe-cafe-deadf00dbaad',
      healthURL: 'https://fixture.example.com/health',
      expectedScenario: 'healthy',
      expectedCommitID: 'commit-123',
      listActivity: async () => [
        {
          action: 'DEPLOY',
          state: 'SUCCESS',
          uuid: 'deployment-123',
          commit: 'commit-123'
        }
      ],
      fetchHealth: async () => new Promise(() => {}),
      sleep: async () => {},
      settleTimeoutMs: 2,
      pollIntervalMs: 1,
      healthCheckTimeoutMs: 1
    })
  ).rejects.toThrow('Timed out while waiting for a healthy deployment')
})

test('waits for the timed-out deployment matched by commit to reach WIP, then keeps the prior healthy forced commit live', async () => {
  const baselineActivity = [
    {
      action: 'DEPLOY',
      state: 'SUCCESS',
      uuid: 'deployment-forced',
      commit: 'commit-forced'
    }
  ]
  let activityCalls = 0

  await expect(
    cancelTimedOutDeploymentPreservesLiveApp({
      appId: 'app_facade42-cafe-babe-cafe-deadf00dbaad',
      healthURL: 'https://fixture.example.com/health',
      expectedCancelledCommitID: 'commit-timeout',
      expectedScenario: 'healthy',
      previousCommitID: 'commit-forced',
      previousDeploymentID: 'deployment-forced',
      listActivity: async () => {
        activityCalls += 1
        return activityCalls === 1
          ? [
              {
                action: 'DEPLOY',
                state: 'SUCCESS',
                uuid: 'deployment-old',
                commit: 'commit-old'
              },
              ...baselineActivity,
              {
                action: 'DEPLOY',
                state: 'QUEUED',
                uuid: 'deployment-timeout',
                commit: 'commit-timeout'
              }
            ]
          : activityCalls === 2
            ? [
                {
                  action: 'DEPLOY',
                  state: 'SUCCESS',
                  uuid: 'deployment-old',
                  commit: 'commit-old'
                },
                ...baselineActivity,
                {
                  action: 'DEPLOY',
                  state: 'WIP',
                  uuid: 'deployment-timeout',
                  commit: 'commit-timeout'
                }
              ]
            : baselineActivity
      },
      cancelDeployment: async (appId, deploymentId) => {
        expect(appId).toBe('app_facade42-cafe-babe-cafe-deadf00dbaad')
        expect(deploymentId).toBe('deployment-timeout')
        return {
          action: 'DEPLOY',
          state: 'CANCELLED',
          uuid: 'deployment-timeout',
          commit: 'commit-timeout'
        }
      },
      fetchHealth: async () => ({
        status: 200,
        json: async () => ({
          scenario: 'healthy',
          healthValue: null,
          INSTANCE_ID: 'instance-forced',
          INSTANCE_TYPE: 'production',
          CC_DEPLOYMENT_ID: 'deployment-forced',
          CC_COMMIT_ID: 'commit-forced'
        })
      }),
      sleep: async () => {},
      settleTimeoutMs: 10_000,
      pollIntervalMs: 1
    })
  ).resolves.toEqual({
    outcome: 'cancelled',
    deployment: {
      action: 'DEPLOY',
      state: 'CANCELLED',
      uuid: 'deployment-timeout',
      commit: 'commit-timeout'
    },
    health: {
      scenario: 'healthy',
      healthValue: null,
      INSTANCE_ID: 'instance-forced',
      INSTANCE_TYPE: 'production',
      CC_DEPLOYMENT_ID: 'deployment-forced',
      CC_COMMIT_ID: 'commit-forced'
    }
  })
})

test('accepts a timed-out deployment that completed before cancellation', async () => {
  const cancelDeployment = vi.fn()

  await expect(
    cancelTimedOutDeploymentPreservesLiveApp({
      appId: 'app_facade42-cafe-babe-cafe-deadf00dbaad',
      healthURL: 'https://fixture.example.com/health',
      expectedCancelledCommitID: 'commit-timeout',
      expectedScenario: 'healthy',
      previousCommitID: 'commit-forced',
      previousDeploymentID: 'deployment-forced',
      listActivity: async () => [
        {
          action: 'DEPLOY',
          state: 'OK',
          uuid: 'deployment-timeout',
          commit: 'commit-timeout'
        },
        {
          action: 'DEPLOY',
          state: 'SUCCESS',
          uuid: 'deployment-forced',
          commit: 'commit-forced'
        }
      ],
      cancelDeployment,
      fetchHealth: async () => ({
        status: 200,
        json: async () => ({
          scenario: 'healthy',
          healthValue: null,
          INSTANCE_ID: 'instance-timeout',
          INSTANCE_TYPE: 'production',
          CC_DEPLOYMENT_ID: 'deployment-timeout',
          CC_COMMIT_ID: 'commit-timeout'
        })
      }),
      sleep: async () => {},
      settleTimeoutMs: 10_000,
      pollIntervalMs: 1
    })
  ).resolves.toMatchObject({
    outcome: 'completed',
    deployment: { uuid: 'deployment-timeout', state: 'OK' },
    health: { CC_COMMIT_ID: 'commit-timeout' }
  })

  expect(cancelDeployment).not.toHaveBeenCalled()
})

test('classifies the settled state when cancellation loses the race', async () => {
  let activityCalls = 0
  const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})

  await expect(
    cancelTimedOutDeploymentPreservesLiveApp({
      appId: 'app_facade42-cafe-babe-cafe-deadf00dbaad',
      healthURL: 'https://fixture.example.com/health',
      expectedCancelledCommitID: 'commit-timeout',
      expectedScenario: 'healthy',
      previousCommitID: 'commit-forced',
      previousDeploymentID: 'deployment-forced',
      listActivity: async () => {
        activityCalls += 1
        return [
          {
            action: 'DEPLOY',
            state: activityCalls === 1 ? 'WIP' : 'OK',
            uuid: 'deployment-timeout',
            commit: 'commit-timeout'
          }
        ]
      },
      cancelDeployment: async () => {
        throw new Error(
          'Deployment deployment-timeout reached OK before it could be cancelled'
        )
      },
      fetchHealth: async () => ({
        status: 200,
        json: async () => ({
          scenario: 'healthy',
          healthValue: null,
          INSTANCE_ID: 'instance-timeout',
          INSTANCE_TYPE: 'production',
          CC_DEPLOYMENT_ID: 'deployment-timeout',
          CC_COMMIT_ID: 'commit-timeout'
        })
      }),
      sleep: async () => {},
      settleTimeoutMs: 10_000,
      pollIntervalMs: 1
    })
  ).resolves.toMatchObject({
    outcome: 'completed',
    deployment: { uuid: 'deployment-timeout', state: 'OK' }
  })

  expect(warnSpy).toHaveBeenCalledWith(
    'Cancellation did not settle the deployment: Deployment deployment-timeout reached OK before it could be cancelled'
  )
  warnSpy.mockRestore()
})

test('classifies a deployment row that vanishes behind a settled CANCEL activity as cancelled', async () => {
  let activityCalls = 0
  const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})

  await expect(
    cancelTimedOutDeploymentPreservesLiveApp({
      appId: 'app_facade42-cafe-babe-cafe-deadf00dbaad',
      healthURL: 'https://fixture.example.com/health',
      expectedCancelledCommitID: 'commit-timeout',
      expectedScenario: 'healthy',
      previousCommitID: 'commit-forced',
      previousDeploymentID: 'deployment-forced',
      listActivity: async () => {
        activityCalls += 1
        return activityCalls === 1
          ? [
              {
                action: 'DEPLOY',
                state: 'WIP',
                uuid: 'deployment-timeout',
                commit: 'commit-timeout'
              },
              {
                action: 'DEPLOY',
                state: 'SUCCESS',
                uuid: 'deployment-forced',
                commit: 'commit-forced'
              }
            ]
          : [
              {
                action: 'CANCEL',
                state: 'OK',
                uuid: 'activity-cancel'
              },
              {
                action: 'DEPLOY',
                state: 'SUCCESS',
                uuid: 'deployment-forced',
                commit: 'commit-forced'
              }
            ]
      },
      cancelDeployment: async () => {
        throw new Error('cancel-deploy exited before the row settled')
      },
      fetchHealth: async () => ({
        status: 200,
        json: async () => ({
          scenario: 'healthy',
          healthValue: null,
          INSTANCE_ID: 'instance-forced',
          INSTANCE_TYPE: 'production',
          CC_DEPLOYMENT_ID: 'deployment-forced',
          CC_COMMIT_ID: 'commit-forced'
        })
      }),
      sleep: async () => {},
      settleTimeoutMs: 10_000,
      pollIntervalMs: 1
    })
  ).resolves.toMatchObject({
    outcome: 'cancelled',
    deployment: { uuid: 'deployment-timeout', state: 'CANCELLED' },
    health: { CC_COMMIT_ID: 'commit-forced' }
  })

  warnSpy.mockRestore()
})

test('verifies the prior app stays live when the timed-out deployment settles failed', async () => {
  await expect(
    cancelTimedOutDeploymentPreservesLiveApp({
      appId: 'app_facade42-cafe-babe-cafe-deadf00dbaad',
      healthURL: 'https://fixture.example.com/health',
      expectedCancelledCommitID: 'commit-timeout',
      expectedScenario: 'healthy',
      previousCommitID: 'commit-forced',
      previousDeploymentID: 'deployment-forced',
      listActivity: async () => [
        {
          action: 'DEPLOY',
          state: 'FAILED',
          uuid: 'deployment-timeout',
          commit: 'commit-timeout'
        },
        {
          action: 'DEPLOY',
          state: 'SUCCESS',
          uuid: 'deployment-forced',
          commit: 'commit-forced'
        }
      ],
      cancelDeployment: async () => {
        throw new Error('cancel should not run for a settled deployment')
      },
      fetchHealth: async () => ({
        status: 200,
        json: async () => ({
          scenario: 'healthy',
          healthValue: null,
          INSTANCE_ID: 'instance-forced',
          INSTANCE_TYPE: 'production',
          CC_DEPLOYMENT_ID: 'deployment-forced',
          CC_COMMIT_ID: 'commit-forced'
        })
      }),
      sleep: async () => {},
      settleTimeoutMs: 10_000,
      pollIntervalMs: 1
    })
  ).resolves.toMatchObject({
    outcome: 'failed',
    health: { CC_COMMIT_ID: 'commit-forced' }
  })
})

test('uses one wall-clock deadline across timeout deployment discovery, cancellation, and health checks', async () => {
  const dateNowSpy = vi.spyOn(Date, 'now')
  const healthFetch = vi.fn(async () => ({
    status: 200,
    json: async () => ({
      scenario: 'healthy',
      healthValue: null,
      INSTANCE_ID: 'instance-forced',
      INSTANCE_TYPE: 'production',
      CC_DEPLOYMENT_ID: 'deployment-forced',
      CC_COMMIT_ID: 'commit-forced'
    })
  }))

  const nowValues = [0, 1, 2, 4, 11]
  dateNowSpy.mockImplementation(() => nowValues.shift() ?? 11)

  try {
    await expect(
      cancelTimedOutDeploymentPreservesLiveApp({
        appId: 'app_facade42-cafe-babe-cafe-deadf00dbaad',
        healthURL: 'https://fixture.example.com/health',
        expectedCancelledCommitID: 'commit-timeout',
        expectedScenario: 'healthy',
        previousCommitID: 'commit-forced',
        previousDeploymentID: 'deployment-forced',
        listActivity: async () => [
          {
            action: 'DEPLOY',
            state: 'SUCCESS',
            uuid: 'deployment-forced',
            commit: 'commit-forced'
          },
          {
            action: 'DEPLOY',
            state: 'WIP',
            uuid: 'deployment-timeout',
            commit: 'commit-timeout'
          }
        ],
        cancelDeployment: async () => ({
          action: 'DEPLOY',
          state: 'CANCELLED',
          uuid: 'deployment-timeout',
          commit: 'commit-timeout'
        }),
        fetchHealth: healthFetch,
        sleep: async () => {},
        settleTimeoutMs: 10,
        pollIntervalMs: 5
      })
    ).rejects.toThrow(
      'Timed out while waiting for a healthy deployment for app_facade42-cafe-babe-cafe-deadf00dbaad'
    )

    expect(healthFetch).not.toHaveBeenCalled()
  } finally {
    dateNowSpy.mockRestore()
  }
})

test('times out when the expected timeout commit never produces a deployment', async () => {
  await expect(
    cancelTimedOutDeploymentPreservesLiveApp({
      appId: 'app_facade42-cafe-babe-cafe-deadf00dbaad',
      healthURL: 'https://fixture.example.com/health',
      expectedCancelledCommitID: 'commit-timeout',
      expectedScenario: 'healthy',
      previousCommitID: 'commit-forced',
      previousDeploymentID: 'deployment-forced',
      listActivity: async () => [
        {
          action: 'DEPLOY',
          state: 'SUCCESS',
          uuid: 'deployment-forced',
          commit: 'commit-forced'
        },
        {
          action: 'DEPLOY',
          state: 'WIP',
          uuid: 'deployment-other',
          commit: 'commit-other'
        }
      ],
      cancelDeployment: async () => {
        throw new Error(
          'cancel should not run before the expected commit is observed'
        )
      },
      fetchHealth: async () => ({
        status: 200,
        json: async () => ({
          scenario: 'healthy',
          healthValue: null,
          INSTANCE_ID: 'instance-forced',
          INSTANCE_TYPE: 'production',
          CC_DEPLOYMENT_ID: 'deployment-forced',
          CC_COMMIT_ID: 'commit-forced'
        })
      }),
      sleep: async () => {},
      settleTimeoutMs: 2,
      pollIntervalMs: 1
    })
  ).rejects.toThrow('Timed out while waiting for a deployment of commit-timeout')
})

test('times out when a healthy deploy never reaches a completed activity', async () => {
  await expect(
    waitForHealthyDeployment({
      appId: 'app_facade42-cafe-babe-cafe-deadf00dbaad',
      healthURL: 'https://fixture.example.com/health',
      expectedScenario: 'healthy',
      expectedCommitID: 'commit-123',
      listActivity: async () => [
        { action: 'DEPLOY', state: 'WIP', commit: 'commit-123' }
      ],
      fetchHealth: async () => {
        throw new Error(
          'health should not be fetched before a completed deploy'
        )
      },
      sleep: async () => {},
      settleTimeoutMs: 2,
      pollIntervalMs: 1
    })
  ).rejects.toThrow('Timed out while waiting for a healthy deployment')
})
