import { appendFile, readFile } from 'node:fs/promises'
import {
  buildSupersededSummary,
  isCurrentAutomaticCandidate
} from '../candidate-policy.ts'
import { createGitHubClient } from '../github-api.ts'

const headSha = process.env.HEAD_SHA
const prNumber = Number(process.env.PR_NUMBER)
const token = process.env.GH_TOKEN
const thisRepo = process.env.GITHUB_REPOSITORY
const eventPath = process.env.GITHUB_EVENT_PATH
const githubOutput = process.env.GITHUB_OUTPUT
const stepSummary = process.env.GITHUB_STEP_SUMMARY

if (
  !headSha ||
  !token ||
  !thisRepo ||
  !eventPath ||
  !githubOutput ||
  !stepSummary
) {
  throw new Error('Missing candidate freshness environment variables')
}

const event = JSON.parse(await readFile(eventPath, 'utf8')) as {
  repository: { default_branch: string }
}
const defaultBranch = event.repository.default_branch

const github = createGitHubClient({ token, repository: thisRepo })
const pr = await github.getPullRequest(prNumber)

if (!isCurrentAutomaticCandidate({ pr, thisRepo, defaultBranch, headSha })) {
  await appendFile(githubOutput, 'proceed=false\n')
  await appendFile(
    stepSummary,
    buildSupersededSummary(
      `Pull request #${prNumber} no longer matches the approved candidate identity for ${headSha}.`
    )
  )
  process.exit(0)
}

await appendFile(githubOutput, 'proceed=true\n')
