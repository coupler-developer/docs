# 기술 부채 정리 (2026-04-02)

## 문서 역할

- 역할: `부채`
- 문서 종류: `technical-debt`
- 충돌 시 우선 문서: 각 항목이 참조하는 규범 문서
- 기준 성격: `as-is`

## 목적

- 현재 남아 있는 구조적 문제와 운영 리스크를 우선순위와 근거 기준으로 관리한다.

## 범위

- coupler-mobile-app
- coupler-admin-web
- coupler-api

---

## 1) API 전송 포맷 일관성 부족 `P1` `M`

현상

- 일부 요청이 URL-encoded 기반으로 전송됨.
- 배열/리스트는 문자열 포맷에 의존하는 구간이 존재함.
- 일부 API 스펙은 배열 전송을 전제로 정의됨.
- 이미지/리스트 데이터는 배열/문자열을 모두 처리하는 방어 로직이 일부 존재함.

영향

- 클라/서버 포맷 불일치 위험.
- 확장/디버깅 비용 증가.

액션 후보

- JSON 전송으로 통일.
- 또는 URL-encoded에서 배열 인코딩 규칙을 명확히 정의.

---

## 2) 레거시 클래스 컴포넌트 잔존 `P2` `L`

현상

- 클래스 컴포넌트와 Hooks가 혼재.
- 구식 라이프사이클 사용 구간 존재.

영향

- 유지보수 비용 증가.
- 리팩터링/테스트 난이도 상승.

액션 후보

- 신규/수정 화면부터 Hooks 전환.
- 의존성 낮은 화면부터 순차 전환.

---

## 3) Deprecated 의존성 존재 `P1` `M`

현상

- 일부 패키지에서 deprecated 표기 및 보안 안내가 존재함.

영향

- 업그레이드 비용 증가.
- 보안/유지보수 리스크.

액션 후보

- 상위 패키지 의존성부터 정리 후 대체/업그레이드 계획 수립.

---

## 4) 에러 처리/로깅 공백 `P1` `S`

현상

- 빈 catch 등 조용한 실패가 존재.

영향

- 문제 재현/원인 추적이 어려움.

액션 후보

- 공통 에러 핸들러와 로깅 정책 적용.

---

## 5) 불필요한 normalize / fallback 로직 정리 `P2` `M`

현상

- API 응답 파싱 시 불필요한 normalize 함수가 산재.
- UI 컴포넌트 props 기본값에 과도한 fallback 처리.
- 스토어/상태 초기화 구간에서 방어 코드 남용.
- 과도한 optional chaining(`?.`)과 nullish coalescing(`??`) 사용으로 실제 문제를 숨기는 구간 존재.

영향

- 코드 가독성 저하 및 디버깅 난이도 상승.
- 실제 null/undefined가 발생하면 안 되는 구간에서도 방어 코드가 있어 버그 원인 파악이 어려움.

액션 후보

- normalize/fallback 함수 중 실질적으로 사용되지 않거나 중복인 것 정리.
- 타입 기준 확정 이후 nullable 여부를 판별하여 불필요한 `?.` / `??` 제거.

---

## 6) 다국어(i18n) 키 정합성 및 JSON 구조 정리 `P1` `M`

현상

- 일부 화면에서 없는 키/오타 키 사용.
- 다국어 JSON 파일 간 키 불일치(누락, 오타, 미사용 키 잔존).
- 코드에서 사용하는 키와 JSON에 정의된 키가 정확히 매칭되지 않는 구간 존재.
- 새로 추가된 화면/기능의 번역 키가 누락된 채 배포되는 경우 발생.

영향

- 텍스트 누락/표시 오류 발생.
- 특정 언어에서 텍스트 미노출 또는 키 원문 그대로 노출.
- 다국어 유지보수 비용 증가.

액션 후보

- 전체 다국어 파일 간 키 동기화 점검 및 정리(누락/미사용/오타 일괄 정리).
- 코드에서 사용하는 키와 JSON 정의 키의 정합성 자동 검증 도입.
- 신규 키 추가 시 모든 언어 파일에 동시 반영하는 프로세스 확립.

---

## 7) 회원가입(Signup) 리팩토링 후속 안정화 `P2` `M`

현상

- API 가입 경로는 유스케이스 기반 오케스트레이션 구조로 1차 분리 완료됐다.
- 로그인/회원정보 일부 경로도 동일 패턴으로 분리되어 컨트롤러 책임이 축소됐다.
- 다만 계약 문서/Swagger/운영 가이드가 최신 구조를 100% 반영하지 못한 문서 드리프트가 일부 남아 있다.
- 통합 테스트가 보강됐지만, 가입 → 반려 → 재제출 같은 장거리 시나리오 E2E 커버리지는 추가 확장이 필요하다.

영향

- 구조 개선 효과가 문서/검증 체계에 반영되지 않으면 온보딩/리뷰 비용이 다시 증가한다.
- 경계(입력검증/저장/응답매핑) 문서가 불명확하면 후속 변경 시 회귀 가능성이 커진다.

액션 후보

- 가입 유스케이스 경계(입력검증, 저장 트랜잭션, 응답 매핑)를 문서 기준으로 고정한다.
- `signup-response-contract.md`와 Swagger를 정기 동기화하고 계약 diff 검증 자동화를 운영한다.
- 가입 핵심 시나리오(신규가입/반려수정/재제출/성공 라우팅) E2E를 확장한다.

---

## 8) 심사 상태 SoT/호환 스냅샷 이중 경로 잔존 `P1` `M`

현상

- 심사 상태의 판정 기준은 `v_member_review_status`인데, 일부 코드/문서에 `t_member_review_stage_snapshot` 직접 의존 흔적이 남아 있음.
- `t_member_review_stage_snapshot`은 동기화/호환 스냅샷인데 SoT처럼 해석될 여지가 있음.

영향

- 상태 판정 경계가 모호해져 회귀 시 원인 추적 비용 증가.
- 신규 코드가 잘못된 기준(`t_member_review_stage_snapshot` 직접 조회)으로 확산될 위험.

액션 후보

- API 읽기 경로를 `v_member_review_status` 단일 기준으로 고정.
- `t_member_review_stage_snapshot`은 sync/호환 용도로만 제한하고, 신규 비즈니스 판정 코드에서 사용 금지.
- 문서(FSM/Flow/Swagger 설명)에서 "원천 저장소"와 "판정/출력 기준"을 분리 표기하고, 심사 판정 기준은 `v_member_review_status`로 고정.

---

## 9) 설정 승인 푸시 메시지 계약 점진 이관 필요 `P2` `S`

현상

- 설정 수정 승인 메시지 오분기를 막기 위해 서버에 `setting_approval_kind` 보조 계약을 추가했다.
- 현재는 기존 FCM 타입(`5/6/72/75`)은 유지하고, 타입은 라우팅/저장에 쓰고 메시지 문구만 `setting_approval_kind`로 세분화하는 과도기 구조다.
- 가입 승인(`SIGNUP_*`)과 설정 승인(`SETTING_*`)의 경계는 `pending_save` 경로에서 보강됐지만, 최종적으로는 모든 발송 경로가 같은 승인 도메인 계약을 써야 한다.
- locale도 flat key(`push.setting_profile_ok`)와 세분 키(`push.setting_approval.*`)가 함께 존재하는 상태다.

영향

- 현재 구조는 모바일 호환성과 운영 안정성을 우선한 안전한 브리지지만, 장기적으로는 타입/문구/운영 집계 해석이 이원화될 수 있다.
- 다른 발송 경로가 동일한 보조 계약 없이 기존 flat key만 사용하면 설정 승인 문구가 다시 뭉뚱그려지거나 회귀할 수 있다.
- locale 키 체계가 혼재된 채로 남으면 신규 메시지 추가 시 중복 키와 fallback 의존이 증가한다.

액션 후보

- 설정 승인 메시지의 단일 계약을 `승인 도메인 요약 + FCM 타입` 조합으로 고정하고, 신규 발송 경로는 동일 helper를 사용하도록 제한한다.
- `pending_save`에 먼저 적용한 `setting_approval_kind` 구조를 다른 설정 승인 발송 경로로 점진 확장한다.
- 운영/모바일 호환성이 확보되면 flat locale key 의존을 줄이고 `push.setting_approval.*` 중심으로 수렴한다.
- 정책/아키텍처 문서에 “가입 승인 타입은 가입 완료 전용, 설정 승인은 setting family + approval kind 조합” 원칙을 반영한다.
- controller 단위 통합 검증을 추가해 `type`, `content`, `t_alarm.type` 조합이 기대값과 일치하는지 고정한다.

---

## 10) 파일 구조 정책 반영 미흡 (TO-BE 전환 필요) `P1` `L`

현상

- `coupler-mobile-app`은 to-be 아키텍처(`architecture/mobile-app-to-be.md`) 기준과 달리 `fragment` 디렉터리 및 `*Fragment*` 파일이 다수 잔존함.
- 모바일 앱 screens 하위에 화면 폴더 중첩 구조가 남아 있어, "도메인 바로 아래 `*Screen`/동일 접두 파일 배치" 원칙과 차이가 있음.
- 일부 화면은 `*StepScreen`처럼 Step과 Screen 개념이 섞인 라우팅 대상을 유지하고 있어, "Step은 라우터 등록 금지" 원칙과 차이가 있음.
- 테스트 경로 기준은 `coupler-api`의 `__tests__/`, `coupler-admin-web`/`coupler-mobile-app`의 `src/__tests__/`로 현재 문서화되어 있으나, 구조 정책 문서 전반에서 as-is/to-be 경계를 더 선명하게 유지할 필요가 있음.

영향

- 신규 작업자가 구조 기준을 오해해 폴더/파일 패턴이 더 분산될 수 있음.
- 코드 탐색과 리팩터링 범위 파악 비용이 증가함.
- 정책 문서 신뢰도가 낮아져 리뷰 시 합의 비용이 커짐.

액션 후보

- 정책 문서는 "현재(as-is)"와 "목표(to-be)"를 분리 표기해 즉시 드리프트를 제거한다.
- `coupler-mobile-app`은 `fragment`/중첩 화면 폴더/`*StepScreen` 라우트를 단계적으로 `*Step*`/`*Section*` 및 도메인 평탄 구조로 이전한다.
- 구조 정책 문서에는 "현재 운영 기준"과 "목표 구조"를 같은 문단에서 섞지 않고, 필요한 경우 전환 조건과 완료 기준을 함께 적는다.
- 워크스페이스 루트 산출물(SQL dump, 임시 파일) 보관 위치를 별도 아카이브 디렉터리로 분리해 루트 구조를 단순화한다.

---

## 11) Admin jQuery 의존성 제거 (React 단일 렌더 경로 전환) `P1` `L`

현상

- `coupler-admin-web`에 `jquery` import가 다수 잔존한다(현재 기준 47개).
- `DataTables`와 `$.fn.*` 확장(`image_lightbox`, `nickname_label`, `user_status` 등)에 의존하는 화면이 넓게 분포한다.
- React 상태/렌더링과 jQuery 직접 DOM 조작이 혼재되어 단일 렌더 경로가 깨져 있다.

영향

- TypeScript 타입 안정성이 저하되고 전환 품질 판정이 어려워진다.
- React 렌더링과 jQuery DOM 조작 간 상태 불일치로 회귀 리스크가 증가한다.
- 테스트/디버깅/리팩터링 비용이 상승한다.

액션 후보

- 테이블 계층을 React 기반(`TanStack Table` 또는 `AG Grid`)으로 단계 전환한다.
- `$.fn.*` 커스텀 확장을 React 컴포넌트/유틸 함수로 치환한다.
- DOM 직접 접근(`$()`) 로직을 `state + props + ref` 패턴으로 이전한다.
- 프로토타입 확장 로직을 순수 유틸 함수로 분리한다.
- 화면 단위 전환 완료 후 `jquery`, `datatables.net*` 의존성을 제거한다.

---

## 12) Admin Color Token 단일화 미흡 (디자인 가이드 불일치) `P2` `M`

현상

- `coupler-admin-web`에 브랜드 컬러 가이드와 별개인 레거시 테마 변수(blue/teal 중심)가 기본값으로 남아 있다.
- SCSS/TSX/jQuery 렌더 경로에 하드코딩 HEX 및 inline color 지정이 혼재되어 색상 SoT가 없다.
- 동일 의미(Primary, Status, Text muted)를 화면마다 다른 색으로 표현하는 구간이 존재한다.

영향

- 화면 간 시각 일관성이 떨어지고 브랜드 톤 통제가 어렵다.
- 색상 변경 시 영향 범위 추적이 어려워 유지보수 비용이 증가한다.
- 상태색/텍스트 대비 기준이 분산되어 접근성 품질 편차가 커진다.

액션 후보

- Admin 전용 디자인 토큰(`color.text.*`, `color.bg.*`, `color.border.*`, `color.status.*`, `color.brand.*`)을 단일 파일로 정의한다.
- 기존 SCSS 변수와 inline 색상 사용처를 토큰 참조로 단계 치환하고 하드코딩 HEX를 제거한다.
- `coupler-admin-web`에 `no-hex-color`/`no-inline-style-color` 계열 lint 규칙(또는 정적 점검 스크립트)을 도입해 재유입을 차단한다.
- 공통 컴포넌트(버튼, 배지, 테이블 상태 라벨)부터 우선 전환하고 화면별 diff 스냅샷으로 회귀를 검증한다.

완료 기준

- 측정 범위는 `coupler-admin-web/src` 중 1st-party 코드로 고정하며, 생성/벤더 자산(`src/assets/css/**`)은 제외한다.
- 측정 범위에서 하드코딩 HEX 0건을 충족한다.
- 측정 범위에서 inline color 0건을 충족한다.
- 측정 범위의 색상 속성 참조를 토큰으로 100% 통일한다.

---

## 13) ritzy -> coupler 네이밍 전환 잔존 `P3` `M`

현상

- 워크스페이스와 서비스 기본 명칭은 `coupler`로 정리됐지만, 일부 레포/산출물/식별자에 `ritzy` 명칭이 남아 있다.
- 실제 운영 식별자(SKU, 외부 도메인, 과거 레포명)와 내부 코드 명칭이 혼재되어 문맥에 따라 허용 범위가 다르다.

영향

- 신규 작업자가 "어디까지 바꿔야 하는지"를 추측하게 되어 네이밍 기준이 흔들릴 수 있다.
- 규범 문서에 transition 메모를 직접 남기면 as-is SoT와 장기 전환 메모의 경계가 흐려진다.

액션 후보

- 규범 문서에서는 현재 SoT만 유지하고, 네이밍 전환 잔존은 기술 부채로 관리한다.
- 변경분에 한해 신규 코드/문서 명칭은 `coupler`로 고정하고, 외부 계약상 변경 불가 식별자(SKU, 도메인, 외부 시스템 키)는 예외 근거를 함께 남긴다.
- 잔존 `ritzy` 사용처는 "운영 식별자", "레거시 파일/패키지명", "문서 표현"으로 분류해 순차 정리한다.

---

## 14) Mobile patch-package 의존 제거 가능성 검증 `P2` `S`

현상

- `coupler-mobile-app`은 `postinstall: patch-package`에 의존하고 있다.
- 현재 기준 patch는 `@react-native-google-signin/google-signin@13.3.1` 1건이며, `TurboModuleRegistry.getEnforcing` 실패 시 `NativeModules.RNGoogleSignin` fallback으로 우회한다.
- 패치 필요 조건과 제거 조건이 문서화되어 있지 않아, React Native/라이브러리 업그레이드 시 계속 유지해야 하는지 판단 기준이 불명확하다.

영향

- `node_modules` 직접 patch는 업스트림 버전 변경 시 충돌하거나 조용히 무효화될 수 있어 설치/빌드 재현성이 떨어진다.
- Google Sign-In 연동 장애가 생기면 원인이 "native linking 문제"인지 "patch drift"인지 분리 추적하기 어렵다.
- patch-package 잔존은 React Native/서드파티 의존성 업그레이드 비용을 높이고, 신규 작업자 온보딩 시 암묵 지식을 요구한다.

액션 후보

- `@react-native-google-signin/google-signin` 최신 호환 버전에서 동일 patch가 불필요한지 우선 검증한다.
- `RNGoogleSignin` 등록 경로(TurboModule, legacy NativeModule, iOS/Android linking, Pod/Gradle 설정)를 점검해 근본 원인을 분리한다.
- patch 제거가 가능하면 `patch-package`, `postinstall`, `patches/`를 함께 제거하고 회귀 검증 절차를 문서화한다.
- 즉시 제거가 불가하면 "왜 필요한지", "어떤 버전 범위에서 필요한지", "재검증 시점"을 문서/추적 이슈로 남긴다.

---

## 15) iOS SDK / Xcode 업로드 기준 선제 업그레이드 필요 `P1` `M`

현상

- App Store Connect가 `COUPLER(커플러)` iOS 배포본(Version `2.0.1`, Build `87`)에 대해 SDK 버전 경고를 발송했다.
- 현재 바이너리는 iOS `18.2` SDK로 빌드됐고, 안내 기준상 `2026-04-28`부터는 iOS/iPadOS 앱 업로드 및 제출에 iOS `26` SDK 이상, Xcode `26` 이상이 필요하다.
- 이번 전달은 성공했지만, 차기 배포부터는 업로드 단계에서 차단될 가능성이 있다.

영향

- 마감 직전까지 Xcode/SDK 업그레이드를 미루면 App Store 배포가 막혀 긴급 대응이 필요해진다.
- React Native, CocoaPods, 서드파티 iOS SDK, CI/macOS 이미지가 새 Xcode 기준과 충돌할 수 있어 릴리스 리드타임이 증가한다.
- 로컬 개발 환경과 CI 환경의 Xcode 버전이 어긋나면 "로컬 성공 / CI 실패" 유형의 배포 회귀가 발생할 수 있다.

액션 후보

- `coupler-mobile-app`의 iOS 빌드 체인(Xcode, iOS SDK, CocoaPods, Ruby/Bundler, fastlane 또는 CI runner)을 Xcode `26` 기준으로 점검한다.
- React Native 및 주요 네이티브 의존성의 Xcode `26` / iOS `26` SDK 호환성 매트릭스를 확인하고 선행 업그레이드 순서를 문서화한다.
- App Store 제출 전 체크리스트에 "현재 Xcode/SDK 기준 충족 여부"를 추가하고, CI에서 빌드 도구 버전을 고정 검증한다.
- 실제 제출 마감 전에 TestFlight 업로드 리허설을 수행해 archive, signing, upload 단계 회귀를 사전 확인한다.

---

## 16) 라운지 댓글 수 레거시 집계 의미 분리 미완료 `P2` `M`

현상

- 라운지 화면 표시 `cmt_cnt`는 로그인 사용자가 실제로 볼 수 있는 댓글 수로 정리됐다.
- 하지만 DB에는 여전히 `t_lounge.cmt_cnt` 집계 컬럼이 남아 있고, 댓글 추가 시 증가시키는 경로가 존재한다.
- 현재 API 응답은 `t_lounge.cmt_cnt`를 그대로 쓰지 않고, `t_lounge_cmt` + `t_member_hide(type='LOUNGE')` + 댓글 상태 기준으로 visible count를 재계산해 덮어쓴다.
- 댓글 이벤트 payload도 화면에서 사용하지 않는 `count` 필드를 계속 포함해, "DB 저장 집계값", "API 표시값", "이벤트 payload 값"의 의미가 완전히 분리되지 않았다.

영향

- 신규 작업자가 `t_lounge.cmt_cnt`를 화면 댓글 수 SoT로 오해할 수 있다.
- 댓글 추가/삭제/숨김/차단 관련 후속 변경 시 레거시 집계값과 표시값을 다시 섞을 위험이 있다.
- 이벤트/문서/DB 컬럼의 의미가 다르면 회귀 원인 추적 비용이 증가한다.

액션 후보

- `t_lounge.cmt_cnt`를 "표시값 아님"으로 유지할지, "운영용 집계 캐시"로 명시할지 먼저 결정한다.
- 화면/API 계약은 계속 visible count 단일 기준으로 유지하고, `t_lounge.cmt_cnt` 직접 사용처가 재유입되지 않도록 점검한다.
- `LOUNGE_COMMENT` 이벤트 payload의 `count` 필드가 더 이상 필요 없으면 제거하고 `target` 중심 invalidation 계약으로 단순화한다.
- `t_lounge.cmt_cnt`를 계속 유지할 경우 증가/감소 규칙과 사용 목적을 문서/코드에서 동일하게 명시하고, 필요 없으면 제거 계획을 별도 추적한다.

---

## 17) 미팅 회비 `0=미정` 계약 불일치 `P2` `S`

현상

- `MEET_MONEY` 상수, Swagger, DB 주석은 `0`을 `미정`으로 정의한다.
- `coupler-mobile-app`의 미팅 생성 화면은 미선택 내부값으로 `-1`을 쓰고, `money > -1`이면 제출 가능 상태로 본다.
- `coupler-api`의 앱 미팅 생성 경로는 truthy 검증(`!money`)을 사용해 `money=0`을 빈값으로 거부한다.
- `coupler-admin-web`의 미팅 편집 화면은 값이 없을 때 `0`을 기본 선택값으로 사용한다.

영향

- 신규 작업자가 `0`을 유효 저장값으로 봐야 하는지, 생성 API에서 금지해야 하는지 판단하기 어렵다.
- Mobile/Admin/API가 같은 회비 옵션을 다르게 처리할 수 있어 회귀 가능성이 있다.

액션 후보

- 미팅 회비 계약을 먼저 확정한다: `0=미정`을 유효 저장값으로 유지할지, 생성 시 금지할지 결정한다.
- 계약 확정 전에는 미팅 생성/편집 로직을 기능 변경하지 않고 현행 동작을 보존한다.
- 계약 확정 후 API validation, Admin 기본값, Mobile 제출 조건, Swagger, 본 문서를 같은 변경 단위로 동기화한다.
