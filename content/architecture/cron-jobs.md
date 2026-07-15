# Cron 작업 (자동화 스케줄)

## 문서 역할

- 역할: `설명`
- 문서 종류: `architecture`
- 충돌 시 우선 문서: 작업 목록/실행 주기/트리거 방식은 이 문서, 도메인별 상태 전이/환불/삭제/알림 판정은 각 정책 문서
- 기준 성격: `as-is`

주기적으로 실행되는 자동화 작업을 정리한 문서이다.
이 문서가 우선하는 범위는 작업 목록, 실행 주기, 트리거 방식이다.
도메인별 상태 전이, 환불, 삭제, 알림 판정 규칙의 원문 SoT는 각 정책 문서를 따른다.

## 작업 목록

| 작업                      | 주기            | 설명                          |
| ------------------------- | --------------- | ----------------------------- |
| checkSignup               | 매일 13시, 17시 | 가입심사 미완료 알림          |
| match2Day                 | 30분 간격       | D-2일 매칭 채팅 활성화        |
| matchToday                | 매일 10시       | D-day 매칭 알림               |
| checkReview               | 30분 간격       | 만남 3시간 후 후기 상태 전환  |
| checkMeetMember           | 30분 간격       | 모임 30분 전 인원 미달 체크   |
| checkMatch                | 1분 간격        | 만료 매칭 자동 취소           |
| checkMember               | 매일 0시        | 6개월 미접속 → HOLD           |
| checkMatchCall            | 30분 간격       | 만남 15분 전 보이스콜 활성화  |
| checkDirectFinishMember   | 매일 0시 5분    | 직진만남일 10일 경과 처리     |
| autoDeleteMember          | 매일            | 정책 기준 경과 후 데이터 삭제 |
| remindMatchCard           | 1분 간격        | 카드 만료 3시간 전 알림       |
| sendAutoMatching          | 30분 간격       | 예약 매칭 자동 발송           |
| cleanupOldProfileVersions | 매일            | 정책 기준 프로필 버전 정리    |

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
| 탈퇴/차단 정책 기준 경과 | 개인정보 삭제 |

## FCM 알림 발송

- 알림 타입 추가/변경/장애 대응 기준의 원문 SoT는 [푸시알림 운영 정책](../policy/push-notification-policy.md)을 따른다.

| 작업            | 알림 타입                              |
| --------------- | -------------------------------------- |
| checkSignup     | SIGNUP_PROFILE_EDIT_AGAIN, SIGNUP_FAVOR_INFO, SETTING_MEMBER_REVIEW_DENY_AGAIN |
| match2Day       | MATCH_D_DAY_2                          |
| matchToday      | MATCH_DAY                              |
| checkReview     | MATCH_4_HOUR_PASSED                    |
| checkMatchCall  | MATCH_VOICE_CALL(모바일 알림 노출 제외) |
| checkMeetMember | MEET_DELETED                           |
| remindMatchCard | MATCH_CARD_WILL_DISAPPEAR              |

## 데이터 정리

### autoDeleteMember

탈퇴/차단 회원이 정책 기준 자동 정리 조건에 도달하면:

- 개인정보 삭제 (이름, 직업, 위치 등)
- 키 = 0 초기화
- 연관 데이터 삭제 (19개 테이블)
- 매칭/서비스 이용 기록은 보관
- 삭제 범위와 예외 기준은 [데이터 거버넌스 정책](../policy/data-governance-policy.md)을 따른다.

### cleanupOldProfileVersions

프로필 버전이 정책 기준 자동 정리 조건에 도달하면:

- finalize된 이전 버전 삭제
- 관련 이미지 파일 삭제
- 현재 버전은 유지
- 보관 기한과 삭제 예외는 [데이터 거버넌스 정책](../policy/data-governance-policy.md)을 따른다.

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
GET /admin/cron/checkDirectFinishMember
GET /admin/cron/autoDeleteMember
GET /admin/cron/remindMatchCard
GET /admin/cron/sendAutoMatching
GET /admin/cron/cleanupOldProfileVersions
```

## 실행 방식

- 외부 스케줄러에서 HTTP 호출
- 내부 node-cron 등 미사용

### 개발계 안전 실행

- 개발계 EC2의 user `crontab`에는 endpoint별 `curl`을 직접 등록하지 않는다.
- `coupler-api/ops/cron/development.crontab`은 1분마다 단일 dispatcher를 실행하고, dispatcher가 `Asia/Seoul` 기준 due job을 순차 호출한다.
- dispatcher는 loopback URL만 허용하고 `x-dev-cron-token` 비밀 헤더로 API에 인증한다. 토큰은 repository나 crontab에 넣지 않고 mode `600`의 `/etc/coupler-api/dev-cron.env`에서 API와 dispatcher가 함께 읽는다.
- `flock`으로 이전 run이 끝나지 않은 동안 다음 dispatcher의 중복 실행을 막는다.
- 개발 cron 문맥에서는 `DEV_CRON_EXTERNAL_DELIVERY_ENABLED=false`를 기본값으로 사용해 FCM 외부 전송만 차단한다. 화면 검증에 필요한 `t_alarm`과 도메인 상태 변경은 유지한다.
- `autoDeleteMember`, `cleanupOldProfileVersions`는 `DEV_CRON_DESTRUCTIVE_ENABLED=false`에서 scheduler 대상과 API handler 양쪽이 fail-closed한다.
- `DEV_CRON_*` 설정은 production startup에서 거부한다. 운영 cron의 실행 방식과 환경은 이 개발계 설정으로 변경하지 않는다.
- 공유 개발 데이터 run의 fence가 활성화된 동안 dispatcher 호출은 handler 전에 차단된다. 이는 평상시 개발 cron 활성화 조건이 아니라 합성 데이터 적용·화면 검증 구간만 보호하는 일시 정지 조건이다.

설치·검증·삭제성 작업의 일회성 실행과 rollback은 [개발계 cron 운영 흐름](../flows/cross-project/development-cron-operation-flow.md)을 따른다.

## 관련 문서

- 공유 개발계 합성 데이터 유지 기간의 목표 cron fence 기준: [테스트용 개발 데이터 정책](../policy/development-test-data-policy.md)
- 개발계 cron 설치·검증·rollback: [개발계 cron 운영 흐름](../flows/cross-project/development-cron-operation-flow.md)
