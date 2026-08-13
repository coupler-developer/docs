# DB Migration 정책

## 문서 역할

- 역할: `규범`
- 문서 종류: `policy`
- 충돌 시 우선 문서: 이 문서
- 기준 성격: `as-is`

## 목적

여러 SQL migration이 계속 추가·병합되는 동안 개발계와 운영계의 적용 지점이 달라도, 개발계에서 확인한
exact source만 운영계에 순서대로 적용한다. 개발자 절차는 로컬 검증 후 개발계 적용, 같은 source의 운영계
적용이라는 두 단계로 유지한다.

## Source 계약

API의 private 물리 source는 다음 세 기준 파일과 append-only migration 파일이다.

```text
db/schema/baseline.sql
db/schema/baseline.lock.json
db/schema/schema.lock.json
db/migrations/<17자리 UTC ID>_<snake_case 이름>.sql
```

- migration 한 파일에는 SQL 문장을 여러 개 작성할 수 있다.
- ID가 실행 순서를 정하고 filename이 migration identity가 된다.
- checksum은 SQL 파일 원본 bytes의 SHA-256이다.
- canonical main에 병합된 migration은 수정·삭제·이름 변경·재정렬하지 않는다. 변경은 더 큰 ID의 새
  migration으로 추가한다.
- CI는 중복 ID, 기존 파일 변경·삭제, main의 마지막 ID보다 앞선 신규 ID를 거부한다. 병렬 PR은 최신 main을
  반영한 뒤 충돌한 ID를 다시 생성한다.
- 릴리스 완료를 이유로 migration을 flush, finalize, baseline 승격 또는 삭제하지 않는다.

`schema_migrations`는 개발·운영 DB에 이미 존재하는 내부 적용 기록이다. 새 ledger를 만들거나 교체하지 않고,
새 source 파일의 적용 여부 확인에만 최소 사용한다.

```text
같은 filename의 행 없음               → pending
같은 filename + 같은 checksum         → applied, skip
같은 filename + 다른 checksum         → SQL 실행 전 실패
```

Runner는 source에 있는 filename만 조회한다. 개발 DB의 기존 96행과 운영 DB의 기존 87행을 비교하거나 새 ID
계산에 사용하지 않으며, 다른 과거 행을 수정하지 않는다. migration SQL은 `schema_migrations`를 직접 읽거나
쓰지 않는다.

## 작성·검증 Gate

Mac의 API root에서 다음 두 명령을 사용한다.

```bash
pnpm db:migration new <name>
pnpm db:migration verify
```

`verify`는 disposable Docker MariaDB 10.6과 MySQL 8.4에서 각각 baseline과 정렬된 전체 migration을 실제
실행하고 다음을 확인한다. MariaDB replay 결과로 생성물 `schema.lock.json`을 동기화하며 CI는 그 diff가
source에 포함되지 않으면 실패한다.

1. baseline SQL이 기준 schema를 재현한다.
2. 모든 migration을 ID 순서로 실행할 수 있다.
3. MariaDB 10.6의 최종 schema가 `schema.lock.json`과 일치한다.
4. MySQL 8.4에서도 같은 영속 객체 집합까지 실행된다.
5. 정상 완료 뒤 같은 source를 재실행하면 SQL 실행이 0건이다.

table/view/index DDL과 `INSERT`·`REPLACE`·`UPDATE`·`DELETE`를 허용한다. standalone `SELECT`, 외부 schema 접근, 서버 관리,
외부 파일·네트워크 effect, session/user variable, runner의 `schema_migrations` 소유권 침범은 거부한다. View는
`SQL SECURITY INVOKER`를 사용한다. DML은 대상·비대상·0건·중복, 현재 값, PK·UK·FK·cascade 영향을 리뷰와
Docker 양 엔진 실행으로 확인한다.

로컬 Docker 통과는 운영 데이터에서의 결과를 대신하지 않는다. 온라인 실행 가능 여부를 자동 분류하거나
expand/backfill/contract 절차를 자동 생성하지 않으며, 각 SQL의 live traffic 호환성은 작성·리뷰에서
명시적으로 판단한다.

## 개발·운영 적용 Gate

공개 실행 명령은 다음 두 종류다.

```bash
pnpm db:migration status <dev|prod>
pnpm db:migration apply <dev|prod>
```

`dev`는 `config/development.json`, `prod`는 `config/production.json`의 DB 연결을 사용한다. 출력과 typed
confirmation에는 환경, DB hostname/port/database/current user, 전체 HEAD SHA, `schema_migrations` 전체 행 수와 이 source의
applied/pending 목록을 표시한다. credential은 출력하거나 source에 기록하지 않는다.

`status`와 `apply`는 canonical repository의 clean exact HEAD만 받는다. 이 SHA를 **마이그레이션 소스 커밋**이라
부른다. 개발계에 적용한 SHA 이후 main에 다른 migration이 병합되어도 운영계는 최신 main이 아니라 같은
마이그레이션 소스 커밋을 detached checkout해 실행한다. 별도 watermark 파일이나 기능은 두지 않는다.

Runner끼리의 동시 실행은 대상 DB의 advisory lock으로 직렬화한다. 서비스 writer 전체 중지나 target DB의 다른
session 0건은 모든 migration의 보편 조건으로 두지 않는다. 특정 SQL이 별도 운영 조치를 요구하면 그 migration
리뷰와 제품 릴리스 절차에서 명시하며 runner가 자동 판정했다고 주장하지 않는다.

## 실행 결과와 한계

정상 완료한 migration은 SQL 성공 뒤 기존 `schema_migrations`에 filename과 checksum을 기록한다. 같은 source의
정상 재실행은 해당 SQL을 모두 건너뛴다.

SQL 실행 중 오류가 나거나 SQL 완료 후 적용 기록 전에 process가 중단되면 자동 재실행하지 않는다. live DB를
수동 확인한 뒤 별도 판단한다. 이 정책은 새 장애 복구 체계, DML 부분 적용 처리, 감사 receipt/evidence,
온라인 가능 여부 분류, expand/backfill/contract 자동화, bootstrap baseline, 범용 adopt를 신설하지 않는다.

## 현행 Source 전환

개발·운영 DB에는 `schema_migrations`와 `t_iap_notification`이 이미 존재한다. 따라서 기존
`DROP schema_migrations`와 `CREATE t_iap_notification` current SQL은 어느 DB에도 실행하지 않는다.

- 기준 schema source에 두 테이블을 모두 포함한다.
- `current.sql`, `current.fixture.sql`, `current.state.sql`을 제거한다.
- IAP용 새 migration이나 적용 이력을 만들지 않는다.
- 이 전환으로 개발·운영 DB를 변경하지 않는다.

## 연결 문서

- [DB Migration 실행 런북](../flows/cross-project/db-migration-operation-flow.md)
- [테스트 전략](testing-strategy.md)
- [코드 리뷰 정책](code-review-policy.md)
