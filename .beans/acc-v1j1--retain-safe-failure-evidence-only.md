---
# acc-v1j1
title: Retain safe failure evidence only
status: completed
type: task
priority: high
tags:
    - e2e
    - afk
created_at: 2026-07-23T11:04:38Z
updated_at: 2026-07-23T15:15:22Z
parent: acc-9ddy
blocked_by:
    - acc-0qmf
---

## What to build

Add the failure evidence path from the parent PRD's "Evidence and documentation" section. Failed suites must retain useful structured results and redacted logs, while successful suites upload nothing.

## Acceptance criteria

- [x] Structured results include scenario outcomes, app identity, commit IDs, deployment IDs, and candidate action logs.
- [x] The credential-bearing cleanup path redacts token, secret, and common encoded forms, then scans every artifact candidate.
- [x] A redaction or scan failure suppresses artifact upload and fails the run.
- [x] The upload step receives no Clever credentials, uses a short retention period, and runs only on suite failure.
- [x] Tests cover required evidence, raw and encoded redaction, scan failure, and upload refusal.
- [x] The operations guide documents evidence retrieval and manual recovery.

## User stories addressed

- User story 64
- User story 65
- User story 66
- User story 67

## Summary of Changes

- wrote a small evidence helper that records structured suite results, redacts raw and encoded Clever credentials, clears stale upload trees, and re-scans prepared files before upload
- updated the reusable E2E workflow to record safe failure evidence before teardown, verify it again after cleanup, and upload only short-lived failure artifacts without passing Clever credentials to the upload step
- added focused tests for structured evidence, raw and encoded redaction, scan failures, stale or late files, upload gating, and the operations guide for evidence retrieval and manual recovery
