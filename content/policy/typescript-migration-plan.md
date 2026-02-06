# TypeScript 전환 계획 (coupler-mobile-app)

## 목적

- React Native 앱의 TypeScript 전환 범위와 우선순위를 문서화한다.


## 현황 요약

- `tsconfig.json`이 존재하며 `@react-native/typescript-config`를 사용한다.
- `typescript`, `@types/*`가 `devDependencies`에 포함되어 있다.
- 일부 `.ts/.tsx` 파일이 이미 존재한다.
- `src` 내 대부분은 `.js/.jsx`로 유지 중이다.


## 기본 원칙 및 제약

- 승인 후에만 실제 코드 변경을 진행한다.
- 기존 기능 삭제 금지, 필수 코드만 추가.
- 네이밍 가이드 준수(`*Screen.js`, `*Step*.js`, `components/` 경로 규칙 등).
- 플랫폼 고려(ios, android 레이아웃).
- 영어 단어는 알파벳 표기, 명시적이고 직관적인 파일/코드 명칭 사용.
- 변경분부터 `coupler` 명칭 사용(기존 전체 개명은 하지 않음).
- TSX 마이그레이션 기준은 `AGENTS.md`의 to-be 아키텍처가 소스 오브 트루스다.
- 세부 규칙은 `AGENTS.md`를 참조한다.
- `AGENTS.md`와 본 문서가 충돌하면, 우선 `AGENTS.md`에 맞추고 본 문서를 갱신한다.


## 타입/정규화 원칙

- API 응답은 유연하게 받고, 내부 모델은 엄격하게 유지한다.
- `GlobalState`는 경계에서 normalize 후 내부에서는 단일 primitive 타입을 사용한다.
- `setMyInfo`, `setSetting`에서 기본값 병합 + 타입 변환을 수행한다.
- **Optional (`?`) 사용 최소화**: API에서 반드시 내려주는 필드는 optional로 표시하지 않는다. 실제로 값이 없을 수 있는 경우에만 `?`를 사용한다.

  - 예: `id: number` (항상 존재) vs `nickname?: string` (선택적)


## 전환 범위

- 전체 전환을 목표로 한다.
- 우선순위는 leaf 컴포넌트부터 시작한다.


## 단계/우선순위

1. 현황 점검 및 범위 확정

   - JS/TS 파일 분포 확인
   - screens 도메인 맵 및 라우팅 대상 목록 작성
   - 전환 방식(점진/일괄) 결정
   - 완료 기준: 도메인별 전환 목록과 우선순위 합의
2. 기반 설정 및 정규화

   - `tsconfig` 옵션 정리(`allowJs`, `paths`, `skipLibCheck` 등)
   - 공통 타입 선언(`types/*.d.ts`) 및 자산 모듈 선언 정비
   - `GlobalState` 경계 normalize 원칙 확정(`setMyInfo`, `setSetting`)
   - 완료 기준: 기준 타입/정규화 문서 및 기본 타입 정의 반영
3. 핵심 로직 전환

   - `constants/`, `utils/`, `hooks/`, `stores/` 순으로 `.js` → `.ts`
   - 공통 타입(`types/`) 정리
   - 완료 기준: 핵심 로직 타입 오류 0건
4. UI leaf 전환

   - leaf 컴포넌트부터 `.jsx` → `.tsx`
   - `fragment` 제거 및 `*Section`/`*Panel` 리네이밍
   - 완료 기준: leaf 레벨 타입 오류 0건
5. screens/steps 전환

   - 도메인별 `*Screen`/`*Step` 전환 및 라우팅 정리
   - `screens/shared`는 라우팅 전용 유지
   - 완료 기준: 도메인 단위 전환 완료 + 화면 진입 기본 동작 확인
6. 외부 모듈 타입 보완 및 강화

   - 타입 미제공 라이브러리용 `d.ts` 추가
   - 필요 시 `patch-package`로 타입 보강
   - `noImplicitAny` 등 옵션 단계적 강화
   - 완료 기준: lint/test 통과 + 문서 업데이트


## 산출물

- 전환 체크리스트 문서
- 공통 타입 선언 파일
- 업데이트된 `tsconfig` 및 린트 규칙
- 전환된 소스 파일(.ts/.tsx)


## 확인 필요 사항

- leaf 컴포넌트 정의 기준 확정(예: props만 받는 dumb component 등)
- 기존 JS 허용 여부(장기적으로 `allowJs` 유지 여부)
- 테스트 범위 확대 여부(`__tests__`/`@testing-library/react-native` 도입)
