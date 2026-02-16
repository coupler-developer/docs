# 테스트/CI 전략

## 테스트 코드 전략 (레포별)

- 공통 규칙: 코드베이스는 `.js/.jsx/.ts/.tsx` 혼용 가능. **테스트 파일에만 `.test.ts`/`.test.tsx`를 적용**한다.

### coupler-admin-web (CRA)

- 러너: `react-scripts test` 사용 (`coupler-admin-web/package.json`).
- 위치/규칙: `src/__tests__/**/*.test.(ts|tsx)`만 허용.
- 우선순위:

  1. `src/helper` 등 순수 로직 단위 테스트
  2. `src/pages` 스모크 렌더링 테스트
  3. MobX 스토어 상태 변경 테스트
- 외부 통신: axios mock 또는 MSW 도입 고려(현재 의존성 없음).
- Chart.js / DataTables: “렌더링 성공 + 주요 props 처리” 수준의 얕은 테스트부터 시작.

### coupler-api (Express)

- 러너: `jest` 사용 (`coupler-api/package.json`).
- 위치/규칙: `src/__tests__/**/*.test.(ts|tsx)`만 허용.
- 우선순위:

  1. `lib/*.js` 유틸 단위 테스트
  2. `controller`/`routes` 통합 테스트(요청/응답 검증)
- 외부 통신 테스트 필요 시 `supertest` 도입 고려(현재 의존성 없음).
- 외부 연동(Firebase/SMS/메일): mock 처리로 실서비스 호출 차단.
- DB 전략: 테스트용 데이터셋/트랜잭션 롤백/테이블 정리 중 하나를 고정하여 일관성 유지.

### coupler-mobile-app (React Native)

- 러너: `jest` + `preset: react-native` 사용 (`coupler-mobile-app/jest.config.js`).
- 위치/규칙: `src/__tests__/**/*.test.(ts|tsx)`만 허용.
- 우선순위:

  1. `src/screens/**/steps` 등 핵심 화면 스모크 렌더링
  2. 조건부 UI/상태 변화 테스트
- 상호작용 테스트 필요 시 `@testing-library/react-native` 도입 고려(현재 의존성 없음).
- 네이티브 모듈(AsyncStorage, Reanimated 등)은 Jest mock/셋업 파일로 분리 구성.

### docs (MkDocs)

- 러너: GitHub Actions (mkdocs build + markdownlint) 사용.
- 문서 빌드: `mkdocs build --strict`
- 문서 lint: `DavidAnson/markdownlint-cli2-action@v16` (globs: `**/*.md`)

## CI 전략

- 서비스 레포(coupler-*): 기본적으로 `pull_request` 이벤트에서만 CI를 트리거한다.
- docs 레포: 문서 배포/검증을 위해 `push(main)`에서도 워크플로가 동작할 수 있다.
