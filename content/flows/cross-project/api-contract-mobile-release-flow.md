# API 계약 변경 모바일 릴리즈 플로우

## 문서 역할

- 역할: `시나리오`
- 문서 종류: `flow`
- 충돌 시 우선 문서: [배포/릴리즈 프로세스](../../policy/release-process.md), [배포 태그 정책](../../policy/release-tag-policy.md), [엔지니어링 가드레일](../../policy/engineering-guardrails.md)
- 기준 성격: `transition`

## 목적

- 운영 모바일 앱이 남아 있는 상태에서 API 명세가 바뀌는 모바일 릴리즈를 기존 앱과 다음 앱 모두 깨지 않게 배포하는 흐름을 고정한다.

## 범위

- 시작 조건: 현재 운영 모바일 버전 또는 NextPush target binary가 남아 있고, 다음 Store binary 또는 NextPush bundle이 API 요청/응답 필드, enum, nullable, 상태 전이, endpoint 동작, DB 읽기/쓰기 계약 중 하나 이상을 변경하는 상태
- 종료 조건: 다음 배포 검증이 끝나고, 호환 유지 또는 cutover 여부가 릴리즈 기록에 남은 상태
- 제외 범위: 신규 SQL 작성, 스토어 심사/NextPush 플랫폼 정책 해석, API 계약 변경이 없는 모바일 UI-only 배포

## 상위 규범 문서

- [배포/릴리즈 프로세스](../../policy/release-process.md)
- [배포 태그 정책](../../policy/release-tag-policy.md)
- [엔지니어링 가드레일](../../policy/engineering-guardrails.md)
- [API 에러 계약 정책](../../policy/api-error-contract-policy.md)
- [DB Migration Gate 정책](../../policy/db-migration-gate-policy.md)
- [테스트/CI 전략](../../policy/testing-strategy.md)

## 액터

- 기존 운영 앱 사용자: 현재 Store binary 또는 NextPush target binary를 계속 사용하는 사용자
- 다음 버전 앱 사용자: 내부테스트, 스토어 리뷰, Store 업데이트 또는 NextPush 적용 사용자
- 릴리즈 작업자: PR 분리, 배포 범위, 검증, 롤백 기준을 확정한다.
- `coupler-api`: 기존 앱과 다음 앱의 요청/응답 계약을 처리한다.
- `coupler-admin-web`: 변경된 운영 데이터를 조회/처리한다.
- 운영 `RDS`: expand/backfill/contract/drop을 Gate 기준으로 반영한다.

## 핵심 원칙

- 모바일 API 계약 변경 릴리즈는 `호환 배포`와 `cutover 배포`를 분리한다.
- Store 제출/심사 또는 NextPush 배포 전후의 운영 API/Admin/RDS는 기존 운영 앱과 다음 앱을 모두 지원해야 한다.
- 기존 운영 앱을 깨는 PR은 다음 버전 배포 전 운영 배포 대상이 아니다.
- 도메인 테스트 계정 통과, 앱 심사 승인, NextPush 업로드만으로 cutover하지 않는다. cutover는 다음 모바일 버전의 운영 배포/적용과 기존 버전 트래픽 제거 조건을 함께 충족해야 한다.
- 호환 장치의 코드 작성 기준은 [엔지니어링 가드레일](../../policy/engineering-guardrails.md)의 `API 계약 변경과 Cutover 분리`를 따른다.

## 용어

| 구분 | 의미 |
| --- | --- |
| `Store 배포` | `Mobile Store` binary 배포. version/build number와 제출 커밋을 기준으로 기록한다. |
| `NextPush 배포` | `Mobile NextPush` bundle 배포. app/deployment label, target binary version, 배포 커밋을 기준으로 기록한다. |
| `N` | 현재 운영 모바일 버전 또는 NextPush target binary. 예: `2.1.0` |
| `N+1` | 다음 Store binary 또는 NextPush bundle. 예: `2.2.0` |
| `호환 배포` | `N`과 `N+1`이 같은 운영 API/Admin/RDS에서 모두 동작하는 배포 |
| `cutover 배포` | `N` 호환 경로를 제거하고 `N+1` 계약만 운영 기준으로 남기는 배포 |

## 메인 흐름

### 0) 릴리즈 범위 고정

1. `N`과 `N+1`의 배포 방식과 기준점을 고정한다. Store 배포는 version/build number와 제출 커밋, NextPush 배포는 app/deployment label, target binary version, 배포 커밋을 기록한다.
2. 변경을 API 계약, Admin 영향, DB, Mobile UX로 나눠 기록한다.
3. 변경을 `호환 배포` PR과 `cutover 배포` PR로 분리한다.
4. DB 변경은 expand/backfill과 contract/drop을 분리하고, contract/drop은 cutover 이후 범위로 둔다.

### 1) 호환 PR 준비

호환 PR은 운영에 먼저 나가도 `N` 사용자를 깨지 않아야 한다.

- DB는 컬럼/테이블/view 추가, 안전한 backfill 같은 additive 변경만 포함한다.
- API는 `N` 요청과 `N+1` 요청을 모두 처리한다.
- Admin은 기존 데이터와 `N+1` 데이터가 함께 있어도 조회/액션이 가능해야 한다.
- Mobile `N+1` 빌드 또는 bundle은 운영 API를 바라보는 상태로 검증한다.
- 호환 경로가 필요하면 제거 조건이 있는 전환 장치로 명시하고, 조용한 fallback이나 출처 추측으로 구현하지 않는다.

### 2) 호환 배포

1. 필요한 경우 운영 `RDS`에 expand/backfill만 반영한다.
2. 운영 `coupler-api`를 호환 PR 기준으로 배포한다.
3. 운영 `coupler-admin-web`를 호환 PR 기준으로 배포한다.
4. 운영에서 `N` 기본 시나리오와 `N+1` 변경 도메인 시나리오를 모두 검증한다.
5. 이 단계에서는 cutover PR을 merge하거나 운영 배포하지 않는다.

### 3) N+1 배포/내부테스트

1. `N+1` Store binary를 내부테스트/앱 심사에 제출하거나 `N+1` NextPush bundle을 `Production`에 배포한다.
2. 리뷰어/내부테스터/배포 검증자가 운영 API로 변경 도메인의 핵심 흐름을 수행한다.
3. 문제가 발견되면 호환 PR 계열에서 API/Admin/Mobile 수정본을 다시 준비한다.
4. 기존 `N` 사용자 크래시나 핵심 API 실패가 발생하면 `N+1` 배포보다 운영 호환 복구를 우선한다.

### 4) N+1 배포 완료

1. Store 배포는 `N+1` 승인, 실제 출시 여부, rollout 범위를 기록한다.
2. NextPush 배포는 app/deployment label, uploaded time, target binary version, rollout/mandatory/disabled 상태를 기록한다.
3. 배포 후 운영 API/Admin 로그, 크래시, 도메인 큐/상태, CS 인입을 확인한다.
4. 모바일 태그와 NextPush-only 태그 생성 여부는 [배포 태그 정책](../../policy/release-tag-policy.md)을 따른다.

### 5) Cutover Gate

Cutover Gate는 다음 릴리즈 때만 확인하는 항목이 아니다.
API 계약 변경 또는 호환 경로 추가/수정/사용이 있는 모든 PR에서 현재 Gate 충족 여부를 확인한다.
Gate가 충족됐으면 해당 기능 PR에 섞지 않고 별도 cutover PR을 만들어 호환 경로를 제거한다.

cutover PR은 아래 조건을 모두 만족할 때만 merge와 운영 배포가 가능하다.

| Gate | 조건 | 근거 |
| --- | --- | --- |
| Deployment | `N+1` Store 승인/운영 출시 또는 NextPush `Production` 배포/적용 확인 완료 | 스토어 콘솔, NextPush 이력, 릴리즈 기록 |
| Legacy traffic | `N` 앱의 변경 도메인 legacy 요청이 강제 업데이트로 차단 완료 | 강제 업데이트 설정, min_version/force_update 검증 |
| Contract artifact sync | API canonical generated contract, publish된 contracts package version, Mobile/Admin 소비 경로 일치 확인 완료 | API `pnpm check:contracts`, `pnpm pack:contracts`, package publish workflow, generated copy exact match 또는 Mobile/Admin lockfile diff |
| Admin | 변경 도메인 데이터 처리와 운영자 액션 검증 완료 | Admin 수동 검증, 운영 로그 |
| DB | contract/drop 대상의 의존성 0건과 DBM Gate 통과 | DB Migration Gate 로그 |
| Rollback | cutover 실패 시 호환 배포로 되돌릴 기준점 확보 | 서비스 태그, 배포 SHA, DB 백업/복구 기준 |

도메인 테스트 계정 승인, 내부테스트 통과, 앱 심사 승인, NextPush 업로드 중 하나만으로는 cutover Gate를 통과한 것으로 보지 않는다.

### 6) Cutover 배포

1. cutover PR을 merge하기 전에 Gate 근거를 PR 또는 릴리즈 기록에 남긴다.
2. 운영 API/Admin을 cutover 기준으로 배포한다.
3. contract/drop DB 변경이 있으면 [DB Migration Gate 정책](../../policy/db-migration-gate-policy.md)에 따라 별도 실행한다.
4. 배포 후 `N+1` 변경 도메인 핵심 흐름과 앱 기본 진입을 재검증한다.
5. 서비스 태그와 docs 릴리즈 기록을 최종 갱신한다.

## 예외 흐름

- `N+1` 앱만 실패하고 `N`은 정상인 경우: 호환 배포는 유지하고 `N+1` 모바일 또는 API 호환 수정본을 다시 제출한다.
- `N` 기존 앱이 실패하는 경우: cutover 여부와 무관하게 운영 장애로 보고 호환 배포 기준으로 즉시 복구한다.
- Store 심사가 지연되거나 NextPush rollout이 보류되는 경우: 호환 배포를 유지하고 cutover PR은 merge하지 않는다.
- `N` 트래픽이 계속 남는 경우: 강제 업데이트, 최소 지원 버전 정책, 또는 호환 유지 기간 연장을 먼저 결정한다.
- contract/drop 이후 문제가 생긴 경우: DB 백업/복구 기준과 직전 호환 서비스 태그를 기준으로 복구한다.

## 검증 체크리스트

- `N` 앱: 로그인, `getUserInfo`, 변경 도메인 진입, 기존 핵심 API가 정상 동작한다.
- `N+1` 앱: 변경된 요청/응답 계약을 사용하는 핵심 흐름이 정상 동작한다.
- Admin: 변경 데이터 조회와 운영자 액션이 정상 동작한다.
- API: 배포 범위의 핵심 app/admin API 1개 이상과 에러 로그를 확인한다.
- Contract artifact: `coupler-api`에서 `pnpm check:contracts`와 `pnpm pack:contracts`를 실행하고, release workflow가 publish한 `@coupler-developer/coupler-api-contracts` version을 기록한다. Admin/Mobile이 generated copy를 소비하는 동안에는 `pnpm check:generated-client-contract-copies -- --consumer-root <mobile-root> --consumer-root <admin-root>` 결과를 함께 기록한다. Admin/Mobile이 package dependency로 전환된 뒤에는 GitHub Packages registry/auth 설정, `package.json`, lockfile이 해당 version을 가리키는지 확인하고 각 레포 표준 품질 게이트 결과를 기록한다. Cutover 증빙에는 비교한 API/Mobile/Admin ref와 package version을 함께 기록한다. 같은 이름 원격 브랜치가 있으면 그 ref를 사용하고, 일부 repo가 이미 main에 병합되어 브랜치가 삭제된 경우에는 해당 repo의 `main`을 비교 기준으로 기록한다. 단순 `main` fallback 통과만으로 cutover 증빙을 대체하지 않는다.
- DB: expand/backfill과 contract/drop의 Gate, ledger, postcheck를 분리해 기록한다.
- 릴리즈 기록: 호환 배포 SHA, Store/NextPush 배포 대상, 배포 상태, cutover Gate 결과를 기록한다.

## 도메인별 검증 예시

- 가입심사: 제출, 반려 사유 표시, 재제출, 승인 후 다음 단계 진입, Admin 가입/승급 심사 큐 처리
- 결제: 영수증 검증, 중복 결제 방지, 키 지급/회수, 환불 처리
- 푸시: 발송 조건, target payload, 알림 클릭 라우팅, 중복 방지
- 프로필/미디어: 업로드, 저장, Admin 표시, 기존 이미지/동영상 조회

## 비포함 / 금지

- Store 제출/심사 또는 NextPush 배포 전후에 기존 운영 앱을 깨는 cutover PR을 운영 배포하지 않는다.
- cutover PR을 도메인 테스트 계정 통과만으로 merge하지 않는다.
- DB contract/drop을 호환 배포에 포함하지 않는다.
- silent fallback, legacy 필드 coalesce, 출처 추측으로 계약 변경을 숨기지 않는다.
- 이 문서를 도메인 상태 전이의 규범 문서로 사용하지 않는다. 도메인 규칙은 각 policy/FSM 문서를 따른다.

## 관련 문서

- [배포/릴리즈 프로세스](../../policy/release-process.md)
- [배포 태그 정책](../../policy/release-tag-policy.md)
- [운영 배포 명령어 런북](production-deploy-command-runbook.md)
- [Admin 운영 배포 런북](admin-web-production-deploy-flow.md)
- [엔지니어링 가드레일](../../policy/engineering-guardrails.md)
- [회원 심사 단일 정책](../../policy/member-review-policy.md)
