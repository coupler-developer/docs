# 매칭 키(Key) 시스템

매칭 과정에서의 키 소진 및 환불 규칙을 정리한 문서이다.

## 키 소진 규칙

### 여성 회원

| 액션             | 키 소진 | 비고        |
| ---------------- | ------- | ----------- |
| 패스             | -5      | 환불 없음   |
| 남성 프로필 보기 | -35     | 메인 프로필 |
| 천천히 결정하기  | -5      | 3일 연장    |

### 남성 회원

| 액션                 | 키 소진 | 비고             |
| -------------------- | ------- | ---------------- |
| 여성 프로필 보기     | -10     | 메인 프로필      |
| 여성 비디오 보기     | -15     | 비디오 프로필    |
| 미니프로필 보기      | -10     | 간략 정보        |
| 3일 채팅             | -5      | 정규 과정 생략   |
| 만남 수락 (골드)     | -200    | 등급별 상이      |
| 만남 수락 (플래티넘) | -350    | 등급별 상이      |
| 만남 수락 (다이아)   | -450    | 등급별 상이      |
| 채팅 재활성화        | -60     | 3일 채팅 종료 후 |
| 직진만남             | -77     | 후기 작성 후     |

### 보상

| 액션      | 키 보상 | 비고    |
| --------- | ------- | ------- |
| 후기 작성 | +15     | 만남 후 |

## 환불 규칙

### 전액 환불

| 상황               | 환불 대상 | 환불 항목               |
| ------------------ | --------- | ----------------------- |
| 남성 패스          | 여성      | 결제 키 전액            |
| 여성 최종컨펌 취소 | 남성      | 결제 키 + 프로필열람 키 |

### 부분 환불 (50%)

| 상황                                    | 환불 대상 |
| --------------------------------------- | --------- |
| 일정 4회 불합의 (SCHEDULE_NOT_SELECTED) | 양쪽 모두 |

### 환불 없음

| 상황          |
| ------------- |
| 여성 패스     |
| 채팅방 나가기 |
| 회원 신고     |
| 3일 채팅 종료 |

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
// model/member_key_log.js
{
  member_id: Number,     // 회원 ID
  match_id: Number,      // 매칭 ID
  type: Number,          // 로그 타입
  key: Number,           // 변동량 (+/-)
  created_date: Date,    // 발생 시각
}
```

## 근거 (코드 기준)

- 키 상수: `coupler-api/config/constant.js` (MATCH_KEY, MATCH_KEY_LOG)
- 환불 로직: `coupler-api/controller/app/v1/match.js`
- 키 로그 모델: `coupler-api/model/member_key_log.js`
