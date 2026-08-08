# 운영 릴리스 실행 런북

## 문서 역할

- 역할: `시나리오`
- 문서 종류: `flow`
- 충돌 시 우선 문서: [릴리스 프로세스](../../policy/release-process.md), [릴리스 태그 정책](../../policy/release-tag-policy.md)
- 기준 성격: `as-is`

## 목적

- 운영 릴리스의 단일 실행 진입점으로 scope별 기준·런북을 연결하고 공통 preflight와 태그·docs 마감만 수행한다.

## 범위

- 시작 조건: 릴리스 scope, 각 레포의 40자 commit SHA, 검증 시나리오, rollback 기준과 운영 권한이 확정된 상태
- 종료 조건: 포함 범위의 운영 반영·postcheck·증빙 기록과 허용된 태그 작업이 완료된 상태
- 제외 범위: 하위 런북의 실행 명령·rollback 복제, 정책 판정 재정의, 신규 migration 작성, 기능별 smoke 시나리오

## 상위 규범 문서

- [릴리스 프로세스](../../policy/release-process.md)
- [릴리스 태그 정책](../../policy/release-tag-policy.md)
- [DB Migration 유지보수 정책](../../policy/db-migration-gate-policy.md)

## 실행 범위 라우팅

릴리스 기록의 `releaseScopes`를 기준으로 포함 범위를 고정한다. 제외 범위는 해당 기록에 `N/A` 근거를 남긴다.

| `releaseScopes` | 기준·실행 진입점 |
| --- | --- |
| `db-migration` | [DB Migration 실행 런북](db-migration-operation-flow.md) |
| `contracts-package` | [릴리스 게이트 플로우](release-automation-pipeline.md)의 Cross Repo Contract Gate에서 [API 클라이언트 계약 패키지 정책](../../policy/api-client-contract-package-policy.md) 적용 |
| `coupler-api` | [API 운영 배포 런북](api-production-deploy-flow.md) |
| `coupler-admin-web` | [Admin 운영 배포 런북](admin-web-production-deploy-flow.md) |
| `mobile-nextpush`, `mobile-store` | [Mobile 운영 릴리스 런북](mobile-production-release-flow.md) |
| `docs` | 이 문서의 Docs 릴리스 마감 절 |

API 계약 변경과 `mobile-store` 또는 `mobile-nextpush`가 함께 포함되면
[API 계약 변경 모바일 릴리스 플로우](api-contract-mobile-release-flow.md)를 조건부로 적용한다.
서비스 태그는 포함 scope의 운영 반영·검증 뒤 태그 정책의 허용 판정에 따라 이 문서의 서비스 태그 절에서 만든다.

## 실행 계약

- 릴리스 기록에서 범위와 입력값을 확정하고, 각 블록이 요구하는 변수를 실행 shell에 먼저 설정한다.
- 각 코드 블록은 독립 실행 단위다. 블록 전체를 한 shell에서 실행하며, 실패하면 이후 명령을 실행하지 않는다.
- 값이 없거나 각 블록에 명시된 exact commit·`origin/main`·checkout 검사가 실패하면 중단한다.
- 운영 변경 명령은 preflight가 `PASS`한 뒤 포함 범위의 블록 하나만 실행한다. DB의 운영 전 준비와 별도
  admission 순서는 DB Migration 실행 런북을 따른다.

## 공통 사전 확인

워크스페이스 상대경로를 사용하는 각 명령 블록은 새 shell의 워크스페이스 루트에서 시작한다. 열린 docs PR의
원격 head를 기준으로 preflight를 실행한다.

```bash
set -euo pipefail
: "${VERSION:?set VERSION}"
: "${PR_NUMBER:?set PR_NUMBER}"

cd docs
WORKTREE_STATUS="$(git status --porcelain)"
test -z "${WORKTREE_STATUS}"
PENDING_REF="$(git rev-parse HEAD)"

[[ "${PENDING_REF}" =~ ^[0-9a-f]{40}$ ]]
test "$(git rev-parse @{upstream})" = "${PENDING_REF}"
test "$(gh pr view "${PR_NUMBER}" --json headRefOid --jq .headRefOid)" = "${PENDING_REF}"

yarn release:preflight \
  --version "${VERSION}" \
  --workspace-root .. \
  --pending-ref "${PENDING_REF}"
```

`PASS`가 아니면 운영 실행을 시작하지 않는다. preflight 뒤 docs PR head 또는 포함된 서비스 레포의 `origin/main`이 바뀌면
다음 운영 명령 전에 preflight를 다시 실행한다.

## 서비스 태그

운영 반영과 검증이 완료된 exact commit에만 서비스 태그를 만든다.

```bash
set -euo pipefail
: "${REPO:?set REPO}"
: "${TAG:?set TAG}"
: "${DEPLOY_COMMIT:?set DEPLOY_COMMIT}"

case "${REPO}" in
  coupler-api | coupler-admin-web | coupler-mobile-app) ;;
  *)
    printf 'invalid REPO: %s\n' "${REPO}" >&2
    exit 1
    ;;
esac
[[ "${TAG}" =~ ^v[0-9]+\.[0-9]+\.[0-9]+$ ]]
[[ "${DEPLOY_COMMIT}" =~ ^[0-9a-f]{40}$ ]]

git -C "${REPO}" fetch --no-tags origin main:refs/remotes/origin/main
git -C "${REPO}" fetch --tags origin
git -C "${REPO}" rev-parse --verify "${DEPLOY_COMMIT}^{commit}"
test "$(git -C "${REPO}" rev-parse origin/main)" = "${DEPLOY_COMMIT}"

git -C "${REPO}" tag -a "${TAG}" "${DEPLOY_COMMIT}" -m "Release ${TAG}"
test "$(git -C "${REPO}" rev-list -n 1 "${TAG}")" = "${DEPLOY_COMMIT}"

git -C "${REPO}" push origin "${TAG}"
REMOTE_COMMIT="$(git -C "${REPO}" ls-remote --tags origin "refs/tags/${TAG}^{}" | cut -f1)"
test "${REMOTE_COMMIT}" = "${DEPLOY_COMMIT}"
```

레포별 태그 생성 가능 시점은 [릴리스 태그 정책](../../policy/release-tag-policy.md), 이후 기록 순서는
[릴리스 게이트 플로우](release-automation-pipeline.md)을 따른다.

## Docs 릴리스 마감

Final Record Gate에서 릴리스 기록 PR을 병합한 뒤 exact docs merge commit을 태깅한다.

```bash
set -euo pipefail
: "${TAG:?set TAG}"
: "${DOCS_COMMIT:?set DOCS_COMMIT}"
[[ "${TAG}" =~ ^v[0-9]+\.[0-9]+\.[0-9]+$ ]]
[[ "${DOCS_COMMIT}" =~ ^[0-9a-f]{40}$ ]]

cd docs

WORKTREE_STATUS="$(git status --porcelain)"
test -z "${WORKTREE_STATUS}"
git fetch --no-tags origin main:refs/remotes/origin/main
git fetch --tags origin
git rev-parse --verify "${DOCS_COMMIT}^{commit}"
test "$(git rev-parse origin/main)" = "${DOCS_COMMIT}"
LOCAL_TAG="$(git tag --list "${TAG}")"
test -z "${LOCAL_TAG}"

git checkout main
git merge --ff-only "${DOCS_COMMIT}"
test "$(git rev-parse HEAD)" = "${DOCS_COMMIT}"

PREVIEW_PATH="$(mktemp "${TMPDIR:-/tmp}/release-notes-${TAG}.XXXXXX")"
GITHUB_REPOSITORY=coupler-developer/docs \
  bash .github/scripts/generate-release-notes.sh "${TAG}" "${DOCS_COMMIT}" \
  > "${PREVIEW_PATH}"

test "$(git rev-parse HEAD)" = "${DOCS_COMMIT}"
printf 'review release note: %s\n' "${PREVIEW_PATH}"
```

출력된 preview와 `DOCS_COMMIT`을 read-only 독립 리뷰하고 열린 Finding이 0건이면
`열린 Finding 0건·검증 대기`를 기록한다. 그 체크포인트와 파일이 바뀌지 않았을 때만 다음 블록에서
`yarn verify`를 실행하고 annotated tag를 한 번 생성해 push한다.

```bash
set -euo pipefail
: "${TAG:?set TAG}"
: "${DOCS_COMMIT:?set DOCS_COMMIT}"
[[ "${TAG}" =~ ^v[0-9]+\.[0-9]+\.[0-9]+$ ]]
[[ "${DOCS_COMMIT}" =~ ^[0-9a-f]{40}$ ]]

cd docs
WORKTREE_STATUS="$(git status --porcelain)"
test -z "${WORKTREE_STATUS}"
git fetch --no-tags origin main:refs/remotes/origin/main
git fetch --tags origin
test "$(git rev-parse --verify "${DOCS_COMMIT}^{commit}")" = "${DOCS_COMMIT}"
test "$(git rev-parse origin/main)" = "${DOCS_COMMIT}"
test "$(git rev-parse HEAD)" = "${DOCS_COMMIT}"

yarn verify
test "$(git rev-parse HEAD)" = "${DOCS_COMMIT}"

git tag -a "${TAG}" "${DOCS_COMMIT}" -m "Release ${TAG}"
test "$(git rev-list -n 1 "${TAG}")" = "${DOCS_COMMIT}"
git push origin "refs/tags/${TAG}"
REMOTE_COMMIT="$(git ls-remote --tags origin "refs/tags/${TAG}^{}" | cut -f1)"
test "${REMOTE_COMMIT}" = "${DOCS_COMMIT}"
```

tag push 뒤 새 shell에서 exact commit의 `Release Docs`, GitHub Release, site artifact와 Pages 배포를
아래 한 블록으로 postcheck한다. workflow가 아직 조회되지 않으면 운영 변경을 반복하지 않고 이 블록만 다시
실행한다.

```bash
set -euo pipefail
: "${TAG:?set TAG}"
: "${DOCS_COMMIT:?set DOCS_COMMIT}"
[[ "${TAG}" =~ ^v[0-9]+\.[0-9]+\.[0-9]+$ ]]
[[ "${DOCS_COMMIT}" =~ ^[0-9a-f]{40}$ ]]

REPO=coupler-developer/docs
ASSET_NAME="docs-site-${TAG}.tar.gz"
RELEASE_RUN_ID="$(gh run list --repo "${REPO}" --workflow release.yml --event push \
  --branch "${TAG}" --commit "${DOCS_COMMIT}" --limit 1 --json databaseId --jq '.[0].databaseId // empty')"
PAGES_RUN_ID="$(gh run list --repo "${REPO}" --workflow deploy-docs.yml --event push \
  --branch main --commit "${DOCS_COMMIT}" --limit 1 --json databaseId --jq '.[0].databaseId // empty')"
test -n "${RELEASE_RUN_ID}"
test -n "${PAGES_RUN_ID}"

gh run watch "${RELEASE_RUN_ID}" --repo "${REPO}" --compact --exit-status
gh run watch "${PAGES_RUN_ID}" --repo "${REPO}" --compact --exit-status

test "$(gh release view "${TAG}" --repo "${REPO}" --json tagName --jq .tagName)" = "${TAG}"
test "$(gh release view "${TAG}" --repo "${REPO}" --json assets \
  --jq '.assets[] | select(.name == "'"${ASSET_NAME}"'") | .name')" = "${ASSET_NAME}"

POSTCHECK_DIR="$(mktemp -d "${TMPDIR:-/tmp}/docs-release-${TAG}.XXXXXX")"
gh release download "${TAG}" --repo "${REPO}" --dir "${POSTCHECK_DIR}" --pattern "${ASSET_NAME}"
test -s "${POSTCHECK_DIR}/${ASSET_NAME}"
tar -tzf "${POSTCHECK_DIR}/${ASSET_NAME}" >/dev/null

PAGES_URL="$(gh api "repos/${REPO}/pages" --jq .html_url)"
test "${PAGES_URL%/}" = "https://coupler-developer.github.io/docs"
curl --fail-with-body --show-error -I "${PAGES_URL}"

printf 'RELEASE_RUN=%s\nPAGES_RUN=%s\nRELEASE_URL=%s\nPAGES_URL=%s\nASSET=%s\n' \
  "$(gh run view "${RELEASE_RUN_ID}" --repo "${REPO}" --json url --jq .url)" \
  "$(gh run view "${PAGES_RUN_ID}" --repo "${REPO}" --json url --jq .url)" \
  "$(gh release view "${TAG}" --repo "${REPO}" --json url --jq .url)" \
  "${PAGES_URL}" "${POSTCHECK_DIR}/${ASSET_NAME}"
```

## 검증 기록

각 절의 실제 commit, 명령 결과, 외부 응답, workflow와 rollback 기준을
[릴리스 프로세스](../../policy/release-process.md)의 scope별 evidence에 기록한다. 포함 범위의 postcheck가
하나라도 실패하면 완료나 태그 가능 상태로 판정하지 않는다.

## 예외 흐름

- 변경 명령 도중 중단되면 블록 전체를 다시 실행하지 않는다. 먼저 해당 scope의 status, history, remote ref와
  외부 응답으로 실제 반영 지점을 확인한 뒤 postcheck 재개 또는 승인된 rollback/reconciliation을 선택한다.
- DB 실행 중단·실패는 같은 SQL이나 저수준 단계를 재실행하지 않고
  [DB Migration 실행 런북](db-migration-operation-flow.md)의 예외 흐름을 따른다.
- API 배포 실패와 rollback은 [API 운영 배포 런북](api-production-deploy-flow.md)의 예외 흐름을 따른다.
- Admin rollback은 [Admin 운영 배포 런북](admin-web-production-deploy-flow.md)의 롤백 흐름을 따른다.
- Mobile Store 출시 또는 NextPush 배포 실패와 rollback은
  [Mobile 운영 릴리스 런북](mobile-production-release-flow.md)의 예외 흐름을
  따른다.
- tag 생성 뒤 push 또는 postcheck가 중단되면 local tag를 삭제·이동하지 않는다. exact local/remote ref를 확인한
  뒤 누락된 push 또는 postcheck만 재개한다.
- 이미 push한 릴리스 태그와 병합된 릴리스 기록은 이동·재작성하지 않는다. 실패나 사실 오류는 이슈·장애 기록에서
  추적한다.
