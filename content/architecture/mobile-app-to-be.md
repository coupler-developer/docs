# coupler-mobile-app to-be 아키텍처

## 폴더/네이밍 가이드

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

## coupler-mobile-app 예시 폴더 구조 (to-be)

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

## Navigation

- `navigation/` 아래에 Root Stack, Tab Navigator, 각 탭의 Stack Navigator를 함께 둔다.
- Root Stack은 인증 흐름(Auth)과 Main Tab을 분리해 관리한다.
- Tab은 메인 하단 탭(매칭/채팅/스퀘어/설정), 각 탭은 전용 Stack으로 상세 화면을 관리한다.
- 탭 루트 화면은 해당 탭 Stack의 루트로만 둔다(동일 화면을 RootStack에 중복 등록하지 않는다).
- 하단 탭이 필요한 화면은 Tab Navigator를 통해 진입한다(탭 지정 네비게이션).

