# DB Migration 실행 런북

## 문서 역할

- 역할: `시나리오`
- 문서 종류: `flow`
- 충돌 시 우선 문서: [DB Migration 정책](../../policy/db-migration-gate-policy.md), [릴리스 프로세스](../../policy/release-process.md)
- 기준 성격: `as-is`

## 한눈에 보기

```text
current trio 작성·검증 → API main 병합 → dev-run
→ Docs에 dev pair 기록 → prod-prepare → Docs preflight
→ traffic/writer 중지·drain·backup → prod-run
→ API 배포·smoke·재개 → finalize patch 리뷰·병합 → runtime 정리
```

DB 명령은 제품 버전이나 `--`를 받지 않는다. 제품 버전과 release evidence 경로는 Docs만 소유한다.

## 1. 최종 SQL 작성

API `db/schema/`에 세 파일을 함께 만든다.

```text
current.sql
current.fixture.sql
current.state.sql
```

- `current.sql`: 마지막 baseline에서 목표까지 필요한 최종 SQL
- `current.fixture.sql`: scratch 전용 대상·비대상·0건·중복 경계
- `current.state.sql`: `source_ok`, `target_ok`, `evidence`를 반환하는 read-only `SELECT`

current에는 대상 schema의 table/view/index DDL과 `INSERT`·`REPLACE`·`UPDATE`·`DELETE`만 쓴다. fixture는
schema-neutral `SELECT`/DML만 허용하며 서버 관리 문장은 허용하지 않는다. `INSERT`·`REPLACE`는 `INTO`를
명시하고, table 결합은 괄호·comma·`USING` 없이 `JOIN ... ON`으로만 쓴다. view DDL은
`SQL SECURITY INVOKER`를 반드시 명시한다. current·fixture·state는 session/user variable을 사용하지 않는다.

schema 변경이면 CI와 같은 MariaDB 10.6의 버려도 되는 localhost DB에서 target lock을 갱신한다.

```bash
DB_SCHEMA_HOST=127.0.0.1 \
DB_SCHEMA_PORT=3306 \
DB_SCHEMA_USER=root \
DB_SCHEMA_PASSWORD='<local-password>' \
DB_SCHEMA_DATABASE=coupler_schema_check \
pnpm db:schema:verify --allow-reset-local-schema

pnpm verify
```

UPDATE를 포함한 작성 예시는 API
[`db/schema/README.md`](https://github.com/coupler-developer/coupler-api/blob/main/db/schema/README.md)를 따른다.
문법 통과만으로 충분하지 않다. START, 모든 proper prefix의 PARTIAL, 최종 TARGET을 함께 검증한다.

리뷰가 끝난 current trio와 엔진 변경을 API `main`에 병합한다. `dev-run`과 운영 명령은 clean
`main == origin/main`에서 실행한다.

## 2. 개발계

개발 DB를 마지막 baseline으로 준비하고 `.runtime/db-migration/inputs/dev-backup.json`에 backup ref,
SHA-256, source DB identity digest를 채운다. DB 연결은 application config에서 추론하지 않고 mutation 전 환경별
`DB_MIGRATION_HOST`, `DB_MIGRATION_PORT`, `DB_MIGRATION_USER`, `DB_MIGRATION_PASSWORD`,
`DB_MIGRATION_DATABASE`, `DB_MIGRATION_SSL_CA_FILE`, `DB_MIGRATION_EXPECTED_IDENTITY_SHA256`로 명시한다.
host는 인증서 검증이 가능한 DNS 이름이어야 한다.

migration 계정은 대상 schema 전체의 `ALL PRIVILEGES`(grant delegation 제외)와 target DB session 관측용
global `PROCESS`만 가진다. 다른 global 권한이나 다른 schema 권한이 있으면 엔진이 거부한다. 엔진은 MariaDB
Performance Schema instrumentation에 의존하지 않는다. sleeping connection을 포함한 target-default session,
server-wide active session과 InnoDB transaction을 모두 거부한다.

최초에는 expected identity만 비우고 `status`를 실행한다. TLS로 읽은 database, server hostname/id/version과
출력 digest를 승인된 인프라 inventory·backup 원본과 대조한 뒤 그 digest를
`DB_MIGRATION_EXPECTED_IDENTITY_SHA256`에 넣고 `status`를 다시 실행한다. mutation 명령은 expected identity
없이는 진행되지 않는다.

```bash
pnpm db:migration status
pnpm db:migration dev-run
```

성공하면 `.runtime/db-migration/dev/plan.json`과 `execution.jsonl`이 생긴다. 제품 릴리스 기록을 시작할 때 이
두 파일을 Docs의 다음 경로에 그대로 복사한다.

```text
content/releases/evidence/db-migrations/vX.Y.Z/dev/plan.json
content/releases/evidence/db-migrations/vX.Y.Z/dev/execution.jsonl
```

개발 실행이 실패하면 다음 순서로 정리한다.

1. current를 고치기 전에 개발 DB를 마지막 baseline으로 재생성한다.
2. 같은 `dev-run`으로 exact START를 관측해 실패 journal을 RESTORED로 닫고 unpublished runtime을 비운다.
3. current trio를 직접 수정·통합하고 검증·리뷰·API main 병합을 다시 거친다.
4. 최종 SQL로 `dev-run`을 다시 실행한다.

실패 candidate, 새 번호, 보정/recovery SQL을 source나 Docs evidence에 남기지 않는다.

## 3. 운영 준비

위 DB 연결 환경변수를 운영 endpoint 값으로 바꾸고 expected identity를 비운다. `status` 출력의 운영
database/server identity를 승인된 인프라 inventory와 대조해 운영 digest를 설정한 뒤 `status`를 다시 통과한다.
남아 있는 dev slot은 운영 identity와 다르므로 `UNBOUND`로 표시되는 것이 정상이다. 그 다음 같은 clean API
main에서 실행한다. dev와 prod의 DB identity는 달라야 하지만 engine version과 SQL mode는 같아야 한다.
두 환경의 migration session은 `autocommit=1`, `foreign_key_checks=1`, `unique_checks=1`이어야 하며 DB
migration 엔진은 다른 값을 실행 전에 거부한다.

개발·운영 engine 문자열이나 SQL mode가 다르면 여기서 중단한다. 개발계를 운영 engine으로 재구성한 뒤
baseline부터 dev 검증을 다시 하며, engine compatibility adapter나 이중 실행 경로를 만들지 않는다.

```bash
pnpm db:migration status
pnpm db:migration prod-prepare
```

생성된 prod plan을 Docs에 복사하고 release metadata의 DB scope를 `in_progress`로 갱신한다.

```text
content/releases/evidence/db-migrations/vX.Y.Z/prod/plan.json
```

Docs PR을 push한 뒤 exact pending ref로 preflight를 실행한다.

```bash
yarn release:preflight --version vX.Y.Z --pending-ref "$(git rev-parse HEAD)"
```

Docs provenance workflow는 repository secret `COUPLER_CI_READ_TOKEN`으로 API main의 sealed source bytes를
읽는다. GitHub App과 `COUPLER_DEV_TOKEN`은 사용하지 않는다.

## 4. 운영 실행

`prod-run` 전에 운영 릴리스 담당자가 다음을 완료한다.

1. traffic과 application·batch·event writer를 중지한다.
2. 진행 중인 transaction과 queue 소비를 drain한다.
3. 운영 backup을 생성·확인한다.
4. `.runtime/db-migration/inputs/prod-backup.json`을 채운다.

이 전제는 운영 런북의 책임이다. DB 엔진은 외부 중지나 재개를 증명하는 파일을 받지 않는다.

```bash
pnpm db:migration prod-run
```

- DONE/TARGET: DB 전이가 끝났다. 이 시점부터 pre-run backup 복원을 금지한다.
- STARTED/TARGET: 같은 명령이 SQL을 재실행하지 않고 DONE을 기록한다.
- STARTED/PARTIAL: writer를 계속 닫고 외부에서 복원하거나 수동 검토한다.
- 외부 복원 뒤 START: 새 instance라 hostname·port·server id가 바뀌면 expected identity를 비우고 `status`로
  새 digest를 승인한다. 논리 database 이름·engine·SQL mode가 기존 plan과 같은 경우 같은 `prod-run`이
  RESTORED를 기록하며, fresh 실행은 `prod-prepare`부터 다시 시작한다.

DONE 뒤에는 [API 운영 배포 런북](api-production-deploy-flow.md)으로 exact API commit을 배포하고 health,
기능 smoke, 로그를 확인한 다음 traffic/writer를 재개한다. 이 결과를 DB journal에 기록하지 않는다.

## 5. 증거와 baseline 정리

prod 실행 뒤 `plan.json`과 `execution.jsonl`을 Docs의 같은 버전 `prod/` 경로에 복사하고 release metadata를
실제 결과로 갱신한다. 별도 input snapshot, manifest, archive, history reader를 만들지 않는다.

API main에서 다음 명령을 실행하면 baseline 승격/current 제거 patch가 생긴다.
prod plan commit은 현재 main의 조상이어야 하고 sealed baseline/current bytes는 그대로여야 한다. 무관한 API
commit이 main에 추가된 것은 허용하지만 current trio는 finalize까지 바꾸지 않는다.

```bash
pnpm db:migration finalize
```

patch를 리뷰·검증·병합한 뒤 clean main에서 같은 명령을 다시 실행한다. 이 두 번째 실행은 `pnpm verify`와
localhost 전용 `db:schema:verify`의 Idle baseline replay를 직접 통과하고, plan의 API commit에 봉인된 state
SQL로 운영 DB identity와 TARGET을 다시 확인한 뒤에만 local runtime을 비운다. 위 1절의 `DB_SCHEMA_*`
scratch 설정을 사용한다. 명령은 commit, Docs 수정, 배포를 자동 수행하지 않는다.

## 금지

- current SQL을 workflow 밖에서 직접 재실행
- PARTIAL을 새 START로 간주
- DONE/TARGET 뒤 pre-run backup 복원
- 실패 후보용 새 migration/recovery SQL 또는 version 생성
- runtime contract, Docs commit, fence/smoke/resume/restore 승인 marker 추가
- 현재 engine에서 게시된 과거 release evidence 재해석

## 관련 문서

- [DB Migration 정책](../../policy/db-migration-gate-policy.md)
- [운영 릴리스 실행 런북](production-deploy-command-runbook.md)
- [API 운영 배포 런북](api-production-deploy-flow.md)
