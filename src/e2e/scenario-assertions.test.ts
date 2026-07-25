import { expect, test } from 'vitest'
import {
  FIXTURE_BUILD_FAILURE_MARKER,
  FIXTURE_BUILD_MARKER,
  FIXTURE_STARTUP_FAILURE_MARKER,
  type FixtureHealth
} from './fixture-app.ts'
import {
  assertBuildFailurePreservedProduction,
  assertDivergentRejectionPreservedProduction,
  assertForcedDeploymentReplacedProduction,
  assertSameCommitIgnorePreservedProduction,
  assertSameCommitRebuildChangedProduction,
  assertSameCommitRestartChangedProduction,
  assertStartupFailurePreservedProduction,
  assertTimeoutOutcome,
  parseBaselineState,
  type BaselineState
} from './scenario-assertions.ts'

function health(overrides: Partial<FixtureHealth> = {}): FixtureHealth {
  return {
    scenario: 'healthy',
    healthValue: null,
    INSTANCE_ID: 'instance-1',
    INSTANCE_TYPE: 'production',
    CC_DEPLOYMENT_ID: 'deployment-1',
    CC_COMMIT_ID: 'commit-1',
    ...overrides
  }
}

function baseline(overrides: Partial<BaselineState> = {}): BaselineState {
  return {
    activity: [],
    instanceId: 'instance-1',
    deploymentId: 'deployment-1',
    commitId: 'commit-1',
    ...overrides
  }
}

test('same-commit ignore accepts unchanged production identifiers', () => {
  expect(() =>
    assertSameCommitIgnorePreservedProduction({
      health: health(),
      baseline: baseline()
    })
  ).not.toThrow()
})

test('same-commit ignore rejects a changed instance ID', () => {
  expect(() =>
    assertSameCommitIgnorePreservedProduction({
      health: health({ INSTANCE_ID: 'instance-2' }),
      baseline: baseline()
    })
  ).toThrow('Expected sameCommitPolicy: ignore to keep the same instance ID')
})

test('same-commit ignore rejects a changed deployment ID', () => {
  expect(() =>
    assertSameCommitIgnorePreservedProduction({
      health: health({ CC_DEPLOYMENT_ID: 'deployment-2' }),
      baseline: baseline()
    })
  ).toThrow('Expected sameCommitPolicy: ignore to keep the same deployment ID')
})

test('same-commit ignore rejects a changed commit ID', () => {
  expect(() =>
    assertSameCommitIgnorePreservedProduction({
      health: health({ CC_COMMIT_ID: 'commit-2' }),
      baseline: baseline()
    })
  ).toThrow('Expected sameCommitPolicy: ignore to keep the same commit ID')
})

test('same-commit restart accepts changed production identifiers with no cache marker', () => {
  expect(() =>
    assertSameCommitRestartChangedProduction({
      health: health({
        INSTANCE_ID: 'instance-2',
        CC_DEPLOYMENT_ID: 'deployment-2'
      }),
      baseline: baseline(),
      logContent: 'no markers here'
    })
  ).not.toThrow()
})

test('same-commit restart rejects a missing instance ID', () => {
  expect(() =>
    assertSameCommitRestartChangedProduction({
      health: health({ INSTANCE_ID: null }),
      baseline: baseline(),
      logContent: ''
    })
  ).toThrow('Expected sameCommitPolicy: restart to report a new instance ID')
})

test('same-commit restart rejects an unchanged instance ID', () => {
  expect(() =>
    assertSameCommitRestartChangedProduction({
      health: health({ CC_DEPLOYMENT_ID: 'deployment-2' }),
      baseline: baseline(),
      logContent: ''
    })
  ).toThrow('Expected sameCommitPolicy: restart to change the instance ID')
})

test('same-commit restart rejects an unchanged deployment ID', () => {
  expect(() =>
    assertSameCommitRestartChangedProduction({
      health: health({ INSTANCE_ID: 'instance-2' }),
      baseline: baseline(),
      logContent: ''
    })
  ).toThrow('Expected sameCommitPolicy: restart to change the deployment ID')
})

test('same-commit restart rejects a changed commit ID', () => {
  expect(() =>
    assertSameCommitRestartChangedProduction({
      health: health({
        INSTANCE_ID: 'instance-2',
        CC_DEPLOYMENT_ID: 'deployment-2',
        CC_COMMIT_ID: 'commit-2'
      }),
      baseline: baseline(),
      logContent: ''
    })
  ).toThrow('Expected sameCommitPolicy: restart to keep the same commit ID')
})

test('same-commit restart rejects a build marker in the log, proving the cache was not reused', () => {
  expect(() =>
    assertSameCommitRestartChangedProduction({
      health: health({
        INSTANCE_ID: 'instance-2',
        CC_DEPLOYMENT_ID: 'deployment-2'
      }),
      baseline: baseline(),
      logContent: `${FIXTURE_BUILD_MARKER} ran during install`
    })
  ).toThrow('Expected restart to reuse cache without a new install marker')
})

test('same-commit rebuild accepts changed production identifiers with cache and build markers', () => {
  expect(() =>
    assertSameCommitRebuildChangedProduction({
      health: health({
        INSTANCE_ID: 'instance-2',
        CC_DEPLOYMENT_ID: 'deployment-2'
      }),
      baseline: baseline(),
      logContent: `without using cache, ran ${FIXTURE_BUILD_MARKER}`
    })
  ).not.toThrow()
})

test('same-commit rebuild rejects a missing instance ID', () => {
  expect(() =>
    assertSameCommitRebuildChangedProduction({
      health: health({ INSTANCE_ID: null }),
      baseline: baseline(),
      logContent: ''
    })
  ).toThrow('Expected sameCommitPolicy: rebuild to report a new instance ID')
})

test('same-commit rebuild rejects an unchanged instance ID', () => {
  expect(() =>
    assertSameCommitRebuildChangedProduction({
      health: health({ CC_DEPLOYMENT_ID: 'deployment-2' }),
      baseline: baseline(),
      logContent: ''
    })
  ).toThrow('Expected sameCommitPolicy: rebuild to change the instance ID')
})

test('same-commit rebuild rejects an unchanged deployment ID', () => {
  expect(() =>
    assertSameCommitRebuildChangedProduction({
      health: health({ INSTANCE_ID: 'instance-2' }),
      baseline: baseline(),
      logContent: ''
    })
  ).toThrow('Expected sameCommitPolicy: rebuild to change the deployment ID')
})

test('same-commit rebuild rejects a changed commit ID', () => {
  expect(() =>
    assertSameCommitRebuildChangedProduction({
      health: health({
        INSTANCE_ID: 'instance-2',
        CC_DEPLOYMENT_ID: 'deployment-2',
        CC_COMMIT_ID: 'commit-2'
      }),
      baseline: baseline(),
      logContent: ''
    })
  ).toThrow('Expected sameCommitPolicy: rebuild to keep the same commit ID')
})

test('same-commit rebuild rejects a log missing the without-using-cache message', () => {
  expect(() =>
    assertSameCommitRebuildChangedProduction({
      health: health({
        INSTANCE_ID: 'instance-2',
        CC_DEPLOYMENT_ID: 'deployment-2'
      }),
      baseline: baseline(),
      logContent: `${FIXTURE_BUILD_MARKER} ran during install`
    })
  ).toThrow('Expected sameCommitPolicy: rebuild to report without using cache')
})

test('same-commit rebuild rejects a log missing the build marker, proving the cache was reused', () => {
  expect(() =>
    assertSameCommitRebuildChangedProduction({
      health: health({
        INSTANCE_ID: 'instance-2',
        CC_DEPLOYMENT_ID: 'deployment-2'
      }),
      baseline: baseline(),
      logContent: 'without using cache'
    })
  ).toThrow('Expected sameCommitPolicy: rebuild to emit a new install marker')
})

test('build-failure accepts a preserved instance ID with the build-failure marker', () => {
  expect(() =>
    assertBuildFailurePreservedProduction({
      health: health(),
      baseline: baseline(),
      logContent: `${FIXTURE_BUILD_FAILURE_MARKER} logged`
    })
  ).not.toThrow()
})

test('build-failure rejects a changed instance ID', () => {
  expect(() =>
    assertBuildFailurePreservedProduction({
      health: health({ INSTANCE_ID: 'instance-2' }),
      baseline: baseline(),
      logContent: `${FIXTURE_BUILD_FAILURE_MARKER} logged`
    })
  ).toThrow(
    'Expected build-failure deployment to preserve the prior healthy instance ID'
  )
})

test('build-failure rejects a log missing the build-failure marker', () => {
  expect(() =>
    assertBuildFailurePreservedProduction({
      health: health(),
      baseline: baseline(),
      logContent: 'nothing relevant here'
    })
  ).toThrow(
    'Expected build-failure log to contain the deterministic fixture marker'
  )
})

test('startup-failure accepts a preserved instance ID with the startup-failure marker', () => {
  expect(() =>
    assertStartupFailurePreservedProduction({
      health: health(),
      baseline: baseline(),
      logContent: `${FIXTURE_STARTUP_FAILURE_MARKER} logged`
    })
  ).not.toThrow()
})

test('startup-failure rejects a changed instance ID', () => {
  expect(() =>
    assertStartupFailurePreservedProduction({
      health: health({ INSTANCE_ID: 'instance-2' }),
      baseline: baseline(),
      logContent: `${FIXTURE_STARTUP_FAILURE_MARKER} logged`
    })
  ).toThrow(
    'Expected startup-failure deployment to preserve the prior healthy instance ID'
  )
})

test('startup-failure rejects a log missing the startup-failure marker', () => {
  expect(() =>
    assertStartupFailurePreservedProduction({
      health: health(),
      baseline: baseline(),
      logContent: 'nothing relevant here'
    })
  ).toThrow(
    'Expected startup-failure log to contain the fixture startup marker'
  )
})

test('divergent rejection accepts preserved production identifiers with a non-fast-forward marker', () => {
  expect(() =>
    assertDivergentRejectionPreservedProduction({
      health: health(),
      baseline: baseline(),
      logContent: 'error: non-fast-forward'
    })
  ).not.toThrow()
})

test('divergent rejection rejects a changed instance ID', () => {
  expect(() =>
    assertDivergentRejectionPreservedProduction({
      health: health({ INSTANCE_ID: 'instance-2' }),
      baseline: baseline(),
      logContent: 'non-fast-forward'
    })
  ).toThrow(
    'Expected divergent rejection to preserve the prior healthy instance ID'
  )
})

test('divergent rejection rejects a changed deployment ID', () => {
  expect(() =>
    assertDivergentRejectionPreservedProduction({
      health: health({ CC_DEPLOYMENT_ID: 'deployment-2' }),
      baseline: baseline(),
      logContent: 'non-fast-forward'
    })
  ).toThrow(
    'Expected divergent rejection to preserve the prior healthy deployment ID'
  )
})

test('divergent rejection rejects a changed commit ID', () => {
  expect(() =>
    assertDivergentRejectionPreservedProduction({
      health: health({ CC_COMMIT_ID: 'commit-2' }),
      baseline: baseline(),
      logContent: 'non-fast-forward'
    })
  ).toThrow(
    'Expected divergent rejection to preserve the prior healthy commit ID'
  )
})

test.each([
  'not a simple fast-forward',
  'non-fast-forward',
  '[rejected]',
  'fetch first',
  'Updates were rejected'
])('divergent rejection accepts the non-fast-forward marker %j', marker => {
  expect(() =>
    assertDivergentRejectionPreservedProduction({
      health: health(),
      baseline: baseline(),
      logContent: `git said: ${marker}`
    })
  ).not.toThrow()
})

test('divergent rejection rejects a log with none of the non-fast-forward markers', () => {
  expect(() =>
    assertDivergentRejectionPreservedProduction({
      health: health(),
      baseline: baseline(),
      logContent: 'push succeeded unexpectedly'
    })
  ).toThrow(
    'Expected divergent deployment without force log to mention a non-fast-forward rejection'
  )
})

test('forced deployment accepts changed commit and deployment IDs', () => {
  expect(() =>
    assertForcedDeploymentReplacedProduction({
      health: health({
        CC_COMMIT_ID: 'commit-2',
        CC_DEPLOYMENT_ID: 'deployment-2'
      }),
      baseline: baseline()
    })
  ).not.toThrow()
})

test('forced deployment rejects an unchanged commit ID', () => {
  expect(() =>
    assertForcedDeploymentReplacedProduction({
      health: health({ CC_DEPLOYMENT_ID: 'deployment-2' }),
      baseline: baseline()
    })
  ).toThrow('Expected forced divergent deployment to change the live commit ID')
})

test('forced deployment rejects an unchanged deployment ID', () => {
  expect(() =>
    assertForcedDeploymentReplacedProduction({
      health: health({ CC_COMMIT_ID: 'commit-2' }),
      baseline: baseline()
    })
  ).toThrow(
    'Expected forced divergent deployment to change the live deployment ID'
  )
})

test('timeout outcome accepts a completed deployment serving the timeout commit', () => {
  expect(() =>
    assertTimeoutOutcome({
      outcome: 'completed',
      health: health({ CC_COMMIT_ID: 'commit-2' }),
      expectedCancelledCommitID: 'commit-2',
      previousInstanceId: 'instance-1'
    })
  ).not.toThrow()
})

test('timeout outcome rejects a completed deployment serving the wrong commit', () => {
  expect(() =>
    assertTimeoutOutcome({
      outcome: 'completed',
      health: health({ CC_COMMIT_ID: 'commit-1' }),
      expectedCancelledCommitID: 'commit-2',
      previousInstanceId: 'instance-1'
    })
  ).toThrow(
    'Expected the completed timed-out deployment to serve the timeout commit'
  )
})

test('timeout outcome accepts a cancelled deployment preserving the prior instance ID', () => {
  expect(() =>
    assertTimeoutOutcome({
      outcome: 'cancelled',
      health: health({ INSTANCE_ID: 'instance-1' }),
      expectedCancelledCommitID: 'commit-2',
      previousInstanceId: 'instance-1'
    })
  ).not.toThrow()
})

test('timeout outcome rejects a cancelled deployment with a changed instance ID', () => {
  expect(() =>
    assertTimeoutOutcome({
      outcome: 'cancelled',
      health: health({ INSTANCE_ID: 'instance-2' }),
      expectedCancelledCommitID: 'commit-2',
      previousInstanceId: 'instance-1'
    })
  ).toThrow(
    'Expected the cancelled timed-out deployment to preserve the prior healthy forced instance ID'
  )
})

test('timeout outcome rejects a failed deployment with a changed instance ID', () => {
  expect(() =>
    assertTimeoutOutcome({
      outcome: 'failed',
      health: health({ INSTANCE_ID: 'instance-2' }),
      expectedCancelledCommitID: 'commit-2',
      previousInstanceId: 'instance-1'
    })
  ).toThrow(
    'Expected the failed timed-out deployment to preserve the prior healthy forced instance ID'
  )
})

test('parseBaselineState accepts the shape written by capture-baseline-state', () => {
  const raw = {
    activity: [{ some: 'entry' }],
    instanceId: 'instance-1',
    deploymentId: 'deployment-1',
    commitId: 'commit-1'
  }

  expect(parseBaselineState(raw)).toEqual(raw)
})

test('parseBaselineState rejects a non-object value', () => {
  expect(() => parseBaselineState('not an object')).toThrow(
    'baseline state must be an object'
  )
})

test('parseBaselineState rejects a missing activity array', () => {
  expect(() =>
    parseBaselineState({
      instanceId: 'instance-1',
      deploymentId: 'deployment-1',
      commitId: 'commit-1'
    })
  ).toThrow('baseline state.activity must be an array')
})

test('parseBaselineState rejects a numeric instanceId', () => {
  expect(() =>
    parseBaselineState({
      activity: [],
      instanceId: 123,
      deploymentId: 'deployment-1',
      commitId: 'commit-1'
    })
  ).toThrow('baseline state.instanceId must be a string')
})
