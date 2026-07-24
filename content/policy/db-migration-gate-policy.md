# DB Migration 유지보수 정책

## 문서 역할

- 역할: `규범`
- 문서 종류: `policy`
- 충돌 시 우선 문서: DB migration 안전 조건은 이 문서, 전체 릴리스 순서는 [릴리즈 자동화 파이프라인](../flows/cross-project/release-automation-pipeline.md)
- 기준 성격: `as-is`

## 목적

개발계와 운영계 DB migration은 서비스를 계속 쓰게 둔 상태에서 실행하지 않는다. API, Admin,
WebSocket, cron, worker, direct SQL writer를 모두 멈춘 유지보수 구간에서 같은 순서와 checksum의 SQL을
적용한다.

이 정책은 운영자가 실제로 확인해야 하는 안전 조건만 남긴다. 서명, trust epoch, frontier, activation
marker, Gate별 N/A 표는 신규 migration 계약이 아니다.

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
| 물리 schema 기준 | `baseline.sql`, `baseline.lock.json`, `schema.lock.json` |
| migration별 검증 | 해당 migration의 setup/check fixture와 SQL 자체의 pre/postcondition |
| 환경별 적용 완료 | 각 DB의 `schema_migrations` ledger |
| baseline 교체 권한과 원본 | base-owned capture authority |
| 운영 실행 기록 | 환경별 `plan.json`, `execution.jsonl` |

`main`에 이미 병합된 migration SQL 전체는 수정하거나 삭제하지 않는다. baseline에 포함돼도 SQL, checksum,
catalog entry와 ledger row를 보존한다.

## 지원하는 실행 방식

신규 migration은 유지보수 방식만 지원한다. 모든 writer를 중지할 수 없거나 남은 session/transaction을
0으로 만들 수 없으면 실행하지 않는다. 무중단·online migration이 필요하면 이 절차에 예외를 추가하지 않고
별도 설계와 승인을 진행한다.

## 실행 전 조건

다음 조건을 모두 fresh read로 확인한다.

1. 대상 환경과 DB identity가 예상값과 일치하고 TLS 검증이 활성화돼 있다.
2. API HTTP write, Admin write, WebSocket, cron, worker, direct SQL의 owner와 중지 명령이
   `execution.jsonl`에 기록돼 있다.
3. application writer session과 활성 transaction이 0건이다.
4. 복원 가능한 backup 또는 snapshot의 식별자와 digest가 준비돼 있다.
5. catalog 전체가 `completedRefs + pendingRefs`로 정확히 분할되고, pending은 catalog 순서를 유지한다.
6. plan의 catalog와 SQL checksum이 배포 ref의 실제 bytes와 일치한다.
7. 개발계 execution이 완료되지 않았다면 운영계를 시작하지 않는다.

## 표준 절차

1. API, Admin, WebSocket, cron, worker와 direct SQL writer를 모두 중지한다.
2. DB identity, TLS, session/transaction drain과 backup을 확인한다.
3. catalog와 ledger 차이로 환경별 `plan.json`을 생성한다.
4. exclusive DB lock을 획득하고 identity, ledger prefix, plan과 SQL checksum을 다시 확인한다.
5. plan 순서대로 파일별 precondition, SQL 적용, postcondition, ledger 기록을 수행한다.
6. 전체 postcheck와 catalog/ledger 완료 상태를 확인한다.
7. 서비스를 재기동하고 smoke를 완료한 뒤 유지보수 상태를 해제한다.

서비스 중지 확인과 DB drain은 서로 대체하지 않는다. 프로세스를 중지했어도 DB session 또는 transaction이
남아 있으면 실행을 차단한다.

## Plan 계약

`plan.json`은 실행 전에 생성하는 immutable 입력이다.

- 환경, DB identity digest, API source ref, catalog path와 checksum을 포함한다.
- catalog의 모든 entry를 `completedRefs`와 `pendingRefs`로 정확히 한 번씩 포함한다.
- 각 ref는 migration 경로, kind와 SQL SHA-256을 포함한다.
- `pendingRefs`는 catalog 순서를 유지하며 임의 subset을 허용하지 않는다.
- 실행 중 ledger는 `pendingRefs`의 연속된 prefix로만 전진할 수 있다.
- 개발계와 운영계는 각각 plan을 만들지만 운영계 plan은 완료된 개발계 execution을 선행조건으로 참조한다.

## Execution 계약

`execution.jsonl`은 한 환경의 실행 사실을 순서대로 기록한다. 별도 Gate 로그, 서명 bundle, frontier
transition 파일을 만들지 않는다.

필수 내용은 다음과 같다.

- DB identity와 TLS 확인
- writer inventory, owner, 중지 명령과 drain 관측
- backup 또는 snapshot ref와 digest
- exclusive lock 획득과 해제
- plan/catalog checksum
- 파일별 `started`, `sql_succeeded`, `ledger_succeeded`, `failed_sql`, `failed_ledger`
- 파일별 precondition, postcondition, SQL checksum과 ledger 결과
- 전체 postcheck, 재기동, smoke와 rollback ref

JSONL은 exact schema와 허용된 상태 순서를 사용한다. 각 행을 임의로 재정렬하거나 unknown field를 추가할 수
없다. 파일 전체 SHA-256은 릴리스 기록에 고정한다. 실행 재개 판단은 JSONL만 신뢰하지 않고 현재 DB ledger,
DB identity와 migration postcondition을 다시 조회한다.

## Ledger와 실패 복구

`schema_migrations`는 성공 시도 로그가 아니라 선언된 완료 조건을 만족한 migration의 append-only
완료 이력이다.

- 같은 이름과 checksum row가 있으면 SQL을 재적용하지 않는다.
- 같은 이름에 다른 checksum이 있으면 즉시 중단한다.
- SQL 또는 postcondition이 실패하면 ledger row를 만들지 않는다.
- SQL 성공 후 ledger 기록만 실패하면 DB identity, SQL checksum과 postcondition을 확인한 뒤
  ledger-only repair를 수행할 수 있다.
- side effect가 일부만 적용됐거나 완료 조건이 불명확하면 같은 파일을 재실행하지 않고 새 번호의 recovery
  migration을 추가한다.
- `skipped`, 가짜 성공 row, checksum 변경으로 실패를 닫지 않는다.

Recovery 뒤 원래 migration과 recovery migration의 완료 조건과 ledger를 모두 확인한다.

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

## 릴리스 기록

신규 DB migration scope는 `db-migration-maintenance-evidence/v1`만 사용한다.

- 개발계: `content/releases/evidence/db-migrations/<version>/dev/plan.json`,
  `execution.jsonl`
- 운영계: `content/releases/evidence/db-migrations/<version>/prod/plan.json`,
  `execution.jsonl`

릴리스 metadata에는 네 파일의 repo-relative path와 실제 bytes SHA-256만 기록한다. `pending`에서는 두 plan을
고정하고 execution은 비워 둔다. `released` 또는 `rolled_back`에서는 네 파일이 모두 존재해야 한다.

`main`에 이미 병합된 모든 릴리스 기록은 불투명한 역사적 최종본이다. DB evidence의 schema·상태·내용을
파싱하거나 현재 계약으로 재검증하지 않고, 파일 전체의 경로·blob 불변성만 확인한다.

Canonical maintenance executor는 plan/execution의 의미, live DB 결과와 재개 가능 여부를 검증한다. Docs
검증은 이 의미 검증을 복제하지 않고 신규 릴리스 기록이 참조한 네 regular file의 고정 경로와 실제 bytes
SHA-256만 확인한다. 따라서 경로와 SHA-256만으로 실행 완료를 새로 추론하지 않고, executor가 완료한
execution을 정확히 묶는 역할만 한다.

## 완료 조건

- [ ] 모든 writer의 owner와 중지 명령이 확인됐는가?
- [ ] DB identity·TLS, session/transaction 0건과 backup이 fresh evidence에 있는가?
- [ ] Plan이 catalog 전체를 completed/pending exact partition하는가?
- [ ] 개발계 완료 뒤 운영계를 실행했는가?
- [ ] 모든 pending ref가 순서대로 postcondition과 ledger를 완료했는가?
- [ ] 전체 postcheck, 재기동과 smoke가 완료됐는가?
- [ ] 환경별 산출물이 plan과 execution 두 개뿐인가?

## 연결 문서

- [릴리즈 자동화 파이프라인](../flows/cross-project/release-automation-pipeline.md)
- [운영 배포 명령어 런북](../flows/cross-project/production-deploy-command-runbook.md)
- [배포/릴리즈 프로세스](release-process.md)
- [테스트/CI 전략](testing-strategy.md)
