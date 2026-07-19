# 테스트/CI 전략

## 문서 역할

- 역할: `규범`
- 문서 종류: `policy`
- 충돌 시 우선 문서: 이 문서
- 기준 성격: `as-is`

## 목적

- 레포별 테스트 위치와 docs 포함 공통 검증 게이트를 고정한다.

## 공통 품질 게이트 (단일 SoT)

- 코드 레포의 표준 품질 게이트는 `test`, `typecheck`, `lint`, `format`이다.
- docs의 표준 품질 게이트는 `docs 구조 검증`, `논리 데이터 모델 검증`, `기술부채 인벤토리 검증`,
  `릴리스 기록 검증`, `API 에러 문서 검증`, `릴리즈 preflight 스크립트 검증`, `markdownlint`,
  `mkdocs build --strict`다.
- 레포에서 미제공인 항목은 `N/A`로 표기하고, 미적용 근거를 PR/작업 보고에 남긴다.
- 표준 검증 명령은 아래를 단일 기준으로 사용한다.
    - `coupler-api`: `pnpm lint && pnpm typecheck && pnpm format && pnpm test:ci`
    - `coupler-mobile-app`: `yarn lint && yarn typecheck && yarn format && yarn test:ci`
    - `coupler-admin-web`: `yarn lint && yarn typecheck && yarn format && CI=true yarn test:ci`
    - `docs`: `yarn validate:docs`
- API 공통 응답/에러 계약 또는 generated contract 변경이 포함되면 `coupler-api` 표준 검증에 `pnpm check:contracts`, `pnpm pack:contracts`를 추가한다.
- Admin/Mobile 계약 소비 검증은 [API 클라이언트 계약 패키지 정책](api-client-contract-package-policy.md)의 published latest stable version을 목표로 삼고, GitHub Packages registry/auth 설정, `package.json`, lockfile의 `@coupler-developer/coupler-api-contracts` exact version, 각 소비자 레포 표준 품질 게이트를 기준으로 한다.
- Admin/Mobile이 계약 패키지 버전을 갱신하는 PR은 해당 소비자 레포의 표준 품질 게이트를 통과해야 한다. 이때 GitHub Packages registry/auth 설정과 `package.json`/lockfile의 `@coupler-developer/coupler-api-contracts` version이 일치하는지 확인한다.

### 모바일 Storybook·native visual 게이트

- `coupler-mobile-app`에 Storybook 게이트가 도입된 뒤에는 PR 검증에 `yarn storybook:check`를 포함한다.
- `yarn storybook:check`는 Storybook story 수집, `.storybook/storybook.requires.ts` 최신성, Storybook 전용 TypeScript 체크, story 렌더/snapshot 테스트를 함께 검증해야 한다.
- UI 표시 변경, Storybook 인프라 변경, 또는 이미 story가 있는 컴포넌트 변경은 관련 story와 snapshot을 함께 추가/갱신하고 PR에 변경 이유를 남긴다.
- iOS/Android native visual job은 [Git 브랜치 전략](git-branch-strategy.md)의 Mobile Store 제출 준비용 `release/* → main` PR에서만 자동 실행한다. 각 플랫폼의 fresh capture를 해당 플랫폼의 기준 이미지와 비교하며 두 job이 모두 통과해야 한다.
- 일반 PR에서는 native visual job을 의도적으로 `skipped` 처리하고 별도 Storybook workflow의 `yarn storybook:check`를 유지한다. visual 관련 일반 PR 또는 Mobile NextPush 릴리즈 후보는 GitHub Actions의 `workflow_dispatch`에서 검증할 ref를 선택해 두 native visual job을 수동 실행하고, 실행 URL과 결과를 PR/릴리즈 증빙에 남긴다.
- [배포 태그 정책](release-tag-policy.md)의 `vX.Y.Z` 릴리즈 태그는 운영 반영·검증 뒤 생성하는 기준점이므로 native visual의 사전 릴리즈 트리거로 사용하지 않는다.
- Storybook snapshot은 컴포넌트 표시 회귀 증빙이며, native 설정/앱 시작/실기기 동작/화면 전환 E2E 검증을 대체하지 않는다.
- 위 실행 조건에 따라 일반 PR의 native visual job이 `skipped`인 상태는 적용 대상이 아니므로 `N/A`로 기록한다. CI 결제/runner 장애처럼 적용 대상 테스트가 실행 전 차단된 상태는 통과로 간주하지 않는다. PR에서는 로컬 `yarn storybook:check` 결과를 임시 증빙으로 기록할 수 있지만 원격 CI 상태는 `미검증`으로 남긴다.

## 회귀 안전성 검증

- 회귀 판정 기준은 [엔지니어링 가드레일](engineering-guardrails.md)의 `회귀 안전성 게이트`를 단일 기준으로 사용한다.
- 모든 코드 변경은 아래 위험도 중 하나로 분류하고, PR/작업 보고에 검증 근거를 남긴다.

| 위험도 | 적용 조건 | 최소 검증 |
| --- | --- | --- |
| `Low` | 동작/정책 기준 변경 없는 문서, 주석, 포맷, 내부 정리 | 회귀 영향 `N/A` 사유와 변경 경로 근거 |
| `Medium` | UI 표시, API 호출부, 순수 로직, 상태 표시처럼 사용자/운영 동작에 영향 가능 | 보호 동작 1개 이상에 대한 테스트, 로그, 또는 수동 시나리오 결과 |
| `High` | API 계약, 상태 머신(FSM)/상태 전이, 권한, 결제, 푸시, DB, 배포, 네이티브/모바일 릴리즈, 보안/개인정보, 다중 레포 변경 | 자동 테스트, 검증 스크립트, postcheck, 운영 로그, 실기기 검증 중 해당 영역의 차단 가능한 증빙 |

- `High` 변경에서 자동 테스트가 없으면 수동 검증만으로 끝내지 않고, 왜 자동화할 수 없는지와 대체 검증 스크립트/로그를 남긴다.
- `High` 변경은 아래 최소 검증을 따른다.
- 도메인 정책이 더 상세한 검증 기준을 정하면 해당 정책을 우선한다.

| 변경 유형 | 최소 검증 |
| --- | --- |
| API 계약 | 요청/응답 계약 테스트 또는 controller/route 통합 테스트 |
| API 조회·동작 구조 | 페이지 조회의 필수 데이터·권한 계약, bounded 최대치의 payload·query 수, 소비자 요청 그래프 또는 화면 테스트 |
| 상태 머신(FSM)/상태 전이 | 허용/거부 전이 테스트 또는 상태 차이 로그 |
| 권한/보안 | 권한별 허용/거부 검증 |
| 결제 | 중복 결제, 환불, 키 지급/회수 검증 |
| 푸시 | 발송, 스킵, 중복 방지, 저장 결과 검증 |
| DB | [DB Migration Gate 정책](db-migration-gate-policy.md)의 적용 Gate 검증 |
| 배포 | 배포 후 핵심 응답, 로그, 롤백 기준 검증 |
| 네이티브/모바일 릴리즈 | 실기기 또는 배포 리허설 검증 |
| 다중 레포 변경 | 각 레포 품질 게이트와 교차 계약 검증 |

- 기존 정책 불일치는 이번 변경이 새로 만들거나 확산한 경우에만 신규 회귀로 본다.
- 기존 정책 불일치 경로를 이번 변경이 직접 건드리면 최소 `Medium`으로 분류한다.
- 스펙 공백이 있으면 테스트 기대값을 추측하지 않고 정책/계약/FSM을 먼저 확정한다.
- 테스트 미실행은 `not run` 또는 `N/A` 사유만으로 충분하지 않으며, 영향 범위가 없다는 근거 경로/라인/로그를 함께 남겨야 한다.

## 테스트 변경 판정

- 코드 변경이 동작, 계약, 상태, 권한, 데이터, UI/운영 흐름에 영향을 줄 수 있으면 관련 테스트를 추가하거나 갱신한다.
- PR/작업 보고에는 `테스트 변경 여부`를 `추가`, `갱신`, `미변경` 중 하나로 기록하고 근거를 남긴다.
- `미변경`은 회귀 영향 없음 또는 확인 가능한 기존/대체 검증 근거가 있을 때만 인정한다.
- 자동화 불가 또는 대체 검증은 실행 명령, 로그, 수동 시나리오 중 확인 가능한 근거로 남긴다.
- 리뷰마다 테스트 변경 판정이 기존보다 회귀 안전성을 높이거나 최소한 약화하지 않는지 확인한다.
- Finding이 있으면 [코드 리뷰 정책](code-review-policy.md)의 `No Findings 최종 리뷰 기록` 절차에 따라 `No Findings`까지 반복한다.
- 테스트를 추가/갱신할 때는 `skip/only`, assertion 완화, 무검토 snapshot 갱신처럼 테스트를 약화하는 변경을 금지한다.

## 테스트 코드 전략 (레포별)

- 공통 규칙: 코드베이스는 `.js/.jsx/.ts/.tsx` 혼용 가능. **테스트 파일에만 `.test.ts`/`.test.tsx`를 적용**한다.

### 작성시 주의사항

- 테스트 함수명이 내용과 일치하는지
- 테스트 함수간 중복이 없는지
- 누락된 시나리오 없는지
- verbose한 문법 있는지
- 테스트가 결정적인지

### coupler-admin-web (CRA)

- 러너: `react-scripts test` 사용.
- 위치/규칙: `src/__tests__/**/*.test.(ts|tsx)`만 허용.
- 우선순위:
    1. `src/helper` 등 순수 로직 단위 테스트
    2. `src/pages` 스모크 렌더링 테스트
    3. MobX 스토어 상태 변경 테스트

- 외부 통신: axios mock 또는 MSW 도입 고려(현재 의존성 없음).
- Chart.js는 “렌더링 성공 + 주요 props 처리” 수준의 얕은 테스트부터 시작한다.
- React 목록은 공통 client의 요청/응답 계약, 페이지 이동, 검색, 정렬, 최신 요청 우선 반영과 row parser 실패 차단을 우선 검증한다.
- TO-BE: 기존 Playwright smoke를 route·filter 검증까지 확장하고 표준 gate에 포함한다. 잔여 범위는 [기술 부채 정리](../technical-debt/technical-debt.md)의 `테스트용 개발 데이터 운영 검증·고도화 미완료`에서 추적한다.

### coupler-api (Express)

- 러너: `jest` 사용.
- 위치/규칙: `__tests__/**/*.test.(ts|tsx)`만 허용 (현재 `jest.testMatch` 기준).
- TO-BE: `src/__tests__/` 통일 전환은 기술부채 항목에서 별도 관리.
- 리팩토링 기준: 컨트롤러는 오케스트레이션, 핵심 규칙은 usecase/lib 계층으로 분리된 구조를 기준으로 테스트한다.
- 우선순위:
    1. `lib`/usecase 순수 로직 단위 테스트
    2. `controller`/`routes` 통합 테스트(요청/응답 검증)

- 외부 통신 테스트 필요 시 `supertest` 도입 고려(현재 의존성 없음).
- 외부 연동(Firebase/SMS/메일): mock 처리로 실서비스 호출 차단.
- DB 전략: 테스트용 데이터셋/트랜잭션 롤백/테이블 정리 중 하나를 고정하여 일관성 유지.
- 공유 개발계 관리자 화면과 Mobile QA를 위한 합성 데이터는 단위·통합 테스트 fixture와 분리하며 [테스트용 개발 데이터 정책](development-test-data-policy.md)을 따른다.
- `tools/dev-data`는 API 표준 lint·typecheck·format·Jest에 포함하고, namespace·environment·registry·generation cutover·DB transaction·asset·cron fence 안전 모듈은 `test:dev-data-safety`의 branch 100% gate로 검증한다.

### coupler-mobile-app (React Native)

- 러너: `jest` + `preset: react-native` 사용.
- 위치/규칙: `src/__tests__/**/*.test.(ts|tsx)`만 허용.
- 우선순위:
    1. `src/screens/**`의 핵심 화면 스모크 렌더링과 same-level `*Step*` 파일 테스트
    2. 조건부 UI/상태 변화 테스트

- 화면과 Step의 구조 판정은 [엔지니어링 가드레일](engineering-guardrails.md)의
  `Mobile 파일 구조와 네이밍`을 따르며 이 문서는 테스트 우선순위만 소유한다.
- 상호작용 테스트는 `@testing-library/react-native` 사용을 기본으로 한다.
- 네이티브 모듈(AsyncStorage, Reanimated 등)은 Jest mock/셋업 파일로 분리 구성.

### docs (MkDocs)

- 러너: 로컬과 GitHub Actions full validation은 `validate:docs-static`의 공통 정적 검증 목록을 사용한다.
- 문서 공통 정적 검증(로컬·full CI): `yarn validate:docs-static`
- 문서 구조 검증(로컬): `yarn validate:docs-structure`
- 문서 민감 인프라 식별자 검증(로컬·경량 CI): `yarn validate:docs-sensitive`
- 문서 구조 검증 테스트(로컬): `yarn test:docs-structure`
- 논리 데이터 모델 검증(로컬): `yarn validate:logical-data-model`
- 논리 데이터 모델 검증 테스트(로컬): `yarn test:logical-data-model`
- 기술부채 인벤토리 검증(로컬): `yarn validate:technical-debt`
- 기술부채 인벤토리 검증 테스트(로컬): `yarn test:technical-debt`
- 릴리스 기록 검증(로컬): `yarn validate:release-records`
- API 에러 문서 검증(로컬): `yarn validate:api-error-docs`
- 릴리즈 preflight·pending transition·CI mode 스크립트 검증(로컬): `yarn test:release-preflight`
- 문서 빌드(로컬): `yarn build:docs` (`python3 -m mkdocs build --strict`)
- 문서 lint(로컬): `yarn lint:md`
- 문서 통합 검증(로컬): `yarn validate:docs`
- 문서 공통 정적 검증(full CI): `yarn validate:docs-static`
- 경량 릴리스 검증(CI): `yarn validate:docs-sensitive`, `node scripts/validate-release-records.mjs`,
  `node scripts/validate-release-pr-transition.mjs`
- 문서 lint(CI): `DavidAnson/markdownlint-cli2-action@v16` (globs: `**/*.md`, excludes: `node_modules`, `site`)
- 문서 build(CI): Python 의존성 설치 후 `mkdocs build --strict`

## CI 전략

- 서비스 레포(coupler-\*): 기본적으로 `pull_request` 이벤트에서만 CI를 트리거한다.
- docs 레포: `Docs Validation` 검증 워크플로는 `pull_request(main)`에서만 동작하며 merge gate로 사용한다.
- docs 레포: full mode는 로컬과 같은 `yarn validate:docs-static`을 실행한다. 개별 validator 목록을 workflow에
  다시 열거하지 않는다.
- docs 레포: PR 병합 뒤 `push(main)`에서는 `Deploy Docs`가 `yarn validate:docs`를 다시 실행한 뒤에만 Pages artifact를 배포하므로, `Docs Validation`을 중복 실행하지 않는다.
- docs 레포: 변경 파일이 신규 릴리스 기록뿐이고 현재 상태가 `planned`, `pending`, `in_progress`이면
  `docs-structure`에서 민감 인프라 식별자, metadata, PR transition을 경량 검증한다. `released`/terminal 기록,
  일반 문서, policy, script, workflow 변경은 기존 전체 검증을 실행한다.
- docs 레포: `markdown-lint`와 `build-docs`는 validation mode와 무관하게 `docs-structure`와 동시에 시작한다.
  full mode의 공통 정적 검증 목록은 계속 `yarn validate:docs-static` 한 곳에서만 소유한다.
- docs 레포: 같은 PR의 새 push가 이전 검증과 겹치면 `concurrency`로 이전 실행을 취소한다. 경량 검증을 통과한 `pending`은 배포 시작 gate이고, 최종 병합 gate는 `released` 커밋의 전체 docs 검증이다.
- docs 레포: `Docs Validation`은 `opened`, `synchronize`, `reopened`만 구독한다. 따라서 `released` 전체 검증 뒤 Draft PR을 Ready로 전환하는 동작만으로 같은 CI를 다시 실행하지 않는다.

## DB 마이그레이션 검증 (공통)

- 운영 반영 전 최소 검증 순서는 [DB Migration Gate 정책](db-migration-gate-policy.md)의 실행 검증 파이프라인을 따른다.
- 상세 Gate/판정 기준은 [DB Migration Gate 정책](db-migration-gate-policy.md)을 단일 기준으로 사용한다.

## 관련 문서

- [엔지니어링 가드레일](engineering-guardrails.md)
- [API 조회·동작 설계 정책](api-operation-design-policy.md)
- [코드 리뷰 정책](code-review-policy.md)
- [DB Migration Gate 정책](db-migration-gate-policy.md)
