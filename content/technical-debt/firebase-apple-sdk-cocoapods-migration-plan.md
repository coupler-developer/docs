# Firebase Apple SDK CocoaPods 마이그레이션

## 문서 역할

- 역할: `부채`
- 문서 종류: `technical-debt`
- 충돌 시 우선 문서: [엔지니어링 가드레일](../policy/engineering-guardrails.md), [테스트/CI 전략](../policy/testing-strategy.md), [배포/릴리즈 프로세스](../policy/release-process.md)
- 기준 성격: `transition`

## 목적

- 2026년 10월 Firebase Apple SDK CocoaPods 신규 배포 종료에 대응한다.

## 범위

- 포함: Mobile iOS RNFirebase, Firebase 설치 경로, archive·TestFlight·FCM 검증
- 제외: Android, API `firebase-admin`, Firebase 프로젝트 설정

## 현재 상태

- RNFirebase `22.4.0`, Firebase Apple SDK `11.15.0`, CocoaPods 사용.
- `AppDelegate.swift`가 `FirebaseApp.configure()`를 호출.
- Storybook CI는 Xcode 16.2 simulator native build 수행.
- Store archive는 Xcode 26.5로 성공.
- Xcode 26.2+ Release archive·TestFlight·FCM 표준 gate는 없음.

## 외부 조건

- 확인일: `2026-07-16`
- Firebase는 2026년 10월부터 CocoaPods에 신규 SDK를 배포하지 않는다.
- 기존 CocoaPods 버전은 계속 설치 가능하다.
- 최신 CocoaPods 배포는 Xcode `26.2+`, CocoaPods `1.12.0+`를 요구한다.
- CocoaPods·SPM 혼용은 dependency cycle과 build error 위험이 있다.
- RNFirebase [#9010](https://github.com/invertase/react-native-firebase/issues/9010), [#8933](https://github.com/invertase/react-native-firebase/pull/8933)은 미완료 상태다.
- 근거: [Firebase 설치 방식](https://firebase.google.com/docs/ios/installation-methods), [CocoaPods 마이그레이션](https://firebase.google.com/docs/ios/cocoapods-deprecation)

## Debt

### [TD-FIREBASE-APPLE-001] CocoaPods 종료 대응 `P1` `L`

- 현상: RNFirebase가 Firebase Apple SDK를 CocoaPods로 설치한다.
- 영향: 2026년 10월 이후 신규 수정·기능을 받을 수 없다.
- 조치: RNFirebase stable 지원 경로로 SPM 또는 manual installation을 적용한다.
- 완료: 신규 경로 archive·TestFlight·FCM 검증 통과.

### [TD-FIREBASE-APPLE-002] Xcode 26 release gate 공백 `P1` `M`

- 현상: Xcode 16.2 simulator CI와 수동 Xcode 26.5 archive만 있다.
- 영향: native 변경의 Store 회귀를 릴리즈 직전에 발견할 수 있다.
- 조치: Xcode 26.2+ Release archive와 pre-release TestFlight·FCM gate를 추가한다.
- 완료: 도구 버전·설치 로그·archive·TestFlight·FCM 근거 연결.

### [TD-FIREBASE-APPLE-003] Analytics 사용 여부 미확정 `P2` `S`

- 현상: Analytics 의존성은 있으나 앱 코드 직접 사용은 확인되지 않는다.
- 영향: 불필요한 migration·privacy 범위가 남을 수 있다.
- 조치: Firebase Console 기준 사용 여부를 확인하고 미사용 시 제거한다.
- 완료: 유지·제거 근거와 iOS·Android·push 회귀 검증 확보.

## 실행 경계

- 전환 순서, 검증과 rollback은 [Firebase Apple SDK 설치 경로 전환 흐름](../flows/cross-project/firebase-apple-sdk-migration-flow.md)을 따른다.
- 이 문서는 미해결 문제·영향·우선순위·완료 조건만 소유하며 실행 절차를 중복 정의하지 않는다.

## 관련 문서

- [푸시알림 시스템](../architecture/push-notification.md)
- [Firebase Apple SDK 설치 경로 전환 흐름](../flows/cross-project/firebase-apple-sdk-migration-flow.md)
- [배포/릴리즈 프로세스](../policy/release-process.md)
- [테스트/CI 전략](../policy/testing-strategy.md)
- [기술 부채 정리](technical-debt.md)
