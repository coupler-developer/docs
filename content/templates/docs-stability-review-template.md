# Docs Stability Review 템플릿

## 문서 역할

- 역할: `시나리오`
- 문서 종류: `flow`
- 충돌 시 우선 문서: `<문서 거버넌스 정책 경로>`
- 기준 성격: `as-is`

## 목적

- docs 안정성 평가 결과를 근거 중심으로 기록한다.

## 범위

- 변경 유형: `<오타 | 문서-only | 코드+문서>`
- 대상:
- 직접 연결 문서: `<명시 링크 | 관련 문서 | 같은 도메인 규범 | 영향받는 인덱스/nav/템플릿/검증 스크립트>`
- 제외:
- 조건부 추가 관점: `<없음 | 적용: 보안/권한/결제/API 계약/FSM/상태 전이/푸시/DB/배포/릴리즈/데이터 거버넌스/다중 레포 계약/Taxonomy Migration Readiness 중 해당 항목>`
- N/A 근거:
- 기준 문서:

## 검증

- 명령:
- 결과:
- 로그:

## 수정-리뷰 반복

| 차수 | 조치 | 검증 | 재리뷰 판정 | 근거 |
| --- | --- | --- | --- | --- |
| 1 |  |  |  |  |

## 판정

판정 값은 `No Findings`, `Finding`, `기존 부채`, `N/A`만 사용한다.
근거는 `path:line` 또는 로그 링크로 적는다.
관점별 상세 로그는 남기지 않고 판정/근거만 기록한다.

| 관문/관점 | 판정 | 근거 |
| --- | --- | --- |
| Scope Gate |  |  |
| SoT / Policy Editor |  |  |
| Taxonomy / Classification Editor |  |  |
| Structure Fitness / Simplification Reviewer |  |  |
| Change Impact / Sync Auditor |  |  |
| First-time Reader |  |  |
| Writing Quality / Style Editor |  |  |
| Domain Implementer |  |  |
| QA / Evidence Reviewer |  |  |
| Lifecycle Owner |  |  |
| Taxonomy Migration Readiness Reviewer (조건부) |  |  |
| 기타 조건부 추가 관점 |  |  |
| Finding 병합 |  |  |
| Exit Gate |  |  |

| 항목 | 판정 | 근거 |
| --- | --- | --- |
| SoT 충돌 없음 |  |  |
| 분류 체계(taxonomy) 충돌 없음 |  |  |
| 문서/코드 구조가 변경 범위 안에서 SoT, 책임 경계, 중복 관점으로 불필요하게 복잡해지지 않음 |  |  |
| 문서 역할 혼재 없음 |  |  |
| `transition`/`임시`/`호환`/`fallback` 제거 조건 또는 미적용 근거 있음 |  |  |
| 시간 의존 사실 최신 근거 있음 |  |  |
| To-Be/임시 구조 부채 또는 추적 문서 연결 있음 |  |  |
| taxonomy/메타데이터/검증 hard gate 변경에 기존 문서 baseline, 단계적 활성화, 적용 범위의 이관 완료 조건 있음 |  |  |
| 개인 사용자명 또는 로컬 절대경로 없음 |  |  |

## Findings

| ID | 상태 | 관점 | 내용 | 근거 | 조치 |
| --- | --- | --- | --- | --- | --- |
| DSR-001 |  |  |  |  |  |

## 기존 부채

| 항목 | 근거 |
| --- | --- |
|  |  |

## 결론

- 마지막 수정 이후 검증:
- 열린 Finding:
- Exit Gate:
- 최종 판정:
- 남은 위험:
