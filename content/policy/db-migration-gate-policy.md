# DB Migration Gate 정책

## 문서 역할

- 역할: `규범`
- 문서 종류: `policy`
- 충돌 시 우선 문서: 이 문서
- 기준 성격: `as-is`

## 목적

- DB 마이그레이션 검증을 `Gate ID` 기반으로 추적 가능하게 고정한다.
- 실행자/리뷰어/에이전트가 동일 근거로 합격/실패를 판정하게 한다.
- fail-closed 원칙으로 중간 상태 배포를 차단한다.
- 운영 `dump`를 baseline으로 삼아 `Local -> 개발계 DB -> 운영계` 순서로 동일 SQL 검증/반영 절차를 고정한다.
- 각 DB 내부에 적용 완료 이력을 남겨 "어디까지 마이그레이션되었는가"를 파일명/기억이 아니라 DB 조회로 확인하게 한다.

## 적용 범위

- DB 스키마 변경(DDL)
- 데이터 이관(backfill)
- 읽기 기준 변경(cutover)
- 레거시 제거(contract)

## Gate ID 규칙

- 형식: `DBM-GATE-###` (예: `DBM-GATE-010`)
- `###`은 3자리 숫자 고정
- 한 Gate ID는 하나의 판정 책임만 가진다
- SQL/문서/PR/로그에서 동일 Gate ID를 공통 사용한다

## 필수 Gate 세트

| Gate ID | Stage | 적용 조건 | 판정 책임 | 최소 증빙 | 실패 시 동작 |
| --- | --- | --- | --- | --- | --- |
| `DBM-GATE-000` | Precheck | 모든 DB 변경 작업 | 선행 객체/컬럼/버전 조건 충족 | precheck SQL 결과, baseline 로그 | 즉시 중단 |
| `DBM-GATE-010` | Migration Ledger | 수동 SQL을 개발계/운영계 DB에 반영할 때 | 적용 전 중복/체크섬 검증, 적용 후 DB-local 성공 이력 기록 | `schema_migrations` 조회/insert 결과 또는 동등한 migration tool ledger, 실제 DB 식별값 | 즉시 중단 |
| `DBM-GATE-100` | Expand | 신규 테이블/컬럼/인덱스/FK 추가가 있을 때 | 신규 객체 생성 및 스키마 검증 | DDL 결과, schema diff 또는 show/create 결과 | 즉시 중단 |
| `DBM-GATE-200` | Backfill | 기존 데이터 이관/보정이 있을 때 | row 수/무결성/상태 매핑 검증 | source/target count, 무결성 쿼리 결과, guard 로그 | 즉시 중단 |
| `DBM-GATE-300` | Cutover | read/write 기준, 계산식, 조회 경로를 구 버전에서 신 버전으로 전환할 때 | 구/신 계산 diff 0건 검증 | diff 쿼리 결과, 대상 시나리오/기간 또는 샘플 수, 로그 경로 | 즉시 중단 |
| `DBM-GATE-400` | Contract | 레거시 객체 삭제, 호환 분기 제거, `drop` 실행이 있을 때 | 레거시 객체/호환 분기 제거 검증 | 의존성 0건 확인, 일정 기간 read/write 0건 로그, 제거 후 postcheck 결과 | 즉시 중단 |

## 작성 규칙

- 각 마이그레이션 SQL 헤더에 `Gate IDs:`를 명시한다.
- baseline은 운영 `dump`를 로컬 MySQL에 복원한 상태를 기준으로 한다.
- 각 postcheck SQL은 적용 대상 Gate별 카운터와 최종 guard 결과를 출력한다.
- guard 실패는 `SIGNAL SQLSTATE '45000'` 또는 의도된 실패 쿼리로 즉시 중단한다.
- Gate 통과 근거 로그 파일 경로를 PR/리뷰 코멘트에 남긴다.
- 적용되지 않는 Gate는 생략하지 말고 `N/A`로 기록한다.
- `N/A`는 `Gate ID + N/A 사유 + 근거 경로` 3종 세트가 있을 때만 인정한다.
- 더미 SQL 또는 의미 없는 0건 결과로 Gate를 통과 처리하지 않는다.
- 운영/개발계에 적용 완료된 SQL 파일은 append-only로 취급한다. 수정이 필요하면 기존 파일을 고치지 말고 새 번호의 SQL 파일을 추가한다.
- 개발계/운영계 DB에 적용하는 각 SQL 파일은 성공 후 `schema_migrations`에 기록한다. postcheck-only SQL도 실행 순서에 포함되면 동일하게 기록한다.
- 일회성 로컬 검증 DB는 `schema_migrations` 기록 대신 복원 `dump`, 실행 SQL 목록, postcheck 결과, 데이터 보존 검증 로그로 증빙할 수 있다.
- 개발계/운영계 반영이 실패하거나 실행이 중단되면 동일 SQL 세트를 즉시 재실행하지 않는다. 먼저 실제 대상 DB에서 DB 식별값, 적용 완료 row, 적용 대상 객체/컬럼/데이터 상태, 실패 SQL 로그를 확인해 `미적용`, `부분 적용`, `성공 후 ledger 누락` 중 하나로 분류한다.
- 실패/중단 후 복구 또는 재개 SQL이 필요하면 기존 파일을 수정하지 않고 새 번호의 SQL 파일로 추가한다. 새 SQL은 다시 Local baseline -> 개발계 -> 운영계 순서로 검증한다.

## 적용 이력 테이블

- `schema_migrations`는 각 DB 안에 존재하는 DB-local 적용 완료 이력이다.
- Flyway/Liquibase 등 동등한 migration tool ledger를 사용하면 별도 `schema_migrations` 테이블을 만들지 않아도 된다.
- 별도 migration tool이 없는 수동 SQL 운영에서는 개발계/운영계 DB마다 `schema_migrations`를 둔다.
- 개발계/운영계 DB는 `schema_migrations` 또는 동등한 tool ledger가 있는 상태를 전제로 한다.
- `schema_migrations`는 성공한 실행만 기록한다. 실패/중단 시도는 로그로만 남기고 적용 완료 row를 insert하지 않는다.
- `target_env`는 실행자가 의도한 환경(`local`, `dev`, `prod`)이며, 단독 증빙으로 인정하지 않는다.
- `database_name`, `server_hostname`, `server_id`, `server_version`, `applied_by`를 함께 기록해 실제 접속 DB를 확인한다.
- 동일 DB에서 `migration_name`이 이미 존재하고 `checksum_sha256`이 같으면 중복 적용하지 않는다. 이미 존재하지만 checksum이 다르면 즉시 중단한다.
- 개발계/운영계 DB에서 `schema_migrations`가 없으면 현재 운영 기준 이탈로 보고 신규 비즈니스 마이그레이션을 중단한다.
- 이력 테이블 생성/복구가 필요하면 일반 비즈니스 마이그레이션과 분리한 별도 복구 작업으로 처리하고, 복구 완료 후 실제 DB 식별값과 적용 이력 row를 확인한다.
- 이력 테이블 복구 작업은 성공 적용 근거가 있는 SQL에 대해서만 row를 복구한다. 성공 postcheck 로그, 적용 당시 checksum, 실제 DB 식별값 없이 완료 row를 임의 생성하지 않는다.
- 복구 후에는 동일 DB에서 `migration_name` 중복 0건, checksum 불일치 0건, `target_env`와 실제 DB 식별값 일치를 확인해야 신규 비즈니스 마이그레이션을 재개할 수 있다.

```sql
CREATE TABLE IF NOT EXISTS schema_migrations (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  migration_name VARCHAR(255) NOT NULL,
  migration_type VARCHAR(30) NOT NULL DEFAULT 'migration',
  target_env VARCHAR(20) NOT NULL,
  checksum_sha256 CHAR(64) NOT NULL,
  database_name VARCHAR(128) NOT NULL,
  server_hostname VARCHAR(255) NULL,
  server_id BIGINT UNSIGNED NULL,
  server_version VARCHAR(100) NULL,
  applied_by VARCHAR(255) NOT NULL,
  applied_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  note VARCHAR(500) NULL,
  UNIQUE KEY uq_schema_migrations_name (migration_name)
);
```

적용 완료 기록은 대상 SQL 또는 postcheck SQL의 guard가 성공한 뒤에만 남긴다.

```sql
INSERT INTO schema_migrations (
  migration_name,
  migration_type,
  target_env,
  checksum_sha256,
  database_name,
  server_hostname,
  server_id,
  server_version,
  applied_by,
  note
)
VALUES (
  '53_expand_member_annual_income.sql',
  'migration',
  '<local|dev|prod>',
  '<sha256>',
  DATABASE(),
  @@hostname,
  @@server_id,
  @@version,
  CURRENT_USER(),
  't_member annual_income nullable add'
);
```

예시의 `target_env`와 `checksum_sha256`은 실제 실행 대상과 파일 checksum으로 치환한다.
개발계/운영계 적용 전에는 대상 DB 식별값과 이번 배치의 적용 이력을 함께 조회한다.

```sql
SELECT
  DATABASE() AS database_name,
  @@hostname AS server_hostname,
  @@server_id AS server_id,
  @@version AS server_version,
  CURRENT_USER() AS current_user;

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

## 판정 규칙

- 하나의 Gate라도 실패하면 해당 Stage는 미완료다.
- 적용 대상 Gate 중 하나라도 미실행/미기록이면 미완료다.
- `No Findings`는 적용 대상 필수 Gate 전부 통과 + 비적용 Gate 전부 `N/A` 근거 완료일 때만 선언한다.
- `DBM-GATE-010` 적용 대상 DB에서 적용 완료 row 또는 동등한 migration tool ledger가 없으면 ledger 통제 완료로 판정하지 않는다.
- `schema_migrations`의 `target_env`와 실제 DB 식별값이 실행 대상과 맞지 않으면 즉시 중단한다.
- `DBM-GATE-400`이 적용되는 변경은 이번 변경에서 제거 대상으로 명시한 레거시 잔존 0건까지 확인해야만 `No Findings`다.
- 삭제 대상이 명시되지 않은 기존 기능/객체는 레거시로 간주해 삭제하지 않는다.
- `DBM-GATE-300`은 diff 0건만으로 충분하지 않다. 검증 범위(대상 시나리오, 기간 또는 샘플 수)와 로그 위치가 함께 명시되어야 한다.
- `DBM-GATE-400`은 레거시 `drop` 전 의존성 0건 확인과 일정 기간 read/write 0건 모니터링을 완료해야만 통과다.

## 실행 검증 파이프라인 (간단)

1. `Local Baseline 검증`: 최신 운영 `dump`를 로컬 MySQL에 복원하고 precheck SQL을 먼저 실행한다. `DBM-GATE-000` 또는 baseline gate 미통과 시 즉시 중단한다.
2. `Local 마이그레이션 검증`: 운영 `dump` 기준 로컬 DB에 신규 DDL/backfill/cutover/contract SQL을 순서대로 실행하고, `DBM-GATE-100/200/300/400` 통과 전까지 수정-재실행을 반복한다.
3. `개발계 이력 확인`: 개발계 DB의 `schema_migrations` 또는 동등한 migration tool ledger를 조회해 적용 예정 SQL의 중복/체크섬 불일치가 없는지 확인한다. ledger가 없으면 즉시 중단한다.
4. `개발계 반영`: 로컬에서 통과한 동일 SQL 세트를 개발계 DB에 동일 순서로 적용하고, 카운터/해시/guard 결과가 동일 결론(`No Findings`)인지 확인한 뒤 `target_env='dev'`로 기록한다.
5. `운영계 이력 확인`: 운영계 DB의 `schema_migrations` 또는 동등한 migration tool ledger를 조회해 개발계와 동일한 기준으로 중복/체크섬 불일치를 확인한다. ledger가 없으면 즉시 중단한다.
6. `운영계 반영`: Local+개발계 검증 완료 후에만 운영계 MySQL에 동일 SQL 세트를 반영한다. 운영계 반영 실패 또는 중단 시 즉시 중단하고, 작성 규칙의 실패/중단 분류를 완료한 뒤 동일 SQL 재시도 또는 새 번호의 복구/재개 SQL 추가 여부를 결정해 Local 단계부터 다시 검증한다.
7. `운영계 postcheck`: 운영계 반영 직후 동일 Gate 기준 postcheck SQL을 실행해 최종 guard 결과를 확인한다. 성공 후 `target_env='prod'`로 ledger에 기록한다.
8. `근거 기록`: PR/리뷰에 적용 대상 Gate별 `Gate ID + SQL 파일 경로 + 로그 경로 + schema_migrations row 또는 migration tool ledger`를 남기고, 비적용 Gate는 `Gate ID + N/A 사유 + 근거 경로`를 남긴다.
9. `승인 조건`: Local/개발계 DB 검증 근거가 없으면 승인하지 않는다. 운영 반영 완료 판정은 운영계 postcheck 로그와 ledger 기록을 함께 확인한다.

## 에이전트/리뷰어 추적 규칙

- 작업 지시 또는 리뷰에서 `DBM-GATE-*`가 언급되면, 본 문서를 우선 기준으로 해석한다.
- 근거 제시는 적용 Gate에 대해 `Gate ID + SQL 파일 경로 + 로그 경로 + schema_migrations row 또는 migration tool ledger`, 비적용 Gate에 대해 `Gate ID + N/A 사유 + 근거 경로`를 기본으로 한다.
