import { existsSync } from 'node:fs'
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { execFile, spawn } from 'node:child_process'
import { once } from 'node:events'
import { createServer } from 'node:net'
import { promisify } from 'node:util'
import { afterEach, expect, test } from 'vitest'
import {
  FIXTURE_BUILD_FAILURE_MARKER,
  FIXTURE_STARTUP_FAILURE_MARKER
} from './fixture-app'
import {
  createDivergentFixtureCommit,
  createFixtureRepository,
  createHealthyFixtureCommit
} from './git-fixture'

const execFileAsync = promisify(execFile)
const temporaryDirectories: string[] = []
const children: Array<ReturnType<typeof spawn>> = []

afterEach(async () => {
  await Promise.all(
    children.splice(0).map(async child => {
      if (child.exitCode !== null) {
        return
      }

      if (!child.killed) {
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
    [
      '.gitignore',
      'fixture-version.txt',
      'package.json',
      'scripts/post-build-hook.mjs',
      'scripts/postinstall-marker.mjs',
      'server.mjs'
    ].join('\n')
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

test('creates a controlled second healthy commit for later deployments', async () => {
  const workspaceDir = await createTemporaryWorkspace()
  await mkdir(path.join(workspaceDir, '.candidate-source'), { recursive: true })
  await mkdir(path.join(workspaceDir, '.candidate-action'), { recursive: true })
  await createFixtureRepository({ workspaceDir })
  const firstCommit = await runGit(workspaceDir, ['rev-parse', 'HEAD'])

  const secondCommit = await createHealthyFixtureCommit({
    workspaceDir,
    label: 'healthy-2'
  })

  expect(secondCommit).not.toBe(firstCommit)
  await expect(runGit(workspaceDir, ['rev-list', '--count', 'HEAD'])).resolves.toBe('2')
  await expect(runGit(workspaceDir, ['show', 'HEAD:fixture-version.txt'])).resolves.toBe(
    'healthy-2'
  )
})

test('resets to a known ancestor and creates a real divergent commit instead of a simple ahead-or-behind history', async () => {
  const workspaceDir = await createTemporaryWorkspace()
  const remoteDir = await createTemporaryWorkspace()

  await mkdir(path.join(workspaceDir, '.candidate-source'), { recursive: true })
  await mkdir(path.join(workspaceDir, '.candidate-action'), { recursive: true })
  await createFixtureRepository({ workspaceDir })
  const initialCommit = await runGit(workspaceDir, ['rev-parse', 'HEAD'])
  const healthyTwoCommit = await createHealthyFixtureCommit({
    workspaceDir,
    label: 'healthy-2'
  })
  await createHealthyFixtureCommit({
    workspaceDir,
    label: 'healthy-3'
  })
  const remoteHeadBeforeDivergence = await runGit(workspaceDir, ['rev-parse', 'HEAD'])

  await runGit(remoteDir, ['init', '--bare'])
  await runGit(workspaceDir, ['remote', 'add', 'origin', remoteDir])
  await runGit(workspaceDir, ['push', '--set-upstream', 'origin', 'master'])

  const divergentCommit = await createDivergentFixtureCommit({
    workspaceDir,
    ancestorCommit: healthyTwoCommit,
    label: 'forced-healthy'
  })

  expect(divergentCommit).not.toBe(remoteHeadBeforeDivergence)
  await expect(runGit(workspaceDir, ['merge-base', 'HEAD', 'origin/master'])).resolves.toBe(
    healthyTwoCommit
  )
  await expect(runGit(workspaceDir, ['merge-base', '--is-ancestor', 'HEAD', 'origin/master'])).rejects.toThrow()
  await expect(runGit(workspaceDir, ['merge-base', '--is-ancestor', 'origin/master', 'HEAD'])).rejects.toThrow()
  await expect(runGit(workspaceDir, ['show', 'HEAD:fixture-version.txt'])).resolves.toBe(
    'forced-healthy'
  )
  await expect(runGit(workspaceDir, ['show', `${initialCommit}:fixture-version.txt`])).resolves.toBe(
    'healthy-1'
  )
})

test('creates the slow-build child commit on top of the forced healthy commit', async () => {
  const workspaceDir = await createTemporaryWorkspace()
  const remoteDir = await createTemporaryWorkspace()

  await mkdir(path.join(workspaceDir, '.candidate-source'), { recursive: true })
  await mkdir(path.join(workspaceDir, '.candidate-action'), { recursive: true })
  await createFixtureRepository({ workspaceDir })
  const healthyTwoCommit = await createHealthyFixtureCommit({
    workspaceDir,
    label: 'healthy-2'
  })
  await createHealthyFixtureCommit({
    workspaceDir,
    label: 'healthy-3'
  })

  await runGit(remoteDir, ['init', '--bare'])
  await runGit(workspaceDir, ['remote', 'add', 'origin', remoteDir])
  await runGit(workspaceDir, ['push', '--set-upstream', 'origin', 'master'])

  const forcedHealthyCommit = await createDivergentFixtureCommit({
    workspaceDir,
    ancestorCommit: healthyTwoCommit,
    label: 'healthy-force'
  })
  const slowBuildChildCommit = await createHealthyFixtureCommit({
    workspaceDir,
    label: 'slow-build-child'
  })

  expect(slowBuildChildCommit).not.toBe(forcedHealthyCommit)
  await expect(runGit(workspaceDir, ['rev-parse', `${slowBuildChildCommit}^`])).resolves.toBe(
    forcedHealthyCommit
  )
  await expect(runGit(workspaceDir, ['show', 'HEAD:fixture-version.txt'])).resolves.toBe(
    'slow-build-child'
  )
})

test('the generated post-build hook fails deterministically for the build-failure scenario', async () => {
  const workspaceDir = await createTemporaryWorkspace()
  await mkdir(path.join(workspaceDir, '.candidate-source'), { recursive: true })
  await mkdir(path.join(workspaceDir, '.candidate-action'), { recursive: true })
  await createFixtureRepository({ workspaceDir })

  let stdout = ''
  let stderr = ''
  const child = spawn(process.execPath, ['scripts/post-build-hook.mjs'], {
    cwd: workspaceDir,
    env: {
      ...process.env,
      E2E_SCENARIO: 'build-failure'
    },
    stdio: ['ignore', 'pipe', 'pipe']
  })
  children.push(child)
  child.stdout.setEncoding('utf8')
  child.stderr.setEncoding('utf8')
  child.stdout.on('data', chunk => {
    stdout += chunk
  })
  child.stderr.on('data', chunk => {
    stderr += chunk
  })

  const [exitCode] = await once(child, 'exit')
  children.splice(children.indexOf(child), 1)

  expect(exitCode).toBe(1)
  expect(stdout).toContain(FIXTURE_BUILD_FAILURE_MARKER)
  expect(stderr).toBe('')
})

test('the generated post-build hook can delay a slow-build child commit by a bounded amount', async () => {
  const workspaceDir = await createTemporaryWorkspace()
  await mkdir(path.join(workspaceDir, '.candidate-source'), { recursive: true })
  await mkdir(path.join(workspaceDir, '.candidate-action'), { recursive: true })
  await createFixtureRepository({ workspaceDir })

  const startedAt = Date.now()
  const child = spawn(process.execPath, ['scripts/post-build-hook.mjs'], {
    cwd: workspaceDir,
    env: {
      ...process.env,
      E2E_SCENARIO: 'slow-build',
      E2E_BUILD_DELAY_MS: '60'
    },
    stdio: ['ignore', 'pipe', 'pipe']
  })
  children.push(child)

  const [exitCode] = await once(child, 'exit')
  children.splice(children.indexOf(child), 1)

  expect(exitCode).toBe(0)
  expect(Date.now() - startedAt).toBeGreaterThanOrEqual(50)
})

test('the generated fixture server fails from the application process for the startup-failure scenario', async () => {
  const workspaceDir = await createTemporaryWorkspace()
  await mkdir(path.join(workspaceDir, '.candidate-source'), { recursive: true })
  await mkdir(path.join(workspaceDir, '.candidate-action'), { recursive: true })
  await createFixtureRepository({ workspaceDir })

  const port = await getFreePort()
  let stdout = ''
  let stderr = ''

  const child = spawn(process.execPath, ['server.mjs'], {
    cwd: workspaceDir,
    env: {
      ...process.env,
      PORT: String(port),
      E2E_SCENARIO: 'startup-failure'
    },
    stdio: ['ignore', 'pipe', 'pipe']
  })
  children.push(child)
  child.stdout.setEncoding('utf8')
  child.stderr.setEncoding('utf8')
  child.stdout.on('data', chunk => {
    stdout += chunk
  })
  child.stderr.on('data', chunk => {
    stderr += chunk
  })

  const [exitCode] = await once(child, 'exit')
  children.splice(children.indexOf(child), 1)

  expect(exitCode).toBe(1)
  expect(stdout).not.toContain('fixture-ready')
  expect(`${stdout}${stderr}`).toContain(FIXTURE_STARTUP_FAILURE_MARKER)
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
      E2E_HEALTH_VALUE: 'ABEiM0RVZneImaq7zN3u/w==',
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
    healthValue: 'ABEiM0RVZneImaq7zN3u/w==',
    INSTANCE_ID: 'instance-123',
    INSTANCE_TYPE: 'production',
    CC_DEPLOYMENT_ID: 'deployment-123',
    CC_COMMIT_ID: 'commit-123'
  })
  expect(stdout).toContain('fixture-start')
  expect(stdout).toContain('fixture-ready')
  expect(stdout).not.toContain('top-secret')
  expect(stdout).not.toContain('ABEiM0RVZneImaq7zN3u/w==')
})
