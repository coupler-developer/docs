# 회원 심사 3축 분리 정책

본 문서는 설정 수정/가입 심사 분류가 다시 섞이지 않도록, 심사 판단 기준을 `자격(Entitlement)`, `진행(Progress)`, `출처(Source)` 3축으로 분리해 고정한다.

## 목적

- 정회원 설정 수정이 승급 심사로 잘못 분류되는 회귀를 차단한다.
- 가입/승급 심사와 설정 수정 심사를 같은 규칙으로 일관되게 분리한다.
- API, Admin, Mobile이 같은 기준(SoT)을 사용하도록 강제한다.

## 적용 범위

- 본 문서는 `t_member_review_request` 기반 심사 항목(`basic_info`, `intro`)의 출처 분리 규칙을 정의한다.
- `required_auth`(인증 심사) 출처 분리 규칙은 별도 문서
  [인증 심사 단일 SoT 마이그레이션 계획](auth-review-single-sot-migration-plan.md)을 따른다.
- 본 정책의 SoT/큐 규칙은 `explicit review schema`(`t_member_review_request`, `v_member_review_status`)가 적용된 환경 기준이다.

## 3축 정의 (SoT)

| 축 | 의미 | 단일 SoT | 금지 |
| --- | --- | --- | --- |
| 자격 (Entitlement) | 회원의 라이프사이클 자격 | `t_member.status` | `v_member_review_status.member_level`로 자격 판정 |
| 진행 (Progress) | 각 심사 단계의 현재 상태 | `v_member_review_status` (`basic_info_status`, `required_auth_status`, `intro_status`) | `t_member_review_stage_snapshot` 직접 판정 |
| 출처 (Source) | 해당 pending이 어디서 생성됐는지 | `t_member_review_request.request_origin` | 출처 없이 상태 조합만으로 큐 분류 |

## 자격/진행/출처 사용 원칙

1. 자격 판정은 `t_member.status`만 사용한다.
2. 진행 상태 표시는 `v_member_review_status`만 사용한다.
3. 심사 큐 라우팅은 출처를 우선 사용한다.
4. 자격 축과 진행 축을 섞지 않는다.
5. 규칙이 모호하면 실패 처리(Fail-closed)한다.

## 큐 라우팅 정책

| 큐 | 자격 조건 | 출처 조건 | 포함 대상 |
| --- | --- | --- | --- |
| 가입/승급 심사 (`semi-*`, `full-*`, `intro-*`) | `t_member.status`가 가입/승급 단계 | `SIGNUP_REVIEW` | 가입/승급 제출분 |
| 프로필정보 변경 요청 (`profile-edit`) | `t_member.status = NORMAL(1)` | `SETTING_PROFILE_EDIT` 우선 | `PENDING/REAPPLY`(처리 가능)만 포함 (`t_member_review_request` 기반 항목 기준) |
| 심사항목 반려/재심사 (`review-item-reapply-queue`) | 상태별 분기(`PENDING/NORMAL`) | `SIGNUP_REVIEW` + `SETTING_PROFILE_EDIT`(과도기 보조 포함) | 반려/재심사 이슈 큐 (`SETTING_PROFILE_EDIT`는 `RETURN`만 포함, `t_member_review_request` 기반 항목 기준) |

보조 규칙:

- `profile-edit`는 `member_level='FULL_MEMBER'`를 필터로 사용하지 않는다.
- `member_level`은 표시값으로만 사용한다.

## 항목 정책 (심사 대상/비대상)

심사 대상:

- 기본정보: `nickname`, `job`, `location`, `school`, `family`, `single`, `drink`, `religion`, `smoke`, `marriage_plan`, `height`, `body_type`, `appeal_point`
- 소개글: `about_me`, `intro`
- 인증: `t_member_auth` 계열
- 실물 사진/동영상: `t_member_profile_set` 계열

심사 제외(즉시 반영):

- `appeal_extra`
- `instagram_id`, `youtube_id`, `sns_id`
- 이상형/성향/QA 계열 설정 항목

## 쓰기 정책 (설정 제출 시)

`request_origin` 결정 우선순위:

1. 기존 활성 pending에 `SETTING_PROFILE_EDIT`가 있으면 유지
2. 기존 활성 pending이 전부 `SIGNUP_REVIEW`면 유지
3. 기존 pending이 없으면 컨텍스트로 결정
4. 컨텍스트 판단은 진행 상태와 자격을 함께 사용하되, 자격 판정 자체는 `t_member.status`를 기준으로 한다

## 읽기 정책 (Admin 목록)

- `profile-edit`는 `M.status=1` + 출처 일치(`SETTING_PROFILE_EDIT`)를 기본 조건으로 사용한다.
- `profile-edit`는 actionable 상태(`PENDING/REAPPLY`)만 포함하고 `RETURN`은 제외한다(`t_member_review_request` 기반 항목).
- `review-item-reapply-queue`의 `SETTING_PROFILE_EDIT` 분기는 `RETURN`만 포함한다(큐 중복 방지, `t_member_review_request` 기반 항목).
- 가입/승급 큐는 출처가 `SIGNUP_REVIEW`인 건만 포함한다.
- `request_origin`이 `NULL`이거나 미정의 enum이면 어떤 큐에도 포함하지 않는다(Fail-closed).
- 출처 누락 건은 운영 점검 대상으로만 취급하고, 데이터 보정 후 재심사 큐에 재진입시킨다.
- `required_auth` 큐 라우팅은 본 문서 대신
  [인증 심사 단일 SoT 마이그레이션 계획](auth-review-single-sot-migration-plan.md)을 따른다.

## 테스트 최소 기준

필수 시나리오:

1. `status=1` 회원이 기본정보 수정 제출 시 `profile-edit`에 노출된다.
2. 동일 회원의 `member_level`이 `PRE_MEMBER`로 내려가도 `profile-edit`에서 누락되지 않는다.
3. 가입/승급 제출 건은 `profile-edit`에 섞이지 않는다.
4. `appeal_extra/social` 수정은 pending을 만들지 않는다.
5. `request_origin IS NULL` 건은 가입/승급/프로필수정 큐 어디에도 노출되지 않는다.

## 알려진 제한과 확장 계획

- 개발계(explicit schema 적용 환경)에서는 출처 SoT가 `t_member_review_request.request_origin`에 적용되어 있다.
- 운영계가 `t_member_pending` legacy 상태이면 본 정책을 직접 적용할 수 없고, explicit schema 전환 완료 후 적용한다.
- `t_member_auth`, `t_member_profile_set`은 별도 `request_origin` 컬럼이 없으므로 과도기 보조 조건이 필요하다.
- 장기적으로 인증/프로필 버전에도 출처 컬럼을 도입해, 모든 심사 도메인을 동일한 source-first 규칙으로 통일한다.

## 관련 문서

- [회원 생명주기](member-lifecycle.md)
- [회원 심사 FSM](member-review-fsm.md)
- [인증 심사 단일 SoT 마이그레이션 계획](auth-review-single-sot-migration-plan.md)
- [프로필 관리 플로우](../flows/cross-project/profile-management-flow.md)
