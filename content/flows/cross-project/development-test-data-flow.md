# 테스트용 개발 데이터 운영 흐름

## 문서 역할

- 역할: `시나리오`
- 문서 종류: `flow`
- 충돌 시 우선 문서: [테스트용 개발 데이터 정책](../../policy/development-test-data-policy.md)
- 기준 성격: `as-is`

현재 CLI·정적 coverage·브라우저 smoke의 실제 실행 경계를 설명한다. 공유 개발계 배포와 live apply/reset 증빙 잔여 범위는 [기술 부채 정리](../../technical-debt/technical-debt.md)의 `테스트용 개발 데이터 운영 검증·고도화 미완료` 항목에서 추적한다.

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
| 개발 미디어 저장소 | checksum이 고정된 기준 asset과 actor별 namespace 프로필·영상 보관 |
| 관리자 시스템 | 실제 탭·filter별 조회 결과 제공 |
| Admin browser runner | 기존 QA role session으로 route·filter별 실제 렌더 검증 |

## 명령 인터페이스

```bash
pnpm --dir coupler-api data-feed list
pnpm --dir coupler-api data-feed init-registry
pnpm --dir coupler-api data-feed active
pnpm --dir coupler-api data-feed contract
pnpm --dir coupler-api data-feed coverage --route-contract /absolute/path/to/coupler-admin-web/src/config/dev-data-route-contract.json
# 아래 두 값은 실행 시점의 RDS CURRENT_DATE() (Asia/Seoul)와 유지 기한으로 치환한다.
REFERENCE_TIME='YYYY-MM-DDT10:00:00+09:00'
EXPIRES_AT='YYYY-MM-DDT10:00:00+09:00'
pnpm --dir coupler-api data-feed plan cms-all --namespace qa-cms --at "$REFERENCE_TIME"
pnpm --dir coupler-api data-feed apply cms-all --namespace qa-cms --owner qa-owner --at "$REFERENCE_TIME" --expires-at "$EXPIRES_AT" --apply
pnpm --dir coupler-api data-feed verify --namespace qa-cms
DEV_DATA_ADMIN_BASE_URL=https://admin.dev.example.invalid DEV_DATA_ADMIN_STORAGE_STATE=/absolute/path/to/storage-state.json DEV_DATA_MEMBER_ID=123 yarn --cwd /absolute/path/to/coupler-admin-web test:dev-data-ui
pnpm --dir coupler-api data-feed reset --namespace qa-cms
pnpm --dir coupler-api data-feed reset --namespace qa-cms --confirm qa-cms
```

- 모든 명령은 세 repository가 보이는 workspace root에서 실행한다.
- API CLI와 Admin browser runner는 서로의 repository를 자동 탐색하지 않는다. `coverage`에는 생성된 Admin route contract의 절대 경로를 넘기고, browser smoke는 Admin repository에서 실행한다.
- `contract`는 write 없이 접속 DB의 feeder schema fingerprint를 확인한다. namespace 형식은 `plan`부터 검증하고 Admin component route exact set은 `check:dev-data-routes`와 `coverage`가 확인한다.
- `init-registry`는 DB에 연결하지 않고 private Run Registry의 최초 directory와 빈 fence만 만든다. active record가 있는데 fence가 없으면 재생성하지 않는다.
- `active`는 DB에 연결하지 않고 active namespace별 owner·suite·scope·상태·유지 종료일·만료 여부·검증 count를 출력한다. feeder와 개발 cron이 공유하는 contract parser로 fence·active record 전체를 검증하며, registry metadata, active directory entry, global fence와 active record의 양방향 정합성 또는 active record 상호 간 scope가 유효하지 않으면 fail-closed한다.
- `plan`은 read-only다.
- `apply`는 `--apply`가 없으면 write하지 않는다.
- Admin browser smoke는 로그인 정보 자체를 출력하지 않고 허용된 기존 QA 관리자 storage state를 사용한다.
- 첫 번째 `reset`은 삭제 계획만 출력한다.
- 실제 reset은 namespace와 같은 `--confirm` 값이 필요하다.

## Apply 메인 흐름

1. `list`로 지원 suite ID를 확인한다.
2. `active`로 기존 namespace의 owner·suite·scope·상태·유지 종료일을 확인한다.
3. namespace, owner, 유지 종료일, reference time을 정한다.
4. 안전 모듈 test와 Admin `check:dev-data-routes`를 실행하고, `coverage`로 component route와 API scenario catalog의 exact set을 확인한다.
5. `plan`이 namespace, environment, DB identity, schema fingerprint, registry 상태, overlapping active scope, 기존 namespace root와 적용 scenario를 write 없이 확인한다.
6. 작업자가 DB identity, namespace, suite, registry·schema version, scope 충돌, scenario 목록, cron fence와 외부 호출 0건 계획을 검토한다.
7. `apply`가 registry를 초기화한 뒤 namespace advisory lock을 획득하고, shared registry mutex 안에서 fence·active record 전체 snapshot, 기존 active 상호 간 scope, 새 요청의 overlapping scope와 active cron lease 0건을 확인한 뒤 global fence와 active record를 ETag 조건부로 생성한다.
8. 개발 환경 `/admin/cron/*` 공통 target fence는 `planning`·`applying`·`resetting`과 fenced `cleaned` finalization 대기를 maintenance `SKIP`으로 처리한다. 안정 상태에서는 정상 개발 target을 처리하고 active namespace의 합성 target만 제외하며, registry·소유권을 확인할 수 없으면 handler 전에 fail-closed한다.
9. 기준 매니저를 조회하고 actor pool을 만든 뒤 member, matching, meeting, lounge, revenue, statistics, settings, manager 순서로 scenario를 적용한다.
10. 각 scenario는 독립 transaction으로 실행한다. commit 직전 `prepared`, commit 뒤 `committed`를 기록하며 재시도 시 DB marker로 commit 여부를 reconciliation한다.
11. 전체 scenario 뒤 기준 합성 asset checksum과 대상 경로 containment를 검증한다. actor별 프로필 3장을 렌더링하고 선택 영상을 고유 경로로 복사해 `profiles/`·`videos/` namespace 경로에 동기화한다.
12. DB 불변식과 suite obligation 검증이 통과하면 registry를 `applied`로 전환하고 잠금을 해제한다.
13. 작업자는 별도 `verify`, `coverage`, Admin browser smoke를 실행한다. 세 검증이 모두 통과해야 공유 개발계 데이터 피딩 증빙을 완료한 것으로 판정한다.
14. run ID, mutation count, 검증 결과와 유지 종료일을 registry와 작업 증빙에 기록한다.

## 도메인별 검증

| 도메인 | 최소 postcheck |
| --- | --- |
| 회원 | 단계 상태, 회원 등급, 생애주기, Admin 큐, 회원별 프로필 3장·고유 대표 이미지·선택 영상 경로가 같은 결론 |
| 매칭 | 상태, 일정, 채팅, 후기, 신고, 키 잔액과 원장 일치 |
| 기존 그룹미팅 | 주최자 포함 멤버십, 승인 성별 인원수, 원본·Admin join 채팅 건수, 후기, 신고, 패널티 목록 노출 |
| 라운지 | 카테고리·접근, 댓글 tree, tombstone, 신고·패널티 노출 |
| 결제·매출 | 거래 합계, 회원 key, key log, 일·주·월 집계 일치 |
| 통계 | 원천 사건과 dashboard·상세 통계 bucket 일치 |
| 설정 | 필수 기준정보 조회와 기존 활성값 무변경 |
| 매니저 | 권한별 목록·담당 회원 조회, 권한 무변경, 로그인 가능 합성 계정 0건 |

## 반복 실행과 갱신 흐름

1. 같은 owner·suite·catalog/schema version·reference time의 반복 `apply`는 prepared scenario를 reconciliation하고, 이미 `applied`면 데이터를 재생성하지 않고 verifier만 다시 실행한다.
2. 새 namespace의 `cms-all`은 다른 active run이 없어야 하고, 도메인 suite는 동일 suite의 active run이 없어야 한다. 서로 다른 도메인 suite만 분할 모드로 함께 유지한다.
3. 동일 도메인에 추가 화면 상태가 필요하면 병렬 namespace를 만들지 않고 정상 시나리오·verifier를 보강한다.
4. scenario version, schema fingerprint, suite 또는 reference time을 바꾸려면 기존 namespace를 먼저 `reset`하고 새 `plan`·`apply`를 실행한다.
5. registry root와 DB root가 불일치하면 apply·verify·reset을 중단하고 수동 SQL update를 금지한다.
6. reset과 새 apply 사이에는 global cron fence 상태와 root 0건을 확인한다.

## UI·상태·DB 변경 반영 흐름

의도적인 syntax error를 만들지 않는다. 같은 repository의 typed SoT는 compile failure로, repository·DB 경계를 넘는 계약은 명시적인 gate failure로 감지한다.

1. Admin component route를 추가·삭제·변경하면 `routeId` exact map과 coverage test를 실행한다.
2. missing·stale route를 정리하고 필요한 scenario와 API expectation을 갱신한다.
3. 서버 상태 상수를 바꾸면 exhaustive branch map typecheck와 정상·의도적 위반 obligation test를 실행한다.
4. migration이 feeder 관련 table·column·view·FK를 바꾸면 DB contract, ownership query, reset plan, scenario version을 함께 갱신한다.
5. API의 read-only catalog JSON과 Admin coverage JSON을 workspace gate에서 비교한다.
6. local·CI에서 안전 모듈 branch 100%와 DB·registry·lock·transaction·asset fault-injection test를 실행한다.
7. local·CI DB에 migration을 적용해 schema contract와 reset transaction을 검증한다.
8. 마지막으로 공유 개발계 plan, apply, API coverage, browser smoke를 실행한다.

어느 단계든 missing·stale 항목이 있으면 다음 단계로 진행하지 않는다. 무관한 UI 문구나 feeder가 사용하지 않는 DB column 변경은 gate 대상에 포함하지 않는다.

## Reset 메인 흐름

1. Run Registry의 namespace, owner, active ETag와 DB root를 reconciliation한다.
2. read-only reset plan으로 적용 scenario와 명시적으로 추적한 root row reference를 출력한다.
3. namespace 밖 row 또는 소유권을 증명할 수 없는 row가 포함되면 중단한다.
4. 작업자가 삭제 계획을 검토하고 namespace와 같은 `--confirm` 값을 입력한다.
5. CLI가 namespace 잠금을 획득하고 registry를 `resetting`으로 조건부 전환한다.
6. DB 트랜잭션을 시작하고 신고·로그·원장·관계 child를 FK-safe 순서로 삭제한다.
7. 도메인 root와 마지막 actor root를 삭제한다.
8. 같은 트랜잭션에서 root 0건, child orphan 0건, 다른 namespace와 기준정보 무변경을 검증한다.
9. 검증이 하나라도 실패하면 DB 전체를 rollback하고 registry를 `failed`로 남겨 active 소유권 index를 유지한다.
10. DB 검증이 통과하면 commit한 뒤 namespace media를 idempotent하게 삭제한다. 공용 asset과 기준정보는 유지한다.
11. asset 삭제 실패 시 registry를 `cleanup_failed`로 남기고 active 소유권 index를 유지하며, 재실행은 DB 0건 확인 후 asset 단계부터 시작한다.
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
- registry와 DB를 각각 read-only로 조사해 `fence-only`, `unfenced-active`, `registry-only`, `db-only`, `version-mismatch`로 구분한다.
- 자동 추정으로 소유권을 바꾸지 않고 ownership resolver를 수정한 뒤 reconciliation과 plan을 다시 수행한다.
- DB·asset cleanup 뒤 registry finalization만 실패한 경우 합성 데이터를 복원하지 않고 history 저장과 fence 제거만 재시도한다.

### Active scope 충돌

- `cms-all`과 다른 active run, 또는 동일 도메인 suite의 서로 다른 namespace가 함께 claim되려 하면 DB write 전에 중단한다.
- `active`로 기존 namespace의 owner·상태·유지 종료일을 확인하고 기존 owner와 협의해 해당 namespace를 명시적으로 reset한 뒤 새 plan부터 실행한다.
- 만료됐다는 이유로 active record나 namespace row를 자동 삭제하지 않는다.
- 서로 다른 도메인 suite를 함께 유지해야 하면 분할 모드를 사용하고, 통합 `cms-all`과 섞지 않는다.

### Run Registry lock 잔존

- `_locks/registry.lock`은 feeder 또는 cron API가 짧은 원자 구간 뒤 제거하는 디렉터리 잠금이며 자동 만료시키지 않는다. 정상 경합은 bounded retry하고, 상한을 넘은 고착만 `Run Registry lock is already held`로 실패한다.
- 오류가 계속되면 같은 registry root를 사용하는 모든 feeder 실행기와 cron API 작업이 종료됐는지 먼저 확인한다. 실행 중인 작업이 하나라도 있거나 확인할 수 없으면 잠금을 제거하지 않는다.
- 실행 중인 작업이 없음을 확인한 뒤 잠금 디렉터리가 비어 있을 때만 `rmdir "$DEV_DATA_REGISTRY_DIR/_locks/registry.lock"`로 해당 디렉터리만 제거한다. `fence.json`, `active`, `history`는 수정하지 않는다.
- `rmdir`가 실패하거나 잠금 디렉터리에 파일이 있으면 강제 삭제하지 않고 registry 저장소 담당자가 원인을 조사한다.
- 제거 뒤 곧바로 `plan`을 다시 실행해 registry 상태, DB root, schema fingerprint가 일치하는지 read-only로 확인한다. 불일치하면 apply로 진행하지 않고 reconciliation한다.

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
- suite를 실패로 종료하고 registry를 `failed`로 남긴 뒤 이미 성공한 scenario 목록을 함께 출력한다. active 소유권 index를 reset 완료 전까지 유지하고 cron은 부분 생성된 합성 target을 제외한다.
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

- `planning`, `applying`, `resetting` 또는 fenced `cleaned` finalization 대기인데 cron handler가 실행되거나 `applied`, `failed`, `cleanup_failed`에서 합성 target이 변경되면 apply와 cron 호출을 모두 중단한다.
- active run의 합성 소유권을 확인할 수 없거나 같은 조건의 정상 개발 target까지 장기간 정지되면 target policy와 registry adapter를 수정한다.
- active cron lease가 있는데 feeder claim이 성공하거나 같은 job lease가 중복 생성돼도 동일하게 중단한다.
- router 공통 middleware 순서, 13개 handler target 경계와 registry adapter를 수정하고 회귀 테스트를 통과하기 전 공유 개발계 데이터를 유지하지 않는다.
- 만료됐지만 정리되지 않은 run은 자동 해제하지 않는다. reset 또는 reconciliation 전까지 소유권 index를 유지하고 cron은 합성 target만 제외한다.

### Asset cleanup 실패

- DB 삭제가 commit된 경우 이를 되돌리기 위해 합성 row를 다시 만들지 않는다.
- registry를 `cleanup_failed`로 유지하고 같은 namespace reset을 재실행해 asset 단계만 idempotent하게 재시도한다.
- namespace asset 0건과 history record 저장이 끝나기 전에는 `cleaned`로 전환하지 않는다.

## Negative 시나리오 흐름

1. 개인 로컬 또는 일회성 CI DB인지 확인한다.
2. 정상 시나리오 suite와 다른 namespace를 사용한다.
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
catalog_version=2
schema_fingerprint=sha256:7d2f2e0c1b40
reference_time=2026-07-14T10:00:00+09:00
scenarios=all-pass
branch_coverage=100%
profile_media=PASS
meeting_admin_chat_join=PASS
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
