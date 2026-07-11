# API 클라이언트 계약 패키지 정책

## 문서 역할

- 역할: `규범`
- 문서 종류: `policy`
- 충돌 시 우선 문서: 계약 패키지의 목적, 발행, 소비, 수정 절차는 이 문서. JSON 응답 envelope은 `api-response-contract-policy.md`, 실패 `ErrorData`/taxonomy는 `api-error-contract-policy.md`, 운영 배포 순서는 `release-process.md`
- 기준 성격: `as-is`

## 목적

`@coupler-developer/coupler-api-contracts`는 `coupler-api`에서 생성한 API/Admin/Mobile 공통 계약의 version pinning 장치이자 공통 response/error runtime 배포 경계다. 응답 wire 구조를 바꾸지 않고, generated contract와 소비자 코드 사이의 drift를 package version, dependency diff, lockfile diff에서 드러나게 하며 Mobile/Admin은 같은 package runtime으로 envelope을 검증한다.

## 적용 범위

- `coupler-api`의 계약 package source, generated contract, pack/publish 설정
- `coupler-admin-web`와 `coupler-mobile-app`의 계약 dependency, import, lockfile
- GitHub Packages registry/auth 설정과 API 계약 변경 릴리즈 기록

제외 범위:

- JSON API 응답 envelope 자체의 wire 구조 변경
- request method/path/media type 검증 runtime과 request DTO
- operation별 success DTO schema 작성 기준
- 실패 `ErrorData` taxonomy 작성 기준

## 단일 SoT

- JSON API 성공/실패 envelope: [API 공통 응답 계약 정책](api-response-contract-policy.md)
- 실패 `ErrorData`와 error taxonomy: [API 에러 계약 정책](api-error-contract-policy.md)
- operation별 성공 `data` schema: Swagger/OpenAPI와 각 도메인 정책
- package publish와 운영 배포 순서: [배포/릴리즈 프로세스](release-process.md)의 `Contracts Package Release`
- API 계약 변경 cutover gate: [API 계약 변경 모바일 릴리즈 플로우](../flows/cross-project/api-contract-mobile-release-flow.md)
- package 전환 잔여 부채: [기술 부채 정리](../technical-debt/technical-debt.md)의 `API 응답 공통 계약 cutover 인덱스`

## 용어

- Canonical generated contract: `coupler-api/packages/contracts/src/generated/*`에서 generator가 만든 API contract artifact. Publish된 package의 source artifact다.
- Package source target: `coupler-api/packages/contracts`
- Published package: GitHub Packages에 발행하는 `@coupler-developer/coupler-api-contracts`
- Published latest stable version: API `main`의 canonical generated contract를 반영해 GitHub Packages에 가장 최근 발행한 prerelease가 아닌 version
- Active consumer: 계약 package를 dependency로 사용하는 `coupler-admin-web`와 `coupler-mobile-app`
- Legacy generated copy: Admin/Mobile의 `src/api/generated/*` 복사본

## 필수 규칙

- 계약 package는 배포 경로, version pinning 장치, 공통 response/error runtime의 단일 배포 경계이며, 응답 wire 구조 변경이나 success DTO 완성 증거로 해석하지 않는다.
- package infra PR은 wire 응답 구조를 바꾸지 않는다.
- 계약 package의 source of truth는 `coupler-api`다. Admin/Mobile은 package를 생성하지 않고 발행된 version을 lockfile로 고정한다.
- 모든 active consumer는 published latest stable version을 `package.json`과 lockfile에 exact version으로 고정한다. API `main`, Admin, Mobile의 version이 하나라도 다르면 계약 정렬과 cutover는 완료가 아니다.
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
- request transport는 package public runtime으로 승격하지 않는다. Canonical client request는 body 없는 `GET`/`DELETE`, JSON `POST`/`PUT`, upload `multipart/form-data`로 고정하고, Mobile/Admin request boundary와 API Swagger/parser가 같은 결론을 가리켜야 한다.
- API의 URL-encoded parser는 운영 legacy Mobile 차단 전까지만 허용하는 호환 입력 경로다. 제거 조건과 목표 시점은 [기술 부채 정리](../technical-debt/technical-debt.md)의 `API URL-encoded 호환 parser 제거 대기`에서 추적한다.
- 소비자 코드는 package contract 또는 명시 ViewModel mapping을 사용하고, API 응답 shape를 local cast, alias fallback, normalize로 보정하지 않는다.

## 운영 절차

### Package infra 추가

1. API repo에 package source, export, pack/publish 검증 경로를 추가한다.
2. Canonical generated contract는 package source target에 생성하고, Admin/Mobile generated copy를 만들지 않는다.
3. `pnpm pack:contracts`로 발행 산출물에 필요한 파일만 포함되는지 확인한다.
4. Package public entrypoint가 strict `ErrorData` 기반 response/envelope 타입과 runtime guard를 노출하는지 확인한다.
5. PR과 릴리즈 기록에 package infra가 wire 응답 변경, 소비자 전환 완료, success DTO 완료를 의미하지 않는다고 기록한다.

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
- Admin/Mobile PR: registry 설정, CI secret 이름/권한 범위, dependency diff, lockfile diff, import 전환 diff, legacy generated copy 제거 diff, request boundary 검증
- Cutover PR: 비교한 API/Admin/Mobile ref, 릴리즈 기록 링크

## 체크리스트

- [ ] package 변경이 wire 응답 구조 변경과 섞이지 않았는가?
- [ ] package 이름이 `@coupler-developer/coupler-api-contracts` 하나로 유지되는가?
- [ ] public response/envelope 타입과 runtime guard가 generated error runtime의 strict `ErrorData`를 실패 계약으로 쓰는가?
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
