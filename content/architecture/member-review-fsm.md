# 회원 심사 FSM

## 문서 역할

- 역할: `시각화`
- 문서 종류: `fsm`
- 충돌 시 우선 문서: [회원 심사 단일 정책](../policy/member-review-policy.md)
- 기준 성격: `as-is`

본 문서는 현재 운영 기준의 심사 상태 모델을 정리하는 as-is 문서다.
규범 문서가 아니라 상태 흐름과 현재 구조를 설명하는 문서이며, 신규 구현/리뷰/전환 목표의 원문 기준은 [회원 심사 단일 정책](../policy/member-review-policy.md)을 따른다.
현재 운영 상태를 읽고 설명할 때는 이 문서의 as-is 구조를 우선 참고한다.

## 구조 요약

- 회원 생애주기 상태는 `t_member.status`가 단일 기준이다.
- 심사 단계 상태의 읽기/판정 기준은 `v_member_review_status`가 단일 기준이다.
- `t_member_review_stage_snapshot`은 동기화/호환용 스냅샷 테이블이며, 비즈니스 판정 SoT로 사용하지 않는다.
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

### 2) 심사 단계 상태 스냅샷(호환용)

- 테이블: `t_member_review_stage_snapshot`
- PK: `(member_id, stage_code)` (회원당 3행)
- `stage_code`: `BASIC_INFO`, `REQUIRED_AUTH`, `INTRO` (DB 내부 스냅샷 키, API 응답 필드 아님)
- `stage_status`: `UNSUBMITTED`, `PENDING`, `RETURN`, `REAPPLY`, `APPROVED`
    - `UNSUBMITTED`: 미제출 상태. 회원이 비활성(HOLD/BLOCK/LEAVE)이거나 해당 단계 데이터가 아직 없을 때 기본값
- `stage_status_entered_at`: 해당 단계 현재 상태 진입시각
- `snapshot_updated_at`: 행 갱신시각
- 참고: 최종 상태 판정은 이 테이블 직접 조회가 아니라 `v_member_review_status` 조회를 기준으로 한다.

## 조회 뷰 역할

### `v_member_review_status` (API/모바일 기준 뷰)

- 회원당 1행 요약
- 포함 정보:
    - `member_status`
    - `member_level` (`PRE_MEMBER`/`GENERAL_MEMBER`/`SEMI_MEMBER`/`FULL_MEMBER`/`SPECIAL_MEMBER`)
    - `basic_info_status`, `required_auth_status`, `intro_status`
    - 단계별 `*_entered_at`
- API/모바일은 이 뷰를 기준으로 현재 심사 상태를 해석한다.
- 이 문서에서 심사 상태 SoV(Service Output View)는 `v_member_review_status`를 의미한다.
- API 응답 계약에서는 단계 상태를 `result_data.access_context.review_status` 객체로 전달한다.

### `v_member_review_overview` (운영 보조 집계 뷰)

- 운영 판단 보조용 확장 요약
- 포함 정보:
    - `current_focus_stage`
    - 현재 반려/재심사 플래그(`has_issue_current`)
    - 단계별 현재 플래그(`*_pending_current`, `*_return_current`, `*_reapply_current`)
    - 단계별 이력 집계(`*_history_cnt`)
- 심사 상태 읽기 SoT를 대체하지 않는다.

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
    - `status=-4`는 거절 회원으로 처리
    - 앱 진입 라우팅은 `decidePostLoginEntryRoute` 단일 함수로 처리한다
    - 매칭 화면 분기는 `decideMatchingViewState`(화면 상태) + `buildMatchingLockPanelContent`(문구)로 분리한다
- 어드민:
    - 상세 단계 상태는 `v_member_review_status` 기준으로 확인
    - 큐 분류와 원본 증거 판정은 `request_origin`이 저장된 원본 테이블을 함께 확인한다
