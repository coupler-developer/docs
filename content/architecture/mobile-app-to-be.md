# coupler-mobile-app to-be 아키텍처

## 문서 역할

- 역할: `설명`
- 문서 종류: `architecture`
- 충돌 시 우선 문서: [엔지니어링 가드레일](../policy/engineering-guardrails.md)
- 기준 성격: `transition`

## 목표 구조

- 파일 구조와 네이밍 규칙은 [엔지니어링 가드레일](../policy/engineering-guardrails.md)의
  `Mobile 파일 구조와 네이밍`을 단일 기준으로 사용한다.
- 이 문서는 해당 규칙이 적용된 목표 디렉터리와 레이어 배치를 설명한다.
- 도메인은 `src/screens/`의 최상위 기능 묶음이고, 화면은 네비게이션 대상 `*Screen`, Step은 화면 내부
  플로우 단계 컴포넌트다.
- 기존 구조의 전환 잔여 범위는 [기술 부채 정리](../technical-debt/technical-debt.md)의
  `Mobile 파일 구조 TO-BE 미전환`에서 추적한다.

## 레이어 책임 분리 적용 (Mobile)

- 책임 분리 공통 원칙은 [엔지니어링 가드레일](../policy/engineering-guardrails.md)의 `레이어 책임 분리 (단일 SoT)`를 단일 기준으로 사용한다.
- 본 문서는 모바일 구현 예시와 적용 지점만 설명하며 원칙 본문은 엔지니어링 가드레일이 소유한다.
- 적용 포인트 예시:
    - Screen 계층은 네비게이션 연결, 화면 상태 조합과 UI 이벤트 wiring을 담당한다.
    - Domain 계층에는 Store/Service/UseCase 형태의 상태 전이·판단·정책 로직이 위치한다.
    - Component 계층은 순수 렌더링을 담당하고 도메인 판단과 네트워크 호출은 Domain·Screen 경계에 위치한다.
    - 공통 UI 예시는 `Frame(저수준 레이아웃)`과 `App 수준 조합 컴포넌트`의 2계층 구조다.
    - Header 예시: `HeaderFrame`(safe-area/slot/layout) + `AppHeader`(title/back/actions preset).
    - 공용 컴포넌트의 export 타입이 타입 경계를 설명하며 타입 우회는 목표 구조에 포함하지 않는다.

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

- 목표 구조의 `navigation/`에는 Root Stack, Tab Navigator와 각 탭의 Stack Navigator가 함께 위치한다.
- Root Stack은 인증 흐름과 Main Tab을 분리하고, 각 하단 탭은 전용 Stack에서 상세 화면을 구성한다.
- 탭 루트 화면은 해당 탭 Stack의 루트이며 Root Stack에 같은 화면을 중복 등록하지 않는 구조다.
