import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, test } from 'vitest'

function readProjectFile(path: string): string {
  return readFileSync(fileURLToPath(new URL(path, import.meta.url)), 'utf8')
}

const reusableWorkflow = readProjectFile('../.github/workflows/e2e-reusable.yml')

describe('e2e failure evidence workflow policies', () => {
  test('the reusable workflow writes structured results, prepares safe failure evidence inside teardown, and uploads only verified failure artifacts without credentials', () => {
    expect(reusableWorkflow).toContain('name: Prepare evidence directories')
    expect(reusableWorkflow).toContain('candidate_digest:')
    expect(reusableWorkflow).toContain('name: Write structured scenario results')
    expect(reusableWorkflow).toContain(
      "import {\n            buildExpectedFailureOutcome,\n            buildSuccessfulScenarioOutcome,\n            buildSuiteResults,\n            writeSuiteResults\n          } from './.candidate-source/src/e2e/evidence.ts'"
    )
    expect(reusableWorkflow).toContain(
      'outcome: buildExpectedFailureOutcome({'
    )
    expect(reusableWorkflow).toContain('baselineInstanceId: null')
    expect(reusableWorkflow).toContain('instanceId:')
    expect(reusableWorkflow).not.toContain('name: Prepare failure evidence')
    expect(reusableWorkflow).not.toContain('name: Verify failure evidence after teardown')
    expect(reusableWorkflow).toContain('id: delete-app')
    expect(reusableWorkflow).toContain('HEAD_SHA: ${{ inputs.head_sha }}')
    expect(reusableWorkflow).toContain('CANDIDATE_DIGEST: ${{ inputs.candidate_digest }}')
    expect(reusableWorkflow).toContain('CANDIDATE_IMAGE: ${{ inputs.candidate_image }}')
    expect(reusableWorkflow).toContain('failure_evidence_ready=true')
    expect(reusableWorkflow).toContain('name: Write GitHub step summary')
    expect(reusableWorkflow).toContain(
      "import { buildSuiteStepSummary } from './.candidate-source/src/e2e/evidence.ts'"
    )
    expect(reusableWorkflow).toContain('GITHUB_STEP_SUMMARY')
    expect(reusableWorkflow).toContain('headSha,')
    expect(reusableWorkflow).toContain('imageDigest: candidateDigest')
    expect(reusableWorkflow).toContain('imageReference: candidateImage')
    expect(reusableWorkflow).toContain("steps.delete-app.outputs.failure_evidence_ready == 'true'")
    expect(reusableWorkflow).toContain('name: Upload failure evidence')
    expect(reusableWorkflow).toContain('logFile: .e2e-artifacts/candidate-action/001-deploy-healthy.log')
    expect(reusableWorkflow).toContain('logFile: .e2e-artifacts/candidate-action/002-deploy-env.log')
    expect(reusableWorkflow).toContain('logFile: .e2e-artifacts/candidate-action/003-same-commit-error.log')
    expect(reusableWorkflow).toContain('logFile: .e2e-artifacts/candidate-action/004-same-commit-ignore.log')
    expect(reusableWorkflow).toContain('logFile: .e2e-artifacts/candidate-action/005-same-commit-restart.log')
    expect(reusableWorkflow).toContain('logFile: .e2e-artifacts/candidate-action/006-same-commit-rebuild.log')
    expect(reusableWorkflow).toContain('logFile: .e2e-artifacts/candidate-action/007-build-failure.log')
    expect(reusableWorkflow).toContain('logFile: .e2e-artifacts/candidate-action/008-startup-failure.log')
    expect(reusableWorkflow).toContain('logFile: .e2e-artifacts/candidate-action/009-recovery.log')
    expect(reusableWorkflow).toContain('logFile: .e2e-artifacts/candidate-action/010-divergent-no-force.log')
    expect(reusableWorkflow).toContain('logFile: .e2e-artifacts/candidate-action/011-divergent-force.log')
    expect(reusableWorkflow).toContain('logFile: .e2e-artifacts/candidate-action/012-timeout.log')
    expect(reusableWorkflow).toContain("candidateActionLogs: ['candidate-action/001-deploy-healthy.log']")
    expect(reusableWorkflow).toContain("candidateActionLogs: ['candidate-action/002-deploy-env.log']")
    expect(reusableWorkflow).toContain("candidateActionLogs: ['candidate-action/003-same-commit-error.log']")
    expect(reusableWorkflow).toContain("candidateActionLogs: ['candidate-action/004-same-commit-ignore.log']")
    expect(reusableWorkflow).toContain("candidateActionLogs: ['candidate-action/005-same-commit-restart.log']")
    expect(reusableWorkflow).toContain("candidateActionLogs: ['candidate-action/006-same-commit-rebuild.log']")
    expect(reusableWorkflow).toContain("candidateActionLogs: ['candidate-action/007-build-failure.log']")
    expect(reusableWorkflow).toContain("candidateActionLogs: ['candidate-action/008-startup-failure.log']")
    expect(reusableWorkflow).toContain("candidateActionLogs: ['candidate-action/009-recovery.log']")
    expect(reusableWorkflow).toContain("candidateActionLogs: ['candidate-action/010-divergent-no-force.log']")
    expect(reusableWorkflow).toContain("candidateActionLogs: ['candidate-action/011-divergent-force.log']")
    expect(reusableWorkflow).toContain("candidateActionLogs: ['candidate-action/012-timeout.log']")
    expect(reusableWorkflow).toContain("steps.delete-app.outputs.failure_evidence_ready == 'true'")
    expect(reusableWorkflow).toContain('candidate-action/007-build-failure.log')
    expect(reusableWorkflow).toContain('candidate-action/008-startup-failure.log')
    expect(reusableWorkflow).toContain('candidate-action/009-recovery.log')
    expect(reusableWorkflow).toContain('candidate-action/010-divergent-no-force.log')
    expect(reusableWorkflow).toContain('candidate-action/011-divergent-force.log')
    expect(reusableWorkflow).toContain('candidate-action/012-timeout.log')
    expect(reusableWorkflow).toContain('retention-days: 3')
    expect(reusableWorkflow).toContain('name: clever-cloud-e2e-failure-${{ github.run_id }}-${{ github.run_attempt }}')
    expect(reusableWorkflow).toContain("artifactPath: 'suite-results.json'")
    expect(reusableWorkflow).toContain('uses: actions/upload-artifact@65462800fd760344b1a7b4382951275a0abb4808 # v4.3.3')
    expect(reusableWorkflow).not.toContain(
      "import { prepareFailureEvidence } from './.candidate-source/src/e2e/evidence.ts'"
    )
    expect(reusableWorkflow).not.toContain(
      "import { verifyPreparedFailureEvidence } from './.candidate-source/src/e2e/evidence.ts'"
    )

    const resultsIndex = reusableWorkflow.indexOf('name: Write structured scenario results')
    const deleteIndex = reusableWorkflow.indexOf('name: Delete the captured app')
    const summaryIndex = reusableWorkflow.indexOf('name: Write GitHub step summary')
    const uploadIndex = reusableWorkflow.indexOf('name: Upload failure evidence')

    expect(resultsIndex).toBeGreaterThan(-1)
    expect(deleteIndex).toBeGreaterThan(resultsIndex)
    expect(summaryIndex).toBeGreaterThan(deleteIndex)
    expect(uploadIndex).toBeGreaterThan(summaryIndex)

    const deleteStep = reusableWorkflow.slice(deleteIndex, summaryIndex)
    expect(deleteStep).toContain('CLEVER_TOKEN')
    expect(deleteStep).toContain('CLEVER_SECRET')
    expect(deleteStep).toContain('E2E_HEALTH_VALUE: ${{ steps.health-value.outputs.value }}')
    expect(deleteStep).toContain('OUTPUT_DIR: ${{ github.workspace }}/.e2e-artifacts/upload')
    expect(deleteStep).toContain('RESULTS_PATH: ${{ github.workspace }}/.e2e-state/suite-results.json')
    expect(deleteStep).toContain('const healthValue = process.env.E2E_HEALTH_VALUE')
    expect(deleteStep).toContain('const credentials = { token, secret, healthValue }')
    expect(deleteStep).toContain('credentials.healthValue')
    expect(deleteStep).toContain('scanArtifactContent(redacted, credentials)')
    expect(deleteStep).toContain("await appendFile(githubOutput, 'failure_evidence_ready=true\\n')")
    expect(deleteStep).toContain('Failure evidence verification failed:')
    expect(deleteStep).not.toContain('!healthValue')
    expect(deleteStep).toContain('for (;;) {')
    expect(deleteStep).toContain('if (activeDeployments.length === 0) {')
    expect(deleteStep).toContain('returnSettled: true')
    expect(deleteStep).toContain('await waitForDeploymentState({')
    expect(deleteStep).not.toContain("from './.candidate-source/")

    const verifyReadyIndex = deleteStep.indexOf('await verifyPreparedFailureEvidence({')
    const markReadyIndex = deleteStep.indexOf(
      "await appendFile(githubOutput, 'failure_evidence_ready=true\\n')"
    )

    expect(verifyReadyIndex).toBeGreaterThan(-1)
    expect(markReadyIndex).toBeGreaterThan(verifyReadyIndex)

    const summaryStep = reusableWorkflow.slice(summaryIndex, uploadIndex)
    expect(summaryStep).not.toContain('E2E_HEALTH_VALUE')

    const uploadStep = reusableWorkflow.slice(uploadIndex, reusableWorkflow.length)
    expect(uploadStep).not.toContain('CLEVER_TOKEN')
    expect(uploadStep).not.toContain('CLEVER_SECRET')
    expect(uploadStep).not.toContain('E2E_HEALTH_VALUE')
  })
})
