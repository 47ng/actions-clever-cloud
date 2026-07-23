import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, test } from 'vitest'

function readProjectFile(path: string): string {
  return readFileSync(fileURLToPath(new URL(path, import.meta.url)), 'utf8')
}

const contributingGuide = readProjectFile('../CONTRIBUTING.md')
const operationsGuide = readProjectFile('../docs/e2e-operations.md')

describe('e2e documentation', () => {
  test('the contributor guide points contributors to the e2e operations guide', () => {
    expect(contributingGuide).toContain('docs/e2e-operations.md')
  })

  test('the operations guide covers setup, approval, region, dispatch, naming, and cleanup', () => {
    expect(operationsGuide).toContain('CLEVER_TOKEN')
    expect(operationsGuide).toContain('CLEVER_SECRET')
    expect(operationsGuide).toContain('CLEVER_E2E_REGION')
    expect(operationsGuide).toContain('clever-cloud-e2e')
    expect(operationsGuide).toContain('actions-clever-cloud-e2e-<run-id>-<attempt>')
    expect(operationsGuide).toContain('e2e-manual.yml')
    expect(operationsGuide).toContain('manual cleanup')
  })
})
