# API 공통 응답 계약 정책

## 문서 역할

- 역할: `규범`
- 문서 종류: `policy`
- 충돌 시 우선 문서: 공통 JSON API 응답 envelope은 이 문서, 실패 `ErrorData`/taxonomy는 `api-error-contract-policy.md`
- 기준 성격: `as-is`

## 목적

API/Admin/Mobile이 JSON API 성공/실패를 같은 envelope 기준으로 판정하게 하고, 성공 DTO 기준과 실패 에러 taxonomy 기준을 섞지 않는다.

## 적용 범위

- coupler-api
- coupler-admin-web
- coupler-mobile-app
- Swagger/OpenAPI에서 문서화하는 JSON API 응답 경계

제외 범위:

- 파일 스트리밍
- proxy pass-through
- 네트워크/protocol 실패

## 단일 SoT

- 공통 JSON API 응답 envelope: 이 문서
- 실패 `ErrorData`, `ERROR_CATALOG`, `ErrorDescriptor`, `error_action`, `error_code`, `error_source`, `error_context`: [API 에러 계약 정책](api-error-contract-policy.md)
- operation별 성공 `data` schema: Swagger/OpenAPI와 각 도메인 정책
- 공통 계약 package 발행/소비/수정 절차: [API 클라이언트 계약 패키지 정책](api-client-contract-package-policy.md)
- 회원가입 성공 응답/라우팅: [회원가입 응답 계약](signup-response-contract.md)
- cutover 잔여 부채: [기술 부채 정리](../technical-debt/technical-debt.md)의 `API 응답 공통 계약 cutover 인덱스`

## 현재 진입점

- API 성공 응답: `coupler-api/controller/common.ts`의 `response_success(res, data)`
- API 실패 응답: `coupler-api/controller/common.ts`의 `response_error(res, descriptor, context?)`
- 공통 타입/runtime 산출물: `coupler-api/packages/contracts/src/generated/*`와 package public `api`/`response`/`error` entrypoint를 generator/build로 생성한다. Admin/Mobile은 publish된 `@coupler-developer/coupler-api-contracts` package를 설치하고 lockfile로 고정한다. Package public response/envelope는 strict `ErrorData` 실패 branch와 `isApiEnvelope` runtime을 사용한다.
- Mobile 요청/응답 경계: `coupler-mobile-app/src/api/apiOperation.ts`, `coupler-mobile-app/src/api/client.ts`, `coupler-mobile-app/src/api/apiResponse.ts`, `coupler-mobile-app/src/utils/APIUtils.ts`
- Admin 요청/응답 경계: `coupler-admin-web/src/api/apiOperation.ts`, `coupler-admin-web/src/api/apiResponse.ts`, `coupler-admin-web/src/api/adminListClient.ts`, `coupler-admin-web/src/app.tsx`

## 필수 규칙

- 계약된 JSON API 성공은 HTTP 200의 `{ ok: true, data }`로 반환한다.
- 계약된 JSON API 실패는 HTTP 200의 `{ ok: false, error: ErrorData }`로 반환한다.
- `ok`는 JSON body의 성공/실패 1차 판정값이다.
- 성공 `data`는 operation별 성공 DTO만 담는다.
- 실패 `error`는 [API 에러 계약 정책](api-error-contract-policy.md)의 `ErrorData`만 담는다.
- 성공 응답에는 `error`를 넣지 않고, 실패 응답에는 성공 `data`를 넣지 않는다.
- 성공 본문이 없으면 `data: null`을 사용한다. `undefined` 성공 payload는 공통 응답 계약으로 보지 않는다.
- HTTP 4xx/5xx는 JSON API `ErrorData` taxonomy가 아니라 transport/protocol/proxy 실패에만 사용한다.
- Mobile/Admin은 `ok`로 먼저 분기하고, 실패 세부 처리는 서버에서 생성한 generated runtime contract와 [API 에러 계약 정책](api-error-contract-policy.md)을 따른다. 코드 import는 `@coupler-developer/coupler-api-contracts`를 사용한다.
- Mobile/Admin은 package `isApiEnvelope` runtime으로 wire envelope를 검증한다. envelope key/discriminator 검증을 소비자별로 다시 구현하지 않는다.
- `result_code`, `result_msg`, legacy numeric code, display message 문자열, top-level domain status를 공통 envelope 판정값으로 쓰지 않는다.
- dual parser, legacy envelope branch, transition helper, 제거 조건 없는 호환 필드는 최종 공통 응답 계약에 둘 수 없다.

## 예외

- Admin 목록 endpoint는 예외 없이 공통 envelope을 사용하며 DataTables success body를 반환하지 않는다.
- 파일 스트리밍, proxy pass-through, 네트워크/protocol 실패는 `ErrorData`, `error_code`, `error_action`을 만들거나 product flow 분기 기준으로 쓰지 않는다.

## 검증 기준

- 공통 response writer, generated contract/package artifact, Mobile/Admin request/response boundary가 같은 envelope을 가리키는지 확인한다.
- Package public response/envelope 타입과 runtime은 failure branch에서 strict `ErrorData`를 사용해야 한다. generated API operation artifact에는 별도 envelope/error helper 타입을 두지 않는다.
- Swagger/OpenAPI success schema가 없거나 느슨하면 generated success data type은 `unknown` 또는 loose object가 될 수 있다. generated artifact만으로 전체 success DTO 완성 증거로 해석하지 않는다.
- CI와 문서 검증은 현재 공통 응답 구조의 금지 조건과 참조 정합성을 확인한다. 과거 legacy helper 이름이나 임시 구현명 자체를 검증 기준으로 삼지 않는다.
- 최종 구조/cutover 범위에 호환 경로가 필요하면 별도 호환 배포 작업으로 분리하고, 제거 조건과 릴리즈 근거를 남긴다.

## 체크리스트

- [ ] JSON API 성공이 `{ ok: true, data }`로 반환되는가?
- [ ] JSON API 실패가 `{ ok: false, error: ErrorData }`로 반환되는가?
- [ ] 클라이언트가 `ok`로 먼저 성공/실패를 분기하는가?
- [ ] 클라이언트가 package envelope runtime을 사용하고 로컬 envelope guard를 복제하지 않는가?
- [ ] 성공 DTO와 실패 `ErrorData`가 한 응답에 섞이지 않는가?
- [ ] Admin 목록 endpoint에 non-envelope success body가 남아 있지 않은가?
- [ ] HTTP non-2xx와 `ErrorData` taxonomy가 섞이지 않는가?
- [ ] transition/legacy/dual parser/helper가 최종 계약에 남아 있지 않은가?
- [ ] Swagger/OpenAPI, generated contract/package artifact, Mobile/Admin boundary, 정책 문서가 같은 envelope 기준을 가리키는가?

## 관련 문서

- [API 에러 계약 정책](api-error-contract-policy.md)
- [API 클라이언트 계약 패키지 정책](api-client-contract-package-policy.md)
- [회원가입 응답 계약](signup-response-contract.md)
- [API 계약 변경 모바일 릴리즈 플로우](../flows/cross-project/api-contract-mobile-release-flow.md)
- [기술 부채 정리](../technical-debt/technical-debt.md)
