import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, test } from 'vitest'

const workflows = [
  '../.github/workflows/main.yml',
  '../.github/workflows/pr-preview.yml',
  '../.github/workflows/pr-preview-manual.yml'
]

const expectedPlatforms = 'linux/amd64,linux/arm64'

describe('Docker image workflows', () => {
  test.each(workflows)('%s builds native amd64 and arm64 images', workflow => {
    const contents = readFileSync(
      fileURLToPath(new URL(workflow, import.meta.url)),
      'utf8'
    )
    const buildSteps = contents.match(
      /uses: docker\/build-push-action@[^\n]+\n(?:\s+[^\n]*\n)*?\s+push: true/g
    )

    expect(buildSteps, 'expected a build-push-action step').not.toBeNull()
    expect(buildSteps).not.toHaveLength(0)
    for (const buildStep of buildSteps ?? []) {
      expect(buildStep).toContain(`platforms: ${expectedPlatforms}`)
    }
  })
})
