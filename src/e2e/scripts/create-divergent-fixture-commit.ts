import { appendFile } from 'node:fs/promises'
import { createDivergentFixtureCommit } from '../git-fixture.ts'

const workspaceDir = process.env.WORKSPACE_DIR
const ancestorCommit = process.env.ANCESTOR_COMMIT
const githubOutput = process.env.GITHUB_OUTPUT

if (!workspaceDir || !ancestorCommit || !githubOutput) {
  throw new Error('Missing divergent fixture commit inputs')
}

const commit = await createDivergentFixtureCommit({
  workspaceDir,
  ancestorCommit,
  label: 'healthy-force'
})

await appendFile(githubOutput, `commit=${commit}\n`)
