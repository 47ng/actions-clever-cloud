import { createServer } from 'node:net'
import { spawn } from 'node:child_process'
import { once } from 'node:events'
import { afterEach, expect, test } from 'vitest'

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
})

async function getFreePort(): Promise<number> {
  const server = createServer()
  server.listen(0, '127.0.0.1')
  await once(server, 'listening')
  const address = server.address()
  if (!address || typeof address === 'string') {
    throw new Error('Failed to reserve a TCP port for the fixture test')
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

test('the fixture process listens on PORT and serves the allow-listed health response', async () => {
  const port = await getFreePort()
  const child = spawn(process.execPath, ['src/e2e/fixture-app.ts'], {
    cwd: process.cwd(),
    env: {
      ...process.env,
      PORT: String(port),
      E2E_SCENARIO: 'healthy',
      INSTANCE_ID: 'instance-123',
      INSTANCE_TYPE: 'production',
      CC_DEPLOYMENT_ID: 'deployment-123',
      CC_COMMIT_ID: 'commit-123',
      CLEVER_TOKEN: 'secret-token'
    },
    stdio: ['ignore', 'pipe', 'pipe']
  })
  children.push(child)

  const response = await waitForHealth(`http://127.0.0.1:${port}/health`)

  expect(response.status).toBe(200)
  await expect(response.json()).resolves.toEqual({
    scenario: 'healthy',
    INSTANCE_ID: 'instance-123',
    INSTANCE_TYPE: 'production',
    CC_DEPLOYMENT_ID: 'deployment-123',
    CC_COMMIT_ID: 'commit-123'
  })
})

test('the fixture process prints stable markers without leaking unrelated environment values', async () => {
  const port = await getFreePort()
  let stdout = ''

  const child = spawn(process.execPath, ['src/e2e/fixture-app.ts'], {
    cwd: process.cwd(),
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

  await waitForOutput(() => stdout, 'fixture-start')
  await waitForOutput(() => stdout, 'fixture-ready')

  expect(stdout).toContain('fixture-start')
  expect(stdout).toContain('fixture-ready')
  expect(stdout).not.toContain('top-secret')
})
