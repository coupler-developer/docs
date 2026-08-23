# 테스트용 개발 데이터 정책

## 문서 역할

- 역할: `규범`
- 문서 종류: `policy`
- 충돌 시 우선 문서: 이 문서
- 기준 성격: `as-is`
- 현재 구조: embedded manifest actor와 전역 DB lock 아래 전체 dataset을 단일 transaction으로 교체

공유 개발계 관리자 화면과 Mobile QA에 사용하는 합성 데이터의 생성·검증·유지·reset 정책을 정한다.
기술 구조는 [테스트용 개발 데이터 시스템](../architecture/development-test-data-system.md), 실행 순서는
[테스트용 개발 데이터 운영 흐름](../flows/cross-project/development-test-data-flow.md)을 따른다.

## 최종 상태

- 생성 엔진은 `coupler-api/tools/dev-data`의 CLI 하나다.
- 외부 Run Registry, owner/expiry, active/history, generation upgrade, cron lease를 두지 않는다.
- namespace별 현재 suite/catalog/reference time은 DB 합성 actor 한 명의 manifest memo로 식별한다.
- 동일 namespace 갱신은 `reset → current suite 전체 seed → manifest → DB verify` 한 transaction으로 교체한다.
- DB commit 뒤 같은 전역 lock 안의 새 DB connection에서 manifest·asset·DB를 다시 검증한다.
- 합성 member root가 존재하는 동안 개발 cron 전체를 maintenance `SKIP`한다.

## 적용 범위

- API: 생성기, schema contract, verifier, asset, reset, cron guard
- Admin: route coverage descriptor와 browser smoke
- Mobile: 생성된 합성 계정을 이용한 QA
- 공유 개발 DB와 API 서버가 실제 제공하는 개발 media filesystem

단위 테스트 fixture, 운영 seed, migration/backfill, 실제 사용자 데이터 보정은 별도 절차다.

## 용어

| 용어 | 의미 |
|---|---|
| namespace | 작업 단위와 marker를 분리하는 3~17자 소문자 식별자 |
| suite | 하나의 검증 목적에 필요한 scenario 묶음 |
| scenario | 특정 상태·권한·시간·filter 분기를 만족하는 결정론적 데이터 builder |
| manifest actor | namespace root 중 suite/catalog/reference time을 memo로 가진 정확히 한 명의 합성 회원 |
| asset key | DB transaction 동안 기존 media와 candidate media를 분리하는 run-scoped 경로 key |
| marker | email, idempotency key, reserved path/ID처럼 DB row 소유권을 다시 계산하는 값 |
| reference time | 상대 날짜와 시간 경계를 결정하는 서울 기준 실행 시각 |

## 필수 규칙

### 1. 실행 경계

- 운영 HTTP API와 Admin UI에 apply/reset route나 버튼을 만들지 않는다.
- 생성과 삭제는 API repository CLI에서만 수행한다.
- `list`, `coverage` 외 명령은 실제 DB 연결 identity를 검사한다.
- write는 `--confirm <namespace>`와 `--apply`를 모두 요구한다.
- DB write는 전역 MySQL advisory lock 안에서만 수행한다.
- commit, push, PR, 배포, 공유 개발계 실제 apply/reset은 각각 별도 사용자 권한 범위를 따른다.

### 2. 환경 식별

read와 write 모두 다음 exact allowlist를 통과해야 한다.

- `NODE_ENV`가 `development` 또는 local test의 `test`
- `server.is_dev=true`
- configured host = `DEV_DATA_ALLOWED_DB_HOST`
- `DATABASE()` = `DEV_DATA_ALLOWED_DB_NAME`
- `@@hostname` = `DEV_DATA_ALLOWED_DB_SERVER_HOST`

write는 `NODE_ENV=development`, `DEV_DATA_APPLY_ENABLED=true`, absolute `DEV_DATA_ASSET_ROOT`, writable DB를 추가로
요구한다. 값이 없거나 공백이거나 서로 다르면 write 0건으로 실패한다. production process는 dev-data allowlist,
write switch, asset root가 설정되면 startup 단계에서 실패한다.

DB identity는 정확히 한 row의 non-empty database/server string과 number `read_only=0|1`만 허용한다. 문자열,
boolean, null, array 등은 값이 `0`이나 `1`로 강제 변환되더라도 거부한다.

### 3. 데이터 출처와 개인정보

- 이름, 이메일, 전화번호, 이미지, 영상, 영수증, 토큰은 합성값만 사용한다.
- 실제 회원·결제·문의·신고 row를 복제하거나 일부 필드만 가명화하지 않는다.
- 외부 기준정보가 필요하면 read-only 조회하고 합성 row에서 FK로 참조한다.
- N:N 발행 관리자와 QA 회원의 `CHARGE`/`SHARE` 배정은 자동 생성·보정하지 않는다.
- 합성 email domain은 `example.invalid`로 고정한다.
- 합성 관리자 계정은 로그인 불가능해야 한다.

### 4. Namespace와 manifest

- namespace는 `^[a-z][a-z0-9-]{2,16}$`를 만족한다.
- email은 `devdata+{namespace}+{roleDigest8}@example.invalid` exact 형식이며 namespace를 축약하지 않는다.
- 같은 namespace의 actor role과 email은 중복되지 않는다.
- 합성 root 중 정확히 하나만 `dev-data|namespace|suite|catalogVersion|referenceTime|role` manifest memo를 가진다.
- 나머지 actor memo는 `dev-data:namespace:role`이다.
- 모든 actor media 경로는 같은 asset key를 가리켜야 한다.
- 생성·actor media path·asset 검증에는 asset key가 필수다. generation 없는 namespace 직하위
  `profiles`/`videos` legacy 경로는 허용하지 않는다.
- manifest는 현재 dataset metadata의 SoT이며 삭제 권한으로 사용하지 않는다.
- manifest 누락·중복·불일치, mixed asset key, 잘못된 actor email은 자동 채택하지 않고 fail-closed한다.

여러 namespace는 허용하지만 활성 domain scope가 겹치면 apply를 거부한다. `cms-all`은 모든 domain scope와
충돌한다.

### 5. 삭제 소유권

삭제 권한은 생성 시점부터 예약한 marker에서만 도출한다.

- 회원 root: namespace email exact pattern
- N:N event: 발행 관리자와 namespace idempotency key
- N:N loose image: namespace dev-data asset path
- N:N penalty: 합성 회원과 namespace reason
- notice: namespace exact synthetic title
- display manager: namespace exact reserved user ID
- statistics: 통계 owner 합성 회원 ID의 음수인 reserved ID

scenario별 DB PK 목록, memo, filesystem registry를 삭제 근거로 사용하지 않는다. marker query는 root를 잠그고,
그 root에서 profile/auth·review, match·reservation, meeting·chat, lounge·comment, concierge, IAP·key ledger,
invite, assignment, support·report의 FK와 legacy no-FK child ID를 파생해 child-first로 삭제한다. 생성 대상 table의
사후 count, marker postcheck 또는 다른 namespace root count가 하나라도 다르면 전체 reset을 rollback한다.

### 6. 원자 교체

- 최초 생성과 갱신은 모두 `apply` 하나를 사용한다.
- 기존 namespace가 있으면 같은 transaction에서 먼저 전체 marker reset한다.
- 요청 suite의 current scenario 전체를 생성한다. 부분 scenario apply는 허용하지 않는다.
- manifest 기록, candidate asset 생성·검증, DB verifier가 모두 성공하기 전 commit하지 않는다.
- asset preflight·exclusive-create 전 실패는 기존 generation을 삭제하지 않는다. exclusive-create 후 population 실패는
  stage 함수가 자신이 만든 partial candidate만 제거하고 원래 오류를 보존한다. stage 완료 뒤 실패는 transaction
  전체를 rollback하고 그 candidate만 삭제한다.
- advisory lock을 소유한 connection에서 DB identity를 검사하며, commit 뒤 새 connection도 identity부터 다시 검사한
  다음 manifest·asset·DB verifier를 실행한다.
- commit 응답이 불명확해도 같은 connection의 rollback이 성공한 경우에만 새 connection의 exact candidate manifest로
  결과를 판정한다. commit과 rollback이 모두 실패하면 lock·commit outcome unresolved로 즉시 실패하고 새 connection
  검증이나 candidate/inactive asset cleanup을 수행하지 않는다. candidate exact set이면 postcommit 검증을 계속하고,
  이전 set 또는 root 0건이면 candidate asset만 삭제해 실패한다. candidate asset을 가리키는 mixed metadata이면
  asset을 보존하고 수동 조사 대상으로 실패한다.
- postcommit 검증 전에는 과거 asset directory를 삭제하지 않는다.
- postcommit 검증 실패를 자동 rollback이나 성공으로 해석하지 않는다.

DB transaction과 filesystem을 하나의 분산 transaction으로 가장하지 않는다. DB가 최종 가시성 경계이며,
asset은 immutable candidate path와 commit 전 존재 검증, commit 후 재검증으로 보호한다.

### 7. 외부 부작용

- 생성기와 verifier의 외부 write는 0건이어야 한다.
- 실제 SMS, 메일, push, 결제, 운영 storage write를 호출하지 않는다.
- 개발 cron은 합성 root가 존재하거나 전역 lock이 잡혀 있으면 handler를 실행하지 않고 maintenance 성공을 반환한다.
- CLI와 cron은 같은 exact scalar parser를 사용한다. lock 획득·해제는 number `0|1`, 합성 root count는 0 이상
  number safe integer만 허용하며 문자열·boolean·null·array를 강제 변환하지 않는다.
- `GET_LOCK` 실패·malformed 결과처럼 lock 소유 여부가 불명확한 connection은 pool에 반환하지 않고 파기한다. 정확한
  `GET_LOCK=0`만 미소유 connection으로 반환하고, `RELEASE_LOCK=1` 뒤 pool 반환 실패도 파기와 fence 실패로 처리한다.
- handler의 HTTP 응답은 lock 해제 성공 전까지 실제 response에 쓰지 않는다.
- handler의 rejection 값이 `undefined`를 포함한 non-Error여도 실패로 정규화하고 지연된 성공 응답을 내보내지 않는다.
- 합성 root가 없을 때 개발 cron은 실행할 수 있지만 `DEV_CRON_EXTERNAL_DELIVERY_ENABLED=true`가 아니면 현재 cron의
  FCM push 전송을 억제한다. 이 설정은 SMS·메일 adapter의 공통 억제 계약이 아니다.
- destructive 개발 cron은 별도 `DEV_CRON_DESTRUCTIVE_ENABLED=true`가 없으면 실행하지 않는다.
- production cron은 개발 전용 설정을 사용하지 않는다.

### 8. 도메인 정합성

- 상태 상수, 허용 전이, 권한, filter, null/empty/deleted, 시간 직전·정각·직후를 obligation으로 관리한다.
- 상태 상수와 obligation map은 TypeScript exact map으로 연결한다.
- 단일 축 값은 100%, 영향을 주는 두 축은 pairwise 100%를 충족한다.
- 허용되지 않은 상태/FK/원장 조합은 local negative test로 검증하고 공유 개발계에는 만들지 않는다.
- key ledger의 누적 합은 회원 잔액과 정확히 같아야 한다.
- 결제 데이터는 provider receipt 검증이 없는 합성 record이며 실제 결제로 오인되지 않게 표시한다.
- 시간 기반 화면은 DB `CURRENT_DATE()`와 같은 서울 날짜의 reference time만 허용한다.

N:N 그룹미팅은 persisted/effective event status, 최초 마감, reopen, chat initialization/open, application status,
system/user message, report, review, penalty, profile visibility, detail image status를 독립 검증한다. 행사와 신청 version은
기록된 상태 전이 횟수보다 정확히 1 커야 한다.

### 9. Suite

필수 suite는 다음과 같다.

- `member-all`
- `matching-all`
- `meeting-all`
- `group-meeting-all`
- `lounge-all`
- `revenue-all`
- `statistics-all`
- `settings-all`
- `manager-all`
- `cms-all`: 위 domain suite 전체

### 10. Admin coverage

- Admin component route의 stable `routeId` 전체를 exact-set으로 감사한다.
- 각 route는 `scenario-backed`, `reference-backed`, `live-only`, `non-data` 중 정확히 하나다.
- 데이터 route는 audience, permission, filter, scenario와 검증 방법을 가진다.
- route·status 추가는 missing obligation 또는 missing coverage로 typecheck/test를 실패시켜야 한다.
- API catalog와 Admin coverage는 source import로 결합하지 않고 read-only JSON contract를 workspace gate에서 비교한다.
- 브라우저 smoke가 실행되지 않았거나 실패하면 “화면에서 보임”을 성공으로 기록하지 않는다.

### 11. 미디어

- profile은 actor별 서로 다른 WebP 3장을 제공한다.
- 영상은 실제 재생 가능한 합성 MP4이며 기준 checksum을 검증한다.
- 경로는 `uploads/dev-data/{namespace}/generations/{assetKey}/` 아래만 허용한다.
- `DEV_DATA_ASSET_ROOT`부터 generation까지 모든 기존 segment의 symlink/non-directory, root 밖 traversal, 알 수 없는
  directory entry를 fail-closed한다.
- candidate generation은 exclusive-create하며 same-key 재사용을 어떤 write·cleanup보다 먼저 거부한다.
- standalone·precommit verify는 상위 namespace와 generation inventory까지 먼저 검사한다. inactive cleanup은 active
  key와 모든 generation을 전수 검증한 뒤에만 삭제를 시작한다.
- 합성 member/profile set/display manager/meeting/lounge/N:N event·detail image의 모든 DB media path가 현재 asset
  key 아래인지 commit 전·후 전수 검사한다.
- reset은 DB transaction commit 뒤에만 namespace asset을 삭제한다.

### 12. Schema 변경

- dev-data가 사용하는 table, column, view, FK는 schema fingerprint로 고정한다.
- transaction이 변경하는 모든 base table은 `InnoDB`여야 하며 schema preflight에서 exact table set과 engine을
  확인한다.
- migration이 계약을 바꾸면 builder, marker ownership query, FK-safe reset 순서, verifier, scenario version을 함께
  갱신한다.
- migration/backfill은 dev-data CLI에서 수행하지 않는다.
- 기존 실제 데이터를 합성 marker로 바꾸는 자동 보정은 금지한다.

### 13. 테스트

- `tools/dev-data`와 개발 cron guard는 API 표준 lint, typecheck, format, Jest에 포함한다.
- namespace, environment, metadata, DB lock/identity, transaction, asset containment/media reference, coverage,
  ownership reset, cron guard/deferred response 안전 모듈은 branch coverage 100%를 요구한다.
- lock 획득/해제 실패, schema/reference failure, manifest 손상, scope 충돌, transaction rollback, commit 결과 불명확,
  candidate asset failure, postcommit mismatch, reset orphan, cron DB failure를 fault-injection으로 검증한다.
- coverage 숫자만 맞추지 않고 write 0건, rollback, 다른 namespace 불변, asset 보존/정리 순서를 assertion한다.

## CLI 계약

```text
pnpm data-feed list
pnpm data-feed contract
pnpm data-feed coverage --route-contract <absolute-json-path>
pnpm data-feed plan <suite> --namespace <namespace> [--at <ISO>]
pnpm data-feed apply <suite> --namespace <namespace> [--at <ISO>] --confirm <namespace> --apply
pnpm data-feed verify [<suite>] --namespace <namespace>
pnpm data-feed reset --namespace <namespace> [--confirm <namespace> --apply]
```

- `plan`은 DB identity, schema fingerprint, 기존 embedded manifest, scope 충돌, scenario, 외부 기준정보 계약을
  write 없이 출력한다.
- `apply`는 mutation count, asset key, transaction 검증과 postcommit 검증 결과를 출력한다.
- `verify`는 current catalog와 reference time, asset, DB obligation을 다시 검사한다.
- `reset`은 확인값이 없으면 plan만 출력한다.

## 운영 절차

1. 기준 브랜치와 표준 gate를 통과한다.
2. `contract`, Admin/API coverage를 확인한다.
3. namespace와 서울 현재 날짜의 reference time을 정한다.
4. `plan`에서 DB identity, 기존 dataset, scope 충돌과 scenario를 검토한다.
5. `apply --confirm <namespace> --apply`를 실행한다.
6. 별도 `verify`, 실제 Admin API와 권한별 browser smoke를 실행한다.
7. QA 기간에는 개발 cron maintenance와 외부 전송 0건을 확인한다.
8. 종료 시 reset plan을 검토하고 `reset --confirm <namespace> --apply`를 실행한다.
9. DB marker/orphan 0건과 asset directory 부재를 확인한다.

## Cutover 규칙

- 외부 registry 방식 데이터가 남아 있는 상태로 새 CLI를 사용하지 않는다.
- 이전 CLI로 모든 active namespace를 reset하고 legacy 양수 통계 row와 asset까지 0건인지 확인한다.
- registry file을 DB보다 먼저 삭제하지 않는다.
- 새 구조 데이터가 남아 있는 상태로 이전 코드로 rollback하지 않는다. 먼저 새 CLI reset을 완료한다.

## 증빙

작업 기록에는 다음을 남긴다.

- code SHA, catalog version, schema fingerprint
- DB configured host, database name, server hostname allowlist 일치 결과
- namespace, suite, reference time, asset key
- plan, mutation count, transaction/postcommit verify count
- route coverage와 browser smoke 결과
- cron maintenance와 외부 write 0건 관측
- reset count, marker/orphan 0건, asset cleanup 결과

owner와 유지 종료일은 registry에 영속화하지 않고 작업/QA 티켓에 기록한다.

## 체크리스트

- [ ] 운영 API/UI에 write 경로가 없는가?
- [ ] 세 DB identity allowlist와 read-only 상태를 검증했는가?
- [ ] manifest actor가 정확히 하나이고 모든 actor가 같은 asset key를 가리키는가?
- [ ] 동일 scope namespace 충돌이 없는가?
- [ ] reset과 전체 seed, manifest, verifier가 한 transaction인가?
- [ ] commit 전·후 asset과 DB verifier가 모두 통과했는가?
- [ ] 삭제 ownership이 marker에서만 도출되는가?
- [ ] 다른 namespace root count가 보존되는가?
- [ ] 합성 root 존재 중 개발 cron handler가 실행되지 않는가?
- [ ] 외부 write가 0건인가?
- [ ] 안전 모듈 branch 100%와 fault-injection test가 통과하는가?
- [ ] Admin route exact coverage와 실제 browser smoke가 통과했는가?
- [ ] 종료 reset 뒤 marker/orphan/asset이 모두 0건인가?

## 관련 문서

- [테스트용 개발 데이터 시스템](../architecture/development-test-data-system.md)
- [테스트용 개발 데이터 운영 흐름](../flows/cross-project/development-test-data-flow.md)
- [테스트 전략](testing-strategy.md)
- [데이터 거버넌스 정책](data-governance-policy.md)
