# DB Migration 실행 런북

## 문서 역할

- 역할: `시나리오`
- 문서 종류: `flow`
- 충돌 시 우선 문서: [DB Migration 유지보수 정책](../../policy/db-migration-gate-policy.md), [릴리스 프로세스](../../policy/release-process.md)
- 기준 성격: `as-is`

## 목적

- canonical executor로 DB migration의 개발계 검증부터 운영계 실행까지 안전하게 전환한다.

## 범위

- 시작 조건: 확인할 migration version이 정해진 상태. 변경 명령을 실행할 때는 환경별 DB 접근·유지보수 권한이
  준비돼야 한다.
- 종료 조건: 선택한 한 단계의 canonical plan 또는 execution이 생성·검증되고 다음 진입점이 확정된 상태
- 제외 범위: 신규 migration 작성, 저수준 SQL 직접 실행, API 프로세스 배포

## 메인 흐름

DB 안전·완료·실패 복구는 상위 정책과 executor가 판정한다. 사람이 plan/execution/archive 조합을 표로
판정하거나 저수준 SQL을 조립하지 않는다. 새 실행과 중단 후 재진입 모두 먼저 DB와 evidence에 read-only인
`status` 한 번만 실행한다. `status`는 canonical docs의 `origin/main` remote-tracking ref를 자동 갱신한 뒤
게시된 release record 경로, runtime과 canonical archive의 exact bytes·execution 인과·시작 입력을 검증하고
현재 상태와 `next` 하나를 출력한다.

```bash
set -euo pipefail
: "${MIGRATION_VERSION:?set MIGRATION_VERSION}"

cd coupler-api
pnpm db:migration:workflow -- status "${MIGRATION_VERSION}"
```

출력은 아래 종류 중 정확히 하나다.

- `next=none reason=release-closed ...`: 같은 version의 release record가 이미 게시됐거나 미게시 record의
  전체/DB scope가 terminal이다. DB 명령과 과거 evidence 재생성을 하지 않고 후속 migration은 더 높은
  version에서 시작한다.
- `next=prepare-... path=...`: 표시된 입력 파일만 현재 환경 사실로 작성하고 `status`를 다시 실행한다.
- `next=dev-run|prod-prepare|prod-run mode=initial command=...`: 최초 변경 명령 전 `origin/main`과 migration
  commit의 일치를 아래처럼 확인한 뒤 출력된 command를 그대로 한 번 실행한다.
- `next=dev-run|prod-prepare|prod-run mode=reentry command=...`: execution이 생성된 원래 commit에서 현재
  `origin/main`과 비교하지 않고 출력된 command만 한 번 실행한다. `prod-prepare`는 누락된 canonical plan
  root만 검증·복구하며, 완료 후 `status`가 안내하는 재진입 명령을 따른다.
- `next=complete-release-evidence path=...`: DB 명령을 더 실행하지 않고 표시된 canonical pair로 릴리스
  evidence를 최종화한다.
- `next=incident-continue action=... command=...`: 출력된 `incident continue` 명령 하나로 outcome 판정,
  ledger repair 또는 durable recovery의 정확한 다음 내부 action을 수행한다.
- `next=recovery-source-required environment=dev migration=... command=...`: recovery SQL·catalog·runtime
  contract를 준비한 뒤 출력된 `incident replan`으로 실패 root pair를 SHA history에 보존하고 같은 미출시
  version의 새 plan/execution으로 전환한다.
- `next=manual-review-required ...`: 운영계 SQL 실패 또는 recovery migration 재실패다. DB 명령을 더
  실행하지 않고 릴리스 incident를 fail-closed 상태로 유지한다.
- `next=finish-replan ... command=...`: 중단된 root 전환 marker가 있다. 다른 workflow action을 실행하지
  않고 같은 `incident replan` 명령으로 전환을 끝낸다.

```bash
# mode=initial 변경 명령에만 적용한다.
: "${MIGRATION_COMMIT:?set MIGRATION_COMMIT}"
[[ "${MIGRATION_COMMIT}" =~ ^[0-9a-f]{40}$ ]]
test -z "$(git status --porcelain)"
git fetch --no-tags origin main:refs/remotes/origin/main
test "$(git rev-parse HEAD)" = "${MIGRATION_COMMIT}"
test "$(git rev-parse origin/main)" = "${MIGRATION_COMMIT}"
# 직전 status가 출력한 command 한 줄만 실행한다.
```

`runtime-contract.json`과 시작 writer inventory는 plan/apply 전에 검증한다. 백업·재개·재기동처럼 실행
중에 확정되는 문자열 증빙은 해당 phase에서 입력한다. 안내된 환경 변수는 문자열 prompt를 미리 채울 뿐
evidence file 확인을 대체하지 않는다. `dev-run`과 `prod-run`은 DB phase 전에 interactive TTY를 필수로
검사하며 비대화형 실행을 지원하지 않는다. 별도 API worktree에서는 canonical docs checkout을
`DB_MIGRATION_DOCS_ROOT`의 절대 경로로 지정한다.

## 예외 흐름

- 실행 중단·실패 뒤 같은 SQL이나 저수준 단계를 재실행하지 않는다.
- execution이 시작됐으면 원래 실행 commit에서 `status`로 실제 상태와 단 하나의 재진입점을 확인한다.
  출력된 정상 또는 `incident` command만 실행하며, 판정·복구 상태를 정상 workflow로 되돌리지 않는다.
- 미출시·비종료 version에서 durable `RESUMED` 또는 `service-completed` 뒤 실제 복구를 시작할 때만 선언된
  전략 하나로 아래 명령을 사용한다. 이후에는 `incident continue`로만 전진한다.

```bash
pnpm db:migration:workflow -- incident begin-recovery "${MIGRATION_VERSION}" <dev|prod> \
  <previous-complete-release-final-db|lossless-reconciliation>
```

- 운영 DB가 재개된 뒤에는 snapshot/PITR만으로 되돌리지 않는다. 정책과 릴리스 기록이 허용한 무손실 복구가
  없으면 forward fix 또는 통제된 reconciliation을 사용한다.

## 비포함 / 금지

- 이 런북을 DB 안전 조건이나 완료 판정의 SoT로 사용하지 않는다.
- `dev-run`, `prod-prepare`, `prod-run`을 한 shell에서 연속 실행하지 않는다.
- `status`가 출력하지 않은 workflow action을 추정하지 않는다. 위 조건의 명시적 `begin-recovery`만
  incident 개시 action으로 별도 허용한다.
- canonical executor 밖에서 SQL을 직접 재실행하거나 evidence를 사후 제조하지 않는다.

## 관련 문서

- [DB Migration 유지보수 정책](../../policy/db-migration-gate-policy.md)
- [운영 릴리스 실행 런북](production-deploy-command-runbook.md)
- [릴리스 게이트 플로우](release-automation-pipeline.md)
- [API 계약 변경 모바일 릴리스 플로우](api-contract-mobile-release-flow.md)
