import { appendFile, readFile } from 'node:fs/promises'
import { buildSuiteStepSummary } from '../evidence.ts'

const resultsPath = process.env.RESULTS_PATH
const headSha = process.env.HEAD_SHA
const candidateDigest = process.env.CANDIDATE_DIGEST
const candidateImage = process.env.CANDIDATE_IMAGE
const caller = process.env.CALLER
const teardownOutcome = process.env.TEARDOWN_OUTCOME
const summaryPath = process.env.GITHUB_STEP_SUMMARY

if (
  !resultsPath ||
  !headSha ||
  !candidateDigest ||
  !candidateImage ||
  !caller ||
  !teardownOutcome ||
  !summaryPath
) {
  throw new Error('Missing GitHub step summary inputs')
}

let suiteResults: unknown = {
  candidate: {
    headSha,
    imageDigest: candidateDigest,
    imageReference: candidateImage
  },
  app: {
    id: null,
    name: null
  },
  scenarios: []
}

try {
  suiteResults = JSON.parse(await readFile(resultsPath, 'utf8'))
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

await appendFile(
  summaryPath,
  buildSuiteStepSummary({
    suiteResults,
    caller,
    teardownOutcome,
    failureEvidenceReady: process.env.FAILURE_EVIDENCE_READY === 'true'
  })
)
