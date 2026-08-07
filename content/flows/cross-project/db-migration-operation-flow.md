# DB Migration 실행 런북

## 문서 역할

- 역할: `시나리오`
- 문서 종류: `flow`
- 충돌 시 우선 문서: [DB Migration 유지보수 정책](../../policy/db-migration-gate-policy.md), [릴리스 프로세스](../../policy/release-process.md)
- 기준 성격: `as-is`

## 목적

- canonical executor로 DB migration의 개발계 검증부터 운영계 실행까지 안전하게 전환한다.

## 범위

- 시작 조건: migration version과 `coupler-api` 40자 commit SHA가 확정되고 환경별 DB 접근·유지보수 권한이 준비된 상태
- 종료 조건: 선택한 한 단계의 canonical plan 또는 execution이 생성·검증되고 다음 진입점이 확정된 상태
- 제외 범위: 신규 migration 작성, 저수준 SQL 직접 실행, API 프로세스 배포

## 메인 흐름

DB 안전·완료·실패 복구는 상위 정책과 executor가 판정한다. 저수준 SQL을 실행하지 말고 아래 표에서 위부터
처음 맞는 한 행만 수행한다.

| 처음 맞는 상태 | 다음 작업 |
| --- | --- |
| prod execution이 `service-completed` | DB 명령 없이 evidence를 최종화한다. |
| prod execution이 있으나 미완료 | 원래 실행 commit에서 `DB_ACTION=status-prod` 후 정책의 실패 복구를 따른다. |
| immutable checkpoint의 version·catalog·runtime contract가 불일치 | 기존 version을 재사용하지 않고 더 높은 version에서 `DB_ACTION=dev-run`한다. |
| prod plan이 있고 동일 PR head preflight가 `PASS`했으며 입력이 불변 | `DB_ACTION=prod-run` |
| prod plan이 있으나 위 `PASS` 조건이 아님 | prod plan/null root를 기록·push하고 preflight를 실행한다. |
| prod plan이 없고 같은 version의 canonical completed dev pair가 archive에 있음 | exact bytes 복원·검증을 위해 `DB_ACTION=prod-prepare` |
| prod plan이 없고 canonical completed dev pair가 archive에 없음 | `DB_ACTION=dev-run`으로 안전 재진입·archive한다. 거부되면 정책의 실패 복구를 따른다. |

워크스페이스 루트의 새 shell에서 표가 선택한 `DB_ACTION` 하나만 실행한다. clean/commit/HEAD/`origin/main`
검사가 실패하면 DB 명령 없이 입력을 정정하고 표를 다시 판정한다. `status-prod`는 원래 실행 commit을 사용하므로
현재 `origin/main`과 비교하지 않는다.

```bash
set -euo pipefail
: "${MIGRATION_VERSION:?set MIGRATION_VERSION}"
: "${DB_ACTION:?set DB_ACTION}"
: "${MIGRATION_COMMIT:?set MIGRATION_COMMIT}"
[[ "${MIGRATION_COMMIT}" =~ ^[0-9a-f]{40}$ ]]

WORKTREE_STATUS="$(git -C coupler-api status --porcelain)"
test -z "${WORKTREE_STATUS}"
test "$(git -C coupler-api rev-parse --verify "${MIGRATION_COMMIT}^{commit}")" = "${MIGRATION_COMMIT}"
test "$(git -C coupler-api rev-parse HEAD)" = "${MIGRATION_COMMIT}"

cd coupler-api
case "${DB_ACTION}" in
  dev-run | prod-prepare | prod-run)
    git fetch --no-tags origin main:refs/remotes/origin/main
    test "$(git rev-parse origin/main)" = "${MIGRATION_COMMIT}"
    pnpm db:migration:workflow -- "${DB_ACTION}" "${MIGRATION_VERSION}"
    ;;
  status-prod)
    pnpm db:migration:workflow -- status "${MIGRATION_VERSION}" prod
    ;;
  *)
    printf 'invalid DB_ACTION: %s\n' "${DB_ACTION}" >&2
    exit 1
    ;;
esac
```

## 예외 흐름

- 실행 중단·실패 뒤 같은 SQL이나 저수준 단계를 재실행하지 않는다.
- prod execution이 시작됐으면 원래 실행 commit에서 `status-prod`로 실제 상태만 확인하고 정책의 실패 복구를
  따른다.
- 운영 DB가 재개된 뒤에는 snapshot/PITR만으로 되돌리지 않는다. 정책과 릴리스 기록이 허용한 무손실 복구가
  없으면 forward fix 또는 통제된 reconciliation을 사용한다.

## 비포함 / 금지

- 이 런북을 DB 안전 조건이나 완료 판정의 SoT로 사용하지 않는다.
- `dev-run`, `prod-prepare`, `prod-run`을 한 shell에서 연속 실행하지 않는다.
- canonical executor 밖에서 SQL을 직접 재실행하거나 evidence를 사후 제조하지 않는다.

## 관련 문서

- [DB Migration 유지보수 정책](../../policy/db-migration-gate-policy.md)
- [운영 릴리스 실행 런북](production-deploy-command-runbook.md)
- [릴리스 게이트 플로우](release-automation-pipeline.md)
- [API 계약 변경 모바일 릴리스 플로우](api-contract-mobile-release-flow.md)
