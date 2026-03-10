# 매칭 운영 정책

## 문서 역할

- 역할: `규범`
- 문서 종류: `policy`
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
- 진행 상태는 아래 값을 기준으로 사용한다.

| 값 | 상수 | 의미 |
| --- | --- | --- |
| `0` | `PENDING` | 카드 전달됨 |
| `1` | `FEMALE_WANT_SEE` | 여성 만남희망 |
| `2` | `MALE_WANT_SEE` | 남성 만남희망 |
| `3` | `FINAL_CONFIRM` | 여성 최종컨펌 |
| `4` | `SEND_FAVOR_INFO` | 선호정보 전달 |
| `5` | `SUGGEST_SCHEDULE` | 일정 제안 진행중 |
| `6` | `OK_SCHEDULE` | 일정 확정 |
| `7` | `SUGGEST_LOCATION` | 장소 결정 진행중 |
| `8` | `CHAT_OPEN` | 채팅 활성화 |
| `9` | `REVIEW_REQUIRE` | 후기 작성 필요 |
| `10` | `SHARE_CONTRACT` | 연락처 공개 완료 |
| `11` | `DIRECT_MEET` | 직진만남 |

- 취소/종료 상태는 아래 값을 기준으로 사용한다.

| 값 | 상수 | 의미 |
| --- | --- | --- |
| `-1` | `FEMALE_PASS` | 여성 패스 |
| `-2` | `MALE_PASS` | 남성 패스 |
| `-10` | `CANCELED` | 무응답 취소 |
| `-100` | `FINAL_CONFIRM_CANCEL` | 여성 최종컨펌 취소 |
| `-101` | `CONFIRM_NO_REPLY` | 최종컨펌 무응답 |
| `-102` | `FAVOR_INFO_NO_REPLY` | 선호정보 무응답 |
| `-103` | `SCHEDULE_NO_REPLY` | 일정제안 무응답 |
| `-104` | `SCHEDULE_ACCEPT_NO_REPLY` | 일정수락 무응답 |
| `-105` | `SCHEDULE_NOT_SELECTED` | 일정 불합의 |
| `-106` | `LOCATION_NO_REPLY` | 장소결정 무응답 |
| `-107` | `CHAT_ROOM_LEAVE` | 채팅방 나가기 |
| `-108` | `USER_BLAME` | 회원 신고 |
| `-109` | `CHAT_SCHEDULE_CANCEL` | 일정변경 취소 |
| `-110` | `CHAT_3_DAYS_OVER` | 3일 채팅 종료 |

- 대표 진행 경로는 `PENDING -> FEMALE_WANT_SEE -> MALE_WANT_SEE -> FINAL_CONFIRM -> SEND_FAVOR_INFO -> SUGGEST_SCHEDULE -> OK_SCHEDULE -> SUGGEST_LOCATION/CHAT_OPEN -> REVIEW_REQUIRE -> SHARE_CONTRACT` 순서다.
- 상태 도표와 예시 경로 시각화는 [매칭 FSM](../architecture/matching-fsm.md)에 두되, 충돌 시 이 문서가 우선한다.

### 2) 키 소진/환불 기준

- 키 차감/환불은 서버가 판단하고 `t_member_key_log`에 기록한다.
- 핵심 차감 규칙은 아래를 기준으로 사용한다.

| 주체 | 액션 | 키 |
| --- | --- | --- |
| 여성 | 패스 | `-5` |
| 여성 | 남성 프로필 보기 | `-35` |
| 여성 | 천천히 결정하기 | `-5` |
| 남성 | 여성 프로필 보기 | `-10` |
| 남성 | 여성 비디오 보기 | `-15` |
| 남성 | 미니프로필 보기 | `-10` |
| 남성 | 3일 채팅 | `-5` |
| 남성 | 만남 수락 | 등급별 차감 |
| 남성 | 채팅 재활성화 | `-60` |
| 남성 | 직진만남 | `-77` |
| 공통 | 후기 작성 보상 | `+15` |

- 핵심 환불 규칙은 아래를 기준으로 사용한다.

| 상황 | 환불 규칙 |
| --- | --- |
| `MALE_PASS` | 여성 결제 키 전액 환불 |
| `FINAL_CONFIRM_CANCEL` | 남성 결제 키 + 프로필 열람 키 전액 환불 |
| `SCHEDULE_NOT_SELECTED` | 양측 결제 키의 50% 환불 |
| `FEMALE_PASS`, `CHAT_ROOM_LEAVE`, `USER_BLAME`, `CHAT_3_DAYS_OVER` | 환불 없음 |

- 모든 키 변동은 `t_member_key_log`와 `t_member.key`를 함께 기준으로 판정한다.
- 키 항목 예시와 로그 타입 설명은 [매칭 키 시스템](../architecture/matching-key-system.md)에 두되, 충돌 시 이 문서가 우선한다.

### 3) 일정 제안 기준

- 일정 제안/역제안은 서버 검증을 단일 기준으로 사용한다.
- 일정 제안은 최대 4회까지 가능하다.
- 각 제안은 `4~7개` 날짜만 허용한다.
- 모든 날짜는 중복 없이 미래 날짜여야 한다.
- 제안 횟수별 허용 범위는 아래를 기준으로 사용한다.

| 제안 횟수 | 허용 범위 |
| --- | --- |
| 1차 | 내일 ~ 오늘 + 14일 |
| 2차 | 내일 ~ 1차 제안일 + 14일 |
| 3차 | 내일 ~ 1차 제안일 + 14일 |
| 4차 | 1차 제안일 + 15일 ~ 1차 제안일 + 25일 |

- 허용 횟수, 날짜 개수, 범위 조건을 하나라도 위반하면 즉시 실패시킨다.
- 4차 제안까지 합의되지 않으면 상태를 `SCHEDULE_NOT_SELECTED`로 종료하고 양측에 50% 환불을 적용한다.
- 각 제안 이후 다음날 자정까지 응답이 없으면 `SCHEDULE_NO_REPLY` 또는 `SCHEDULE_ACCEPT_NO_REPLY`로 종료한다.
- 예시 범위와 시퀀스 설명은 [매칭 일정 제안 알고리즘](../architecture/matching-schedule-algorithm.md)에 두되, 충돌 시 이 문서가 우선한다.

### 4) 시나리오 문서 역할

- [매칭 플로우](../flows/cross-project/matching-flow.md)는 시나리오 설명 문서다.
- 사용자/운영 흐름 예시를 제공하지만, 상태/키/검증의 규범 문서가 아니다.

## 전환 기준

- 상세 문서는 예시, 시퀀스, 구조 설명만 유지한다.
- 상태 값, 환불 규칙, 일정 판정의 원문 SoT는 이 문서에만 둔다.

## 관련 문서

- [매칭 FSM](../architecture/matching-fsm.md)
- [매칭 키 시스템](../architecture/matching-key-system.md)
- [매칭 일정 제안 알고리즘](../architecture/matching-schedule-algorithm.md)
- [매칭 플로우](../flows/cross-project/matching-flow.md)
