#!/usr/bin/env bash
set -euo pipefail
export LC_ALL=C

# Usage: RELEASE_VERSION=x.y.z move-latest.sh <source-image@digest> <dest-latest-tag>...
# Moves every destination to the source digest, unless any destination already
# carries a newer version label, in which case nothing moves.
source="$1"
shift

: "${RELEASE_VERSION:?RELEASE_VERSION must be set}"

semver_regex='^[0-9]+\.[0-9]+\.[0-9]+(-[0-9A-Za-z.-]+)?(\+[0-9A-Za-z.-]+)?$'

inspect_latest() {
  local dest="$1"
  local output inspect_exit_code
  set +e
  output=$(skopeo inspect --format '{{index .Labels "org.opencontainers.image.version"}}' "docker://${dest}" 2>&1)
  inspect_exit_code=$?
  set -e
  if [ $inspect_exit_code -eq 0 ]; then
    CURRENT=$(echo "$output" | tr -d '[:space:]')
    if [ -z "$CURRENT" ]; then
      echo "$dest exists but has no version label, treating as older"
    fi
  elif echo "$output" | grep -qiE 'not found|manifest unknown|name unknown'; then
    CURRENT=""
  elif echo "$output" | grep -q 'untyped nil'; then
    echo "$dest exists but has no labels, treating as older"
    CURRENT=""
  else
    echo "::error::Failed to inspect $dest: $output"
    return 1
  fi
}

move=true
for dest in "$@"; do
  inspect_latest "$dest"
  if [ -n "$CURRENT" ]; then
    if ! echo "$CURRENT" | grep -qE "$semver_regex"; then
      echo "::error::$dest has a non-semver version label '${CURRENT}', refusing to compare"
      exit 1
    fi
    newest=$(printf '%s\n%s\n' "$CURRENT" "$RELEASE_VERSION" | sort -V | tail -n1)
    if [ "$newest" != "$RELEASE_VERSION" ]; then
      echo "Existing $dest (${CURRENT}) is newer than ${RELEASE_VERSION}, not moving latest"
      move=false
    fi
  fi
done

if [ "$move" = "true" ]; then
  for dest in "$@"; do
    skopeo copy --all --preserve-digests "docker://${source}" "docker://${dest}"
  done
  echo "Moved latest tags to ${RELEASE_VERSION}"
fi
