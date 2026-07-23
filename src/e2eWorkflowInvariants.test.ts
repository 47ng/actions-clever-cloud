import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, test } from 'vitest'
import { parse } from 'yaml'

type Step = {
  name?: string
  id?: string
  if?: string
  uses?: string
  run?: string
  env?: Record<string, string>
  with?: Record<string, unknown>
}

type Concurrency = {
  group?: string
  'cancel-in-progress'?: boolean
}

type Job = {
  if?: string
  uses?: string
  secrets?: unknown
  environment?: string | { name?: string }
  steps?: Step[]
  with?: Record<string, unknown>
}

type Trigger = {
  types?: string[]
  paths?: string[]
}

type Workflow = {
  on: Record<string, Trigger | null>
  permissions?: Record<string, string>
  concurrency?: Concurrency
  jobs: Record<string, Job>
}

function loadWorkflow(file: string): Workflow {
  const url = new URL(`../.github/workflows/${file}`, import.meta.url)
  return parse(readFileSync(fileURLToPath(url), 'utf8')) as Workflow
}

const release = loadWorkflow('main.yml')
const preview = loadWorkflow('pr-preview.yml')
const manualPreview = loadWorkflow('pr-preview-manual.yml')
const e2eManual = loadWorkflow('e2e-manual.yml')
const e2eAutomatic = loadWorkflow('e2e-release-please.yml')
const e2eReusable = loadWorkflow('e2e-reusable.yml')

const allWorkflows: Array<[string, Workflow]> = [
  ['main.yml', release],
  ['pr-preview.yml', preview],
  ['pr-preview-manual.yml', manualPreview],
  ['e2e-manual.yml', e2eManual],
  ['e2e-release-please.yml', e2eAutomatic],
  ['e2e-reusable.yml', e2eReusable]
]

const e2eWorkflows: Array<[string, Workflow]> = [
  ['e2e-manual.yml', e2eManual],
  ['e2e-release-please.yml', e2eAutomatic],
  ['e2e-reusable.yml', e2eReusable]
]

function jobOf(workflow: Workflow, id: string): Job {
  const job = workflow.jobs[id]
  if (job === undefined) {
    throw new Error(`Missing job ${id}`)
  }
  return job
}

function stepsOf(workflow: Workflow): Step[] {
  return Object.values(workflow.jobs).flatMap(job => job.steps ?? [])
}

function runScriptsOf(workflow: Workflow): string[] {
  return stepsOf(workflow).flatMap(step =>
    typeof step.run === 'string' ? [step.run] : []
  )
}

function scriptOf(step: Step): string | null {
  const script = step.with?.['script']
  return typeof script === 'string' ? script : null
}

function githubScriptsOf(workflow: Workflow): string[] {
  return stepsOf(workflow).flatMap(step => {
    const script = scriptOf(step)
    return script === null ? [] : [script]
  })
}

function checkoutStepsOf(workflow: Workflow): Step[] {
  return stepsOf(workflow).filter(
    step => step.uses?.startsWith('actions/checkout@') ?? false
  )
}

function envKeysOf(step: Step): string[] {
  return Object.keys(step.env ?? {})
}

function onlyStep(steps: Step[], predicate: (step: Step) => boolean): Step {
  const matches = steps.filter(predicate)
  const match = matches[0]
  if (matches.length !== 1 || match === undefined) {
    throw new Error(
      `Expected exactly one matching step, found ${matches.length}`
    )
  }
  return match
}

function importSpecifiersOf(script: string): string[] {
  return Array.from(
    script.matchAll(/from\s+'([^']+)'/g),
    match => match[1] ?? ''
  )
}

describe('shared workflow policies', () => {
  test.each(allWorkflows)(
    '%s denies all top-level permissions',
    (file, workflow) => {
      expect(workflow.permissions).toEqual({})
    }
  )

  test.each(allWorkflows)(
    '%s never inherits or forwards secrets to called workflows',
    (file, workflow) => {
      for (const job of Object.values(workflow.jobs)) {
        expect(job.secrets).toBeUndefined()
      }
    }
  )

  test.each(allWorkflows)(
    '%s never persists checkout credentials',
    (file, workflow) => {
      for (const checkout of checkoutStepsOf(workflow)) {
        expect(checkout.with?.['persist-credentials']).toBe(false)
      }
    }
  )

  test.each(allWorkflows)(
    '%s never interpolates pull request event data into scripts',
    (file, workflow) => {
      for (const script of [
        ...runScriptsOf(workflow),
        ...githubScriptsOf(workflow)
      ]) {
        expect(script).not.toContain('${{ github.event.pull_request.')
      }
    }
  )

  test.each(allWorkflows)(
    '%s installs dependencies without lifecycle scripts',
    (file, workflow) => {
      for (const run of runScriptsOf(workflow)) {
        if (run.includes('pnpm install')) {
          expect(run).toContain('--ignore-scripts')
        }
      }
    }
  )

  test.each(allWorkflows)('%s never calls clever login', (file, workflow) => {
    for (const script of [
      ...runScriptsOf(workflow),
      ...githubScriptsOf(workflow)
    ]) {
      expect(script).not.toContain('clever login')
    }
  })

  test.each(e2eWorkflows)(
    '%s never restores a shared package cache',
    (file, workflow) => {
      const setupNodeSteps = stepsOf(workflow).filter(
        step => step.uses?.startsWith('actions/setup-node@') ?? false
      )
      for (const step of setupNodeSteps) {
        expect(step.with?.['cache']).toBeUndefined()
      }
    }
  )
})

describe('pr-preview', () => {
  test('builds only for pull requests from this repository', () => {
    expect(jobOf(preview, 'build').if).toBe(
      'github.event.pull_request.head.repo.full_name == github.repository'
    )
  })

  test('reads the pull request head SHA through env indirection', () => {
    const shaStep = onlyStep(
      stepsOf(preview),
      step =>
        step.env?.['HEAD_SHA'] === '${{ github.event.pull_request.head.sha }}'
    )
    expect(shaStep.run).toContain('$HEAD_SHA')
  })

  test('keeps one non-cancelling concurrency group per pull request', () => {
    expect(preview.concurrency?.group).toContain(
      '${{ github.event.pull_request.number }}'
    )
    expect(preview.concurrency?.['cancel-in-progress']).toBe(false)
  })

  test('watches action inputs but skips docs-only and test-only changes', () => {
    const paths = preview.on['pull_request']?.paths ?? []
    expect(paths).toContain('action.yml')
    expect(paths).toContain('.github/workflows/*e2e*.yml')
    expect(paths).toContain('!src/**/*.test.ts')
    expect(paths).not.toContain('README.md')
    expect(paths.filter(path => path.startsWith('docs/'))).toEqual([])
  })
})

describe('pr-preview-manual', () => {
  test('requires a full SHA matching exactly one open pull request head', () => {
    const script = githubScriptsOf(manualPreview).join('\n')
    expect(script).toContain('^[0-9a-f]{40}$')
    expect(script).toContain('pr.head.sha === headSha')
    expect(script).toContain('matches.length !== 1')
  })

  test('checks out the fork only at the vetted immutable SHA', () => {
    const checkout = onlyStep(
      stepsOf(manualPreview),
      step => step.uses?.startsWith('actions/checkout@') ?? false
    )
    expect(checkout.with?.['ref']).toBe('${{ inputs.head_sha }}')
    expect(checkout.with?.['repository']).toBe(
      '${{ needs.resolve.outputs.fork_full_name }}'
    )
  })

  test('executes no repository code on the runner host', () => {
    const steps = stepsOf(manualPreview)
    expect(
      steps.filter(step => step.uses?.startsWith('actions/setup-node@'))
    ).toEqual([])
    expect(steps.filter(step => step.uses?.startsWith('./'))).toEqual([])
    for (const run of runScriptsOf(manualPreview)) {
      expect(run).not.toContain('./src/')
    }
  })

  test('publishes fork builds only to the isolated preview package', () => {
    expect(JSON.stringify(manualPreview)).toContain(
      'ghcr.io/47ng/actions-clever-cloud-preview'
    )
    expect(JSON.stringify(preview)).not.toContain(
      'actions-clever-cloud-preview'
    )
    expect(JSON.stringify(release)).not.toContain(
      'actions-clever-cloud-preview'
    )
  })
})

describe('e2e-manual', () => {
  test('accepts only the current head of exactly one open internal pull request, dispatched from master', () => {
    const script = githubScriptsOf(e2eManual).join('\n')
    expect(script).toContain('^[0-9a-f]{40}$')
    expect(script).toContain('pr.head.repo.full_name === thisRepo')
    expect(script).toContain('pr.head.sha === headSha')
    expect(script).toContain('matches.length !== 1')
    expect(script).toContain("runRef !== 'refs/heads/master'")
  })

  test('verifies the candidate image without checkout, setup-node, or repository imports', () => {
    const candidateSteps = jobOf(e2eManual, 'candidate').steps ?? []
    expect(
      candidateSteps.filter(step => step.uses?.startsWith('actions/checkout@'))
    ).toEqual([])
    expect(
      candidateSteps.filter(step =>
        step.uses?.startsWith('actions/setup-node@')
      )
    ).toEqual([])
    const verify = onlyStep(
      candidateSteps,
      step => step.env?.['CANDIDATE_IMAGE'] !== undefined
    )
    const specifiers = importSpecifiersOf(verify.run ?? '')
    expect(specifiers.length).toBeGreaterThan(0)
    for (const specifier of specifiers) {
      expect(specifier).toMatch(/^node:/)
    }
    for (const run of runScriptsOf(e2eManual)) {
      expect(run).not.toContain('candidate-image')
    }
  })

  test('passes the digest-pinned candidate identity to the reusable suite', () => {
    const caller = jobOf(e2eManual, 'create-and-delete')
    expect(caller.uses).toBe('./.github/workflows/e2e-reusable.yml')
    expect(caller.with?.['candidate_digest']).toBe(
      '${{ needs.candidate.outputs.digest }}'
    )
    expect(caller.with?.['candidate_image']).toBe(
      '${{ needs.candidate.outputs.image }}'
    )
    expect(caller.with?.['trusted_workflow_sha']).toBe('${{ github.sha }}')
    expect(caller.with?.['caller']).toBe('manual')
  })
})

describe('e2e-release-please', () => {
  test('triggers only on repository dispatch and deliberate pull request target events', () => {
    expect(e2eAutomatic.on['pull_request']).toBeUndefined()
    expect(e2eAutomatic.on['repository_dispatch']?.types).toContain(
      'release-please-candidate'
    )
    const paths = e2eAutomatic.on['pull_request_target']?.paths ?? []
    expect(paths.length).toBeGreaterThan(0)
    expect(paths).not.toContain('README.md')
    expect(paths.filter(path => path.startsWith('docs/'))).toEqual([])
  })

  test('requires the exact release please candidate identity', () => {
    const eligibility = scriptOf(
      onlyStep(
        jobOf(e2eAutomatic, 'resolve').steps ?? [],
        step => scriptOf(step) !== null
      )
    )
    expect(eligibility).toContain('pr.draft === false')
    expect(eligibility).toContain("pr.user.login === 'github-actions[bot]'")
    expect(eligibility).toContain(
      "pr.head.ref === 'release-please--branches--master'"
    )
    expect(eligibility).toContain('autorelease: pending')
    expect(eligibility).toContain('pr.head.repo.full_name === thisRepo')
    expect(eligibility).toContain('pr.base.repo.full_name === thisRepo')
    expect(eligibility).toContain('pr.base.ref === defaultBranch')
  })

  test('rechecks candidate freshness before image work and app creation', () => {
    const recheck = scriptOf(
      onlyStep(
        jobOf(e2eAutomatic, 'current-state').steps ?? [],
        step => scriptOf(step) !== null
      )
    )
    expect(recheck).toContain('pr.head.sha === headSha')
    expect(jobOf(e2eAutomatic, 'candidate').if).toBe(
      "needs.current-state.outputs.proceed == 'true'"
    )
    expect(jobOf(e2eAutomatic, 'create-and-delete').if).toBe(
      "needs.current-state.outputs.proceed == 'true'"
    )
  })

  test('verifies candidate images with self-contained scripts and pinned checkouts', () => {
    expect(
      stepsOf(e2eAutomatic).filter(step =>
        step.uses?.startsWith('actions/setup-node@')
      )
    ).toEqual([])
    const candidateSteps = jobOf(e2eAutomatic, 'candidate').steps ?? []
    const verifySteps = candidateSteps.filter(
      step =>
        step.env?.['EXPECTED_REVISION'] !== undefined &&
        typeof step.run === 'string'
    )
    expect(verifySteps.length).toBeGreaterThan(0)
    for (const step of verifySteps) {
      const specifiers = importSpecifiersOf(step.run ?? '')
      expect(specifiers.length).toBeGreaterThan(0)
      for (const specifier of specifiers) {
        expect(specifier).toMatch(/^node:/)
      }
    }
    for (const checkout of checkoutStepsOf(e2eAutomatic)) {
      expect(checkout.with?.['ref']).toBe(
        '${{ needs.resolve.outputs.head_sha }}'
      )
    }
    for (const run of runScriptsOf(e2eAutomatic)) {
      expect(run).not.toContain('candidate-image')
    }
  })

  test('passes the digest-pinned candidate identity to the reusable suite', () => {
    const caller = jobOf(e2eAutomatic, 'create-and-delete')
    expect(caller.uses).toBe('./.github/workflows/e2e-reusable.yml')
    expect(caller.with?.['candidate_digest']).toBe(
      '${{ needs.candidate.outputs.digest }}'
    )
    expect(caller.with?.['candidate_image']).toBe(
      '${{ needs.candidate.outputs.image }}'
    )
    expect(caller.with?.['trusted_workflow_sha']).toBe('${{ github.sha }}')
    expect(caller.with?.['caller']).toBe('automatic')
  })

  test('keeps one non-cancelling concurrency group per candidate pull request', () => {
    expect(e2eAutomatic.concurrency?.group).toContain(
      '${{ github.event.client_payload.pr_number || github.event.pull_request.number }}'
    )
    expect(e2eAutomatic.concurrency?.['cancel-in-progress']).toBe(false)
  })
})

describe('e2e-reusable', () => {
  const suiteJob = jobOf(e2eReusable, 'create-and-delete')
  const suiteSteps = suiteJob.steps ?? []

  test('gates credentialed work behind the protected environment', () => {
    const environment = suiteJob.environment
    const name =
      typeof environment === 'string' ? environment : environment?.name
    expect(name).toBe('clever-cloud-e2e')
  })

  test('keeps one non-cancelling concurrency group per pull request', () => {
    expect(e2eReusable.concurrency?.group).toContain('${{ inputs.pr_number }}')
    expect(e2eReusable.concurrency?.['cancel-in-progress']).toBe(false)
  })

  test('validates candidate identity inputs against digest pinning and repository origin', () => {
    const validate = onlyStep(
      suiteSteps,
      step => step.env?.['CANDIDATE_SOURCE_REPOSITORY'] !== undefined
    )
    expect(validate.run).toContain('sha256:[0-9a-f]{64}')
    expect(validate.run).toContain('endsWith(`@${candidateDigest}`)')
    expect(validate.run).toContain('candidateSourceRepository !== thisRepo')
  })

  test('rechecks staleness after approval and gates every later step on the result', () => {
    const recheck = onlyStep(suiteSteps, step => step.id === 'candidate-state')
    expect(scriptOf(recheck)).toContain('pr.head.sha !== headSha')
    const recheckIndex = suiteSteps.indexOf(recheck)
    for (const step of suiteSteps.slice(0, recheckIndex)) {
      expect(step.run ?? '').not.toContain('.candidate-source')
      expect(step.uses ?? '').not.toMatch(/^\.\//)
    }
    for (const step of suiteSteps.slice(recheckIndex + 1)) {
      const guard = step.if ?? ''
      const gated =
        guard.includes("steps.candidate-state.outputs.proceed == 'true'") ||
        guard.includes(
          "steps.delete-app.outputs.failure_evidence_ready == 'true'"
        )
      expect(gated).toBe(true)
    }
  })

  test('checks out only immutable input SHAs', () => {
    const refs = checkoutStepsOf(e2eReusable).map(step => step.with?.['ref'])
    expect(refs).toHaveLength(2)
    expect(refs).toContain('${{ inputs.trusted_workflow_sha }}')
    expect(refs).toContain('${{ inputs.head_sha }}')
  })

  test('pins candidate action metadata only with the trusted workflow copy of the pin script', () => {
    const pinSteps = suiteSteps.filter(step =>
      Object.values(step.env ?? {}).some(value =>
        String(value).includes('pin-candidate-action.mjs')
      )
    )
    expect(pinSteps.length).toBeGreaterThan(0)
    for (const step of pinSteps) {
      expect(step.env?.['PIN_CANDIDATE_ACTION_SCRIPT']).toBe(
        '${{ runner.temp }}/trusted-workflow/.github/scripts/pin-candidate-action.mjs'
      )
      expect(step.run).toContain('node "$PIN_CANDIDATE_ACTION_SCRIPT"')
    }
    for (const run of runScriptsOf(e2eReusable)) {
      expect(run).not.toContain('pin-candidate-action.mjs')
    }
  })

  test('keeps candidate imports out of the credentialed teardown step', () => {
    const deleteApp = onlyStep(suiteSteps, step => {
      const keys = envKeysOf(step)
      return keys.includes('CLEVER_TOKEN') && keys.includes('E2E_HEALTH_VALUE')
    })
    expect(deleteApp.if).toContain('always()')
    const run = deleteApp.run ?? ''
    expect(run).not.toMatch(/from\s+'[^']*\.candidate-source/)
    expect(run).toContain('scanArtifactContent')
    const verifyIndex = run.indexOf('await verifyPreparedFailureEvidence(')
    expect(verifyIndex).toBeGreaterThan(-1)
    expect(run.indexOf('failure_evidence_ready=true')).toBeGreaterThan(
      verifyIndex
    )
  })

  test('uploads failure evidence without credentials and only after the redaction scan', () => {
    const upload = onlyStep(
      suiteSteps,
      step => step.uses?.startsWith('actions/upload-artifact@') ?? false
    )
    expect(upload.if).toContain(
      "steps.delete-app.outputs.failure_evidence_ready == 'true'"
    )
    const keys = envKeysOf(upload)
    expect(keys).not.toContain('CLEVER_TOKEN')
    expect(keys).not.toContain('CLEVER_SECRET')
    expect(keys).not.toContain('E2E_HEALTH_VALUE')
  })

  test('writes the step summary without the generated health value', () => {
    const summary = onlyStep(suiteSteps, step =>
      envKeysOf(step).includes('TEARDOWN_OUTCOME')
    )
    expect(envKeysOf(summary)).not.toContain('E2E_HEALTH_VALUE')
    expect(summary.run ?? '').not.toContain('E2E_HEALTH_VALUE')
  })

  test('asserts the documented timeout contract message', () => {
    const timeoutAssertion = onlyStep(
      suiteSteps,
      step =>
        step.env?.['ACTION_OUTCOME'] === '${{ steps.timeout-deploy.outcome }}'
    )
    expect(timeoutAssertion.run).toContain(
      'Deployment timed out, moving on with workflow run'
    )
  })
})
