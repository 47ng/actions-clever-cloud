import { EOL } from 'node:os'

export type CandidatePullRequest = {
  number: number
  state: string
  draft: boolean
  user: { login: string }
  head: { sha: string; ref: string; repo: { full_name: string } }
  base: { ref: string; repo: { full_name: string } }
  labels: Array<{ name: string }>
}

type CandidateRepositoryContext = {
  pr: CandidatePullRequest
  thisRepo: string
  defaultBranch: string
}

type CandidateIdentityContext = CandidateRepositoryContext & {
  headSha: string
}

const releasePleaseBranch = 'release-please--branches--master'

function isReleasePleaseCandidateBranch(ref: string): boolean {
  // Release Please v5 appends `--components--<package>` to the branch name;
  // earlier versions used the bare form.
  return (
    ref === releasePleaseBranch || ref.startsWith(releasePleaseBranch + '--')
  )
}

export function isEligibleAutomaticCandidate({
  pr,
  thisRepo,
  defaultBranch
}: CandidateRepositoryContext): boolean {
  return (
    pr.state === 'open' &&
    pr.head.repo.full_name === thisRepo &&
    pr.base.repo.full_name === thisRepo &&
    pr.base.ref === defaultBranch &&
    pr.draft === false &&
    pr.user.login === 'github-actions[bot]' &&
    isReleasePleaseCandidateBranch(pr.head.ref) &&
    pr.labels.some(label => label.name === 'autorelease: pending')
  )
}

export function isCurrentAutomaticCandidate({
  pr,
  thisRepo,
  defaultBranch,
  headSha
}: CandidateIdentityContext): boolean {
  return (
    isEligibleAutomaticCandidate({ pr, thisRepo, defaultBranch }) &&
    pr.head.sha === headSha
  )
}

export function isStaleCandidateIdentity({
  pr,
  thisRepo,
  defaultBranch,
  headSha
}: CandidateIdentityContext): boolean {
  return (
    pr.state !== 'open' ||
    pr.base.repo.full_name !== thisRepo ||
    pr.base.ref !== defaultBranch ||
    pr.head.repo.full_name !== thisRepo ||
    pr.head.sha !== headSha
  )
}

export function violatesAutomaticCandidatePolicy(
  pr: CandidatePullRequest
): boolean {
  return (
    pr.draft ||
    pr.user.login !== 'github-actions[bot]' ||
    !isReleasePleaseCandidateBranch(pr.head.ref) ||
    !pr.labels.some(label => label.name === 'autorelease: pending')
  )
}

export function filterManualCandidatePulls(
  pulls: CandidatePullRequest[],
  { thisRepo, headSha }: { thisRepo: string; headSha: string }
): CandidatePullRequest[] {
  return pulls.filter(
    pr =>
      pr.state === 'open' &&
      pr.head.repo.full_name === thisRepo &&
      pr.head.sha === headSha
  )
}

export function buildSupersededSummary(detail: string): string {
  return `<h1>Superseded</h1>${EOL}superseded${EOL}${detail}`
}
