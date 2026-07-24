const headSha = process.env.HEAD_SHA
const prNumber = process.env.PR_NUMBER
const candidateDigest = process.env.CANDIDATE_DIGEST
const candidateImage = process.env.CANDIDATE_IMAGE
const candidateSourceRepository = process.env.CANDIDATE_SOURCE_REPOSITORY
const trustedWorkflowSha = process.env.TRUSTED_WORKFLOW_SHA
const caller = process.env.CALLER
const thisRepo = process.env.GITHUB_REPOSITORY

if (!/^[0-9a-f]{40}$/.test(headSha ?? '')) {
  throw new Error(
    'head_sha must be a full 40-character lowercase hex commit SHA.'
  )
}

if (!/^\d+$/.test(prNumber ?? '')) {
  throw new Error('pr_number must be a decimal pull request number.')
}

if (!/^sha256:[0-9a-f]{64}$/.test(candidateDigest ?? '')) {
  throw new Error('candidate_digest must be a canonical sha256 digest.')
}

if (
  !/^ghcr\.io\/47ng\/actions-clever-cloud@sha256:[0-9a-f]{64}$/.test(
    candidateImage ?? ''
  )
) {
  throw new Error(
    'candidate_image must be pinned to a canonical sha256 digest.'
  )
}

if (!candidateImage?.endsWith(`@${candidateDigest}`)) {
  throw new Error(
    `candidate_image must end with ${candidateDigest}, got ${candidateImage ?? '(missing)'}`
  )
}

if (!thisRepo || candidateSourceRepository !== thisRepo) {
  throw new Error(
    `candidate_source_repository must match ${thisRepo}, got ${candidateSourceRepository ?? '(missing)'}`
  )
}

if (!/^[0-9a-f]{40}$/.test(trustedWorkflowSha ?? '')) {
  throw new Error(
    'trusted_workflow_sha must be a full 40-character lowercase hex commit SHA.'
  )
}

if (caller !== 'manual' && caller !== 'automatic') {
  throw new Error(
    `caller must be manual or automatic, got ${caller ?? '(missing)'}`
  )
}
