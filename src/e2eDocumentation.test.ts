import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, test } from 'vitest'

function readProjectFile(path: string): string {
  return readFileSync(fileURLToPath(new URL(path, import.meta.url)), 'utf8')
}

const contributingGuide = readProjectFile('../CONTRIBUTING.md')
const operationsGuide = readProjectFile('../docs/e2e-operations.md')

describe('e2e documentation', () => {
  test('the contributor guide links to the operations guide', () => {
    expect(contributingGuide).toContain('docs/e2e-operations.md')
  })

  test('the operations guide covers the required credentials and region', () => {
    expect(operationsGuide).toContain('CLEVER_TOKEN')
    expect(operationsGuide).toContain('CLEVER_SECRET')
    expect(operationsGuide).toContain('CLEVER_E2E_REGION')
  })

  test('the operations guide never embeds a raw generated health value', () => {
    expect(operationsGuide).not.toMatch(/[A-Za-z0-9+/]{22}==/)
  })
})
