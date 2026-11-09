export const FIXTURE_BUILD_MARKER = 'fixture-build'
export const FIXTURE_BUILD_FAILURE_MARKER = 'fixture-build-failure'
export const FIXTURE_READY_MARKER = 'fixture-ready'
export const FIXTURE_STARTUP_FAILURE_MARKER = 'fixture-startup-failure'
export const FIXTURE_START_MARKER = 'fixture-start'
export const FIXTURE_PRE_PUSH_HOOK_MARKER = 'fixture-pre-push-hook-ran'

export type FixtureHealth = {
  scenario: string
  healthValue: string | null
  INSTANCE_ID: string | null
  INSTANCE_TYPE: string | null
  CC_DEPLOYMENT_ID: string | null
  CC_COMMIT_ID: string | null
}
