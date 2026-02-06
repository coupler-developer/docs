# 매칭 상태 머신 (Matching FSM)

매칭의 전체 상태 흐름을 정리한 문서이다.

## 매칭 상태 (MATCH_STATUS)

### 진행 상태

| 값  | 상수               | 의미            | 다음 액션          |
| --- | ------------------ | --------------- | ------------------ |
| 0   | `PENDING`          | 카드 전달됨     | 여성 응답 대기     |
| 1   | `FEMALE_WANT_SEE`  | 여성 만남희망   | 남성 응답 대기     |
| 2   | `MALE_WANT_SEE`    | 남성 만남희망   | 여성 최종컨펌 대기 |
| 3   | `FINAL_CONFIRM`    | 여성 최종컨펌   | 선호정보 전달      |
| 4   | `SEND_FAVOR_INFO`  | 선호정보 전달됨 | 남성 일정 제안     |
| 5   | `SUGGEST_SCHEDULE` | 일정 제안됨     | 상대방 수락/역제안 |
| 6   | `OK_SCHEDULE`      | 일정 확정       | 장소 결정          |
| 7   | `SUGGEST_LOCATION` | 장소 결정됨     | 채팅 활성화        |
| 8   | `CHAT_OPEN`        | 채팅 활성화     | 3일간 채팅         |
| 9   | `REVIEW_REQUIRE`   | 후기 작성 필요  | 후기 작성          |
| 10  | `SHARE_CONTRACT`   | 연락처 공개     | 완료               |
| 11  | `DIRECT_MEET`      | 직진만남        | 진지한 만남 진행   |

### 취소 상태

| 값   | 상수                       | 의미               | 환불      |
| ---- | -------------------------- | ------------------ | --------- |
| -1   | `FEMALE_PASS`              | 여성 패스          | 없음      |
| -2   | `MALE_PASS`                | 남성 패스          | 여성 전액 |
| -10  | `CANCELED`                 | 무응답 취소        | 조건부    |
| -100 | `FINAL_CONFIRM_CANCEL`     | 여성 최종컨펌 취소 | 남성 전액 |
| -101 | `CONFIRM_NO_REPLY`         | 최종컨펌 무응답    | 조건부    |
| -102 | `FAVOR_INFO_NO_REPLY`      | 선호정보 무응답    | 조건부    |
| -103 | `SCHEDULE_NO_REPLY`        | 일정제안 무응답    | 조건부    |
| -104 | `SCHEDULE_ACCEPT_NO_REPLY` | 일정수락 무응답    | 조건부    |
| -105 | `SCHEDULE_NOT_SELECTED`    | 일정 불합의        | 양쪽 50%  |
| -106 | `LOCATION_NO_REPLY`        | 장소결정 무응답    | 조건부    |
| -107 | `CHAT_ROOM_LEAVE`          | 채팅방 나가기      | 없음      |
| -108 | `USER_BLAME`               | 회원 신고          | 없음      |
| -109 | `CHAT_SCHEDULE_CANCEL`     | 일정변경 취소      | 없음      |
| -110 | `CHAT_3_DAYS_OVER`         | 3일 채팅 종료      | 없음      |

## 상태 전환 FSM

```mermaid
stateDiagram-v2
    [*] --> PENDING : 관리자 카드 전달

    state "카드 전달\nPENDING (0)" as PENDING
    state "여성 만남희망\nFEMALE_WANT_SEE (1)" as F_WANT
    state "남성 만남희망\nMALE_WANT_SEE (2)" as M_WANT
    state "최종컨펌\nFINAL_CONFIRM (3)" as CONFIRM
    state "선호정보 전달\nSEND_FAVOR_INFO (4)" as FAVOR
    state "일정 제안\nSUGGEST_SCHEDULE (5)" as SCHEDULE
    state "일정 확정\nOK_SCHEDULE (6)" as OK
    state "장소 결정\nSUGGEST_LOCATION (7)" as LOCATION
    state "채팅 활성화\nCHAT_OPEN (8)" as CHAT
    state "후기 작성\nREVIEW_REQUIRE (9)" as REVIEW
    state "취소" as CANCEL

    PENDING --> F_WANT : 여성 만남희망
    PENDING --> CANCEL : 여성 패스 / 3시간 만료

    F_WANT --> M_WANT : 남성 만남희망
    F_WANT --> CANCEL : 남성 패스 / 3일 만료

    M_WANT --> CONFIRM : 여성 수락
    M_WANT --> CANCEL : 여성 취소 / 다음날 자정 만료

    CONFIRM --> FAVOR : 선호정보 전달

    FAVOR --> SCHEDULE : 남성 일정 제안
    FAVOR --> CANCEL : 다음날 자정 만료

    SCHEDULE --> OK : 일정 수락
    SCHEDULE --> SCHEDULE : 역제안 (최대 4회)
    SCHEDULE --> CANCEL : 무응답 / 4회 불합의

    OK --> LOCATION : 장소 결정
    OK --> CHAT : 채팅 활성화

    LOCATION --> CHAT : 채팅 활성화

    CHAT --> REVIEW : 만남 후 3시간
    CHAT --> CANCEL : 채팅방 나가기 / 3일 종료

    REVIEW --> [*] : 후기 작성 완료
```

## 단계별 만료 시간

| 상태             | 만료 시간             | 만료 시 상태                    |
| ---------------- | --------------------- | ------------------------------- |
| PENDING          | 3시간                 | 카드 삭제                       |
| FEMALE_WANT_SEE  | 3일                   | CANCELED (-10)                  |
| MALE_WANT_SEE    | 다음날 자정           | CONFIRM_NO_REPLY (-101)         |
| SEND_FAVOR_INFO  | 다음날 자정           | FAVOR_INFO_NO_REPLY (-102)      |
| SUGGEST_SCHEDULE | 다음날 자정           | SCHEDULE_NO_REPLY (-103)        |
| OK_SCHEDULE      | 만남일 or 다음날 자정 | SCHEDULE_ACCEPT_NO_REPLY (-104) |
| CHAT_OPEN        | 3일                   | CHAT_3_DAYS_OVER (-110)         |

## 특수 경로

### 3일 채팅 (남성 전용)

```mermaid
stateDiagram-v2
    PENDING --> CHAT_OPEN : 3일 채팅 선택 (키 -5)
    CHAT_OPEN --> CHAT_3_DAYS_OVER : 3일 후
```

- 정규 매칭 과정을 건너뛰고 바로 채팅
- 별도 키 소진 (-5)


### 직진만남

```mermaid
stateDiagram-v2
    REVIEW_REQUIRE --> DIRECT_MEET : 직진만남 신청 + 수락
```

- 후기 작성 후에만 가능
- 별도 키 소진 (-77)


### 채팅방 재활성화

```mermaid
stateDiagram-v2
    CHAT_3_DAYS_OVER --> CHAT_OPEN : 재활성화 요청 + 수락 (키 -60)
```

## 큐레이터 제안 상태 (CURATOR_STATUS)

| 값  | 상수            | 의미                          |
| --- | --------------- | ----------------------------- |
| 0   | `NONE`          | CMS 전달 카드                 |
| 1   | `PENDING`       | 큐레이터 제안                 |
| 2   | `MALE_WANT_SEE` | 남성 수락                     |
| 3   | `FROM_CURATOR`  | 큐레이터 제안으로 시작된 매칭 |
| -1  | `MALE_PASS`     | 남성 패스                     |
| -2  | `ADMIN_DENY`    | 관리자 거절                   |

## 근거 (코드 기준)

- 상태 상수: `coupler-api/config/constant.js`
- 매칭 로직: `coupler-api/controller/app/v1/match.js`
- 매칭 모델: `coupler-api/model/match.js`
- 라우팅: `coupler-api/routes/app/v1/match.js`
