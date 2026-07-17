# 그룹미팅 시스템

## 문서 역할

- 역할: `설명`
- 문서 종류: `architecture`
- 충돌 시 우선 문서: [보안/접근통제 정책](../policy/security-access-control-policy.md), [결제 운영 정책](../policy/payment-ops-policy.md), [푸시알림 운영 정책](../policy/push-notification-policy.md), [데이터 거버넌스 정책](../policy/data-governance-policy.md)
- 기준 성격: `to-be`

이 문서는 신규 N:N 그룹미팅의 논리 모델과 도메인 불변조건을 설명한다. 기존 2:2 미팅은 UI 패턴만
참고하며 데이터, 상태, API, 알림 타입을 재사용하지 않는다. private 물리 스키마의 단일 기준은
`coupler-api`의 migration, schema lock, DB native `COMMENT`다.

## 범위와 확정 규칙

1차 범위는 `행사 생성 -> 모집 -> 신청 -> Admin 승인/확정 취소 -> 모임 확정 -> 그룹 채팅 -> 종료 -> 후기`다.

- 구현·검증 범위: API, DB, Admin, Docs
- 후속 범위: Mobile contracts package 소비와 화면 연결
- 제외: 현장 체크인, 좌석/회전 라운드, 호감 선택, 전역 회원 패널티, 외부 결제/정산
- 호스트는 참가 정원에서 제외한다.
- 남녀 정원은 각각 최소 2명이고 합계는 최대 20명이다. 반대 성별 최소값에서 파생되는 성별별 최대는
  18명이며 `10+10`, `18+2`, `7+5`를 허용하고 `11+10`은 거절한다.
- 모임 확정은 남녀 승인 인원이 각각 2명 이상이면 가능하며 설정 정원 전체 충원을 요구하지 않는다.
- 신청 자체에는 Key를 차감하지 않는다. 외부 입금 확인은 Admin의 참여 승인으로 표현한다.
- 사진 비공개/공개 행사에서 승인 참가자 간 최초 프로필 열람 비용은 각각 서버 설정 16/18을 사용한다.
  Mobile 호스트와 Admin의 운영 목적 신청자 프로필 조회는 무료이며 감사 이력을 남긴다.
- 종료 후기 최초 보상은 서버 설정 25를 사용한다. 클라이언트가 Key 금액을 결정하지 않는다.
- CONFIRMED 행사는 `event_at + 24시간`이 지나면 서버 job이 FINISHED로 변경한다. Admin 수동 종료 API는
  두지 않는다.

## 논리 데이터 모델

- 도메인 ID: `group-meeting`

### 논리 엔티티

| 논리 ID | 표시명 | 생명주기 역할 | 엔티티 형태 | 기록 역할 | 책임 | 최고 데이터 분류 | 생명주기 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `group-meeting.host` | 그룹미팅 호스트 | root | association | state | 운영자 계정과 호스트 회원의 연결 | 민감 | 활성 행사가 없을 때 원천 계정 연결 해제 가능, 행사 이력은 보존 |
| `group-meeting.event` | 그룹미팅 행사 | root | entity | state | 모집·마감·확정·종료와 공개 행사 정보 | 민감 | 삭제·취소·종료 상태로 보존, 공개 이미지는 정책에 따라 정리 |
| `group-meeting.detail-version` | 행사 상세 이미지 버전 | child | entity | snapshot | 긴 상세 이미지 원본과 변환 상태 | 내부 | 현재 버전 유지, 실패·교체 버전 정리 가능 |
| `group-meeting.detail-slice` | 행사 상세 이미지 조각 | child | entity | snapshot | 상세 이미지 버전의 표시용 조각 | 내부 | 상위 버전 정리 시 파일과 함께 정리 |
| `group-meeting.application` | 그룹미팅 신청 | child | association | state | 신청·승인·확정 취소·퇴장 자격 | 민감 | 행사 종료 뒤 신청 당시 별칭과 상태를 비식별 이력으로 보존 가능 |
| `group-meeting.participant` | 그룹미팅 참여자 | child | association | state | 확정 채팅 참여 자격과 읽음 경계 | 내부 | 자격 종료 뒤에도 메시지 문맥을 위해 보존 가능 |
| `group-meeting.review` | 그룹미팅 후기 | child | entity | history | 종료 행사 후기와 보상 연결 | 민감 | 개인정보 정리 시 자유문 비식별화, 보상 이력 보존 |
| `group-meeting.action-history` | 그룹미팅 행위 이력 | child | entity | history | 상태 변경과 중요 운영 행위의 행위자·사유 | 내부 | append-only 감사 이력으로 보존 |

### 관계

| 출발 논리 ID | 관계 역할 | 관계 유형 | 도착 논리 ID | 카디널리티 | 소유·삭제 규칙 |
| --- | --- | --- | --- | --- | --- |
| `group-meeting.host` | `operator` | references | `admin-access.operator` | N:1 | 관리자 계정 회수 뒤에도 과거 운영 이력 보존 |
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
| `group-meeting.application` | `profile-access` | associates | `key-wallet.profile-access` | N:M | 승인 참가자 간 최초 유료 열람만 거래로 기록 |
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
| -2 | LEFT | 확정 채팅 퇴장 |

참여 승인과 확정 취소는 행사 OPEN/CLOSED/CONFIRMED에서만 허용한다. CONFIRMED 뒤 승인하면 기존 채팅에
합류시키고, 확정 취소하면 읽기·쓰기·프로필 열람 자격을 즉시 차단하되 기존 메시지와 참여 이력은 보존한다.

## 거래와 동시성

- 행사, 신청, 참여 자격, Key 원장은 server transaction이 단독 판정한다.
- 행사·신청 변경은 optimistic version을 사용하고 승인 시 행사와 신청을 잠근 뒤 성별 승인 수를 다시
  집계한다.
- 생성, 메시지, 신고의 idempotency key는 행위 주체 범위에서 유일하다. 같은 key를 다른 payload에
  재사용하면 기존 결과를 반환하지 않고 실패한다.
- 참가자 프로필 최초 열람과 후기 보상은 회원 Key, 기존 Key 원장, 그룹미팅 연결을 한 transaction에서
  반영한다. 설정 누락이나 잘못된 부호는 fallback하지 않고 전체 transaction을 실패시킨다.
- 알림은 원천 transaction commit 뒤 기존 `sendFCMPush()` 한 경로에서만 발송·저장한다. 그룹미팅 코드가
  `t_alarm`을 직접 추가하지 않는다.
- 행사당 채팅은 하나이며 별도 room 상태를 중복 저장하지 않는다. 송신 가능 여부는 행사 상태, 참가자 자격은
  신청 상태에서 판정한다.

## 입력과 파생 값

- 해시태그는 `#단어`를 ASCII 공백 한 칸으로 구분한 canonical 문자열만 허용한다. trim, 중복 제거, 공백
  정규화로 잘못된 요청을 보정하지 않는다.
- 신청·승인 성별 인원수, 역할, unread, 접근 권한은 원천 상태에서 계산한다. 같은 의미의 상태나 합계를
  별도 필드에 중복 저장하지 않는다.
- 신청 당시 성별과 별칭은 시간축 snapshot이며 현재 회원 프로필 SoT로 사용하지 않는다.
- 승인 참가자 간 프로필 열람과 후기의 실제 Key 변동량·잔액은 기존 Key 원장에 한 번만 기록한다.
- raw DB row, 내부 감사 연결, Key 원장 연결은 프론트 응답에 노출하지 않는다.

## 삭제와 보관

- 행사, 신청, 참여, 후기, 신고, 행위 이력은 hard delete하지 않는다. 실패·교체된 이미지 버전과 조각만
  media cleanup 정책에 따라 정리할 수 있다.
- 그룹 채팅은 게시글 댓글 도메인이 아니다. Admin 메시지 삭제는 row를 지우지 않고 상태를
  `ADMIN_DELETED`로 바꾸며 조회 DTO는 content를 `삭제된 메시지입니다.`로 반환한다. 삭제 actor와 reason은
  같은 transaction의 행위 이력에 남긴다. 따라서 스퀘어 게시글·댓글 삭제 정책과 충돌하지 않고
  `conversation.message`의 감사·대화 문맥 보존 원칙을 따른다.
- 회원 개인정보 정리 시 신청 별칭과 작성 자유문을 비식별화하고 nullable 원천 회원/Admin 연결만 해제한다.
  행사 상태, 비식별 신고, Key 원장 연결, 행위 이력은 운영 감사 기록으로 보존한다.
- action reason에는 연락처, 프로필 원문, 인증정보를 넣지 않는다.

## 알림

그룹미팅 알림 타입 77~83의 의미와 사용자 설정은 [푸시알림 시스템](push-notification.md)을 단일 설명
진입점으로 사용한다. 모든 target은 행사 ID이고 원천 write가 실제로 한 번 commit된 경우에만 발송한다.
기존 2:2 신고 알림이나 라우트를 N:N에 재사용하지 않는다. Mobile 타입 인식과 화면 라우팅이 후속 범위이므로
그 전에는 운영 발송을 활성화하지 않는다.

## API와 DTO 계약

- Swagger/OpenAPI가 18개 Mobile operation과 28개 Admin operation의 path/query/body 요청 DTO와 성공
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
- 성공 DTO generic은 compile-time 계약이다. runtime에서 검증하지 않은 성공 data를 별도 decoder가
  보장하는 것처럼 단정하지 않는다.
- Mobile 파일은 이번 작업에서 변경하지 않는다. 후속 통합은 같은 stable package version을 exact pin하고
  동일 DTO를 직접 소비해야 하며 별도 normalize나 fallback을 추가하지 않는다.

대표 read model은 다음과 같다.

| DTO | 책임 |
| --- | --- |
| `GroupMeetingEventListItem` | 행사, 호스트 요약, 신청 집계, 호출자 신청 상태 |
| `AdminGroupMeetingEventDetail` | 행사 상세, ready 이미지, 신청 집계, Admin 운영 정보 |
| `GroupMeetingApplicantItem` | 신청 상태와 신청 당시 표시 정보 |
| `GroupMeetingChatMessageItem` | 메시지, 송신자 역할, 운영 삭제 상태 |
| `GroupMeetingReviewState` | 후기 작성 가능 여부, 기존 후기, 서버 보상값 |

## Admin 운영 화면

- 신규 N:N은 `/meeting/group`에서 행사 상세에 신청, 채팅, 후기, 신고, 프로필 열람 이력을 종속시켜 본다.
- 기존 `/meeting/list`, `/meeting/chat`, `/meeting/review`, `/meeting/blame`, `/meeting/penalty`는 2:2 전용이며
  Super Admin 메뉴로 보존한다.
- `groupMeetingChatUserReport` 알림은 N:N 화면 `/meeting/group`으로 이동한다. 기존 2:2 신고 화면으로
  연결하지 않는다.
- 파트너 Admin은 자신이 소유한 행사만 조회·변경할 수 있고 Super Admin만 최초 호스트 연결과 전체 운영
  범위를 가진다.
- 썸네일과 긴 상세 이미지는 인증된 upload operation만 사용하며 비이미지 파일을 성공으로 처리하지 않는다.

## DB 적용 상태와 Gate

2026-07-17 읽기 전용 확인 결과는 다음과 같다.

- 개발 DB: 그룹미팅 테이블 11개, ledger에 migration 77~80 적용
- 운영 DB: 그룹미팅 테이블 0개, 관련 migration ledger 0개

따라서 개발 DB에 기록된 77~80은 수정하지 않는다. 81번 migration이 기존 합계 30명 CHECK를 합계 20명
CHECK로 append-only 교체하고, 82번 migration이 11개 테이블과 전체 컬럼의 DB native `COMMENT`를
완결한다. 운영 DB는 77~82를 순서대로 적용했을 때 처음부터 최종 계약으로 끝난다. 이 migration 계보는
런타임 transition/호환 계층이 아니다.

- precheck는 부모 타입, 설정 16/18/25, migration ledger, 기존 데이터의 새 제약 적합성을 fail-closed로
  확인한다.
- schema lock은 migration catalog/checksum, 테이블·컬럼 COMMENT, FK/INDEX/CHECK exact set을 검증한다.
- 로컬 replay fixture는 운영 데이터를 대체하지 않고 필요한 설정 row만 제공한다.
- MySQL 8.4와 MariaDB 10.6 replay에서 `10+10`, `18+2`는 허용하고 `11+10`은 CHECK 위반으로 거절해야 한다.
- 운영 적용 전까지 group-meeting 논리 ID 8개는 planned/to-be로 유지한다. 구현 병합, 대상 환경 ledger,
  runtime 검증, 운영 전환 조건을 모두 충족한 뒤에만 as-is로 승격한다.

남은 Mobile/출시 통합은 [기술 부채 인벤토리](../technical-debt/technical-debt.md)의
`22) 그룹미팅 Mobile 및 출시 통합 미완료`에서 추적한다.

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
- [기술 부채 인벤토리](../technical-debt/technical-debt.md)
