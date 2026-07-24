import { appendFile } from 'node:fs/promises'
import {
  buildSupersededSummary,
  isStaleCandidateIdentity,
  violatesAutomaticCandidatePolicy
} from '../candidate-policy.ts'
import { createGitHubClient } from '../github-api.ts'

const headSha = process.env.HEAD_SHA
const prNumberInput = process.env.PR_NUMBER
const caller = process.env.CALLER
const token = process.env.GH_TOKEN
const thisRepo = process.env.GITHUB_REPOSITORY
const githubOutput = process.env.GITHUB_OUTPUT
const summaryPath = process.env.GITHUB_STEP_SUMMARY

if (
  !headSha ||
  !prNumberInput ||
  !caller ||
  !token ||
  !thisRepo ||
  !githubOutput ||
  !summaryPath
) {
  throw new Error('Missing candidate staleness recheck inputs')
}

const prNumber = Number(prNumberInput)
const github = createGitHubClient({ token, repository: thisRepo })

const [pr, repository] = await Promise.all([
  github.getPullRequest(prNumber),
  github.getRepository()
])
const defaultBranch = repository.default_branch

if (
  isStaleCandidateIdentity({ pr, thisRepo, defaultBranch, headSha }) ||
  (caller === 'automatic' && violatesAutomaticCandidatePolicy(pr))
) {
  if (caller === 'automatic') {
    await appendFile(githubOutput, 'proceed=false\n')
    await appendFile(
      summaryPath,
      buildSupersededSummary(
        `Pull request #${prNumber} no longer matches the approved candidate identity for ${headSha}.`
      )
    )
  } else {
    console.error(
      `::error::PR #${prNumber} is stale. Expected ${headSha}, found ${pr.head.sha}. Dispatch again with the current head.`
    )
    process.exit(1)
  }
} else {
  await appendFile(githubOutput, 'proceed=true\n')
}
