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
RELEASE_RECORD_PATH="content/releases/${CURRENT_TAG}.md"
RELEASE_RECORD_LINK=""

if [[ -f "${RELEASE_RECORD_PATH}" ]]; then
  if [[ -n "${REPO_SLUG}" ]]; then
    RELEASE_RECORD_LINK="[${RELEASE_RECORD_PATH}](https://github.com/${REPO_SLUG}/blob/${CURRENT_TAG}/${RELEASE_RECORD_PATH})"
  else
    RELEASE_RECORD_LINK="${RELEASE_RECORD_PATH}"
  fi
fi

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

extract_markdown_section() {
  local file_path="$1"
  local section_title="$2"

  awk -v section_title="${section_title}" '
    $0 == "## " section_title {
      in_section=1
      next
    }
    in_section && /^## / {
      exit
    }
    in_section {
      print
    }
  ' "${file_path}"
}

print_release_record_items() {
  local section_title="$1"
  local max_items="$2"
  local empty_message="$3"
  local item_type="$4"
  local raw_section=""
  local count=0

  if [[ ! -f "${RELEASE_RECORD_PATH}" ]]; then
    printf -- '- %s\n' "${empty_message}"
    return
  fi

  raw_section="$(extract_markdown_section "${RELEASE_RECORD_PATH}" "${section_title}" | sed '/^[[:space:]]*$/d')"
  if [[ -z "${raw_section}" ]]; then
    printf -- '- %s\n' "${empty_message}"
    return
  fi

  while IFS= read -r line; do
    [[ -z "${line}" ]] && continue

    case "${item_type}" in
      bullet)
        [[ "${line}" =~ ^-  ]] || continue
        ;;
      numbered)
        [[ "${line}" =~ ^[0-9]+\.  ]] || continue
        ;;
      *)
        echo "Unknown item type: ${item_type}" >&2
        exit 1
        ;;
    esac

    printf '%s\n' "${line}"
    count=$((count + 1))
    if [[ "${count}" -ge "${max_items}" ]]; then
      break
    fi
  done <<< "${raw_section}"

  if [[ "${count}" -eq 0 ]]; then
    printf -- '- %s\n' "${empty_message}"
  fi
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

if [[ -n "${RELEASE_RECORD_LINK}" ]]; then
  printf '## 통합 버전 기록\n'
  printf -- '- %s\n\n' "${RELEASE_RECORD_LINK}"

  printf '## 릴리스 개요\n'
  print_release_record_items "목적" 3 "릴리스 목적 문서화 필요" bullet
  print_release_record_items "릴리스 상태" 4 "릴리스 상태 문서화 필요" bullet
  printf '\n'

  printf '## 핵심 실행 순서\n'
  print_release_record_items "메인 흐름" 8 "핵심 실행 순서 문서화 필요" numbered
  printf '\n'
fi

if [[ -z "${PREV_TAG}" ]]; then
  printf '## 참고\n'
  printf -- '- 첫 릴리스라 이전 태그 기준점이 없어 전체 문서 히스토리가 비교 범위에 포함됩니다.\n'
  printf -- '- 실제 운영 배포 순서와 판정은 통합 버전 기록 문서를 우선 확인합니다.\n\n'
fi

printf '## 사용자에게 보이는 변경\n'
print_changes user_changes "사용자에게 직접 보이는 변경은 크지 않고, 안정성/품질 개선 중심 업데이트입니다."
printf '\n'

printf '## 내부 개선\n'
print_changes internal_changes "내부 빌드/운영 변경 없음"
