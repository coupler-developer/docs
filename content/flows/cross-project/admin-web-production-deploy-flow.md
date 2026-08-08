# Admin 운영 배포 런북

## 문서 역할

- 역할: `시나리오`
- 문서 종류: `flow`
- 충돌 시 우선 문서: [릴리스 프로세스](../../policy/release-process.md)
- 기준 성격: `as-is`

## 목적

- `coupler-admin-web`의 exact source로 만든 정적 artifact를 운영 nginx root에 index 원자 교체로 배포·복구한다.

## 범위

- 시작 조건: [운영 릴리스 실행 런북](production-deploy-command-runbook.md)의 공통 preflight가 같은 입력으로 `PASS`했고 운영 빌드 환경·SSH 접근·package 인증이 준비된 상태
- 종료 조건: artifact SHA와 source commit이 고정되고 내부·외부 응답과 브라우저 smoke가 끝난 상태
- 제외 범위: 개발계 배포, nginx 설치·사이트 재구성, legacy PM2 정리, API/DB/Mobile, 서비스 태그

## 상위 규범 문서

- [릴리스 프로세스](../../policy/release-process.md)
- [엔지니어링 가드레일](../../policy/engineering-guardrails.md)
- [테스트/CI 전략](../../policy/testing-strategy.md)

## 액터

- 릴리스 작업자: exact checkout에서 production artifact를 만들고 SHA-256을 기록한다.
- 운영 EC2: artifact를 검증하고 현재 live 파일을 백업한 뒤 live root를 갱신한다.
- nginx: `/var/www/coupler-admin-web`의 정적 파일을 내부 `8000` 포트에서 서빙한다.

## 운영 호스트 계약

- live root는 `/var/www/coupler-admin-web`이다.
- nginx site는 live root와 SPA fallback을 사용하고 내부 `8000`, 외부
  `https://cms.ritzy.fourhundred.co.kr`로 응답해야 한다.
- nginx 계약이 다르면 정상 배포를 시작하지 않는다. nginx 설치·root 변경·소유권 변경은 이 런북과 분리한
  인프라 변경으로 승인·검증한다.

## 1) Artifact 생성

워크스페이스 루트의 새 shell에서 실행한다. `EXPECTED_API_ORIGIN`은 릴리스 기록에 확정한 운영 API origin이다.

```bash
set -euo pipefail
: "${ADMIN_COMMIT:?set ADMIN_COMMIT}"
: "${EXPECTED_API_ORIGIN:?set EXPECTED_API_ORIGIN}"
[[ "${ADMIN_COMMIT}" =~ ^[0-9a-f]{40}$ ]]

WORKTREE_STATUS="$(git -C coupler-admin-web status --porcelain)"
test -z "${WORKTREE_STATUS}"
git -C coupler-admin-web fetch --no-tags origin main:refs/remotes/origin/main
test "$(git -C coupler-admin-web rev-parse --verify "${ADMIN_COMMIT}^{commit}")" = "${ADMIN_COMMIT}"
test "$(git -C coupler-admin-web rev-parse origin/main)" = "${ADMIN_COMMIT}"
test "$(git -C coupler-admin-web rev-parse HEAD)" = "${ADMIN_COMMIT}"

cd coupler-admin-web
yarn install --frozen-lockfile
yarn build
test -f build/index.html
grep -R --include='*.js' -F "${EXPECTED_API_ORIGIN}" build/static/js >/dev/null

ARTIFACT_PATH="${TMPDIR:-/tmp}/coupler-admin-web-${ADMIN_COMMIT}.tar.gz"
ARTIFACT_NAME="$(basename "${ARTIFACT_PATH}")"
INDEX_SHA256="$(shasum -a 256 build/index.html | awk '{print $1}')"
tar -C build -czf "${ARTIFACT_PATH}" .
ARTIFACT_SHA256="$(shasum -a 256 "${ARTIFACT_PATH}" | awk '{print $1}')"
[[ "${INDEX_SHA256}" =~ ^[0-9a-f]{64}$ ]]
[[ "${ARTIFACT_SHA256}" =~ ^[0-9a-f]{64}$ ]]
printf 'ARTIFACT_PATH=%s\nARTIFACT_NAME=%s\nARTIFACT_SHA256=%s\nINDEX_SHA256=%s\n' \
  "${ARTIFACT_PATH}" "${ARTIFACT_NAME}" "${ARTIFACT_SHA256}" "${INDEX_SHA256}"
```

출력한 artifact name, artifact/index SHA-256과 `ADMIN_COMMIT`을 릴리스 기록에 고정한다. 임시 local path는
기록하지 않는다.

## 2) Artifact 업로드

새 shell에서 빌드 단계가 출력한 값을 설정하고, 운영 EC2의 고정된 배포 사용자·host로 업로드한다.

```bash
set -euo pipefail
: "${ADMIN_COMMIT:?set ADMIN_COMMIT}"
: "${ARTIFACT_PATH:?set ARTIFACT_PATH}"
: "${ADMIN_SERVER:?set ADMIN_SERVER}"
: "${DEPLOY_USER:?set DEPLOY_USER}"
[[ "${ADMIN_COMMIT}" =~ ^[0-9a-f]{40}$ ]]
test -f "${ARTIFACT_PATH}"
test "$(basename "${ARTIFACT_PATH}")" = "coupler-admin-web-${ADMIN_COMMIT}.tar.gz"

UPLOAD_PATH="/var/tmp/coupler-admin-web-${ADMIN_COMMIT}.tar.gz"
scp "${ARTIFACT_PATH}" "${DEPLOY_USER}@${ADMIN_SERVER}:${UPLOAD_PATH}"
```

## 3) 운영 반영·postcheck

운영 EC2의 새 shell에서 실행한다. `PREVIOUS_ADMIN_COMMIT`과 `PREVIOUS_INDEX_SHA256`은 현재 live 정상본의
기존 릴리스 기록에서 가져오며 이 shell에서 새로 계산해 승인값으로 만들지 않는다. live root에는 새 hashed
asset을 먼저 추가하고, 같은 파일시스템의 임시 `index.html`을 마지막에 rename한다. 이전 hashed asset은
rollback을 위해 삭제하지 않는다.

```bash
set -euo pipefail
: "${ADMIN_COMMIT:?set ADMIN_COMMIT}"
: "${ARTIFACT_SHA256:?set ARTIFACT_SHA256}"
: "${INDEX_SHA256:?set INDEX_SHA256}"
: "${PREVIOUS_ADMIN_COMMIT:?set PREVIOUS_ADMIN_COMMIT}"
: "${PREVIOUS_INDEX_SHA256:?set PREVIOUS_INDEX_SHA256}"
[[ "${ADMIN_COMMIT}" =~ ^[0-9a-f]{40}$ ]]
[[ "${ARTIFACT_SHA256}" =~ ^[0-9A-Fa-f]{64}$ ]]
[[ "${INDEX_SHA256}" =~ ^[0-9A-Fa-f]{64}$ ]]
[[ "${PREVIOUS_ADMIN_COMMIT}" =~ ^[0-9a-f]{40}$ ]]
[[ "${PREVIOUS_INDEX_SHA256}" =~ ^[0-9A-Fa-f]{64}$ ]]

LIVE_ROOT=/var/www/coupler-admin-web
UPLOAD_PATH="/var/tmp/coupler-admin-web-${ADMIN_COMMIT}.tar.gz"
NEXT_INDEX="${LIVE_ROOT}/.index.html.${ADMIN_COMMIT}"
BACKUP_DIR="/var/www/coupler-admin-web-backup-$(date -u +%Y%m%dT%H%M%SZ)"
BACKUP_METADATA="${BACKUP_DIR}/.coupler-admin-backup"

test -d "${LIVE_ROOT}"
test -f "${UPLOAD_PATH}"
test ! -e "${NEXT_INDEX}"
[[ "${BACKUP_DIR}" =~ ^/var/www/coupler-admin-web-backup-[0-9]{8}T[0-9]{6}Z$ ]]
sudo test ! -e "${BACKUP_DIR}"

ACTUAL_SHA256="$(sha256sum "${UPLOAD_PATH}" | awk '{print $1}')"
test "$(printf '%s' "${ACTUAL_SHA256}" | tr '[:upper:]' '[:lower:]')" = \
  "$(printf '%s' "${ARTIFACT_SHA256}" | tr '[:upper:]' '[:lower:]')"
ARCHIVE_INDEX_SHA256="$(tar -xOf "${UPLOAD_PATH}" ./index.html | sha256sum | awk '{print $1}')"
test "$(printf '%s' "${ARCHIVE_INDEX_SHA256}" | tr '[:upper:]' '[:lower:]')" = \
  "$(printf '%s' "${INDEX_SHA256}" | tr '[:upper:]' '[:lower:]')"
LIVE_INDEX_SHA256="$(sudo sha256sum "${LIVE_ROOT}/index.html" | awk '{print $1}')"
test "$(printf '%s' "${LIVE_INDEX_SHA256}" | tr '[:upper:]' '[:lower:]')" = \
  "$(printf '%s' "${PREVIOUS_INDEX_SHA256}" | tr '[:upper:]' '[:lower:]')"
sudo nginx -t
sudo nginx -T 2>&1 | grep -F 'root /var/www/coupler-admin-web;' >/dev/null
sudo mkdir "${BACKUP_DIR}"
sudo rsync -a "${LIVE_ROOT}/" "${BACKUP_DIR}/"
sudo test -f "${BACKUP_DIR}/index.html"
printf 'commit=%s\nindex_sha256=%s\n' \
  "${PREVIOUS_ADMIN_COMMIT}" "${PREVIOUS_INDEX_SHA256}" | sudo tee "${BACKUP_METADATA}" >/dev/null
sudo chmod 0444 "${BACKUP_METADATA}"

sudo tar --no-same-owner --exclude='./index.html' -xzf "${UPLOAD_PATH}" -C "${LIVE_ROOT}"
tar -xOf "${UPLOAD_PATH}" ./index.html | sudo tee "${NEXT_INDEX}" >/dev/null
sudo chmod 0644 "${NEXT_INDEX}"
sudo mv -f "${NEXT_INDEX}" "${LIVE_ROOT}/index.html"
tar -xOf "${UPLOAD_PATH}" ./index.html | sudo cmp -s - "${LIVE_ROOT}/index.html"

curl --fail-with-body --show-error -I http://127.0.0.1:8000/
curl --fail-with-body --show-error -I https://cms.ritzy.fourhundred.co.kr/
printf 'ACTIVE_ADMIN_COMMIT=%s\nARTIFACT_SHA256=%s\nINDEX_SHA256=%s\nBACKUP_DIR=%s\n' \
  "${ADMIN_COMMIT}" "${ARTIFACT_SHA256}" "${INDEX_SHA256}" "${BACKUP_DIR}"
```

브라우저에서 Admin 로그인과 릴리스 기록의 핵심 화면을 확인한다. 콘솔에 CRA 개발 서버 WebSocket 재연결 오류가
없어야 하며, artifact SHA, commit, 내부·외부 응답과 브라우저 결과를 증빙한다.

## 예외 흐름

- artifact SHA, 운영 host 계약, nginx config 검사가 실패하면 live root를 수정하지 않는다.
- asset 복사 뒤 `index.html` 교체 전에 실패하면 기존 화면이 계속 활성 상태다. 원인을 수정한 새 artifact로
  다시 시작하고 부분 복사된 파일을 임의 삭제하지 않는다.
- `index.html` 교체 뒤 postcheck가 실패하면 같은 shell에서 추측 명령을 실행하지 않고 아래 rollback을 사용한다.

## 롤백 흐름

배포 단계가 출력해 릴리스 기록에 고정한 이전 정상본의 `BACKUP_DIR`만 사용한다. rollback commit은 별도
입력받지 않고 backup 생성 때 live `index.html` SHA와 함께 봉인한 metadata에서 읽는다. 운영 EC2의 새
shell에서 실행한다.

```bash
set -euo pipefail
: "${BACKUP_DIR:?set BACKUP_DIR}"
[[ "${BACKUP_DIR}" =~ ^/var/www/coupler-admin-web-backup-[0-9]{8}T[0-9]{6}Z$ ]]

LIVE_ROOT=/var/www/coupler-admin-web
BACKUP_METADATA="${BACKUP_DIR}/.coupler-admin-backup"
sudo test -f "${BACKUP_METADATA}"
test "$(sudo grep -c '^commit=' "${BACKUP_METADATA}")" = 1
test "$(sudo grep -c '^index_sha256=' "${BACKUP_METADATA}")" = 1
ROLLBACK_COMMIT="$(sudo awk -F= '$1 == "commit" {print $2}' "${BACKUP_METADATA}")"
ROLLBACK_INDEX_SHA256="$(sudo awk -F= '$1 == "index_sha256" {print $2}' "${BACKUP_METADATA}")"
[[ "${ROLLBACK_COMMIT}" =~ ^[0-9a-f]{40}$ ]]
[[ "${ROLLBACK_INDEX_SHA256}" =~ ^[0-9A-Fa-f]{64}$ ]]
ROLLBACK_INDEX="${LIVE_ROOT}/.index.html.${ROLLBACK_COMMIT}"

sudo test -d "${LIVE_ROOT}"
sudo test -d "${BACKUP_DIR}"
sudo test -f "${BACKUP_DIR}/index.html"
sudo test ! -e "${ROLLBACK_INDEX}"
BACKUP_INDEX_SHA256="$(sudo sha256sum "${BACKUP_DIR}/index.html" | awk '{print $1}')"
test "$(printf '%s' "${BACKUP_INDEX_SHA256}" | tr '[:upper:]' '[:lower:]')" = \
  "$(printf '%s' "${ROLLBACK_INDEX_SHA256}" | tr '[:upper:]' '[:lower:]')"
sudo nginx -t

sudo rsync -a --exclude='index.html' --exclude='.coupler-admin-backup' \
  "${BACKUP_DIR}/" "${LIVE_ROOT}/"
sudo install -m 0644 "${BACKUP_DIR}/index.html" "${ROLLBACK_INDEX}"
sudo mv -f "${ROLLBACK_INDEX}" "${LIVE_ROOT}/index.html"
sudo cmp -s "${BACKUP_DIR}/index.html" "${LIVE_ROOT}/index.html"

curl --fail-with-body --show-error -I http://127.0.0.1:8000/
curl --fail-with-body --show-error -I https://cms.ritzy.fourhundred.co.kr/
printf 'ACTIVE_ADMIN_COMMIT=%s\nINDEX_SHA256=%s\n' \
  "${ROLLBACK_COMMIT}" "${ROLLBACK_INDEX_SHA256}"
```

rollback 뒤 브라우저 smoke와 원인·시각·이전/대상 commit을 릴리스 기록에 남긴다.

## 비포함 / 금지

- 운영에서 `yarn start`, `react-scripts start` 또는 PM2로 CRA 개발 서버를 서빙하지 않는다.
- live root에 `rsync --delete`하지 않는다. 사용 중일 수 있는 hashed asset과 정상 rollback artifact를 지우지 않는다.
- 정상 배포 중 nginx 설치·site 재작성·restart, 디렉터리 소유권 변경 또는 legacy PM2 삭제를 수행하지 않는다.
- backup directory와 미참조 asset 정리는 별도 승인된 유지보수에서 active/rollback 기준점을 확인한 뒤 수행한다.

## 관련 문서

- [운영 릴리스 실행 런북](production-deploy-command-runbook.md)
- [릴리스 프로세스](../../policy/release-process.md)
- [릴리스 태그 정책](../../policy/release-tag-policy.md)
- [레포지토리 요약](../../architecture/repo-overview.md)
