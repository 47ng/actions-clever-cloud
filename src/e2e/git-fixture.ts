import { mkdir, readdir, rm, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import {
  FIXTURE_BUILD_MARKER,
  FIXTURE_READY_MARKER,
  FIXTURE_START_MARKER
} from './fixture-app'

const execFileAsync = promisify(execFile)

const FIXTURE_GITIGNORE_LINES = [
  '.candidate-source/',
  '.candidate-action/',
  '.e2e-state/',
  '.e2e-artifacts/',
  '.clever.json'
]

const FIXTURE_PACKAGE_JSON = {
  name: 'actions-clever-cloud-e2e-fixture',
  private: true,
  type: 'module',
  scripts: {
    postinstall: 'node scripts/postinstall-marker.mjs',
    start: 'node server.mjs'
  }
}

const FIXTURE_SERVER_SOURCE = `import { createServer } from 'node:http'

const health = {
  scenario: process.env.E2E_SCENARIO ?? 'healthy',
  healthValue: process.env.E2E_HEALTH_VALUE ?? null,
  INSTANCE_ID: process.env.INSTANCE_ID ?? null,
  INSTANCE_TYPE: process.env.INSTANCE_TYPE ?? null,
  CC_DEPLOYMENT_ID: process.env.CC_DEPLOYMENT_ID ?? null,
  CC_COMMIT_ID: process.env.CC_COMMIT_ID ?? null
}

const loggedHealth = {
  scenario: health.scenario,
  INSTANCE_ID: health.INSTANCE_ID,
  INSTANCE_TYPE: health.INSTANCE_TYPE,
  CC_DEPLOYMENT_ID: health.CC_DEPLOYMENT_ID,
  CC_COMMIT_ID: health.CC_COMMIT_ID
}

const port = Number(process.env.PORT)
if (!Number.isInteger(port) || port < 0) {
  throw new Error('Invalid PORT value: ' + (process.env.PORT ?? '(missing)'))
}

createServer((request, response) => {
  if (request.url !== '/health') {
    response.writeHead(404)
    response.end('Not found')
    return
  }

  response.writeHead(200, { 'content-type': 'application/json' })
  response.end(JSON.stringify(health))
}).listen(port, '0.0.0.0', () => {
  console.log('${FIXTURE_START_MARKER}', JSON.stringify(loggedHealth))
  console.log('${FIXTURE_READY_MARKER}', port)
})
`

const FIXTURE_POSTINSTALL_SOURCE = `console.log('${FIXTURE_BUILD_MARKER}')\n`
const FIXTURE_VERSION_FILE = 'fixture-version.txt'
const INITIAL_FIXTURE_VERSION = 'healthy-1\n'

export async function createFixtureRepository({
  workspaceDir
}: {
  workspaceDir: string
}): Promise<{ commit: string }> {
  const preservedPaths = new Set([
    '.candidate-source',
    '.candidate-action',
    '.e2e-state'
  ])

  for (const entry of await readdir(workspaceDir, { withFileTypes: true })) {
    if (preservedPaths.has(entry.name)) {
      continue
    }

    await rm(path.join(workspaceDir, entry.name), {
      recursive: true,
      force: true
    })
  }

  await writeFile(
    path.join(workspaceDir, '.gitignore'),
    `${FIXTURE_GITIGNORE_LINES.join('\n')}\n`,
    'utf8'
  )
  await writeFile(
    path.join(workspaceDir, 'package.json'),
    `${JSON.stringify(FIXTURE_PACKAGE_JSON, null, 2)}\n`,
    'utf8'
  )
  await writeFile(
    path.join(workspaceDir, FIXTURE_VERSION_FILE),
    INITIAL_FIXTURE_VERSION,
    'utf8'
  )
  await writeFile(path.join(workspaceDir, 'server.mjs'), FIXTURE_SERVER_SOURCE, 'utf8')
  await mkdir(path.join(workspaceDir, 'scripts'), {
    recursive: true
  })
  await writeFile(
    path.join(workspaceDir, 'scripts', 'postinstall-marker.mjs'),
    FIXTURE_POSTINSTALL_SOURCE,
    'utf8'
  )

  await runGit(workspaceDir, ['init', '--initial-branch', 'master'])
  await runGit(workspaceDir, ['config', 'user.name', 'Actions Clever Cloud E2E'])
  await runGit(
    workspaceDir,
    ['config', 'user.email', 'actions-clever-cloud-e2e@example.com']
  )
  await runGit(workspaceDir, [
    'add',
    '.gitignore',
    FIXTURE_VERSION_FILE,
    'package.json',
    'server.mjs',
    'scripts/postinstall-marker.mjs'
  ])
  await runGit(workspaceDir, ['commit', '-m', 'fixture: initial healthy commit'])

  return {
    commit: await runGit(workspaceDir, ['rev-parse', 'HEAD'])
  }
}

export async function createHealthyFixtureCommit({
  workspaceDir,
  label
}: {
  workspaceDir: string
  label: string
}): Promise<string> {
  await writeFile(path.join(workspaceDir, FIXTURE_VERSION_FILE), `${label}\n`, 'utf8')
  await runGit(workspaceDir, ['add', FIXTURE_VERSION_FILE])
  await runGit(workspaceDir, ['commit', '-m', `fixture: ${label}`])
  return runGit(workspaceDir, ['rev-parse', 'HEAD'])
}

async function runGit(cwd: string, args: string[]): Promise<string> {
  const { stdout } = await execFileAsync('git', args, {
    cwd,
    encoding: 'utf8'
  })
  return stdout.trim()
}
