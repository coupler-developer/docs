# API 클라이언트 계약 패키지 정책

## 문서 역할

- 역할: `규범`
- 문서 종류: `policy`
- 충돌 시 우선 문서: 계약 패키지의 목적, 발행, 소비, 수정 절차는 이 문서. JSON 응답 envelope은 `api-response-contract-policy.md`, 실패 `ErrorData`/taxonomy는 `api-error-contract-policy.md`, 운영 배포 순서는 `release-process.md`
- 기준 성격: `transition`
- 전환 완료 조건: `@coupler-developer/coupler-api-contracts` 첫 발행을 확인하고, Admin/Mobile이 lockfile에 고정된 package dependency로 계약을 소비하며, legacy generated copy 검증 제거 조건이 별도 PR에서 충족된 상태

## 목적

`@coupler-developer/coupler-api-contracts`는 `coupler-api`에서 생성한 API/Admin/Mobile 공통 계약의 version pinning 장치다. 응답 wire 구조를 바꾸지 않고, generated contract와 소비자 코드 사이의 drift를 package version, dependency diff, lockfile diff에서 드러나게 한다.

## 적용 범위

- `coupler-api`의 계약 package source, generated contract, pack/publish 설정
- `coupler-admin-web`와 `coupler-mobile-app`의 계약 dependency, import, lockfile
- GitHub Packages registry/auth 설정과 API 계약 변경 릴리즈 기록

제외 범위:

- JSON API 응답 envelope 자체의 wire 구조 변경
- operation별 success DTO schema 작성 기준
- 실패 `ErrorData` taxonomy 작성 기준
- 기존 Admin jQuery DataTables success protocol 동작 변경

## 단일 SoT

- JSON API 성공/실패 envelope: [API 공통 응답 계약 정책](api-response-contract-policy.md)
- 실패 `ErrorData`와 error taxonomy: [API 에러 계약 정책](api-error-contract-policy.md)
- operation별 성공 `data` schema: Swagger/OpenAPI와 각 도메인 정책
- package publish와 운영 배포 순서: [배포/릴리즈 프로세스](release-process.md)의 `Contracts Package Release`
- API 계약 변경 cutover gate: [API 계약 변경 모바일 릴리즈 플로우](../flows/cross-project/api-contract-mobile-release-flow.md)
- package 전환 잔여 부채: [기술 부채 정리](../technical-debt/technical-debt.md)의 `API 응답 공통 계약 cutover 인덱스`

## 용어

- Canonical generated contract: `coupler-api`에서 generator가 만든 API contract artifact. Package 전환 전에는 `coupler-api/contracts/generated/*`가 기존 소비자 copy의 비교 기준이다.
- Package source target: `coupler-api/packages/contracts`
- Published package: GitHub Packages에 발행하는 `@coupler-developer/coupler-api-contracts`
- Legacy generated copy: Admin/Mobile의 `src/api/generated/*` 복사본

## 필수 규칙

- 계약 package는 배포 경로와 version pinning 장치이며, 응답 envelope 변경이나 success DTO 완성 증거로 해석하지 않는다.
- package infra PR은 wire 응답 구조를 바꾸지 않는다.
- 계약 package의 source of truth는 `coupler-api`다. Admin/Mobile은 package를 생성하지 않고 발행된 version을 lockfile로 고정한다.
- package 이름은 `@coupler-developer/coupler-api-contracts`로 고정한다. 별도 import alias를 두지 않는다.
- API repo의 package 발행/검증 명령은 API repo의 `packageManager`와 lockfile 기준을 따른다. 현재 기준은 `pnpm`/`pnpm-lock.yaml`이다.
- GitHub Packages에 발행하더라도 API repo에 `npm install` 또는 `package-lock.json` 생성을 섞지 않는다.
- 실제 발행 전 소비자 전환 PR에는 `file:`, local tarball, git dependency 같은 임시 dependency를 커밋하지 않는다.
- `@coupler-developer/coupler-api-contracts` 첫 발행 전에는 Admin/Mobile legacy generated copy와 copy exact match 검증을 유지한다.
- Admin/Mobile이 package dependency로 전환된 뒤에도 legacy generated copy 검증 제거는 별도 PR에서 수행한다.
- 발행된 package version은 재사용하지 않는다. 계약 산출물이 바뀌면 새 version을 발행하고 소비자 lockfile에 반영한다.
- package의 public response/envelope 타입은 generated error runtime의 strict `ErrorData`를 실패 기본 타입으로 사용한다.
- `generated/apiContract.ts`는 Swagger success operation map 산출물이며, 그 안의 느슨한 실패 helper 타입을 package public response 기준으로 삼지 않는다.
- 소비자 코드는 package contract 또는 명시 ViewModel mapping을 사용하고, API 응답 shape를 local cast, alias fallback, normalize로 보정하지 않는다.

## 운영 절차

### Package infra 추가

1. API repo에 package source, export, pack/publish 검증 경로를 추가한다.
2. Canonical generated contract와 기존 Admin/Mobile generated copy 검증은 유지한다.
3. `pnpm pack:contracts`로 발행 산출물에 필요한 파일만 포함되는지 확인한다.
4. Package public entrypoint가 strict `ErrorData` 기반 response/envelope 타입을 노출하는지 확인한다.
5. PR과 릴리즈 기록에 package infra가 wire 응답 변경, 소비자 전환 완료, success DTO 완료를 의미하지 않는다고 기록한다.

### 첫 발행

1. API repo에서 generated contract freshness 검증을 통과시킨다.
2. API repo의 package manager 기준으로 `@coupler-developer/coupler-api-contracts`를 발행한다.
3. 발행 version, registry package, 비교한 API ref, pack/publish 검증 결과를 릴리즈 기록에 남긴다.
4. 발행 실패 시 소비자 전환 PR을 진행하지 않는다.

### Admin/Mobile 소비 전환

1. 소비자 레포에 GitHub Packages registry 설정을 추가한다.
2. CI 설치가 필요하면 `npm.pkg.github.com` 읽기 권한이 있는 secret을 연결하고, secret 이름과 권한 범위를 PR/릴리즈 기록에 남긴다.
3. 발행된 `@coupler-developer/coupler-api-contracts` version을 consumer package manager로 lockfile에 고정한다.
4. `src/api/generated/*` import를 package import로 교체한다.
5. request boundary가 기존과 같은 `{ ok: true, data }` / `{ ok: false, error }` 분기 기준을 유지하는지 검증한다.
6. consumer 전환 완료 전까지 legacy generated copy 검증 제거를 같은 PR에 섞지 않는다.

### 계약 수정과 version bump

1. Swagger/OpenAPI, error catalog, 도메인 정책 중 해당 SoT를 먼저 수정한다.
2. API repo에서 generated contract를 재생성하고 freshness 검증을 통과시킨다.
3. 계약 산출물이 바뀌면 package version을 올리고 새 version을 발행한다.
4. Admin/Mobile 소비면은 발행된 version으로 dependency와 lockfile을 갱신한다.
5. breaking 또는 cutover 성격의 변경은 API 계약 변경 모바일 릴리즈 플로우의 gate를 통과한 뒤 진행한다.

## 증빙/추적

- API PR: generated contract freshness 검증, pack 결과, 발행 대상 파일 목록
- Publish 기록: package name, version, registry URL 또는 package manager 출력, API ref
- Admin/Mobile PR: registry 설정, CI secret 이름/권한 범위, dependency diff, lockfile diff, import 전환 diff, request boundary 검증
- Cutover PR: legacy generated copy 검증 제거 조건, 비교한 API/Admin/Mobile ref, 릴리즈 기록 링크

## 체크리스트

- [ ] package 변경이 wire 응답 구조 변경과 섞이지 않았는가?
- [ ] package 이름이 `@coupler-developer/coupler-api-contracts` 하나로 유지되는가?
- [ ] public response/envelope 타입이 generated error runtime의 strict `ErrorData`를 실패 기본 타입으로 쓰는가?
- [ ] `generated/apiContract.ts`의 느슨한 실패 helper 타입을 package public response 기준으로 노출하지 않는가?
- [ ] API repo에서 `pnpm`/`pnpm-lock.yaml` 기준을 지키고 `package-lock.json`을 만들지 않았는가?
- [ ] 첫 발행 전 legacy generated copy 검증을 유지했는가?
- [ ] 소비자 전환은 GitHub Packages registry/auth 설정, 발행된 package version, lockfile을 기준으로 하는가?
- [ ] 소비자 코드가 package contract를 우회하는 local cast, alias fallback, normalize를 추가하지 않았는가?
- [ ] legacy generated copy 검증 제거가 별도 PR/조건으로 분리되어 있는가?
- [ ] 계약 산출물 변경마다 새 package version과 릴리즈 증빙이 남았는가?

## 관련 문서

- [API 공통 응답 계약 정책](api-response-contract-policy.md)
- [API 에러 계약 정책](api-error-contract-policy.md)
- [배포/릴리즈 프로세스](release-process.md)
- [API 계약 변경 모바일 릴리즈 플로우](../flows/cross-project/api-contract-mobile-release-flow.md)
- [기술 부채 정리](../technical-debt/technical-debt.md)
