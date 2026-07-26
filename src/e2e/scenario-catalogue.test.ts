import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { expect, test } from 'vitest'
import { parse } from 'yaml'
import {
  SCENARIO_CATALOGUE,
  scenarioByName,
  type ScenarioName
} from './scenario-catalogue.ts'

type Step = {
  id?: string
  uses?: string
  env?: Record<string, string>
  with?: Record<string, unknown>
}

type Job = {
  steps?: Step[]
}

type Workflow = {
  jobs: Record<string, Job>
}

const workflowPath = fileURLToPath(
  new URL('../../.github/workflows/e2e-reusable.yml', import.meta.url)
)

const workflow: Workflow = parse(readFileSync(workflowPath, 'utf8'))

const suiteSteps: Step[] = workflow.jobs['create-and-delete']?.steps ?? []

function envKeysOf(step: Step): string[] {
  return Object.keys(step.env ?? {})
}

const candidateActionSteps: Step[] = suiteSteps.filter(
  step => step.uses === './.candidate-action'
)

const teardownStep: Step | undefined = suiteSteps.find(step => {
  const keys = envKeysOf(step)
  return keys.includes('CLEVER_TOKEN') && keys.includes('E2E_HEALTH_VALUE')
})

test('every catalogue entry has a matching action step in the workflow', () => {
  for (const scenario of SCENARIO_CATALOGUE) {
    const step = suiteSteps.find(
      candidate => candidate.id === scenario.workflowStepId
    )
    expect(step, `missing step ${scenario.workflowStepId}`).toBeDefined()
    expect(step?.uses).toBe('./.candidate-action')
    expect(step?.with?.['logFile']).toBe(`.e2e-artifacts/${scenario.logFile}`)
  }
})

test('every candidate action step in the workflow has a catalogue entry', () => {
  expect(candidateActionSteps.length).toBe(SCENARIO_CATALOGUE.length)
  const workflowStepIds: Set<string> = new Set(
    SCENARIO_CATALOGUE.map(scenario => scenario.workflowStepId)
  )
  for (const step of candidateActionSteps) {
    const matches = SCENARIO_CATALOGUE.filter(
      scenario => scenario.workflowStepId === step.id
    )
    expect(matches.length, `step id ${step.id}`).toBe(1)
    expect(workflowStepIds.has(step.id ?? '')).toBe(true)
  }
})

test("every catalogue entry's logPathEnvName is set on the teardown step, to the matching path", () => {
  expect(teardownStep).toBeDefined()
  for (const scenario of SCENARIO_CATALOGUE) {
    expect(teardownStep?.env?.[scenario.logPathEnvName]).toBe(
      '${{ github.workspace }}/.e2e-artifacts/' + scenario.logFile
    )
  }
})

test('the teardown step declares no *_LOG_PATH variable the catalogue does not know about', () => {
  const teardownLogPathKeys = envKeysOf(teardownStep ?? {}).filter(key =>
    key.endsWith('_LOG_PATH')
  )
  const catalogueLogPathEnvNames = SCENARIO_CATALOGUE.map(
    scenario => scenario.logPathEnvName
  )
  expect(new Set(teardownLogPathKeys)).toEqual(
    new Set(catalogueLogPathEnvNames)
  )
})

test('names, log files, env names and step ids are each unique', () => {
  expect(new Set(SCENARIO_CATALOGUE.map(scenario => scenario.name)).size).toBe(
    SCENARIO_CATALOGUE.length
  )
  expect(
    new Set(SCENARIO_CATALOGUE.map(scenario => scenario.logFile)).size
  ).toBe(SCENARIO_CATALOGUE.length)
  expect(
    new Set(SCENARIO_CATALOGUE.map(scenario => scenario.logPathEnvName)).size
  ).toBe(SCENARIO_CATALOGUE.length)
  expect(
    new Set(SCENARIO_CATALOGUE.map(scenario => scenario.workflowStepId)).size
  ).toBe(SCENARIO_CATALOGUE.length)
})

test('scenarioByName throws on an unknown name', () => {
  // Cast past the narrowed parameter type to exercise the runtime guard.
  expect(() => scenarioByName('nope' as ScenarioName)).toThrow(
    'Unknown E2E scenario: nope'
  )
})

test('the timeout scenario is last', () => {
  // The timeout case is placed last so its remote work cannot interfere
  // with later deployment scenarios.
  expect(SCENARIO_CATALOGUE.at(-1)?.name).toBe('timeout-cancelled')
})
