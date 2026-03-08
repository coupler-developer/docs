# 문서 역할 매핑표

## 문서 역할

- 역할: `규범`
- 충돌 시 우선 문서: [엔지니어링 가드레일](engineering-guardrails.md)
- 기준 성격: `transition`
  - 본 문서는 기존 문서를 새 역할 기준으로 정리하기 위한 인벤토리와 전환 기준을 다룬다.

## 목적

- 기존 `policy`, `architecture`, `fsm`, `flow` 문서의 역할을 전수 분류한다.
- 도메인별 규범 문서 1개 원칙의 적용 대상과 예외를 식별한다.
- 후속 단계의 메타 정규화, 규범 단일화, as-is/to-be 정리를 위한 기준표를 제공한다.

## 적용 범위

- `docs/content/policy/**/*.md`
- `docs/content/architecture/**/*.md`
- `docs/content/flows/**/*.md`

## 단일 SoT

- 상위 기준: [엔지니어링 가드레일](engineering-guardrails.md)
- 리뷰 기준: [코드 리뷰 정책](code-review-policy.md)
- 운영 규칙 연결: `content/AGENTS.md`

## 역할 분류 기준

- `규범`: MUST/SHOULD, SoT, 금지 사항, 완료 기준을 정의하는 문서
- `구조 설명`: 저장 구조, 구성요소, 데이터 흐름을 설명하는 문서
- `상태 흐름 설명`: 상태, 전이, 예시 경로를 설명하는 문서
- `시나리오 설명`: 사용자/운영 단계 흐름을 설명하는 문서
- `단일 문서 예외`: 같은 도메인에 문서가 1개뿐이라 규범과 설명을 함께 다루는 문서

## 도메인별 역할 매핑

| 도메인 | 문서 | 목표 역할 | 규범 문서 | 기준 성격 | 후속 조치 |
| --- | --- | --- | --- | --- | --- |
| 공통 | `policy/engineering-guardrails.md` | 규범 | 자기 자신 | as-is | 없음 |
| 공통 | `policy/code-review-policy.md` | 규범 | 자기 자신 | as-is | 없음 |
| 공통 | `policy/testing-strategy.md` | 규범 | 자기 자신 | as-is | 없음 |
| 공통 | `policy/commit-convention.md` | 규범 | 자기 자신 | as-is | 없음 |
| 공통 | `policy/git-branch-strategy.md` | 규범 | 자기 자신 | as-is | 없음 |
| 공통 | `policy/git-sync-rebase-policy.md` | 규범 | 자기 자신 | as-is | 없음 |
| 공통 | `policy/release-process.md` | 규범 | 자기 자신 | as-is | 없음 |
| 공통 | `policy/log-policy.md` | 규범 | 자기 자신 | as-is | 없음 |
| 공통 | `policy/data-governance-policy.md` | 규범 | 자기 자신 | as-is | 없음 |
| 공통 | `policy/db-migration-gate-policy.md` | 규범 | 자기 자신 | as-is | 없음 |
| 공통 | `policy/typescript-migration-plan.md` | 규범 | 자기 자신 | transition | 없음 |
| 공통 | `architecture/repo-overview.md` | 구조 설명 | 단일 문서 예외 | as-is | 없음 |
| 회원 | `architecture/member-review-policy.md` | 규범 | 자기 자신 | transition | 없음 |
| 회원 | `architecture/member-review-fsm.md` | 상태 흐름 설명 | `member-review-policy.md` | as-is | 없음 |
| 회원 | `architecture/member-lifecycle.md` | 상태 흐름 설명 | `member-review-policy.md` | as-is | 없음 |
| 회원 | `architecture/signup-response-contract.md` | 규범 | 자기 자신 | transition | 없음 |
| 회원 | `policy/api-error-contract-policy.md` | 규범 | 자기 자신 | transition | 없음 |
| 매칭 | `policy/matching-ops-policy.md` | 규범 | 자기 자신 | transition | 세부 규칙 이관 필요 |
| 매칭 | `architecture/matching-fsm.md` | 상태 흐름 설명 | `matching-ops-policy.md` | as-is | 세부 규칙 이관 필요 |
| 매칭 | `architecture/matching-key-system.md` | 구조 설명 | `matching-ops-policy.md` | as-is | 세부 규칙 이관 필요 |
| 매칭 | `architecture/matching-schedule-algorithm.md` | 구조 설명 | `matching-ops-policy.md` | as-is | 세부 규칙 이관 필요 |
| 매칭 | `flows/cross-project/matching-flow.md` | 시나리오 설명 | `matching-ops-policy.md` | as-is | 세부 규칙 이관 필요 |
| 결제 | `policy/payment-ops-policy.md` | 규범 | 자기 자신 | as-is | 없음 |
| 결제 | `architecture/payment-system.md` | 구조 설명 | `payment-ops-policy.md` | as-is | 없음 |
| 푸시 | `policy/push-notification-policy.md` | 규범 | 자기 자신 | as-is | 없음 |
| 푸시 | `architecture/push-notification.md` | 구조 설명 | `push-notification-policy.md` | as-is | 없음 |
| 보안/권한 | `policy/security-access-control-policy.md` | 규범 | 자기 자신 | as-is | 없음 |
| 보안/권한 | `architecture/admin-permission.md` | 구조 설명 | `security-access-control-policy.md` | as-is | 없음 |
| 업로드/미디어 | `architecture/upload-media-system.md` | 단일 문서 예외 | 자기 자신 | as-is | 없음 |
| 크론 | `architecture/cron-jobs.md` | 단일 문서 예외 | 자기 자신 | as-is | 없음 |
| 채팅 | `architecture/chat-system.md` | 단일 문서 예외 | 자기 자신 | as-is | 없음 |
| 라운지 | `architecture/lounge-system.md` | 단일 문서 예외 | 자기 자신 | as-is | 없음 |
| 미팅 | `architecture/meeting-system.md` | 단일 문서 예외 | 자기 자신 | as-is | 없음 |
| 모바일 구조 | `architecture/mobile-app-to-be.md` | 구조 설명 | `engineering-guardrails.md` | transition | 없음 |

## 우선 조치 대상

1. 매칭 도메인: 새 규범 문서는 생겼지만 상세 규칙의 중복 이관이 남아 있다.
2. 공통/단일 문서 예외 도메인: 규범과 설명의 분리 필요성을 계속 점검해야 한다.

## 체크리스트

- [ ] 모든 기존 문서가 역할 분류를 가진다
- [ ] 복수 문서 도메인에 규범 문서 1개가 식별된다
- [ ] 규범 문서 부재 도메인이 후속 단계 대상에 포함된다
- [ ] `npm run lint:md` 통과
- [ ] `python3 -m mkdocs build --strict` 통과

## 관련 문서

- [엔지니어링 가드레일](engineering-guardrails.md)
- [코드 리뷰 정책](code-review-policy.md)
- [회원 심사 단일 정책](../architecture/member-review-policy.md)
