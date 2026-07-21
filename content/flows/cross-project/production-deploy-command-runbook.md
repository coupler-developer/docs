# 운영 배포 명령어 런북

## 문서 역할

- 역할: `시나리오`
- 문서 종류: `flow`
- 충돌 시 우선 문서: [배포/릴리즈 프로세스](../../policy/release-process.md), [배포 태그 정책](../../policy/release-tag-policy.md)
- 기준 성격: `as-is`

## 목적

- 운영 배포 시 `DB`, `API`, `Admin`, `Mobile`, `docs`, `Tag` 범위를 먼저 고르고, 포함된 범위에 필요한 명령어만 누락 없이 실행하게 한다.

## 범위

- 시작 조건: 배포 대상 커밋, 배포 범위, 운영 접근 권한, 검증 시나리오가 확정된 상태
- 종료 조건: 포함된 범위의 운영 반영, 외부 응답 확인, 태그/NextPush/docs Pages/DB ledger 기록 확인이 완료된 상태
- 제외 범위: 신규 SQL 작성, 스토어 심사 정책 해석, docs GitHub Release 본문 상세 작성
- 개발계 배포 명령을 실행할 때도 이 문서의 `환경별 사전 확인`을 적용한다. 단, 운영 태그/릴리즈 기록 완료 조건은 운영계 반영에만 적용한다.

## 상위 규범 문서

- [배포/릴리즈 프로세스](../../policy/release-process.md)
- [배포 태그 정책](../../policy/release-tag-policy.md)
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
| `coupler-api` | API 코드 또는 서버 런타임 설정 변경을 운영 EC2에 반영함 | 이 문서의 API 절차 |
| `coupler-admin-web` | Admin 화면 변경을 운영 정적 산출물로 반영함 | [Admin 운영 배포 런북](admin-web-production-deploy-flow.md) |
| `Mobile Store` | native binary 또는 스토어 제출이 필요함 | [배포/릴리즈 프로세스](../../policy/release-process.md) |
| `Mobile NextPush` | JS-only OTA 배포가 필요함 | 이 문서의 NextPush 절차 |
| `docs` | 문서 변경을 GitHub Pages로 배포함 | [배포/릴리즈 프로세스](../../policy/release-process.md)의 Docs 배포와 정정 규칙 |
| `Tag/Release Record` | 운영 반영 기준점 기록이 필요함 | [배포/릴리즈 프로세스](../../policy/release-process.md) |

## 공통 사전 확인

워크스페이스 루트에서 실행한다.

릴리즈 전체 gate 판정은 [릴리즈 자동화 파이프라인](release-automation-pipeline.md)을 먼저 따른다.
이 문서는 preflight 실패 원인 확인, 실제 배포 명령, 운영 확인, 롤백 명령을 제공한다.

표준 단일 PR 흐름은 docs 작업 브랜치에 `pending` 커밋을 push하고 Draft PR을 연 뒤 실행한다.

```bash
cd docs
PR_NUMBER=<docs PR 번호>
PENDING_REF="$(git rev-parse HEAD)"

test "$(git rev-parse @{upstream})" = "${PENDING_REF}"
test "$(gh pr view "${PR_NUMBER}" --json headRefOid --jq .headRefOid)" = "${PENDING_REF}"
test "$(gh pr view "${PR_NUMBER}" --json isDraft --jq .isDraft)" = "true"
gh pr view "${PR_NUMBER}" --json state,isDraft,headRefOid,statusCheckRollup,url

yarn release:preflight \
  --version vX.Y.Z \
  --workspace-root .. \
  --pending-ref "${PENDING_REF}"
```

선택 인자와 허용값은 실행 시점의 `yarn release:preflight --help`를 단일 명령 기준으로 확인한다.

- `PENDING_REF`는 축약 SHA가 아닌 40자 commit SHA를 사용한다.
- 명령이 `PASS`한 원격 Draft PR 기준점만 운영 배포 입력으로 사용한다. branch·metadata·service repo 판정은
  [배포/릴리즈 프로세스](../../policy/release-process.md)와 공통 schema/derived model을 따른다.
- 최종 전체 CI와 리뷰 완료 전까지 PR은 Draft로 유지한다.

`--pending-ref` 없는 기존 main preflight는 과거 terminal 기록 postcheck 또는 corrective reissue 호환용이다. 신규 릴리즈의 배포 시작 기준으로 사용하지 않는다.

```bash
cd docs
yarn release:preflight --version vX.Y.Z --workspace-root ..
```

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

## 환경별 사전 확인

개발계와 운영계 중 어느 환경에 반영하는지 먼저 고정하고, 결과 기록에 남긴다.

| 항목 | 개발계 배포 | 운영계 배포 |
| --- | --- | --- |
| 목적 | 운영 전 검증, 내부 확인 | 실사용자 대상 반영 |
| 기준 커밋 | 검증 대상 커밋 또는 `main` 병합 후보 | `main`에 병합된 배포 커밋 |
| 태그/릴리즈 | 생성하지 않음 | post-deploy 검증 완료 후 생성 |
| DB/RDS | 개발 DB 식별값 확인 | 운영 DB 식별값과 Gate 확인 |
| Admin API URL | 개발 API를 바라보는지 확인 | 운영 API를 바라보는지 확인 |
| GitHub Packages auth | 설치 실행 OS 사용자 기준 user-level auth | 설치 실행 OS 사용자 기준 user-level auth |

환경별 공통 주의:

- `Manage Actions access`는 GitHub Actions 전용이다. EC2에서 SSH로 접속해 실행하는 `yarn install`은 `ubuntu`, `deploy`, `root` 등 실제 실행 사용자 홈의 npm auth를 사용한다.
- `sudo yarn install`은 `root`의 npm 설정을 사용한다. install/build 실행 사용자와 npm auth 설정 사용자를 일치시킨다.
- `coupler-admin-web`의 `yarn build`는 `.env.development`를 읽지 않는다. 개발계 정적 빌드도 `build/` 산출물을 만들면 build 시점의 production-mode 환경값이 번들에 고정된다.
- 개발계 Admin 빌드는 개발 API URL을, 운영계 Admin 빌드는 운영 API URL을 바라보는지 배포 전에 확인한다. 잘못된 API URL로 빌드된 산출물은 업로드하지 않는다.
- 개발계 검증 성공은 운영 EC2, 운영 npm auth, 운영 RDS, 운영 도메인 검증을 대체하지 않는다.
- 운영 배포 전에는 운영 외부 응답 기준선과 롤백 기준을 먼저 남긴다. 개발계 배포에서는 운영 태그를 만들지 않는다.

## DB Migration 포함 시

DB 변경은 이 문서의 명령어만으로 승인하지 않는다. [DB Migration Gate 정책](../../policy/db-migration-gate-policy.md)의 실행 검증 파이프라인을 통과한 SQL만 운영에 반영한다.

운영 write 전에 read-only preflight를 남긴다. preflight는 `공통 식별값 + ledger + 변경 대상 객체/카운터` 3종이 모두 있어야 완료다.

합의된 영구 migration 경로가 없는 서비스 레포에는 feature PR에서 새 migration 디렉터리를 만들지 않는다. 수동 SQL과 배포 순서는 DB Migration Gate 정책의 `SQL 산출물 위치`, `DB와 애플리케이션 배포 순서` 기준을 따른다.

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

`coupler-api`의 `config/default*.json`, 운영 `config/production*.json`, `config/production*.json.example`, 운영 환경변수, DB pool, connection timeout, runtime config 로딩 경로가 바뀌면 DB migration이 없어도 API 배포 범위에 포함한다. 이 경우 `pm2 restart coupler-api --update-env`까지 실행해 프로세스 시작 시점 설정을 다시 로드하고, 릴리즈 기록에는 `DB migration: N/A` 사유와 API 재시작 근거를 남긴다.

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

배포 범위와 관련된 핵심 API도 1개 이상 확인하고, 에러 로그를 확인한다. DB pool/timeout 설정 변경이면 DB 연결 오류, queue limit 오류, p95/p99 latency, RDS connection/running thread 지표도 post-deploy 확인 항목에 포함한다.

```bash
pm2 logs coupler-api --lines 100 --nostream
```

큐레이터 또는 매칭 1:1 실시간 채팅이 배포 범위이면 다음 항목을 API 완료 조건에 추가한다.

배포 전 `t_concierge`의 nullable sender/idempotency expand와 schema postcheck가 통과했는지 확인한다. 매칭
채팅이 포함되면 `90_expand_match_chat_idempotency.sql`과 `91_postcheck_match_chat_idempotency.sql` ledger 각
1건, `t_match_chat.client_message_id` exact column, `uq_t_match_chat_member_client(member, client_message_id)`
unique index, `chk_t_match_chat_message_identity` exact check clause, invalid identity 0건을 DB Migration Gate로
확인한다. migration 90의 ledger·column·index·check가 모두 없는 현재 운영 baseline은 `BLOCKED`이며 migration
90 적용과 migration 91 postcheck가 성공하기 전에는 API·Admin·Mobile을 배포하지 않는다.

contracts `0.1.18` published latest와 API source, Admin·Mobile dependency·lockfile의 exact version이 같아야 한다.
API, Admin, Android·iOS NextPush는 큐레이터·매칭 최종 계약의 단일 배포 단위로 반영하며 일부만 활성 상태로 남겨
완료 처리하지 않는다. `client_message_id` 누락 수용이나 구형 목록 endpoint는 배포 안전장치로 두지 않는다.
native 변경이 없으면 이 단계 자체는 Store 재심사 사유가 아니다.
동일 멱등 키 재전송, 다른 payload 충돌, 필수 키 형식 거부와 부수효과 단일 발행은 배포 전 API 자동화
테스트로 검증하며 운영 smoke에서 인위적으로 재현하지 않는다.

1. 외부 reverse proxy/load balancer가 `/realtime/admin`, `/realtime/member`의 HTTP Upgrade와
   `Connection: upgrade`를 `coupler-api`로 전달하는지 인프라 설정과 브라우저 Network 탭에서 확인한다.
2. 운영 Admin에 Super 또는 테스트 회원의 현재 `CHARGE` 관리자로 로그인하고 표준 WebSocket 요청이
   `wss://api.ritzy.fourhundred.co.kr/realtime/admin`에 연결된 뒤 `realtime:ready`를 받는지 확인한다.
3. 운영 Mobile 빌드를 Android와 iOS 실제 기기에서 각각 foreground로 열고 같은 WSS에 연결되는지 확인한다.
   React Native가 `https://api.ritzy.fourhundred.co.kr` Origin을 보내도 handshake가 허용돼야 한다. 이번 변경이
   JS/TypeScript·설정 범위의 NextPush-only라면 이 양 플랫폼 smoke는 필요하지만 Store 재심사나 native build
   제출은 필요하지 않다. native 파일·권한·SDK·빌드 메타데이터 변경이 있을 때만 Store 제출 범위를 별도로 판정한다.
4. 테스트 회원과 Admin 사이에 양방향 메시지를 한 번씩 보내 DB 저장 후 즉시 표시되는지, 새로고침 없이 안 읽은
   수와 양쪽 읽음 표시가 바뀌는지 확인한다. 테스트 본문이나 JWT를 배포 로그에 남기지 않는다.
5. Mobile을 큐레이터 대화방이 아닌 foreground 화면에 둔 상태에서 Admin 메시지를 보내 시스템 알림은 한 번
   표시되고, WebSocket과 FCM으로 동일 상태 갱신이 중복 적용되지 않는지 확인한다.
6. Admin 브라우저 탭을 숨긴 상태와 Mobile 대화 route가 focus를 잃은 상태에서는 읽음이 바뀌지 않고, 다시 보이면
   읽음과 통합 채팅 목록 배지가 따라잡는지 확인한다.
7. API 로그에서 인증·권한 거부 급증, 반복 재연결, 이벤트 발행 오류가 없는지 확인한다. Admin 수신자 조회 실패 뒤
   `REALTIME_UNAVAILABLE`·`1011` 재연결과 HTTP cursor 최신 페이지 복구가 동작하고 소켓이 정상인 것처럼 남지 않아야 한다.
   연결 뒤 관리자 역할 또는 `t_manager` 연결을 회수한 테스트에서는 다음 읽음 명령이
   `AUTH_SUBJECT_RESTRICTED`·`4403`으로 닫히고, 특정 회원의 `CHARGE` 배정만 회수하면 해당 대상만
   `FORBIDDEN`인지 확인한다. 연결된 테스트 회원을 보류 상태로 바꾼 뒤에는 다음 읽음 명령과 새 상담 이벤트가
   적용·전달되지 않고 해당 회원 소켓이 `AUTH_SUBJECT_RESTRICTED`·`4403`으로 닫히는지도 확인한다.
8. 현재 PM2가 단일 프로세스인지 확인한다. cluster 또는 다중 인스턴스이면 인스턴스 간 이벤트 broker가 없는
   상태로 배포하지 않는다.
9. Admin·Mobile에서 첫 cursor 페이지와 `next_before_id` 과거 페이지를 각각 조회하고, 페이지 사이에 새 메시지를
   보내도 ID 누락·중복이 없는지 확인한다. `/admin/member/concierge/chat_list`, `/app/chat/list`,
   `/app/chat/checkNew`는 404이고 목록 GET이 읽음 상태를 바꾸지 않아야 한다.
10. Android·iOS에서 테스트 매칭의 첫 cursor 페이지와 과거 페이지를 조회하고 WebSocket 수신 메시지가 DB `id`
    기준으로 중복 없이 합쳐지는지 확인한다. `/app/match/chat/list`는 404여야 한다.
11. 매칭 대화방을 focus에서 벗어난 상태로 조회해도 읽음 경계가 바뀌지 않고, focus 복귀 후
    `POST /app/match/chat/read`를 호출했을 때만 상대방 발신 경계와 `match:read:updated`가 전진하는지 확인한다.

WSS smoke가 실패하면 Admin·Mobile 배포를 진행하지 않는다. HTTP 메시지 저장이 성공하더라도 실시간 완료로
판정하지 않으며 reverse proxy Upgrade 전달, WebSocket 인증, PM2 프로세스 수 순서로 원인을 분리한다. 상세
프로토콜은 [채팅 시스템](../../architecture/chat-system.md)의 `큐레이터 채팅`, rollback은 이 문서의 `예외 흐름`을
따른다.

## Admin 포함 시

상세 실행은 [Admin 운영 배포 런북](admin-web-production-deploy-flow.md)을 따른다. 이 문서는 Admin 배포 명령을 중복 정의하지 않는다.

Admin 배포 전에는 아래를 반드시 확인한다.

- 개발계 배포: build 산출물이 개발 API URL을 바라보는지 확인하고, 운영 태그/릴리즈를 만들지 않는다.
- 운영계 배포: build 산출물이 운영 API URL을 바라보는지 확인하고, 운영 반영 후 로그인/핵심 화면/주요 액션/브라우저 콘솔을 별도로 검증한다.
- EC2에서 직접 install/build하면 설치 실행 OS 사용자 기준 GitHub Packages auth가 있어야 한다.

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
현재 레포의 운영 스크립트는 app과 platform을 positional argument로 넘기고, mandatory와 target binary
`2.2.1`을 명시한다. 실행 전 Store의 운영 binary가 `2.2.1`인지 확인하며 대상 버전이 바뀌면 스크립트와
릴리즈 기록을 같은 변경 단위에서 갱신한다.

```bash
cd coupler-mobile-app

# 레포 스크립트 사용: Android/iOS 모두 Production mandatory, target 2.2.1
yarn codepush-and-prod
yarn codepush-ios-prod
```

다른 target binary version을 명시해야 하는 배포는 레포 스크립트를 먼저 갱신·리뷰하거나 아래 형식을 직접
사용한다. 같은 플랫폼에 대해 스크립트와 직접 명령을 둘 다 실행하지 않는다.

```bash
cd coupler-mobile-app
nextpush release-react bluedotstudio.official-gmail.com/coupler android -d Production -m -t <binary-version>
nextpush release-react bluedotstudio.official-gmail.com/coupler-ios ios -d Production -m -t <binary-version>
```

배포 후 NextPush 이력을 확인한다.

```bash
nextpush deployment history bluedotstudio.official-gmail.com/coupler Production --format json
nextpush deployment history bluedotstudio.official-gmail.com/coupler-ios Production --format json
```

NextPush-only 배포는 스토어 binary 배포가 아니다. native version과 store upload는 변경하지 않고, 실제 명령
결과를 [배포/릴리즈 프로세스](../../policy/release-process.md)의 해당 scope terminal evidence 계약에 남긴다.

## Mobile Store 포함 시

스토어 배포는 NextPush-only와 분리한다. native 변경이 포함되면 Android `versionCode`/`versionName`, iOS `CURRENT_PROJECT_VERSION`/`MARKETING_VERSION`, 스토어 제출 증빙을 릴리즈 기록에 남긴다.

iOS 스토어 제출 전에는 현재 빌드 도구 버전을 기록한다.

```bash
xcodebuild -version
xcrun --sdk iphoneos --show-sdk-version
```

스토어 심사 제출 직후에는 운영 출시 완료 전 기준점을 잃지 않도록 [배포 태그 정책](../../policy/release-tag-policy.md)에 따라 제출 마커 태그를 만든다.

```bash
REPO=coupler-mobile-app
TAG=submitted/mobile-X.Y.Z-BUILD
COMMIT=<submitted-commit-sha>
git -C "${REPO}" tag -a "${TAG}" "${COMMIT}" \
  -m "Submitted Mobile Store X.Y.Z (BUILD)" \
  -m "Android artifact: <path>, sha256: <sha256>" \
  -m "iOS archive: <path>, sha256: <sha256>" \
  -m "Uploaded/submitted at: <timestamp>" \
  -m "Bundle/hash evidence: <android-codepush-hash-or-bundle>, <ios-bundle-hash>" \
  -m "Evidence: <why this commit matches the submitted artifact>"
git -C "${REPO}" push origin "${TAG}"
git -C "${REPO}" ls-remote --tags origin "${TAG}" "${TAG}^{}"
```

Android/iOS platform별 제출 마커 태그 분리 여부와 `vX.Y.Z` 릴리즈 태그 생성 시점은 [배포 태그 정책](../../policy/release-tag-policy.md)을 따른다.

스토어 승인, 실제 출시, 기본 smoke 검증, `vX.Y.Z` 릴리즈 태그 push, 릴리즈 기록 문서의 제출 증빙 이관이 끝나면 해당 릴리스의 `submitted/*` 태그를 삭제한다.

```bash
REPO=coupler-mobile-app
TAG=submitted/mobile-X.Y.Z-BUILD

git -C "${REPO}" tag -d "${TAG}"
git -C "${REPO}" push origin ":refs/tags/${TAG}"
git -C "${REPO}" ls-remote --tags origin "${TAG}" "${TAG}^{}"
```

Android/iOS 제출 마커를 분리한 경우에는 각 platform 태그를 같은 조건으로 각각 삭제한다. `ls-remote` 결과가 비어 있어야 원격 삭제 완료로 기록한다.

## Tag 포함 시

이 절의 `vX.Y.Z` 릴리즈 태그는 [배포 태그 정책](../../policy/release-tag-policy.md)의 운영 반영/검증 완료 기준을 만족한 뒤 생성한다. 레포별 태그는 서로 독립적이며, 공통 버전 강제는 릴리즈 기록에서 명시한 경우에만 적용한다.

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

서비스 태그 명령이 끝나면 [릴리즈 자동화 파이프라인](release-automation-pipeline.md)의 Final Record Gate로
돌아간다. 기록 상태 전이, Ready/병합, docs tag 순서는 그 flow가 소유한다.

NextPush-only 모바일 배포, 스토어 심사 중인 빌드, 모바일 릴리즈 태그 생성 기준은 [배포 태그 정책](../../policy/release-tag-policy.md)을 따른다.

## Docs 포함 시

문서 배포와 정정 허용 조건은 [배포/릴리즈 프로세스](../../policy/release-process.md)의
`Docs 배포와 정정 규칙`을 따른다. 아래는 해당 Gate가 허용된 뒤 실행할 명령이다.

```bash
cd docs
git checkout main
git pull --ff-only

TAG=vX.Y.Z
git tag -a "${TAG}" -m "Release ${TAG}"

# 원격 push 전 Release Note preview를 생성하고 리뷰한다.
PREVIEW_PATH="site/release-notes-${TAG}.md"
mkdir -p site
GITHUB_REPOSITORY=coupler-developer/docs \
  bash .github/scripts/generate-release-notes.sh "${TAG}" \
  > "${PREVIEW_PATH}"

TAG_COMMIT="$(git rev-list -n 1 "${TAG}")"
git merge-base --is-ancestor "${TAG_COMMIT}" origin/main

git push origin "${TAG}"
git ls-remote --tags origin "${TAG}" "${TAG}^{}"
```

preview에서 Finding이 있으면 원격 tag를 push하지 않는다. 로컬 tag를 갱신한 뒤 Release Note preview,
`yarn validate:docs`, 문서 안정성 평가를 다시 통과한다.

tag push 뒤 GitHub Actions의 `Release Docs`, 동일 tag의 GitHub Release, Release 본문 릴리즈 기록 링크,
`docs-site-vX.Y.Z.tar.gz` artifact를 확인한다.

최종 기록에는 최소 아래를 남긴다.

- docs commit SHA
- GitHub Pages 배포 workflow 결과
- GitHub Pages URL 또는 workflow 링크

docs tag/GitHub Release를 만드는 경우에는 이 문서의 `Tag/Release Record` 범위에도 포함한다. 이때 `release.yml` 결과, GitHub Release 링크, `docs-site-vX.Y.Z.tar.gz` 첨부 여부를 함께 남긴다.

docs GitHub Release를 정정 재발행해야 하는 경우에는 정책의 `docs-only corrective reissue` 조건을 먼저
충족한다. 이 경우 서비스 레포 tag는 재발행 대상이 아니며, docs Release 본문과 artifact 교체만 확인한다.

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

최종 기록에는 포함 범위의 실제 명령·로그·workflow 결과를
[배포/릴리즈 프로세스](../../policy/release-process.md)의 scope별 evidence 계약에 맞춰 남긴다. 이 runbook의
섹션별 출력 목록은 실행 보조이며 별도 metadata 계약이 아니다.

## 예외 흐름

- API 외부 응답이 실패하면 `pm2 status coupler-api`, `pm2 logs coupler-api --lines 100 --nostream`, 서버 내부 `curl` 순서로 원인을 분리한다.
- 채팅 WSS 연결만 실패하면 외부 proxy Upgrade 전달, `/realtime/admin`·`/realtime/member` 경로, JWT 인증
  로그, PM2 프로세스 수를 확인한다. HTTP polling을 임시 fallback으로 추가해 완료 처리하지 않는다.
- 큐레이터 또는 매칭 실시간 채팅 배포 뒤 문제가 생기면 API, Admin 정적 artifact, Android·iOS NextPush를 같은
  직전 검증 기준점으로 함께 rollback한다. nullable expand DB 스키마는 과거 행 보존과 rollback 호환을 위해
  유지하지만, 현재 배포에 누락 필드 수용이나 구형 목록 endpoint를 새로 추가하지 않는다.
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

- [배포/릴리즈 프로세스](../../policy/release-process.md)
- [DB Migration Gate 정책](../../policy/db-migration-gate-policy.md)
- [Admin 운영 배포 런북](admin-web-production-deploy-flow.md)
- [레포지토리 요약](../../architecture/repo-overview.md)
