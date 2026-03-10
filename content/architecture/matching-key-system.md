# 매칭 키(Key) 시스템

## 문서 역할

- 역할: `설명`
- 문서 종류: `architecture`
- 충돌 시 우선 문서: [매칭 운영 정책](../policy/matching-ops-policy.md)
- 기준 성격: `as-is`

매칭 도메인의 키 정산 구조, 로그 타입, 대표 정산 코드 경로를 정리한 문서이다.

정확한 차감/환불 기준의 원문 SoT는 [매칭 운영 정책](../policy/matching-ops-policy.md)을 따른다.

## 정산 구조 요약

- 키 차감/환불 판단은 서버가 수행하고, 결과는 `t_member_key_log`와 `t_member.key`에 반영한다.
- 이 문서는 어떤 이벤트가 어떤 로그 타입으로 남는지, 대표 환불 코드 경로가 어떻게 생겼는지를 설명한다.
- 액션별 차감량, 환불 비율, 종료 상태 판정은 정책 문서를 기준으로 본다.

## 대표 정산 이벤트

- 프로필 열람 계열: `VIEW_PROFILE`, `VIEW_VIDEO`
- 만남/의사표현 계열: `WANT_SEE`, `MALE_PASS`, `FEMALE_PASS`
- 환불 계열: `FEMALE_CONFIRM_CANCEL`, `VIEW_PROFILE_REFUND`, `SCHEDULE_NOT_MATCH`
- 후속 액션 계열: `WRITE_REVIEW`, `CHAT_REACTIVATE`, `DIRECT_MEET`

## 환불 로직 상세

### 남성 패스 시 여성 환불

```javascript
// match.js 라인 234-256
if (match_info.female_paid_key > 0) {
  await MMemberKeyLog.getInstance().add({
    member_id: match_info.female_id,
    match_id: match_info.id,
    type: MATCH_KEY_LOG.MALE_PASS,
    key: match_info.female_paid_key, // 전액 환불
  });
}
```

### 여성 최종컨펌 취소 시 남성 환불

```javascript
// match.js 라인 635-670
// 1. 결제 키 환불
await MMemberKeyLog.getInstance().add({
  member_id: match_info.male_id,
  match_id: match_info.id,
  type: MATCH_KEY_LOG.FEMALE_CONFIRM_CANCEL,
  key: match_info.male_paid_key,
});

// 2. 프로필열람 키 환불
await MMemberKeyLog.getInstance().add({
  member_id: match_info.male_id,
  match_id: match_info.id,
  type: MATCH_KEY_LOG.VIEW_PROFILE_REFUND,
  key: viewProfileKey,
});
```

### 일정 불합의 시 50% 환불

```javascript
// match.js 라인 941-975
// 양쪽 50% 환불
const femaleRefund = Math.floor(match_info.female_paid_key * 0.5);
const maleRefund = Math.floor(match_info.male_paid_key * 0.5);
```

## 키 로그 타입 (MATCH_KEY_LOG)

| 타입                    | 의미                       |
| ----------------------- | -------------------------- |
| `FEMALE_PASS`           | 여성 패스                  |
| `MALE_PASS`             | 남성 패스 (여성 환불)      |
| `VIEW_PROFILE`          | 프로필 열람                |
| `VIEW_VIDEO`            | 비디오 열람                |
| `WANT_SEE`              | 만남 희망                  |
| `FEMALE_CONFIRM_CANCEL` | 여성 컨펌 취소 (남성 환불) |
| `VIEW_PROFILE_REFUND`   | 프로필열람 환불            |
| `SCHEDULE_NOT_MATCH`    | 일정 불합의 (50% 환불)     |
| `WRITE_REVIEW`          | 후기 작성 보상             |
| `CHAT_REACTIVATE`       | 채팅 재활성화              |
| `DIRECT_MEET`           | 직진만남                   |

## 키 잔액 추적

모든 키 변동은 `t_member_key_log` 테이블에 기록된다.

```javascript
// key log record 예시
{
  member_id: Number,     // 회원 ID
  match_id: Number,      // 매칭 ID
  type: Number,          // 로그 타입
  key: Number,           // 변동량 (+/-)
  created_date: Date,    // 발생 시각
}
```
