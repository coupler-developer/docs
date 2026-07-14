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

## 1) API URL-encoded 호환 parser 제거 대기 `P1` `S`

현상

- Mobile canonical request는 body 없는 `GET`/`DELETE`, JSON `POST`/`PUT`, upload multipart로 전환 중이다.
- Admin canonical request와 Swagger app request body도 JSON/multipart 기준으로 수렴한다.
- 현재 published contracts package는 response/error runtime과 success DTO type을 배포하지만 public request DTO type은 아직 노출하지 않는다. Type-only request DTO 생성/소비 전환은 이 항목이 아니라 `API public request DTO 생성/소비 전환 미완료`에서 추적한다.
- API 프로세스에는 현재 운영 Mobile build `100`의 URL-encoded 요청을 수용하기 위한 `bodyParser.urlencoded(...)` parser가 남아 있다.
- [2.2.5 릴리스 기록](../releases/v2.2.5.md)의 `min_version=100` 근거는 build `100` 자체를 차단하지 않으므로 parser 제거 조건으로 사용할 수 없다.

영향

- canonical 계약 밖 URL-encoded 요청도 한시적으로 수용하므로 API 입력 경계가 완전히 폐쇄되지 않는다.
- 운영 legacy traffic 근거 없이 parser를 제거하면 build `100` 사용자의 write API가 파싱되지 않을 수 있다.

액션 후보

- Mobile JSON transport 변경을 Store 또는 NextPush Production에 배포한다.
- 마지막 URL-encoded build보다 높은 `min_version`을 적용하고 `force_update=2`를 확인한다.
- URL-encoded 요청 0건의 검증 기간, 로그 위치, 비교 ref를 릴리즈 기록에 남긴다.
- 위 조건 충족 후 별도 API cutover PR에서 `bodyParser.urlencoded(...)`를 제거하고 JSON/multipart 핵심 요청을 재검증한다.

호환 예외

- owner: API/Mobile release owner
- 제거 조건: Mobile JSON transport 운영 배포 + 마지막 URL-encoded build 강제 차단 + URL-encoded 요청 0건 확인
- 목표 시점: 위 제거 조건 충족 직후 별도 API cutover PR
- 추적 위치: 이 기술 부채 항목과 해당 API contract cutover 릴리즈 기록
- 검증 근거: Mobile request transport 테스트, API Swagger 계약 테스트, 운영 `min_version/force_update` 및 request content-type 로그

완료 기준

- 운영 URL-encoded 요청 0건이 검증 범위/기간/로그와 함께 확인된다.
- `coupler-api/app.ts`에서 URL-encoded parser가 제거된다.
- Mobile JSON/multipart request와 API 핵심 write/upload 요청 검증이 통과한다.

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

## 11) Admin Color Token 단일화 미흡 (디자인 가이드 불일치) `P2` `M`

현상

- `coupler-admin-web`에 브랜드 컬러 가이드와 별개인 레거시 테마 변수(blue/teal 중심)가 기본값으로 남아 있다.
- SCSS/TSX 렌더 경로에 하드코딩 HEX 및 inline color 지정이 혼재되어 색상 SoT가 없다.
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

## 12) ritzy -> coupler 네이밍/운영 잔존 정리 `P3` `M`

현상

- 워크스페이스와 서비스 기본 명칭은 `coupler`로 정리됐지만, 일부 레포/산출물/식별자에 `ritzy` 명칭이 남아 있다.
- 실제 운영 식별자(SKU, 외부 도메인, 과거 레포명)와 내부 코드 명칭이 혼재되어 문맥에 따라 허용 범위가 다르다.
- 운영 RDS에는 현재 서비스 DB인 `coupler`와 별도로 과거 스키마 `ritzy`가 잔존한다.
- 2026-06-07 운영 read-only 조사 기준 `ritzy` 스키마는 약 30.86MB이며, 최근 핵심 활동 시각은 2026-03-22 이전으로 확인됐다.
- 운영 RDS 정리 후보는 `ritzy` 스키마 전체, `coupler`의 라운지 정리 백업 테이블 4개, 회원가입 메시지 백업 테이블 3개다.
- 정리 SQL 초안은 워크스페이스 로컬 산출물로만 준비되어 있으며, 현재 `docs` 또는 서비스 레포의 Git 추적 대상이 아니라 공유 실행 근거로 사용할 수 없다.

영향

- 신규 작업자가 "어디까지 바꿔야 하는지"를 추측하게 되어 네이밍 기준이 흔들릴 수 있다.
- 규범 문서에 transition 메모를 직접 남기면 as-is SoT와 장기 전환 메모의 경계가 흐려진다.
- 운영 DB에 과거 스키마와 일회성 백업 테이블이 남아 있어, 장애 대응/조회/마이그레이션 검토 시 실제 사용 객체와 보관 객체를 구분하는 비용이 발생한다.
- 다만 `ritzy` 스키마 용량은 약 30.86MB라서, RDS allocated storage 과금 구조상 삭제해도 월 비용 절감 효과는 거의 없다고 판단한다.

액션 후보

- 규범 문서에서는 현재 SoT만 유지하고, 네이밍 전환 잔존은 기술 부채로 관리한다.
- 변경분에 한해 신규 코드/문서 명칭은 `coupler`로 고정하고, 외부 계약상 변경 불가 식별자(SKU, 도메인, 외부 시스템 키)는 예외 근거를 함께 남긴다.
- 잔존 `ritzy` 사용처는 "운영 식별자", "레거시 파일/패키지명", "문서 표현"으로 분류해 순차 정리한다.
- 운영 RDS 삭제는 비용절감 목적이면 진행하지 않고, 운영 혼선 제거 목적일 때만 별도 승인 후 재개한다.
- 재개 시 삭제 SQL을 공유 가능한 PR/버전 관리 경로에 올리고 checksum을 확정한 뒤, DB Migration Gate 정책의 실행 검증 파이프라인을 처음부터 다시 따른다.
- 삭제 직전 RDS manual snapshot ID 또는 동등한 fresh all-schema dump 경로를 backup evidence로 남긴다.
- 확인 가능한 backup evidence가 없는 상태에서는 운영계 `DROP DATABASE ritzy` 또는 backup table `DROP`을 실행하지 않는다.

보류 상태

- 2026-06-08 기준 이번 정리는 실행하지 않는다.
- 보류 사유: 현재 서비스는 `coupler` 스키마 기준으로 안정 동작 중이고, `ritzy` 삭제만으로는 RDS 비용 절감 효과가 거의 없다.
- 재검토 트리거: 운영 혼선 발생, RDS major 정리 작업, 수동 스냅샷/rollback 증빙 확보, 또는 release contract/drop window 확보.

---

## 13) Mobile patch-package 의존 제거 가능성 검증 `P2` `S`

현상

- `coupler-mobile-app`은 `postinstall: patch-package`에 의존하고 있다.
- 현재 기준 patch는 2건이다.
    - `@react-native-google-signin/google-signin@13.3.1`: `TurboModuleRegistry.getEnforcing` 실패 시 `NativeModules.RNGoogleSignin` fallback으로 우회한다.
    - `react-native-image-picker@7.2.3`: iOS PHPicker 선택 직후 cropper modal을 여는 앱 흐름에서 PHPicker dismissal 완료 전 JS callback이 실행될 수 있어, dismiss completion 이후 callback이 실행되도록 보정한다.
- Google Sign-In patch는 필요 조건과 제거 조건이 문서화되어 있지 않아, React Native/라이브러리 업그레이드 시 계속 유지해야 하는지 판단 기준이 불명확하다.
- Image Picker patch는 upstream issue/PR(`react-native-image-picker` #2390, #2391, #2406)과 관련된 iOS PHPicker callback/dismiss race 계열 방어다. 현재 patch는 presentation dismiss 중복 cancel callback 방어와 PHPicker dismissal completion 이후 성공 callback 보장을 함께 포함한다. 다만 #2406은 single-shot callback 중심이고 PHPicker dismissal completion 대기는 포함하지 않아, 현재 최신 릴리스 기준 업그레이드만으로 제거 가능하다고 보기 어렵다.

영향

- `node_modules` 직접 patch는 업스트림 버전 변경 시 충돌하거나 조용히 무효화될 수 있어 설치/빌드 재현성이 떨어진다.
- Google Sign-In 연동 장애가 생기면 원인이 "native linking 문제"인지 "patch drift"인지 분리 추적하기 어렵다.
- Image Picker patch가 drift되면 iOS 갤러리 선택 후 crop 화면 미표시, 선택 결과 미반영, 또는 PHPicker callback 경합 문제가 재발할 수 있다.
- patch-package 잔존은 React Native/서드파티 의존성 업그레이드 비용을 높이고, 신규 작업자 온보딩 시 암묵 지식을 요구한다.

액션 후보

- `@react-native-google-signin/google-signin` 최신 호환 버전에서 동일 patch가 불필요한지 우선 검증한다.
- `RNGoogleSignin` 등록 경로(TurboModule, legacy NativeModule, iOS/Android linking, Pod/Gradle 설정)를 점검해 근본 원인을 분리한다.
- `react-native-image-picker` 업그레이드 시 PHPicker delegate가 dismiss completion 이후 callback을 보장하는지 확인한다.
- Image Picker patch 제거 전에는 iOS에서 갤러리 선택 → cropper 표시 → crop 완료 → 대상 슬롯 반영을 메인/얼굴/전신 슬롯별로 수동 검증한다.
- patch 제거가 가능하면 `patch-package`, `postinstall`, `patches/`를 함께 제거하고 회귀 검증 절차를 문서화한다.
- 즉시 제거가 불가하면 "왜 필요한지", "어떤 버전 범위에서 필요한지", "재검증 시점"을 문서/추적 이슈로 남긴다.

---

## 14) iOS SDK / Xcode 업로드 기준 선제 업그레이드 필요 `P1` `M`

현상

- App Store Connect가 `COUPLER(커플러)` iOS 배포본(Version `2.0.1`, Build `87`)에 대해 SDK 버전 경고를 발송했다.
- 현재 바이너리는 iOS `18.2` SDK로 빌드됐고, 안내 기준상 `2026-04-28`부터는 iOS/iPadOS 앱 업로드 및 제출에 iOS `26` SDK 이상, Xcode `26` 이상이 필요하다.
- 공식 출처 확인: [Apple Developer Upcoming Requirements](https://developer.apple.com/news/upcoming-requirements/), 확인일 `2026-06-09`.
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

## 15) 라운지 댓글 수 레거시 집계 의미 분리 미완료 `P2` `M`

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

## 16) 미팅 회비 `0=미정` 계약 불일치 `P2` `S`

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

---

## 17) Mobile Kakao 초대하기 전송 성공 판정 미분리 `P2` `M`

현상

- `coupler-mobile-app`의 앱 추천/초대하기 흐름은 Kakao Talk Share SDK로 공유 UI를 열고, 이후 `coupler-api`의 `/invite`로 추천 내용을 저장한다.
- Android/iOS 네이티브 브리지는 Kakao 공유 URL/Intent 생성 후 Kakao 앱을 열면 성공으로 처리하며, 사용자가 실제 친구/채팅방을 선택해 전송했는지는 앱으로 반환되지 않는다.
- 현재 코드에는 Kakao Talk Share 웹훅 수신 API, Kakao SDK `serverCallbackArgs`, 웹훅 인증/멱등 처리, 초대 상태의 `pending -> sent` 전이가 없다.
- 따라서 현행 "초대 완료"는 "우리 서버에 추천 내용 저장 완료" 의미이며, "카카오톡 실제 전송 완료" 의미로 해석하면 안 된다.

영향

- 실제 발송 성공을 운영 지표, 보상 지급, 장애 판정 기준으로 삼아야 하는 요구가 생기면 현재 저장 상태만으로는 정확히 판정할 수 없다.
- 사용자가 Kakao 화면에서 취소하거나 전송 전 이탈한 경우와 실제 전송 완료 케이스가 서버 상태만으로 구분되지 않을 수 있다.
- 리뷰 시 SDK 호출 성공을 전송 성공으로 오해하면 불필요한 서버 연동을 요구하거나, 반대로 필요한 전송 완료 계약을 누락할 위험이 있다.

액션 후보

- 현 요구사항이 앱 공유 UI 실행과 추천 내용 저장이면 현재 구조를 유지하고, 전송 성공 판정은 범위 밖으로 명시한다.
- 실제 전송 성공 확인이 요구되면 Kakao Developers의 카카오톡 공유 웹훅을 등록하고, SDK 호출 시 `serverCallbackArgs`에 `invite_id` 또는 nonce를 전달한다.
- `coupler-api`에 Kakao 웹훅 수신 엔드포인트를 추가해 `Authorization: KakaoAK ...`, `X-Kakao-Resource-ID`, payload를 검증하고 멱등 처리한다.
- 초대 저장 모델을 `pending -> sent`처럼 명확한 상태 전이로 분리하고, `/invite`가 곧바로 "전송 완료"를 의미하지 않도록 API/문구/운영 지표를 동기화한다.
- 리뷰 기준은 [코드 리뷰 정책](../policy/code-review-policy.md)의 "외부 공유/메시지 SDK 리뷰 기준"을 따른다.

완료 기준

- "추천 내용 저장 완료"와 "Kakao 실제 전송 완료" 중 어떤 의미를 제품/운영 기준으로 사용할지 문서와 UI 문구가 일치한다.
- 실제 전송 완료를 기준으로 삼는 경우, Kakao 웹훅 수신/검증/멱등 처리와 초대 상태 전이가 구현되어 있다.
- 실제 전송 완료를 기준으로 삼지 않는 경우, PR/작업 보고에 서버 웹훅 미도입 근거와 현행 성공 의미를 명시한다.

---

## 18) 클럽/클럽매니저 UI 용어 통일 미완료 `P2` `M`

현상

- 사용자 노출 용어 기준은 [서비스 용어 정책](../policy/service-terminology-policy.md)에서 `클럽`, `클럽매니저`로 고정됐다.
- 하지만 Mobile/Admin/문서의 기존 사용자 노출 문구에는 `매칭 매니저`, `매칭매니저`, `큐레이터`, `Ritzy`, `ritzy` 표현이 남아 있다.
- 내부 식별자(`manager_id`, `manager_name`, `curator_status`, `ritzy_comment`)는 UI 문구 전환만으로 변경하지 않는 예외 대상이라, "바꿀 문구"와 "유지할 식별자"를 구분해 추적해야 한다.

영향

- 회원에게 보이는 담당자/상담/추천 문구가 화면별로 달라져 `클럽매니저` 전환 의도가 흐려질 수 있다.
- 신규 작업자가 `큐레이터`, `매칭 매니저`, `클럽매니저`를 서로 다른 역할로 오해할 수 있다.
- 코드 식별자까지 함께 바꾸는 과잉 변경이 발생하면 DB/API 계약 변경 범위가 불필요하게 커질 수 있다.

액션 후보

- 사용자 노출 문자열만 먼저 분류하고, 담당자/상담/추천/심사 맥락은 `클럽매니저`로 치환한다.
- 브랜드/소속/커뮤니티 맥락의 `Ritzy`, `ritzy`, `매칭브랜드`는 `클럽`으로 치환한다.
- DB/API/DTO/endpoint 식별자는 [서비스 용어 정책](../policy/service-terminology-policy.md)의 예외 기준에 따라 유지한다.
- Mobile/Admin 문구 변경 후 주요 화면 스크린샷 또는 문자열 검색 결과로 잔존 사용자 노출 문구를 확인한다.

완료 기준

- 사용자 노출 문구에서 `매칭 매니저`, `매칭매니저`, `큐레이터`, `Ritzy`, `ritzy`가 제거됐다.
- 남아 있는 `manager_*`, `curator_*`, `ritzy_*`는 내부 식별자 또는 외부 식별자 예외로 분류돼 있다.
- [서비스 용어 정책](../policy/service-terminology-policy.md), Mobile, Admin의 사용자 노출 용어가 같은 결론을 가리킨다.

---

## 19) Mobile 앱 알림 팝업 레거시 키 마이그레이션 제거 예약 `P2` `S`

현상

- `coupler-mobile-app`의 앱 알림 팝업 최초 노출 여부가 전역 `APP_ALARM_POPUP` 키에서 member-scoped `APP_ALARM_ONBOARDING_POPUP_{memberId}` 키로 이관 중이다.
- `2.2.0` 강제 업데이트 동안 기존 사용자 로컬 `APP_ALARM_POPUP` 값을 새 onboarding 키로 옮기고 legacy key를 삭제하는 1회성 호환 경로가 필요하다.
- 이 호환 경로가 남아 있으면 `APP_ALARM_POPUP`이 legacy onboarding key인지 daily exposure key인지 오해될 수 있다.

영향

- 제거 시점 없이 legacy read/remove 경로가 계속 남으면 팝업 노출 정책을 다시 수정할 때 키 의미가 혼재될 수 있다.
- 신규 작업자가 `APP_ALARM_POPUP` legacy migration을 상시 정책 로직으로 오해할 수 있다.

액션 후보

- `2.2.0` 강제 업데이트 이후 1개 릴리즈 동안만 legacy migration 경로를 유지한다.
- `2.3.0` 릴리즈에서 `APP_ALARM_POPUP` legacy read/remove 경로와 관련 TODO 주석을 제거한다.
- 제거 시 기존 사용자 onboarding key 이관 회귀 테스트는 현재 정책에 맞게 유지하거나 정리한다.

완료 기준

- `2.3.0`에서 앱 알림 onboarding 판단이 member-scoped `APP_ALARM_ONBOARDING_POPUP_{memberId}` 기준으로만 동작한다.
- `APP_ALARM_POPUP`은 daily exposure bucket 저장 용도 외 legacy onboarding migration 경로에서 사용되지 않는다.

---

## 20) Mobile inline style lint 전역 확대 미완료 `P2` `M`

현상

- [엔지니어링 가드레일](../policy/engineering-guardrails.md)은 정적 React Native 스타일을 JSX inline style이 아니라 `StyleSheet.create` 안에 정의하도록 고정한다.
- `coupler-mobile-app`에는 기존 `style={{...}}` inline style이 넓게 남아 있어 `react-native/no-inline-styles`를 즉시 전역 `error`로 켜면 기존 부채로 lint가 깨진다.
- 따라서 현재는 inline style을 제거한 작은 컴포넌트/파일부터 ESLint override로 `react-native/no-inline-styles`를 점진 적용해야 한다.

영향

- 전역 룰이 꺼진 상태가 오래 지속되면 신규 inline style이 기존 부채와 섞여 재유입 여부를 구분하기 어렵다.
- 스타일 선언 위치가 컴포넌트 JSX에 흩어지면 화면 수정 시 재사용/검토 비용이 증가한다.
- 적용 범위와 완료 기준이 문서화되지 않으면 리뷰어가 전역 적용과 scoped 적용 중 어느 기준을 요구해야 하는지 추측하게 된다.

액션 후보

- `src/components/**`의 작은 presentational component부터 inline style을 `StyleSheet.create`로 옮기고 파일 단위 override를 추가한다.
- 신규 또는 수정하는 컴포넌트는 가능한 범위에서 inline style 0건으로 정리한 뒤 override 적용 범위에 포함한다.
- override 적용 파일 목록을 점진적으로 디렉터리 단위(`src/components/items/**` 등)로 넓힌다.
- 기존 inline style 잔여 수를 주기적으로 측정하고, 잔여 범위가 정리되면 `react-native/no-inline-styles`를 전역 `error`로 전환한다.

완료 기준

- `coupler-mobile-app/src` 1st-party 코드에서 정적 JSX inline style이 0건이다.
- `.eslintrc.js`에서 `react-native/no-inline-styles`가 전역 `error`로 적용된다.
- 런타임 계산이 필요한 예외는 코드 주석으로 사유가 명시되어 있고, 가능한 경우 helper 또는 token variant로 승격되어 있다.

---

## 21) Mobile StyleSheet style key 네이밍 일관성 미완료 `P2` `S`

현상

- [엔지니어링 가드레일](../policy/engineering-guardrails.md)은 `StyleSheet.create` 신규 style key를 일반 `property`로 보고 `lowerCamelCase`로 작성하도록 고정한다.
- `coupler-mobile-app`의 기존 화면/컴포넌트에는 `empty_box`, `message_style`처럼 `snake_case` style key가 일부 남아 있다.
- 기존 파일 내부 패턴을 맞추기 위해 신규 style key까지 `snake_case`로 추가하면 새 기준이 확산될 수 있다.

영향

- React Native/TypeScript 코드의 일반 네이밍 규칙과 스타일 키 네이밍이 어긋나 코드 검색과 리뷰 기준이 흔들릴 수 있다.
- 기존 부채와 신규 변경이 섞이면 어떤 style key를 고쳐야 하는지 판단하기 어렵다.

액션 후보

- 신규 `StyleSheet.create` style key는 항상 `lowerCamelCase`로 작성한다.
- 기존 `snake_case` style key는 신규 또는 직접 수정하는 style key부터 의미 단위로 `lowerCamelCase` 전환한다.
- 대규모 일괄 변경은 UI 회귀 위험이 있으므로 별도 PR에서 검색 결과, 변경 범위, lint/typecheck 결과를 남긴다.

완료 기준

- `coupler-mobile-app/src` 1st-party 코드의 `StyleSheet.create` style key가 `lowerCamelCase`로 통일되어 있다.
- 코드 리뷰 정책과 엔지니어링 가드레일이 신규 style key의 `lowerCamelCase` 기준을 같은 결론으로 설명한다.

## 22) API 응답 공통 계약 cutover 인덱스 `P1` `M`

현상

- [API 공통 응답 계약 정책](../policy/api-response-contract-policy.md)은 공통 envelope 기준의 단일 SoT이고, [API 에러 계약 정책](../policy/api-error-contract-policy.md)은 실패 `ErrorData`와 descriptor-first catalog 기준의 단일 SoT다.
- API/Mobile/Admin 코드의 공통 JSON API 응답 계약은 성공 `{ ok: true, data }`, 실패 `{ ok: false, error: ErrorData }` 구조로 수렴했으며, 구현 세부 규칙은 공통 응답 정책에서, 실패 taxonomy는 에러 정책에서 관리한다.
- API 서버 코드 계약은 response writer, `ErrorDescriptor` catalog, Swagger(OpenAPI) 실패 예시, generated contract/package artifact, freshness CI gate 기준으로 정리됐다.
- Mobile/Admin 소비 경계는 package response runtime으로 공통 envelope을 검증한다. `ok`로 성공/실패를 나눈 뒤 실패 동작은 `error_action -> error_code` 순서로 판정한다. `error_action`은 기본 처리 방향이며, 공통 request wrapper가 전역 UX를 완료할 수 없는 경우 operation/screen handler에서 처리할 수 있다.
- 남은 cutover 완료 차단 조건은 API/Admin/Mobile 동시 cutover 릴리즈 기록, 배포 순서/전환 시점, 강제 업데이트 차단 근거를 릴리즈 기록에 연결하는 작업이다.

잔여 범위

- API/Admin/Mobile 동시 cutover 릴리즈의 배포 순서, 전환 시점, 강제 업데이트 차단 근거를 API 계약 cutover Gate와 연결하는 작업.
- Admin/Mobile/Shared 영향 범위 판정은 descriptor `surfaces`와 Swagger(OpenAPI) operation 소비 근거를 사용한다.
- 강제 업데이트 메커니즘은 `coupler-api/model/app_info.ts`의 `version_code/min_version -> force_update` 판정과 `coupler-mobile-app/src/screens/MainScreen.tsx`의 `force_update === 2` UI 경로로 존재한다.
- 릴리즈 기록 템플릿은 API contract cutover 포함 시 `force_update`/`min_version` 강제 업데이트 차단 근거와 contracts package publish/Mobile/Admin 소비 경로 검증 근거 기록을 요구한다. CI는 문구 추론이 아니라 릴리즈 기록의 일반 구조와 코드/계약 구조 검증을 담당한다.
- `Mobile 앱 알림 팝업 레거시 키 마이그레이션 제거 예약`의 `2.2.0` 강제 업데이트 문구는 로컬 storage key 이관 조건이다. API ErrorData cutover Gate의 강제 업데이트 차단 근거로 사용하지 않는다.

관리 원칙

- 공통 envelope 필드/분기 기준은 [API 공통 응답 계약 정책](../policy/api-response-contract-policy.md), 실패 응답 필드/taxonomy 기준은 [API 에러 계약 정책](../policy/api-error-contract-policy.md)만 수정한다.
- 이 항목은 cutover 부채 인덱스로만 사용하고, 정책 본문이나 도메인별 에러 규칙을 복제하지 않는다.
- 응답계약 package 발행/소비/수정 기준은 [API 클라이언트 계약 패키지 정책](../policy/api-client-contract-package-policy.md)을 따른다. package 소비 전환 PR에서는 Mobile/Admin generated contract copy와 exact match 검증 CI를 함께 제거한다.
- Package public response/envelope 타입과 runtime guard는 strict `ErrorData` 실패 branch 하나를 사용한다. Swagger success map 생성을 위해 generated 내부에 남는 느슨한 helper 타입은 package public 계약 완료 근거로 보지 않는다.
- Admin 목록 endpoint는 success/failure 모두 공통 envelope을 사용하며 DataTables success body 예외를 두지 않는다.
- legacy envelope field, 숫자 wire code, public server `ERROR_CODE`, prebuilt `ErrorData`, raw 실패 JSON, transition helper 입력은 최종 구조에 재도입하지 않는다.
- 회귀 검증은 현재 계약의 구조적 금지 조건을 확인해야 하며, 과거 구현명이나 임시 helper 이름 자체에 묶지 않는다.
- 서버 표시 메시지는 응답 body의 공통 필드가 아니며 Mobile/Admin 동작 분기 기준으로 사용하지 않는다.
- cutover PR은 [API 계약 변경 모바일 릴리즈 플로우](../flows/cross-project/api-contract-mobile-release-flow.md)의 Cutover Gate를 통과한 뒤 별도 변경으로 진행한다.

후속 운영성 부채

- 로그 export 또는 CS 대응에서 `request_id` 목록만으로 생성 시각 추론이나 시간순 정렬이 필요해지면 UUID v7 전환을 검토한다. 이 항목은 현재 API ErrorData cutover 완료 조건이 아니다.

완료 기준

- [API 공통 응답 계약 정책](../policy/api-response-contract-policy.md)과 [API 에러 계약 정책](../policy/api-error-contract-policy.md)의 최종 구조와 리뷰 체크리스트를 만족한다.
- 위 `잔여 범위`가 모두 0건이거나, 제거 조건을 충족한 별도 cutover PR/릴리즈 기록으로 닫혀 있다.
- 공통 응답 contract helper, Swagger(OpenAPI 문서), 정책 문서, 코드 타입, 테스트가 같은 성공/실패 envelope 계약을 가리킨다.
- 임시/cutover 전용 타입명, transition helper, legacy 실패 호환 경로가 운영 코드에 남아 있지 않다.

---

## 23) API success DTO schema 정리 미완료 `P2` `L`

현상

- [API 공통 응답 계약 정책](../policy/api-response-contract-policy.md)은 공통 envelope의 단일 SoT이고, operation별 성공 `data` wire schema는 Swagger/OpenAPI가 SoT이며 필드의 비즈니스 의미와 도메인 제약은 각 도메인 정책이 정의한다.
- `coupler-api/packages/contracts/src/generated/apiContract.ts`는 Swagger success schema를 그대로 투영하므로, Swagger schema가 없거나 느슨한 endpoint의 generated success data type은 `unknown` 또는 loose object가 될 수 있다.
- API 응답 공통 계약 cutover 인덱스는 성공 `{ ok: true, data }` / 실패 `{ ok: false, error: ErrorData }` envelope과 실패 taxonomy 수렴을 추적한다. 전체 endpoint의 success DTO schema 완성 여부는 별도 후속 부채로 관리한다.
- Admin 목록 38개 endpoint의 Swagger `list` item이 공통 `additionalProperties: true`로 정의되어 generated contract가 `Record<string, unknown>[]`이고, `/admin/manager/all`의 `data.cnt`와 `data.list`도 generated contract에서 optional이다.

영향

- Mobile/Admin이 generated contract만으로 성공 `data` shape를 신뢰하지 못하면 화면/도메인 코드에서 local cast, 별도 타입, normalize/fallback이 다시 생길 수 있다.
- API가 성공 응답 필드를 변경해도 Swagger/OpenAPI schema와 generated contract가 느슨하면 client compile/test 단계에서 drift가 드러나지 않을 수 있다.
- 공통 응답 계약 cutover 완료가 success DTO 전 endpoint 정리 완료로 오해되면 release/cutover 판단 범위가 과대 해석될 수 있다.

액션 후보

- `coupler-api/packages/contracts/src/generated/apiContract.ts`의 success data type 중 `unknown` 또는 loose object로 생성되는 endpoint를 목록화하고, Mobile/Admin 소비 여부와 사용자 영향도로 우선순위를 정한다.
- Admin 목록 38개 endpoint의 operation별 row DTO schema를 Swagger에 정의하고, `/admin/manager/all` 성공 `data.cnt`와 `data.list`를 required로 고정한다.
- 우선순위가 높은 endpoint부터 API 응답 DTO를 명시하고, controller의 `response_success(res, data)` payload, Swagger/OpenAPI success schema/example, 도메인 정책 문서를 같은 필드명과 `null` 기준으로 맞춘다.
- API contracts package를 재생성/publish한 뒤 Mobile/Admin generated copy 또는 dependency version과 request boundary가 해당 DTO를 직접 소비하도록 갱신한다. client 쪽 alias fallback, shape repair normalize, `as unknown as` 보정은 추가하지 않는다.
- 잔여 `unknown`/loose success data는 allowlist로 관리하되 endpoint, 소비 제품면, owner, 제거 조건을 함께 기록하고 신규 증가를 CI 또는 review checklist에서 차단한다.

완료 기준

- Mobile/Admin이 소비하는 JSON API success `data`가 Swagger/OpenAPI와 generated contract에서 endpoint별 명시 타입으로 표현되어 있다.
- API controller가 내려주는 성공 payload와 문서화된 success DTO schema가 일치하며, 외부 JSON 계약의 값 없음은 `undefined` 대신 `null`로 고정되어 있다.
- Mobile/Admin feature code가 API 성공 응답 shape를 local cast, alias fallback, normalize로 보정하지 않고 generated DTO 또는 명시 ViewModel mapping만 사용한다.
- 잔여 `unknown`/loose success data가 0건이거나, 예외 endpoint가 owner/제거 조건이 있는 별도 부채로 분리되어 있다.
- 공통 envelope/error cutover 완료 판단과 success DTO 정리 완료 판단이 릴리즈 기록에서 분리되어 있다.

---

## 24) 그룹미팅 Admin/Mobile 연결 및 배포 미완료 `P1` `L`

현상

- 그룹미팅 DB migration SQL과 API 제공자 구현·소스 검증은 완료됐지만 공유 dev/prod DB·운영 API
  적용/배포는 남아 있어 운영 서비스에서 사용할 수 없다. API 제공자에는 남녀 합계 30명 정원, 신청 없는
  행사에 대한 Mobile 호스트 수정/삭제, CONFIRMED 개인 확정 취소·대체 승인, 24시간 자동 종료, 후기 후
  채팅 차단과 미팅별 CMS 상세 조회 계약이 반영돼 있다.
- Admin 운영 화면은 구현되지 않았다. CMS 왼쪽 대분류는 `미팅 내역` 하나만 두고, 채팅·후기·신고·프로필
  조회 결제 내역은 각 미팅 상세의 event-scoped API를 소비해야 한다. 전역 혼합 목록과 패널티 화면은 만들지
  않는다. Mobile Draft PR
  [#154](https://github.com/coupler-developer/coupler-mobile-app/pull/154)에는 그룹미팅 탭·목록·상세·My Page·
  검색 UI 골격이 있지만 mock 데이터와 임시 로컬 DTO를 사용하며 그룹미팅 API를 호출하지 않는다.
- Mobile은 FCM 77~83의 행사 상세/채팅 라우팅과 `alarm_event`/`alarm_chat` 설정을 아직 처리하지 않는다.
- Mobile 검색 UI는 별도 검색 API 없이 이미 내려받은 행사 목록을 로컬 필터링하는 1차 범위다.
- API에는 `GET /admin/cron/finishGroupMeetings` 자동 종료 작업이 구현돼 있지만, 운영 외부 스케줄러의 호출
  등록·주기와 실행 모니터링 검증은 배포 단계에 남아 있다.
- DB/API/Admin/Mobile을 묶은 통합 검증, 배포 순서, 롤백 기준과 릴리스 기록이 없다.

영향

- API만 먼저 배포하거나 Admin/Mobile이 서로 다른 계약을 사용하면 기능이 종단 간 동작하지 않는다.
- 신규 FCM 타입을 인식하지 못하는 Mobile에 서버 알림이 먼저 발송되면 잘못된 화면으로 이동하거나 알림을
  처리하지 못할 수 있다.
- 운영 배포 전 교차 레포 검증이 없으면 중복 알림·중복 과금·정원 초과와 개인정보 접근 회귀를 놓칠 수 있다.

액션 후보

- dev/prod DB Migration Gate를 거쳐 migration을 적용하고 API를 배포하되, Admin/Mobile이 사용하기 전까지
  그룹미팅 write를 운영에서 호출하지 않는다.
- Mobile PR #154를 최신 Mobile `main`에 rebase하고 API가 발행한 exact contracts package로 갱신한다.
  generated response DTO는 API 경계에서 검증한 뒤 명시적 화면 ViewModel로 변환하고 mock과 wire shape를
  흉내 낸 로컬 DTO는 제거한다. mock 목록이 보이는 현재 탭은 이 연결 전 운영에 노출하지 않는다.
- 상세 화면은 목록 item 전체가 아니라 event ID로 이동해 `GET /group-meetings/{event_id}`를 다시 읽는다.
  legacy `MEETING_MEMBER_STATUS`/`is_active`를 재사용하지 않고 event `status`, `my_application_status`,
  detail `permissions`로 상세 접근과 신청/채팅/후기 CTA를 결정한다.
- Admin은 미팅 내역 목록/상세와 상세 하위의 신청자·채팅·후기·신고·프로필 조회 결제 내역을 generated API
  계약으로 연결한다. 기존 알림 드롭다운에는 `groupMeetingChatUserReport`를 연결해 미팅 내역으로 이동시키되
  전역 신고 목록을 만들지 않는다.
- Mobile 행사·신청·채팅·후기 흐름을 generated API 계약으로 연결한다. 특히 개인 확정 취소된 참가자의 종료
  카드/메시지 차단, CONFIRMED 대체 참가자의 기존 채팅방 합류, 후기 완료 후 채팅 제거를 검증한다. 각 레포의
  표준 품질 게이트와 권한별 허용/거부 시나리오를 통과한다.
- 운영 외부 스케줄러가 `finishGroupMeetings`를 정기 호출하도록 등록하고, `event_at + 24시간` 경계·재호출
  멱등성·실패 알림을 배포 검증에 포함한다.
- FCM 77~83의 미사용 여부를 적용 직전에 다시 확인하고, 신규 타입 라우팅과 알림 설정을 처리하는 Mobile을
  먼저 배포한 뒤 DB -> API -> Admin 순서로 활성화한다.
- 최초 프로필 열람 1회 과금, 호스트 무료 열람, 최초 후기 1회 보상, 동시 정원 승인, 알림 저장·발송 중복
  방지를 교차 레포 통합 검증으로 다시 확인하고 배포·롤백 근거를 릴리스 기록에 남긴다.
- 그룹미팅 전체 검증이 완료되면 이 항목을 삭제하고 구현·검증 근거는 PR과 릴리스 기록에 남긴다.

---

## 25) API public request DTO 생성/소비 전환 미완료 `P2` `L`

현상

- [API 클라이언트 계약 패키지 정책](../policy/api-client-contract-package-policy.md)은 public request/success wire DTO를 API Swagger/OpenAPI에서 한 번만 정의하고 contracts package type으로 배포하도록 고정한다.
- 현재 `@coupler-developer/coupler-api-contracts`의 generated operation contract는 success data type 중심이며, path/query/body 위치와 required/optional/nullable을 보존하는 operation별 public request DTO type은 제공하지 않는다.
- Admin/Mobile에는 request payload wire shape를 local type/interface, `Record<string, unknown>`, 인라인 object로 표현하는 경로가 남아 있어 API request schema 변경이 package version 갱신과 compile 단계에서 모두 드러난다고 보장할 수 없다.
- Request method/path/media type validator, request DTO runtime validator, serializer, URL encoder, operation dispatcher는 package 공개 runtime에 포함하지 않는 것이 최종 경계다. 이 부채는 type-only DTO 생성과 소비 전환만 다룬다.

영향

- API와 소비자가 같은 request wire shape를 각각 정의하면 필드명, required/optional, nullable, 배열/단수 기준이 조용히 어긋날 수 있다.
- 소비자 local request DTO가 API 계약처럼 사용되면 Swagger/OpenAPI를 수정해도 Admin/Mobile typecheck에서 drift가 차단되지 않을 수 있다.
- Request DTO type 공유와 transport runtime 공유를 구분하지 않으면 contracts package가 serializer/dispatcher를 포함한 범용 SDK로 불필요하게 확장될 수 있다.

액션 후보

- Admin/Mobile이 사용하는 API operation을 목록화하고 각 operation의 path/query/body request schema, required/optional, nullable, media type을 Swagger/OpenAPI에서 명시한다.
- API generator가 operation별 type-only public request DTO map을 생성하도록 확장하되, runtime export에는 request validator/serializer/dispatcher를 추가하지 않는다.
- Contracts package version을 올려 발행하고 Admin/Mobile dependency와 lockfile을 같은 stable version으로 정렬한다.
- 소비자 request payload를 package generated DTO로 전환하고 동일 wire shape의 local type/interface, broad `Record<string, unknown>`, alias fallback을 제거한다.
- 화면 ViewModel과 로컬 draft는 소비자에 유지하되 API payload로 전달할 때 package request DTO로 명시 변환한다.
- Generated request DTO freshness, package type export, 소비자 local wire DTO 재유입을 CI 또는 정적 검사로 차단한다.

완료 기준

- Admin/Mobile이 사용하는 public API operation의 request path/query/body schema가 Swagger/OpenAPI에 명시되어 있다.
- Contracts package가 operation별 type-only public request DTO를 제공하고 path/query/body 위치와 required/optional/nullable을 보존한다.
- Admin/Mobile request payload가 package generated DTO를 사용하며 동일 wire shape의 consumer-local DTO, broad cast, alias fallback이 남아 있지 않다.
- Package public runtime에 request method/path/media type validator, request DTO runtime validator, serializer, URL encoder, operation dispatcher가 추가되지 않았다.
- API generated contract freshness와 Admin/Mobile 표준 품질 게이트가 통과하고 세 레포의 package exact version이 일치한다.
