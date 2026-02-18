# 회원가입 응답 계약 (최종안)

본 문서는 가입/재제출/재심사 제출 API의 최종 응답 계약을 고정한다.
목표는 클라이언트 추측 라우팅 제거와 회귀 방지다.

## 목적

- 회원가입 플로우에서 화면 분기 기준을 단일화한다.
- `result_code`와 `result_data`의 역할을 분리한다.
- 모바일/서버가 같은 상태 모델을 기준으로 동작하게 한다.

## 역할 분리

### 1) HTTP Status

- 프로토콜/인증/서버 장애 레벨만 표현한다.
- 예: `401`, `403`, `422`, `500`.

### 2) `result_code`

- 공통 성공/실패 코드만 표현한다.
- 성공은 `0`만 사용한다.
- 실패는 음수 코드만 사용한다.
- 금지: 성공 의미의 양수 코드(`1`, `2` 등)를 비즈니스 상태로 재해석.

### 3) `result_data`

- 도메인 상태 원본을 전달한다.
- 화면 분기에 필요한 모든 상태는 `result_data`에 포함되어야 한다.

### 4) 클라이언트 라우팅

- 라우팅은 `result_data` 상태 기반으로만 수행한다.
- `result_code`는 성공/실패 1차 분기용으로만 사용한다.

## 성공 응답 계약 (`result_code = 0`)

`/app/auth/signup` 성공 응답은 아래 필드를 항상 포함해야 한다.

- `token`
- `basic_info`
- `pending_profile`
- `profile_set_current`
- `profile_set_pending`
- `review_status`

`review_status` 필수 필드:

- `basic_info_status`
- `required_auth_status`
- `intro_status`
- `member_level`

## 라우팅 기준

클라이언트는 아래 순서로 동작한다.

1. `result_code !== 0`이면 에러 처리.
2. `result_code === 0`이면 `result_data`를 상태 저장소에 반영.
3. `review_status + basic_info.status`로 다음 화면 결정.
4. 필요 시 `getSignupReviewOutcome` 같은 순수 함수로 분기 규칙을 고정.

## 금지 사항

- `result_code=1`을 "심사중", "재제출" 같은 도메인 상태로 사용.
- 성공 응답에서 `review_status`만 내려주고 나머지 상태를 생략.
- 서버 힌트(`next_step`)를 라우팅 단일 근거로 사용.
- 클라이언트 로컬 플래그만으로 서버 상태를 덮어 라우팅.

## 호환/이행 규칙

- 과도기에는 클라이언트가 1회 `getUserInfo` fallback을 둘 수 있다.
- 단, fallback은 계약 보강 완료 후 제거 대상이다.
- 최종 상태에서는 `signup 1회 호출 + 응답 상태 반영`으로 완료되어야 한다.

## 검증 체크리스트

- 성공 응답에서 필수 필드 누락 시 서버 계약 위반으로 처리하는가.
- 클라이언트 라우팅이 `result_code` 양수값에 의존하지 않는가.
- 가입/재제출/설정 재심사 제출 모두 동일 계약으로 응답하는가.
