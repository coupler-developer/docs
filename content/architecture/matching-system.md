# 매칭 시스템

## 문서 역할

- 역할: `설명`
- 문서 종류: `architecture`
- 충돌 시 우선 문서: [매칭 운영 정책](../policy/matching-ops-policy.md)
- 기준 성격: `as-is`

1:1 매칭의 저장 책임을 설명한다. 상태 전이는 [매칭 FSM](matching-fsm.md), 일정 합의 규칙은
[매칭 일정 제안 알고리즘](matching-schedule-algorithm.md)을 참고한다.

## 범위

- 매칭 생명주기와 참여 회원
- 일정 제안·합의, 통화, 후기와 상태 이력
- 자동 추천 후보와 추천 기준
- 채팅 메시지는 [채팅 시스템](chat-system.md)이 소유한다.

## 논리 데이터 모델

- 도메인 ID: `matching`

### 논리 엔티티

| 논리 ID | 표시명 | 구조 유형 | 기록 역할 | 책임 | 최고 데이터 분류 | 생명주기 |
| --- | --- | --- | --- | --- | --- | --- |
| `matching.match` | 1:1 매칭 | root | state | 두 회원의 매칭 상태와 현재 진행 정보 | 민감 | 완료·취소 뒤 운영 이력을 보존하고 개인정보는 정책에 따라 정리 |
| `matching.schedule` | 매칭 일정 | child | state | 일정 제안·역제안·합의 결과 | 내부 | 매칭 종료 후 이력으로 보존 |
| `matching.call` | 매칭 통화 | child | history | 통화 요청·수락과 통화 시간 | 민감 | 운영·분쟁 처리 기간 동안 보존 |
| `matching.review` | 매칭 후기 | child | history | 만남 결과와 회원 후기 | 민감 | 개인정보 정리 후 비식별 이력만 보존 가능 |
| `matching.event-history` | 매칭 이벤트 이력 | child | history | 상태 변경, Key 처리와 운영 메시지 | 내부 | append-only 이력으로 보존 |
| `matching.reservation` | 매칭 후보 예약 | root | history | 자동 매칭 후보와 실패 사유 | 내부 | 실행 결과 확인 기간 동안 보존 |
| `matching.reservation-policy` | 매칭 예약 기준 | root | reference | 자동 매칭 횟수·연령·등급 범위 | 내부 | 운영 설정 변경 시 갱신 |

### 관계

| 출발 논리 ID | 관계 유형 | 도착 논리 ID | 카디널리티 | 소유·삭제 규칙 |
| --- | --- | --- | --- | --- |
| `matching.match` | associates | `member.member` | N:M | 하나의 매칭에는 서로 다른 두 회원만 참여 |
| `matching.match` | owns | `matching.schedule` | 1:N | 매칭 종료 뒤에도 제안 이력을 보존 |
| `matching.match` | owns | `matching.call` | 1:N | 매칭 이력과 함께 보존 |
| `matching.match` | owns | `matching.review` | 1:N | 회원당 후기 중복을 허용하지 않음 |
| `matching.match` | owns | `matching.event-history` | 1:N | 원천 매칭 삭제 없이 이력을 유지 |
| `matching.reservation` | references | `matching.reservation-policy` | N:1 | 실행 시점에 적용한 기준을 운영 로그로 추적 |

### 불변조건

| 규칙 ID | 관련 논리 ID | 불변조건 | 기준 문서 |
| --- | --- | --- | --- |
| `MATCHING-INV-001` | `matching.match` | 동일 매칭의 두 참여 회원은 같을 수 없다 | [매칭 운영 정책](../policy/matching-ops-policy.md) |
| `MATCHING-INV-002` | `matching.schedule` | 확정 일정은 허용된 제안·수락 상태 전이를 거쳐야 한다 | [매칭 일정 제안 알고리즘](matching-schedule-algorithm.md) |
| `MATCHING-INV-003` | `matching.event-history` | 상태 변경과 Key 정산 이력은 원천 상태 변경과 같은 결론을 가져야 한다 | [매칭 운영 정책](../policy/matching-ops-policy.md) |

## 관련 문서

- [매칭 운영 정책](../policy/matching-ops-policy.md)
- [매칭 FSM](matching-fsm.md)
- [매칭 일정 제안 알고리즘](matching-schedule-algorithm.md)
- [매칭 Key 시스템](matching-key-system.md)
- [채팅 시스템](chat-system.md)
