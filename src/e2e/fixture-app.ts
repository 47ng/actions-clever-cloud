import { createServer } from 'node:http'

export const FIXTURE_READY_MARKER = 'fixture-ready'
export const FIXTURE_START_MARKER = 'fixture-start'

export type FixtureHealth = {
  scenario: string
  INSTANCE_ID: string | null
  INSTANCE_TYPE: string | null
  CC_DEPLOYMENT_ID: string | null
  CC_COMMIT_ID: string | null
}

export function readFixtureHealth(
  env: NodeJS.ProcessEnv = process.env
): FixtureHealth {
  return {
    scenario: env.E2E_SCENARIO ?? 'healthy',
    INSTANCE_ID: env.INSTANCE_ID ?? null,
    INSTANCE_TYPE: env.INSTANCE_TYPE ?? null,
    CC_DEPLOYMENT_ID: env.CC_DEPLOYMENT_ID ?? null,
    CC_COMMIT_ID: env.CC_COMMIT_ID ?? null
  }
}

export async function startFixtureApp(
  env: NodeJS.ProcessEnv = process.env
): Promise<void> {
  const portValue = env.PORT
  const port = Number(portValue)

  if (!portValue || !Number.isInteger(port) || port < 0) {
    throw new Error(`Invalid PORT value: ${portValue ?? '(missing)'}`)
  }

  const health = readFixtureHealth(env)
  const server = createServer((request, response) => {
    if (request.url !== '/health') {
      response.writeHead(404)
      response.end('Not found')
      return
    }

    response.writeHead(200, { 'content-type': 'application/json' })
    response.end(JSON.stringify(health))
  })

  await new Promise<void>((resolve, reject) => {
    server.once('error', reject)
    server.listen(port, '0.0.0.0', () => {
      console.log(FIXTURE_START_MARKER, JSON.stringify(health))
      console.log(FIXTURE_READY_MARKER, port)
      resolve()
    })
  })
}

if (import.meta.main) {
  startFixtureApp().catch(error => {
    console.error(error instanceof Error ? error.message : String(error))
    process.exitCode = 1
  })
}
