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

- 현상: API·Admin source main은 채팅 페이지 집계·무료 공개 프로필을 포함한 stable contract `0.1.15`에 exact pin되어 있다. Mobile source main은 `0.1.9`이고, 그룹미팅 소비 PR `coupler-mobile-app#154`만 `0.1.15`에 exact pin된 상태라 세 레포 source main 정렬부터 남아 있다. 실제 배포물의 exact version 일치 증빙과 대상 환경별 migration ledger·runtime, FCM, scheduler smoke, 운영 전환도 남아 있다.
- 영향: 부분 배포 시 알림·정원·프로필 공개·개인정보 계약이 어긋날 수 있다.
- 조치: 세 레포 배포물의 `0.1.15` exact version 일치 확인 → 대상 환경 migration ledger·schema 확인 → API·Admin·Mobile runtime/FCM smoke → 운영 scheduler smoke 순으로 통합한다.
- 완료: dev/prod Gate, 세 레포 exact version, FCM 77~83, 운영 scheduler 검증 통과.

## 23) API public request DTO 생성/소비 전환 미완료 `P2` `L`

- 현상: contracts package는 직접 수정한 일부 named request DTO만 제공하고 소비자 local wire type이 남아 있다.
- 영향: request 필드 drift가 compile 단계에서 차단되지 않는다.
- 조치: Swagger에서 type-only request DTO를 생성하고 Admin/Mobile local DTO를 제거한다.
- 완료: 소비 operation request schema 명시, 세 레포 exact package, local wire DTO 0건.

## 24) 테스트용 개발 데이터 운영 검증·고도화 미완료 `P1` `M`

- 현상: API catalog v7과 N:N scenario v4 데이터 계약, Admin 55개 component route·53개 데이터 화면 계약이 구현됐다. 공유 개발계 `qa-cms-20260716`도 generation 2·catalog v7 `cms-all`로 원자 cutover돼 임시 단일-domain·legacy asset 채택 경로가 제거됐다. 권한별 인증 Admin browser smoke, 유지 기간 cron·외부 호출 관측과 종료 시 최종 reset 증빙은 남아 있다.
- 영향: 권한별 화면·필터와 유지 기간 동작, 종료 시 orphan·asset 0건을 실제 운영 증빙으로 확정하지 못했다.
- 조치: 권한별 browser smoke → 유지 기간 cron·외부 호출 관측 → 유지 종료 시 reset·orphan·asset 검증을 수행한다.
- 완료: [테스트용 개발 데이터 정책](../policy/development-test-data-policy.md) Gate, 전체 catalog generation 장애 복구·rollback, 공유 개발계 current generation, 권한별 route 검증과 최종 reset 증빙 통과.

## 25) Admin compiled theme 제거 미완료 `P2` `L`

- 현상: Admin은 Bootstrap 5와 foundation 규칙을 포함한 compiled Color Admin `app.min.css`를 함께 로드하고 공통 골격이 Color Admin class와 theme asset에 의존한다.
- 영향: import 순서와 selector specificity가 스타일 책임을 대신해 한 화면의 수정이 다른 운영 화면의 표시를 바꿀 수 있다.
- 조치: 사용처 baseline과 감소형 gate를 만든 뒤 공통 골격부터 Bootstrap 5, Admin token, Coupler 소유 component·SCSS로 전환한다.
- 완료: `app.min.css`·theme asset 사용, Color Admin 전용 class, 중복 foundation이 모두 0건이고 대표 화면 회귀 검증을 통과한다.

## 26) 기존 API 페이지 조회 구조 감사·전환 미완료 `P2` `L`

- 현상: [API 조회·동작 설계 정책](../policy/api-operation-design-policy.md)을 신규·직접 수정 API에 적용하지만, 기존 Mobile 화면·Admin route의 최초 요청 그래프 baseline과 준수·허용 분리·전환 필요 판정이 없다. 그룹미팅 채팅과 전체 채팅 첫 화면의 API 집계 계약은 `0.1.13`에서 도입됐고 API·Admin source main은 stable `0.1.15`에 exact pin되어 있지만 Mobile source main은 `0.1.9`다. 그룹미팅 소비 PR `coupler-mobile-app#154` 병합과 실제 배포 확인, 나머지 화면 감사가 남아 있다.
- 영향: client waterfall·부분 실패 시 핵심 데이터 소실·item N+1·혼합 snapshot·중복 호출이 남아도 전체 범위와 우선순위를 판정할 수 없다.
- 조치: 화면·route별 요청 그래프 전수 분류 → 사용자 차단·N+1·권한 일관성·호출량 순 우선순위화 → 페이지별 조회 DTO와 서버 집계 구현 → Swagger·generated contract·소비자 cutover → traffic 확인 후 legacy endpoint 제거.
- 완료: 정책 적용 대상 화면·route baseline 100%, 근거 없는 초기 조회 2회 이상·client item N+1·명령 뒤 강제 전체 재조회 0건, 허용 분리 근거와 독립 실패 UX 100%, 전환 대상 legacy traffic 0건 및 제거.

## 27) 관리자 권한 서버 인가·표시 계약 미정렬 `P1` `L`

- 현상: [보안/접근통제 정책](../policy/security-access-control-policy.md)이 역할·범위 매트릭스를 정의하지만 `super = 0` 관리자의 현재 클럽매니저 연결 판정이 공통 인가 경계에 없고, Admin 상위 메뉴의 `manager` 표시값이 하위 직접 route에 일관되게 상속되지 않으며, 설정·통계·기존 2:2·라운지·매니저 조회·결제 상태 변경·상담 상세/전송·보조 업로드/조회 등 일부 API는 인증 또는 목록 필터만으로 접근한다. 일반 클럽매니저 화면도 호출하는 `manager/all`은 공개 선택 목록 전용 projection 없이 관리자 전체 DTO의 `user_id`, `password`, `password_raw`, 로그인 메타데이터를 반환한다. 회원 저장도 호출자의 현재 `CHARGE` 배정은 확인하지만 payload의 전담(`CHARGE`)·공유(`SHARE`) 배정 변경 권한을 분리하지 않아 operation별 `GLOBAL/ASSIGNED/OWNED/SHARED/SELF/NONE` 인가가 완결되지 않았다.
- 영향: 일반 클럽매니저가 숨겨진 URL이나 직접 API 요청으로 허용 범위를 벗어난 데이터와 운영 액션에 접근할 수 있고, 공유매니저 선택에 필요하지 않은 관리자 자격증명·로그인 정보가 노출된다.
- 조치: 모든 Admin component route와 API operation을 기능군·행위·데이터 범위에 매핑하고 서버 인가를 먼저 적용한 뒤, `manager/all`의 각 목록 item을 `id`, `nickname`만 반환하는 공개 선택 DTO로 분리하며, 명시적 route audience와 역할별 허용·거부·타 담당/소유자·응답 필드 회귀 테스트를 같은 변경 단위로 반영한다.
- 완료: Admin route·API operation 매핑 100%, 미정의 operation 0건, 직접 URL/API 우회 0건, `manager/all`이 `cnt`, `list` envelope를 유지하면서 각 목록 item은 `id`, `nickname`으로만 구성되고 `user_id`, `password`, `password_raw`, 로그인·인증 설정 필드가 없다는 회귀 테스트, Super Admin·유효 연결 일반 클럽매니저·연결 누락 관리자·타 담당/소유자의 허용/거부 테스트 통과.

## 28) 운영 cron 서비스 인증 경계 증빙 미완료 `P1` `L`

- 현상: 개발 cron은 loopback·`x-dev-cron-token`으로 fail-closed하지만 production에서는 개발 guard가 통과하고 `/admin/cron/*` route 자체의 서비스 인증이 없다. 외부 scheduler와 network/ingress 제한이 실제 접근 경계라면 그 설정·negative smoke 근거가 repository에 없다.
- 영향: 운영 ingress가 잘못 열리거나 설정이 drift하면 상태 전이·알림·삭제 작업을 권한 없는 호출자가 실행할 수 있다.
- 조치: 운영 scheduler 호출 경로·보안그룹·reverse proxy baseline 확인 → 서비스 인증 또는 검증 가능한 private ingress 계약 확정 → scheduler credential/header cutover → 외부 거부·정상 호출·회전·rollback smoke를 기록한다.
- 완료: 운영 `/admin/cron/*`의 허용 호출자와 인증·network 경계가 문서·설정·자동 negative test로 일치하고, 삭제성 endpoint를 포함한 운영 scheduler smoke와 credential 회전·rollback 증빙 통과.

## 29) 상태 전이 후 푸시 전달 재시도 미완료 `P1` `L`

- 현상: 그룹미팅을 포함한 도메인 상태 transaction이 commit된 뒤 FCM을 직접 발송하며 provider 실패를 기록만 하고 durable outbox·재시도·전송 멱등 원장이 없다.
- 영향: 상태는 정상 변경돼도 사용자 알림이 유실될 수 있고 장애 복구 뒤 어떤 대상을 재발송해야 하는지 확정할 수 없다.
- 조치: 알림 intent outbox와 멱등 key·시도 상태·재시도/격리 정책을 정의하고 기존 `t_alarm` 의미와 중복 없이 worker가 처리하도록 전환한 뒤 provider 실패·process crash·중복 실행을 검증한다.
- 완료: 상태 commit과 알림 intent가 원자적으로 기록되고, provider 실패·process crash 뒤 재시도와 중복 억제·운영 관측·격리/재처리 smoke 통과.

## 분리 관리

- [Firebase Apple SDK CocoaPods 마이그레이션](firebase-apple-sdk-cocoapods-migration-plan.md): CocoaPods 종료 대응, Xcode 26 release gate, Analytics 사용 여부.
