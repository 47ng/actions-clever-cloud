#!/usr/bin/env bash
set -euo pipefail
export LC_ALL=C

script_dir=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)
config_file="$script_dir/../../release-please-config.json"

if ! command -v jq >/dev/null 2>&1; then
  echo "::error::jq is required to read conventional commit types from release-please-config.json."
  exit 2
fi

if ! types_regex=$(jq -er '
  ."changelog-sections" as $sections
  | if ($sections | type) != "array" or ($sections | length) == 0 then
      error("changelog-sections must be a non-empty array")
    elif all(
      $sections[];
      (.type | type) == "string" and (.type | test("^[a-z][a-z0-9-]*$"))
    ) then
      $sections | map(.type) | unique | join("|")
    else
      error("each changelog section type must match ^[a-z][a-z0-9-]*$")
    end
' "$config_file"); then
  echo "::error::Could not read conventional commit types from $config_file."
  exit 2
fi

if [[ -z "${PR_TITLE+x}" ]]; then
  echo "::error::PR_TITLE is not set; check the workflow env wiring."
  exit 2
fi

if [[ "$PR_TITLE" == *$'\n'* || "$PR_TITLE" == *$'\r'* ]]; then
  echo "::error::Pull request title must be a single line."
  exit 1
fi

regex="^(${types_regex})(\\([a-z0-9][a-z0-9._/-]*\\))?!?: [^[:space:]].*$"

if [[ "$PR_TITLE" =~ $regex ]]; then
  echo "✅ Pull request title follows conventional commits"
else
  echo "::error::Invalid pull request title: '${PR_TITLE}'. Expected 'type(scope)!: description' with type in ${types_regex}, an optional lowercase scope, an optional breaking marker (!), and a non-empty description."
  exit 1
fi
