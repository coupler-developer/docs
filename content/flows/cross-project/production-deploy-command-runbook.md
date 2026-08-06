# 운영 배포 명령어 런북

## 문서 역할

- 역할: `시나리오`
- 문서 종류: `flow`
- 충돌 시 우선 문서: [배포/릴리즈 프로세스](../../policy/release-process.md), [배포 태그 정책](../../policy/release-tag-policy.md)
- 기준 성격: `as-is`

## 목적

- 확정된 운영 배포 범위에 필요한 저장소 명령, postcheck와 rollback 진입점만 제공한다.

## 범위

- 시작 조건: 배포 범위, 각 레포의 40자 commit SHA, 검증 시나리오, rollback 기준과 운영 권한이 확정된 상태
- 종료 조건: 포함 범위의 운영 반영·postcheck·증빙 기록과 허용된 태그 작업이 완료된 상태
- 제외 범위: 정책 판정의 재정의, 신규 migration 작성, 기능별 smoke 시나리오, Mobile Store build/upload UI 절차

## 상위 규범 문서

- [배포/릴리즈 프로세스](../../policy/release-process.md)
- [배포 태그 정책](../../policy/release-tag-policy.md)
- [DB Migration 유지보수 정책](../../policy/db-migration-gate-policy.md)

## 배포 범위 선택

릴리즈 기록의 `releaseScopes`를 기준으로 포함 범위를 고정한다. 제외 범위는 해당 기록에 `N/A` 근거를 남긴다.

| 범위 | 실행 문서 |
| --- | --- |
| `DB migration` | 이 문서의 DB 절과 [DB Migration 유지보수 정책](../../policy/db-migration-gate-policy.md) |
| `contracts-package` | [API 클라이언트 계약 패키지 정책](../../policy/api-client-contract-package-policy.md) |
| `coupler-api` | 이 문서의 API 절 |
| `coupler-admin-web` | [Admin 운영 배포 런북](admin-web-production-deploy-flow.md) |
| `Mobile NextPush` | 이 문서의 NextPush 절 |
| `Mobile Store` | [배포/릴리즈 프로세스](../../policy/release-process.md)와 이 문서의 제출 마커 절 |
| `docs`, 서비스 태그 | 이 문서의 Tag·Docs 절 |

## 실행 계약

- 릴리즈 기록에서 범위와 입력값을 확정하고, 각 블록이 요구하는 변수를 실행 shell에 먼저 설정한다.
- 각 코드 블록은 독립 실행 단위다. 블록 전체를 한 shell에서 실행하며, 실패하면 이후 명령을 실행하지 않는다.
- 값이 없거나 각 블록에 명시된 exact commit·`origin/main`·checkout 검사가 실패하면 중단한다.
- 운영 변경은 현재 PR head의 preflight가 `PASS`한 뒤 실행한다. DB `dev-run`·`prod-prepare`는 preflight 입력
  준비 단계이며 `prod-run`은 예외가 아니다.

## 공통 사전 확인

각 명령 블록은 새 shell의 워크스페이스 루트에서 시작한다. DB는 `prod-prepare` 뒤, 다른 범위는 준비 완료 뒤 열린
docs PR의 원격 head로 아래 운영 preflight를 실행한다.

```bash
set -euo pipefail
: "${VERSION:?set VERSION}"
: "${PR_NUMBER:?set PR_NUMBER}"

cd docs
WORKTREE_STATUS="$(git status --porcelain)"
test -z "${WORKTREE_STATUS}"
PENDING_REF="$(git rev-parse HEAD)"

test "${#PENDING_REF}" -eq 40
test "$(git rev-parse @{upstream})" = "${PENDING_REF}"
test "$(gh pr view "${PR_NUMBER}" --json headRefOid --jq .headRefOid)" = "${PENDING_REF}"

yarn release:preflight \
  --version "${VERSION}" \
  --workspace-root .. \
  --pending-ref "${PENDING_REF}"
```

`PASS`가 아니면 배포하지 않는다. preflight 뒤 docs PR head 또는 포함된 서비스 레포의 `origin/main`이 바뀌면
다음 운영 명령 전에 preflight를 다시 실행한다.

## DB Migration 포함 시

DB 안전·완료·실패 복구는 [DB Migration 유지보수 정책](../../policy/db-migration-gate-policy.md)과 executor가
판정한다. 저수준 SQL을 실행하지 말고 아래 표에서 위부터 처음 맞는 한 행만 수행한다.

| 처음 맞는 상태 | 다음 작업 |
| --- | --- |
| prod execution이 `service-completed` | DB 명령 없이 evidence를 최종화한다. |
| prod execution이 있으나 미완료 | 원래 실행 commit에서 `DB_ACTION=status-prod` 후 정책의 실패 복구를 따른다. |
| immutable checkpoint의 version·catalog·runtime contract가 불일치 | 기존 version을 재사용하지 않고 더 높은 version에서 `DB_ACTION=dev-run`한다. |
| prod plan이 있고 동일 PR head preflight가 `PASS`했으며 입력이 불변 | `DB_ACTION=prod-run` |
| prod plan이 있으나 위 `PASS` 조건이 아님 | prod plan/null root를 기록·push하고 preflight를 실행한다. |
| prod plan이 없고 같은 version의 canonical completed dev pair가 archive에 있음 | exact bytes 복원·검증을 위해 `DB_ACTION=prod-prepare` |
| prod plan이 없고 canonical completed dev pair가 archive에 없음 | `DB_ACTION=dev-run`으로 안전 재진입·archive한다. 거부되면 정책의 실패 복구를 따른다. |

아래 블록의 clean/commit/HEAD/`origin/main` 검사가 실패하면 DB 명령 없이 입력을 정정하고 표를 다시 판정한다.
`status-prod`는 원래 실행 commit을 사용하므로 현재 `origin/main`과 비교하지 않는다.

```bash
set -euo pipefail
: "${MIGRATION_VERSION:?set MIGRATION_VERSION}"
: "${DB_ACTION:?set DB_ACTION}"
: "${MIGRATION_COMMIT:?set MIGRATION_COMMIT}"
test "${#MIGRATION_COMMIT}" -eq 40

WORKTREE_STATUS="$(git -C coupler-api status --porcelain)"
test -z "${WORKTREE_STATUS}"
test "$(git -C coupler-api rev-parse --verify "${MIGRATION_COMMIT}^{commit}")" = "${MIGRATION_COMMIT}"
test "$(git -C coupler-api rev-parse HEAD)" = "${MIGRATION_COMMIT}"

cd coupler-api
case "${DB_ACTION}" in
  dev-run | prod-prepare | prod-run)
    git fetch --no-tags origin main
    test "$(git rev-parse origin/main)" = "${MIGRATION_COMMIT}"
    pnpm db:migration:workflow -- "${DB_ACTION}" "${MIGRATION_VERSION}"
    ;;
  status-prod)
    pnpm db:migration:workflow -- status "${MIGRATION_VERSION}" prod
    ;;
  *)
    printf 'invalid DB_ACTION: %s\n' "${DB_ACTION}" >&2
    exit 1
    ;;
esac
```

## API 포함 시

릴리즈 기록의 API commit을 `DEPLOY_COMMIT`에 넣는다. 운영 EC2의 `coupler-api` checkout에서 실행한다.

```bash
set -euo pipefail
: "${DEPLOY_COMMIT:?set DEPLOY_COMMIT}"
test "${#DEPLOY_COMMIT}" -eq 40

cd /home/projects/coupler-api

WORKTREE_STATUS="$(git status --porcelain)"
test -z "${WORKTREE_STATUS}"
git fetch --no-tags origin main
git rev-parse --verify "${DEPLOY_COMMIT}^{commit}"
test "$(git rev-parse origin/main)" = "${DEPLOY_COMMIT}"

git checkout main
git merge --ff-only "${DEPLOY_COMMIT}"
test "$(git rev-parse HEAD)" = "${DEPLOY_COMMIT}"

pnpm install --frozen-lockfile
pm2 restart coupler-api --update-env
pm2 save
pm2 status coupler-api

curl --fail-with-body --show-error -i http://127.0.0.1:3002/
curl --fail-with-body --show-error -i https://api.ritzy.fourhundred.co.kr/
pm2 logs coupler-api --lines 100 --nostream
```

배포 범위의 핵심 API와 적용 지표를 릴리즈 기록의 검증 시나리오대로 확인한다. 기능별 검증 항목은 해당 도메인
문서 또는 릴리즈 기록이 소유한다.

## Admin 포함 시

빌드를 수행하는 checkout에서 릴리즈 기록의 40자 `ADMIN_COMMIT`과 `origin/main`, 실제 `HEAD`가 모두 같은지
확인한 뒤 [Admin 운영 배포 런북](admin-web-production-deploy-flow.md)을 처음부터 끝까지 실행한다. Admin 명령과
rollback을 이 문서에 복제하지 않는다.

```bash
set -euo pipefail
: "${ADMIN_COMMIT:?set ADMIN_COMMIT}"
test "${#ADMIN_COMMIT}" -eq 40

WORKTREE_STATUS="$(git -C coupler-admin-web status --porcelain)"
test -z "${WORKTREE_STATUS}"
git -C coupler-admin-web fetch --no-tags origin main
git -C coupler-admin-web rev-parse --verify "${ADMIN_COMMIT}^{commit}"
test "$(git -C coupler-admin-web rev-parse origin/main)" = "${ADMIN_COMMIT}"
test "$(git -C coupler-admin-web rev-parse HEAD)" = "${ADMIN_COMMIT}"
```

## Mobile NextPush 포함 시

릴리즈 기록의 Mobile commit과 배포할 플랫폼을 먼저 고정한다.

```bash
set -euo pipefail
: "${MOBILE_COMMIT:?set MOBILE_COMMIT}"
: "${PLATFORM:?set PLATFORM to android or ios}"
: "${TARGET_BINARY:?set TARGET_BINARY}"
test "${#MOBILE_COMMIT}" -eq 40

case "${PLATFORM}" in
  android)
    SCRIPT=codepush-and-prod
    APP_ID=bluedotstudio.official-gmail.com/coupler
    ;;
  ios)
    SCRIPT=codepush-ios-prod
    APP_ID=bluedotstudio.official-gmail.com/coupler-ios
    ;;
  *)
    printf 'invalid PLATFORM: %s\n' "${PLATFORM}" >&2
    exit 1
    ;;
esac

WORKTREE_STATUS="$(git -C coupler-mobile-app status --porcelain)"
test -z "${WORKTREE_STATUS}"
git -C coupler-mobile-app fetch --no-tags origin main
git -C coupler-mobile-app rev-parse --verify "${MOBILE_COMMIT}^{commit}"
test "$(git -C coupler-mobile-app rev-parse origin/main)" = "${MOBILE_COMMIT}"
test "$(git -C coupler-mobile-app rev-parse HEAD)" = "${MOBILE_COMMIT}"

SCRIPT_COMMAND="$(node -p "require('./coupler-mobile-app/package.json').scripts['${SCRIPT}']")"
case " ${SCRIPT_COMMAND} " in
  *" -t ${TARGET_BINARY} "*) ;;
  *)
    printf 'target binary mismatch: %s\n' "${SCRIPT_COMMAND}" >&2
    exit 1
    ;;
esac

nextpush whoami
cd coupler-mobile-app
yarn "${SCRIPT}"
nextpush deployment history "${APP_ID}" Production --format json
```

## Mobile Store 포함 시

Store build/upload는 저장소에 확정된 단일 명령이 없으므로 이 문서에서 추측해 정의하지 않는다. 제출한
artifact와 exact source를 확인한 뒤 [배포 태그 정책](../../policy/release-tag-policy.md)에 따라 제출 마커를 만든다.

```bash
set -euo pipefail
: "${MARKER_SCOPE:?set MARKER_SCOPE to mobile, android, or ios}"
: "${MOBILE_VERSION:?set MOBILE_VERSION}"
: "${BUILD:?set BUILD}"
: "${SUBMITTED_COMMIT:?set SUBMITTED_COMMIT}"
: "${ARTIFACT_PATH:?set ARTIFACT_PATH}"
: "${ARTIFACT_SHA256:?set ARTIFACT_SHA256}"
: "${BUNDLE_HASH:?set BUNDLE_HASH}"
: "${SUBMITTED_AT:?set SUBMITTED_AT}"
: "${SOURCE_EVIDENCE:?set SOURCE_EVIDENCE}"

case "${MARKER_SCOPE}" in
  mobile | android | ios) ;;
  *)
    printf 'invalid MARKER_SCOPE: %s\n' "${MARKER_SCOPE}" >&2
    exit 1
    ;;
esac
[[ "${MOBILE_VERSION}" =~ ^[0-9]+\.[0-9]+\.[0-9]+$ ]]
[[ "${BUILD}" =~ ^[0-9]+$ ]]
[[ "${ARTIFACT_SHA256}" =~ ^[0-9A-Fa-f]{64}$ ]]
test "${#SUBMITTED_COMMIT}" -eq 40

REPO=coupler-mobile-app
TAG="submitted/${MARKER_SCOPE}-${MOBILE_VERSION}-${BUILD}"

git -C "${REPO}" fetch --tags origin
test "$(git -C "${REPO}" rev-parse --verify "${SUBMITTED_COMMIT}^{commit}")" = "${SUBMITTED_COMMIT}"
git -C "${REPO}" tag -a "${TAG}" "${SUBMITTED_COMMIT}" \
  -m "Submitted Mobile Store ${MOBILE_VERSION} (${BUILD})" \
  -m "Artifact: ${ARTIFACT_PATH}" \
  -m "Artifact SHA-256: ${ARTIFACT_SHA256}" \
  -m "Bundle/hash: ${BUNDLE_HASH}" \
  -m "Uploaded/submitted at: ${SUBMITTED_AT}" \
  -m "Source evidence: ${SOURCE_EVIDENCE}"

test "$(git -C "${REPO}" rev-list -n 1 "${TAG}")" = "${SUBMITTED_COMMIT}"
git -C "${REPO}" push origin "${TAG}"
REMOTE_COMMIT="$(git -C "${REPO}" ls-remote --tags origin "refs/tags/${TAG}^{}" | cut -f1)"
test "${REMOTE_COMMIT}" = "${SUBMITTED_COMMIT}"
```

승인·출시·smoke·릴리즈 태그·증빙 이관이 끝난 제출 마커 삭제는 별도 명시 승인을 받은 뒤 태그 정책의 절차로
수행한다.

## Tag 포함 시

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
test "${#DEPLOY_COMMIT}" -eq 40

git -C "${REPO}" fetch --no-tags origin main
git -C "${REPO}" fetch --tags origin
git -C "${REPO}" rev-parse --verify "${DEPLOY_COMMIT}^{commit}"
test "$(git -C "${REPO}" rev-parse origin/main)" = "${DEPLOY_COMMIT}"

git -C "${REPO}" tag -a "${TAG}" "${DEPLOY_COMMIT}" -m "Release ${TAG}"
test "$(git -C "${REPO}" rev-list -n 1 "${TAG}")" = "${DEPLOY_COMMIT}"

git -C "${REPO}" push origin "${TAG}"
REMOTE_COMMIT="$(git -C "${REPO}" ls-remote --tags origin "refs/tags/${TAG}^{}" | cut -f1)"
test "${REMOTE_COMMIT}" = "${DEPLOY_COMMIT}"
```

레포별 태그 생성 가능 시점은 [배포 태그 정책](../../policy/release-tag-policy.md), 이후 기록 순서는
[릴리즈 자동화 파이프라인](release-automation-pipeline.md)을 따른다.

## Docs 포함 시

Final Record Gate에서 릴리즈 기록 PR을 병합한 뒤 exact docs merge commit을 태깅한다.

```bash
set -euo pipefail
: "${TAG:?set TAG}"
: "${DOCS_COMMIT:?set DOCS_COMMIT}"
[[ "${TAG}" =~ ^v[0-9]+\.[0-9]+\.[0-9]+$ ]]
test "${#DOCS_COMMIT}" -eq 40

cd docs

WORKTREE_STATUS="$(git status --porcelain)"
test -z "${WORKTREE_STATUS}"
git fetch --no-tags origin main
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

yarn verify
test "$(git rev-parse HEAD)" = "${DOCS_COMMIT}"
printf 'review release note: %s\n' "${PREVIEW_PATH}"
```

출력된 preview와 문서 안정성 평가가 `No Findings`일 때만 다음 블록에서 annotated tag를 한 번 생성해 push한다.

```bash
set -euo pipefail
: "${TAG:?set TAG}"
: "${DOCS_COMMIT:?set DOCS_COMMIT}"
[[ "${TAG}" =~ ^v[0-9]+\.[0-9]+\.[0-9]+$ ]]
test "${#DOCS_COMMIT}" -eq 40

cd docs
WORKTREE_STATUS="$(git status --porcelain)"
test -z "${WORKTREE_STATUS}"
git fetch --no-tags origin main
git fetch --tags origin
test "$(git rev-parse --verify "${DOCS_COMMIT}^{commit}")" = "${DOCS_COMMIT}"
test "$(git rev-parse origin/main)" = "${DOCS_COMMIT}"
test "$(git rev-parse HEAD)" = "${DOCS_COMMIT}"

git tag -a "${TAG}" "${DOCS_COMMIT}" -m "Release ${TAG}"
test "$(git rev-list -n 1 "${TAG}")" = "${DOCS_COMMIT}"
git push origin "refs/tags/${TAG}"
REMOTE_COMMIT="$(git ls-remote --tags origin "refs/tags/${TAG}^{}" | cut -f1)"
test "${REMOTE_COMMIT}" = "${DOCS_COMMIT}"
```

tag push 뒤 `Release Docs`, GitHub Release, `docs-site-vX.Y.Z.tar.gz`와 Pages 결과를 postcheck한다.

## 검증 기록

각 절의 실제 commit, 명령 결과, 외부 응답, workflow와 rollback 기준을
[배포/릴리즈 프로세스](../../policy/release-process.md)의 scope별 evidence에 기록한다. 포함 범위의 postcheck가
하나라도 실패하면 완료나 태그 가능 상태로 판정하지 않는다.

## 예외 흐름

- 변경 명령 도중 중단되면 블록 전체를 다시 실행하지 않는다. 먼저 해당 scope의 status, history, remote ref와
  외부 응답으로 실제 반영 지점을 확인한 뒤 postcheck 재개 또는 승인된 rollback/reconciliation을 선택한다.
- DB 실행 중단·실패는 같은 SQL이나 저수준 단계를 재실행하지 않고
  [DB Migration 유지보수 정책](../../policy/db-migration-gate-policy.md)의 실패 복구를 따른다.
- API 배포 실패는 로그·내부 응답·외부 응답으로 원인을 확인한다. 릴리즈 기록이 previous-release rollback을
  허용한 경우에만 그 exact commit으로 전환해 install, PM2 restart와 같은 postcheck를 다시 수행한다. 허용 근거가
  없으면 임의 rollback하지 않고 forward fix 또는 승인된 reconciliation을 사용한다.

```bash
set -euo pipefail
: "${ROLLBACK_COMMIT:?set ROLLBACK_COMMIT}"
test "${#ROLLBACK_COMMIT}" -eq 40

cd /home/projects/coupler-api

WORKTREE_STATUS="$(git status --porcelain)"
test -z "${WORKTREE_STATUS}"
git fetch --no-tags origin
test "$(git rev-parse --verify "${ROLLBACK_COMMIT}^{commit}")" = "${ROLLBACK_COMMIT}"
git checkout --detach "${ROLLBACK_COMMIT}"
test "$(git rev-parse HEAD)" = "${ROLLBACK_COMMIT}"

pnpm install --frozen-lockfile
pm2 restart coupler-api --update-env
pm2 save
pm2 status coupler-api

curl --fail-with-body --show-error -i http://127.0.0.1:3002/
curl --fail-with-body --show-error -i https://api.ritzy.fourhundred.co.kr/
pm2 logs coupler-api --lines 100 --nostream
```

- Admin rollback은 [Admin 운영 배포 런북](admin-web-production-deploy-flow.md)의 롤백 흐름을 따른다.
- NextPush rollback은 릴리즈 기록에 고정한 target release를 명시한다.

```bash
set -euo pipefail
: "${PLATFORM:?set PLATFORM to android or ios}"
: "${TARGET_RELEASE:?set TARGET_RELEASE}"

case "${PLATFORM}" in
  android) APP_ID=bluedotstudio.official-gmail.com/coupler ;;
  ios) APP_ID=bluedotstudio.official-gmail.com/coupler-ios ;;
  *)
    printf 'invalid PLATFORM: %s\n' "${PLATFORM}" >&2
    exit 1
    ;;
esac

nextpush whoami
nextpush rollback "${APP_ID}" Production --targetRelease "${TARGET_RELEASE}"
nextpush deployment history "${APP_ID}" Production --format json
```

- tag 생성 뒤 push 또는 postcheck가 중단되면 local tag를 삭제·이동하지 않는다. exact local/remote ref를 확인한
  뒤 누락된 push 또는 postcheck만 재개한다.
- 이미 push한 릴리즈 태그와 병합된 릴리즈 기록은 이동·재작성하지 않는다. 실패나 사실 오류는 이슈·장애 기록에서
  추적한다.
