import type { Clever } from './clever.ts'
import type { Config } from './config.ts'
import type { Host } from './github.ts'

export const DEPLOYMENT_TIMEOUT_MESSAGE =
  'Deployment timed out, moving on with workflow run'

export type DeploymentDeps = {
  clever: Clever
  git: { checkForShallowCopy(): Promise<void> }
  host: Host
  deployLog?: { write(chunk: string): void }
}

export async function deploy(
  config: Config,
  deps: DeploymentDeps
): Promise<void> {
  const { clever, git, host, deployLog } = deps
  await git.checkForShallowCopy()
  const alias = config.appID
    ? await resolveAlias(config.appID, clever, host)
    : config.alias
  // Set extra environment variables before deployment
  // so the new instance can use them.
  for (const [name, value] of Object.entries(config.extraEnv)) {
    await clever.setEnv(name, value, alias)
  }
  const outcome = await clever.deploy({
    alias,
    force: config.force,
    sameCommitPolicy: config.sameCommitPolicy,
    timeoutSeconds: config.timeout
  })
  if (outcome === 'timed-out') {
    // When quiet suppresses the console pipeline, the log file is the only
    // place the timeout can be observed; the live e2e suite asserts it there.
    if (config.quiet && config.logFile) {
      deployLog?.write(`${DEPLOYMENT_TIMEOUT_MESSAGE}\n`)
    }
    host.info(DEPLOYMENT_TIMEOUT_MESSAGE)
  }
}

// Deploying by appID needs an alias (a .clever.json file can otherwise
// make deploy ambiguous). Reuse an existing link when possible; clever
// link rejects duplicate app IDs, including under a different alias.
async function resolveAlias(
  appID: string,
  clever: Clever,
  host: Host
): Promise<string> {
  const linkedAlias = await clever.linkedAppAlias(appID)
  if (linkedAlias) {
    host.debug(`Application ${appID} is already linked as ${linkedAlias}`)
    return linkedAlias
  }
  host.debug(`Linking ${appID}`)
  await clever.link(appID)
  return appID
}
