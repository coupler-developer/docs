# AGENTS

## 부트스트랩

- 새 세션, 컨텍스트 유실 후 재진입, 독립 작업 위임 시 이 문서의 `부트스트랩`과 `작업 계약`을 먼저 읽는다.
- 다른 정책은 모든 세션에 일괄 적용하지 않는다. 요청·위험·실행 단계에 해당하는 문서만 아래 라우팅으로 읽는다.
- 첫 응답은 `ACK: BOOT@YYYY-MM-DD`로 시작한다. `YYYY-MM-DD`는 세션 날짜다.
- ACK 전에는 이 문서 열람 외 명령 실행, 코드·문서 작성, 외부 상태 변경을 시작하지 않는다.
- 요청 유형, 권한, 범위, 위험 또는 단일 SoT를 확정할 수 없으면 수정하지 않고 필요한 확인 범위를 보고한다.

## 작업 계약

### 요청 유형과 종료 조건

| 요청 유형 | 기본 동작 | 종료 조건 |
| --- | --- | --- |
| `설명·상태 확인` | 근거를 read-only로 확인 | 범위, 근거, 결론 보고 |
| `진단` | 원인, 영향, 재현 경로 확인 | 원인과 근거 보고; 수정은 별도 요청 |
| `설계·계획` | SoT와 대안 검토 | 포함·제외, 책임 경계, 검증·rollback, 계획 리뷰 |
| `변경·구현` | 요청 범위의 파일 수정 | 구현, 동기화, 마지막 변경 이후 리뷰·검증·최종 판정 |
| `리뷰` | 고정된 대상을 read-only로 평가 | 근거 있는 Finding 또는 `No Findings`; 요청 없이는 수정 금지 |
| `운영·관찰` | 승인된 운영 동작 또는 관찰 | 종료 조건, 결과, 잔여 위험 보고 |

- 요청 유형, 권한, 범위, 실행 단계는 독립적으로 판정한다.
- `설계·계획`, `진단`, `리뷰`는 사용자가 변경까지 명시하지 않으면 파일 변경 권한을 포함하지 않는다.

### 범위와 권한

- 범위는 사용자가 명시하거나 직전 요청에서 합의한 레포·ref·파일·변경으로 고정한다. 짧은 후속 요청은 직전 범위를
  상속하며, 상속할 범위가 없으면 범위 밖 branch/worktree/PR을 탐색하기 전에 사용자에게 확인한다.
- 관련 SoT는 판정 근거이지 자동으로 리뷰·변경 범위에 포함되지 않는다.
- 새 branch/worktree/PR을 만들기 전에만 같은 범위의 기존 작업 후보를 확인한다. 후보가 있어도 자동 전환하거나
  같은 범위의 활성 PR을 병렬 유지하지 않고 사용자 결정을 기다린다.
| 권한 | 포함 조건 |
| --- | --- |
| workspace 파일 변경 | `변경·구현` 요청 |
| 외부 의존성 | 엔지니어링 사전 검토와 별도 명시 승인 |
| branch/worktree | 별도 명시 요청 |
| commit | 별도 명시 요청 또는 `수정하고 PR 올려줘` |
| push | 별도 명시 요청 또는 `수정하고 PR 올려줘` |
| PR | 별도 명시 요청 또는 `수정하고 PR 올려줘` |
| merge/main integration | 별도 명시 요청 |
| reviewer | 개인 또는 팀을 지정한 별도 명시 승인 |
| deploy | 별도 명시 요청 |
| force push·삭제 | 대상과 동작의 별도 명시 승인 |

- 권한은 서로 독립적이며 `수정하고 PR 올려줘`도 reviewer 변경·merge/main integration·deploy를 포함하지
  않는다.
- 외부 의존성은 [엔지니어링 가드레일](policy/engineering-guardrails.md)의 사전 검토를 먼저 적용한다.
- 목표 단계가 권한 집합을 초과하면 첫 파일 변경이나 외부 작업 전에 완료 가능한 단계, 중지 지점과 필요한 권한을
  보고하고 목표 단계와 권한을 확정한다.
- 첫 파일 변경 또는 외부 작업 전에 다음 계약을 기록한다.
  `ROUTE: 요청=<유형> | 레포=<대상> | 산출물=<종류> | 도메인=<범위> | 위험=<표면> | 목표단계=<검증 완료|외부 작업 완료|main 반영 완료|배포 완료> | 권한=<집합> | 필수문서=<경로> | 완료=<종료 조건>`

### 문서 라우팅

1. 요청과 대상에서 산출물·도메인·위험·실행 단계를 식별한다.
2. 아래 표에서 일치하는 행의 문서를 합집합으로 읽는다.
3. 문서 인덱스에서 가장 가까운 문서를 열고 `충돌 시 우선 문서`, 단일 SoT, 직접 연결된 `관련 문서`를 따라간다.
4. 각 판정 책임이 하나의 SoT에 연결될 때까지 반복한다. 충돌·누락이 있으면 구현보다 규범을 먼저 확정한다.

| 적용 신호·단계 | 추가 필수 문서 |
| --- | --- |
| docs 작성·수정·삭제·리뷰 | `content/policy/document-governance-policy.md`와 적용 템플릿 |
| policy 추가·수정·삭제·리뷰 | `content/policy/document-governance-policy.md`의 `정책 Composition Gate` |
| 논리 데이터 모델 | `content/policy/logical-data-model-policy.md`의 적용 절과 충실도 리뷰 판정 |
| DB, migration, DB schema, `DBM-GATE-*` | `content/policy/db-migration-gate-policy.md` |
| API 성공·실패 envelope | `content/policy/api-response-contract-policy.md` |
| API ErrorData·error taxonomy | `content/policy/api-error-contract-policy.md` |
| public DTO·계약 package | `content/policy/api-client-contract-package-policy.md` |
| 페이지/use-case 조회·동작 operation | `content/policy/api-operation-design-policy.md` |
| 인증·인가·관리자 권한·민감정보 | `content/policy/security-access-control-policy.md`, `content/policy/data-governance-policy.md` |
| 결제·환불·정산 | `content/policy/payment-ops-policy.md` |
| 매칭 상태·키·일정 | `content/policy/matching-ops-policy.md` |
| 회원 심사 | `content/policy/member-review-policy.md`와 연결 architecture/FSM |
| 푸시 타입·발송·장애 대응 | `content/policy/push-notification-policy.md` |
| 배포·릴리스·태그 | `content/policy/release-process.md`, `content/policy/release-tag-policy.md`, 적용 runbook |
| 코드·테스트·설정·DB 설계·변경·리뷰 | `content/policy/engineering-guardrails.md` |
| 변경 결과 리뷰·최종 판정·commit·push·PR·merge/main integration | `content/policy/code-review-policy.md` |
| 테스트 변경·검증·`VERIFY` | `content/policy/testing-strategy.md` |
| 기술부채 또는 도메인 완료 판정 | `content/technical-debt/technical-debt.md` |

- 표에 없는 도메인은 비적용으로 추론하지 않고 문서 인덱스와 직접 연결 문서로 폐쇄 탐색한다.
- 경로 링크만 확인하거나 이전 세션 요약으로 대체하지 않고, 적용 절과 Gate를 직접 읽는다.

### 실행과 완료

`BOOT -> CLASSIFY -> ROUTE -> BASELINE -> PLAN -> EXECUTE -> REVIEW -> VERIFY -> EXTERNAL_ACTION -> REPORT`

| 목표 단계 | 완료 조건 | 선택 조건 |
| --- | --- | --- |
| `검증 완료` | 마지막 파일 변경 이후 독립 리뷰와 적용 품질 게이트가 통과한 상태 | `변경·구현`의 기본 목표 |
| `외부 작업 완료` | 승인된 commit·push·PR·tag 등 main integration·deploy 전 외부 작업과 결과 확인이 끝난 상태 | 요청에 해당 외부 작업과 권한이 있음 |
| `main 반영 완료` | 승인된 merge 뒤 원격 main ref의 반영 결과가 검증된 최종 후보와 일치하는 상태 | 요청에 merge/main integration 권한이 있음 |
| `배포 완료` | 승인된 대상 ref 또는 산출물의 deploy와 postcheck가 끝난 상태 | 요청에 deploy 권한이 있음 |

- 목표 단계는 순차 권한 등급이 아니며 해당 단계의 external action 권한을 자동으로 포함하지 않는다. 앞 단계 완료를
  뒤 단계 완료로 확대하지 않는다.
- `cutover 완료`는 `완료=<종료 조건>`에 cutover 대상과 Exit Gate를 고정하고 해당 목표 단계 완료 조건까지
  충족했을 때만 사용한다. 그렇지 않으면 실제로 끝난 목표 단계만 보고한다.
- 비적용 단계는 근거 있는 `N/A`로 판정한다. 기존 작업 확인은 `BASELINE`, 최종 판정은 `REPORT`에 포함한다.
- 마지막 파일 변경 뒤 같은 범위의 독립 리뷰를 수행한다. 열린 Finding이 0건이면
  `열린 Finding 0건·검증 대기`를 기록한 뒤 동일 후보를 검증한다.
- Finding은 원인을 1회 수정하고 동일 범위를 1회 재리뷰한다. 열린 Finding이 남으면 추가 자동 반복 없이
  `Finding`으로 보고한다.
- 리뷰·검증 뒤 파일이 바뀌면 두 결과는 만료된다. 검증 실패는 `No Findings`로 판정하지 않는다.
- commit 전에는 코드 리뷰·브랜치·커밋 정책, push·PR 전에는 코드 리뷰 정책의 Push Gate,
  merge/main integration 전에는 코드 리뷰 정책의 병합 전 체크리스트, deploy 전에는 릴리스 정책과 적용
  runbook을 다시 읽는다.
- 최종 보고에는 범위, 변경, 검증, 문서 동기화, 열린 Finding, 최종 판정, 잔여 위험을 포함한다.

## 문서 인덱스

### Architecture

- [레포지토리 요약](architecture/repo-overview.md)
- [논리 데이터 모델 인덱스](architecture/logical-data-model-index.md) - 도메인 ID와 데이터 소유 문서
- [예정 논리 데이터 모델 인덱스](architecture/logical-data-model-planned-index.md) - 아직 현행으로 승격하지 않은 도메인과 소유 문서
- [coupler-mobile-app to-be 아키텍처](architecture/mobile-app-to-be.md)
- [회원 라이프사이클](architecture/member-lifecycle.md) - 회원 전체 상태 흐름
- [회원 심사 시스템](architecture/member-review-system.md) - 심사 요청·증거·프로필 버전
- [클럽매니저 시스템](architecture/club-manager-system.md) - 클럽매니저·회원 배정·상세 프로필
- [매칭 시스템](architecture/matching-system.md) - 1:1 매칭 저장 책임
- [매칭 키 시스템](architecture/matching-key-system.md) - 키 소진 및 환불 규칙
- [매칭 스케줄 알고리즘](architecture/matching-schedule-algorithm.md)
- [기존 2:2 그룹미팅 시스템](architecture/meeting-system.md) - 구현·배포된 레거시 계약
- [그룹미팅 시스템](architecture/group-meeting-system.md) - 운영 중인 n대n 그룹미팅 계약
- [라운지 시스템](architecture/lounge-system.md) - 커뮤니티
- [채팅 시스템](architecture/chat-system.md)
- [신고·제재 시스템](architecture/moderation-system.md) - 신고·차단·숨김·패널티
- [결제 시스템](architecture/payment-system.md) - 키 충전 및 인앱결제
- [푸시 알림](architecture/push-notification.md) - FCM
- [고객지원 시스템](architecture/support-system.md) - 고객센터 문의·답변
- [관리자 권한](architecture/admin-permission.md) - 관리자 계정·인가 구현 구조 설명
- [플랫폼 기준정보 시스템](architecture/platform-config-system.md) - 설정·앱 버전·공지·기준정보
- [분석 시스템](architecture/analytics-system.md) - 운영 통계 조회 모델
- [크론 작업](architecture/cron-jobs.md) - 자동화 스케줄
- [업로드/미디어 시스템](architecture/upload-media-system.md) - 파일 업로드, 저장, media_proxy
- [테스트용 개발 데이터 시스템](architecture/development-test-data-system.md) - CMS 전체 component route 합성 데이터·화면 검증 구조

### FSM

- [회원 심사 FSM](architecture/member-review-fsm.md) - 상태머신 및 심사 플로우
- [매칭 FSM](architecture/matching-fsm.md) - 매칭 상태 머신

### Technical Debt

- [기술 부채 정리](technical-debt/technical-debt.md)
- [Firebase Apple SDK CocoaPods 마이그레이션](technical-debt/firebase-apple-sdk-cocoapods-migration-plan.md)

### Policy

- [Git 브랜치 전략](policy/git-branch-strategy.md) - 브랜치 명명 규칙
- [Git 동기화/Rebase 실행 정책](policy/git-sync-rebase-policy.md) - pull/rebase 기준 및 최신화 검증 규칙
- [커밋 메시지 컨벤션](policy/commit-convention.md) - Conventional Commits 기반
- [릴리스 태그 정책](policy/release-tag-policy.md) - 릴리스 태그와 스토어 제출 마커 태그 기준
- [릴리스 프로세스](policy/release-process.md) - 릴리스 범위, 기록 상태·metadata·완료·불변 조건
- [로그 정책](policy/log-policy.md) - 개발/운영 로그 규칙
- [API 공통 응답 계약 정책](policy/api-response-contract-policy.md) - API/Admin/Mobile 공통 JSON 응답 envelope 기준
- [API 에러 계약 정책](policy/api-error-contract-policy.md) - API/Admin/Mobile 공통 실패 ErrorData 및 taxonomy 기준
- [API 조회·동작 설계 정책](policy/api-operation-design-policy.md) - 페이지/use-case 조회 집계와 증분 조회·동작 명령·전송 경계 기준
- [API 클라이언트 계약 패키지 정책](policy/api-client-contract-package-policy.md) - `@coupler-developer/coupler-api-contracts` 발행과 Admin/Mobile 소비 전환 기준
- [보안/접근통제 정책](policy/security-access-control-policy.md) - 관리자 역할·권한 매트릭스와 인증/인가 단일 SoT
- [결제 운영 정책](policy/payment-ops-policy.md) - 결제 검증/환불/정산 운영 기준
- [매칭 운영 정책](policy/matching-ops-policy.md) - 매칭 상태/키/일정과 클럽매니저 예약 운영 범위 단일화
- [회원 심사 단일 정책](policy/member-review-policy.md) - 가입/설정/Admin/Mobile 심사 기준 단일화
- [회원가입 응답 계약](policy/signup-response-contract.md) - Envelope `ok`/`data` 역할 분리 최종안
- [푸시알림 운영 정책](policy/push-notification-policy.md) - 타입/발송조건/장애대응 기준
- [마케팅 앱 이벤트 정책](policy/marketing-app-events-policy.md) - Meta/Appsflyer 앱 이벤트 기록 기준
- [데이터 거버넌스 정책](policy/data-governance-policy.md) - 분류/보관/접근/삭제 통제
- [테스트용 개발 데이터 정책](policy/development-test-data-policy.md) - 개발계 합성 데이터 생성/검증/reset 기준
- [서비스 용어 정책](policy/service-terminology-policy.md) - 클럽/클럽매니저 UI 노출명과 신규 N:N 그룹미팅 식별자 전환 기준
- [코드 리뷰 정책](policy/code-review-policy.md) - PR 작성 및 리뷰 가이드
- [DB Migration 유지보수 정책](policy/db-migration-gate-policy.md) - append-only source·기존 적용 이력·동일 소스 커밋 적용 규칙
- [논리 데이터 모델 정책](policy/logical-data-model-policy.md) - 공개 논리 모델 taxonomy와 private 매핑
- [문서 거버넌스 정책](policy/document-governance-policy.md) - 문서 역할, SoT, 동기화 기준
- [엔지니어링 가드레일](policy/engineering-guardrails.md) - 스펙 고정, Optional/가드, 네이밍
- [테스트/CI 전략](policy/testing-strategy.md) - 레포별 테스트 및 CI 기준

### Flows

- [Kakao 네이티브 로그인 플로우](flows/cross-project/kakao-native-login-flow.md) - React Native 브리지, Kakao 네이티브 SDK, Coupler API 토큰 재검증
- [매칭 플로우](flows/cross-project/matching-flow.md) - 매칭 카드 → 만남
- [API 계약 변경 모바일 릴리스 플로우](flows/cross-project/api-contract-mobile-release-flow.md) - 소비자 inventory, `API cutover`, DB runtime/schema 조합에 따른 Mobile 릴리스 절차
- [릴리스 게이트 플로우](flows/cross-project/release-automation-pipeline.md) - 릴리스 gate 순서와 read-only preflight 자동화 기준
- [운영 릴리스 실행 런북](flows/cross-project/production-deploy-command-runbook.md) - scope별 실행 라우팅, 공통 preflight, 서비스/docs 태그
- [DB Migration 실행 런북](flows/cross-project/db-migration-operation-flow.md) - source 작성부터 개발계·운영계 증빙 완료까지의 사람 실행 경로
- [API 운영 배포 런북](flows/cross-project/api-production-deploy-flow.md) - `coupler-api` 운영 PM2 배포·rollback 절차
- [Admin 운영 배포 런북](flows/cross-project/admin-web-production-deploy-flow.md) - `coupler-admin-web` 운영 정적 배포 절차
- [Mobile 운영 릴리스 런북](flows/cross-project/mobile-production-release-flow.md) - Store 제출 증빙·NextPush 배포·rollback 절차
- [테스트용 개발 데이터 운영 흐름](flows/cross-project/development-test-data-flow.md) - plan/apply/verify/coverage/reset 절차
- [개발계 cron 운영 흐름](flows/cross-project/development-cron-operation-flow.md) - 인증·외부 발송 차단·scheduler 설치·rollback 절차
- [Firebase Apple SDK 설치 경로 전환 흐름](flows/cross-project/firebase-apple-sdk-migration-flow.md) - CocoaPods 종료 대응 실행·검증·rollback 절차

### Releases

- [2.5.3 릴리스 실행 기록](releases/v2.5.3.md) - 2.5.3 운영 릴리스 기록
- [2.5.2 릴리스 실행 기록](releases/v2.5.2.md) - 2.5.2 운영 릴리스 기록
- [2.5.1 릴리스 실행 기록](releases/v2.5.1.md) - 2.5.1 운영 릴리스 기록
- [2.5.0 릴리스 실행 기록](releases/v2.5.0.md) - 그룹미팅 알림·CMS 정렬의 DB/API/Admin/NextPush 운영 릴리스 기록
- [2.4.1 릴리스 실행 기록](releases/v2.4.1.md) - Android 2.4.0·iOS 2.4.1 Store 결과와 source 한계 기록
- [2.4.0 릴리스 실행 기록](releases/v2.4.0.md) - 운영 DB migration 98·99 재검증과 canonical execution 부재 기록
- [2.3.0 릴리스 실행 기록](releases/v2.3.0.md) - DB/API/Admin, Mobile Store 2.3.0 (101), NextPush 통합 릴리스 진행 기록
- [2.2.7 릴리스 실행 기록](releases/v2.2.7.md) - contracts 0.1.5 기준 API/Admin/Mobile NextPush 운영 배포 기록
- [2.2.6 릴리스 실행 기록](releases/v2.2.6.md) - contracts package 0.1.2 발행과 Admin/Mobile 소비자 dependency bump 준비 기록
- [2.2.5 릴리스 실행 기록](releases/v2.2.5.md) - API/Admin/Mobile 공통 응답 contract cutover 진행 기록
- [2.2.4 릴리스 실행 기록](releases/v2.2.4.md) - Mobile Store 2.2.1 (100) 출시 진행 기록
- [2.2.3 릴리스 실행 기록](releases/v2.2.3.md) - Admin/API 운영 배포와 Mobile Store 릴리스 분리 기록
- [2.2.2 릴리스 실행 기록](releases/v2.2.2.md) - API 프로필 사진 승인 알림 hotfix와 Mobile NextPush 운영 배포 완료 기록
- [2.2.1 릴리스 실행 기록](releases/v2.2.1.md) - API 삭제 댓글 표시 정체성 hotfix 운영 배포/태그 완료 기록
- [2.2.0 릴리스 실행 기록](releases/v2.2.0.md) - API 운영 태그, Mobile Store 승인 기준점, 제출 마커 증빙 이관 기록
- [2.1.0 릴리스 실행 기록](releases/v2.1.0.md) - API/Admin 운영 태그와 Mobile Store 심사 대기 상태 기록
- [2.0.0 릴리스 실행 기록](releases/v2.0.0.md) - docs 선행 Release Note 생성부터 RDS contract/drop, 서비스 최종 태그까지

### Setup

- [개발환경 구성](README.md)
