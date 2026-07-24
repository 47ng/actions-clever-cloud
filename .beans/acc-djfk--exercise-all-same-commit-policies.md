---
# acc-djfk
title: Exercise all same-commit policies
status: completed
type: task
priority: normal
tags:
    - e2e
    - afk
created_at: 2026-07-23T11:03:17Z
updated_at: 2026-07-23T11:03:17Z
parent: acc-9ddy
blocked_by:
    - acc-rtwf
---

## What to build

Add the complete duplicate-commit path from the parent PRD's "Deployment observer" and "Ordered scenario flow" sections. One deployed commit must distinguish error, ignore, restart, and rebuild through action results, activity, production identity, and cache markers.

## Acceptance criteria

- [x] Default error fails with the expected message and creates no new activity.
- [x] Ignore succeeds with unchanged instance, deployment, commit, and activity count.
- [x] Restart changes production IDs without a new install marker.
- [x] Rebuild changes production IDs, reports cache bypass, and emits a new install marker.
- [x] Expected failures continue only around the action step and receive a mandatory outcome assertion.
- [x] Any unexpected result skips later scenarios while preserving evidence collection and teardown.

## User stories addressed

- User story 46
- User story 47
- User story 48
- User story 49
- User story 62
- User story 63

## Summary of Changes

- extended the reusable E2E workflow with the full same-commit sequence so it now captures a post-env baseline, checks the default error and ignore paths for unchanged activity and production IDs, and verifies restart and rebuild against new deployment IDs plus cache-marker expectations
- added deployment-observer helpers and focused tests for bounded no-activity checks, exact same-commit deployment matching, and new successful deployment discovery so the workflow can stop in order and still collect evidence and tear down safely
- expanded structured results and failure-evidence coverage so same-commit scenarios record explicit outcomes and retain the right candidate action logs without marking expected failures as suite failures
