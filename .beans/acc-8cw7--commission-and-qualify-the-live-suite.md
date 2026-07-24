---
# acc-8cw7
title: Commission and qualify the live suite
status: completed
type: task
priority: high
tags:
    - e2e
    - hitl
created_at: 2026-07-23T11:05:26Z
updated_at: 2026-07-24T06:35:04Z
parent: acc-9ddy
blocked_by:
    - acc-rtwf
    - acc-djfk
    - acc-5m70
    - acc-yr2t
    - acc-5kqx
    - acc-v1j1
    - acc-u3kz
---

## What to build

Commission the protected environment and qualify the complete implementation against Clever Cloud. This is the human-approved acceptance slice for the parent PRD's full "Ordered scenario flow", security rules, evidence handling, and cleanup contract.

## Acceptance criteria

- [x] The protected environment contains the required secrets, region variable, approval rule, and no broader credential exposure.
- [x] One approved run completes every scenario in the PRD's required order, with timeout last.
- [x] The summary records the exact candidate SHA and digest plus successful exact-ID cleanup.
- [x] A controlled failing run proves safe evidence upload and teardown.
- [x] Public health output, artifacts, and fixture Git history contain no credential, unrelated environment value, or support file.
- [x] Every mismatch found during live qualification is fixed and the full run passes again before this task completes.

## User stories addressed

- User story 1 through user story 4
- User story 12
- User story 15
- User story 17 through user story 66

## Summary of Changes

Environment `clever-cloud-e2e` commissioned: reviewer franky47, `CLEVER_TOKEN`/`CLEVER_SECRET` secrets, `CLEVER_E2E_REGION=par`, no credential exposure outside the gated job. Clever deploy emails silenced through a scoped notify-email hook.

Eight qualification runs against the live platform. Failing runs proved evidence upload (credential-free artifacts) and exact-ID teardown; runs six and seven exposed the last defect. Fixes merged during qualification:

- #259, #260, #261, #263, #264: deploy URL resolution, teardown reliability, observer timeout budget, rejection wording, evidence handling.
- #265: state-agnostic resolution of timed-out deployments in the observer.
- #266: client-side cancellation accepts any settled state instead of insisting on CANCELLED, and the observer logs swallowed cancellation errors.
- #267: Clever removes the DEPLOY activity row of a deployment cancelled mid-build and replaces it with a CANCEL entry under a new uuid; both settle waits now classify that shape as cancelled instead of polling for the vanished row until deadline.

Qualifying run: https://github.com/47ng/actions-clever-cloud/actions/runs/30108430034 at baseline head f55e50a. All twelve scenarios green in PRD order, timeout last (`Timed-out deployment settled as cancelled`), summary records candidate SHA and digest, teardown deleted the exact app ID.
