# 기술 부채 정리

## 문서 역할

- 역할: `부채`
- 문서 종류: `technical-debt`
- 충돌 시 우선 문서: 각 항목의 규범 문서
- 기준 성격: `as-is`

## 기준

- 범위: `coupler-api`, `coupler-admin-web`, `coupler-mobile-app`
- 판정: 최신 clean `main`, 최신 released 기록
- 완료: 항목 삭제, 근거는 PR·릴리스 기록에 보존
- 표기: `P1` 차단 위험, `P2` 유지보수 위험, `P3` 보류 가능; `S` 단일 레포, `M` 교차 검증, `L` 다중 레포·운영 검증

## 1) API URL-encoded 호환 parser 제거 대기 `P1` `S`

- 현상: Mobile/Admin은 JSON·multipart로 전환됐지만 API `bodyParser.urlencoded(...)`와 build `100` 호환이 남아 있다.
- 영향: legacy 입력을 근거 없이 제거하면 운영 write 요청이 실패할 수 있다.
- 조치: content-type 계측 → native build `101+` 배포 → `min_version>100` 적용 → parser 제거.
- 완료: URL-encoded 0건, build `100` `force_update=2`, parser 제거.

## 2) 레거시 클래스 컴포넌트 잔존 `P2` `L`

- 현상: Mobile에 클래스 컴포넌트와 구식 lifecycle이 남아 있다.
- 영향: 상태·구독·timer 검증과 유지보수가 어렵다.
- 조치: 수정 화면부터 Hooks로 전환한다.
- 완료: 1st-party 클래스 컴포넌트 0건, lifecycle 회귀 검증 통과.

## 3) Deprecated 의존성 대응 미확정 `P2` `M`

- 현상: install 경고와 보안 advisory의 package·version·owner 목록이 없다.
- 영향: 보안·업그레이드 우선순위를 판정할 수 없다.
- 조치: 직접·전이 의존성을 목록화하고 업그레이드 또는 예외를 정한다.
- 완료: 조치 가능 경고 0건, 잔존 예외에 owner·제거 조건 기록.

## 4) 에러 처리·로깅 공백 `P1` `S`

- 현상: Mobile에 빈 catch와 기록 없는 실패 fallback이 남아 있다.
- 영향: 사용자 실패와 장애 원인을 추적하기 어렵다.
- 조치: 사용자 오류·best-effort 실패의 메시지와 로그 기준을 고정한다.
- 완료: 조용한 실패 0건, 대표 실패 경로 테스트 통과.

## 5) normalize·fallback 계약 우회 `P2` `M`

- 현상: alias fallback, shape repair, broad cast가 API 계약 오류를 숨긴다.
- 영향: 서버·클라이언트 drift가 compile/test에서 드러나지 않는다.
- 조치: generated DTO와 명시 ViewModel mapping으로 교체한다.
- 완료: 계약 경계의 alias fallback·shape repair·`as unknown as` 0건.

## 6) Mobile i18n 키 불일치 `P1` `M`

- 현상: `ko.ts`·`en.ts` key 집합이 다르고 코드 사용 key 2개가 두 locale에 모두 없다.
- 영향: 언어별 누락 문구와 fallback 의존이 발생한다.
- 조치: locale key·구조 exact match 검사와 사용 key 검사를 표준 gate에 추가한다.
- 완료: 누락·미사용·구조 불일치 0건.

## 7) 회원가입 후속 안정화 `P2` `M`

- 현상: 가입 정책의 `basic_info`, `pending_profile` 등이 generated success DTO와 다르고 장거리 E2E가 부족하다.
- 영향: 가입 응답 drift와 반려·재제출 회귀를 늦게 발견한다.
- 조치: 정책·Swagger·generated DTO를 맞추고 핵심 가입 E2E를 추가한다.
- 완료: 계약 freshness와 신규·반려·재제출·승인 라우팅 테스트 통과.

## 8) 설정 승인 푸시 계약 이원화 `P2` `S`

- 현상: `setting_approval_kind`와 legacy flat locale key가 함께 남아 있다.
- 영향: 설정 유형별 문구·FCM type·알람 기록이 다시 어긋날 수 있다.
- 조치: 설정 승인 발송을 단일 helper와 `push.setting_approval.*`로 수렴한다.
- 완료: 모든 설정 승인 경로의 `type/content/t_alarm.type` 통합 테스트 통과.

## 9) Mobile 파일 구조 TO-BE 미전환 `P1` `L`

- 현상: `fragment`, 중첩 screen 폴더, 라우팅 `*StepScreen`이 남아 있다.
- 영향: 구조 정책과 실제 탐색 경로가 다르다.
- 조치: 수정 도메인부터 `*Step`·`*Section`과 평탄 screen 구조로 이전한다.
- 완료: 금지 구조 0건, 구조 검사 통과.

## 10) Admin Color Token 미통일 `P2` `M`

- 현상: hardcoded HEX, inline color, legacy theme 변수가 혼재한다.
- 영향: 브랜드·상태색·접근성 기준이 화면마다 달라진다.
- 조치: Admin color token으로 치환하고 정적 검사를 추가한다.
- 완료: 1st-party hardcoded HEX·inline color 0건.

## 11) ritzy -> coupler 네이밍/운영 잔존 정리 `P3` `M`

- 현상: 외부 식별자, 레거시 명칭, 운영 `ritzy` schema가 남아 있다.
- 영향: 변경 대상과 보존 대상을 구분하기 어렵다.
- 조치: 잔존 사용처를 분류하고 DB 삭제는 backup·Migration Gate 확보 후 별도 승인한다.
- 완료: 미분류 명칭 0건, DB 정리 시 versioned SQL·backup·rollback 근거 확보.

## 12) Mobile patch-package 의존 `P2` `S`

- 현상: Google Sign-In과 iOS image picker patch 2건의 제거 시점이 불명확하다.
- 영향: 의존성 업그레이드와 install 재현성이 약해진다.
- 조치: upstream 버전에서 재검증하고 유지 patch에 owner·버전·재검토 시점을 기록한다.
- 완료: patch 제거 또는 예외 근거와 핵심 수동 시나리오 확보.

## 13) 라운지 댓글 수 의미 이원화 `P2` `M`

- 현상: API visible count, `t_lounge.cmt_cnt`, 이벤트 `count`의 의미가 다르다.
- 영향: 화면 댓글 수 SoT를 오해할 수 있다.
- 조치: visible count를 화면 계약으로 고정하고 DB·이벤트 count의 목적을 제거하거나 명시한다.
- 완료: 표시 count 단일화, 잔존 count 의미·테스트 고정.

## 14) 미팅 회비 `0=미정` 계약 불일치 `P2` `S`

- 현상: API·Mobile·Admin·Swagger가 `0`과 미선택값을 다르게 처리한다.
- 영향: 생성·편집 결과가 제품면별로 달라질 수 있다.
- 조치: `0`의 유효 여부를 확정하고 전 제품면을 함께 수정한다.
- 완료: validation·기본값·제출 조건·문서·테스트 일치.

## 15) Mobile Kakao 초대 완료 문구와 실제 전송 의미 불일치 `P2` `S`

- 현상: 공유 UI 실행과 추천 저장 후 “초대가 완료되었습니다”를 노출한다.
- 영향: 실제 Kakao 전달 완료로 오해할 수 있다.
- 조치: 성공 의미를 “공유 UI 실행 + 추천 저장”으로 고정하고 문구를 수정한다.
- 완료: 실제 전달을 단정하는 UI·이벤트명 0건, 성공·실패 테스트 통과.

## 16) 클럽·클럽매니저 용어 미통일 `P2` `M`

- 현상: 사용자 문구에 `매칭 매니저`, `큐레이터`, `Ritzy`가 남아 있다.
- 영향: 같은 역할을 다른 용어로 인식한다.
- 조치: 사용자 노출 문구만 `클럽`, `클럽매니저`로 바꾼다.
- 완료: 잔존 사용자 문구 0건, 내부 식별자는 예외 분류.

## 17) 앱 알림 팝업 legacy key 제거 대기 `P2` `S`

- 현상: member-scoped key 이관을 위해 `APP_ALARM_POPUP` legacy 경로가 남아 있다.
- 영향: onboarding key와 daily exposure key 의미가 섞인다.
- 조치: 강제 업데이트 후 legacy read/remove 경로를 제거한다.
- 완료: onboarding은 member-scoped key만 사용.

## 18) Mobile inline style lint 미완료 `P2` `M`

- 현상: 기존 inline style 때문에 `react-native/no-inline-styles`를 전역 적용하지 못한다.
- 영향: 신규 inline style 재유입을 차단하기 어렵다.
- 조치: 수정 파일부터 `StyleSheet.create`로 전환하고 lint 범위를 넓힌다.
- 완료: 정적 inline style 0건, lint 전역 `error`.

## 19) Mobile StyleSheet key 네이밍 불일치 `P2` `S`

- 현상: `StyleSheet.create`에 `snake_case` key가 남아 있다.
- 영향: TypeScript 일반 네이밍과 리뷰 기준이 다르다.
- 조치: 수정 key부터 `lowerCamelCase`로 전환한다.
- 완료: 1st-party style key `lowerCamelCase` 통일.

## 20) API 응답 공통 계약 cutover 인덱스 `P1` `M`

- 현상: 코드 계약은 수렴했지만 API/Admin/Mobile 배포 순서와 legacy 차단 근거가 없다.
- 영향: 구버전 client와 임시 호환 경로를 남긴 채 완료로 오인할 수 있다.
- 조치: [API 계약 변경 모바일 릴리즈 플로우](../flows/cross-project/api-contract-mobile-release-flow.md)로 동시 cutover를 기록한다.
- 완료: exact package·배포 순서·`min_version/force_update`·legacy 제거 근거 확보.

## 21) API success DTO schema 정리 미완료 `P2` `L`

- 현상: Mobile/Admin 소비 endpoint에 `unknown`, loose object, optional 필수 필드가 남아 있다.
- 영향: local cast·normalize로 응답 drift를 숨긴다.
- 조치: 신규·직접 수정 operation부터 Swagger success DTO와 generated contract를 구체화한다. 내부 필드를 읽지 않고 값 전체를 전달·보관하는 opaque JSON passthrough는 제외한다.
- 완료: 구조를 읽는 소비 success data의 명시 타입과 exact DTO 소비, local 계약 보정 0건.

## 22) 그룹미팅 소비자 cutover 및 출시 통합 미완료 `P1` `L`

- 현상: [API #110](https://github.com/coupler-developer/coupler-api/pull/110), [API #131](https://github.com/coupler-developer/coupler-api/pull/131), [API #132](https://github.com/coupler-developer/coupler-api/pull/132), [Admin #62](https://github.com/coupler-developer/coupler-admin-web/pull/62)는 병합됐고 stable contract `0.1.12`가 발행됐다. [Mobile #154](https://github.com/coupler-developer/coupler-mobile-app/pull/154)와 [Admin #66](https://github.com/coupler-developer/coupler-admin-web/pull/66)은 같은 stable 계약을 소비하는 cutover 변경 묶음이며 CI를 통과했다. 세 레포 main·배포물의 exact version 일치 증빙과 대상 환경별 migration ledger·runtime, FCM, scheduler smoke, 운영 전환이 남아 있다.
- 영향: 부분 배포 시 알림·정원·과금·개인정보 계약이 어긋날 수 있다.
- 조치: 세 레포 main·배포물의 exact version 일치 확인 → 대상 환경 migration ledger·schema 확인 → API·Admin·Mobile runtime/FCM smoke → 운영 scheduler smoke 순으로 통합한다.
- 완료: dev/prod Gate, 세 레포 exact version, FCM 77~83, 운영 scheduler 검증 통과.

## 23) API public request DTO 생성/소비 전환 미완료 `P2` `L`

- 현상: contracts package는 직접 수정한 일부 named request DTO만 제공하고 소비자 local wire type이 남아 있다.
- 영향: request 필드 drift가 compile 단계에서 차단되지 않는다.
- 조치: Swagger에서 type-only request DTO를 생성하고 Admin/Mobile local DTO를 제거한다.
- 완료: 소비 operation request schema 명시, 세 레포 exact package, local wire DTO 0건.

## 24) 테스트용 개발 데이터 운영 검증·고도화 미완료 `P1` `M`

- 현상: [docs #71](https://github.com/coupler-developer/docs/pull/71) 기준 공유 개발계 apply 뒤 N:N `group-meeting-all` 적용과 API·Admin 53개 데이터 화면 교차 계약 검증까지 끝났다. 인증된 Admin browser smoke, 유지 기간 cron·외부 호출 관측, reset 증빙이 남아 있다.
- 영향: 합성 데이터가 화면·필터·정리 계약을 충족하는지 확정할 수 없다.
- 조치: browser smoke → 유지 기간 관측 → reset·orphan·asset 검증을 수행한다.
- 완료: [테스트용 개발 데이터 정책](../policy/development-test-data-policy.md) Gate와 route별 검증 통과.

## 25) Admin compiled theme 제거 미완료 `P2` `L`

- 현상: Admin은 Bootstrap 5와 foundation 규칙을 포함한 compiled Color Admin `app.min.css`를 함께 로드하고 공통 골격이 Color Admin class와 theme asset에 의존한다.
- 영향: import 순서와 selector specificity가 스타일 책임을 대신해 한 화면의 수정이 다른 운영 화면의 표시를 바꿀 수 있다.
- 조치: 사용처 baseline과 감소형 gate를 만든 뒤 공통 골격부터 Bootstrap 5, Admin token, Coupler 소유 component·SCSS로 전환한다.
- 완료: `app.min.css`·theme asset 사용, Color Admin 전용 class, 중복 foundation이 모두 0건이고 대표 화면 회귀 검증을 통과한다.

## 분리 관리

- [Firebase Apple SDK CocoaPods 마이그레이션](firebase-apple-sdk-cocoapods-migration-plan.md): CocoaPods 종료 대응, Xcode 26 release gate, Analytics 사용 여부.
