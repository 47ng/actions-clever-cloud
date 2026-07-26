import { createFixtureRepository } from '../git-fixture.ts'
import { writeStepOutputs } from '../step-output.ts'

const workspaceDir = process.env.WORKSPACE_DIR
const githubOutput = process.env.GITHUB_OUTPUT
if (!workspaceDir || !githubOutput) {
  throw new Error('Missing fixture setup outputs')
}

const fixture = await createFixtureRepository({ workspaceDir })
await writeStepOutputs(githubOutput, { commit: fixture.commit })
