import { once } from 'node:events'
import fs from 'node:fs/promises'
import { PassThrough, type Writable } from 'node:stream'
import { finished, pipeline } from 'node:stream/promises'
import { StringDecoder } from 'node:string_decoder'
import type { Host } from './github.ts'

export const TIMESTAMP_PREFIX_REGEX: RegExp =
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:[+-]\d{2}:\d{2}|Z):? /

export type DeployLog = {
  stream: Writable
  /**
   * Resolves once every sink fed by `stream` (the console pipeline, the log
   * file) has finished processing whatever was written before `stream.end()`
   * was called. A sink failing (e.g. ENOSPC, EPIPE) is reported via
   * `host.warning` at failure time rather than rejecting — losing log output
   * must never override the deploy's real outcome.
   */
  done(): Promise<void>
}

export async function createDeployLog(
  options: { quiet: boolean; logFile?: string; consoleStream?: Writable },
  host: Pick<Host, 'warning'>
): Promise<DeployLog> {
  const { quiet, logFile, consoleStream = process.stdout } = options
  const tee = new PassThrough()
  const completions: Promise<void>[] = []
  let liveSinkCount = 0
  const degrade = (sink: string, error: unknown): void => {
    host.warning(
      `deploy log output degraded (${sink}): ${error instanceof Error ? error.message : String(error)}`
    )
  }
  const monitor = (
    sink: string,
    completion: Promise<void>,
    unpipeDeadSink: () => void
  ): void => {
    liveSinkCount += 1
    completions.push(
      completion.catch(error => {
        degrade(sink, error)
        // A dead sink must not hold the tee back through pipe backpressure:
        // detach it so surviving sinks keep flowing.
        unpipeDeadSink()
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
    const writeLinesToConsole = async (
      lines: AsyncIterable<string>
    ): Promise<void> => {
      for await (const line of lines) {
        if (consoleStream.errored) {
          throw consoleStream.errored
        }
        if (!consoleStream.write(line)) {
          // once() rejects if 'error' fires while waiting, so a console
          // stream dying under backpressure (e.g. EPIPE) fails the chain
          // instead of stalling it.
          await once(consoleStream, 'drain')
        }
      }
    }
    // The console stream stays out of pipeline()'s custody: it is shared for
    // the whole action process lifetime and must survive this chain ending or
    // failing. chainInput takes the pipe instead, so a chain failure only
    // costs the tee one unpipe.
    const chainInput = new PassThrough()
    tee.pipe(chainInput)
    // An 'error' listener must exist between writes, or a console stream
    // error would crash the process before writeLinesToConsole observes it.
    const onConsoleError = (): void => {}
    consoleStream.on('error', onConsoleError)
    // pipeline() (unlike bare .pipe()) fails the whole chain when any stage
    // fails, so this one completion sees every console failure mode.
    const consoleDone = pipeline(
      chainInput,
      splitNewlines,
      injectAnnotations,
      writeLinesToConsole
    ).finally(() => {
      consoleStream.off('error', onConsoleError)
    })
    monitor('console', consoleDone, () => tee.unpipe(chainInput))
  }
  if (logFile) {
    try {
      const logFileStream = (await fs.open(logFile, 'w')).createWriteStream()
      tee.pipe(logFileStream)
      monitor('log file', finished(logFileStream), () =>
        tee.unpipe(logFileStream)
      )
    } catch (error) {
      degrade('log file', error)
    }
  }
  if (liveSinkCount === 0) {
    tee.resume()
  }
  const done = async (): Promise<void> => {
    await Promise.all(completions)
  }
  return { stream: tee, done }
}
