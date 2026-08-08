# DB Migration 유지보수 정책

## 문서 역할

- 역할: `규범`
- 문서 종류: `policy`
- 충돌 시 우선 문서: DB migration 안전 조건은 이 문서, 전체 릴리스 순서는 [릴리스 게이트 플로우](../flows/cross-project/release-automation-pipeline.md)
- 기준 성격: `as-is`

## 목적

개발계와 운영계 DB migration은 서비스를 계속 쓰게 둔 상태에서 실행하지 않는다. API, Admin,
WebSocket, cron, worker, direct SQL writer를 모두 멈춘 유지보수 구간에서 같은 순서와 checksum의 SQL을
적용한다.

이 정책은 운영자가 실제로 확인해야 하는 안전 조건만 남긴다. 서명, trust epoch, frontier, activation
marker, Gate별 N/A 표는 신규 migration 계약이 아니다.

유지보수 중단은 SQL 실행 안전을 위한 것이며 API 계약 cutover와 같은 뜻이 아니다. DB 변경은 전역
`Compatible/Cutover` 라벨로 단순화하지 않고, 계획에 선언한 실제 runtime·schema 조합과 상태 표면을
실행기가 검증한 뒤에만 서비스를 재개한다.

## 적용 범위

- DDL, backfill, read/write 기준 변경, 객체 제거
- `db/migrations` SQL, schema contract, baseline과 schema lock
- 개발계·운영계의 `schema_migrations` ledger

합성 테스트 데이터 reset과 애플리케이션 코드만의 배포는 제외한다. 그 작업이 공유 DB 구조나 운영 데이터를
바꾸면 이 정책을 적용한다.

## 단일 SoT

| 책임 | 단일 SoT |
| --- | --- |
| 실행 가능한 migration과 checksum | API 저장소의 append-only migration catalog |
| 과거 ledger 호환성 | API 저장소의 sealed `ledger-compatibility.json` |
| 물리 schema 기준 | `baseline.sql`, `baseline.lock.json`, `schema.lock.json` |
| migration별 검증 | 해당 migration의 setup/check fixture와 SQL 자체의 pre/postcondition |
| 환경별 적용 완료 | 각 DB의 `schema_migrations` ledger |
| baseline 교체 권한과 원본 | base-owned capture authority |
| 운영 실행 기록 | 환경별 root pair와 root에서 도달하는 immutable failed-history pair |

`main`에 이미 병합된 migration SQL 전체는 수정하거나 삭제하지 않는다. baseline에 포함돼도 SQL, checksum,
catalog entry와 ledger row를 보존한다.

## 지원하는 실행 방식

신규 migration은 유지보수 방식만 지원한다. 모든 writer를 중지할 수 없거나 남은 session/transaction을
0으로 만들 수 없으면 실행하지 않는다. 무중단·online migration이 필요하면 이 절차에 예외를 추가하지 않고
별도 설계와 승인을 진행한다.

## Runtime 계약

모든 migration은 SQL 구현 전에 변경 경계, 허용 runtime/schema 조합, 상태 표면과 복구 전략을 설계·리뷰한다.
API `main` 반영 뒤에는 그 설계에 exact source ref, 실제 compatibility config와 schema fingerprint를 결속한
`kind: db-migration-runtime-contract`를 plan 생성 전에 고정하고 immutable plan에 포함한다. 이 exact 계약이
실행 시점 DB runtime 안전성의 단일 SoT다. Current 실행 코드와 검증기는 versioned runtime contract를
읽거나 쓰는 분기를 두지 않는다. 닫힌 과거 산출물은 실행 입력으로 재사용하지 않고 bytes 그대로 보존한다.

- 이전·현재·실제로 노출할 혼합 runtime set과 각 unit의 ID, kind, source ref,
  실제 compatibility config(feature flag, serializer mode, DB reader/writer·queue consumer·side-effect
  producer 활성 역할). immutable plan은 원문을 보존하고 workflow가 그 원문에서 config SHA를 계산한다.
- 변경된 read/write/state 경계와 각 runtime/schema 조합의 legacy/new-state 검증 결과
- 시작 DB와 최종 DB의 canonical physical schema SHA-256, 실제로 허용할 runtime 조합 및
  `FENCED | RESUMED | RECOVERING` 허용 phase
- DB, queue, 외부효과의 상태 표면
- FENCED smoke 방식: read-only, transaction rollback, isolated synthetic 중 하나
- 재개 전 restore, append-only recovery migration, 이전 완전 릴리스+최종 DB, forward fix,
  lossless reconciliation 중 실제 준비한 복구 전략과 검증 procedure ref

`RESUMED` 조합은 모든 변경 경계가 성공해야 하며, 현재 완전 릴리스+최종 DB 조합은 정확히 하나여야 한다.
이 현재 조합은 재개 뒤 복구의 active source가 될 수 있도록 `FENCED | RESUMED | RECOVERING`을 모두
허용해야 한다.
`mixed` runtime set은 durable `RESUMED` 조합으로 허용하지 않는다. 순차 재기동 중 mixed runtime이 생길 수
있다면 writer/effect producer를 계속 fence한 `FENCED | RECOVERING` 안에서만 전환하고, 그 보장이 없으면
재개를 차단한다.
이전 완전 릴리스+최종 DB rollback을 선언하려면 해당 runtime의 모든 queue consumer와 side-effect producer에
cursor, in-flight 작업, idempotency, 보상·외부 sink 검증 근거를 연결한다. SQL이 update·backfill·delete·DDL
중 무엇인지, 현재 source 소비가 0건인지, Store 강제 업데이트나 NextPush mandatory 여부는 이 증빙을
대체하지 않는다.

복구 plan은 accepted write, state postcondition, queue/effect producer, ledger와 sink 검증 procedure ref를
고정한다. execution은 같은 procedure ref와 별도의 실제 result ref를 남겨 계획과 결과를 결속한다. plan의
설명 문자열을 runtime 결과로 복사한 값은 증빙이 아니다.

## 실행 전 조건

다음 조건을 모두 fresh read로 확인한다.

1. 대상 환경과 DB identity가 예상값과 일치하고 TLS 검증이 활성화돼 있다.
2. API HTTP write, Admin write, WebSocket, cron, worker, direct SQL을 모두 분류한
   `kind: db-migration-writer-inventory`가
   있고, 존재하는 unit은 runtime 계약의 source ref/compatibility-config SHA와 정확히 일치한다.
   compatibility-config SHA는 환경별 secret·host·URL이 아니라 unit별
   `kind: db-migration-compatibility-config`의 DB/API 계약 feature flag, serializer mode, 활성 역할만
   canonical 정렬해 계산한다. manifest는 runtime contract unit에 inline으로 두고 workflow가 검증·계산한다. 없는
   writer category도 owner, 부재 근거와 검증을 기록한다.
3. 모든 writer와 queue/external-effect producer가 중지됐고 그 증빙이 있다.
4. application writer session과 활성 transaction이 0건이다.
5. 복원 가능한 backup 또는 snapshot의 식별자와 digest가 준비돼 있다.
6. catalog 전체가 `appliedRefs + recoveredRefs[].ref + baselineRefs + supersededRefs[].ref +
   pendingRefs`로 정확히 분할되고, recovery migration 자체는 `appliedRefs` 또는 `pendingRefs`에
   포함되며, pending은 catalog 순서를 유지한다. `adjudicableLedgerGapRefs[].ref`는
   `pendingRefs`의 exact subset이어야 한다.
7. plan의 catalog·SQL·postcondition manifest/check checksum이 배포 ref의 실제 bytes와 일치한다.
8. 운영 plan 생성과 실제 운영 workflow action 진입 때마다 참조한 개발계 plan/execution의 bytes SHA,
   execution `planSha256`, 환경별 history, catalog/runtime-contract SHA를 다시 검증한다.

## 표준 절차

공개 운영 진입점은 API package의 `db:migration` 하나다. 정상 실행과 outcome 판정·ledger repair·
복구는 이 workflow의 normal/`incident` action으로만 시작하며, 내부 typed executor 파일을 CLI로 직접
실행하지 않는다. 모든 action은 clean API source에서만 실행하며, initial은 `origin/main`, reentry는 immutable
plan의 `apiSourceRef`와 `HEAD`가 일치해야 한다.

1. runtime 계약과 writer inventory를 고정하고 API, Admin, WebSocket, cron, worker, direct SQL writer와
   queue/external-effect producer를 모두 중지한다.
2. DB identity, TLS, session/transaction drain과 backup을 확인한다.
3. exclusive DB lock을 획득하고 identity, drain, sealed ledger partition, plan과 SQL checksum을 다시
   확인한다.
4. lock을 보유한 채 시작 runtime set·schema fingerprint를 포함한 `FENCED` event를 실행 파일과 부모
   디렉터리에 `fsync`한다.
5. plan에 `adjudicableLedgerGapRefs`가 있으면 일반 `apply` 전에 후행 evidence ref와 별도 live
   postcondition을 `adjudicate-ledger-gap`으로 판정하고 SQL 실행 없이 `repair-ledger`로 ledger를
   복구한다. 판정·복구도 같은 identity, drain, lock, backup, writer inventory 조건을 사용한다.
6. 나머지 plan 순서대로 `migration-started`를 기록한 뒤 checksum-bound SQL 내부의 fail-closed precondition,
   target mutation, 별도 live postcondition, ledger 기록을 수행한다. precondition은 target mutation 전에
   실패하는 leading query 또는 stored routine 내부 guard다. lock 안에서 migration/postcondition을 한 번
   읽어 checksum을 확인한 그 bytes만 실행하고, 별도 수기 결과가 아니라
   `migration-sql-succeeded | migration-failed` 인과에 포함한다.
7. 전체 postcheck와 catalog/ledger 완료 상태를 확인하고 lock을 해제한다.
8. 최초 재개 조합과 같은 execution에서 사용할 모든 복구 target의 plan-final smoke를 writer가 닫힌
   `FENCED`에서 수행한다. read-only, transaction rollback 또는 isolated synthetic만 허용하며 plan의
   procedure ref, 별도 result ref, DB·queue·외부효과 모든 표면의 residual 0을 정확히 증명한다.
9. 현재 완전 릴리스+최종 DB 조합, 상태 표면별 시작 watermark와 `RESUMED` event를 durable하게 기록한
   뒤에만 production writer와 effect producer를 연다.
10. 재시작한 모든 runtime unit의 source ref와 compatibility-config SHA를 실제 관측한 running inventory가
   active mixture와 정확히 일치하고 smoke가 통과한 뒤에만 서비스를 완료한다.
11. 재개 뒤 복구가 필요하면 writer/effect producer를 다시 fence·drain하고 종료 watermark를 기록한
   `RECOVERING`으로 들어간다. 사전 smoke한 target에 선언된 전략과 증빙으로 상태를 복구하고, target
   mixture와 fresh 시작 watermark를 새 `RESUMED` event로 durable하게 기록한 뒤 runtime을 열어 서비스를
   완료한다.
   `RECOVERING` 진입과 복구 완료 event는 각각 fresh live ledger가 최종 migration 상태일 때만 기록한다.

서비스 중지 확인과 DB drain은 서로 대체하지 않는다. 프로세스를 중지했어도 DB session 또는 transaction이
남아 있으면 실행을 차단한다.

## Plan 계약

`plan.json`은 실행 전에 생성하는 immutable 입력이다.
Current plan은 `kind: db-migration-maintenance-plan`과 versionless runtime contract 한 형태만 사용한다.
versioned plan/runtime pair는 새 plan, replan, 재진입 또는 릴리스 증빙 root로 허용하지 않는다. 이미 닫힌
산출물과 게시된 릴리스 기록은 current validator로 해석하지 않고 불투명한 역사로만 보존한다.

- 환경, DB identity digest, API source ref, catalog·ledger compatibility·postcondition manifest artifact의
  path/checksum을 포함한다. manifest는 실제 check/setup SQL checksum을 결속한다.
- catalog의 모든 entry를 `appliedRefs`, `recoveredRefs[].ref`, `baselineRefs`,
  `supersededRefs[].ref`, `pendingRefs` 중 하나에 정확히 한 번씩 포함한다.
  `recoveredRefs[].recoveryRef`는 적용된 recovery ref와 원본 ref의 관계를,
  `supersededRefs[].supersedingRef`는 대체 ref를 결속한다.
- `adjudicableLedgerGapRefs`는 `pendingRefs`의 exact subset이며, 각 항목은 gap ref와 실제 후행 ledger
  evidence ref를 결속한다.
- 각 ref는 migration 경로, kind와 SQL SHA-256을 포함한다.
- `pendingRefs`는 catalog 순서를 유지하며 임의 subset을 허용하지 않는다.
- 실행 중 ledger는 `pendingRefs`의 연속된 prefix로만 전진할 수 있다.
- runtime 계약을 값으로 포함하며, 실제 다음 API runtime 중 하나는 plan의 API source ref와 일치한다.
- 개발계와 운영계는 각각 plan을 만들지만 운영계 plan은 같은 catalog/runtime-contract SHA의 완료된 개발계
  plan과 execution의 실제 bytes SHA를 함께 선행조건으로 참조한다. 개발계 execution은 운영 plan이 아니라
  참조한 개발계 plan의 환경별 partition과 `planSha256`으로 검증한다.
- 최초 개발계 plan에는 하나 이상의 pending release migration이 있어야 한다. 개발계 graph가 현재 execution과
  failed-history에서 직접 해결한 normal migration ref는 release-owned set이며, 이 집합은 운영 plan의
  `pendingRefs`와 정확히 같아야 한다. 개발계에서 append-only recovery가 필요했던 graph는 운영계로 승격하지
  않는다. 승인된 pre-release 기준으로 개발계를 복원하고 새 migration/version을 처음부터 검증한다. 어느
  환경에서든 canonical graph 밖에서 먼저 적용된 ref가 있으면 정상 promotion으로 바꾸지 않고
  `kind: violation`으로만 기록한다.

## Execution 계약

`execution.jsonl`은 `kind: db-migration-maintenance-event`인 event로 한 환경의 실행 사실을 순서대로 기록한다.
별도 Gate 로그, 서명 bundle, frontier transition 파일을 만들지 않는다.

필수 내용은 다음과 같다.

- DB identity와 TLS 확인
- exact runtime mixture와 writer inventory, owner, source ref/compatibility-config SHA,
  중지·부재·drain 관측
- backup 또는 snapshot ref와 digest
- exclusive lock 획득과 해제
- plan/catalog checksum
- 파일별 `migration-started`, `migration-sql-succeeded`, `migration-ledger-succeeded`,
  `migration-failed`의 `sql-or-postcondition | ledger` phase, `migration-outcome-adjudicated`,
  `migration-ledger-gap-adjudicated`
- 동일 ref의 성공은 `migration-started → migration-sql-succeeded → migration-ledger-succeeded`
  인과 순서로만 인정하며, 모든 `pendingRefs`가 이 execution에서 해결되기 전에는
  `database-completed`를 기록하지 않는다.
- 모든 event의 environment와 `planSha256`은 현재 plan과 정확히 일치해야 한다. 같은 partition/runtime을
  가진 다른 plan의 execution도 완료 근거로 재사용하지 않는다.
- 파일별 checksum-bound SQL 내부 precondition·target mutation과 별도 live postcondition의 통합
  SQL outcome, ledger 결과
- durable `FENCED`, DB가 해제 성공을 확인한 최종 `database-completed` 뒤의 `lock-released`, plan-final
  조합별 zero-residual smoke, `RESUMED`와 상태 표면별 watermark
- 필요 시 fresh fence의 `RECOVERING`, 복구 대상 runtime mixture, 수락 write·queue·외부효과 보존 근거
- 전체 postcheck, 재기동, smoke와 runtime-contract digest

JSONL은 exact schema와 허용된 상태 순서를 사용한다. 각 행을 임의로 재정렬하거나 unknown field를 추가할 수
없다. execution별 process lock을 잡고 기존 bytes와 새 event를 임시 파일에 끝까지 쓴 다음 file `fsync`,
atomic rename, parent directory `fsync`로 교체한다. newline/framing이 깨진 canonical 파일이나 이미 잡힌
lock은 덮어쓰지 않는다. stale lock은 기록된 owner process가 종료됐고 다른 writer가 없음을 확인한 뒤에만
제거한다. 파일 전체 SHA-256은 릴리스 기록에 고정한다. 실행 재개 판단은 JSONL만 신뢰하지 않고 현재 DB
ledger, DB identity와 migration postcondition을 다시 조회한다.
atomic rename 뒤 file/parent durability 확인만 실패해 transition 또는 adjudication event가 canonical
파일에 남은 경우, 동일 입력 재진입은 event를 중복 추가하지 않고 다시 `fsync`해 commit point를 확정한다.
`database-completed` 뒤 lifecycle event가 이미 존재하는 execution에 `apply`를 재호출하면 새
`lock-released`를 추가하지 않는다. `database-completed` 직후 lock 해제 event만 유실된 경우에만 그
event를 보강한다.
Lifecycle action의 검증이나 event 기록이 실패하면 DB lock은 해제하되 새 `lock-released` evidence를
execution에 추가하지 않는다. 성공한 action 뒤 DB가 해제 성공을 확인한 event만 다음 phase의 인과
근거로 인정한다.

## Ledger와 실패 복구

`schema_migrations`는 성공 시도 로그가 아니라 선언된 완료 조건을 만족한 migration의 append-only
완료 이력이다.

- 같은 이름과 canonical checksum 또는 sealed exact alias row가 있으면 SQL을 재적용하지 않는다.
- 같은 이름에 다른 checksum이 있으면 sealed 환경별 exact alias가 아닌 한 즉시 중단한다.
- SQL 또는 postcondition이 실패하면 ledger row를 만들지 않는다.
- SQL 성공 후 ledger 기록만 실패하면 DB identity, SQL checksum과 postcondition을 확인한 뒤
  ledger-only repair를 수행할 수 있다.
- `started` 뒤 outcome event append가 끊겨 실행 결과가 불명확하면 같은 SQL을 재실행하지 않는다. fresh
  identity·drain·ledger·고정 postcondition과 별도 incident/result ref로 outcome을 adjudicate한다.
  postcondition 성공·ledger 없음이면 ledger-only repair, 실패면 append-only recovery migration의 새
  plan/execution으로 이동한다.
- 실행 시작 기록이 없는 과거 ledger gap은 `migration-outcome-adjudicated`로 위장하지 않는다. Sealed
  compatibility manifest와 immutable plan이 gap ref·후행 evidence ref를 exact하게 선언하고, live
  ledger에서 evidence ref가 적용 상태이며 별도 postcondition이 성공한 경우에만
  `migration-ledger-gap-adjudicated`를 기록한다. 이 event 뒤에는 SQL 없이 ledger-only repair만 허용한다.
  일반 `apply`는 판정·복구되지 않은 adjudicable gap SQL을 실행하지 않는다.
- side effect가 일부만 적용됐거나 완료 조건이 불명확하면 같은 파일을 재실행하지 않고 새 번호의 recovery
  migration을 추가한다.
- `skipped`, 가짜 성공 row, checksum 변경으로 실패를 닫지 않는다.

Recovery plan은 원래 실패 plan과 execution의 bytes SHA, execution plan hash, 환경, DB identity, 실패
target ref를 결속한다. 실패 plan의 catalog refs는 현재 catalog의 immutable prefix여야 하며 그 뒤에는 해당
target을 가리키는 단 하나의 append-only recovery migration만 허용한다. Recovery 뒤 원래 migration과
recovery migration의 완료 조건과 ledger를 모두 확인한다.
개발계 SQL/postcondition 실패는 같은 미출시 version에서만 실패 root pair를 plan SHA history와 canonical
evidence에 먼저 보존하고 새 recovery plan root로 전환할 수 있다. 운영계 SQL/postcondition 실패와 recovery
migration 재실패는 자동 replan하지 않고 `manual-review-required`로 유지한다. 게시됐거나 terminal인 version의
plan, execution, release record는 incident action으로도 변경하지 않는다.
append-only recovery migration과 forward-fix migration은 기존 plan/execution에 덧붙이지 않고 새 immutable
plan/execution으로 수행한다. `RESUMED` 전 restore도 실패 execution을 성공으로 바꾸지 않는다. 복원 뒤
live schema/ledger를 다시 읽어 새 plan/execution으로 정상 시작 상태와 후속 작업을 검증한다.

`RESUMED` 전에는 writer/effect producer가 계속 닫혀 있다는 fresh evidence가 있을 때만 plan에 선언한
backup/snapshot restore를 사용할 수 있다. `RESUMED` 뒤에는 snapshot/PITR만으로 rollback하지 않는다.
그 뒤 수락한 모든 write와 queue/external effect를 보존·재생·보상하고 sink에서 검증할 수 있어야 하며,
그렇지 않으면 이전 release rollback 대신 forward fix 또는 통제된 lossless reconciliation을 사용한다.

## Baseline과 schema contract

- Catalog는 migration 디렉터리의 SQL과 exact-set이며 숫자 prefix 순서를 사용한다.
- Entry는 `file`, `kind`, `schemaEffect`, `includedInBaseline`, `replayInSchemaCheck`, `sha256`를 유지한다.
- Sealed SQL과 checksum, kind는 immutable이다.
- Schema 영향 migration은 빈 로컬 DB에서 baseline과 replay 대상 migration을 재생하고 schema lock을
  갱신한다.
- Data migration과 위험한 schema 변경은 migration별 setup/check fixture로 postcondition을 검증한다.
- Baseline 교체는 신규 migration과 분리한다. 운영 ledger와 catalog exact-set, DB identity,
  schema-only capture와 base-owned capture authority를 모두 확인한다.
- Baseline 교체 뒤에도 기존 SQL과 ledger row를 삭제하지 않는다.
- Catalog 이전 과거 ledger는 환경별 전체 row count와 canonical SHA-256 fingerprint가 sealed
  compatibility manifest와 정확히 일치할 때만 허용한다.
- 과거 runner의 kind·환경명·checksum 차이는 환경·migration별 exact tuple로만 허용한다. 비슷한 값,
  wildcard, 환경 공통 alias는 허용하지 않는다.
- baseline 포함 migration의 ledger 생략과 대체된 migration은 별도 resolved 상태로 분류하며 정상
  `appliedRefs`로 위장하지 않는다.
- Compatibility manifest의 기존 prefix identity와 기존 alias·supersession·gap 항목은 수정·삭제하지
  않는다. 새 사실을 추가해야 하면 실제 DB 판정 근거와 회귀 테스트를 같은 변경에 포함한다.

## 릴리스 기록

신규 DB migration scope는 `db-migration-maintenance-evidence/v1`만 사용한다.

- 개발계: `content/releases/evidence/db-migrations/<version>/dev/plan.json`,
  `execution.jsonl`
- 운영계: `content/releases/evidence/db-migrations/<version>/prod/plan.json`,
  `execution.jsonl`
- plan 입력 원본: `content/releases/evidence/db-migrations/<version>/inputs/<sha256>/<basename>`의
  catalog·ledger compatibility·postcondition manifest snapshot

릴리스 metadata의 `kind: canonical` 증빙은 현재 단계의 root `plan`과 nullable `execution` 한 쌍만 직접
참조한다. `planned`는 `plan: null, execution: null`, `pending`은 dev plan과 nullable dev execution,
`in_progress`는 완료된 dev plan/execution을 내부에서 참조하는 prod plan과 `execution: null`,
`released | rolled_back`은 그 prod plan과 완료된 prod execution을 기록한다. `pending`의 dev execution이
있으면 `service-completed`로 끝난 완전한 pair여야 하며 partial·failed execution은 허용하지 않는다.
개발계 execution을 완료한 뒤에만 prod plan을 생성하고, root를 prod plan으로 전진시킨 미병합 PR
head에서 preflight를 통과한 뒤 운영계를 실행한다. 개발계 plan/execution 생성과 실행은
[DB Migration 실행 런북](../flows/cross-project/db-migration-operation-flow.md)의 `status`가 안내한 workflow가
자체 안전 Gate로 수행하며, docs PR이나 preflight를 선행조건으로 요구하지 않는다. 검증기는 root execution의
environment와 `planSha256`, prod plan 내부 dev pair와 복구 plan 내부 failed pair를 실제 archive bytes/SHA까지
따라가며,
root에서 도달할 수 없는 같은 버전의 artifact를 거부한다. dev/prod root와 도달 가능한 failed-history는
각 plan에서 도달하는 content-addressed 입력 snapshot과 함께 보존하지만 metadata에 같은 참조를 중복
기록하지 않는다. 후속 릴리스로 대체된 `superseded` scope는
마지막으로 도달한 dev 또는 prod root pair를 그대로 보존하며, 이를 운영 실행이나 완료 증빙으로 재사용하지
않는다.

개발계 완료와 운영 실행 사이가 현재 작업 세션보다 길면 완료된 dev root pair와 그 root에서 도달 가능한
failed-history만 release record 없는 checkpoint PR로 먼저 `main`에 병합한다. 이 PR은 같은 evidence schema를
재사용하며 별도 checkpoint manifest를 만들지 않는다. 검증기는 신규 no-record evidence를 completed dev
graph로 검증하고, `main`에 들어간 각 artifact의 수정·삭제·교체와 같은 version의 추가 no-record artifact를
거부한다. checkpoint의 version은 배타적으로 예약된다. 운영 전환을 취소하거나 catalog·migration bytes,
ledger compatibility, runtime contract가 달라져 기존 dev pair가 prod plan을 통과하지 못하면 그 version을
재사용하지 않고 더 높은 version에서 개발계 검증을 다시 수행한다. 같은 version의 최초 release record는
`db-migration` canonical prod plan root로 이 checkpoint를 소비해야 하며 scope 누락, `kind: violation`, 다른 dev bytes를
허용하지 않는다. checkpoint PR에는 release record를 넣지 않고, prod plan을 담은 release record PR은 운영
완료 전까지 미병합 상태로 유지한다.

checkpoint 뒤 API `main`이 전진해도 DB-only 운영 전환은 dev/prod plan의 동일한 `apiSourceRef`를 immutable
executor/runtime basis로 유지할 수 있다. 이 ref는 최신 API `origin/main`의 조상이어야 하고 root에서 도달하는
모든 plan의 sealed input을 각 plan ref의 원본 bytes와 대조한다. canonical 서비스 checkout의 clean
`main == origin/main` 검사는 이 trusted source 검증을 위한 별도 baseline Gate이며 executor ref를 현재 main으로
바꾸지 않는다. `coupler-api` 또는 `contracts-package`를 같은 릴리스에 포함하면 이 예외를 적용하지 않고 새 API
ref에서 개발계 검증을 다시 수행한다.

`pending` dev root는 metadata/checkpoint 검증에는 유효하지만 운영 preflight admission은 아니다. 운영 실행
직전에는 `in_progress` canonical prod plan/null root만 허용한다. `main`에 checkpoint가 있으면 preflight도
그 version의 모든 dev·failed-history bytes를 현재 PR과 byte-for-byte 비교하고 최초 record가
`in_progress | released | rolled_back` canonical prod root로 소비하는지 확인한다. DB scope가 이미
`released | rolled_back`이고 다른 scope만 남은 뒤의 preflight는 완료된 prod graph를 보존한 채 계속할 수
있다. 더 높은 version은 이전 version의 dev root pair를 복사할 수 없고 새 개발계 실행으로 다시 검증한다.

Canonical chain 없이 이미 실행된 작업은 같은 v1의 `kind: violation`으로만 사실을 기록한다. 이는 실행 경로가
아니며 이미 적용된 `released` scope에만 허용하고 `pending | in_progress | rolled_back`, 운영 실행 승인,
개발계에서 운영계로의 전환 또는 `runtimeRecovery.stateSafety` 근거로 사용할 수 없다. release/API ref, 검증
시각, production DB identity·schema fingerprint, catalog와 ledger compatibility checksum, 전체 catalog
resolved·pending/gap 0,
대상 migration의 exact file/checksum·ledger·live postcondition, 사전 backup digest, writer fence·resume smoke,
canonical execution을 사후 제조하지 않았다는 한계를 모두 기록해야 한다.

`main`에 이미 병합된 모든 릴리스 기록은 불투명한 역사적 최종본이다. DB evidence의 schema·상태·내용을
파싱하거나 현재 계약으로 재검증하지 않고, 파일 전체의 경로·blob 불변성만 확인한다.

Canonical maintenance executor는 plan/execution의 의미, live DB 결과와 재개 가능 여부를 검증한다. Docs는
live DB 판정을 복제하지 않는다. 신규 기록은 root graph와 sealed input의 경로·bytes SHA-256, catalog
partition·recovery relation·postcondition digest, runtime/API ref와 완료 event의 결속을 확인한다. 운영
preflight는 추가로 각 snapshot을 plan의 API commit에 있는 원본 bytes와 대조한다. 독립 docs checkout의
경량 검증은 snapshot 자체와 graph 결속을 확인하고, API 원본 대조를 대신하지 않는다. 최종 PR head는
보호된 base validator가 실행하는 필수 provenance CI에서 API `main` 이력과 원본 bytes를 다시 대조하고,
`DB Migration Provenance / exact-head` required status를 검증한 PR head SHA에 직접 게시한다.

## 완료 조건

- [ ] 모든 writer/effect producer의 owner, 실제 runtime ref/config와 중지 또는 부재 근거가 확인됐는가?
- [ ] DB identity·TLS, session/transaction 0건과 backup이 fresh evidence에 있는가?
- [ ] Plan이 catalog 전체를 `appliedRefs + recoveredRefs[].ref + baselineRefs +
      supersededRefs[].ref + pendingRefs`로 exact partition하고 adjudicable gap은 pending subset인가?
- [ ] 이전·현재·필요한 혼합 runtime, 변경 경계, 상태 표면, 허용 phase와 복구 전략이 plan에 선언됐는가?
- [ ] 같은 catalog/runtime-contract SHA의 개발계 완료 뒤 운영계를 실행했는가?
- [ ] 완료된 dev pair를 참조하는 prod plan이 현재 root이며, 운영 실행 전 그 미병합 PR head의 preflight를
      통과했는가?
- [ ] checkpoint executor ref를 유지했다면 API `origin/main`의 조상이고 DB-only scope이며 모든 reachable
      plan의 원본 bytes를 trusted API source에서 확인했는가?
- [ ] sealed gap은 후행 ledger evidence와 live postcondition으로 별도 판정·ledger-only repair했고,
      나머지 pending ref는 순서대로 postcondition과 ledger를 완료했는가?
- [ ] FENCED final-DB smoke가 최초 재개·복구 target 조합과 모든 상태 표면 residual 0을 증명했는가?
- [ ] RESUMED marker와 시작 watermark가 production write/effect보다 먼저 durable하게 기록됐는가?
- [ ] 복구했다면 target의 새 RESUMED marker와 fresh 시작 watermark 뒤에 runtime을 열었는가?
- [ ] post-resume rollback을 허용했다면 수락 write·queue·외부효과의 무손실 보존 증빙이 있는가?
- [ ] 전체 postcheck, 재기동과 현재 완전 릴리스 smoke가 완료됐는가?
- [ ] 환경별 root가 `plan.json`/`execution.jsonl` 한 쌍이고, 복구 이력은
      `history/<failed-plan-sha256>/`의 도달 가능한 immutable pair만 존재하며 모든 plan 입력 snapshot이
      `inputs/<sha256>/<basename>`에 봉인됐는가?

## 연결 문서

- [릴리스 게이트 플로우](../flows/cross-project/release-automation-pipeline.md)
- [DB Migration 실행 런북](../flows/cross-project/db-migration-operation-flow.md)
- [운영 릴리스 실행 런북](../flows/cross-project/production-deploy-command-runbook.md)
- [릴리스 프로세스](release-process.md)
- [테스트/CI 전략](testing-strategy.md)
