# TypeScript 전환/운영 규칙 (코드 레포 공통, docs 제외)

## 스코프

- 이 문서는 워크스페이스 내 코드 레포에 대한 공통 규칙이다.
- `docs/` 레포에는 적용하지 않는다.

## 목적

- TypeScript 전환을 진행하면서 코드 품질을 일관되게 유지한다.
- CI에서 “타입/컴파일 진단”과 “코드 규칙/스타일”을 분리해서 안정적으로 게이트한다.

## 핵심 결론 (SoT)

- SoT(Source of Truth): 해당 영역의 최종 판정 기준 도구
- 타입/컴파일 진단(`typecheck`)의 SoT는 `tsc`다.
- 코드 규칙/스타일(`lint`)의 SoT는 `ESLint`다.
- 즉, `ESLint`만으로 `typecheck`를 대체할 수 없고, `tsc`만으로 `lint` 룰을 대체할 수 없다.

## 공통 tsconfig 규칙

- `allowJs: false`는 무조건 고정한다.
  - JS 파일을 TypeScript 프로그램에 포함시켜 `typecheck`하지 않는다.
  - JS가 남아있는 구간은 `.js/.jsx`를 `.ts/.tsx`로 전환하면서 범위를 늘린다.
  - 따라서 JS 구간의 문법/규칙 검증은 `ESLint` 단계에서 담당한다.

## CI/로컬 실행 규칙

- 각 코드 레포는 아래 스크립트를 제공해야 한다(`package.json`).
  - `typecheck`: `tsc --noEmit` 기반
  - `lint`: `ESLint` 기반
- 실행은 “해당 레포”에서 레포의 패키지 매니저에 맞게 수행한다.
  - 예: `yarn typecheck`, `yarn lint`
  - 예: `npm run typecheck`, `npm run lint`

## 전환 우선순위 (권장)

1. 경계부터 고정
   - 외부 입력(API/DB/ENV/스토리지)을 받는 경계에서 `validate/normalize`하고 내부 모델은 엄격하게 유지한다.
   - Optional(`?`)은 최소화한다(세부 기준은 [엔지니어링 가드레일](engineering-guardrails.md)).

2. 순수 로직부터 전환
   - `utils/`, `lib/`, `helper/` 같은 순수 모듈을 먼저 `.ts`로 전환한다.

3. 프레임워크 레이어 전환
   - API 레이어(controllers/routes) 또는 UI 레이어(components/screens)를 점진적으로 `.ts/.tsx`로 전환한다.

4. 외부 모듈 타입 보완
   - 타입 미제공 라이브러리는 `types/*.d.ts`로 보완한다.
   - 필요 시 `patch-package`로 타입을 보강한다.

## 완료 기준 (공통)

- `typecheck` 통과
- `lint` 통과
- 기능 동작 유지(기존 기능 삭제/우회 금지)
