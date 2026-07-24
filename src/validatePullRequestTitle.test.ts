import { execFileSync } from 'node:child_process'
import {
  chmodSync,
  copyFileSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync
} from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, test } from 'vitest'

const script = fileURLToPath(
  new URL('../.github/scripts/validate-pr-title.sh', import.meta.url)
)
const releasePleaseConfig = JSON.parse(
  readFileSync(
    new URL('../release-please-config.json', import.meta.url),
    'utf8'
  )
) as { 'changelog-sections': Array<{ type: string }> }
const commitTypes = releasePleaseConfig['changelog-sections'].map(
  section => section.type
)
const [commitType] = commitTypes
if (commitType === undefined) {
  throw new Error('release-please-config.json defines no changelog sections')
}
let unsupportedType = 'unknown'
while (commitTypes.includes(unsupportedType)) {
  unsupportedType = `${unsupportedType}-unknown`
}

function runValidator(
  title: string,
  scriptPath = script,
  cwd?: string
): number {
  try {
    execFileSync(scriptPath, {
      cwd,
      env: { ...process.env, PR_TITLE: title },
      stdio: 'pipe'
    })
    return 0
  } catch (error) {
    if (
      error instanceof Error &&
      'status' in error &&
      typeof error.status === 'number'
    ) {
      return error.status
    }
    throw error
  }
}

function validate(title: string, cwd?: string): boolean {
  const status = runValidator(title, script, cwd)
  if (status > 1) {
    throw new Error(`Validator failed with exit code ${status}`)
  }
  return status === 0
}

function createFixture(config: unknown): {
  configPath: string
  root: string
  scriptPath: string
} {
  const root = mkdtempSync(join(tmpdir(), 'validate-pr-title-'))
  const scriptDirectory = join(root, '.github', 'scripts')
  const scriptPath = join(scriptDirectory, 'validate-pr-title.sh')
  const configPath = join(root, 'release-please-config.json')
  mkdirSync(scriptDirectory, { recursive: true })
  copyFileSync(script, scriptPath)
  chmodSync(scriptPath, 0o755)
  writeFileSync(configPath, JSON.stringify(config))
  return { configPath, root, scriptPath }
}

describe('pull request title validation', () => {
  test.each([
    `${commitType}: handle timeout`,
    `${commitType}(deploy)!: change default behaviour`,
    `${commitType}!: breaking change`,
    `${commitType}(deps): bump simple-git`,
    `${commitType}(deps-dev): bump vitest`,
    `${commitType}(scope.with_all-allowed/chars0): description`,
    `${commitType}: 🚀 emoji in description`
  ])('accepts %s', title => {
    expect(validate(title)).toBe(true)
  })

  test.each([
    `${commitType.toUpperCase()}: uppercase type`,
    `${unsupportedType}: not a type`,
    `${commitType}:missing space`,
    `${commitType} : spaced separator`,
    commitType, // no separator
    `${commitType}: `, // empty description
    `${commitType}:  `, // whitespace-only description
    `${commitType}(): empty scope`,
    `${commitType}(Scope): uppercase scope`,
    `${commitType}(.dot): scope starting with punctuation`,
    `${commitType}(-dash): scope starting with dash`,
    `${commitType}(sco pe): scope with space`,
    `${commitType}!!: double breaking marker`,
    `${commitType}!(scope): marker before scope`,
    `${commitType}(é): accented scope`,
    `${commitType}: valid first line\nsmuggled second line`,
    `${commitType}: valid first line\rsmuggled second line`,
    'handle timeout', // no type at all
    '' // empty title
  ])('rejects %s', title => {
    expect(validate(title)).toBe(false)
  })

  test.each(commitTypes)('accepts the configured %s type', type => {
    expect(validate(`${type}: configured type`)).toBe(true)
  })

  test('finds the config when run outside the repository root', () => {
    expect(
      validate(`${commitType}: cwd-independent config lookup`, tmpdir())
    ).toBe(true)
  })

  test('uses only types from the config beside the script', () => {
    const fixture = createFixture({
      'changelog-sections': [{ type: 'custom-type' }]
    })
    try {
      expect(
        runValidator('custom-type: configured type', fixture.scriptPath)
      ).toBe(0)
      expect(runValidator(`${commitType}: stale type`, fixture.scriptPath)).toBe(
        1
      )
    } finally {
      rmSync(fixture.root, { force: true, recursive: true })
    }
  })

  test.each([
    ['broken JSON', '{'],
    ['an empty type list', { 'changelog-sections': [] }],
    [
      'a non-string type',
      { 'changelog-sections': [{ type: 1 }] }
    ],
    [
      'a regular expression token in a type',
      { 'changelog-sections': [{ type: 'fix|.*' }] }
    ]
  ])('fails with exit code 2 for %s', (_, config) => {
    const fixture = createFixture(config)
    if (typeof config === 'string') {
      writeFileSync(fixture.configPath, config)
    }
    try {
      expect(runValidator('fix: title', fixture.scriptPath)).toBe(2)
    } finally {
      rmSync(fixture.root, { force: true, recursive: true })
    }
  })

  test('fails with a distinct exit code when PR_TITLE is not set', () => {
    const env = { ...process.env }
    delete env.PR_TITLE
    try {
      execFileSync(script, { env, stdio: 'pipe' })
      expect.unreachable('script should fail when PR_TITLE is not set')
    } catch (error) {
      expect(error).toBeInstanceOf(Error)
      expect((error as Error & { status: number }).status).toBe(2)
    }
  })
})
