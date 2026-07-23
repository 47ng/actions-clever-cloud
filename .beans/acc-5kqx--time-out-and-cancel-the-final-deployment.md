---
# acc-5kqx
title: Time out and cancel the final deployment
status: completed
type: task
priority: normal
tags:
    - e2e
    - afk
created_at: 2026-07-23T11:04:19Z
updated_at: 2026-07-23T11:04:19Z
parent: acc-9ddy
blocked_by:
    - acc-yr2t
---

## What to build

Implement the final timeout path from the parent PRD's "Deployment observer" and "Ordered scenario flow" sections. A delayed remote build must outlast the action, be found by commit, be cancelled, and settle before exact-ID teardown.

## Acceptance criteria

- [x] Normal candidate calls are bounded at 1,200 seconds, while the final call uses 60 seconds against a delay of at least 180 seconds.
- [x] The candidate action succeeds with its documented timeout message.
- [x] The observer finds the new deployment by commit ID rather than list position.
- [x] The controller cancels the deployment and waits within a fixed bound for a final cancelled state.
- [x] Public health remains on the prior forced healthy commit after cancellation.
- [x] Tests cover timeout, cancellation, never-settling states, and useful deadline errors.

## Summary of Changes

- Added the final slow-build timeout scenario to `.github/workflows/e2e-reusable.yml`, with a 60 second action timeout against a 180 second post-build delay, explicit timeout contract checks, commit-based cancellation, fixed-bound waits, and proof that the prior forced healthy deployment stays live.
- Extended the action timeout path so the documented success message is written into quiet deployment logs, which lets the live suite assert the public timeout contract.
- Added controller and observer support for commit-matched cancellation, exact final cancelled-state waits, wall-clock deadline enforcement, and useful timeout errors.
- Extended fixture and policy coverage with slow-build child commits, delay behavior, timeout evidence, and cancellation deadline tests.

## User stories addressed

- User story 56
- User story 57
- User story 58
- User story 59
- User story 60
- User story 61
- User story 62
- User story 63
