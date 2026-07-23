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
  async function listActivity(appId: string): Promise<DeploymentActivity[]> {
    const result = await runCommand(
      cleverCLI,
      ['activity', '--app', appId, '--format', 'json'],
      { timeoutMs: COMMAND_TIMEOUT_MS }
    )

    return JSON.parse(result.stdout) as DeploymentActivity[]
  }

  async function waitForCancelledDeployment(appId: string): Promise<void> {
    let elapsedMs = 0

    for (;;) {
      const activity = await listActivity(appId)
      const activeDeployment = activity.find(
        deployment =>
          deployment.action === 'DEPLOY' && deployment.state === 'WIP'
      )

      if (!activeDeployment) {
        return
      }

      if (elapsedMs >= settleTimeoutMs) {
        throw new Error(
          `Timed out while waiting for deployment cancellation for ${appId}`
        )
      }

      await sleep(pollIntervalMs)
      elapsedMs += pollIntervalMs
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
      let elapsedMs = 0

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

        if (elapsedMs >= settleTimeoutMs) {
          throw new Error(`Timed out while waiting for application ${name}`)
        }

        await sleep(pollIntervalMs)
        elapsedMs += pollIntervalMs
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
        const activity = await listActivity(appId)
        const hasActiveDeployment = activity.some(
          deployment =>
            deployment.action === 'DEPLOY' && deployment.state === 'WIP'
        )

        if (hasActiveDeployment) {
          await runCommand(cleverCLI, ['cancel-deploy', '--app', appId], {
            timeoutMs: COMMAND_TIMEOUT_MS
          })
          await waitForCancelledDeployment(appId)
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

async function defaultSleep(timeoutMs: number): Promise<void> {
  await new Promise(resolve => setTimeout(resolve, timeoutMs))
}
