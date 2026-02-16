# 회원 심사 FSM (현행 기준)

본 문서는 현재 운영 기준의 심사 상태 모델을 정리한다.

## 핵심 원칙

- 회원 생애주기 상태는 `t_member.status`가 단일 기준이다.
- 심사 단계 상태는 `t_member_review_status`가 단일 기준이다.
- 최종 거절은 단계 상태가 아니라 `t_member.status = -4`로만 표현한다.
- 반려/재심사는 단계별 상태(`RETURN`, `REAPPLY`)로 표현한다.

## 저장 구조

### 1) 회원 생애주기

- 테이블: `t_member`
- 컬럼: `status`
- 값:
  - `-4`: 심사 거절
  - `-3`: 탈퇴
  - `-2`: 차단
  - `-1`: 홀딩
  - `0`: 심사중
  - `1`: 정상

### 2) 심사 단계 상태

- 테이블: `t_member_review_status`
- PK: `(member_id, review_stage)` (회원당 3행)
- `review_stage`: `BASIC_INFO`, `REQUIRED_AUTH`, `INTRO`
- `review_status`: `UNSUBMITTED`, `PENDING`, `RETURN`, `REAPPLY`, `APPROVED`
  - `UNSUBMITTED`: 미제출 상태. 회원이 비활성(HOLD/BLOCK/LEAVE)이거나 해당 단계 데이터가 아직 없을 때 기본값
- `entered_at`: 해당 단계 현재 상태 진입시각
- `status_updated_at`: 행 갱신시각

## 조회 뷰 역할

### `v_member_review_status` (API/모바일 기준 뷰)

- 회원당 1행 요약
- 포함 정보:
  - `member_status`
  - `member_level` (`PRE_MEMBER`/`GENERAL`/`SEMI_MEMBER`/`FULL_MEMBER`)
  - `basic_info_status`, `required_auth_status`, `intro_status`
  - 단계별 `*_entered_at`
- API/모바일은 이 뷰를 기준으로 현재 심사 상태를 해석한다.

### `v_member_review_overview` (운영/어드민 기준 뷰)

- 운영 판단용 확장 요약
- 포함 정보:
  - `current_focus_stage`
  - 현재 반려/재심사 플래그(`has_issue_current`)
  - 단계별 현재 플래그(`*_pending_current`, `*_return_current`, `*_reapply_current`)
  - 단계별 이력 집계(`*_history_cnt`)

## 상태 해석 규칙

### 회원 등급

- `member_status IN (-4,-3,-2,-1)`이면 항상 `PRE_MEMBER`
- `basic_info_status <> 'APPROVED'`이면 `PRE_MEMBER`
- `basic_info_status='APPROVED'` + `required_auth_status='APPROVED'` + `intro_status='APPROVED'`이면 `FULL_MEMBER`
- `basic_info_status='APPROVED'` + `required_auth_status='APPROVED'`이면 `SEMI_MEMBER`
- `basic_info_status='APPROVED'`이면 `GENERAL`

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

`syncMemberReviewStatusByMemberId()` 실행 시, 아래 3개 조건이 모두 충족되면 `t_member.status`를 `0(심사중)→1(정상)`으로 자동 승격한다.

| 조건 | 설명 |
| ---- | ---- |
| `basic_info_status = 'APPROVED'` | 기본정보 단계 승인 |
| `required_auth_status = 'APPROVED'` | 필수인증 단계 승인 |
| `required_auth_guard_code = 'OK'` | 매니저 필수인증 설정 유효 |

- **INTRO 단계는 승격 조건에 포함되지 않는다.** INTRO는 `member_level`(FULL_MEMBER) 산출에만 영향을 준다.
- `required_auth_guard_code`는 전담매니저 링크·필수인증 설정이 정상인지 검증한다. 매니저 링크 누락·중복, 필수인증 미설정 시 `'OK'`가 아니므로 승격이 차단된다.
- 승격 성공 시 변경된 `member.status`를 반영하기 위해 `syncMemberReviewStatusByMemberId()`를 1회 재귀 호출한다.

## 앱/어드민 적용 기준

- 앱:
  - `v_member_review_status` 기준으로 심사 분기
  - `status=-4`는 거절 회원으로 처리
- 어드민:
  - 운영 리스트/필터는 `v_member_review_overview` 우선
  - 상세 단계 상태는 `v_member_review_status` 또는 `t_member_review_status` 원본 확인

## 금지 사항

- `t_member`에 심사 단계 컬럼(`pending_status`, `review_stage`)을 다시 저장하지 않는다.
- 최종 거절을 단계 상태(`review_status`)로 표현하지 않는다.
