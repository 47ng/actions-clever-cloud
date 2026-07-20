import fs from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import { getOutputStream } from './action'

// getOutputStream tees its non-quiet output into the shared process.stdout.
// This suite pipes into it repeatedly, which trips Node's 10-listener leak
// warning without lifting the cap (see the same note in action.test.ts).
process.stdout.setMaxListeners(0)

// --

// A timestamp prefix matching the shape the current implementation assumes:
// 'xxxx-xx-xxTxx:xx:xx+xx:xx '.length === 26. Asserted below so this fixture
// can't silently drift out of sync with the code it's meant to exercise.
const TS = '2026-07-20T12:00:00+00:00 '

test('fixture sanity: TS is exactly 26 characters (the hardcoded timestamp-prefix length)', () => {
  expect(TS.length).toBe(26)
})

let stdoutSpy: ReturnType<typeof vi.spyOn>

beforeEach(() => {
  stdoutSpy = vi.spyOn(process.stdout, 'write').mockImplementation(() => true)
})

afterEach(() => {
  stdoutSpy.mockRestore()
})

function capturedStdout(): string {
  return stdoutSpy.mock.calls.map(call => String(call[0])).join('')
}

// The pipeline is a chain of async generators/streams; give it a couple of
// ticks to drain after the source ends before asserting on its output.
async function drain(): Promise<void> {
  await new Promise(resolve => setImmediate(resolve))
  await new Promise(resolve => setImmediate(resolve))
}

async function waitForFileContent(
  filePath: string,
  expected: string
): Promise<void> {
  await vi.waitFor(
    async () => {
      const content = await fs.readFile(filePath, 'utf8').catch(() => '')
      expect(content).toBe(expected)
    },
    { timeout: 2000, interval: 20 }
  )
}

function tempLogFilePath(name: string): string {
  return path.join(
    tmpdir(),
    `output-stream-test-${name}-${Date.now()}-${Math.random().toString(36).slice(2)}.log`
  )
}

// --

test('non-quiet: a plain line passes through to stdout', async () => {
  const tee = await getOutputStream(false)
  tee.write(TS + 'hello\n')
  tee.end()
  await drain()
  expect(capturedStdout()).toContain('hello')
})

test.each(['notice', 'error', 'warning'])(
  'non-quiet: ::%s lines are re-emitted without their timestamp',
  async kind => {
    const tee = await getOutputStream(false)
    tee.write(`${TS}::${kind} ::Deployed!\n`)
    tee.end()
    await drain()
    const out = capturedStdout()
    // Once as the original (timestamped) line, once as the injected
    // annotation (timestamp stripped).
    const occurrences = out.split(`::${kind} ::Deployed!`).length - 1
    expect(occurrences).toBe(2)
  }
)

test('non-quiet: non-annotation lines are not re-emitted', async () => {
  const tee = await getOutputStream(false)
  tee.write(TS + 'plain\n')
  tee.end()
  await drain()
  const out = capturedStdout()
  expect(out.split('plain').length - 1).toBe(1)
})

test('quiet: true suppresses stdout entirely', async () => {
  const tee = await getOutputStream(true)
  tee.write(TS + 'hello\n')
  tee.end()
  await drain()
  expect(stdoutSpy).not.toHaveBeenCalled()
})

test('logFile: receives the raw stream, untouched by annotation injection', async () => {
  const logFile = tempLogFilePath('raw')
  const tee = await getOutputStream(false, logFile)
  tee.write(TS + '::notice ::Deployed!\n')
  tee.end()
  await waitForFileContent(logFile, TS + '::notice ::Deployed!\n')
  await fs.unlink(logFile)
})

test('quiet + logFile: file gets content, stdout gets nothing', async () => {
  const logFile = tempLogFilePath('quiet')
  const tee = await getOutputStream(true, logFile)
  tee.write(TS + 'hello\n')
  tee.end()
  await waitForFileContent(logFile, TS + 'hello\n')
  expect(stdoutSpy).not.toHaveBeenCalled()
  await fs.unlink(logFile)
})

test('non-quiet: adopts \\r\\n as the line separator once seen', async () => {
  const tee = await getOutputStream(false)
  tee.write(TS + 'a\r\n')
  tee.write(TS + '::notice ::x\r\n')
  tee.end()
  await drain()
  const out = capturedStdout()
  expect(out).toContain('::notice ::x\r\n')
})

// BUG (pinned): fixed in plan 007 — flip this assertion then.
test('non-quiet: annotation split across a chunk boundary is NOT detected', async () => {
  const tee = await getOutputStream(false)
  tee.write(TS + '::err')
  tee.write('or ::boom\n')
  tee.end()
  await drain()
  const out = capturedStdout()
  expect(out).not.toContain('::error ::boom')
})

// BUG (pinned): fixed in plan 007 — flip this assertion then.
test('non-quiet: a line without a timestamp prefix loses its annotation', async () => {
  const tee = await getOutputStream(false)
  tee.write('::error ::no-timestamp\n')
  tee.end()
  await drain()
  const out = capturedStdout()
  // The raw line is always echoed once; a properly-detected annotation would
  // add a second, identical occurrence (no timestamp to strip here). Only one
  // occurrence means the annotation was NOT injected.
  expect(out.split('::error ::no-timestamp').length - 1).toBe(1)
})
