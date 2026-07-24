---
# acc-ia3o
title: Create and delete an app from manual dispatch
status: completed
type: task
priority: high
tags:
    - e2e
    - afk
created_at: 2026-07-23T11:02:04Z
updated_at: 2026-07-23T14:02:41Z
parent: acc-9ddy
blocked_by:
    - acc-e80z
---

## What to build

Implement the first complete manual control path from the parent PRD's "Reusable live suite", "Authentication and permissions", and "Application lifecycle controller" sections. A validated internal pull request dispatch must enter the protected environment, create one personal-account application, and delete that exact application on exit.

## Acceptance criteria

- [x] The manual caller accepts one full SHA, requires exactly one open internal pull request at that head, requires the dispatched workflow SHA to match, and rechecks staleness after approval.
- [x] Clever credentials remain step-scoped, no step calls `clever login`, and no organisation owner is passed.
- [x] Candidate dependencies install from the lockfile with scripts disabled, and host control uses the candidate's locked Clever Tools binary with bounded process deadlines.
- [x] Creation uses the documented run-based name and reports success only after it captures a valid application ID.
- [x] Always-run teardown cancels active deployments, deletes only the captured ID, verifies absence, and reports the exact name and ID on failure.
- [x] Contributor and E2E operations guides document environment setup, approval, region choice, dispatch, naming, and manual cleanup.

## User stories addressed

- User story 12
- User story 13
- User story 14
- User story 17
- User story 18
- User story 19
- User story 20
- User story 21
- User story 22
- User story 23
- User story 24
- User story 25
- User story 26
- User story 27
- User story 28
- User story 29
- User story 67
- User story 75
- User story 76

## Summary of Changes

- added the manual and reusable E2E workflows, plus static tests, to validate full-SHA dispatch, internal-PR trust checks, approval-time staleness checks, step-scoped Clever credentials, and candidate lockfile setup
- added a Clever Cloud controller with tested create, exact-name recovery, bounded lookup and cancellation waits, exact-ID teardown, and deletion verification for the manual create/delete path
- documented maintainer setup and repair flow in `docs/e2e-operations.md`, and linked it from `CONTRIBUTING.md`
