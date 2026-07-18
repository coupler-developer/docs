# 회원가입 응답 계약 (최종안)

## 문서 역할

- 역할: `규범`
- 문서 종류: `policy`
- 충돌 시 우선 문서: 회원가입 성공 `data`/라우팅은 이 문서, 공통 envelope은 `api-response-contract-policy.md`, 실패 `ErrorData`는 `api-error-contract-policy.md`
- 기준 성격: `transition`

본 문서는 가입/재제출/재심사 제출 API의 최종 응답 계약을 고정한다.
목표는 클라이언트 추측 라우팅 제거와 회귀 방지다.
전환 잔여 범위와 완료 조건은 [기술 부채 정리](../technical-debt/technical-debt.md)의
`회원가입 후속 안정화`, `API 응답 공통 계약 cutover 인덱스`에서 추적한다.

## 에러 계약 우선순위

- 본 문서는 회원가입 성공 응답과 라우팅 기준을 다룬다.
- 공통 응답 envelope은 [API 공통 응답 계약 정책](api-response-contract-policy.md)을 단일 SoT(단일 기준)로 따른다.
- 실패 응답 계약은 [API 에러 계약 정책](api-error-contract-policy.md)을 단일 SoT(단일 기준)로 따른다.
- 본 문서는 공통 응답 envelope, `ErrorData`, `request_id`, `error_action`을 재정의하지 않는다.

## 목적

- 회원가입 플로우에서 화면 분기 기준을 단일화한다.
- 성공 응답의 `ok`와 `data` 역할을 분리한다.
- 모바일/서버가 같은 상태 모델을 기준으로 동작하게 한다.

## 역할 분리

### 1) 성공 envelope

- 회원가입 성공 응답은 [API 공통 응답 계약 정책](api-response-contract-policy.md)의 `{ ok: true, data }`다.
- 실패 envelope는 [API 공통 응답 계약 정책](api-response-contract-policy.md)을 따르고, `ErrorData`는 [API 에러 계약 정책](api-error-contract-policy.md)을 따른다.
- HTTP Status Code는 응답 헤더/프로토콜 정보이며, 회원가입 JSON body에 섞지 않는다.

### 2) 성공 `data`

- 성공 시 도메인 상태 원본을 전달한다.
- 성공 화면 분기에 필요한 모든 상태는 `data`에 포함되어야 한다.
- 심사 분기/권한 필드는 `data.access_context` 단일 객체만 사용한다.
- 실패 시 성공 `data`를 내려주지 않고, [API 에러 계약 정책](api-error-contract-policy.md)의 `error: ErrorData`를 사용한다.

### 3) 클라이언트 라우팅

- 성공 라우팅은 `data` 상태 기반으로만 수행한다.
- 실패 분기는 [API 공통 응답 계약 정책](api-response-contract-policy.md)과 [API 에러 계약 정책](api-error-contract-policy.md)을 따른다.

## 성공 응답 계약 (`ok: true`)

`/app/v1/auth/signup` 성공 응답은 아래 필드를 항상 포함해야 한다.

- `token`
- `basic_info`
- `pending_profile`
- `profile_set_current`
- `profile_set_pending`
- `access_context`

필드명 고정(명시):

- 심사/권한 컨텍스트 필드명은 `access_context`로 고정한다.

금지(혼용 금지):

- `data.review_stage` 단일 단계 문자열
- 문자열 `data.review_status` (`"PENDING"` 같은 표현)

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

마케팅 이벤트 계약:

- 회원가입 응답은 Meta SDK 직접 이벤트 발행 여부를 서버 필드로 내려주지 않는다.
- 클라이언트는 일반회원 승급심사를 위한 기본정보 최종 제출 후 `/app/v1/auth/signup`가 `{ ok: true, data }`를 반환하고 제출 완료 처리를 수행할 때 Meta `CompletedRegistration`을 기록한다.
- 인증 심사 승인, 소개글 심사 승인, Admin 운영 승인, 기존 회원 프로필 수정, 심사 재제출은 Meta `CompletedRegistration` 기록 시점이 아니다.
- 마케팅 이벤트는 라우팅 기준이 아니며, 실패 응답/네트워크 실패/클라이언트 검증 실패에서는 기록하지 않는다.
- Meta 이벤트 목록과 발화 시점은 [마케팅 앱 이벤트 정책](marketing-app-events-policy.md)을 단일 기준으로 따른다.

## 라우팅 기준

클라이언트는 아래 순서로 동작한다.

1. `ok === false`이면 [API 공통 응답 계약 정책](api-response-contract-policy.md)의 envelope 판정 후 [API 에러 계약 정책](api-error-contract-policy.md)의 `error.error_action/error.error_code`로 에러 처리.
2. `ok === true`이면 `data`를 상태 저장소에 반영.
3. `access_context.review_flow.phase + access_context.review_status.basic_info_status`로 다음 화면 결정.
4. 필요 시 `getSignupReviewOutcome` 같은 순수 함수로 분기 규칙을 고정.
5. 마케팅 이벤트는 라우팅 기준이 아니며, 제출 완료 처리 후 Meta SDK 직접 이벤트로 실행.

## 금지 사항

- top-level `result_code`를 "심사중", "재제출" 같은 도메인 상태로 사용.
- 성공 응답에서 `access_context` 외 심사 필드를 top-level로 중복 제공.
- `review_stage`와 `review_status`(문자열)를 동시에 내려주는 이중 계약.
- 서버 힌트(`next_step`)를 라우팅 단일 근거로 사용.
- 클라이언트 로컬 플래그만으로 서버 상태를 덮어 라우팅.
- 클라이언트 로컬 `member.id`, 세션, pending/review 상태 조합으로 라우팅을 추론.

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
- 클라이언트 라우팅이 top-level `result_code` 또는 숫자 성공/실패 코드에 의존하지 않는가.
- 일반회원 승급심사 기본정보 제출 이벤트가 성공 라우팅 기준과 분리되어 Meta SDK 직접 이벤트로만 기록되는가.
- 가입/재제출/설정 재심사 제출 모두 동일 계약으로 응답하는가.
- 과도기 fallback이 남아 있다면 제거 조건/담당자/목표 시점/추적 이슈/검증 근거가 PR 또는 추적 이슈에 남아 있는가.
