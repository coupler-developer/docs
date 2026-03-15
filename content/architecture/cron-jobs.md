# Cron 작업 (자동화 스케줄)

## 문서 역할

- 역할: `설명`
- 문서 종류: `architecture`
- 충돌 시 우선 문서: 이 문서
- 기준 성격: `as-is`

주기적으로 실행되는 자동화 작업을 정리한 문서이다.
이 문서가 우선하는 범위는 작업 목록, 실행 주기, 트리거 방식이다.
도메인별 상태 전이, 환불, 삭제, 알림 판정 규칙의 원문 SoT는 각 정책 문서를 따른다.

## 작업 목록

| 작업                      | 주기            | 설명                          |
| ------------------------- | --------------- | ----------------------------- |
| checkSignup               | 매일 13시, 17시 | 가입심사 미완료 알림          |
| match2Day                 | 매일 13시       | D-2일 매칭 채팅 활성화        |
| matchToday                | 매일 10시       | D-day 매칭 알림               |
| checkReview               | 30분 간격       | 만남 3시간 후 후기 상태 전환  |
| checkMeetMember           | 30분 간격       | 모임 30분 전 인원 미달 체크   |
| checkMatch                | 매일            | 만료 매칭 자동 취소           |
| checkMember               | 매일 0시        | 6개월 미접속 → HOLD           |
| checkMatchCall            | 30분 간격       | 만남 15분 전 보이스콜 활성화  |
| autoDeleteMember          | 매일            | 탈퇴/차단 30일 후 데이터 삭제 |
| remindMatchCard           | 매일            | 카드 만료 3시간 전 알림       |
| sendAutoMatching          | 매일            | 예약 매칭 자동 발송           |
| cleanupOldProfileVersions | 매일            | 90일 이상 프로필 버전 정리    |

## 매칭 자동 상태 변경

- 매칭 상태 전이, 만료 판정, 환불 규칙의 원문 SoT는 [매칭 운영 정책](../policy/matching-ops-policy.md)을 따른다.
- 이 섹션은 어떤 cron 작업이 어떤 시점의 매칭을 다루는지 설명하는 요약본이다.

### D-2일 (48시간 전)

```javascript
SUGGEST_LOCATION → CHAT_OPEN
male_badge: NORMAL
female_badge: NORMAL
```

### 만남 3시간 경과

```javascript
CHAT_OPEN → REVIEW_REQUIRE
match_expire_date: 만남일 + 3일 23:59:59
```

### 만료 시 자동 취소

| 작업 | 설명 | 상세 기준 |
| --- | --- | --- |
| `checkMatch` | 만료 조건에 도달한 매칭을 스캔해 종료 처리한다. | 상태 전이/환불/예외는 [매칭 운영 정책](../policy/matching-ops-policy.md), 상태 도표는 [매칭 FSM](./matching-fsm.md) |
| `remindMatchCard` | 카드 만료 전 사용자 리마인드 알림을 발송한다. | 카드 만료 상태와 알림 의미는 [매칭 운영 정책](../policy/matching-ops-policy.md), 알림 타입은 [푸시알림 운영 정책](../policy/push-notification-policy.md) |

## 미팅 자동 상태 변경

| 시점                | 변경                          |
| ------------------- | ----------------------------- |
| 예정시간 1시간 경과 | status → FINISH               |
| 예정시간 2시간 경과 | chat_open → FINISH, 후기 알림 |
| 30분 전 인원 미달   | status → FINISH, 삭제 알림    |

## 회원 자동 상태 변경

- 회원 상태와 심사 상태의 원문 SoT는 [회원 심사 단일 정책](../policy/member-review-policy.md)을 따른다.
- 개인정보 삭제 기준의 원문 SoT는 [데이터 거버넌스 정책](../policy/data-governance-policy.md)을 따른다.

| 조건                     | 변경          |
| ------------------------ | ------------- |
| 마지막 로그인 6개월 경과 | status → HOLD |
| 탈퇴/차단 30일 경과      | 개인정보 삭제 |

## FCM 알림 발송

- 알림 타입 추가/변경/장애 대응 기준의 원문 SoT는 [푸시알림 운영 정책](../policy/push-notification-policy.md)을 따른다.

| 작업            | 알림 타입                              |
| --------------- | -------------------------------------- |
| checkSignup     | SIGNUP_PROFILE_EDIT_AGAIN, SIGNUP_FAVOR_INFO, SETTING_MEMBER_REVIEW_DENY_AGAIN |
| match2Day       | MATCH_D_DAY_2                          |
| matchToday      | MATCH_DAY                              |
| checkReview     | MATCH_4_HOUR_PASSED                    |
| checkMatchCall  | MATCH_VOICE_CALL                       |
| checkMeetMember | MEET_DELETED                           |
| remindMatchCard | MATCH_CARD_WILL_DISAPPEAR              |

## 데이터 정리

### autoDeleteMember

탈퇴/차단 30일 경과 시:

- 개인정보 삭제 (이름, 직업, 위치 등)
- 키 = 0 초기화
- 연관 데이터 삭제 (19개 테이블)
- 매칭/서비스 이용 기록은 보관
- 삭제 범위와 예외 기준은 [데이터 거버넌스 정책](../policy/data-governance-policy.md)을 따른다.

### cleanupOldProfileVersions

90일 이상 오래된 프로필:

- finalize된 이전 버전 삭제
- 관련 이미지 파일 삭제
- 현재 버전은 유지

## API 엔드포인트

모든 작업은 HTTP GET으로 트리거:

```
GET /admin/cron/checkSignup
GET /admin/cron/match2Day
GET /admin/cron/matchToday
GET /admin/cron/checkReview
GET /admin/cron/checkMeetMember
GET /admin/cron/checkMatch
GET /admin/cron/checkMember
GET /admin/cron/checkMatchCall
GET /admin/cron/autoDeleteMember
GET /admin/cron/remindMatchCard
GET /admin/cron/sendAutoMatching
GET /admin/cron/cleanupOldProfileVersions
```

## 실행 방식

- 외부 스케줄러(PM2, crontab 등)에서 HTTP 호출
- 내부 node-cron 등 미사용
