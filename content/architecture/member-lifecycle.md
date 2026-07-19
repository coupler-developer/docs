# 회원 라이프사이클

## 문서 역할

- 역할: `설명`
- 문서 종류: `architecture`
- 충돌 시 우선 문서: [회원 심사 단일 정책](../policy/member-review-policy.md)
- 기준 성격: `as-is`

회원의 전체 상태 흐름을 정리한 as-is 문서다.
현재 운영 중인 회원 생애주기 상태 구조를 읽고 설명할 때는 이 문서를 보조 자료로 참고한다.
신규 구현/리뷰/전환 목표의 규범 SoT는 [회원 심사 단일 정책](../policy/member-review-policy.md)을 따르며, 심사 과정의 세부 상태 흐름은 [회원 심사 FSM](./member-review-fsm.md)을 참고한다.
개인정보 자동 파기와 보관 기한의 규범 SoT는 [데이터 거버넌스 정책](../policy/data-governance-policy.md)을 따른다.

## 논리 데이터 모델

- 도메인 ID: `member`

### 먼저 보는 그림

이 그림은 데이터가 어디에 속하고 무엇을 참고하는지 먼저 보여준다.
정확한 이름과 조건은 아래 상세 표를 따른다.

```mermaid
flowchart LR
    entity_club_dash_manager_dot_manager["클럽매니저 · 다른 영역<br/>club-manager.manager"]
    entity_member_dot_invitation["회원 초대<br/>member.invitation"]
    entity_member_dot_member["회원 계정<br/>member.member"]
    entity_member_dot_profile["회원 프로필<br/>member.profile"]
    entity_member_dot_recommendation["회원 추천사<br/>member.recommendation"]
    entity_member_dot_signup_dash_welcome["가입 안내 발송 이력<br/>member.signup-welcome"]
    entity_member_dot_sleep_dash_history["휴면 이력<br/>member.sleep-history"]
    entity_member_dot_status_dash_history["회원 상태 이력<br/>member.status-history"]
    entity_platform_dash_config_dot_signup_dash_message["가입 안내 · 다른 영역<br/>platform-config.signup-message"]
    entity_member_dot_member -->|"같이 관리"| entity_member_dot_profile
    entity_member_dot_member -->|"같이 관리"| entity_member_dot_status_dash_history
    entity_member_dot_member -->|"같이 관리"| entity_member_dot_sleep_dash_history
    entity_member_dot_member -->|"같이 관리"| entity_member_dot_invitation
    entity_member_dot_recommendation -->|"참고"| entity_member_dot_member
    entity_member_dot_member -->|"같이 관리"| entity_member_dot_signup_dash_welcome
    entity_member_dot_signup_dash_welcome -->|"참고"| entity_platform_dash_config_dot_signup_dash_message
    entity_member_dot_signup_dash_welcome -->|"참고"| entity_club_dash_manager_dot_manager
```

꼭 지킬 규칙:

- 회원 생애주기의 현재 상태는 하나만 존재한다
- 현재 프로필은 회원이 사용할 수 있는 승인 상태와 일치해야 한다
- 가입 안내와 무료 Key 최초 지급은 회원당 한 번만 성공한다

<!-- markdownlint-disable MD046 -->

??? info "정확한 값과 조건 보기"

    ### 논리 엔티티

    | 논리 ID | 표시명 | 생명주기 역할 | 엔티티 형태 | 기록 역할 | 책임 | 최고 데이터 분류 | 생명주기 |
    | --- | --- | --- | --- | --- | --- | --- | --- |
    | `member.member` | 회원 계정 | root | entity | state | 인증 식별자와 회원 생애주기의 현재 상태 | 민감 | 탈퇴·차단 뒤 정책에 따라 개인정보를 정리하고 비개인 이력은 보존 |
    | `member.profile` | 회원 프로필 | child | entity | state | 현재 승인된 프로필과 매칭 선호 정보 | 민감 | 회원 계정과 함께 유지하고 이전 제출본은 심사 도메인이 관리 |
    | `member.invitation` | 회원 초대 | child | entity | history | 초대 코드의 생성·사용·만료 결과 | 내부 | 사용·만료 결과를 이력으로 보존 |
    | `member.recommendation` | 회원 추천사 | root | association | history | 작성 회원과 대상 회원 사이의 추천 내용 | 민감 | 노출 상태와 개인정보 정리 정책을 함께 적용 |
    | `member.status-history` | 회원 상태 이력 | child | entity | history | 생애주기 상태 변경과 변경 사유 | 민감 | 감사·운영 목적의 append-only 이력으로 보존 |
    | `member.sleep-history` | 휴면 이력 | child | entity | history | 휴면 전환 기간과 복귀 근거 | 내부 | 휴면 정책 확인 기간 동안 보존 |
    | `member.signup-welcome` | 가입 안내 발송 이력 | child | entity | history | 가입 안내와 무료 Key 최초 지급 결과 | 내부 | 중복 지급 방지를 위해 이력 보존 |

    ### 관계

    | 출발 논리 ID | 관계 역할 | 관계 유형 | 도착 논리 ID | 카디널리티 | 소유·삭제 규칙 |
    | --- | --- | --- | --- | --- | --- |
    | `member.member` | `profile` | owns | `member.profile` | 1:1 | 계정 개인정보 정리 시 현재 프로필도 함께 정리 |
    | `member.member` | `status-history` | owns | `member.status-history` | 1:N | 상태 이력은 계정 삭제 뒤 비식별 보존 가능 |
    | `member.member` | `sleep-history` | owns | `member.sleep-history` | 1:N | 회원 생애주기와 함께 관리 |
    | `member.member` | `sent-invitations` | owns | `member.invitation` | 1:N | 초대자의 개인정보 정리 뒤에도 사용·만료 결과는 비식별 보존 가능 |
    | `member.recommendation` | `writer` | references | `member.member` | N:1 | 작성 회원과 대상 회원은 같을 수 없음 |
    | `member.recommendation` | `receiver` | references | `member.member` | N:1 | 대상 회원 개인정보 정리 정책과 노출 상태를 함께 적용 |
    | `member.member` | `signup-welcome` | owns | `member.signup-welcome` | 1:1 | 가입 안내와 무료 Key 최초 지급 결과는 회원당 하나만 유지 |
    | `member.signup-welcome` | `message-template` | references | `platform-config.signup-message` | N:1 | 기준정보 변경 뒤에도 발송 당시 선택 근거를 보존 |
    | `member.signup-welcome` | `manager` | references | `club-manager.manager` | N:1 | 클럽매니저 비활성 뒤에도 당시 발송 주체를 비식별 이력으로 보존 |

    ### 불변조건

    | 규칙 ID | 관련 논리 ID | 불변조건 | 기준 문서 |
    | --- | --- | --- | --- |
    | `MEMBER-INV-001` | `member.member` | 회원 생애주기의 현재 상태는 하나만 존재한다 | [회원 심사 단일 정책](../policy/member-review-policy.md) |
    | `MEMBER-INV-002` | `member.profile` | 현재 프로필은 회원이 사용할 수 있는 승인 상태와 일치해야 한다 | [회원 심사 단일 정책](../policy/member-review-policy.md) |
    | `MEMBER-INV-003` | `member.signup-welcome` | 가입 안내와 무료 Key 최초 지급은 회원당 한 번만 성공한다 | [매칭 Key 시스템](matching-key-system.md) |

<!-- markdownlint-enable MD046 -->

## 회원 상태 (`t_member.status`)

| 값  | 상수       | 의미     | 로그인            | 매칭 |
| --- | ---------- | -------- | ----------------- | ---- |
| -4  | `REJECTED` | 심사거절 | 제한(심사중 투영·철회용) | 불가 |
| -3  | `LEAVE`    | 탈퇴     | 불가   | 불가 |
| -2  | `BLOCK`    | 영구정지 | 불가   | 불가 |
| -1  | `HOLD`     | 휴면     | 불가   | 불가 |
| 0   | `PENDING`  | 심사대기 | 가능   | 불가 |
| 1   | `NORMAL`   | 정상     | 가능   | 가능 |

## 상태 전환 FSM

```mermaid
stateDiagram-v2
    [*] --> PENDING : 회원가입

    state "심사대기\nt_member.status=PENDING" as PENDING
    state "정상\nt_member.status=NORMAL" as NORMAL
    state "심사거절\nt_member.status=REJECTED" as REJECTED
    state "휴면\nt_member.status=HOLD" as HOLD
    state "영구정지\nt_member.status=BLOCK" as BLOCK
    state "탈퇴\nt_member.status=LEAVE" as LEAVE

    PENDING --> NORMAL : 심사 완료
    PENDING --> REJECTED : 심사 거절
    PENDING --> BLOCK : 관리자 차단

    NORMAL --> HOLD : Cron 자동 (장기 미접속)
    NORMAL --> BLOCK : 관리자 차단
    NORMAL --> LEAVE : 회원 탈퇴

    HOLD --> NORMAL : 관리자 해제
    HOLD --> [*] : 재가입 (정책 기준, 정보 리셋)

    BLOCK --> [*] : 재가입 (정책 기준, 정보 리셋)

    LEAVE --> [*] : 재가입 (정책 기준, 정보 리셋)
```

## 상태별 상세

### REJECTED (심사거절)

- **진입**: 관리자 심사 거절 (PENDING에서 전환)
- **복귀**: 없음
- **제한**: 일반 기능 진입 불가, 매칭 불가
- **Mobile 투영**: 거절 사실을 노출하지 않고 수동로그인·자동로그인 모두 심사중 화면을 유지한다.
- **제한 세션**: 본인 심사 현황 조회와 가입 심사 철회만 허용한다.
- **삭제**: 사용자가 가입 심사를 철회하면 회원 데이터가 삭제되고 CMS 거절 회원 탭에서도 사라진다.

### PENDING (심사대기)

- 회원가입 직후 진입
- 심사 완료 시 `NORMAL`로, 거절 시 `REJECTED`로 전환
- 심사 과정 상세: [회원 심사 단일 정책](../policy/member-review-policy.md), [회원 심사 FSM](./member-review-fsm.md)

### NORMAL (정상)

- 모든 기능 사용 가능
- 매칭 대상에 포함

### HOLD (휴면)

- **진입**: Cron 자동 실행 (장기 미접속 회원)
- **복귀 경로**:
    1. 관리자 해제 → `NORMAL` (기존 정보 유지)
    2. 재가입 시도 → 정책 기준 대기 후 정보 리셋 신규 가입

- **제한**: 로그인/매칭 불가
- **개인정보 파기**: 해당 없음

### BLOCK (영구정지)

- **진입**: Super Admin 차단
- **복귀**: 없음 (재가입 대기 기준은 정책 참조)
- **재가입**: 정책 기준 경과 후 정보 리셋하여 신규 가입
- **제한**: 로그인/매칭 불가
- **개인정보 파기**: [데이터 거버넌스 정책](../policy/data-governance-policy.md) 참조

### LEAVE (탈퇴)

- **진입**: 회원 자발적 탈퇴 (`member.leave` API)
- **복귀**: 없음 (재가입 대기 기준은 정책 참조)
- **재가입**: 정책 기준 경과 후 정보 리셋하여 신규 가입
- **제한**: 로그인 시 "존재하지 않는 회원" 처리
- **개인정보 파기**: [데이터 거버넌스 정책](../policy/data-governance-policy.md) 참조

## 재가입 정책

| 상태  | 대기 기간 | 기존 정보 |
| ----- | --------- | --------- |
| HOLD  | 정책 참조 | 리셋      |
| BLOCK | 정책 참조 | 리셋      |
| LEAVE | 정책 참조 | 리셋      |

- 재가입 시 기존 회원정보는 `resetUserInfo()`로 초기화된다.
- HOLD만 관리자 해제로 기존 정보를 유지한 채 복귀 가능하다.
- 재가입 대기 기간의 원문 SoT는 [회원 심사 단일 정책](../policy/member-review-policy.md)을 따른다.

## 개인정보 자동 파기

- **대상**: `BLOCK` 또는 `LEAVE` 상태
- **조건**: [데이터 거버넌스 정책](../policy/data-governance-policy.md)의 자동 정리 기준
- **실행**: Cron 작업
