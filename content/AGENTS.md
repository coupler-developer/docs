# AGENTS

- 이 문서에는 문서 인덱스만 가능
- 중복이 없이 다른 개념으로 새 문서가 필요할 경우 새 문서 생성 후 여기에 링크 추가

## 문서 인덱스

### Architecture

- [회원 생명주기](architecture/member-lifecycle.md) - 회원 전체 상태 흐름
- [회원 심사 FSM](architecture/member-review-fsm.md) - 상태머신 및 심사 플로우
- [프로필 이미지 마이그레이션](architecture/member-review-image-migration-plan.md)
- [매칭 FSM](architecture/matching-fsm.md) - 매칭 상태 머신
- [매칭 키 시스템](architecture/matching-key-system.md) - 키 소진 및 환불 규칙
- [매칭 일정 제안 알고리즘](architecture/matching-schedule-algorithm.md)
- [미팅 시스템](architecture/meeting-system.md) - 2:2 그룹 미팅
- [채팅 시스템](architecture/chat-system.md)
- [라운지 시스템](architecture/lounge-system.md) - 커뮤니티
- [결제 시스템](architecture/payment-system.md) - 키 충전 및 인앱결제
- [푸시알림 시스템](architecture/push-notification.md) - FCM
- [관리자 권한 시스템](architecture/admin-permission.md)
- [Cron 작업](architecture/cron-jobs.md) - 자동화 스케줄
- [업로드/미디어 시스템](architecture/upload-media-system.md) - 파일 업로드, 저장, media_proxy
- [레포지토리 요약](architecture/repo-overview.md)
- [coupler-mobile-app to-be 아키텍처](architecture/mobile-app-to-be.md)

### Technical Debt

- [기술 부채 정리](technical-debt.md)

### Policy

- [Git 브랜치 전략](policy/git-branch-strategy.md) - 브랜치 명명 규칙
- [커밋 메시지 컨벤션](policy/commit-convention.md) - Conventional Commits 기반
- [배포 태그/릴리즈 프로세스](policy/release-process.md) - 배포 단위 기록(태그)과 GitHub Release 발행
- [로그 정책](policy/log-policy.md) - 개발/운영 로그 규칙
- [코드 리뷰 정책](policy/code-review-policy.md) - PR 작성 및 리뷰 가이드
- [TypeScript 전환 계획](policy/typescript-migration-plan.md)
- [엔지니어링 가드레일](policy/engineering-guardrails.md) - 스펙 고정, Optional/가드, 네이밍
- [테스트/CI 전략](policy/testing-strategy.md) - 레포별 테스트 및 CI 기준

### Flows

- [사용자 등록 플로우](flows/cross-project/user-registration-flow.md) - 회원가입 → 심사
- [사용자 인증 플로우](flows/coupler-mobile-app/user-authentication-flow.md) - 로그인
- [매칭 플로우](flows/cross-project/matching-flow.md) - 매칭 카드 → 만남
- [프로필 관리 플로우](flows/cross-project/profile-management-flow.md) - 프로필 수정 → 재심사

### Setup

- [개발환경 구성](README.md)
