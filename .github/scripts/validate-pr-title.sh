#!/usr/bin/env bash
set -euo pipefail
export LC_ALL=C

if [[ -z "${PR_TITLE+x}" ]]; then
  echo "::error::PR_TITLE is not set; check the workflow env wiring."
  exit 2
fi

if [[ "$PR_TITLE" == *$'\n'* ]]; then
  echo "::error::Pull request title must be a single line."
  exit 1
fi

regex='^(build|chore|ci|doc|docs|feat|fix|perf|ref|refactor|revert|style|test)(\([a-z0-9][a-z0-9._/-]*\))?!?: [^[:space:]].*$'

if [[ "$PR_TITLE" =~ $regex ]]; then
  echo "✅ Pull request title follows conventional commits"
else
  echo "::error::Invalid pull request title: '${PR_TITLE}'. Expected 'type(scope)!: description' with type in build|chore|ci|doc|docs|feat|fix|perf|ref|refactor|revert|style|test, an optional lowercase scope, an optional breaking marker (!), and a non-empty description."
  exit 1
fi
