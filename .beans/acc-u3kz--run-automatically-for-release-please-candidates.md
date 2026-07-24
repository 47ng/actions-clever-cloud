---
# acc-u3kz
title: Run automatically for Release Please candidates
status: completed
type: task
priority: high
tags:
    - e2e
    - afk
created_at: 2026-07-23T11:05:03Z
updated_at: 2026-07-23T11:05:03Z
parent: acc-9ddy
blocked_by:
    - acc-e80z
    - acc-0qmf
---

## What to build

Connect the healthy reusable suite to the automatic release path described in the parent PRD's "Preview and trust orchestration" section. Eligible ready Release Please candidates must resolve or build their exact image, reject stale state, and invoke the same suite used by manual dispatch.

## Acceptance criteria

- [x] Eligibility requires an internal, non-draft Release Please pull request with the expected bot, branch pattern, and pending label.
- [x] Open, update, reopen, and ready events share per-pull-request concurrency that keeps the running workflow and latest pending update; different pull requests may overlap.
- [x] Existing verified SHA images are reused, while missing images are built, checked, and passed by digest.
- [x] Pull request state is reread immediately before provisioning; a stale automatic run records `superseded`, creates no app, and succeeds.
- [x] Manual and automatic callers pass typed identity values to one reusable suite, and untrusted values enter scripts only through inputs or environment variables.
- [x] Static tests cover eligibility, stale behavior, permissions, concurrency, and separation from the fork preview flow.

## User stories addressed

- User story 1
- User story 5
- User story 6
- User story 7
- User story 8
- User story 9
- User story 10
- User story 11
- User story 15
- User story 16
- User story 74

## Summary of Changes

- Added automatic Release Please E2E dispatch from `main.yml` through `repository_dispatch`, so bot-created PR updates trigger despite `GITHUB_TOKEN` workflow limits.
- Added `.github/workflows/e2e-release-please.yml` to resolve eligible candidates, reject stale runs as `superseded`, reuse verified SHA images, or build missing ones and pass the pinned digest into the shared reusable suite.
- Updated manual and reusable E2E workflows to share typed candidate identity inputs and keep stale-run, permission, and script-safety checks aligned.
- Added static workflow tests for Release Please dispatch, eligibility, concurrency, digest passing, stale gating, and fork-flow separation.
