# DB Migration 실행 런북

## 문서 역할

- 역할: `시나리오`
- 문서 종류: `flow`
- 충돌 시 우선 문서: [DB Migration 유지보수 정책](../../policy/db-migration-gate-policy.md), [릴리스 프로세스](../../policy/release-process.md)
- 기준 성격: `as-is`

## 목적

- DB 변경 의도에서 migration source 작성, 개발계 검증, 운영계 실행과 릴리스 증빙 완료까지 사람이 따라갈
  한 경로를 제공한다.

## 범위

- 시작 조건: 적용할 DB 변경과 검토자가 정해진 상태
- 종료 조건: 릴리스 증빙이 완료됐거나 `status`가 중단 사유와 다음 조치를 확정한 상태
- 이 문서는 물리 SQL 계약을 복제하거나 저수준 SQL 직접 실행과 API 프로세스 배포를 설명하지 않는다.

## 상위 규범 문서

- DB 안전 조건과 완료 판정: [DB Migration 유지보수 정책](../../policy/db-migration-gate-policy.md)
- 릴리스 기록과 preflight: [릴리스 프로세스](../../policy/release-process.md)

## 액터

- 작성자: API 저장소에서 migration source를 준비·검증하고 리뷰받는다.
- 실행자: `status`가 안내하는 준비 또는 명령 한 개만 수행한다.
- workflow: 환경 상태와 evidence를 검증해 다음 행동을 하나로 판정한다.

## 메인 흐름

### 1. Migration source 작성

SQL 전에 변경 경계, 허용 runtime/schema 조합, 상태 표면과 복구 전략을 설계·리뷰한다. 상세 계약은 API의
[`db/schema/README.md` `신규 migration` 절](https://github.com/coupler-developer/coupler-api/blob/main/db/schema/README.md#신규-migration)이다.
아래 source를 같은 API PR에 넣고, exact source ref·실제 compatibility config·schema fingerprint는 API
`main` 반영 뒤 `status`가 안내하는 runtime contract에 고정한다. config SHA는 workflow가 계산한다.

| 항상                                                    | 해당할 때만                               |
| ------------------------------------------------------- | ----------------------------------------- |
| `db/migrations/<번호>_<주제>.sql`의 **사전조건 → 변경** | schema 변경: 생성된 `schema.lock.json`    |
| 별도 `<migration>.check.sql`의 read-only 결과 검증      | 새 테이블·VIEW: `logical-model-map.json`  |
| catalog 등록과 `migration-postconditions.json`의 기대값 | 로컬 검증 데이터: `<migration>.setup.sql` |

변경 대상의 유일성, mutation 전 fail-closed 사전조건과 별도 check의 목표 상태를 리뷰한다.

`t_member` 한 행 UPDATE를 포함한 작성 예시는 API 가이드의
[`단순 data UPDATE 예시`](https://github.com/coupler-developer/coupler-api/blob/main/db/schema/README.md#단순-data-update-예시)를
따른다. 리뷰가 끝난 source를 API `main`에 병합하되, 이를 API 배포나 DB 적용으로 보지 않는다.
적용·기록된 SQL은 수정하지 않고 새 번호를 사용한다.

### 2. 환경 실행

API `main`의 migration commit과 사용할 릴리스 version을 고정한다. 대상 DB의 read-only 접속·TLS CA·expected
identity를 준비하고 항상 `status`부터 실행한다.

첫 `status` 전에 `DB_MIGRATION_HOST`, `DB_MIGRATION_PORT`, `DB_MIGRATION_USER`,
`DB_MIGRATION_PASSWORD`, `DB_MIGRATION_DATABASE`, `DB_MIGRATION_SSL_CA_FILE`,
`DB_MIGRATION_EXPECTED_IDENTITY_SHA256`를 설정한다. expected identity digest는 접속 대상에서 새로 계산하지
않고 DB/인프라 소유자가 private 배포 설정으로 승인한 환경별 값을 받는다. 개발계에서는 일곱 값을 모두 dev
값으로 쓰고, `prod-prepare` 전에 전부 승인된 prod 값으로 바꿔 `prod-run`까지 유지한다.

```bash
set -euo pipefail
: "${MIGRATION_VERSION:?set MIGRATION_VERSION}"

cd coupler-api
pnpm db:migration status "${MIGRATION_VERSION}"
```

`status` 결과를 아래처럼 한 번 처리하고 다시 `status`로 돌아온다. `next=prepare-...`는 복사할 fail-closed
`template`과 쓸 `path`를 함께 출력한다.

| 출력                                                              | 사람의 다음 행동                                                                            |
| ----------------------------------------------------------------- | ------------------------------------------------------------------------------------------- |
| `next=prepare-... path=... template=...`                          | 출력된 template을 path로 복사해 현재 환경 사실로 작성한다.                                  |
| `next=dev-run\|prod-run ... command=...`                          | 출력된 명령을 한 번 실행한다.                                                               |
| `next=prod-prepare ... command=...`                               | `운영 준비`의 릴리스 PR·docs root를 준비한 뒤 출력 명령을 실행한다.                          |
| `next=complete-release-evidence path=...`                         | 표시된 canonical pair로 릴리스 증빙을 완료한다.                                             |
| `next=incident-continue\|recovery-source-required\|finish-replan` | `예외 흐름`만 따른다.                                                                       |
| `next=none\|manual-review-required`                               | 실행을 멈추고 출력 사유를 따른다.                                                           |

plan 생성 전만 `mode=initial`이다. plan이 있으면 execution 시작 전도 `mode=reentry`이며, 현재 `main`으로
옮기지 않고 `status`의 `executor-ref` checkout에서 실행한다. completed dev pair 뒤 최초 `prod-prepare`도 그
dev ref의 reentry다. workflow가 모든 action 직전 clean/ref를 다시 검사하고 initial이면 `origin/main`까지
자동 갱신·대조한다. plan의 catalog·compatibility·postcondition 원본도 workflow가 자동 봉인하므로 사람이
별도 증빙 파일이나 명령을 추가하지 않는다.

개발 DB의 SQL 유무가 아니라 `status` 판정으로 다음 순서를 진행한다.

| 단계      | 완료·인계                                                                                                                                                                                                    |
| --------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 개발계    | `dev-run` 뒤 `status`가 completed dev pair를 확인한다. 운영까지 오래 걸리면 그 graph만 checkpoint PR로 보존한다.                                                                                             |
| 운영 준비 | DB 연결 변수 일곱 개를 승인된 prod 값으로 모두 바꾸고, completed dev pair를 기록할 미병합 릴리스 PR과 docs worktree를 `DB_MIGRATION_DOCS_ROOT`로 지정한다. `prod-prepare` 뒤 같은 PR에 prod plan을 반영·push한다. |
| 운영 실행 | 다시 `status`가 출력한 `prod-run` 한 번만 실행한다.                                                                                                                                                          |
| 종료      | `complete-release-evidence`의 prod pair로 같은 릴리스 기록을 최종 검증·병합하고 docs postcheck를 수행한다.                                                                                                   |

릴리스 상세는 [릴리스 게이트 플로우](release-automation-pipeline.md)를 따른다. `dev-run`과 `prod-run`에는
DB 권한과 interactive TTY가 필요하며 서버 중지·재시작은 별도다. API worktree를 쓰면 릴리스 docs worktree의
절대 경로를 `DB_MIGRATION_DOCS_ROOT`로 지정한다.

## 예외 흐름

- 실행 중단·실패 뒤 같은 SQL이나 저수준 단계를 재실행하지 않는다. `status`의 `executor-ref` commit에서
  `status`를 다시 실행하고 출력된 정상 또는 `incident` 명령만 한 번 수행한다.
- `recovery-source-required`이면 새 recovery migration을 API `main`에 반영하고, 출력된 contract 경로의
  start/final fingerprint를 갱신한 뒤 `incident replan`을 실행한다. workflow가 initial과 같은 clean
  `HEAD == origin/main` gate를 확인한다. 운영계 실패나 recovery 재실패는 자동 진행하지 않는다.
- 개발계 recovery가 완료돼도 그 graph를 운영계로 승격하지 않는다. 승인된 pre-release backup으로 개발계를
  복원하고 원인을 고친 새 migration/version을 `status`부터 다시 검증한다.
- 미출시·비종료 version에서 재개 뒤 복구를 시작할 때만 `status <version> <environment>` 요약의
  `executor-ref`에서 선언된 전략으로 아래 명령을 사용한다. 이후에는 `status` 또는 `incident continue`만
  따른다.

```bash
set -euo pipefail
: "${MIGRATION_VERSION:?set MIGRATION_VERSION}"
: "${MIGRATION_ENVIRONMENT:?set MIGRATION_ENVIRONMENT to dev or prod}"
: "${RECOVERY_STRATEGY:?set RECOVERY_STRATEGY}"

case "${MIGRATION_ENVIRONMENT}" in
  dev | prod) ;;
  *) printf 'invalid MIGRATION_ENVIRONMENT: %s\n' "${MIGRATION_ENVIRONMENT}" >&2; exit 1 ;;
esac
case "${RECOVERY_STRATEGY}" in
  previous-complete-release-final-db | lossless-reconciliation) ;;
  *) printf 'invalid RECOVERY_STRATEGY: %s\n' "${RECOVERY_STRATEGY}" >&2; exit 1 ;;
esac

pnpm db:migration incident begin-recovery "${MIGRATION_VERSION}" \
  "${MIGRATION_ENVIRONMENT}" "${RECOVERY_STRATEGY}"
```

## 비포함 / 금지

- `dev-run`, `prod-prepare`, `prod-run`을 한 shell에서 연속 실행하거나 `status`가 출력하지 않은 action을
  추정하지 않는다.
- workflow 밖에서 SQL을 직접 재실행하거나 evidence를 사후 제조하지 않는다.

## 관련 문서

- [DB Migration 유지보수 정책](../../policy/db-migration-gate-policy.md)
- [릴리스 게이트 플로우](release-automation-pipeline.md)
- [운영 릴리스 실행 런북](production-deploy-command-runbook.md)
- [API 계약 변경 모바일 릴리스 플로우](api-contract-mobile-release-flow.md)
