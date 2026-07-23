import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, test } from 'vitest'

function readWorkflow(path: string): string {
  return readFileSync(fileURLToPath(new URL(path, import.meta.url)), 'utf8')
}

const mainWorkflow = readWorkflow('../.github/workflows/main.yml')
const previewWorkflow = readWorkflow('../.github/workflows/pr-preview.yml')
const manualPreviewWorkflow = readWorkflow(
  '../.github/workflows/pr-preview-manual.yml'
)

describe('candidate image workflow policies', () => {
  test('preview builds watch action metadata and e2e workflow inputs but not docs-only changes', () => {
    expect(previewWorkflow).toMatch(/- ['"]action\.yml['"]/)
    expect(previewWorkflow).toMatch(
      /- ['"]\.github\/workflows\/pr-preview\.yml['"]/
    )
    expect(previewWorkflow).toMatch(
      /- ['"]\.github\/workflows\/pr-preview-manual\.yml['"]/
    )
    expect(previewWorkflow).toMatch(
      /- ['"]\.github\/workflows\/\*e2e\*\.yml['"]/
    )
    expect(previewWorkflow).not.toContain('README.md')
    expect(previewWorkflow).not.toContain('docs/')
  })

  test('preview workflow shares one concurrency group per pull request without blocking other pull requests', () => {
    expect(previewWorkflow).toContain('concurrency:')
    expect(previewWorkflow).toContain(
      'group: pr-preview-${{ github.event.pull_request.number }}'
    )
    expect(previewWorkflow).toContain('cancel-in-progress: false')
    expect(previewWorkflow).not.toContain(
      'group: pr-preview-${{ github.repository }}'
    )
  })

  test('internal previews, vetted fork previews, and releases use separate buildx cache scopes', () => {
    expect(previewWorkflow).toContain(
      'cache-from: type=gha,scope=pr-preview-internal-${{ github.event.pull_request.number }}'
    )
    expect(previewWorkflow).toContain(
      'cache-to: type=gha,mode=max,scope=pr-preview-internal-${{ github.event.pull_request.number }}'
    )

    expect(manualPreviewWorkflow).toContain(
      'cache-from: type=gha,scope=pr-preview-fork-${{ needs.resolve.outputs.pr_number }}'
    )
    expect(manualPreviewWorkflow).toContain(
      'cache-to: type=gha,mode=max,scope=pr-preview-fork-${{ needs.resolve.outputs.pr_number }}'
    )

    expect(mainWorkflow).toContain('cache-from: type=gha,scope=release-image')
    expect(mainWorkflow).toContain(
      'cache-to: type=gha,mode=max,scope=release-image'
    )

    expect(previewWorkflow).not.toContain('scope=pr-preview-fork-')
    expect(mainWorkflow).not.toContain('scope=pr-preview-fork-')
  })

  test('trusted preview workflow verifies the built candidate image and pins action metadata with the helper', () => {
    expect(previewWorkflow).toContain(
      'name: Verify and pin candidate action metadata'
    )
    expect(previewWorkflow).toContain(
      "import { inspectCandidateImage, pinActionMetadata } from './src/e2e/candidate-image.ts'"
    )
  })

  test('manual fork previews publish to a separate package from trusted images', () => {
    expect(manualPreviewWorkflow).toContain(
      'IMAGE="ghcr.io/47ng/actions-clever-cloud-preview"'
    )
    expect(manualPreviewWorkflow).toContain(
      'const image = "ghcr.io/47ng/actions-clever-cloud-preview";'
    )
    expect(previewWorkflow).not.toContain('actions-clever-cloud-preview')
    expect(mainWorkflow).not.toContain('actions-clever-cloud-preview')
  })

  test('manual fork preview does not execute repository helper code on the host', () => {
    expect(manualPreviewWorkflow).not.toContain(
      'name: Verify and pin candidate action metadata'
    )
    expect(manualPreviewWorkflow).not.toContain(
      "import { inspectCandidateImage, pinActionMetadata } from './src/e2e/candidate-image.ts'"
    )
    expect(manualPreviewWorkflow).not.toContain('actions/setup-node@')
  })

  test('preview shell steps receive pull-request-derived values through env', () => {
    expect(previewWorkflow).not.toContain(
      'run: echo "sha=${{ github.event.pull_request.head.sha }}" >> $GITHUB_OUTPUT'
    )
    expect(previewWorkflow).not.toContain(
      'run: echo "tag=pr-${{ github.event.pull_request.number }}" >> $GITHUB_OUTPUT'
    )
    expect(previewWorkflow).toContain(
      'HEAD_SHA: ${{ github.event.pull_request.head.sha }}'
    )
    expect(previewWorkflow).toContain(
      'PR_NUMBER: ${{ github.event.pull_request.number }}'
    )
    expect(previewWorkflow).toContain(
      'echo "sha=$HEAD_SHA" >> "$GITHUB_OUTPUT"'
    )
    expect(previewWorkflow).toContain(
      'echo "tag=pr-$PR_NUMBER" >> "$GITHUB_OUTPUT"'
    )
    expect(previewWorkflow).toContain(
      'PACKAGE_VERSION: ${{ steps.package.outputs.version }}'
    )
    expect(previewWorkflow).toContain(
      'echo "org.opencontainers.image.version=$PACKAGE_VERSION-pr.$PR_NUMBER"'
    )
    expect(previewWorkflow).toContain(
      'echo "org.opencontainers.image.source=https://github.com/$REPOSITORY/tree/$SHA"'
    )
    expect(previewWorkflow).toContain(
      'DOCKER_TAG: ${{ steps.docker-tag.outputs.tag }}'
    )
    expect(previewWorkflow).toContain(
      'echo "ghcr.io/47ng/actions-clever-cloud:$DOCKER_TAG"'
    )
    expect(previewWorkflow).toContain(
      'STEP_SUMMARY_DIGEST: ${{ steps.candidate.outputs.digest }}'
    )
    expect(previewWorkflow).toContain(
      'STEP_SUMMARY_TAGS: ${{ steps.docker-labels-tags.outputs.tags }}'
    )
    expect(previewWorkflow).toContain(
      'STEP_SUMMARY_LABELS: ${{ steps.docker-labels-tags.outputs.labels }}'
    )
    expect(previewWorkflow).toContain('echo "$STEP_SUMMARY_TAGS"')
    expect(previewWorkflow).toContain('echo "$STEP_SUMMARY_LABELS"')
    expect(previewWorkflow).not.toContain(
      'echo "tag=pr-${{ github.event.pull_request.number }}" >> "$GITHUB_OUTPUT"'
    )
  })

  test('top-level workflow permissions stay empty', () => {
    expect(previewWorkflow).toMatch(/^permissions: \{\}$/m)
    expect(manualPreviewWorkflow).toMatch(/^permissions: \{\}$/m)
    expect(mainWorkflow).toMatch(/^permissions: \{\}$/m)
  })
})
