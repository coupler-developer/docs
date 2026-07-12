# API 계약 cutover 최종 리뷰

## 문서 역할

- 역할: `시나리오`
- 문서 종류: `flow`
- 충돌 시 우선 문서: [엔지니어링 가드레일](../../policy/engineering-guardrails.md), [API 공통 응답 계약 정책](../../policy/api-response-contract-policy.md), [API 클라이언트 계약 패키지 정책](../../policy/api-client-contract-package-policy.md)
- 기준 성격: `as-is`

## 목적

- API/Admin/Mobile 동시 배포 계약 묶음의 최종 코드 리뷰 범위, 검증 결과, 열린 Finding과 merge 조건을 기록한다.

## 범위

- 리뷰일: `2026-07-11`
- 변경 유형: `코드+문서`
- 판정 범위: `동시 배포 계약 묶음`
- API: `coupler-api` PR [#107](https://github.com/coupler-developer/coupler-api/pull/107), source commit `56f7a45`, merge commit `c872927`
- Admin: `coupler-admin-web` PR [#54](https://github.com/coupler-developer/coupler-admin-web/pull/54), comparison ref `refactor/김민식/api-contract-cutover` (review baseline `04163e4`)
- Mobile: `coupler-mobile-app` PR [#156](https://github.com/coupler-developer/coupler-mobile-app/pull/156), commit `f3672b6`
- Docs: `docs` PR [#53](https://github.com/coupler-developer/docs/pull/53), 이 문서와 직접 연결된 정책 변경
- 직접 연결 문서:
    - [API 공통 응답 계약 정책](../../policy/api-response-contract-policy.md)
    - [API 클라이언트 계약 패키지 정책](../../policy/api-client-contract-package-policy.md)
    - [엔지니어링 가드레일](../../policy/engineering-guardrails.md)
    - [코드 리뷰 정책](../../policy/code-review-policy.md)
    - [기술 부채 정리](../../technical-debt/technical-debt.md)
- 제외:
    - operation별 success DTO runtime validator 완성
    - Store/NextPush 배포 이력
    - `min_version`/`force_update`와 legacy traffic 운영 증빙
    - API URL-encoded parser 실제 제거
- 조건부 추가 관점: API 계약, 다중 레포 계약
- N/A 근거: DB, 권한, 결제, 상태 머신, UI 표시를 변경하지 않는다.

## 최종 구조 판정

| 경계 | 판정 | 근거 |
| --- | --- | --- |
| API 성공/실패 envelope | `No Findings` | `coupler-api/packages/contracts/src/response.ts`, API 전체 품질 게이트 통과 |
| 성공 `data` runtime 경계 | `No Findings` | DTO validator 완성 전 `ApiEnvelope<unknown>`만 보장하고 소비자 공통 경계 한 곳에서 compile-time 타입을 결합 |
| Mobile 요청 transport | `No Findings` | GET/DELETE query, POST/PUT JSON, upload multipart 및 관련 테스트 |
| Admin 요청 transport | `No Findings` | GET/DELETE query, 일반 POST JSON, FormData boundary 자동 생성 |
| Admin 일반/목록 응답 경계 | `No Findings` | 일반 응답과 목록 응답 모두 `unknown -> isEnvelope -> ok 분기 -> data 검증/결합` 순서 |
| Package 공개 runtime | `No Findings` | 발행 및 소비 version `0.1.5` 정렬, 설치 runtime 실제 export gate 통과 |
| URL-encoded client body | `No Findings` | Mobile serializer 제거, Swagger App write request JSON 수렴 |

## 검증

| 레포 | 명령 | 결과 |
| --- | --- | --- |
| API | `pnpm lint && pnpm typecheck && pnpm format && pnpm check:contracts && pnpm pack:contracts && pnpm test:ci` | 통과, 102 suites / 851 tests |
| Admin | `yarn lint && yarn typecheck && yarn format && yarn test:ci` | 통과, 9 suites / 72 tests |
| Mobile | `yarn lint && yarn typecheck && yarn format && yarn test:ci` | 통과, 51 suites / 367 tests / 10 snapshots |
| Docs | `yarn validate:docs` | 통과 |

## 수정-리뷰 반복

| 차수 | 조치 | 검증 | 재리뷰 판정 | 근거 |
| --- | --- | --- | --- | --- |
| 1 | Response runtime과 request transport 책임 분리 | 네 레포 표준 품질 게이트 | `Finding` | Package source/consumer version 불일치 |
| 2 | 운영 legacy cutover와 동시 배포 계약 묶음 판정 분리 | `yarn validate:docs` | `Finding` | 운영 증빙은 제외됐으나 package 정렬 미완료 |
| 3 | Admin 응답을 검증 전 `unknown`으로 유지하고 실제 package runtime export gate 추가 | API 통과, Admin/Mobile gate 의도적 실패 | `Finding` | `0.1.5` 미발행 및 소비자 `0.1.4` 고정 |
| 4 | API #107 병합·`0.1.5` 발행 확인 후 Admin/Mobile exact dependency와 lockfile 정렬 | Admin/Mobile 전체 품질 게이트 | `No Findings` | 두 소비자의 설치 runtime export와 API package source 일치 |
| 5 | Admin 목록도 package envelope guard를 먼저 적용하고 목록 validator를 `data` 전용으로 축소 | Admin 표적 회귀 테스트와 전체 품질 게이트, Docs 전체 검증 | `No Findings` | 성공/실패 envelope의 계약 외 top-level field 거부 확인 |

## 판정

| 관문/관점 | 판정 | 근거 |
| --- | --- | --- |
| Scope Gate | `No Findings` | 동시 배포 계약 묶음과 제외 범위를 명시 |
| SoT / Policy Editor | `No Findings` | 세부 기준은 policy에 두고 이 문서는 결과만 기록 |
| Taxonomy / Classification Editor | `No Findings` | envelope, success DTO, request transport, package version 축을 분리 |
| Structure Fitness / Simplification Reviewer | `No Findings` | 공통 envelope guard와 소비자 단일 타입 결합 경계 유지 |
| Change Impact / Sync Auditor | `No Findings` | 코드, 정책, 기술 부채, PR 연결 |
| First-time Reader | `No Findings` | 대상 PR, commit, 제외 범위, merge 조건을 한 문서에서 확인 가능 |
| Writing Quality / Style Editor | `No Findings` | 판정과 근거 중심으로 중복 제거 |
| Domain Implementer | `No Findings` | API/Admin/Mobile별 실행 기준 명시 |
| QA / Evidence Reviewer | `No Findings` | API와 두 소비자 전체 품질 게이트 통과 |
| Lifecycle Owner | `No Findings` | URL-encoded parser 제거는 별도 기술 부채로 유지 |
| 조건부 추가 관점 | `No Findings` | 세 레포 package version과 실제 공개 runtime 정렬 완료 |
| Finding 병합 | `No Findings` | `ACR-001`, `ACR-002` 해소, 열린 Finding 없음 |
| Exit Gate | `No Findings` | 열린 Finding 없음 |

## Findings

| ID | 상태 | 관점 | 내용 | 근거 | 조치 |
| --- | --- | --- | --- | --- | --- |
| `ACR-001` | `닫힘` | QA / Evidence Reviewer, API 계약 | API package source와 Admin/Mobile dependency·lockfile을 `0.1.5`로 정렬하고 제거 대상 runtime export가 설치 package에서 사라진 것을 확인했다. | API #107 merge commit `c872927`, `0.1.5` tarball `a673c3d`, Admin `04163e4`, Mobile `f3672b6`, 두 소비자 전체 품질 게이트 | 완료 |
| `ACR-002` | `닫힘` | Structure Fitness / Simplification Reviewer, API 계약 | Admin 목록 응답의 local envelope 재해석을 제거하고 package `isEnvelope` 검증 뒤 `data.cnt/list`를 검증하도록 책임을 분리했다. | `coupler-admin-web/src/api/adminListClient.ts`, `coupler-admin-web/src/__tests__/admin-list-client.test.ts`, Admin 전체 품질 게이트 | 완료 |

## 비차단 판정

- Swagger request transport 검사의 동적 파일 탐색은 현재 계약 오류가 아니라 향후 회귀 방지 개선 제안이다.
- API URL-encoded parser는 client JSON 전환 완료 판단과 분리된 기존 호환 부채이며 이번 최종 구조 코드 리뷰의 차단 Finding이 아니다.

## 기존 부채

| 항목 | 근거 |
| --- | --- |
| API URL-encoded parser 제거 대기 | `content/technical-debt/technical-debt.md`의 `API URL-encoded 호환 parser 제거 대기` |
| Success DTO schema 정리 미완료 | `content/technical-debt/technical-debt.md`의 `API success DTO schema 정리 미완료` |

## 결론

- 마지막 수정 이후 검증: API/Mobile 선행 통과, Admin 목록 envelope 경계 수정 후 Admin 전체 품질 게이트와 Docs 전체 검증 통과
- 열린 Finding: 없음
- Exit Gate: `No Findings`
- 최종 판정: `No Findings`
- 완료한 소비자 merge 전제조건:
    1. API #107 병합 및 `@coupler-developer/coupler-api-contracts@0.1.5` 발행 확인
    2. Admin/Mobile `package.json`과 `yarn.lock` exact version `0.1.5` 정렬
    3. Admin/Mobile 전체 품질 게이트 통과
    4. 최종 비교 ref로 동일 범위 재리뷰 완료
- 소비자 PR 상태: 코드와 계약 검증 기준 merge 전제조건 완료. 이 문서는 실제 merge 완료를 주장하지 않는다.
- 남은 위험: 이번 동시 배포 계약 묶음 범위에서 확인된 위험 없음.
