import type { Clever } from './clever'
import type { Config } from './config'
import type { Host } from './github'

export type DeploymentDeps = {
  clever: Clever
  git: { checkForShallowCopy(): Promise<void> }
  host: Host
}

export async function deploy(
  config: Config,
  deps: DeploymentDeps
): Promise<void> {
  const { clever, git, host } = deps
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
    host.info('Deployment timed out, moving on with workflow run')
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
