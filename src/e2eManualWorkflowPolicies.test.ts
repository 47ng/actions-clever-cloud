import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, test } from 'vitest'

function readProjectFile(path: string): string {
  return readFileSync(fileURLToPath(new URL(path, import.meta.url)), 'utf8')
}

const manualWorkflow = readProjectFile('../.github/workflows/e2e-manual.yml')
const reusableWorkflow = readProjectFile(
  '../.github/workflows/e2e-reusable.yml'
)

describe('manual e2e workflow policies', () => {
  test('manual dispatch accepts one full SHA, requires the current internal PR head, resolves the verified candidate image, and calls the reusable workflow with typed identity inputs', () => {
    expect(manualWorkflow).toContain('workflow_dispatch:')
    expect(manualWorkflow).toContain('head_sha:')
    expect(manualWorkflow).toContain('type: string')
    expect(manualWorkflow).toContain('head.repo.full_name === thisRepo')
    expect(manualWorkflow).toContain('pr.head.sha === headSha')
    expect(manualWorkflow).toContain('RUN_REF: ${{ github.ref }}')
    expect(manualWorkflow).toContain("runRef !== 'refs/heads/master'")
    expect(manualWorkflow).toContain('Dispatch this workflow from master.')
    expect(manualWorkflow).toContain('name: Resolve verified candidate image')
    expect(manualWorkflow).toContain('packages: read')
    expect(manualWorkflow).not.toContain(
      "import { inspectCandidateImage } from './src/e2e/candidate-image.ts'"
    )
    expect(manualWorkflow).toContain('org.opencontainers.image.revision')
    expect(manualWorkflow).toContain('org.opencontainers.image.source')
    expect(manualWorkflow).toContain(
      "const labelsResult = await inspect('{{json .Image.Config.Labels}}', pinnedImage)"
    )
    expect(manualWorkflow).toContain('`image=${pinnedImage}\\n`')
    expect(manualWorkflow).toContain(
      'candidate_digest: ${{ needs.candidate.outputs.digest }}'
    )
    expect(manualWorkflow).toContain(
      'candidate_image: ${{ needs.candidate.outputs.image }}'
    )
    expect(manualWorkflow).toContain(
      'candidate_source_repository: ${{ needs.resolve.outputs.candidate_source_repository }}'
    )
    expect(manualWorkflow).toContain('trusted_workflow_sha: ${{ github.sha }}')
    expect(manualWorkflow).toContain('caller: manual')
    expect(manualWorkflow).toContain(
      'uses: ./.github/workflows/e2e-reusable.yml'
    )
    expect(manualWorkflow).not.toContain('secrets: inherit')
  })

  test('the reusable workflow keeps credentials step-scoped, accepts typed candidate identity inputs, handles stale manual and automatic callers safely, and tears down by exact app ID', () => {
    expect(reusableWorkflow).toMatch(/^permissions: \{\}$/m)
    expect(reusableWorkflow).toContain('candidate_digest:')
    expect(reusableWorkflow).toContain('candidate_image:')
    expect(reusableWorkflow).toContain('candidate_source_repository:')
    expect(reusableWorkflow).toContain('trusted_workflow_sha:')
    expect(reusableWorkflow).toContain('caller:')
    expect(reusableWorkflow).toContain('concurrency:')
    expect(reusableWorkflow).toContain(
      'group: clever-cloud-e2e-${{ inputs.pr_number }}'
    )
    expect(reusableWorkflow).toContain('cancel-in-progress: false')
    expect(reusableWorkflow).toContain('name: clever-cloud-e2e')
    expect(reusableWorkflow).toContain('name: Checkout workflow source')
    expect(reusableWorkflow).toContain(
      'TRUSTED_WORKFLOW_SHA: ${{ inputs.trusted_workflow_sha }}'
    )
    expect(reusableWorkflow).toContain(
      'trusted_workflow_sha must be a full 40-character lowercase hex commit SHA.'
    )
    expect(reusableWorkflow).toContain(
      'ref: ${{ inputs.trusted_workflow_sha }}'
    )
    expect(reusableWorkflow).toContain('path: .workflow-source')
    expect(reusableWorkflow).toContain('path: .candidate-source')
    expect(reusableWorkflow).toContain(
      'node-version-file: .workflow-source/.node-version'
    )
    expect(reusableWorkflow).toContain('working-directory: .workflow-source')
    expect(reusableWorkflow).toContain('working-directory: .candidate-source')
    expect(reusableWorkflow).toContain(
      'pnpm install --frozen-lockfile --ignore-scripts'
    )
    expect(reusableWorkflow).not.toContain('--prod')
    expect(reusableWorkflow).toContain('persist-credentials: false')
    expect(reusableWorkflow).toContain(
      'OUTPUT_ACTION_PATH: ${{ github.workspace }}/.candidate-action/action.yml'
    )
    expect(reusableWorkflow).toContain(
      'CANDIDATE_DIGEST: ${{ inputs.candidate_digest }}'
    )
    expect(reusableWorkflow).toContain(
      'CANDIDATE_IMAGE: ${{ inputs.candidate_image }}'
    )
    expect(reusableWorkflow).toContain(
      'name: Protect trusted pinning inputs from candidate actions'
    )
    expect(reusableWorkflow).toContain(
      'TRUSTED_WORKFLOW_DIR: ${{ runner.temp }}/trusted-workflow'
    )
    expect(reusableWorkflow).toContain(
      'CANDIDATE_ACTION_PATH: ${{ runner.temp }}/candidate-action.yml'
    )
    expect(reusableWorkflow).toContain(
      'PIN_CANDIDATE_ACTION_SCRIPT: ${{ runner.temp }}/trusted-workflow/.github/scripts/pin-candidate-action.mjs'
    )
    expect(reusableWorkflow).toContain(
      'run: node "$PIN_CANDIDATE_ACTION_SCRIPT"'
    )
    expect(reusableWorkflow).not.toContain(
      'run: node .workflow-source/.github/scripts/pin-candidate-action.mjs'
    )
    expect(reusableWorkflow).not.toContain(
      "import { pinActionMetadata } from './.candidate-source/src/e2e/candidate-image.ts'"
    )
    expect(reusableWorkflow).toContain('pr.base.repo.full_name !== thisRepo')
    expect(reusableWorkflow).toContain(
      'pr.base.ref !== repository.default_branch'
    )
    expect(reusableWorkflow).toContain(
      "import { createFixtureRepository } from './.candidate-source/src/e2e/git-fixture.ts'"
    )
    expect(reusableWorkflow).toContain('uses: ./.candidate-action')
    expect(reusableWorkflow).toContain('name: Remove provisioning link')
    expect(reusableWorkflow).toContain('rm -f .clever.json')
    expect(reusableWorkflow).toContain('name: Generate padded health value')
    expect(reusableWorkflow).toContain(
      "import { generateHealthValue, HEALTH_VALUE_ENV_NAME } from './.candidate-source/src/e2e/health-value.ts'"
    )
    expect(reusableWorkflow).toContain(
      'name: Create second healthy fixture commit'
    )
    expect(reusableWorkflow).toContain(
      "import { createHealthyFixtureCommit } from './.candidate-source/src/e2e/git-fixture.ts'"
    )
    expect(reusableWorkflow).toContain(
      'name: Deploy healthy fixture commit with quiet env checks'
    )
    expect(reusableWorkflow).toContain(
      'appID: ${{ steps.create.outputs.app_id }}'
    )
    expect(reusableWorkflow).toContain('timeout: 1200')
    expect(reusableWorkflow).toContain('CC_HEALTH_CHECK_PATH=/health')
    expect(reusableWorkflow).toContain('E2E_SCENARIO=healthy')
    expect(reusableWorkflow).toContain(
      'E2E_HEALTH_VALUE=${{ steps.health-value.outputs.value }}'
    )
    expect(reusableWorkflow).toContain('quiet: true')
    expect(reusableWorkflow).toContain(
      'logFile: .e2e-artifacts/candidate-action/002-deploy-env.log'
    )
    expect(reusableWorkflow).toContain(
      'name: Observe healthy fixture env deployment'
    )
    expect(reusableWorkflow).toContain(
      "import { waitForHealthyDeployment } from './.candidate-source/src/e2e/deployment-observer.ts'"
    )
    expect(reusableWorkflow).toContain('expectedHealthValue')
    expect(reusableWorkflow).toContain(
      'lookupEnvironmentValue: controller.getEnvironmentValue'
    )
    expect(reusableWorkflow).toContain(
      'name: Verify quiet deployment log markers'
    )
    expect(reusableWorkflow).toContain(
      'name: Capture same-commit baseline state'
    )
    expect(reusableWorkflow).toContain(
      'name: Deploy same commit with default error policy'
    )
    expect(reusableWorkflow).toContain('continue-on-error: true')
    expect(reusableWorkflow).toContain(
      'name: Assert same-commit error outcome and activity'
    )
    expect(reusableWorkflow).toContain(
      'Remote HEAD has the same commit as the one to push'
    )
    expect(reusableWorkflow).toContain(
      'name: Deploy same commit with ignore policy'
    )
    expect(reusableWorkflow).toContain('sameCommitPolicy: ignore')
    expect(reusableWorkflow).toContain('name: Observe same-commit ignore state')
    expect(reusableWorkflow).toContain(
      'name: Deploy same commit with restart policy'
    )
    expect(reusableWorkflow).toContain('sameCommitPolicy: restart')
    expect(reusableWorkflow).toContain(
      'name: Observe same-commit restart state'
    )
    expect(reusableWorkflow).toContain(
      'Expected sameCommitPolicy: restart to report a new instance ID'
    )
    expect(reusableWorkflow).toContain(
      'name: Deploy same commit with rebuild policy'
    )
    expect(reusableWorkflow).toContain('sameCommitPolicy: rebuild')
    expect(reusableWorkflow).toContain(
      'name: Observe same-commit rebuild state'
    )
    expect(reusableWorkflow).toContain(
      'Expected sameCommitPolicy: rebuild to report a new instance ID'
    )
    expect(reusableWorkflow).toContain(
      "import { waitForHealthyDeployment, waitForNewFailedDeploymentActivity } from './.candidate-source/src/e2e/deployment-observer.ts'"
    )
    expect(reusableWorkflow).toContain(
      'Expected the default same-commit policy to fail'
    )
    expect(reusableWorkflow).toContain('without using cache')
    expect(reusableWorkflow).toContain('new AbortController()')
    expect(reusableWorkflow).not.toContain('::add-mask::')
    expect(reusableWorkflow).toContain('requestController.abort()')
    expect(reusableWorkflow).toContain(
      'const cleverCLI = `${process.env.GITHUB_WORKSPACE}/.candidate-source/node_modules/.bin/clever`'
    )
    expect(reusableWorkflow).toContain(
      "import {\n            createApplicationWithRecovery,\n            createCleverController\n          } from './.candidate-source/src/e2e/clever-client.ts'"
    )
    expect(reusableWorkflow).toContain('commandError.code = error.code')
    expect(reusableWorkflow).toContain('commandError.signal = error.signal')
    expect(reusableWorkflow).toContain('commandError.killed = error.killed')
    expect(reusableWorkflow).toContain(
      'application = await createApplicationWithRecovery('
    )
    expect(reusableWorkflow).toContain('controller.getApplication(appId)')
    expect(reusableWorkflow).toContain(
      'await deleteApplication({ appId, name: appName })'
    )
    expect(reusableWorkflow).toContain("['delete', '--app', appId, '--yes']")
    expect(reusableWorkflow).toContain('Invalid captured app ID for teardown')
    expect(reusableWorkflow).toContain(
      'await controller.deleteApplication({\n              appId: application.appId,\n              name: application.name,'
    )
    expect(reusableWorkflow).toContain('HEAD_SHA: ${{ inputs.head_sha }}')
    expect(reusableWorkflow).toContain(
      'CANDIDATE_DIGEST: ${{ inputs.candidate_digest }}'
    )
    expect(reusableWorkflow).toContain(
      'CANDIDATE_IMAGE: ${{ inputs.candidate_image }}'
    )
    expect(reusableWorkflow).toContain('CALLER: ${{ inputs.caller }}')
    expect(reusableWorkflow).toContain('pr.head.sha !== headSha')
    expect(reusableWorkflow).toContain('caller === \"automatic\"')
    expect(reusableWorkflow).toContain("addRaw('superseded')")

    const staleCheckIndex = reusableWorkflow.indexOf(
      'name: Recheck staleness after approval'
    )
    const checkoutIndex = reusableWorkflow.indexOf(
      'name: Checkout candidate source'
    )
    const installIndex = reusableWorkflow.indexOf(
      'name: Install candidate dependencies'
    )
    const pinIndex = reusableWorkflow.indexOf(
      'name: Verify and pin candidate action metadata'
    )
    const createAppIndex = reusableWorkflow.indexOf(
      'name: Create personal Node.js app'
    )

    expect(staleCheckIndex).toBeGreaterThan(-1)
    expect(checkoutIndex).toBeGreaterThan(staleCheckIndex)
    expect(installIndex).toBeGreaterThan(checkoutIndex)
    expect(pinIndex).toBeGreaterThan(installIndex)
    expect(createAppIndex).toBeGreaterThan(pinIndex)
    expect(reusableWorkflow).toContain(
      "name: Checkout candidate source\n        if: steps.candidate-state.outputs.proceed == 'true'"
    )
    expect(reusableWorkflow).toContain(
      "name: Install candidate dependencies\n        if: steps.candidate-state.outputs.proceed == 'true'"
    )
    expect(reusableWorkflow).toContain(
      "name: Verify and pin candidate action metadata\n        if: steps.candidate-state.outputs.proceed == 'true'"
    )

    expect(reusableWorkflow).toContain(
      "name: Create personal Node.js app\n        if: steps.candidate-state.outputs.proceed == 'true'"
    )
    expect(reusableWorkflow).toContain(
      "name: Remove provisioning link\n        if: steps.candidate-state.outputs.proceed == 'true'"
    )
    expect(reusableWorkflow).toContain(
      "name: Deploy healthy fixture commit\n        if: steps.candidate-state.outputs.proceed == 'true'"
    )
    expect(reusableWorkflow).toContain(
      "name: Observe healthy fixture deployment\n        if: steps.candidate-state.outputs.proceed == 'true'"
    )
    expect(reusableWorkflow).toContain('Dispatch again with the current head.')
    expect(reusableWorkflow).toContain('.e2e-state/app.json')
    expect(reusableWorkflow).toContain("hashFiles('.e2e-state/app.json')")
    expect(reusableWorkflow).not.toContain('clever login')
  })

  test('the protected reusable workflow does not restore shared pnpm caches before running credentialed candidate code', () => {
    expect(reusableWorkflow).toContain('uses: actions/setup-node@')
    expect(reusableWorkflow).not.toContain('cache: pnpm')
    expect(reusableWorkflow).not.toContain(
      'cache-dependency-path: .candidate-source/pnpm-lock.yaml'
    )
    expect(reusableWorkflow).toContain(
      'pnpm install --frozen-lockfile --ignore-scripts'
    )
  })

  test('the reusable workflow rejects divergent history without force, then deploys the same commit with force by app ID', () => {
    expect(reusableWorkflow).toContain('name: Capture force baseline state')
    expect(reusableWorkflow).toContain('name: Create divergent fixture commit')
    expect(reusableWorkflow).toContain(
      "import { createDivergentFixtureCommit } from './.candidate-source/src/e2e/git-fixture.ts'"
    )
    expect(reusableWorkflow).toContain(
      'name: Deploy divergent fixture commit without force'
    )
    expect(reusableWorkflow).toContain('continue-on-error: true')
    expect(reusableWorkflow).toContain(
      'name: Assert divergent rejection outcome and preserved production'
    )
    expect(reusableWorkflow).toContain(
      'Expected divergent deployment without force to fail'
    )
    expect(reusableWorkflow).toContain(
      'Expected divergent deployment without force log to mention a non-fast-forward rejection'
    )
    expect(reusableWorkflow).toContain('noNewActivityTimeoutMs: 15_000')
    expect(reusableWorkflow).toContain('settleTimeoutMs: 600_000')
    expect(reusableWorkflow).toContain('pollIntervalMs: 5_000')
    expect(reusableWorkflow).toContain(
      'name: Deploy divergent fixture commit with force'
    )
    expect(reusableWorkflow).toContain('force: true')
    expect(reusableWorkflow).toContain(
      'name: Observe forced divergent deployment'
    )
    expect(reusableWorkflow).toContain(
      "import { confirmRejectedDeploymentPreservesLiveApp, waitForNewHealthyDeployment } from './.candidate-source/src/e2e/deployment-observer.ts'"
    )
    expect(reusableWorkflow).toContain(
      'ACTION_OUTCOME: ${{ steps.divergent-no-force.outcome }}'
    )
    expect(reusableWorkflow).toContain(
      'ACTION_OUTCOME: ${{ steps.divergent-force.outcome }}'
    )

    const recoveryIndex = reusableWorkflow.indexOf(
      'name: Observe recovery fixture deployment'
    )
    const baselineIndex = reusableWorkflow.indexOf(
      'name: Capture force baseline state'
    )
    const divergentCommitIndex = reusableWorkflow.indexOf(
      'name: Create divergent fixture commit'
    )
    const noForceIndex = reusableWorkflow.indexOf(
      'name: Deploy divergent fixture commit without force'
    )
    const assertNoForceIndex = reusableWorkflow.indexOf(
      'name: Assert divergent rejection outcome and preserved production'
    )
    const forceIndex = reusableWorkflow.indexOf(
      'name: Deploy divergent fixture commit with force'
    )
    const observeForceIndex = reusableWorkflow.indexOf(
      'name: Observe forced divergent deployment'
    )
    const resultsIndex = reusableWorkflow.indexOf(
      'name: Write structured scenario results'
    )

    expect(baselineIndex).toBeGreaterThan(recoveryIndex)
    expect(divergentCommitIndex).toBeGreaterThan(baselineIndex)
    expect(noForceIndex).toBeGreaterThan(divergentCommitIndex)
    expect(assertNoForceIndex).toBeGreaterThan(noForceIndex)
    expect(forceIndex).toBeGreaterThan(assertNoForceIndex)
    expect(observeForceIndex).toBeGreaterThan(forceIndex)
    expect(resultsIndex).toBeGreaterThan(observeForceIndex)
  })

  test('the reusable workflow ends with a slow-build child commit that times out, records the documented success contract, cancels by commit, and keeps the forced healthy commit live', () => {
    expect(reusableWorkflow).toContain('name: Create slow-build fixture commit')
    expect(reusableWorkflow).toContain("label: 'slow-build-child'")
    expect(reusableWorkflow).toContain(
      'name: Deploy slow-build fixture commit with timeout'
    )
    expect(reusableWorkflow).toContain('timeout: 60')
    expect(reusableWorkflow).toContain('E2E_SCENARIO=slow-build')
    expect(reusableWorkflow).toContain('E2E_BUILD_DELAY_MS=180000')
    expect(reusableWorkflow).toContain(
      'name: Assert timeout outcome and contract message'
    )
    expect(reusableWorkflow).toContain(
      'ACTION_OUTCOME: ${{ steps.timeout-deploy.outcome }}'
    )
    expect(reusableWorkflow).toContain(
      'Expected timed-out deployment action to succeed'
    )
    expect(reusableWorkflow).toContain(
      'Deployment timed out, moving on with workflow run'
    )
    expect(reusableWorkflow).toContain(
      'name: Cancel timed-out deployment and confirm forced commit stays live'
    )
    expect(reusableWorkflow).toContain(
      "import { cancelTimedOutDeploymentPreservesLiveApp } from './.candidate-source/src/e2e/deployment-observer.ts'"
    )
    expect(reusableWorkflow).toContain('expectedCancelledCommitID')
    expect(reusableWorkflow).toContain(
      'controller.cancelDeployment({ appId, deploymentId, timeoutMs })'
    )
    expect(reusableWorkflow).toContain(
      "const CANCELLABLE_STATES = new Set(['WIP'])"
    )
    expect(reusableWorkflow).toContain('to become the latest WIP deployment')
    expect(reusableWorkflow).toContain('previousCommitID: previousCommitId')
    expect(reusableWorkflow).toContain(
      'previousDeploymentID: previousDeploymentId'
    )
    expect(reusableWorkflow).toContain('settleTimeoutMs: 600_000')
    expect(reusableWorkflow).toContain('pollIntervalMs: 5_000')

    const observeForceIndex = reusableWorkflow.indexOf(
      'name: Observe forced divergent deployment'
    )
    const slowBuildCommitIndex = reusableWorkflow.indexOf(
      'name: Create slow-build fixture commit'
    )
    const timeoutDeployIndex = reusableWorkflow.indexOf(
      'name: Deploy slow-build fixture commit with timeout'
    )
    const timeoutAssertIndex = reusableWorkflow.indexOf(
      'name: Assert timeout outcome and contract message'
    )
    const timeoutObserveIndex = reusableWorkflow.indexOf(
      'name: Cancel timed-out deployment and confirm forced commit stays live'
    )
    const resultsIndex = reusableWorkflow.indexOf(
      'name: Write structured scenario results'
    )

    expect(slowBuildCommitIndex).toBeGreaterThan(observeForceIndex)
    expect(timeoutDeployIndex).toBeGreaterThan(slowBuildCommitIndex)
    expect(timeoutAssertIndex).toBeGreaterThan(timeoutDeployIndex)
    expect(timeoutObserveIndex).toBeGreaterThan(timeoutAssertIndex)
    expect(resultsIndex).toBeGreaterThan(timeoutObserveIndex)
  })

  test('the reusable workflow preserves production through build and startup failures, then recovers in order', () => {
    expect(reusableWorkflow).toContain(
      'name: Create build-failure fixture commit'
    )
    expect(reusableWorkflow).toContain(
      'name: Deploy build-failure fixture commit'
    )
    expect(reusableWorkflow).toContain('continue-on-error: true')
    expect(reusableWorkflow).toContain(
      'CC_POST_BUILD_HOOK=node scripts/post-build-hook.mjs'
    )
    expect(reusableWorkflow).toContain('E2E_SCENARIO=build-failure')
    expect(reusableWorkflow).toContain(
      'name: Assert build-failure outcome and preserved production'
    )
    expect(reusableWorkflow).toContain(
      'Expected build-failure deployment to fail'
    )
    expect(reusableWorkflow).toContain(
      'expectedCommitID: previousState.commitId'
    )
    expect(reusableWorkflow).toContain(
      'expectedDeploymentID: previousState.deploymentId'
    )
    expect(reusableWorkflow).toContain(
      'Expected build-failure deployment to preserve the prior healthy instance ID'
    )
    expect(reusableWorkflow).toContain(
      'name: Create startup-failure fixture commit'
    )
    expect(reusableWorkflow).toContain(
      'name: Deploy startup-failure fixture commit'
    )
    expect(reusableWorkflow).toContain('E2E_SCENARIO=startup-failure')
    expect(reusableWorkflow).toContain(
      'name: Assert startup-failure outcome and preserved production'
    )
    expect(reusableWorkflow).toContain(
      'Expected startup-failure deployment to fail'
    )
    expect(reusableWorkflow).toContain(
      'Expected startup-failure deployment to preserve the prior healthy instance ID'
    )
    expect(reusableWorkflow).toContain('name: Create recovery fixture commit')
    expect(reusableWorkflow).toContain('name: Deploy recovery fixture commit')
    expect(reusableWorkflow).toContain(
      'name: Observe recovery fixture deployment'
    )
    expect(reusableWorkflow).toContain("expectedScenario: 'healthy'")
    expect(reusableWorkflow).toContain(
      'EXPECTED_COMMIT_ID: ${{ steps.recovery-commit.outputs.commit }}'
    )

    const rebuildIndex = reusableWorkflow.indexOf(
      'name: Observe same-commit rebuild state'
    )
    const buildFailureIndex = reusableWorkflow.indexOf(
      'name: Create build-failure fixture commit'
    )
    const startupFailureIndex = reusableWorkflow.indexOf(
      'name: Create startup-failure fixture commit'
    )
    const recoveryIndex = reusableWorkflow.indexOf(
      'name: Create recovery fixture commit'
    )

    expect(buildFailureIndex).toBeGreaterThan(rebuildIndex)
    expect(startupFailureIndex).toBeGreaterThan(buildFailureIndex)
    expect(recoveryIndex).toBeGreaterThan(startupFailureIndex)
  })
})
