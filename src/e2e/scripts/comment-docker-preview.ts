import { createGitHubClient } from '../github-api.ts'
import {
  buildDockerPreviewComment,
  DOCKER_BUILD_COMMENT_MARKER
} from '../preview-comment.ts'

const tag = process.env.TAG
const sha = process.env.SHA
const digest = process.env.DIGEST
const tags = process.env.TAGS
const labels = process.env.LABELS
const prNumber = Number(process.env.PR_NUMBER)
const token = process.env.GH_TOKEN
const repository = process.env.GITHUB_REPOSITORY

if (
  tag === undefined ||
  sha === undefined ||
  digest === undefined ||
  tags === undefined ||
  labels === undefined ||
  !Number.isInteger(prNumber) ||
  prNumber <= 0 ||
  !token ||
  !repository
) {
  throw new Error('Missing preview comment environment variables')
}

const body = buildDockerPreviewComment({ tag, sha, digest, tags, labels })
const github = createGitHubClient({ token, repository })
const comments = await github.listIssueComments(prNumber)
const botComment = comments.find(
  comment =>
    comment.body && comment.body.startsWith(DOCKER_BUILD_COMMENT_MARKER)
)

if (botComment) {
  await github.updateIssueComment(botComment.id, body)
} else {
  await github.createIssueComment(prNumber, body)
}
