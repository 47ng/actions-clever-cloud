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

type RetrievedApplication = CreatedApplication & {
  deployURL: string
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

const APP_ID_REGEX =
  /^app_[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/
const COMMAND_TIMEOUT_MS = 30_000
const DEFAULT_SETTLE_TIMEOUT_MS = 10 * 60_000
const DEFAULT_POLL_INTERVAL_MS = 5_000
const IN_PROGRESS_STATES = new Set(['WIP', 'PENDING', 'QUEUED', 'RUNNING'])

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
}: CleverControllerOptions) {
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

  async function waitForCancelledDeployment(
    appId: string,
    timeoutMs = settleTimeoutMs
  ): Promise<void> {
    const deadline = Date.now() + timeoutMs

    for (;;) {
      const activeDeployment = (
        await readActiveDeployments(
          appId,
          Math.min(COMMAND_TIMEOUT_MS, Math.max(1, remainingBeforeDeadline(deadline)))
        )
      ).at(0)

      if (Date.now() >= deadline) {
        throw new Error(
          `Timed out while waiting for deployment cancellation for ${appId}`
        )
      }

      if (!activeDeployment) {
        return
      }

      await sleepUntilNextPoll({
        sleep,
        pollIntervalMs,
        deadlineAt: deadline
      })
    }
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

  return {
    listActivity,

    async cancelDeployment({
      appId,
      deploymentId,
      timeoutMs = settleTimeoutMs
    }: {
      appId: string
      deploymentId: string
      timeoutMs?: number
    }): Promise<DeploymentActivity> {
      const deadline = Date.now() + timeoutMs
      const activeDeployments = await readActiveDeployments(
        appId,
        Math.min(COMMAND_TIMEOUT_MS, Math.max(1, remainingBeforeDeadline(deadline)))
      )

      if (
        activeDeployments.length !== 1 ||
        activeDeployments[0]?.uuid !== deploymentId
      ) {
        throw new Error(
          `Cannot cancel deployment ${deploymentId} on ${appId} because ${activeDeployments.length} deployments are currently active`
        )
      }

      if (Date.now() >= deadline) {
        throw new Error(
          `Timed out while waiting for deployment ${deploymentId} on ${appId} to reach CANCELLED. Last state: ${activeDeployments[0]?.state ?? '(missing)'}`
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
    },

    async createApplication({
      name,
      region
    }: CreateApplicationOptions): Promise<CreatedApplication> {
      const result = await runCommand(
        cleverCLI,
        ['create', '--type', 'node', '--region', region, '--format', 'json', name],
        { timeoutMs: COMMAND_TIMEOUT_MS }
      )

      const created = JSON.parse(result.stdout) as {
        id?: string
        name?: string
      }

      if (!created.id || !APP_ID_REGEX.test(created.id)) {
        throw new Error('Clever create did not return a valid app ID')
      }

      if (created.name !== name) {
        throw new Error(`Clever create returned an unexpected app name: ${created.name}`)
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
          const appId = matches[0].app_id

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

    async getApplication(appId: string): Promise<RetrievedApplication> {
      const match = (await listApplications())
        .flatMap(organisation => organisation.applications ?? [])
        .find(application => application.app_id === appId)

      if (!match || !match.name || !match.deploy_url) {
        throw new Error(`Application ${appId} is missing its name or deploy URL`)
      }

      return {
        appId,
        name: match.name,
        deployURL: match.deploy_url
      }
    },

    async deleteApplication({
      appId,
      name
    }: DeleteApplicationOptions): Promise<void> {
      try {
        const deadline = Date.now() + settleTimeoutMs
        const activeDeployments = await readActiveDeployments(
          appId,
          Math.min(COMMAND_TIMEOUT_MS, Math.max(1, remainingBeforeDeadline(deadline)))
        )

        if (activeDeployments.length > 0) {
          await runCommand(cleverCLI, ['cancel-deploy', '--app', appId], {
            timeoutMs: Math.min(COMMAND_TIMEOUT_MS, Math.max(1, remainingBeforeDeadline(deadline)))
          })
          await waitForCancelledDeployment(appId, remainingBeforeDeadline(deadline))
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
