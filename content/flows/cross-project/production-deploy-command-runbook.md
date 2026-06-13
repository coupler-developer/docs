# 운영 배포 명령어 런북

## 문서 역할

- 역할: `시나리오`
- 문서 종류: `flow`
- 충돌 시 우선 문서: [배포 태그/릴리즈 프로세스](../../policy/release-process.md)
- 기준 성격: `as-is`

## 목적

- 운영 배포 시 `DB`, `API`, `Admin`, `Mobile`, `docs`, `Tag` 범위를 먼저 고르고, 포함된 범위에 필요한 명령어만 누락 없이 실행하게 한다.

## 범위

- 시작 조건: 배포 대상 커밋, 배포 범위, 운영 접근 권한, 검증 시나리오가 확정된 상태
- 종료 조건: 포함된 범위의 운영 반영, 외부 응답 확인, 태그/NextPush/docs Pages/DB ledger 기록 확인이 완료된 상태
- 제외 범위: 신규 SQL 작성, 스토어 심사 정책 해석, docs GitHub Release 본문 상세 작성

## 상위 규범 문서

- [배포 태그/릴리즈 프로세스](../../policy/release-process.md)
- [DB Migration Gate 정책](../../policy/db-migration-gate-policy.md)
- [Admin 운영 배포 런북](admin-web-production-deploy-flow.md)
- [테스트/CI 전략](../../policy/testing-strategy.md)
- [엔지니어링 가드레일](../../policy/engineering-guardrails.md)

## 액터

- 릴리즈 작업자: 배포 범위 확정, 명령 실행, 결과 기록을 담당한다.
- 운영 `RDS`: DB 마이그레이션이 포함된 경우에만 변경 대상이다.
- 운영 `EC2`: `coupler-api` 프로세스와 `coupler-admin-web` 정적 산출물을 반영한다.
- NextPush: `coupler-mobile-app` OTA 배포 채널을 관리한다.
- GitHub: 배포 완료 기준점 태그와 docs Release 기록을 관리한다.

## 배포 범위 선택

배포 시작 전에 아래 표에서 포함 여부를 먼저 고정한다. 제외된 범위는 `N/A` 사유와 근거를 릴리즈 기록에 남긴다.

| 범위 | 포함 조건 | 단일 기준 |
| --- | --- | --- |
| `DB migration` | 스키마, 데이터, view, 읽기 기준 변경이 운영 DB에 필요함 | [DB Migration Gate 정책](../../policy/db-migration-gate-policy.md) |
| `coupler-api` | API 코드 또는 서버 런타임 변경을 운영 EC2에 반영함 | 이 문서의 API 절차 |
| `coupler-admin-web` | Admin 화면 변경을 운영 정적 산출물로 반영함 | [Admin 운영 배포 런북](admin-web-production-deploy-flow.md) |
| `Mobile Store` | native binary 또는 스토어 제출이 필요함 | [배포 태그/릴리즈 프로세스](../../policy/release-process.md) |
| `Mobile NextPush` | JS-only OTA 배포가 필요함 | 이 문서의 NextPush 절차 |
| `docs` | 문서 변경을 GitHub Pages로 배포함 | [배포 태그/릴리즈 프로세스](../../policy/release-process.md)의 Docs 배포 |
| `Tag/Release Record` | 운영 반영 기준점 기록이 필요함 | [배포 태그/릴리즈 프로세스](../../policy/release-process.md) |

## 공통 사전 확인

워크스페이스 루트에서 실행한다.

```bash
git -C coupler-api status --short --branch
git -C coupler-admin-web status --short --branch
git -C coupler-mobile-app status --short --branch
git -C docs status --short --branch
```

운영 외부 응답 기준선을 남긴다.

```bash
curl -i https://api.ritzy.fourhundred.co.kr/
curl -I https://cms.ritzy.fourhundred.co.kr
```

## DB Migration 포함 시

DB 변경은 이 문서의 명령어만으로 승인하지 않는다. [DB Migration Gate 정책](../../policy/db-migration-gate-policy.md)의 실행 검증 파이프라인을 통과한 SQL만 운영에 반영한다.

운영 write 전에 read-only preflight를 남긴다. preflight는 `공통 식별값 + ledger + 변경 대상 객체/카운터` 3종이 모두 있어야 완료다.

공통 preflight:

```sql
SELECT
  DATABASE() AS database_name,
  @@hostname AS server_hostname,
  @@server_id AS server_id,
  @@version AS server_version,
  CURRENT_USER() AS db_execution_user;

SELECT
  migration_name,
  migration_type,
  target_env,
  checksum_sha256,
  database_name,
  server_hostname,
  server_id,
  server_version,
  applied_by,
  applied_at
FROM schema_migrations
WHERE migration_name IN (
  '<이번 배치 SQL 파일명 1>',
  '<이번 배치 SQL 파일명 2>'
)
ORDER BY id;
```

변경별 대상 객체/카운터 preflight:

```sql
-- 대상 테이블/뷰/인덱스/컬럼 정의 확인
SHOW CREATE TABLE <target_table>;
SHOW CREATE VIEW <target_view>;
SHOW INDEX FROM <target_table>;

-- 변경 대상 row 수 확인
SELECT COUNT(*) AS target_rows
FROM <target_table>
WHERE <이번 변경의 대상 조건>;

-- 변경 전 깨져 있으면 안 되는 상태 확인
SELECT COUNT(*) AS unsafe_rows
FROM <target_table>
WHERE <변경 전 실패 조건>;

-- cutover/backfill/drop이 있으면 Gate별 guard 쿼리를 추가한다.
```

변경 대상 객체가 테이블이 아니거나 SQL 예시와 맞지 않으면 동일 목적의 read-only 조회로 대체하고, `Gate ID + 조회 SQL + 결과 로그 경로`를 남긴다.

운영 반영 후에는 성공한 SQL만 `schema_migrations`에 기록한다. 실패 또는 중단된 SQL은 ledger에 넣지 않고, [DB Migration Gate 정책](../../policy/db-migration-gate-policy.md)의 실패/중단 분류 절차를 따른다.

최종 확인에 최소 아래를 남긴다.

- 운영 DB 식별값
- 적용 SQL 파일명과 SHA-256 checksum
- `schema_migrations` row
- 변경 대상 객체 정의와 대상/위험 카운터
- postcheck guard 결과
- 비적용 Gate의 `Gate ID + N/A 사유 + 근거`

## API 포함 시

운영 EC2에서 실행한다.

```bash
cd /home/projects/coupler-api
git fetch --no-tags origin main
git checkout main
git merge --ff-only origin/main
pnpm install --frozen-lockfile
pm2 restart coupler-api --update-env
pm2 save
pm2 status coupler-api
```

서버 내부와 외부를 모두 확인한다.

```bash
curl -i http://127.0.0.1:3002/
curl -i https://api.ritzy.fourhundred.co.kr/
```

배포 범위와 관련된 핵심 API도 1개 이상 확인하고, 에러 로그를 확인한다.

```bash
pm2 logs coupler-api --lines 100 --nostream
```

## Admin 포함 시

상세 실행은 [Admin 운영 배포 런북](admin-web-production-deploy-flow.md)을 따른다. 이 문서는 Admin 배포 명령을 중복 정의하지 않는다.

```bash
# Admin 운영 배포 런북 실행 후 최소 검증
sudo nginx -t
curl -I http://127.0.0.1:8000
curl -I https://cms.ritzy.fourhundred.co.kr
```

검증 기록에는 배포한 Admin commit SHA, `build/` 산출물 생성 위치(로컬 또는 CI), 업로드/백업 경로, `nginx -t` 결과, 내부/외부 응답을 남긴다.

운영에서 `coupler-admin-web`는 PM2 상시 운영 대상이 아니다. 과거에 잘못 등록된 PM2 앱을 정리해야 할 때만 아래를 실행한다.

```bash
sudo /usr/bin/pm2 stop coupler-admin-web || true
sudo /usr/bin/pm2 delete coupler-admin-web || true
sudo /usr/bin/pm2 save || true
```

## Mobile NextPush 포함 시

워크스페이스 루트에서 배포 전 상태를 확인한다.

```bash
git -C coupler-mobile-app status --short --branch
git -C coupler-mobile-app rev-parse --short HEAD
rg -n "USE_DEV_EC2|versionName|MARKETING_VERSION|CURRENT_PROJECT_VERSION" coupler-mobile-app
nextpush whoami
```

현재 NextPush OTA 배포는 `Production` label만 사용한다.
현재 레포 스크립트는 `nextpush release-react -a <app> -d Production` 형식이며, target binary version은 native metadata에서 추론한다.

```bash
cd coupler-mobile-app

# 레포 스크립트 사용: native metadata에서 target binary version을 추론한다.
yarn codepush-and-prod
yarn codepush-ios-prod
```

target binary version을 명시 고정해야 하는 배포는 레포 스크립트 대신 아래 형식을 사용한다. 같은 플랫폼에 대해 스크립트와 직접 명령을 둘 다 실행하지 않는다.

```bash
cd coupler-mobile-app
nextpush release-react bluedotstudio.official-gmail.com/coupler android -d Production -t <binary-version>
nextpush release-react bluedotstudio.official-gmail.com/coupler-ios ios -d Production -t <binary-version>
```

배포 후 NextPush 이력을 확인한다.

```bash
nextpush deployment history bluedotstudio.official-gmail.com/coupler Production --format json
nextpush deployment history bluedotstudio.official-gmail.com/coupler-ios Production --format json
```

NextPush-only 배포는 스토어 binary 배포가 아니다. native version과 store upload는 변경하지 않고, 릴리즈 기록에는 아래를 남긴다.

- Android/iOS app name
- `Production` label
- uploaded time
- target binary version
- rollout, mandatory, disabled 상태
- 배포한 git commit SHA

## Mobile Store 포함 시

스토어 배포는 NextPush-only와 분리한다. native 변경이 포함되면 Android `versionCode`/`versionName`, iOS `CURRENT_PROJECT_VERSION`/`MARKETING_VERSION`, 스토어 제출 증빙을 릴리즈 기록에 남긴다.

iOS 스토어 제출 전에는 현재 빌드 도구 버전을 기록한다.

```bash
xcodebuild -version
xcrun --sdk iphoneos --show-sdk-version
```

## Tag 포함 시

태그는 운영 반영과 검증이 완료된 커밋에만 생성한다. 레포별 태그는 서로 독립적이며, 공통 버전 강제는 릴리즈 기록에서 명시한 경우에만 적용한다. 서비스 레포(`coupler-api`, `coupler-admin-web`, `coupler-mobile-app`) 태그 push는 GitHub Release 또는 zip artifact를 자동 생성하지 않는다.

```bash
REPO=coupler-api
TAG=vX.Y.Z
git -C "${REPO}" fetch origin
git -C "${REPO}" fetch --tags origin
git -C "${REPO}" checkout main
git -C "${REPO}" pull --ff-only
git -C "${REPO}" status --short --branch
git -C "${REPO}" tag -a "${TAG}" -m "Release ${TAG}"

TAG_COMMIT="$(git -C "${REPO}" rev-list -n 1 "${TAG}")"
git -C "${REPO}" merge-base --is-ancestor "${TAG_COMMIT}" origin/main

git -C "${REPO}" push origin "${TAG}"
git -C "${REPO}" ls-remote --tags origin "${TAG}" "${TAG}^{}"
```

여러 레포를 같은 릴리스 버전으로 닫을 때는 아래 순서로 기록한다.

1. 운영 반영/검증이 끝난 서비스 레포부터 태그를 push한다.
2. `docs/content/releases/vX.Y.Z.md`에 서비스별 태그/SHA와 검증 결과를 반영한다.
3. `docs` `main`을 push해 Pages 기준 문서를 먼저 배포한다.
4. `docs` 태그를 push해 GitHub Release와 문서 artifact를 생성한다.

NextPush-only 모바일 배포는 기본적으로 모바일 git tag를 만들지 않는다. 스토어 binary 배포 또는 릴리즈 기록에서 모바일 레포 기준점 태그가 필요하다고 명시한 경우에만 새 태그를 만든다. 기존 native version 태그와 다른 커밋에 같은 버전 태그를 다시 만들지 않는다. 스토어 심사 중인 빌드는 제출 커밋만 기록하고, 스토어 승인 후 운영 출시와 기본 검증이 끝날 때 모바일 태그를 생성한다.

## Docs 포함 시

문서 배포는 [배포 태그/릴리즈 프로세스](../../policy/release-process.md)의 Docs 배포 절차 중 GitHub Pages 배포를 따른다. 이 문서는 docs 배포 명령을 중복 정의하지 않는다.

최종 기록에는 최소 아래를 남긴다.

- docs commit SHA
- GitHub Pages 배포 workflow 결과
- GitHub Pages URL 또는 workflow 링크

docs tag/GitHub Release를 만드는 경우에는 이 문서의 `Tag/Release Record` 범위에도 포함한다. 이때 `release.yml` 결과, GitHub Release 링크, `docs-site-vX.Y.Z.tar.gz` 첨부 여부를 함께 남긴다.

## 검증 기록

배포 완료 전 아래를 한 번에 확인한다.

```bash
git -C coupler-api status --short --branch
git -C coupler-admin-web status --short --branch
git -C coupler-mobile-app status --short --branch
git -C docs status --short --branch
curl -i https://api.ritzy.fourhundred.co.kr/
curl -I https://cms.ritzy.fourhundred.co.kr
```

최종 기록에는 포함된 범위만 남긴다.

- `DB migration`: 운영 ledger row, checksum, 대상 객체/카운터 preflight, postcheck guard 결과
- `coupler-api`: 운영 커밋 SHA, 외부 응답
- `coupler-admin-web`: 운영 커밋 SHA, 외부 응답, `nginx` 검증 결과
- `Mobile NextPush`: Android/iOS app, `Production` deployment label, target binary version, uploaded time
- `Mobile Store`: native version, build number, 스토어 제출/승인 증빙
- `docs`: commit SHA, GitHub Pages workflow 결과, GitHub Pages URL 또는 workflow 링크
- `Tag/Release Record`: 생성한 서비스 레포별 tag, tag commit SHA; docs tag 포함 시 docs GitHub Release 링크와 site artifact 첨부 여부
- `N/A`: 제외 범위별 사유와 근거

## 예외 흐름

- API 외부 응답이 실패하면 `pm2 status coupler-api`, `pm2 logs coupler-api --lines 100 --nostream`, 서버 내부 `curl` 순서로 원인을 분리한다.
- Admin 외부 응답이 실패하면 `sudo nginx -t`, 내부 `curl -I http://127.0.0.1:8000`, 백업 산출물 존재 여부를 먼저 확인한다.
- DB 반영이 실패하거나 중단되면 같은 SQL을 즉시 재실행하지 않는다. 실제 DB 상태와 ledger를 확인한 뒤 [DB Migration Gate 정책](../../policy/db-migration-gate-policy.md)의 실패/중단 분류를 따른다.
- NextPush 배포를 되돌려야 하면 최신 이전 릴리즈 또는 지정 label로 rollback한다.

```bash
nextpush rollback bluedotstudio.official-gmail.com/coupler Production
nextpush rollback bluedotstudio.official-gmail.com/coupler-ios Production

nextpush rollback bluedotstudio.official-gmail.com/coupler Production --targetRelease v<N>
nextpush rollback bluedotstudio.official-gmail.com/coupler-ios Production --targetRelease v<N>
```

## 비포함 / 금지

- 이 문서를 policy 대신 사용하지 않는다.
- 배포 범위에 포함되지 않은 DB/API/Admin/Mobile 작업을 관성적으로 실행하지 않는다.
- 운영 DB write 작업을 [DB Migration Gate 정책](../../policy/db-migration-gate-policy.md) 통과 없이 실행하지 않는다.
- `coupler-admin-web`를 PM2 프로세스 앱처럼 운영하지 않는다.
- NextPush-only 배포에서 native version을 이유 없이 올리거나 기존 버전 태그를 다른 커밋에 재사용하지 않는다.

## 관련 문서

- [배포 태그/릴리즈 프로세스](../../policy/release-process.md)
- [DB Migration Gate 정책](../../policy/db-migration-gate-policy.md)
- [Admin 운영 배포 런북](admin-web-production-deploy-flow.md)
- [레포지토리 요약](../../architecture/repo-overview.md)
