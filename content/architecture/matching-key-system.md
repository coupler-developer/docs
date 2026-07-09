# 매칭 키(Key) 시스템

## 문서 역할

- 역할: `설명`
- 문서 종류: `architecture`
- 충돌 시 우선 문서: [매칭 운영 정책](../policy/matching-ops-policy.md)
- 기준 성격: `as-is`

매칭 도메인의 키 정산 구조, 로그 기록 방식, 대표 정산 코드 경로를 정리한 문서이다.

정확한 차감/환불 기준의 원문 SoT는 [매칭 운영 정책](../policy/matching-ops-policy.md)을 따른다.

## 정산 구조 요약

- 키 차감/환불 판단은 서버가 수행하고, 결과는 `t_member_key_log`와 `t_member.key`에 반영한다.
- 이 문서는 어떤 이벤트가 어떤 로그 기록으로 남는지, 대표 환불 코드 경로가 어디인지 설명한다.
- 액션별 차감량, 환불 비율, 종료 상태 판정은 정책 문서를 기준으로 본다.

## 대표 정산 이벤트

- 프로필 열람 계열: 프로필/비디오/미니프로필 열람 차감
- 만남/의사표현 계열: 만남 의향, 만남 수락, 프로필 패스 차감
- 환불 계열: 남성 패스, 여성 최종컨펌 취소, 일정 불합의 환불
- 후속 액션 계열: 후기 작성 보상, 채팅 재활성화, 직진만남 차감

## 환불 로직 상세

대표 환불 경로는 `coupler-api/controller/app/v1/match.ts`에 있다.

| 상황 | 코드 경계 | 로그 문구 기준 |
| --- | --- | --- |
| 남성 패스 시 여성 환불 | `pass` 흐름 | `key_log.male_pass` |
| 여성 최종컨펌 취소 시 남성 환불 | `confirm` 흐름 | `key_log.confirm_cancel` |
| 일정 불합의 환불 | 매칭 취소 흐름 | `key_log.match_cancel` |

구체적인 환불 금액과 상태 조건은 [매칭 운영 정책](../policy/matching-ops-policy.md)을 기준으로 본다.

## 키 로그 기록 기준

키 로그는 `coupler-api/model/member_key_log.ts`의 `insertLog`를 통해 `t_member_key_log`에 기록한다.
`type`은 현재 `KEY_LOG.NORMAL` 또는 `KEY_LOG.FREE_KEY` 구분에 사용하고, 매칭 액션의 의미는 `content`에 저장되는 로그 문구를 기준으로 남긴다.

## 키 잔액 추적

모든 키 변동은 `t_member_key_log` 테이블에 기록된다.

| 필드 | 의미 |
| --- | --- |
| `member` | 회원 ID |
| `key` | 키 변동량 |
| `key_total` | 변경 후 잔액 |
| `content` | 로그 문구 |
| `type` | `KEY_LOG.NORMAL` 또는 `KEY_LOG.FREE_KEY` |
| `create_date` | 발생 시각 |
