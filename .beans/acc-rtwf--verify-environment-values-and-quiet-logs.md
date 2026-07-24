---
# acc-rtwf
title: Verify environment values and quiet logs
status: completed
type: task
priority: normal
tags:
    - e2e
    - afk
created_at: 2026-07-23T11:02:49Z
updated_at: 2026-07-23T11:02:49Z
parent: acc-9ddy
blocked_by:
    - acc-0qmf
---

## What to build

Extend the healthy deployment flow with the environment and log checks from the parent PRD's "Remote Node.js harness" and "Ordered scenario flow" sections. A second commit must prove realistic `setEnv` value handling and quiet file logging through the public action inputs.

## Acceptance criteria

- [x] A generated random 16-byte value has `==` base64 padding and survives remote storage unchanged.
- [x] The workflow compares the value without printing it.
- [x] One candidate action call combines `quiet: true` with `logFile`.
- [x] The saved file contains the fixture's stable build and startup markers.
- [x] Local tests cover token generation and exact health-value comparison.
- [x] The operations guide explains the check without exposing generated values.

## User stories addressed

- User story 42
- User story 43
- User story 44
- User story 45

## Summary of Changes

- added a second controlled healthy fixture commit plus a generated padded health value so the reusable workflow now drives `setEnv` through a quiet candidate action call and compares public and remote values without printing the generated value
- updated the fixture harness and deployment observer so health responses expose the allow-listed value, startup logs omit it, deployment matching uses the expected commit, and quiet log files prove the stable build and startup markers
- extended workflow policy tests, helper tests, and the operations guide so the environment-value and quiet-log checks stay covered and failure evidence can safely include the second action log file
