# Mobile 운영 릴리스 런북

## 문서 역할

- 역할: `시나리오`
- 문서 종류: `flow`
- 충돌 시 우선 문서: [릴리스 프로세스](../../policy/release-process.md), [릴리스 태그 정책](../../policy/release-tag-policy.md)
- 기준 성격: `as-is`

## 목적

- `coupler-mobile-app`의 Mobile Store 제출 증빙과 Production NextPush 배포·복구 절차를 한 곳에서 실행한다.

## 범위

- 시작 조건: [운영 릴리스 실행 런북](production-deploy-command-runbook.md)의 공통 preflight가 같은 입력으로 `PASS`했고 Mobile commit·platform·binary 또는 Store artifact가 확정된 상태
- 종료 조건: Mobile Store scope는 artifact·commit·운영 이력·smoke·rollback 기준, Mobile NextPush scope는
  app/deployment/label·target binary·bundle hash·운영 이력·rollback target이 릴리스 기록에 남은 상태
- 제외 범위: Store build/upload 도구의 미확정 UI 절차, API/DB/Admin 실행, 서비스 릴리스 태그

## Mobile NextPush

릴리스 기록의 Mobile commit, 대상 플랫폼과 실제 target Store binary를 고정한다. 해당 commit을 checkout한
clean worktree를 `coupler-mobile-app`으로 둔 워크스페이스 루트의 새 shell에서 실행한다.

```bash
set -euo pipefail
: "${MOBILE_COMMIT:?set MOBILE_COMMIT}"
: "${PLATFORM:?set PLATFORM to android or ios}"
: "${TARGET_BINARY:?set TARGET_BINARY}"
[[ "${MOBILE_COMMIT}" =~ ^[0-9a-f]{40}$ ]]
[[ "${TARGET_BINARY}" =~ ^[0-9]+\.[0-9]+\.[0-9]+$ ]]

case "${PLATFORM}" in
  android)
    APP_ID=bluedotstudio.official-gmail.com/coupler
    ;;
  ios)
    APP_ID=bluedotstudio.official-gmail.com/coupler-ios
    ;;
  *)
    printf 'invalid PLATFORM: %s\n' "${PLATFORM}" >&2
    exit 1
    ;;
esac

test -z "$(git -C coupler-mobile-app status --porcelain)"
git -C coupler-mobile-app fetch --no-tags origin main:refs/remotes/origin/main
test "$(git -C coupler-mobile-app rev-parse HEAD)" = "${MOBILE_COMMIT}"
git -C coupler-mobile-app merge-base --is-ancestor "${MOBILE_COMMIT}" origin/main

cd coupler-mobile-app
yarn install --frozen-lockfile
yarn nextpush whoami
yarn nextpush deployment history "${APP_ID}" Production --format json
yarn check:nextpush-contracts
yarn nextpush release-react "${APP_ID}" "${PLATFORM}" -d Production -m -t "${TARGET_BINARY}"
yarn nextpush deployment history "${APP_ID}" Production --format json
```

배포 전·후 history에서 새 release, target binary와 bundle hash를 확인하고 rollback target을 릴리스 기록에
남긴다. 실제 기기 접근이 승인돼 별도 smoke를 수행한 경우에는 실행 주체와 결과를 보조 증빙으로 남길 수 있지만,
NextPush terminal 판정의 필수 조건으로 사용하지 않는다.

## Mobile Store

### 제출 후보 준비

1. 포함 기능을 `main`에 모두 병합하고 Store에서 다음 사용 가능한 build 번호를 확인한다.
2. `release/{이름}/{버전}({build})-준비` PR에서는 Android `versionName/versionCode`, iOS
   `MARKETING_VERSION/CURRENT_PROJECT_VERSION`와 그 정합성 테스트만 변경한다. NextPush가 scope에 없으면
   Production target은 바꾸지 않는다.
3. 필수 CI 통과 뒤 저장소 책임자가 rebase merge한다. PR head SHA는 병합 과정에서 바뀔 수 있으므로 artifact
   기준으로 사용하지 않는다.
4. 아래 확인으로 clean `main == origin/main`의 최종 SHA를 고정한 뒤 같은 checkout을 유지한 채 Android
   `./gradlew bundleRelease`와 Xcode Archive를 순차 또는 병렬 실행한다.

```bash
set -euo pipefail
MOBILE_REPO=coupler-mobile-app

git -C "${MOBILE_REPO}" fetch --no-tags origin main:refs/remotes/origin/main
test -z "$(git -C "${MOBILE_REPO}" status --porcelain)"
test "$(git -C "${MOBILE_REPO}" branch --show-current)" = main
test "$(git -C "${MOBILE_REPO}" rev-parse HEAD)" = \
  "$(git -C "${MOBILE_REPO}" rev-parse origin/main)"
MOBILE_COMMIT="$(git -C "${MOBILE_REPO}" rev-parse HEAD)"
printf 'MOBILE_COMMIT=%s\n' "${MOBILE_COMMIT}"
```

두 platform의 version/build, 운영 API 대상과 Store 업로드 결과를 같은 `MOBILE_COMMIT`에 연결한다. build 또는
version을 다시 바꾸면 새 release PR을 rebase merge하고 새 최종 SHA에서 양 platform artifact를 다시 만든다.

### 심사 제출 마커

실제 platform 제출이 끝나면 Store의 platform/version/build를 source commit에 고정한다. 로컬 artifact 경로와
파일 전체 hash는 제출 마커의 필수 입력으로 사용하지 않는다.

```bash
set -euo pipefail
: "${MARKER_SCOPE:?set MARKER_SCOPE to android or ios}"
: "${MOBILE_VERSION:?set MOBILE_VERSION}"
: "${BUILD:?set BUILD}"
: "${MOBILE_COMMIT:?set MOBILE_COMMIT}"

case "${MARKER_SCOPE}" in
  android | ios) ;;
  *)
    printf 'invalid MARKER_SCOPE: %s\n' "${MARKER_SCOPE}" >&2
    exit 1
    ;;
esac
[[ "${MOBILE_VERSION}" =~ ^[0-9]+\.[0-9]+\.[0-9]+$ ]]
[[ "${BUILD}" =~ ^[0-9]+$ ]]
[[ "${MOBILE_COMMIT}" =~ ^[0-9a-f]{40}$ ]]
SUBMITTED_AT="$(date -u +%Y-%m-%dT%H:%M:%SZ)"

REPO=coupler-mobile-app
TAG="submitted/${MARKER_SCOPE}-${MOBILE_VERSION}-${BUILD}"
git -C "${REPO}" fetch --no-tags origin main:refs/remotes/origin/main
git -C "${REPO}" fetch --tags origin
git -C "${REPO}" merge-base --is-ancestor "${MOBILE_COMMIT}" origin/main

git -C "${REPO}" tag -a "${TAG}" "${MOBILE_COMMIT}" \
  -m "Submitted Mobile Store ${MOBILE_VERSION} (${BUILD})" \
  -m "Platform: ${MARKER_SCOPE}" \
  -m "Submitted at: ${SUBMITTED_AT}"

git -C "${REPO}" push origin "${TAG}"
REMOTE_COMMIT="$(git -C "${REPO}" ls-remote --tags origin "refs/tags/${TAG}^{}" | cut -f1)"
test "${REMOTE_COMMIT}" = "${MOBILE_COMMIT}"
```

승인·출시·smoke 뒤 서비스 릴리스 태그는 상위 런북에서 만든다. 제출 증빙 이관이 끝난 마커 삭제는 별도 명시
승인을 받은 경우에만 태그 정책의 절차로 수행한다.

## 예외 흐름

- NextPush 실행이 중단되면 먼저 deployment history에서 release 생성 여부를 확인한다. 새 release가 있으면 같은
  배포 명령을 반복하지 않고 postcheck 또는 승인된 rollback으로 이동한다.
- NextPush rollback은 릴리스 기록에 고정한 exact target release만 사용한다.

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

cd coupler-mobile-app
yarn nextpush whoami
yarn nextpush deployment history "${APP_ID}" Production --format json
yarn nextpush rollback "${APP_ID}" Production --targetRelease "${TARGET_RELEASE}"
yarn nextpush deployment history "${APP_ID}" Production --format json
```

- tag 생성·push 또는 postcheck가 중단되면 local/remote ref를 확인하고 누락된 작업만 재개한다. 이미 push한
  제출 마커나 릴리스 태그를 임의로 이동·재작성하지 않는다.

## 비포함 / 금지

- NextPush `Production` 배포를 개발·staging 검증에 사용하지 않는다.
- NextPush-only 배포에서 native version, Store upload 또는 Mobile 서비스 태그를 자동 변경하지 않는다.
- Store/NextPush 활성화를 API/DB 호환 증빙으로 사용하지 않는다.

## 관련 문서

- [운영 릴리스 실행 런북](production-deploy-command-runbook.md)
- [릴리스 태그 정책](../../policy/release-tag-policy.md)
- [API 계약 변경 모바일 릴리스 플로우](api-contract-mobile-release-flow.md)
