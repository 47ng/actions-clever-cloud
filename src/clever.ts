import type { Writable } from 'node:stream'
import type { Host } from './github'
import {
  exitReason,
  runProcess,
  startProcess,
  stderrDetail,
  type RunningProcess,
  type RunResult
} from './process'

const DEPLOY_TERMINATION_GRACE_PERIOD_MS = 5000
const DEPLOY_FORCE_KILL_WAIT_MS = 5000

export type DeployOptions = {
  alias?: string
  force?: boolean
  sameCommitPolicy?: string
  timeoutSeconds?: number
}

export type DeployOutcome = 'deployed' | 'timed-out'

export type Clever = {
  linkedAppAlias(appID: string): Promise<string | undefined>
  link(appID: string): Promise<void>
  setEnv(name: string, value: string, alias?: string): Promise<void>
  deploy(options: DeployOptions): Promise<DeployOutcome>
}

export function cleverClient(deps: {
  cliPath: string
  cwd?: string
  output: Writable
  host: Host
}): Clever {
  const { cliPath, cwd, output, host } = deps
  return {
    async linkedAppAlias(appID) {
      const result = await runProcess(cliPath, ['applications', '--json'], {
        cwd,
        captureStdout: true,
        captureStderr: true
      })
      if (result.code !== 0 || result.signal) {
        throw new Error(
          `Failed to list linked applications (${exitReason(result)})` +
            stderrDetail(result.stderr)
        )
      }
      return parseLinkedAppAlias(result.stdout, appID)
    },
    async link(appID) {
      const result = await runProcess(
        cliPath,
        ['link', appID, '--alias', appID],
        { cwd, outStream: output }
      )
      if (result.code !== 0 || result.signal) {
        throw new Error(
          `Failed to link application ${appID} (${exitReason(result)})`
        )
      }
    },
    async setEnv(name, value, alias) {
      const args = ['env', 'set']
      if (alias) {
        args.push('--alias', alias)
      }
      args.push(name, value)
      if (value) {
        host.maskSecret(value)
      }
      host.info(`Setting environment variable ${name}`)
      const result = await runProcess(cliPath, args, {
        cwd,
        captureStderr: true
      })
      if (result.code !== 0 || result.signal) {
        // stderr may echo the value back (e.g. a rejected value in the CLI's
        // own error message); safe to surface because maskSecret() above
        // already registered it with the runner's log masking.
        throw new Error(
          `Failed to set environment variable ${name} (${exitReason(result)})` +
            stderrDetail(result.stderr)
        )
      }
    },
    async deploy(options) {
      const deployment = startProcess(cliPath, buildDeployArgs(options), {
        cwd,
        outStream: output
      })
      const result = options.timeoutSeconds
        ? await raceAgainstTimeout(deployment, options.timeoutSeconds * 1000)
        : await deployment.exited
      if (result === 'timed-out') {
        await terminateDeployment(deployment)
        return 'timed-out'
      }
      if (result.signal) {
        throw new Error(`Deployment terminated by signal ${result.signal}`)
      }
      if (result.code !== 0) {
        throw new Error(`Deployment failed with code ${result.code}`)
      }
      return 'deployed'
    }
  }
}

export function buildDeployArgs(options: DeployOptions): string[] {
  const args = ['deploy']
  if (options.alias) {
    args.push('--alias', options.alias)
  }
  if (options.force) {
    args.push('--force')
  }
  if (options.sameCommitPolicy) {
    args.push('--same-commit-policy', options.sameCommitPolicy)
  }
  return args
}

export function parseLinkedAppAlias(
  json: string,
  appID: string
): string | undefined {
  let applications: unknown
  try {
    applications = JSON.parse(json)
  } catch (error) {
    throw new Error('Clever CLI returned invalid linked application data', {
      cause: error
    })
  }
  if (!Array.isArray(applications)) {
    throw new Error('Clever CLI returned invalid linked application data')
  }
  const linkedApplication = applications.find(
    (application): application is { app_id: string; alias?: unknown } =>
      typeof application === 'object' &&
      application !== null &&
      'app_id' in application &&
      application.app_id === appID
  )
  if (!linkedApplication) {
    return undefined
  }
  if (
    typeof linkedApplication.alias !== 'string' ||
    linkedApplication.alias.length === 0
  ) {
    throw new Error(`Application ${appID} is linked without a valid alias`)
  }
  return linkedApplication.alias
}

async function raceAgainstTimeout(
  deployment: RunningProcess,
  timeoutMs: number
): Promise<RunResult | 'timed-out'> {
  let timeoutID: NodeJS.Timeout | undefined
  const expired = new Promise<'timed-out'>(resolve => {
    timeoutID = setTimeout(() => resolve('timed-out'), timeoutMs)
  })
  try {
    return await Promise.race([deployment.exited, expired])
  } finally {
    // Always clear the timer, even if `exited` rejects (e.g. spawn error),
    // otherwise the pending timeout keeps the event loop alive until it fires.
    clearTimeout(timeoutID)
  }
}

// Let the child finish handling SIGTERM and drain its output before the
// shared output stream is closed downstream. Escalate if graceful
// termination takes too long, and detach a child that survives even SIGKILL.
async function terminateDeployment(deployment: RunningProcess): Promise<void> {
  const settledExit = deployment.exited.then(
    () => undefined,
    () => undefined
  )
  deployment.kill('SIGTERM')
  let graceTimeoutID: NodeJS.Timeout | undefined
  const gracePeriodExpired = new Promise<boolean>(resolve => {
    graceTimeoutID = setTimeout(
      () => resolve(true),
      DEPLOY_TERMINATION_GRACE_PERIOD_MS
    )
  })
  const forced = await Promise.race([
    settledExit.then(() => false),
    gracePeriodExpired
  ])
  clearTimeout(graceTimeoutID)
  if (!forced) {
    return
  }
  deployment.kill('SIGKILL')
  let waitTimeoutID: NodeJS.Timeout | undefined
  const forceKillWaitExpired = new Promise<boolean>(resolve => {
    waitTimeoutID = setTimeout(() => resolve(false), DEPLOY_FORCE_KILL_WAIT_MS)
  })
  const exitedAfterForceKill = await Promise.race([
    settledExit.then(() => true),
    forceKillWaitExpired
  ])
  clearTimeout(waitTimeoutID)
  if (!exitedAfterForceKill) {
    deployment.detach()
  }
}
