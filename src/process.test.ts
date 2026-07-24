import { realpathSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { PassThrough } from 'node:stream'
import { expect, test } from 'vitest'
import { runProcess, startProcess } from './process.ts'

const node = process.execPath

test('captures stdout and stderr when asked', async () => {
  const result = await runProcess(
    node,
    ['-e', `console.log('out'); console.error('err')`],
    { captureStdout: true, captureStderr: true }
  )
  expect(result.code).toBe(0)
  expect(result.signal).toBeNull()
  expect(result.stdout.trim()).toBe('out')
  expect(result.stderr.trim()).toBe('err')
})

test('returns non-zero exit codes instead of rejecting', async () => {
  const result = await runProcess(node, ['-e', 'process.exit(3)'])
  expect(result.code).toBe(3)
  expect(result.signal).toBeNull()
})

test('pipes stdout and stderr into outStream without ending it', async () => {
  const outStream = new PassThrough()
  const chunks: Buffer[] = []
  outStream.on('data', chunk => chunks.push(chunk))
  await runProcess(
    node,
    ['-e', `console.log('to-tee'); console.error('err-tee')`],
    { outStream }
  )
  await new Promise(resolve => setImmediate(resolve))
  const output = Buffer.concat(chunks).toString()
  expect(output).toContain('to-tee')
  expect(output).toContain('err-tee')
  expect(outStream.writableEnded).toBe(false)
})

test('capture without outStream keeps output off the user-facing stream', async () => {
  const result = await runProcess(node, ['-e', `console.log('nope')`], {
    captureStdout: true
  })
  expect(result.stdout.trim()).toBe('nope')
})

test('discards child output when neither piped nor captured', async () => {
  // 1MiB exceeds the OS pipe buffer: the child would block forever
  // if the parent never drained its stdout.
  const result = await runProcess(node, [
    '-e',
    `process.stdout.write('x'.repeat(1 << 20))`
  ])
  expect(result.code).toBe(0)
  expect(result.stdout).toBe('')
})

test('runs the child in the given working directory', async () => {
  const cwd = realpathSync(tmpdir())
  const result = await runProcess(node, ['-e', 'console.log(process.cwd())'], {
    cwd,
    captureStdout: true
  })
  expect(realpathSync(result.stdout.trim())).toBe(cwd)
})

test('rejects on spawn error', async () => {
  await expect(
    runProcess('/nonexistent/definitely-not-a-command', [])
  ).rejects.toThrow()
})

test('reports the terminating signal', async () => {
  const child = startProcess(node, ['-e', 'setInterval(() => {}, 1000)'])
  child.kill('SIGKILL')
  const result = await child.exited
  expect(result.signal).toBe('SIGKILL')
  expect(result.code).toBeNull()
})

test('detach disconnects a stuck child so the caller can move on', async () => {
  const outStream = new PassThrough()
  outStream.resume()
  const child = startProcess(node, ['-e', 'setInterval(() => {}, 1000)'], {
    outStream
  })
  child.detach()
  child.kill('SIGKILL')
  const result = await child.exited
  expect(result.signal).toBe('SIGKILL')
  expect(outStream.writableEnded).toBe(false)
})
