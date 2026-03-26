# 테스트/CI 전략

## 문서 역할

- 역할: `규범`
- 문서 종류: `policy`
- 충돌 시 우선 문서: 이 문서
- 기준 성격: `as-is`

## 목적

- 레포별 테스트 위치와 docs 포함 공통 검증 게이트를 고정한다.

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
- Chart.js / DataTables: “렌더링 성공 + 주요 props 처리” 수준의 얕은 테스트부터 시작.

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

### coupler-mobile-app (React Native)

- 러너: `jest` + `preset: react-native` 사용.
- 위치/규칙: `src/__tests__/**/*.test.(ts|tsx)`만 허용.
- 우선순위:
    1. `src/screens/**`의 핵심 화면 스모크 렌더링과 same-level `*Step*` 파일 테스트
    2. 조건부 UI/상태 변화 테스트

- 구조 메모: 현행 코드는 화면 레벨 `*Step*` 파일이 주류이며, to-be 구조에서도 화면 전용 Step은 `src/screens/<도메인>/<화면>Step*.ts(x)`를 기본으로 둔다. 도메인 공용 Step만 `src/screens/<도메인>/shared/steps/`를 사용한다.
- 상호작용 테스트는 `@testing-library/react-native` 사용을 기본으로 한다.
- 네이티브 모듈(AsyncStorage, Reanimated 등)은 Jest mock/셋업 파일로 분리 구성.

### docs (MkDocs)

- 러너: GitHub Actions docs validation workflow (`markdownlint` + `mkdocs build --strict`) 사용.
- 문서 빌드(로컬): `npm run build:docs` (`python3 -m mkdocs build --strict`)
- 문서 lint(로컬): `npm run lint:md`
- 문서 lint(CI): `DavidAnson/markdownlint-cli2-action@v16` (globs: `**/*.md`, excludes: `node_modules`, `site`)
- 문서 build(CI): Python 의존성 설치 후 `mkdocs build --strict`

## CI 전략

- 서비스 레포(coupler-\*): 기본적으로 `pull_request` 이벤트에서만 CI를 트리거한다.
- docs 레포: 검증 워크플로는 `pull_request(main)`과 `push(main)`에서 동작한다.
- docs 레포: `pull_request(main)` 검증이 merge gate이고, `push(main)` 검증은 배포 전 최종 안전망으로 사용한다.

## DB 마이그레이션 검증 (공통)

- 운영 반영 전 최소 검증 순서는 `Local baseline -> Local migration -> 개발계 검증 -> 시나리오 DB 검증`을 따른다.
- 상세 Gate/판정 기준은 [DB Migration Gate 정책](db-migration-gate-policy.md)을 단일 기준으로 사용한다.

## 관련 문서

- [엔지니어링 가드레일](engineering-guardrails.md)
- [코드 리뷰 정책](code-review-policy.md)
- [DB Migration Gate 정책](db-migration-gate-policy.md)
