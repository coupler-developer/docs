# DB Migration 정책

## 문서 역할

- 역할: `규범`
- 문서 종류: `policy`
- 충돌 시 우선 문서: 이 문서
- 기준 성격: `as-is`

## 목적

마지막 운영 DB 상태에서 목표 상태까지의 최종 전이 하나만 관리한다. DB 엔진의 책임은 DB identity, backup
입력, lease, live state, SQL 실행과 durable journal에 닫는다.

## Source 계약

API `db/schema/`는 두 상태만 허용한다.

| 상태 | 파일 |
| --- | --- |
| Idle | `baseline.sql`, `baseline.lock.json`, 같은 `schema.lock.json` |
| Active | Idle 파일 + `current.sql`, `current.fixture.sql`, `current.state.sql` |

- `current.sql`: 마지막 baseline에서 목표까지의 최소·직접 전이
- `current.fixture.sql`: scratch 검증 전용 경계 데이터
- `current.state.sql`: `source_ok`, `target_ok`, `evidence` 한 행을 반환하는 read-only `SELECT`

어느 대상 DB에도 실행되지 않은 current trio는 merge 여부와 무관하게 직접 수정·통합·삭제할 수 있다. 리뷰나
개발 실패마다 새 번호, 보정 SQL, recovery SQL을 추가하지 않는다. 번호·catalog·manifest·kind·DB ledger·
compatibility reader·history 계층은 두지 않는다. 과거는 Git history와 이미 게시된 release evidence에만 남는다.

## 작성 Gate

운영 계열인 MariaDB 10.6 scratch 검증은 다음을 모두 만족해야 한다.

1. baseline+fixture가 START다.
2. current 전체 적용 뒤 TARGET이다.
3. 여러 문장인 current의 모든 proper prefix가 PARTIAL이다.
4. 전체 managed schema가 각각 baseline lock과 target lock에 정확히 일치한다.
5. state SQL 오류, 잘못된 결과 shape, 양쪽 true/false, schema drift는 PARTIAL이다.

현재 lock이 표현하지 않는 trigger, event, function, procedure, database/schema DDL은 거부한다.
`current.sql`은 대상 schema의 table/view/index DDL과 `INSERT`·`REPLACE`·`UPDATE`·`DELETE`만,
fixture는 schema를 바꾸지 않는 `SELECT`와 같은 DML만 허용한다. 그 밖의 서버·관리 문장은 거부한다.
table 결합은 direct reference와 `JOIN ... ON`만 허용하고 괄호·comma·`USING`은 허용하지 않는다.
view DDL은 환경별 migration 계정이 definer가 되지 않도록 `SQL SECURITY INVOKER`를 반드시 명시한다.
engine 전용 `RETURNING` 절은 canonical subset에서 허용하지 않는다.
current·fixture·state는 session/user variable을 읽거나 쓰지 않는다.
state는 DB에 저장된 값과 승인된 결정적 함수만 사용하며 시간·난수·connection·직전 statement 결과에 의존하는
표현은 거부한다.

data 변경은 대상·비대상·0건·중복, 현재 값, PK·UK·FK·cascade와 재실행 영향을 검토한다. state SQL이 변경한
DB-local persistent 불변조건을 관측할 수 없거나 외부 effect가 필요한 작업은 current에 넣지 않는다.

## 엔진 경계

공개 명령은 다음 다섯 개뿐이며 제품 버전과 `--` 구분자를 받지 않는다.

```bash
pnpm db:migration status
pnpm db:migration dev-run
pnpm db:migration prod-prepare
pnpm db:migration prod-run
pnpm db:migration finalize
```

plan은 exact API source의 baseline/current bytes, DB identity, DB engine·SQL mode, START/TARGET fingerprint를
봉인한다. prod plan만 같은 engine·SQL mode에서 완료된 dev plan/execution hash를 추가로 봉인한다. 실행 입력 파일은 환경별 backup JSON
하나다. lexer 의미를 바꾸는 `ANSI_QUOTES`, `NO_BACKSLASH_ESCAPES` mode는 허용하지 않는다.

dev/prod plan source를 A라 한다. clean API main B에서 운영 명령을 계속하려면 A가 B의 조상이고, plan에 봉인된
`db/schema/` 6개 파일과 `db-migration-workflow.ts`, `db-migration-executor.ts`, `db-schema-contract.ts`의 bytes가
같아야 한다. prod plan은 A를 유지하며 제품 릴리스 API commit B와 같을 필요가 없다. package script, lockfile,
install hook, `pnpm verify` 호출 graph는 DB source 결속 대상이 아니며 현재 main의 표준 CI·리뷰가 검증한다.

엔진이 직접 판정하는 항목은 다음으로 제한한다.

- canonical clean API source와 sealed SQL bytes
- 명시적 DNS endpoint·검증된 TLS와 DB identity·engine·SQL mode, session `autocommit=1`·
  `foreign_key_checks=1`·`unique_checks=1`, backup 입력의 identity 결속
- 대상 schema `ALL PRIVILEGES`와 target DB session 관측용 global `PROCESS`만 가진 계정
- server-wide DB advisory lease와 실행 직전 target-default session, server active session, InnoDB transaction 0건
- 전체 schema와 state SQL로 분류한 START/TARGET/PARTIAL
- SQL 문장 실행과 fsync journal

엔진 event는 `transition-started`, `transition-done`, `transition-restored`뿐이다. event data에는 DB identity,
backup, schema/state digest만 허용한다. Docs commit, traffic/writer, API deploy·health·smoke, resume/restore 승인
marker를 plan이나 journal에 넣지 않으며 이를 대체하는 protocol도 만들지 않는다.

## 운영 경계

traffic과 모든 application·batch·event writer의 중지·drain은 운영 릴리스 절차가 `prod-run` 호출 전에
완료해야 하는 human precondition이다. DB 엔진은 외부 control plane을 관측했다고 주장하지 않는다. 엔진의
active DB session/transaction 검사는 호출 순간의 DB-local 방어이며 writer가 계속 차단됐음을 증명하지 않는다.

DB 엔진은 다음 상태까지만 담당한다.

| journal | live | 행동 |
| --- | --- | --- |
| 없음 | START | backup·identity·lease 확인 후 시작 |
| 없음 | TARGET/PARTIAL | 중단하고 수동 검토 |
| STARTED | TARGET | SQL 재실행 없이 DONE 기록 |
| STARTED | START/PARTIAL | 자동 재실행 금지; 외부 복원 또는 수동 검토 |
| DONE | TARGET | DB 전이 종료 |
| DONE | START/PARTIAL | 불일치로 중단 |
| RESTORED | START | 기존 시도 종료; fresh plan 필요 |

`transition-restored`는 운영자가 수행한 외부 복원의 provenance를 증명하지 않는다. 엔진이 명시 승인된 현재
DB identity, plan과 같은 논리 database 이름·engine·SQL mode, exact START를 관측했다는 뜻만 가진다.
snapshot/PITR로 새 instance가 되면 hostname·port·server id는 달라질 수 있으며 fresh plan이 새 identity를
봉인한다. TARGET을 확인해 DONE을 기록한 뒤에는 해당 backup 복원을 금지한다.

DONE 이후 API 배포·health/smoke·traffic/writer 재개는 API 배포와 운영 릴리스 런북이 별도로 담당한다. 그
결과는 DB 완료 조건이 아니다.

## Baseline 승격과 증거

`finalize`는 exact prod DONE과 live TARGET만 확인해 target lock을 baseline으로 승격하고 current trio를
제거하는 patch를 만든다. 리뷰·병합된 현재 main을 C라 하면 A는 C의 조상이고 위 3개 실행 source bytes가
같아야 한다. 같은 명령이 C의 표준 전체 API verify와 localhost scratch의 Idle baseline replay를 직접 통과하고,
A의 exact state SQL로 운영 DB identity와 TARGET을 다시 확인한 경우에만 local runtime을 비운다.
Git commit과 Docs 증거 게시는 자동 수행하지 않는다.

Docs는 제품 릴리스 버전 아래 복사된 `plan.json`과 `execution.jsonl`만 검증한다. current engine은 게시된 과거
release bytes를 다시 읽거나 현재 형식으로 해석하지 않는다.

## 연결 문서

- [DB Migration 실행 런북](../flows/cross-project/db-migration-operation-flow.md)
- [운영 릴리스 실행 런북](../flows/cross-project/production-deploy-command-runbook.md)
- [API 운영 배포 런북](../flows/cross-project/api-production-deploy-flow.md)
- [테스트 전략](testing-strategy.md)
