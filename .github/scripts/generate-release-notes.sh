#!/usr/bin/env bash
set -euo pipefail

CURRENT_TAG="${1:-}"
TARGET_REF="${2:-}"

if [[ -z "${CURRENT_TAG}" || "$#" -gt 2 ]]; then
  echo "Usage: $0 <tag> [target-ref]" >&2
  exit 1
fi

if [[ -z "${TARGET_REF}" ]]; then
  TARGET_REF="refs/tags/${CURRENT_TAG}"
  if ! git rev-parse -q --verify "${TARGET_REF}^{commit}" >/dev/null; then
    echo "Tag not found: ${CURRENT_TAG}" >&2
    exit 1
  fi
elif ! git rev-parse -q --verify "${TARGET_REF}^{commit}" >/dev/null; then
  echo "Target ref not found: ${TARGET_REF}" >&2
  exit 1
fi
TARGET_COMMIT="$(git rev-parse "${TARGET_REF}^{commit}")"

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
if git rev-parse -q --verify "${TARGET_COMMIT}^" >/dev/null; then
  PREV_TAG="$(git describe --tags --abbrev=0 --match 'v[0-9]*.[0-9]*.[0-9]*' "${TARGET_COMMIT}^" 2>/dev/null || true)"
fi

if [[ -n "${PREV_TAG}" ]]; then
  RANGE="${PREV_TAG}..${TARGET_COMMIT}"
  BASE_TEXT="이 릴리스는 \`${PREV_TAG}\` 대비 사용자 관점 변경사항을 정리했습니다."
  if [[ -n "${REPO_SLUG}" ]]; then
    COMPARE_URL="https://github.com/${REPO_SLUG}/compare/${PREV_TAG}...${CURRENT_TAG}"
  else
    COMPARE_URL="(GITHUB_REPOSITORY 미설정: compare URL 생략)"
  fi
else
  ROOT_COMMIT="$(git rev-list --max-parents=0 "${TARGET_COMMIT}" | tail -n1)"
  RANGE="${TARGET_COMMIT}"
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

strip_empty_mobile_qa_section() {
  awk '
    function reset_qa() {
      qa_buffer = ""
      qa_placeholders = 0
      qa_has_evidence = 0
    }

    function flush_qa() {
      if (qa_placeholders != 5 || qa_has_evidence) {
        printf "%s", qa_buffer
      }
      reset_qa()
    }

    $0 == "### Mobile 개발계 QA 빌드 기록" {
      in_qa = 1
      reset_qa()
      qa_buffer = $0 ORS
      next
    }

    in_qa && /^### / {
      flush_qa()
      in_qa = 0
    }

    in_qa {
      qa_buffer = qa_buffer $0 ORS
      if ($0 ~ /^- (기록일|API 대상|iOS TestFlight QA 빌드|Android QA APK|운영 릴리스 전 확인):[[:space:]]*$/) {
        qa_placeholders += 1
      } else if ($0 != "개발계 QA 빌드가 있을 때만 기록한다. 운영 Store·NextPush·서비스 태그 증빙으로 사용하지 않는다.") {
        qa_has_evidence = 1
      }
      next
    }

    { print }

    END {
      if (in_qa) {
        flush_qa()
      }
    }
  '
}

rewrite_repository_relative_links() {
  if [[ -z "${REPO_SLUG}" ]]; then
    cat
    return
  fi

  sed -E \
    -e "s#\\]\\(\\.\\./\\.\\./#](https://github.com/${REPO_SLUG}/blob/${CURRENT_TAG}/#g" \
    -e "s#\\]\\(\\.\\./#](https://github.com/${REPO_SLUG}/blob/${CURRENT_TAG}/content/#g" \
    -e "s#\\]\\(\\./#](https://github.com/${REPO_SLUG}/blob/${CURRENT_TAG}/content/releases/#g"
}

render_release_record_markdown() {
  strip_empty_mobile_qa_section | rewrite_repository_relative_links
}

print_release_record_items() {
  local section_title="$1"
  local max_items="$2"
  local empty_message="$3"
  local item_type="$4"
  local raw_section=""
  local rendered_items=""

  if [[ ! -f "${RELEASE_RECORD_PATH}" ]]; then
    printf -- '- %s\n' "${empty_message}"
    return
  fi

  raw_section="$(
    extract_markdown_section "${RELEASE_RECORD_PATH}" "${section_title}" \
      | sed '/^[[:space:]]*$/d' \
      | render_release_record_markdown
  )"
  if [[ -z "${raw_section}" ]]; then
    echo "Release record section is missing or empty: ${section_title}" >&2
    exit 1
  fi

  case "${item_type}" in
    bullet | numbered)
      ;;
    *)
      echo "Unknown item type: ${item_type}" >&2
      exit 1
      ;;
  esac

  rendered_items="$(awk -v item_type="${item_type}" -v max_items="${max_items}" '
    function is_item_start(line) {
      if (item_type == "bullet") {
        return line ~ /^- /
      }
      return line ~ /^[0-9]+\.[[:space:]]+/
    }

    is_item_start($0) {
      if (count >= max_items) {
        exit
      }
      count += 1
      collecting = 1
      print
      next
    }

    collecting && /^[[:space:]]+/ {
      print
      next
    }

    {
      collecting = 0
    }
  ' <<< "${raw_section}")"

  if [[ -z "${rendered_items}" ]]; then
    echo "Release record section has no ${item_type} items: ${section_title}" >&2
    exit 1
  fi

  printf '%s\n' "${rendered_items}"
}

print_release_record_section() {
  local section_title="$1"
  local output_title="$2"
  local empty_message="$3"
  local required="${4:-required}"

  if [[ ! -f "${RELEASE_RECORD_PATH}" ]]; then
    return
  fi

  local raw_section=""
  raw_section="$(
    extract_markdown_section "${RELEASE_RECORD_PATH}" "${section_title}" \
      | sed '/^[[:space:]]*$/d' \
      | render_release_record_markdown
  )"

  if [[ -z "${raw_section}" ]]; then
    if [[ "${required}" == "required" ]]; then
      echo "Release record section is missing or empty: ${section_title}" >&2
      exit 1
    fi
    return
  fi

  printf '## %s\n' "${output_title}"
  printf '%s\n\n' "${raw_section}"
}

print_docs_change_history() {
  printf '## 문서 레포 변경 이력\n'
  printf -- '- 전체 docs 변경 이력은 Compare 링크에서 확인한다: %s\n' "${COMPARE_URL}"
  printf -- '- 릴리스 판단 기준은 위 통합 버전 기록과 검증 근거를 우선한다.\n'
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

while IFS= read -r subject || [[ -n "${subject}" ]]; do
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

if [[ -n "${RELEASE_RECORD_LINK}" ]]; then
  printf '## Summary\n'
  printf '이 릴리스는 통합 버전 기록을 기준으로 정리했습니다.\n\n'
  printf -- '- Release Date: %s\n' "$(date -u '+%Y-%m-%d %H:%M UTC')"
  printf -- '- Compare: %s\n\n' "${COMPARE_URL}"

  printf '## 통합 버전 기록\n'
  printf -- '- %s\n\n' "${RELEASE_RECORD_LINK}"
  printf -- '- docs tag commit: `%s`\n\n' "${TARGET_COMMIT}"

  print_release_record_section "버전 매핑" "버전 매핑" "버전 매핑 문서화 필요" optional

  printf '## 릴리스 개요\n'
  print_release_record_items "목적" 3 "릴리스 목적 문서화 필요" bullet
  print_release_record_items "릴리스 상태" 12 "릴리스 상태 문서화 필요" bullet
  printf '\n'

  print_release_record_section "릴리스 결과" "릴리스 결과" "릴리스 결과 문서화 필요"

  printf '## 핵심 실행 순서\n'
  print_release_record_items "메인 흐름" 8 "핵심 실행 순서 문서화 필요" numbered
  printf '\n'

  print_release_record_section "검증 근거" "검증 근거" "검증 근거 문서화 필요"
  print_release_record_section "롤백 기준" "롤백 기준" "롤백 기준 문서화 필요"
  print_release_record_section "후속 작업" "후속 작업" "후속 작업 없음" optional
  print_docs_change_history
  exit 0
fi

printf '## Summary\n'
printf '%s\n\n' "${BASE_TEXT}"
printf -- '- Release Date: %s\n' "$(date -u '+%Y-%m-%d %H:%M UTC')"
printf -- '- Compare: %s\n\n' "${COMPARE_URL}"
printf -- '- 사용자에게 보이는 변경: %d건\n' "${#user_changes[@]}"
printf -- '- 내부 개선: %d건\n\n' "${#internal_changes[@]}"

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
