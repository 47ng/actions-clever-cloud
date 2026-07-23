import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, test } from 'vitest'

function readProjectFile(path: string): string {
  return readFileSync(fileURLToPath(new URL(path, import.meta.url)), 'utf8')
}

const manualWorkflow = readProjectFile('../.github/workflows/e2e-manual.yml')
const reusableWorkflow = readProjectFile('../.github/workflows/e2e-reusable.yml')

describe('manual e2e workflow policies', () => {
  test('manual dispatch accepts one full SHA, requires the current internal PR head, resolves the verified candidate image, and calls the reusable workflow with typed identity inputs', () => {
    expect(manualWorkflow).toContain('workflow_dispatch:')
    expect(manualWorkflow).toContain('head_sha:')
    expect(manualWorkflow).toContain('type: string')
    expect(manualWorkflow).toContain('head.repo.full_name === thisRepo')
    expect(manualWorkflow).toContain('pr.head.sha === headSha')
    expect(manualWorkflow).toContain('github.sha')
    expect(manualWorkflow).toContain('name: Resolve verified candidate image')
    expect(manualWorkflow).toContain("packages: read")
    expect(manualWorkflow).not.toContain("import { inspectCandidateImage } from './src/e2e/candidate-image.ts'")
    expect(manualWorkflow).toContain('org.opencontainers.image.revision')
    expect(manualWorkflow).toContain('org.opencontainers.image.source')
    expect(manualWorkflow).toContain('candidate_image: ${{ needs.candidate.outputs.image }}')
    expect(manualWorkflow).toContain(
      'candidate_source_repository: ${{ needs.resolve.outputs.candidate_source_repository }}'
    )
    expect(manualWorkflow).toContain("caller: manual")
    expect(manualWorkflow).toContain('uses: ./.github/workflows/e2e-reusable.yml')
    expect(manualWorkflow).not.toContain('secrets: inherit')
  })

  test('the reusable workflow keeps credentials step-scoped, accepts typed candidate identity inputs, handles stale manual and automatic callers safely, and tears down by exact app ID', () => {
    expect(reusableWorkflow).toMatch(/^permissions: \{\}$/m)
    expect(reusableWorkflow).toContain('candidate_image:')
    expect(reusableWorkflow).toContain('candidate_source_repository:')
    expect(reusableWorkflow).toContain('caller:')
    expect(reusableWorkflow).toContain('concurrency:')
    expect(reusableWorkflow).toContain("group: clever-cloud-e2e-${{ inputs.pr_number }}")
    expect(reusableWorkflow).toContain('cancel-in-progress: false')
    expect(reusableWorkflow).toContain('name: clever-cloud-e2e')
    expect(reusableWorkflow).toContain('path: .candidate-source')
    expect(reusableWorkflow).toContain('working-directory: .candidate-source')
    expect(reusableWorkflow).toContain('pnpm install --frozen-lockfile --ignore-scripts')
    expect(reusableWorkflow).toContain("persist-credentials: false")
    expect(reusableWorkflow).toContain("OUTPUT_ACTION_PATH: ${{ github.workspace }}/.candidate-action/action.yml")
    expect(reusableWorkflow).toContain("CANDIDATE_IMAGE: ${{ inputs.candidate_image }}")
    expect(reusableWorkflow).toContain("import { pinActionMetadata } from './.candidate-source/src/e2e/candidate-image.ts'")
    expect(reusableWorkflow).not.toContain("import { inspectCandidateImage, pinActionMetadata } from './.candidate-source/src/e2e/candidate-image.ts'")
    expect(reusableWorkflow).toContain("import { createFixtureRepository } from './.candidate-source/src/e2e/git-fixture.ts'")
    expect(reusableWorkflow).toContain("uses: ./.candidate-action")
    expect(reusableWorkflow).toContain('name: Remove provisioning link')
    expect(reusableWorkflow).toContain('rm -f .clever.json')
    expect(reusableWorkflow).toContain('appID: ${{ steps.create.outputs.app_id }}')
    expect(reusableWorkflow).toContain('CC_HEALTH_CHECK_PATH=/health')
    expect(reusableWorkflow).toContain("import { waitForHealthyDeployment } from './.candidate-source/src/e2e/deployment-observer.ts'")
    expect(reusableWorkflow).toContain('new AbortController()')
    expect(reusableWorkflow).toContain('requestController.abort()')
    expect(reusableWorkflow).toContain("const cleverCLI = `${process.env.GITHUB_WORKSPACE}/.candidate-source/node_modules/.bin/clever`")
    expect(reusableWorkflow).toContain("controller.getApplication(appId)")
    expect(reusableWorkflow).toContain("controller.deleteApplication({ appId, name: appName })")
    expect(reusableWorkflow).toContain("controller.findApplicationByName(appName)")
    expect(reusableWorkflow).toContain('appId: recoveredApplication.appId')
    expect(reusableWorkflow).toContain('name: recoveredApplication.name')
    expect(reusableWorkflow).toContain(
      'await controller.deleteApplication({\n                appId: recoveredApplication.appId,\n                name: recoveredApplication.name,'
    )
    expect(reusableWorkflow).toContain('CALLER: ${{ inputs.caller }}')
    expect(reusableWorkflow).toContain('pr.head.sha !== headSha')
    expect(reusableWorkflow).toContain('caller === \"automatic\"')
    expect(reusableWorkflow).toContain("addRaw('superseded')")
    expect(reusableWorkflow).toContain(
      "name: Create personal Node.js app\n        if: steps.candidate-state.outputs.proceed == 'true'"
    )
    expect(reusableWorkflow).toContain(
      "name: Remove provisioning link\n        if: steps.candidate-state.outputs.proceed == 'true'"
    )
    expect(reusableWorkflow).toContain(
      "name: Deploy healthy fixture commit\n        if: steps.candidate-state.outputs.proceed == 'true'"
    )
    expect(reusableWorkflow).toContain(
      "name: Observe healthy fixture deployment\n        if: steps.candidate-state.outputs.proceed == 'true'"
    )
    expect(reusableWorkflow).toContain('Dispatch again with the current head.')
    expect(reusableWorkflow).toContain('.e2e-state/app.json')
    expect(reusableWorkflow).toContain("hashFiles('.e2e-state/app.json')")
    expect(reusableWorkflow).not.toContain('clever login')
  })
})
