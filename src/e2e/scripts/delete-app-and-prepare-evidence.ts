import { constants } from 'node:fs'
import { access, readFile } from 'node:fs/promises'
import { APP_ID_REGEX, createCleverController } from '../clever-client.ts'
import {
  prepareFailureEvidence,
  verifyPreparedFailureEvidence
} from '../evidence.ts'
import { SCENARIO_CATALOGUE } from '../scenario-catalogue.ts'
import { writeStepOutputs } from '../step-output.ts'
import { createRunCommand, resolveCleverCLI } from '../workflow-adapters.ts'

const githubOutput = process.env.GITHUB_OUTPUT
const hasAppIdFile = process.env.HAS_APP_ID_FILE === 'true'
const outputDir = process.env.OUTPUT_DIR
const resultsPath = process.env.RESULTS_PATH
const token = process.env.CLEVER_TOKEN
const secret = process.env.CLEVER_SECRET
const healthValue = process.env.E2E_HEALTH_VALUE
let appId = process.env.APP_ID
let appName = process.env.APP_NAME
const appIdFile = process.env.APP_ID_FILE
const cleverCLI = resolveCleverCLI()

if (!outputDir || !resultsPath || !token || !secret) {
  throw new Error('Missing teardown or failure evidence inputs')
}

const scenarioLogPaths = SCENARIO_CATALOGUE.map(scenario => {
  const sourcePath = process.env[scenario.logPathEnvName]

  if (!sourcePath) {
    throw new Error(
      `Missing ${scenario.logPathEnvName} for scenario ${scenario.name}`
    )
  }

  return { sourcePath, artifactPath: scenario.logFile }
})

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

  for (const logCandidate of scenarioLogPaths) {
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
      await writeStepOutputs(githubOutput, { failure_evidence_ready: 'true' })
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
