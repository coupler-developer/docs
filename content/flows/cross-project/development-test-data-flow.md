# 테스트용 개발 데이터 운영 흐름

## 문서 역할

- 역할: `시나리오`
- 문서 종류: `flow`
- 충돌 시 우선 문서: [테스트용 개발 데이터 정책](../../policy/development-test-data-policy.md)
- 기준 성격: `as-is`

공유 개발계 합성 데이터를 계획, 생성, 검증, 사용, reset하는 실행 순서와 실패 대응을 정한다. 규범은
[테스트용 개발 데이터 정책](../../policy/development-test-data-policy.md), 내부 구조는
[테스트용 개발 데이터 시스템](../../architecture/development-test-data-system.md)을 따른다.

## 준비

실행 위치는 `coupler-api` repository이며 공유 개발계 write는 실제 API host에서 수행한다. 다음 환경값은 API
configuration과 실제 연결 DB에서 확인한 exact 값이어야 한다.

```bash
export NODE_ENV=development
export DEV_DATA_ALLOWED_DB_HOST='<configured db host>'
export DEV_DATA_ALLOWED_DB_NAME='<DATABASE()>'
export DEV_DATA_ALLOWED_DB_SERVER_HOST='<@@hostname>'
export DEV_DATA_ASSET_ROOT='<API가 제공하는 uploads absolute path>'

# write 명령에만 설정한다.
export DEV_DATA_APPLY_ENABLED=true
```

reference time은 DB session `Asia/Seoul`의 `CURRENT_DATE()`와 같은 날짜를 사용한다.

```bash
REFERENCE_TIME='<current KST date ISO timestamp>'
NAMESPACE='qa-cms'
```

## 명령

```bash
pnpm data-feed list
pnpm data-feed contract
pnpm data-feed coverage --route-contract '<admin route contract absolute path>'

pnpm data-feed plan cms-all --namespace "$NAMESPACE" --at "$REFERENCE_TIME"
pnpm data-feed apply cms-all --namespace "$NAMESPACE" --at "$REFERENCE_TIME" \
  --confirm "$NAMESPACE" --apply

pnpm data-feed verify --namespace "$NAMESPACE"
pnpm data-feed verify group-meeting-all --namespace "$NAMESPACE"

pnpm data-feed reset --namespace "$NAMESPACE"
pnpm data-feed reset --namespace "$NAMESPACE" --confirm "$NAMESPACE" --apply
```

`active`, `init-registry`, `upgrade`, `--owner`, `--expires-at` 명령은 없다. 같은 namespace의 갱신도 전체 `apply`를
다시 실행한다.

## 최초 생성과 전체 교체

1. API, Admin, Mobile의 기준 ref와 변경 범위를 고정한다.
2. API 표준 typecheck, lint, format, test를 통과한다.
3. `contract`로 DB schema fingerprint를 확인한다.
4. API catalog와 Admin route coverage exact-set을 검증한다.
5. namespace와 reference time을 정한다.
6. `plan`을 실행해 다음을 검토한다.
   - configured host, database name, server hostname
   - schema fingerprint
   - 기존 embedded manifest와 asset key
   - 다른 namespace의 overlapping suite scope
   - 적용할 current scenario 전체
   - N:N 외부 기준정보 계약
   - 외부 write 0건
7. `apply --confirm <namespace> --apply`를 실행한다.
8. CLI는 전역 DB lock을 소유한 같은 connection의 identity와 schema/reference/기준정보, 모든 current manifest를
   다시 검사한다.
9. 하나의 transaction에서 대상 namespace marker reset, current suite 전체 seed, manifest 기록을 수행한다.
10. candidate asset key directory를 exclusive-create한다. same-key가 이미 있으면 기존 tree를 보존하고 실패한다.
    preflight 실패는 기존 generation을 cleanup하지 않는다. 생성 뒤 population이 실패하면 stage 함수가 자신이 만든
    partial candidate만 제거하고 원래 오류를 보존한다. 성공한 candidate는 checksum·형식·symlink 없는 상위/하위
    exact inventory와 모든 합성 media DB 경로를 검증한다.
11. DB verifier와 suite obligation이 통과한 경우에만 commit한다.
12. commit 뒤 같은 lock 안의 새 DB connection identity부터 다시 확인하고 manifest, asset, DB verifier를 실행한다.
13. postcommit 검증 뒤 active key 존재와 모든 generation exact inventory를 첫 pass에서 확인하고, 두 번째 pass에서
    inactive asset key만 정리한다.
14. 반환된 mutation count, asset key, transaction/postcommit 검증 결과를 작업 기록에 남긴다.

기존 namespace도 이 흐름과 같다. 별도 upgrade나 source/candidate registry 전환은 없다. DB transaction이 실패하면
기존 dataset이 그대로 rollback된다. stage가 완료된 candidate만 transaction 실패 cleanup 대상이며, stage 전 실패는
기존 generation을 건드리지 않는다. commit과 rollback이 모두 실패하면 DB·lock outcome을 확정할 수 없으므로 새
connection 판정과 candidate/inactive asset cleanup을 모두 중단한다.

## 검증

`verify`는 embedded manifest의 current catalog, reference time, 단일 asset key와 suite 소유 범위를 먼저 확인한다.
그 뒤 asset 존재·checksum과 DB obligation을 검사한다.

- suite를 생략하면 manifest suite 전체를 검증한다.
- `cms-all` dataset은 개별 domain suite 검증을 허용한다.
- domain dataset은 다른 domain이나 `cms-all` 검증을 허용하지 않는다.
- stale catalog나 현재 서울 날짜가 아닌 reference time은 재생성 대상으로 실패한다.

CLI DB verifier 통과는 실제 HTTP/UI 검증을 대신하지 않는다. 다음을 별도로 실행한다.

1. Admin 권한별 session으로 route API와 filter를 확인한다.
2. Admin Playwright dev-data smoke를 실제 개발 API에 연결해 실행한다.
3. Mobile 대상 계정과 상태 흐름을 확인한다.
4. QA 기간 동안 개발 cron 응답이 maintenance이며 SMS·메일·push write가 0건인지 관측한다.

## Reset

1. 작업/QA 티켓에서 namespace와 종료 승인을 확인한다.
2. 확인값 없이 `reset`을 실행해 suite, catalog, asset key, member count를 검토한다.
3. `reset --confirm <namespace> --apply`를 실행한다.
4. CLI는 전역 DB lock과 하나의 transaction 안에서 marker root를 잠근다.
5. N:N event graph, namespace member에서 파생한 profile/auth·review, match·meeting, lounge·comment, IAP·key ledger,
   invite·assignment·support·report graph, notice, owner member ID의 음수 statistics row, display manager를 child-first
   순서로 삭제한다.
6. 생성 대상 table과 모든 marker가 0건이고 다른 namespace root count가 같을 때만 commit한다.
7. commit 뒤 namespace asset directory를 삭제한다.
8. 다음을 read-only로 재확인한다.
   - namespace member/event/notice/statistics/manager marker 0건
   - child orphan 0건
   - 다른 namespace root count 불변
   - namespace asset directory 부재

DB reset commit 뒤 asset cleanup만 실패하면 같은 reset을 재실행한다. DB가 0건이어도 namespace asset cleanup을
다시 수행할 수 있다.

## 개발 cron

- 개발 cron route는 access guard와 destructive guard를 먼저 통과한다.
- handler wrapper가 CLI와 같은 전역 DB lock을 획득한다.
- lock 경합 또는 합성 member root 존재 시 handler를 호출하지 않고 `x-dev-cron-result: maintenance`로 응답한다.
- 합성 root가 없을 때만 handler를 실행하며 handler promise 종료까지 lock을 유지한다.
- handler의 status/header/body/end는 lock 해제가 정확히 성공할 때까지 실제 HTTP response에 쓰지 않는다.
- CLI와 cron의 공통 exact parser는 lock 값을 number `0|1`, root count를 단일 0 이상 number safe integer로만
  허용한다. 문자열·boolean·null·array이면 handler를 실행하지 않고 fence 오류로 실패한다.
- `DEV_CRON_EXTERNAL_DELIVERY_ENABLED=true`가 아니면 현재 개발 cron handler의 FCM push 전송을 억제한다. SMS·메일
  adapter의 공통 억제 설정으로 확대 해석하지 않는다.
- lock release가 실패하면 connection을 pool에 반환하지 않는다.

합성 target 일부를 정상 cron에 통과시키지 않는다. 합성 데이터가 존재하는 QA 기간에는 개발 cron 전체를 멈춘다.

## 변경 반영

### DB schema 변경

1. migration과 schema contract diff를 확인한다.
2. builder, ownership marker query, FK-safe reset 순서, verifier를 함께 수정한다.
3. scenario version을 올린다.
4. 안전 모듈 branch 100%와 fault-injection test를 통과한다.
5. 공유 개발계에서는 새 전체 apply로 교체한다.

### 상태·권한·filter 변경

1. 상태 상수와 exhaustive obligation map을 갱신한다.
2. 정상/negative scenario를 구분해 추가한다.
3. API verifier와 Admin route coverage를 갱신한다.
4. 권한별 API·browser smoke를 갱신한다.

### Media 변경

1. path contract와 checksum/format verifier를 갱신한다.
2. DB 경로와 filesystem containment를 함께 검증한다.
3. candidate cleanup과 inactive cleanup fault test를 통과한다.

## 예외 대응

### 환경 identity 실패

- configured host, `DATABASE()`, `@@hostname`, `server.is_dev`, read-only 값을 read-only로 확인한다.
- allowlist를 추측해 완화하지 않는다.
- 일치하기 전 write 명령을 다시 실행하지 않는다.

### Legacy dataset 감지

- 합성 root가 있는데 current manifest actor가 정확히 하나가 아니면 새 CLI를 사용하지 않는다.
- 이전 코드와 registry를 복구해 이전 CLI reset을 실행한다.
- legacy 양수 statistics row와 과거 asset을 포함해 0건을 확인한다.
- registry file을 먼저 삭제하거나 새 manifest memo를 수동 주입하지 않는다.

### Scope 충돌

- `plan`과 `apply`에서 다른 namespace가 같은 domain scope를 소유하면 write하지 않는다.
- 기존 작업자와 협의해 기존 namespace를 reset하거나 다른 비중복 suite를 선택한다.
- `cms-all`과 어떤 domain suite도 동시에 유지하지 않는다.

### Lock 경합/해제 실패

- lock 경합은 실행 중인 CLI 또는 cron이 끝난 뒤 `plan`부터 재시도한다.
- MySQL advisory lock을 수동 테이블/파일로 복제하지 않는다.
- release 실패 connection은 파기되므로 pool과 DB 상태를 확인하고 재시도한다.

### Transaction 실패

- commit 전 실패는 DB rollback과 candidate asset 제거를 확인한다.
- 기존 namespace dataset과 asset이 유지됐는지 `verify`한다.
- 일부 scenario를 수동으로 이어서 만들지 않고 전체 apply를 다시 실행한다.

### Commit 결과 불명확

- 같은 connection의 rollback이 성공한 경우에만 CLI는 같은 전역 lock 안의 새 DB connection에서 candidate manifest
  exact set을 다시 읽는다.
- commit과 rollback이 모두 실패하면 새 connection 검증, postcommit 처리, candidate/inactive asset cleanup 없이
  lock·commit outcome unresolved로 중단한다.
- namespace, suite, catalog, reference time, asset key가 candidate와 모두 같으면 postcommit verify를 계속하고
  `commitOutcomeRecovered=true`를 기록한다.
- 이전 dataset 또는 root 0건이면 candidate asset만 삭제하고 commit 실패로 종료한다.
- candidate asset key를 가리키지만 metadata가 다르면 자동 삭제하지 않고 mixed 상태로 중단한다.

### Commit 후 검증 실패

- 성공으로 기록하지 않는다.
- DB 상태를 추측해 자동 rollback하지 않는다.
- read-only 조사로 manifest, asset, DB obligation 중 실패 지점을 확인한다.
- 같은 namespace 전체 apply 또는 명시 reset으로 복구한다.

### Reset 소유권/사후검사 실패

- transaction이 rollback됐는지 확인한다.
- 수동 broad `DELETE`를 사용하지 않는다.
- marker query 또는 FK 순서를 수정하고 reset plan부터 다시 실행한다.

### Browser smoke 실패

- DB verifier 성공만으로 화면 coverage 성공을 선언하지 않는다.
- audience, session, route/filter, API response, render assertion을 순서대로 조사한다.
- 필요한 catalog/coverage 변경 뒤 전체 검증을 다시 실행한다.

### 외부 호출 감지

- apply와 QA 사용을 중단한다.
- SMS·메일·push·결제 adapter와 cron suppression 경계를 수정한다.
- 외부 write 0건 증빙 전 dataset을 유지하지 않는다.

## Cutover

외부 registry/generation 구현에서 새 구조로 전환한다.

1. 이전 코드 상태에서 `active`, `verify`로 모든 namespace를 확인한다.
2. 이전 CLI reset으로 모든 namespace DB·asset을 제거한다.
3. root/child orphan, legacy statistics, asset, active cron lease 0건을 확인한다.
4. 그 뒤 새 코드를 배포한다.
5. 새 `contract`와 `plan`을 실행한다.
6. 새 apply/verify/browser smoke를 통과한다.

rollback 시 새 구조 합성 데이터가 있으면 먼저 새 CLI reset을 완료한 뒤 이전 코드를 배포한다.

## 결과 기록 예시

```text
namespace=qa-cms
suite=cms-all
catalog_version=13
schema_fingerprint=<sha256>
reference_time=<ISO UTC>
asset_key=<timestamp-uuid>
configured_host_match=PASS
database_name_match=PASS
server_hostname_match=PASS
scope_conflict=0
transaction_verify=PASS
postcommit_verify=PASS
admin_route_coverage=PASS
browser_smoke=PASS
cron_maintenance=PASS
external_writes=0
reset_marker_rows=0
reset_orphans=0
asset_directory=ABSENT
```

## 금지

- registry file이나 memo를 수동 수정해 dataset을 채택하는 행위
- `reset`과 `apply` 사이를 별도 운영 단계로 실행하는 행위
- 일부 scenario만 교체하는 행위
- 수동 broad SQL delete
- 운영 DB, 운영 bucket/prefix, 실제 외부 채널 사용
- browser smoke 없이 화면 coverage 성공 선언

## 관련 문서

- [테스트용 개발 데이터 정책](../../policy/development-test-data-policy.md)
- [테스트용 개발 데이터 시스템](../../architecture/development-test-data-system.md)
- [테스트 전략](../../policy/testing-strategy.md)
