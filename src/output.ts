import fs from 'node:fs/promises'
import { PassThrough, Transform, type Writable } from 'node:stream'
import { finished } from 'node:stream/promises'
import { StringDecoder } from 'node:string_decoder'
import type { Host } from './github.ts'

export const TIMESTAMP_PREFIX_REGEX =
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:[+-]\d{2}:\d{2}|Z):? /

export type DeployLog = {
  stream: Writable
  /**
   * Resolves once every sink fed by `stream` (the console pipeline, the log
   * file) has finished processing whatever was written before `stream.end()`
   * was called. A sink failing (e.g. ENOSPC, EPIPE) is reported via
   * `host.warning` rather than rejecting — losing log output must never
   * override the deploy's real outcome.
   */
  done(): Promise<void>
}

export async function createDeployLog(
  options: { quiet: boolean; logFile?: string },
  host: Pick<Host, 'warning'>
): Promise<DeployLog> {
  const { quiet, logFile } = options
  const tee = new PassThrough()
  const completions: Promise<void>[] = []
  const completionErrors: unknown[] = []
  let liveSinkCount = 0
  const monitor = (completion: Promise<void>): void => {
    liveSinkCount += 1
    completions.push(
      completion.catch(error => {
        completionErrors.push(error)
        liveSinkCount -= 1
        if (liveSinkCount === 0) {
          tee.resume()
        }
      })
    )
  }
  if (!quiet) {
    let lineSeparator = '\n'
    async function* splitNewlines(
      input: AsyncIterable<Buffer>
    ): AsyncGenerator<string> {
      let carry = ''
      const decoder = new StringDecoder('utf8')
      for await (const chunk of input) {
        const str = carry + decoder.write(chunk)
        if (str.includes('\r\n')) {
          lineSeparator = '\r\n'
        }
        const lines = str.split(/\r?\n/)
        carry = lines.pop() ?? ''
        for (const line of lines) {
          yield line
        }
      }
      carry += decoder.end()
      if (carry.length > 0) {
        yield carry
      }
    }
    async function* injectAnnotations(
      lines: AsyncIterable<string>
    ): AsyncGenerator<string> {
      for await (const line of lines) {
        yield line + lineSeparator
        const message = line.replace(TIMESTAMP_PREFIX_REGEX, '')
        // Only re-emit when a timestamp was actually stripped: a line that
        // already contains a runner-recognized workflow command (without a
        // timestamp) is echoed above as-is, and the runner parses it on its
        // own. Re-emitting it here would duplicate the annotation.
        const isAnnotation = /^::(?:notice|error|warning)(?:::| .*::)/i.test(
          message.trimStart()
        )
        if (message !== line && isAnnotation) {
          yield message + lineSeparator
        }
      }
    }
    const lastTransform = tee
      .pipe(Transform.from(splitNewlines))
      .pipe(Transform.from(injectAnnotations))
    // `end: false`: process.stdout is shared for the whole action process
    // lifetime — this tee ending must not close it.
    lastTransform.pipe(process.stdout, { end: false })
    monitor(finished(lastTransform))
  }
  if (logFile) {
    try {
      const logFileStream = (await fs.open(logFile, 'w')).createWriteStream()
      tee.pipe(logFileStream)
      monitor(finished(logFileStream))
    } catch (error) {
      completionErrors.push(error)
    }
  }
  if (liveSinkCount === 0) {
    tee.resume()
  }
  const done = async (): Promise<void> => {
    await Promise.all(completions)
    if (completionErrors.length > 0) {
      const error = completionErrors[0]
      host.warning(
        `deploy log output degraded: ${error instanceof Error ? error.message : String(error)}`
      )
    }
  }
  return { stream: tee, done }
}
