import fs from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { Writable } from 'node:stream'
import { StringDecoder } from 'node:string_decoder'
import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import {
  createDeployLog,
  TIMESTAMP_PREFIX_REGEX,
  type DeployLog
} from './output.ts'

// --

// A timestamp prefix in the shape the Clever CLI emits, asserted against the
// pipeline's own regex so this fixture can't drift out of sync with the code
// it exercises.
const TS = '2026-07-20T12:00:00+00:00 '

test('fixture sanity: TS matches the timestamp prefix the pipeline strips', () => {
  expect(TS).toMatch(TIMESTAMP_PREFIX_REGEX)
})

let stdoutSpy: ReturnType<typeof vi.spyOn>
const warning = vi.fn()

function deployLog(quiet: boolean, logFile?: string): Promise<DeployLog> {
  return createDeployLog({ quiet, logFile }, { warning })
}

beforeEach(() => {
  stdoutSpy = vi.spyOn(process.stdout, 'write').mockImplementation(() => true)
  warning.mockClear()
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
    `output-test-${name}-${Date.now()}-${Math.random().toString(36).slice(2)}.log`
  )
}

// --

test('non-quiet: a plain line passes through to stdout', async () => {
  const { stream, done } = await deployLog(false)
  stream.write(TS + 'hello\n')
  stream.end()
  await done()
  expect(capturedStdout()).toContain('hello')
})

test.each(['notice', 'error', 'warning'])(
  'non-quiet: ::%s lines are re-emitted without their timestamp',
  async kind => {
    const { stream, done } = await deployLog(false)
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
    const { stream, done } = await deployLog(false)
    stream.write(`${TS}::${kind}::Deployed!\n`)
    stream.end()
    await done()
    const out = capturedStdout()
    const occurrences = out.split(`::${kind}::Deployed!`).length - 1
    expect(occurrences).toBe(2)
  }
)

test('non-quiet: command names are matched case-insensitively', async () => {
  const { stream, done } = await deployLog(false)
  stream.write(`${TS}::ERROR::Deployed!\n`)
  stream.end()
  await done()
  const out = capturedStdout()
  expect(out.split('::ERROR::Deployed!').length - 1).toBe(2)
})

test('non-quiet: leading command whitespace is tolerated', async () => {
  const { stream, done } = await deployLog(false)
  stream.write(`${TS} ::error::Deployed!\n`)
  stream.end()
  await done()
  const out = capturedStdout()
  expect(out.split('::error::Deployed!').length - 1).toBe(2)
})

test('non-quiet: a property command without a closing delimiter is not re-emitted', async () => {
  const { stream, done } = await deployLog(false)
  stream.write(`${TS}::error title=Deploy failed\n`)
  stream.end()
  await done()
  const out = capturedStdout()
  expect(out.split('::error title=Deploy failed').length - 1).toBe(1)
})

test('non-quiet: non-annotation lines are not re-emitted', async () => {
  const { stream, done } = await deployLog(false)
  stream.write(TS + 'plain\n')
  stream.end()
  await done()
  const out = capturedStdout()
  expect(out.split('plain').length - 1).toBe(1)
})

test('quiet: true suppresses stdout entirely', async () => {
  const { stream, done } = await deployLog(true)
  stream.write(TS + 'hello\n')
  stream.end()
  await done()
  expect(stdoutSpy).not.toHaveBeenCalled()
})

test('logFile + non-quiet: the file gets the raw stream AND stdout gets the processed stream', async () => {
  const logFile = tempLogFilePath('raw')
  const { stream, done } = await deployLog(false, logFile)
  stream.write(TS + '::notice ::Deployed!\n')
  stream.end()
  await done()
  const content = await fs.readFile(logFile, 'utf8')
  // The log file receives the tee's raw input, untouched by annotation
  // injection: exactly the one line that was written, timestamp intact.
  expect(content).toBe(TS + '::notice ::Deployed!\n')
  // stdout receives the processed stream: the original line plus the
  // injected (timestamp-stripped) annotation.
  expect(capturedStdout().split('::notice ::Deployed!').length - 1).toBe(2)
  await fs.unlink(logFile)
})

test('quiet + logFile: file gets content, stdout gets nothing', async () => {
  const logFile = tempLogFilePath('quiet')
  const { stream, done } = await deployLog(true, logFile)
  stream.write(TS + 'hello\n')
  stream.end()
  await done()
  const content = await fs.readFile(logFile, 'utf8')
  expect(content).toBe(TS + 'hello\n')
  expect(stdoutSpy).not.toHaveBeenCalled()
  await fs.unlink(logFile)
})

test('log file open failure warns immediately and keeps draining', async () => {
  const openSpy = vi
    .spyOn(fs, 'open')
    .mockRejectedValue(new Error('ENOENT: missing directory'))
  try {
    const { stream, done } = await deployLog(true, '/missing/deploy.log')
    // The warning fires at open time, not deferred until done(): a deploy
    // that later hangs should still have surfaced the degraded log output.
    expect(warning).toHaveBeenCalledWith(
      'deploy log output degraded (log file): ENOENT: missing directory'
    )
    for (let index = 0; index < 256; index += 1) {
      stream.write(Buffer.alloc(1024))
    }
    stream.end()
    await expect(done()).resolves.toBeUndefined()
  } finally {
    openSpy.mockRestore()
  }
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
    const { stream, done } = await deployLog(true, 'deploy.log')
    stream.write('first output')
    await new Promise(resolve => setImmediate(resolve))

    for (let index = 0; index < 256; index += 1) {
      stream.write(Buffer.alloc(1024))
    }
    await new Promise(resolve => setImmediate(resolve))
    expect(stream.writableLength).toBe(0)

    stream.end()
    await expect(done()).resolves.toBeUndefined()
    expect(warning).toHaveBeenCalledWith(
      'deploy log output degraded (log file): disk full'
    )
  } finally {
    openSpy.mockRestore()
  }
})

// -- Console pipeline failure scenarios (issue #257) --

function failingSink(message: string): Writable {
  return new Writable({
    highWaterMark: 1,
    write(_chunk, _encoding, callback) {
      callback(new Error(message))
    }
  })
}

test('non-quiet: a console stream write error degrades with a warning and keeps draining', async () => {
  const consoleStream = failingSink('EPIPE: broken pipe')
  const { stream, done } = await createDeployLog(
    { quiet: false, consoleStream },
    { warning }
  )
  stream.write(TS + 'first\n')
  await new Promise(resolve => setImmediate(resolve))
  for (let index = 0; index < 256; index += 1) {
    stream.write(Buffer.alloc(1024))
  }
  stream.end()
  await expect(done()).resolves.toBeUndefined()
  expect(warning).toHaveBeenCalledWith(
    'deploy log output degraded (console): EPIPE: broken pipe'
  )
})

test('a mid-chain transform failure degrades console while the log file keeps writing', async () => {
  const decoderSpy = vi
    .spyOn(StringDecoder.prototype, 'write')
    .mockImplementation(() => {
      throw new Error('split boom')
    })
  const logFile = tempLogFilePath('mid-chain')
  try {
    const { stream, done } = await deployLog(false, logFile)
    stream.write(TS + 'hello\n')
    stream.end()
    await expect(done()).resolves.toBeUndefined()
    expect(warning).toHaveBeenCalledWith(
      'deploy log output degraded (console): split boom'
    )
    const content = await fs.readFile(logFile, 'utf8')
    expect(content).toBe(TS + 'hello\n')
  } finally {
    decoderSpy.mockRestore()
    await fs.unlink(logFile)
  }
})

test('a console stream dying under backpressure degrades while the log file keeps writing', async () => {
  const consoleStream = failingSink('EPIPE: broken pipe')
  const logFile = tempLogFilePath('backpressure')
  try {
    const { stream, done } = await createDeployLog(
      { quiet: false, logFile, consoleStream },
      { warning }
    )
    // Enough data to overwhelm every buffer between the tee and the dead
    // chain: backpressure from the stalled console pipeline must not starve
    // the healthy file sink.
    const filler = (TS + 'x'.repeat(1017) + '\n').repeat(256)
    stream.write(filler)
    stream.end()
    await expect(done()).resolves.toBeUndefined()
    expect(warning).toHaveBeenCalledWith(
      'deploy log output degraded (console): EPIPE: broken pipe'
    )
    const content = await fs.readFile(logFile, 'utf8')
    expect(content).toBe(filler)
  } finally {
    await fs.unlink(logFile)
  }
})

test('non-quiet without a log file: a dead console chain still drains the tee', async () => {
  const decoderSpy = vi
    .spyOn(StringDecoder.prototype, 'write')
    .mockImplementation(() => {
      throw new Error('split boom')
    })
  try {
    const { stream, done } = await deployLog(false)
    stream.write(TS + 'first\n')
    await new Promise(resolve => setImmediate(resolve))
    for (let index = 0; index < 256; index += 1) {
      stream.write(Buffer.alloc(1024))
    }
    stream.end()
    await expect(done()).resolves.toBeUndefined()
    expect(warning).toHaveBeenCalledWith(
      'deploy log output degraded (console): split boom'
    )
  } finally {
    decoderSpy.mockRestore()
  }
})

test('a console stream dying while idle still degrades with a warning', async () => {
  const consoleStream = new Writable({
    write(_chunk, _encoding, callback) {
      callback()
    }
  })
  const { stream, done } = await createDeployLog(
    { quiet: false, consoleStream },
    { warning }
  )
  stream.write(TS + 'first\n')
  await new Promise(resolve => setImmediate(resolve))
  consoleStream.destroy(new Error('EPIPE while idle'))
  await new Promise(resolve => setImmediate(resolve))
  stream.end()
  await expect(done()).resolves.toBeUndefined()
  expect(warning).toHaveBeenCalledWith(
    'deploy log output degraded (console): EPIPE while idle'
  )
})

test('a console stream closed without error while backpressured fails the chain instead of hanging', async () => {
  const consoleStream = new Writable({
    highWaterMark: 1,
    write(_chunk, _encoding, _callback) {
      // Never completes: permanent backpressure.
    }
  })
  const { stream, done } = await createDeployLog(
    { quiet: false, consoleStream },
    { warning }
  )
  stream.write(TS + 'first\n')
  await new Promise(resolve => setImmediate(resolve))
  consoleStream.destroy()
  stream.end()
  await expect(done()).resolves.toBeUndefined()
  expect(warning).toHaveBeenCalledWith(
    'deploy log output degraded (console): console stream closed while awaiting drain'
  )
})

test('destroying the deploy log stream settles done() instead of hanging', async () => {
  const logFile = tempLogFilePath('destroyed-tee')
  try {
    const { stream, done } = await deployLog(false, logFile)
    stream.write(TS + 'first\n')
    stream.destroy()
    await expect(done()).resolves.toBeUndefined()
    expect(warning).toHaveBeenCalledWith(
      'deploy log output degraded (console): Premature close'
    )
    expect(warning).toHaveBeenCalledWith(
      'deploy log output degraded (log file): Premature close'
    )
  } finally {
    await fs.unlink(logFile)
  }
})

test('the console stream error listener is removed once the chain settles', async () => {
  const consoleStream = new Writable({
    write(_chunk, _encoding, callback) {
      callback()
    }
  })
  const { stream, done } = await createDeployLog(
    { quiet: false, consoleStream },
    { warning }
  )
  stream.write(TS + 'hello\n')
  stream.end()
  await done()
  expect(consoleStream.listenerCount('error')).toBe(0)
})

test('non-quiet: adopts \\r\\n as the line separator once seen', async () => {
  const { stream, done } = await deployLog(false)
  stream.write(TS + 'a\r\n')
  stream.write(TS + '::notice ::x\r\n')
  stream.end()
  await done()
  const out = capturedStdout()
  expect(out).toContain('::notice ::x\r\n')
})

test('non-quiet: annotation split across a chunk boundary IS detected', async () => {
  const { stream, done } = await deployLog(false)
  stream.write(TS + '::err')
  stream.write('or ::boom\n')
  stream.end()
  await done()
  const out = capturedStdout()
  expect(out).toContain('::error ::boom')
})

test('non-quiet: a multi-byte character split across chunks is decoded intact', async () => {
  const { stream, done } = await deployLog(false)
  const line = Buffer.from(TS + '::error ::déploy\n')
  const splitAt = line.indexOf(Buffer.from('é')) + 1
  stream.write(line.subarray(0, splitAt))
  stream.write(line.subarray(splitAt))
  stream.end()
  await done()
  const out = capturedStdout()
  expect(out.split('::error ::déploy').length - 1).toBe(2)
  expect(out).not.toContain('�')
})

test('non-quiet: a line without a timestamp prefix is not duplicated', async () => {
  const { stream, done } = await deployLog(false)
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
  const { stream, done } = await deployLog(false)
  stream.write('::error::no-timestamp\n')
  stream.end()
  await done()
  const out = capturedStdout()
  expect(out.split('::error::no-timestamp').length - 1).toBe(1)
})

test('non-quiet: a Clever CLI timestamp is stripped before annotation detection', async () => {
  const { stream, done } = await deployLog(false)
  stream.write('2026-07-20T12:00:00.000Z: ::error ::zulu\n')
  stream.end()
  await done()
  const out = capturedStdout()
  expect(out.split('::error ::zulu').length - 1).toBe(2)
})

test('non-quiet: a chunk ending exactly on \\n produces no phantom empty line', async () => {
  const { stream, done } = await deployLog(false)
  stream.write(TS + 'a\n')
  stream.end()
  await done()
  expect(capturedStdout()).toBe(TS + 'a\n')
})

test('non-quiet: an unterminated final line is still emitted after end() — reflects production, where main always ends the stream', async () => {
  const { stream, done } = await deployLog(false)
  stream.write(TS + 'no-trailing-newline')
  stream.end()
  await done()
  expect(capturedStdout()).toContain('no-trailing-newline')
})
