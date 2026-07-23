import { Buffer } from 'node:buffer'
import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { expect, test } from 'vitest'
import {
  buildExpectedFailureOutcome,
  buildSuiteResults,
  buildSuiteStepSummary,
  buildSuccessfulScenarioOutcome,
  prepareFailureEvidence,
  redactArtifactContent,
  scanArtifactContent,
  verifyPreparedFailureEvidence,
  writeSuiteResults
} from './evidence'

test('treats a checked expected failure as a successful scenario outcome', () => {
  expect(
    buildExpectedFailureOutcome({
      actionOutcome: 'failure',
      assertionOutcome: 'success'
    })
  ).toBe('success')

  expect(
    buildExpectedFailureOutcome({
      actionOutcome: 'success',
      assertionOutcome: 'failure'
    })
  ).toBe('failure')

  expect(
    buildExpectedFailureOutcome({
      actionOutcome: 'skipped',
      assertionOutcome: 'skipped'
    })
  ).toBe('skipped')
})

test('treats regular scenario outcomes as success only when every step succeeds', () => {
  expect(buildSuccessfulScenarioOutcome('success', 'success')).toBe('success')
  expect(buildSuccessfulScenarioOutcome('success', 'failure')).toBe('failure')
  expect(buildSuccessfulScenarioOutcome('skipped', 'skipped')).toBe('skipped')
})

test('writes structured results with scenario outcomes, app identity, commit IDs, deployment IDs, and candidate action logs', async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'actions-clever-cloud-evidence-'))
  const resultsPath = path.join(directory, 'suite-results.json')

  const results = buildSuiteResults({
    candidate: {
      headSha: '0123456789abcdef0123456789abcdef01234567',
      imageDigest: `sha256:${'a'.repeat(64)}`,
      imageReference:
        'ghcr.io/47ng/actions-clever-cloud@sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'
    },
    app: {
      id: 'app_facade42-cafe-babe-cafe-deadf00dbaad',
      name: 'actions-clever-cloud-e2e-123-4'
    },
    scenarios: [
      {
        name: 'deploy-healthy-fixture-commit',
        outcome: 'success',
        baselineInstanceId: null,
        instanceId: 'instance-123',
        commitId: 'commit-123',
        deploymentId: 'deployment-123',
        candidateActionLogs: ['candidate-action/001-deploy-healthy.log']
      }
    ]
  })

  await writeSuiteResults(resultsPath, results)

  await expect(readFile(resultsPath, 'utf8').then(JSON.parse)).resolves.toEqual({
    candidate: {
      headSha: '0123456789abcdef0123456789abcdef01234567',
      imageDigest: `sha256:${'a'.repeat(64)}`,
      imageReference:
        'ghcr.io/47ng/actions-clever-cloud@sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'
    },
    app: {
      id: 'app_facade42-cafe-babe-cafe-deadf00dbaad',
      name: 'actions-clever-cloud-e2e-123-4'
    },
    scenarios: [
      {
        name: 'deploy-healthy-fixture-commit',
        outcome: 'success',
        baselineInstanceId: null,
        instanceId: 'instance-123',
        commitId: 'commit-123',
        deploymentId: 'deployment-123',
        candidateActionLogs: ['candidate-action/001-deploy-healthy.log']
      }
    ]
  })
})

test('builds a safe GitHub step summary with app identity and per-scenario outcomes', () => {
  const summary = buildSuiteStepSummary({
    suiteResults: buildSuiteResults({
      candidate: {
        headSha: '0123456789abcdef0123456789abcdef01234567',
        imageDigest: `sha256:${'b'.repeat(64)}`,
        imageReference:
          'ghcr.io/47ng/actions-clever-cloud@sha256:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb'
      },
      app: {
        id: 'app_facade42-cafe-babe-cafe-deadf00dbaad',
        name: 'actions|clever\n<script>alert(1)</script>'
      },
      scenarios: [
        {
          name: 'deploy|healthy\nfixture',
          outcome: 'success',
          baselineInstanceId: null,
          instanceId: 'instance-123',
          commitId: 'commit|123',
          deploymentId: 'deployment-123',
          candidateActionLogs: ['candidate-action/001-deploy-healthy.log']
        },
        {
          name: 'timeout',
          outcome: 'failure',
          baselineInstanceId: 'instance-123',
          instanceId: 'instance-123',
          commitId: 'commit-timeout',
          deploymentId: 'deployment-timeout',
          candidateActionLogs: ['candidate-action/012-timeout.log|tail']
        }
      ]
    }),
    caller: 'manual',
    teardownOutcome: 'success',
    failureEvidenceReady: true
  })

  expect(summary).toContain('# Clever Cloud E2E summary')
  expect(summary).toContain('Caller: manual')
  expect(summary).toContain(
    'Candidate head SHA: 0123456789abcdef0123456789abcdef01234567'
  )
  expect(summary).toContain(`Candidate image digest: sha256:${'b'.repeat(64)}`)
  expect(summary).toContain(
    'Candidate image reference: ghcr.io/47ng/actions-clever-cloud@sha256:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb'
  )
  expect(summary).toContain('actions|clever<br>&lt;script&gt;alert(1)&lt;/script&gt;')
  expect(summary).toContain('app_facade42-cafe-babe-cafe-deadf00dbaad')
  expect(summary).toContain('| deploy\\|healthy<br>fixture | success | commit\\|123 |')
  expect(summary).toContain('| timeout | failure |')
  expect(summary).toContain('candidate-action/012-timeout.log\\|tail')
  expect(summary).toContain('Failure evidence: ready')
  expect(summary).not.toContain('<script>')
  expect(summary).not.toContain('healthValue')
})

test('rejects malformed suite results before writing the GitHub step summary', () => {
  expect(() =>
    buildSuiteStepSummary({
      suiteResults: {
        candidate: {
          headSha: '0123456789abcdef0123456789abcdef01234567',
          imageDigest: `sha256:${'c'.repeat(64)}`,
          imageReference:
            'ghcr.io/47ng/actions-clever-cloud@sha256:cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc'
        },
        app: {
          id: 'app_facade42-cafe-babe-cafe-deadf00dbaad',
          name: 'actions-clever-cloud-e2e-123-4'
        },
        scenarios: [
          {
            name: 'timeout',
            outcome: 'unexpected',
            baselineInstanceId: null,
            instanceId: null,
            commitId: null,
            deploymentId: null,
            candidateActionLogs: []
          }
        ]
      },
      caller: 'manual',
      teardownOutcome: 'success',
      failureEvidenceReady: true
    })
  ).toThrow(
    'suite results.scenarios[0].outcome must be success, failure, or skipped'
  )
})

test('redacts raw and encoded credentials and the health value before scanning artifacts', () => {
  const token = 'token-123'
  const secret = 'secret-456'
  const healthValue = 'ABEiM0RVZneImaq7zN3u/w=='
  const joined = `${token}:${secret}`
  const encodedSecret = encodeURIComponent(secret)
  const encodedJoined = Buffer.from(joined, 'utf8').toString('base64')
  const encodedHealthValue = Buffer.from(healthValue, 'utf8').toString('base64')

  const redacted = redactArtifactContent(
    [
      token,
      secret,
      joined,
      encodedSecret,
      encodedJoined,
      healthValue,
      encodeURIComponent(healthValue),
      encodedHealthValue
    ].join('\n'),
    {
      token,
      secret,
      healthValue
    }
  )

  expect(redacted).not.toContain(token)
  expect(redacted).not.toContain(secret)
  expect(redacted).not.toContain(joined)
  expect(redacted).not.toContain(encodedSecret)
  expect(redacted).not.toContain(encodedJoined)
  expect(redacted).not.toContain(healthValue)
  expect(redacted).not.toContain(encodedHealthValue)
  expect(() =>
    scanArtifactContent(redacted, { token, secret, healthValue })
  ).not.toThrow()
})

test('prepares redacted failure evidence under safe artifact identifiers', async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'actions-clever-cloud-evidence-'))
  const sourcePath = path.join(directory, 'source.log')
  const outputDir = path.join(directory, 'upload')

  await writeFile(
    sourcePath,
    'token-123\nABEiM0RVZneImaq7zN3u/w==\nplain output\n',
    'utf8'
  )

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
      secret: 'secret-456',
      healthValue: 'ABEiM0RVZneImaq7zN3u/w=='
    }
  })

  await expect(
    readFile(path.join(outputDir, 'candidate-action/001-deploy-healthy.log'), 'utf8')
  ).resolves.toBe('[REDACTED]\n[REDACTED]\nplain output\n')
})

test('redacts common base64url credential and health value forms before scanning artifacts', () => {
  const token = 'token?123'
  const secret = 'secret?456'
  const healthValue = 'ABEiM0RVZneImaq7zN3u/w=='
  const joined = `${token}:${secret}`
  const encodedJoined = Buffer.from(joined, 'utf8')
    .toString('base64')
    .replaceAll('+', '-')
    .replaceAll('/', '_')
    .replace(/=+$/u, '')
  const encodedHealthValue = Buffer.from(healthValue, 'utf8')
    .toString('base64')
    .replaceAll('+', '-')
    .replaceAll('/', '_')
    .replace(/=+$/u, '')

  const redacted = redactArtifactContent(
    [encodedJoined, encodedHealthValue].join('\n'),
    {
      token,
      secret,
      healthValue
    }
  )

  expect(redacted).not.toContain(encodedJoined)
  expect(redacted).not.toContain(encodedHealthValue)
  expect(() =>
    scanArtifactContent(redacted, { token, secret, healthValue })
  ).not.toThrow()
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

  await writeFile(
    path.join(outputDir, 'late.log'),
    'ABEiM0RVZneImaq7zN3u/w==\n',
    'utf8'
  )

  await expect(
    verifyPreparedFailureEvidence({
      outputDir,
      credentials: {
        token: 'token-123',
        secret: 'secret-456',
        healthValue: 'ABEiM0RVZneImaq7zN3u/w=='
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
