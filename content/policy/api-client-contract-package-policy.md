# API 클라이언트 계약 패키지 정책

## 문서 역할

- 역할: `규범`
- 문서 종류: `policy`
- 충돌 시 우선 문서: 계약 패키지의 목적, 발행, 소비, 수정 절차는 이 문서. JSON 응답 envelope은 `api-response-contract-policy.md`, 실패 `ErrorData`/taxonomy는 `api-error-contract-policy.md`, 운영 배포 순서는 `release-process.md`
- 기준 성격: `as-is`

## 목적

`@coupler-developer/coupler-api-contracts`는 `coupler-api`에서 생성한 API/Admin/Mobile 공통 계약의 version pinning 장치이자 public request/success DTO type 및 공통 response/error runtime 배포 경계다. Wire 구조를 바꾸지 않고 generated contract와 소비자 코드 사이의 drift를 package version, dependency diff, lockfile diff에서 드러나게 하며, Mobile/Admin은 package DTO type을 소비하고 같은 package runtime으로 envelope을 검증한다.

## 적용 범위

- `coupler-api`의 계약 package source, generated contract, pack/publish 설정
- Swagger/OpenAPI에서 생성하는 operation별 public request/success DTO type
- `coupler-admin-web`와 `coupler-mobile-app`의 계약 dependency, import, lockfile
- GitHub Packages registry/auth 설정과 API 계약 변경 릴리즈 기록

제외 범위:

- JSON API 응답 envelope 자체의 wire 구조 변경
- request method/path/media type 검증 runtime, request serializer, URL encoder, operation dispatcher
- 실패 `ErrorData` taxonomy 작성 기준

## 단일 SoT

- JSON API 성공/실패 envelope: [API 공통 응답 계약 정책](api-response-contract-policy.md)
- 실패 `ErrorData`와 error taxonomy: [API 에러 계약 정책](api-error-contract-policy.md)
- operation별 public request DTO wire schema: Swagger/OpenAPI
- operation별 성공 `data` wire schema: Swagger/OpenAPI
- DTO 필드의 비즈니스 의미와 도메인 제약: 각 도메인 정책
- package publish와 운영 배포 순서: [배포/릴리즈 프로세스](release-process.md)의 `Contracts Package Release`
- API 계약 변경 cutover gate: [API 계약 변경 모바일 릴리즈 플로우](../flows/cross-project/api-contract-mobile-release-flow.md)
- package 전환 잔여 부채: [기술 부채 정리](../technical-debt/technical-debt.md)의 `API 응답 공통 계약 cutover 인덱스`, `API success DTO schema 정리 미완료`, `API public request DTO 생성/소비 전환 미완료`

## 용어

- Canonical generated contract: `coupler-api/packages/contracts/src/generated/*`에서 generator가 만든 API contract artifact. Publish된 package의 source artifact다.
- Package source target: `coupler-api/packages/contracts`
- Published package: GitHub Packages에 발행하는 `@coupler-developer/coupler-api-contracts`
- Published latest stable version: API `main`의 canonical generated contract를 반영해 GitHub Packages에 가장 최근 발행한 prerelease가 아닌 version
- Active consumer: 계약 package를 dependency로 사용하는 `coupler-admin-web`와 `coupler-mobile-app`
- Legacy generated copy: Admin/Mobile의 `src/api/generated/*` 복사본
- Public wire DTO: API 경계의 path/query/body 요청 값과 성공 응답 `data`를 표현하는 DTO. DB row, 서버 내부 usecase 모델, 화면 ViewModel, 로컬 draft는 포함하지 않는다.

## 전환 상태

- 현재 published package는 operation별 success DTO type과 response/error runtime을 제공하지만 operation별 public request DTO type은 제공하지 않는다.
- Public request DTO type 생성과 Admin/Mobile local request wire DTO 제거는 [기술 부채 정리](../technical-debt/technical-debt.md)의 `API public request DTO 생성/소비 전환 미완료`에서 추적한다.
- 전환 완료 전 기존 local request DTO는 기존 부채로 분류한다. 신규 또는 직접 수정하는 operation은 Swagger/OpenAPI request schema를 먼저 고정하고, package generated request DTO를 사용할 수 있는 범위부터 local wire DTO를 추가하지 않는다.
- 기존 `unknown`, loose success schema, consumer-local response DTO는 [기술 부채 정리](../technical-debt/technical-debt.md)의 `API success DTO schema 정리 미완료`로 관리한다. 현재 변경이 읽거나 수정하지 않는 기존 endpoint를 같은 PR에서 일괄 정리하지 않는다.

## 필수 규칙

- 계약 package는 배포 경로, version pinning 장치, public request/success DTO type과 공통 response/error runtime의 단일 배포 경계이며, wire 구조 변경이나 전체 DTO 완성 증거로 해석하지 않는다.
- package infra PR은 wire 응답 구조를 바꾸지 않는다.
- 계약 package의 source of truth는 `coupler-api`다. Admin/Mobile은 package를 생성하지 않고 발행된 version을 lockfile로 고정한다.
- API public request/success wire shape는 Swagger/OpenAPI에서 한 번만 정의하고 API generator가 package type으로 생성한다. 필드의 비즈니스 의미와 도메인 제약은 각 도메인 정책에서 정의한다. Admin/Mobile은 같은 wire DTO를 local type/interface로 다시 정의하지 않는다.
- 신규 operation 또는 성공 `data`의 필드·필수 여부·nullable·배열/단수 구조를 직접 변경하는 operation은 같은 변경 단위에서 Swagger/OpenAPI success DTO를 실제 wire shape와 일치시키고 generated contract freshness를 통과해야 한다.
- Mobile/Admin의 성공 `data` 소비 구조는 아래 `소비자 DTO와 ViewModel 경계`를 따른다.
- 소비자가 성공 `data` 내부 필드를 해석하지 않고 opaque JSON 값 전체를 그대로 전달·보관하는 passthrough 경로는 operation별 success DTO 소비 전환 대상에서 제외할 수 있다. 이 예외는 필드 접근·로컬 shape 선언·cast·fallback이 없다는 근거가 있어야 하며, passthrough를 이유로 신규 loose schema를 추가해서는 안 된다.
- Package request DTO는 type-only 계약이며 path/query/body 위치, required/optional, nullable, 배열/단수 구조를 보존해야 한다. DB row, 서버 내부 DTO, 화면 ViewModel, 로컬 draft는 package public DTO로 승격하지 않는다.
- 소비자는 package request DTO로 payload를 구성한다. 화면 ViewModel과 로컬 draft는 API 호출 계층으로 역유입하지 않는다.
- 모든 active consumer는 published latest stable version을 `package.json`과 lockfile에 exact version으로 고정한다. API `main`, Admin, Mobile의 version이 하나라도 다르면 계약 정렬과 cutover는 완료가 아니다.
- 최종 구조 리뷰에서는 API package source와 Admin/Mobile dependency·lockfile을 하나의 동시 배포 계약 묶음으로 비교한다. 세 레포의 exact version과 실제 runtime 공개 표면이 같으면 함께 배포 가능한 최종 계약으로 판정하며, 이 코드 판정 자체에 Store/NextPush 이력이나 legacy traffic 운영 증빙을 요구하지 않는다.
- 운영 배포 증빙은 구버전 소비자 호환 경로나 URL-encoded parser 같은 legacy 입력 경로를 실제 제거할 때 별도 Cutover Gate로 확인한다. 브랜치 이름에 `cutover`가 있다는 이유만으로 package 정렬 리뷰에 운영 Gate를 추가하지 않는다.
- 변경된 계약 symbol을 특정 consumer가 직접 import하지 않더라도 version 갱신 대상에서 제외하지 않는다. 계약 package는 active consumer가 함께 고정하는 공용 계약 스냅샷이다.
- 새 stable version을 발행하면 같은 릴리즈 작업 단위에서 Admin/Mobile dependency와 lockfile 갱신 PR을 모두 준비하고 품질 게이트를 통과시킨다. 두 PR이 `main`에 병합되기 전에는 계약 package 소비 정렬을 완료로 기록하지 않는다.
- 소비자 version 지연은 별도 호환 릴리즈로 승인된 경우에만 허용한다. 예외 기록에는 대상 consumer, 현재/목표 version, 지연 사유, owner, 제거 조건과 목표 시점을 포함해야 하며, 예외가 열린 동안에는 cutover 완료로 판정하지 않는다.
- package 이름은 `@coupler-developer/coupler-api-contracts`로 고정한다. 별도 import alias를 두지 않는다.
- API repo의 package 발행/검증 명령은 API repo의 `packageManager`와 lockfile 기준을 따른다. 현재 기준은 `pnpm`/`pnpm-lock.yaml`이다.
- API repo의 `Release Contracts` publish 권한은 GitHub Actions 기본 `github.token`과 workflow `packages: write` 권한으로 고정한다. 이 package 발행만을 위해 별도 PAT secret을 만들거나 fallback으로 두지 않는다.
- Admin/Mobile 소비자 설치 인증은 package 발행 권한과 분리한다. 현재 소비자 CI 설치는 GitHub Packages package settings의 `Manage Actions access`에 해당 consumer repo가 `Read` 권한으로 등록된 상태를 전제로, GitHub Actions 기본 `github.token`과 workflow `packages: read` 권한을 사용한다.
- package 설치만을 위해 새 PAT, 새 token secret, 새 fallback token을 만들지 않는다.
- 새 token secret이 필요하다고 판단되면 먼저 package `Manage Actions access`, `github.token` 권한, org/repo 권한 제약을 조사하고, 대체 불가 사유와 권한 범위, 만료/회수 계획을 PR/릴리즈 기록에 남긴 뒤 명시 승인을 받아야 한다.
- GitHub Packages에 발행하더라도 API repo에 `npm install` 또는 `package-lock.json` 생성을 섞지 않는다.
- 소비자 repo의 `.npmrc`는 scope registry 설정만 커밋한다. token 값이나 `${NODE_AUTH_TOKEN}` placeholder를 `.npmrc`에 커밋하지 않는다.
- GitHub Packages npm package는 로컬 개발자 설치에도 인증이 필요하다. 각 개발자는 개인 GitHub 계정 기준으로 `read:packages` 권한이 있는 user-level npm auth를 설정한다.
- GitHub Packages `Manage Actions access`는 GitHub Actions의 `github.token` 설치 권한만 부여한다. EC2, 배포 호스트, 개인 노트북, 수동 SSH shell에서 실행하는 `yarn install`에는 적용되지 않는다.
- EC2 또는 배포 호스트에서 직접 `yarn install`/`yarn build`를 실행하면 해당 OS 사용자도 package 소비자다. 설치를 실행하는 사용자 예: `ubuntu`, `deploy`, `root`의 user-level npm auth에 `read:packages` 권한이 있어야 한다.
- 로컬 개발자 인증은 `~/.npmrc` 같은 사용자 홈 설정에만 저장하고, repo `.npmrc`, lockfile, 문서 예시, CI 로그에 token 값을 남기지 않는다.
- Git 작업 인증은 SSH를 기본으로 사용할 수 있지만, SSH는 `npm.pkg.github.com` package 설치 인증을 대체하지 않는다.
- 로컬 인증 절차 문서는 `gh auth status`, 필요 시 `gh auth login -p ssh`, `gh auth refresh -s read:packages`, `npm config set --location=user ...` 순서를 포함한다.
- 로컬 인증 누락으로 `yarn install`이 실패하는 것은 package 계약 전환의 협업 차단 이슈로 본다. 소비자 전환 PR은 README 또는 개발자 문서에 로컬 인증 절차를 포함해야 한다.
- 실제 발행 전 소비자 전환 PR에는 `file:`, local tarball, git dependency 같은 임시 dependency를 커밋하지 않는다.
- Admin/Mobile은 legacy generated copy를 재도입하지 않는다.
- Admin/Mobile이 package dependency와 lockfile로 전환되는 cutover PR에서는 legacy generated copy와 copy exact match 검증 CI를 함께 제거한다.
- 발행된 package version은 재사용하지 않는다. 계약 산출물이 바뀌면 새 version을 발행하고 소비자 lockfile에 반영한다.
- package의 public response/envelope 타입과 runtime guard는 generated error runtime의 strict `ErrorData`를 실패 계약으로 사용한다. Envelope runtime guard는 성공 DTO를 검증한 것처럼 generic 타입을 단정하지 않고 `ApiEnvelope<unknown>`을 반환하며, 성공/실패는 추가 branch helper 없이 `ok`로 분기한다.
- `generated/apiContract.ts`는 Swagger success operation map 산출물이며, 그 안의 느슨한 실패 helper 타입을 package public response 기준으로 삼지 않는다.
- Request DTO type 공유는 request transport runtime 공유와 분리한다. Request method/path/media type validator, request DTO runtime validator, serializer, URL encoder, operation dispatcher는 package public runtime으로 승격하지 않는다. Canonical client request는 body 없는 `GET`/`DELETE`, JSON `POST`/`PUT`, upload `multipart/form-data`로 고정하고, Mobile/Admin request boundary와 API Swagger/parser가 같은 결론을 가리켜야 한다.
- API의 URL-encoded parser는 운영 legacy Mobile 차단 전까지만 허용하는 호환 입력 경로다. 제거 조건과 목표 시점은 [기술 부채 정리](../technical-debt/technical-debt.md)의 `API URL-encoded 호환 parser 제거 대기`에서 추적한다.
- 소비자 코드는 package public request/success DTO 또는 명시 ViewModel mapping을 사용하고, API wire shape를 local DTO, cast, alias fallback, normalize로 보정하지 않는다.

### 소비자 DTO와 ViewModel 경계

| 계층 | 입력 | 출력 | 허용 책임 |
| --- | --- | --- | --- |
| API 호출 경계 | `unknown` envelope | operation별 generated success DTO | envelope 검증, `ok` 분기, operation 타입 연결 |
| 선택적 ViewModel mapper | generated success DTO | 화면 전용 ViewModel | 표시명, 파생값, UI 상태 계산 |
| 화면 | generated DTO 또는 ViewModel | 렌더링 | 표시와 사용자 상호작용 |

- 파생값이 없으면 generated DTO를 직접 사용한다. ViewModel은 필요한 화면에만 두며 API 요청이나 다른 operation DTO로 역사용하지 않는다.
- mapper 입력을 `unknown`, `Record<string, unknown>`, consumer-local wire type으로 넓히거나 숫자·문자열 coercion, 누락값 기본값, enum 치환·필터링으로 wire 위반을 숨기지 않는다. 계약 위반은 실패·로그 처리하거나 승인된 호환 예외로 분리한다.
- 사용자 입력, navigation param, Native media URI, 날짜·금액 표시 포맷은 API wire 보정이 아니므로 허용한다.
- structured success fixture는 `satisfies ApiOperationSuccessData<'METHOD /path'>` 또는 동등한 operation DTO type으로 계약 일치를 확인한다.

## 공개 표면 폐쇄 원칙

계약 package와 소비자 response boundary는 확장 가능한 utility library가 아니라 폐쇄형 계약 경계다. 아래 allowlist에 없는 public runtime symbol과 entrypoint는 필요해 보인다는 이유만으로 추가하지 않는다.

허용 public 표면:

- `api`: generator가 만든 contract version, operation metadata와 operation별 type-only public request/success DTO
- `error`: generator가 만든 strict `ErrorData`, error catalog, message와 그 검증/조회 runtime
- `response`: `ApiSuccessEnvelope`, `ApiFailureEnvelope`, `ApiEnvelope`, `ApiErrorData` 타입과 runtime guard `isApiEnvelope` 하나
- Admin/Mobile facade: package의 `isApiEnvelope`를 로직 없이 연결하는 `isEnvelope` 하나
- Mobile의 `ApiResult` 변환, 상태 판정과 사용자 메시지 helper는 package 계약이 아닌 앱 내부 response boundary로만 유지하며, 현재 runtime export allowlist 밖으로 확장하지 않는다.

금지 파생:

- `isApiSuccessEnvelope`, `isApiFailureEnvelope`처럼 `ok` 분기를 다시 감싼 branch helper
- 검증하지 않은 success DTO를 보장하는 generic guard, assertion, decoder 또는 parser
- request method/path/media type/request DTO runtime validator, serializer, URL encoder 또는 operation dispatcher
- API wire shape를 다시 정의하는 consumer-local request/response DTO
- package 결과를 재해석하는 local envelope validator, normalize, fallback, alias 호환 계층
- 제거 Gate와 기술 부채 기록이 없는 legacy/dual/transition runtime
- 기존 entrypoint의 편의 alias, 동일 계약의 중복 package, consumer 전용 public export

`api` entrypoint 안에서 Swagger/OpenAPI로부터 생성되는 type-only request/success DTO 추가는 위 허용 표면에 포함한다. 새 runtime symbol 또는 새 entrypoint 확장은 기본적으로 금지한다. 불가피한 runtime 확장은 구현과 같은 PR에 끼워 넣지 않고 별도 계약 변경으로 다루며, 다음 근거를 모두 남겨야 한다.

1. 기존 허용 표면으로 해결할 수 없는 구체적 실패 사례
2. API/Admin/Mobile 영향과 대안 비교
3. wire compatibility, 보안, bundle/runtime 비용 평가
4. 새 symbol의 owner, 제거 가능성, version bump와 consumer 정렬 계획
5. API/Admin/Mobile/Docs 리뷰 승인과 public export allowlist CI 갱신

근거가 하나라도 없으면 public 표면을 확장하지 않고 호출부의 도메인 로직 또는 명시 ViewModel mapping으로 해결한다.

## 운영 절차

### Package infra 추가

1. API repo에 package source, export, pack/publish 검증 경로를 추가한다.
2. Canonical generated contract는 package source target에 생성하고, Admin/Mobile generated copy를 만들지 않는다.
3. `pnpm pack:contracts`로 발행 산출물에 필요한 파일만 포함되는지 확인한다.
4. Package `api` entrypoint가 operation별 type-only public request/success DTO를, `response` entrypoint가 strict `ErrorData` 기반 envelope 타입과 runtime guard를 노출하는지 확인한다.
5. Package와 Admin/Mobile response facade의 public runtime symbol이 각각의 정확한 allowlist를 벗어나지 않는지 CI로 확인한다.
6. PR과 릴리즈 기록에 package infra가 wire 계약 변경, 소비자 전환 완료, public request/success DTO 완료를 의미하지 않는다고 기록한다.

### 첫 발행

1. API repo에서 generated contract freshness 검증을 통과시킨다.
2. API repo의 package manager 기준으로 `@coupler-developer/coupler-api-contracts`를 발행한다.
3. 발행 version, registry package, 비교한 API ref, pack/publish 검증 결과를 릴리즈 기록에 남긴다.
4. 발행 실패 시 소비자 전환 PR을 진행하지 않는다.

### Admin/Mobile 소비 전환

1. 소비자 레포에 GitHub Packages registry 설정을 추가한다.
2. GitHub Packages package settings의 `Manage Actions access`에 consumer repo `Read` 권한을 부여한다.
3. CI install step은 workflow `packages: read` 권한과 `NODE_AUTH_TOKEN: ${{ github.token }}` 기준으로 구성한다.
4. 새 token secret이 필요하다고 판단되면 필수 규칙의 token 생성 예외 절차를 먼저 통과한다.
5. README 또는 개발자 문서에 로컬 GitHub Packages 인증 절차를 추가한다.
6. 배포 호스트에서 직접 install/build를 실행하는 운영 방식이 있으면 배포 런북에 해당 OS 사용자 기준 GitHub Packages 인증 절차를 추가한다.
7. 발행된 `@coupler-developer/coupler-api-contracts` version을 consumer package manager로 lockfile에 고정한다.
8. `src/api/generated/*` import를 package import로 교체한다.
9. 소비자 repo의 `src/api/generated/*` legacy copy와 generated copy exact match CI를 제거한다.
10. request boundary가 package response runtime으로 `{ ok: true, data }` / `{ ok: false, error }`를 검증하고 같은 분기 기준을 유지하는지 확인한다.
11. 소비자 request payload와 success data가 package generated operation DTO를 사용하고, 동일 wire shape의 local DTO가 남지 않았는지 확인한다.

### 계약 수정과 version bump

1. Swagger/OpenAPI, error catalog, 도메인 정책 중 해당 SoT를 먼저 수정한다.
2. API repo에서 generated contract를 재생성하고 freshness 검증을 통과시킨다.
3. 계약 산출물이 바뀌면 package version을 올리고 새 version을 발행한다.
4. Admin/Mobile은 직접 사용하는 계약 symbol 변경 여부와 무관하게 published latest stable version으로 dependency와 lockfile을 함께 갱신한다.
5. 각 소비자 표준 품질 게이트와 package version/lockfile 일치를 확인한 뒤 두 소비자 PR을 `main`에 병합한다.
6. breaking 또는 cutover 성격의 변경은 두 active consumer의 version 정렬을 포함해 API 계약 변경 모바일 릴리즈 플로우의 gate를 통과한 뒤 진행한다.

## 증빙/추적

- API PR: generated contract freshness 검증, pack 결과, 발행 대상 파일 목록
- Publish 기록: package name, version, registry URL 또는 package manager 출력, API ref
- Admin/Mobile PR: registry 설정, CI secret 이름/권한 범위, dependency diff, lockfile diff, public request/success DTO import 전환 diff, local wire DTO와 legacy generated copy 제거 diff, request boundary 검증
- Cutover PR: 비교한 API/Admin/Mobile ref, 릴리즈 기록 링크

## 체크리스트

- [ ] package 변경이 wire 응답 구조 변경과 섞이지 않았는가?
- [ ] package 이름이 `@coupler-developer/coupler-api-contracts` 하나로 유지되는가?
- [ ] API public request/success DTO가 Swagger/OpenAPI에서 한 번만 정의되고 package type으로 생성되는가?
- [ ] 신규 또는 직접 수정한 structured success `data`가 실제 wire shape와 같은 required/optional/nullable/배열 구조로 정의되고 generated contract freshness를 통과하는가?
- [ ] 소비자 request payload와 success data가 package generated DTO를 사용하며 동일 wire shape의 local DTO를 재정의하지 않는가?
- [ ] 기존 loose/local DTO를 이번 변경이 만들거나 확산하지 않았으며, 미수정 잔여분은 기존 기술 부채로 분리했는가?
- [ ] success DTO 적용을 `N/A`로 둔 opaque JSON passthrough는 소비자가 내부 필드를 읽지 않고 그대로 전달·보관한다는 코드 근거가 있는가?
- [ ] type-only request DTO 공유가 request runtime validator/serializer/dispatcher 공개로 확장되지 않았는가?
- [ ] public response/envelope 타입과 runtime guard가 generated error runtime의 strict `ErrorData`를 실패 계약으로 쓰는가?
- [ ] `response` public runtime이 `isApiEnvelope` 하나이고 소비자 facade가 `isEnvelope` 외의 파생 envelope guard를 추가하지 않았는가?
- [ ] 새 public entrypoint/runtime symbol이 폐쇄형 allowlist를 벗어나지 않으며, 확장 시 별도 계약 변경 근거와 승인이 있는가?
- [ ] `generated/apiContract.ts`의 느슨한 실패 helper 타입을 package public response 기준으로 노출하지 않는가?
- [ ] API repo에서 `pnpm`/`pnpm-lock.yaml` 기준을 지키고 `package-lock.json`을 만들지 않았는가?
- [ ] Admin/Mobile legacy generated copy를 재도입하지 않았는가?
- [ ] 소비자 전환은 GitHub Packages registry/auth 설정, 발행된 package version, lockfile을 기준으로 하는가?
- [ ] 소비자 CI package install은 GitHub Packages `Manage Actions access`의 consumer repo `Read` 권한, workflow `packages: read`, `NODE_AUTH_TOKEN: ${{ github.token }}` 기준으로 구성되어 있는가?
- [ ] 새 token secret 예외가 있다면 기존 권한 조사, 대체 불가 사유, 권한 범위, 만료/회수 계획, 명시 승인이 기록되어 있는가?
- [ ] 로컬 개발자 `yarn install`을 위한 GitHub Packages 인증 절차가 README 또는 개발자 문서에 기록되어 있는가?
- [ ] EC2 또는 배포 호스트에서 직접 `yarn install`/`yarn build`를 실행하는 경우, 설치를 실행하는 OS 사용자 기준 GitHub Packages 인증 절차가 배포 런북에 기록되어 있는가?
- [ ] repo `.npmrc`에는 registry scope만 있고 token 값이나 `${NODE_AUTH_TOKEN}` placeholder가 없는가?
- [ ] 소비자 코드가 package contract를 우회하는 local cast, alias fallback, normalize를 추가하지 않았는가?
- [ ] package dependency와 lockfile 전환 PR에서 legacy generated copy와 copy exact match CI를 제거했는가?
- [ ] 계약 산출물 변경마다 새 package version과 릴리즈 증빙이 남았는가?
- [ ] API `main`의 published latest stable version과 Admin/Mobile `package.json` 및 lockfile의 exact version이 모두 같은가?
- [ ] 직접 import하지 않는 계약 symbol을 이유로 active consumer의 version 갱신을 생략하지 않았는가?
- [ ] 소비자 version 지연 예외가 있다면 별도 호환 릴리즈의 owner, 사유, 목표 version, 제거 조건과 목표 시점이 기록되어 있고 cutover를 미완료로 유지했는가?

## 관련 문서

- [API 공통 응답 계약 정책](api-response-contract-policy.md)
- [API 에러 계약 정책](api-error-contract-policy.md)
- [배포/릴리즈 프로세스](release-process.md)
- [API 계약 변경 모바일 릴리즈 플로우](../flows/cross-project/api-contract-mobile-release-flow.md)
- [기술 부채 정리](../technical-debt/technical-debt.md)
