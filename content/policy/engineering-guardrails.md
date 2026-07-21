# 엔지니어링 가드레일

## 문서 역할

- 역할: `규범`
- 문서 종류: `policy`
- 충돌 시 우선 문서: 상위 공통 기술 원칙은 이 문서, 세부 계약·검증은 `단일 SoT와 우선순위` 표의 문서
- 기준 성격: `as-is`

## 목적

- 코드와 문서가 같은 기술 기준으로 안전하게 갱신되도록 SoT, 검증, 기술 책임 경계를 고정한다.

## 적용 범위

- API/Mobile/Admin의 공통 Fail-closed, 책임 분리, 구조 단순화, 상태별 안전 이행 원칙
- 코드와 문서 변경의 상위 기술 완료 기준
- API 응답·에러·계약 package, DB migration, 테스트, 리뷰 운영의 세부 계약은 아래 범위별 단일 SoT에 위임한다.
- 도메인 상태 전이와 비즈니스 규칙은 각 도메인 policy/FSM을 우선하며 이 문서에서 중복 정의하지 않는다.

## 단일 SoT와 우선순위

| 판정 책임 | 단일 SoT | 이 문서의 역할 |
| --- | --- | --- |
| 공통 Fail-closed, 책임 분리, 구조 단순화, 외부 의존성 승인, Shadow Cutover | 이 문서 | 최종 규칙 |
| JSON API 성공/실패 envelope | [API 공통 응답 계약 정책](api-response-contract-policy.md) | 상위 실패 노출 원칙만 유지 |
| 실패 `ErrorData`와 error taxonomy | [API 에러 계약 정책](api-error-contract-policy.md) | 상위 책임 경계만 유지 |
| 페이지/use-case 조회 집계와 operation 분리 | [API 조회·동작 설계 정책](api-operation-design-policy.md) | 구조 단순화·책임 분리 상위 원칙만 유지 |
| 계약 package 발행·소비·공개 표면 | [API 클라이언트 계약 패키지 정책](api-client-contract-package-policy.md) | 생성 계약 우회 금지만 유지 |
| DB migration stage와 실행 Gate | [DB Migration Gate 정책](db-migration-gate-policy.md) | DB 설계와 Fail-closed 원칙만 유지 |
| 테스트 범위와 표준 검증 명령 | [테스트/CI 전략](testing-strategy.md) | 품질 게이트 통과 의무만 유지 |
| 리뷰 절차와 증빙 | [코드 리뷰 정책](code-review-policy.md) | 기술 판정 기준만 제공 |
| 문서 역할·동기화·composition 검토 | [문서 거버넌스 정책](document-governance-policy.md) | 기술 문서 일치 의무만 유지 |
| 도메인 동작·상태 전이 | 각 도메인 policy/FSM | 공통 기술 원칙만 제공 |

- 충돌은 판정 책임을 먼저 고정한 뒤 해당 행의 단일 SoT로 해결한다. 범위별 문서가 소유하는 세부 MUST를 이 문서가 덮어쓰지 않는다.
- 범위별 단일 SoT를 신설·분리·수정할 때는 [문서 거버넌스 정책](document-governance-policy.md)의 `정책 Composition Gate`로 이 표와 중복 규칙을 함께 재검토한다.

## 핵심 원칙

- **Fail-closed**: 예상하지 못한 상태는 조용히 넘기지 않고 즉시 실패시킨다. 코드를 읽는 사람이 추측 없이 의도를 파악할 수 있어야 한다
    - 명시 규칙: **Fail-closed 원칙을 따르면, 실행은 즉시 실패(Fail-fast)로 나타나야 한다**
    - 조용한 실패 금지: `조용한 실패`는 스펙 위반/오류를 숨기는 `if (...) return;`, 빈 `catch`를 뜻하며, 실패는 사용자에게 명시적으로 알리고 로그/에러코드를 남긴다
    - 우회 금지: fallback/normalize/resolve로 문제를 덮지 않는다. 스펙이 맞지 않으면 스펙을 고친다
    - 불필요한 가드 금지: 불가능한 경로는 가드로 숨기지 말고 데이터/흐름 보증으로 해결한다
    - 정책 의도는 코드에서 바로 드러나게 변수명/함수명/구조로 명시한다
- **추측 금지**: 코드 및 링크로 근거를 제시한다
- **결정론적 실행**: 도메인 판정, 상태 전이, 계약 검증은 동일한 입력, 동일한 저장 상태, 동일한 외부 응답에서 동일한 결과를 내야 한다. 시간/랜덤/외부 I/O 의존은 숨기지 않고 호출 경계에서 주입하거나 명시해 테스트와 검증에서 재현 가능하게 한다
- **일관성**: 같은 문제는 같은 방식으로 해결한다. 코드, 파일, 문서에서 중복을 만들지 않는다
- **분류 체계(taxonomy) 일관성**: 도메인, 상태, enum, error source/code/surface, 문서 종류처럼 대상을 분류하는 축은 한 책임만 가져야 한다. 제품면(Admin/Mobile), 도메인, 동작, 원인, 문서 역할을 한 이름에 섞지 않는다
- **구조 단순화 우선**: 단기 우회보다 근본 원인 해결과 구조 단순화를 우선한다
- **외부 의존성 최소화**: 표준 라이브러리와 기존 직접 의존성으로 해결할 수 있는 기능에 새 package·SDK를 추가하지 않는다

## API/Mobile/Admin 코드 작업 공통 패턴

### 1) 목표

- 최종 상태의 API, Mobile, Admin 코드가 단일 계약(스키마/enum/상태전이)으로 동작하도록 고정한다.
- 도메인/상태/에러/문서 역할 분류 체계가 단일 기준으로 설명되고, 코드와 문서에서 같은 축을 사용한다.
- 최종 상태에는 레거시 호환/파생 fallback/이중 경로를 남기지 않고, 호환 배포 상태의 예외는 제거 조건이 보이는 경계로 통제한다.
- DB/API/Admin/Mobile 책임 경계가 코드에서 즉시 드러나게 유지한다.
- `No Findings` 상태가 확인될 때까지 점검-수정-재검증 루프를 반복한다.

### 2) 필수 요구사항

- 스펙 단일화: 요청/응답 필드명, enum, nullable 규칙은 한 가지 표현만 허용한다.
- 책임 분리: 상세 기준은 본 문서 `레이어 책임 분리 (단일 SoT)`를 단일 기준으로 따른다.
- 호환 장치 통제: 임시 호환 로직은 기본 금지한다. 운영 버전 공존 때문에 필요하면 `기술 이행 유형`의 호환 배포 기준으로 제한하고, 같은 의미의 구·신 로직을 교체할 때만 Shadow Cutover를 적용한다.
- 최종 구조 고정: 최종 구조, 최종 공통 계약, canonical SoT 구현, cutover PR에는 transition 계층(임시 호환/중간 산출물 계층)을 둘 수 없다. 호환이 필요하면 별도 호환 배포 작업으로 분리한다.
- 명세 가시성: 코드만 읽어도 의도가 파악되도록 네이밍/타입/에러 처리를 명시한다.

### 2-1) 기술 이행 유형

변경을 시작하기 전에 아래 기술 이행 유형을 하나 이상 고정하고 PR/작업 보고에 근거를 남긴다. 유형을 고르지 않은 채 최종 상태의 금지 규칙이나 전환 상태의 예외 규칙을 다른 유형에 적용하지 않는다. 이 유형은 회귀 안전성 게이트의 상태 분류와 다른 축이다.

| 기술 이행 유형 | 적용 조건 | 허용 구조 | Exit Gate |
| --- | --- | --- | --- |
| `최종 상태` | 운영 호환 경로가 필요하지 않은 일반 구현, 동시 배포 계약 묶음, 최종 구조 리뷰 | 단일 계약, transition 계층 0건 | 계약·책임·품질 게이트 통과 |
| `호환 배포` | 기존 운영 버전과 다음 버전이 같은 API/Admin/RDS를 사용 | 경계가 명시된 adapter, versioned DTO, dual-write | 두 버전 시나리오 통과, 제거 조건·목표 시점·추적 이슈·검증 근거 확보 |
| `Shadow Cutover` | 같은 입력에서 같은 의미의 결과를 내야 하는 구·신 로직 교체 | 병렬 계산과 diff 계측 | 검증 범위가 명시된 불일치 0건 |
| `운영 legacy cutover` | 배포된 구버전 경로, parser, dual-write, DB contract/drop을 실제 제거 | 제거 대상으로 고정된 호환 경로의 삭제만 허용 | 운영 배포·legacy 차단·rollback·적용 Gate 충족 |
| `DB migration stage` | DDL, backfill, read/write 기준 변경, contract/drop | DB Migration Gate의 Expand/Backfill/Cutover/Contract | 적용 `DBM-GATE-*` 통과와 비적용 Gate의 근거 있는 `N/A` |

- `호환 배포`는 서로 다른 버전 계약을 의도적으로 함께 지원하므로 그 자체를 `Shadow Cutover`로 분류하지 않는다.
- `Shadow Cutover`는 구·신 결과의 의미가 같아 diff 0건을 기대할 수 있을 때만 적용한다.
- DB 변경은 [DB Migration Gate 정책](db-migration-gate-policy.md)의 stage를 먼저 고정한다. 신규 객체 추가인 Expand에 read/write 기준 전환용 `DBM-GATE-300`을 자동 적용하지 않는다.

### 2-2) API 계약 변경과 Cutover 분리

모바일 운영 버전이 남아 있는 상태에서 API 요청/응답 필드, enum, nullable, 상태 전이, endpoint 동작, DB 읽기/쓰기 계약이 바뀌면 변경을 `호환 배포`와 `cutover 배포`로 분리한다.
배포 순서는 [API 계약 변경 모바일 릴리즈 플로우](../flows/cross-project/api-contract-mobile-release-flow.md)를 따른다.

호환 배포 코드 기준:

- 기존 모바일 버전과 다음 모바일 버전이 같은 운영 API/Admin/RDS에서 모두 동작해야 한다.
- 기존 계약을 삭제하거나 의미 변경하지 않는다. 필요한 DB 변경은 additive expand/backfill 범위로 제한한다.
- 호환 경로는 API 경계의 명시적 adapter, versioned DTO, dual-write처럼 제거 범위가 보이는 구조로 둔다. 같은 의미의 로직 교체가 함께 있으면 해당 부분에만 Shadow Cutover를 추가 적용한다.
- 호환 경로에는 제거 조건, 목표 시점, 추적 이슈, 검증 근거를 남긴다.
- 호환 경로를 추가/수정/사용하는 모든 PR은 현재 제거 조건 충족 여부를 재평가한다. 조건이 충족됐으면 호환 변경에 섞지 않고 별도 cutover PR로 제거한다.
- 조용한 fallback, legacy 필드 coalesce, 출처 추측, 여러 레이어에 흩어진 임시 `if` 분기로 계약 차이를 숨기지 않는다.

cutover 배포 코드 기준:

- cutover PR은 호환 경로 제거, contract/drop, 단일 계약 수렴만 포함한다.
- cutover PR은 다음 모바일 버전의 운영 배포/적용(Mobile Store 출시 또는 Mobile NextPush 적용)과 기존 버전 강제 업데이트 차단이 확인된 뒤 merge한다.
- cutover 후에는 남은 호환 helper, dual-write, version branch가 0건이어야 한다.
- cutover가 기존 보호 동작을 바꾸면 회귀 안전성 게이트의 `기준 변경`으로 분류하고 기준 문서와 검증 결과를 같은 변경 단위에 포함한다.

### 2-3) 최종 계약 동시 배포 묶음과 운영 legacy cutover 분리

- API/Admin/Mobile 최종 구조 리뷰는 세 레포를 하나의 동시 배포 묶음으로 보고, API package source version과 Admin/Mobile의 dependency/lockfile version, 실제 소비 runtime 공개 표면, 요청/응답 wire 계약이 모두 같은 최종 계약을 가리키는지 판정한다.
- 동시 배포 묶음 안에서 package version이 다르면 현재 사용하는 symbol이 우연히 호환되더라도 최종 계약 정렬 미완료로 판정한다.
- 최종 구조의 코드 호환성 판정에는 Store/NextPush 배포 이력, `min_version`/`force_update`, legacy traffic 로그, 운영 릴리즈 기록을 요구하지 않는다. 세 레포가 같은 최종 계약에 연결된 상태에서 함께 배포되는 것을 전제로 한다.
- 운영 legacy cutover 증빙은 이미 배포된 구버전 소비자와의 호환 경로, URL-encoded parser, dual-write, DB contract/drop처럼 기존 운영 경로를 실제로 제거하는 작업에만 적용한다.
- 브랜치 이름이나 커밋 메시지에 `cutover`가 포함된 사실만으로 운영 legacy cutover 범위를 추론하지 않는다. 리뷰 요청과 실제 diff에서 호환 경로 제거 여부를 확인해 판정 범위를 고정한다.
- 최종 리뷰에는 `동시 배포 계약 묶음`과 `운영 legacy cutover` 중 적용한 판정 범위를 명시하고, 적용하지 않은 운영 증빙은 Finding으로 요구하지 않는다.

### 3) 검증 기준 (No Findings 게이트)

- `No Findings`의 판정 범위는 "리뷰 대상"으로 한정한다(로컬 변경사항, 특정 커밋 집합, 또는 PR diff).
- 리뷰 대상의 `기술 이행 유형`과 비적용 유형의 `N/A` 근거를 먼저 고정한다. 서로 다른 유형의 Exit Gate를 합치거나 대체하지 않는다.
- 계약 검증: 요청/응답 스키마 불일치, 중복 키, alias fallback 0건
- 분류 검증: 도메인/상태/에러/문서 역할의 분류 축이 중복되거나 서로 다른 책임을 섞는 명명 0건
- 책임 검증: 서버 판단 로직의 클라이언트 중복 구현 0건
- 레거시 검증: 제거 조건 없는 호환 분기/파생 normalize 0건
- 최종 구조 검증: 최종 구조, 최종 공통 계약, canonical SoT 구현, cutover 범위 안의 transition 계층(임시 호환/중간 산출물 계층) 0건
- 안전성 검증: 조용한 실패(핵심 원칙 정의) 0건
- 추적성 검증: 변경 근거 문서/이슈/로그 링크 누락 0건

- 리뷰 대상 범위에서 finding이 1건이라도 있으면 완료로 간주하지 않는다.
    1. 원인 분석
    2. 코드/타입/계약 수정
    3. [코드 리뷰 정책](code-review-policy.md)의 같은 범위 독립 리뷰
    4. 열린 Finding이 0건인 동일 최종 후보에서 [테스트/CI 전략](testing-strategy.md)의 표준 통합 품질 게이트와
       정책 문서의 필수 검사 검증. 레포에서 미제공인 항목은 `N/A`로 표기하고, 미적용 근거를 PR/작업 보고에
       남긴다.
    5. 독립 리뷰와 검증 증빙을 결합한 최종 `No Findings` 판정

### 3-1) 회귀 안전성 게이트

회귀 안전성 게이트는 이번 변경이 보호 동작을 깨뜨렸는지 판정하는 기준이다.
`정책과 다름`만으로 회귀를 판정하지 않는다.

기준:

- 최종 기준: 정책, 계약, 상태 머신(FSM)
- 비교 기준: 변경 전 보호 동작
- 증빙 기준: 테스트, 검증 스크립트, 로그, 수동 검증 결과

상태 분류:

- `회귀`: 이번 변경으로 보호 동작이 깨진 상태
- `기준 변경`: 보호 동작을 의도적으로 바꾸며 기준 문서와 검증 결과를 함께 갱신한 상태
- `정책 위반`: 코드가 정책, 계약, 상태 머신과 다른 상태
- `기존 부채`: 변경 전부터 있던 정책 불일치이며, 이번 변경이 만들거나 넓히지 않은 상태
- `호환 예외`: 정책과 다르지만 정해진 기간 동안 유지하는 예외
- `스펙 공백`: 기준 문서만으로 기대 동작을 정할 수 없는 상태

판정 순서:

1. 기준 문서가 없거나 서로 충돌하면 `스펙 공백`으로 분류하고, 구현보다 기준 문서를 먼저 고친다.
2. 보호 동작을 의도적으로 바꾸면 `기준 변경`으로 분류한다. 기준 문서와 검증 결과가 같은 변경 단위에 있어야 한다.
3. 이번 변경이 정책, 계약, 상태 머신과 다른 동작을 새로 만들거나 넓히면 `정책 위반`으로 분류한다.
4. 변경 전부터 있던 정책 불일치를 건드리지 않으면 `기존 부채`로 분류하고, 근거 경로를 남긴다.
5. 기존 정책 불일치 경로를 이번 변경이 사용하거나 유지해야 하면 `호환 예외`로 분류한다.
6. 이번 변경이 변경 전 보호 동작을 의도 없이 깨뜨리면 `회귀`로 분류한다.
7. 영향 없음(`N/A`)은 영향 파일, 호출 경로, 기준 문서, 로그 중 하나 이상의 근거가 있을 때만 인정한다.

- 한 변경에 여러 상태가 함께 해당될 수 있다.
- `회귀`가 포함되면 차단 상태로 기록하고, 함께 해당하는 `정책 위반`, `호환 예외`, `기존 부채`를 같이 남긴다.
- `기준 변경`은 회귀로 보지 않는다. 기준 문서 또는 검증 결과가 없으면 `기준 변경`으로 인정하지 않는다.

호환 예외 필수 증빙:

- 제거 조건
- 목표 시점
- 추적 이슈
- 검증 근거

최소 증빙:

- 영향 범위: 변경된 정책, 계약, 상태 머신, API, UI, DB, 권한, 배포 범위
- 보호 동작: 보존해야 하는 기존 동작 또는 의도적으로 바꾸는 동작
- 검증 방법: 테스트, 검증 스크립트, 로그, 수동 시나리오 중 실제 실행한 항목
- 상태 분류: 회귀, 기준 변경, 정책 위반, 기존 부채, 호환 예외, 스펙 공백 중 해당 상태
- `N/A` 사유: 회귀 영향이 없다고 판단한 근거

#### 최소 증빙 예시

- 아래 예시는 PR/리뷰에 남길 수 있는 최소 증빙 형식 예시다. 회귀 안전성 게이트 증빙은 위 항목을 함께 포함한다.
- `No Findings` 예시
    - 리뷰 범위: `PR diff` 또는 `특정 커밋 집합`
    - 기준 문서: `<정책/스펙 문서 경로:line>`
    - 실행 명령: 변경 레포의 표준 검증 명령 또는 `docs`의 경우 `yarn validate:docs`
    - 결과 로그: URL 또는 저장소 기준 로그 경로
    - 문서 동기화: `필요` 또는 `불필요` + 관련 경로/라인/로그 근거
    - 판단 근거: 관련 문서/코드/로그 링크

### 4) 완료 정의 (Definition of Done)

- `기술 이행 유형`이 명시되고 해당 유형의 Exit Gate를 충족한다.
- API/Mobile/Admin 계약을 바꾸는 `최종 상태`는 해당 소비 범위가 단일 계약만으로 동작하고 transition 계층이 0건이다.
- `운영 legacy cutover`는 제거 대상으로 고정한 호환 경로가 0건이고 남은 소비 범위가 단일 계약을 가리킨다.
- `호환 배포`는 기존/다음 버전 시나리오와 제거 추적 근거가 모두 있으며, 서로 다른 계약을 조용한 fallback으로 합치지 않는다.
- `Shadow Cutover`는 같은 의미의 구·신 결과에 대해 검증 범위가 명시된 불일치 0건을 충족한다.
- `DB migration stage`는 [DB Migration Gate 정책](db-migration-gate-policy.md)의 적용 Gate와 `N/A` 근거를 충족한다.
- 분류 체계가 단일 축으로 설명된다. 같은 이름이 도메인, 제품면, 상태, 동작을 동시에 뜻하지 않는다.
- fallback/normalize로 계약 위반을 숨기지 않고 실패가 명시적으로 드러난다.
- 레거시/호환 경로는 필수 요구사항의 호환 장치 통제 원칙을 충족한다.
- 회귀 안전성 게이트 기준으로 회귀/기준 변경/정책 위반/기존 부채/호환 예외/스펙 공백을 분류하고 필요한 검증 증빙을 남긴다.
- 관련 문서(FSM/API 스펙/가드레일)와 코드가 같은 결론을 가리킨다.
- 변경 레포 기준 [테스트/CI 전략](testing-strategy.md)의 표준 품질 게이트를 검증한다.
    - 레포에서 미제공인 항목은 `N/A`로 표기하고, 미적용 근거를 PR/작업 보고에 남긴다.

## 코딩 규칙

### API 스펙/계약

- **API 조회와 동작의 외부 경계는 페이지/use-case에서 도출한다**
    - 페이지 소유 초기 데이터의 집계, 증분 조회, 동작 명령, 전송·스트림 분류는 [API 조회·동작 설계 정책](api-operation-design-policy.md)을 단일 기준으로 따른다
    - UI 요소·DB entity·Repository·담당 팀 차이만으로 endpoint를 쪼개거나, Mobile/Admin이 item별 상세·권한·설정을 연쇄 호출하게 만들지 않는다
    - 이 문서는 구조 단순화와 책임 분리의 상위 원칙만 유지하고 operation별 분리 조건과 예외를 반복 정의하지 않는다
- **API 파라미터는 하나로 명확하게 정의한다**
    - `param1 ?? param2` 같은 fallback은 API 불일치를 숨긴다
    - 예시: `profile_image_paths ?? profile` (잘못됨) → `profile_image_paths` (올바름)
- **normalize/resolve로 땜질 금지**
    - 예시: `normalizeAuthImages(...)`, `resolveXxx(...)`로 잘못된 스펙을 맞추는 코드 금지
    - 스펙이 애매하면 API/DB 스키마부터 고정하고, 클라이언트는 그 스펙만 처리한다
- **스펙 위반은 에러로 드러내기**
    - 조용한 실패 금지 원칙(핵심 원칙 정의)을 그대로 적용한다
    - 사용자에게는 토스트/에러 메시지, 개발 환경에서는 throw/log로 즉시 드러내기
- **공통 응답/에러 처리는 API 공통 응답 계약과 API 에러 계약 정책을 따른다**
    - 성공/실패 envelope과 transport 예외는 [API 공통 응답 계약 정책](api-response-contract-policy.md)을 단일 기준으로 따른다
    - 실패 `ErrorData`, `request_id`, `error_action/error_code`와 민감정보 제한은 [API 에러 계약 정책](api-error-contract-policy.md)을 단일 기준으로 따른다
    - API 서버와 Mobile/Admin은 위 경계를 우회해 실패 JSON을 직접 조립하거나 문자열·진단값·legacy 필드로 성공/실패를 다시 판정하지 않는다
    - 최종 계약 밖에 남은 legacy/cutover 부채는 [기술 부채 정리](../technical-debt/technical-debt.md)의 `API 응답 공통 계약 cutover 인덱스`에서 추적한다
    - 이 문서는 실패 노출과 책임 경계만 정하고 세부 wire 계약을 반복 정의하지 않는다
- **요청 transport와 public DTO는 API 계약 SoT를 따른다**
    - method/path/media type과 operation wire schema는 Swagger/OpenAPI, package 공개 표면·발행·소비 절차는 [API 클라이언트 계약 패키지 정책](api-client-contract-package-policy.md)을 단일 기준으로 따른다
    - Mobile/Admin은 패키지 정책이 생성 계약 적용 대상으로 판정한 공개 DTO를 사용하고 같은 wire DTO나 transport runtime을 local 계약으로 다시 정의하지 않는다
    - Swagger request body, Mobile/Admin request boundary, API parser가 같은 계약을 가리켜야 한다
    - API URL-encoded parser는 구버전 Mobile 운영 트래픽을 위한 호환 입력 경로로만 허용한다. 제거는 [API 계약 변경 모바일 릴리즈 플로우](../flows/cross-project/api-contract-mobile-release-flow.md)의 Legacy traffic Gate 충족 후 별도 cutover PR에서 수행한다
- **DB typeCast 이후 의미 재캐스팅 금지 (`coupler-api`)**
    - DB `typeCast`가 적용된 row 숫자값은 동일 의미 필드에 대해 `Number(...)`/`String(...)` 재캐스팅을 금지한다
    - 화면 표시/로그 출력 등 포맷 목적 변환은 허용하되, 원본 도메인 필드 타입을 덮어쓰지 않는다
    - `req.body` 같은 외부 입력 경계는 parse/validate를 유지하고, 타입 흔들림은 변환 우회가 아니라 `typeCast`/쿼리/DTO 수정으로 해결한다
- **요청(draft) 모델과 응답(response) 모델을 섞지 않기**
    - 서버 응답 필드를 클라이언트 로컬 draft 저장소로 재사용하지 않는다
    - 제출 payload는 요청 스펙으로만 구성하고, 응답 스펙은 오직 서버 응답으로만 갱신한다
- **API 입출력 경계에서는 DTO 계약 필드명을 그대로 사용한다**
    - 클라이언트는 요청 payload 작성/응답 파싱에서 계약 DTO 키를 변경하거나 별칭 키를 병행 처리하지 않는다
    - 생성 계약 적용 범위와 기존 미전환 부채 판정은 [API 클라이언트 계약 패키지 정책](api-client-contract-package-policy.md)을 따른다. 적용 대상으로 판정된 public request/success wire DTO는 contracts package generated type을 사용한다
    - 소비자는 적용 대상 API wire DTO를 재정의하지 않고 화면 ViewModel, 로컬 draft, 표시 모델만 별도로 정의한다
    - 화면 표시용 ViewModel/로컬 상태 가공은 허용하되, API 호출 계층으로 역유입시키지 않는다
    - DB 컬럼명과 API DTO명을 1:1로 강제하지 않는다. 서버 경계에서 매핑을 명시하고 외부 계약은 DTO로 고정한다
- **응답 DTO와 Presenter/Mapper를 구분한다**
    - producer DTO, typed Presenter/Mapper, query projection과 소비자 ViewModel의 상세 경계는
      [API 클라이언트 계약 패키지 정책](api-client-contract-package-policy.md)의
      `API producer DTO와 Presenter/Mapper 경계`, `소비자 DTO와 ViewModel 경계`를 단일 기준으로 따른다.
    - 이 문서는 generated contract를 identity wrapper, 수동 schema, local wire DTO로 우회하지 않는 상위
      책임 분리 원칙만 소유한다.
- **서버 enum과 로컬 상태를 섞지 않기**
    - 서버 상태코드는 서버 enum 그대로만 사용한다
    - 로컬 UI 전용 draft/임시 상태는 별도 로컬 enum/필드로 분리한다

### 타입/Optional

- **Optional과 nullable을 분리한다**
    - OpenAPI `required` 여부와 `nullable` 여부는 서로 다른 계약 축이며 generated DTO가 두 축을 그대로 보존해야 한다
    - 항상 key가 존재하고 값만 없을 수 있으면 Optional(`?`)이 아니라 `field: T | null`을 사용한다
    - key 생략은 OpenAPI에서 required가 아니고 생략의 의미가 정의된 필드에만 허용한다
    - 같은 의미의 "없음"을 `null`, `undefined`, missing key로 병행 표현하지 않는다. 내부 `undefined`가 JSON 직렬화에서 생략되는 경우도 operation 계약의 optional 의미와 일치해야 한다
- **외부 JSON의 runtime 경계와 operation DTO의 정적 계약을 분리한다**
    - 외부 JSON은 `unknown`으로 받아 package runtime으로 envelope과 실패 `ErrorData`를 검증하고, 성공 `data`는 `ApiEnvelope<unknown>` 경계에서 시작한다
    - operation별 generated success DTO 연결은 API 호출 경계 한 곳의 compile-time 계약이며, 그 자체를 runtime 검증 완료 근거로 해석하지 않는다
    - operation `data`의 runtime 검증이 필요한 경우 OpenAPI에서 생성된 단일 schema를 사용한다. feature 코드에서 수동 schema, broad cast, local wire DTO를 추가하지 않는다
    - package operation 계약 밖의 외부 API·서드파티 SDK·raw JSON은 parse/validate 뒤 도메인 타입으로 고정한다. "타입이 애매하니 일단 unknown" 상태를 도메인 내부로 전파하지 않는다
- **단일 스펙 강제**
    - 중복 키(`images` vs `image`, `image_url` vs `url`) 동시 허용 금지
    - 배열이면 복수형, 단일 값이면 단수형, 스펙은 한 가지로 고정

### TypeScript 운영 (코드 레포)

- 코드 레포의 `typecheck` SoT는 `tsc`다.
- 코드 레포의 `lint` SoT는 `ESLint`다.
- `ESLint`만으로 `typecheck`를 대체할 수 없고, `tsc`만으로 `lint` 규칙을 대체할 수 없다.
- 각 코드 레포는 `package.json`에 `typecheck`, `lint` 스크립트를 제공해야 한다.
- 각 코드 레포의 `tsconfig`는 `compilerOptions.allowJs: false`를 유지한다.

### `?.` / `??` 사용 규칙

- **스펙이 확정된 경로에서는 `?.` / `??`를 기본값으로 쓰지 않는다**
    - 타입/스펙이 맞으면 "항상 존재"가 원칙. `?.` / `??`는 런타임 문제를 조용히 숨길 수 있다
    - 스펙이 깨질 수 있으면 데이터/스펙을 고정하거나, 에러/로그/사용자 메시지로 드러내기
- **허용**: 진짜 optional 필드, UI 편의(표시용)로 "없으면 빈 값"이 명확한 경우
- **금지**: 키 중복/스펙 불일치를 fallback으로 감추기, 타입 오류를 없애기 위한 무분별한 추가
- **lint 미적용 이유**: 일부 레포의 lint가 `--max-warnings 0`이라 `warn` 점진 도입이 어려움

### 네이밍

- **모호한 이름 금지, 의미가 명확한 이름 사용**
    - `profile` (모호) → `profile_image_paths` (명시적)
    - `data` (모호) → `memberData` 또는 `authData` (명시적)
- **단수/복수 구분 엄격히 준수**
    - 배열이면 반드시 복수형, 단일 값이면 반드시 단수형
- **타입과 일치하는 명명**
    - 문자열 배열: `imageUrls` (O), `imageUrl` (X)
    - '#' 구분자 문자열: `profileImagesString` (O), `profile` (X)
- **신규 코드/문서 기본 명칭은 `coupler`로 고정**
    - 변경분에 새로 도입하는 코드, 문서, 내부 식별자에는 `coupler` 명칭을 사용한다
    - 외부 계약상 변경 불가 식별자(SKU, 운영 도메인, 외부 시스템 키, 과거 패키지/레포명)는 예외로 두되, 변경하지 않는 이유가 문서/코드에서 드러나야 한다
    - 기존 `ritzy` 잔존 정리는 이 문서가 아니라 `technical-debt`에서 추적한다

### 문법/스타일

- 중첩 삼항(`a ? b : c ? d : e`)은 금지한다. 분기 2개 초과 시 `if/else`를 사용한다
- 주석 최소화: 코드로 의도가 충분히 드러나면 주석 금지, 불가피한 경우에만 1줄
- 같은 의미를 반복하는 불필요한 래퍼 함수/중간 변수/분기 추가를 지양한다
- 하드코딩/Magic Number 금지: 상수로 정의한다

### Mobile UI token (`coupler-mobile-app`)

- 텍스트 스타일 SoT는 `src/constants/TextStyles.ts` 하나로 고정한다.
- 색상 SoT는 `src/constants/Colors.ts` 하나로 고정한다.
- 화면/컴포넌트/유틸에서 `fontFamily`, `fontSize`, `fontWeight`, `letterSpacing`, `lineHeight`를 직접 정의하지 않는다.
- 화면/컴포넌트/유틸에서 HEX/RGB/RGBA 색상 literal을 직접 정의하지 않는다.
- `LinearGradient` 등 색상 배열 props도 `Colors` 토큰만 사용한다.
- 새 typography/color variant가 필요하면 화면에서 inline override로 덮지 말고 `TextStyles`/`Colors`에 명시적으로 추가한다.
- 예외는 런타임 계산이 필요한 값만 허용한다. 이 경우 해당 라인 또는 직전 라인에 `design-token-exception: <reason>` 주석을 남기고, 계산 결과를 여러 화면에서 재사용한다면 helper 또는 token variant로 승격한다.
- 정적 React Native 스타일 객체는 JSX inline style로 직접 작성하지 않고 `StyleSheet.create` 안에 정의한다.
- TypeScript 일반 `property` 이름은 `lowerCamelCase`로 분류한다. `StyleSheet.create`에 새로 추가하는 style key도 일반 `property`로 보고 `lowerCamelCase`로 작성한다.
- `react-native/no-inline-styles`는 레거시 inline style 정리 범위에 맞춰 파일/디렉터리 단위 ESLint override로 점진 적용한다. override 적용 범위에서는 inline style 0건을 유지한다.
- override 미적용 범위의 기존 inline style은 [기술 부채 정리](../technical-debt/technical-debt.md)에서 추적하고, 정리 완료 후 전역 lint 적용으로 확장한다.
- 기존 `snake_case` style key는 [기술 부채 정리](../technical-debt/technical-debt.md)에서 추적하고, 신규 또는 직접 수정하는 style key부터 `lowerCamelCase`로 점진 전환한다.
- 재유입 차단은 리뷰만으로 끝내지 않고 lint/정적 검사로 자동 검증한다.

### 버그 수정

- 증상이 아닌 근본 원인을 추적하여 제거한다

**체크리스트**:

- [ ] 근본 원인 파악했는가?
- [ ] 다른 곳에도 같은 문제 있는가?
- [ ] Edge case 테스트했는가?
- [ ] 회귀 테스트 통과했는가?

## 설계 원칙

### DB 설계

- **요구사항 추적**: 화면·운영·배치 기능을 저장값, 계산값, 기존 객체 재사용으로 나누고 각 항목의 SoT를
  테이블/컬럼/VIEW 또는 비저장 계산으로 연결한다. 연결되지 않은 기능과 근거 없는 저장값을 모두 finding으로 본다.
- **최소 구조**: 1차 확정 기능에 필요한 테이블·컬럼만 만든다. 미래 기능용 빈 컬럼/테이블, 같은 상태·금액·
  회원정보의 중복 snapshot, 화면별 전용 테이블은 추가하지 않는다.
- **정규화와 snapshot 구분**: 현재값 SoT는 정규화하고, 당시 표시값·적용 금액처럼 시간축 보존이 필요한 값만
  snapshot으로 저장한다. snapshot마다 현재값 복제가 아닌 이유를 문서에 남긴다.
- **명명과 타입 정합성**: 테이블은 책임이 드러나는 단수 snake_case, FK는 `<대상>_id`, 시각은 `_at`,
  boolean은 의미가 드러나는 이름을 사용한다. 부모 PK signed/unsigned, 길이, charset/collation과 맞추고
  예약어·기존 객체·API/enum 식별자 충돌을 확인한다.
- **스키마 설명 단일화**: 신규 테이블과 신규·정의 변경 컬럼의 의미는 DB native `COMMENT`에 기록하고
  private schema lock으로 검증한다. 이름만 반복하지 말고 필요한 값 범위·단위·NULL 의미·생성/갱신 주체를
  짧고 자연스럽게 설명하며, 별도 테이블·컬럼 사전을 중복 관리하지 않는다.
- **무결성과 동시성**: PK/FK/UNIQUE/CHECK, 상태 전이, 멱등성, lock/transaction 경계를 함께 설계한다.
  API validation만으로 DB 불변식을 대신하지 않으며 교차 row 조건은 서버 transaction과 통합 테스트로 고정한다.
- **조회 근거**: 실제 목록/상세/집계/배치 쿼리에서 필요한 인덱스만 둔다. 호출자별·파라미터별 값은 repository
  query로 계산하고, 여러 소비자가 반복 사용하는 안정적인 다중 테이블 read model일 때만 VIEW를 만든다.
  화면 하나를 줄이기 위한 VIEW나 추정 인덱스는 만들지 않는다.
- **생명주기와 호환성**: 삭제/익명화/보관, 기존 코드·데이터·알림·설정과의 충돌, Expand/Backfill/Cutover/
  Contract 순서와 rollback 가능성을 설계 단계에서 확인한다.

DB 설계 최종 리뷰에는 아래 판정을 남긴다.

- [ ] 기획 기능이 저장/계산/재사용 SoT 중 하나에 빠짐없이 연결됐다.
- [ ] 테이블·컬럼·VIEW 각각에 현재 범위의 사용 근거가 있고 미래 기능 선반영이 없다.
- [ ] 명명, 타입, `COMMENT`, FK, UNIQUE/CHECK, 인덱스, transaction이 실제 운영 스키마와 충돌하지 않는다.
- [ ] 개인정보 생명주기와 기존 API/Admin/Mobile/배치/알림/설정 영향이 기록됐다.
- [ ] 열린 finding이 없으며 미구현 범위는 기술 부채 또는 후속 구현 항목으로 추적된다.

### 레이어 책임 분리 (단일 SoT)

- **로직 배치 기준**:
    - UI 레이어(Screen/Component): 렌더링, 사용자 입력 수집, 이벤트 전달만 담당한다.
    - Domain 레이어(Store/Service/UseCase): 비즈니스 규칙, 상태 전이, 자격/권한 판단을 담당한다.
    - Infra 레이어(API/Storage/외부 SDK): 네트워크/영속화/외부 연동 입출력만 담당한다.
- **클라이언트-서버 책임 분리**: 비즈니스 판단(상태 전이, 자격 검증 등)은 서버를 단일 기준으로 두고, 클라이언트(React Native/React)는 UI 표시와 입력 전달 중심으로 유지한다.
- **중복 구현 금지**: 같은 비즈니스 판단 로직을 클라이언트와 서버에 동시에 두지 않는다. 서버가 판단하고 클라이언트는 서버 응답을 표시한다.
- **경계 우회 금지**: 타입 우회(`as unknown as`) 또는 fallback 분기로 레이어 경계를 흐리지 않는다.

## 레이어별 가드레일 (API/Mobile/Admin)

- 아래 규칙은 `레이어 책임 분리 (단일 SoT)`의 레포별 적용 기준이다.

### API (coupler-api)

- 비즈니스 상태 전이/자격 판정/권한 판정은 API 서버만 수행한다.
- 요청 DTO와 응답 DTO를 분리하고, 필드 alias fallback(`a ?? b`)로 계약 불일치를 숨기지 않는다.
- API producer DTO와 Presenter/Mapper 경계는
  [API 클라이언트 계약 패키지 정책](api-client-contract-package-policy.md)을 따른다.
- 컨트롤러는 오케스트레이션에 집중하고 핵심 규칙은 service/usecase 계층으로 고정한다.
- 다중 엔티티 갱신은 트랜잭션 경계를 명시하고 부분 성공 상태를 남기지 않는다.
- 클라이언트 임시 정책을 서버에 하드코딩하지 않는다(플랫폼 분기 금지, 계약 기반 처리).
- DB pool, connection timeout, runtime config 로딩 경로, `config/default*.json`, 운영 `config/production*.json`, `config/production*.json.example`, 운영 환경변수처럼 API 프로세스 시작 시점에 적용되는 설정을 바꾸면 `coupler-api` 재배포/재시작 필요 여부를 PR/작업 보고에 명시한다.
    - DB 스키마/데이터 변경이 없으면 `DB migration`은 `N/A`로 분류하되, API 런타임 변경이므로 운영 EC2 반영과 post-deploy 로그/지표 확인은 생략하지 않는다.

### Mobile (coupler-mobile-app)

- Mobile은 서버 판단을 재구현하지 않고, 서버 응답 상태를 표시/입력 전달에만 사용한다.
- 제출 payload의 생성 계약 적용 범위는 [API 클라이언트 계약 패키지 정책](api-client-contract-package-policy.md)을 따르고, 적용 대상에서는 package generated public request DTO와 요청 스펙 필드만 사용한다(consumer-local wire DTO 및 응답 필드 재사용 금지).
- 화면 컴포넌트에서 normalize/resolve/fallback로 계약 불일치를 보정하지 않는다.
- 서버 enum 미정의 값은 조용히 무시하지 않고 명시적으로 에러/신고 경로를 태운다.
- 최종 상태에는 구/신 API 이중 경로를 유지하지 않는다. 호환 배포에서는 API 경계의 명시적 version 계약만 사용하고, 같은 의미의 클라이언트 로직 교체에만 Shadow Cutover를 적용한다.
- typography는 `TextStyles`, color는 `Colors`를 단일 SoT로 사용하고 inline token drift를 남기지 않는다.

#### Mobile 파일 구조와 네이밍

- `src/screens/`에는 `shared/`와 도메인 폴더만 둔다. 도메인은 `src/screens/` 최상위 기능 묶음이며
  `shared`는 제외한다.
- 네비게이션 대상 화면은 `src/screens/<도메인>/<화면>Screen` 또는
  `src/screens/shared/<화면>Screen`에 둔다. 도메인 폴더에는 같은 화면 접두 파일과 `shared/`만 두고
  `<화면>/` 중첩 폴더를 새로 만들지 않는다.
- 화면 전용 Step은 같은 레벨의 `<화면>Step*`으로 둔다. 도메인 공용 Step만
  `src/screens/<도메인>/shared/steps/`에 두고, 도메인 간 공용 코드는 일반 공용 컴포넌트로 승격한다.
- Step을 라우터에 등록하지 않는다. 화면 내부 구획은 `*Section`, `*Block`, `*Panel`을 사용하고
  `fragment` 또는 `*Fragment*`를 새로 추가하지 않는다.
- `common`은 전역 공용, `shared`는 도메인 내부 공용을 뜻한다. `src/screens/shared/`는 전역 라우팅 화면에만
  사용하고 일반 공용 컴포넌트는 `src/components/common/`에 둔다.
- 화면 전용 상수는 `<화면>Constants.ts`, 도메인 공용 상수는 `shared/constants/`, 전역 상수는
  `src/constants/`에 둔다.
- 화면 일부를 재사용하는 블록만 `*Card`로 명명한다. 화면 레이아웃을 소유하면 `*ScreenContent` 또는
  `*Panel`로 책임을 드러낸다.
- 기존 구조의 점진 전환과 자동 검사 도입은 [기술 부채 정리](../technical-debt/technical-debt.md)의
  `Mobile 파일 구조 TO-BE 미전환`에서 추적한다.

### Admin (coupler-admin-web)

- Admin은 운영 UI이며, 서버 권한/상태 전이를 우회하는 로컬 판단을 두지 않는다.
- 상태 변경 액션은 서버 명령 API를 통해서만 수행한다(클라이언트 로컬 상태 덮어쓰기 금지).
- 테이블/상세 화면 표시 값은 서버 계약 필드를 그대로 사용하고 임의 매핑 키를 추가하지 않는다.
- 요청 payload와 성공 응답 wire shape의 생성 계약 적용 범위는 [API 클라이언트 계약 패키지 정책](api-client-contract-package-policy.md)을 따르고, 적용 대상에서는 package generated public DTO를 사용해 화면용 목록 결과/ViewModel과 API DTO를 구분한다.
- 운영 액션(승인/반려/제재 등)은 사유/근거를 남기는 입력 규칙을 강제한다.
- 레거시 컬럼/엔드포인트를 위한 임시 버튼/분기 추가 시 제거 조건과 목표 시점을 PR에 명시한다.

## 프로세스

- 모든 코드 작업은 `기준 계약 명시 -> 구현 -> 독립 리뷰 -> 검증 -> No Findings 확인` 순서를 따른다.
- 기준 계약(스펙/FSM/정책) 링크 없이 추측으로 구현하지 않는다.
- 점검 결과 finding이 있으면 본 문서의 `No Findings 게이트` 절차를 따른다.
- 필수 코드, 파일만 추가한다(무분별한 파일 생성 금지).
- 임의 커밋(의도/근거/리뷰 단위 없는 커밋)은 금지한다. 코드 반영은 `code-review-policy.md`의 PR 절차를 따른다.
- 삭제 대상으로 명시되지 않은 기존 기능 삭제 금지
- UI 변경은 Android/iOS 주요 레이아웃 차이를 함께 검증한다
- 기존 패턴과 충돌하는 새 구조/유틸/상태 모델을 추가하기 전에는 재사용 가능한 기존 기준을 먼저 확인한다
- lint/CI 통과를 merge 조건으로 둔다.
    - docs 검증과 문서 동기화 기준은 [테스트/CI 전략](testing-strategy.md)과 [문서 거버넌스 정책](document-governance-policy.md)을 따른다.

### 외부 의존성 추가 승인 게이트

- 적용 대상은 `package.json`, native manifest, requirements 파일 등 의존성 manifest에 새 외부 package·SDK를
  추가하거나 기존 의존성을 다른 package·SDK로 대체하는 모든 코드 작업이다. 표준 라이브러리 사용과 이미 선언된
  직접 의존성 사용은 `N/A`다.
- manifest·lockfile 수정 또는 install 명령 실행 전에 아래 근거를 작업 요청자에게 제시하고 **명시적 승인**을
  받아야 한다.
    1. 필요한 기능과 실제 호출 경로
    2. 표준 라이브러리와 기존 직접 의존성으로 해결할 수 없는 이유
    3. 검토한 대안과 제외 이유
    4. 정확한 package·version·runtime/dev 범위와 manifest·lockfile·빌드·보안 영향
- 기능 구현, 작업 완료, 리팩터링처럼 범위만 승인한 요청은 외부 의존성 추가 승인으로 해석하지 않는다. 제시한
  package 또는 적용 범위가 달라지면 다시 승인받는다.
- 승인 후에는 저장소의 package manager로 설치하고 direct dependency와 lockfile을 함께 고정하며, 실제 import와
  적용 테스트로 사용 근거를 확인한다. 사용하지 않거나 기존 의존성과 책임이 중복된 package는 완료 범위에 남기지
  않는다.
- 승인되지 않은 의존성이 필요해 작업을 안전하게 완료할 수 없으면 추가하거나 불완전한 자체 구현으로 우회하지
  않고 차단 근거와 승인 필요 항목을 보고한다.

### 신중/안전 지시 처리

- 사용자가 `신중`, `안전`, `궁극`, `최종`, `No Findings`, `cutover`, `제거`, `배포 영향`처럼 위험 통제 의도를 명시하면 이 절을 적용한다.
- 적용 대상은 계획, 설계, 코드 구현/수정/제거, 리뷰, 문서 작성/수정이다.
- 실행 전에 먼저 목표, 제외 범위, 기준 문서, 영향 범위, 검증 방법, rollback/cutover 여부를 고정한다.
- 계획 또는 수정 방향 자체를 리뷰 대상처럼 점검하고, finding이 있으면 계획을 고친 뒤 같은 범위로 재리뷰한다.
- 계획 재리뷰가 `No Findings`일 때만 구현이나 문서 수정을 시작한다.
- 실행은 검증 가능한 작은 단계로 나누고, 각 단계 후 변경 범위와 필요한 표적 검증 결과만 확인한다. 로컬 표준
  통합 품질 게이트는 최종 후보의 독립 리뷰 이후 [테스트/CI 전략](testing-strategy.md)에 따라 실행한다.
- 삭제/제거/cutover는 삭제 대상, 제거 조건, 되돌림 기준, 검증 근거가 문서나 PR에 없으면 진행하지 않는다.

### DB Migration Gate 인덱스

- DB 마이그레이션 검증은 [DB Migration Gate 정책](db-migration-gate-policy.md)의 `DBM-GATE-*`를 기준으로 수행한다.
- 본 문서는 상위 원칙(Fail-closed/No Findings)만 유지하고, DB 마이그레이션 세부 게이트 정의는 분리 문서를 단일 기준으로 사용한다.

### 안전한 로직 이행 (Shadow Cutover)

- 같은 입력에서 같은 의미의 결과를 내야 하는 기존 로직을 통합 함수/신규 로직으로 바꿀 때만 아래 4단계를 순서대로 강제한다. 버전별 wire 계약이 의도적으로 다른 호환 배포와 DB Expand는 이 절의 적용 대상이 아니다.
    1. `통합 함수 도입`: 기존 로직은 제거하지 않고 유지한다. 신규 로직은 병렬 계산(shadow)만 수행한다.
    2. `diff 계측`: 동일 입력에 대해 기존/신규 결과를 비교하는 diff 로그를 남기고 불일치 원인을 제거한다.
    3. `점진 교체`: 불일치 0건이 확인된 뒤에만 호출부를 한 곳씩 교체한다.
    4. `레거시 제거`: 삭제 대상으로 명시된 레거시에 한해, 모든 호출부 교체 + 회귀 테스트 통과 + 문서 반영 이후 마지막 단계에서만 제거한다.
- `불일치 0건`은 임의 판단이 아니라 PR/문서에 검증 범위(대상 시나리오, 대상 기간 또는 샘플 수, 로그 위치)를 명시하고 근거 링크로 확인 가능해야 한다.
- `Shadow Cutover` 예시
    - 대상 변경: `구 로직 A -> 신규 로직 B`
    - 제거 조건: `기존 호출부/분기 제거 가능 조건 충족 후 제거`
    - 목표 시점: `<date 또는 release>`
    - 추적 이슈: `<issue 링크 또는 문서 경로>`
    - 검증 범위: `<대상 시나리오 / 기간 / 샘플 수>`
    - diff 로그 경로: `<로그 경로 또는 대시보드 링크>`
    - 불일치 결과: `0건`
- 금지 사항:
    - 불일치 0건 확인 전 기존 로직을 제거하거나 의미를 변경하는 행위
    - 삭제 대상으로 지정되지 않은 기존 기능을 레거시로 간주해 제거하는 행위
    - DB read/write 기준·계산식·조회 경로를 바꾸면서 적용 대상 `DBM-GATE-300`과 diff 검증을 생략하는 행위
    - 제거 조건, 목표 시점, 추적 이슈가 없는 파생 호환 로직을 장기 잔존시키는 행위

## 관련 문서

- [API 조회·동작 설계 정책](api-operation-design-policy.md)
- [코드 리뷰 정책](code-review-policy.md)
- [테스트/CI 전략](testing-strategy.md)
- [문서 거버넌스 정책](document-governance-policy.md)
- [DB Migration Gate 정책](db-migration-gate-policy.md)
