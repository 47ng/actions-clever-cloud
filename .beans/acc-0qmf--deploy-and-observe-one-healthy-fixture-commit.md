---
# acc-0qmf
title: Deploy and observe one healthy fixture commit
status: completed
type: task
priority: high
tags:
    - e2e
    - afk
created_at: 2026-07-23T11:02:30Z
updated_at: 2026-07-23T11:02:30Z
parent: acc-9ddy
blocked_by:
    - acc-e80z
    - acc-ia3o
---

## What to build

Add the first real deployment path from the parent PRD's "Git fixture builder", "Remote Node.js harness", and "Deployment observer" sections. The shared workflow must invoke the pinned candidate through a normal action step and prove a healthy fixture through Clever Cloud state and public HTTP.

## Acceptance criteria

- [x] The workspace root becomes a fresh, non-shallow Git repository containing only fixture files while candidate source and support files remain ignored.
- [x] The provisioning link is removed, and the first and all later candidate action calls receive the captured `appID`.
- [x] The dependency-free fixture listens on `PORT`, exposes `/health`, prints stable markers, and returns only scenario values plus the four allowed platform fields.
- [x] `CC_HEALTH_CHECK_PATH=/health` is supplied through `setEnv`, and success requires completed activity plus matching public health state.
- [x] Every checkout disables persisted credentials, and Clever credentials reach only candidate action or control steps.
- [x] Local process, temporary Git repository, and fake observer tests cover health, allow-listing, ignored files, commit state, and bounded polling.

## User stories addressed

- User story 30
- User story 31
- User story 33
- User story 34
- User story 35
- User story 36
- User story 38
- User story 39
- User story 40
- User story 41
- User story 67
- User story 68
- User story 69

## Summary of Changes

- checked out the candidate into an ignored support directory, pinned its SHA image into a local `.candidate-action`, built a fresh fixture Git repository at the workspace root, removed the provisioning link, and deployed the first healthy fixture commit through a normal `uses` step with `appID`
- added a dependency-free fixture app, a temporary-repository builder, and a healthy deployment observer so the reusable workflow now waits for a completed Clever deploy and matching public `/health` response before teardown
- added focused tests for the fixture process, fixture repository, deployment observer, Clever app lookup, and reusable workflow policy coverage for the new healthy deployment path
