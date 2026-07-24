import { execFile } from 'node:child_process'
import { promisify } from 'node:util'

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

type ExecFileAsync = (
  cli: string,
  args: string[],
  options: {
    encoding: 'utf8'
    env: NodeJS.ProcessEnv
    cwd: string
    timeout: number
    maxBuffer: number
  }
) => Promise<CommandResult>

type ExecFileFailure = Error & {
  stderr?: string
  code?: string | number
  signal?: NodeJS.Signals | null
  killed?: boolean
}

type CreateRunCommandOptions = {
  execFileAsync?: ExecFileAsync
}

export function createRunCommand({
  execFileAsync = promisify(execFile)
}: CreateRunCommandOptions = {}): RunCommand {
  return async (cli, args, { timeoutMs }) => {
    try {
      // The candidate action container writes a root-owned .clever.json into
      // the workspace; running control commands from there makes clever-tools
      // fail with EACCES even after a successful remote operation.
      const { stdout, stderr } = await execFileAsync(cli, args, {
        encoding: 'utf8',
        env: process.env,
        cwd: process.env.RUNNER_TEMP || process.cwd(),
        timeout: timeoutMs,
        maxBuffer: 1024 * 1024 * 10
      })
      return { stdout, stderr }
    } catch (error) {
      const failure = error as ExecFileFailure
      throw Object.assign(
        new Error(failure.stderr?.trim() || failure.message, {
          cause: failure
        }),
        {
          code: failure.code,
          signal: failure.signal,
          killed: failure.killed
        }
      )
    }
  }
}

type HealthResponse = {
  status: number
  json: () => Promise<unknown>
}

type FetchHealth = (url: string) => Promise<HealthResponse>

export function createFetchHealth(
  timeoutMs = 10_000,
  fetchImpl: typeof fetch = fetch
): FetchHealth {
  return async url => {
    const requestController = new AbortController()
    const timeoutId = setTimeout(() => requestController.abort(), timeoutMs)

    try {
      const response = await fetchImpl(url, {
        signal: requestController.signal
      })
      return {
        status: response.status,
        json: async () => response.json()
      }
    } finally {
      clearTimeout(timeoutId)
    }
  }
}

export function resolveCleverCLI(
  workspaceDir: string | undefined = process.env.GITHUB_WORKSPACE
): string {
  if (!workspaceDir) {
    throw new Error('Missing workspace directory for clever CLI resolution')
  }
  return `${workspaceDir}/.candidate-source/node_modules/.bin/clever`
}
