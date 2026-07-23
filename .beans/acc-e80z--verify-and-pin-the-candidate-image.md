---
# acc-e80z
title: Verify and pin the candidate image
status: completed
type: task
priority: high
tags:
    - e2e
    - afk
created_at: 2026-07-23T11:01:42Z
updated_at: 2026-07-23T13:26:50Z
parent: acc-9ddy
---

## What to build

Implement the candidate-image path described in the parent PRD's "Candidate image and action metadata" and "Preview and trust orchestration" sections. Relevant pull request changes must produce an exact SHA image that the workflow checks and pins before it builds local candidate action metadata.

## Acceptance criteria

- [x] Registry inspection distinguishes a missing image from an inspection error, extracts a valid digest, and checks revision and repository source labels.
- [x] Generated local action metadata preserves the candidate metadata while replacing its image with the verified digest.
- [x] Preview path filters include image inputs, action metadata, E2E code, and E2E workflows while excluding documentation-only changes.
- [x] Internal pull requests, vetted fork previews, and release builds use separate Buildx cache scopes, and trusted builds never restore fork caches.
- [x] Vitest covers matching, missing, malformed, wrong-revision, and wrong-source images plus metadata generation.
- [x] Static workflow checks preserve empty top-level permissions.

## User stories addressed

- User story 2
- User story 3
- User story 4
- User story 32
- User story 67
- User story 70
- User story 71
- User story 72
- User story 73

## Summary of Changes

- added a candidate image helper that validates digest, revision, and source labels and pins action metadata to a verified digest
- wired trusted PR preview verification into the workflow before writing local pinned action metadata
- expanded workflow policy coverage for preview triggers, cache scopes, and top-level permissions
