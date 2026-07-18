# Firebase Apple SDK 설치 경로 전환 흐름

## 문서 역할

- 역할: `시나리오`
- 문서 종류: `flow`
- 충돌 시 우선 문서: [엔지니어링 가드레일](../../policy/engineering-guardrails.md), [테스트/CI 전략](../../policy/testing-strategy.md), [배포/릴리즈 프로세스](../../policy/release-process.md)
- 기준 성격: `transition`

## 목적

- Mobile iOS의 Firebase Apple SDK 설치 경로를 CocoaPods에서 RNFirebase가 공식 지원하는 경로로 전환할 때
  필요한 실행·검증·rollback 순서를 고정한다.
- 미해결 문제와 우선순위는 [Firebase Apple SDK CocoaPods 마이그레이션 부채](../../technical-debt/firebase-apple-sdk-cocoapods-migration-plan.md)에서 추적한다.

## 진입 조건

- RNFirebase stable release가 지원하는 설치 경로를 확인한다.
- 현재 RNFirebase·Firebase Apple SDK·CocoaPods·Xcode 버전과 FCM 기준 동작을 기록한다.
- Firebase Analytics 유지 여부와 privacy 영향 범위를 결정한다.
- 미병합 upstream 변경을 직접 이식하거나 제거 조건 없는 SDK version override를 전환안으로 사용하지 않는다.

## 실행 순서

1. Firebase 기능 변경과 설치 경로 변경을 분리한다.
2. 선택한 설치 경로 하나만 적용하고 CocoaPods·SPM 혼용 상태를 남기지 않는다.
3. 의존성을 새로 설치한 clean Debug simulator build를 확인한다.
4. Release archive를 생성하고 서명·Firebase 초기화 오류가 없는지 확인한다.
5. TestFlight 배포본에서 앱 시작과 Firebase 초기화를 확인한다.
6. 실기기에서 FCM token 발급, 수신, 탭 라우팅과 사용 중인 topic 동작을 확인한다.
7. 릴리스 기록에 버전, 설치 경로와 각 검증 결과를 남긴다.

## 검증

| 범위 | 통과 기준 |
| --- | --- |
| 의존성 | 지원 경로 하나만 사용하고 clean install이 재현됨 |
| Debug | simulator build와 앱 시작 성공 |
| Release | archive와 TestFlight 설치·실행 성공 |
| Push | 실기기 FCM token·수신·탭 라우팅·사용 topic 성공 |
| Privacy | Analytics 유지·제거 결론과 privacy 설정 일치 |

## Rollback

- clean build 또는 archive가 실패하면 이전 dependency, lockfile, Podfile과 Xcode project 기준점으로 복원한다.
- TestFlight 또는 실기기 FCM 검증이 실패하면 Store 배포를 중단하고 이전 설치 경로를 유지한다.
- 지원 경로 전환이 기한 안에 완료되지 않으면 마지막 검증된 CocoaPods 조합을 임시 고정하고 기술부채의
  완료 상태는 열어 둔다.

## 종료 조건

- RNFirebase stable 지원 설치 경로에서 Debug, Release archive, TestFlight와 실기기 FCM 검증이 통과한다.
- Analytics·privacy 결론과 릴리스 증빙이 남고, CocoaPods 종료 대응과 release gate 부채의 완료 조건이
  충족된다.

## 관련 문서

- [Firebase Apple SDK CocoaPods 마이그레이션 부채](../../technical-debt/firebase-apple-sdk-cocoapods-migration-plan.md)
- [푸시알림 시스템](../../architecture/push-notification.md)
- [배포/릴리즈 프로세스](../../policy/release-process.md)
- [테스트/CI 전략](../../policy/testing-strategy.md)
