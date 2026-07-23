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
| finishGroupMeetings       | 30분 간격       | N:N D-1 13시 개방 알림·시작 24시간 후 종료 영속화 |
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

## N:N 그룹미팅 채팅 개방 알림과 자동 종료

- 채팅 접근 권한 자체는 cron이 아니라 최신 `event_at`으로 계산한다. 최초 확정으로 채팅이 초기화된 활성 행사는
  달력상 전날 KST 13시에 즉시 접근 가능하다.
- `finishGroupMeetings`는 같은 실행에서 아직 처리하지 않은 현재 개방 경계를 최대 100건씩 따라잡아 호스트와
  현재 APPROVED 참가자에게 채팅 개방 알림을 보낸다. 행사 일시 변경으로 경계가 달라지면 새 경계를 기준으로
  다시 한 번 처리하며 같은 경계는 중복 처리하지 않는다.
- 채팅이 열린 뒤 새로 승인된 참가자의 채팅 개방 알림은 cron 재실행이 아니라 Admin 승인 명령이 승인 알림과
  함께 해당 참가자에게 직접 보충한다. 승인 transaction이 새 구성원의 개방 경계를 먼저 기록하므로 다음
  cron은 같은 승인자를 다시 포함하지 않는다.
- Admin 즉발과 cron은 채팅 구성원별 현재 개방 경계를 같은 중복 방지 기준으로 사용한다. cron은 미처리
  구성원만 claim하고 행사 단위 marker는 batch 요약으로만 갱신한다. 수신자 준비 또는 `t_alarm` 저장이
  실패하면 선점한 구성원별 marker와 cron의 행사 요약 marker를 이전 값으로 복구한다.

- 업무 판정의 기준은 KST `event_at + 24시간`이다. 정확히 경계 시각부터 API가 유효 상태를 FINISHED로 계산하므로
  후기 작성, 미작성 후기 신청 제한, 채팅 쓰기 차단과 Admin 변경 차단은 cron 지연·중단의 영향을 받지 않는다.
- `finishGroupMeetings`는 채팅이 초기화된 저장 상태 OPEN·CONFIRMED 종료 대상을 한 번에 최대 100건씩 FINISHED로 영속화하고,
  감사 로그·종료 시스템 메시지·후기 가능 알림을 따라잡는 sweeper다. 이미 후기를 쓴 회원에게는 뒤늦은 후기
  알림을 보내지 않는다.
- 개발계 dispatcher는 매분 실행하지만 이 job은 매시 00분·30분에 선택되므로 정상 상태의 영속화와 종료 시스템
  메시지·후기 가능 알림·감사 로그는 최대 약 30분 늦을 수 있다. `flock` 대기, handler 실패, 배포 중단이나
  backlog가 있으면 더 늦어질 수 있으며 이 지연을 사용자 권한의 정확성 근거로 삼지 않는다.
- 운영 호출 설정은 repository가 아니라 외부 scheduler가 소유한다. 운영도 매시 00분·30분에 호출하도록 설정하고
  배포 Gate에서 실제 주기와 인증·실패 관측을 별도로 확인한다.

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
GET /admin/cron/finishGroupMeetings
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
- `coupler-api/ops/cron/development.crontab`은 1분마다 단일 dispatcher를 실행하고, dispatcher가 `Asia/Seoul` 기준 due job을 manifest 순서대로 실행한다. 서로 다른 job도 같은 매칭·미팅 행을 변경할 수 있으므로 병렬 실행하지 않는다.
- dispatcher는 loopback URL만 허용하고 `x-dev-cron-token` 비밀 헤더로 API에 인증한다. 토큰은 repository나 crontab에 넣지 않고 mode `600`의 `/etc/coupler-api/dev-cron.env`에서 API와 dispatcher가 함께 읽는다.
- `flock`으로 이전 run이 끝나지 않은 동안 다음 dispatcher의 중복 실행을 막는다.
- API는 handler가 반환한 작업이 끝날 때까지 job별 Run Registry lease를 유지한다. 같은 job의 중복 호출은 idempotent success와 `x-dev-cron-result: already-running`으로 건너뛰고, feeder는 active cron lease가 하나라도 있으면 apply claim을 시작하지 않는다.
- cron fence 확인·lease 생성과 feeder claim·`applying`·`resetting` 전환은 같은 짧은 registry mutex 안에서 수행해 확인 직후 상대 작업이 진입하는 경쟁 조건을 차단한다.
- installer는 repository `.runtime`을 mode `700`, log·lock을 mode `600`으로 준비한다. dispatcher log는 10 MiB에서 최근 파일 하나로 회전한다.
- 개발 cron 문맥에서는 `DEV_CRON_EXTERNAL_DELIVERY_ENABLED=false`를 기본값으로 사용해 FCM 외부 전송만 차단한다. 화면 검증에 필요한 `t_alarm`과 도메인 상태 변경은 유지한다.
- `autoDeleteMember`, `cleanupOldProfileVersions`는 `DEV_CRON_DESTRUCTIVE_ENABLED=false`에서 scheduler 대상과 API handler 양쪽이 fail-closed한다.
- `DEV_CRON_*` 설정은 production startup에서 거부한다. 운영 cron의 실행 방식과 환경은 이 개발계 설정으로 변경하지 않는다.
- 개발 cron은 active namespace 소유권에서 합성 회원과 연결 meeting을 읽고 14개 job에 `REAL_ONLY` target policy를 적용한다. 정상 개발 데이터는 처리하고 합성 member·match·meeting·reservation·profile은 변경하지 않는다.
- 합성 데이터가 `planning`, `applying`, `resetting`이거나 fenced `cleaned` finalization 대기 상태이면 idempotent success와 `x-dev-cron-result: maintenance`를 반환하고 dispatcher는 `SKIP`으로 기록한다. `applied`, `failed`, `cleanup_failed`에서는 cron을 멈추지 않고 합성 target만 제외한다.
- registry 소유권이 없는 합성 root나 읽을 수 없는 registry는 handler 전에 fail-closed한다. 데이터 주입을 위해 crontab 전체를 직접 끄거나 소유권 실패를 `ALL_TARGETS`로 우회하지 않는다.

설치·검증·삭제성 작업의 일회성 실행과 rollback은 [개발계 cron 운영 흐름](../flows/cross-project/development-cron-operation-flow.md)을 따른다.

## 관련 문서

- 공유 개발계 합성 데이터 유지 기간의 목표 cron fence 기준: [테스트용 개발 데이터 정책](../policy/development-test-data-policy.md)
- 개발계 cron 설치·검증·rollback: [개발계 cron 운영 흐름](../flows/cross-project/development-cron-operation-flow.md)
