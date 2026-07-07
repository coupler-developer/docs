# 마케팅 앱 이벤트 정책

## 문서 역할

- 역할: `규범`
- 문서 종류: `policy`
- 충돌 시 우선 문서: 이 문서
- 기준 성격: `as-is`

## 목적

- 광고/마케팅 측정용 앱 이벤트의 기록 시점과 제외 조건을 고정해 앱/서버/운영 해석 차이를 줄인다.

## 적용 범위

- `coupler-mobile-app`
- Meta SDK 직접 App Events, AppsFlyer 앱 이벤트
- 앱 설치/실행, 일반회원 승급심사를 위한 기본정보 제출, 가입 중 사진 제출, 신규 구매 전환 측정

## 단일 SoT

- 회원 심사 제출 의미: [회원 심사 단일 정책](member-review-policy.md)
- 회원가입 성공 응답: [회원가입 응답 계약](signup-response-contract.md)
- 리뷰/증빙 기준: [코드 리뷰 정책](code-review-policy.md)

## 용어 고정

- Meta `CompletedRegistration`의 제품 기준명은 `일반회원 승급심사 기본정보 제출`이다.
- 이 이벤트는 `SIGNUP_REVIEW` 제출 성공 시점이며, 회원 레벨 승인이나 운영 심사 완료가 아니다.

## 이벤트 기준

| 제품 기준 | 외부 이벤트 | 이벤트 종류 | 기록 시점 | 제외 |
| --- | --- | --- | --- | --- |
| 앱 설치 | Meta SDK 앱 설치 이벤트 | 표준/native | Android/iOS native `activateApp`의 install publish 경로가 수행될 때 | 클라이언트에서 `fb_mobile_first_install`를 수동 기록하지 않음 |
| 앱 실행 | Meta `fb_mobile_activate_app` | 표준/native | Android/iOS native `activateApp` 세션 규칙이 기록할 때 | 클라이언트에서 `fb_mobile_activate_app`를 수동 기록하지 않음 |
| 일반회원 승급심사 기본정보 제출 | Meta `CompletedRegistration` | 표준 | 일반회원 승급심사를 위한 기본정보 최종 제출 후 `/app/v1/auth/signup`가 `{ ok: true, data }`를 반환하고 클라이언트가 제출 완료 처리를 수행할 때 | 기존 회원 프로필 수정, 심사 재제출, 인증 심사 승인, 소개글 심사 승인, 운영 승인, 클라이언트 검증 실패, API 실패, 네트워크 실패 |
| 가입 중 여성 사진 제출 | Meta `fb_step5_woman_photos_enroll` | 커스텀 | 가입 플로우에서 여성 사용자가 사진을 포함한 기본정보를 최종 제출한 뒤 `/app/v1/auth/signup`가 `{ ok: true, data }`를 반환하고 클라이언트가 제출 완료 처리를 수행할 때 | 기존 회원 프로필 수정, 심사 재제출, 클라이언트 검증 실패, API 실패, 네트워크 실패 |
| 가입 중 남성 사진 제출 | Meta `fb_step5_man_photos_enroll` | 커스텀 | 가입 플로우에서 남성 사용자가 사진을 포함한 기본정보를 최종 제출한 뒤 `/app/v1/auth/signup`가 `{ ok: true, data }`를 반환하고 클라이언트가 제출 완료 처리를 수행할 때 | 기존 회원 프로필 수정, 심사 재제출, 클라이언트 검증 실패, API 실패, 네트워크 실패 |
| 신규 구매 완료 | Meta `logPurchase(price, 'KRW')` | 표준 | 신규 구매 요청이 서버에서 성공 확인된 뒤 | 복원 구매, 서버 검증 실패, 네트워크 실패 |

## 필수 규칙

- 수동 Meta 앱 이벤트는 `react-native-fbsdk-next`의 `AppEventsLogger`로 직접 기록한다.
- Meta `CompletedRegistration`은 일반회원 승급심사를 위한 기본정보 제출 API 성공 시점에만 기록한다.
- 같은 API 성공 처리의 재렌더, 라우팅, 토스트, 후속 심사 승인으로 중복 기록하지 않는다.
- Meta SDK 자동 앱 이벤트는 잡다한 자동 이벤트 유입을 막기 위해 비활성화한다.
- Android 앱 설치/실행 표준 이벤트는 `MainApplication`의 native `AppEventsLogger.activateApp(this)` 경로로 기록한다.
- iOS 앱 설치/실행 표준 이벤트는 `AppDelegate`의 native `AppEvents.shared.activateApp()` 경로로 기록한다.
- Android/iOS `activateApp()`는 SDK 공개 install 전환 경로이지만 deactivate/time-spent 이벤트를 함께 기록할 수 있으므로 strict allowlist로 간주하지 않는다.
- Android/iOS까지 strict allowlist로 전환할 때는 앱 설치 전환 수집 손실 또는 SDK 내부 API 사용 위험을 별도 변경 단위에서 결정한다.
- 클라이언트 코드에서 `fb_mobile_first_install` 또는 `fb_mobile_activate_app`를 수동 `logEvent`로 중복 기록하지 않는다.
- 앱 실행 이벤트는 native 앱 실행 기준으로 수집하며, 로그인 완료 후 AppsFlyer `af_login`과 의미를 혼용하지 않는다.
- 가입 중 사진 제출 이벤트는 사진을 포함한 가입 기본정보 제출 API 성공 이벤트이며, 사진 선택/버튼 클릭/심사 승인 완료 이벤트가 아니다.
- `fb_step5_woman_photos_enroll`, `fb_step5_man_photos_enroll`의 성별 분기는 앱 내부 `gender` 문자열 `F`/`M`을 기준으로 하며, 숫자 변환이나 `unknown` 값 정규화로 판단하지 않는다.
- 가입 제출, 구매 같은 수동 전환 이벤트는 SDK 기록 직후 Meta SDK `flush()`를 호출해 테스트 수신 지연을 줄인다. 단, Events Manager UI의 즉시 표시까지 보장하지는 않는다.
- 인증 심사 승인, 소개글 심사 승인, Admin 운영 승인, 기존 회원 프로필 수정, 심사 재제출은 `CompletedRegistration` 기록 시점이 아니다.
- 구매 이벤트는 신규 구매 서버 검증 성공 후에만 기록하고, 복원 구매에서는 기록하지 않는다.
- ATT 동의 여부는 앱/가입/구매 플로우를 막지 않으며, iOS에서는 ATT 결과를 Meta SDK의 advertiser tracking 설정에 반영한다.
- AppsFlyer는 설치 어트리뷰션과 별도 AppsFlyer 이벤트 수집 용도로 유지할 수 있으나, Meta `CompletedRegistration` 전송 경로로 사용하지 않는다.
- SDK 이벤트 전송 실패는 가입 플로우를 막지 않고 개발 환경 로그로 확인한다.
- 이벤트 의미를 변경하거나 새 마케팅 이벤트를 추가할 때는 이 문서를 같은 변경 단위에서 갱신한다.

## iOS ATT 기준

- iOS에서 Meta SDK 또는 AppsFlyer를 광고 성과 측정/맞춤 광고 목적으로 사용하면 ATT를 구현한다.
- ATT 허용 여부는 앱 진입, 회원가입, 심사 제출, 구매 완료를 막는 조건으로 사용하지 않는다.
- 앱 자체 사전 안내는 선택 사항이며, 최종 허용/거부 선택지는 Apple ATT 시스템 팝업에서만 받는다.
- 사전 안내를 표시하는 경우 문구는 다음 기준을 따른다.

```text
더 관련성 높은 광고를 제공하고 광고 성과를 측정하기 위해 권한을 요청합니다.

허용 여부와 관계없이 앱의 주요 기능은 계속 이용하실 수 있습니다.
```

- `NSUserTrackingUsageDescription`은 다음 문구를 사용한다.

```text
더 관련성 높은 광고를 제공하고 광고 성과를 측정하기 위해 기기의 광고 식별자를 사용합니다.
```

- 사전 안내 버튼은 최종 동의처럼 보이는 `허용/거절`이 아니라 `계속`, `나중에`처럼 시스템 팝업 진행 여부만 표현한다.
- 시스템 ATT 팝업은 iOS가 관리하며, 사용자가 거부한 뒤 앱에서 자체 거절 팝업을 반복 노출하지 않는다.
- 거부 이후 재설정 안내가 필요하면 설정/개인정보 화면에서 iOS 설정으로 이동하는 안내만 제공한다.
- ATT 상태가 `notDetermined`일 때만 시스템 팝업 요청을 시도한다.

## Meta SDK 추적 설정 기준

- ATT 허용: Meta SDK advertiser tracking enabled를 `true`로 설정한다.
- ATT 거부/제한/미결정/불가/에러: Meta SDK advertiser tracking enabled를 `false` 또는 제한 상태로 설정한다.
- ATT 요청 또는 상태 조회가 실패해도 기본값은 `false`이며, Meta SDK 초기화 전에 제한 상태를 먼저 반영한다.
- ATT 거부 사용자의 가입/심사/구매 이벤트도 앱 기능 기준으로는 계속 실행되지만, 플랫폼 수신/귀속/리포팅 범위는 Meta SDK, SKAN/AdAttributionKit, AEM 제한을 따른다.
- ATT 거부를 우회하기 위해 IDFA 외 식별자, 해시된 연락처, 디바이스 신호, fingerprinting을 광고 측정 목적으로 결합하지 않는다.
- Android는 Meta 광고 귀속 목적이므로 `AD_ID` 권한과 Meta SDK advertiser ID collection enabled를 유지한다.
- Android `ACCESS_ADSERVICES_*` 권한은 Meta SDK/Appsflyer/Firebase 같은 광고·측정 SDK가 선언한 Android Privacy Sandbox/AdServices 권한이므로 임의 제거하지 않고, Play Console 데이터 보안/광고 ID 신고와 함께 검토한다.

## SKAN/AEM 해석 기준

- SKAN/AdAttributionKit와 Meta AEM은 ATT 거부 사용자를 포함한 보완 측정 경로로 둔다.
- SKAN/AdAttributionKit와 AEM은 지연/집계/모델링 리포팅이므로 실기기 smoke test의 즉시 1건 수신 여부를 대체하지 않는다.
- Meta SDK 직접 이벤트 검증은 Meta Events Manager의 수신 여부로 보고, SKAN/AEM 성과 수치는 캠페인/집계 리포트에서 별도로 해석한다.

## App Store Connect 개인정보 기준

- App Store Connect의 앱 개인정보 답변에서 tracking 사용 여부를 실제 SDK 동작과 일치시킨다.
- Meta SDK, AppsFlyer, 기타 광고/분석 SDK가 수집하는 데이터는 각 SDK privacy manifest와 실제 이벤트 파라미터 기준으로 신고한다.
- 현재 마케팅 이벤트 범위에서 최소 점검할 데이터 유형은 `Device ID`, `Product Interaction`, `Purchase History`다.
- 각 데이터 유형은 실제 사용 목적에 따라 `Third-Party Advertising`, `Analytics`, 필요한 경우 `App Functionality`를 포함해 검토한다.
- 앱의 개인정보 처리방침에는 Meta SDK/AppsFlyer 사용, 광고 성과 측정 목적, ATT 거부 시 기능이 막히지 않는다는 점, SKAN/AdAttributionKit/AEM 같은 집계 측정 사용 가능성을 반영한다.

## 서버 저장 범위

- 현재 목적은 Meta SDK 자동/직접 이벤트와 AppsFlyer 어트리뷰션 이벤트 수신 수를 집계하는 것이다.
- 서버는 외부 마케팅 플랫폼 전송 성공 여부를 자체 DB 원장으로 저장하지 않는다.
- 별도 마케팅 이벤트 원장은 서버가 외부 마케팅 플랫폼으로 이벤트를 직접 전송하거나, 전송 성공/실패 재시도와 감사 이력을 서버에서 보장해야 할 때 별도 DB 변경으로 검토한다.

## 검증 체크리스트

- [ ] Meta Events Manager에서 Android native `activateApp` 기반 앱 설치 이벤트가 수신되는가?
- [ ] Meta Events Manager에서 iOS native `activateApp` 기반 앱 설치 이벤트가 수신되는가?
- [ ] Meta Events Manager에서 `fb_mobile_first_install`가 수동 커스텀 이벤트로 수신되지 않는가?
- [ ] Meta Events Manager에서 Android `fb_mobile_activate_app`이 native `activateApp` 기준으로 수신되는가?
- [ ] Meta Events Manager에서 iOS `fb_mobile_activate_app`이 native `activateApp` 기준으로 수신되는가?
- [ ] Android/iOS `activateApp()` 경로에서 의도하지 않은 deactivate/time-spent 이벤트가 수신되는지 별도 확인했는가?
- [ ] 일반회원 승급심사를 위한 기본정보 제출 API 성공 후 `CompletedRegistration`이 수신되는가?
- [ ] 인증 심사 승인, 소개글 심사 승인, Admin 운영 승인, 기존 회원 프로필 수정, 심사 재제출에서 `CompletedRegistration`이 수신되지 않는가?
- [ ] 사진을 포함한 가입 기본정보 제출 API 성공 후 `fb_step5_woman_photos_enroll`, `fb_step5_man_photos_enroll`이 성별별로 수신되는가?
- [ ] 신규 구매 서버 검증 성공 후 `logPurchase(price, 'KRW')`가 수신되는가?
- [ ] 복원 구매, API 실패, 네트워크 실패, 클라이언트 검증 실패에서는 전환 이벤트가 기록되지 않는가?
- [ ] ATT 동의/거부 상태 모두에서 앱 핵심 플로우가 막히지 않고 Meta 이벤트 수신 여부를 확인했는가?
- [ ] ATT 사전 안내와 Apple 시스템 팝업의 문구/순서가 정책과 일치하는가?
- [ ] ATT 거부/제한/미결정/에러에서 Meta advertiser tracking이 `false` 또는 제한 상태로 반영되는가?
- [ ] Android merged manifest에 `AD_ID` 권한과 `com.facebook.sdk.AdvertiserIDCollectionEnabled=true`가 반영되는가?
- [ ] iOS native `activateApp()` lifecycle이 JS 초기화/ATT 대기 없이 `AppDelegate` 기준으로 수행되는가?
- [ ] ATT 거부 후 자체 거절 팝업을 반복 노출하지 않는가?
- [ ] App Store Connect 앱 개인정보 답변과 `PrivacyInfo.xcprivacy`가 SDK/이벤트 수집 범위와 일치하는가?
- [ ] SKAN/AdAttributionKit, AEM 수치는 지연 집계 보완 지표로 별도 해석하는가?

## 관련 문서

- [회원 심사 단일 정책](member-review-policy.md)
- [회원가입 응답 계약](signup-response-contract.md)
- [로그 정책](log-policy.md)
