import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, test } from 'vitest'

function readProjectFile(path: string): string {
  return readFileSync(fileURLToPath(new URL(path, import.meta.url)), 'utf8')
}

const reusableWorkflow = readProjectFile('../.github/workflows/e2e-reusable.yml')

describe('e2e failure evidence workflow policies', () => {
  test('the reusable workflow writes structured results, prepares redacted failure evidence before teardown, and uploads only failure artifacts without credentials', () => {
    expect(reusableWorkflow).toContain('name: Prepare evidence directories')
    expect(reusableWorkflow).toContain('name: Write structured scenario results')
    expect(reusableWorkflow).toContain(
      "import {\n            buildExpectedFailureOutcome,\n            buildSuccessfulScenarioOutcome,\n            buildSuiteResults,\n            writeSuiteResults\n          } from './.candidate-source/src/e2e/evidence.ts'"
    )
    expect(reusableWorkflow).toContain(
      'outcome: buildExpectedFailureOutcome({'
    )
    expect(reusableWorkflow).toContain('baselineInstanceId: null')
    expect(reusableWorkflow).toContain('instanceId:')
    expect(reusableWorkflow).toContain(
      "name: Prepare failure evidence\n        if: always() && steps.candidate-state.outputs.proceed == 'true'"
    )
    expect(reusableWorkflow).toContain('name: Verify failure evidence after teardown')
    expect(reusableWorkflow).toContain('name: Upload failure evidence')
    expect(reusableWorkflow).toContain('logFile: .e2e-artifacts/candidate-action/001-deploy-healthy.log')
    expect(reusableWorkflow).toContain('logFile: .e2e-artifacts/candidate-action/002-deploy-env.log')
    expect(reusableWorkflow).toContain('logFile: .e2e-artifacts/candidate-action/003-same-commit-error.log')
    expect(reusableWorkflow).toContain('logFile: .e2e-artifacts/candidate-action/004-same-commit-ignore.log')
    expect(reusableWorkflow).toContain('logFile: .e2e-artifacts/candidate-action/005-same-commit-restart.log')
    expect(reusableWorkflow).toContain('logFile: .e2e-artifacts/candidate-action/006-same-commit-rebuild.log')
    expect(reusableWorkflow).toContain("candidateActionLogs: ['candidate-action/001-deploy-healthy.log']")
    expect(reusableWorkflow).toContain("candidateActionLogs: ['candidate-action/002-deploy-env.log']")
    expect(reusableWorkflow).toContain("candidateActionLogs: ['candidate-action/003-same-commit-error.log']")
    expect(reusableWorkflow).toContain("candidateActionLogs: ['candidate-action/004-same-commit-ignore.log']")
    expect(reusableWorkflow).toContain("candidateActionLogs: ['candidate-action/005-same-commit-restart.log']")
    expect(reusableWorkflow).toContain("candidateActionLogs: ['candidate-action/006-same-commit-rebuild.log']")
    expect(reusableWorkflow).toContain("steps.prepare-failure-evidence.outcome == 'success'")
    expect(reusableWorkflow).toContain("steps.verify-failure-evidence.outcome == 'success'")
    expect(reusableWorkflow).toContain('retention-days: 3')
    expect(reusableWorkflow).toContain('name: clever-cloud-e2e-failure-${{ github.run_id }}-${{ github.run_attempt }}')

    const prepareIndex = reusableWorkflow.indexOf('name: Prepare failure evidence')
    const deleteIndex = reusableWorkflow.indexOf('name: Delete the captured app')
    const verifyIndex = reusableWorkflow.indexOf('name: Verify failure evidence after teardown')
    const uploadIndex = reusableWorkflow.indexOf('name: Upload failure evidence')

    expect(prepareIndex).toBeGreaterThan(-1)
    expect(deleteIndex).toBeGreaterThan(prepareIndex)
    expect(verifyIndex).toBeGreaterThan(deleteIndex)
    expect(uploadIndex).toBeGreaterThan(verifyIndex)

    const uploadStep = reusableWorkflow.slice(uploadIndex, reusableWorkflow.length)
    expect(uploadStep).not.toContain('CLEVER_TOKEN')
    expect(uploadStep).not.toContain('CLEVER_SECRET')
  })
})
