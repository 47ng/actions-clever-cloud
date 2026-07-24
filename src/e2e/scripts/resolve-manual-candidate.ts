import { appendFile } from 'node:fs/promises'
import { filterManualCandidatePulls } from '../candidate-policy.ts'
import { createGitHubClient } from '../github-api.ts'

const headSha = process.env.HEAD_SHA
const runRef = process.env.RUN_REF
const token = process.env.GH_TOKEN
const thisRepo = process.env.GITHUB_REPOSITORY
const githubOutput = process.env.GITHUB_OUTPUT

if (!headSha || !/^[0-9a-f]{40}$/.test(headSha)) {
  console.error(
    '::error::head_sha must be a full 40-character lowercase hex commit SHA.'
  )
  process.exit(1)
}

if (runRef !== 'refs/heads/master') {
  console.error(
    `::error::Dispatch this workflow from master. The workflow run is pinned to ${runRef ?? '(missing)'}.`
  )
  process.exit(1)
}

if (!token || !thisRepo || !githubOutput) {
  throw new Error('Missing manual candidate resolution environment variables')
}

const github = createGitHubClient({ token, repository: thisRepo })
const pulls = await github.listPullRequestsAssociatedWithCommit(headSha)
const matches = filterManualCandidatePulls(pulls, { thisRepo, headSha })
const match = matches[0]

if (matches.length !== 1 || match === undefined) {
  console.error(
    `::error::Expected exactly one open internal pull request in ${thisRepo} at ${headSha}, but found ${matches.length}.`
  )
  process.exit(1)
}

await appendFile(
  githubOutput,
  `head_sha=${headSha}\n` +
    `pr_number=${String(match.number)}\n` +
    `candidate_source_repository=${thisRepo}\n`
)
