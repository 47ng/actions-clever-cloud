#!/usr/bin/env bash
set -euo pipefail
export LC_ALL=C

# Usage: promote-image.sh <source-image@digest> <dest-tag>...
# Destinations are immutable: absent tags are created from the source digest,
# matching tags are skipped, and any other state aborts the promotion.
source="$1"
shift
digest="${source##*@}"

promote() {
  local dest="$1"
  local output existing inspect_exit_code
  set +e
  output=$(skopeo inspect --format '{{.Digest}}' "docker://${dest}" 2>&1)
  inspect_exit_code=$?
  set -e
  if [ $inspect_exit_code -eq 0 ]; then
    existing=$(echo "$output" | tr -d '[:space:]')
    if [ "$existing" = "$digest" ]; then
      echo "$dest already points at $digest, skipping"
      return 0
    fi
    echo "::error::$dest exists with digest $existing, refusing to overwrite an immutable tag with $digest"
    return 1
  elif echo "$output" | grep -qiE 'not found|manifest unknown|name unknown'; then
    skopeo copy --all --preserve-digests "docker://${source}" "docker://${dest}"
  else
    echo "::error::Failed to inspect $dest: $output"
    return 1
  fi
}

for dest in "$@"; do
  promote "$dest"
done
