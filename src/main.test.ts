import { PassThrough } from 'node:stream'
import { beforeEach, expect, test, vi } from 'vitest'

vi.mock('./clever', () => ({ cleverClient: vi.fn() }))
vi.mock('./config', () => ({ parseConfig: vi.fn() }))
vi.mock('./deployment', () => ({ deploy: vi.fn() }))
vi.mock('./git', () => ({
  checkForShallowCopy: vi.fn(),
  fixGitDubiousOwnership: vi.fn()
}))
vi.mock('./github', () => ({ gitHubHost: vi.fn() }))
vi.mock('./output', () => ({ createDeployLog: vi.fn() }))

import { cleverClient, type Clever } from './clever.ts'
import { parseConfig, type Config } from './config.ts'
import { deploy } from './deployment.ts'
import { fixGitDubiousOwnership } from './git.ts'
import { gitHubHost, type Host } from './github.ts'
import { main } from './main.ts'
import { createDeployLog, type DeployLog } from './output.ts'

const host: Host = {
  info: vi.fn(),
  debug: vi.fn(),
  warning: vi.fn(),
  maskSecret: vi.fn(),
  fail: vi.fn()
}

const config: Config = {
  cleverCLI: 'clever-mocked',
  force: false,
  quiet: false,
  extraEnv: {}
}

function makeLog(): DeployLog & { stream: PassThrough } {
  return {
    stream: new PassThrough(),
    done: vi.fn(() => Promise.resolve())
  }
}

let log: ReturnType<typeof makeLog>

beforeEach(() => {
  vi.clearAllMocks()
  log = makeLog()
  vi.mocked(gitHubHost).mockReturnValue(host)
  vi.mocked(fixGitDubiousOwnership).mockResolvedValue()
  vi.mocked(parseConfig).mockReturnValue(config)
  vi.mocked(createDeployLog).mockResolvedValue(log)
  vi.mocked(cleverClient).mockReturnValue({} as Clever)
  vi.mocked(deploy).mockResolvedValue()
})

test('a successful deployment does not fail the workflow', async () => {
  await main()
  expect(host.fail).not.toHaveBeenCalled()
  expect(deploy).toHaveBeenCalledOnce()
})

test('the client is wired with the parsed CLI path, the log stream and the host', async () => {
  const client = { fake: 'client' }
  vi.mocked(cleverClient).mockReturnValue(client as unknown as Clever)
  await main()
  expect(cleverClient).toHaveBeenCalledWith({
    cliPath: config.cleverCLI,
    cwd: undefined,
    output: log.stream,
    host
  })
  expect(deploy).toHaveBeenCalledWith(
    config,
    expect.objectContaining({ clever: client, host })
  )
})

test('fixes git dubious ownership before reading the configuration', async () => {
  await main()
  const gitOrder = vi.mocked(fixGitDubiousOwnership).mock
    .invocationCallOrder[0]!
  const configOrder = vi.mocked(parseConfig).mock.invocationCallOrder[0]!
  expect(gitOrder).toBeLessThan(configOrder)
})

test('a deployment error fails the workflow with its message, exactly once', async () => {
  vi.mocked(deploy).mockRejectedValue(
    new Error('Deployment failed with code 42')
  )
  await main()
  expect(host.fail).toHaveBeenCalledExactlyOnceWith(
    'Deployment failed with code 42'
  )
})

test('a non-Error rejection fails the workflow with its string form', async () => {
  vi.mocked(deploy).mockRejectedValue('boom')
  await main()
  expect(host.fail).toHaveBeenCalledWith('boom')
})

test('a configuration error fails the workflow before any log is opened', async () => {
  vi.mocked(parseConfig).mockImplementation(() => {
    throw new Error(
      'Missing CLEVER_TOKEN environment variable: https://err.sh/47ng/actions-clever-cloud/env'
    )
  })
  await main()
  expect(host.fail).toHaveBeenCalledWith(
    'Missing CLEVER_TOKEN environment variable: https://err.sh/47ng/actions-clever-cloud/env'
  )
  expect(createDeployLog).not.toHaveBeenCalled()
  expect(deploy).not.toHaveBeenCalled()
})

test('the log is ended and drained after a successful deployment', async () => {
  await main()
  expect(log.stream.writableEnded).toBe(true)
  expect(log.done).toHaveBeenCalledOnce()
})

test('the log is ended and drained even when the deployment fails', async () => {
  vi.mocked(deploy).mockRejectedValue(new Error('nope'))
  await main()
  expect(log.stream.writableEnded).toBe(true)
  expect(log.done).toHaveBeenCalledOnce()
})

test('a missing deploy path fails the workflow without deploying', async () => {
  vi.mocked(parseConfig).mockReturnValue({
    ...config,
    deployPath: './does-not-exist'
  })
  await main()
  expect(host.fail).toHaveBeenCalledWith(
    'Deploy path does not exist: ./does-not-exist'
  )
  expect(deploy).not.toHaveBeenCalled()
})

test('an existing deploy path becomes the client working directory', async () => {
  vi.mocked(parseConfig).mockReturnValue({ ...config, deployPath: 'src' })
  await main()
  expect(cleverClient).toHaveBeenCalledWith(
    expect.objectContaining({ cwd: 'src' })
  )
  expect(host.info).toHaveBeenCalledWith(
    'Running Clever CLI from directory: src'
  )
  expect(host.fail).not.toHaveBeenCalled()
})
