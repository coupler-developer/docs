#!/usr/bin/env bash
set -euo pipefail

CURRENT_TAG="${1:-}"

if [[ -z "${CURRENT_TAG}" ]]; then
  echo "Usage: $0 <tag>" >&2
  exit 1
fi

if ! git rev-parse -q --verify "refs/tags/${CURRENT_TAG}" >/dev/null; then
  echo "Tag not found: ${CURRENT_TAG}" >&2
  exit 1
fi

REPO_SLUG="${GITHUB_REPOSITORY:-}"

PREV_TAG=""
if git rev-parse -q --verify "${CURRENT_TAG}^" >/dev/null; then
  PREV_TAG="$(git describe --tags --abbrev=0 --match 'v[0-9]*.[0-9]*.[0-9]*' "${CURRENT_TAG}^" 2>/dev/null || true)"
fi

if [[ -n "${PREV_TAG}" ]]; then
  RANGE="${PREV_TAG}..${CURRENT_TAG}"
  BASE_TEXT="이 릴리스는 \`${PREV_TAG}\` 대비 사용자 관점 변경사항을 정리했습니다."
  if [[ -n "${REPO_SLUG}" ]]; then
    COMPARE_URL="https://github.com/${REPO_SLUG}/compare/${PREV_TAG}...${CURRENT_TAG}"
  else
    COMPARE_URL="(GITHUB_REPOSITORY 미설정: compare URL 생략)"
  fi
else
  ROOT_COMMIT="$(git rev-list --max-parents=0 "${CURRENT_TAG}" | tail -n1)"
  RANGE="${CURRENT_TAG}"
  BASE_TEXT="첫 릴리스라 이전 태그가 없어, 초기 기준 대비 변경사항을 정리했습니다."
  if [[ -n "${REPO_SLUG}" ]]; then
    COMPARE_URL="https://github.com/${REPO_SLUG}/compare/${ROOT_COMMIT}...${CURRENT_TAG}"
  else
    COMPARE_URL="(GITHUB_REPOSITORY 미설정: compare URL 생략)"
  fi
fi

clean_subject() {
  echo "$1" | sed -E 's/^[a-zA-Z]+(\([^)]+\))?!?:[[:space:]]*//'
}

is_internal_noise() {
  local lower_text="$1"
  case "${lower_text}" in
    *lint*|*format*|*포맷*|*spacing*|*typo*|*permission*|*checkout\ 액션*)
      return 0
      ;;
    *)
      return 1
      ;;
  esac
}

print_changes() {
  local array_name="$1"
  local empty_message="$2"
  local max_items=20
  local -a items_ref=()

  case "${array_name}" in
    user_changes)
      ;;
    internal_changes)
      ;;
    *)
      echo "Unknown array name: ${array_name}" >&2
      exit 1
      ;;
  esac

  # bash 3 + set -u 환경에서 빈 배열도 안전하게 복사
  eval "items_ref=(\"\${${array_name}[@]-}\")"

  if [[ ${#items_ref[@]} -eq 0 ]]; then
    printf -- '- %s\n' "${empty_message}"
    return
  fi

  local index=0
  for item in "${items_ref[@]}"; do
    printf '%s\n' "${item}"
    index=$((index + 1))
    if [[ ${index} -ge ${max_items} ]]; then
      break
    fi
  done

  if [[ ${#items_ref[@]} -gt ${max_items} ]]; then
    printf -- '- 그 외 %d건은 Compare 링크에서 전체 내역 확인\n' "$(( ${#items_ref[@]} - max_items ))"
  fi
}

user_changes=()
internal_changes=()

while IFS= read -r subject; do
  [[ -z "${subject}" ]] && continue

  cleaned="$(clean_subject "${subject}")"
  lower_subject="$(echo "${subject}" | tr '[:upper:]' '[:lower:]')"

  if is_internal_noise "${lower_subject}"; then
    internal_changes+=("- ${cleaned}")
  elif [[ "${lower_subject}" == docs:* || "${lower_subject}" == docs\(* || "${lower_subject}" == feat:* || "${lower_subject}" == feat\(* || "${lower_subject}" == fix:* || "${lower_subject}" == fix\(* || "${lower_subject}" == perf:* || "${lower_subject}" == perf\(* || "${lower_subject}" == refactor:* || "${lower_subject}" == refactor\(* ]]; then
    user_changes+=("- ${cleaned}")
  else
    internal_changes+=("- ${cleaned}")
  fi
done < <(git log "${RANGE}" --no-merges --pretty=format:'%s')

printf '## Summary\n'
printf '%s\n\n' "${BASE_TEXT}"
printf -- '- Release Date: %s\n' "$(date -u '+%Y-%m-%d %H:%M UTC')"
printf -- '- Compare: %s\n\n' "${COMPARE_URL}"
printf -- '- 사용자에게 보이는 변경: %d건\n' "${#user_changes[@]}"
printf -- '- 내부 개선: %d건\n\n' "${#internal_changes[@]}"

printf '## 사용자에게 보이는 변경\n'
print_changes user_changes "사용자에게 직접 보이는 변경은 크지 않고, 안정성/품질 개선 중심 업데이트입니다."
printf '\n'

printf '## 내부 개선\n'
print_changes internal_changes "내부 빌드/운영 변경 없음"
