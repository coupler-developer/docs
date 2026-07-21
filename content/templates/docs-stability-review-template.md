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
- 변경 작업: `<추가 | 수정 | 삭제 | 이동 | 개명 | 분리 | 통합>`
- 대상:
- 직접 연결 문서: `<명시 링크 | 관련 문서 | 같은 도메인 규범 | 역방향 규범 참조 | 영향받는 인덱스/nav/템플릿/검증 스크립트>`
- 제외:
- 조건부 추가 관점: `<없음 | 적용: 보안/권한/결제/API 계약/FSM/상태 전이/푸시/DB/배포/릴리즈/데이터 거버넌스/다중 레포 계약/Policy Composition / Lifecycle Consistency/Docs Taxonomy Transition Readiness 중 해당 항목>`
- N/A 근거:
- 기준 문서:

## 정책 Composition Gate (policy 추가·수정·삭제 시)

| 항목 | 판정 | 근거 |
| --- | --- | --- |
| 대상 정책 전체와 정방향·역방향 규범 참조 검토 |  |  |
| 판정 책임별 단일 SoT와 충돌 해결 순서 |  |  |
| 상태·단계별 진입 조건/허용 구조/Exit Gate |  |  |
| 목적/필수 규칙/예외/검증/완료 정의/체크리스트 정합성 |  |  |
| 상위/세부 정책의 상세 MUST 중복 0건 |  |  |
| 삭제 시 후속 단일 SoT/책임 종료와 정방향·역방향 참조·인덱스 이관 |  |  |
| 마지막 변경 이후 적용할 검증과 rollback 기준점 |  |  |

## 독립 리뷰 판정

구현·문서 구조와 검증 계획을 판정한다. 실제 검증 결과와 최종 Exit Gate는 아래 `결론`에서 결합한다.

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
| Fresh Session / Routing Safety Reviewer |  |  |
| Writing Quality / Style Editor |  |  |
| Domain Implementer |  |  |
| QA / Evidence Reviewer |  |  |
| Validation Architecture / Redundancy Reviewer |  |  |
| Lifecycle Owner |  |  |
| Policy Composition / Lifecycle Consistency Reviewer (policy 조건부 필수) |  |  |
| Docs Taxonomy Transition Readiness Reviewer (조건부) |  |  |
| 기타 조건부 추가 관점 |  |  |
| Finding 병합 |  |  |

| 항목 | 판정 | 근거 |
| --- | --- | --- |
| SoT 충돌 없음 |  |  |
| 분류 체계(taxonomy) 충돌 없음 |  |  |
| 문서/코드 구조가 변경 범위 안에서 SoT, 책임 경계, 중복 관점으로 불필요하게 복잡해지지 않음 |  |  |
| 검증 실행 경로에 근거 없는 중복 없음, 유지한 재검증은 신뢰 경계·baseline·산출물 차이 근거 있음 |  |  |
| 문서 역할 혼재 없음 |  |  |
| `transition`/`임시`/`호환`/`fallback` 제거 조건 또는 미적용 근거 있음 |  |  |
| 시간 의존 사실 최신 근거 있음 |  |  |
| To-Be/임시 구조 부채 또는 추적 문서 연결 있음 |  |  |
| 문서 추가·이동·삭제 시 lifecycle registry stable ID, routing, previousPaths 또는 retired 책임 승계 증빙 있음 |  |  |
| taxonomy/메타데이터/검증 hard gate 변경에 기존 문서 baseline, 단계적 활성화, 적용 범위의 전환 완료 조건 있음 |  |  |
| policy 추가·수정·삭제에 대한 전체 정책·역방향 규범 참조, 책임/우선순위, 상태·단계별 Exit Gate, 전역 절 정합성, 삭제 시 책임 승계 증빙 있음 |  |  |
| 개인 사용자명·개인 개발 장비 절대경로 없음, 공유 환경 경로는 운영 flow/runbook 예외 충족 |  |  |

## Findings

| ID | 상태 | 관점 | 내용 | 근거 | 조치 |
| --- | --- | --- | --- | --- | --- |
| DSR-001 |  |  |  |  |  |

## 기존 부채

| 항목 | 근거 |
| --- | --- |
|  |  |

## 수정-리뷰 반복

| 차수 | 조치 | 독립 재리뷰 판정 | 근거 |
| --- | --- | --- | --- |
| 1 |  |  |  |

## 독립 리뷰 체크포인트

위 `정책 Composition Gate`, `독립 리뷰 판정`, `Findings`와 수정·재리뷰 기록을 모두 완료한 뒤 기록한다.

- 독립 리뷰 완료 근거:
- 열린 Finding: `<0건 | 건수>`
- 체크포인트: `<열린 Finding 0건·검증 대기 | 미도달>`
- 최종 후보: `<비교 baseline + 리뷰 범위의 파일 집합과 내용>`

## 검증

- 명령:
- 최종 후보별 실행 횟수:
- 결과:
- 로그:

## 결론

- 독립 최종 리뷰 체크포인트:
- 최종 후보:
- 마지막 변경 이후 검증:
- 열린 Finding:
- Exit Gate:
- 최종 판정:
- 남은 위험:
