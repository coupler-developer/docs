# 릴리즈 자동화 파이프라인

## 문서 역할

- 역할: `시나리오`
- 문서 종류: `flow`
- 충돌 시 우선 문서: [배포/릴리즈 프로세스](../../policy/release-process.md), [배포 태그 정책](../../policy/release-tag-policy.md), [테스트/CI 전략](../../policy/testing-strategy.md), [엔지니어링 가드레일](../../policy/engineering-guardrails.md)
- 기준 성격: `as-is`

## 목적

- `docs` 릴리스 기록을 기준으로 `coupler-api`, `coupler-admin-web`, `coupler-mobile-app`, `docs`의 릴리즈 가능 여부를 같은 순서로 판정한다.
- 릴리즈 자동화의 책임을 `policy`, `flow`, `runbook`, `script`, `release record`로 분리해 중복 규칙과 수동 누락을 줄인다.
- 자동화 범위는 `origin/main` fetch를 포함한 local preflight와 증빙 누락 탐지이며, 배포 실행은 포함하지 않는다.

## 범위

- 시작 조건: 릴리즈 목표 버전, 배포 포함 범위, 대상 레포, 검증 시나리오 초안이 정해진 상태
- 종료 조건: 포함 범위별 운영 반영, 검증, 태그, 릴리즈 기록 또는 대기 범위가 문서화된 상태
- 제외 범위: 운영 DB write, EC2 배포 실행, Mobile Store 제출, NextPush 배포, Git tag push, GitHub Release 본문 수동 정정 실행

## 상위 규범 문서

- [배포/릴리즈 프로세스](../../policy/release-process.md)
- [배포 태그 정책](../../policy/release-tag-policy.md)
- [테스트/CI 전략](../../policy/testing-strategy.md)
- [엔지니어링 가드레일](../../policy/engineering-guardrails.md)
- [문서 거버넌스 정책](../../policy/document-governance-policy.md)
- [DB Migration Gate 정책](../../policy/db-migration-gate-policy.md)

## 액터

- 릴리즈 작업자: 배포 범위, 릴리즈 기록, 검증 증빙, 태그 기준점을 확정한다.
- `docs`: 릴리즈 기록, Release Note, preflight 스크립트, 문서 검증을 관리한다.
- `coupler-api`: API 코드, 서버 런타임 설정, API 계약 생성물, 운영 API 배포 기준점을 제공한다.
- `coupler-admin-web`: Admin 정적 산출물, 운영 화면 검증, Admin 계약 사본 기준점을 제공한다.
- `coupler-mobile-app`: Store binary, NextPush bundle, 모바일 계약 사본, 제출 마커 태그 기준점을 제공한다.
- GitHub Actions: docs 검증, docs Release 생성, 서비스 레포 PR 품질 게이트를 실행한다.

## 책임 분리

| 영역 | 역할 |
| --- | --- |
| `policy` | 릴리즈 완료 조건, 태그 생성 시점, 품질 게이트 같은 규범을 정의한다. |
| `flow` | 어떤 gate를 어떤 순서로 통과해야 하는지 정의한다. |
| `runbook` | 사람이 실행할 명령어, 운영 확인, 롤백 절차를 제공한다. |
| `script` | `origin/main` fetch를 포함한 상태 점검과 누락 증빙 탐지를 자동화한다. |
| `release record` | 버전 매핑, 검증 근거, 롤백 기준, 대기 범위를 남긴다. |

## 운영 상태 전이

릴리즈 기록은 한 번만 쓰고 끝나는 문서가 아니라 운영 상태를 따라가는 기록이다.
단, 모든 릴리즈를 불필요하게 재발행하지 않도록 pre-tag 조건과 post-tag 확인을 분리한다.

1. 열린 docs Draft PR과 릴리즈 기록에서 배포 기준점을 고정한다.
2. 원격 기준점·기록 계약·품질 Gate를 통과한 뒤 포함 범위만 실행한다.
3. 외부 승인이나 장기 대기가 생기면 같은 기록을 [릴리즈 상태 규칙](../../policy/release-process.md)의 실제
   단계로 갱신하고, 완료 범위와 대기 범위를 함께 남긴다.
4. 포함 범위의 운영 검증과 서비스 태그가 끝나면 같은 PR에서 최종 기록을 검증하고 한 번만 병합한다.
5. 병합된 docs 기준점의 태그·Release·artifact는 postcheck하고, 실패 시 정책의 정정 절차를 적용한다.

## 릴리즈 계약과 자동화 책임 경계

| 책임 | 단일 SoT | 이 flow의 사용 방식 |
| --- | --- | --- |
| 릴리즈 상태·scope·metadata·증빙 계약 | [배포/릴리즈 프로세스](../../policy/release-process.md)의 `릴리즈 운영 모델` | 각 Gate에서 필요한 상태와 증빙을 확인한다. |
| 태그 이름·생성 시점·제출 마커 | [배포 태그 정책](../../policy/release-tag-policy.md) | Tag Gate 순서에 적용한다. |
| metadata field·상태 파생·terminal evidence 구현 | `scripts/release-schema.mjs`, `scripts/release-record-model.mjs` | preflight와 validator가 같은 derived model을 사용한다. |
| 릴리즈 기록 시작 형태 | `content/templates/release-record-template.md` | Release Record Gate에서 복사해 실제 값으로 채운다. |
| 실행 명령과 rollback | [운영 배포 명령어 런북](production-deploy-command-runbook.md) | 각 Gate의 실행 단계에서 사용한다. |

- 이 flow는 Gate 순서와 단계 간 전달값만 소유한다. metadata의 폐쇄형 field, 상태 파생식, placeholder와
  terminal 완료 조건은 위 정책·schema에서 읽으며 이 문서에 복제하지 않는다.
- preflight와 validator의 판정이 정책과 다르면 flow 설명을 보강하지 않고 정책·공통 schema·derived model을
  먼저 정렬한다.

## 메인 흐름

### 0) Scope Gate

1. 목표 버전과 릴리즈 상태 초안을 고정한다.
2. [배포/릴리즈 프로세스](../../policy/release-process.md)의 scope 계약에 따라 포함·제외 범위를 기록한다.
3. API 계약 변경, DB contract/drop, Mobile Store 제출, NextPush-only 배포처럼 별도 Gate가 필요한 범위를 먼저
   분류한다.

### 1) Release Record Gate

1. `content/templates/release-record-template.md`로 해당 버전 기록을 만든다.
2. 정책이 요구하는 상태·scope·기준점·검증·rollback 계약을 실제 값으로 채운다.
3. 배포 시작 기준점은 원격 Draft PR에 고정하고, 장기 대기나 최종화는 같은 기록의 허용된 상태 전이로
   반영한다.
4. metadata와 사람이 읽는 mirror가 공통 schema/derived model 검증에서 일치해야 다음 Gate로 진행한다.

### 2) Static Preflight Gate

1. [운영 배포 명령어 런북](production-deploy-command-runbook.md)의 공통 사전 확인에서 local preflight를
   실행한다.
2. preflight는 정책과 공통 schema/derived model에서 계산한 대상·기준점·증빙을 fail-closed로 검증한다.
3. `PASS` 결과와 실행 로그를 릴리즈 기록에 남긴다. 실패하면 원인을 수정하고 다시 실행한다.
4. preflight는 원격 최신성 확인을 위한 fetch/tag 조회만 수행하며 배포성 side effect를 실행하지 않는다.

### 3) Clean Main Gate

1. Static Preflight Gate가 고정한 원격 기준점과 clean 상태를 배포 입력으로 사용한다.
2. feature branch, local-only commit, dirty working tree, 원격 미동기화 상태에서는 배포를 시작하지 않는다.
3. 확인 명령은 [운영 배포 명령어 런북](production-deploy-command-runbook.md)을 사용한다.

### 4) Quality Gate

1. 포함된 코드 레포는 [테스트/CI 전략](../../policy/testing-strategy.md)의 표준 품질 게이트를 통과해야 한다.
2. `docs`는 `yarn verify`를 통과해야 한다.
3. 레포에서 미제공인 항목은 `N/A`로 표시하고 미적용 근거를 릴리즈 기록에 남긴다.
4. 검증 실패가 있으면 배포 실행으로 넘어가지 않는다.

### 5) Cross Repo Contract Gate

1. API 계약 변경이 없으면 `N/A` 근거를 릴리즈 기록에 남긴다.
2. API 계약 변경이 있으면 [API 계약 변경 모바일 릴리즈 플로우](api-contract-mobile-release-flow.md)에 따라
   단일 최종 계약과 Store 출시 activation 강제 업데이트 또는 NextPush mandatory 방식을 고정한다.
3. 계약 package가 포함되면 [API 클라이언트 계약 패키지 정책](../../policy/api-client-contract-package-policy.md)의
   발행·소비 정렬 Gate와 증빙을 완료한다.
4. 호환 경로가 있으면 작업 요청자의 명시 승인 근거를 확인한다. 근거가 없으면 Gate를 실패시키고 최종 계약에서
   해당 경로를 제거한다.
5. 계약 정렬과 강제 업데이트/mandatory 계획을 해당 scope 증빙에 반영한 뒤 Deploy Evidence Gate로 전달한다.

### 6) Deploy Evidence Gate

1. 포함된 범위만 운영 반영한다.
2. DB migration은 [DB Migration Gate 정책](../../policy/db-migration-gate-policy.md)의 적용 Gate를 통과하고,
   [배포/릴리즈 프로세스](../../policy/release-process.md)가 요구하는 API catalog, 환경별 frontier·ordered batch,
   signed attestation·rollback plan을 해당 scope result에 남긴다. targetRefs는
   `target catalog − effectiveTrustedFrontier`, batches는 targetRefs의 exact partition이어야 한다.
3. API, Admin, Mobile Store, Mobile NextPush는 같은 릴리즈 정책의 scope별 terminal evidence 계약에 따라 배포
   기준점, smoke와 rollback 증빙을 남긴다.
4. DB expand/backfill과 service cutover/contract가 함께 있는 통합 배포는 `DB expand/backfill 준비 -> 사용자
   요청 activation barrier -> API/Admin + Mobile 강제 업데이트/mandatory 적용 -> smoke -> barrier 해제 ->
   의존성 0건 확인 -> DB contract` 순서로 실행한다. 각 단계의
   진입·종료 판정은
   [DB Migration Gate 정책](../../policy/db-migration-gate-policy.md)과
   [API 계약 변경 모바일 릴리즈 플로우](api-contract-mobile-release-flow.md)를 사용한다.
5. DB attestation은 환경별 단일 `previousTransitionDigest` chain을 이어야 한다. 병렬 릴리즈가 같은 frontier를
   기준으로 작성됐거나 trust epoch가 활성화되지 않았으면 뒤 단계로 진행하지 않는다.

### 7) Tag Gate

1. Deploy Evidence Gate 결과를 [배포 태그 정책](../../policy/release-tag-policy.md)에 적용해 생성 가능한 태그를
   판정한다.
2. 허용된 태그만 [운영 배포 명령어 런북](production-deploy-command-runbook.md)의 Tag 절차로 생성·검증한다.
3. 생성·보류·이관·삭제 결과를 릴리즈 기록에 반영한다.

### 8) Release Note Gate

1. `docs` tag push 전 Release Note preview를 생성한다.
2. 릴리즈 기록 연결, 사람이 읽는 mirror와 검증 근거를 확인한다.
3. 상태 정책이 tag 생성을 허용하지 않으면 같은 PR의 기록만 갱신하고 Final Record Gate를 보류한다.
4. tag push 뒤 Release와 site artifact를 postcheck한다. 실패 또는 사실 오류가 있으면 정책의
   `docs-only corrective reissue`를 적용한다.

### 9) Final Record Gate

1. 릴리즈 기록에 실제 태그/SHA, 운영 반영 시각, 검증 결과, 롤백 기준을 반영한다.
2. 미완료·대기·대체 범위가 있으면 상태 정책에 맞는 값과 근거를 남긴다.
3. transition validator로 기준점 불변성과 역전이 금지를 확인한다. 실패하면 해당 실행을 중단하고 정책이
   요구하는 새 기준점부터 다시 시작한다.
4. 마지막 수정 이후 전체 `yarn verify`와 리뷰를 통과한 기록만 Ready로 전환해 한 번 병합한다.
5. 병합된 docs 기준점에 허용된 태그를 생성하고 Release workflow와 artifact를 postcheck한다.

## 자동화 범위

- `release-preflight`는 `origin/main` fetch, local git 상태, 릴리즈 기록 기본 구조, scope descriptor 기반 repo/evidence 요구사항을 한 명령으로 판정한다.
- docs validation workflow는 릴리즈 기록 구조, release metadata, release preflight 테스트, markdownlint, `mkdocs build --strict`를 검증한다.
- 서비스 레포 CI 결과, docs Release Note preview, 운영 배포 실행, 태그 push는 자동 실행하지 않고 릴리즈 기록의 검증 근거로 남긴다.
- 배포 secret, 승인 UI, runner 격리가 필요해지면 별도 release operations repo를 만들기 전에 이 문서와 [배포/릴리즈 프로세스](../../policy/release-process.md)의 책임 경계를 먼저 갱신한다.

## 평가 기준

- `release-preflight`가 공통 schema/derived model의 모든 적용 검사를 통과해 종료 코드 0을 반환하면 `PASS`,
  하나라도 실패하면 `FAIL`이다.
- `FAIL`은 warning으로 우회하지 않고 원인이나 증빙을 수정한 뒤 재실행한다. 자동화 밖 운영 확인은 릴리즈
  정책이 요구하는 검증 근거로 남긴다.
- 세부 차단 조건은 [배포/릴리즈 프로세스](../../policy/release-process.md)와 공통 schema/derived model이
  소유하며 이 flow에는 별도 목록을 두지 않는다.

## 예외 흐름

- preflight가 실패하면 실패 항목을 릴리즈 기록 또는 PR 체크리스트에 반영하고, 원인 수정 후 다시 실행한다.
- 원격 fetch가 실패하거나 `origin/main`을 확인할 수 없으면 preflight가 실패하므로, 네트워크/remote 설정을 복구한 뒤 다시 실행한다.
- Store 심사가 지연되면 제출 artifact와 최종 계약 snapshot만 유지하고 운영 `min_version`, API/Admin activation과
  Mobile 릴리즈 태그를 보류한다. 사용자 명시 승인 없는 호환 배포를 추가하지 않는다.
- NextPush-only 배포면 native version, Store upload, 모바일 릴리즈 태그를 자동 변경하지 않는다.
- docs Release Note 정정만 필요한 경우 [배포/릴리즈 프로세스](../../policy/release-process.md)의 docs-only corrective reissue 조건을 따른다.

## 비포함 / 금지

- 이 문서를 release/tag policy 대신 사용하지 않는다.
- 이 문서에 배포 명령어를 중복 정의하지 않는다. 명령어는 [운영 배포 명령어 런북](production-deploy-command-runbook.md)을 따른다.
- `release-preflight`는 원격 최신성 확인을 위한 git fetch와 tag 조회 외에 배포, DB write, Store 제출, NextPush 배포, tag push를 실행하지 않는다.
- 서비스 레포 태그를 docs 태그로 대체하지 않는다.
- API 계약 변경을 설치된 구버전 공존 가정만으로 호환/cutover 2단계로 분리하지 않는다.
- Store 출시 activation 강제 업데이트 또는 NextPush mandatory 설정과 최종 계약 정렬 없이 API 계약 배포를 완료 처리하지
  않는다.
- API/Admin과 Mobile 교체가 모두 끝나기 전 혼합 계약 사용자 요청을 막는 activation barrier가 없으면 배포를
  시작하지 않는다.

## 관련 문서

- [배포/릴리즈 프로세스](../../policy/release-process.md)
- [배포 태그 정책](../../policy/release-tag-policy.md)
- [운영 배포 명령어 런북](production-deploy-command-runbook.md)
- [API 계약 변경 모바일 릴리즈 플로우](api-contract-mobile-release-flow.md)
- [Admin 운영 배포 런북](admin-web-production-deploy-flow.md)
- [테스트/CI 전략](../../policy/testing-strategy.md)
- [문서 거버넌스 정책](../../policy/document-governance-policy.md)
