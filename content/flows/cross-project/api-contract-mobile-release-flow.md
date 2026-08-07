# API 계약 변경 모바일 릴리스 플로우

## 문서 역할

- 역할: `시나리오`
- 문서 종류: `flow`
- 충돌 시 우선 문서: [릴리스 프로세스](../../policy/release-process.md), [릴리스 태그 정책](../../policy/release-tag-policy.md), [엔지니어링 가드레일](../../policy/engineering-guardrails.md)
- 기준 성격: `as-is`

## 목적

Store·NextPush·Admin·API·DB가 함께 바뀌어도 실제 소비자와 runtime 조합을 빠뜨리지 않고,
`API cutover: No | Yes`에 맞는 운영 반영·activation·복구 순서를 고정한다.

## 범위

- 시작 조건: Mobile Store 출시 또는 NextPush 배포가 API 요청/응답 필드, enum, nullable, 상태 전이, endpoint 동작,
  DB 읽기/쓰기 계약 중 하나 이상을 변경한다.
- 종료 조건: release-scoped 소비자 inventory, API contract case, DB runtime plan/execution, 운영 smoke와
  복구 기준이 릴리스 기록에 남는다.
- 제외 범위: 신규 SQL 작성, Store/NextPush 플랫폼 자체 정책 해석, API 계약 변경이 없는 UI-only 릴리스

## 상위 규범 문서

- [릴리스 프로세스](../../policy/release-process.md)
- [릴리스 태그 정책](../../policy/release-tag-policy.md)
- [엔지니어링 가드레일](../../policy/engineering-guardrails.md)
- [API 클라이언트 계약 패키지 정책](../../policy/api-client-contract-package-policy.md)
- [DB Migration 유지보수 정책](../../policy/db-migration-gate-policy.md)
- [테스트/CI 전략](../../policy/testing-strategy.md)

## 핵심 원칙

- 공개 계약의 기본 경로는 `API cutover: No`다. DB 변경은 `Compatible/Cutover` 전역 라벨을 만들지 않고
  실제 runtime/schema 조합과 상태 표면으로 판정한다.
- Store 출시와 NextPush 적용은 모바일 활성화 수단이다. source 정렬, 강제 업데이트 팝업, mandatory 설정,
  버전을 구분하지 못하는 traffic 0건은 이전 소비자의 호환 또는 차단 증빙이 아니다.
- `API cutover: Yes`여도 이전 소비자가 이해할 수 있는 bootstrap/version/업데이트 경로는 계속 성공해야
  한다. 호환 불가능한 제품 요청은 이전 소비자가 파싱할 수 있는 응답으로 결정론적으로 거부한다.
- DB writer가 재개된 뒤의 코드 rollback은 API 계약만으로 결정하지 않는다. 재개 뒤 수락한 write,
  queue cursor·in-flight 작업, idempotency와 외부효과의 보존·재생·보상 가능성을 함께 확인한다.
- 심사용 native bundle이 개발 API를 보는 특수 제출은 우발적 운영 설정 오류로 재분류하지 않는다. 다만
  기존 Store→운영 API, 심사 native→개발 API, 같은 target binary+Production NextPush→운영 API를 서로
  다른 consumer/case evidence로 기록하고 개발계 case를 운영 API+최종 DB 호환 증빙으로 사용하지 않는다.
  NextPush 실패 시 native 개발 API로 진행할 수 있는 경로는 잔존 위험이지만 그 사실만으로 cutover 또는
  심사 제출의 성공·실패를 판정하지 않는다.

## 릴리스 단위

| 구성요소 | 완료 기준 |
| --- | --- |
| Contracts package | API source next stable version, stable publish, Admin·Mobile exact dependency/lockfile 일치 |
| API | 현재 Swagger/runtime 정렬, inventory의 contract case 통과 |
| Admin | exact package와 최종 operation만 소비, 운영 artifact smoke 통과 |
| Mobile Store | 제출·승인·출시 build와 API 대상, platform/build ref 및 smoke 고정 |
| Mobile NextPush | 플랫폼별 app/deployment/label/cohort, target binary와 적용 smoke 고정 |
| DB | immutable runtime contract, FENCED/RESUMED/RECOVERING 실행과 상태 표면 증빙 |

## 메인 흐름

### 0) 소비자와 기준점 고정

1. Store의 직전 지원 build와 제출·출시 build, Android/iOS OTA app/deployment/label/cohort와 target binary,
   운영 Admin artifact를 소비자 ID별로 기록한다.
2. 각 소비자에 source/binary ref, 계약 세대, API 환경, REST·WebSocket·bootstrap·version 호출 표면을
   연결한다. 심사 native와 출시 NextPush가 같은 Store build를 공유해도 API 환경이 다르면 Store와
   NextPush consumer evidence를 합치지 않는다.
3. API/Admin/Mobile/docs ref, contracts package, DB migration 포함 여부와 제외 범위의 `N/A` 근거를 기록한다.
4. 공개 계약 변경은 `API cutover: No | Yes`를 판정한다. DB 변경은 이전·현재·실제 혼합 runtime,
   시작·최종 DB, 변경 경계와 상태 표면을 migration runtime contract에 선언한다.

### 1) 최종 계약 준비

1. Swagger/OpenAPI와 generated contract를 고정하고 contracts package stable을 발행한다.
2. Admin·Mobile `package.json`과 lockfile을 같은 exact package version으로 정렬한다.
3. 운영에 실제 노출할 현재 소비자와 현재 완전 릴리스가 현재 운영 API+최종 DB에서 성공하는 case를
   검증한다. 개발 API를 보는 심사 native case는 별도 QA case로만 남긴다.
4. API `No`이면 inventory의 모든 지원 이전 소비자가 현재 API+최종 DB에서 성공하고, 이번 변경이 제거
   예정 adapter·dual-write·fallback을 만들지 않는지 검증한다.
5. API `Yes`이면 old-readable bootstrap/version 성공 case와 incompatible product request의 결정론적
   거부 case를 검증하고, activation·client rollback이 참조할 case ID를 고정한다. activation case에는
   선택한 이전 소비자의 결정론적 거부 case를 반드시 포함한다.
6. DB migration이 있으면 plan에 선언한 모든 `RESUMED` 조합과 이전 릴리스 복구 후보를 개발계 FENCED에서
   검증한다.

### 2) 운영 반영 전 Gate

아래 조건이 모두 충족되지 않으면 운영 반영을 시작하지 않는다.

- 소비자 inventory가 Store, OTA, Admin, REST, WebSocket, bootstrap/version 표면을 exact-set으로 포함한다.
- package source/published stable/consumer dependency와 각 artifact ref가 일치한다.
- API contract case와 API `No | Yes` 판정이 일치한다.
- DB plan은 runtime set·schema 조합·상태 표면·복구 전략과 같은 catalog/runtime-contract SHA의 개발계
  완료 execution을 참조한다.
- API `Yes`이면 activation 장벽, old-readable bootstrap/upgrade, client rollback case가 준비돼 있다.
- DB migration이면 writer/effect producer inventory, backup, FENCED smoke, RESUMED 순서가 준비돼 있다.

### 3) Store 출시

1. 제출 artifact와 commit, 제출 마커를 고정하고 수동 출시로 심사한다. 심사 중 기존 운영 앱을 막기 위해
   `min_version`을 미리 올리지 않는다.
2. API `No`이면 migration 실행과 API 배포 뒤에도 지원 이전 앱 case가 통과한 상태에서 승인 build를 출시한다.
3. API `Yes`이면 승인·출시 가능 상태에서 activation 장벽을 닫고 API/Admin/Store를 전환한다. 장벽 안에서도
   bootstrap/version은 old-readable해야 하며 product request 거부 응답을 확인한다.
4. DB migration이 포함되면 별도 유지보수 실행의 durable FENCED → migration → final-DB smoke → RESUMED
   순서를 activation window에 배치한다.
5. 출시·activation 시각, case ID, artifact ref, smoke와 복구 기준을 같은 릴리스 기록에 남긴다.

### 4) NextPush 배포

1. Android/iOS의 app/deployment/label/cohort와 target Store binary를 고정한다.
2. API `No`이면 이전·신규 OTA 소비자가 같은 API+최종 DB에서 성공한 상태로 rollout한다.
3. API `Yes`이면 activation 장벽 안에서 API/Admin과 양 플랫폼 label을 전환하고, old-readable
   bootstrap/upgrade와 새 계약 smoke를 확인한다.
4. Mandatory는 선택한 rollout 속성으로만 기록하고 API 요청 차단 증빙으로 사용하지 않는다.

### 5) 완료 Gate

- 소비자 inventory의 현재·이전 case와 실제 운영 artifact가 일치한다.
- API `No`이면 모든 지원 이전 소비자가 성공하고 이번 변경이 만든 후속 공개 계약 전환 작업이 0건이다.
- API `Yes`이면 activation·거부·bootstrap/upgrade·client rollback case가 실제 순서에서 통과했다.
- DB migration이면 FENCED final-DB smoke, 모든 상태 표면 residual 0, durable RESUMED와 시작 watermark,
  현재 완전 릴리스 smoke가 완료됐다.
- 이전 릴리스 rollback을 허용했다면 final DB 조합 smoke와 재개 뒤 수락 write·queue·외부효과의 무손실
  보존 증빙이 있다. 없으면 forward fix/통제된 reconciliation만 복구 경로로 남긴다.
- package exact version 정렬과 각 저장소 표준 품질 게이트가 통과했다.

운영 반영 뒤에 위 사전 Gate 위반을 발견했다면 당시 activation이나 old-readable case를 사후 제조하지 않는다.
현재 서비스 동작과 영향 범위를 확인하고 안전한 forward fix를 선택한 뒤 릴리스 기록의 cutover를
`violated`로 terminal 처분한다. 정상 Activation·rollback 구조 대신 실패 요구조건, exact 영향 소비자 ref,
관측·미관측 범위, 운영 처분과 후속 통제를 전용 `violation` 구조에 기록한다. 이 처분은 정상 완료 case가
아니며 다음 릴리스의 Gate 증빙으로 재사용하지 않는다.

## 임시 전환 경로

제거 예정 adapter·dual-write·version branch가 필요하면 `API cutover: Yes`다. 허용 범위, 제거 조건,
목표 시점, 추적 이슈, 양쪽 계약 case와 client rollback을 기록하고 Exit Gate 전에는 완료 처리하지 않는다.
Silent fallback과 여러 레이어의 임시 분기는 금지한다.

## 롤백과 복구

- Store/OTA client rollback은 `apiContractCutover.rollback.caseIds`로 검증한 소비자·API 계약까지만 허용한다.
- 이전 API/runtime rollback은 release-scoped inventory의 이전·현재 모든 소비자 interface가 이전 API와
  final DB에서 성공한 rollback case를 정확히 하나씩 가질 때만 허용한다. 이 case 전체가
  `runtimeRecovery.previousReleaseCaseIds`와 일치해야 한다.
- API binary rollback은 DB migration 실행의 active mixture와 persisted/queued/external-effect 안전성까지
  통과해야 한다.
- `RESUMED` 전에는 writer/effect producer가 계속 닫혀 있을 때만 선언된 backup/snapshot restore를 쓸 수
  있다.
- `RESUMED` 뒤 snapshot/PITR만으로는 rollback하지 않는다. 모든 수락 write/effect를 보존할 수 없으면
  forward fix 또는 통제된 lossless reconciliation을 수행한다.

## 검증 체크리스트

- [ ] Store/OTA/Admin/REST/WS/bootstrap/version 소비자 inventory가 exact-set인가?
- [ ] `API cutover: No | Yes`와 contract case가 일치하는가?
- [ ] API `No`이면 모든 지원 이전 소비자가 현재 API+최종 DB에서 성공하는가?
- [ ] API `Yes`이면 old-readable bootstrap/upgrade와 결정론적 거부, activation/client rollback이 있는가?
- [ ] 이전 API/runtime rollback이면 모든 release-scoped 소비자 interface의 이전 API 성공 case가 정확히
  하나씩 있고 선택된 rollback case와 일치하는가?
- [ ] DB plan이 이전·현재·혼합 runtime, 변경 경계, 상태 표면과 허용 phase를 선언했는가?
- [ ] FENCED/RESUMED/RECOVERING 순서와 post-resume 무손실 복구 조건이 검증됐는가?
- [ ] 마지막 변경 이후 각 저장소의 표준 품질 게이트가 통과했는가?

## 비포함 / 금지

- Store/NextPush 활성화를 API/DB 호환 검증 대신 사용하지 않는다.
- 현재 source 정렬, 앱 팝업 또는 버전 미식별 traffic 0건으로 이전 계약 요청 차단을 추론하지 않는다.
- API `No`에 제거 예정 adapter·dual-write를 숨기지 않는다.
- snapshot/PITR를 재개 뒤 수락한 write/effect의 보존 증빙으로 사용하지 않는다.
- 이 문서를 도메인 상태 전이의 규범 문서로 사용하지 않는다.

## 관련 문서

- [릴리스 프로세스](../../policy/release-process.md)
- [릴리스 태그 정책](../../policy/release-tag-policy.md)
- [운영 릴리스 실행 런북](production-deploy-command-runbook.md)
- [릴리스 게이트 플로우](release-automation-pipeline.md)
- [엔지니어링 가드레일](../../policy/engineering-guardrails.md)
