# 테스트용 개발 데이터 시스템

## 문서 역할

- 역할: `설명`
- 문서 종류: `architecture`
- 충돌 시 우선 문서: [테스트용 개발 데이터 정책](../policy/development-test-data-policy.md)
- 기준 성격: `to-be`

이 문서는 공유 개발계 관리자 화면과 Mobile QA용 합성 데이터를 만드는 시스템의 기술 구조를 정의한다.
정책 기준은 [테스트용 개발 데이터 정책](../policy/development-test-data-policy.md), 실행 순서는
[테스트용 개발 데이터 운영 흐름](../flows/cross-project/development-test-data-flow.md)을 따른다.

현재 구조는 외부 Run Registry나 HTTP 관리 API를 두지 않는다. API repository 안의 CLI가 DB schema·상태 상수와
같은 변경 단위에서 합성 데이터의 생성, 검증, reset을 소유한다.
공유 개발계 적용과 실제 browser/reset 증빙의 완료 조건은
[기술 부채 정리](../technical-debt/technical-debt.md)의 `테스트용 개발 데이터 운영 검증·고도화 미완료`에서 추적한다.

## 설계 목표

- 결정론적 scenario catalog로 개발 데이터를 반복 생성한다.
- 잘못된 DB, 다른 namespace, 실제 사용자 데이터에 대한 write를 코드 경계에서 차단한다.
- reset과 전체 seed가 분리된 중간 상태를 노출하지 않는다.
- DB 안에는 현재 dataset을 설명하는 최소 metadata 하나만 둔다.
- filesystem은 현재 DB row가 가리키는 asset만 제공하며 실행 이력 저장소가 되지 않는다.
- 합성 데이터가 존재하는 동안 개발 cron이 DB나 외부 채널을 변경하지 않게 한다.
- 상태·권한·filter·시간 경계와 Admin route coverage를 exact-set 검증한다.

## 비포함

- 운영 API route 또는 Admin 버튼에서 apply/reset 제공
- 외부 registry, active/history pointer, owner/expiry record, ETag, cutover journal
- scenario별 row ID 목록이나 삭제 manifest
- 합성 관리자 로그인 계정
- 실결제, 실제 SMS·메일·push, 운영 bucket write
- 운영 DB에서의 실행

## 배치

```text
coupler-api/
  tools/dev-data/
    cli.ts                  # list/contract/coverage/plan/apply/verify/reset
    runner.ts               # 전역 lock과 원자 transaction orchestration
    catalog.ts              # suite별 결정론적 scenario
    verifier.ts             # DB 불변식과 read model 검증
    metadata.ts             # 단일 manifest actor codec
    namespace.ts            # namespace와 결정적 marker
    environment.ts          # DB allowlist·write switch
    db.ts                   # 전용 bounded pool·전역 advisory lock·mutation count
    assets.ts               # run-scoped media stage·검증·정리
    ownership.ts            # 합성 member에서 파생한 legacy child graph reset
    group-meeting-reset.ts  # N:N graph marker traversal reset
    schema-contract.ts      # table·column·view·FK fingerprint
    coverage.ts             # Admin route descriptor 계약 검증
  lib/
    dev-data-lock.ts                    # CLI와 cron이 공유하는 lock 이름
    deferred-cron-response.ts           # lock 해제 전 HTTP 응답 write 지연
    development-cron-data-guard.ts      # 합성 root 감지와 maintenance SKIP
    development-cron-safety.ts          # 개발 cron 인증·파괴 작업 차단

coupler-admin-web/
  src/config/dev-data-coverage.ts
  src/__tests__/dev-data-coverage.test.ts
  e2e/dev-data-cms.smoke.spec.ts
```

생성 엔진은 `coupler-api`에만 둔다. Admin은 route coverage와 실제 브라우저 검증만 소유하며 DB write 코드를
가지지 않는다.

## 단일 현재 dataset 계약

namespace의 합성 `t_member` root 중 정확히 하나가 manifest actor다. 그 actor의 `memo` 형식은 다음과 같다.

```text
dev-data|{namespace}|{suite}|{catalogVersion}|{referenceTime ISO UTC}|{role}
```

나머지 actor는 역할 식별용 `dev-data:{namespace}:{role}` memo를 유지한다. 모든 actor는 다음 조건을 만족해야 한다.

- namespace는 최대 17자이며 email은 `devdata+{namespace}+{roleDigest8}@example.invalid`와 정확히 일치한다.
- namespace는 축약하거나 hash로 바꾸지 않는다. `roleDigest8`은 고정 catalog role의 SHA-256 앞 8자리다.
- role은 중복되지 않는다.
- `mini_profile`이 모두 같은 run-scoped asset key를 가리킨다.
- manifest actor는 정확히 하나다.

manifest는 suite, catalog version, reference time을 읽는 현재 상태의 SoT지만 삭제 권한은 아니다. memo가 누락되거나
여러 개여도 임의로 소유권을 확대하지 않는다. 기존 외부 registry 방식 데이터는 이전 CLI로 reset한 뒤 새 구조를
배포해야 한다.

## 삭제 소유권 marker

reset은 별도 row ID 기록 대신 각 도메인의 생성 시점부터 고정된 marker를 다시 계산한다.

| root/standalone 데이터 | 소유권 marker |
|---|---|
| 합성 회원과 회원 FK graph | reserved email exact namespace |
| N:N 행사 | 발행 관리자 + `dd-{namespaceKey}-%` idempotency key |
| N:N loose image | `uploads/dev-data/{namespace}/%` source path |
| N:N 패널티 | 합성 회원 email + `합성 N:N 그룹미팅 패널티:{namespace}:%` reason |
| 공지 | `합성 공지:{namespace}` exact title |
| 표시 매니저 | `dd_{namespaceKey}` exact `t_admin.user_id` |
| 로그인 통계 | 통계 owner 합성 회원 ID의 음수인 `t_sta_login.id` |

음수 `t_sta_login.id` 범위와 위 문자열 prefix는 dev-data 전용이다. 일반 기능은 이 marker를 만들지 않는다.
reset은 marker로 찾은 root를 `FOR UPDATE`로 잠근다. 그 root에서 profile/auth·review, match·reservation,
meeting·chat, lounge·comment, concierge, IAP·key ledger, invite, assignment, support·report까지 직접 FK와 legacy
no-FK child ID를 파생해 child-first로 삭제한다. N:N graph, notice, display manager, 통계도 같은 transaction에서
정리한다. 생성 대상 table별 사후 count가 모두 0이 아니거나 다른 namespace 합성 root count가 바뀌면 rollback한다.

## 전역 직렬화

CLI와 개발 cron은 MySQL advisory lock `coupler:dev-data:global` 하나를 공유한다.

- `plan`, `contract`, `verify`, `apply`, `reset`은 lock을 획득하지 못하면 실행하지 않는다.
- 개발 cron은 lock을 획득하지 못하면 handler를 실행하지 않고 maintenance 성공으로 응답한다.
- lock은 전용 connection에 귀속되며 release가 실패하면 connection을 pool에 반환하지 않고 파기한다.
- 여러 namespace를 허용하되 같은 domain scope가 겹치는 dataset은 apply 전에 거부한다.

전역 lock 하나는 DB 변경, 검증, cron을 같은 순서로 직렬화한다. job lease, filesystem mutex, 상태별 fence는 두지 않는다.

## Apply transaction

`apply`는 기존 namespace가 있든 없든 같은 전체 교체 경로만 사용한다.

1. namespace, reference time과 environment를 검사하고, lock을 소유한 바로 그 DB connection의 identity를 검사한다.
2. schema fingerprint와 suite별 외부 기준정보를 read-only로 검사한다.
3. 모든 현재 manifest를 읽어 legacy/corrupt dataset과 scope 충돌을 거부한다.
4. 새 random asset key를 만든다.
5. 하나의 DB transaction에서 대상 namespace marker reset을 수행한다.
6. 요청 suite의 current scenario 전체를 순서대로 생성한다.
7. 첫 scenario marker actor 한 명의 memo를 current manifest로 갱신한다.
8. DB actor가 가리키는 candidate asset을 run-scoped directory에 생성하고 checksum·형식·경로를 검사한다.
9. DB verifier와 suite obligation을 실행하고 모든 소유 media column이 candidate asset key를 가리키는지 검사한다.
10. 전 단계가 성공한 경우에만 commit한다.
11. 같은 전역 lock 안의 새 DB connection에서 그 connection의 identity, manifest, asset과 DB verifier를 다시 실행한다.
12. postcommit 검증 뒤 exact inventory를 통과한 inactive asset key directory만 정리한다.

transaction 전 실패는 write 0건이다. asset preflight 또는 exclusive-create 전 실패는 기존 generation을 정리 대상으로
간주하지 않는다. exclusive-create 뒤 population이 실패하면 stage 함수가 자신이 만든 partial candidate를 즉시 삭제하고
원래 population 오류를 보존한다. stage 완료 뒤 transaction 안 실패는 DB rollback 후 그 candidate만 삭제한다.
commit 응답이 불명확하고 같은 connection의 rollback은 성공했을 때만 새 connection에서 exact candidate manifest를
읽는다. commit과 rollback이 모두 실패하면 lock·commit outcome unresolved로 즉시 중단하고 새 connection 검증이나
어떤 asset cleanup도 수행하지 않는다. candidate exact set이면 postcommit 검증을 계속하고, 이전 set 또는 root 0건이면
candidate asset만 삭제해 실패한다. candidate asset을 가리키지만
metadata가 섞였으면 asset을 보존하고 중단한다. commit 후 검증 실패는 결과를 성공으로 보고하지 않으며 DB를 추측해
되돌리지 않는다. 같은 namespace의 다음 전체 apply 또는 명시 reset으로 복구한다.

## Reset

`reset`은 dry-run과 실행을 같은 명령으로 제공한다.

- dry-run은 embedded manifest, suite, catalog, asset key, member count와 필요한 확인 문자열을 출력한다.
- 실행은 namespace와 같은 `--confirm` 및 `--apply`를 모두 요구한다.
- DB marker reset 전체가 한 transaction으로 commit된 뒤 namespace asset directory를 삭제한다.
- DB reset이 실패하면 asset을 삭제하지 않는다.
- DB는 이미 0건이고 asset만 남은 경우 같은 reset을 재실행해 asset cleanup을 완료할 수 있다.

legacy dataset은 새 manifest가 없으므로 새 CLI가 reset하지 않는다. 과거 양수 통계 ID처럼 새 marker만으로 소유권을
완전히 증명할 수 없는 row가 있기 때문이다.

## Asset 모델

asset 경로는 다음과 같다.

```text
uploads/dev-data/{namespace}/generations/{assetKey}/profiles/{actorKey}-{variant}.webp
uploads/dev-data/{namespace}/generations/{assetKey}/videos/{actorKey}.mp4
```

`assetKey`는 `yyyyMMddHHmmssSSS-UUIDv4` 형식이다. 이것은 DB 실행 record가 아니라 transaction 중 기존 asset과
candidate asset을 분리하는 경로 key다. 생성·actor media path·검증 함수에는 이 key가 필수이며
`uploads/dev-data/{namespace}/profiles|videos` 형태의 mutable legacy 경로를 만들거나 읽지 않는다.

- profile은 actor별 main/alternate/lifestyle WebP 3장이다.
- 선택 actor 영상은 기준 MP4 checksum과 같아야 한다.
- 모든 경로는 canonical absolute `DEV_DATA_ASSET_ROOT` 안에 containment되어야 한다.
- configured root부터 namespace·generation까지 기존 경로 segment는 모두 `lstat`으로 확인하고 symlink와 비-directory를
  거부한다. 없는 segment만 real ancestor 아래에 한 단계씩 만든다.
- namespace에는 `generations`만, generation에는 `profiles`와 `videos`만, 하위에는 허용된 이름의 regular file만
  존재해야 한다.
- member, profile set/image, display manager, meeting, lounge, N:N event/detail image의 모든 합성 media 참조는
  commit 전·후 candidate actor와 `manager-display`에서 계산한 실제 생성 asset path exact set에 포함되어야 한다.
  prefix만 같은 traversal, 잘못된 directory, inventory에 없는 filename은 거부한다.
- candidate directory는 exclusive-create한다. 같은 key가 이미 있으면 어떤 파일도 쓰거나 지우지 않고 실패한다.
- stage 함수만 exclusive-create 이후의 partial candidate를 소유한다. population 실패 때 strict completed-inventory
  cleanup을 호출하지 않고 그 partial directory만 제거하며, 제거까지 실패하면 population·cleanup 오류를 함께 보고한다.
- standalone·precommit asset verify는 namespace → generations → candidate → profiles/videos의 exact inventory와
  real-directory 경계를 먼저 모두 검사한 뒤 파일을 읽는다.
- postcommit 검증 전에는 이전 asset directory를 지우지 않는다.
- inactive cleanup은 active key 존재와 모든 generation inventory를 첫 pass에서 검증하고 두 번째 pass에서만 삭제한다.

## 환경 경계

read 명령도 다음 값과 실제 연결 identity가 정확히 같아야 한다. 검사는 advisory lock을 소유한 connection에서
수행하고 commit 결과 판정·postcommit 검증용 새 connection에서도 각각 다시 수행한다.

identity query는 정확히 한 row만 허용한다. database와 server hostname은 non-empty string, `@@read_only`는 MySQL
driver가 반환한 number `0` 또는 `1`만 허용하며 문자열·boolean·null 강제 변환을 하지 않는다.

- `NODE_ENV=development` 또는 local test의 `test`
- `server.is_dev=true`
- `DEV_DATA_ALLOWED_DB_HOST` = configured DB host
- `DEV_DATA_ALLOWED_DB_NAME` = `DATABASE()`
- `DEV_DATA_ALLOWED_DB_SERVER_HOST` = `@@hostname`

write에는 다음 조건이 추가된다.

- `NODE_ENV=development`
- `DEV_DATA_APPLY_ENABLED=true`
- `DEV_DATA_ASSET_ROOT` absolute path
- `@@read_only=0`
- namespace exact `--confirm`과 `--apply`

production process는 dev-data enable/allowlist/asset 설정이 하나라도 있으면 startup 단계에서 실패한다.

## 개발 cron 경계

개발 cron route는 인증·파괴 작업 guard 뒤 handler wrapper에서 같은 전역 DB lock을 잡는다.

- 합성 member root가 한 건이라도 있으면 모든 개발 cron handler를 maintenance `SKIP`한다.
- 합성 root가 없을 때만 handler를 실행한다.
- handler promise가 끝날 때까지 lock을 유지한다.
- handler가 만든 status/header/body/end 호출은 메모리에 지연하고 `RELEASE_LOCK`이 정확히 `1`로 성공한 뒤에만
  실제 response에 재생한다. 해제 실패를 이미 전송한 200 응답으로 숨기지 않는다.
- CLI와 cron은 같은 exact MySQL scalar parser를 쓴다. `GET_LOCK`은 number `0`만 maintenance, number `1`만 획득으로
  인정하고 나머지는 오류다. root count는 단일 row의 0 이상 number safe integer, `RELEASE_LOCK`은 number `1`만
  성공이며 문자열·boolean·null·array를 강제 변환하지 않는다.
- `GET_LOCK` query가 실패하거나 결과가 malformed여서 소유 여부가 불명확한 connection은 pool에 반환하지 않고
  파기한다. 정확한 `0`만 lock 미소유 connection으로 반환하며, 정확한 해제 뒤 pool 반환이 실패해도 파기하고 실패한다.
- handler promise는 어떤 값으로 reject하더라도 실패다. `undefined` 같은 non-Error rejection도 정규화하고 지연된 성공
  응답을 재생하지 않는다.
- `DEV_CRON_EXTERNAL_DELIVERY_ENABLED=true`가 아니면 현재 개발 cron handler의 FCM push 전송을 억제한다. 이 설정을
  SMS·메일 전체의 공통 억제 계약으로 간주하지 않는다.
- production cron은 이 개발 경계를 사용하지 않고 기존 전체 대상 동작을 유지한다.

합성 target만 골라내는 N:N ownership graph를 cron에 복제하지 않는다. QA data가 존재하는 짧은 기간에는 cron 전체를
멈추는 것이 더 단순하고 안전하다.

## Scenario와 suite

scenario는 `id`, `version`, `suite`, `description`, `markerRole`, `actorRolePrefix`, `apply`를 가진다. 동일한 입력
namespace와 reference time은 동일한 business state를 만들고 DB PK와 asset key만 실행마다 달라질 수 있다.

| suite | 필수 범위 |
|---|---|
| `member-all` | 회원 상태, 가입/프로필 심사, 인증, 초대, 컨시어지 |
| `matching-all` | 매칭·큐레이터 전체 상태, 선호·일정·장소·채팅·신고 |
| `meeting-all` | 기존 1:1/2:2 상태, member count·gender·chat history 경계 |
| `group-meeting-all` | N:N lifecycle, 신청, 채팅, 신고, 후기, 패널티, 이미지 상태 |
| `lounge-all` | 공개/삭제, pin, 좋아요, 신고, 댓글, 패널티 |
| `revenue-all` | IAP 상태와 key ledger 불변식 |
| `statistics-all` | 일·월·시간대 통계와 reserved negative row |
| `settings-all` | 공지·문의와 기존 설정 기준정보 |
| `manager-all` | 로그인 불가능 표시 매니저와 회원 배정 |
| `cms-all` | 위 모든 domain suite의 합집합 |

N:N scenario는 persisted/effective status, application close/reopen, chat initialization/open, system/user message,
report/review, profile visibility, detail image 상태를 독립 축으로 검증한다. 발행 관리자와 QA 기준 회원은 생성하지 않고
`GROUP_MEETING_HOST_MANAGER_USER_ID`와 `CHARGE`/`SHARE` 기준정보를 preflight와 transaction 안에서 다시 확인한다.

## Coverage와 verifier

- 상태 상수는 exhaustive obligation map과 연결한다.
- 단일 축 값은 100%, 상호작용하는 두 축은 pairwise 100%를 요구한다.
- schema contract는 사용 table·column·view·FK의 fingerprint를 고정한다.
- schema preflight는 사용 base table의 exact set과 `InnoDB` engine을 함께 확인한다.
- verifier는 marker 존재뿐 아니라 API read model이 의존하는 join, count, 시간 경계와 원장 불변식을 검사한다.
- Admin `routeId` 전체는 `scenario-backed`, `reference-backed`, `live-only`, `non-data` 중 하나로 exact 분류한다.
- 실제 화면 노출 성공 판정은 개발 API에 연결한 Playwright browser smoke가 통과한 경우에만 한다.

안전 모듈(namespace, environment, metadata, lock, transaction, asset, cron guard, deferred response, coverage,
ownership reset)은 dependency failure를 포함해 Jest branch coverage 100%를 유지한다.

## 변경 감지

| 변경 | 실패해야 하는 gate | 함께 갱신할 항목 |
|---|---|---|
| table·column·view·FK | schema fingerprint | builder, marker query, reset 순서, verifier |
| 상태 상수·전이 | exhaustive obligation | scenario와 verifier |
| Admin route·filter·권한 | route exact map | coverage entry와 browser smoke |
| media schema·storage | asset verifier | DB path와 cleanup |
| cron handler | route boundary test | maintenance·외부 write 검증 |

## Cutover

외부 registry/generation 구조에서 이 구조로 전환할 때는 다음 순서를 고정한다.

1. 이전 CLI와 registry로 모든 active namespace를 verify한다.
2. 이전 CLI reset으로 DB와 asset을 모두 제거하고 orphan 0건을 확인한다.
3. registry file을 먼저 지우지 않는다.
4. 새 코드를 배포하고 `plan`부터 실행한다.
5. 새 구조에서 생성된 데이터가 있는 상태로 이전 코드로 rollback하지 않는다. 먼저 새 CLI reset을 완료한다.

## 관련 문서

- [테스트용 개발 데이터 정책](../policy/development-test-data-policy.md)
- [테스트용 개발 데이터 운영 흐름](../flows/cross-project/development-test-data-flow.md)
- [테스트 전략](../policy/testing-strategy.md)
- [데이터 거버넌스 정책](../policy/data-governance-policy.md)
