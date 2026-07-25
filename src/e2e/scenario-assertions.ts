import {
  FIXTURE_BUILD_FAILURE_MARKER,
  FIXTURE_BUILD_MARKER,
  FIXTURE_STARTUP_FAILURE_MARKER,
  type FixtureHealth
} from './fixture-app.ts'

const REBUILD_WITHOUT_CACHE_MESSAGE = 'without using cache'

const nonFastForwardMarkers = [
  'not a simple fast-forward',
  'non-fast-forward',
  '[rejected]',
  'fetch first',
  'Updates were rejected'
]

export type BaselineState = {
  activity: unknown[]
  instanceId: string
  deploymentId: string
  commitId: string
}

export function parseBaselineState(value: unknown): BaselineState {
  const record = readRecord(value, 'baseline state')

  if (!Array.isArray(record.activity)) {
    throw new Error('baseline state.activity must be an array')
  }

  return {
    activity: record.activity,
    instanceId: readString(record.instanceId, 'baseline state.instanceId'),
    deploymentId: readString(
      record.deploymentId,
      'baseline state.deploymentId'
    ),
    commitId: readString(record.commitId, 'baseline state.commitId')
  }
}

function readRecord(value: unknown, field: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`${field} must be an object`)
  }

  return value as Record<string, unknown>
}

function readString(value: unknown, field: string): string {
  if (typeof value !== 'string') {
    throw new Error(`${field} must be a string`)
  }

  return value
}

export function assertSameCommitIgnorePreservedProduction({
  health,
  baseline
}: {
  health: FixtureHealth
  baseline: BaselineState
}): void {
  if (health.INSTANCE_ID !== baseline.instanceId) {
    throw new Error(
      'Expected sameCommitPolicy: ignore to keep the same instance ID'
    )
  }
  if (health.CC_DEPLOYMENT_ID !== baseline.deploymentId) {
    throw new Error(
      'Expected sameCommitPolicy: ignore to keep the same deployment ID'
    )
  }
  if (health.CC_COMMIT_ID !== baseline.commitId) {
    throw new Error(
      'Expected sameCommitPolicy: ignore to keep the same commit ID'
    )
  }
}

export function assertSameCommitRestartChangedProduction({
  health,
  baseline,
  logContent
}: {
  health: FixtureHealth
  baseline: BaselineState
  logContent: string
}): void {
  if (!health.INSTANCE_ID) {
    throw new Error(
      'Expected sameCommitPolicy: restart to report a new instance ID'
    )
  }
  if (health.INSTANCE_ID === baseline.instanceId) {
    throw new Error(
      'Expected sameCommitPolicy: restart to change the instance ID'
    )
  }
  if (health.CC_DEPLOYMENT_ID === baseline.deploymentId) {
    throw new Error(
      'Expected sameCommitPolicy: restart to change the deployment ID'
    )
  }
  if (health.CC_COMMIT_ID !== baseline.commitId) {
    throw new Error(
      'Expected sameCommitPolicy: restart to keep the same commit ID'
    )
  }

  if (logContent.includes(FIXTURE_BUILD_MARKER)) {
    throw new Error(
      'Expected restart to reuse cache without a new install marker'
    )
  }
}

export function assertSameCommitRebuildChangedProduction({
  health,
  baseline,
  logContent
}: {
  health: FixtureHealth
  baseline: BaselineState
  logContent: string
}): void {
  if (!health.INSTANCE_ID) {
    throw new Error(
      'Expected sameCommitPolicy: rebuild to report a new instance ID'
    )
  }
  if (health.INSTANCE_ID === baseline.instanceId) {
    throw new Error(
      'Expected sameCommitPolicy: rebuild to change the instance ID'
    )
  }
  if (health.CC_DEPLOYMENT_ID === baseline.deploymentId) {
    throw new Error(
      'Expected sameCommitPolicy: rebuild to change the deployment ID'
    )
  }
  if (health.CC_COMMIT_ID !== baseline.commitId) {
    throw new Error(
      'Expected sameCommitPolicy: rebuild to keep the same commit ID'
    )
  }

  if (!logContent.includes(REBUILD_WITHOUT_CACHE_MESSAGE)) {
    throw new Error(
      'Expected sameCommitPolicy: rebuild to report without using cache'
    )
  }
  if (!logContent.includes(FIXTURE_BUILD_MARKER)) {
    throw new Error(
      'Expected sameCommitPolicy: rebuild to emit a new install marker'
    )
  }
}

export function assertBuildFailurePreservedProduction({
  health,
  baseline,
  logContent
}: {
  health: FixtureHealth
  baseline: BaselineState
  logContent: string
}): void {
  if (health.INSTANCE_ID !== baseline.instanceId) {
    throw new Error(
      'Expected build-failure deployment to preserve the prior healthy instance ID'
    )
  }

  if (!logContent.includes(FIXTURE_BUILD_FAILURE_MARKER)) {
    throw new Error(
      'Expected build-failure log to contain the deterministic fixture marker'
    )
  }
}

export function assertStartupFailurePreservedProduction({
  health,
  baseline,
  logContent
}: {
  health: FixtureHealth
  baseline: BaselineState
  logContent: string
}): void {
  if (health.INSTANCE_ID !== baseline.instanceId) {
    throw new Error(
      'Expected startup-failure deployment to preserve the prior healthy instance ID'
    )
  }

  if (!logContent.includes(FIXTURE_STARTUP_FAILURE_MARKER)) {
    throw new Error(
      'Expected startup-failure log to contain the fixture startup marker'
    )
  }
}

export function assertDivergentRejectionPreservedProduction({
  health,
  baseline,
  logContent
}: {
  health: FixtureHealth
  baseline: BaselineState
  logContent: string
}): void {
  if (health.INSTANCE_ID !== baseline.instanceId) {
    throw new Error(
      'Expected divergent rejection to preserve the prior healthy instance ID'
    )
  }
  if (health.CC_DEPLOYMENT_ID !== baseline.deploymentId) {
    throw new Error(
      'Expected divergent rejection to preserve the prior healthy deployment ID'
    )
  }
  if (health.CC_COMMIT_ID !== baseline.commitId) {
    throw new Error(
      'Expected divergent rejection to preserve the prior healthy commit ID'
    )
  }

  if (!nonFastForwardMarkers.some(marker => logContent.includes(marker))) {
    throw new Error(
      'Expected divergent deployment without force log to mention a non-fast-forward rejection'
    )
  }
}

export function assertForcedDeploymentReplacedProduction({
  health,
  baseline
}: {
  health: FixtureHealth
  baseline: BaselineState
}): void {
  if (health.CC_COMMIT_ID === baseline.commitId) {
    throw new Error(
      'Expected forced divergent deployment to change the live commit ID'
    )
  }
  if (health.CC_DEPLOYMENT_ID === baseline.deploymentId) {
    throw new Error(
      'Expected forced divergent deployment to change the live deployment ID'
    )
  }
}

export function assertTimeoutOutcome({
  outcome,
  health,
  expectedCancelledCommitID,
  previousInstanceId
}: {
  outcome: 'cancelled' | 'completed' | 'failed'
  health: FixtureHealth
  expectedCancelledCommitID: string
  previousInstanceId: string
}): void {
  if (outcome === 'completed') {
    if (health.CC_COMMIT_ID !== expectedCancelledCommitID) {
      throw new Error(
        'Expected the completed timed-out deployment to serve the timeout commit'
      )
    }
  } else {
    if (health.INSTANCE_ID !== previousInstanceId) {
      throw new Error(
        `Expected the ${outcome} timed-out deployment to preserve the prior healthy forced instance ID`
      )
    }
  }
}
