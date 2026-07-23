import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, test } from 'vitest'

function readProjectFile(path: string): string {
  return readFileSync(fileURLToPath(new URL(path, import.meta.url)), 'utf8')
}

const automaticWorkflow = readProjectFile(
  '../.github/workflows/e2e-release-please.yml'
)
const mainWorkflow = readProjectFile('../.github/workflows/main.yml')

describe('automatic e2e workflow policies', () => {
  test('release please candidates trigger on release dispatch plus reopen and ready events', () => {
    expect(automaticWorkflow).toContain('repository_dispatch:')
    expect(automaticWorkflow).toContain('types: [release-please-candidate]')
    expect(automaticWorkflow).toContain('pull_request:')
    expect(automaticWorkflow).toContain('types: [reopened, ready_for_review]')
  })

  test('eligibility requires an internal, non-draft release please pull request with the expected bot, branch, and label', () => {
    expect(automaticWorkflow).toMatch(/^permissions: \{\}$/m)
    expect(automaticWorkflow).toContain(
      'PR_NUMBER: ${{ github.event.client_payload.pr_number || github.event.pull_request.number }}'
    )
    expect(automaticWorkflow).toContain("pr.draft === false")
    expect(automaticWorkflow).toContain("pr.user.login === 'github-actions[bot]'")
    expect(automaticWorkflow).toContain("pr.head.ref === 'release-please--branches--master'")
    expect(automaticWorkflow).toContain('autorelease: pending')
    expect(automaticWorkflow).toContain('pr.head.repo.full_name === thisRepo')
  })

  test('release dispatch, reopen, and ready events share per-pull-request concurrency without blocking other pull requests', () => {
    expect(automaticWorkflow).toContain('concurrency:')
    expect(automaticWorkflow).toContain(
      'group: clever-cloud-e2e-release-please-${{ github.event.client_payload.pr_number || github.event.pull_request.number }}'
    )
    expect(automaticWorkflow).toContain('cancel-in-progress: false')
  })

  test('main release workflow dispatches automatic e2e for release please candidates created with GITHUB_TOKEN', () => {
    expect(mainWorkflow).toContain('prs_created: ${{ steps.release-please.outputs.prs_created }}')
    expect(mainWorkflow).toContain('prs: ${{ steps.release-please.outputs.prs }}')
    expect(mainWorkflow).toContain('name: Dispatch automatic e2e for Release Please candidates')
    expect(mainWorkflow).toContain("headBranchName !== 'release-please--branches--master'")
    expect(mainWorkflow).toContain("!pr.labels?.includes('autorelease: pending')")
    expect(mainWorkflow).toContain('createDispatchEvent')
    expect(mainWorkflow).toContain("event_type: 'release-please-candidate'")
  })

  test('existing verified sha images are reused, missing images are built, and the reusable suite receives the digest-pinned candidate identity', () => {
    expect(automaticWorkflow).toContain('name: Reject stale automatic candidates before image work')
    expect(automaticWorkflow).toContain('name: Reuse existing verified SHA image when available')
    expect(automaticWorkflow).toContain('name: Build and push missing SHA image')
    expect(automaticWorkflow).toContain("addRaw(\"superseded\")")
    expect(automaticWorkflow).toContain(
      "if: needs.current-state.outputs.proceed == 'true'"
    )
    expect(automaticWorkflow).not.toContain(
      "import { inspectCandidateImage } from './src/e2e/candidate-image.ts'"
    )
    expect(automaticWorkflow).toContain('org.opencontainers.image.revision')
    expect(automaticWorkflow).toContain('org.opencontainers.image.source')
    expect(automaticWorkflow).toContain(
      'cache-from: type=gha,scope=pr-preview-internal-${{ needs.resolve.outputs.pr_number }}'
    )
    expect(automaticWorkflow).toContain(
      'cache-to: type=gha,mode=max,scope=pr-preview-internal-${{ needs.resolve.outputs.pr_number }}'
    )
    expect(automaticWorkflow).toContain(
      'candidate_digest: ${{ needs.candidate.outputs.digest }}'
    )
    expect(automaticWorkflow).toContain(
      'candidate_image: ${{ needs.candidate.outputs.image }}'
    )
    expect(automaticWorkflow).toContain(
      'candidate_source_repository: ${{ needs.resolve.outputs.candidate_source_repository }}'
    )
    expect(automaticWorkflow).toContain('caller: automatic')
    expect(automaticWorkflow).toContain('packages: write')
  })

  test('the automatic release path stays separate from the fork preview flow, ignores docs-only changes, and does not inherit secrets', () => {
    expect(automaticWorkflow).toContain('paths:')
    expect(automaticWorkflow).toContain('- "action.yml"')
    expect(automaticWorkflow).toContain('- ".github/workflows/*e2e*.yml"')
    expect(automaticWorkflow).not.toContain('README.md')
    expect(automaticWorkflow).not.toContain('docs/')
    expect(automaticWorkflow).not.toContain('actions-clever-cloud-preview')
    expect(automaticWorkflow).not.toContain('fork_full_name')
    expect(automaticWorkflow).not.toContain('pull_request_target')
    expect(automaticWorkflow).not.toContain('secrets: inherit')
  })
})
