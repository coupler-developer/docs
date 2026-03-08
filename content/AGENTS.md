# AGENTS

- 이 문서에는 문서 인덱스와 에이전트 최소 운영 규칙만 포함한다
- 중복이 없이 다른 개념으로 새 문서가 필요할 경우 새 문서 생성 후 여기에 링크 추가
- 문서 추가/이동/개명 시 `mkdocs.yml`의 `nav`도 반드시 함께 동기화한다
- 작업 완료 전 문서 동기화를 확인한다(필요 시 반영, 불필요 시 근거 기록). 상세 기준은 `content/policy/engineering-guardrails.md`를 단일 SoT로 따른다
- 템플릿 문서는 `content/templates/`에 둔다
- 신규 문서 작성 시 `content/templates/` 템플릿을 우선 사용하고, 적합한 템플릿이 없으면 템플릿부터 추가한 뒤 문서를 작성한다
- 같은 도메인에 `policy`, `architecture`, `fsm`, `flow` 문서가 2개 이상 존재하면 각 문서 상단에 역할, 충돌 시 우선 문서, 기준 성격(`as-is`/`to-be`/`transition`)을 명시한다
- 문서 역할 기준의 단일 SoT는 `content/policy/engineering-guardrails.md`를 따른다
- 새 세션 시작 전에는 아래 Core 4개만 필수 열람한다
  - `content/technical-debt/technical-debt.md`
  - `content/policy/code-review-policy.md`
  - `content/policy/engineering-guardrails.md`
  - `content/policy/testing-strategy.md`
- 새 세션 첫 응답은 아래 형식을 반드시 사용한다
  - `ACK: CORE@YYYY-MM-DD CRP@YYYY-MM-DD`
  - `EVIDENCE: content/technical-debt/technical-debt.md:<line>, content/policy/code-review-policy.md:<line>, content/policy/engineering-guardrails.md:<line>, content/policy/testing-strategy.md:<line>`
  - `CRP`는 `content/policy/code-review-policy.md`를 의미한다
  - `YYYY-MM-DD`는 세션 날짜를 사용한다
- ACK/EVIDENCE 출력 전에는 필수 문서 열람 외 명령 실행/코드 작성/수정을 시작하지 않는다
- 코드 리뷰 관련 답변은 `content/policy/code-review-policy.md`의 "리뷰 근거 표기 의무"를 따른다
  - 근거 없는 일반론/추측 코멘트는 무효로 간주하고, 문서 재독 후 다시 작성한다
- 지시/리뷰에 `DBM-GATE-*`가 포함되면 `content/policy/db-migration-gate-policy.md`를 추가 열람하고 Gate ID 기준으로 근거를 제시한다

## 문서 인덱스

### Architecture

- [회원 라이프사이클](architecture/member-lifecycle.md) - 회원 전체 상태 흐름
- [회원 심사 FSM](architecture/member-review-fsm.md) - 상태머신 및 심사 플로우
- [회원 심사 단일 정책](architecture/member-review-policy.md) - 가입/설정/Admin/Mobile 심사 기준 단일화
- [회원가입 응답 계약](architecture/signup-response-contract.md) - result_code/result_data 역할 분리 최종안
- [매칭 FSM](architecture/matching-fsm.md) - 매칭 상태 머신
- [매칭 키 시스템](architecture/matching-key-system.md) - 키 소진 및 환불 규칙
- [매칭 스케줄 알고리즘](architecture/matching-schedule-algorithm.md)
- [미팅 시스템](architecture/meeting-system.md) - 2:2 그룹 미팅
- [채팅 시스템](architecture/chat-system.md)
- [라운지 시스템](architecture/lounge-system.md) - 커뮤니티
- [결제 시스템](architecture/payment-system.md) - 키 충전 및 인앱결제
- [푸시 알림](architecture/push-notification.md) - FCM
- [관리자 권한](architecture/admin-permission.md)
- [크론 작업](architecture/cron-jobs.md) - 자동화 스케줄
- [업로드/미디어 시스템](architecture/upload-media-system.md) - 파일 업로드, 저장, media_proxy
- [레포지토리 요약](architecture/repo-overview.md)
- [coupler-mobile-app to-be 아키텍처](architecture/mobile-app-to-be.md)

### Technical Debt

- [기술 부채 정리](technical-debt/technical-debt.md)

### Policy

- [Git 브랜치 전략](policy/git-branch-strategy.md) - 브랜치 명명 규칙
- [Git 동기화/Rebase 실행 정책](policy/git-sync-rebase-policy.md) - pull/rebase 기준 및 최신화 검증 규칙
- [커밋 메시지 컨벤션](policy/commit-convention.md) - Conventional Commits 기반
- [배포 태그/릴리즈 프로세스](policy/release-process.md) - 배포 단위 기록(태그)과 GitHub Release 발행
- [로그 정책](policy/log-policy.md) - 개발/운영 로그 규칙
- [API 에러 계약 정책](policy/api-error-contract-policy.md) - API/Admin/Mobile 공통 에러 응답 및 환경 분리 기준
- [보안/접근통제 정책](policy/security-access-control-policy.md) - 인증/인가/권한 변경 통제
- [결제 운영 정책](policy/payment-ops-policy.md) - 결제 검증/환불/정산 운영 기준
- [푸시알림 운영 정책](policy/push-notification-policy.md) - 타입/발송조건/장애대응 기준
- [데이터 거버넌스 정책](policy/data-governance-policy.md) - 분류/보관/접근/삭제 통제
- [코드 리뷰 정책](policy/code-review-policy.md) - PR 작성 및 리뷰 가이드
- [DB Migration Gate 정책](policy/db-migration-gate-policy.md) - DBM-GATE 인덱스/판정 규칙
- [문서 역할 매핑표](policy/document-role-map.md) - 기존 문서 역할 인벤토리 및 전환 기준
- [TypeScript 전환 계획](policy/typescript-migration-plan.md)
- [엔지니어링 가드레일](policy/engineering-guardrails.md) - 스펙 고정, Optional/가드, 네이밍
- [테스트/CI 전략](policy/testing-strategy.md) - 레포별 테스트 및 CI 기준

### Flows

- [매칭 플로우](flows/cross-project/matching-flow.md) - 매칭 카드 → 만남

### Setup

- [개발환경 구성](README.md)
