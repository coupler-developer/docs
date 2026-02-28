#!/usr/bin/env bash
set -euo pipefail

WORKSPACE_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
REPOS=("coupler-api" "coupler-mobile-app" "coupler-admin-web")
TEST_PATH_REGEX='(^|/)(__tests__/|__snapshots__/)|\.(test|spec)\.(ts|tsx|js|jsx)$'

collect_test_files() {
  local repo
  for repo in "${REPOS[@]}"; do
    if [[ -d "$WORKSPACE_ROOT/$repo" ]]; then
      (
        cd "$WORKSPACE_ROOT/$repo"
        rg --files | rg -N "$TEST_PATH_REGEX" || true
      ) | sed "s#^#$repo/#"
    fi
  done
}

unlock_file() {
  local path="$1"
  if command -v chflags >/dev/null 2>&1; then
    chflags nouchg "$path" || true
  fi
  chmod u+w "$path" || true
}

TEST_FILES=()
while IFS= read -r line; do
  [[ -n "$line" ]] || continue
  TEST_FILES+=("$line")
done < <(collect_test_files)

if [[ "${#TEST_FILES[@]}" -eq 0 ]]; then
  echo "[unlock-test-files] no test files found"
  exit 0
fi

unlocked_count=0
for relative_path in "${TEST_FILES[@]}"; do
  absolute_path="$WORKSPACE_ROOT/$relative_path"
  if [[ -f "$absolute_path" ]]; then
    unlock_file "$absolute_path"
    unlocked_count=$((unlocked_count + 1))
  fi
done

echo "[unlock-test-files] unlocked $unlocked_count files"
