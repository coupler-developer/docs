# Firebase Apple SDK CocoaPods 마이그레이션 계획 (2026-05-09)

## 문서 역할

- 역할: `부채`
- 문서 종류: `technical-debt`
- 충돌 시 우선 문서: [엔지니어링 가드레일](../policy/engineering-guardrails.md), [테스트/CI 전략](../policy/testing-strategy.md), [배포 태그/릴리즈 프로세스](../policy/release-process.md)
- 기준 성격: `transition`

## 목적

- `coupler-mobile-app` iOS가 2026년 10월 이후에도 Firebase Apple SDK 업데이트를 받을 수 있도록 Firebase Apple SDK의 CocoaPods 배포 경로에만 의존하지 않는 전환 계획을 관리한다.
- React Native Firebase, CocoaPods, Xcode/iOS SDK 업그레이드가 한 번에 얽혀 배포 리스크가 커지는 상황을 막기 위해 전환 게이트와 검증 기준을 먼저 고정한다.

## 적용 범위

- 대상: `coupler-mobile-app` iOS
- 포함: `@react-native-firebase/app`, `@react-native-firebase/messaging`, `@react-native-firebase/analytics`, iOS Firebase Apple SDK 설치 경로, iOS 빌드/배포 검증
- 제외: `coupler-api`의 `firebase-admin`, Android Firebase Gradle 경로, Firebase 프로젝트 설정 자체

## Technical Debt 평가 (2026-05-09)

## 총평

- 상태 요약: 현재 iOS 앱은 React Native Firebase를 통해 Firebase Apple SDK를 CocoaPods로 설치한다. 2026년 10월 이후 CocoaPods 경로로는 신규 Firebase Apple SDK 버전을 받을 수 없다.
- 우선순위 결론: `P1`. 즉시 장애는 아니지만 앱 스토어 배포 체인, Xcode/iOS SDK 업그레이드, RNFirebase 호환성 검증을 포함하므로 내부 안전 버퍼로 2026년 9월 전 TestFlight 리허설까지 완료하는 것을 목표로 둔다.

## 현재 근거

- `coupler-mobile-app/package.json`은 `@react-native-firebase/analytics`, `@react-native-firebase/app`, `@react-native-firebase/messaging`를 사용한다.
- `coupler-mobile-app/yarn.lock`은 React Native Firebase `22.4.0`을 고정한다.
- `coupler-mobile-app/ios/Podfile.lock`은 `Firebase`, `FirebaseAnalytics`, `FirebaseCore`, `FirebaseMessaging` `11.15.0`을 CocoaPods `trunk`에서 가져온 상태다.
- React Native Firebase podspec은 iOS에서 `Firebase/CoreOnly`, `Firebase/Messaging`, `FirebaseAnalytics/Core`, `FirebaseAnalytics/IdentitySupport`를 CocoaPods dependency로 선언한다.
- `coupler-mobile-app/ios/ritzy/AppDelegate.swift`는 `import Firebase`와 `FirebaseApp.configure()`를 직접 수행한다.
- `coupler-mobile-app/Gemfile`과 `Podfile.lock`은 CocoaPods 사용을 명시한다.

## 외부 제약

- Firebase는 2026년 10월부터 Firebase Apple SDK 신규 버전을 CocoaPods로 배포하지 않는다. 기존 CocoaPods 버전은 계속 설치 가능하지만 신규 기능, 성능 개선, 중요 수정은 받을 수 없다.
- Firebase 공식 문서는 CocoaPods와 Swift Package Manager를 같은 target에서 섞으면 dependency cycle과 build error가 생길 수 있다고 안내한다.
- Firebase 공식 문서는 non-Firebase 의존성이 Swift Package Manager를 지원하지 않으면 Firebase manual installation이 더 안정적인 통합 경로가 될 수 있다고 안내한다.
- React Native Firebase는 각 릴리스가 고정 Firebase native SDK 버전을 기준으로 테스트되며, 임의 SDK 버전 override는 권장/지원 경로가 아니다.

참고:

- [Firebase: Migrate from CocoaPods](https://firebase.google.com/docs/ios/cocoapods-deprecation)
- [Firebase: Apple installation options](https://firebase.google.com/docs/ios/installation-methods)
- [React Native Firebase](https://rnfirebase.io/)

## Debt 목록

### [TD-FIREBASE-APPLE-001] Firebase Apple SDK CocoaPods 배포 종료 대응

- 우선순위: `P1`
- 작업량: `L`
- 현상: iOS Firebase Apple SDK가 React Native Firebase podspec을 통해 CocoaPods로 설치된다.
- 영향: 2026년 10월 이후 CocoaPods 경로에 머물면 Firebase Apple SDK 신규 버전과 중요 수정 반영이 막힌다.
- 근거: `coupler-mobile-app/package.json`, `coupler-mobile-app/ios/Podfile.lock`, `coupler-mobile-app/node_modules/@react-native-firebase/*/*.podspec`
- 해결방향: React Native Firebase 공식 지원 경로를 먼저 확인하고, RNFirebase가 지원하는 방식으로 Firebase Apple SDK 설치 경로를 Swift Package Manager 또는 manual installation으로 전환한다.
- 완료기준: iOS archive와 TestFlight 업로드가 신규 설치 경로에서 성공하고, FCM 토큰/수신/탭 라우팅/토픽 구독/해지가 회귀 없이 동작한다.

### [TD-FIREBASE-APPLE-002] iOS native build 검증 공백

- 우선순위: `P1`
- 작업량: `M`
- 현상: `coupler-mobile-app` GitHub Actions는 lint/typecheck/test/format만 수행하고 iOS native build를 검증하지 않는다.
- 영향: Firebase 설치 경로 또는 Xcode/iOS SDK 변경 후 로컬 성공/배포 실패가 늦게 발견될 수 있다.
- 근거: `coupler-mobile-app/.github/workflows/*.yml`, `docs/content/policy/release-process.md`
- 해결방향: 전환 PR에는 최소 simulator build 또는 별도 macOS runner 리허설 로그를 남기고, 스토어 배포 전 archive/TestFlight 증빙을 릴리즈 기록에 남긴다.
- 완료기준: 전환 PR/릴리즈 기록에 `xcodebuild -version`, `xcrun --sdk iphoneos --show-sdk-version`, pod/SPM/manual 설치 로그, archive/TestFlight 결과가 포함된다.

### [TD-FIREBASE-APPLE-003] Analytics 사용 여부 불명확

- 우선순위: `P2`
- 작업량: `S`
- 현상: `@react-native-firebase/analytics`는 의존성에 있으나 앱 코드에서 직접 import/use 흔적이 확인되지 않는다.
- 영향: 불필요한 Firebase product가 남으면 마이그레이션 범위와 App Store privacy 검토 범위가 커진다.
- 근거: `coupler-mobile-app/package.json`, `coupler-mobile-app/src`, `coupler-mobile-app/App.tsx`
- 해결방향: Firebase Analytics 제품 사용 여부를 Firebase Console/운영 지표 기준으로 확인한다. 사용하지 않으면 RNFB Analytics 의존성 제거를 별도 PR로 먼저 처리한다.
- 완료기준: 유지/제거 결정 근거가 PR에 남고, 제거 시 iOS/Android 빌드와 푸시 기능에 영향이 없음을 검증한다.

## 안전한 마이그레이션 원칙

- 운영 PR에서 Firebase만 먼저 Swift Package Manager로 옮기는 변경은 기본적으로 보류한다. CocoaPods와 Swift Package Manager 혼용은 공식 문서가 경고하는 위험 경로이므로, RNFirebase와 다른 iOS pods의 지원 상태 및 중복 링크 여부를 실험 브랜치에서 먼저 확인한다.
- `$FirebaseSDKVersion` 또는 `FIREBASE_SDK_VERSION` override로 장기 운영하지 않는다. 임시 빌드 우회가 필요하면 제거 조건, 목표 시점, 담당자, 추적 이슈를 남긴다.
- Firebase 기능 변경과 설치 경로 변경을 한 PR에 섞지 않는다. 제품 동작은 유지하고 설치/빌드 경로만 바꾼다.
- Android, `coupler-api` Firebase Admin, 서버 FCM 발송 계약은 이번 전환 범위에 포함하지 않는다.
- 배포 전 최소 1회 TestFlight 리허설을 수행한다. 로컬 simulator 성공만으로 완료하지 않는다.

## 단계별 실행 계획

### 0단계: 베이스라인 고정

- 현재 브랜치에서 `coupler-mobile-app` iOS 빌드가 재현되는지 확인한다.
- 현재 Firebase/RNFirebase/CocoaPods/Xcode 버전을 기록한다.
- `yarn lint`, `yarn typecheck`, `yarn format`, `yarn test:ci` 결과를 남긴다.
- iOS는 `bundle exec pod install`, simulator build, archive 가능 여부를 기록한다.
- FCM smoke test 기준을 확정한다: 권한 요청, FCM token 획득, foreground 수신, background/open 라우팅, topic subscribe/unsubscribe.

### 1단계: 불필요 범위 제거

- `@react-native-firebase/analytics`가 실제로 쓰이는지 확인한다.
- 미사용이면 Analytics 제거 PR을 먼저 분리한다.
- 사용 중이면 App Store privacy disclosure와 Firebase Analytics 설정을 유지 대상으로 명시한다.

### 2단계: React Native Firebase 최신 호환선 검증

- 현재 React Native `0.79.2`와 호환되는 React Native Firebase 최신 버전을 확인한다.
- RNFirebase release note와 migration guide를 확인해 iOS Firebase SDK 설치 경로 변경 지원 여부를 기록한다.
- RNFirebase가 공식적으로 CocoaPods 이후 경로를 지원하면 그 경로를 우선 적용한다.
- 공식 지원이 확인되지 않으면 Firebase SDK를 직접 SPM으로 섞는 변경은 보류하고, manual installation 가능성과 RNFirebase podspec 영향만 별도 실험 브랜치에서 검증한다.

### 3단계: iOS 의존성 설치 방식 결정

- 선택지 A: RNFirebase가 Swift Package Manager 전환을 공식 지원하면 SPM을 우선 검토한다.
- 선택지 B: non-Firebase pods가 남아 SPM/CocoaPods 혼용 위험이 크면 Firebase manual installation을 검토한다.
- 선택지 C: RNFirebase가 아직 전환 경로를 제공하지 않으면 2026년 10월 전 최신 안정 CocoaPods 버전으로 고정하고, RNFirebase 공식 대응을 추적하는 임시 운영 계획을 남긴다.

선택 기준:

- 같은 target에서 CocoaPods와 Swift Package Manager를 함께 쓰는 경우 dependency cycle, 중복 링크, build error 리스크가 검증됐는가.
- RNFirebase podspec 또는 native module 빌드가 Firebase framework를 중복 링크하지 않는가.
- `GoogleService-Info.plist`, APNs, capabilities, entitlements가 그대로 동작하는가.
- Debug/Release archive 모두 성공하는가.

### 4단계: 전환 PR 작성

- 설치 경로 변경 파일만 수정한다.
- `Podfile`, `Podfile.lock`, `.xcworkspace`, Xcode project/package resolution 변경의 의도를 PR 본문에 분리해 설명한다.
- RNFirebase 버전 변경이 필요하면 Firebase 설치 경로 변경과 같은 PR에 넣되, 앱 기능 변경은 포함하지 않는다.
- 변경 후 `DerivedData`, Pods cache, Xcode Package cache를 비운 클린 빌드 로그를 남긴다.

### 5단계: 검증 및 리허설

- JS 품질 게이트: `yarn lint && yarn typecheck && yarn format && yarn test:ci`
- iOS 설치 게이트: 선택한 설치 경로의 clean install 로그
- iOS 빌드 게이트: Debug simulator build, Release archive
- 기능 게이트: FCM token, foreground/background/open notification, topic subscribe/unsubscribe
- 배포 게이트: TestFlight 업로드 성공 및 내부 테스트 디바이스에서 push smoke test 완료

### 6단계: 운영 반영

- 스토어 배포 전 릴리즈 기록에 Xcode/iOS SDK 버전, Firebase/RNFirebase 버전, 설치 경로, TestFlight 결과를 남긴다.
- 배포 후 24시간 동안 FCM 전송 실패율, token refresh 오류, 앱 시작 crash, notification open routing 오류를 확인한다.
- 오류가 발생하면 이전 스토어 빌드와 이전 JS OTA 상태로 롤백 가능한지 먼저 판단한다.

## 롤백 계획

- 설치 경로 전환 PR은 Firebase 기능 변경을 포함하지 않아야 하며, 실패 시 이전 `package.json`, `yarn.lock`, `Podfile`, `Podfile.lock`, Xcode project 상태로 되돌릴 수 있어야 한다.
- TestFlight 리허설 실패 시 App Store 배포를 중단하고 기존 안정 빌드를 유지한다.
- 2026년 10월 전까지 전환이 완료되지 않으면, 마지막 CocoaPods 지원 Firebase/RNFirebase 조합을 명시적으로 고정하고 전환 완료 전까지 Firebase Apple SDK 신규 기능 도입을 금지한다.

## 완료 기준

- `coupler-mobile-app` iOS가 Firebase Apple SDK를 2026년 10월 이후에도 업데이트 가능한 설치 경로로 사용한다.
- 신규 설치 경로에서 Debug simulator build, Release archive, TestFlight 업로드가 성공한다.
- FCM token 획득, foreground/background/open notification, topic subscribe/unsubscribe가 통과한다.
- Analytics를 유지하는 경우 이벤트 수집과 App Store privacy disclosure가 유지 기준과 일치한다.
- 릴리즈 기록에 Xcode/iOS SDK 버전과 Firebase/RNFirebase 버전 증빙이 남아 있다.

## 관련 문서

- [푸시알림 시스템](../architecture/push-notification.md)
- [배포 태그/릴리즈 프로세스](../policy/release-process.md)
- [테스트/CI 전략](../policy/testing-strategy.md)
- [엔지니어링 가드레일](../policy/engineering-guardrails.md)
- [기술 부채 정리](technical-debt.md)
