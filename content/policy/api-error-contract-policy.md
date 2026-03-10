# API 에러 계약 정책 (Dev/Prod 통합)

## 문서 역할

- 역할: `규범`
- 문서 종류: `policy`
- 충돌 시 우선 문서: 이 문서
- 기준 성격: `transition`

## 목적

- API/Admin/Mobile 전 영역에서 개발계/운영계를 분리 운영하되, 에러 응답 계약은 단일 형태로 고정해 원인 추적성과 회귀 안정성을 확보한다.

## 문서 상태

- 본 문서는 API 에러 응답의 최종 목표 계약을 정의하는 정책 문서다.
- 전역 구현이 아직 동일 수준으로 맞춰지지 않은 구간은 허용하며, 도메인별 국소 적용 후 점진 이관한다.
- 따라서 본 문서는 "현재 전 레포가 이미 전부 준수 중인 현행 설명"이 아니라, PR/리뷰/후속 이관의 판정 기준으로 사용한다.

## 적용 범위

- 레포: `coupler-api`, `coupler-mobile-app`, `coupler-admin-web`
- 환경: local/dev/staging/prod
- 대상: HTTP API 응답, 모바일/어드민의 에러 분기 로직, 운영 로그/모니터링
- 제외: 외부 서드파티 원본 응답 형식(단, 내부 경계에서 본 정책 DTO로 변환해 반환해야 함)

## 단일 SoT

- 상위 기술 원칙: `content/policy/engineering-guardrails.md`
- 테스트/검증 기준: `content/policy/testing-strategy.md`
- 로그/운영 기준: `content/policy/log-policy.md`
- 회원가입 계약(특정 도메인): `content/policy/signup-response-contract.md`

## 필수 규칙

### 1) 개발계/운영계 분리 원칙

- 개발계와 운영계는 반드시 분리한다.
- 단, 응답 필드 구조/타입/의미는 모든 환경에서 동일해야 한다.
- 금지:
    - 환경별로 응답 키를 다르게 내리는 행위
    - 개발계에서만 에러 코드를 추가/변경하는 행위
    - 운영계에서만 fallback 분기로 다른 계약을 노출하는 행위

### 2) 응답 Envelope 단일화

- 성공/실패 모두 공통 envelope를 사용한다.
- 필수 필드:
    - `result_code`: 성공/실패 1차 게이트 코드
    - `result_msg`: 사용자 표시용 문구(로직 분기 금지)
    - `result_data`: 성공 데이터 또는 에러 구조체
- `result_data` 타입 규칙:
    - 성공 응답에서는 엔드포인트별 성공 DTO를 사용한다.
    - 실패 응답에서는 공통 에러 DTO(`ApiErrorData`)를 사용한다.
    - 따라서 `result_data`는 전역 단일 고정 타입이 아니라, 성공형/실패형에 따라 타입이 달라지는 discriminated payload로 취급한다.

### 3) 실패 응답 표준(최종형)

- 실패 시 `result_data`는 아래 에러 구조를 따른다.
    - `error_code`: 도메인 원인 코드(문자열, 안정 식별자)
    - `error_source`: 오류 도메인/모듈 식별자(예: `MEMBER_AUTH_REVIEW`)
    - `error_action`: 클라이언트 권장 후속 처리(예: `RETRY`, `FIX_REQUEST`, `CONTACT_SUPPORT`)
    - `error_context`: 원인 분석용 구조화 데이터
    - `request_id`: 서버 로그 상관관계 식별자(Phase 1에서는 선택, Phase 2부터 필수)
- `result_msg`는 표시용이며, 분기 로직은 `error_code/error_action`만 사용한다.

### 4) HTTP Status와 result_code의 역할 분리

- HTTP Status:
    - 프로토콜/인증/권한/서버장애 레벨 표현(`2xx`, `4xx`, `5xx`)
- `result_code`:
    - 앱 공통 성공/실패 1차 분기
- `error_code`:
    - 도메인 원인 판별 단일 기준
- 금지:
    - 사용자 상태값(`BLOCK`, `LEAVE` 등)을 `result_code`로 재사용
    - `result_msg` 문자열 파싱으로 분기하는 로직

### 5) 코드 체계 규칙

- `result_code`는 공통 코드 풀만 사용한다(환경/도메인별 임의 추가 금지).
- 도메인 원인 코드는 `error_code` 문자열로 확장한다.
- `error_code` 네이밍 규칙:
    - 대문자 스네이크(`DOMAIN_REASON_DETAIL`)
    - 변경 시 하위호환 계획/적용 범위를 문서에 명시

### 5-1) `result_code` 공통 코드 풀 SoT

- 공통 `result_code`는 서버 상수 정의를 기준으로 관리한다.
- 정책 본문에는 개별 코드값 목록을 고정하지 않는다. 값 스냅샷은 구현 변경에 따라 드리프트되기 쉽기 때문이다.
- 다른 레포의 상수 정의는 서버 기준과 값/의미가 일치해야 하며, 임의 재정의/부분 복사/플랫폼별 변형을 금지한다.
- `result_code` 신규 추가는 원칙적으로 금지한다. 불가피할 경우 서버 상수, 관련 클라이언트 상수, Swagger/샘플 응답, 본 정책 문서의 규칙을 같은 작업 단위에서 함께 갱신한다.

### 6) 환경별 허용 차이

- 허용:
    - 개발계에서만 상세 로그 출력 강화
    - 개발계/스테이징에서만 디버그 대시보드 노출
- 비허용:
    - 응답 계약/필드의 존재 여부 차이
    - 같은 입력에 대해 환경마다 다른 `error_code` 반환

### 7) 호환/이행 규칙

- Phase 1:
    - 기존 `result_code/result_msg/result_data` 유지
    - 실패 `result_data`에 표준 에러 구조(`error_code/source/action/context`)를 병행 추가
    - `request_id`는 인프라 준비 전까지 선택 적용(도입 계획/담당자/기한을 PR에 명시)
- Phase 2:
    - 모바일/어드민 분기를 `error_code/error_action` 중심으로 전환
    - `result_msg` 의존 로직 제거
- Phase 3:
    - HTTP Status를 문서 계약대로 정렬(필요한 경로부터 점진 적용)
    - legacy 숫자 코드 재사용/충돌 제거

### 7-1) 도메인 적용 완료 판정

- 특정 도메인/엔드포인트는 아래 조건을 모두 만족할 때 본 정책 적용 완료로 본다.
    - 실패 응답 `result_data`에 `error_code`, `error_source`, `error_action`, `error_context`가 항상 포함된다.
    - 클라이언트 분기 로직이 `result_msg` 문자열이나 도메인별 숫자 `result_code`에 의존하지 않는다.
    - `request_id`를 포함했거나, 미포함 시 Phase/담당자/도입 기한이 PR 또는 추적 이슈에 남아 있다.
    - Swagger/문서/샘플 응답이 실제 구현과 같은 구조를 가리킨다.
- 부분 적용 상태의 도메인은 PR/문서에 `Phase 1`, `Phase 2`, `Phase 3` 중 현재 단계를 명시한다.

## 운영 절차

- 변경 요청: 신규 에러 코드/행동코드 추가 제안서 작성
- 검토: API/Mobile/Admin 담당자 공동 리뷰(계약 충돌, UX 영향, 운영 로그 영향)
- 적용: API 구현 -> 클라이언트 분기 반영 -> 문서/Swagger 동기화
- 검증: `test`, `typecheck`, `lint`, `format` + 계약 테스트 통과
- 롤백: 신규 코드/분기 비활성화 시 legacy 분기로 즉시 복귀 가능해야 함

## 증빙/추적

- PR에 반드시 포함:
    - 추가/변경 `error_code` 목록
    - 모바일/어드민 처리 규칙 변경점
    - 샘플 응답(성공/실패)
    - 테스트 로그 링크
- 운영 장애 대응 시:
    - `request_id`, `error_code`, `error_source` 3종으로 상관관계 추적

## 체크리스트

- [ ] 환경별 응답 계약 차이가 없는가
- [ ] `result_msg`가 로직 분기에 사용되지 않는가
- [ ] 신규 실패 케이스에 `error_code/source/action/context`가 포함되는가
- [ ] `request_id` 미적용 시 도입 계획/추적 이슈가 남아 있는가
- [ ] 모바일/어드민이 `error_action` 기준으로 사용자 동작을 안내하는가
- [ ] 코드/문서/테스트가 동일한 에러 계약을 가리키는가

## 관련 문서

- [엔지니어링 가드레일](engineering-guardrails.md)
- [로그 정책](log-policy.md)
- [테스트/CI 전략](testing-strategy.md)
- [회원가입 응답 계약](signup-response-contract.md)
- [회원 심사 단일 정책](member-review-policy.md)
