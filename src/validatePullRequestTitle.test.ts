import { execFileSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { describe, expect, test } from 'vitest'

const script = fileURLToPath(
  new URL('../.github/scripts/validate-pr-title.sh', import.meta.url)
)

function validate(title: string): boolean {
  try {
    execFileSync(script, {
      env: { ...process.env, PR_TITLE: title },
      stdio: 'pipe'
    })
    return true
  } catch {
    return false
  }
}

describe('pull request title validation', () => {
  test.each([
    'fix: handle timeout',
    'feat: add new input',
    'feat(deploy)!: change default behaviour',
    'feat!: breaking change',
    'fix(deps): bump simple-git',
    'chore(deps-dev): bump vitest',
    'chore(master): release 2.1.2',
    'ci: conventional release strategy',
    'doc: better wording',
    'docs: update README',
    'ref: extract helper',
    'refactor(core): split module',
    'perf: faster line splitting',
    'revert: undo timeout change',
    'build: update Dockerfile',
    'style: format sources',
    'test: cover output streams',
    'fix(scope.with_all-allowed/chars0): description'
  ])('accepts %s', title => {
    expect(validate(title)).toBe(true)
  })

  test.each([
    'Fix: uppercase type',
    'unknown: not a type',
    'fix:missing space',
    'fix : spaced separator',
    'fix', // no separator
    'fix: ', // empty description
    'fix:  ', // whitespace-only description
    'fix(): empty scope',
    'fix(Scope): uppercase scope',
    'fix(.dot): scope starting with punctuation',
    'fix(-dash): scope starting with dash',
    'fix(sco pe): scope with space',
    'feat!!: double breaking marker',
    'handle timeout', // no type at all
    '' // empty title
  ])('rejects %s', title => {
    expect(validate(title)).toBe(false)
  })
})
