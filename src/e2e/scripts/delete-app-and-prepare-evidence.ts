import { constants } from 'node:fs'
import { access, appendFile, readFile } from 'node:fs/promises'
import { APP_ID_REGEX, createCleverController } from '../clever-client.ts'
import {
  prepareFailureEvidence,
  verifyPreparedFailureEvidence
} from '../evidence.ts'
import { createRunCommand, resolveCleverCLI } from '../workflow-adapters.ts'

const githubOutput = process.env.GITHUB_OUTPUT
const hasAppIdFile = process.env.HAS_APP_ID_FILE === 'true'
const outputDir = process.env.OUTPUT_DIR
const resultsPath = process.env.RESULTS_PATH
const healthyLogPath = process.env.HEALTHY_LOG_PATH
const envLogPath = process.env.ENV_LOG_PATH
const sameCommitErrorLogPath = process.env.SAME_COMMIT_ERROR_LOG_PATH
const sameCommitIgnoreLogPath = process.env.SAME_COMMIT_IGNORE_LOG_PATH
const sameCommitRestartLogPath = process.env.SAME_COMMIT_RESTART_LOG_PATH
const sameCommitRebuildLogPath = process.env.SAME_COMMIT_REBUILD_LOG_PATH
const buildFailureLogPath = process.env.BUILD_FAILURE_LOG_PATH
const startupFailureLogPath = process.env.STARTUP_FAILURE_LOG_PATH
const recoveryLogPath = process.env.RECOVERY_LOG_PATH
const divergentNoForceLogPath = process.env.DIVERGENT_NO_FORCE_LOG_PATH
const divergentForceLogPath = process.env.DIVERGENT_FORCE_LOG_PATH
const timeoutLogPath = process.env.TIMEOUT_LOG_PATH
const token = process.env.CLEVER_TOKEN
const secret = process.env.CLEVER_SECRET
const healthValue = process.env.E2E_HEALTH_VALUE
let appId = process.env.APP_ID
let appName = process.env.APP_NAME
const appIdFile = process.env.APP_ID_FILE
const cleverCLI = resolveCleverCLI()

if (
  !outputDir ||
  !resultsPath ||
  !healthyLogPath ||
  !envLogPath ||
  !sameCommitErrorLogPath ||
  !sameCommitIgnoreLogPath ||
  !sameCommitRestartLogPath ||
  !sameCommitRebuildLogPath ||
  !buildFailureLogPath ||
  !startupFailureLogPath ||
  !recoveryLogPath ||
  !divergentNoForceLogPath ||
  !divergentForceLogPath ||
  !timeoutLogPath ||
  !token ||
  !secret
) {
  throw new Error('Missing teardown or failure evidence inputs')
}

function messageFrom(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

const buildEvidenceCandidates = async (): Promise<
  Array<{ sourcePath: string; artifactPath: string }>
> => {
  const candidates = [
    {
      sourcePath: resultsPath,
      artifactPath: 'suite-results.json'
    }
  ]

  for (const logCandidate of [
    {
      sourcePath: healthyLogPath,
      artifactPath: 'candidate-action/001-deploy-healthy.log'
    },
    {
      sourcePath: envLogPath,
      artifactPath: 'candidate-action/002-deploy-env.log'
    },
    {
      sourcePath: sameCommitErrorLogPath,
      artifactPath: 'candidate-action/003-same-commit-error.log'
    },
    {
      sourcePath: sameCommitIgnoreLogPath,
      artifactPath: 'candidate-action/004-same-commit-ignore.log'
    },
    {
      sourcePath: sameCommitRestartLogPath,
      artifactPath: 'candidate-action/005-same-commit-restart.log'
    },
    {
      sourcePath: sameCommitRebuildLogPath,
      artifactPath: 'candidate-action/006-same-commit-rebuild.log'
    },
    {
      sourcePath: buildFailureLogPath,
      artifactPath: 'candidate-action/007-build-failure.log'
    },
    {
      sourcePath: startupFailureLogPath,
      artifactPath: 'candidate-action/008-startup-failure.log'
    },
    {
      sourcePath: recoveryLogPath,
      artifactPath: 'candidate-action/009-recovery.log'
    },
    {
      sourcePath: divergentNoForceLogPath,
      artifactPath: 'candidate-action/010-divergent-no-force.log'
    },
    {
      sourcePath: divergentForceLogPath,
      artifactPath: 'candidate-action/011-divergent-force.log'
    },
    {
      sourcePath: timeoutLogPath,
      artifactPath: 'candidate-action/012-timeout.log'
    }
  ]) {
    try {
      await access(logCandidate.sourcePath, constants.F_OK)
      candidates.push(logCandidate)
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
  }

  return candidates
}

const credentials = { token, secret, healthValue }
const errors: string[] = []
let evidencePrepared = false

try {
  await prepareFailureEvidence({
    outputDir,
    candidates: await buildEvidenceCandidates(),
    credentials
  })
  evidencePrepared = true
} catch (error) {
  errors.push(`Failure evidence preparation failed: ${messageFrom(error)}`)
}

if ((!appId || !appName) && hasAppIdFile && appIdFile) {
  try {
    const persisted = JSON.parse(await readFile(appIdFile, 'utf8'))
    appId ??= persisted.appId
    appName ??= persisted.name
  } catch (error) {
    errors.push(`Failed to read captured app identity: ${messageFrom(error)}`)
  }
}

if (appId && !APP_ID_REGEX.test(appId)) {
  errors.push(`Invalid captured app ID for teardown: ${appId}`)
} else if (appId && appName) {
  try {
    const controller = createCleverController({
      cleverCLI,
      runCommand: createRunCommand()
    })
    await controller.deleteApplication({ appId, name: appName })
  } catch (error) {
    errors.push(`App teardown failed: ${messageFrom(error)}`)
  }
}

if (evidencePrepared) {
  try {
    await verifyPreparedFailureEvidence({
      outputDir,
      credentials
    })
    if (githubOutput) {
      await appendFile(githubOutput, 'failure_evidence_ready=true\n')
    }
  } catch (error) {
    errors.push(`Failure evidence verification failed: ${messageFrom(error)}`)
  }
}

if (
  (!appId || !appName) &&
  (hasAppIdFile || Boolean(process.env.APP_ID) || Boolean(process.env.APP_NAME))
) {
  errors.push('Missing captured app identity for teardown')
}

if (errors.length > 0) {
  for (const errorMessage of errors) {
    console.error(`::error::${errorMessage}`)
  }
  throw new Error(errors.join('\n'))
}
