# 인증 심사 최종 구조 (Deterministic / Fail-Closed)

본 문서는 설정 화면의 추가 인증 제출(예: 법조인) 누락 문제를 포함해, 인증 심사 도메인을 추측 없이 동작하도록 고정하는 최종 구조 명세다.

## 1. 목적

- 설정 제출 인증(`addAuth`)이 Admin `profile-edit` 큐에서 누락되지 않도록 보장한다.
- 가입 제출과 설정 제출의 인증 저장/심사 경로를 단일 규칙으로 통합한다.
- 큐 분류를 `자격(status) + 출처(request_origin) + 상태(review_status)`의 명시 규칙으로 고정한다.
- 회귀 없는 이행을 위해 Shadow Cutover + 불일치 0건 게이트를 강제한다.

## 2. 비목적

- 회원 등급 체계(`member_level`) 재정의
- 기존 심사 단계(`basic_info/required_auth/intro`) 자체 변경
- 모바일/어드민 UI 디자인 변경

## 3. 현재 문제와 근본 원인

1. 설정 인증 누락: `profile-edit` 큐의 auth 조건이 `required auth` 중심이라 optional 인증이 누락될 수 있다. 근거는 `coupler-api/model/member.ts:getPendingList`의 `authRequiredFilter` 기반 조건이다.
2. 인증 쓰기 로직 중복: `controller/app/v1/member.ts:addAuth`와 `controller/app/v1/auth.ts:signup`에 인증 저장 규칙이 중복되어 드리프트 위험이 있다.
3. 출처 SoT 공백: `t_member_review_request`는 `request_origin`이 있지만 `t_member_auth`, `t_member_profile_set`은 출처 컬럼이 없어 큐 분류에서 추론이 필요해진다.

## 4. 설계 원칙 (Guardrail Binding)

1. Fail-Closed: 출처/상태/키가 불명확하면 큐에서 제외하고 계약 오류로 기록한다.
2. 단일 계약: DTO 필드 alias fallback(`a ?? b`)을 금지하고 요청/응답/DB 판정 키는 한 가지 표현만 허용한다.
3. 책임 분리: API는 판정/전이만, Admin/Mobile은 표시/입력 전달만 담당한다.
4. 회귀 통제: Dual Write/Read Shadow를 거치고 불일치 0건 증거가 없으면 cutover를 금지한다.

## 5. 최종 SoT

1. 자격(Entitlement): `t_member.status`
2. 단계 진행(Progress): `v_member_review_status`
3. 출처(Source): 각 심사 도메인 행의 `request_origin`
4. 큐 출력(SoV): `v_member_review_queue` (신규)

## 6. 데이터 모델 (TO-BE)

### 6.1 `t_member_auth` 확장

- `request_origin ENUM('SIGNUP_REVIEW','SETTING_PROFILE_EDIT') NOT NULL`
- `review_requested_at DATETIME NOT NULL`
- `review_batch_id BIGINT NOT NULL`
- 인덱스: `(member, request_origin, status)`, `(review_batch_id, status)`

### 6.2 `t_member_profile_set` 확장

- `request_origin ENUM('SIGNUP_REVIEW','SETTING_PROFILE_EDIT') NOT NULL`
- `review_batch_id BIGINT NOT NULL`
- 인덱스: `(member_id, request_origin, review_status)`, `(review_batch_id, review_status)`

### 6.3 신규 `t_member_review_batch`

- 목적: 단일 제출 트랜잭션 식별자
- 컬럼:
  - `id BIGINT PK`
  - `member_id INT NOT NULL`
  - `request_origin ENUM('SIGNUP_REVIEW','SETTING_PROFILE_EDIT') NOT NULL`
  - `idempotency_key VARCHAR(64) NOT NULL`
  - `payload_hash CHAR(64) NOT NULL`
  - `submit_scope ENUM('auth_only','profile_only','basic_only','mixed') NOT NULL`
  - `created_at DATETIME NOT NULL`
  - `created_by ENUM('mobile','admin','system') NOT NULL`
- 유니크 인덱스: `(member_id, request_origin, idempotency_key)`

### 6.4 정합성 제약

- `request_origin` 없는 심사 대상 행 생성 금지
- `review_batch_id` 없는 `PENDING/REAPPLY/RETURN` 행 생성 금지

## 7. 상태 전이 규칙 (인증)

| 현재       | 액션           | 다음       | 비고                         |
| ---------- | -------------- | ---------- | ---------------------------- |
| `PENDING`  | 회원 재제출    | `PENDING`  | 동일 상태 유지, payload 갱신 |
| `RETURN`   | 회원 재제출    | `REAPPLY`  | 반려 재제출                  |
| `REAPPLY`  | 회원 재제출    | `REAPPLY`  | 최신 payload로 갱신          |
| `APPROVED` | 회원 변경 제출 | `PENDING`  | 신규 심사 시작               |
| `PENDING`  | 관리자 승인    | `APPROVED` | 사유 비움                    |
| `REAPPLY`  | 관리자 승인    | `APPROVED` | 사유 비움                    |
| `PENDING`  | 관리자 반려    | `RETURN`   | 사유 필수                    |
| `REAPPLY`  | 관리자 반려    | `RETURN`   | 사유 필수                    |

추론 규칙 금지:

- `member_level`로 인증 제출 출처를 유추하지 않는다.
- `required_auth_status`로 optional 인증 큐 노출 여부를 결정하지 않는다.

관리자 심사 가드:

- Admin 심사 액션은 `PENDING`, `REAPPLY`에서만 허용한다.
- `RETURN` 상태는 사용자 재제출 전까지 Admin 승인/반려 액션을 금지한다.

## 8. 큐 분류 규칙 (결정 테이블)

### 8.1 `profile-edit`

필수 조건:

- `member.status = NORMAL`
- `request_origin = SETTING_PROFILE_EDIT`
- `review_status IN (PENDING, REAPPLY)`

포함 도메인:

- `basic_info`, `intro`, `auth`, `profile_set` 전부
- `required/optional auth` 구분 없이 포함

제외:

- `RETURN` 항목
- `request_origin` null/미정의

### 8.2 `review-item-reapply-queue`

필수 조건:

- `review_status = RETURN`
- `request_origin IN (SIGNUP_REVIEW, SETTING_PROFILE_EDIT)`

### 8.3 `signup-*`

필수 조건:

- `request_origin = SIGNUP_REVIEW`
- 기존 `semi/full/intro-*` 단계 규칙 유지

## 9. 조회 모델 (`v_member_review_queue`)

`member` 단위가 아닌 `review item` 단위 projection을 제공한다.

필수 컬럼:

- `member_id`
- `queue_type`
- `review_domain` (`basic_info|intro|auth|profile_set`)
- `review_item_key` (domain 내부 식별 키, 아래 Canonical 규격 고정)
- `request_origin`
- `review_status`
- `actionable` (0/1)
- `review_batch_id`
- `requested_at`

`review_item_key` Canonical 규격:

- `basic_info`: `basic_info:<field_name>` (예: `basic_info:job`)
- `intro`: `intro:intro`
- `auth`: `auth:type:<auth_type_number>` (예: `auth:type:7`)
- `profile_set`: `profile_set:image:<image_index>` 또는 `profile_set:video`

Fail-Closed:

- `request_origin` unknown이면 뷰에서 제외 + 에러 카운트 증가

## 10. API 계약 (최종)

### 10.1 제출 API

- `POST /member/review/auth/submit`
- Request:
  - `request_origin` (필수)
  - `idempotency_key` (필수, 요청 재시도 식별자)
  - `delete_missing_auth` (0/1)
  - `auth: [{ type: number, images: string[] }]`
- Response:
  - `review_batch_id: number`
  - `changed: 0|1`
  - `queued_domains: string[]`
  - `review_status_snapshot`

멱등성 규칙:

- 동일 `(member_id, request_origin, idempotency_key)` 요청은 새 배치를 만들지 않고 기존 `review_batch_id`를 재사용해 반환한다.
- 동일 키에 payload가 다르면 `AUTH_SUBMIT_IDEMPOTENCY_CONFLICT`로 즉시 실패한다.

제출 게이트(설정 추가 인증):

- 설정에서의 추가 뱃지 인증 제출(`request_origin=SETTING_PROFILE_EDIT`)은 아래를 모두 만족해야 한다.
  - `t_member.status = NORMAL`
  - `v_member_review_status.intro_status = 'APPROVED'`
- 즉, 정회원 완료 상태에서만 설정 추가 인증 제출을 허용한다.
- 게이트 미충족 시 `AUTH_SETTING_NOT_AVAILABLE_BEFORE_FULL_MEMBER` 오류로 즉시 실패한다.

### 10.2 Admin 큐 조회 API

- `GET /admin/member/review-queue?queue_type=profile-edit`
- 서버에서 queue_type별 규칙을 강제하며, 클라이언트 임의 필터로 우회 불가

### 10.3 Admin 심사 API

- `POST /admin/member/review/decision`
- Request:
  - `review_batch_id`
  - `items: [{ review_domain, review_item_key, decision, reason }]`
- Validation:
  - `decision=RETURN`이면 `reason` 필수
  - `review_item_key`는 `review_domain`별 Canonical 규격과 일치해야 함 (불일치 시 실패)
  - 심사 대상 item의 현재 상태는 `PENDING|REAPPLY`만 허용 (`RETURN` 포함 그 외 상태는 실패)
  - batch-member 불일치 시 즉시 실패

## 11. 서버 구조

1. UseCase: `SubmitAuthReviewUseCase`, `SubmitProfileEditUseCase`, `ApplyReviewDecisionUseCase`.
2. Repository: `ReviewBatchRepository`, `AuthReviewRepository`, `ProfileReviewRepository`, `ReviewQueueRepository`.
3. Controller 원칙: 파라미터 검증 + UseCase 호출만 수행하고 상태 판정/분류 로직 직접 구현은 금지한다.

## 12. 이행 계획 (회귀 방지)

### Phase 0 / `SET-02-API-QUEUE-SCOPE-FIX`: 핫픽스

- `profile-edit` auth 필터를 optional 포함으로 교정
- 누락 탐지 로그 추가:
  - `member_id`, `auth_type`, `request_origin`, `queue_type`

### Phase 1 / `SET-04-API-REVIEW-BATCH-IDEMPOTENCY`: 스키마 확장

- `t_member_review_batch` 생성 (`request_origin`, `idempotency_key`, `payload_hash` 포함)
- `t_member_auth`, `t_member_profile_set`에 `request_origin`, `review_batch_id` 추가
- Backfill:
  - 명확 데이터만 자동 보정
  - 모호 데이터는 `UNKNOWN_CANDIDATE`로 별도 테이블 격리 후 운영 판단

### Phase 2 / `SET-05-API-QUEUE-SOV-CUTOVER`: Dual Write + Shadow Read

- 기존 경로 + 신규 경로 동시 기록
- 기존 `getPendingList` vs 신규 `v_member_review_queue` diff 로그 수집

### Phase 3 / `SET-05-API-QUEUE-SOV-CUTOVER`: Read Cutover

- Admin 조회를 `v_member_review_queue`로 전환
- 불일치 0건 근거 없으면 전환 금지

### Phase 4 / `SET-06-LEGACY-CLEANUP-DOC-CLOSE`: 정리

- `POST /member/addAuth`를 thin wrapper로 축소 후 단계 제거
- `signup` 내 인증 저장 분기 제거, 공통 UseCase만 사용

## 13. 불일치 0건 게이트 (필수)

cutover 전 충족 조건:

1. 동일 입력 diff 불일치 0건
2. 누락/중복 노출 0건
3. `request_origin` null/unknown 신규 유입 0건
4. 운영 로그 샘플 범위 명시
5. 롤백 시나리오 리허설 완료

## 14. 테스트 매트릭스

### 14.1 단위 테스트

- queue 결정 함수 입력 조합 전수(상태/출처/도메인)
- auth 상태 전이 테이블 검증

### 14.2 통합 테스트

- 설정에서 optional auth 제출 -> `profile-edit` 노출
- signup auth 제출 -> `profile-edit` 미노출
- RETURN -> REAPPLY 전이 검증
- batch 불일치 decision 차단

### 14.3 회귀 테스트

- 기존 `semi/full/intro-*` 큐 카운트 회귀 0
- `review-item-reapply-queue` 중복 노출 0

## 15. 관측성/운영

필수 메트릭:

- `review_queue_profile_edit_total`
- `review_queue_profile_edit_auth_total`
- `review_queue_contract_error_total`
- `review_queue_diff_mismatch_total`

알람:

- `contract_error_total > 0` 즉시 알람
- `diff_mismatch_total > 0` cutover 차단

## 16. 수용 기준 (Definition of Done)

1. 설정에서 법조인 등 optional 인증 단독 제출 시 `profile-edit`에 반드시 노출된다.
2. `required_auth_status` 값과 무관하게 설정 인증은 누락되지 않는다.
3. signup 인증 제출은 `profile-edit`에 섞이지 않는다.
4. 인증 저장 경로는 `member.ts`/`auth.ts` 중복 없이 단일 UseCase를 사용한다.
5. Shadow diff 불일치 0건 증거와 함께 운영 전환한다.

## 17. 근거 링크

- 큐 필터(현행): `coupler-api/model/member.ts:getPendingList`
- 설정 인증 제출(현행): `coupler-api/controller/app/v1/member.ts:addAuth`
- 가입 인증 저장(현행): `coupler-api/controller/app/v1/auth.ts:signup`
- 출처 정책: `docs/content/architecture/member-review-axis-policy.md`
- 프로필 플로우: `docs/content/flows/cross-project/profile-management-flow.md`

## 18. 최종 실행 세트 (명시적 명칭 + 단계 커밋)

1. `SET-01-DOC-SPEC-LOCK`
2. `SET-02-API-QUEUE-SCOPE-FIX`
3. `SET-03-API-AUTH-SUBMISSION-USECASE-EXTRACT`
4. `SET-04-API-REVIEW-BATCH-IDEMPOTENCY`
5. `SET-05-API-QUEUE-SOV-CUTOVER`
6. `SET-06-LEGACY-CLEANUP-DOC-CLOSE`

각 세트 공통 절차(반복):

1. 설계/코드 수정
2. 정적 검사 + 테스트 실행
3. 문서/코드 리뷰
4. Findings가 있으면 수정 후 2~3 반복
5. `no findings` 확인 후 동일 기준으로 마지막 재리뷰 1회 추가
6. 마지막 재리뷰도 `no findings`일 때만 커밋

세트별 산출물:

- `SET-01`: 문서 구조 고정, 명칭 고정, `mkdocs.yml` `nav` 동기화
- `SET-02`: `profile-edit` optional auth 누락 핫픽스(완료 커밋 기준)
- `SET-03`: `member.ts/addAuth` + `auth.ts/signup` 중복 제거, 단일 UseCase
- `SET-04`: `review_batch` + 멱등성 계약/유니크 키 + API validation
- `SET-05`: `v_member_review_queue` 도입, Shadow diff 0건 게이트 후 cutover
- `SET-06`: 레거시 호환 제거, 불필요 코드 정리, 최종 문서 정리/동기화

## 19. 준수 기준 (완료 판정)

`engineering-guardrails.md` 준수 기준:

- 스펙 고정: 큐/전이/API 계약을 단일 표현으로 고정하고 alias fallback 금지
- Optional 처리 명시: optional auth도 도메인 규칙으로 명시 포함/제외
- Fail-Closed: 출처/키/상태 불명확 시 노출 차단 + 오류 기록
- 명시적 네이밍: queue/domain/item key/request_origin을 canonical 명칭으로 고정

근본원인 해결 판정:

- 설정 제출 optional auth가 `profile-edit`에서 누락되지 않는다.
- 인증 쓰기 경로가 단일 UseCase로 수렴되어 중복 구현이 제거된다.
- 출처/배치 기반 분류로 큐 라우팅이 추측 없이 결정된다.

`no findings` 종료 기준:

- 문서: `npm run lint:md` 통과
- API: `pnpm lint`, `pnpm typecheck`, 관련 테스트 통과
- 리뷰 루프: 수정리뷰 반복 후 마지막 재리뷰 1회까지 `no findings`
