# 그룹미팅 시스템

## 문서 역할

- 역할: `설명`
- 문서 종류: `architecture`
- 충돌 시 우선 문서: 권한은 [보안/접근통제 정책](../policy/security-access-control-policy.md), 결제는 [결제 운영 정책](../policy/payment-ops-policy.md), 푸시는 [푸시알림 운영 정책](../policy/push-notification-policy.md), 데이터는 [데이터 거버넌스 정책](../policy/data-governance-policy.md), 사용자 노출명과 신규 N:N 식별자 명명은 [서비스 용어 정책](../policy/service-terminology-policy.md)
- 기준 성격: `to-be`

이 문서는 신규 N:N 그룹미팅의 논리 모델과 도메인 불변조건을 설명한다. 기존 2:2 미팅은 UI 패턴만
참고하며 데이터, 상태, API, 알림 타입을 재사용하지 않는다. private 물리 스키마의 단일 기준은
`coupler-api`의 migration, schema lock, DB native `COMMENT`다.

## 범위와 확정 규칙

1차 범위는 `행사 생성 -> 모집 -> 신청 -> Admin 승인/확정 취소 -> 모임 확정 -> 그룹 채팅 -> 종료 -> 후기`다.

- 구현 계약 범위: API, DB, Admin, Mobile, Docs
- 출시 Gate: 소비자 PR 병합, 대상 환경 migration ledger·schema·runtime smoke, FCM·scheduler smoke
- 제외: 현장 체크인, 좌석/회전 라운드, 호감 선택, 전역 회원 패널티, 외부 결제/정산
- 호스트는 참가 정원에서 제외한다.
- 남녀 정원은 각각 최소 2명이고 합계는 최대 20명이다. 반대 성별 최소값에서 파생되는 성별별 최대는
  18명이며 `10+10`, `18+2`, `7+5`를 허용하고 `11+10`은 거절한다.
- 모임 확정은 남녀 승인 인원이 각각 2명 이상이면 가능하며 설정 정원 전체 충원을 요구하지 않는다.
- 신청 자체에는 Key를 차감하지 않는다. 외부 입금 확인은 Admin의 참여 승인으로 표현한다.
- 현재 그룹미팅 채팅의 공개 프로필 조회는 무료다. 현재 호스트와 승인 참가자는 본인을 포함한 현재 구성원의
  익명 별칭·관리자 지정 대표 프로필·행사 공개 범위의 프로필 카드를 볼 수 있으며 Key를 차감하거나 유료 열람
  이력을 새로 만들지 않는다.
- 서버 설정 16/18과 기존 프로필 열람 원장은 과거 유료 이력과 향후 정책 검토를 위해 보존한다. 향후 과금은
  설정값만 바꿔 현재 조회에 숨겨 적용하지 않고 가격·사용자 확인·멱등성이 있는 별도 동작 명령과 계약으로
  도입한다.
- Mobile 호스트와 Admin의 운영 목적 신청자 프로필 조회도 무료이며 Admin 운영 조회는 감사 이력을 남긴다.
- 종료 후기 최초 보상은 서버 설정 25를 사용한다. 클라이언트가 Key 금액을 결정하지 않는다.
- CONFIRMED 행사는 `event_at + 24시간`이 지나면 서버 job이 FINISHED로 변경한다. Admin 수동 종료 API는
  두지 않는다.

## 논리 데이터 모델

- 도메인 ID: `group-meeting`

### 논리 엔티티

| 논리 ID | 표시명 | 생명주기 역할 | 엔티티 형태 | 기록 역할 | 책임 | 최고 데이터 분류 | 생명주기 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `group-meeting.host` | 그룹미팅 호스트 | root | association | state | 클럽매니저 계정과 모바일 호스트 회원의 명시적 연결 | 민감 | 활성 행사가 없을 때 원천 계정 연결 해제 가능, 행사 이력은 보존 |
| `group-meeting.event` | 그룹미팅 행사 | root | entity | state | 모집·마감·확정·종료와 공개 행사 정보 | 민감 | 삭제·취소·종료 상태로 보존, 공개 이미지는 정책에 따라 정리 |
| `group-meeting.detail-version` | 행사 상세 이미지 버전 | child | entity | snapshot | 긴 상세 이미지 원본과 변환 상태 | 내부 | 현재 버전 유지, 실패·교체 버전 정리 가능 |
| `group-meeting.detail-slice` | 행사 상세 이미지 조각 | child | entity | snapshot | 상세 이미지 버전의 표시용 조각 | 내부 | 상위 버전 정리 시 파일과 함께 정리 |
| `group-meeting.application` | 그룹미팅 신청 | child | association | state | 신청·승인·확정 취소·채팅 자격 종료 | 민감 | 행사 종료 뒤 신청 당시 별칭과 상태를 비식별 이력으로 보존 가능 |
| `group-meeting.participant` | 그룹미팅 참여자 | child | association | state | 확정 채팅 참여 자격과 읽음 경계 | 내부 | 자격 종료 뒤에도 메시지 문맥을 위해 보존 가능 |
| `group-meeting.review` | 그룹미팅 후기 | child | entity | history | 종료 행사 후기와 보상 연결 | 민감 | 개인정보 정리 시 자유문 비식별화, 보상 이력 보존 |
| `group-meeting.action-history` | 그룹미팅 행위 이력 | child | entity | history | 상태 변경과 중요 운영 행위의 행위자·사유 | 내부 | append-only 감사 이력으로 보존 |

### 관계

| 출발 논리 ID | 관계 역할 | 관계 유형 | 도착 논리 ID | 카디널리티 | 소유·삭제 규칙 |
| --- | --- | --- | --- | --- | --- |
| `group-meeting.host` | `manager` | references | `club-manager.manager` | 1:1 | 매니저 계정 회수 뒤에도 과거 운영 이력 보존 |
| `group-meeting.host` | `member` | references | `member.member` | 1:1 | 회원 개인정보 정리 뒤 비식별 표시 사용 |
| `group-meeting.event` | `host` | references | `group-meeting.host` | N:1 | 활성 행사가 있으면 호스트 연결 삭제 금지 |
| `group-meeting.event` | `detail-versions` | owns | `group-meeting.detail-version` | 1:N | 현재 활성 버전은 행사와 함께 유지 |
| `group-meeting.detail-version` | `slices` | owns | `group-meeting.detail-slice` | 1:N | 버전 정리 시 조각과 파일 함께 정리 |
| `group-meeting.event` | `applications` | owns | `group-meeting.application` | 1:N | 신청 이력은 행사와 함께 보존 |
| `group-meeting.application` | `applicant` | references | `member.member` | N:1 | 신청 당시 자격과 표시 별칭 snapshot 보존 |
| `group-meeting.event` | `participants` | owns | `group-meeting.participant` | 1:N | 승인 자격과 대화 참여 자격을 분리해 판정 |
| `group-meeting.participant` | `member` | references | `member.member` | N:1 | 승인 신청자 또는 호스트만 참여 자격 보유 |
| `group-meeting.participant` | `thread` | associates | `conversation.thread` | N:1 | 유효한 참여자만 그룹 채팅 읽기·쓰기 가능 |
| `group-meeting.event` | `reviews` | owns | `group-meeting.review` | 1:N | 신청 회원당 최초 후기 하나만 허용 |
| `group-meeting.review` | `author` | references | `member.member` | N:1 | 종료 행사에 유효하게 참여한 회원만 작성 가능 |
| `group-meeting.event` | `action-history` | owns | `group-meeting.action-history` | 1:N | 상태 변경과 같은 transaction에서 기록 |
| `group-meeting.application` | `profile-access` | associates | `key-wallet.profile-access` | N:M | 과거 유료 열람 거래만 보존하며 현재 무료 공개 프로필 조회는 거래를 만들지 않음 |
| `group-meeting.application` | `member-report` | associates | `moderation.member-report` | N:M | 같은 행사 참여 문맥에서만 회원 신고 허용 |

### 불변조건

| 규칙 ID | 관련 논리 ID | 불변조건 | 기준 문서 |
| --- | --- | --- | --- |
| `GROUP-MEETING-INV-001` | `group-meeting.event` | 행사와 신청·참여·메시지·후기·신고는 같은 행사 문맥에 속한다 | [엔지니어링 가드레일](../policy/engineering-guardrails.md) |
| `GROUP-MEETING-INV-002` | `group-meeting.application` | 한 회원은 같은 행사에 신청을 하나만 가진다 | 이 문서 |
| `GROUP-MEETING-INV-003` | `group-meeting.event` | 남녀 정원은 각각 최소 2명, 합계 최대 20명이고 승인 인원은 해당 정원을 넘지 않는다 | 이 문서 |
| `GROUP-MEETING-INV-004` | `group-meeting.participant` | 호스트 또는 승인 신청 중 정확히 하나의 자격으로 참여한다 | [보안/접근통제 정책](../policy/security-access-control-policy.md) |
| `GROUP-MEETING-INV-005` | `group-meeting.review` | 종료 행사에 유효하게 참여한 회원만 최초 후기와 보상을 받을 수 있다 | [결제 운영 정책](../policy/payment-ops-policy.md) |
| `GROUP-MEETING-INV-006` | `group-meeting.action-history` | 상태 변경과 감사 이력은 같은 요청·transaction의 결론을 가진다 | [엔지니어링 가드레일](../policy/engineering-guardrails.md) |
| `GROUP-MEETING-INV-007` | `group-meeting.host` | 매니저와 정상 모바일 회원은 각각 최대 하나의 호스트 연결만 가지며 행사 생성 전에 연결이 유효해야 한다 | [보안/접근통제 정책](../policy/security-access-control-policy.md) |

## 상태 모델

### 행사

| 값 | 상태 | 의미 |
| --- | --- | --- |
| 0 | DRAFT | Admin 작성 중 |
| 1 | OPEN | 신청 모집 중 |
| 2 | CLOSED | 신청 마감 |
| 3 | CONFIRMED | 모임 확정, 채팅 가능 |
| 4 | FINISHED | 행사 종료, 후기 가능 |
| -1 | CANCELED | 행사 취소 |
| -2 | DELETED | 모집 전 삭제 |

허용 전이는 `DRAFT -> OPEN -> CLOSED -> CONFIRMED -> FINISHED`다. DRAFT는 DELETED, OPEN/CLOSED/CONFIRMED는
CANCELED로 종료할 수 있다. OPEN 전에는 ready 상세 이미지가 필요하고, CONFIRMED 전에는 남녀 승인 인원이
각각 두 명 이상이어야 한다.

### 신청

| 값 | 상태 | 의미 |
| --- | --- | --- |
| 0 | APPLIED | 신청 접수, 입금 확인 전 |
| 1 | APPROVED | 참여 승인 |
| -1 | CANCELED | 승인 후 Admin 확정 취소, 외부 환불 필요 |
| -2 | LEFT | 채팅 자격 종료(명시적 퇴장 또는 후기 완료) |

참여 승인과 확정 취소는 행사 OPEN/CLOSED/CONFIRMED에서만 허용한다. CONFIRMED 뒤 승인하면 기존 채팅에
합류시키고, 확정 취소하면 읽기·쓰기·프로필 열람 자격을 즉시 차단하되 기존 메시지와 참여 이력은 보존한다.
CONFIRMED 참가자의 명시적 퇴장은 APPROVED를 LEFT로 전이한다. FINISHED 행사에서 APPROVED 참가자가 최초
후기를 완료하면 후기·보상과 같은 transaction에서 LEFT로 전이하고 행위 이력을 남긴다. 이미 LEFT인 참가자는
후기를 작성해도 상태와 퇴장 이력을 중복 변경하지 않는다. 참가자의 채팅·프로필 열람·신고 자격은 후기 존재를
별도로 조회하지 않고 신청 상태 하나로 판정한다.

## 거래와 동시성

- 행사, 신청, 참여 자격, Key 원장은 server transaction이 단독 판정한다.
- 행사·신청 변경은 optimistic version을 사용하고 승인 시 행사와 신청을 잠근 뒤 성별 승인 수를 다시
  집계한다.
- 생성, 메시지, 신고의 idempotency key는 행위 주체 범위에서 유일하다. 같은 key와 같은 canonical
  payload의 재요청은 부수효과 없이 기존 성공을 반환하고, 다른 payload에 재사용하면 실패한다.
- 현재 무료 공개 프로필 조회는 read-only이며 회원 Key·Key 원장·프로필 유료 열람 이력을 쓰지 않는다.
  향후 유료 열람을 도입하면 회원 Key, 기존 Key 원장, 그룹미팅 연결을 별도 명시적 명령의 한 transaction에서
  반영하고 설정 누락이나 잘못된 부호를 fallback하지 않는다.
- 후기 보상은 회원 Key, 기존 Key 원장, 그룹미팅 연결을 한 transaction에서 반영하며 설정 누락이나 잘못된
  부호는 fallback하지 않고 전체 transaction을 실패시킨다.
- 알림은 원천 transaction commit 뒤 기존 `sendFCMPush()` 한 경로에서만 발송·저장한다. 그룹미팅 코드가
  `t_alarm`을 직접 추가하지 않는다.
- 행사당 채팅은 하나이며 별도 room 상태를 중복 저장하지 않는다. 송신 가능 여부는 행사 상태, 참가자 자격은
  신청 상태에서 판정한다.
- 채팅 메시지는 `USER`와 `SYSTEM`의 tagged union이다. `USER`만 채팅 구성원과 client idempotency key를
  가지며 Mobile 전송 API로 생성한다. `SYSTEM`은 sender 없이 서버 상태 전이와 연결된 action log를 원천으로
  같은 transaction에서 한 번만 생성한다.
- `EVENT_CONFIRMED`는 채팅 구성원 생성, `PARTICIPANT_JOINED`는 CONFIRMED 뒤 승인 참가자 합류,
  `PARTICIPANT_CANCELED`는 Admin의 승인 확정 취소, `PARTICIPANT_LEFT`는 참가자의 명시적 퇴장,
  `EVENT_FINISHED`는 행사 종료, `EVENT_CANCELED`는 기존 채팅이 있는 CONFIRMED 행사 취소와 함께
  기록한다. 후기 완료로 자격만 정리하는 `LEFT`와 채팅 생성 전 행사 취소에는 시스템 메시지를 만들지 않는다.
- 시스템 메시지는 메시지 목록과 채팅 목록의 `last_message`에 같은 DTO로 노출하고 다른 구성원에게 unread로
  계산한다. 행사 확정·취소 FCM과 채팅 이력은 역할이 다르므로 시스템 메시지 생성만으로 별도 채팅 FCM이나
  `t_alarm`을 중복 생성하지 않는다.

## 입력과 파생 값

- 해시태그는 `#단어`를 ASCII 공백 한 칸으로 구분한 canonical 문자열만 허용한다. trim, 중복 제거, 공백
  정규화로 잘못된 요청을 보정하지 않는다.
- 신청·승인 성별 인원수, 역할, unread, 접근 권한은 원천 상태에서 계산한다. 같은 의미의 상태나 합계를
  별도 필드에 중복 저장하지 않는다.
- 신청 당시 성별과 별칭은 시간축 snapshot이며 현재 회원 프로필 SoT로 사용하지 않는다.
- 현재 무료 공개 프로필 조회는 Key 변동을 만들지 않는다. 후기 보상과 향후 별도 유료 열람 명령의 실제 Key
  변동량·잔액만 기존 Key 원장에 한 번 기록한다.
- raw DB row, 내부 감사 연결, Key 원장 연결은 프론트 응답에 노출하지 않는다.

## 삭제와 보관

- 행사, 신청, 참여, 후기, 신고, 행위 이력은 hard delete하지 않는다. 실패·교체된 이미지 버전과 조각만
  media cleanup 정책에 따라 정리할 수 있다.
- 그룹 채팅은 게시글 댓글 도메인이 아니다. Admin은 `USER` 메시지만 삭제할 수 있고 row를 지우지 않고 상태를
  `ADMIN_DELETED`로 바꾸며 조회 DTO는 content를 `삭제된 메시지입니다.`로 반환한다. 삭제 actor와 reason은
  같은 transaction의 행위 이력에 남긴다. `SYSTEM` 메시지는 상태 전이 이력이므로 삭제하지 않는다. 따라서
  스퀘어 게시글·댓글 삭제 정책과 충돌하지 않고
  `conversation.message`의 감사·대화 문맥 보존 원칙을 따른다.
- 회원 개인정보 정리 시 신청 별칭과 작성 자유문을 비식별화하고 nullable 원천 회원/Admin 연결만 해제한다.
  별칭을 포함한 참가자 입장·확정 취소·퇴장 시스템 메시지도 action log의 신청 대상을 기준으로 같은
  transaction에서 `탈퇴한 참가자` 문구로 비식별화한다.
  행사 상태, 비식별 신고, Key 원장 연결, 행위 이력은 운영 감사 기록으로 보존한다.
- action reason에는 연락처, 프로필 원문, 인증정보를 넣지 않는다.

## 알림

그룹미팅 알림 타입 77~83의 의미와 사용자 설정은 [푸시알림 시스템](push-notification.md)을 단일 설명
진입점으로 사용한다. 모든 target은 행사 ID이고 원천 write가 실제로 한 번 commit된 경우에만 발송한다.
기존 2:2 신고 알림이나 라우트를 N:N에 재사용하지 않는다. Mobile은 그룹미팅 알림 타입을 N:N 목록·상세·
채팅 화면으로만 연결한다. 소비자 병합·배포와 FCM smoke 전에는 운영 발송을 활성화하지 않는다.

## API와 DTO 계약

- Swagger/OpenAPI가 19개 Mobile operation과 28개 Admin operation의 path/query/body 요청 DTO와 성공
  `data` DTO의 단일 SoT다.
- contracts package는 기존 operation metadata, operation input type, 성공 data map, envelope type과 named
  request/read DTO를 공개한다. 정원 2/18/20은 행사 생성·수정 operation의 generated
  `requestConstraints.groupMeetingCapacity` metadata에서 제공한다.
- 재사용 body와 read model은 `GroupMeetingCreateRequest`, `GroupMeetingVersionRequest`,
  `AdminGroupMeetingEventDetail`처럼 package public entrypoint에서 직접 export한다.
- Admin은 operation key와 generated DTO를 직접 소비한다. local wire DTO, `RequireExact`, URI fallback,
  응답 cast, normalize, 호환 adapter를 두지 않는다.
- Admin request boundary는 operation metadata에 따라 path parameter를 인코딩하고 multipart body를
  `FormData`로 직렬화한 뒤 strict envelope의 `ok`를 분기한다. 이는 전송 책임이며 DTO 변환 계층이 아니다.
- Admin이 사용하는 호스트 식별자는 매니저 관리의 로그인 ID인 `manager_user_id`다. 내부 연결·Admin·회원의
  숫자 PK는 요청 입력이나 운영자용 호스트 식별자로 노출하지 않는다.
- Super Admin은 `manager_user_id`와 모바일 회원 이메일을 정확히 조회해 최초 호스트 연결을 만든다. 행사
  생성은 `manager_user_id`만 받고 API가 내부 연결을 해석하며, 연결 또는 정상 모바일 계정이 없으면
  계약된 실패를 반환한다.
- `group-meeting.host` 연결과 `t_member_manager_assignment`의 클럽 배정은 책임이 다르다. 전자는 Admin
  매니저와 모바일 호스트 회원을 연결해 작성 행사와 로그인 호스트를 식별하고, 후자는 일반 회원의 전담
  `CHARGE`·공유 `SHARE` 클럽을 기록해 목록·상세 노출 범위를 판정한다.
- Mobile 전체 목록은 호출 회원의 `CHARGE` 또는 `SHARE` 매니저가 주최한 행사만 반환한다. 활성 상태
  `OPEN`·`CLOSED`·`CONFIRMED`를 최근 등록 순으로 먼저, 비활성 상태 `FINISHED`·`CANCELED`를 최근 등록
  순으로 다음에 배치한다. 직접 URL 상세도 호스트·신청자·같은 클럽 회원이 아니면 노출하지 않는다.
- 채팅방 진입은 `GET /group-meetings/{event_id}/chat` 한 건으로 행사, 호출자 `self`, 승인 구성원
  `members`와 익명 공개 프로필, 최초 메시지 page, 종료 후기 상태, 읽기 전용 여부를 구조화해 반환한다.
  `chat_member_id`는 내 메시지 판별과 신고 대상, 참가자의 `application_id`는 기존 앱의 무료 프로필 조회
  호환 경로에만 사용한다. 실제 `member_id` 해석과 동일 행사 소속 검증은 API 내부 책임이며 Mobile DTO에
  노출하지 않는다. 과거 메시지 추가 page, 메시지 전송·읽음·신고·나가기는 증분 조회 또는 동작 명령으로
  분리한다.
- 전체 채팅 첫 화면 `GET /chat/chatList`는 기존 매칭·2:2 미팅과 N:N 그룹미팅 채팅 첫 page를 한 응답에
  집계한다. 그룹미팅 section 실패를 빈 목록으로 바꾸지 않는다.
- Mobile 신청자 DTO와 Admin 운영 DTO는 분리한다. `GroupMeetingApplicantItem`은 신청 문맥만 노출하고,
  `AdminGroupMeetingApplicantItem`만 운영에 필요한 회원 ID·이메일·탈퇴/취소 시각을 추가한다.
- 성공 DTO generic은 compile-time 계약이다. runtime에서 검증하지 않은 성공 data를 별도 decoder가
  보장하는 것처럼 단정하지 않는다.
- API·Admin·Mobile은 published latest stable contracts package를 exact pin하고 동일 DTO를 직접 소비한다.
  소비자별 현재 package version, PR 병합과 운영 전환 현황은
  [기술 부채 인벤토리](../technical-debt/technical-debt.md)의
  `그룹미팅 소비자 cutover 및 출시 통합 미완료`에서만 추적한다. 이 문서에는 별도 normalize, ID fallback,
  local wire DTO를 추가하지 않는 목표 구조만 유지한다.

대표 read model은 다음과 같다.

| DTO | 책임 |
| --- | --- |
| `GroupMeetingEventListItem` | 행사, 호스트 요약, 신청 집계, 호출자 신청 상태 |
| `AdminGroupMeetingEventDetail` | 행사 상세, ready 이미지, 신청 집계, Admin 운영 정보 |
| `GroupMeetingApplicantItem` | 신청 상태와 신청 당시 표시 정보 |
| `AdminGroupMeetingApplicantItem` | Admin 신청 운영용 회원 ID·이메일·탈퇴/취소 시각 |
| `GroupMeetingChatRoom` | 행사별 호출자, 승인 구성원의 익명 공개 프로필, 최초 메시지, 종료 후기 상태와 채팅·신청 ID 경계 |
| `GroupMeetingChatMessageItem` | 메시지, 송신자 역할, 운영 삭제 상태 |
| `GroupMeetingReviewState` | 후기 작성 가능 여부, 기존 후기, 서버 보상값 |

## Admin 운영 화면

- 역할별 최대 범위와 직접 URL/API 허용 기준은
  [보안/접근통제 정책](../policy/security-access-control-policy.md)을 단일 기준으로 사용한다. 아래는 그 정책을
  적용한 현재 Admin 화면 구조다.
- 기존 2:2 운영 화면은 `그룹미팅 관리` 아래의 `미팅 내역`, `채팅 내역`, `후기 내역`, `신고 내역`,
  `패널티 내역` 메뉴와 `/meeting/list`, `/meeting/chat`, `/meeting/review`, `/meeting/blame`,
  `/meeting/penalty` 라우트를 그대로 유지하되, 해당 상위 메뉴는 Super Admin에게만 노출한다. 일반 클럽매니저
  사이드바에서는 기존 2:2 메뉴 전체를 숨긴다.
- 신규 N:N은 기존 메뉴의 형제 위치에 별도 `클럽 Host 단체미팅 관리` 상위 메뉴를 두고, 그 아래
  `미팅 내역` 하나만 노출한다. 진입 라우트는 `/group-meeting/list`이며 행사 상세에서 신청, 채팅,
  후기, 신고, 프로필 열람 이력을 종속시켜 본다. 이 메뉴는 Super Admin과 일반 클럽매니저 모두에게 노출한다.
- `groupMeetingChatUserReport` 알림은 미처리 신고가 있는 N:N 행사만 표시하는
  `/group-meeting/list?pending_reports=1`로 이동한다. 행사 목록은 `pending_report_count`를 표시하고 해당 수를
  누르면 행사 상세의 신고 탭을 바로 연다. 기존 2:2 신고 화면으로 연결하지 않는다.
- 신고 탭은 신고자·피신고자의 현재 상태와 프로필을 표시하고 회원 상세 조회를 제공한다. Super Admin은
  신고 처리·기각과 별도로 회원 차단 및 피신고자 미팅 패널티를 적용할 수 있고, 일반 클럽매니저는 자신이
  담당하는 행사의 신고 내역만 읽는다.
- 동일 신고자의 같은 `idempotency_key` 재전송은 원래 결과를 반환한다. 서로 다른 key는 반복 위반을
  별도 사건으로 보존하며 각 신고를 독립적으로 처리·기각한다.
- 일반 클럽매니저 화면은 자신이 소유한 행사만 조회·변경하고, Super Admin 화면은 최초 호스트 연결과 전체
  운영 기능을 제공한다. 서버의 실제 허용 범위는 보안/접근통제 정책과 operation 인가 결과를 따른다.
- 행사 목록과 호스트 연결 화면은 매니저 ID를 검색·표시한다. 모임 만들기는 매니저 ID를 입력하고, 연결된
  정상 모바일 계정이 없다는 계약 오류를 받으면 모바일 계정 생성 후 호스트 연결이 필요하다는 안내를
  표시한다.
- 호스트 연결 관리는 매니저 ID와 모바일 회원 이메일을 사용한다. 내부 숫자 ID를 운영자가 찾아 입력하는
  흐름은 제공하지 않는다.
- 썸네일과 긴 상세 이미지는 인증된 upload operation만 사용하며 비이미지 파일을 성공으로 처리하지 않는다.

## DB 계약 경계와 출시 Gate

이 문서는 논리 상태, 관계, 불변조건만 설명한다. migration 계보·checksum·schema lock·DB native `COMMENT`와
환경별 적용 상태는 `coupler-api`의 private 물리 계약과 대상 DB의 migration ledger가 단일 기준이다. 날짜별
적용 현황이나 물리 객체 수를 이 문서에 복제하지 않는다.

그룹미팅 runtime을 활성화하기 전에는 대상 환경에서 append-only migration precheck와 ledger 기록, 최종
schema 검증, runtime smoke를 모두 통과해야 한다. 환경별 실행 증거는 API PR 또는 릴리스 기록에 남긴다.
group-meeting 논리 ID는 구현 병합, 대상 환경 ledger, Mobile 연결과 운영 전환 조건을 모두 충족한 뒤에만
`as-is`로 승격한다.

남은 소비자 cutover와 출시 통합은 [기술 부채 인벤토리](../technical-debt/technical-debt.md)의
`그룹미팅 소비자 cutover 및 출시 통합 미완료`에서 추적한다.

## 관련 문서

- [기존 2:2 그룹미팅 시스템](meeting-system.md)
- [채팅 시스템](chat-system.md)
- [업로드/미디어 시스템](upload-media-system.md)
- [푸시알림 시스템](push-notification.md)
- [관리자 권한 시스템](admin-permission.md)
- [보안/접근통제 정책](../policy/security-access-control-policy.md)
- [결제 운영 정책](../policy/payment-ops-policy.md)
- [푸시알림 운영 정책](../policy/push-notification-policy.md)
- [데이터 거버넌스 정책](../policy/data-governance-policy.md)
- [DB Migration Gate 정책](../policy/db-migration-gate-policy.md)
- [API 클라이언트 계약 패키지 정책](../policy/api-client-contract-package-policy.md)
- [서비스 용어 정책](../policy/service-terminology-policy.md)
- [기술 부채 인벤토리](../technical-debt/technical-debt.md)
