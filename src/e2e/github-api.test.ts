import { http, HttpResponse } from 'msw'
import { setupServer } from 'msw/node'
import { afterAll, afterEach, beforeAll, describe, expect, test } from 'vitest'
import { createGitHubClient } from './github-api.ts'

type RecordedRequest = {
  url: string
  method: string
  authorization: string | null
  accept: string | null
  apiVersion: string | null
  userAgent: string | null
  contentType: string | null
  body: string | null
}

const requests: RecordedRequest[] = []

async function record(request: Request): Promise<void> {
  requests.push({
    url: request.url,
    method: request.method,
    authorization: request.headers.get('authorization'),
    accept: request.headers.get('accept'),
    apiVersion: request.headers.get('x-github-api-version'),
    userAgent: request.headers.get('user-agent'),
    contentType: request.headers.get('content-type'),
    body: request.method === 'GET' ? null : await request.text()
  })
}

const server = setupServer(
  http.get(
    'https://api.github.com/repos/47ng/actions-clever-cloud',
    async ({ request }) => {
      await record(request)
      return HttpResponse.json({ default_branch: 'master' })
    }
  ),
  http.get(
    'https://api.github.com/repos/47ng/actions-clever-cloud/pulls/:number',
    async ({ request, params }) => {
      await record(request)
      if (params['number'] === '404') {
        return HttpResponse.json({ message: 'Not Found' }, { status: 404 })
      }
      return HttpResponse.json({ number: 42, state: 'open' })
    }
  ),
  http.get(
    'https://api.github.com/repos/47ng/actions-clever-cloud/commits/:sha/pulls',
    async ({ request }) => {
      await record(request)
      return HttpResponse.json([{ number: 42 }, { number: 43 }])
    }
  ),
  http.get(
    'https://api.github.com/repos/47ng/actions-clever-cloud/issues/:number/comments',
    async ({ request }) => {
      await record(request)
      return HttpResponse.json([{ id: 1, body: 'first' }])
    }
  ),
  http.patch(
    'https://api.github.com/repos/47ng/actions-clever-cloud/issues/comments/:id',
    async ({ request }) => {
      await record(request)
      return HttpResponse.json({})
    }
  ),
  http.post(
    'https://api.github.com/repos/47ng/actions-clever-cloud/issues/:number/comments',
    async ({ request }) => {
      await record(request)
      return HttpResponse.json({}, { status: 201 })
    }
  )
)

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }))
afterEach(() => {
  requests.length = 0
  server.resetHandlers()
})
afterAll(() => server.close())

const client = createGitHubClient({
  token: 'ghs_example',
  repository: '47ng/actions-clever-cloud'
})

describe('createGitHubClient', () => {
  test('sends the required headers on every request', async () => {
    await client.getRepository()

    expect(requests).toEqual([
      {
        url: 'https://api.github.com/repos/47ng/actions-clever-cloud',
        method: 'GET',
        authorization: 'Bearer ghs_example',
        accept: 'application/vnd.github+json',
        apiVersion: '2022-11-28',
        userAgent: 'actions-clever-cloud-e2e',
        contentType: null,
        body: null
      }
    ])
  })

  test('returns the pull request payload', async () => {
    await expect(client.getPullRequest(42)).resolves.toEqual({
      number: 42,
      state: 'open'
    })
  })

  test('lists pull requests associated with a commit', async () => {
    await expect(
      client.listPullRequestsAssociatedWithCommit('a'.repeat(40))
    ).resolves.toEqual([{ number: 42 }, { number: 43 }])
    expect(requests[0]?.url).toBe(
      `https://api.github.com/repos/47ng/actions-clever-cloud/commits/${'a'.repeat(40)}/pulls`
    )
  })

  test('lists issue comments with a single request', async () => {
    await expect(client.listIssueComments(42)).resolves.toEqual([
      { id: 1, body: 'first' }
    ])
    expect(requests).toHaveLength(1)
    expect(requests[0]?.url).toBe(
      'https://api.github.com/repos/47ng/actions-clever-cloud/issues/42/comments'
    )
  })

  test('updates a comment with a JSON PATCH body', async () => {
    await client.updateIssueComment(1234, 'updated body')

    expect(requests[0]).toMatchObject({
      url: 'https://api.github.com/repos/47ng/actions-clever-cloud/issues/comments/1234',
      method: 'PATCH',
      contentType: 'application/json',
      body: JSON.stringify({ body: 'updated body' })
    })
  })

  test('creates a comment with a JSON POST body', async () => {
    await client.createIssueComment(42, 'new body')

    expect(requests[0]).toMatchObject({
      url: 'https://api.github.com/repos/47ng/actions-clever-cloud/issues/42/comments',
      method: 'POST',
      contentType: 'application/json',
      body: JSON.stringify({ body: 'new body' })
    })
  })

  test('throws on non-ok responses with method, path, and status', async () => {
    await expect(client.getPullRequest(404)).rejects.toThrow(
      'GitHub API GET /repos/47ng/actions-clever-cloud/pulls/404 failed with status 404'
    )
  })
})
