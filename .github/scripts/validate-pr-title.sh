#!/usr/bin/env bash
set -euo pipefail

regex='^(build|chore|ci|doc|docs|feat|fix|perf|ref|refactor|revert|style|test)(\([a-z0-9][a-z0-9._/-]*\))?!?: [^[:space:]].*$'

if [[ "${PR_TITLE:-}" =~ $regex ]]; then
  echo "✅ Pull request title follows conventional commits"
else
  echo "::error::Pull request title must match 'type(scope)!: description' with type in build|chore|ci|doc|docs|feat|fix|perf|ref|refactor|revert|style|test, an optional lowercase scope, an optional breaking marker (!), and a non-empty description."
  exit 1
fi
