# 회원가입 응답 계약 (최종안)

## 문서 역할

- 역할: `규범`
- 문서 종류: `policy`
- 충돌 시 우선 문서: 성공 응답/라우팅은 이 문서, 실패 응답은 `api-error-contract-policy.md`
- 기준 성격: `transition`

본 문서는 가입/재제출/재심사 제출 API의 최종 응답 계약을 고정한다.
목표는 클라이언트 추측 라우팅 제거와 회귀 방지다.

## 에러 계약 우선순위

- 본 문서는 회원가입 성공 응답과 라우팅 기준을 다룬다.
- 실패 응답 계약은 [API 에러 계약 정책](api-error-contract-policy.md)을 단일 SoT(단일 기준)로 따른다.
- 본 문서는 실패 응답 envelope(응답 바깥 구조), `ApiErrorData`, `request_id`, `error_action`을 재정의하지 않는다.

## 목적

- 회원가입 플로우에서 화면 분기 기준을 단일화한다.
- 성공 응답의 `result_code`와 `result_data` 역할을 분리한다.
- 모바일/서버가 같은 상태 모델을 기준으로 동작하게 한다.

## 역할 분리

### 1) 성공 `result_code`

- 회원가입 성공 응답은 `result_code = 0`이다.
- 실패 `result_code`, HTTP Status, `ApiErrorData`는 [API 에러 계약 정책](api-error-contract-policy.md)을 따른다.

### 2) 성공 `result_data`

- 성공 시 도메인 상태 원본을 전달한다.
- 성공 화면 분기에 필요한 모든 상태는 `result_data`에 포함되어야 한다.
- 심사 분기/권한 필드는 `result_data.access_context` 단일 객체만 사용한다.
- 실패 시 `result_data`는 [API 에러 계약 정책](api-error-contract-policy.md)의 `ApiErrorData`를 사용한다.

### 3) 클라이언트 라우팅

- 성공 라우팅은 `result_data` 상태 기반으로만 수행한다.
- 실패 분기는 [API 에러 계약 정책](api-error-contract-policy.md)을 따른다.

## 성공 응답 계약 (`result_code = 0`)

`/app/v1/auth/signup` 성공 응답은 아래 필드를 항상 포함해야 한다.

- `token`
- `basic_info`
- `pending_profile`
- `profile_set_current`
- `profile_set_pending`
- `access_context`
- `marketing_events`

필드명 고정(명시):

- 심사/권한 컨텍스트 필드명은 `access_context`로 고정한다.

금지(혼용 금지):

- `result_data.review_stage` 단일 단계 문자열
- 문자열 `result_data.review_status` (`"PENDING"` 같은 표현)

`access_context` 필수 필드:

- `user_status`
- `member_level`
- `review_status.basic_info_status`
- `review_status.required_auth_status`
- `review_status.intro_status`
- `review_status.member_level`
- `review_flow.phase`
- `matching_tab_access.on_going.allowed`
- `matching_tab_access.you.allowed`
- `matching_tab_access.members.allowed`
- 잠금 탭에는 `matching_tab_access.*.reason_code`를 포함한다.
  : `review_pending`, `required_auth_missing`
- `permissions.setting_edit_allowed`
- `permissions.profile_edit_allowed`
- `permissions.lounge_write_allowed`
- `permissions.lounge_comment_allowed`

`marketing_events.complete_registration` 필수 필드:

- `track`: `boolean`
- `event_name`: `af_complete_registration`
- `event_id`: `string | null`

마케팅 이벤트 계약:

- 가입 완료 이벤트 발행 여부는 `marketing_events.complete_registration.track`만 사용한다.
- 서버는 신규 회원 레코드가 생성되는 최초 가입 제출에만 `track = true`를 내려준다.
- 기존 회원/승급 제출, 심사 재제출, 프로필 수정 제출은 성공 응답이어도 `track = false`를 내려준다.
- `event_id`는 운영 추적용 값이며, `track = true`일 때만 문자열을 내려주고 그 외에는 `null`로 내려준다.

## 라우팅 기준

클라이언트는 아래 순서로 동작한다.

1. `result_code !== 0`이면 [API 에러 계약 정책](api-error-contract-policy.md)의 `error_action/error_code`로 에러 처리.
2. `result_code === 0`이면 `result_data`를 상태 저장소에 반영.
3. `access_context.review_flow.phase + access_context.review_status.basic_info_status`로 다음 화면 결정.
4. 필요 시 `getSignupReviewOutcome` 같은 순수 함수로 분기 규칙을 고정.
5. 마케팅 이벤트는 라우팅 기준이 아니며, 상태 반영 후 `marketing_events.complete_registration.track = true`일 때만 실행.

## 금지 사항

- `result_code=1`을 "심사중", "재제출" 같은 도메인 상태로 사용.
- 성공 응답에서 `access_context` 외 심사 필드를 top-level로 중복 제공.
- `review_stage`와 `review_status`(문자열)를 동시에 내려주는 이중 계약.
- 서버 힌트(`next_step`)를 라우팅 단일 근거로 사용.
- 클라이언트 로컬 플래그만으로 서버 상태를 덮어 라우팅.
- 클라이언트 로컬 `member.id`, 세션, pending/review 상태 조합으로 가입 완료 이벤트 발행 여부를 추론.

## 호환/이행 규칙

- 과도기 fallback은 기본 금지가 원칙이며, 아래 조건을 모두 만족하는 경우에만 예외로 허용한다.
    - 허용 범위: `signup` 성공 직후 클라이언트의 1회 `getUserInfo` 재조회만 허용한다. 다른 추가 fallback/이중 라우팅은 금지한다.
    - 제거 조건: 가입/재제출/설정 재심사 제출 응답이 본 문서의 필수 필드를 모두 포함하고, 클라이언트가 `signup 1회 호출 + 응답 상태 반영`만으로 동일 분기를 수행함을 테스트/로그로 확인하면 제거한다.
    - 담당자/목표 시점/추적 이슈: PR 또는 추적 이슈에 API/Mobile 담당자, 제거 목표 시점, 추적 이슈 링크를 함께 남긴 경우에만 유지할 수 있다.
    - 검증 근거: 대상 시나리오, 검증 범위, 로그 또는 테스트 결과 링크를 PR/작업 보고에 남긴다.
- 최종 상태에서는 `signup 1회 호출 + 응답 상태 반영`으로 완료되어야 한다.

## 검증 체크리스트

- 성공 응답에서 필수 필드 누락 시 서버 계약 위반으로 처리하는가.
- 실패 응답 처리 기준이 [API 에러 계약 정책](api-error-contract-policy.md)을 참조하는가.
- 클라이언트 라우팅이 `result_code` 양수값에 의존하지 않는가.
- 가입 완료 이벤트 발행 여부가 `marketing_events.complete_registration.track`만 사용하도록 고정되어 있는가.
- 가입/재제출/설정 재심사 제출 모두 동일 계약으로 응답하는가.
- 과도기 fallback이 남아 있다면 제거 조건/담당자/목표 시점/추적 이슈/검증 근거가 PR 또는 추적 이슈에 남아 있는가.
