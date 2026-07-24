import { appendFile, readFile } from 'node:fs/promises'
import {
  buildSupersededSummary,
  isEligibleAutomaticCandidate
} from '../candidate-policy.ts'
import { createGitHubClient } from '../github-api.ts'

const prNumber = Number(process.env.PR_NUMBER)
const token = process.env.GH_TOKEN
const thisRepo = process.env.GITHUB_REPOSITORY
const eventPath = process.env.GITHUB_EVENT_PATH
const githubOutput = process.env.GITHUB_OUTPUT
const stepSummary = process.env.GITHUB_STEP_SUMMARY

if (!Number.isInteger(prNumber) || prNumber <= 0) {
  console.error(
    '::error::Missing or invalid release candidate pull request number.'
  )
  process.exit(1)
}

if (!token || !thisRepo || !eventPath || !githubOutput || !stepSummary) {
  throw new Error('Missing candidate identity environment variables')
}

const event = JSON.parse(await readFile(eventPath, 'utf8')) as {
  repository: { default_branch: string }
}
const defaultBranch = event.repository.default_branch

const github = createGitHubClient({ token, repository: thisRepo })
const pr = await github.getPullRequest(prNumber)

await appendFile(
  githubOutput,
  `pr_number=${String(pr.number)}\n` +
    `candidate_source_repository=${thisRepo}\n`
)

if (!isEligibleAutomaticCandidate({ pr, thisRepo, defaultBranch })) {
  await appendFile(githubOutput, 'proceed=false\n')
  await appendFile(
    stepSummary,
    buildSupersededSummary(
      `Pull request #${pr.number} no longer matches the approved automatic release candidate policy.`
    )
  )
  process.exit(0)
}

await appendFile(githubOutput, `proceed=true\n` + `head_sha=${pr.head.sha}\n`)
