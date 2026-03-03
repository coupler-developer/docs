# 인증 심사 단일 SoT 마이그레이션 계획

## 목적

- 인증 심사 도메인에서 `SIGNUP_REVIEW`와 `SETTING_PROFILE_EDIT` 출처를 명확히 분리한다.
- 심사 상태 SoT는 `v_member_review_status` 단일 뷰로 유지한다.
- 설정수정 인증 반려(`RETURN`)가 다른 큐로 섞이지 않도록 구조적으로 차단한다.

## 적용 범위

- 본 문서는 `required_auth` 축(인증 심사)에만 적용한다.
- `basic_info`, `intro` 축의 SoT/큐 규칙은 기존 정책 문서를 유지한다.

## DB 버전 기준

- 개발계 실측 DB 버전: `MySQL 8.0.43` (`Source distribution`)
- 운영 실측 DB 버전: `MariaDB 10.6.22-MariaDB-log` (`AWS RDS`)
- 스키마 변경은 두 엔진 공통 문법으로 작성한다.
- 부분 유니크 인덱스 전용 문법은 사용하지 않는다.

## 환경 기준선 (2026-03-02 실측)

- 개발계(`coupler`): `t_member_review_request`, `v_member_review_status`, `v_member_review_overview` 존재
- 운영계(`ritzy`): `t_member_pending` 존재, `t_member_review_request`/`v_member_review_status` 미존재
- 따라서 본 문서의 Stage A~D는 `explicit review schema`가 준비된 DB를 기준으로 적용한다.

## 운영 선행 게이트

1. 운영 DB가 `t_member_pending` 기준이면, 본 계획 실행 전에
   explicit review schema 전환 단계(최소 `10`~`23`, 검증 포함 시 `24`)를 먼저 완료한다.
2. 선행 게이트 완료 전에는 본 계획의 Stage A를 시작하지 않는다.
3. 게이트 검증 쿼리에서 `t_member_review_request` 또는 `v_member_review_status`가 없으면 즉시 중단(Fail-closed)한다.

### 운영 선행 게이트 상세(precheck)

- 아래 4개를 모두 만족해야 Stage A를 시작한다.
  - 객체: `t_member_review_request`, `v_member_review_status`, `v_member_review_overview` 존재
  - 컬럼: `t_member_review_request`에
    `member_id`, `review_category`, `review_payload`, `review_reason`, `rejected_image_indices`, `request_origin`, `created_at`, `review_status` 존재
  - enum: `request_origin` 값 집합이 `SIGNUP_REVIEW|SETTING_PROFILE_EDIT`와 일치
  - 검증: `24_postcheck_explicit_schema.sql` 결과가 `No Findings`
- 하나라도 불일치면 즉시 중단(Fail-closed)하고 선행 마이그레이션 단계로 되돌아간다.

## 비목표

- `basic_info`, `intro` 축 제거 또는 축소
- SoT 다중화(`*_v2`, `*_shadow`, 임시 SoT 뷰)

## 고정 원칙

1. SoT 단일화

- 심사 상태 판정/응답 SoT는 `v_member_review_status` 하나만 사용한다.
- 보조 SoT 뷰(`v_member_required_auth_status`, `*_v2`, `*_shadow`) 생성 금지

1. 책임 분리

- `t_member_review_request`: 기본정보/소개글 심사 요청(`request_origin` 포함)
- `t_member_profile_set` 계열: 프로필 이미지/영상 심사
- `t_member_auth_review_request*`: 인증 심사 요청 원장
- `t_member_auth` 계열: 승인 반영된 인증 현재값

1. Fail-closed

- `member.status=PENDING`이면 `SIGNUP_REVIEW`만 허용
- `member.status=NORMAL`이면 `SETTING_PROFILE_EDIT`만 허용
- 위반 시 저장하지 않고 오류 반환

## 상태/코드 정의

1. `request_origin`

- `SIGNUP_REVIEW`
- `SETTING_PROFILE_EDIT`

1. `request_status`

- `PENDING`
- `RETURN`
- `REAPPLY`
- `APPROVED`
- `CANCELLED`

1. 활성 상태(active-set)

- `PENDING`, `RETURN`, `REAPPLY`

1. 상태 책임 경계

- `t_member_auth.status`는 "현재값 상태" 전용이다.
- `t_member_auth_review_request.request_status`는 "요청 수명주기 상태" 전용이다.
- 두 상태는 같은 enum으로 취급하지 않는다.

## 최종 DB 구조

1. 유지 테이블

- `t_member_auth`: 현재 반영된 인증 상태(현재값)
- `t_member_auth_evidence_image`: 현재 반영된 인증 증빙 이미지

1. 신규 테이블

- `t_member_auth_review_request`
  - `id`, `member_id`, `request_origin`, `request_status`, `previous_request_id`, `submitted_at`, `decided_at`, `idempotency_key`, `created_at`, `updated_at`
- `t_member_auth_review_request_item`
  - `id`, `request_id`, `auth_type`, `review_status`, `review_reason`, `rejected_image_indices`, `created_at`, `updated_at`
- `t_member_auth_review_request_item_image`
  - `id`, `item_id`, `image_position`, `image_url`, `review_status`, `review_reason`, `created_at`, `updated_at`

1. 제약/인덱스

- 활성 요청 유니크(엔진 공통):
  - nullable 보조 컬럼 `active_request_slot` 사용 (`1`=활성, `NULL`=비활성)
  - unique key `(member_id, request_origin, active_request_slot)`
  - `request_status` 변경 시 `active_request_slot`는 같은 트랜잭션에서 함께 갱신한다.
- 멱등성 유니크: `(member_id, request_origin, idempotency_key)`
- 정렬/조회 인덱스: `(member_id, request_origin, created_at)`, `(request_id, auth_type)`, `(item_id, image_position)`

## 상태 계산 규칙

1. `required_auth_status` 계산 입력

- 우선순위: 활성 auth review request item 상태
- 없으면 `t_member_auth` + `t_member_auth_evidence_image` 현재 상태

1. `v_member_review_status` 반영

- `required_auth_status` 계산 로직만 in-place 교체
- `basic_info_status`, `intro_status` 로직은 유지
- SoT 이름/사용처는 변경하지 않음
- 보조 SoT 뷰 추가 없이 단일 SoT 내부 계산식만 교체한다.

## API/도메인 규칙

1. 제출

- 인증 제출 API는 `request_origin`을 명시적으로 받는다.
- 서버는 `member.status`에서 기대 origin을 계산한다.
- 요청 body의 `request_origin`은 검증용으로만 사용하고, 저장값은 서버 계산값으로만 기록한다.
- 요청 body `request_origin`이 서버 계산값과 다르면 즉시 실패(Fail-closed)한다.
- 제출은 request 계열 테이블에만 기록한다.
- 재제출(`RETURN` 후 제출)은 아래 전이 규칙을 강제한다.
  - 동일 `(member_id, request_origin)` 최신 활성 요청을 `FOR UPDATE`로 잠근다.
  - 기존 활성 요청이 `RETURN`이면 기존 row를 `CANCELLED` + `active_request_slot=NULL`로 먼저 전이한다.
  - 그 다음 신규 요청 row를 생성(`request_status=REAPPLY`, `active_request_slot=1`, `previous_request_id=기존 id`)한다.
  - 위 순서를 한 트랜잭션으로 묶어 유니크 충돌을 원천 차단한다.

1. 심사

- 승인: request 승인 후 `t_member_auth` 계열 현재값 반영
- 반려: request만 `RETURN`으로 변경, 현재값 테이블 직접 변경 금지

1. Admin 큐

- 가입/승급 인증 큐: `request_origin=SIGNUP_REVIEW`
- 설정수정 인증 큐: `request_origin=SETTING_PROFILE_EDIT`
- `RETURN`은 동일 origin 큐에서만 재제출 허용

## 마이그레이션 단계

1. Stage A (Expand)

- 신규 request 3개 테이블/인덱스/FK 추가
- 기존 읽기/쓰기 경로 변경 없음
- 커밋 단위: `db: auth review request schema expand`

1. Stage B (Write Split)

- 제출 API를 request 테이블 기록 방식으로 전환
- 승인 시점에만 `t_member_auth` 반영
- backfill 원천은 인증 legacy 원장(`t_member_auth`, `t_member_auth_evidence_image`)을 사용한다.
- 단, `t_member_auth.status` raw 값은 request 상태와 동일 enum으로 직접 해석하지 않는다.
- 마이그레이션 SQL에 `legacy_auth_status -> request_status` 매핑표를 명시하고, 미매핑 값이 1건이라도 있으면 즉시 중단(Fail-closed)한다.
- 커밋 단위: `api: auth submit write path split`
- 동일 요청 재시도는 `idempotency_key`로 멱등 처리한다.

1. Stage C (Read Cutover)

- `v_member_review_status`의 `required_auth_status` 계산식을 in-place 교체
- Admin/API 읽기 경로는 기존 SoT 이름 그대로 사용
- 커밋 단위: `db/api: required_auth status cutover on single SoT`
- shadow 검증은 SQL diff 로그 테이블/배치로 수행하고, 보조 SoT 뷰는 생성하지 않는다.

1. Stage D (Contract)

- 레거시 분기 제거
- 문서/스웨거/운영가이드 동기화
- 커밋 단위: `cleanup: remove legacy auth review compatibility`

## Stage별 No Findings 게이트

1. 공통 게이트

- 계약 불일치 0건
- 잘못된 origin 저장 0건
- 큐 중복 노출 0건
- 조용한 실패 0건
- 문서/코드 불일치 0건
- 구 계산과 신 계산의 diff 0건

1. 반복 절차

- 1차 리뷰에서 finding 수집
- finding 1건 이상이면 즉시 수정
- 동일 범위 재리뷰
- `No Findings`가 나올 때까지 반복
- `No Findings` 후 동일 체크 1회 추가 재실행

1. 커밋 규칙

- Stage 단위로만 커밋
- 각 Stage는 `No Findings + 1회 추가 재검증` 완료 후 커밋

## Backfill/정리 규칙

1. 이관 대상

- 이관 원천은 legacy 인증 원장(`t_member_auth`)과 증빙 이미지(`t_member_auth_evidence_image`)다.
- `t_member_auth.status`는 raw 값 그대로 읽고, 문서/SQL에 고정한 매핑표로만 `request_status`를 결정한다.
- 매핑표에 없는 status 값이 있으면 해당 Stage는 실패 처리하고 다음 Stage 진행을 금지한다.

1. 중복 활성 요청 정리

- 동일 `(member_id, request_origin)`에서 활성 상태가 여러 건이면 `submitted_at` 최신 1건만 활성으로 남긴다.
- 나머지는 `CANCELLED`로 마킹하고 정리 로그를 남긴다.
- `submitted_at` 동률이면 `id` 큰 순으로 1건만 유지한다.

1. 검증

- 정리 후 활성 요청 유니크 위반 0건
- member별 활성 요청 수가 정책(동일 origin 1건)과 일치
- backfill 전/후 상태 diff 리포트 보관

## DB 안전장치

1. 사전

- 실행 전 dump 백업
- DDL은 파일 번호 순서대로 적용

1. 사후

- 필수 postcheck SQL 실행
- 실패 시 해당 Stage 롤백 스크립트 실행
- 다음 Stage 진행 금지

## 산출물

- 마이그레이션 SQL 세트(Expand/Backfill/Cutover/Contract)
- API 변경 PR
- Admin/Mobile 계약 동기화 PR
- 최종 점검 리포트(No Findings 근거 포함)

## 관련 문서

- [회원 심사 3축 분리 정책](member-review-axis-policy.md)
- [회원 심사 FSM](member-review-fsm.md)
