# 회원 심사 단일 정책

## 문서 역할

- 역할: `규범`
- 문서 종류: `policy`
- 충돌 시 우선 문서: 회원 심사 규칙은 이 문서, 실패 응답은 `api-error-contract-policy.md`
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
- 현재 운영 상태를 읽고 설명할 때는 as-is 문서인 [회원 심사 FSM](../architecture/member-review-fsm.md), [회원 라이프사이클](../architecture/member-lifecycle.md)를 함께 확인한다.
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

## 회원 생애주기 보조 기준

- `t_member.status`의 값과 상태 흐름 설명은 [회원 라이프사이클](../architecture/member-lifecycle.md)에 두되, 신규 구현/리뷰에서 생애주기 상태를 해석할 때는 이 문서의 기준 분리를 우선한다.
- 재가입 대기 기준은 `HOLD` 대기 없음, `BLOCK` 30일, `LEAVE` 14일이다.
- 탈퇴/차단 회원의 개인정보 자동 파기와 프로필 버전 보관 기한은 [데이터 거버넌스 정책](data-governance-policy.md)을 따른다.

## 가입 심사 최종 거절 비노출 계약

CMS 관리자의 가입 심사 최종 거절은 `RETURN`(반려/수정 후 재제출)과 다른 운영 판단이다.
내부 상태와 사용자 표시 상태를 하나의 값으로 취급하지 않고 아래처럼 역할별로 투영한다.

| 소비자 | 저장·판정 상태 | 필수 동작 |
| --- | --- | --- |
| API/CMS 내부 | `t_member.status = REJECTED(-4)` | 최종 거절 사실을 유지한다. |
| CMS 일반회원 심사 목록 | `REJECTED` 제외 | 거절 즉시 처리 대기 목록에서 제거한다. |
| CMS 거절 회원 탭 | `REJECTED` 포함 | 사용자가 심사 철회하기 전까지 표시한다. |
| Mobile 사용자 | 심사중 표시 상태로만 투영 | 수동로그인·자동로그인·앱 재진입 모두 심사중 화면을 표시한다. |

필수 불변조건:

- Mobile 화면, 문구, 오류에는 최종 거절 사실을 노출하지 않는다.
- 내부 `REJECTED` 회원은 심사 단계, 매니저 배정 여부와 관계없이 Mobile의 `SignupReviewScreen` 심사중 안내로 진입한다.
- `REJECTED` 제한 세션은 본인 심사 현황 조회와 가입 심사 철회만 허용한다. 매칭을 포함한 일반 private API는 계속 차단한다.
- 가입 심사 철회는 `PENDING`과 `REJECTED` 모두 허용하며, 회원 삭제 트랜잭션이 완료되면 CMS 거절 회원 탭에서도 자동으로 사라져야 한다.
- 최종 거절을 단계 상태 `RETURN`으로 변환하거나 재제출 화면으로 연결하지 않는다.
- API는 내부 `REJECTED` 상태와 제한 세션 범위를 판정하고, Mobile의 단일 진입 라우터는 이를 심사중 화면으로만 표시한다.

회귀 차단 시나리오:

1. CMS 최종 거절 후 내부 회원 상태는 `REJECTED`다.
2. 해당 회원은 CMS 일반회원 심사 목록에서 제외되고 거절 회원 탭에 포함된다.
3. 이메일·소셜 수동로그인과 저장 자격증명 자동로그인은 모두 성공하며 Mobile 심사중 화면으로 이동한다.
4. 심사중 화면의 본인 상태 갱신은 성공하지만 다른 일반 private API는 거부된다.
5. 사용자가 심사 철회하면 회원이 삭제되고 CMS 거절 회원 탭에서도 사라진다.

## 필수 인증 표시 기준

- `manager_required_auth`는 매니저가 요구한 필수 인증 정책 플래그이며, 회원의 인증 완료 상태가 아니다.
- `manager_required_auth_types`는 인증 버킷별로 어떤 `t_member_auth.type`이 해당 버킷에 속하는지 정의하는 타입 매핑이며, 버킷이 매니저 요구 대상인지 여부는 `manager_required_auth`가 나타낸다.
- Mobile 설정 화면의 대표 인증 버킷(신분증, 직장/직업, 학력, 소득)은 `manager_required_auth`만으로 완료 표시를 하지 않는다.
- 대표 인증 버킷의 완료/심사중/반려 표시는 실제 `t_member_auth*` 데이터 중 해당 버킷 타입에 속하는 현재 인증 행의 `status`를 기준으로 한다.
- 회원이 가입 단계에서 매니저가 요구한 필수 인증을 제출하고 승인받아 준회원이 된 경우, 설정 화면은 동일한 실제 인증 행을 기준으로 해당 대표 버킷을 승인 상태로 표시한다.
- `type=2`는 과거 통합 인증 코드로 DB row 자체는 유지하되, 현재 버킷 의미는 신분증 전용으로 해석한다. `manager_required_auth_types.auth_job`에는 `type=2`를 포함하지 않으며, Mobile도 직장/직업 버킷 완료로 중복 표시하지 않는다.
- 서버의 단계 판정은 계속 `v_member_review_status.required_auth_status`를 기준으로 하며, Mobile의 버킷별 표시는 서버가 내려준 실제 인증 행을 화면에 투영하는 용도로만 사용한다.

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

## Mobile 미디어 선택/Crop 정책

Mobile에서 심사 제출 전에 적용하는 미디어 선택/Crop 기준은 아래와 같이 고정한다.

| 제출 영역 | Mobile 선택/Crop 기준 | 저장/심사 SoT |
| --- | --- | --- |
| 인증 서류 이미지 | Crop 없이 원본 비율을 유지한다. 직사각형 서류 제출을 허용한다. | `t_member_auth*`, `t_member_auth_review_request*` |
| 프로필 사진 | 기존과 같이 정사각형 Crop을 적용한다. | `t_member_profile_set*` |
| 미니프로필 사진 | 기존과 같이 정사각형 Crop을 적용한다. | `t_member_profile_set*` |
| 프로필/인증 동영상 | Crop을 적용하지 않는다. | `t_member_profile_set*` 또는 동영상 업로드 결과 |
| 스퀘어/미팅/채팅 등 비심사 이미지 | 이번 회원 심사 정책 변경 대상이 아니며, 별도 제품 정책이 없으면 기존 Mobile 동작을 유지한다. | 각 기능의 기존 저장소 |

적용 규칙:

- 인증 서류 이미지는 가입 단계, 설정 수정, 매칭 필수 인증 요청 등 `AuthScreen`/`AuthExamImageScreen` 기반 제출 경로에서 모두 같은 no-crop 기준을 사용한다.
- 프로필 사진과 미니프로필 사진은 정사각형 전제를 유지해 목록/프로필 카드/심사 화면의 기존 표시 비율을 보존한다.
- 서버/API/Admin는 업로드된 파일 경로와 심사 요청 상태를 판정하며, 클라이언트의 Crop 여부를 다시 추론하지 않는다.
- 이 정책은 제출 전 Mobile 미디어 선택 기준이며, 심사 큐 라우팅 기준(`request_origin`, `active_request_slot`, `v_member_review_status`)을 변경하지 않는다.

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
| 프로필 수정 심사 큐 | `request_origin = SETTING_PROFILE_EDIT` + 처리 가능 상태(`PENDING`, `RETURN`, `REAPPLY`) |
| 반려/재심사 이슈 큐 | `RETURN` 상태만 출처(`SIGNUP_REVIEW`, `SETTING_PROFILE_EDIT`)로 분리 표시      |

### 소개글 심사의 표준 신규 생성 상태

| 업무 흐름 | 회원 생애주기 | 요청 출처 | 생성 기준 |
| --- | --- | --- | --- |
| 정회원 승급 소개글 심사 | `PENDING` | `SIGNUP_REVIEW` | 기본정보와 필수 인증이 승인된 준회원의 소개글 요청을 생성한다. |
| 설정의 소개글 수정 심사 | `NORMAL` | `SETTING_PROFILE_EDIT` | 승급이 끝난 정상 회원의 기존 승인 프로필을 유지하고 수정 요청을 별도로 생성한다. |

- 신규 서비스 write와 정상 합성 데이터는 위 조합만 생성한다.
- `NORMAL + SIGNUP_REVIEW` 소개글 요청은 과거 요청을 조회·처리하기 위한 호환 상태다. 신규 write와 정상 합성 데이터에서 생성하지 않는다.
- 호환 상태를 제거하려면 실제 잔존 데이터와 요청 처리 가능 여부를 먼저 확인하고 별도 이관·제거 작업으로 진행한다.

필수 원칙:

- `member_level`은 표시 용도이며 큐 필터 기준으로 사용하지 않는다.
- `request_origin`이 없거나 미정의면 어떤 큐에도 넣지 않는다(Fail-closed).
- 프로필 이미지/영상도 `t_member_profile_set.request_origin`이 큐 라우팅의 필수 기준이며, 값이 없거나 미정의면 Admin 목록/상세/액션 모두에서 제외한다(Fail-closed).
- Admin 정상 회원 목록의 상태 보조 표시는 큐에서 실제 처리 가능한 `display_targets`가 있을 때만 노출한다. `v_member_review_status`의 미제출/누락 상태만으로는 `정상(심사대기)`를 표시하지 않는다.
- 호환 대상인 정상 회원의 소개글 승급 심사는 `SIGNUP_REVIEW` intro 항목의 처리 가능 상태(`PENDING`, `RETURN`, `REAPPLY`)가 있을 때만 상태 보조 표시 대상으로 본다.
- 프로필 이미지/영상의 Admin 표시/큐 판정은 `t_member_profile_set`의 최신 non-normal 버전(`created_at DESC, id DESC`) 1건을 기준으로 한다. 과거 non-normal 버전은 현재 처리 대상으로 표시하지 않는다.
- 인증 심사 큐(`full-*`, `profile-edit`)의 대기 판정은 `t_member_auth_review_request`(`active_request_slot=1`)의 `request_origin/request_status`를 필수 기준으로 하며, 필요 시 실제 인증 데이터와 교집합으로 판정한다.
- 인증 `request_origin`이 큐 목적과 불일치하거나 누락되면 해당 요청은 큐에서 제외한다(Fail-closed).

## CMS 클럽매니저의 `[신청] 일반회원(최초)` 조회 정책

- 클럽매니저 계정에도 CMS 회원관리의 `[신청] 일반회원(최초)` 탭을 표시한다.
- 일반 클럽매니저는 가입 신청 시 현재 클럽매니저를 선택한 회원만 이 탭에서 조회한다.
- 위 범위 안의 신청 회원 목록과 상세 표시 정보는 슈퍼어드민 화면과 같은 기준을 사용한다.
- 일반 클럽매니저에게는 이 탭의 심사 승인·거절 기능을 제공하지 않는다. Admin은 승인·거절 버튼을 비활성 또는 비노출 처리한다.
- 이 제한은 `[신청] 일반회원(최초)`의 승인·거절 액션에 적용하며, 다른 심사 단계의 담당자 권한을 변경하지 않는다.
- 이번 요구의 완료 범위는 일반 클럽매니저의 탭 노출과 승인·거절 버튼 비노출이며, API 인가 변경은 포함하지 않는다.
- Admin 테스트는 슈퍼어드민의 버튼 노출, 일반 클럽매니저의 담당 신청 회원 조회, 일반 클럽매니저의 승인·거절 버튼 비노출을 각각 검증한다.

## 전환 기준 (as-is -> to-be)

- DB/API/Admin/Mobile 전환 완료 전까지 as-is와 to-be 차이를 PR 본문에 명시한다.
- 클럽매니저 최초 일반회원 신청 조회 전환 완료 조건: Admin이 현재 클럽매니저를 선택한 신청 회원만 표시하고 승인·거절 버튼을 제공하지 않으며, 슈퍼어드민과 일반 클럽매니저의 버튼 노출 차이를 Admin 테스트로 검증한 상태다.
- `request_origin` fallback(`coalesce`) 로직은 개발 DB 기준 제거 완료이며, 재도입을 금지한다.
- 큐 중복(동일 요청이 2개 큐에 동시 노출) 0건을 전환 완료 조건으로 둔다.

## 심사 상태 동기화 호출 정책

- `syncMemberReviewStatusByMemberId` 호출은 쓰기 경계(제출/승인/반려/수정 저장)로 제한한다.
- 조회/미들웨어 경로에서는 sync를 호출하지 않고 `v_member_review_status` 읽기 결과만 사용한다.
- sync 실패 응답은 [API 에러 계약 정책](api-error-contract-policy.md)의 `ErrorData`로 통일한다.
- sync 실패는 fail-closed를 기본값으로 하며, 트랜잭션 경로에서는 rollback 후 종료한다.

## API 에러 적용 현황 (`MEMBER`)

공통 응답 envelope은 [API 공통 응답 계약 정책](api-response-contract-policy.md)을, 실패 `ErrorData`는 [API 에러 계약 정책](api-error-contract-policy.md)을 단일 SoT(단일 기준)로 따른다.
이 문서는 도메인 적용 상태와 도메인별 `error_code` 예시만 기록한다.

적용 범위(1차):

- `POST /app/member/request-review/auth`
- `POST /app/member/deleteAuth`

현재 상태:

- API 서버는 descriptor-first `ErrorData` 응답 경계 적용 상태다.
- 실패 응답은 공통 응답 envelope의 `{ ok: false, error: ErrorData }`와 `request_id`를 사용한다.
- Mobile/Admin 공통 실패 처리와 릴리즈 근거 연결은 [기술 부채 정리](../technical-debt/technical-debt.md)의 `API 응답 공통 계약 cutover 인덱스` 잔여 범위로 추적한다.

규칙:

- 이 도메인의 `error_source`는 `MEMBER`다. `MEMBER_AUTH_REVIEW`는 `error_code` segment로만 사용한다.
- `error_code`, `error_action`, `error_context` 예시는 아래 표만 사용한다.
- Mobile/Admin 분기 우선순위는 [API 에러 계약 정책](api-error-contract-policy.md)을 따른다.
- 응답 body에서 `error_context` 밖의 legacy top-level 상세 필드는 사용하지 않는다.

예시:

| `error_source` | `error_code` 예시 | `error_action` | `error_context` 예시 |
| --- | --- | --- | --- |
| `MEMBER` | `MEMBER_AUTH_REVIEW_REQUIRED_AUTH_DELETE_FORBIDDEN` | `FIX_REQUEST` | `{}` |
| `MEMBER` | `MEMBER_AUTH_REVIEW_REQUIRED_AUTH_MANAGER_PROFILE_MISSING` | `CONTACT_SUPPORT` | `{}` |

`member_id`, `manager_id`, `required_auth_types` 같은 내부 식별자와 진단값은 서버 로그에만 남기고 public `ErrorData.error_context`에는 넣지 않는다.

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
- 제출/재제출 UI 판단은 `data.access_context.review_status` 기준만 사용

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
