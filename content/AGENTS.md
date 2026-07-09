# AGENTS

- 이 문서에는 문서 인덱스와 에이전트 최소 운영 규칙만 포함한다
- 중복이 없이 다른 개념으로 새 문서가 필요할 경우 새 문서 생성 후 여기에 링크 추가
- 문서 추가/이동/개명 시 `mkdocs.yml`의 `nav`도 반드시 함께 동기화한다
- 작업 완료 전 문서 동기화를 확인한다(필요 시 반영, 불필요 시 근거 기록). 상세 기준은 `content/policy/document-governance-policy.md`를 단일 SoT로 따른다
- 템플릿 문서는 `content/templates/`에 둔다
- 신규 문서 작성 시 `content/templates/` 템플릿을 우선 사용하고, 적합한 템플릿이 없으면 템플릿부터 추가한 뒤 문서를 작성한다
- 같은 도메인에 `policy`, `architecture`, `fsm`, `flow`, `technical-debt` 문서가 2개 이상 존재하면 각 문서 상단에 역할, 문서 종류, 충돌 시 우선 문서, 기준 성격(`as-is`/`to-be`/`transition`)을 명시한다
- 문서 역할은 `규범`, `설명`, `시각화`, `시나리오`, `부채`를 사용한다. `technical-debt`는 문제/우선순위 기록 문서이며 규범 문서를 대체하지 않는다
- 문서 역할 기준의 단일 SoT는 `content/policy/document-governance-policy.md`를 따른다
- 문서 작성/수정/리뷰 시에는 문장 중복 제거보다 "처음 온 사람이 다음 필수 문서까지 실제로 따라 들어갈 수 있는가"를 우선 확인한다
- 사용자와 명시적으로 합의하지 않았거나, 처음 온 사람이 추측해야 하는 임의 축약어/내부 은어를 쓰지 않는다
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
- 커밋 생성/수정 요청을 받으면 staging 또는 commit 전에 `content/policy/code-review-policy.md`, `content/policy/git-branch-strategy.md`, `content/policy/commit-convention.md`를 함께 확인한다
    - 현재 세션에서 마지막 파일 변경 이후 같은 변경 범위를 리뷰한 기록이 없거나 최종 판정이 `No Findings`가 아니면 즉시 멈추고 사용자에게 계속 진행 여부를 물어본다
    - 사용자가 진행을 승인하더라도 커밋 전에는 리뷰 범위, 열린 Finding, 마지막 수정 이후 검증 상태를 다시 보고한다
    - 현재 브랜치가 `main` 또는 `develop`이면 커밋하지 않고 사용자에게 작업 브랜치 생성을 먼저 확인한다
    - 커밋 전 브랜치 적합성은 `content/policy/git-branch-strategy.md`를 함께 확인한다
    - `git status`와 diff를 확인해 사용자 변경, 생성물, 무관 파일이 섞였는지 분리한다
    - staging은 작업 단위별로 수행하며, 한 파일에 무관 변경이 섞이면 `git add -p` 또는 동등한 hunk 단위 staging을 사용한다
    - staging 후 `git diff --cached`로 커밋 범위가 의도한 작업 단위와 일치하는지 재확인한다
    - 커밋 직후 메시지 포맷 확인은 커밋 컨벤션 정책의 CLI 작성 규칙을 따른다
- 브랜치 생성/이름 변경이 필요하면 실행 전에 `content/policy/git-branch-strategy.md`를 확인하고, 브랜치 이름이 해당 규칙을 따르는지 점검한다
- 원격 push, PR 생성, 기존 PR 브랜치 갱신, 태그 push 요청을 받으면 push 전에 `content/policy/code-review-policy.md`의 `Push 전 자체 리뷰 게이트`를 적용한다
    - 마지막 파일 변경 이후 push 대상 범위의 최종 판정이 `No Findings`가 아니거나 열린 Finding이 있으면 push하지 않고 리뷰 범위, 열린 Finding, 마지막 수정 이후 검증 상태를 먼저 보고한다
    - 사용자 승인으로 계속 진행하더라도 push 직전에는 `git status`, push 대상 커밋/태그 범위, 문서 동기화 여부, 적용 품질 게이트 결과를 다시 확인하고 보고한다
    - force push, 태그 삭제, 원격 브랜치 삭제처럼 원격 이력을 바꾸는 작업은 별도 명시 승인 없이는 실행하지 않는다
- 사용자가 "관련 워크트리와 브렌치 정리해줘" 또는 같은 의미의 요청을 하면 `content/policy/git-sync-rebase-policy.md`의 `관련 워크트리와 브랜치 정리 절차`를 따른다
- 지시/리뷰에 `DBM-GATE-*`가 포함되면 `content/policy/db-migration-gate-policy.md`를 추가 열람하고 Gate ID 기준으로 근거를 제시한다
- 테스트 파일(`__tests__`, `*.test.*`, `__snapshots__`) 변경은 `content/policy/testing-strategy.md`의 `테스트 변경 판정` 기준을 따른다
    - 사용자 요청 또는 작업 목표가 `테스트 변경 판정` 기준상 테스트 추가/갱신 대상이면 테스트 파일 변경은 사전 승인된 것으로 본다
    - 테스트 변경 필요성이 작업 중 새로 발견됐고 사용자 요청 또는 작업 목표의 범위를 벗어나면 변경 전 사용자 승인을 받는다
    - 승인 또는 사전 승인 후에는 `content/policy/code-review-policy.md`와 `content/policy/testing-strategy.md`의 품질 기준을 그대로 따르고, 최종 보고에 `테스트 변경 여부`(`추가`/`갱신`/`미변경`)를 남긴다
    - 테스트 파일을 추가/갱신한 경우 최종 보고에 변경 파일과 변경 이유를 함께 남긴다
    - `skip/only`, assertion 완화, 무검토 snapshot 갱신처럼 테스트를 약화하는 변경은 금지한다
    - 필요 시 `docs/.github/scripts/`로 테스트 파일 변경 여부를 확인한다

## 문서 인덱스

### Architecture

- [레포지토리 요약](architecture/repo-overview.md)
- [coupler-mobile-app to-be 아키텍처](architecture/mobile-app-to-be.md)
- [회원 라이프사이클](architecture/member-lifecycle.md) - 회원 전체 상태 흐름
- [매칭 키 시스템](architecture/matching-key-system.md) - 키 소진 및 환불 규칙
- [매칭 스케줄 알고리즘](architecture/matching-schedule-algorithm.md)
- [미팅 시스템](architecture/meeting-system.md) - 2:2 그룹 미팅
- [n대n 로테이션 소개팅 시스템](architecture/rotation-meeting-system.md) - 로테이션 소개팅 to-be 기획
- [라운지 시스템](architecture/lounge-system.md) - 커뮤니티
- [채팅 시스템](architecture/chat-system.md)
- [결제 시스템](architecture/payment-system.md) - 키 충전 및 인앱결제
- [푸시 알림](architecture/push-notification.md) - FCM
- [관리자 권한](architecture/admin-permission.md)
- [크론 작업](architecture/cron-jobs.md) - 자동화 스케줄
- [업로드/미디어 시스템](architecture/upload-media-system.md) - 파일 업로드, 저장, media_proxy

### FSM

- [회원 심사 FSM](architecture/member-review-fsm.md) - 상태머신 및 심사 플로우
- [매칭 FSM](architecture/matching-fsm.md) - 매칭 상태 머신

### Technical Debt

- [기술 부채 정리](technical-debt/technical-debt.md)
- [Firebase Apple SDK CocoaPods 마이그레이션 계획](technical-debt/firebase-apple-sdk-cocoapods-migration-plan.md)

### Policy

- [Git 브랜치 전략](policy/git-branch-strategy.md) - 브랜치 명명 규칙
- [Git 동기화/Rebase 실행 정책](policy/git-sync-rebase-policy.md) - pull/rebase 기준 및 최신화 검증 규칙
- [커밋 메시지 컨벤션](policy/commit-convention.md) - Conventional Commits 기반
- [배포 태그 정책](policy/release-tag-policy.md) - 릴리즈 태그와 스토어 제출 마커 태그 기준
- [배포/릴리즈 프로세스](policy/release-process.md) - 배포 순서, docs GitHub Release, 릴리즈 기록
- [로그 정책](policy/log-policy.md) - 개발/운영 로그 규칙
- [API 공통 응답 계약 정책](policy/api-response-contract-policy.md) - API/Admin/Mobile 공통 JSON 응답 envelope 기준
- [API 에러 계약 정책](policy/api-error-contract-policy.md) - API/Admin/Mobile 공통 실패 ErrorData 및 taxonomy 기준
- [API 클라이언트 계약 패키지 정책](policy/api-client-contract-package-policy.md) - `@coupler-developer/coupler-api-contracts` 발행과 Admin/Mobile 소비 전환 기준
- [보안/접근통제 정책](policy/security-access-control-policy.md) - 인증/인가/권한 변경 통제
- [결제 운영 정책](policy/payment-ops-policy.md) - 결제 검증/환불/정산 운영 기준
- [매칭 운영 정책](policy/matching-ops-policy.md) - 매칭 상태/키/일정 기준 단일화
- [회원 심사 단일 정책](policy/member-review-policy.md) - 가입/설정/Admin/Mobile 심사 기준 단일화
- [회원가입 응답 계약](policy/signup-response-contract.md) - Envelope `ok`/`data` 역할 분리 최종안
- [푸시알림 운영 정책](policy/push-notification-policy.md) - 타입/발송조건/장애대응 기준
- [마케팅 앱 이벤트 정책](policy/marketing-app-events-policy.md) - Meta/Appsflyer 앱 이벤트 기록 기준
- [데이터 거버넌스 정책](policy/data-governance-policy.md) - 분류/보관/접근/삭제 통제
- [서비스 용어 정책](policy/service-terminology-policy.md) - 클럽/클럽매니저 UI 노출명 전환 기준
- [코드 리뷰 정책](policy/code-review-policy.md) - PR 작성 및 리뷰 가이드
- [DB Migration Gate 정책](policy/db-migration-gate-policy.md) - DBM-GATE 인덱스/판정 규칙
- [문서 거버넌스 정책](policy/document-governance-policy.md) - 문서 역할, SoT, 동기화 기준
- [엔지니어링 가드레일](policy/engineering-guardrails.md) - 스펙 고정, Optional/가드, 네이밍
- [테스트/CI 전략](policy/testing-strategy.md) - 레포별 테스트 및 CI 기준

### Flows

- [매칭 플로우](flows/cross-project/matching-flow.md) - 매칭 카드 → 만남
- [API 계약 변경 모바일 릴리즈 플로우](flows/cross-project/api-contract-mobile-release-flow.md) - API 명세 변경 시 기존 앱 호환과 다음 버전 cutover 분리 배포 절차
- [운영 배포 명령어 런북](flows/cross-project/production-deploy-command-runbook.md) - 배포 범위별 DB/API/Admin/Mobile/Tag 실행 명령어
- [Admin 운영 배포 런북](flows/cross-project/admin-web-production-deploy-flow.md) - `coupler-admin-web` 운영 정적 배포 절차

### Releases

- [2.2.5 릴리스 실행 기록](releases/v2.2.5.md) - API/Admin/Mobile 공통 응답 contract cutover 진행 기록
- [2.2.4 릴리스 실행 기록](releases/v2.2.4.md) - Mobile Store 2.2.1 (100) 배포 진행 기록
- [2.2.3 릴리스 실행 기록](releases/v2.2.3.md) - Admin/API 운영 배포와 Mobile Store 릴리스 분리 기록
- [2.2.2 릴리스 실행 기록](releases/v2.2.2.md) - API 프로필 사진 승인 알림 hotfix와 Mobile NextPush 운영 배포 완료 기록
- [2.2.1 릴리스 실행 기록](releases/v2.2.1.md) - API 삭제 댓글 표시 정체성 hotfix 운영 배포/태그 완료 기록
- [2.2.0 릴리스 실행 기록](releases/v2.2.0.md) - API 운영 태그, Mobile Store 승인 기준점, 제출 마커 증빙 이관 기록
- [2.1.0 릴리스 실행 기록](releases/v2.1.0.md) - API/Admin 운영 태그와 Mobile Store 심사 대기 상태 기록
- [2.0.0 릴리스 실행 기록](releases/v2.0.0.md) - docs 선행 Release Note 생성부터 RDS contract/drop, 서비스 최종 태그까지

### Setup

- [개발환경 구성](README.md)
