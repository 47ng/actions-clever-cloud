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
const SUCCESS_STATES = new Set(['OK', 'SUCCESS', 'SUCCEEDED', 'DONE'])
const FAILED_STATES = new Set(['FAIL', 'FAILED', 'ERROR', 'FAILURE'])
const IN_PROGRESS_STATES = new Set(['WIP', 'PENDING', 'QUEUED', 'RUNNING'])
const CANCELLABLE_STATES = new Set(['WIP'])

export async function confirmNoNewDeploymentActivity({
  appId,
  previousActivity,
  listActivity,
  sleep = defaultSleep,
  settleTimeoutMs = DEFAULT_SETTLE_TIMEOUT_MS,
  pollIntervalMs = DEFAULT_POLL_INTERVAL_MS
}: {
  appId: string
  previousActivity: DeploymentActivity[]
  listActivity: (appId: string) => Promise<DeploymentActivity[]>
  sleep?: Sleep
  settleTimeoutMs?: number
  pollIntervalMs?: number
}): Promise<DeploymentActivity[]> {
  const deadlineAt = buildDeadline(settleTimeoutMs)
  const previousSnapshot = previousActivity.map(serializeActivity)

  for (;;) {
    const activity = await listActivity(appId)

    if (!hasMatchingActivitySnapshot(previousSnapshot, activity)) {
      throw new Error(`Observed unexpected deployment activity change for ${appId}`)
    }

    if (hasReachedDeadline(deadlineAt)) {
      return activity
    }

    await sleepUntilNextPoll({
      sleep,
      pollIntervalMs,
      deadlineAt
    })
  }
}

export async function confirmRejectedDeploymentPreservesLiveApp({
  appId,
  healthURL,
  expectedScenario,
  previousActivity,
  previousCommitID,
  previousDeploymentID,
  listActivity,
  fetchHealth,
  sleep = defaultSleep,
  settleTimeoutMs = DEFAULT_SETTLE_TIMEOUT_MS,
  pollIntervalMs = DEFAULT_POLL_INTERVAL_MS,
  healthCheckTimeoutMs = DEFAULT_HEALTH_CHECK_TIMEOUT_MS
}: {
  appId: string
  healthURL: string
  expectedScenario: string
  previousActivity: DeploymentActivity[]
  previousCommitID: string
  previousDeploymentID?: string
  listActivity: (appId: string) => Promise<DeploymentActivity[]>
  fetchHealth: (url: string) => Promise<HealthResponse>
  sleep?: Sleep
  settleTimeoutMs?: number
  pollIntervalMs?: number
  healthCheckTimeoutMs?: number
}): Promise<FixtureHealth> {
  await confirmNoNewDeploymentActivity({
    appId,
    previousActivity,
    listActivity,
    sleep,
    settleTimeoutMs,
    pollIntervalMs
  })

  return waitForHealthyDeployment({
    appId,
    healthURL,
    expectedScenario,
    expectedCommitID: previousCommitID,
    expectedDeploymentID: previousDeploymentID,
    listActivity,
    fetchHealth,
    sleep,
    settleTimeoutMs,
    pollIntervalMs,
    healthCheckTimeoutMs
  })
}

export async function cancelTimedOutDeploymentPreservesLiveApp({
  appId,
  healthURL,
  expectedCancelledCommitID,
  expectedScenario,
  previousCommitID,
  previousDeploymentID,
  listActivity,
  cancelDeployment,
  fetchHealth,
  sleep = defaultSleep,
  settleTimeoutMs = DEFAULT_SETTLE_TIMEOUT_MS,
  pollIntervalMs = DEFAULT_POLL_INTERVAL_MS,
  healthCheckTimeoutMs = DEFAULT_HEALTH_CHECK_TIMEOUT_MS
}: {
  appId: string
  healthURL: string
  expectedCancelledCommitID: string
  expectedScenario: string
  previousCommitID: string
  previousDeploymentID?: string
  listActivity: (appId: string, timeoutMs?: number) => Promise<DeploymentActivity[]>
  cancelDeployment: (
    appId: string,
    deploymentId: string,
    timeoutMs?: number
  ) => Promise<DeploymentActivity>
  fetchHealth: (url: string) => Promise<HealthResponse>
  sleep?: Sleep
  settleTimeoutMs?: number
  pollIntervalMs?: number
  healthCheckTimeoutMs?: number
}): Promise<{
  cancelledDeployment: DeploymentActivity
  health: FixtureHealth
}> {
  const deadlineAt = buildDeadline(settleTimeoutMs)
  const deployment = await waitForCancellableDeployment({
    appId,
    expectedCommitID: expectedCancelledCommitID,
    listActivity,
    sleep,
    settleTimeoutMs,
    pollIntervalMs,
    deadlineAt
  })

  const cancelledDeployment = await cancelDeployment(
    appId,
    deployment.uuid,
    remainingBeforeDeadline(deadlineAt)
  )

  return {
    cancelledDeployment,
    health: await waitForHealthyDeployment({
      appId,
      healthURL,
      expectedScenario,
      expectedCommitID: previousCommitID,
      expectedDeploymentID: previousDeploymentID,
      listActivity,
      fetchHealth,
      sleep,
      settleTimeoutMs: remainingBeforeDeadline(deadlineAt),
      pollIntervalMs,
      healthCheckTimeoutMs
    })
  }
}

export async function waitForNewSuccessfulDeploymentActivity({
  appId,
  expectedCommitID,
  previousActivity,
  listActivity,
  sleep = defaultSleep,
  settleTimeoutMs = DEFAULT_SETTLE_TIMEOUT_MS,
  pollIntervalMs = DEFAULT_POLL_INTERVAL_MS
}: {
  appId: string
  expectedCommitID: string
  previousActivity: DeploymentActivity[]
  listActivity: (appId: string) => Promise<DeploymentActivity[]>
  sleep?: Sleep
  settleTimeoutMs?: number
  pollIntervalMs?: number
}): Promise<DeploymentActivity> {
  const deadlineAt = buildDeadline(settleTimeoutMs)
  const previousSnapshot = new Set(previousActivity.map(serializeActivity))

  for (;;) {
    const activity = await listActivity(appId)
    const deployment = activity.find(
      entry =>
        entry.action === 'DEPLOY' &&
        entry.commit === expectedCommitID &&
        isSuccessfulDeploymentState(entry.state) &&
        !previousSnapshot.has(serializeActivity(entry))
    )

    if (deployment?.uuid) {
      return deployment
    }

    if (hasReachedDeadline(deadlineAt)) {
      throw new Error(
        `Timed out while waiting for a new successful deployment activity for ${appId}`
      )
    }

    await sleepUntilNextPoll({
      sleep,
      pollIntervalMs,
      deadlineAt
    })
  }
}

export async function waitForNewHealthyDeployment({
  appId,
  healthURL,
  expectedScenario,
  expectedCommitID,
  previousActivity,
  listActivity,
  fetchHealth,
  sleep = defaultSleep,
  settleTimeoutMs = DEFAULT_SETTLE_TIMEOUT_MS,
  pollIntervalMs = DEFAULT_POLL_INTERVAL_MS,
  healthCheckTimeoutMs = DEFAULT_HEALTH_CHECK_TIMEOUT_MS
}: {
  appId: string
  healthURL: string
  expectedScenario: string
  expectedCommitID: string
  previousActivity: DeploymentActivity[]
  listActivity: (appId: string) => Promise<DeploymentActivity[]>
  fetchHealth: (url: string) => Promise<HealthResponse>
  sleep?: Sleep
  settleTimeoutMs?: number
  pollIntervalMs?: number
  healthCheckTimeoutMs?: number
}): Promise<{ deployment: DeploymentActivity; health: FixtureHealth }> {
  const deployment = await waitForNewSuccessfulDeploymentActivity({
    appId,
    expectedCommitID,
    previousActivity,
    listActivity,
    sleep,
    settleTimeoutMs,
    pollIntervalMs
  })

  return {
    deployment,
    health: await waitForHealthyDeployment({
      appId,
      healthURL,
      expectedScenario,
      expectedCommitID,
      expectedDeploymentID: deployment.uuid,
      listActivity,
      fetchHealth,
      sleep,
      settleTimeoutMs,
      pollIntervalMs,
      healthCheckTimeoutMs
    })
  }
}

export async function waitForNewFailedDeploymentActivity({
  appId,
  expectedCommitID,
  previousActivity,
  listActivity,
  sleep = defaultSleep,
  settleTimeoutMs = DEFAULT_SETTLE_TIMEOUT_MS,
  pollIntervalMs = DEFAULT_POLL_INTERVAL_MS
}: {
  appId: string
  expectedCommitID: string
  previousActivity: DeploymentActivity[]
  listActivity: (appId: string) => Promise<DeploymentActivity[]>
  sleep?: Sleep
  settleTimeoutMs?: number
  pollIntervalMs?: number
}): Promise<DeploymentActivity> {
  const deadlineAt = buildDeadline(settleTimeoutMs)
  const previousSnapshot = new Set(previousActivity.map(serializeActivity))

  for (;;) {
    const activity = await listActivity(appId)
    const deployment = activity.find(
      entry =>
        entry.action === 'DEPLOY' &&
        entry.commit === expectedCommitID &&
        isFailedDeploymentState(entry.state) &&
        !previousSnapshot.has(serializeActivity(entry))
    )

    if (deployment?.uuid) {
      return deployment
    }

    if (hasReachedDeadline(deadlineAt)) {
      throw new Error(
        `Timed out while waiting for a new failed deployment activity for ${appId}`
      )
    }

    await sleepUntilNextPoll({
      sleep,
      pollIntervalMs,
      deadlineAt
    })
  }
}

export async function waitForHealthyDeployment({
  appId,
  healthURL,
  expectedScenario,
  expectedCommitID,
  expectedDeploymentID,
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
  expectedDeploymentID?: string
  listActivity: (appId: string, timeoutMs?: number) => Promise<DeploymentActivity[]>
  fetchHealth: (url: string) => Promise<HealthResponse>
  lookupEnvironmentValue?: (appId: string, name: string) => Promise<string | null>
  expectedHealthValue?: string
  sleep?: Sleep
  settleTimeoutMs?: number
  pollIntervalMs?: number
  healthCheckTimeoutMs?: number
}): Promise<FixtureHealth> {
  const deadlineAt = buildDeadline(settleTimeoutMs)
  let lastHealthError: string | undefined

  for (;;) {
    if (hasReachedDeadline(deadlineAt)) {
      const healthDetail = lastHealthError
        ? ` Last health error: ${lastHealthError}`
        : ''
      throw new Error(
        `Timed out while waiting for a healthy deployment for ${appId}${healthDetail}`
      )
    }

    const activity = await listActivity(
      appId,
      Math.min(DEFAULT_HEALTH_CHECK_TIMEOUT_MS, Math.max(1, remainingBeforeDeadline(deadlineAt)))
    )
    if (hasReachedDeadline(deadlineAt)) {
      const healthDetail = lastHealthError
        ? ` Last health error: ${lastHealthError}`
        : ''
      throw new Error(
        `Timed out while waiting for a healthy deployment for ${appId}${healthDetail}`
      )
    }
    const deployment = activity.find(
      entry =>
        entry.action === 'DEPLOY' &&
        entry.commit === expectedCommitID &&
        (!expectedDeploymentID || entry.uuid === expectedDeploymentID)
    )

    if (deployment && isSuccessfulDeploymentState(deployment.state)) {
      try {
        const response = await withTimeout(
          fetchHealth(healthURL),
          Math.min(healthCheckTimeoutMs, remainingBeforeDeadline(deadlineAt)),
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
                  Math.min(healthCheckTimeoutMs, remainingBeforeDeadline(deadlineAt)),
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

    if (hasReachedDeadline(deadlineAt)) {
      const healthDetail = lastHealthError
        ? ` Last health error: ${lastHealthError}`
        : ''
      throw new Error(
        `Timed out while waiting for a healthy deployment for ${appId}${healthDetail}`
      )
    }

    await sleepUntilNextPoll({
      sleep,
      pollIntervalMs,
      deadlineAt
    })
  }
}

async function waitForCancellableDeployment({
  appId,
  expectedCommitID,
  listActivity,
  sleep = defaultSleep,
  settleTimeoutMs = DEFAULT_SETTLE_TIMEOUT_MS,
  pollIntervalMs = DEFAULT_POLL_INTERVAL_MS,
  deadlineAt = buildDeadline(settleTimeoutMs)
}: {
  appId: string
  expectedCommitID: string
  listActivity: (appId: string, timeoutMs?: number) => Promise<DeploymentActivity[]>
  sleep?: Sleep
  settleTimeoutMs?: number
  pollIntervalMs?: number
  deadlineAt?: number
}): Promise<DeploymentActivity & { uuid: string }> {
  for (;;) {
    if (hasReachedDeadline(deadlineAt)) {
      throw new Error(
        `Timed out while waiting for a cancellable deployment for ${expectedCommitID} on ${appId}`
      )
    }

    const deployment = (
      await listActivity(
        appId,
        Math.min(DEFAULT_HEALTH_CHECK_TIMEOUT_MS, Math.max(1, remainingBeforeDeadline(deadlineAt)))
      )
    ).find(
      entry =>
        entry.action === 'DEPLOY' &&
        entry.commit === expectedCommitID &&
        CANCELLABLE_STATES.has(entry.state ?? '') &&
        typeof entry.uuid === 'string' &&
        entry.uuid.length > 0
    )

    if (hasReachedDeadline(deadlineAt)) {
      throw new Error(
        `Timed out while waiting for a cancellable deployment for ${expectedCommitID} on ${appId}`
      )
    }

    if (deployment?.uuid) {
      return deployment as DeploymentActivity & { uuid: string }
    }

    if (hasReachedDeadline(deadlineAt)) {
      throw new Error(
        `Timed out while waiting for a cancellable deployment for ${expectedCommitID} on ${appId}`
      )
    }

    await sleepUntilNextPoll({
      sleep,
      pollIntervalMs,
      deadlineAt
    })
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

function hasMatchingActivitySnapshot(
  previousSnapshot: string[],
  activity: DeploymentActivity[]
): boolean {
  const currentSnapshot = activity.map(serializeActivity)

  return (
    previousSnapshot.length === currentSnapshot.length &&
    previousSnapshot.every((entry, index) => entry === currentSnapshot[index])
  )
}

function isSuccessfulDeploymentState(state: string | undefined): boolean {
  return Boolean(state && SUCCESS_STATES.has(state))
}

function isFailedDeploymentState(state: string | undefined): boolean {
  return Boolean(state && FAILED_STATES.has(state) && !IN_PROGRESS_STATES.has(state))
}

function serializeActivity(activity: DeploymentActivity): string {
  return JSON.stringify({
    action: activity.action ?? null,
    state: activity.state ?? null,
    uuid: activity.uuid ?? null,
    commit: activity.commit ?? null
  })
}

function buildDeadline(timeoutMs: number): number {
  return Date.now() + timeoutMs
}

function hasReachedDeadline(deadlineAt: number): boolean {
  return Date.now() >= deadlineAt
}

function remainingBeforeDeadline(deadlineAt: number): number {
  return Math.max(0, deadlineAt - Date.now())
}

async function sleepUntilNextPoll({
  sleep,
  pollIntervalMs,
  deadlineAt
}: {
  sleep: Sleep
  pollIntervalMs: number
  deadlineAt: number
}): Promise<void> {
  await sleep(Math.min(pollIntervalMs, remainingBeforeDeadline(deadlineAt)))
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
