# API 에러 계약 정책

## 문서 역할

- 역할: `규범`
- 문서 종류: `policy`
- 충돌 시 우선 문서: 이 문서
- 기준 성격: `transition`

## 목적

- 전사 API 실패 응답 계약을 단일 SoT로 고정한다.
- 개발/운영 응답 구조를 동일하게 유지한다.
- API/Admin/Mobile 에러 분기 기준을 하나로 고정한다.
- 도메인 문서는 실패 응답 계약을 재정의하지 않고 이 문서를 참조한다.

## 용어

- API: 서버와 클라이언트가 주고받는 호출 계약
- JSON: API 응답 본문 형식
- HTTP Status: HTTP 응답 상태 코드
- TypeScript: 서버와 클라이언트 코드 언어
- SoT: `Single Source of Truth`, 단일 기준
- DTO: `Data Transfer Object`, 요청/응답 데이터 객체
- Phase: 점진 이전 단계
- to-be: 목표 기준
- envelope: 공통 응답 바깥 구조
- factory/mapper: 생성/변환 함수
- Swagger(OpenAPI 문서): API 경로, 응답, 샘플을 적는 문서

## 작성 기준

- 표준 개발 용어는 사용할 수 있다.
- 첫 등장이나 용어 섹션에서 뜻을 밝힌다.
- 코드 식별자와 응답 필드는 원문 그대로 쓴다.
- 문장은 필수 단어로 짧게 쓴다.

## 문서 상태

- 이 문서는 최종 목표 계약과 점진 이전 Phase를 함께 정의한다.
- 신규 실패 응답은 이 문서의 최종 계약을 기준으로 작성한다.
- 기존 미준수 구현은 Phase, 제거 조건, 담당자, 목표 시점, 검증 증빙을 남기고 이전한다.
- "현재 구현" 설명과 이 문서가 충돌하면 이 문서를 to-be 기준으로 사용한다.

## 적용 범위

- 저장소: `coupler-api`, `coupler-mobile-app`, `coupler-admin-web`
- 환경: local, dev, staging, prod
- 대상: HTTP API 실패 응답, 클라이언트 에러 분기, 운영 로그 상관관계
- 제외: 외부 서드파티 원본 응답
    - 단, 내부 API 경계에서는 이 문서의 `ApiErrorData`로 변환한다.

## 우선순위

1. 실패 응답 envelope, `ApiErrorData`, `error_action`, `request_id`, HTTP Status 기준은 이 문서가 우선한다.
2. Fail-closed, 조용한 실패 금지, 레이어 책임은 [엔지니어링 가드레일](engineering-guardrails.md)을 따른다.
3. 로그 레벨, 민감정보 제외, 저장/전송 방식은 [로그 정책](log-policy.md)을 따른다.
4. 도메인 문서는 성공 DTO, 도메인 상태, 도메인별 적용 Phase만 정의한다.
5. 도메인 문서는 실패 응답 필드, 분기 기준, `request_id` 필수 여부를 재정의하지 않는다.

## 아키텍처

- API 서버는 실패 원인을 표준 `ApiErrorData`로 매핑한다.
- API 서버는 실패 응답을 공통 생성 경로로 만든다.
- API 서버는 Phase 기준에 따라 `request_id`, `error_code`, `error_source`를 같은 로그에 남긴다.
- Mobile/Admin은 `result_code`로 성공/실패를 1차 분기한다.
- Mobile/Admin은 실패 시 `error_action`과 `error_code`로 동작을 결정한다.
- Mobile/Admin은 `result_msg` 문자열을 파싱하지 않는다.
- 운영 추적은 `request_id -> error_source -> error_code` 순서로 좁힌다.

## TypeScript/JSON 네이밍 경계

- API 응답 JSON 필드는 기존 envelope와 같은 `snake_case`를 사용한다.
- TypeScript 내부 도메인 모델, 함수 인자, factory 입력은 `camelCase`를 사용한다.
- `camelCase` 내부 값은 공통 factory/mapper 경계에서만 `snake_case` 응답 DTO로 변환한다.
- 컨트롤러와 도메인 로직은 신규 실패 응답 JSON을 직접 조립하지 않고 공통 생성 경로를 사용한다.
- `error_context`의 API 응답 key도 `snake_case`를 사용한다.
- 클라이언트가 내부 모델을 `camelCase`로 정규화하더라도 API 분기 계약은 이 문서의 `snake_case` API 응답 필드를 기준으로 한다.
- 같은 API 응답 안에서 `errorCode`와 `error_code`처럼 동일 의미의 camel/snake 필드를 병행하지 않는다.

## 응답 Envelope

성공과 실패는 같은 envelope를 사용한다.

```json
{
  "result_code": 0,
  "result_msg": "OK",
  "result_data": {}
}
```

실패 시 `result_data`는 이 문서의 Phase별 `ApiErrorData`를 사용한다.

```json
{
  "result_code": -10,
  "result_msg": "요청을 처리할 수 없습니다.",
  "result_data": {
    "error_code": "MEMBER_AUTH_DELETE_FORBIDDEN",
    "error_source": "MEMBER_AUTH_REVIEW",
    "error_action": "FIX_REQUEST",
    "error_context": {
      "member_id": 77
    },
    "request_id": "req_20260603_000001"
  }
}
```

## 필드 의미

| 필드 | 의미 | 분기 사용 |
| --- | --- | --- |
| HTTP Status | 프로토콜, 인증, 권한, 서버 장애 레벨 | 가능 |
| `result_code` | 앱 공통 성공/실패 1차 게이트 | 가능 |
| `result_msg` | 사용자 표시 문구 | 금지 |
| `result_data` 성공형 | 엔드포인트별 성공 DTO | 가능 |
| `result_data` 실패형 | `ApiErrorData` | 가능 |
| `error_code` | 도메인 원인 코드 | 가능 |
| `error_source` | 오류 도메인/모듈 | 가능 |
| `error_action` | 클라이언트 권장 동작 | 가능 |
| `error_context` | 원인 분석용 구조화 데이터 | 금지 |
| `request_id` | 서버 로그 상관관계 ID | 가능 |

## `ApiErrorData` 최종형

최종 계약(Phase 2 이후)의 필수 필드는 아래 5개다.

- `error_code`: 대문자 스네이크 원인 코드
- `error_source`: 대문자 스네이크 도메인/모듈 코드
- `error_action`: 클라이언트 권장 동작 값
- `error_context`: 민감정보 없는 객체
- `request_id`: 서버 로그 상관관계 ID

`error_context`는 로직 분기 기준이 아니다.
클라이언트 분기는 `error_action`을 우선하고, 필요 시 `error_code`를 보조 기준으로 사용한다.

## 코드 체계

### `result_code`

- `result_code` 값 기준은 서버 공통 상수다.
- 성공은 `0`만 사용한다.
- 실패는 공통 실패 코드만 사용한다.
- 도메인 상태값을 `result_code`로 재사용하지 않는다.
- 신규 `result_code` 추가는 원칙적으로 금지한다.

### `error_source`

- 형식: 대문자 스네이크
- 의미: 오류가 발생한 도메인/모듈
- 예: `MEMBER_AUTH_REVIEW`, `SIGNUP_REVIEW`, `SECURITY_ACCESS_CONTROL`

### `error_code`

- 형식: 대문자 스네이크
- 의미: 안정적인 도메인 원인
- 권장 형식: `{DOMAIN}_{REASON}_{DETAIL}`
- 값 기준: API 서버 도메인 상수
- Swagger(OpenAPI 문서)는 API 서버 도메인 상수와 같은 작업 단위에서 동기화한다.
- 문서 역할: 형식, 변경 절차, 분기 책임 고정

### `error_action`

`error_action`은 클라이언트 권장 동작이다.

- 값 기준: `coupler-api/lib/api-error.ts`의 `API_ERROR_ACTION` 상수
- 이 문서는 `error_action` 값 목록을 직접 소유하지 않는다.
- 정책 문서에 후보 값을 미리 예약하지 않는다.
- API 서버 상수에 없는 `error_action`은 응답에 사용하지 않는다.
- 신규 `error_action`은 API 서버 상수, Swagger(OpenAPI 문서), Mobile/Admin 분기, 테스트, 관련 문서를 같은 작업 단위에서 갱신한 뒤 사용한다.
- 장기 목표는 API 서버, Swagger(OpenAPI 문서), Mobile/Admin 타입을 같은 계약 파일에서 생성하거나 검증하는 구조다.

## HTTP Status

- `2xx`: 요청 처리 성공
- `400`: 요청 형식/검증 실패
- `401`: 인증 실패
- `403`: 권한 실패
- `404`: 리소스 없음
- `409`: 상태 충돌
- `422`: 도메인 검증 실패
- `5xx`: 서버 장애

HTTP Status와 `result_code`는 같은 의미를 중복 표현하지 않는다.
HTTP Status는 프로토콜 레벨, `error_code`는 도메인 원인이다.

## 환경 규칙

- 모든 환경은 같은 응답 필드, 타입, 의미를 사용한다.
- 개발계 전용 상세 로그는 허용한다.
- 개발계 전용 응답 필드는 금지한다.
- 운영계 전용 fallback 응답은 금지한다.
- 같은 입력은 모든 환경에서 같은 `error_code`를 반환한다.

## Phase

### Phase 0: Legacy

- 표준 `ApiErrorData`가 없는 기존 상태다.
- 신규 실패 케이스에 Phase 0 추가는 금지한다.
- 잔존 Phase 0은 도메인 문서나 PR에 이전 대상을 명시한다.

### Phase 1: Server DTO

- 기존 envelope는 유지한다.
- 실패 `result_data`에 `error_code`, `error_source`, `error_action`, `error_context`를 항상 포함한다.
- Phase 1 `ApiErrorData`는 최종형에서 `request_id`만 선택 허용한 전환 DTO다.
- `request_id`는 인프라 준비 전까지 선택 허용한다.
- `request_id` 미적용 시 담당자, 목표 시점, 추적 이슈를 남긴다.
- `error_context` 밖의 호환 필드는 제거 조건이 있을 때만 임시 허용한다.

### Phase 2: Client Branch

- 실패 `result_data.request_id`를 항상 포함한다.
- Mobile/Admin 분기는 `error_action`과 `error_code`만 사용한다.
- `result_msg` 문자열 분기를 제거한다.
- 서버 로그는 `request_id`, `error_source`, `error_code`로 검색 가능해야 한다.

### Phase 3: Final

- HTTP Status를 이 문서 기준으로 정렬한다.
- 도메인 숫자 코드 재사용을 제거한다.
- `error_context` 밖의 호환 필드를 제거한다.
- Swagger(OpenAPI 문서), 문서, 테스트가 같은 실패 계약을 가리킨다.

## 완료 판정

### Phase 1 완료

- 실패 응답에 `error_code`, `error_source`, `error_action`, `error_context`가 항상 있다.
- 환경별 응답 구조 차이가 없다.
- Swagger(OpenAPI 문서)/샘플 응답이 실제 구현과 같다.
- 남은 호환 필드에는 제거 조건, 담당자, 목표 시점, 추적 이슈가 있다.

### Phase 2 완료

- 실패 응답에 `request_id`가 항상 있다.
- Mobile/Admin이 `result_msg`로 분기하지 않는다.
- 운영 로그에서 `request_id`, `error_source`, `error_code`를 함께 조회할 수 있다.

### 최종 완료

- Phase 3 조건을 만족한다.
- 신규/기존 실패 응답이 모두 `ApiErrorData`를 사용한다.
- 코드, Swagger(OpenAPI 문서), 도메인 문서, 테스트가 같은 계약을 가리킨다.

## 도메인 문서 규칙

도메인 문서의 에러 섹션은 아래 문장을 포함한다.

```markdown
실패 응답 계약은 [API 에러 계약 정책](api-error-contract-policy.md)을 단일 SoT(단일 기준)로 따른다.
이 문서는 도메인 적용 Phase(전환 단계)와 도메인별 `error_code` 예시만 기록한다.
```

도메인 문서는 아래 항목만 기록할 수 있다.

- 적용 엔드포인트
- 현재 Phase
- `error_source`
- 도메인별 `error_code` 예시
- `error_action` 매핑
- `error_context` 필드 예시
- 남은 호환 필드와 제거 조건

도메인 문서는 아래 항목을 재정의하지 않는다.

- envelope 구조
- `ApiErrorData` 필수 필드
- `request_id` 필수 여부
- HTTP Status 기준
- `result_code` 의미
- `result_msg` 분기 금지

## 변경 절차

1. `error_code` 또는 `error_action` 변경 필요를 제안한다.
2. API/Mobile/Admin 영향 범위를 확인한다.
3. 서버 상수, Swagger(OpenAPI 문서), 클라이언트 분기, 도메인 문서 적용 Phase를 같은 작업 단위에서 갱신한다.
4. [테스트/CI 전략](testing-strategy.md)의 품질 게이트와 계약 테스트를 통과한다.
5. PR에 샘플 성공/실패 응답, 테스트 로그, 문서 동기화 근거를 남긴다.

## 체크리스트

- [ ] 실패 응답 계약은 이 문서를 참조하는가
- [ ] `result_msg` 문자열 분기가 없는가
- [ ] 실패 `result_data`가 `ApiErrorData`인가
- [ ] `error_action`이 API 서버 상수에 있는 값인가
- [ ] 환경별 응답 구조 차이가 없는가
- [ ] `request_id` 누락 시 Phase 1 추적 정보가 있는가
- [ ] 호환 필드가 있다면 제거 조건이 있는가
- [ ] Swagger(OpenAPI 문서)/문서/테스트가 같은 계약을 가리키는가

## 관련 문서

- [엔지니어링 가드레일](engineering-guardrails.md)
- [로그 정책](log-policy.md)
- [테스트/CI 전략](testing-strategy.md)
- [회원가입 응답 계약](signup-response-contract.md)
- [회원 심사 단일 정책](member-review-policy.md)
