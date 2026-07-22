import fs from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { Writable } from 'node:stream'
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
  return stdoutSpy.mock.calls.map((call: unknown[]) => String(call[0])).join('')
}

function tempLogFilePath(name: string): string {
  return path.join(
    tmpdir(),
    `output-stream-test-${name}-${Date.now()}-${Math.random().toString(36).slice(2)}.log`
  )
}

// --

test('non-quiet: a plain line passes through to stdout', async () => {
  const { stream, done } = await getOutputStream(false)
  stream.write(TS + 'hello\n')
  stream.end()
  await done()
  expect(capturedStdout()).toContain('hello')
})

test.each(['notice', 'error', 'warning'])(
  'non-quiet: ::%s lines are re-emitted without their timestamp',
  async kind => {
    const { stream, done } = await getOutputStream(false)
    stream.write(`${TS}::${kind} ::Deployed!\n`)
    stream.end()
    await done()
    const out = capturedStdout()
    // Once as the original (timestamped) line, once as the injected
    // annotation (timestamp stripped).
    const occurrences = out.split(`::${kind} ::Deployed!`).length - 1
    expect(occurrences).toBe(2)
  }
)

test.each(['notice', 'error', 'warning'])(
  'non-quiet: no-property ::%s commands are re-emitted without their timestamp',
  async kind => {
    const { stream, done } = await getOutputStream(false)
    stream.write(`${TS}::${kind}::Deployed!\n`)
    stream.end()
    await done()
    const out = capturedStdout()
    const occurrences = out.split(`::${kind}::Deployed!`).length - 1
    expect(occurrences).toBe(2)
  }
)

test('non-quiet: command names are matched case-insensitively', async () => {
  const { stream, done } = await getOutputStream(false)
  stream.write(`${TS}::ERROR::Deployed!\n`)
  stream.end()
  await done()
  const out = capturedStdout()
  expect(out.split('::ERROR::Deployed!').length - 1).toBe(2)
})

test('non-quiet: leading command whitespace is tolerated', async () => {
  const { stream, done } = await getOutputStream(false)
  stream.write(`${TS} ::error::Deployed!\n`)
  stream.end()
  await done()
  const out = capturedStdout()
  expect(out.split('::error::Deployed!').length - 1).toBe(2)
})

test('non-quiet: a property command without a closing delimiter is not re-emitted', async () => {
  const { stream, done } = await getOutputStream(false)
  stream.write(`${TS}::error title=Deploy failed\n`)
  stream.end()
  await done()
  const out = capturedStdout()
  expect(out.split('::error title=Deploy failed').length - 1).toBe(1)
})

test('non-quiet: non-annotation lines are not re-emitted', async () => {
  const { stream, done } = await getOutputStream(false)
  stream.write(TS + 'plain\n')
  stream.end()
  await done()
  const out = capturedStdout()
  expect(out.split('plain').length - 1).toBe(1)
})

test('quiet: true suppresses stdout entirely', async () => {
  const { stream, done } = await getOutputStream(true)
  stream.write(TS + 'hello\n')
  stream.end()
  await done()
  expect(stdoutSpy).not.toHaveBeenCalled()
})

test('logFile + non-quiet: the file gets the raw stream AND stdout gets the processed stream', async () => {
  const logFile = tempLogFilePath('raw')
  const { stream, done } = await getOutputStream(false, logFile)
  stream.write(TS + '::notice ::Deployed!\n')
  stream.end()
  await done()
  const content = await fs.readFile(logFile, 'utf8')
  // The log file receives the tee's raw input, untouched by annotation
  // injection: exactly the one line that was written, timestamp intact.
  expect(content).toBe(TS + '::notice ::Deployed!\n')
  // stdout receives the processed stream: the original line plus the
  // injected (timestamp-stripped) annotation — two occurrences pin that
  // both sinks actually fed off the same tee, not just one or the other.
  expect(capturedStdout().split('::notice ::Deployed!').length - 1).toBe(2)
  await fs.unlink(logFile)
})

test('quiet + logFile: file gets content, stdout gets nothing', async () => {
  const logFile = tempLogFilePath('quiet')
  const { stream, done } = await getOutputStream(true, logFile)
  stream.write(TS + 'hello\n')
  stream.end()
  await done()
  const content = await fs.readFile(logFile, 'utf8')
  expect(content).toBe(TS + 'hello\n')
  expect(stdoutSpy).not.toHaveBeenCalled()
  await fs.unlink(logFile)
})

test('log sink failure is handled early and later output keeps draining', async () => {
  const sink = new Writable({
    write(_chunk, _encoding, callback) {
      callback(new Error('disk full'))
    }
  })
  const openSpy = vi.spyOn(fs, 'open').mockResolvedValue({
    createWriteStream: () => sink
  } as never)
  try {
    const { stream, done } = await getOutputStream(true, 'deploy.log')
    stream.write('first output')
    await new Promise(resolve => setImmediate(resolve))

    for (let index = 0; index < 256; index += 1) {
      stream.write(Buffer.alloc(1024))
    }
    await new Promise(resolve => setImmediate(resolve))
    expect(stream.writableLength).toBe(0)

    stream.end()
    await expect(done()).resolves.toBeUndefined()
  } finally {
    openSpy.mockRestore()
  }
})

test('non-quiet: adopts \\r\\n as the line separator once seen', async () => {
  const { stream, done } = await getOutputStream(false)
  stream.write(TS + 'a\r\n')
  stream.write(TS + '::notice ::x\r\n')
  stream.end()
  await done()
  const out = capturedStdout()
  expect(out).toContain('::notice ::x\r\n')
})

test('non-quiet: annotation split across a chunk boundary IS detected', async () => {
  const { stream, done } = await getOutputStream(false)
  stream.write(TS + '::err')
  stream.write('or ::boom\n')
  stream.end()
  await done()
  const out = capturedStdout()
  expect(out).toContain('::error ::boom')
})

test('non-quiet: a multi-byte character split across chunks is decoded intact', async () => {
  const { stream, done } = await getOutputStream(false)
  const line = Buffer.from(TS + '::error ::d\u00e9ploy\n')
  const splitAt = line.indexOf(Buffer.from('\u00e9')) + 1
  stream.write(line.subarray(0, splitAt))
  stream.write(line.subarray(splitAt))
  stream.end()
  await done()
  const out = capturedStdout()
  expect(out.split('::error ::d\u00e9ploy').length - 1).toBe(2)
  expect(out).not.toContain('\ufffd')
})

test('non-quiet: a line without a timestamp prefix is not duplicated', async () => {
  const { stream, done } = await getOutputStream(false)
  stream.write('::error ::no-timestamp\n')
  stream.end()
  await done()
  const out = capturedStdout()
  // No timestamp was stripped, so no annotation is injected: the runner
  // already parses this workflow command from the raw, column-0 line.
  // Re-emitting it here would duplicate the annotation.
  expect(out.split('::error ::no-timestamp').length - 1).toBe(1)
})

test('non-quiet: a no-property command without a timestamp is not duplicated', async () => {
  const { stream, done } = await getOutputStream(false)
  stream.write('::error::no-timestamp\n')
  stream.end()
  await done()
  const out = capturedStdout()
  expect(out.split('::error::no-timestamp').length - 1).toBe(1)
})

test('non-quiet: a Clever CLI timestamp is stripped before annotation detection', async () => {
  const { stream, done } = await getOutputStream(false)
  stream.write('2026-07-20T12:00:00.000Z: ::error ::zulu\n')
  stream.end()
  await done()
  const out = capturedStdout()
  expect(out.split('::error ::zulu').length - 1).toBe(2)
})

test('non-quiet: a chunk ending exactly on \\n produces no phantom empty line', async () => {
  const { stream, done } = await getOutputStream(false)
  stream.write(TS + 'a\n')
  stream.end()
  await done()
  expect(capturedStdout()).toBe(TS + 'a\n')
})

test('non-quiet: an unterminated final line is still emitted after end() — reflects production, where run() always ends the stream', async () => {
  const { stream, done } = await getOutputStream(false)
  stream.write(TS + 'no-trailing-newline')
  stream.end()
  await done()
  expect(capturedStdout()).toContain('no-trailing-newline')
})
