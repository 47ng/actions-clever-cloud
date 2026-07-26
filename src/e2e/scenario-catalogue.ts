export const SCENARIO_CATALOGUE = [
  {
    name: 'deploy-healthy-fixture-commit',
    logFile: 'candidate-action/001-deploy-healthy.log',
    logPathEnvName: 'HEALTHY_LOG_PATH',
    workflowStepId: 'deploy-healthy'
  },
  {
    name: 'deploy-healthy-fixture-env-check',
    logFile: 'candidate-action/002-deploy-env.log',
    logPathEnvName: 'ENV_LOG_PATH',
    workflowStepId: 'deploy-env'
  },
  {
    name: 'same-commit-error',
    logFile: 'candidate-action/003-same-commit-error.log',
    logPathEnvName: 'SAME_COMMIT_ERROR_LOG_PATH',
    workflowStepId: 'same-commit-error'
  },
  {
    name: 'same-commit-ignore',
    logFile: 'candidate-action/004-same-commit-ignore.log',
    logPathEnvName: 'SAME_COMMIT_IGNORE_LOG_PATH',
    workflowStepId: 'same-commit-ignore'
  },
  {
    name: 'same-commit-restart',
    logFile: 'candidate-action/005-same-commit-restart.log',
    logPathEnvName: 'SAME_COMMIT_RESTART_LOG_PATH',
    workflowStepId: 'same-commit-restart'
  },
  {
    name: 'same-commit-rebuild',
    logFile: 'candidate-action/006-same-commit-rebuild.log',
    logPathEnvName: 'SAME_COMMIT_REBUILD_LOG_PATH',
    workflowStepId: 'same-commit-rebuild'
  },
  {
    name: 'build-failure',
    logFile: 'candidate-action/007-build-failure.log',
    logPathEnvName: 'BUILD_FAILURE_LOG_PATH',
    workflowStepId: 'build-failure'
  },
  {
    name: 'startup-failure',
    logFile: 'candidate-action/008-startup-failure.log',
    logPathEnvName: 'STARTUP_FAILURE_LOG_PATH',
    workflowStepId: 'startup-failure'
  },
  {
    name: 'recovery',
    logFile: 'candidate-action/009-recovery.log',
    logPathEnvName: 'RECOVERY_LOG_PATH',
    workflowStepId: 'recovery'
  },
  {
    name: 'divergent-no-force',
    logFile: 'candidate-action/010-divergent-no-force.log',
    logPathEnvName: 'DIVERGENT_NO_FORCE_LOG_PATH',
    workflowStepId: 'divergent-no-force'
  },
  {
    name: 'divergent-force',
    logFile: 'candidate-action/011-divergent-force.log',
    logPathEnvName: 'DIVERGENT_FORCE_LOG_PATH',
    workflowStepId: 'divergent-force'
  },
  {
    name: 'timeout-cancelled',
    logFile: 'candidate-action/012-timeout.log',
    logPathEnvName: 'TIMEOUT_LOG_PATH',
    workflowStepId: 'timeout-deploy'
  }
] as const

export type ScenarioDefinition = (typeof SCENARIO_CATALOGUE)[number]
export type ScenarioName = ScenarioDefinition['name']

export function scenarioByName(name: ScenarioName): ScenarioDefinition {
  const scenario = SCENARIO_CATALOGUE.find(entry => entry.name === name)

  if (!scenario) {
    throw new Error(`Unknown E2E scenario: ${name}`)
  }

  return scenario
}
