# n대n 로테이션 소개팅 시스템

## 문서 역할

- 역할: `설명`
- 문서 종류: `architecture`
- 충돌 시 우선 문서: [보안/접근통제 정책](../policy/security-access-control-policy.md), [결제 운영 정책](../policy/payment-ops-policy.md), [푸시알림 운영 정책](../policy/push-notification-policy.md), [데이터 거버넌스 정책](../policy/data-governance-policy.md)
- 기준 성격: `to-be`

제공된 화면 기획과 2026-07-08 기준 API/Admin/Mobile/DB를 대조한 1차 구현 기준이다.
기존 2:2 그룹 미팅의 UI와 처리 패턴만 참고하고 `rotation` 도메인의 DB/API는 분리한다.

## 확정 범위

1차 범위는 `행사 생성 -> 모집 -> 신청 -> Admin 승인/거절 -> 참가 확정 -> 그룹 채팅 -> 종료 -> 후기`다.

- 포함: 행사 목록/상세/내 모임, 긴 상세 이미지, 성별 정원, 신청/승인/거절, 미니프로필 열람,
  그룹 채팅/unread, 행사·회원 신고, 후기와 Key 보상, 푸시, 운영 감사
- 제외: 현장 체크인, 좌석/회전 라운드, 라운드별 호감 선택, 전역 회원 패널티, 외부 결제/정산
- 호스트는 참가 정원에서 제외한다.
- 남녀 정원은 각각 2명 이상 20명 이하로 고정한다.
- 신청 자체에는 Key를 차감하지 않는다. 화면의 입금 확인은 외부 확인 후 Admin 승인으로 표현한다.
- 사진 미공개 행사의 미니프로필은 기존 설정 `t_setting.id=16`, 사진 공개 행사의 사진프로필은
  `t_setting.id=18`, 후기 보상은 `t_setting.id=20`의 서버 값을 사용한다. 거래 row에는 실제 적용한
  값을 `t_member_key_log.key/key_total`로 남기며 클라이언트가 보낸 Key 값은 사용하지 않는다.
- 참가 확정은 남녀 승인 인원이 각각 2명 이상이고 모든 대기 신청을 처리한 뒤 Admin이 수행한다.
  확정 transaction에서 채팅방을 연다.
- Admin CMS의 운영 목적 프로필 조회는 무료이며 감사 로그를 남긴다. Mobile에서는 호스트와 승인
  참가자 모두 다른 회원의 프로필을 최초 열람할 때 Key를 차감한다.

## 기존 구조 재사용 기준

| 대상 | 판정 |
| --- | --- |
| `t_meeting*`, `/meeting/*`, `MEET_*` FCM | 데이터/상태/타입 재사용 금지 |
| `t_member`, 승인 프로필 | 회원 조회 SoT로 재사용 |
| `t_admin` | Admin 인증 주체로 재사용 |
| 매니저 긴 이미지 처리 | upload/polling/worker/slice 코드 패턴 재사용 |
| `t_manager_detail_profile_*` | 매니저 FK이므로 행사 row 저장 금지 |
| `t_member_key_log` | 전체 Key 원장으로 함께 기록 |
| `t_alarm` | 로테이션 알림도 기존 수신자/type/content/target 구조로 저장 |

## DB 공통 기준

- 신규 테이블은 MySQL 8.4.9와 MariaDB 10.6.24 공통 DDL만 사용하고 모든 `CREATE TABLE` 끝에
  `ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci`를 명시한다.
- PK/FK는 기존 스키마와 `t_alarm.target`에 맞춰 signed `INT AUTO_INCREMENT`를 사용한다. 1차 범위에는
  21억 건을 넘는 단일 테이블이 없으므로 `BIGINT`를 선반영하지 않는다.
- 행사/신청/채팅 같은 비즈니스 상태는 `TINYINT`와 서버 enum을 1:1로 고정한다. 긴 이미지 worker 상태만
  재사용 코드와 맞춰 폐쇄형 ASCII `VARCHAR(20)`을 사용한다.
- `created_at`은 `DEFAULT CURRENT_TIMESTAMP`, `updated_at`은
  `DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP`를 사용한다.
- `client_message_id`, `*_idempotency_key`, action/status 문자열은
  `CHARACTER SET ascii COLLATE ascii_bin`으로 저장해 대소문자/locale 비교 차이를 막는다.
- host/event/application/chat/profile view/review/report/action log는 hard delete하지 않는다. event mood는
  DRAFT 편집 중 교체할 수 있고 media version/slice만 아래 cleanup 기준에 따라 정리할 수 있다.
- 회원/Admin 삭제 뒤에도 운영 기록이 필요한 FK는 nullable + `ON DELETE SET NULL`을 사용한다.
- 상태 변경, Key 변경, 채팅방 개설까지만 원천 transaction에서 수행한다. 알림은 commit 성공 후
  `sendFCMPush()` 한 경로에서만 전송·저장하며 로테이션 코드가 `t_alarm`을 직접 insert하지 않는다.
- 정원 승인은 행사 row를 `SELECT ... FOR UPDATE`로 잠그고 승인 수를 다시 집계한다.
- 재전송 key는 행위 주체 범위의 UNIQUE로 멱등 처리한다. unique 충돌 시 같은 주체의 기존 성공 결과만
  반환하고 다른 주체의 row를 반환하지 않는다.

## 최종 테이블 구성

필수 테이블은 13개다. 신청과 참가자를 분리하지 않고, 도메인별 상태 이력과 감사 로그를
`t_rotation_action_log` 하나로 통합한다.

| 번호 | 테이블 | 책임 |
| --- | --- | --- |
| 1 | `t_rotation_host` | Admin과 호스트 회원 연결 |
| 2 | `t_rotation_event` | 행사/모집/확정 생명주기 |
| 3 | `t_rotation_event_mood` | 행사 분위기 다중값 정규화 |
| 4 | `t_rotation_event_detail_image_version` | 긴 이미지 처리 버전 |
| 5 | `t_rotation_event_detail_image_slice` | 긴 이미지 slice |
| 6 | `t_rotation_application` | 신청과 참가 자격 SoT |
| 7 | `t_rotation_chat_room` | 행사별 채팅방 식별자와 마지막 메시지 |
| 8 | `t_rotation_chat_member` | 채팅 구성원 principal과 unread 경계 |
| 9 | `t_rotation_chat_message` | 일반/시스템 메시지 |
| 10 | `t_rotation_profile_view` | 미니/사진프로필 최초 열람과 과금 |
| 11 | `t_rotation_review` | 종료 후기와 보상 snapshot |
| 12 | `t_rotation_report` | 행사/회원 신고 |
| 13 | `t_rotation_action_log` | 상태 변경과 운영 감사 통합 로그 |

## 정규화 결정

- 행사 분위기는 `event_mood` 관계 테이블로 분리해 한 컬럼에 다중 코드를 저장하지 않는다.
- application의 gender/alias와 chat HOST alias snapshot은 현재 회원정보의 복제가 아니라 행사 당시
  표시값을 보존하는 시간축 데이터다. 현재 프로필 SoT로 사용하지 않는다.
- profile view는 대상 application을, review는 작성자 application을 직접 참조한다. 행사/대상 회원을
  다시 저장하지 않고 application에서 조회한다.
- 채팅방의 송신 가능 여부는 event.status, 참가자의 채팅 자격은 application.status에서 판정한다. 별도
  room/member 상태와 퇴장 시각을 중복 저장하지 않는다.
- profile view 종류와 Key 설정은 OPEN 뒤 불변인 event.photo_public에서 판정하므로 profile_type을
  중복 저장하지 않는다.
- chat member는 `application_id IS NULL`이면 HOST, 값이 있으면 PARTICIPANT로 판정해 role을 중복
  저장하지 않는다. `host_room_id`는 방별 HOST 1명을 MySQL/MariaDB 공통 UNIQUE로 강제하기 위한
  STORED generated column이며 API 데이터로 노출하지 않는다.
- profile view/review는 적용된 기존 `t_member_key_log.id`를 직접 참조한다. 변동량/잔액을 별도
  로테이션 원장에 중복 저장하지 않으며 각 원천 UNIQUE가 재처리 멱등성의 최종 DB guard다.
- action log의 actor_id와 action/target_id는 삭제 후에도 남아야 하는 감사 snapshot이다.
  비즈니스 관계 판정에는 사용하지 않고 event_id와 원천 테이블을 기준으로 판정한다.
- report의 reporter/target member ID도 신고 당시 감사 snapshot으로 보존하며 회원 FK를 두지 않는다.
  접수 시 회원/행사 관계를 server transaction에서 검증하고 회원 삭제 뒤에는 원천 회원과 다시 연결하지 않는다.
- 화면 기획에 JSON 감사 상세나 가변 알림 payload 보관 요구가 없으므로 신규 JSON 컬럼은 만들지 않는다.
  로테이션 알림은 기존 `t_alarm`의 type/content/target과 서버 FCM 상수를 사용한다.

### 기존 `t_alarm` 매핑

- `member`: 수신 `t_member.id`
- `type`: 충돌 검증을 마친 신규 `ROTATION_*` FCM type
- `content`: type별 서버 i18n 문구를 확정해 저장
- `target`: 행사/신청/후기 알림은 `t_rotation_event.id`, 채팅 알림은 `t_rotation_chat_room.id`
- Mobile은 type으로 target 종류를 판정한다. 추가 route/payload 컬럼은 만들지 않는다.
- application 상태 version, `client_message_id`, profile view/review UNIQUE 등으로 원천 write의 중복
  반영을 막는다.
  API는 신규 write가 실제 1건 commit된 경우에만 기존 `sendFCMPush()`를 한 번 호출한다.
- `sendFCMPush()`가 FCM과 `t_alarm` 저장의 단일 책임자다. 로테이션 코드의 별도 `t_alarm` insert,
  outbox/delivery/retry 테이블과 payload 컬럼은 만들지 않는다.

## 테이블 정의

### 1. `t_rotation_host`

| 컬럼 | 타입 | Null | 기본값 | 설명 |
| --- | --- | --- | --- | --- |
| id | INT | N | AUTO_INCREMENT | PK |
| admin_id | INT | N | - | `t_admin.id` |
| member_id | INT | Y | NULL | 호스트 Mobile 신원 |
| status | TINYINT | N | 1 | 0=INACTIVE, 1=ACTIVE |
| created_at | DATETIME | N | CURRENT_TIMESTAMP | 생성 시각 |
| updated_at | DATETIME | N | CURRENT_TIMESTAMP | 수정 시각 |

- `UNIQUE(admin_id)`, `UNIQUE(member_id)`
- 연결 시 `t_admin.super=0`인 파트너 Admin과 유효한 Mobile 회원인지 server에서 검증한다.
- 호스트 회원 삭제 절차는 같은 transaction에서 host를 INACTIVE로 바꾼 뒤 회원을 삭제한다.
- 연결/해제는 Super Admin만 수행하고 action log에 남긴다.

### 2. `t_rotation_event`

| 컬럼 | 타입 | Null | 기본값 | 설명 |
| --- | --- | --- | --- | --- |
| id | INT | N | AUTO_INCREMENT | PK |
| host_id | INT | N | - | `t_rotation_host.id` |
| title | VARCHAR(255) | N | - | 행사명 |
| thumbnail_path | VARCHAR(255) | N | - | 목록 이미지 상대경로 |
| detail_text | TEXT | Y | NULL | 이미지 외 안내문 |
| detail_image_version_id | INT | Y | NULL | 현재 ready 긴 이미지 |
| event_at | DATETIME | N | - | 모임 일시 |
| application_close_at | DATETIME | N | - | 신청 마감 시각 |
| location | VARCHAR(255) | N | - | 장소 |
| fee_amount | INT UNSIGNED | N | 0 | 화면 표시 회비, 0=없음 |
| photo_public | TINYINT | N | 0 | 0=미니프로필, 1=사진 공개 |
| male_capacity | TINYINT UNSIGNED | N | - | 남성 정원 2~20 |
| female_capacity | TINYINT UNSIGNED | N | - | 여성 정원 2~20 |
| status | TINYINT | N | 0 | 행사 상태 |
| version | INT UNSIGNED | N | 1 | optimistic lock |
| create_idempotency_key | VARCHAR(128) CHARACTER SET ascii COLLATE ascii_bin | N | - | 행사 생성 재전송 방지 |
| created_at | DATETIME | N | CURRENT_TIMESTAMP | 생성 시각 |
| updated_at | DATETIME | N | CURRENT_TIMESTAMP | 수정 시각 |

- `INDEX(status, created_at, id)`, `INDEX(status, application_close_at)`,
  `INDEX(host_id, status, created_at, id)`
- `UNIQUE(host_id, create_idempotency_key)`
- 모집 시작은 별도 시각 컬럼 없이 `DRAFT -> OPEN` action log 시각으로 기록한다.
- `OPEN` 이후 title, 일시, 장소, 정원, 사진 공개 여부 변경은 신청자 영향 때문에 금지한다.

### 3. `t_rotation_event_mood`

다중 분위기 코드를 event 문자열에 합치지 않고 관계 row로 저장한다.

| 컬럼 | 타입 | Null | 기본값 | 설명 |
| --- | --- | --- | --- | --- |
| event_id | INT | N | - | 행사 |
| mood_code | TINYINT UNSIGNED | N | - | 기존 `MEET_MOOD` 코드 1~6 |

- `PRIMARY KEY(event_id, mood_code)`

### 4. `t_rotation_event_detail_image_version`

| 컬럼 | 타입 | Null | 기본값 | 설명 |
| --- | --- | --- | --- | --- |
| id | INT | N | AUTO_INCREMENT | PK |
| event_id | INT | Y | NULL | draft는 null, attach 후 행사 ID |
| source_image_path | VARCHAR(255) | N | - | 원본 상대경로 |
| source_width | INT UNSIGNED | N | - | 원본 폭 |
| source_height | INT UNSIGNED | N | - | 원본 높이 |
| target_width | INT UNSIGNED | N | 1080 | 변환 폭 |
| slice_height | INT UNSIGNED | N | 2048 | slice 기준 높이 |
| slice_count | INT UNSIGNED | N | 0 | slice 수 |
| total_bytes | BIGINT | N | 0 | slice 총 byte, 기존 매니저 worker 타입과 동일 |
| status | VARCHAR(20) CHARACTER SET ascii COLLATE ascii_bin | N | 'pending' | pending/processing/ready/failed/discarded |
| error_message | VARCHAR(255) | Y | NULL | 실패 사유 |
| created_by_admin_id | INT | Y | NULL | 업로드 Admin |
| created_at | DATETIME | N | CURRENT_TIMESTAMP | 생성 시각 |
| processing_started_at | DATETIME | Y | NULL | worker 시작 |
| completed_at | DATETIME | Y | NULL | 완료/실패 시각 |

- `UNIQUE(id, event_id)`, `INDEX(event_id, created_at)`, `INDEX(status, created_at)`
- 신규 upload는 `created_by_admin_id`를 반드시 채운다. nullable은 Admin 삭제 시
  `ON DELETE SET NULL`을 허용하기 위한 보관 예외다.
- ready version만 행사에 attach한다. attach 시 `event_id`를 동시에 설정한다.
- ready 전환 transaction에서 slice_index가 0부터 `slice_count - 1`까지 연속인지,
  `slice_count = COUNT(slice)`, `total_bytes = SUM(slice.byte_size)`인지 검증한다.
- 교체/clear된 이전 version은 discarded로 바꾸고 파일 cleanup 대상으로 처리한다.

### 5. `t_rotation_event_detail_image_slice`

| 컬럼 | 타입 | Null | 기본값 | 설명 |
| --- | --- | --- | --- | --- |
| id | INT | N | AUTO_INCREMENT | PK |
| version_id | INT | N | - | 이미지 version |
| slice_index | INT UNSIGNED | N | - | 0부터 시작하는 순서 |
| image_path | VARCHAR(255) | N | - | WebP 상대경로 |
| width | INT UNSIGNED | N | - | 폭 |
| height | INT UNSIGNED | N | - | 높이 |
| byte_size | INT UNSIGNED | N | - | byte 크기 |
| created_at | DATETIME | N | CURRENT_TIMESTAMP | 생성 시각 |

- `UNIQUE(version_id, slice_index)`

### 6. `t_rotation_application`

신청과 승인 후 참가 자격을 한 row로 관리한다.

| 컬럼 | 타입 | Null | 기본값 | 설명 |
| --- | --- | --- | --- | --- |
| id | INT | N | AUTO_INCREMENT | PK |
| event_id | INT | N | - | 행사 |
| member_id | INT | Y | NULL | 신청 회원 |
| gender_snapshot | CHAR(1) CHARACTER SET ascii COLLATE ascii_bin | N | - | 신청 시 M/F |
| alias_snapshot | VARCHAR(255) | N | - | 행사 표시 별칭 |
| status | TINYINT | N | 0 | 신청 상태 |
| version | INT UNSIGNED | N | 1 | 동시 승인 방지 |
| approved_at | DATETIME | Y | NULL | 승인 시각 |
| left_at | DATETIME | Y | NULL | 승인 후 퇴장 시각 |
| created_at | DATETIME | N | CURRENT_TIMESTAMP | 신청 시각 |
| updated_at | DATETIME | N | CURRENT_TIMESTAMP | 상태 변경 시각 |

- `UNIQUE(event_id, member_id)`
- `INDEX(event_id, status, gender_snapshot)`, `INDEX(member_id, status, event_id)`
- 신규 신청의 `member_id`는 반드시 채운다. nullable은 회원 개인정보 삭제 후 신청 이력을 보존하기 위한
  `ON DELETE SET NULL` 예외다.
- 승인/거절/취소/퇴장 사유와 actor는 같은 transaction의 action log에 기록한다.
- 행사 CONFIRMED 이후 신규 승인/거절과 신청 재개를 금지한다.

### 7. `t_rotation_chat_room`

| 컬럼 | 타입 | Null | 기본값 | 설명 |
| --- | --- | --- | --- | --- |
| id | INT | N | AUTO_INCREMENT | PK |
| event_id | INT | N | - | 행사 |
| last_message_id | INT | Y | NULL | 마지막 메시지 |
| created_at | DATETIME | N | CURRENT_TIMESTAMP | 개설 시각 |

- `UNIQUE(event_id)`
- 행사 CONFIRMED transaction에서 한 번만 생성한다. 송신 가능 상태는 event CONFIRMED만 허용하며
  FINISHED/CANCELED는 event 상태만으로 읽기 전용 종료를 판정한다.

### 8. `t_rotation_chat_member`

| 컬럼 | 타입 | Null | 기본값 | 설명 |
| --- | --- | --- | --- | --- |
| id | INT | N | AUTO_INCREMENT | PK |
| room_id | INT | N | - | 채팅방 |
| application_id | INT | Y | NULL | 참가자는 신청 ID, 호스트는 null |
| host_room_id | INT GENERATED ALWAYS AS (CASE WHEN application_id IS NULL THEN room_id ELSE NULL END) STORED | Y | GENERATED | 방별 HOST 1명 제약용 |
| host_alias_snapshot | VARCHAR(255) | Y | NULL | HOST의 채팅 표시 별칭 |
| last_read_message_id | INT | Y | NULL | unread 경계 |
| created_at | DATETIME | N | CURRENT_TIMESTAMP | 구성원 생성 시각 |

- `UNIQUE(application_id)`, `UNIQUE(host_room_id)`, `INDEX(room_id, id)`
- 호스트 row는 `application_id IS NULL`이고 host alias를 snapshot으로 저장한다. 참가자 row는 생성 시
  APPROVED application을 참조하고 이후 application이 LEFT가 되어도 메시지 표시 이력 때문에 보존한다.
  회원과 표시 별칭은 application에서 조회한다.
- HOST의 송신 자격은 event의 ACTIVE host 연결, 참가자의 송신 자격은 현재 APPROVED application에서
  판정한다. LEFT application의 chat member는 읽기·쓰기 자격 없이 이력으로만 남는다.
- unread 수는 같은 room의 정상 메시지 중 `id > COALESCE(last_read_message_id, 0)`인 건수로 계산한다.

### 9. `t_rotation_chat_message`

| 컬럼 | 타입 | Null | 기본값 | 설명 |
| --- | --- | --- | --- | --- |
| id | INT | N | AUTO_INCREMENT | PK |
| room_id | INT | N | - | 채팅방 |
| sender_chat_member_id | INT | Y | NULL | 시스템 메시지는 null |
| message_type | TINYINT | N | 0 | 0=TEXT, 1=JOIN, 2=LEAVE, 3=NOTICE |
| content | TEXT | N | - | 메시지 |
| client_message_id | VARCHAR(64) CHARACTER SET ascii COLLATE ascii_bin | Y | NULL | Mobile 재전송 키 |
| status | TINYINT | N | 1 | 1=NORMAL, 2=ADMIN_DELETED |
| created_at | DATETIME | N | CURRENT_TIMESTAMP | 발송 시각 |

- `INDEX(room_id, id)`, `UNIQUE(sender_chat_member_id, client_message_id)`
- 삭제 actor/reason은 action log에 기록하며 메시지는 hard delete하지 않는다.

### 10. `t_rotation_profile_view`

| 컬럼 | 타입 | Null | 기본값 | 설명 |
| --- | --- | --- | --- | --- |
| id | INT | N | AUTO_INCREMENT | PK |
| viewer_member_id | INT | Y | NULL | 열람자 |
| target_application_id | INT | N | - | 열람 대상 신청 |
| member_key_log_id | INT | Y | NULL | 기존 Key 원장 ID |
| created_at | DATETIME | N | CURRENT_TIMESTAMP | 최초 열람 시각 |

- `UNIQUE(viewer_member_id, target_application_id)`, `UNIQUE(member_key_log_id)`
- 신규 열람 row의 `viewer_member_id`는 반드시 채운다. nullable은 회원 삭제 시 `ON DELETE SET NULL`을
  허용하기 위한 보관 예외이며 null viewer로 신규 insert하지 않는다.
- Mobile 호스트는 APPLIED/APPROVED 신청자를, APPROVED 참가자는 다른 APPROVED 참가자를 열람할 수
  있으며 본인은 열람/과금 대상이 아니다.
- target application의 event.photo_public=0이면 MINI/id16, 1이면 PHOTO/id18을 서버에서 선택한다.
- 최초 열람 row, 회원 Key, 기존 Key 원장을 한 transaction에서 저장한다.
- 신규 열람 row의 `member_key_log_id`는 반드시 채워서 commit한다. nullable은 회원 삭제로 기존 Key 로그가
  cascade 삭제될 때 `ON DELETE SET NULL`을 허용하기 위한 보관 예외다.

### 11. `t_rotation_review`

| 컬럼 | 타입 | Null | 기본값 | 설명 |
| --- | --- | --- | --- | --- |
| id | INT | N | AUTO_INCREMENT | PK |
| application_id | INT | N | - | 작성자 신청 |
| result | TINYINT | N | - | 1=GOOD, 2=BAD |
| content | VARCHAR(1000) | Y | NULL | BAD는 필수, GOOD은 선택 |
| member_key_log_id | INT | Y | NULL | 기존 Key 원장 ID |
| created_at | DATETIME | N | CURRENT_TIMESTAMP | 작성 시각 |

- `UNIQUE(application_id)`, `UNIQUE(member_key_log_id)`
- 후기, 회원 Key, 기존 Key 원장을 한 transaction에서 저장한다.
- 신규 후기 row의 `member_key_log_id`는 반드시 채워서 commit한다. nullable은 회원 삭제로 기존 Key 로그가
  cascade 삭제될 때 `ON DELETE SET NULL`을 허용하기 위한 보관 예외다.

### 12. `t_rotation_report`

| 컬럼 | 타입 | Null | 기본값 | 설명 |
| --- | --- | --- | --- | --- |
| id | INT | N | AUTO_INCREMENT | PK |
| event_id | INT | N | - | 관련 행사 |
| reporter_member_id | INT | N | - | 신고 당시 회원 ID snapshot |
| target_member_id | INT | Y | NULL | 회원 신고 대상 |
| reason_code | TINYINT | N | - | target null은 `BLAME_TYPE`, 값이 있으면 `BLAME_TYPE_CHAT` |
| content | VARCHAR(1000) | Y | NULL | 기타 사유/상세 |
| idempotency_key | VARCHAR(128) CHARACTER SET ascii COLLATE ascii_bin | N | - | 신고 접수 재전송 방지 |
| status | TINYINT | N | 0 | 0=PENDING, 1=RESOLVED, 2=DISMISSED |
| created_at | DATETIME | N | CURRENT_TIMESTAMP | 접수 시각 |

- `UNIQUE(reporter_member_id, idempotency_key)`, `INDEX(status, created_at)`,
  `INDEX(event_id, target_member_id)`
- 신고 처리는 Super Admin만 수행하며 처리자·사유·처리 시각은 같은 transaction의 action log에만 남긴다.

### 13. `t_rotation_action_log`

별도 도메인별 상태 history를 만들지 않고 운영 감사와 상태 이력을 합친다.

| 컬럼 | 타입 | Null | 기본값 | 설명 |
| --- | --- | --- | --- | --- |
| id | INT | N | AUTO_INCREMENT | PK |
| event_id | INT | Y | NULL | 관련 행사 |
| actor_type | TINYINT | N | - | 1=MEMBER, 2=ADMIN, 3=SYSTEM |
| actor_id | INT | Y | NULL | MEMBER/ADMIN 내부 ID, SYSTEM은 null |
| action | VARCHAR(64) CHARACTER SET ascii COLLATE ascii_bin | N | - | 폐쇄형 서버 상수 |
| target_id | INT | N | - | action이 가리키는 대상 ID |
| from_status | TINYINT | Y | NULL | 상태 변경 전 |
| to_status | TINYINT | Y | NULL | 상태 변경 후 |
| reason | VARCHAR(500) | Y | NULL | 승인/거절/취소/삭제 등 사유 |
| request_id | VARCHAR(64) CHARACTER SET ascii COLLATE ascii_bin | N | - | 서버 요청 추적 ID |
| created_at | DATETIME | N | CURRENT_TIMESTAMP | 발생 시각 |

- `INDEX(event_id, created_at)`, `INDEX(action, target_id, id)`, `INDEX(request_id)`
- action은 아래 목록만 허용하며 대상 종류도 함께 고정한다.

| 대상 | 허용 action |
| --- | --- |
| HOST | `HOST_CREATED`, `HOST_ACTIVATED`, `HOST_DEACTIVATED` |
| EVENT | `EVENT_CREATED`, `EVENT_UPDATED`, `EVENT_OPENED`, `EVENT_CLOSED`, `EVENT_CONFIRMED`, `EVENT_FINISHED`, `EVENT_CANCELED`, `EVENT_DELETED` |
| APPLICATION | `APPLICATION_APPROVED`, `APPLICATION_REJECTED`, `APPLICATION_CANCELED`, `APPLICATION_LEFT` |
| REPORT | `REPORT_RESOLVED`, `REPORT_DISMISSED` |
| MESSAGE | `MESSAGE_ADMIN_DELETED` |
| MEMBER | `ADMIN_PROFILE_VIEWED` |
| DETAIL_IMAGE_VERSION | `DETAIL_IMAGE_ATTACHED`, `DETAIL_IMAGE_DISCARDED` |

- `HOST_ACTIVATED/DEACTIVATED`, EVENT/APPLICATION/REPORT의 상태 전이 action과
  `MESSAGE_ADMIN_DELETED`는 from/to를 모두 기록하고 서로 다른 값이어야 한다. 생성·일반 수정·조회 및
  문자열 상태를 쓰는 detail image action은 둘 다 null로 둔다.
- 회원 신청처럼 별도 사유가 없는 MEMBER 동작은 reason을 null로 둘 수 있다. ADMIN/SYSTEM action은
  상위 보안·데이터 정책에 따라 사용자 입력 또는 서버 고정 사유를 필수로 기록한다.
- request_id는 클라이언트 입력이 아니라 API 요청 또는 서버 job 실행 컨텍스트에서 생성해 모든 action log에
  저장한다.

## FK와 삭제 정책

| 자식 컬럼 | 부모 | ON DELETE |
| --- | --- | --- |
| host.admin_id | `t_admin.id` | RESTRICT |
| host.member_id | `t_member.id` | SET NULL |
| event.host_id | host.id | RESTRICT |
| event mood.event_id | event.id | RESTRICT |
| detail version.event_id | event.id | SET NULL |
| detail version.created_by_admin_id | `t_admin.id` | SET NULL |
| detail slice.version_id | detail version.id | CASCADE |
| application.event_id | event.id | RESTRICT |
| application.member_id | `t_member.id` | SET NULL |
| chat room.event_id | event.id | RESTRICT |
| chat member.room_id | chat room.id | RESTRICT |
| chat member.application_id | application.id | RESTRICT |
| chat message.room_id | chat room.id | RESTRICT |
| chat message.sender_chat_member_id | chat member.id | RESTRICT |
| profile view.viewer_member_id | `t_member.id` | SET NULL |
| profile view.target_application_id | application.id | RESTRICT |
| profile view.member_key_log_id | `t_member_key_log.id` | SET NULL |
| review.application_id | application.id | RESTRICT |
| review.member_key_log_id | `t_member_key_log.id` | SET NULL |
| report.event_id | event.id | RESTRICT |
| action log.event_id | event.id | RESTRICT |

모든 FK의 `ON UPDATE`는 `RESTRICT`로 고정한다. PK 변경으로 관계를 이동하지 않는다.

순환 참조는 테이블 생성 뒤 `ALTER TABLE`로 추가한다.

- event의 `(detail_image_version_id, id)` -> detail version의 `(id, event_id)`, `ON DELETE RESTRICT`
- chat room의 `last_message_id` -> chat message.id, `ON DELETE SET NULL`
- chat member의 `last_read_message_id` -> chat message.id, `ON DELETE SET NULL`

## DDL CHECK 제약

아래 조건은 API validation에만 두지 않고 MySQL 8.4/MariaDB 10.6 공통 `CHECK`로도 생성한다.

| 테이블 | CHECK |
| --- | --- |
| host | `status IN (0,1) AND (status = 0 OR member_id IS NOT NULL)` |
| event | `status IN (-2,-1,0,1,2,3,4) AND version > 0 AND application_close_at <= event_at AND photo_public IN (0,1) AND male_capacity BETWEEN 2 AND 20 AND female_capacity BETWEEN 2 AND 20 AND CHAR_LENGTH(TRIM(title)) > 0 AND CHAR_LENGTH(TRIM(thumbnail_path)) > 0 AND CHAR_LENGTH(TRIM(location)) > 0 AND CHAR_LENGTH(TRIM(create_idempotency_key)) > 0` |
| event mood | `mood_code BETWEEN 1 AND 6` |
| detail version | `CHAR_LENGTH(TRIM(source_image_path)) > 0 AND source_width > 0 AND source_height > 0 AND target_width > 0 AND slice_height > 0 AND total_bytes >= 0 AND ((status = 'pending' AND processing_started_at IS NULL AND completed_at IS NULL AND error_message IS NULL) OR (status = 'processing' AND processing_started_at IS NOT NULL AND completed_at IS NULL AND error_message IS NULL) OR (status = 'ready' AND processing_started_at IS NOT NULL AND completed_at IS NOT NULL AND error_message IS NULL AND slice_count > 0 AND total_bytes > 0) OR (status IN ('failed','discarded') AND completed_at IS NOT NULL AND error_message IS NOT NULL AND CHAR_LENGTH(TRIM(error_message)) > 0)) AND (processing_started_at IS NULL OR processing_started_at >= created_at) AND (completed_at IS NULL OR completed_at >= COALESCE(processing_started_at, created_at))` |
| detail slice | `CHAR_LENGTH(TRIM(image_path)) > 0 AND width > 0 AND height > 0 AND byte_size > 0` |
| application | `gender_snapshot IN ('M','F') AND CHAR_LENGTH(TRIM(alias_snapshot)) > 0 AND version > 0 AND status IN (-3,-2,-1,0,1) AND ((status IN (-2,-1,0) AND approved_at IS NULL AND left_at IS NULL) OR (status = 1 AND approved_at IS NOT NULL AND left_at IS NULL) OR (status = -3 AND approved_at IS NOT NULL AND left_at IS NOT NULL AND left_at >= approved_at))` |
| chat member | `(application_id IS NULL AND host_room_id = room_id AND host_alias_snapshot IS NOT NULL AND CHAR_LENGTH(TRIM(host_alias_snapshot)) > 0) OR (application_id IS NOT NULL AND host_room_id IS NULL AND host_alias_snapshot IS NULL)` |
| chat message | `message_type IN (0,1,2,3) AND status IN (1,2) AND CHAR_LENGTH(TRIM(content)) > 0 AND ((message_type = 0 AND sender_chat_member_id IS NOT NULL AND client_message_id IS NOT NULL AND CHAR_LENGTH(TRIM(client_message_id)) > 0) OR (message_type IN (1,2,3) AND sender_chat_member_id IS NULL AND client_message_id IS NULL))` |
| review | `result IN (1,2) AND (result = 1 OR (content IS NOT NULL AND CHAR_LENGTH(TRIM(content)) > 0))` |
| report | `status IN (0,1,2) AND reporter_member_id > 0 AND CHAR_LENGTH(TRIM(idempotency_key)) > 0 AND ((target_member_id IS NULL AND reason_code BETWEEN 1 AND 6) OR (target_member_id IS NOT NULL AND target_member_id > 0 AND target_member_id <> reporter_member_id AND reason_code IN (1,2,3,4,6))) AND (reason_code <> 6 OR (content IS NOT NULL AND CHAR_LENGTH(TRIM(content)) > 0))` |
| action log 공통 | `actor_type IN (1,2,3) AND target_id > 0 AND CHAR_LENGTH(TRIM(action)) > 0 AND CHAR_LENGTH(TRIM(request_id)) > 0 AND ((actor_type IN (1,2) AND actor_id IS NOT NULL AND actor_id > 0) OR (actor_type = 3 AND actor_id IS NULL)) AND (actor_type = 1 OR (reason IS NOT NULL AND CHAR_LENGTH(TRIM(reason)) > 0))` |

action log에는 공통 CHECK와 함께 아래 폐쇄형 action CHECK를 추가한다. action 자체가 대상 테이블을
유일하게 결정하므로 target_type은 저장하지 않는다.

```sql
action IN (
  'HOST_CREATED','HOST_ACTIVATED','HOST_DEACTIVATED',
  'EVENT_CREATED','EVENT_UPDATED','EVENT_OPENED','EVENT_CLOSED','EVENT_CONFIRMED',
  'EVENT_FINISHED','EVENT_CANCELED','EVENT_DELETED',
  'APPLICATION_APPROVED','APPLICATION_REJECTED','APPLICATION_CANCELED','APPLICATION_LEFT',
  'REPORT_RESOLVED','REPORT_DISMISSED','MESSAGE_ADMIN_DELETED','ADMIN_PROFILE_VIEWED',
  'DETAIL_IMAGE_ATTACHED','DETAIL_IMAGE_DISCARDED'
)
```

action과 actor 종류도 DB에서 고정한다.

```sql
(actor_type = 1 AND action IN (
  'APPLICATION_CANCELED','APPLICATION_LEFT'
))
OR (actor_type = 2 AND action IN (
  'HOST_CREATED','HOST_ACTIVATED','HOST_DEACTIVATED',
  'EVENT_CREATED','EVENT_UPDATED','EVENT_OPENED','EVENT_CLOSED','EVENT_CONFIRMED',
  'EVENT_FINISHED','EVENT_CANCELED','EVENT_DELETED',
  'APPLICATION_APPROVED','APPLICATION_REJECTED','REPORT_RESOLVED','REPORT_DISMISSED',
  'MESSAGE_ADMIN_DELETED','ADMIN_PROFILE_VIEWED',
  'DETAIL_IMAGE_ATTACHED','DETAIL_IMAGE_DISCARDED'
))
OR (actor_type = 3 AND action IN ('EVENT_CLOSED','EVENT_FINISHED'))
```

상태 전이 action의 정확한 from/to와 비상태 action의 null 조합도 별도 CHECK로 고정한다.

```sql
(action = 'HOST_ACTIVATED' AND from_status = 0 AND to_status = 1)
OR (action = 'HOST_DEACTIVATED' AND from_status = 1 AND to_status = 0)
OR (action = 'EVENT_OPENED' AND from_status = 0 AND to_status = 1)
OR (action = 'EVENT_CLOSED' AND from_status = 1 AND to_status = 2)
OR (action = 'EVENT_CONFIRMED' AND from_status = 2 AND to_status = 3)
OR (action = 'EVENT_FINISHED' AND from_status = 3 AND to_status = 4)
OR (action = 'EVENT_CANCELED' AND from_status IN (1,2,3) AND to_status = -1)
OR (action = 'EVENT_DELETED' AND from_status = 0 AND to_status = -2)
OR (action = 'APPLICATION_APPROVED' AND from_status = 0 AND to_status = 1)
OR (action = 'APPLICATION_REJECTED' AND from_status = 0 AND to_status = -1)
OR (action = 'APPLICATION_CANCELED' AND from_status = 0 AND to_status = -2)
OR (action = 'APPLICATION_LEFT' AND from_status = 1 AND to_status = -3)
OR (action = 'REPORT_RESOLVED' AND from_status = 0 AND to_status = 1)
OR (action = 'REPORT_DISMISSED' AND from_status = 0 AND to_status = 2)
OR (action = 'MESSAGE_ADMIN_DELETED' AND from_status = 1 AND to_status = 2)
OR (action IN (
  'HOST_CREATED','EVENT_CREATED','EVENT_UPDATED','ADMIN_PROFILE_VIEWED',
  'DETAIL_IMAGE_ATTACHED','DETAIL_IMAGE_DISCARDED'
) AND from_status IS NULL AND to_status IS NULL)
```

event 연결 CHECK는 HOST action만 event_id가 null이고, 분리된 이미지 폐기는 null을 허용하며 나머지 action은
event_id를 필수로 갖도록 한다.

```sql
(action IN ('HOST_CREATED','HOST_ACTIVATED','HOST_DEACTIVATED') AND event_id IS NULL)
OR (action = 'DETAIL_IMAGE_DISCARDED')
OR (action NOT IN ('HOST_CREATED','HOST_ACTIVATED','HOST_DEACTIVATED','DETAIL_IMAGE_DISCARDED')
    AND event_id IS NOT NULL)
```

EVENT action은 target_id와 event_id가 같은 행사인지 DB CHECK로도 고정한다.

```sql
action NOT IN (
  'EVENT_CREATED','EVENT_UPDATED','EVENT_OPENED','EVENT_CLOSED','EVENT_CONFIRMED',
  'EVENT_FINISHED','EVENT_CANCELED','EVENT_DELETED'
) OR target_id = event_id
```

chat member 생성 시 application이 실제 APPROVED인지, 보존 중에는 APPROVED/LEFT인지, room/application의
event가 같은지 같은 교차 row 조건은 CHECK로 표현하지 못하므로 같은 transaction의 lock 조회와 통합
테스트로 강제한다. 같은 방식으로 detail version, last/last_read message, HOST 소유관계, profile view
viewer/target application, review application과 report 대상의 event 일치도 및 `member_key_log_id`의
회원/변동량이 잠근 회원과 서버 설정값에 일치하는지 검증한다.

action log 저장 전에는 action이 가리키는 application/report/message/member가 event_id 소속인지, attach된
detail version이 같은 event 소유인지 검증한다. 분리된 detail version 폐기는 created_by/요청 Admin 소유권을
검증한다. MEMBER actor는 원천 application 회원과 같아야 하고, ADMIN actor는 event 소유 Admin 또는 해당
action에 필요한 Super Admin 권한을 가져야 한다. SYSTEM actor는 허용된 job action과 서버 job identity를
검증한 경우만 허용한다.

## 변경 허용 범위

- `t_rotation_action_log`, `t_rotation_profile_view`는 business append-only다. 개인정보/부모 row 정리로
  nullable FK가 `ON DELETE SET NULL` 되는 변경만 예외다.
- `t_rotation_review`는 business 수정/삭제를 금지하고 개인정보 정리 시 content를 비식별 문구로
  바꾸는 것만 허용한다.
- `t_rotation_chat_message`는 insert 후 Admin 삭제 시 `status`만 변경한다. 회원 개인정보 정리 시의
  content 비식별화만 예외로 허용한다.
- `t_rotation_report`는 status와 개인정보 정리 시의 자유문 비식별화만 변경한다.
- event/application의 상태와 version은 상태 전이 service만 갱신한다.

## 데이터 분류와 보관

| 분류 | 대상 | 접근/보관 기준 |
| --- | --- | --- |
| 일반 | 공개 행사, mood, 공개 상세 이미지 | 행사 노출/운영 기간 동안 보관 |
| 내부 | application 상태/snapshot, chat membership/host alias, profile view, review 결과, Key log 연결, action metadata | 회원/API/Admin 권한에 따라 최소 조회 |
| 민감 | chat content, report content | 운영 목적 권한과 마스킹 적용 |

- action log의 reason에는 연락처·프로필 원문·인증정보를 넣지 않고 승인/거절/삭제의 최소 운영 사유만 남긴다.
- 회원 LEAVE/BLOCK 후 30일 개인정보 정리 전에 rotation 파생 저장소도 같은 cleanup transaction/작업에 포함한다.
- 회원 작성 chat content와 review 자유문은 비식별 문구로 교체한다.
- application alias와 chat member의 host alias snapshot도 비식별 문구로 교체한다.
- report 자유문은 직접 식별자를 제거한다.
- nullable member/admin FK는 부모 삭제 시 null 처리한다. RESTRICT 관계는 먼저 비활성/연결 해제한 뒤
  부모를 삭제한다. 행사/application 상태, 익명화된 신고, 기존 Key log와 action metadata는 운영 감사
  목적의 비개인 기록으로 보존한다.
- action actor_id는 부모 FK를 두지 않는 내부 감사 snapshot이며 부모 삭제 뒤에는 원천 회원/Admin과
  다시 연결하지 않는다.
- failed/discarded 또는 행사에서 분리된 상세 이미지 version은 기존 매니저 상세 이미지 cleanup과 같은
  기준으로 원본/slice 파일과 metadata를 정리한다.

## 상태 모델

### 행사

| 값 | 상수 | 의미 |
| --- | --- | --- |
| -2 | DELETED | 신청자가 없는 DRAFT 삭제 |
| -1 | CANCELED | 모집/확정 후 취소 |
| 0 | DRAFT | 작성 중 |
| 1 | OPEN | 신청 가능 |
| 2 | CLOSED | 신청 마감/승인 처리 중 |
| 3 | CONFIRMED | 참가 확정, 채팅 OPEN |
| 4 | FINISHED | 행사 종료, 후기 가능 |

```mermaid
stateDiagram-v2
    [*] --> DRAFT
    DRAFT --> OPEN
    DRAFT --> DELETED
    OPEN --> CLOSED
    CLOSED --> CONFIRMED
    CONFIRMED --> FINISHED
    OPEN --> CANCELED
    CLOSED --> CANCELED
    CONFIRMED --> CANCELED
```

### 신청

| 값 | 상수 | 의미 |
| --- | --- | --- |
| -3 | LEFT | 승인 후 퇴장 |
| -2 | CANCELED | 승인 전 신청 취소 |
| -1 | REJECTED | Admin 거절 |
| 0 | APPLIED | 신청 접수 |
| 1 | APPROVED | 참여 승인 |

- 허용 전이: `APPLIED -> APPROVED | REJECTED | CANCELED`, `APPROVED -> LEFT`
- 같은 회원은 같은 행사에 한 번만 신청하며 CANCELED/REJECTED 뒤 재신청은 허용하지 않는다.
- 행사 CONFIRMED 시 APPLIED가 남아 있으면 실패한다.
- 행사 CANCELED는 신청 상태를 덮어쓰지 않는다. 행사 상태로 전체 취소를 해석한다.

## 핵심 transaction

### 신청

1. 행사 OPEN, 마감 전, 성별 정원 설정, 회원 상태와 중복 신청을 검증한다.
2. 원천 이력인 application을 저장한다. 접수 주체·상태·시각이 application에 있으므로 생성 action log를
   중복 저장하지 않는다.
3. transaction commit 뒤 신규 application insert가 성공한 경우에만 호스트 대상으로 `sendFCMPush()`를
   한 번 호출한다. 중복 신청 재요청에는 호출하지 않는다.

### 승인과 참가 확정

1. 행사 소유권과 application version을 검증한다.
2. event/application row를 lock하고 해당 성별 APPROVED 수를 재집계한다.
3. application을 APPROVED로 변경하고 action log를 저장한다.
4. 최종 확정 시 APPLIED 0건, 남녀 APPROVED 각각 2명 이상을 확인한다.
5. event CONFIRMED, chat room, 호스트/참가자 chat member, 시스템 메시지를 한 transaction에 저장한다.
6. commit 뒤 상태 전이가 실제 반영된 경우에만 대상별 `sendFCMPush()`를 한 번 호출한다.

### 채팅 전송/읽음/퇴장

1. 메시지 전송은 room/event와 sender chat member를 lock한다. event CONFIRMED이고 sender가 ACTIVE host
   연결이거나 APPROVED application인 경우만 허용한다.
2. 같은 sender/client_message_id가 없을 때 message를 insert하고 room.last_message_id와 sender의
   last_read_message_id를 신규 message.id까지 함께 단조 증가시킨다. commit 뒤 신규 message insert가
   성공한 경우에만 sender를 제외한 host와 APPROVED 참가자에게 `sendFCMPush()`를 한 번 호출한다.
3. 읽음 처리는 대상 message가 같은 room인지 확인하고 기존 값보다 큰 ID일 때만 last_read_message_id를
   단조 증가시킨다.
4. 참가자 퇴장은 application/chat member를 함께 lock해 application만 LEFT로 바꾸고 leave system
   message/action log를 한 transaction에 저장한다. chat member row는 메시지 표시 이력 때문에 보존하고
   이후 자격은 application LEFT로 차단한다. commit 뒤 상태 전이가 성공한 경우에만 알림을 호출한다.
   호스트는 채팅 퇴장이 아니라 행사 취소 절차를 사용한다.

### 프로필 열람

1. target application과 event를 조회해 Mobile 호스트는 같은 행사의 APPLIED/APPROVED 신청자,
   APPROVED 참가자는 다른 APPROVED 참가자만 target으로 허용한다.
2. event.photo_public에 따라 `t_setting.id=16` 또는 `id=18`을 서버에서 읽고 viewer `t_member` row를
   `SELECT ... FOR UPDATE`로 잠근 뒤 기존 profile view를 다시 확인하고 잔액을 검증한다.
3. `t_member_key_log`, profile view의 `member_key_log_id`, 회원 Key를 한 transaction에 저장한다.
4. unique 충돌은 transaction 전체를 rollback하고 기존 열람 성공을 반환해 재차감하지 않는다.

### 후기

1. application을 기준으로 행사 FINISHED와 작성자의 APPROVED 또는 LEFT 이력을 검증한다.
2. `t_setting.id=20` 값을 서버에서 읽고 작성자의 `t_member` row를 `SELECT ... FOR UPDATE`로 잠근 뒤
   기존 review를 다시 확인한다.
3. `t_member_key_log`, review의 `member_key_log_id`, 회원 Key를 한 transaction에 저장한다.
4. unique 충돌은 transaction 전체를 rollback하고 기존 성공을 반환해 중복 보상하지 않는다.

## 저장하지 않고 계산하는 값

- 행사 신청/승인/성별 인원수: application을 status/gender로 집계한다.
- 참가자: APPROVED application 자체가 참가자 SoT이므로 별도 participant row를 만들지 않는다.
- 외부 입금 상태: DB 결제 기능이 아니며 입금 확인 뒤 application APPROVED로 표현한다.
- 행사/신청 상태 이력과 처리 사유: action log에서 조회한다.
- unread 수: chat member의 last_read_message_id와 정상 message를 비교한다.
- 프로필 열람/후기 Key 금액과 변경 후 잔액: t_setting에서 읽어 기존 `t_member_key_log`에 기록한다.

## 프론트 read model과 DB VIEW

반복되는 성별 신청/승인 집계는 `v_rotation_event_application_summary`를 단일 SoT로 제공한다. VIEW는
event를 기준으로 application을 LEFT JOIN하고 `SUM(CASE WHEN ... THEN 1 ELSE 0 END)`를 사용해 MySQL/MariaDB
공통 문법으로 만든다.

| VIEW 컬럼 | 의미 |
| --- | --- |
| event_id | 행사 ID, VIEW 내 유일 row |
| male_applied_count | 남성 APPLIED 수 |
| female_applied_count | 여성 APPLIED 수 |
| male_approved_count | 남성 APPROVED 수 |
| female_approved_count | 여성 APPROVED 수 |

호출자별 내 application status/권한과 mood 목록은 파라미터 및 1:N 관계이므로 repository query에서 VIEW에
결합한다. API DTO는 Swagger/contracts에 필수 응답으로 정의한다.

| API read model | 구성 원천 |
| --- | --- |
| `RotationEventListItem` | event + host/member 요약 + mood 목록 + application summary VIEW + 내 application status |
| `RotationEventDetail` | event + ready image slices + application summary VIEW + 내 권한 + 서버 Key 설정 |
| `RotationMyEventItem` | EventListItem + host/participant role |
| `RotationApplicantItem` | application + 승인 프로필 요약 + 내가 열람한 profile view 여부 |
| `RotationChatListItem` | application/event + optional chat room + last message + unread 수 |
| `RotationChatMessageItem` | 정상 message + sender principal별 host/application alias, 운영 삭제 표기 |
| `RotationReviewState` | event FINISHED 여부 + application 자격 + 기존 review 여부 + reward Key |

- raw DB row, 내부 status history와 `t_member_key_log` 연결은 프론트 응답으로 직접 노출하지 않는다.
- 공개 행사 목록은 OPEN/CLOSED/CONFIRMED를 먼저, FINISHED/CANCELED를 뒤에 두고 각 그룹에서
  `created_at DESC, id DESC`로 정렬한다. DRAFT/DELETED는 호스트/Admin 조회에서만 노출한다.
- 채팅 목록은 APPLIED 신청도 chat room 없이 노출해 “호스트 검토 중” 상태를 표시한다. CONFIRMED 뒤에는
  room/message를 결합하고 FINISHED/CANCELED는 읽기 전용 종료 상태로 표시한다.
- unread처럼 호출자별 계산이 필요한 값은 VIEW에 넣지 않고 repository query에서 계산한다.

## API 범위

### Mobile

- 행사 목록/상세/내가 만든 모임/내가 참여한 모임
- 신청/신청 취소/신청자 목록(호스트 회원)
- 미니/사진프로필 최초 열람
- 채팅방 목록, 메시지 목록/전송/읽음/퇴장
- 행사/회원 신고, 종료 후기

### Admin

- 행사 목록/상세/생성/수정/모집 시작/마감/참가 확정/종료/취소
- 신청 목록/승인/거절
- 긴 이미지 upload/status/discard
- 신고 목록/처리, 채팅 메시지 운영 삭제

동시 수정 대상 write API는 `version`을, 재전송 가능한 생성/메시지/신고 API는 각각 명시된 idempotency key
또는 `client_message_id`를 받는다. 상태 전이와 Admin 감사 대상 write는 API 요청/job 실행 컨텍스트가
생성한 request_id를 action log에 기록하며 클라이언트가 감사용 request_id를 결정하지 않는다.

## 필수 검증

- 같은 host/create_idempotency_key와 reporter/idempotency_key 재요청이 행사/신고를 중복 생성하지 않는다.
- 동일 회원의 행사 중복 신청과 동일 Mobile write 재전송이 한 번만 반영된다.
- 동시 승인에도 성별 정원 20명을 초과하지 않는다.
- 다른 호스트 Admin은 행사/신청/이미지 version을 조회·변경할 수 없다.
- ready가 아니거나 다른 행사 소유인 긴 이미지 version은 attach되지 않는다.
- CONFIRMED 시 APPLIED가 없고 남녀 승인 인원이 각각 2명 이상이다.
- 호스트가 아니면서 APPROVED가 아닌 회원과 LEFT 회원은 채팅을 읽거나 쓰지 못한다.
- 신규 메시지는 sender 자신의 unread에 포함되지 않고 sender에게 푸시/`t_alarm`을 생성하지 않는다.
- 같은 대상의 프로필 재열람과 후기 재요청으로 Key가 중복 변경되지 않는다.
- null viewer profile view insert는 실패하고 회원 삭제로 null 처리된 이력만 허용한다.
- 신고 처리, 메시지 삭제, 승인/거절, 행사 취소는 action log 없이 완료되지 않는다.
- EVENT action의 target_id/event_id 불일치와 다른 event 소속 target/권한 없는 actor의 action log는 실패한다.
- 행사 FINISHED/CANCELED 시 event 상태로 채팅 송신이 닫히고 이후 메시지 전송이 실패한다.
- 동일 상태 전이/메시지 재요청은 DB에 중복 반영되지 않고 `sendFCMPush()`도 다시 호출되지 않는다.
- 로테이션 코드가 `t_alarm`을 직접 insert하지 않아 기존 `sendFCMPush()`의 저장과 중복되지 않는다.
- 회원 개인정보 정리 후 파생 개인정보가 익명화되고 행사/신고/기존 Key log 연결/감사 기록은 정해진
  보관 정책을 따른다.

## Migration Gate 적용

이 문서는 DB 설계 SoT이며 실제 테이블 생성은 별도 additive migration SQL로 수행한다.
미구현 상태와 후속 API/Admin/Mobile 작업은 [기술 부채 인벤토리](../technical-debt/technical-debt.md)의
`24) 로테이션 소개팅 1차 구현 미착수`에서 추적한다.

| Gate | 적용 | 검증 |
| --- | --- | --- |
| `DBM-GATE-000` | 필수 | CHECK와 STORED generated UNIQUE 지원, 부모 테이블 타입/collation, 미사용 FCM type 확인 |
| `DBM-GATE-010` | 필수 | migration checksum과 dev/prod `schema_migrations` 기록 |
| `DBM-GATE-100` | 필수 | 13개 테이블과 1개 VIEW, PK/UNIQUE/INDEX/FK/CHECK의 SHOW CREATE diff와 실패 guard |
| `DBM-GATE-200` | N/A | 신규 additive 테이블이며 backfill 대상 없음 |
| `DBM-GATE-300` | N/A | 기존 read/write 기준을 변경하지 않음 |
| `DBM-GATE-400` | N/A | 기존 객체 drop/contract 없음 |

로컬 운영 dump에서 잘못된 CHECK row, FK 불일치, 중복 idempotency, 정원 동시 승인, Key 중복 지급을
실패 fixture로 검증한 뒤에만 개발계/운영계 적용 대상으로 본다.

## 2차 확장 원칙

현장 운영이 실제 확정될 때만 `t_rotation_round`, `t_rotation_round_assignment`,
`t_rotation_interest`를 additive migration으로 추가한다. 1차 테이블에 빈 라운드/호감 컬럼을 미리 두지 않는다.

## 관련 문서

- [미팅 시스템](meeting-system.md)
- [채팅 시스템](chat-system.md)
- [업로드/미디어 시스템](upload-media-system.md)
- [푸시알림 시스템](push-notification.md)
- [관리자 권한 시스템](admin-permission.md)
- [결제 시스템](payment-system.md)
- [보안/접근통제 정책](../policy/security-access-control-policy.md)
- [결제 운영 정책](../policy/payment-ops-policy.md)
- [푸시알림 운영 정책](../policy/push-notification-policy.md)
- [데이터 거버넌스 정책](../policy/data-governance-policy.md)
- [DB Migration Gate 정책](../policy/db-migration-gate-policy.md)
- [기술 부채 인벤토리](../technical-debt/technical-debt.md)
