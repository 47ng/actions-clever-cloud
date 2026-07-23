import fs from 'node:fs/promises'
import { cleverClient } from './clever'
import { parseConfig } from './config'
import { deploy } from './deployment'
import { checkForShallowCopy, fixGitDubiousOwnership } from './git'
import { gitHubHost, type Host } from './github'
import { createDeployLog, type DeployLog } from './output'

export async function main(): Promise<void> {
  const host = gitHubHost()
  let log: DeployLog | undefined
  try {
    await fixGitDubiousOwnership()
    const config = parseConfig()
    log = await createDeployLog(
      { quiet: config.quiet, logFile: config.logFile },
      host
    )
    const cwd = await resolveDeployPath(config.deployPath, host)
    host.debug(`Clever CLI path: ${config.cleverCLI}`)
    const clever = cleverClient({
      cliPath: config.cleverCLI,
      cwd,
      output: log.stream,
      host
    })
    await deploy(config, { clever, git: { checkForShallowCopy }, host })
  } catch (error) {
    if (error instanceof Error && error.stack) {
      host.debug(error.stack)
    }
    host.fail(error instanceof Error ? error.message : String(error))
  } finally {
    // Close the log stream so buffered output and the log file get flushed,
    // whether the deploy succeeded, timed out, or threw.
    if (log) {
      log.stream.end()
      await log.done()
    }
  }
}

async function resolveDeployPath(
  deployPath: string | undefined,
  host: Host
): Promise<string | undefined> {
  if (!deployPath) {
    return undefined
  }
  try {
    await fs.access(deployPath)
  } catch {
    throw new Error(`Deploy path does not exist: ${deployPath}`)
  }
  host.info(`Running Clever CLI from directory: ${deployPath}`)
  return deployPath
}

if (import.meta.main) {
  main()
}
