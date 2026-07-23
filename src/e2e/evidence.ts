import { Buffer } from 'node:buffer'
import { mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises'
import path from 'node:path'

const REDACTION = '[REDACTED]'

type StepOutcome = 'success' | 'failure' | 'skipped' | string | undefined

export type SuiteResults = {
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
