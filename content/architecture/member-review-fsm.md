# 회원 심사 FSM

## 문서 역할

- 역할: `시각화`
- 문서 종류: `fsm`
- 충돌 시 우선 문서: [회원 심사 단일 정책](../policy/member-review-policy.md)
- 기준 성격: `as-is`

본 문서는 현재 운영 기준의 심사 상태 모델을 정리하는 as-is 문서다.
규범 문서가 아니라 상태 흐름과 현재 구조를 설명하는 문서이며, 신규 구현/리뷰/전환 목표의 원문 기준은 [회원 심사 단일 정책](../policy/member-review-policy.md)을 따른다.
현재 운영 상태의 구조를 읽고 설명할 때는 이 문서를 보조 자료로 참고하되, 규범 또는 전환 목표 판단은 정책 문서를 우선한다.

## 구조 요약

- 회원 생애주기 상태는 `member.member`가 단일 기준이다.
- 심사 단계 상태의 읽기 기준은 `member-review.status-projection`이다.
- `member-review.stage-snapshot`은 동기화·호환용이며 비즈니스 판정 SoT로 사용하지 않는다.
- 최종 거절은 심사 단계가 아니라 회원 생애주기의 `REJECTED`로만 표현한다.
- 반려/재심사는 단계별 상태(`RETURN`, `REAPPLY`)로 표현한다.

## 데이터 모델과 조회 역할

- 심사 요청, 인증 증거, 프로필 버전과 조회 모델의 소유권은
  [회원 심사 시스템](member-review-system.md)의 `member-review` 논리 모델을 따른다.
- 회원 생애주기는 [회원 라이프사이클](member-lifecycle.md)의 `member.member`가 소유한다.
- API·Mobile은 `member-review.status-projection`을 기준으로 현재 심사 상태를 해석한다.
- Admin 운영 큐는 `member-review.overview-projection`을 보조 조회로 사용하되 심사 판정 원천을 대체하지
  않는다.
- `member-review.stage-snapshot`은 표시·호환용 snapshot이며 비즈니스 판정 SoT로 사용하지 않는다.

## 상태 해석 규칙

### 회원 등급

| 코드 | 표시명 | 조건 |
| ---- | ------ | ---- |
| `PRE_MEMBER` | 신청회원 | 가입 심사 진행 중이며 `basic_info_status <> 'APPROVED'` |
| `GENERAL_MEMBER` | 일반회원 | `basic_info_status = 'APPROVED'` |
| `SEMI_MEMBER` | 준회원 | `basic_info_status = 'APPROVED'` + `required_auth_status = 'APPROVED'` |
| `FULL_MEMBER` | 정회원 | `basic_info_status = 'APPROVED'` + `required_auth_status = 'APPROVED'` + `intro_status = 'APPROVED'` |
| `SPECIAL_MEMBER` | 특별회원 | 매니저가 수동 지정 |

- **신청회원**(`PRE_MEMBER`): 가입 심사 진행 중이며 아직 기본정보 승인이 완료되지 않은 상태다. 매니저 등급 표시 대상이 아니다.
- `member_status IN (-4,-3,-2,-1)`인 회원은 `PRE_MEMBER`로 해석하지 않고, 생애주기 상태(`REJECTED` 또는 `INACTIVE`)를 우선 해석한다.
- **매니저에게 보여지는 등급**: 일반회원, 준회원, 정회원, 특별회원

### 현재 포커스 단계

- `member_status IN (-3,-2,-1)` → `INACTIVE`
- `member_status = -4` → `REJECTED`
- 기본정보 미승인 → `BASIC_INFO`
- 인증 미승인 → `REQUIRED_AUTH`
- 소개글 미승인 → `INTRO`
- 그 외 → `COMPLETE`

### 반려/재심사

- 반려: `RETURN`
- 재심사 요청: `REAPPLY`
- 동일 회원에서 서류/소개글 반려가 동시에 존재할 수 있다.

### 생애주기 승격 트리거 (`status` 0→1)

`syncMemberReviewStatusByMemberId()` 실행 시, 아래 4개 조건이 모두 충족되면 `t_member.status`를 `0(심사중)→1(정상)`으로 자동 승격한다.

| 조건 | 설명 |
| ---- | ---- |
| `basic_info_status = 'APPROVED'` | 기본정보 단계 승인 |
| `required_auth_status = 'APPROVED'` | 필수인증 단계 승인 |
| `intro_status = 'APPROVED'` | 소개글 단계 승인 |
| `required_auth_guard_code = 'OK'` | 매니저 필수인증 설정 유효 |

- `required_auth_guard_code`는 전담매니저 링크·필수인증 설정이 정상인지 검증한다. 매니저 링크 누락·중복, 필수인증 미설정 시 `'OK'`가 아니므로 승격이 차단된다.
- 승격 성공 시 변경된 `member.status`를 반영하기 위해 `syncMemberReviewStatusByMemberId()`를 1회 재귀 호출한다.

## 앱/어드민 적용 기준

- 앱:
    - `v_member_review_status` 기준으로 심사 분기
    - `status=-4`는 서버 내부에서 거절 회원으로 유지하되 사용자에게는 심사중 화면으로만 투영
    - 앱 진입 라우팅은 `decidePostLoginEntryRoute` 단일 함수로 처리한다
    - 내부 거절 회원은 심사 단계와 관계없이 `SignupReviewScreen`으로 진입하며 거절 사실을 노출하지 않는다
    - 매칭 화면 분기는 `decideMatchingViewState`(화면 상태) + `buildMatchingLockPanelContent`(문구)로 분리한다
- 어드민:
    - 상세 단계 상태는 `v_member_review_status` 기준으로 확인
    - 큐 분류와 원본 증거 판정은 `request_origin`이 저장된 원본 테이블을 함께 확인한다
