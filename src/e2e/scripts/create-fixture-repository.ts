import { appendFile } from 'node:fs/promises'
import { createFixtureRepository } from '../git-fixture.ts'

const workspaceDir = process.env.WORKSPACE_DIR
const githubOutput = process.env.GITHUB_OUTPUT
if (!workspaceDir || !githubOutput) {
  throw new Error('Missing fixture setup outputs')
}

const fixture = await createFixtureRepository({ workspaceDir })
await appendFile(githubOutput, `commit=${fixture.commit}\n`)
