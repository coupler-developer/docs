#!/usr/bin/env bash
set -euo pipefail

WORKSPACE_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
REPOS=("coupler-api" "coupler-mobile-app" "coupler-admin-web")
TEST_PATH_REGEX='(^|/)(__tests__/|__snapshots__/)|\.(test|spec)\.(ts|tsx|js|jsx)$'

find_changed_files() {
  local repo_dir="$1"
  {
    git -C "$repo_dir" diff --name-only
    git -C "$repo_dir" diff --cached --name-only
    git -C "$repo_dir" ls-files --others --exclude-standard
  } | sed '/^$/d' | sort -u
}

found_changes=0
for repo in "${REPOS[@]}"; do
  repo_dir="$WORKSPACE_ROOT/$repo"
  if [[ ! -d "$repo_dir/.git" ]]; then
    continue
  fi

  changed_test_files=()
  while IFS= read -r line; do
    [[ -n "$line" ]] || continue
    changed_test_files+=("$line")
  done < <(find_changed_files "$repo_dir" | rg -N "$TEST_PATH_REGEX" || true)

  if [[ "${#changed_test_files[@]}" -gt 0 ]]; then
    found_changes=1
    echo "[check-test-changes] $repo"
    printf '  %s\n' "${changed_test_files[@]}"
  fi
done

if [[ "$found_changes" -eq 0 ]]; then
  echo "[check-test-changes] no changed test files"
  exit 0
fi

exit 2
