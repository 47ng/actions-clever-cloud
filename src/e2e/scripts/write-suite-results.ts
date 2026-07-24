import { readFile } from 'node:fs/promises'
import {
  buildExpectedFailureOutcome,
  buildSuccessfulScenarioOutcome,
  buildSuiteResults,
  writeSuiteResults
} from '../evidence.ts'

const appIdFile = process.env.APP_ID_FILE
const resultsPath = process.env.RESULTS_PATH
const headSha = process.env.HEAD_SHA
const candidateDigest = process.env.CANDIDATE_DIGEST
const candidateImage = process.env.CANDIDATE_IMAGE

if (
  !appIdFile ||
  !resultsPath ||
  !headSha ||
  !candidateDigest ||
  !candidateImage
) {
  throw new Error('Missing structured results inputs')
}

const app: { id: string | null; name: string | null } = {
  id: null,
  name: null
}

try {
  const persisted = JSON.parse(await readFile(appIdFile, 'utf8'))
  if (typeof persisted.appId === 'string') {
    app.id = persisted.appId
  }
  if (typeof persisted.name === 'string') {
    app.name = persisted.name
  }
} catch (error) {
  if (
    !error ||
    typeof error !== 'object' ||
    !('code' in error) ||
    error.code !== 'ENOENT'
  ) {
    throw error
  }
}

await writeSuiteResults(
  resultsPath,
  buildSuiteResults({
    candidate: {
      headSha,
      imageDigest: candidateDigest,
      imageReference: candidateImage
    },
    app,
    scenarios: [
      {
        name: 'deploy-healthy-fixture-commit',
        outcome: buildSuccessfulScenarioOutcome(
          process.env.DEPLOY_HEALTHY_OUTCOME,
          process.env.OBSERVE_HEALTHY_OUTCOME
        ),
        baselineInstanceId: null,
        instanceId: process.env.HEALTHY_OBSERVED_INSTANCE_ID || null,
        commitId:
          process.env.HEALTHY_OBSERVED_COMMIT_ID ||
          process.env.HEALTHY_COMMIT ||
          null,
        deploymentId: process.env.HEALTHY_OBSERVED_DEPLOYMENT_ID || null,
        candidateActionLogs: ['candidate-action/001-deploy-healthy.log']
      },
      {
        name: 'deploy-healthy-fixture-env-check',
        outcome: buildSuccessfulScenarioOutcome(
          process.env.DEPLOY_ENV_OUTCOME,
          process.env.OBSERVE_ENV_OUTCOME,
          process.env.VERIFY_ENV_LOG_OUTCOME
        ),
        baselineInstanceId: null,
        instanceId: process.env.ENV_OBSERVED_INSTANCE_ID || null,
        commitId:
          process.env.ENV_OBSERVED_COMMIT_ID || process.env.ENV_COMMIT || null,
        deploymentId: process.env.ENV_OBSERVED_DEPLOYMENT_ID || null,
        candidateActionLogs: ['candidate-action/002-deploy-env.log']
      },
      {
        name: 'same-commit-error',
        outcome: buildExpectedFailureOutcome({
          actionOutcome: process.env.SAME_COMMIT_ERROR_OUTCOME,
          assertionOutcome: process.env.ASSERT_SAME_COMMIT_ERROR_OUTCOME
        }),
        baselineInstanceId:
          process.env.SAME_COMMIT_BASELINE_INSTANCE_ID || null,
        instanceId: process.env.SAME_COMMIT_BASELINE_INSTANCE_ID || null,
        commitId: process.env.SAME_COMMIT_BASELINE_COMMIT_ID || null,
        deploymentId: null,
        candidateActionLogs: ['candidate-action/003-same-commit-error.log']
      },
      {
        name: 'same-commit-ignore',
        outcome: buildSuccessfulScenarioOutcome(
          process.env.SAME_COMMIT_IGNORE_OUTCOME,
          process.env.OBSERVE_SAME_COMMIT_IGNORE_OUTCOME
        ),
        baselineInstanceId:
          process.env.SAME_COMMIT_BASELINE_INSTANCE_ID || null,
        instanceId:
          process.env.SAME_COMMIT_IGNORE_INSTANCE_ID ||
          process.env.SAME_COMMIT_BASELINE_INSTANCE_ID ||
          null,
        commitId:
          process.env.SAME_COMMIT_IGNORE_COMMIT_ID ||
          process.env.SAME_COMMIT_BASELINE_COMMIT_ID ||
          null,
        deploymentId:
          process.env.SAME_COMMIT_IGNORE_DEPLOYMENT_ID ||
          process.env.SAME_COMMIT_BASELINE_DEPLOYMENT_ID ||
          null,
        candidateActionLogs: ['candidate-action/004-same-commit-ignore.log']
      },
      {
        name: 'same-commit-restart',
        outcome: buildSuccessfulScenarioOutcome(
          process.env.SAME_COMMIT_RESTART_OUTCOME,
          process.env.OBSERVE_SAME_COMMIT_RESTART_OUTCOME
        ),
        baselineInstanceId:
          process.env.SAME_COMMIT_RESTART_BASELINE_INSTANCE_ID || null,
        instanceId: process.env.SAME_COMMIT_RESTART_INSTANCE_ID || null,
        commitId: process.env.SAME_COMMIT_RESTART_COMMIT_ID || null,
        deploymentId: process.env.SAME_COMMIT_RESTART_DEPLOYMENT_ID || null,
        candidateActionLogs: ['candidate-action/005-same-commit-restart.log']
      },
      {
        name: 'same-commit-rebuild',
        outcome: buildSuccessfulScenarioOutcome(
          process.env.SAME_COMMIT_REBUILD_OUTCOME,
          process.env.OBSERVE_SAME_COMMIT_REBUILD_OUTCOME
        ),
        baselineInstanceId:
          process.env.SAME_COMMIT_REBUILD_BASELINE_INSTANCE_ID || null,
        instanceId: process.env.SAME_COMMIT_REBUILD_INSTANCE_ID || null,
        commitId: process.env.SAME_COMMIT_REBUILD_COMMIT_ID || null,
        deploymentId: process.env.SAME_COMMIT_REBUILD_DEPLOYMENT_ID || null,
        candidateActionLogs: ['candidate-action/006-same-commit-rebuild.log']
      },
      {
        name: 'build-failure',
        outcome: buildExpectedFailureOutcome({
          actionOutcome: process.env.BUILD_FAILURE_OUTCOME,
          assertionOutcome: process.env.ASSERT_BUILD_FAILURE_OUTCOME
        }),
        baselineInstanceId:
          process.env.FAILED_DEPLOY_BASELINE_INSTANCE_ID || null,
        instanceId: process.env.BUILD_FAILURE_INSTANCE_ID || null,
        commitId: process.env.BUILD_FAILURE_COMMIT || null,
        deploymentId: process.env.BUILD_FAILURE_DEPLOYMENT_ID || null,
        candidateActionLogs: ['candidate-action/007-build-failure.log']
      },
      {
        name: 'startup-failure',
        outcome: buildExpectedFailureOutcome({
          actionOutcome: process.env.STARTUP_FAILURE_OUTCOME,
          assertionOutcome: process.env.ASSERT_STARTUP_FAILURE_OUTCOME
        }),
        baselineInstanceId:
          process.env.FAILED_DEPLOY_BASELINE_INSTANCE_ID || null,
        instanceId: process.env.STARTUP_FAILURE_INSTANCE_ID || null,
        commitId: process.env.STARTUP_FAILURE_COMMIT || null,
        deploymentId: process.env.STARTUP_FAILURE_DEPLOYMENT_ID || null,
        candidateActionLogs: ['candidate-action/008-startup-failure.log']
      },
      {
        name: 'recovery',
        outcome: buildSuccessfulScenarioOutcome(
          process.env.RECOVERY_OUTCOME,
          process.env.OBSERVE_RECOVERY_OUTCOME
        ),
        baselineInstanceId:
          process.env.FAILED_DEPLOY_BASELINE_INSTANCE_ID || null,
        instanceId: process.env.RECOVERY_INSTANCE_ID || null,
        commitId:
          process.env.RECOVERY_COMMIT_ID || process.env.RECOVERY_COMMIT || null,
        deploymentId: process.env.RECOVERY_DEPLOYMENT_ID || null,
        candidateActionLogs: ['candidate-action/009-recovery.log']
      },
      {
        name: 'divergent-no-force',
        outcome: buildExpectedFailureOutcome({
          actionOutcome: process.env.DIVERGENT_NO_FORCE_OUTCOME,
          assertionOutcome: process.env.ASSERT_DIVERGENT_NO_FORCE_OUTCOME
        }),
        baselineInstanceId: process.env.FORCE_BASELINE_INSTANCE_ID || null,
        instanceId:
          process.env.DIVERGENT_NO_FORCE_INSTANCE_ID ||
          process.env.FORCE_BASELINE_INSTANCE_ID ||
          null,
        commitId: process.env.DIVERGENT_NO_FORCE_COMMIT_ID || null,
        deploymentId: process.env.DIVERGENT_NO_FORCE_DEPLOYMENT_ID || null,
        candidateActionLogs: ['candidate-action/010-divergent-no-force.log']
      },
      {
        name: 'divergent-force',
        outcome: buildSuccessfulScenarioOutcome(
          process.env.DIVERGENT_FORCE_OUTCOME,
          process.env.OBSERVE_DIVERGENT_FORCE_OUTCOME
        ),
        baselineInstanceId: process.env.FORCE_BASELINE_INSTANCE_ID || null,
        instanceId: process.env.DIVERGENT_FORCE_INSTANCE_ID || null,
        commitId:
          process.env.DIVERGENT_FORCE_COMMIT_ID ||
          process.env.DIVERGENT_FORCE_COMMIT ||
          null,
        deploymentId: process.env.DIVERGENT_FORCE_DEPLOYMENT_ID || null,
        candidateActionLogs: ['candidate-action/011-divergent-force.log']
      },
      {
        name: 'timeout-cancelled',
        outcome: buildSuccessfulScenarioOutcome(
          process.env.TIMEOUT_DEPLOY_OUTCOME,
          process.env.ASSERT_TIMEOUT_DEPLOY_OUTCOME,
          process.env.OBSERVE_TIMEOUT_DEPLOY_OUTCOME
        ),
        baselineInstanceId: process.env.TIMEOUT_BASELINE_INSTANCE_ID || null,
        instanceId:
          process.env.TIMEOUT_INSTANCE_ID ||
          process.env.TIMEOUT_BASELINE_INSTANCE_ID ||
          null,
        commitId:
          process.env.TIMEOUT_COMMIT_ID || process.env.TIMEOUT_COMMIT || null,
        deploymentId: process.env.TIMEOUT_DEPLOYMENT_ID || null,
        candidateActionLogs: ['candidate-action/012-timeout.log']
      }
    ]
  })
)
