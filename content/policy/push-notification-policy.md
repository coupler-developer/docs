# 푸시알림 운영 정책

## 문서 역할

- 역할: `규범`
- 문서 종류: `policy`
- 충돌 시 우선 문서: 이 문서
- 기준 성격: `as-is`

## 목적

- 푸시 타입/발송 조건/장애 대응 기준을 표준화해 과발송, 누락 발송, 중복 발송 리스크를 줄인다.

## 적용 범위

- `coupler-api`, `coupler-mobile-app`, `coupler-admin-web`
- FCM 타입 관리, 발송 조건 로직, 알림 저장(`t_alarm`), 운영 집계/모니터링

## 단일 SoT

- 알림 도메인 구조: [푸시알림 시스템](../architecture/push-notification.md)
- 상위 기술 원칙: [엔지니어링 가드레일](engineering-guardrails.md)
- 리뷰/증빙 기준: [코드 리뷰 정책](code-review-policy.md)
- 로그 규칙: [로그 정책](log-policy.md)

## 필수 규칙

### 1) 타입 거버넌스

- FCM 타입 추가/변경/폐기는 정책 문서와 아키텍처 문서를 동시에 갱신한다.
- 신규 타입을 추가할 때는 서버 상수/문구, 모바일 상수/라우팅, `t_alarm` 저장/운영 집계 범위를 함께 갱신한다.
- 타입 ID 재사용은 금지한다.
- 미정의 타입 수신 시 조용히 무시하지 않고 오류/경고 로그를 남긴다.
- 서버는 타입별 `custom_data` 필드를 계약된 JSON 원시 타입으로 발행한다. 숫자 필드는 숫자로 보내며 문자열 숫자나
  대체 필드를 함께 발행하지 않는다.
- 모바일은 FCM JSON 진입점에서 타입별 `custom_data`를 한 번만 검증해 typed domain event로 변환한다. 이후 화면과
  상태 소비자는 같은 event payload 타입을 직접 사용하며 `toNumber`, 문자열 숫자 변환, 기본값 fallback 또는 반복
  runtime guard로 wire shape를 보정하지 않는다.
- 외부 payload가 계약을 위반하면 경고 로그를 남기고 해당 이벤트를 적용하지 않는다. 임의 기본값으로 계속 진행하지
  않는다.

#### 라운지 `custom_data` 계약

| FCM 타입 | 필수 payload | 선택 payload |
| --- | --- | --- |
| `LOUNGE_NEW_COMMENT(38)` | `target: positive integer` | `count: non-negative integer`, `title: string` |
| `LOUNGE_LIKE(68)` | `target: positive integer`, `count: non-negative integer` | 없음 |

### 2) 발송 조건 통제

- 사용자 알림 설정(`alarm_chat`, `alarm_match`, `alarm_event`)을 서버 발송 경로에서 일관되게 적용한다.

| 대상 | 적용 조건 | 결과 |
| --- | --- | --- |
| 1:1 매칭 타입 12~30, 70, 71 | `alarm_match = NO` | FCM 전송과 `t_alarm` 저장을 모두 건너뜀 |
| `MATCH_NEW_CHAT(22)` | `alarm_chat = NO` 또는 `alarm_match = NO` | FCM 전송과 `t_alarm` 저장을 모두 건너뜀 |
| `CONCIERGE_CHAT(67)` | `alarm_chat = NO` | FCM 전송과 `t_alarm` 저장을 모두 건너뜀 |
| 그룹미팅 77~81, 83~85 | `alarm_event = NO` | FCM 전송과 `t_alarm` 저장을 모두 건너뜀 |
| `GROUP_MEETING_CHAT_MESSAGE(82)` | `alarm_chat = NO` | FCM 전송과 `t_alarm` 저장을 모두 건너뜀 |
| `MATCH_VOICE_CALL(53)` | 항상 | FCM 전송과 `t_alarm` 저장을 모두 건너뛰고 알림 목록에서 제외 |
| FCM 토큰 없음 | 다른 발송·저장 조건은 충족 | FCM만 건너뛰고 `t_alarm`은 저장 |
| `sendPush = false` 또는 `OFFLINE_MODE` | 다른 발송·저장 조건은 충족 | FCM만 건너뛰고 `t_alarm`은 저장 |

- `CONCIERGE_CHAT(67)`은 Admin이 회원에게 보낸 메시지의 Mobile 사용자 알림과 재진입 보조 수단이다. FCM
  수신 여부를 메시지 저장 성공이나 읽음 상태의 기준으로 사용하지 않는다.
- Mobile foreground에서는 WebSocket 연결 여부와 무관하게 `CONCIERGE_CHAT(67)` 시스템 알림을 표시한다.
  WebSocket이 연결돼 있으면 같은 FCM으로 상태 갱신 이벤트를 중복 적용하지 않고, 연결이 끊긴 경우에만 FCM
  이벤트를 화면 상태 갱신 보조 경로로 사용한다.
- `GROUP_MEETING_CHAT_MESSAGE(82)`도 foreground 시스템 알림은 WebSocket 연결 여부와 무관하게 표시한다.
  WebSocket이 연결돼 있으면 같은 FCM으로 그룹미팅 방·통합 채팅 목록 상태를 중복 갱신하지 않고, 연결이 끊긴
  경우에만 FCM 이벤트를 HTTP snapshot 갱신 보조 경로로 사용한다. 메시지 원본과 연결·복구 기준은
  [채팅 시스템](../architecture/chat-system.md)의 N:N 그룹미팅 채팅 절을 따른다.
- 토큰 없음/발송 비활성 조건은 명시적으로 기록하고 스킵 사유를 남긴다.
- 동일 이벤트의 다중 발송을 방지하기 위해 idempotency key 또는 중복 체크 키를 사용한다.

#### 그룹미팅 채팅 개방 수신자 기준

- 행사 전날 KST 13시 개방 경계에서는 호스트와 그 시점의 현재 `APPROVED` 참가자에게
  `GROUP_MEETING_CHAT_OPENED(85)`를 경계당 한 번 발송한다.
- 현재 행사 일시와 상태로 계산한 채팅 개방 이후 Admin이 참가자를 새로 승인하면, 해당 참가자에게
  `GROUP_MEETING_APPLICATION_APPROVED(78)`과 `GROUP_MEETING_CHAT_OPENED(85)`를 같은 승인 결과로 발송한다.
- 85의 중복 방지 기준은 채팅 구성원별로 처리한 개방 경계다. 개방 이후 승인은 새 구성원의 경계를 승인
  transaction에서 선점하고, cron은 현재 경계가 아직 처리되지 않은 구성원만 선점한다. 따라서 다음 cron이 같은
  새 승인자를 다시 포함하지 않는다. 채팅 개방 전 승인은 78만 발송한다.
- 행사 단위 개방 marker는 cron batch의 요약이며 수신자 중복 방지 기준으로 사용하지 않는다.
- 행사 일시 변경으로 전날 KST 13시 개방 경계가 달라지면 새 경계에서 호스트와 당시 현재 `APPROVED`
  참가자를 다시 계산한다. 모집 재개·재마감만으로 같은 경계의 기존 구성원에게 재발송하지 않는다.

#### 라운지 댓글/대댓글 수신자 기준

- `LOUNGE_NEW_COMMENT(38)`은 게시글에 최상위 댓글(`parent = 0`)이 달린 경우에만 게시글 작성자에게 발송한다.
- `LOUNGE_NEW_CHILD_COMMENT(39)`은 대댓글(`parent > 0`)이 달린 경우 직접 부모 댓글 작성자에게만 발송한다.
- 대댓글 작성 시 최초 게시글 작성자에게 `LOUNGE_NEW_COMMENT(38)`을 함께 발송하지 않는다.
- 내가 쓴 댓글에 내가 대댓글을 다는 경우에는 `LOUNGE_NEW_CHILD_COMMENT(39)`을 발송하지 않는다.
- 댓글/대댓글 알림의 `target`은 라운지 게시글 ID로 고정한다.

### 3) 저장/전송 일관성

- 전송 시도 결과와 무관하게 알림 저장 규칙(`t_alarm`)을 일관되게 적용한다.
- 저장 필드는 최소 `member`, `type`, `target`, `create_date`를 보장한다.
- 운영 지표 집계 조건(`type IN (...)`) 변경 시 정책/쿼리를 함께 갱신한다.

### 4) 장애 대응

- FCM 전송 실패율 급증 시 fallback이 아닌 원인 분석과 재시도 정책으로 대응한다.
- 재시도는 제한 횟수/간격을 명시하며 무한 재시도를 금지한다.
- 장애 시 영향 타입/영향 사용자/복구 시점을 릴리즈 노트 또는 장애 보고에 기록한다.

### 5) 배포/검증

- 타입 변경은 API와 Mobile의 단일 최종 계약으로 배포하고 Store 출시 activation 강제 업데이트 또는 NextPush mandatory로
  이전 계약을 교체한다.
- 핵심 타입(가입/매칭/결제/운영 알림)은 배포 직후 샘플 검증한다.
- 과도기 분기는 작업 요청자가 호환 공존을 명시 승인한 경우에만 두고 승인 근거·제거 조건·담당자·목표 시점을
  기록한다.

## 운영 절차

1. 변경 제안: 타입/조건/목적/영향 범위를 문서화한다.
2. 구현: 서버 발송 조건과 저장 로직을 함께 반영한다.
3. 검증: 허용/스킵/실패 재시도 시나리오를 실행한다.
4. 배포: 모니터링 지표(성공률/실패율/중복률)를 확인한다.
5. 정리: 임시 분기 제거 여부와 문서 동기화를 완료한다.

## 증빙/추적

- PR 본문에 아래를 필수로 남긴다.
    - 타입 변경 내역(추가/수정/폐기)
    - 발송 조건 테스트 결과(허용/스킵/거부)
    - 실패 재시도 로그 또는 모니터링 링크
- 운영 변경 시 집계 쿼리 변경 근거를 함께 남긴다.

## 체크리스트

- [ ] 타입 ID 충돌/재사용 없이 문서와 코드가 동기화됐는가?
- [ ] `alarm_chat`/`alarm_match`/`alarm_event`, 토큰 부재, 환경 조건 스킵이 일관되게 동작하는가?
- [ ] 1:1 매칭 12~30·70·71과 그룹미팅 77~85가 폐쇄형 설정 매핑과 일치하는가?
- [ ] `CONCIERGE_CHAT(67)`은 `alarm_chat` 비활성 시 FCM과 `t_alarm`을 모두 건너뛰고, WebSocket·FCM 상태
      갱신을 중복 적용하지 않는가?
- [ ] `GROUP_MEETING_CHAT_MESSAGE(82)`는 `alarm_chat` 비활성 시 FCM과 `t_alarm`을 모두 건너뛰고,
      foreground 표시를 유지하면서 WebSocket 연결 중 상태 갱신을 중복 적용하지 않는가?
- [ ] `GROUP_MEETING_CHAT_OPENED(85)`는 개방 경계의 현재 구성원과 개방 이후 새 승인자를 구분하고, 새
      승인자 외 기존 구성원에게 같은 경계 알림을 중복 발송하지 않는가?
- [ ] 토큰 부재·`sendPush = false`·`OFFLINE_MODE`는 FCM만 생략하고, `MATCH_VOICE_CALL(53)`은 FCM과
      `t_alarm`을 모두 생략하는가?
- [ ] 중복 발송 방지 키 또는 동등한 통제가 있는가?
- [ ] 라운지 댓글/대댓글 알림은 최상위 댓글과 직접 부모 댓글 기준이 분리되어 있는가?
- [ ] 실패 재시도 제한 횟수와 종료 조건이 명시됐는가?
- [ ] PR/배포 기록에 타입 변경 및 운영 지표 근거가 포함됐는가?

## 관련 문서

- [푸시알림 시스템](../architecture/push-notification.md)
- [보안/접근통제 정책](security-access-control-policy.md)
- [로그 정책](log-policy.md)
- [배포/릴리즈 프로세스](release-process.md)
