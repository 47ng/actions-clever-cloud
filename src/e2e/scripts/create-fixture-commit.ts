import { createHealthyFixtureCommit } from '../git-fixture.ts'
import { writeStepOutputs } from '../step-output.ts'

const workspaceDir = process.env.WORKSPACE_DIR
const commitLabel = process.env.COMMIT_LABEL
const commitContext = process.env.COMMIT_CONTEXT
const githubOutput = process.env.GITHUB_OUTPUT

if (!workspaceDir || !commitLabel || !githubOutput) {
  throw new Error(`Missing ${commitContext} fixture commit outputs`)
}

const commit = await createHealthyFixtureCommit({
  workspaceDir,
  label: commitLabel
})

await writeStepOutputs(githubOutput, { commit })
