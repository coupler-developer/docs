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
- private 서비스 저장소의 schema-only baseline과 append-only migration을 물리 스키마 SoT로 고정한다.
- 생성된 schema lock과 실제 replay 결과를 비교해 물리 스키마 drift를 자동 차단한다.
- 각 DB 내부에 적용 완료 이력을 남겨 "어디까지 마이그레이션되었는가"를 파일명/기억이 아니라 DB 조회로 확인하게 한다.

## 적용 범위

- DB 스키마 변경(DDL)
- 데이터 이관(backfill)
- 읽기 기준 변경(cutover)
- 레거시 제거(contract)

## 저장소별 단일 기준

- 공개 docs는 논리 엔티티, 관계, 소유권, 분류, 불변 조건, 생명주기만 설명한다. 서비스 업무 스키마의 전체
  물리 테이블·컬럼 catalog와 실행 가능한 DDL을 복제하지 않는다.
- 본 정책의 migration ledger 계약과 Gate 검증을 위한 최소 범용 SQL은 거버넌스 예시이며 서비스 업무
  스키마 SoT로 보지 않는다.
- private 서비스 저장소는 아래 물리 schema contract를 단일 기준으로 관리한다.
    - 특정 main commit의 운영 구조를 schema-only read로 캡처한 `baseline`
    - baseline 이후 migration 파일과 분류·checksum catalog
    - baseline과 replay 대상 migration으로 생성한 현재 `schema lock`
- baseline과 schema lock은 생성물이며 직접 편집하지 않는다. 변경은 migration 추가와 재생성 명령으로만
  반영한다.
- 실제 개발계/운영계 적용 완료 상태는 각 DB의 migration ledger를 단일 기준으로 사용한다. 저장소의
  catalog와 DB ledger는 목적이 다르며 서로 대체하지 않는다.
- Wiki, Notion, 수기 스프레드시트, 별도 테이블·컬럼 설명 문서는 물리 schema SoT로 인정하지 않는다.

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

- `DBM-GATE-000`에는 [엔지니어링 가드레일](engineering-guardrails.md)의 DB 설계 최종 리뷰를 포함한다.
  신규 도메인이나 다중 객체 변경은 요구사항-SoT 매핑, 최소 구조, 명명/타입, 무결성/동시성, 조회/인덱스,
  생명주기/호환성 근거가 없으면 SQL 작성 전 단계에서 중단한다.
- 단일 컬럼·인덱스처럼 범위가 작은 변경은 별도 architecture 문서 대신 PR에 같은 판정과 N/A 근거를 남길 수
  있지만, 설계 관점 자체를 생략할 수는 없다.
- 각 마이그레이션 SQL 헤더에 `Gate IDs:`를 명시한다.
- 일반 DDL 검증 baseline은 private schema-only baseline을 사용한다.
- 운영 원문 `dump`는 backfill·cutover·contract의 데이터 보존을 schema-only baseline과 합성 fixture로 검증할
  수 없을 때만 [데이터 거버넌스 정책](data-governance-policy.md)의 예외 절차로 사용한다.
- 각 postcheck SQL은 적용 대상 Gate별 카운터와 최종 guard 결과를 출력한다.
- guard 실패는 `SIGNAL SQLSTATE '45000'` 또는 의도된 실패 쿼리로 즉시 중단한다.
- Gate 통과 근거 로그 파일 경로를 PR/리뷰 코멘트에 남긴다.
- 적용되지 않는 Gate는 생략하지 말고 `N/A`로 기록한다.
- `N/A`는 `Gate ID + N/A 사유 + 근거 경로` 3종 세트가 있을 때만 인정한다.
- 더미 SQL 또는 의미 없는 0건 결과로 Gate를 통과 처리하지 않는다.
- Draft SQL은 공유 DB(개발계/운영계) 쓰기 작업 전까지만 수정 가능하다. Local 검증 또는 운영 read-only preflight에서 발견된 문제는 기존 Draft SQL을 수정해 재검증하며, 새 번호 SQL 파일을 만들지 않는다.
- 개발계 쓰기 작업 전 운영 read-only preflight로 대상 DB 차이를 먼저 확인한다.
- 운영 read-only preflight는 DB 식별값, 적용 이력, 대상 객체 정의/카운터 조회 결과를 로그로 남긴다.
- 운영/개발계에 적용 완료된 SQL 파일은 append-only로 취급한다. 수정이 필요하면 기존 파일을 고치지 말고 새 번호의 SQL 파일을 추가한다.
- 개발계/운영계 DB에 적용하는 각 SQL 파일은 성공 후 `schema_migrations`에 기록한다. postcheck-only SQL도 실행 순서에 포함되면 동일하게 기록한다.
- 일회성 로컬 검증 DB는 migration ledger 기록 대신 baseline commit, 실행 SQL 목록, schema lock 비교,
  postcheck 결과로 증빙할 수 있다.
- 개발계/운영계 쓰기 작업이 실패하거나 실행이 중단되면 동일 SQL 세트를 즉시 재실행하지 않는다. 먼저 실제 대상 DB에서 DB 식별값, 적용 완료 row, 적용 대상 객체/컬럼/데이터 상태, 실패 SQL 로그를 확인해 `미적용`, `부분 적용`, `성공 후 ledger 누락` 중 하나로 분류한다.
- `미적용`이고 해당 SQL이 아직 개발계/운영계 어느 공유 DB에도 성공 적용되거나 ledger 기록되지 않았다면 기존 Draft SQL을 수정해 실행 검증 파이프라인 순서로 다시 검증한다.
- `부분 적용`이거나 이미 한 공유 DB에라도 성공 적용된 SQL이면 기존 SQL 파일을 수정하지 않고 새 번호의 복구/재개 SQL 파일을 추가한다. 새 SQL은 실행 검증 파이프라인 순서로 다시 검증한다.
- `성공 후 ledger 누락`이면 적용 당시 checksum, 성공 postcheck 로그, 실제 DB 식별값을 확인한 뒤 이력 테이블 복구 절차로 처리한다.

### 출시 전 개발계 migration reset 예외

공유 개발계에 적용한 기능이 아직 운영계에 한 번도 적용되지 않았고 runtime도 출시되지 않았다면, 잘못된
중간 DDL을 운영계 실행 산출물로 고정하지 않기 위해 개발계 이력과 객체를 한 번에 되돌리고 최종 migration
세트로 다시 시작할 수 있다. 이 예외는 아래 조건을 모두 충족한 경우에만 적용한다.

- 사용자 또는 서비스 책임자가 reset 대상 기능과 개발계를 명시적으로 승인한다.
- 운영계 read-only preflight에서 대상 객체·데이터·ledger가 모두 0건임을 확인한다.
- 개발계에서 대상 기능의 모든 업무 테이블이 0행이고, 외부 inbound FK·Trigger·Event·활성 runtime 의존성이
  없음을 확인한다. 하나라도 존재하면 reset하지 않고 append-only 후속 migration을 사용한다.
- 삭제할 객체, 설정 row, 기존 ledger 파일명·checksum의 exact-set과 되돌릴 수 있는 기존 migration commit을
  reset 전에 기록한다.
- 대체 migration은 현재 main의 다음 번호부터 `precheck → expand/backfill → postcheck` 순서로 최소화하고,
  reset 전에 빈 로컬 DB replay와 schema lock 검증을 통과한다.
- reset은 대상 기능 객체와 해당 기능이 만든 설정·ledger exact-set만 제거한다. ledger만 지우거나 다른 기능
  row를 함께 제거하지 않는다.
- DDL auto-commit을 전제로 각 단계 뒤 실제 객체·데이터·ledger 상태를 다시 조회한다. 중단되면 재실행하지
  않고 `미적용`, `부분 적용`, `성공 후 ledger 누락`으로 먼저 분류한다.
- reset 직후 같은 작업 창에서 대체 migration을 개발계에 적용하고 `target_env='dev'` ledger, postcheck,
  schema lock 동등성을 확인한다. 운영계에는 검증된 대체 세트만 적용한다.
- reset 전후 DB 식별값, row count, 의존성, 제거한 ledger, 새 ledger, Gate 결과를 PR 또는 릴리즈 증빙에 남긴다.

운영계에 대상 migration이나 runtime 데이터가 한 건이라도 존재하거나, 출시된 client/server가 대상 계약을
사용했다면 이 예외를 적용할 수 없다. 해당 시점부터는 기존 append-only·Expand/Contract 규칙을 따른다.

### SQL 산출물 위치

- 서비스 레포의 합의된 영구 migration 경로에만 SQL을 추가한다. 적용 완료 SQL은 제거하거나 수정하지 않는다.
- baseline, migration catalog, schema lock은 같은 private 서비스 저장소의 합의된 schema contract 경로에서
  관리한다.
- 수동 SQL은 운영 실행 산출물로 관리하고, PR/릴리즈에는 SQL 원문 또는 승인된 산출물 경로, SHA-256 checksum, Gate 로그, `schema_migrations` row를 남긴다.
- 다른 서비스에 새 영구 경로가 필요하면 feature 변경과 분리해 레포 구조 결정으로 먼저 합의한다.

### Migration catalog와 schema lock

- migration catalog는 migration 디렉터리의 파일 목록과 정확히 일치해야 한다. 누락 파일과 미존재 파일
  참조를 모두 실패 처리한다.
- 각 catalog entry는 파일 checksum, 변경 종류, schema 영향 여부, 빈 DB replay 여부, baseline 포함 여부를
  기록한다.
- 공유 DB에 적용됐거나 ledger에 기록된 migration 파일과 기존 catalog entry는 append-only다. checksum,
  분류, replay 판정을 바꾸지 않고 새 번호의 후속 migration을 추가한다.
- schema 영향이 있는 신규 migration은 빈 로컬 DB에서 baseline 이후 replay 가능해야 하고 schema lock을
  갱신해야 한다.
- 신규 테이블은 책임이 드러나는 table `COMMENT`, 신규·정의 변경 컬럼은 목적이 드러나는 column `COMMENT`를
  포함해야 한다. 이름을 반복하는 대신 필요한 값 범위·단위·NULL 의미·생성/갱신 주체를 짧고 자연스럽게
  설명한다.
- contract check는 baseline 이후 신규 테이블·수정된 table `COMMENT`와 신규·정의 변경 컬럼의 빈 `COMMENT`
  및 문자 깨짐을 실패 처리한다. 업무 의미와 표현 명확성은 DB 설계 리뷰에서 판정한다.
- 기존 `COMMENT` 누락·오탈자·문자 깨짐은 baseline/lock을 직접 고치지 않고 별도 append-only migration과
  schema lock 갱신으로 정정한다.
- data-only migration은 fixture 없이 빈 DB에서 재생하지 않는다. schema lock을 변경하지 않고 별도
  backfill/postcheck Gate로 검증한다.
- baseline에 이미 포함된 과거 migration은 checksum과 분류를 catalog에 보존하되 baseline 뒤에 중복
  replay하지 않는다.
- baseline 교체는 일반 feature 변경과 분리한다. schema-only 캡처, source main commit, 기존 migration
  포함 범위, 새 baseline replay 결과를 함께 리뷰한다. 캡처 대상 DB의 migration ledger와 catalog는
  migration 파일명 exact-set, checksum, `target_env=prod`, DB identity가 모두 일치해야 한다.

### DB와 애플리케이션 배포 순서

- DB 변경은 `Expand`, `Backfill`, `Cutover`, `Contract` 중 하나로 분류하고 그에 맞춰 배포 순서를 정한다.
- backward-compatible `Expand`는 같은 배포 윈도우에서 애플리케이션보다 먼저 반영할 수 있다.
- DB-only 선반영이 기존 코드의 허용 범위를 넓히면 허용 범위, 기간, 후속 API/Admin/Mobile 배포 범위를 PR/릴리즈에 남긴다.
- `Contract`/`drop`은 현재 API/Admin/Mobile 코드의 의존성 0건과 DB Gate를 확인한 뒤 실행한다. 이 저장소
  순서는 public API의 구버전 호환이나 별도 traffic 관찰을 요구하는 근거가 아니다. 강제 업데이트/mandatory로
  하나의 최종 계약을 배포하는 경우 같은 릴리즈 윈도우의 검증된 후속 단계로 실행할 수 있다.
- Mobile/Admin/API 영향은 DB 직접 접속 여부가 아니라 API 계약, 서버 동작, 배포 버전 기준으로 판단한다.

## 적용 이력 테이블

- `schema_migrations`는 각 DB 안에 존재하는 DB-local 적용 완료 이력이다.
- Flyway/Liquibase 등 동등한 migration tool ledger를 사용하면 별도 `schema_migrations` 테이블을 만들지 않아도 된다.
- 별도 migration tool이 없는 수동 SQL 운영에서는 개발계/운영계 DB마다 `schema_migrations`를 둔다.
- 개발계/운영계 DB는 `schema_migrations` 또는 동등한 tool ledger가 있는 상태를 전제로 한다.
- `schema_migrations`는 성공한 실행만 기록한다. 실패/중단 시도는 로그로만 남기고 적용 완료 row를 insert하지 않는다.
- `target_env`는 실행자가 의도한 환경(`local`, `dev`, `prod`)이며, 단독 증빙으로 인정하지 않는다.
- `database_name`, `server_hostname`, `server_id`, `server_version`, `applied_by`를 함께 기록해 실제 접속 DB를 확인한다.
- `applied_by`는 작업자 이름이 아니라 실제 DB 실행 계정으로 고정하며, 신규 적용 row는 반드시 `CURRENT_USER()` 값으로 기록한다.
- 작업자/에이전트 식별이 별도로 필요하면 `applied_by`를 임의 문자열로 대체하지 말고 `note`에 보조 정보로 남긴다.
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
  'member annual income nullable expansion'
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

## 판정 규칙

- 하나의 Gate라도 실패하면 해당 Stage는 미완료다.
- 적용 대상 Gate 중 하나라도 미실행/미기록이면 미완료다.
- `No Findings`는 적용 대상 필수 Gate 전부 통과 + 비적용 Gate 전부 `N/A` 근거 완료일 때만 선언한다.
- migration catalog/checksum 불일치, baseline/lock 직접 편집, schema-effect migration의 lock 미갱신,
  baseline replay 결과와 schema lock drift 중 하나라도 있으면 승인하지 않는다.
- 모든 DB 변경은 공개 논리 문서 영향을 판정한다. 관계·소유권·분류·불변 조건·생명주기·외부 계약이
  바뀌면 연결된 docs PR이 없을 때 승인하지 않고, 물리 구현만 바뀌면 `논리 문서 영향 없음` 근거를 남긴다.
- `DBM-GATE-010` 적용 대상 DB에서 적용 완료 row 또는 동등한 migration tool ledger가 없으면 ledger 통제 완료로 판정하지 않는다.
- `schema_migrations`의 `target_env`와 실제 DB 식별값이 실행 대상과 맞지 않으면 즉시 중단한다.
- `DBM-GATE-400`이 적용되는 변경은 이번 변경에서 제거 대상으로 명시한 레거시 잔존 0건까지 확인해야만 `No Findings`다.
- 삭제 대상이 명시되지 않은 기존 기능/객체는 레거시로 간주해 삭제하지 않는다.
- `DBM-GATE-300`은 diff 0건만으로 충분하지 않다. 검증 범위(대상 시나리오, 기간 또는 샘플 수)와 로그 위치가 함께 명시되어야 한다.
- `DBM-GATE-400`은 레거시 `drop` 전 의존성 0건 확인과 일정 기간 read/write 0건 모니터링을 완료해야만 통과다.

## 실행 검증 파이프라인 (간단)

1. `정적 contract 검증`: migration 파일과 catalog의 목록·checksum·분류를 비교하고 baseline/lock의 직접
   편집과 기존 migration 변경을 차단한다.
2. `Local Schema Replay`: 빈 로컬 MariaDB에 private schema-only baseline과 replay 대상 migration을
   순서대로 실행하고 실제 구조와 schema lock을 비교한다. `DBM-GATE-000/100` 또는 schema drift 검사
   미통과 시 즉시 중단한다.
3. `Local 데이터 검증`: backfill·cutover·contract는 합성 fixture를 우선 사용해
   `DBM-GATE-200/300/400`을 검증한다. 불가피한 운영 원문 dump 반입은 데이터 거버넌스 예외 절차와 삭제
   증빙을 적용한다.
4. `운영 read-only preflight`: 운영계 DB 식별값, 적용 이력, 대상 객체 정의/카운터를 조회해 운영 차이를
   먼저 확인한다. 쓰기 작업은 금지한다.
5. `개발계 이력 확인`: 개발계 DB의 `schema_migrations` 또는 동등한 migration tool ledger를 조회해 적용
   예정 SQL의 중복/체크섬 불일치가 없는지 확인한다. ledger가 없으면 즉시 중단한다.
6. `개발계 반영`: 로컬에서 통과한 동일 SQL 세트를 개발계 DB에 동일 순서로 적용하고,
   카운터/해시/guard 결과가 동일 결론(`No Findings`)인지 확인한 뒤 `target_env='dev'`로 기록한다.
7. `운영계 이력 확인`: 운영계 DB의 `schema_migrations` 또는 동등한 migration tool ledger를 조회해
   개발계와 동일한 기준으로 중복/체크섬 불일치를 확인한다. ledger가 없으면 즉시 중단한다.
8. `운영계 반영`: Local+개발계 검증 완료 후에만 운영계 MySQL에 동일 SQL 세트를 반영한다. 운영계 반영
   실패 또는 중단 시 즉시 중단하고, 작성 규칙의 실패/중단 분류에 따라 후속 조치를 결정한다. 재검증이
   필요한 SQL은 실행 검증 파이프라인 순서로 다시 검증한다.
9. `운영계 postcheck`: 운영계 반영 직후 동일 Gate 기준 postcheck SQL을 실행해 최종 guard 결과를 확인한다.
   성공 후 `target_env='prod'`로 ledger에 기록한다.
10. `근거 기록`: PR/리뷰에 운영 read-only preflight 로그 경로(`DB 식별값 + 적용 이력 + 대상 객체
    정의/카운터`)를 남긴다. 적용 대상 Gate별 `Gate ID + SQL 파일 경로 + 로그 경로 + schema_migrations
    row 또는 migration tool ledger`를 남기고, 비적용 Gate는 `Gate ID + N/A 사유 + 근거 경로`를 남긴다.
11. `승인 조건`: 정적 contract 검증, Local Schema Replay, 운영 read-only preflight, 개발계 DB 검증 근거 중
    하나라도 없으면 승인하지 않는다. 운영 반영 완료 판정은 운영계 postcheck 로그와 ledger 기록을 함께
    확인한다.

## 표준 자동 검증

- private 서비스 저장소의 schema contract check는 모든 PR에서 migration catalog, checksum, baseline/lock
  canonical form, 기존 migration 불변성을 검사한다.
- 리뷰어는 같은 작업 단위의 공개 논리 문서 영향 판정과 연결된 docs PR 또는 `논리 문서 영향 없음` 근거를
  확인한다.
- DB 관련 경로가 바뀐 PR은 CI의 임시 MariaDB에서 baseline과 replay 대상 migration을 실행하고 실제 구조와
  schema lock이 일치해야 한다.
- 로컬 replay 명령은 localhost 전용 DB와 명시적 reset 플래그가 함께 있을 때만 실행되도록 fail-closed로
  구현한다.
- schema contract check는 서비스 저장소의 표준 테스트 명령에도 포함해 전용 workflow 우회를 막는다.

## 에이전트/리뷰어 추적 규칙

- 작업 지시 또는 리뷰에서 `DBM-GATE-*`가 언급되면, 본 문서를 우선 기준으로 해석한다.
- 근거 제시는 운영 read-only preflight에 대해 `로그 경로 + DB 식별값 + 적용 이력 + 대상 객체 정의/카운터`, 적용 Gate에 대해 `Gate ID + SQL 파일 경로 + 로그 경로 + schema_migrations row 또는 migration tool ledger`, 비적용 Gate에 대해 `Gate ID + N/A 사유 + 근거 경로`를 기본으로 한다.
