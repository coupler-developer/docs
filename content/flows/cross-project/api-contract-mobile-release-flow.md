# API 계약 변경 모바일 릴리즈 플로우

## 문서 역할

- 역할: `시나리오`
- 문서 종류: `flow`
- 충돌 시 우선 문서: [배포/릴리즈 프로세스](../../policy/release-process.md), [배포 태그 정책](../../policy/release-tag-policy.md), [엔지니어링 가드레일](../../policy/engineering-guardrails.md)
- 기준 성격: `as-is`

## 목적

API 계약 package, API, Admin, Mobile을 하나의 최종 계약 snapshot으로 배포하고, Store 출시 activation 강제
업데이트 또는 NextPush mandatory로 이전 Mobile 계약을 교체하는 순서를 고정한다.

## 범위

- 시작 조건: Mobile Store 또는 NextPush 배포가 API 요청/응답 필드, enum, nullable, 상태 전이, endpoint 동작,
  DB 읽기/쓰기 계약 중 하나 이상을 변경한다.
- 종료 조건: 최종 계약 정렬, 배포 수단별 교체 설정, 운영 smoke와 rollback 기준이 릴리즈 기록에 남는다.
- 제외 범위: 신규 SQL 작성, Store/NextPush 플랫폼 자체 정책 해석, API 계약 변경이 없는 UI-only 배포

## 상위 규범 문서

- [배포/릴리즈 프로세스](../../policy/release-process.md)
- [배포 태그 정책](../../policy/release-tag-policy.md)
- [엔지니어링 가드레일](../../policy/engineering-guardrails.md)
- [API 클라이언트 계약 패키지 정책](../../policy/api-client-contract-package-policy.md)
- [DB Migration Gate 정책](../../policy/db-migration-gate-policy.md)
- [테스트/CI 전략](../../policy/testing-strategy.md)

## 핵심 원칙

- 기본 경로는 서로 다른 Mobile 계약의 공존이 아니라 하나의 최종 계약 배포다.
- Store 배포는 심사 승인과 출시 가능 상태를 확인한 뒤 단일 activation window에서 플랫폼별 새 build를
  `version_code`와 `min_version`으로 고정해 이전 build에 `force_update=2`를 반환한다.
- NextPush 배포는 Android·iOS `Production` mandatory로 이전 bundle을 교체한다.
- activation window 동안 구·신 계약의 사용자 요청이 API를 통과하지 않도록 배포 장벽을 적용한다. 장벽 없이
  API/Admin, 강제 업데이트 또는 양 플랫폼 mandatory가 순차 노출되는 배포는 `BLOCKED`다.
- 설치된 구버전의 존재, 일반적인 모바일 관행, Store 심사 지연 가능성은 호환 코드의 근거나 승인으로 사용하지
  않는다.
- 누락 필드 자동 생성, legacy 필드 coalesce, 구형 endpoint, GET 부수효과, version branch를 배포 안전장치로
  두지 않는다.
- DB rollback을 위한 nullable expand는 유지할 수 있지만 public API 누락 필드 수용 근거가 아니다.
- 24시간 legacy traffic 관찰은 기본 Gate가 아니다. 작업 요청자가 별도로 요구한 경우에만 추가한다.

## 배포 단위

| 구성요소 | 완료 기준 |
| --- | --- |
| Contracts package | API source next stable version, stable publish, Admin·Mobile exact dependency/lockfile 일치 |
| API | 최종 Swagger와 runtime만 노출, compatibility helper와 legacy route 0건 |
| Admin | exact package와 최종 operation만 소비, 운영 artifact smoke 통과 |
| Mobile Store | 승인·출시 가능한 build 고정, activation 뒤 이전 build `force_update=2`, 새 build `force_update=0` 검증 |
| Mobile NextPush | Android·iOS `Production` mandatory 이력과 적용 smoke |
| DB | 적용 stage별 DB Migration Gate 통과; rollback용 nullable expand는 필요 시 유지 |

## 메인 흐름

### 0) 범위와 기준점 고정

1. Store와 NextPush 중 적용 수단, 플랫폼, 제출 build 또는 target binary, API/Admin/Mobile/docs ref를 기록한다.
2. 변경을 contracts package, API, Admin, Mobile, DB로 나누고 포함하지 않은 범위는 `N/A` 근거를 남긴다.
3. 작업 요청자가 별도 호환을 명시 승인하지 않았다면 기술 이행 유형을 `최종 상태`로 고정한다.

### 1) 최종 계약 준비

1. 필요한 DB expand/backfill을 DB Migration Gate에 따라 먼저 준비한다.
2. Swagger/OpenAPI와 generated contract에서 필수 필드, endpoint, success DTO를 최종 형태로 고정한다.
3. API compatibility helper, legacy route, GET read side effect와 Mobile/Admin legacy 호출을 같은 변경에서 제거한다.
4. contracts package source version을 올리고 `pnpm check:contracts`, `pnpm pack:contracts`를 통과한다.
5. stable 발행 뒤 Admin·Mobile `package.json`과 lockfile을 같은 exact version으로 정렬한다.
6. 네 저장소의 표준 품질 게이트를 통과한다.

### 2) 배포 전 Gate

아래 조건이 모두 충족되지 않으면 운영 반영을 시작하지 않는다.

- API package source, published latest stable, Admin·Mobile dependency/lockfile version 일치
- API/Admin/Mobile에서 제거 대상 legacy symbol과 runtime 호출 0건
- Store 제출 artifact 또는 NextPush bundle과 배포 commit 연결
- 강제 업데이트 또는 mandatory 설정을 적용·검증할 작업자와 rollback 기준점 확보
- activation window의 사용자 요청 차단 수단과 시작·종료 증빙 확보
- DB 적용 범위의 preflight·ledger·postcheck 준비

### 3) Store 계약 전환

1. 제출 artifact와 commit을 고정하고 제출 마커 기준을 준비한다. 이때 운영 `min_version`은 바꾸지 않는다.
2. 심사 승인과 새 build의 출시 가능 상태를 확인한다.
3. 사용자 요청을 차단하는 activation window에 진입하고 DB expand/backfill, API, Admin, Store 출시와 플랫폼별
   `version_code`·`min_version`을 고정한 최종 snapshot으로 연속 반영한다.
4. 이전 build의 설정 응답이 `force_update=2`, 새 build가 `force_update=0`인지 실제 요청으로 확인한다.
5. 새 build의 변경 도메인과 기본 진입을 smoke한 뒤에만 activation window를 종료한다.
6. 제출 마커·승인/출시 시각·장벽 시작/종료·설정 변경·배포 SHA·smoke 결과를 같은 릴리즈 기록에 남긴다.

### 4) NextPush 계약 전환

1. Android·iOS bundle과 API/Admin/DB 기준점을 고정하고 activation window의 사용자 요청 차단 수단을 확인한다.
2. activation window에 진입한 뒤 DB expand/backfill, API/Admin과 Android·iOS `Production` mandatory를 연속
   반영한다.
3. 두 플랫폼의 deployment history에서 label, uploaded time, target binary, mandatory 상태를 확인한다.
4. 실제 기기에서 mandatory 적용 후 변경 도메인과 기본 진입을 smoke한 뒤에만 activation window를 종료한다.
5. 일부 플랫폼이나 일부 구성요소만 활성 상태인 동안 사용자 요청을 허용하거나 완료 처리하지 않는다.

### 5) 완료 Gate

- 최종 API operation과 필수 요청 계약 smoke 통과
- 제거한 legacy endpoint 404와 현재 Mobile/Admin 호출 0건 확인
- Store는 이전 build `force_update=2`, NextPush는 양 플랫폼 mandatory 적용 확인
- activation window 동안 혼합 계약 사용자 요청 0건과 장벽 시작·종료 확인
- package exact version 정렬과 표준 품질 게이트 통과
- API/Admin/Mobile/강제 업데이트 또는 mandatory의 같은 rollback snapshot 기록

별도 장시간 관찰 없이 위 증빙이 충족되면 최종 계약 배포를 완료 처리한다.

## 명시 승인된 호환 예외

서로 다른 계약의 공존이 실제로 필요하면 작업 요청자가 명시적으로 승인해야 한다. 승인 기록에는 공존 대상과
이유, 허용 endpoint/adapter, 시작·종료 조건, 목표 시점, 추적 이슈, 두 버전 검증과 rollback 기준을 포함한다.

- 승인 전에는 호환 helper나 legacy endpoint를 구현·유지하지 않는다.
- 설치된 구버전이나 심사 지연 가능성을 승인으로 추정하지 않는다.
- 승인 범위를 넘는 silent fallback, 출처 추측, 여러 레이어의 임시 분기는 금지한다.
- 승인 종료 시 별도 cutover에서 예외 경로를 제거한다. Exit Gate는 강제 업데이트/mandatory, 현재 소비 경로
  0건, 단일 계약 정렬이며 24시간 traffic 관찰은 별도 요청이 있을 때만 적용한다.

## 롤백

- 기능 실패는 API만 또는 Mobile만 임시 복구하지 않고 API, Admin, Mobile과 강제 업데이트/mandatory 기준을
  직전 검증 snapshot으로 함께 되돌린다.
- DB nullable expand는 과거 행과 rollback 안전을 위해 유지할 수 있다. contract/drop은 의존성 0건과 별도
  DB Migration Gate를 통과한 뒤 실행한다.
- rollback을 이유로 작업 요청자의 새 승인 없이 누락 필드 fallback이나 구형 endpoint를 추가하지 않는다.

## 검증 체크리스트

- [ ] 기술 이행 유형이 기본 `최종 상태`이거나 호환 예외의 사용자 명시 승인 근거가 있는가?
- [ ] API package source, published stable, Admin·Mobile exact version이 같은가?
- [ ] compatibility helper, legacy endpoint, GET read side effect, legacy Mobile/Admin 호출이 0건인가?
- [ ] Store 출시 activation 뒤 이전 build `force_update=2` 또는 NextPush 양 플랫폼 mandatory가 확인됐는가?
- [ ] activation window에서 혼합 계약 사용자 요청이 차단되고 smoke 뒤 장벽이 해제됐는가?
- [ ] DB, API, Admin, Mobile의 적용 순서와 smoke, 전체 snapshot rollback 기준이 기록됐는가?
- [ ] 마지막 변경 이후 각 저장소의 표준 품질 게이트가 통과했는가?

## 비포함 / 금지

- Store 제출 전에 구버전 공존을 가정한 호환 API를 먼저 운영하지 않는다.
- 호환 승인 없이 optional 요청 필드, 자동 생성 키, deprecated route, 혼합 버전 부수효과를 남기지 않는다.
- Store 승인 또는 traffic 0건을 기다리느라 강제 업데이트가 끝난 최종 계약 제거를 보류하지 않는다.
- 이 문서를 도메인 상태 전이의 규범 문서로 사용하지 않는다.

## 관련 문서

- [배포/릴리즈 프로세스](../../policy/release-process.md)
- [배포 태그 정책](../../policy/release-tag-policy.md)
- [운영 배포 명령어 런북](production-deploy-command-runbook.md)
- [릴리즈 자동화 파이프라인](release-automation-pipeline.md)
- [엔지니어링 가드레일](../../policy/engineering-guardrails.md)
