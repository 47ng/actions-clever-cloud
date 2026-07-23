import { existsSync } from 'node:fs'
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { execFile, spawn } from 'node:child_process'
import { once } from 'node:events'
import { createServer } from 'node:net'
import { promisify } from 'node:util'
import { afterEach, expect, test } from 'vitest'
import { createFixtureRepository } from './git-fixture'

const execFileAsync = promisify(execFile)
const temporaryDirectories: string[] = []
const children: Array<ReturnType<typeof spawn>> = []

afterEach(async () => {
  await Promise.all(
    children.splice(0).map(async child => {
      if (child.exitCode === null && !child.killed) {
        child.kill('SIGTERM')
      }

      await once(child, 'exit').catch(() => undefined)
    })
  )

  await Promise.all(
    temporaryDirectories.splice(0).map(directory =>
      rm(directory, { recursive: true, force: true })
    )
  )
})

async function createTemporaryWorkspace(): Promise<string> {
  const directory = await mkdtemp(path.join(tmpdir(), 'actions-clever-cloud-'))
  temporaryDirectories.push(directory)
  return directory
}

async function runGit(cwd: string, args: string[]): Promise<string> {
  const { stdout } = await execFileAsync('git', args, {
    cwd,
    encoding: 'utf8'
  })
  return stdout.trim()
}

async function getFreePort(): Promise<number> {
  const server = createServer()
  server.listen(0, '127.0.0.1')
  await once(server, 'listening')
  const address = server.address()
  if (!address || typeof address === 'string') {
    throw new Error('Failed to reserve a TCP port for the generated fixture test')
  }
  const { port } = address
  server.close()
  await once(server, 'close')
  return port
}

async function waitForHealth(url: string): Promise<Response> {
  for (let attempt = 0; attempt < 50; attempt += 1) {
    try {
      return await fetch(url)
    } catch {
      await new Promise(resolve => setTimeout(resolve, 20))
    }
  }

  throw new Error(`Timed out while waiting for ${url}`)
}

async function waitForOutput(
  readOutput: () => string,
  expectedText: string
): Promise<void> {
  for (let attempt = 0; attempt < 50; attempt += 1) {
    if (readOutput().includes(expectedText)) {
      return
    }

    await new Promise(resolve => setTimeout(resolve, 20))
  }

  throw new Error(`Timed out while waiting for output: ${expectedText}`)
}

test('creates a fresh non-shallow fixture repository and keeps support files ignored', async () => {
  const workspaceDir = await createTemporaryWorkspace()
  await mkdir(path.join(workspaceDir, '.candidate-source'), { recursive: true })
  await mkdir(path.join(workspaceDir, '.candidate-action'), { recursive: true })
  await mkdir(path.join(workspaceDir, '.e2e-state'), { recursive: true })
  await writeFile(path.join(workspaceDir, '.candidate-source', 'action.yml'), 'name: candidate\n')
  await writeFile(path.join(workspaceDir, '.candidate-action', 'action.yml'), 'name: pinned\n')
  await writeFile(path.join(workspaceDir, '.e2e-state', 'app.json'), '{}\n')
  await writeFile(path.join(workspaceDir, '.clever.json'), '{"link":"provisioned"}\n')
  await writeFile(path.join(workspaceDir, 'unexpected.txt'), 'remove me\n')

  await createFixtureRepository({ workspaceDir })

  await expect(runGit(workspaceDir, ['rev-parse', '--is-shallow-repository'])).resolves.toBe(
    'false'
  )
  await expect(runGit(workspaceDir, ['branch', '--show-current'])).resolves.toBe('master')
  await expect(runGit(workspaceDir, ['ls-files'])).resolves.toBe(
    ['.gitignore', 'package.json', 'server.mjs'].join('\n')
  )
  await expect(runGit(workspaceDir, ['status', '--short', '--ignored'])).resolves.toContain(
    '!! .candidate-source/'
  )
  await expect(runGit(workspaceDir, ['status', '--short', '--ignored'])).resolves.toContain(
    '!! .candidate-action/'
  )
  await expect(runGit(workspaceDir, ['status', '--short', '--ignored'])).resolves.toContain(
    '!! .e2e-state/'
  )
  expect(existsSync(path.join(workspaceDir, '.clever.json'))).toBe(false)
  expect(existsSync(path.join(workspaceDir, 'unexpected.txt'))).toBe(false)
})

test('runs the generated fixture server with the expected health contract and markers', async () => {
  const workspaceDir = await createTemporaryWorkspace()
  await mkdir(path.join(workspaceDir, '.candidate-source'), { recursive: true })
  await mkdir(path.join(workspaceDir, '.candidate-action'), { recursive: true })
  await createFixtureRepository({ workspaceDir })

  const port = await getFreePort()
  let stdout = ''

  const child = spawn(process.execPath, ['server.mjs'], {
    cwd: workspaceDir,
    env: {
      ...process.env,
      PORT: String(port),
      E2E_SCENARIO: 'healthy',
      INSTANCE_ID: 'instance-123',
      INSTANCE_TYPE: 'production',
      CC_DEPLOYMENT_ID: 'deployment-123',
      CC_COMMIT_ID: 'commit-123',
      SECRET_SHOULD_NOT_LEAK: 'top-secret'
    },
    stdio: ['ignore', 'pipe', 'pipe']
  })
  children.push(child)
  child.stdout.setEncoding('utf8')
  child.stdout.on('data', chunk => {
    stdout += chunk
  })

  const response = await waitForHealth(`http://127.0.0.1:${port}/health`)
  await waitForOutput(() => stdout, 'fixture-start')
  await waitForOutput(() => stdout, 'fixture-ready')

  expect(response.status).toBe(200)
  await expect(response.json()).resolves.toEqual({
    scenario: 'healthy',
    INSTANCE_ID: 'instance-123',
    INSTANCE_TYPE: 'production',
    CC_DEPLOYMENT_ID: 'deployment-123',
    CC_COMMIT_ID: 'commit-123'
  })
  expect(stdout).toContain('fixture-start')
  expect(stdout).toContain('fixture-ready')
  expect(stdout).not.toContain('top-secret')
})
