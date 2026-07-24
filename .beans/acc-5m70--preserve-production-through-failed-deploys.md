---
# acc-5m70
title: Preserve production through failed deploys
status: completed
type: task
priority: normal
tags:
    - e2e
    - afk
created_at: 2026-07-23T11:03:33Z
updated_at: 2026-07-23T11:03:33Z
parent: acc-9ddy
blocked_by:
    - acc-djfk
---

## What to build

Implement the remote failure and recovery path from the parent PRD's "Remote Node.js harness", "Deployment observer", and "Ordered scenario flow" sections. Build and startup failures must match their commits, leave the prior production app live, and allow a later healthy recovery.

## Acceptance criteria

- [x] The post-build hook can fail deterministically without depending on dependency-cache state.
- [x] Startup failure originates in the fixture application process.
- [x] Each failure requires the expected action result, fixture marker, and matching commit and deployment activity.
- [x] `/health` remains on the prior healthy commit and deployment after each failure.
- [x] A later healthy commit deploys successfully and becomes publicly observable.
- [x] Local tests cover both failure modes, prior-health checks, and recovery.

## User stories addressed

- User story 50
- User story 51
- User story 52
- User story 53
- User story 62
- User story 63

## Summary of Changes

- added deterministic build-failure and startup-failure fixture paths, plus observer coverage for matching failed deploy activity and preserved healthy production
- extended the reusable E2E workflow, structured results, and failure evidence to run build failure, startup failure, and recovery in order with explicit outcome checks
- added focused local tests for failure matching, prior-health preservation, recovery, and the new workflow policy and evidence paths
