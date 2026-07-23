import type { FixtureHealth } from './fixture-app'
import {
  assertMatchingHealthValue,
  HEALTH_VALUE_ENV_NAME
} from './health-value'

type Sleep = (timeoutMs: number) => Promise<void>

type DeploymentActivity = {
  action?: string
  state?: string
  uuid?: string
  commit?: string
}

type HealthResponse = {
  status: number
  json: () => Promise<unknown>
}

const DEFAULT_SETTLE_TIMEOUT_MS = 10 * 60_000
const DEFAULT_POLL_INTERVAL_MS = 5_000
const DEFAULT_HEALTH_CHECK_TIMEOUT_MS = 10_000
const SUCCESS_STATES = new Set(['SUCCESS', 'SUCCEEDED', 'DONE'])

export async function waitForHealthyDeployment({
  appId,
  healthURL,
  expectedScenario,
  expectedCommitID,
  listActivity,
  fetchHealth,
  lookupEnvironmentValue,
  expectedHealthValue,
  sleep = defaultSleep,
  settleTimeoutMs = DEFAULT_SETTLE_TIMEOUT_MS,
  pollIntervalMs = DEFAULT_POLL_INTERVAL_MS,
  healthCheckTimeoutMs = DEFAULT_HEALTH_CHECK_TIMEOUT_MS
}: {
  appId: string
  healthURL: string
  expectedScenario: string
  expectedCommitID: string
  listActivity: (appId: string) => Promise<DeploymentActivity[]>
  fetchHealth: (url: string) => Promise<HealthResponse>
  lookupEnvironmentValue?: (appId: string, name: string) => Promise<string | null>
  expectedHealthValue?: string
  sleep?: Sleep
  settleTimeoutMs?: number
  pollIntervalMs?: number
  healthCheckTimeoutMs?: number
}): Promise<FixtureHealth> {
  let elapsedMs = 0
  let lastHealthError: string | undefined

  for (;;) {
    const activity = await listActivity(appId)
    const deployment = activity.find(
      entry => entry.action === 'DEPLOY' && entry.commit === expectedCommitID
    )

    if (deployment && SUCCESS_STATES.has(deployment.state ?? '')) {
      try {
        const response = await withTimeout(
          fetchHealth(healthURL),
          healthCheckTimeoutMs,
          `Timed out while waiting for health response from ${healthURL}`
        )
        if (response.status === 200) {
          const health = parseFixtureHealth(await response.json())

          if (health.scenario !== expectedScenario) {
            lastHealthError =
              `Expected fixture scenario ${expectedScenario}, got ${health.scenario}`
          } else if (!deployment.uuid) {
            lastHealthError = 'Completed deploy activity is missing a deployment ID'
          } else if (health.CC_DEPLOYMENT_ID !== deployment.uuid) {
            lastHealthError =
              `Expected deployment ${deployment.uuid}, got ${health.CC_DEPLOYMENT_ID ?? '(missing)'}`
          } else if (health.CC_COMMIT_ID !== expectedCommitID) {
            lastHealthError =
              `Expected commit ${expectedCommitID}, got ${health.CC_COMMIT_ID ?? '(missing)'}`
          } else if (expectedHealthValue) {
            const remoteValue = lookupEnvironmentValue
              ? await withTimeout(
                  lookupEnvironmentValue(appId, HEALTH_VALUE_ENV_NAME),
                  healthCheckTimeoutMs,
                  `Timed out while waiting for ${HEALTH_VALUE_ENV_NAME} from ${appId}`
                )
              : null

            try {
              assertMatchingHealthValue({
                expectedValue: expectedHealthValue,
                publicValue: health.healthValue,
                remoteValue
              })
              return health
            } catch (error) {
              lastHealthError = error instanceof Error ? error.message : String(error)
            }
          } else {
            return health
          }
        } else {
          lastHealthError = `Health check failed with status ${response.status}`
        }
      } catch (error) {
        lastHealthError = error instanceof Error ? error.message : String(error)
      }
    }

    if (elapsedMs >= settleTimeoutMs) {
      const healthDetail = lastHealthError
        ? ` Last health error: ${lastHealthError}`
        : ''
      throw new Error(
        `Timed out while waiting for a healthy deployment for ${appId}${healthDetail}`
      )
    }

    await sleep(pollIntervalMs)
    elapsedMs += pollIntervalMs
  }
}

function parseFixtureHealth(value: unknown): FixtureHealth {
  if (!value || typeof value !== 'object') {
    throw new Error('Fixture health response must be an object')
  }

  const record = value as Record<string, unknown>
  const allowedKeys = [
    'scenario',
    'healthValue',
    'INSTANCE_ID',
    'INSTANCE_TYPE',
    'CC_DEPLOYMENT_ID',
    'CC_COMMIT_ID'
  ]

  for (const key of Object.keys(record)) {
    if (!allowedKeys.includes(key)) {
      throw new Error(`Fixture health response contains unexpected field ${key}`)
    }
  }

  if (typeof record.scenario !== 'string') {
    throw new Error('Fixture health response is missing a string scenario')
  }

  return {
    scenario: record.scenario,
    healthValue: readNullableString(record.healthValue),
    INSTANCE_ID: readNullableString(record.INSTANCE_ID),
    INSTANCE_TYPE: readNullableString(record.INSTANCE_TYPE),
    CC_DEPLOYMENT_ID: readNullableString(record.CC_DEPLOYMENT_ID),
    CC_COMMIT_ID: readNullableString(record.CC_COMMIT_ID)
  }
}

function readNullableString(value: unknown): string | null {
  if (value === null || value === undefined) {
    return null
  }

  if (typeof value !== 'string') {
    throw new Error('Fixture health response fields must be strings or null')
  }

  return value
}

async function defaultSleep(timeoutMs: number): Promise<void> {
  await new Promise(resolve => setTimeout(resolve, timeoutMs))
}

async function withTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number,
  message: string
): Promise<T> {
  let timeoutId: NodeJS.Timeout | undefined

  try {
    return await Promise.race([
      promise,
      new Promise<T>((_resolve, reject) => {
        timeoutId = setTimeout(() => reject(new Error(message)), timeoutMs)
      })
    ])
  } finally {
    if (timeoutId) {
      clearTimeout(timeoutId)
    }
  }
}
