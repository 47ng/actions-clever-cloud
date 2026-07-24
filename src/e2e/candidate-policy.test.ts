import { EOL } from 'node:os'
import { describe, expect, test } from 'vitest'
import {
  buildSupersededSummary,
  filterManualCandidatePulls,
  isCurrentAutomaticCandidate,
  isEligibleAutomaticCandidate,
  isStaleCandidateIdentity,
  violatesAutomaticCandidatePolicy,
  type CandidatePullRequest
} from './candidate-policy.ts'

const thisRepo = '47ng/actions-clever-cloud'
const defaultBranch = 'master'
const headSha = '0123456789abcdef0123456789abcdef01234567'

function eligiblePullRequest(): CandidatePullRequest {
  return {
    number: 42,
    state: 'open',
    draft: false,
    user: { login: 'github-actions[bot]' },
    head: {
      sha: headSha,
      // Release Please v5 appends the component suffix to the branch name.
      ref: 'release-please--branches--master--components--actions-clever-cloud',
      repo: { full_name: thisRepo }
    },
    base: { ref: defaultBranch, repo: { full_name: thisRepo } },
    labels: [{ name: 'autorelease: pending' }]
  }
}

describe('isEligibleAutomaticCandidate', () => {
  test('accepts the exact release please candidate identity', () => {
    expect(
      isEligibleAutomaticCandidate({
        pr: eligiblePullRequest(),
        thisRepo,
        defaultBranch
      })
    ).toBe(true)
  })

  test('accepts the bare pre-v5 release please branch name', () => {
    const pr = eligiblePullRequest()
    pr.head.ref = 'release-please--branches--master'
    expect(isEligibleAutomaticCandidate({ pr, thisRepo, defaultBranch })).toBe(
      true
    )
  })

  test.each<[string, (pr: CandidatePullRequest) => void]>([
    ['a closed pull request', pr => (pr.state = 'closed')],
    ['a fork head', pr => (pr.head.repo.full_name = 'evil/fork')],
    ['a fork base', pr => (pr.base.repo.full_name = 'evil/fork')],
    ['a non-default base branch', pr => (pr.base.ref = 'develop')],
    ['a draft', pr => (pr.draft = true)],
    ['a human author', pr => (pr.user.login = 'franky47')],
    ['another head branch', pr => (pr.head.ref = 'feature/thing')],
    [
      'a lookalike head branch without the separator',
      pr => (pr.head.ref = 'release-please--branches--masterful')
    ],
    ['a missing autorelease label', pr => (pr.labels = [])]
  ])('rejects %s', (_description, mutate) => {
    const pr = eligiblePullRequest()
    mutate(pr)
    expect(isEligibleAutomaticCandidate({ pr, thisRepo, defaultBranch })).toBe(
      false
    )
  })
})

describe('isCurrentAutomaticCandidate', () => {
  test('accepts an eligible candidate at the expected head', () => {
    expect(
      isCurrentAutomaticCandidate({
        pr: eligiblePullRequest(),
        thisRepo,
        defaultBranch,
        headSha
      })
    ).toBe(true)
  })

  test('rejects an eligible candidate whose head moved', () => {
    expect(
      isCurrentAutomaticCandidate({
        pr: eligiblePullRequest(),
        thisRepo,
        defaultBranch,
        headSha: 'f'.repeat(40)
      })
    ).toBe(false)
  })

  test('rejects an ineligible candidate at the expected head', () => {
    const pr = eligiblePullRequest()
    pr.draft = true
    expect(
      isCurrentAutomaticCandidate({ pr, thisRepo, defaultBranch, headSha })
    ).toBe(false)
  })
})

describe('isStaleCandidateIdentity', () => {
  test('keeps a pull request matching the approved identity', () => {
    expect(
      isStaleCandidateIdentity({
        pr: eligiblePullRequest(),
        thisRepo,
        defaultBranch,
        headSha
      })
    ).toBe(false)
  })

  test.each<[string, (pr: CandidatePullRequest) => void]>([
    ['a closed pull request', pr => (pr.state = 'closed')],
    ['a fork base', pr => (pr.base.repo.full_name = 'evil/fork')],
    ['a non-default base branch', pr => (pr.base.ref = 'develop')],
    ['a fork head', pr => (pr.head.repo.full_name = 'evil/fork')],
    ['a moved head', pr => (pr.head.sha = 'f'.repeat(40))]
  ])('flags %s as stale', (_description, mutate) => {
    const pr = eligiblePullRequest()
    mutate(pr)
    expect(
      isStaleCandidateIdentity({ pr, thisRepo, defaultBranch, headSha })
    ).toBe(true)
  })

  test('ignores automatic policy fields', () => {
    const pr = eligiblePullRequest()
    pr.draft = true
    pr.user.login = 'franky47'
    pr.labels = []
    expect(
      isStaleCandidateIdentity({ pr, thisRepo, defaultBranch, headSha })
    ).toBe(false)
  })
})

describe('violatesAutomaticCandidatePolicy', () => {
  test('accepts the release please bot candidate', () => {
    expect(violatesAutomaticCandidatePolicy(eligiblePullRequest())).toBe(false)
  })

  test.each<[string, (pr: CandidatePullRequest) => void]>([
    ['a draft', pr => (pr.draft = true)],
    ['a human author', pr => (pr.user.login = 'franky47')],
    ['another head branch', pr => (pr.head.ref = 'feature/thing')],
    [
      'a lookalike head branch without the separator',
      pr => (pr.head.ref = 'release-please--branches--masterful')
    ],
    [
      'a missing autorelease label',
      pr => (pr.labels = [{ name: 'autorelease: tagged' }])
    ]
  ])('flags %s', (_description, mutate) => {
    const pr = eligiblePullRequest()
    mutate(pr)
    expect(violatesAutomaticCandidatePolicy(pr)).toBe(true)
  })

  test('ignores identity fields', () => {
    const pr = eligiblePullRequest()
    pr.state = 'closed'
    pr.head.sha = 'f'.repeat(40)
    pr.base.repo.full_name = 'evil/fork'
    expect(violatesAutomaticCandidatePolicy(pr)).toBe(false)
  })
})

describe('filterManualCandidatePulls', () => {
  test('keeps only open internal pull requests at the expected head', () => {
    const match = eligiblePullRequest()
    const closed = eligiblePullRequest()
    closed.state = 'closed'
    const fork = eligiblePullRequest()
    fork.head.repo.full_name = 'evil/fork'
    const moved = eligiblePullRequest()
    moved.head.sha = 'f'.repeat(40)

    expect(
      filterManualCandidatePulls([match, closed, fork, moved], {
        thisRepo,
        headSha
      })
    ).toEqual([match])
  })

  test('accepts manual candidates regardless of automatic policy fields', () => {
    const pr = eligiblePullRequest()
    pr.draft = true
    pr.user.login = 'franky47'
    pr.head.ref = 'feature/thing'
    pr.labels = []

    expect(filterManualCandidatePulls([pr], { thisRepo, headSha })).toEqual([
      pr
    ])
  })
})

describe('buildSupersededSummary', () => {
  test('matches the actions summary block byte for byte', () => {
    expect(
      buildSupersededSummary(
        'Pull request #42 no longer matches the approved candidate identity for abc.'
      )
    ).toBe(
      `<h1>Superseded</h1>${EOL}superseded${EOL}Pull request #42 no longer matches the approved candidate identity for abc.`
    )
  })
})
