# AGENTS

## 문서 인덱스

### Architecture

- [회원 심사 FSM](architecture/member-review-fsm.md) - 상태머신 및 심사 플로우
- [프로필 이미지 마이그레이션](architecture/member-review-image-migration-plan.md)

### Technical Debt

- [기술 부채 정리](technical-debt.md)

### Policy

- [Git 브랜치 전략](policy/git-branch-strategy.md) - 브랜치 명명 규칙
- [커밋 메시지 컨벤션](policy/commit-convention.md) - Conventional Commits 기반
- [로그 정책](policy/log-policy.md) - 개발/운영 로그 규칙
- [코드 리뷰 정책](policy/code-review-policy.md) - PR 작성 및 리뷰 가이드
- [TypeScript 전환 계획](policy/typescript-migration-plan.md)

### Flows

- [사용자 등록 플로우](flows/cross-project/user-registration-flow.md) - 회원가입 → 심사
- [사용자 인증 플로우](flows/coupler-mobile-app/user-authentication-flow.md) - 로그인

### Setup

- [개발환경 구성](README.md)

## 📦 레포지토리 요약

- **`coupler-admin-web`**: CRA 기반 어드민 프론트엔드. `npm start`(포트 8000)로 개발 서버를 띄우며 MobX 상태 관리와 Chart.js, DataTables 등을 활용해 운영 지표와 회원 관리 UI를 제공합니다.
- **`coupler-api`**: Express + MySQL 백엔드. `app.js` 진입점에서 REST API와 다국어(i18n)/Firebase Admin 연동을 제공하며, README에 정리된 다수의 cron 엔드포인트로 매칭·알림·정리 작업을 자동화합니다.
- **`coupler-mobile-app`**: React Native 클라이언트. CodePush 스크립트로 스테이징/프로덕션 배포를 지원하고 Agora, Notifee, Kakao 연동 등 다양한 네이티브 모듈을 포함합니다. README에 명시된 iOS/Android별 빌드 패치가 필요합니다.

## coupler-mobile-app to-be 아키텍처

### 폴더/네이밍 가이드

- 정의: 도메인 = `src/screens/` 최상위 기능 묶음(`auth`, `signup` 등, `shared` 제외), 화면 = 네비게이션 대상 `*Screen` 파일, Step = 화면 내부 플로우 단계 컴포넌트(`*Step*`).
- 이 변경은 반드시 승인을 받고만 진행한다. TypeScript 전환 전제: 신규/수정 파일은 `.ts/.tsx` 우선, 기존 `.js/.jsx`는 점진 전환한다.
- 구조: `src/screens/`에는 `shared/`와 도메인 폴더만 둔다. `src/screens/<도메인>/` 아래는 `<화면>Screen`과 동일 접두 파일(`<화면>*.ts`/`.js`), `shared/`만 허용한다. `<화면>/` 폴더는 만들지 않는다.
- 라우팅 대상: `src/screens/<도메인>/<화면>Screen` 또는 `src/screens/shared/<화면>Screen`만 허용한다.
- 화면 전용 코드는 같은 레벨 `src/screens/<도메인>/<화면>*.ts`/`.js`로 둔다(전역 화면은 `src/screens/shared/<화면>*.ts`/`.js`).
- Step 규칙: 화면 전용 Step은 `src/screens/<도메인>/<화면>Step*.ts`/`.tsx`에 둔다. 도메인 공용 Step은 `src/screens/<도메인>/shared/steps/`, 도메인 간 공용은 Step 대신 공용 컴포넌트로 승격한다. Step은 라우터 등록 금지, 화면 내부 단계는 `*Section`/`*Block`/`*Panel` 사용, `fragment`/`*Fragment*` 금지. 레거시 Step 라우트는 to-be 전환 시 제거/리네이밍 대상으로 보고 신규 추가는 금지한다.
- 승격 기준: 화면 전용 → 도메인 `shared` → 전역. 전역 UI는 `src/components/common/`, 전역 로직은 `src/api`/`src/stores`/`src/utils`/`src/constants`/`src/hooks`, 리소스는 `src/assets/`.
- 용어 기준: `common`은 전역 공용, `shared`는 도메인 내부 공용만 의미한다. `src/screens/shared/`는 라우팅 전용으로만 사용하고, 컴포넌트는 두지 않는다.
- 상수: 화면 전용은 `src/screens/<도메인>/<화면>Constants.ts`/`.js`, 도메인 공용은 `src/screens/<도메인>/shared/constants/`, 전역은 `src/constants/`.
- Card는 “화면 일부 재사용 블록”에만 사용하고, 화면 레이아웃을 포함하면 `*ScreenContent`/`*Panel`로 이름을 올린다.

### coupler-mobile-app 예시 폴더 구조 (to-be)

```text
src/
  api/                 # 전역 공용 통신, 외부 연동
  assets/              # 이미지, 폰트 등 리소스
  components/
    common/            # 전역 재사용 UI
  constants/           # 전역 상수
  hooks/               # 전역 공용 hooks
  navigation/          # 라우터/네비게이션 설정
  screens/
    shared/
      <화면>Screen.tsx
      <화면>Styles.ts
    <도메인>/
      <화면>Screen.tsx
      <화면>Step1.tsx
      <화면>Constants.ts
      shared/
        components/
        hooks/
        utils/
        constants/
        steps/
  stores/              # 전역 상태
  utils/               # 전역 유틸
```

### Navigation

- `navigation/` 아래에 Root Stack, Tab Navigator, 각 탭의 Stack Navigator를 함께 둔다.
- Root Stack은 인증 흐름(Auth)과 Main Tab을 분리해 관리한다.
- Tab은 메인 하단 탭(매칭/채팅/스퀘어/설정), 각 탭은 전용 Stack으로 상세 화면을 관리한다.
- 탭 루트 화면은 해당 탭 Stack의 루트로만 둔다(동일 화면을 RootStack에 중복 등록하지 않는다).
- 하단 탭이 필요한 화면은 Tab Navigator를 통해 진입한다(탭 지정 네비게이션).

## 회원 심사/승급 문서

- 상세 FSM, 상태 정의, 어드민 분류 기준은 [회원 심사 FSM](architecture/member-review-fsm.md)을 따른다.

## 주의할점

- 필수 코드만 추가
- 플랫폼 고려: android, ios일 때 레이아웃
- 프로젝트 일관성, 확장성, 재사용성 고려
- 추측 금지, 코드 및 링크로 근거 제시
- 기존 기능 삭제 금지
- 조용한 실패 금지: 로딩/검증/저장 실패는 사용자에게 명시적으로 알리고 로그/에러코드를 남긴다
- 불필요한 가드 금지: 정책상 불가능한 경로는 가드로 숨기지 말고 데이터/흐름 보증으로 해결한다
- 정책 의도는 코드에서 바로 드러나게 변수명/함수명/구조로 명시한다
- 주석 최소화: 코드로 의도가 충분히 드러나면 주석 금지, 불가피한 경우에만 1줄 주석 허용
- 한국어 사용, 영어단어는 알파뱃으로 표시
- 코드, 파일엔 명시적이며 직관적인 명칭 사용할 것
- lint 고려할 것
- verbose한 문법 지양
- Optional (`?`) 최소화: API/데이터 소스에서 반드시 제공하는 필드는 optional로 표시하지 않는다. 실제로 값이 없을 수 있는 경우에만 `?` 사용

---

## 코드 품질 정책

### API 스펙 명확성

- **불필요한 분기나 fallback 로직 금지**
  - API 파라미터는 하나로 명확하게 정의
  - `param1 ?? param2` 같은 fallback은 API 불일치를 숨김
  - 예시: `profile_image_paths ?? profile` (잘못됨) → `profile_image_paths` (올바름)
  - 이유: fallback은 클라이언트-서버 간 스펙 불일치를 감추어 디버깅을 어렵게 하고 향후 유지보수 시 혼란을 야기함

### 명시적인 이름 사용

- **모호한 이름 금지, 의미가 명확한 이름 사용**
  - `profile` (모호함) → `profile_image_paths` (명시적)
  - `data` (모호함) → `memberData` 또는 `authData` (명시적)

- **단수/복수 구분 엄격히 준수**
  - `image` (단일 이미지) vs `images` (복수 이미지)
  - `url` (단일 URL) vs `urls` (복수 URL)
  - 배열이면 반드시 복수형, 단일 값이면 반드시 단수형

- **타입과 일치하는 명명**
  - 문자열 배열: `imageUrls` (O), `imageUrl` (X)
  - '#' 구분자 문자열: `profileImagesString` 또는 `profileImagesConcatenated` (O), `profile` (X)

---

## 🧪 테스트 코드 전략 (레포별)

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

---

## 🔧 CI 전략

- 모든 CI는 `pull_request` 이벤트만 트리거한다.

## 기타 현재 ritzy -> coupler로 전체적인 개명필요

- 기존있는 코드까지 다바꾸기에는 변경많으므로 일단 변경분에 대해서만 항상 앞으로 명칭 coupler로 고정

---

## 🐛 버그 수정 원칙

### 1. 근본 원인 해결 (Root Cause Fix)

- ❌ normalize 함수로 증상 치료
- ✅ 왜 문제가 생겼는지 추적하여 원인 제거

### 2. 확장성 & 일관성

- 하드코딩/Magic Number 금지 → 상수로 정의
- 네이밍 일관성 유지 (같은 개념 = 같은 이름)
- 같은 문제는 같은 방식으로 해결

### 3. 주석 가이드라인

- ❌ 불필요한 주석 (`// 이미지를 가져온다`)
- ✅ WHY를 설명하는 주석 (`// iOS에서 확장자 뒤에 ?가 붙기 때문에 제거`)
- ✅ 복잡한 비즈니스 로직 설명
- ⚠️ 기존 의미있는 주석은 마구잡이로 제거 금지

### 4. 체크리스트

- [ ] 근본 원인 파악했는가?
- [ ] 다른 곳에도 같은 문제 있는가?
- [ ] Edge case 테스트했는가?
- [ ] 회귀 테스트 통과했는가?
