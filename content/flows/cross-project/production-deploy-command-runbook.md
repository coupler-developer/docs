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
- [DB Migration 유지보수 정책](../../policy/db-migration-gate-policy.md)
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
| `DB migration` | 스키마, 데이터, view, 읽기 기준 변경이 운영 DB에 필요함 | [DB Migration 유지보수 정책](../../policy/db-migration-gate-policy.md) |
| `coupler-api` | API 코드 또는 서버 런타임 설정 변경을 운영 EC2에 반영함 | 이 문서의 API 절차 |
| `coupler-admin-web` | Admin 화면 변경을 운영 정적 산출물로 반영함 | [Admin 운영 배포 런북](admin-web-production-deploy-flow.md) |
| `Mobile Store` | native binary 또는 스토어 제출이 필요함 | [배포/릴리즈 프로세스](../../policy/release-process.md) |
| `Mobile NextPush` | JS-only OTA 배포가 필요함 | 이 문서의 NextPush 절차 |
| `docs` | 문서 변경을 GitHub Pages로 배포함 | [배포/릴리즈 프로세스](../../policy/release-process.md)의 Docs 배포와 불변 규칙 |
| `Tag/Release Record` | 운영 반영 기준점 기록이 필요함 | [배포/릴리즈 프로세스](../../policy/release-process.md) |

## 공통 사전 확인

워크스페이스 루트에서 실행한다.

릴리즈 전체 gate 판정은 [릴리즈 자동화 파이프라인](release-automation-pipeline.md)을 먼저 따른다.
이 문서는 preflight 실패 원인 확인, 실제 배포 명령, 운영 확인, 롤백 명령을 제공한다.

표준 단일 PR 흐름은 docs 작업 브랜치의 원격 기준점을 열린 PR에 push한 뒤 실행한다.

```bash
cd docs
PR_NUMBER=<docs PR 번호>
PENDING_REF="$(git rev-parse HEAD)"

test "$(git rev-parse @{upstream})" = "${PENDING_REF}"
test "$(gh pr view "${PR_NUMBER}" --json headRefOid --jq .headRefOid)" = "${PENDING_REF}"
gh pr view "${PR_NUMBER}" --json state,headRefOid,statusCheckRollup,url

yarn release:preflight \
  --version vX.Y.Z \
  --workspace-root .. \
  --pending-ref "${PENDING_REF}"
```

선택 인자와 허용값은 실행 시점의 `yarn release:preflight --help`를 단일 명령 기준으로 확인한다.

- `PENDING_REF`는 축약 SHA가 아닌 40자 commit SHA를 사용한다.
- 명령이 `PASS`한 원격 PR 기준점만 운영 배포 입력으로 사용한다. branch·metadata·service repo 판정은
  [배포/릴리즈 프로세스](../../policy/release-process.md)와 공통 schema/derived model을 따른다.

`main`에 이미 병합된 과거 릴리스 기록은 preflight 입력으로 사용하지 않는다. 과거 파일은 파싱·재검증하지
않고 base와 현재 최종 트리의 경로·blob 불변성만 확인한다.

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

DB migration은 [DB Migration 유지보수 정책](../../policy/db-migration-gate-policy.md)의 절차만 사용한다.
서비스가 쓰기를 계속하는 상태에서는 실행하지 않는다.

### 1. Writer inventory와 중지

환경별로 아래 writer/effect producer의 실제 runtime unit, source ref/compatibility-config SHA, owner,
중지 명령과 확인 명령을 `writer-inventory/v2`에 정한다. 항목이 없으면 owner·부재 근거와 검증을 기록하며
임의로
생략하지 않는다.

| Writer | 중지 확인 |
| --- | --- |
| API HTTP write | API 프로세스 중지와 health/write endpoint 차단 |
| Admin write | Admin backend 또는 write route 차단 |
| WebSocket | socket server/consumer 중지와 in-flight 확인 |
| cron scheduler | scheduler 중지 |
| background worker | queue consumer/worker, cursor/in-flight와 외부효과 producer 중지 |
| direct SQL | 운영 작업자와 자동화 계정의 write 금지 |

모든 writer와 queue/external-effect producer를 중지할 수 없으면 `BLOCKED`로 종료한다.

### 2. Drain과 backup

DB identity와 TLS를 예상값과 대조하고, application writer session과 활성 transaction이 0건인지 fresh
query로 확인한다. 실행기 자신의 연결만 제외할 수 있다. 복원 가능한 snapshot/backup ref와 digest도 함께
고정한다.

Credential, host와 DB identity 원문은 릴리스 기록에 평문으로 넣지 않는다. 실행 기록에는 필요한 digest만
남긴다.

### 3. Plan과 실행

API 저장소의 maintenance executor로 환경별 `plan.json`을 생성한다. Plan은 catalog 전체를
`appliedRefs + recoveredRefs[].ref + pendingRefs`로 exact partition하고 pending 순서를 고정해야 한다.
이전·현재·실제 혼합 runtime set의 unit/source ref/compatibility-config SHA/역할, 변경된
read/write/state 경계, 시작·최종
physical schema SHA-256과 허용 조합, DB·queue·외부효과 표면과 복구 전략도 immutable runtime contract로
포함한다.

Exclusive DB lock을 획득한 뒤 identity, drain, ledger prefix, catalog와 SQL checksum을 다시 확인한다.
lock을 보유한 채 실제 시작 runtime mixture와 schema fingerprint를 담은 `FENCED` event를 파일과 부모
디렉터리에 `fsync`한다. 각 pending file은 `migration-started` 뒤 checksum-bound SQL 내부의 fail-closed
precondition, target mutation, 별도 live postcondition, ledger 순서로 실행한다. precondition은 target
mutation 전에 실패하는 leading query 또는 stored routine guard다. lock 안에서 migration/postcondition
파일을 한 번 읽어 checksum을 확인한 같은 bytes만 실행하고 성공·실패는 별도 수기 artifact가 아니라 SQL
outcome event에 귀속한다. 실패·중단 또는 부분 적용을 완료 ledger로 기록하지 않는다.
모든 execution event의 environment와 `planSha256`이 현재 plan과 정확히 일치해야 하며 다른 plan의 완료
execution을 fast path나 재진입 근거로 사용하지 않는다.

개발계의 전체 postcheck와 execution 완료 전에는 운영계를 시작하지 않는다. 운영 plan은 개발계 plan과
execution의 bytes SHA를 함께 참조하고, execution을 해당 개발계 plan의 환경별 partition과
`planSha256`으로 검증한 뒤 catalog/runtime-contract SHA가 같은지 확인한다. 운영 maintenance 명령은
live DB에 진입할 때마다 이 pair를 다시 검증한다.

### 4. 재기동과 산출물

전체 postcheck와 catalog/ledger 완료, lock 해제 뒤 writer가 닫힌 FENCED에서 최초 재개 조합과 같은
execution에서 쓸 모든 복구 target 조합을 smoke한다. read-only, transaction rollback, isolated synthetic
중 계획한 procedure와 별도 result ref를 사용하고 DB·queue·외부효과 모든 표면의 residual 0을 증명한다.

현재 완전 릴리즈+최종 DB 조합과 표면별 시작 watermark를 담은 `RESUMED` event를 durable하게 기록한 뒤에만
writer/effect producer를 열고 운영 smoke를 수행한다. 재시작한 모든 unit의 실제 source ref와
compatibility-config SHA가 active mixture와 일치하는 running inventory까지 확인해야 서비스를 완료할 수
있다. 재개 뒤 이전 릴리즈로 돌아갈 수 있다고 기록하려면 그 final-DB 조합을 FENCED에서 미리 smoke하고,
재개 뒤 수락한 write와 queue cursor/in-flight/idempotency/외부효과의 무손실 보존 근거가 있어야 한다.
없으면 snapshot/PITR rollback 대신 forward fix 또는 통제된 lossless reconciliation을 사용한다. API 계약도
깨질 때만 별도 `apiContractCutover` 장벽을 함께 적용한다.

환경별 산출물은 다음 두 개뿐이다.

- `content/releases/evidence/db-migrations/<version>/<environment>/plan.json`
- `content/releases/evidence/db-migrations/<version>/<environment>/execution.jsonl`

릴리스 metadata에는 네 파일의 경로와 실제 bytes SHA-256만 기록한다. 별도 Gate 로그, 서명 bundle,
trust/frontier 파일을 만들지 않는다.

SQL 성공 후 ledger 기록만 실패한 경우에는 DB identity, checksum과 postcondition을 다시 확인한 뒤
ledger-only repair를 수행한다. `started` 뒤 outcome event가 끊겼으면 같은 SQL을 재실행하지 않고 fresh
ledger/postcondition으로 adjudicate한 event를 먼저 남긴다. 성공·ledger 없음만 repair하고 실패면 실패
plan+execution의 hash, DB identity와 target을 결속한 새 번호 recovery migration/immutable plan/execution으로
복구한다. 재개 뒤 복구는 producer를 다시 fence·drain하고 종료 watermark를 고정한 `RECOVERING`에서만
수행하며 `complete-recovery` 뒤 target과 fresh 시작 watermark를 새 `RESUMED` event로 기록한 후 writer를
열고 완료한다. `begin-recovery`와 `complete-recovery`가 각각 live ledger의 최종 migration 상태를
재확인하지 못하면 복구 작업을 진행하지 않는다.

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
unique index, `chk_t_match_chat_message_identity` exact check clause, invalid identity 0건을 DB migration postcheck로
확인한다. 한 항목이라도 없거나 migration 91 postcheck가 실패하면 `BLOCKED`이며
API·Admin·Mobile을 배포하지 않는다.

contracts published latest와 API source, Admin·Mobile dependency·lockfile의 exact version이 같아야 한다.
API, Admin, Android·iOS NextPush는 큐레이터·매칭 최종 계약의 단일 배포 단위로 반영하며 일부만 활성 상태로 남겨
완료 처리하지 않는다. `client_message_id` 누락 수용이나 구형 목록 endpoint는 배포 안전장치로 두지 않는다.
native 변경이 없으면 이 단계 자체는 Store 재심사 사유가 아니다.
이 문단의 큐레이터·매칭 legacy endpoint 제거는 `API cutover: Yes` 범위다.
이 source 정렬은 이미 설치된 이전 Mobile 계약의 차단 또는 API/DB 호환 증빙이 아니다. 해당 배포의
release-scoped 소비자 case와 `API cutover`, DB runtime/schema 조합은
[엔지니어링 가드레일](../../policy/engineering-guardrails.md)에 따라 별도로 확인한다.
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
현재 레포의 운영 스크립트는 app과 platform을 positional argument로 넘기고, mandatory와 target binary를
명시한다. target binary의 실행 SoT는 Mobile `package.json`의 플랫폼별 Production script다. 실행 전
script의 `-t`가 Store의 운영 binary와 일치하는지 확인하며 대상 버전이 바뀌면 script와 릴리즈 기록을 같은
변경 단위에서 갱신한다.

```bash
cd coupler-mobile-app

# 배포할 플랫폼의 Production script 하나만 실행
yarn codepush-and-prod
yarn codepush-ios-prod
```

Production script는 NextPush 실행 전에 API contracts의 manifest·lockfile·설치 version exact match를
검사하며 불일치하면 실패한다. 다른 target binary가 필요하면 직접 `nextpush release-react`를 실행하지 않고
Mobile `package.json`의 해당 script를 먼저 갱신·리뷰한다.

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

API/DB 변경이 포함되면 심사 제출 시 운영 `min_version`을 바꾸지 않고 release-scoped 소비자 case와
`API cutover`, DB runtime/schema 조합을 각각 판정한다. API `No`이면 지원 이전 운영 앱과 새 API+최종 DB
smoke를 유지한 채 일반 출시한다. API `Yes`이면
심사 승인과 새 build의 출시 가능 상태를 확인한 뒤 서버 측 요청 차단이 포함된 activation window에서
API/Admin과 Store를 전환한다. DB migration도 포함되면 별도 FENCED/RESUMED maintenance 순서를 결합한다.
강제 업데이트를 적용해도 장벽 중 이전 build의 bootstrap/version/upgrade 응답은 이해 가능해야 하고,
호환 불가능한 product request의 결정론적 거부와 적용 후 smoke를 확인한다. 앱 팝업만으로 장벽을
보장했다고 판정하지 않는다.

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
돌아간다. 최종 기록 검증, 병합, docs tag 순서는 그 flow가 소유한다.

NextPush-only 모바일 배포, 스토어 심사 중인 빌드, 모바일 릴리즈 태그 생성 기준은 [배포 태그 정책](../../policy/release-tag-policy.md)을 따른다.

## Docs 포함 시

문서 배포와 과거 기록 불변 조건은 [배포/릴리즈 프로세스](../../policy/release-process.md)의
`Docs 배포와 불변 규칙`을 따른다. 아래는 해당 Gate가 허용된 뒤 실행할 명령이다.

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
`yarn verify`, 문서 안정성 평가를 다시 통과한다.

tag push 뒤 GitHub Actions의 `Release Docs`, 동일 tag의 GitHub Release, Release 본문 릴리즈 기록 링크,
`docs-site-vX.Y.Z.tar.gz` artifact를 확인한다.

최종 기록에는 최소 아래를 남긴다.

- docs commit SHA
- GitHub Pages 배포 workflow 결과
- GitHub Pages URL 또는 workflow 링크

docs tag/GitHub Release를 만드는 경우에는 이 문서의 `Tag/Release Record` 범위에도 포함한다. 이때 `release.yml` 결과, GitHub Release 링크, `docs-site-vX.Y.Z.tar.gz` 첨부 여부를 함께 남긴다.

docs GitHub Release에 실패나 사실 오류가 생기면 기존 릴리즈 기록과 tag를 변경하지 않고 이슈·장애 기록에서
추적한다. 실제 새 배포가 없으면 정정용 docs 버전을 만들지 않는다.

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
  직전 검증 기준점으로 함께 rollback한다. nullable expand DB 스키마는 직전 API runtime의 migrated DB
  호환이 검증된 경우에 유지하며, 현재 배포에 누락 필드 추측이나 구형 목록 endpoint를 새로 추가하지 않는다.
- Admin 외부 응답이 실패하면 `sudo nginx -t`, 내부 `curl -I http://127.0.0.1:8000`, 백업 산출물 존재 여부를 먼저 확인한다.
- DB 반영이 실패하거나 중단되면 같은 SQL을 즉시 재실행하지 않는다. 실제 DB 상태와 ledger를 확인한 뒤
  [DB Migration 유지보수 정책](../../policy/db-migration-gate-policy.md)의 `Ledger와 실패 복구`를 따른다.
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
- 운영 DB write 작업을 [DB Migration 유지보수 정책](../../policy/db-migration-gate-policy.md) 통과 없이 실행하지 않는다.
- `coupler-admin-web`를 PM2 프로세스 앱처럼 운영하지 않는다.
- NextPush-only 배포에서 native version을 이유 없이 올리거나 기존 버전 태그를 다른 커밋에 재사용하지 않는다.

## 관련 문서

- [배포/릴리즈 프로세스](../../policy/release-process.md)
- [DB Migration 유지보수 정책](../../policy/db-migration-gate-policy.md)
- [Admin 운영 배포 런북](admin-web-production-deploy-flow.md)
- [레포지토리 요약](../../architecture/repo-overview.md)
