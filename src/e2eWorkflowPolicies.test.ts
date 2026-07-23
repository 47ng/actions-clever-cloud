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
    expect(previewWorkflow).toContain('- "action.yml"')
    expect(previewWorkflow).toContain('- ".github/workflows/pr-preview.yml"')
    expect(previewWorkflow).toContain(
      '- ".github/workflows/pr-preview-manual.yml"'
    )
    expect(previewWorkflow).toContain('- ".github/workflows/*e2e*.yml"')
    expect(previewWorkflow).not.toContain('README.md')
    expect(previewWorkflow).not.toContain('docs/')
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

    expect(mainWorkflow).toContain(
      'cache-from: type=gha,scope=release-image'
    )
    expect(mainWorkflow).toContain(
      'cache-to: type=gha,mode=max,scope=release-image'
    )

    expect(previewWorkflow).not.toContain('scope=pr-preview-fork-')
    expect(mainWorkflow).not.toContain('scope=pr-preview-fork-')
  })

  test('trusted preview workflow verifies the built candidate image and pins action metadata with the helper', () => {
    expect(previewWorkflow).toContain('name: Verify and pin candidate action metadata')
    expect(previewWorkflow).toContain(
      "import { inspectCandidateImage, pinActionMetadata } from './src/e2e/candidate-image.ts'"
    )
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

  test('top-level workflow permissions stay empty', () => {
    expect(previewWorkflow).toMatch(/^permissions: \{\}$/m)
    expect(manualPreviewWorkflow).toMatch(/^permissions: \{\}$/m)
    expect(mainWorkflow).toMatch(/^permissions: \{\}$/m)
  })
})
