# Admin Color Token 기술 부채 (2026-03-05)

## 메타

- 범위: `coupler-admin-web`
- 우선순위: `P2`
- 규모: `M`
- 원문 링크: [기술 부채 정리](technical-debt.md)

## 현상

- `coupler-admin-web`에 브랜드 컬러 가이드와 별개인 레거시 테마 변수(blue/teal 중심)가 기본값으로 남아 있다.
- SCSS/TSX/jQuery 렌더 경로에 하드코딩 HEX 및 inline color 지정이 혼재되어 색상 SoT가 없다.
- 동일 의미(Primary, Status, Text muted)를 화면마다 다른 색으로 표현하는 구간이 존재한다.

## 영향

- 화면 간 시각 일관성이 떨어지고 브랜드 톤 통제가 어렵다.
- 색상 변경 시 영향 범위 추적이 어려워 유지보수 비용이 증가한다.
- 상태색/텍스트 대비 기준이 분산되어 접근성 품질 편차가 커진다.

## 액션 후보

- Admin 전용 디자인 토큰(`color.text.*`, `color.bg.*`, `color.border.*`, `color.status.*`, `color.brand.*`)을 단일 파일로 정의한다.
- 기존 SCSS 변수와 inline 색상 사용처를 토큰 참조로 단계 치환하고 하드코딩 HEX를 제거한다.
- `coupler-admin-web`에 `no-hex-color`/`no-inline-style-color` 계열 lint 규칙(또는 정적 점검 스크립트)을 도입해 재유입을 차단한다.
- 공통 컴포넌트(버튼, 배지, 테이블 상태 라벨)부터 우선 전환하고 화면별 diff 스냅샷으로 회귀를 검증한다.

## 완료 기준

- 측정 범위는 `coupler-admin-web/src` 중 1st-party 코드로 고정하며, 생성/벤더 자산(`src/assets/css/**`)은 제외한다.
- 측정 범위에서 하드코딩 HEX 0건을 충족한다.
- 측정 범위에서 inline color 0건을 충족한다.
- 측정 범위의 색상 속성 참조를 토큰으로 100% 통일한다.
