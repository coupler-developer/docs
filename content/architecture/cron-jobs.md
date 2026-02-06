# Cron 작업 (자동화 스케줄)

주기적으로 실행되는 자동화 작업을 정리한 문서이다.

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

| 상태             | 만료 시                  | 환불                |
| ---------------- | ------------------------ | ------------------- |
| PENDING          | CANCELED                 | -                   |
| FEMALE_WANT_SEE  | CANCELED                 | 여성 키             |
| MALE_WANT_SEE    | CONFIRM_NO_REPLY         | 남성 키 + 프로필 키 |
| FINAL_CONFIRM    | FAVOR_INFO_NO_REPLY      | 남성 키 + 프로필 키 |
| SEND_FAVOR_INFO  | SCHEDULE_NO_REPLY        | 제안자 키           |
| SUGGEST_SCHEDULE | SCHEDULE_ACCEPT_NO_REPLY | 환불                |
| OK_SCHEDULE      | LOCATION_NO_REPLY        | 여성 키             |
| CHAT_OPEN        | CHAT_3_DAYS_OVER         | -                   |

## 미팅 자동 상태 변경

| 시점                | 변경                          |
| ------------------- | ----------------------------- |
| 예정시간 1시간 경과 | status → FINISH               |
| 예정시간 2시간 경과 | chat_open → FINISH, 후기 알림 |
| 30분 전 인원 미달   | status → FINISH, 삭제 알림    |

## 회원 자동 상태 변경

| 조건                     | 변경          |
| ------------------------ | ------------- |
| 마지막 로그인 6개월 경과 | status → HOLD |
| 탈퇴/차단 30일 경과      | 개인정보 삭제 |

## FCM 알림 발송

| 작업            | 알림 타입                              |
| --------------- | -------------------------------------- |
| checkSignup     | SIGNUP_PROFILE_EDIT, SIGNUP_FAVOR_INFO |
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


## 근거 (코드 기준)

- 컨트롤러: `coupler-api/controller/admin/cron.js`
- 라우터: `coupler-api/routes/admin/cron.js`
- 매칭 모델: `coupler-api/model/match.js`
