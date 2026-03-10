# 회원 생명주기

## 문서 역할

- 역할: `설명`
- 문서 종류: `architecture`
- 충돌 시 우선 문서: [회원 심사 단일 정책](../policy/member-review-policy.md)
- 기준 성격: `as-is`

회원의 전체 상태 흐름을 정리한 문서이다. 심사 과정의 세부 사항은 [member-review-fsm.md](./member-review-fsm.md)를 참고한다.

## 회원 상태 (user.status)

| 값  | 상수       | 의미     | 로그인            | 매칭 |
| --- | ---------- | -------- | ----------------- | ---- |
| -4  | `REJECTED` | 심사거절 | 제한(심사결과용) | 불가 |
| -3  | `LEAVE`    | 탈퇴     | 불가   | 불가 |
| -2  | `BLOCK`    | 영구정지 | 불가   | 불가 |
| -1  | `HOLD`     | 휴면     | 불가   | 불가 |
| 0   | `PENDING`  | 심사대기 | 가능   | 불가 |
| 1   | `NORMAL`   | 정상     | 가능   | 가능 |

## 상태 전환 FSM

```mermaid
stateDiagram-v2
    [*] --> PENDING : 회원가입

    state "심사대기\nuser.status=PENDING" as PENDING
    state "정상\nuser.status=NORMAL" as NORMAL
    state "심사거절\nuser.status=REJECTED" as REJECTED
    state "휴면\nuser.status=HOLD" as HOLD
    state "영구정지\nuser.status=BLOCK" as BLOCK
    state "탈퇴\nuser.status=LEAVE" as LEAVE

    PENDING --> NORMAL : 심사 완료
    PENDING --> REJECTED : 심사 거절
    PENDING --> BLOCK : 관리자 차단

    NORMAL --> HOLD : Cron 자동 (장기 미접속)
    NORMAL --> BLOCK : 관리자 차단
    NORMAL --> LEAVE : 회원 탈퇴

    HOLD --> NORMAL : 관리자 해제
    HOLD --> [*] : 재가입 (즉시, 정보 리셋)

    BLOCK --> [*] : 재가입 (30일 후, 정보 리셋)

    LEAVE --> [*] : 재가입 (14일 후, 정보 리셋)
```

## 상태별 상세

### REJECTED (심사거절)

- **진입**: 관리자 심사 거절 (PENDING에서 전환)
- **복귀**: 없음
- **제한**: 일반 기능 진입 불가, 매칭 불가
- **이유**: 심사거절 결과 화면 노출에는 로그인 세션이 필요하다. 다만 거절 직후 재도전 유도 UI는 일부 이용자의 반발/보복 시도 리스크를 키울 수 있어 운영 정책상 노출하지 않는다.
- **예외**: 심사거절 결과 화면 진입을 위한 제한 로그인(토큰 발급)은 허용할 수 있다. 단, private API는 접근 차단한다.

### PENDING (심사대기)

- 회원가입 직후 진입
- 심사 완료 시 `NORMAL`로, 거절 시 `REJECTED`로 전환
- 심사 과정 상세: [member-review-fsm.md](./member-review-fsm.md)

### NORMAL (정상)

- 모든 기능 사용 가능
- 매칭 대상에 포함

### HOLD (휴면)

- **진입**: Cron 자동 실행 (장기 미접속 회원)
- **복귀 경로**:
    1. 관리자 해제 → `NORMAL` (기존 정보 유지)
    2. 재가입 시도 → 정보 리셋 후 신규 가입 (대기 기간 없음)

- **제한**: 로그인/매칭 불가
- **개인정보 파기**: 해당 없음

### BLOCK (영구정지)

- **진입**: Super Admin 차단
- **복귀**: 없음 (30일 후 재가입만 가능)
- **재가입**: 30일 경과 후 정보 리셋하여 신규 가입
- **제한**: 로그인/매칭 불가
- **개인정보 파기**: 30일 후 자동 파기

### LEAVE (탈퇴)

- **진입**: 회원 자발적 탈퇴 (`member.leave` API)
- **복귀**: 없음 (14일 후 재가입만 가능)
- **재가입**: 14일 경과 후 정보 리셋하여 신규 가입
- **제한**: 로그인 시 "존재하지 않는 회원" 처리
- **개인정보 파기**: 30일 후 자동 파기

## 재가입 정책

| 상태  | 대기 기간 | 기존 정보 |
| ----- | --------- | --------- |
| HOLD  | 없음      | 리셋      |
| BLOCK | 30일      | 리셋      |
| LEAVE | 14일      | 리셋      |

- 재가입 시 기존 회원정보는 `resetUserInfo()`로 초기화된다.
- HOLD만 관리자 해제로 기존 정보를 유지한 채 복귀 가능하다.

## 개인정보 자동 파기

- **대상**: `BLOCK` 또는 `LEAVE` 상태
- **조건**: `status_date`로부터 30일 경과 + `auto_delete=NORMAL`
- **실행**: Cron 작업
