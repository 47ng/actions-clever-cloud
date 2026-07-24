import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
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

const workflowsDir = fileURLToPath(
  new URL('../.github/workflows/', import.meta.url)
)
const e2eModulesDir = fileURLToPath(new URL('./e2e/', import.meta.url))
const scriptsDir = join(e2eModulesDir, 'scripts')

const allWorkflows: Array<[string, Workflow]> = readdirSync(workflowsDir)
  .filter(file => file.endsWith('.yml'))
  .sort()
  .map(file => [
    file,
    parse(readFileSync(`${workflowsDir}${file}`, 'utf8')) as Workflow
  ])

function workflowOf(file: string): Workflow {
  const entry = allWorkflows.find(([name]) => name === file)
  if (entry === undefined) {
    throw new Error(`Missing workflow ${file}`)
  }
  return entry[1]
}

const release = workflowOf('main.yml')
const preview = workflowOf('pr-preview.yml')
const manualPreview = workflowOf('pr-preview-manual.yml')
const e2eManual = workflowOf('e2e-manual.yml')
const e2eAutomatic = workflowOf('e2e-release-please.yml')
const e2eReusable = workflowOf('e2e-reusable.yml')

const e2eWorkflows = allWorkflows.filter(([name]) => name.startsWith('e2e-'))

const extractedWorkflows: Array<[string, Workflow]> = [
  ['e2e-manual.yml', e2eManual],
  ['e2e-release-please.yml', e2eAutomatic],
  ['e2e-reusable.yml', e2eReusable],
  ['pr-preview.yml', preview]
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

function importSpecifiersOf(source: string): string[] {
  return Array.from(
    source.matchAll(/from\s+'([^']+)'/g),
    match => match[1] ?? ''
  )
}

type ModuleClosure = {
  source: string
  externals: string[]
}

function closureOfScript(scriptName: string): ModuleClosure {
  const externals: string[] = []
  const sources: string[] = []
  const queue = [join(scriptsDir, scriptName)]
  const seen = new Set<string>()
  while (queue.length > 0) {
    const file = queue.pop()
    if (file === undefined || seen.has(file)) {
      continue
    }
    seen.add(file)
    const source = readFileSync(file, 'utf8')
    sources.push(source)
    for (const specifier of importSpecifiersOf(source)) {
      if (specifier.startsWith('.')) {
        queue.push(resolve(dirname(file), specifier))
      } else {
        externals.push(specifier)
      }
    }
  }
  return { source: sources.join('\n'), externals }
}

function expectNodeBuiltinsOnly(closure: ModuleClosure): void {
  expect(closure.externals.length).toBeGreaterThan(0)
  for (const specifier of closure.externals) {
    expect(specifier).toMatch(/^node:/)
  }
}

function scriptSourceOf(scriptName: string): string {
  return readFileSync(join(scriptsDir, scriptName), 'utf8')
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
    '%s never interpolates attacker-controllable event data into scripts',
    (file, workflow) => {
      const forbiddenInterpolations = [
        '${{ github.event.pull_request.',
        '${{ github.event.client_payload.',
        '${{ github.event.issue.',
        '${{ github.event.comment.',
        '${{ github.event.review',
        '${{ github.head_ref'
      ]
      for (const script of [
        ...runScriptsOf(workflow),
        ...githubScriptsOf(workflow)
      ]) {
        for (const interpolation of forbiddenInterpolations) {
          expect(script).not.toContain(interpolation)
        }
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

  test.each(allWorkflows)(
    '%s runs no inline node heredocs',
    (file, workflow) => {
      for (const run of runScriptsOf(workflow)) {
        expect(run).not.toContain('--input-type')
        expect(run).not.toContain("<<'EOF'")
      }
    }
  )

  test.each(extractedWorkflows)(
    '%s no longer uses github-script steps',
    (file, workflow) => {
      expect(
        stepsOf(workflow).filter(
          step => step.uses?.includes('github-script') ?? false
        )
      ).toEqual([])
    }
  )

  test.each(e2eWorkflows)(
    '%s never restores a shared package cache',
    (file, workflow) => {
      const setupNodeSteps = stepsOf(workflow).filter(
        step => step.uses?.startsWith('actions/setup-node@') ?? false
      )
      for (const step of setupNodeSteps) {
        expect(step.with?.['cache']).toBeUndefined()
      }
      expect(
        stepsOf(workflow).filter(
          step => step.uses?.startsWith('actions/cache@') ?? false
        )
      ).toEqual([])
    }
  )
})

describe('runtime module resolution', () => {
  test('every relative import under src/e2e names its .ts source explicitly', () => {
    const files = readdirSync(e2eModulesDir, { recursive: true })
      .map(String)
      .filter(file => file.endsWith('.ts'))
    expect(files.length).toBeGreaterThan(0)
    for (const file of files) {
      const source = readFileSync(join(e2eModulesDir, file), 'utf8')
      for (const specifier of importSpecifiersOf(source)) {
        if (specifier.startsWith('.')) {
          expect(specifier, `${file} imports ${specifier}`).toMatch(/\.ts$/)
        }
      }
    }
  })
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

  test('comments on the pull request only from a checkout pinned to the workflow SHA', () => {
    const commentSteps = jobOf(preview, 'comment').steps ?? []
    const checkout = onlyStep(
      commentSteps,
      step => step.uses?.startsWith('actions/checkout@') ?? false
    )
    expect(checkout.with?.['ref']).toBe('${{ github.sha }}')
    const comment = onlyStep(
      commentSteps,
      step => step.env?.['GH_TOKEN'] !== undefined
    )
    expect(comment.env?.['GH_TOKEN']).toBe('${{ github.token }}')
    expect(comment.run).toBe('node src/e2e/scripts/comment-docker-preview.ts')
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

  test('publishes fork builds only under preview-prefixed sha-bound tags labelled with the fork source', () => {
    const meta = onlyStep(stepsOf(manualPreview), step => step.id === 'meta')
    const run = meta.run ?? ''
    const tagLines = (run.match(/tags<<__TAGS_EOF__([\s\S]*?)__TAGS_EOF__/)?.[1] ?? '')
      .split('\n')
      .map(line => line.trim())
      .filter(line => line.startsWith('echo ') && line !== 'echo "')
    expect(tagLines.length).toBeGreaterThan(0)
    for (const line of tagLines) {
      expect(line).toMatch(/^echo "\$\{IMAGE\}:preview-/)
    }
    expect(run).toContain('"${IMAGE}:preview-pr-${PR_NUMBER}"')
    expect(run).toContain('"${IMAGE}:preview-git-${HEAD_SHA}"')
    expect(run).not.toContain(':latest')
    expect(run).toContain(
      'org.opencontainers.image.source=https://github.com/${FORK}/tree/${HEAD_SHA}'
    )
    const buildPush = onlyStep(
      stepsOf(manualPreview),
      step => step.uses?.startsWith('docker/build-push-action@') ?? false
    )
    expect(buildPush.with?.['tags']).toBe('${{ steps.meta.outputs.tags }}')
    expect(JSON.stringify(manualPreview)).not.toContain(
      'actions-clever-cloud-preview'
    )
  })
})

describe('e2e-manual', () => {
  test('accepts only the current head of exactly one open internal pull request, dispatched from master', () => {
    const resolveStep = onlyStep(
      jobOf(e2eManual, 'resolve').steps ?? [],
      step => step.env?.['GH_TOKEN'] !== undefined
    )
    expect(resolveStep.run).toBe(
      'node src/e2e/scripts/resolve-manual-candidate.ts'
    )
    expect(resolveStep.env?.['GH_TOKEN']).toBe('${{ github.token }}')
    expect(resolveStep.env?.['HEAD_SHA']).toBe('${{ inputs.head_sha }}')
    expect(resolveStep.env?.['RUN_REF']).toBe('${{ github.ref }}')
    const closure = closureOfScript('resolve-manual-candidate.ts')
    expect(closure.source).toContain('^[0-9a-f]{40}$')
    expect(closure.source).toContain("runRef !== 'refs/heads/master'")
    expect(closure.source).toContain('matches.length !== 1')
    expect(closure.source).toContain('pr.head.repo.full_name === thisRepo')
    expect(closure.source).toContain('pr.head.sha === headSha')
    expect(closure.source).toContain('https://api.github.com')
    expectNodeBuiltinsOnly(closure)
  })

  test('verifies the candidate image with builtin-only scripts from checkouts pinned to the workflow SHA', () => {
    for (const checkout of checkoutStepsOf(e2eManual)) {
      expect(checkout.with?.['ref']).toBe('${{ github.sha }}')
    }
    const steps = stepsOf(e2eManual)
    expect(
      steps.filter(step => step.uses?.startsWith('actions/setup-node@'))
    ).toEqual([])
    expect(
      steps.filter(step => step.uses?.startsWith('pnpm/action-setup@'))
    ).toEqual([])
    for (const run of runScriptsOf(e2eManual)) {
      expect(run).not.toContain('pnpm install')
      expect(run).not.toContain('candidate-image')
    }
    const verify = onlyStep(
      jobOf(e2eManual, 'candidate').steps ?? [],
      step => step.env?.['CANDIDATE_IMAGE'] !== undefined
    )
    expect(verify.run).toBe('node src/e2e/scripts/verify-image.ts')
    expectNodeBuiltinsOnly(closureOfScript('verify-image.ts'))
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
    const identity = onlyStep(
      jobOf(e2eAutomatic, 'resolve').steps ?? [],
      step => step.id === 'identity'
    )
    expect(identity.run).toBe(
      'node src/e2e/scripts/capture-release-candidate-identity.ts'
    )
    expect(identity.env?.['GH_TOKEN']).toBe('${{ github.token }}')
    const closure = closureOfScript('capture-release-candidate-identity.ts')
    expect(closure.source).toContain('pr.draft === false')
    expect(closure.source).toContain("pr.user.login === 'github-actions[bot]'")
    expect(closure.source).toContain(
      "pr.head.ref === 'release-please--branches--master'"
    )
    expect(closure.source).toContain('autorelease: pending')
    expect(closure.source).toContain('pr.head.repo.full_name === thisRepo')
    expect(closure.source).toContain('pr.base.repo.full_name === thisRepo')
    expect(closure.source).toContain('pr.base.ref === defaultBranch')
    expect(closure.source).toContain('https://api.github.com')
    expectNodeBuiltinsOnly(closure)
  })

  test('rechecks candidate freshness before image work and app creation', () => {
    const recheck = onlyStep(
      jobOf(e2eAutomatic, 'current-state').steps ?? [],
      step => step.id === 'current-state'
    )
    expect(recheck.run).toBe(
      'node src/e2e/scripts/recheck-release-candidate-freshness.ts'
    )
    expect(recheck.env?.['GH_TOKEN']).toBe('${{ github.token }}')
    const closure = closureOfScript('recheck-release-candidate-freshness.ts')
    expect(closure.source).toContain('pr.head.sha === headSha')
    expect(closure.source).toContain('buildSupersededSummary')
    expectNodeBuiltinsOnly(closure)
    expect(jobOf(e2eAutomatic, 'candidate').if).toBe(
      "needs.current-state.outputs.proceed == 'true'"
    )
    expect(jobOf(e2eAutomatic, 'create-and-delete').if).toBe(
      "needs.current-state.outputs.proceed == 'true'"
    )
  })

  test('verifies candidate images with builtin-only scripts protected from the candidate checkout', () => {
    expect(
      stepsOf(e2eAutomatic).filter(step =>
        step.uses?.startsWith('actions/setup-node@')
      )
    ).toEqual([])
    for (const run of runScriptsOf(e2eAutomatic)) {
      expect(run).not.toContain('pnpm install')
      expect(run).not.toContain('candidate-image')
    }
    const candidateSteps = jobOf(e2eAutomatic, 'candidate').steps ?? []
    const protect = onlyStep(candidateSteps, step =>
      (step.run ?? '').includes('trusted-e2e')
    )
    expect(protect.run).toContain('cp -R src/e2e')
    const sourceCheckout = onlyStep(
      candidateSteps,
      step =>
        (step.uses?.startsWith('actions/checkout@') ?? false) &&
        step.with?.['ref'] === '${{ needs.resolve.outputs.head_sha }}'
    )
    expect(candidateSteps.indexOf(protect)).toBeLessThan(
      candidateSteps.indexOf(sourceCheckout)
    )
    for (const checkout of checkoutStepsOf(e2eAutomatic)) {
      if (checkout === sourceCheckout) {
        continue
      }
      expect(checkout.with?.['ref']).toBe('${{ github.sha }}')
    }
    const verifySteps = candidateSteps.filter(
      step => step.env?.['EXPECTED_REVISION'] !== undefined
    )
    expect(verifySteps.length).toBeGreaterThan(0)
    for (const step of verifySteps) {
      expect(step.env?.['TRUSTED_E2E_DIR']).toBe(
        '${{ runner.temp }}/trusted-e2e'
      )
      expect(step.run).toMatch(
        /^node "\$TRUSTED_E2E_DIR"\/scripts\/[a-z-]+\.ts$/
      )
    }
    expectNodeBuiltinsOnly(closureOfScript('probe-existing-image.ts'))
    expectNodeBuiltinsOnly(closureOfScript('verify-image.ts'))
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
  const trustedScriptNames = [
    'validate-candidate-inputs.ts',
    'recheck-candidate-staleness.ts',
    'prepare-evidence-directories.ts',
    'assert-timeout-contract.ts',
    'delete-app-and-prepare-evidence.ts',
    'pin-candidate-action.ts'
  ]

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

  test('invokes every extracted script from an explicit trust source', () => {
    const invocations = runScriptsOf(e2eReusable).filter(run =>
      run.startsWith('node ')
    )
    expect(invocations.length).toBeGreaterThan(0)
    for (const run of invocations) {
      const trusted =
        run.startsWith('node .workflow-source/src/e2e/scripts/') ||
        run.startsWith('node "$TRUSTED_WORKFLOW_DIR"/src/e2e/scripts/') ||
        run === 'node "$PIN_CANDIDATE_ACTION_SCRIPT"'
      const candidate = run.startsWith(
        'node .candidate-source/src/e2e/scripts/'
      )
      expect(trusted || candidate, run).toBe(true)
      if (candidate) {
        for (const scriptName of trustedScriptNames) {
          expect(run).not.toContain(scriptName)
        }
      }
    }
    for (const step of suiteSteps) {
      if ((step.run ?? '').includes('$TRUSTED_WORKFLOW_DIR')) {
        expect(step.env?.['TRUSTED_WORKFLOW_DIR']).toBe(
          '${{ runner.temp }}/trusted-workflow'
        )
      }
    }
  })

  test('validates candidate identity inputs against digest pinning and repository origin', () => {
    const validate = onlyStep(
      suiteSteps,
      step => step.env?.['CANDIDATE_SOURCE_REPOSITORY'] !== undefined
    )
    expect(validate.run).toBe(
      'node .workflow-source/src/e2e/scripts/validate-candidate-inputs.ts'
    )
    const source = scriptSourceOf('validate-candidate-inputs.ts')
    expect(source).toContain('sha256:[0-9a-f]{64}')
    expect(source).toContain('endsWith(`@${candidateDigest}`)')
    expect(source).toContain('candidateSourceRepository !== thisRepo')
    expect(importSpecifiersOf(source)).toEqual([])
  })

  test('rechecks staleness after approval and gates every later step on the result', () => {
    const recheck = onlyStep(suiteSteps, step => step.id === 'candidate-state')
    expect(recheck.run).toBe(
      'node .workflow-source/src/e2e/scripts/recheck-candidate-staleness.ts'
    )
    expect(recheck.env?.['GH_TOKEN']).toBe('${{ github.token }}')
    const closure = closureOfScript('recheck-candidate-staleness.ts')
    expect(closure.source).toContain('pr.head.sha !== headSha')
    expect(closure.source).toContain('buildSupersededSummary')
    expect(closure.source).toContain('https://api.github.com')
    expectNodeBuiltinsOnly(closure)
    const recheckIndex = suiteSteps.indexOf(recheck)
    for (const step of suiteSteps.slice(0, recheckIndex)) {
      expect(JSON.stringify(step)).not.toContain('.candidate-source')
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
        String(value).includes('pin-candidate-action')
      )
    )
    expect(pinSteps.length).toBeGreaterThan(0)
    for (const step of pinSteps) {
      expect(step.env?.['PIN_CANDIDATE_ACTION_SCRIPT']).toBe(
        '${{ runner.temp }}/trusted-workflow/src/e2e/scripts/pin-candidate-action.ts'
      )
      expect(step.run).toBe('node "$PIN_CANDIDATE_ACTION_SCRIPT"')
    }
    for (const run of runScriptsOf(e2eReusable)) {
      expect(run).not.toContain('pin-candidate-action')
    }
    expect(
      existsSync(
        fileURLToPath(
          new URL(
            '../.github/scripts/pin-candidate-action.mjs',
            import.meta.url
          )
        )
      )
    ).toBe(false)
  })

  test('keeps candidate code out of the credentialed teardown step', () => {
    const deleteApp = onlyStep(suiteSteps, step => {
      const keys = envKeysOf(step)
      return keys.includes('CLEVER_TOKEN') && keys.includes('E2E_HEALTH_VALUE')
    })
    expect(deleteApp.if).toContain('always()')
    expect(deleteApp.run).toBe(
      'node "$TRUSTED_WORKFLOW_DIR"/src/e2e/scripts/delete-app-and-prepare-evidence.ts'
    )
    expect(deleteApp.env?.['TRUSTED_WORKFLOW_DIR']).toBe(
      '${{ runner.temp }}/trusted-workflow'
    )
    const closure = closureOfScript('delete-app-and-prepare-evidence.ts')
    for (const specifier of importSpecifiersOf(closure.source)) {
      expect(specifier).not.toContain('.candidate-source')
    }
    expectNodeBuiltinsOnly(closure)
  })

  test('prepares and verifies failure evidence through the trusted evidence module', () => {
    const source = scriptSourceOf('delete-app-and-prepare-evidence.ts')
    expect(importSpecifiersOf(source)).toContain('../evidence.ts')
    expect(source).toContain('prepareFailureEvidence')
    const verifyIndex = source.indexOf('await verifyPreparedFailureEvidence(')
    expect(verifyIndex).toBeGreaterThan(-1)
    expect(source.indexOf('failure_evidence_ready=true')).toBeGreaterThan(
      verifyIndex
    )
    const evidenceSource = readFileSync(
      join(e2eModulesDir, 'evidence.ts'),
      'utf8'
    )
    const encodingMarkers = [
      '${credentials.token}:${credentials.secret}',
      'encodeURIComponent(value)',
      ".toString('base64')",
      "replaceAll('+', '-')"
    ]
    for (const marker of encodingMarkers) {
      expect(evidenceSource).toContain(marker)
    }
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
    expect(scriptSourceOf('write-suite-summary.ts')).not.toContain(
      'E2E_HEALTH_VALUE'
    )
  })

  test('asserts the documented timeout contract message from the trusted workflow copy', () => {
    const timeoutAssertion = onlyStep(
      suiteSteps,
      step =>
        step.env?.['ACTION_OUTCOME'] === '${{ steps.timeout-deploy.outcome }}'
    )
    expect(timeoutAssertion.run).toBe(
      'node "$TRUSTED_WORKFLOW_DIR"/src/e2e/scripts/assert-timeout-contract.ts'
    )
    expect(scriptSourceOf('assert-timeout-contract.ts')).toContain(
      'Deployment timed out, moving on with workflow run'
    )
  })
})
