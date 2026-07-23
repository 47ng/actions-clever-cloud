---
# acc-8cw7
title: Commission and qualify the live suite
status: todo
type: task
priority: high
tags:
    - e2e
    - hitl
created_at: 2026-07-23T11:05:26Z
updated_at: 2026-07-23T11:05:26Z
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

- [ ] The protected environment contains the required secrets, region variable, approval rule, and no broader credential exposure.
- [ ] One approved run completes every scenario in the PRD's required order, with timeout last.
- [ ] The summary records the exact candidate SHA and digest plus successful exact-ID cleanup.
- [ ] A controlled failing run proves safe evidence upload and teardown.
- [ ] Public health output, artifacts, and fixture Git history contain no credential, unrelated environment value, or support file.
- [ ] Every mismatch found during live qualification is fixed and the full run passes again before this task completes.

## User stories addressed

- User story 1 through user story 4
- User story 12
- User story 15
- User story 17 through user story 66
