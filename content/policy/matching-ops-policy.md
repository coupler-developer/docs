# 매칭 운영 정책

## 문서 역할

- 역할: `규범`
- 충돌 시 우선 문서: 이 문서
- 기준 성격: `transition`

## 목적

- 매칭 상태, 키 소진/환불, 일정 제안, 사용자 시나리오의 기준 문서를 하나로 고정한다.
- `matching-fsm`, `matching-key-system`, `matching-schedule-algorithm`, `matching-flow`의 역할을 설명 문서로 정리한다.

## 적용 범위

- `coupler-api`, `coupler-mobile-app`, `coupler-admin-web`
- 매칭 상태 전이, 키 차감/환불, 일정 제안 범위 검증, 매칭 사용자 흐름

## 단일 SoT

- 상위 기술 원칙: [엔지니어링 가드레일](engineering-guardrails.md)
- 리뷰/증빙 기준: [코드 리뷰 정책](code-review-policy.md)
- 매칭 상태 읽기/판정 SoT: 서버의 `t_match.status`
- 키 정산 SoT: 서버의 `t_member_key_log`, `t_member.key`
- 일정 제안 검증 SoT: 서버 검증 로직

## 필수 규칙

### 1) 상태 전이 기준

- 매칭 진행/취소/종료 상태는 서버의 `t_match.status`를 단일 기준으로 사용한다.
- 모바일/어드민은 상태 전이를 재구현하지 않고 서버 상태를 표시한다.
- 상태 값, 대표 경로, 종료 상태 예시는 [매칭 FSM](../architecture/matching-fsm.md)을 따른다. 충돌 시 이 문서가 우선한다.

### 2) 키 소진/환불 기준

- 키 차감/환불은 서버가 판단하고 `t_member_key_log`에 기록한다.
- 환불 조건과 환불 비율은 서버 규칙을 단일 기준으로 사용한다.
- 키 항목 예시와 로그 타입 설명은 [매칭 키 시스템](../architecture/matching-key-system.md)을 따른다. 충돌 시 이 문서가 우선한다.

### 3) 일정 제안 기준

- 일정 제안/역제안은 서버 검증을 단일 기준으로 사용한다.
- 제안 횟수, 날짜 개수, 허용 범위 위반은 즉시 실패시킨다.
- 예시 범위와 시퀀스 설명은 [매칭 일정 제안 알고리즘](../architecture/matching-schedule-algorithm.md)을 따른다. 충돌 시 이 문서가 우선한다.

### 4) 시나리오 문서 역할

- [매칭 플로우](../flows/cross-project/matching-flow.md)는 시나리오 설명 문서다.
- 사용자/운영 흐름 예시를 제공하지만, 상태/키/검증의 규범 문서가 아니다.

## 전환 기준

- 기존 매칭 문서의 상세 규칙은 점진적으로 이 문서 기준에 맞춰 정리한다.
- 전환 완료 전까지는 상세 문서가 설명 문서 역할을 유지하되, 충돌 시 이 문서가 우선한다.

## 관련 문서

- [매칭 FSM](../architecture/matching-fsm.md)
- [매칭 키 시스템](../architecture/matching-key-system.md)
- [매칭 일정 제안 알고리즘](../architecture/matching-schedule-algorithm.md)
- [매칭 플로우](../flows/cross-project/matching-flow.md)
