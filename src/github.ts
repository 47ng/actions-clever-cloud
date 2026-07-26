import * as core from '@actions/core'

export type Host = {
  info(message: string): void
  debug(message: string): void
  warning(message: string): void
  maskSecret(value: string): void
  setOutput(name: string, value: unknown): void
  fail(message: string): void
}

export function gitHubHost(): Host {
  return {
    info: core.info,
    debug: core.debug,
    warning: core.warning,
    maskSecret: core.setSecret,
    setOutput: core.setOutput,
    fail: core.setFailed
  }
}
