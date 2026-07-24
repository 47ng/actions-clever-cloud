import type { CandidatePullRequest } from './candidate-policy.ts'

export type RepositoryInfo = {
  default_branch: string
}

export type IssueComment = {
  id: number
  body?: string
}

export type GitHubClient = {
  getPullRequest: (pullNumber: number) => Promise<CandidatePullRequest>
  getRepository: () => Promise<RepositoryInfo>
  listPullRequestsAssociatedWithCommit: (
    commitSha: string
  ) => Promise<CandidatePullRequest[]>
  listIssueComments: (issueNumber: number) => Promise<IssueComment[]>
  updateIssueComment: (commentId: number, body: string) => Promise<void>
  createIssueComment: (issueNumber: number, body: string) => Promise<void>
}

type GitHubClientOptions = {
  token: string
  repository: string
}

export function createGitHubClient({
  token,
  repository
}: GitHubClientOptions): GitHubClient {
  async function request(
    method: string,
    path: string,
    body?: unknown
  ): Promise<unknown> {
    const response = await fetch(`https://api.github.com${path}`, {
      method,
      headers: {
        authorization: `Bearer ${token}`,
        accept: 'application/vnd.github+json',
        'x-github-api-version': '2022-11-28',
        'user-agent': 'actions-clever-cloud-e2e',
        ...(body === undefined ? {} : { 'content-type': 'application/json' })
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) })
    })

    if (!response.ok) {
      throw new Error(
        `GitHub API ${method} ${path} failed with status ${response.status}`
      )
    }

    return response.json()
  }

  return {
    async getPullRequest(pullNumber) {
      const pr = await request(
        'GET',
        `/repos/${repository}/pulls/${pullNumber}`
      )
      return pr as CandidatePullRequest
    },
    async getRepository() {
      const repo = await request('GET', `/repos/${repository}`)
      return repo as RepositoryInfo
    },
    async listPullRequestsAssociatedWithCommit(commitSha) {
      const pulls = await request(
        'GET',
        `/repos/${repository}/commits/${commitSha}/pulls`
      )
      return pulls as CandidatePullRequest[]
    },
    async listIssueComments(issueNumber) {
      const comments = await request(
        'GET',
        `/repos/${repository}/issues/${issueNumber}/comments`
      )
      return comments as IssueComment[]
    },
    async updateIssueComment(commentId, body) {
      await request(
        'PATCH',
        `/repos/${repository}/issues/comments/${commentId}`,
        {
          body
        }
      )
    },
    async createIssueComment(issueNumber, body) {
      await request(
        'POST',
        `/repos/${repository}/issues/${issueNumber}/comments`,
        {
          body
        }
      )
    }
  }
}
