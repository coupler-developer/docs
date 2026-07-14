# 테스트용 개발 데이터 운영 흐름

## 문서 역할

- 역할: `시나리오`
- 문서 종류: `flow`
- 충돌 시 우선 문서: [테스트용 개발 데이터 정책](../../policy/development-test-data-policy.md)
- 기준 성격: `to-be`

현재 명령은 목표 인터페이스다. 구현 완료 전에는 수동 SQL로 이 흐름을 대체하지 않는다. 구현 잔여 범위는 [기술 부채 정리](../../technical-debt/technical-debt.md)의 `테스트용 개발 데이터 시스템 미구현` 항목에서 추적한다.

## 목적

- 합성 개발 데이터를 계획하고 공유 개발계에 적용한 뒤 관리자 전체 탭을 검증하고 안전하게 초기화하는 순서를 고정한다.

## 범위

- 시작 조건: 생성 도구 구현, 허용된 DB identity, 고유 namespace, 검토된 dry-run
- 종료 조건: apply 후 coverage 100% 또는 reset 후 namespace·orphan·asset 0건
- 제외 범위: 운영 DB, 운영 원문 dump, 기존 데이터 보정, schema migration, negative 시나리오의 공유 개발계 적용

## 상위 규범 문서

- 생성·환경 차단·소유권·검증·reset 규칙은 [테스트용 개발 데이터 정책](../../policy/development-test-data-policy.md)을 따른다.
- DB schema 변경이 발견되면 이 흐름을 중단하고 [DB Migration Gate 정책](../../policy/db-migration-gate-policy.md)으로 분리한다.

## 액터

| 액터 | 책임 |
| --- | --- |
| 작업자 | namespace·suite·유지 기한 확정, dry-run 검토, apply/reset 승인 |
| 개발 데이터 CLI | 환경 차단, 잠금, 트랜잭션, 검증, 결과 출력 |
| Run Registry | global cron fence, active run, history와 ETag 직렬화 제공 |
| 개발 DB | 합성 데이터 저장과 namespace 잠금 제공 |
| 개발 미디어 저장소 | checksum이 고정된 합성 asset 보관 |
| 관리자 시스템 | 실제 탭·filter별 조회 결과 제공 |
| Admin browser runner | 기존 QA role session으로 route·filter별 실제 렌더 검증 |

## 명령 인터페이스

```bash
pnpm --dir coupler-api data-feed list
pnpm --dir coupler-api data-feed contract --workspace-root .. --admin-root coupler-admin-web
pnpm --dir coupler-api data-feed plan cms-all --namespace qa-cms --at 2026-07-14T10:00:00+09:00
pnpm --dir coupler-api data-feed apply cms-all --namespace qa-cms --at 2026-07-14T10:00:00+09:00 --apply
pnpm --dir coupler-api data-feed verify cms-all --namespace qa-cms --at 2026-07-14T10:00:00+09:00
pnpm --dir coupler-api data-feed coverage --namespace qa-cms --workspace-root .. --admin-root coupler-admin-web
pnpm --dir coupler-api data-feed ui-smoke --namespace qa-cms --workspace-root .. --admin-root coupler-admin-web
pnpm --dir coupler-api data-feed reset --namespace qa-cms
pnpm --dir coupler-api data-feed reset --namespace qa-cms --confirm qa-cms
```

- 모든 명령은 세 repository가 보이는 workspace root에서 실행한다.
- CLI는 `--workspace-root`를 자신의 실행 directory 기준으로 해석하고 `--admin-root`를 그 아래 repository 경로로 제한한다.
- `contract`는 write 없이 namespace 규칙, API branch obligation, DB schema contract, Admin component route exact set을 확인한다.
- `plan`은 read-only다.
- `apply`는 `--apply`가 없으면 write하지 않는다.
- `ui-smoke`는 Admin 로그인 정보 자체를 출력하지 않고 허용된 기존 QA 관리자 session을 사용한다.
- 첫 번째 `reset`은 삭제 계획만 출력한다.
- 실제 reset은 namespace와 같은 `--confirm` 값이 필요하다.

## Apply 메인 흐름

1. `list`로 suite와 scenario version을 확인한다.
2. namespace, owner, 유지 종료일, reference time을 정한다.
3. Namespace Validator가 형식·길이·금지문자·asset 경로 containment를 DB 접속 전에 확인한다.
4. Environment Guard가 설정, environment, `DATABASE()`, 서버 식별값, host allowlist, schema version을 확인한다.
5. DB Contract Verifier가 관련 table·column·view·FK와 schema fingerprint를 확인한다.
6. branch verifier가 상태·전이·권한·filter·null·삭제·시간 obligation의 missing·stale 항목을 확인한다.
7. coverage verifier가 Admin descriptor에서 계산한 component route 전체와 API scenario catalog의 미분류·미존재·stale 항목을 확인한다.
8. `plan`으로 기준정보 상태와 create·update·keep 예상 건수를 출력한다.
9. 작업자가 DB identity, namespace, suite, registry·schema version, 예상 건수, cron fence와 외부 호출 0건 계획을 검토한다.
10. Run Registry가 global fence에 namespace를 ETag 조건부 추가한 뒤 active record를 `planning`으로 생성한다.
11. CLI가 namespace advisory lock을 획득하고 registry를 `applying`으로 전환한다.
12. 개발 환경 `/admin/cron/*` 공통 fence가 active run을 감지해 handler 전에 차단되는지 확인한다.
13. 합성 asset checksum과 대상 경로 containment를 검증하고 namespace 경로에 동기화한다.
14. 기준정보를 조회해 존재와 계약을 확인한다. 누락·불일치면 기존 값을 고치지 않고 중단한다.
15. actor pool을 생성한 뒤 member, matching, meeting, lounge, revenue, statistics 순서로 scenario를 적용한다.
16. 각 scenario 직후 DB 불변식과 연결 obligation을 검증하고 실패 시 해당 트랜잭션을 rollback한다.
17. 전체 적용 뒤 Admin API를 route·audience·filter별로 조회한다.
18. 기존 QA 관리자 session으로 `data-surface` 전체의 browser smoke와 `non-data` 전체의 인증·권한 smoke를 수행한다.
19. DB·branch·route·API·UI coverage 100%, cron fence 정상, 외부 호출 0건, scenario 실패 0건일 때 registry를 `applied`로 전환한다.
20. 잠금을 해제하고 run ID, 결과 요약, 유지 종료일을 registry와 작업 증빙에 기록한다.

## 도메인별 검증

| 도메인 | 최소 postcheck |
| --- | --- |
| 회원 | 단계 상태, 회원 등급, 생애주기, Admin 큐가 같은 결론 |
| 매칭 | 상태, 일정, 채팅, 후기, 신고, 키 잔액과 원장 일치 |
| 기존 그룹미팅 | 참여 상태, 채팅, 후기, 신고, 패널티 목록 노출 |
| 라운지 | 카테고리·접근, 댓글 tree, tombstone, 신고·패널티 노출 |
| 결제·매출 | 거래 합계, 회원 key, key log, 일·주·월 집계 일치 |
| 통계 | 원천 사건과 dashboard·상세 통계 bucket 일치 |
| 설정 | 필수 기준정보 조회와 기존 활성값 무변경 |
| 매니저 | 권한별 목록·담당 회원 조회, 권한 무변경, 로그인 가능 합성 계정 0건 |

## 반복 실행과 갱신 흐름

1. 같은 owner·suite·catalog/schema version·reference time의 반복 `apply`는 prepared scenario를 reconciliation하고, 이미 `applied`면 데이터를 재생성하지 않고 verifier만 다시 실행한다.
2. scenario version, schema fingerprint, suite 또는 reference time을 바꾸려면 기존 namespace를 먼저 `reset`하고 새 `plan`·`apply`를 실행한다.
3. registry root와 DB root가 불일치하면 apply·verify·reset을 중단하고 수동 SQL update를 금지한다.
4. reset과 새 apply 사이에는 global cron fence 상태와 root 0건을 확인한다.

## UI·상태·DB 변경 반영 흐름

의도적인 syntax error를 만들지 않는다. 같은 repository의 typed SoT는 compile failure로, repository·DB 경계를 넘는 계약은 명시적인 gate failure로 감지한다.

1. Admin component route를 추가·삭제·변경하면 `routeId` exact map과 coverage test를 실행한다.
2. missing·stale route를 정리하고 필요한 scenario와 API expectation을 갱신한다.
3. 서버 상태 상수를 바꾸면 exhaustive branch map typecheck와 canonical·negative obligation test를 실행한다.
4. migration이 feeder 관련 table·column·view·FK를 바꾸면 DB contract, ownership query, reset plan, scenario version을 함께 갱신한다.
5. API의 read-only catalog JSON과 Admin coverage JSON을 workspace gate에서 비교한다.
6. local·CI에서 안전 모듈 branch 100%와 DB·registry·lock·transaction·asset fault-injection test를 실행한다.
7. local·CI DB에 migration을 적용해 schema contract와 reset transaction을 검증한다.
8. 마지막으로 공유 개발계 plan, apply, API coverage, browser smoke를 실행한다.

어느 단계든 missing·stale 항목이 있으면 다음 단계로 진행하지 않는다. 무관한 UI 문구나 feeder가 사용하지 않는 DB column 변경은 gate 대상에 포함하지 않는다.

## Reset 메인 흐름

1. Run Registry의 namespace, owner, active ETag와 DB root를 reconciliation한다.
2. read-only reset plan으로 root, child, asset 삭제 예상 건수와 FK 순서를 출력한다.
3. namespace 밖 row 또는 소유권을 증명할 수 없는 row가 포함되면 중단한다.
4. 작업자가 삭제 계획을 검토하고 namespace와 같은 `--confirm` 값을 입력한다.
5. CLI가 namespace 잠금을 획득하고 registry를 `resetting`으로 조건부 전환한다.
6. DB 트랜잭션을 시작하고 신고·로그·원장·관계 child를 FK-safe 순서로 삭제한다.
7. 도메인 root와 마지막 actor root를 삭제한다.
8. 같은 트랜잭션에서 root 0건, child orphan 0건, 다른 namespace와 기준정보 무변경을 검증한다.
9. 검증이 하나라도 실패하면 DB 전체를 rollback하고 registry를 이전 상태로 되돌린다.
10. DB 검증이 통과하면 commit한 뒤 namespace media를 idempotent하게 삭제한다. 공용 asset과 기준정보는 유지한다.
11. asset 삭제 실패 시 registry를 `cleanup_failed`로 남기고 cron fence를 유지하며, 재실행은 DB 0건 확인 후 asset 단계부터 시작한다.
12. DB·asset 잔존 0건이면 active record를 history로 이동해 `cleaned`로 종료한다.
13. history 저장을 재조회해 확인한 뒤 global fence에서 namespace를 ETag 조건부 제거한다.
14. history write나 fence 제거가 실패하면 active record와 fence를 유지한다. 마지막 active 제거만 실패하면 cleaned active record만 남겨 같은 reset이 finalization을 재시도한다.
15. 잠금을 해제하고 실제 삭제 건수, 잔존 건수, history record를 출력한다.

## 예외 흐름

### 환경 식별 실패

- write를 시작하지 않는다.
- 어떤 확인값이 누락·불일치했는지만 비밀값 없이 출력한다.
- 우회 옵션을 사용하지 않고 설정 또는 접속 대상을 바로잡은 뒤 `plan`부터 다시 실행한다.

### Namespace 또는 경로 검증 실패

- DB·registry·asset 저장소에 접근하지 않는다.
- 입력을 자동 보정하거나 다른 namespace로 대체하지 않는다.
- 허용 정규식, 길이, 금지문자 또는 containment 중 실패한 규칙만 출력하고 새 namespace로 처음부터 실행한다.

### Run Registry 불일치

- registry가 불가용하거나 ETag 충돌, active record·DB root 불일치가 있으면 apply·verify·reset을 시작하지 않는다.
- registry와 DB를 각각 read-only로 조사해 `registry-only`, `db-only`, `version-mismatch`로 구분한다.
- 자동 추정으로 소유권을 바꾸지 않고 ownership resolver를 수정한 뒤 reconciliation과 plan을 다시 수행한다.
- DB·asset cleanup 뒤 registry finalization만 실패한 경우 합성 데이터를 복원하지 않고 history 저장과 fence 제거만 재시도한다.

### DB contract 실패

- 누락·변경된 table, column, view, FK와 영향받는 builder·ownership·verifier를 출력한다.
- UI 데이터만 맞추려고 raw SQL을 임시 수정하지 않는다.
- schema 변경이면 DB Migration Gate로 분리하고 scenario version, DB contract, reset plan, verifier를 같은 변경에서 갱신한다.

### 기준정보 누락·불일치

- feeder가 기존 기준정보를 생성·수정하지 않는다.
- schema 변경이면 migration, 잘못된 기존 값이면 data repair로 별도 처리한다.
- 별도 작업 완료 뒤 전체 preflight부터 다시 수행한다.

### Scenario 실패

- 실패 scenario 트랜잭션을 rollback한다.
- suite를 실패로 종료하고 registry를 `failed`로 남긴 뒤 이미 성공한 scenario 목록을 함께 출력한다. cron fence는 reset 완료 전까지 유지한다.
- 원인 수정 뒤 같은 namespace로 재실행해 반복 실행 동일성과 전체 coverage를 다시 확인한다.

### Coverage 실패

- 데이터가 존재해도 성공으로 판정하지 않는다.
- missing·stale branch, 미분류 route, 누락 scenario, 빈 filter, 이유 없는 `live-only`·`non-data`를 수정한다.
- 마지막 수정 후 `verify`와 `coverage`를 모두 다시 실행한다.

### UI smoke 실패

- API row가 있어도 성공으로 판정하지 않는다.
- route·audience·filter, 기대 selector, redirect, console error, 상세 ID 연결 중 실패 지점을 기록한다.
- UI가 수정·삭제된 경우 typed route descriptor와 coverage를 함께 갱신하고, 데이터 누락이면 scenario·API verifier를 갱신한다.
- browser smoke 전체를 다시 실행해 현재 descriptor의 모든 데이터 화면 render coverage 100%를 확인한다.

### Reset 소유권 실패

- 삭제를 시작하지 않는다.
- 소유권을 증명할 수 없는 row를 별도 목록으로 출력한다.
- 수동 `DELETE`로 우회하지 않고 catalog·ownership resolver를 수정한 뒤 reset plan부터 다시 수행한다.

### 외부 호출 감지

- 적용 결과를 실패로 판정하고 namespace를 reset한다.
- 외부 adapter 차단과 테스트를 보강하기 전 공유 개발계 재실행을 금지한다.

### Cron fence 실패

- active run이 있는데 cron handler가 실행되거나 fence 상태를 확인할 수 없으면 apply와 cron 호출을 모두 중단한다.
- router 공통 middleware 순서와 registry adapter를 수정하고 cron route 등록 test를 통과하기 전 공유 개발계 데이터를 유지하지 않는다.
- 만료됐지만 정리되지 않은 run은 자동 해제하지 않고 reset 또는 reconciliation이 끝날 때까지 fence를 유지한다.

### Asset cleanup 실패

- DB 삭제가 commit된 경우 이를 되돌리기 위해 합성 row를 다시 만들지 않는다.
- registry를 `cleanup_failed`로 유지하고 같은 namespace reset을 재실행해 asset 단계만 idempotent하게 재시도한다.
- namespace asset 0건과 history record 저장이 끝나기 전에는 `cleaned`로 전환하지 않는다.

## Negative 시나리오 흐름

1. 개인 로컬 또는 일회성 CI DB인지 확인한다.
2. canonical suite와 다른 namespace를 사용한다.
3. 하나의 계약 위반만 만들고 기대하는 fail-closed 결과를 명시한다.
4. 검증 직후 자동 rollback 또는 reset한다.
5. 공유 개발계와 `cms-all`에는 적용하지 않는다.

## 비포함 / 금지

- 수동 SQL을 임시 feeder로 사용하지 않는다.
- 운영 DB, 실제 개인정보, 실제 결제·알림 adapter를 사용하지 않는다.
- 실패한 coverage나 부분 적용을 성공으로 기록하지 않는다.
- 일반 reset으로 기준정보나 다른 namespace를 삭제하지 않는다.

## 결과 기록 예시

```text
environment=development
namespace=qa-cms
run_id=qa-cms-20260714t100000k0900
suite=cms-all
catalog_version=1
schema_fingerprint=sha256:7d2f2e0c1b40
reference_time=2026-07-14T10:00:00+09:00
scenarios=all-pass
branch_coverage=100%
route_classification=54/54
data_surface_coverage=52/52
ui_render_coverage=52/52
non_data_audit=2/2
cron_fence=PASS
external_calls=0
reset_orphans=0
result=PASS
```

실제 기록에는 비밀번호, token, 접속정보, 영수증을 포함하지 않는다.

## 관련 문서

- [테스트용 개발 데이터 정책](../../policy/development-test-data-policy.md)
- [테스트용 개발 데이터 시스템](../../architecture/development-test-data-system.md)
- [데이터 거버넌스 정책](../../policy/data-governance-policy.md)
- [Cron 작업](../../architecture/cron-jobs.md)
- [테스트/CI 전략](../../policy/testing-strategy.md)
- [DB Migration Gate 정책](../../policy/db-migration-gate-policy.md)
