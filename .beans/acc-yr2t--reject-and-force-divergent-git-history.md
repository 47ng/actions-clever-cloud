---
# acc-yr2t
title: Reject and force divergent Git history
status: completed
type: task
priority: normal
tags:
    - e2e
    - afk
created_at: 2026-07-23T11:03:58Z
updated_at: 2026-07-23T11:03:58Z
parent: acc-9ddy
blocked_by:
    - acc-5m70
---

## What to build

Add the force path from the parent PRD's "Git fixture builder" and "Deployment observer" sections. The fixture must create real divergent history, prove normal non-fast-forward rejection, and then deploy the same commit with `force: true`.

## Acceptance criteria

- [x] The fixture resets to a known ancestor and creates a commit that diverges from the deployed remote head.
- [x] Normal deployment fails and creates no replacement activity.
- [x] The prior healthy commit remains visible after rejection.
- [x] The identical divergent commit succeeds with `force: true` and becomes publicly visible.
- [x] Temporary-repository tests prove the histories are divergent rather than merely ahead or behind.
- [x] Unexpected outcomes still allow evidence collection and teardown.

## User stories addressed

- User story 37
- User story 54
- User story 55
- User story 62
- User story 63
- User story 69

## Summary of Changes

- added real divergent fixture history and checks for rejected non-fast-forward deployment without new activity
- added forced deployment of the same commit, with public health proof and failure evidence coverage
- added Git and observer tests for divergent ancestry, prior health, and forced replacement
