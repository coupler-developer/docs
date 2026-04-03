# 회원 심사 단일 정책

## 문서 역할

- 역할: `규범`
- 문서 종류: `policy`
- 충돌 시 우선 문서: 이 문서
- 기준 성격: `transition`
    - 최종 목표 기준을 우선 사용한다.
    - 미전환 구현과의 차이는 PR/작업 보고에 명시한다.

본 문서는 회원 심사 규칙의 단일 정책 문서다.
가입 단계/설정 수정/Admin 대기 큐/Mobile 제출-재제출 동작을 한 기준으로 고정한다.

## 목적

- 심사 분류 회귀(가입 심사와 설정 수정 심사 혼재) 방지
- Admin/Mobile/API가 같은 판정 기준 사용
- 제출/재제출 UX와 운영 큐 기준 고정

## 적용 우선순위

- 신규 구현, 리뷰, 전환 완료 판정의 규범 SoT는 이 문서를 사용한다.
- 현재 운영 상태를 읽고 설명할 때는 as-is 문서인 [회원 심사 FSM](../architecture/member-review-fsm.md), [회원 생명주기](../architecture/member-lifecycle.md)를 함께 확인한다.
- as-is 문서와 transition 목표 사이에 차이가 있으면, 목표 기준을 따르되 현재 운영 차이와 전환 범위를 PR/작업 보고에 명시한다.

## 기준 분리

- 회원 생애주기 상태 SoT: `t_member.status`
- 심사 상태 판정/읽기 SoT: `v_member_review_status`
- 큐 라우팅 출처 원천:
    - 기본정보/소개: `t_member_review_request.request_origin`
    - 인증: `t_member_auth_review_request.request_origin`
    - 프로필 미디어: `t_member_profile_set.request_origin`
- 인증 요청의 현재 활성 건 판정은 `t_member_auth_review_request.active_request_slot = 1`을 기준으로 한다.
- `request_origin`은 출처/큐 라우팅용 원천 데이터이며, 심사 상태 판정 SoT를 대체하지 않는다.

## 회원 레벨 정의 (운영 용어, v2.0)

가입 심사 단계에서 사용하는 레벨은 아래 4단계다.

| 운영 용어 | 코드             | 기준                                 |
| --------- | ---------------- | ------------------------------------ |
| 회원전    | `PRE_MEMBER`     | 가입 심사 진행 중이며 아직 기본정보 승인이 완료되지 않은 상태 |
| 일반회원  | `GENERAL_MEMBER` | 기본정보 승인                        |
| 준회원    | `SEMI_MEMBER`    | 기본정보 + 필수인증 승인             |
| 정회원    | `FULL_MEMBER`    | 기본정보 + 필수인증 + 소개글 승인    |

`SPECIAL_MEMBER`는 가입 단계 산출 레벨이 아니다.

- `SPECIAL_MEMBER`: 운영자 사후 수동 부여 레벨
- 부여 시점: 가입 심사 완료 이후
- 심사 큐 분류 기준은 동일하게 `status/request_origin`을 사용한다.
- SPECIAL_MEMBER는 FULL_MEMBER 권한과 동일하게 취급한다. 추가 권한은 별도 정책 수립 시 정의한다.

## 레벨별 심사 정책

| 레벨                        | 가입 단계에서 심사                     | 설정 수정에서 심사                                                  | Admin 대기 큐       | Mobile 기본 동작                                             |
| --------------------------- | -------------------------------------- | ------------------------------------------------------------------- | ------------------- | ------------------------------------------------------------ |
| 회원전 (`PRE_MEMBER`)       | 기본정보, 소개글, 필수인증 제출분 심사 | 가입 미완료 상태 수정은 `SIGNUP_REVIEW`로 유지                      | 가입/승급 심사 큐   | 단계별 `PENDING/RETURN/REAPPLY` 노출, `RETURN`은 재제출 유도 |
| 일반회원 (`GENERAL_MEMBER`) | 해당 없음(가입 단계 통과)              | 심사대상 필드 수정 시 심사 생성(`SETTING_PROFILE_EDIT`)             | 프로필 수정 심사 큐 | 제출 시 `PENDING`, 반려 시 `RETURN` + 재제출                 |
| 준회원 (`SEMI_MEMBER`)      | 해당 없음(가입 단계 통과)              | 소개글/기본정보/인증 수정 시 심사 생성(`SETTING_PROFILE_EDIT`)      | 프로필 수정 심사 큐 | 동일 규칙(`PENDING/RETURN/REAPPLY`)                          |
| 정회원 (`FULL_MEMBER`)      | 해당 없음(가입 단계 통과)              | 기본정보/소개/인증/프로필 변경 시 심사 생성(`SETTING_PROFILE_EDIT`) | 프로필 수정 심사 큐 | 동일 규칙(`PENDING/RETURN/REAPPLY`)                          |

## 심사 대상 항목

요청 맥락별 심사/비심사 대상은 아래와 같이 고정한다.

| 구분                         | 일반 심사 제출 (`SIGNUP_REVIEW`)                                             | 설정 수정(일반/준/정회원, `SETTING_PROFILE_EDIT`)                       |
| ---------------------------- | ---------------------------------------------------------------------------- | ----------------------------------------------------------------------- |
| 기본정보 심사 항목           | 닉네임, 직업, 키                                                             | 직업, 키, 거주지, 학력, 결혼경험여부, 결혼계획, 체형, 어필포인트        |
| 기본정보 비심사 항목         | 해당 없음(제출분 심사)                                                       | 닉네임(설정수정 입력 불가), 가족관계, 주량, 종교, 흡연여부              |
| 프로필정보(미디어) 심사 항목 | 사진 3~7장(최소 3장 필수, 추가 4장 선택), 여성 영상은 선택 제출(미제출 허용) | 제출한 이미지/영상만 심사(사진 최소 3장 유지, 여성 영상은 제출 시 심사) |
| 소개글 심사 항목             | `about_me`, `intro`(제출분)                                                  | `about_me`, `intro`(소개 제출 시)                                       |
| 인증 심사 항목               | `t_member_auth*`, `t_member_auth_review_request*`                            | `t_member_auth*`, `t_member_auth_review_request*`                       |
| 프로필 이미지/영상 저장 SoT  | `t_member_profile_set*`                                                      | `t_member_profile_set*`                                                 |

해석 규칙:

- 일반 심사 제출은 승급 심사 기준으로 기본정보(닉네임/직업/키)와 프로필정보(사진 3~7장, 여성 영상 선택 제출)를 적용한다.
- 설정 수정은 가입 단계의 필수 묶음을 재강제하지 않고, 위 표의 심사 항목 변경분만 심사를 생성한다.
- 설정 수정에서 `직업/키`는 심사 대상이며, `닉네임`은 입력 불가 항목으로 심사를 생성하지 않는다.
- 설정 수정의 나머지 비심사 항목은 즉시 반영한다.
- Admin 가입/승급 심사 큐(일반회원 승급 심사 화면)에서는 `닉네임`, `직업`, `키`와 제출된 프로필정보(이미지/영상)를 한 묶음으로 심사한다.

## 설정 수정 즉시 반영(심사 비대상)

- `가족관계`, `주량`, `종교`, `흡연여부`
- `appeal_extra`
- `instagram_id`, `youtube_id`, `sns_id`
- `i am`, `i want`, `Q/A` 설정 계열

## Admin 큐 라우팅 정책

| 큐                  | 포함 조건                                                                      |
| ------------------- | ------------------------------------------------------------------------------ |
| 가입/승급 심사 큐   | `request_origin = SIGNUP_REVIEW`                                               |
| 정회원 승급 심사 큐 | `request_origin = SIGNUP_REVIEW` + `required_auth_status = APPROVED`           |
| 프로필 수정 심사 큐 | `request_origin = SETTING_PROFILE_EDIT` + 처리 가능 상태(`PENDING`, `REAPPLY`) |
| 반려/재심사 이슈 큐 | `RETURN` 상태만 출처(`SIGNUP_REVIEW`, `SETTING_PROFILE_EDIT`)로 분리 표시      |

필수 원칙:

- `member_level`은 표시 용도이며 큐 필터 기준으로 사용하지 않는다.
- `request_origin`이 없거나 미정의면 어떤 큐에도 넣지 않는다(Fail-closed).
- 프로필 이미지/영상도 `t_member_profile_set.request_origin`이 큐 라우팅의 필수 기준이며, 값이 없거나 미정의면 Admin 목록/상세/액션 모두에서 제외한다(Fail-closed).
- 인증 심사 큐(`full-*`, `profile-edit`)의 대기 판정은 `t_member_auth_review_request`(`active_request_slot=1`)의 `request_origin/request_status`를 필수 기준으로 하며, 필요 시 실제 인증 데이터와 교집합으로 판정한다.
- 인증 `request_origin`이 큐 목적과 불일치하거나 누락되면 해당 요청은 큐에서 제외한다(Fail-closed).

## 전환 기준 (as-is -> to-be)

- DB/API/Admin/Mobile 전환 완료 전까지 as-is와 to-be 차이를 PR 본문에 명시한다.
- `request_origin` fallback(`coalesce`) 로직은 개발 DB 기준 제거 완료이며, 재도입을 금지한다.
- 큐 중복(동일 요청이 2개 큐에 동시 노출) 0건을 전환 완료 조건으로 둔다.

## 심사 상태 동기화 호출 정책

- `syncMemberReviewStatusByMemberId` 호출은 쓰기 경계(제출/승인/반려/수정 저장)로 제한한다.
- 조회/미들웨어 경로에서는 sync를 호출하지 않고 `v_member_review_status` 읽기 결과만 사용한다.
- sync 실패 응답은 `review_status_inconsistent + error_code` 계약으로 통일한다.
- sync 실패는 fail-closed를 기본값으로 하며, 트랜잭션 경로에서는 rollback 후 종료한다.

## API 에러 응답 계약 (국소 모범 케이스)

적용 범위(1차):

- `POST /app/member/request-review/auth`
- `POST /app/member/deleteAuth`

상위 기준:

- 전사 에러 계약/환경 분리 기준은 `content/policy/api-error-contract-policy.md`를 단일 SoT로 따른다.
- 본 섹션은 `MEMBER_AUTH_REVIEW` 도메인의 국소 모범 케이스만 다룬다.

규칙:

- `result_code`는 공통 실패 코드(`RESULT_CODE.ERROR`)를 유지한다.
- 모바일 원인 판별은 `result_data`의 아래 필드를 단일 기준으로 사용한다.
    - `error_code`: 도메인 원인 코드(예: `MANAGER_PROFILE_MISSING`, `REQUIRED_AUTH_DELETE_FORBIDDEN`)
    - `error_source`: 오류가 발생한 도메인(예: `MEMBER_AUTH_REVIEW`)
    - `error_action`: 모바일 권장 후속 처리(예: `CONTACT_SUPPORT`, `FIX_REQUEST`)
    - `error_context`: 원인 분석용 구조화 데이터(`member_id`, `manager_id`, `required_auth_types` 등)
- 호환을 위해 기존 상세 필드(`member_id`, `manager_id`, `required_auth_types`)는 top-level 병행을 허용한다.

예시:

```json
{
  "result_code": -10,
  "result_msg": "이미 제출된 필수 인증은 삭제할 수 없습니다. 수정 후 재제출해주세요.",
  "result_data": {
    "error_code": "REQUIRED_AUTH_DELETE_FORBIDDEN",
    "error_source": "MEMBER_AUTH_REVIEW",
    "error_action": "FIX_REQUEST",
    "error_context": {
      "member_id": 77,
      "required_auth_types": [2]
    },
    "member_id": 77,
    "required_auth_types": [2]
  }
}
```

## Mobile 제출/재제출 정책

| 단계 상태     | 화면 동작      | 사용자 액션         |
| ------------- | -------------- | ------------------- |
| `UNSUBMITTED` | 미제출 안내    | 제출 가능           |
| `PENDING`     | 심사중 안내    | 중복 제출 차단      |
| `RETURN`      | 반려 사유 표시 | 재제출 가능         |
| `REAPPLY`     | 재심사중 안내  | 추가 중복 제출 차단 |
| `APPROVED`    | 승인 상태 표시 | 다음 단계 진행      |

재제출 규칙:

- `RETURN` 상태 항목만 재제출 허용
- 재제출 시 상태는 `REAPPLY`로 전이
- 제출/재제출 UI 판단은 `result_data.access_context.review_status` 기준만 사용

## 운영 안내 문구

- Admin 심사 적용 완료 토스트(`pending_complete_notice`): `심사 이력이 반영되어 정회원으로 승급되었습니다.`

## 회귀 방지 금지 사항

- `t_member_review_stage_snapshot` 직접 조회로 심사 판정 금지
- `member_level`로 심사 큐 분류 금지
- `request_origin` fallback(`coalesce`)로 출처 추측 금지
- 클라이언트가 서버 심사 판정을 재구현하는 로직 금지

## 관련 문서

- [회원 심사 FSM](../architecture/member-review-fsm.md)
- [회원가입 응답 계약](signup-response-contract.md)
