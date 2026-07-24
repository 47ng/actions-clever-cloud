type CommandResult = {
  stdout: string
  stderr: string
}

type CommandOptions = {
  timeoutMs: number
}

type RunCommand = (
  cli: string,
  args: string[],
  options: CommandOptions
) => Promise<CommandResult>

type Sleep = (timeoutMs: number) => Promise<void>

type CreateApplicationOptions = {
  name: string
  region: string
}

type DeleteApplicationOptions = {
  appId: string
  name: string
}

type CleverControllerOptions = {
  cleverCLI: string
  runCommand: RunCommand
  sleep?: Sleep
  settleTimeoutMs?: number
  pollIntervalMs?: number
}

type CreatedApplication = {
  appId: string
  name: string
}

type CancelDeploymentOptions = {
  appId: string
  deploymentId: string
  timeoutMs?: number
}

type CleverController = {
  listActivity: (
    appId: string,
    timeoutMs?: number
  ) => Promise<DeploymentActivity[]>
  cancelDeployment: (
    options: CancelDeploymentOptions
  ) => Promise<DeploymentActivity>
  createApplication: (
    options: CreateApplicationOptions
  ) => Promise<CreatedApplication>
  findApplicationByName: (name: string) => Promise<CreatedApplication>
  getEnvironmentValue: (appId: string, name: string) => Promise<string | null>
  getPublicOrigin: (appId: string) => Promise<string>
  deleteApplication: (options: DeleteApplicationOptions) => Promise<void>
}

type CreateApplicationController = {
  createApplication: (
    options: CreateApplicationOptions
  ) => Promise<CreatedApplication>
  findApplicationByName: (name: string) => Promise<CreatedApplication>
}

type DeploymentActivity = {
  action?: string
  state?: string
  uuid?: string
  commit?: string
}

type ListedApplication = {
  app_id?: string
  name?: string
  deploy_url?: string
}

type ListedOrganisation = {
  applications?: ListedApplication[]
}

type ListedEnvironment = {
  env?: Array<{
    name?: string
    value?: string
  }>
}

export const APP_ID_REGEX: RegExp =
  /^app_[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/
const COMMAND_TIMEOUT_MS = 30_000
const DEFAULT_SETTLE_TIMEOUT_MS = 10 * 60_000
const DEFAULT_POLL_INTERVAL_MS = 5_000
const IN_PROGRESS_STATES = new Set(['WIP', 'PENDING', 'QUEUED', 'RUNNING'])
const CANCELLABLE_STATES = new Set(['WIP'])

export class RecoverableCreateApplicationError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'RecoverableCreateApplicationError'
  }
}

function isRecoverableCreateCommandFailure(error: unknown): boolean {
  if (!error || typeof error !== 'object') {
    return false
  }

  return (
    error instanceof Error &&
    ((('code' in error && error.code === 'ETIMEDOUT') ||
      ('signal' in error && typeof error.signal === 'string')) ||
      ('killed' in error && error.killed === true))
  )
}

export async function createApplicationWithRecovery(
  controller: CreateApplicationController,
  options: CreateApplicationOptions
): Promise<CreatedApplication> {
  try {
    return await controller.createApplication(options)
  } catch (error) {
    if (!(error instanceof RecoverableCreateApplicationError)) {
      throw error
    }

    try {
      return await controller.findApplicationByName(options.name)
    } catch (recoveryError) {
      const recoveryMessage =
        recoveryError instanceof Error
          ? recoveryError.message
          : String(recoveryError)
      throw new Error(
        `${error.message}; recovery by name also failed: ${recoveryMessage}`,
        { cause: error }
      )
    }
  }
}

export function buildE2EApplicationName({
  runId,
  runAttempt
}: {
  runId: string
  runAttempt: string
}): string {
  return `actions-clever-cloud-e2e-${runId}-${runAttempt}`
}

export function createCleverController({
  cleverCLI,
  runCommand,
  sleep = defaultSleep,
  settleTimeoutMs = DEFAULT_SETTLE_TIMEOUT_MS,
  pollIntervalMs = DEFAULT_POLL_INTERVAL_MS
}: CleverControllerOptions): CleverController {
  async function listActivity(
    appId: string,
    timeoutMs = COMMAND_TIMEOUT_MS
  ): Promise<DeploymentActivity[]> {
    const result = await runCommand(
      cleverCLI,
      ['activity', '--app', appId, '--format', 'json'],
      { timeoutMs }
    )

    return JSON.parse(result.stdout) as DeploymentActivity[]
  }

  async function readActiveDeployments(
    appId: string,
    timeoutMs = COMMAND_TIMEOUT_MS
  ): Promise<DeploymentActivity[]> {
    return (await listActivity(appId, timeoutMs)).filter(
      deployment =>
        deployment.action === 'DEPLOY' &&
        IN_PROGRESS_STATES.has(deployment.state ?? '')
    )
  }

  async function waitForDeploymentState({
    appId,
    deploymentId,
    expectedState,
    timeoutMs = settleTimeoutMs
  }: {
    appId: string
    deploymentId: string
    expectedState: string
    timeoutMs?: number
  }): Promise<DeploymentActivity> {
    const deadline = Date.now() + timeoutMs
    let lastObservedState = '(missing)'

    for (;;) {
      const deployment = (
        await listActivity(
          appId,
          Math.min(COMMAND_TIMEOUT_MS, Math.max(1, remainingBeforeDeadline(deadline)))
        )
      ).find(activity => activity.uuid === deploymentId)

      if (deployment?.state) {
        lastObservedState = deployment.state
      }

      if (Date.now() >= deadline) {
        throw new Error(
          `Timed out while waiting for deployment ${deploymentId} on ${appId} to reach ${expectedState}. Last state: ${lastObservedState}`
        )
      }

      if (deployment?.state === expectedState) {
        return deployment
      }

      await sleepUntilNextPoll({
        sleep,
        pollIntervalMs,
        deadlineAt: deadline
      })
    }
  }

  async function waitForLatestCancellableDeployment({
    appId,
    deploymentId,
    timeoutMs = settleTimeoutMs,
    returnSettled = false
  }: {
    appId: string
    deploymentId: string
    timeoutMs?: number
    returnSettled?: boolean
  }): Promise<(DeploymentActivity & { uuid: string }) | null> {
    const deadline = Date.now() + timeoutMs
    let lastObservedState = '(missing)'

    for (;;) {
      const activity = await listActivity(
        appId,
        Math.min(COMMAND_TIMEOUT_MS, Math.max(1, remainingBeforeDeadline(deadline)))
      )
      const activeDeployments = activity.filter(
        deployment =>
          deployment.action === 'DEPLOY' &&
          IN_PROGRESS_STATES.has(deployment.state ?? '')
      )
      const latestActiveDeployment = activeDeployments[0]
      const matchingDeployment = activity.find(
        deployment => deployment.uuid === deploymentId
      )

      if (matchingDeployment?.state) {
        lastObservedState = matchingDeployment.state
      }

      if (
        matchingDeployment?.uuid === deploymentId &&
        matchingDeployment.state &&
        !IN_PROGRESS_STATES.has(matchingDeployment.state)
      ) {
        if (returnSettled) {
          return null
        }

        throw new Error(
          `Deployment ${deploymentId} on ${appId} reached ${matchingDeployment.state} before it could be cancelled`
        )
      }

      if (Date.now() >= deadline) {
        throw new Error(
          `Timed out while waiting for deployment ${deploymentId} on ${appId} to become the latest WIP deployment. Last state: ${lastObservedState}`
        )
      }

      if (
        latestActiveDeployment?.uuid === deploymentId &&
        CANCELLABLE_STATES.has(latestActiveDeployment.state ?? '')
      ) {
        return latestActiveDeployment as DeploymentActivity & { uuid: string }
      }

      await sleepUntilNextPoll({
        sleep,
        pollIntervalMs,
        deadlineAt: deadline
      })
    }
  }

  async function listApplications(): Promise<ListedOrganisation[]> {
    const result = await runCommand(
      cleverCLI,
      ['applications', 'list', '--format', 'json'],
      { timeoutMs: COMMAND_TIMEOUT_MS }
    )

    return JSON.parse(result.stdout) as ListedOrganisation[]
  }

  async function verifyApplicationDeletion(appId: string): Promise<void> {
    const organisations = await listApplications()
    const isStillPresent = organisations.some(organisation =>
      organisation.applications?.some(application => application.app_id === appId)
    )

    if (isStillPresent) {
      throw new Error(`Application ${appId} still exists after deletion`)
    }
  }

  async function cancelDeployment({
    appId,
    deploymentId,
    timeoutMs = settleTimeoutMs
  }: {
    appId: string
    deploymentId: string
    timeoutMs?: number
  }): Promise<DeploymentActivity> {
    const deadline = Date.now() + timeoutMs

    const cancellableDeployment = await waitForLatestCancellableDeployment({
      appId,
      deploymentId,
      timeoutMs: remainingBeforeDeadline(deadline)
    })

    if (!cancellableDeployment) {
      throw new Error(
        `Deployment ${deploymentId} on ${appId} settled before it could be cancelled`
      )
    }

    await runCommand(cleverCLI, ['cancel-deploy', '--app', appId], {
      timeoutMs: Math.min(COMMAND_TIMEOUT_MS, Math.max(1, remainingBeforeDeadline(deadline)))
    })

    return waitForDeploymentState({
      appId,
      deploymentId,
      expectedState: 'CANCELLED',
      timeoutMs: remainingBeforeDeadline(deadline)
    })
  }

  return {
    listActivity,
    cancelDeployment,

    async createApplication({
      name,
      region
    }: CreateApplicationOptions): Promise<CreatedApplication> {
      let result: CommandResult

      try {
        result = await runCommand(
          cleverCLI,
          ['create', '--type', 'node', '--region', region, '--format', 'json', name],
          { timeoutMs: COMMAND_TIMEOUT_MS }
        )
      } catch (error) {
        if (isRecoverableCreateCommandFailure(error)) {
          throw new RecoverableCreateApplicationError(
            error instanceof Error ? error.message : String(error)
          )
        }

        throw error
      }

      let created: {
        id?: string
        name?: string
      }

      try {
        created = JSON.parse(result.stdout) as {
          id?: string
          name?: string
        }
      } catch {
        throw new RecoverableCreateApplicationError(
          'Clever create did not return valid JSON'
        )
      }

      if (!created.id || !APP_ID_REGEX.test(created.id)) {
        throw new RecoverableCreateApplicationError(
          'Clever create did not return a valid app ID'
        )
      }

      if (created.name !== name) {
        throw new RecoverableCreateApplicationError(
          `Clever create returned an unexpected app name: ${created.name}`
        )
      }

      return {
        appId: created.id,
        name
      }
    },

    async findApplicationByName(name: string): Promise<CreatedApplication> {
      const deadline = Date.now() + settleTimeoutMs

      for (;;) {
        const matches = (await listApplications())
          .flatMap(organisation => organisation.applications ?? [])
          .filter(application => application.name === name)

        if (matches.length === 1) {
          const match = matches[0]
          const appId = match?.app_id

          if (!appId || !APP_ID_REGEX.test(appId)) {
            throw new Error(`Clever applications did not return a valid app ID for ${name}`)
          }

          return { appId, name }
        }

        if (matches.length > 1) {
          throw new Error(`Expected exactly one app named ${name}, found ${matches.length}`)
        }

        if (Date.now() >= deadline) {
          throw new Error(`Timed out while waiting for application ${name}`)
        }

        await sleep(Math.min(pollIntervalMs, Math.max(0, deadline - Date.now())))
      }
    },

    async getEnvironmentValue(appId: string, name: string): Promise<string | null> {
      const result = await runCommand(
        cleverCLI,
        ['env', '--app', appId, '--format', 'json'],
        { timeoutMs: COMMAND_TIMEOUT_MS }
      )

      const environment = JSON.parse(result.stdout) as ListedEnvironment
      const match = environment.env?.find(variable => variable.name === name)

      return typeof match?.value === 'string' ? match.value : null
    },

    async getPublicOrigin(appId: string): Promise<string> {
      const result = await runCommand(
        cleverCLI,
        ['domain', '--app', appId, '--format', 'json'],
        { timeoutMs: COMMAND_TIMEOUT_MS }
      )
      const domains = JSON.parse(result.stdout) as Array<{
        domainWithPathPrefix?: string
      }>
      const domain = domains[0]?.domainWithPathPrefix
      if (!domain) {
        throw new Error(`Application ${appId} has no public domain`)
      }
      return `https://${domain.endsWith('/') ? domain : `${domain}/`}`
    },

    async deleteApplication({
      appId,
      name
    }: DeleteApplicationOptions): Promise<void> {
      try {
        const deadline = Date.now() + settleTimeoutMs

        for (;;) {
          const activeDeployments = await readActiveDeployments(
            appId,
            Math.min(COMMAND_TIMEOUT_MS, Math.max(1, remainingBeforeDeadline(deadline)))
          )

          if (activeDeployments.length === 0) {
            break
          }

          const latestActiveDeployment = activeDeployments[0]

          if (!latestActiveDeployment?.uuid) {
            throw new Error(`Missing active deployment ID for ${appId}`)
          }

          const cancellableDeployment = await waitForLatestCancellableDeployment({
            appId,
            deploymentId: latestActiveDeployment.uuid,
            timeoutMs: remainingBeforeDeadline(deadline),
            returnSettled: true
          })

          if (!cancellableDeployment) {
            continue
          }

          await runCommand(cleverCLI, ['cancel-deploy', '--app', appId], {
            timeoutMs: Math.min(
              COMMAND_TIMEOUT_MS,
              Math.max(1, remainingBeforeDeadline(deadline))
            )
          })

          await waitForDeploymentState({
            appId,
            deploymentId: cancellableDeployment.uuid,
            expectedState: 'CANCELLED',
            timeoutMs: remainingBeforeDeadline(deadline)
          })
        }

        await runCommand(cleverCLI, ['delete', '--app', appId, '--yes'], {
          timeoutMs: COMMAND_TIMEOUT_MS
        })

        await verifyApplicationDeletion(appId)
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error)
        throw new Error(`Failed to delete ${name} (${appId}): ${message}`)
      }
    }
  }
}

function remainingBeforeDeadline(deadlineAt: number): number {
  return Math.max(0, deadlineAt - Date.now())
}

async function sleepUntilNextPoll({
  sleep,
  pollIntervalMs,
  deadlineAt
}: {
  sleep: Sleep
  pollIntervalMs: number
  deadlineAt: number
}): Promise<void> {
  await sleep(Math.min(pollIntervalMs, remainingBeforeDeadline(deadlineAt)))
}

async function defaultSleep(timeoutMs: number): Promise<void> {
  await new Promise(resolve => setTimeout(resolve, timeoutMs))
}
