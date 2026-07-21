import { execFileSync } from 'node:child_process'
import { chmodSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, test } from 'vitest'

const scriptsDir = fileURLToPath(new URL('../.github/scripts', import.meta.url))
const promoteScript = path.join(scriptsDir, 'promote-image.sh')
const moveLatestScript = path.join(scriptsDir, 'move-latest.sh')

const DIGEST_A = `sha256:${'a'.repeat(64)}`
const DIGEST_B = `sha256:${'b'.repeat(64)}`

type StubCase = {
  /* Maps an image ref to the stdout of `skopeo inspect`, or to an error.
     `{ error }` makes inspect fail with that stderr and a non-zero exit. */
  inspect: Record<string, string | { error: string }>
}

type RunResult = {
  status: number
  copies: string[]
  output: string
}

function runWithStub(
  script: string,
  args: string[],
  stub: StubCase,
  env: Record<string, string> = {}
): RunResult {
  const dir = mkdtempSync(path.join(tmpdir(), 'skopeo-stub-'))
  const copyLog = path.join(dir, 'copies.log')
  writeFileSync(copyLog, '')
  writeFileSync(path.join(dir, 'inspect.json'), JSON.stringify(stub.inspect))
  const stubScript = `#!/usr/bin/env bash
set -euo pipefail
command="$1"
if [ "$command" = "copy" ]; then
  echo "$@" >> "${copyLog}"
  exit 0
fi
if [ "$command" != "inspect" ]; then
  echo "unexpected skopeo command: $*" >&2
  exit 64
fi
ref="\${@: -1}"
ref="\${ref#docker://}"
node -e '
  const fixtures = require(process.argv[1])
  const entry = fixtures[process.argv[2]]
  if (entry === undefined) {
    console.error("no stub fixture for " + process.argv[2])
    process.exit(64)
  }
  if (typeof entry === "object") {
    console.error(entry.error)
    process.exit(1)
  }
  console.log(entry)
' "${path.join(dir, 'inspect.json')}" "$ref"
`
  const stubPath = path.join(dir, 'skopeo')
  writeFileSync(stubPath, stubScript)
  chmodSync(stubPath, 0o755)
  try {
    const output = execFileSync(script, args, {
      env: { ...process.env, ...env, PATH: `${dir}:${process.env.PATH}` },
      stdio: 'pipe',
      encoding: 'utf8'
    })
    return { status: 0, copies: readCopies(copyLog), output }
  } catch (error) {
    const e = error as Error & {
      status: number | null
      stdout: string
      stderr: string
    }
    if (typeof e.status !== 'number') {
      throw error
    }
    return {
      status: e.status,
      copies: readCopies(copyLog),
      output: `${e.stdout ?? ''}${e.stderr ?? ''}`
    }
  }
}

function readCopies(copyLog: string): string[] {
  return readFileSync(copyLog, 'utf8').split('\n').filter(Boolean)
}

const source = `ghcr.io/47ng/actions-clever-cloud@${DIGEST_A}`
const ghcrTag = 'ghcr.io/47ng/actions-clever-cloud:2.1.2'
const hubTag = 'docker.io/47ng/actions-clever-cloud:2.1.2'
const notFound = { error: 'reading manifest 2.1.2: manifest unknown' }
const dnsFailure = {
  error: 'pinging container registry: dial tcp: lookup ghcr.io: no such host'
}

describe('promote-image.sh', () => {
  test('copies to absent destinations', () => {
    const result = runWithStub(promoteScript, [source, ghcrTag, hubTag], {
      inspect: { [ghcrTag]: notFound, [hubTag]: notFound }
    })
    expect(result.status).toBe(0)
    expect(result.copies).toHaveLength(2)
    expect(result.copies[0]).toContain(`docker://${ghcrTag}`)
    expect(result.copies[1]).toContain(`docker://${hubTag}`)
  })

  test('skips destinations already at the expected digest', () => {
    const result = runWithStub(promoteScript, [source, ghcrTag], {
      inspect: { [ghcrTag]: DIGEST_A }
    })
    expect(result.status).toBe(0)
    expect(result.copies).toHaveLength(0)
    expect(result.output).toContain('skipping')
  })

  test('refuses to overwrite a destination with a different digest', () => {
    const result = runWithStub(promoteScript, [source, ghcrTag], {
      inspect: { [ghcrTag]: DIGEST_B }
    })
    expect(result.status).not.toBe(0)
    expect(result.copies).toHaveLength(0)
    expect(result.output).toContain('refusing to overwrite')
  })

  test('treats a DNS failure as an error, not a missing tag', () => {
    const result = runWithStub(promoteScript, [source, ghcrTag], {
      inspect: { [ghcrTag]: dnsFailure }
    })
    expect(result.status).not.toBe(0)
    expect(result.copies).toHaveLength(0)
    expect(result.output).toContain('Failed to inspect')
  })

  test('stops at the first refused destination', () => {
    const result = runWithStub(promoteScript, [source, ghcrTag, hubTag], {
      inspect: { [ghcrTag]: DIGEST_B, [hubTag]: notFound }
    })
    expect(result.status).not.toBe(0)
    expect(result.copies).toHaveLength(0)
  })
})

describe('move-latest.sh', () => {
  const ghcrLatest = 'ghcr.io/47ng/actions-clever-cloud:latest'
  const hubLatest = 'docker.io/47ng/actions-clever-cloud:latest'
  const env = { RELEASE_VERSION: '2.1.2' }

  test('moves both tags when the release is newer', () => {
    const result = runWithStub(
      moveLatestScript,
      [source, ghcrLatest, hubLatest],
      { inspect: { [ghcrLatest]: '2.1.1', [hubLatest]: '2.1.1' } },
      env
    )
    expect(result.status).toBe(0)
    expect(result.copies).toHaveLength(2)
  })

  test('moves when no latest tag exists yet', () => {
    const result = runWithStub(
      moveLatestScript,
      [source, ghcrLatest, hubLatest],
      { inspect: { [ghcrLatest]: notFound, [hubLatest]: notFound } },
      env
    )
    expect(result.status).toBe(0)
    expect(result.copies).toHaveLength(2)
  })

  test('does not move when either registry has a newer version', () => {
    const result = runWithStub(
      moveLatestScript,
      [source, ghcrLatest, hubLatest],
      { inspect: { [ghcrLatest]: '2.1.1', [hubLatest]: '2.2.0' } },
      env
    )
    expect(result.status).toBe(0)
    expect(result.copies).toHaveLength(0)
    expect(result.output).toContain('not moving latest')
  })

  test('moves on a same-version retry', () => {
    const result = runWithStub(
      moveLatestScript,
      [source, ghcrLatest, hubLatest],
      { inspect: { [ghcrLatest]: '2.1.2', [hubLatest]: '2.1.1' } },
      env
    )
    expect(result.status).toBe(0)
    expect(result.copies).toHaveLength(2)
  })

  test('treats a missing version label as movable', () => {
    const result = runWithStub(
      moveLatestScript,
      [source, ghcrLatest],
      { inspect: { [ghcrLatest]: '' } },
      env
    )
    expect(result.status).toBe(0)
    expect(result.copies).toHaveLength(1)
    expect(result.output).toContain('no version label')
  })

  test('fails on a non-semver version label', () => {
    const result = runWithStub(
      moveLatestScript,
      [source, ghcrLatest],
      { inspect: { [ghcrLatest]: 'garbage' } },
      env
    )
    expect(result.status).not.toBe(0)
    expect(result.copies).toHaveLength(0)
    expect(result.output).toContain('non-semver')
  })

  test('treats a DNS failure as an error, not a missing tag', () => {
    const result = runWithStub(
      moveLatestScript,
      [source, ghcrLatest],
      { inspect: { [ghcrLatest]: dnsFailure } },
      env
    )
    expect(result.status).not.toBe(0)
    expect(result.copies).toHaveLength(0)
  })

  test('fails when RELEASE_VERSION is not set', () => {
    const env = { ...process.env }
    delete env.RELEASE_VERSION
    expect(() =>
      execFileSync(moveLatestScript, [source, ghcrLatest], {
        env,
        stdio: 'pipe'
      })
    ).toThrow()
  })
})
