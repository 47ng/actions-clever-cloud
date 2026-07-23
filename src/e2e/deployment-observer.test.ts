import { expect, test } from 'vitest'
import {
  confirmNoNewDeploymentActivity,
  waitForHealthyDeployment,
  waitForNewFailedDeploymentActivity,
  waitForNewSuccessfulDeploymentActivity
} from './deployment-observer'

test('waits for a completed deploy activity and matching public health state', async () => {
  let activityCalls = 0

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
          : [
              {
                action: 'DEPLOY',
                state: 'SUCCESS',
                uuid: 'deployment-123',
                commit: 'commit-123'
              }
            ]
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
      settleTimeoutMs: 2,
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
      settleTimeoutMs: 2,
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
      settleTimeoutMs: 2,
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
      settleTimeoutMs: 2,
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
      settleTimeoutMs: 2,
      pollIntervalMs: 1
    })
  ).rejects.toThrow(
    'Observed unexpected deployment activity change for app_facade42-cafe-babe-cafe-deadf00dbaad'
  )
})

test('waits for a new successful same-commit deploy activity before restart or rebuild checks', async () => {
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
          : [
              ...baselineActivity,
              {
                action: 'DEPLOY',
                state: 'SUCCESS',
                uuid: 'deployment-456',
                commit: 'commit-123'
              }
            ]
      },
      sleep: async () => {},
      settleTimeoutMs: 2,
      pollIntervalMs: 1
    })
  ).resolves.toEqual({
    action: 'DEPLOY',
    state: 'SUCCESS',
    uuid: 'deployment-456',
    commit: 'commit-123'
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
      settleTimeoutMs: 2,
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

test('failed build and startup deploys keep the prior healthy commit, deployment, and instance live', async () => {
  const baselineActivity = [
    {
      action: 'DEPLOY',
      state: 'SUCCESS',
      uuid: 'deployment-healthy',
      commit: 'commit-healthy'
    }
  ]
  let buildCalls = 0
  let startupCalls = 0

  await expect(
    waitForNewFailedDeploymentActivity({
      appId: 'app_facade42-cafe-babe-cafe-deadf00dbaad',
      expectedCommitID: 'commit-build-failure',
      previousActivity: baselineActivity,
      listActivity: async () => {
        buildCalls += 1
        return buildCalls === 1
          ? [
              ...baselineActivity,
              {
                action: 'DEPLOY',
                state: 'WIP',
                uuid: 'deployment-build-failure',
                commit: 'commit-build-failure'
              }
            ]
          : [
              ...baselineActivity,
              {
                action: 'DEPLOY',
                state: 'FAIL',
                uuid: 'deployment-build-failure',
                commit: 'commit-build-failure'
              }
            ]
      },
      sleep: async () => {},
      settleTimeoutMs: 2,
      pollIntervalMs: 1
    })
  ).resolves.toEqual({
    action: 'DEPLOY',
    state: 'FAIL',
    uuid: 'deployment-build-failure',
    commit: 'commit-build-failure'
  })

  await expect(
    waitForHealthyDeployment({
      appId: 'app_facade42-cafe-babe-cafe-deadf00dbaad',
      healthURL: 'https://fixture.example.com/health',
      expectedScenario: 'healthy',
      expectedCommitID: 'commit-healthy',
      expectedDeploymentID: 'deployment-healthy',
      listActivity: async () => [
        ...baselineActivity,
        {
          action: 'DEPLOY',
          state: 'FAIL',
          uuid: 'deployment-build-failure',
          commit: 'commit-build-failure'
        }
      ],
      fetchHealth: async () => ({
        status: 200,
        json: async () => ({
          scenario: 'healthy',
          healthValue: null,
          INSTANCE_ID: 'instance-healthy',
          INSTANCE_TYPE: 'production',
          CC_DEPLOYMENT_ID: 'deployment-healthy',
          CC_COMMIT_ID: 'commit-healthy'
        })
      }),
      sleep: async () => {},
      settleTimeoutMs: 2,
      pollIntervalMs: 1
    })
  ).resolves.toEqual({
    scenario: 'healthy',
    healthValue: null,
    INSTANCE_ID: 'instance-healthy',
    INSTANCE_TYPE: 'production',
    CC_DEPLOYMENT_ID: 'deployment-healthy',
    CC_COMMIT_ID: 'commit-healthy'
  })

  await expect(
    waitForNewFailedDeploymentActivity({
      appId: 'app_facade42-cafe-babe-cafe-deadf00dbaad',
      expectedCommitID: 'commit-startup-failure',
      previousActivity: [
        ...baselineActivity,
        {
          action: 'DEPLOY',
          state: 'FAIL',
          uuid: 'deployment-build-failure',
          commit: 'commit-build-failure'
        }
      ],
      listActivity: async () => {
        startupCalls += 1
        return startupCalls === 1
          ? [
              ...baselineActivity,
              {
                action: 'DEPLOY',
                state: 'FAIL',
                uuid: 'deployment-build-failure',
                commit: 'commit-build-failure'
              },
              {
                action: 'DEPLOY',
                state: 'WIP',
                uuid: 'deployment-startup-failure',
                commit: 'commit-startup-failure'
              }
            ]
          : [
              ...baselineActivity,
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
              }
            ]
      },
      sleep: async () => {},
      settleTimeoutMs: 2,
      pollIntervalMs: 1
    })
  ).resolves.toEqual({
    action: 'DEPLOY',
    state: 'FAIL',
    uuid: 'deployment-startup-failure',
    commit: 'commit-startup-failure'
  })

  await expect(
    waitForHealthyDeployment({
      appId: 'app_facade42-cafe-babe-cafe-deadf00dbaad',
      healthURL: 'https://fixture.example.com/health',
      expectedScenario: 'healthy',
      expectedCommitID: 'commit-healthy',
      expectedDeploymentID: 'deployment-healthy',
      listActivity: async () => [
        ...baselineActivity,
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
        }
      ],
      fetchHealth: async () => ({
        status: 200,
        json: async () => ({
          scenario: 'healthy',
          healthValue: null,
          INSTANCE_ID: 'instance-healthy',
          INSTANCE_TYPE: 'production',
          CC_DEPLOYMENT_ID: 'deployment-healthy',
          CC_COMMIT_ID: 'commit-healthy'
        })
      }),
      sleep: async () => {},
      settleTimeoutMs: 2,
      pollIntervalMs: 1
    })
  ).resolves.toEqual({
    scenario: 'healthy',
    healthValue: null,
    INSTANCE_ID: 'instance-healthy',
    INSTANCE_TYPE: 'production',
    CC_DEPLOYMENT_ID: 'deployment-healthy',
    CC_COMMIT_ID: 'commit-healthy'
  })
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
      settleTimeoutMs: 2,
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
      settleTimeoutMs: 2,
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
  ).rejects.toThrow(
    'Timed out while waiting for a healthy deployment for app_facade42-cafe-babe-cafe-deadf00dbaad'
  )
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
  ).rejects.toThrow(
    'Timed out while waiting for a healthy deployment for app_facade42-cafe-babe-cafe-deadf00dbaad'
  )
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
        throw new Error('health should not be fetched before a completed deploy')
      },
      sleep: async () => {},
      settleTimeoutMs: 2,
      pollIntervalMs: 1
    })
  ).rejects.toThrow(
    'Timed out while waiting for a healthy deployment for app_facade42-cafe-babe-cafe-deadf00dbaad'
  )
})
