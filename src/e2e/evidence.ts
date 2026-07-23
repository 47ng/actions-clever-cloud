import { Buffer } from 'node:buffer'
import { mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises'
import path from 'node:path'

const REDACTION = '[REDACTED]'
const HEAD_SHA_REGEX = /^[0-9a-f]{40}$/
const IMAGE_DIGEST_REGEX = /^sha256:[0-9a-f]{64}$/
const IMAGE_REFERENCE_REGEX =
  /^ghcr\.io\/47ng\/actions-clever-cloud@sha256:[0-9a-f]{64}$/

type StepOutcome = 'success' | 'failure' | 'skipped' | string | undefined

export type SuiteResults = {
  candidate: {
    headSha: string | null
    imageDigest: string | null
    imageReference: string | null
  }
  app: {
    id: string | null
    name: string | null
  }
  scenarios: Array<{
    name: string
    outcome: 'success' | 'failure' | 'skipped'
    baselineInstanceId: string | null
    instanceId: string | null
    commitId: string | null
    deploymentId: string | null
    candidateActionLogs: string[]
  }>
}

export function buildSuccessfulScenarioOutcome(
  ...outcomes: StepOutcome[]
): 'success' | 'failure' | 'skipped' {
  return outcomes.every(outcome => outcome === 'success')
    ? 'success'
    : outcomes.every(outcome => outcome === 'skipped')
      ? 'skipped'
      : 'failure'
}

export function buildExpectedFailureOutcome({
  actionOutcome,
  assertionOutcome
}: {
  actionOutcome: StepOutcome
  assertionOutcome: StepOutcome
}): 'success' | 'failure' | 'skipped' {
  if (actionOutcome === 'failure' && assertionOutcome === 'success') {
    return 'success'
  }

  if (actionOutcome === 'skipped' && assertionOutcome === 'skipped') {
    return 'skipped'
  }

  return 'failure'
}

export function buildSuiteResults(results: SuiteResults): SuiteResults {
  return results
}

export function buildSuiteStepSummary({
  suiteResults,
  caller,
  teardownOutcome,
  failureEvidenceReady
}: {
  suiteResults: unknown
  caller: string
  teardownOutcome: string
  failureEvidenceReady: boolean
}): string {
  const normalizedSuiteResults = normalizeSuiteResults(suiteResults)
  const lines = [
    '# Clever Cloud E2E summary',
    '',
    `Caller: ${escapeSummaryText(caller)}`,
    `Candidate head SHA: ${escapeSummaryText(normalizedSuiteResults.candidate.headSha ?? '(unavailable)')}`,
    `Candidate image digest: ${escapeSummaryText(normalizedSuiteResults.candidate.imageDigest ?? '(unavailable)')}`,
    `Candidate image reference: ${escapeSummaryText(normalizedSuiteResults.candidate.imageReference ?? '(unavailable)')}`,
    `App name: ${escapeSummaryText(normalizedSuiteResults.app.name ?? '(unavailable)')}`,
    `App ID: ${escapeSummaryText(normalizedSuiteResults.app.id ?? '(unavailable)')}`,
    `Teardown: ${escapeSummaryText(teardownOutcome)}`,
    `Failure evidence: ${failureEvidenceReady ? 'ready' : 'not prepared'}`,
    '',
    '| Scenario | Outcome | Commit | Deployment | Logs |',
    '| --- | --- | --- | --- | --- |'
  ]

  for (const scenario of normalizedSuiteResults.scenarios) {
    lines.push(
      `| ${escapeSummaryTableCell(scenario.name)} | ${escapeSummaryTableCell(scenario.outcome)} | ${escapeSummaryTableCell(scenario.commitId ?? '-')} | ${escapeSummaryTableCell(scenario.deploymentId ?? '-')} | ${escapeSummaryTableCell(scenario.candidateActionLogs.join(', ') || '-')} |`
    )
  }

  return `${lines.join('\n')}\n`
}

export async function prepareFailureEvidence({
  outputDir,
  candidates,
  credentials
}: {
  outputDir: string
  candidates: Array<{
    sourcePath: string
    artifactPath: string
  }>
  credentials: {
    token: string
    secret: string
  }
}): Promise<void> {
  await rm(outputDir, {
    force: true,
    recursive: true
  })

  for (const candidate of candidates) {
    const artifactPath = assertSafeArtifactPath(candidate.artifactPath)
    const redacted = redactArtifactContent(
      await readFile(candidate.sourcePath, 'utf8'),
      credentials
    )

    scanArtifactContent(redacted, credentials)

    const destinationPath = path.join(outputDir, artifactPath)
    await mkdir(path.dirname(destinationPath), {
      recursive: true
    })
    await writeFile(destinationPath, redacted, 'utf8')
  }
}

export async function verifyPreparedFailureEvidence({
  outputDir,
  credentials
}: {
  outputDir: string
  credentials: {
    token: string
    secret: string
  }
}): Promise<void> {
  for (const filePath of await listPreparedEvidenceFiles(outputDir)) {
    scanArtifactContent(await readFile(filePath, 'utf8'), credentials)
  }
}

export function redactArtifactContent(
  content: string,
  credentials: {
    token: string
    secret: string
  }
): string {
  let redacted = content

  for (const pattern of buildSensitivePatterns(credentials)) {
    redacted = redacted.split(pattern).join(REDACTION)
  }

  return redacted
}

export function scanArtifactContent(
  content: string,
  credentials: {
    token: string
    secret: string
  }
): void {
  for (const pattern of buildSensitivePatterns(credentials)) {
    if (content.includes(pattern)) {
      throw new Error('Artifact still contains redaction target content')
    }
  }
}

export async function writeSuiteResults(
  resultsPath: string,
  results: SuiteResults
): Promise<void> {
  await mkdir(path.dirname(resultsPath), {
    recursive: true
  })

  await writeFile(resultsPath, JSON.stringify(results, null, 2), 'utf8')
}

function normalizeSuiteResults(value: unknown): SuiteResults {
  const record = readRecord(value, 'suite results')
  const appRecord = readRecord(record.app, 'suite results.app')
  const scenariosValue = record.scenarios

  if (!Array.isArray(scenariosValue)) {
    throw new Error('suite results.scenarios must be an array')
  }

  const candidateRecord = readRecord(record.candidate, 'suite results.candidate')
  const headSha = readNullableString(
    candidateRecord.headSha,
    'suite results.candidate.headSha'
  )
  const imageDigest = readNullableString(
    candidateRecord.imageDigest,
    'suite results.candidate.imageDigest'
  )
  const imageReference = readNullableString(
    candidateRecord.imageReference,
    'suite results.candidate.imageReference'
  )

  if (headSha !== null && !HEAD_SHA_REGEX.test(headSha)) {
    throw new Error('suite results.candidate.headSha must be a full lowercase hex commit SHA')
  }

  if (imageDigest !== null && !IMAGE_DIGEST_REGEX.test(imageDigest)) {
    throw new Error('suite results.candidate.imageDigest must be a canonical sha256 digest')
  }

  if (
    imageReference !== null &&
    !IMAGE_REFERENCE_REGEX.test(imageReference)
  ) {
    throw new Error(
      'suite results.candidate.imageReference must be pinned to the trusted candidate image digest'
    )
  }

  return {
    candidate: {
      headSha,
      imageDigest,
      imageReference
    },
    app: {
      id: readNullableString(appRecord.id, 'suite results.app.id'),
      name: readNullableString(appRecord.name, 'suite results.app.name')
    },
    scenarios: scenariosValue.map((scenario, index) => {
      const scenarioRecord = readRecord(
        scenario,
        `suite results.scenarios[${index}]`
      )
      const outcome = readString(
        scenarioRecord.outcome,
        `suite results.scenarios[${index}].outcome`
      )

      if (
        outcome !== 'success' &&
        outcome !== 'failure' &&
        outcome !== 'skipped'
      ) {
        throw new Error(
          `suite results.scenarios[${index}].outcome must be success, failure, or skipped`
        )
      }

      return {
        name: readString(scenarioRecord.name, `suite results.scenarios[${index}].name`),
        outcome,
        baselineInstanceId: readNullableString(
          scenarioRecord.baselineInstanceId,
          `suite results.scenarios[${index}].baselineInstanceId`
        ),
        instanceId: readNullableString(
          scenarioRecord.instanceId,
          `suite results.scenarios[${index}].instanceId`
        ),
        commitId: readNullableString(
          scenarioRecord.commitId,
          `suite results.scenarios[${index}].commitId`
        ),
        deploymentId: readNullableString(
          scenarioRecord.deploymentId,
          `suite results.scenarios[${index}].deploymentId`
        ),
        candidateActionLogs: readStringArray(
          scenarioRecord.candidateActionLogs,
          `suite results.scenarios[${index}].candidateActionLogs`
        )
      }
    })
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

function readNullableString(value: unknown, field: string): string | null {
  if (value === null || value === undefined) {
    return null
  }

  return readString(value, field)
}

function readStringArray(value: unknown, field: string): string[] {
  if (!Array.isArray(value) || value.some(entry => typeof entry !== 'string')) {
    throw new Error(`${field} must be an array of strings`)
  }

  return value
}

function escapeSummaryText(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replace(/\r?\n/g, '<br>')
}

function escapeSummaryTableCell(value: string): string {
  return escapeSummaryText(value).replaceAll('|', '\\|')
}

function buildSensitivePatterns(credentials: {
  token: string
  secret: string
}): string[] {
  const combined = `${credentials.token}:${credentials.secret}`
  const values = [credentials.token, credentials.secret, combined]

  return Array.from(
    new Set(
      values.flatMap(value => {
        const base64 = Buffer.from(value, 'utf8').toString('base64')

        return [
          value,
          encodeURIComponent(value),
          base64,
          base64.replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/u, '')
        ]
      })
    )
  ).sort((left, right) => right.length - left.length)
}

async function listPreparedEvidenceFiles(directory: string): Promise<string[]> {
  const entries = await readdir(directory, {
    withFileTypes: true
  })

  const files = await Promise.all(
    entries.map(async entry => {
      const entryPath = path.join(directory, entry.name)

      if (entry.isDirectory()) {
        return listPreparedEvidenceFiles(entryPath)
      }

      if (entry.isFile()) {
        return [entryPath]
      }

      return []
    })
  )

  return files.flat()
}

function assertSafeArtifactPath(artifactPath: string): string {
  if (
    artifactPath.startsWith('/') ||
    artifactPath.split('/').some(segment => segment === '..' || segment === '.' || segment === '') ||
    !/^[A-Za-z0-9._/-]+$/.test(artifactPath)
  ) {
    throw new Error(`Unsafe artifact path: ${artifactPath}`)
  }

  return artifactPath
}
