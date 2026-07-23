import { Buffer } from 'node:buffer'
import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { expect, test } from 'vitest'
import {
  buildSuiteResults,
  prepareFailureEvidence,
  redactArtifactContent,
  scanArtifactContent,
  verifyPreparedFailureEvidence,
  writeSuiteResults
} from './evidence'

test('writes structured results with scenario outcomes, app identity, commit IDs, deployment IDs, and candidate action logs', async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'actions-clever-cloud-evidence-'))
  const resultsPath = path.join(directory, 'suite-results.json')

  const results = buildSuiteResults({
    app: {
      id: 'app_facade42-cafe-babe-cafe-deadf00dbaad',
      name: 'actions-clever-cloud-e2e-123-4'
    },
    scenarios: [
      {
        name: 'deploy-healthy-fixture-commit',
        outcome: 'success',
        commitId: 'commit-123',
        deploymentId: 'deployment-123',
        candidateActionLogs: ['candidate-action/001-deploy-healthy.log']
      }
    ]
  })

  await writeSuiteResults(resultsPath, results)

  await expect(readFile(resultsPath, 'utf8').then(JSON.parse)).resolves.toEqual({
    app: {
      id: 'app_facade42-cafe-babe-cafe-deadf00dbaad',
      name: 'actions-clever-cloud-e2e-123-4'
    },
    scenarios: [
      {
        name: 'deploy-healthy-fixture-commit',
        outcome: 'success',
        commitId: 'commit-123',
        deploymentId: 'deployment-123',
        candidateActionLogs: ['candidate-action/001-deploy-healthy.log']
      }
    ]
  })
})

test('redacts raw and encoded credentials before scanning artifacts', () => {
  const token = 'token-123'
  const secret = 'secret-456'
  const joined = `${token}:${secret}`
  const encodedSecret = encodeURIComponent(secret)
  const encodedJoined = Buffer.from(joined, 'utf8').toString('base64')

  const redacted = redactArtifactContent(
    [token, secret, joined, encodedSecret, encodedJoined].join('\n'),
    {
      token,
      secret
    }
  )

  expect(redacted).not.toContain(token)
  expect(redacted).not.toContain(secret)
  expect(redacted).not.toContain(joined)
  expect(redacted).not.toContain(encodedSecret)
  expect(redacted).not.toContain(encodedJoined)
  expect(() => scanArtifactContent(redacted, { token, secret })).not.toThrow()
})

test('prepares redacted failure evidence under safe artifact identifiers', async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'actions-clever-cloud-evidence-'))
  const sourcePath = path.join(directory, 'source.log')
  const outputDir = path.join(directory, 'upload')

  await writeFile(sourcePath, 'token-123\nplain output\n', 'utf8')

  await prepareFailureEvidence({
    outputDir,
    candidates: [
      {
        sourcePath,
        artifactPath: 'candidate-action/001-deploy-healthy.log'
      }
    ],
    credentials: {
      token: 'token-123',
      secret: 'secret-456'
    }
  })

  await expect(
    readFile(path.join(outputDir, 'candidate-action/001-deploy-healthy.log'), 'utf8')
  ).resolves.toBe('[REDACTED]\nplain output\n')
})

test('redacts common base64url credential forms before scanning artifacts', () => {
  const token = 'token?123'
  const secret = 'secret?456'
  const joined = `${token}:${secret}`
  const encodedJoined = Buffer.from(joined, 'utf8')
    .toString('base64')
    .replaceAll('+', '-')
    .replaceAll('/', '_')
    .replace(/=+$/u, '')

  const redacted = redactArtifactContent(encodedJoined, {
    token,
    secret
  })

  expect(redacted).not.toContain(encodedJoined)
  expect(() => scanArtifactContent(redacted, { token, secret })).not.toThrow()
})

test('fails scanning when an artifact still contains a raw credential', () => {
  expect(() =>
    scanArtifactContent('token-123\nplain output\n', {
      token: 'token-123',
      secret: 'secret-456'
    })
  ).toThrow('Artifact still contains redaction target content')
})

test('clears any pre-existing upload files before preparing failure evidence', async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'actions-clever-cloud-evidence-'))
  const sourcePath = path.join(directory, 'source.log')
  const outputDir = path.join(directory, 'upload')

  await writeFile(sourcePath, 'plain output\n', 'utf8')
  await mkdir(outputDir, {
    recursive: true
  })
  await writeFile(path.join(outputDir, 'stale.txt'), 'stale\n', 'utf8')

  await prepareFailureEvidence({
    outputDir,
    candidates: [
      {
        sourcePath,
        artifactPath: 'candidate-action/001-deploy-healthy.log'
      }
    ],
    credentials: {
      token: 'token-123',
      secret: 'secret-456'
    }
  })

  await expect(readFile(path.join(outputDir, 'stale.txt'), 'utf8')).rejects.toThrow()
})

test('fails verification when a file appears after failure evidence preparation', async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'actions-clever-cloud-evidence-'))
  const sourcePath = path.join(directory, 'source.log')
  const outputDir = path.join(directory, 'upload')

  await writeFile(sourcePath, 'plain output\n', 'utf8')

  await prepareFailureEvidence({
    outputDir,
    candidates: [
      {
        sourcePath,
        artifactPath: 'candidate-action/001-deploy-healthy.log'
      }
    ],
    credentials: {
      token: 'token-123',
      secret: 'secret-456'
    }
  })

  await writeFile(path.join(outputDir, 'late.log'), 'token-123\n', 'utf8')

  await expect(
    verifyPreparedFailureEvidence({
      outputDir,
      credentials: {
        token: 'token-123',
        secret: 'secret-456'
      }
    })
  ).rejects.toThrow('Artifact still contains redaction target content')
})

test('fails preparation when a scanned artifact identifier is unsafe', async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'actions-clever-cloud-evidence-'))
  const sourcePath = path.join(directory, 'source.log')

  await writeFile(sourcePath, 'plain output\n', 'utf8')

  await expect(
    prepareFailureEvidence({
      outputDir: path.join(directory, 'upload'),
      candidates: [
        {
          sourcePath,
          artifactPath: './unsafe.log'
        }
      ],
      credentials: {
        token: 'token-123',
        secret: 'secret-456'
      }
    })
  ).rejects.toThrow('Unsafe artifact path: ./unsafe.log')
})
