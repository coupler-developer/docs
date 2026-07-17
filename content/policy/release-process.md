# 배포/릴리즈 프로세스

## 문서 역할

- 역할: `규범`
- 문서 종류: `policy`
- 충돌 시 우선 문서: 이 문서. 단, 태그 이름/시점/증빙 기준은 [배포 태그 정책](release-tag-policy.md)
- 기준 성격: `as-is`

## 목적

- 운영 배포 순서와 릴리즈 기록 절차를 고정한다.
- 태그 이름/시점/증빙 기준은 [배포 태그 정책](release-tag-policy.md)에 위임하고, 이 문서는 태그 전후의 실행 순서를 정의한다.
- `docs` GitHub Release와 릴리즈 기록 문서로 변경점/주의사항을 한 곳에 모은다.

> 참고: `docs/site/`는 `mkdocs build`가 생성하는 정적 사이트 빌드 산출물이다. 커밋 대상이 아니라 `.gitignore`로 제외한다.

## 적용 범위

- `coupler-api`
- `coupler-admin-web`
- `coupler-mobile-app`
- `docs`

> 이 워크스페이스는 레포가 여러 개라서, **태그는 레포별로 따로** 만든다.

## 용어 정리

- 개발계(EC2): 서버에 접속해서 배포/검증하는 개발 환경
- 운영(Production): 실사용자 대상 환경
- NextPush `Production`: 현재 사용하는 모바일 OTA 배포 label

## 현재 배포 대상(정리)

- 개발계(EC2) 배포 대상: `coupler-api`, `coupler-admin-web`
- 모바일 배포 대상: `coupler-mobile-app` (EC2 배포 없음, 스토어/OTA로 배포)
- 문서 배포 대상: `docs` (GitHub Pages + docs GitHub Release)

## 환경별 배포 주의사항

- 개발계 배포는 운영 배포 전 검증 목적이며, 운영 반영/검증 완료 증빙이나 서비스 릴리즈 태그 생성 근거로 사용하지 않는다.
- 운영계 배포는 실사용자 대상 반영이다. 배포 전 `main` 기준 커밋 확정, `No Findings`, 표준 품질 게이트, 롤백 기준, post-deploy 검증 시나리오를 먼저 고정한다.
- 개발계와 운영계는 `EC2` host, 도메인, API base URL, DB/RDS, 환경변수, package registry auth를 각각 확인한다. 한 환경의 성공을 다른 환경의 인증/설정 성공으로 간주하지 않는다.
- `coupler-admin-web` 정적 빌드는 `yarn build` 시점의 환경변수가 번들에 고정된다. CRA build는 `.env.development`를 사용하지 않으므로, 개발계/운영계 각각 빌드 산출물이 어느 API base URL을 바라보는지 배포 전에 확인한다.
- EC2 또는 배포 호스트에서 직접 `yarn install`/`yarn build`를 실행하면 해당 OS 사용자의 GitHub Packages user-level auth가 필요하다. GitHub Packages `Manage Actions access`는 GitHub Actions에만 적용되며 SSH shell에는 적용되지 않는다.
- 운영 DB write, 운영 API restart, 운영 Admin artifact 교체, NextPush `Production` label 배포는 모두 사용자 영향 작업이다. 개발계 확인 목적으로 운영 대상 명령을 실행하지 않는다.
- 개발계 배포 후에는 개발계 host/domain/API/DB 기준으로만 검증 결과를 기록한다. 운영계 배포 후에는 운영 host/domain/API/DB 기준으로 별도 검증 결과를 기록한다.

## 배포 범위 선택 원칙

- 운영 배포는 항상 모든 구성요소를 포함하지 않는다.
- 배포 시작 시 포함 범위를 먼저 고정한다: `DB migration`, `contracts package`, `coupler-api`, `coupler-admin-web`, `Mobile Store`, `Mobile NextPush`, `docs`, `Tag/Release Record`.
- 선택되지 않은 범위는 `N/A` 사유와 근거를 릴리즈 기록에 남긴다.
- DB 변경이 포함되면 [DB Migration Gate 정책](db-migration-gate-policy.md)을 해당 범위의 단일 기준으로 따른다.
- `coupler-admin-web`가 포함되면 [Admin 운영 배포 런북](../flows/cross-project/admin-web-production-deploy-flow.md)을 상세 실행 기준으로 따른다.
- 릴리즈 자동화 gate 순서는 [릴리즈 자동화 파이프라인](../flows/cross-project/release-automation-pipeline.md)을 따르되, 충돌 시 이 문서와 각 policy를 우선한다.
- 명령어가 필요한 배포 작업은 [운영 배포 명령어 런북](../flows/cross-project/production-deploy-command-runbook.md)을 사용하되, 충돌 시 이 문서와 각 policy를 우선한다.
- 배포 태그, 스토어 제출 마커 태그, 태그 증빙 기준은 [배포 태그 정책](release-tag-policy.md)을 단일 기준으로 따른다.
- Mobile Store와 Mobile NextPush는 별도 배포 범위다. NextPush-only 배포는 기존 스토어 binary를 대상으로 하는 OTA이므로 native version, store upload, 모바일 git tag를 자동으로 변경하지 않는다.
- Mobile Store 제출은 운영 출시와 별도 상태다. 릴리즈 기록에서 Mobile Store 승인/운영 출시를 통합 릴리즈 완료 조건으로 잡은 경우, 해당 gate에 묶인 `vX.Y.Z` 릴리즈 태그는 완료 전 생성하지 않는다.
- Mobile Store gate와 독립적으로 완료되는 범위는 운영 반영/검증 완료 후 [배포 태그 정책](release-tag-policy.md)에 따라 별도 태그를 생성할 수 있다.
- API 명세 변경이 포함된 Mobile Store 또는 Mobile NextPush 배포는 [API 계약 변경 모바일 릴리즈 플로우](../flows/cross-project/api-contract-mobile-release-flow.md)를 함께 따른다. 기존 운영 앱을 깨는 cutover는 다음 버전 배포 전 호환 배포에 포함하지 않는다.

## Contracts Package Release

대상: `coupler-api/packages/contracts`

- 계약 package의 목적, package manager 기준, registry/auth 설정, 소비자 전환 조건, version bump 기준은 [API 클라이언트 계약 패키지 정책](api-client-contract-package-policy.md)을 따른다.
- API 공통 응답/에러 계약 또는 Swagger public request/success contract 변경이 있으면 `contracts package` 범위를 포함한다.
- 계약 package의 source of truth는 `coupler-api`다. Admin/Mobile은 package를 생성하지 않고 publish된 package version을 lockfile로 고정한다.
- GitHub Packages publish name과 Admin/Mobile 코드 import name은 `@coupler-developer/coupler-api-contracts`다.
- package source는 `coupler-api/packages/contracts/src/generated/`에서 생성하고, Admin/Mobile은 publish된 package dependency와 lockfile로만 소비한다.
- API main에 계약 package 변경이 merge되면 `Release Contracts` workflow가 `pnpm check:contracts`, `pnpm pack:contracts`를 실행한 뒤 아직 publish되지 않은 package version만 publish한다.
- 같은 version이 이미 publish된 경우 workflow는 재시도/문서 수정 상황으로 보고 publish를 skip한다. 계약 내용이 바뀌면 package version을 새로 올려야 한다.
- API 운영 배포에 계약 변경이 포함되면 `Release Contracts` workflow 성공과 publish된 package version을 릴리즈 기록에 먼저 남긴 뒤 API/Admin/Mobile 배포를 진행한다.
- Admin/Mobile package 반영은 publish 이후 `@coupler-developer/coupler-api-contracts` dependency와 lockfile을 같은 version으로 갱신하고 각 레포 표준 품질 게이트를 통과시킨다.
- API/Admin/Mobile의 merge 전 교차 컴파일은 `Release Contracts Preview`가 발행한
  `x.y.z-pr.<api-pr>.<run-id>.<attempt>` prerelease로 검증할 수 있다. Preview는 open Draft API PR의
  번호를 `main` ref의 수동 workflow에 입력해 정확한 head에서 발행하고 `latest`를 변경하지 않는다.
- Admin/Mobile Draft PR만 preview exact pin을 허용한다. Preview 검증은 릴리즈 또는 cutover 증빙이 아니며,
  Ready 전 stable exact version과 lockfile로 교체해 전체 품질 게이트를 다시 통과시킨다.
- Stable `Release Contracts`는 수동 dispatch 없이 `main` push에서만 실행하고, preview/stable 모두 기존
  GitHub Actions `github.token` 권한을 사용한다.

## 릴리즈 운영 모델

- 문서 레포(`docs`) 단독으로 GitHub Release를 운영한다.
- `docs` `main` push는 문서 사이트 배포(MkDocs Pages), `v*.*.*` 태그 push는 Docs GitHub Release 생성으로 사용한다.
- `coupler-api`, `coupler-admin-web`, `coupler-mobile-app` 태그 push는 GitHub Release 또는 zip artifact를 자동 생성하지 않는다.
- `docs` 버전은 릴리스 기록 번호로 사용하고, 서비스 레포의 실제 배포 버전은 `버전 매핑`으로 별도 고정한다.
- 이미 `released` 또는 `superseded` 상태로 배포된 릴리스 실행 기록은 새 형식 적용만을 목적으로 사후 구조 변경하지 않는다.
- `버전 매핑` 섹션은 이 기준 이후 작성하는 신규 릴리스 기록부터 필수로 둔다.
- `버전 매핑`에는 아래 기준점을 함께 기록한다.
    - `docs` 기록 버전/태그
    - `coupler-mobile-app` Store version/build, 릴리스 태그/커밋, 제출 마커 태그, NextPush label과 대상 Store binary
    - `coupler-api` 태그/커밋 또는 `N/A` 사유
    - `coupler-admin-web` 태그/커밋 또는 `N/A` 사유
- 신규 릴리스 기록의 작성 계약은 `release-metadata` block 하나다. 자동화의 기계 판정 SoT는 여기서 한 번 계산한 derived model이며, `버전 매핑`과 Gate 섹션은 사람이 읽는 mirror다. 자동화가 본문 자유 문장을 포함 신호로 해석하지 않게 작성한다.
- `release-metadata.schema`는 병합된 최신 계약과 일치해야 하며 현재 작성 계약은 `release-metadata/v1`이다. 아직 `main`에 합쳐지지 않은 로컬/작업 브랜치 변경만으로 새 버전을 선언하지 않는다.
- `release-metadata`의 모든 하위 object는 작성 계약에 정의된 key만 허용한다. 새 nested key가 필요하면 descriptor 또는 cutover required path에 연결하고 unknown key fail-closed 테스트를 함께 갱신한다.
- `release-metadata.releaseScopes`는 실제 릴리즈 surface의 단일 SoT이며 항상 `docs`를 포함한다.
- repo 검증 범위는 사람이 별도 입력으로 정하지 않고 `releaseScopes` descriptor에서 파생한다.
- `release-metadata.scopeResults`는 scope별 결과 상태와 증적의 단일 SoT다. key는 `releaseScopes`와 정확히 일치해야 하며, 각 scope의 `status`와 `evidence`만 보고 완료/rollback/대체 여부를 판단한다.
- 문서 전체 `release-metadata.status`는 `scopeResults`에서 파생한 상태와 일치해야 한다. 선행 완료 scope가 `released`이고 나머지가 `pending`이면 전체 상태는 `pending`, 장기 실행에서 일부 scope가 진행 중이면 `in_progress`, 완료된 scope와 후속 릴리스로 대체된 scope만 남으면 `superseded`다.
- `docs` scope의 `released` 판정은 최종 릴리즈 기록이 병합 가능한 상태로 확정되고 `versionMapping.docs.tag`에 병합 후 생성할 docs tag가 고정됐다는 뜻이다. 실제 origin tag, GitHub Release, `docs-site-vX.Y.Z.tar.gz` artifact는 final PR merge 뒤 확인하는 운영 postcheck이며, tag push 전 `scopeResults.docs.evidence` hard gate로 요구하지 않는다.
- `release-tag`는 metadata scope로 쓰지 않는다. 서비스 태그 요구는 `released`가 된 `docs`, `coupler-api`, `coupler-admin-web`, `mobile-store` scope에서 파생하며, `mobile-nextpush`는 NextPush-only 정책에 따라 기본적으로 모바일 git tag를 요구하지 않는다.
- `superseded` scope는 완료 증적을 억지로 채우지 않는다. 대신 `supersededBy`, `incompleteReason`, `tagStatus`를 구조화해 어떤 후속 릴리스가 어떤 미완료 범위를 대체했고 태그를 만들지 않았는지 기록한다.
- `db-migration`을 `released`로 닫을 때는 `scopeResults.db-migration.evidence.sqlRefs`, `gateResults`, `preflightLog`, `ledger.dev`, `ledger.prod`, `postcheckLog`, `rollbackPlan`을 구조화해 채운다. SQL은 `coupler-api` PR에 포함된 repo-relative `.sql` 파일 경로와 SHA-256 checksum으로 참조해야 하며, 콘솔 수동 실행문이나 채팅에 붙인 SQL만으로는 완료 증빙이 아니다.
- `releaseScopes`에 포함된 `released` 또는 `rolled_back` scope의 증적은 실제 증빙이어야 하며 `N/A - <사유>`는 제외 범위 또는 완료 판정에 직접 쓰이지 않는 미적용 사유로만 사용한다.
- 릴리즈 surface, required repo, scope별 결과 상태, terminal evidence 완료 조건을 판단하는 새 최상위 SoT를 추가하지 않는다. 같은 질문을 두 필드가 독립적으로 답할 수 있으면 drift, 예외 backfill, validator별 상수 복제가 생기므로 `releaseScopes` descriptor 또는 `scopeResults.<scope>` 아래 속성으로 흡수한다.
- SoT 분리가 불가피하다고 판단하면 기존 derived model로 표현할 수 없는 이유, 신구 필드 우선순위, drift 검출 방식, 마이그레이션/삭제 계획, 회귀 테스트를 릴리즈 자동화 변경과 함께 기록한다.
- 추가 스냅샷 또는 비교 기준으로만 고정할 repo가 있으면 `release-metadata.extraRepoRefs`에 canonical repo name을 적는다. `extraRepoRefs`는 release 완료 조건을 새로 만들지 않는다.
- API contract cutover 포함 여부는 `release-metadata.apiContractCutover`가 `null`인지 object인지로만 판정한다. API 계약 변경이 없으면 `apiContractCutover: null`로 두고 `API contract cutover Gate` 섹션을 만들지 않으며, `검증 근거`에 `N/A - <사유>`만 남긴다. API 계약 변경이 있으면 `content/templates/api-contract-cutover-gate-template.md`를 삽입하고, Cutover Gate의 published package 줄은 `scopeResults.contracts-package.evidence.publishedPackage`를 mirror한다.
- `versionMapping.coupler-mobile-app.nextPush`는 NextPush app/deployment/label을 문자열로 적거나 미적용 시 `null`로 둔다. `released`, `rolled_back`, `superseded` 상태에서는 `pending`, `미생성`, `대기` 같은 placeholder를 남기지 않는다.
- 릴리즈 자동화 hard gate는 terminal 상태의 거짓 완료를 막는 조건에만 추가한다. `planned`/`pending`/`in_progress`의 준비 중 placeholder, `releaseScopes`에서 제외한 범위, 사람이 읽는 참고 증빙의 세부 형식은 hard gate로 막지 않는다.
- 태그 push, GitHub Release 생성, Store 심사/승인처럼 운영 액션 이후에만 생기는 산출물을 해당 액션의 사전 hard gate로 요구하지 않는다. 사전 조건은 preview/품질 검증/기준점 고정으로 막고, 사후 조건은 postcheck와 필요 시 corrective reissue로 막는다.
- 새 hard gate를 추가하려면 `releaseScopeDescriptors` 또는 기존 descriptor에만 연결하고, 누락 실패 테스트, 정상 통과 테스트, 제외 scope 미차단 테스트, policy/flow/template 동기화를 같은 변경에 포함한다.
- 즉, 문서 릴리즈는 "문서만의 버전"이 아니라 "해당 시점 서비스 구성 버전"의 인덱스 역할을 하며, 서비스 레포가 항상 같은 버전 번호를 가져야 한다는 뜻은 아니다.
- 배포 실행 전 local preflight는 `releaseScopes`와 `extraRepoRefs`에서 derived `preflightRepoNames`와 `requiresServiceWorkspace`를 계산한다. 표준 단일 PR 흐름은 `--pending-ref <40자 SHA>`로 원격에 push된 docs PR head를 읽고, docs clean non-main branch의 `HEAD == origin upstream == pending-ref`, 최신 `origin/main` 포함, metadata `pending`, 서비스 레포 clean `main == origin/main`, 버전 매핑 기준점, DB migration SQL/checksum을 확인한다. `--pending-ref`가 없는 기존 흐름은 모든 포함 레포의 clean `main == origin/main`을 계속 요구한다.
- 장기·메이저 릴리즈도 열린 docs PR과 릴리즈 기록을 공유 제어판으로 사용한다. 선택적인 `planned` 커밋을 포함해 모든 상태 변경은 같은 PR에 누적하고, 최종 `released` 검증 전에는 PR을 병합하거나 docs 태그를 만들지 않는다.

## 태그 규칙

- 태그 이름, 생성 시점, 제출 마커 태그, 증빙 기준은 [배포 태그 정책](release-tag-policy.md)을 따른다.
- 이 문서는 태그 생성 전후의 배포 순서, 릴리즈 기록 작성, docs GitHub Release 절차만 정의한다.
- 일부 범위만 완료된 릴리스의 `docs/content/releases/vX.Y.Z.md`는 전체 릴리스 상태를 `released`로 닫지 않고, 완료/대기 범위를 구분해 기록한다.

## 릴리즈 기록 상태값

- `planned`: 배포 계획 또는 초안이 작성됐지만 운영 반영이 완료되지 않은 상태
- `pending`: 배포 범위와 기준 SHA가 고정되고 원격 PR head 및 경량 CI를 확인해 운영 반영을 기다리는 상태
- `in_progress`: 일부 범위는 완료됐고 하나 이상의 배포/검증 범위가 아직 대기 중인 상태
- `released`: 포함 범위의 운영 반영/검증/서비스 태그/기록이 완료됐고, final PR merge 뒤 만들 docs 태그가 고정된 상태
- `rolled_back`: 운영 반영 후 문제로 해당 릴리즈 기준점에서 되돌린 상태
- `superseded`: 일부 대기 범위를 완료하지 않은 채 후속 릴리즈가 동일 또는 상위 범위를 대체해, 더 이상 해당 릴리즈를 완료 대상으로 추적하지 않는 상태
- `superseded`로 닫을 때는 대체한 후속 릴리즈, 완료하지 않은 범위, 태그 생성 여부, 후속 추적 불필요 사유를 릴리즈 기록에 남긴다.
- `released`, `rolled_back`, `superseded`로 닫힌 기록을 `planned`, `pending`, `in_progress`로 되돌리지 않는다. 사실 정정은 terminal 상태를 유지하고, 후속 배포는 새 버전의 릴리즈 기록으로 시작한다.

## 운영 상태 전이 기준

- 일반적인 연속 운영 배포는 하나의 docs PR에서 `pending` 커밋과 `released` 커밋만 사용하고 마지막에 한 번 병합한다. `planned`는 범위나 기준 SHA가 아직 고정되지 않은 초안을 공유할 때만 선택적으로 사용한다.
- `pending`은 배포 scope, 서비스 commit SHA, Store version/build, API contract comparison ref, 검증 시나리오, rollback 기준이 고정되어 운영 배포를 시작할 수 있는 상태다. `pending` 이후 이 고정 기준이 바뀌면 같은 실행으로 계속하지 않고 새 `pending` 기준점부터 다시 검증한다.
- `in_progress`는 일부 범위가 이미 끝났지만 외부 승인이나 후속 범위가 남아 단일 실행에서 바로 `released`로 전환할 수 없는 장기 릴리스에 사용한다.
- Store 심사처럼 외부 대기가 있는 범위는 제출 마커 태그와 대기 범위를 남기고 `in_progress`로 유지한다.
- Store 승인, 운영 출시, 기본 smoke, 모바일 릴리즈 태그, 제출 마커 증빙 이관/삭제가 끝나기 전에는 Mobile Store 범위를 `released`로 닫지 않는다.
- 후속 릴리스가 대기 중인 Store 또는 cutover 범위를 대체하면 억지 완료 증빙을 만들지 않고 `superseded`로 닫는다.
- `docs` GitHub Release와 site artifact는 docs tag push 이후 생성되므로, 매 릴리즈마다 artifact URL을 릴리즈 기록에 되채우기 위해 재발행하지 않는다. Release workflow 실패, Release 본문 누락, artifact 누락, 사실 오류 정정이 있을 때만 `docs-only corrective reissue`를 사용한다.

### 표준 단일 PR 상태 전이

1. 대상 코드 PR과 품질 게이트를 먼저 끝내고 서비스 `origin/main` SHA를 고정한다.
2. 하나의 docs 작업 브랜치에서 릴리즈 기록을 `pending`으로 작성해 첫 커밋을 push하고 Draft PR을 연다. 이 커밋은 배포 전 scope, SHA, 검증, rollback 계약이며 Draft 상태로 배포 중 오병합을 막는다.
3. pending-only PR 경량 CI와 `yarn release:preflight --pending-ref <pending commit SHA>`를 통과한 뒤 PR은 병합하지 않은 채 운영 배포를 실행한다.
4. 운영 smoke와 서비스 태그를 완료한 뒤 같은 PR에 실제 증빙을 채우고 `released` 두 번째 커밋을 push한다.
5. PR transition gate는 `pending -> released` 사이 `releaseScopes`, `extraRepoRefs`, 서비스 commit SHA, Mobile Store version/build, API contract comparison ref 변경을 차단한다.
6. 최종 전체 docs CI와 리뷰가 통과하면 PR을 Ready로 전환해 한 번만 `Rebase and merge`하고, 병합된 main 커밋에 docs annotated tag를 생성한다.
7. docs tag 기반 Release workflow와 artifact는 postcheck로 확인한다.

`planned` 커밋은 범위/기준점이 아직 고정되지 않은 초안 공유, 여러 작업자 교대, 장기 Store 심사 또는 DB 단계처럼 배포 제어판을 미리 공유해야 할 때만 같은 Draft PR에 선택적으로 추가한다. `planned`는 배포 시작 허가가 아니며 `--pending-ref` preflight 대상이 될 수 없다.

## 버전 올리는 기준 (SemVer)

- `MAJOR`: 호환 깨짐(Breaking change)
- `MINOR`: 기능 추가(하위 호환 유지)
- `PATCH`: 버그 수정/핫픽스(하위 호환 유지)

## 통합 메이저 릴리즈 장기 실행 순서 (선택)

대상: `coupler-api`, `coupler-admin-web`, `coupler-mobile-app`, `docs`, 운영 `RDS`

### 0) 같은 PR에 선택적 planned 기록

- 여러 작업자 교대, 장기 Store 심사, 운영 RDS 단계처럼 범위 확정 전 공유 제어판이 필요한 경우에만 `docs/content/releases/vX.Y.Z.md`의 `planned` 커밋을 작업 브랜치에 push하고 Draft PR을 연다.
- `planned` PR은 병합하거나 docs 태그를 만들지 않는다. 범위와 기준점이 확정되면 같은 PR에 `pending` 커밋을 추가한다.
- 한 작업 흐름에서 연속 실행하는 일반 릴리즈는 `planned`를 생략하고 `pending`부터 시작한다.
- 문서에는 아래를 최소 포함한다.
    - 릴리즈 목표/범위
    - `RDS -> API/Admin EC2 -> Mobile -> RDS contract` 순서
    - 적용 대상 SQL/Gate
    - 서비스 레포 목표 태그 또는 목표 commit SHA
    - 검증 시나리오와 롤백 기준

### 1) pending 기준점 고정

- 배포 scope, 서비스 SHA, Store version/build, 계약 비교 ref, 검증과 rollback 기준을 확정한 `pending` 커밋을 같은 PR에 push한다.
- pending-only 경량 CI와 `--pending-ref` preflight가 통과한 커밋만 배포 기준점으로 사용한다.
- 열린 PR과 릴리즈 기록이 장기 실행의 공유 제어판이다. 최종 `released` 전에는 docs 태그와 GitHub Release를 만들지 않는다.
- 일부 범위가 끝난 뒤 외부 승인이 남으면 같은 PR에서 `in_progress`로 기록하고 대기 범위를 명시한다.

### 2) 운영 RDS 선반영

- 운영 `RDS` 반영은 워크스페이스 루트 `ritzy운영-coupler운영_마이그레이션_가이드/25_EXECUTION_PROCEDURE.md`와 [DB Migration Gate 정책](db-migration-gate-policy.md)을 단일 기준으로 따른다.
- 운영 절차 순서는 [DB Migration Gate 정책](db-migration-gate-policy.md)의 실행 검증 파이프라인을 따른다.
- live DB에서는 `00_EXECUTION_ORDER.txt`의 주석 조건을 그대로 따른다.
- 특히 `44_drop_manager_detail_profile_master_columns_after_cutover.sql`, `45_drop_manager_detail_profile_preview_column_after_cutover.sql`는 서비스 cutover와 legacy read/write 0건 확인 전에는 실행 금지다.

### 3) API/Admin EC2 배포

- `coupler-api`, `coupler-admin-web`는 운영 `EC2`에 반영한다.
- 배포 전 [테스트/CI 전략](testing-strategy.md)의 공통 품질 게이트를 완료한다.
- API는 운영 반영 후 루트 응답, 핵심 app/admin API, 에러 로그를 확인한다.
- Admin은 운영 URL 로그인, 핵심 운영 화면 진입, 주요 액션 1회를 확인한다.

### 4) Mobile 배포

- `coupler-mobile-app`은 스토어 binary 배포와 OTA 배포를 분리한다.
- native 변경이 포함된 메이저 릴리즈는 스토어 binary(iOS/Android)를 먼저 배포한다.
- OTA는 스토어 배포 이후 JS-only 후속 수정에만 사용한다.
- 버전값은 Android `versionCode`/`versionName`, iOS `CURRENT_PROJECT_VERSION`/`MARKETING_VERSION`를 함께 올린다.

### 5) 운영 안정화 확인 후 RDS contract/drop

- `DBM-GATE-400`이 적용되는 SQL은 아래를 모두 충족할 때만 실행한다.
    - API/Admin/Mobile 신계약 버전 운영 반영 완료
    - legacy read/write 0건 로그 확보
    - 운영 postcheck guard 통과
- 위 조건 미충족이면 contract/drop은 이번 릴리즈에서 제외하고 릴리즈 상태를 `완료`로 닫지 않는다.

### 6) 서비스 레포 태그 생성

- `coupler-api`, `coupler-admin-web`, `coupler-mobile-app`는 실제 운영 배포와 검증이 완료된 커밋에 태그를 생성한다.
- 서비스 레포 태그는 예외 없이 post-deploy 원칙을 따르며, docs 태그는 final PR merge 뒤 별도로 생성한다.

### 7) 같은 PR 최종화와 docs Release 생성

- 같은 PR의 릴리즈 기록에 아래를 최종 반영하고 `released` 커밋을 push한다.
    - 실제 반영 완료 시각
    - `coupler-api`, `coupler-admin-web`, `coupler-mobile-app` 최종 태그/SHA
    - 운영 `RDS` 적용 SQL/Gate/로그 경로
    - 검증 결과와 롤백 기준
- 일부 범위가 대기 상태면 PR을 `in_progress`로 유지하고 완료 범위와 대기 범위를 함께 표시한다.
- 모든 범위가 끝난 `released` 커밋의 전체 CI와 리뷰가 통과하면 PR을 Ready로 전환해 한 번만 병합한다.
- 병합된 main 커밋에 docs 태그를 만들고 GitHub Release와 artifact를 postcheck한다.

## EC2 배포 (API/Admin)

대상: `coupler-api`, `coupler-admin-web`

> 참고: 현재 서비스 레포들의 GitHub Actions는 `pull_request`와 `workflow_dispatch`에서만 돌고, `tag push`로 자동 배포나 GitHub Release 생성이 트리거되지 않는다.
> 따라서 서비스 레포 태그는 “자동 배포 버튼”이 아니라 **배포 기록(감사 로그)과 롤백 기준점**을 만드는 목적이다.

### 1) 배포 커밋 확정 (main 고정)

```bash
git checkout main
git pull --ff-only
git status
```

- `git status`가 깨끗한지 확인한다.
- 배포 대상 PR이 모두 `main`에 병합됐는지 확인한다.

### 2) EC2 배포 수행

- 배포 전 기술 판정은 [엔지니어링 가드레일](engineering-guardrails.md)의 `No Findings 게이트`를 단일 기준으로 따른다.
- 리뷰 대상 범위에서 finding이 1건이라도 있으면 배포를 진행하지 않고, `원인 분석 -> 수정 -> 테스트/CI 전략의 공통 품질 게이트 및 필수 정책 검사 재검증 -> 재리뷰`를 `No Findings`까지 반복한다.
- 레포/플랫폼별 배포 가이드를 따른다.
- 개발계와 운영계의 EC2, API URL, DB/RDS, npm user-level auth는 분리해서 확인한다. 개발계에서 `yarn install`이 성공해도 운영계 OS 사용자 인증이 검증된 것이 아니다.
- `coupler-api`와 `coupler-admin-web`의 운영 반영 방식은 다르다.
    - `coupler-api`: 프로세스 앱으로 배포하고 `pm2`로 관리한다.
    - `coupler-admin-web`: `yarn build` 결과물(`build/`)만 EC2에 업로드하고 `nginx`가 정적 서빙한다.
- `coupler-admin-web` 운영 배포 시 `react-scripts start`, `pm2 start ./node_modules/react-scripts/scripts/start.js`, CRA 개발 서버 기반 서빙을 금지한다.
- `coupler-admin-web`의 서버 준비, artifact 업로드, `nginx` 설정, `pm2 save`, 검증, 롤백 절차는 [Admin 운영 배포 런북](../flows/cross-project/admin-web-production-deploy-flow.md)을 단일 실행 기준으로 따른다.

- 배포 후 아래를 확인한다.
    - API: 루트 응답(예: `GET /` 200), 배포 범위 관련 핵심 API 1개 이상, 에러 로그 확인(최소 10-30분)
    - Admin: 로그인, 핵심 화면 1-2개(예: 심사/회원관리) 진입 및 주요 액션 1회 확인
    - Admin: 브라우저 콘솔에 CRA 개발 서버 WebSocket(`:8000/ws`) 재연결 오류가 없는지 확인

### 3) 태그 생성 및 push (배포 완료 후)

- 반드시 `main` 브랜치(배포 검증 완료 커밋)에서 태그를 생성한다.

```bash
# 예: v1.2.1 릴리즈
TAG=v1.2.1
git tag -a "${TAG}" -m "Release ${TAG}"

# 태그 커밋이 origin/main 계보에 포함되는지 확인 (실패 시 중단)
TAG_COMMIT="$(git rev-list -n 1 "${TAG}")"
git merge-base --is-ancestor "${TAG_COMMIT}" origin/main

git push origin "${TAG}"
```

검증:

```bash
git show "${TAG}"
git ls-remote --tags origin "${TAG}"
```

### 4) 서비스 레포 릴리즈 기록 남기기

- `coupler-api`, `coupler-admin-web`, `coupler-mobile-app`는 현재 GitHub Release를 기본 산출물로 운영하지 않는다.
- 서비스 레포 태그 push 후 GitHub Release 또는 zip artifact 생성을 기다리지 않는다.
- 릴리즈 기록 문서 또는 `docs` 통합 Release Note에 아래를 남긴다.
    - 레포 이름
    - 태그 이름
    - 태그 커밋 SHA
    - 운영 반영 시각
    - 검증 결과
    - 롤백 기준점

## Docs 배포 (GitHub Pages + docs Tag Release)

대상: `docs`

- `main` 브랜치에 push되면 `deploy-docs.yml`로 GitHub Pages가 배포된다.
- `v*.*.*` 태그가 push되면 `release.yml`이 동작해 GitHub Release를 자동 생성한다.
- Release에는 `mkdocs build --strict` 결과물(`docs-site-vX.Y.Z.tar.gz`)이 첨부된다.
- Release 노트는 이전 기준점(이전 태그, 첫 릴리스면 초기 커밋) 대비 변경을 자동 생성한다.
- 이미 생성된 Release 노트와 릴리스 실행 기록은 사실 오류 정정 또는 증빙 보강 외 사후 재작성하지 않는다.
- `content/releases/vX.Y.Z.md`가 있으면 Release 노트는 해당 릴리스 기록을 1차 원본으로 사용한다.
- 이전 기준점 대비 git log는 보조적인 "문서 레포 변경 이력"으로만 사용한다.
- 태그 시점에 `content/releases/vX.Y.Z.md`가 포함돼 있으면 Release 노트에 해당 문서 링크가 자동 포함된다.
- `content/releases/vX.Y.Z.md`에 `버전 매핑` 섹션이 있으면 Release 노트 상단에 함께 노출한다.
- `content/releases/vX.Y.Z.md`가 있으면 Release 노트 상단에 `목적`, `릴리스 상태`, `메인 흐름` 요약을 먼저 노출한다.
- 첫 릴리스처럼 이전 태그가 없으면 전체 문서 히스토리가 비교 범위에 포함될 수 있으므로, 실제 배포 판단은 `content/releases/vX.Y.Z.md`를 우선 기준으로 확인한다.

### 1) 통합 버전 기록 문서 준비 (2단계부터 적용)

- 표준 흐름은 하나의 PR에서 `pending`과 `released` 두 커밋을 만든 뒤 최종 기록만 `main`에 한 번 병합한다.
- 범위 확정 전 공유가 필요한 `planned`도 같은 PR의 선택 커밋으로만 두며 먼저 병합하지 않는다.
- 신규 릴리스 기록은 `버전 매핑` 섹션을 포함한다.
- `버전 매핑`: `docs`, `coupler-api`, `coupler-admin-web`, `coupler-mobile-app` 기준점
- `coupler-mobile-app`: Store version/build, 릴리스 태그/커밋, 제출 마커 태그, NextPush label과 대상 Store binary
- `coupler-api`: 태그/커밋 또는 `N/A`
- `coupler-admin-web`: 태그/커밋 또는 `N/A`
- 릴리즈 검증 결과(핵심 시나리오, 롤백 기준)
- 이 문서가 태그 커밋에 포함되어야 릴리즈 기준점과 동일 스냅샷으로 추적할 수 있다.
- `content/releases/vX.Y.Z.md` 작성 후에는 로컬 docs tag로 Release Note preview를 생성하고, [문서 거버넌스 정책](document-governance-policy.md)의 문서 안정성 평가가 `No Findings`일 때만 원격 tag를 push한다.

### 2) 태그 생성 및 push

```bash
git checkout main
git pull --ff-only
TAG=v1.0.0
git tag -a "${TAG}" -m "Release ${TAG}"

# 원격 push 전 Release Note preview를 생성하고 리뷰한다.
GITHUB_REPOSITORY=coupler-developer/docs bash .github/scripts/generate-release-notes.sh "${TAG}" > "/tmp/release-notes-${TAG}.md"

# 태그 커밋이 origin/main 계보에 포함되는지 확인 (실패 시 중단)
TAG_COMMIT="$(git rev-list -n 1 "${TAG}")"
git merge-base --is-ancestor "${TAG_COMMIT}" origin/main

git push origin "${TAG}"
```

- preview에서 finding이 나오면 원격 tag를 push하지 않는다. 로컬 tag를 갱신해 다시 preview를 만들고, `yarn validate:docs`와 문서 안정성 평가를 `No Findings`까지 반복한다.

### 3) 자동 릴리즈 확인

- GitHub Actions에서 `Release Docs` 워크플로우 성공 여부를 확인한다.
- GitHub Releases에서 동일 태그(`v1.0.0`)가 생성됐는지 확인한다.
- Release 본문에 `content/releases/v1.0.0.md` 링크가 포함됐는지 확인한다(2단계부터).
- Release에 `docs-site-v1.0.0.tar.gz` artifact가 첨부됐는지 확인한다.
- 위 항목은 tag push 이후 postcheck다. tag push 전에는 Release Note preview, `yarn validate:docs`, 문서 안정성 평가로 차단하고, postcheck 실패 시 corrective reissue로 정정한다.

### 4) 예외 처리 (2단계부터)

- Release 본문에 통합 버전 기록 링크가 없으면 `release.yml`/스크립트 오류로 간주하고 수정 후 태그부터 다시 진행한다.
- 이미 생성된 docs GitHub Release를 정정해야 하는 경우는 `docs-only corrective reissue`로 기록한다.
- `docs-only corrective reissue`는 아래 조건을 모두 만족할 때만 허용한다.
    - 서비스 레포 tag(`coupler-api`, `coupler-admin-web`, `coupler-mobile-app`)를 변경하지 않는다.
    - 정정 대상이 docs Release 본문, docs site artifact, docs 릴리스 기록에 한정된다.
    - Release Note preview와 `yarn validate:docs`가 마지막 수정 이후 통과했다.
    - 문서 안정성 평가가 `No Findings`다.
    - GitHub Release 본문과 artifact가 교체됐는지 확인한다.

## 모바일 배포 (스토어/OTA)

대상: `coupler-mobile-app`

- 모바일은 EC2에 배포하지 않는다.
- 배포 단위는 "스토어 빌드" 또는 "NextPush OTA 배포"이다.
- 현재 NextPush OTA 배포는 `Production` label만 사용한다.

### 1) 배포 유형 선택

- 스토어 배포: 앱 바이너리(iOS/Android) 업데이트
- OTA 배포: NextPush(CodePush)로 JS 번들 업데이트
- API 명세 변경이 포함되면 Mobile Store와 Mobile NextPush 배포 모두 [API 계약 변경 모바일 릴리즈 플로우](../flows/cross-project/api-contract-mobile-release-flow.md)를 따른다.
- iOS 스토어 업로드 전에는 현재 Apple 제출 기준을 만족하는 Xcode/iOS SDK로 빌드했는지 확인한다.
- iOS 제출 기준 증빙은 `xcodebuild -version`과 `xcrun --sdk iphoneos --show-sdk-version` 실행 결과를 릴리즈 기록에 남긴다.

### 2) OTA 배포 (NextPush)

Production OTA만 아래 레포 스크립트로 실행한다.

```bash
# Android
yarn codepush-and-prod

# iOS
yarn codepush-ios-prod
```

### 3) 태그/릴리즈 남기기

- 스토어 심사 제출 직후에는 [배포 태그 정책](release-tag-policy.md)에 따라 제출 마커 태그를 만들고 원격에 push한다.
- 스토어 배포가 끝나고 검증한 커밋에는 [배포 태그 정책](release-tag-policy.md)에 따라 모바일 레포 릴리즈 태그를 찍는다.
- 릴리즈 태그와 릴리즈 기록으로 제출 증빙을 이관한 뒤에는 [배포 태그 정책](release-tag-policy.md)에 따라 해당 `submitted/*` 태그를 삭제한다.
- NextPush-only 배포는 기본적으로 모바일 레포 태그를 새로 만들지 않는다.
- NextPush-only 배포의 기준점은 NextPush app/deployment label, uploaded time, target binary version, rollout/mandatory/disabled 상태, 배포한 git commit SHA로 기록한다.
- 릴리즈 기록 또는 `docs` 통합 Release Note에는 실제 배포한 NextPush app, `Production` deployment label, 검증 시나리오를 남긴다.

## 릴리즈 노트 템플릿

```markdown
## Summary
- (한 줄) 이번 배포의 핵심

## Changes
- PR/커밋 단위 변경점

## Deploy Notes
- 운영 반영 순서, 마이그레이션 유무, feature flag 등

## Verification
- 배포 후 확인한 시나리오/지표

## Rollback
- 롤백 기준 태그: vX.Y.Z
- 롤백 방법(레포/플랫폼별 한 줄)
```

## 레거시 DB 제거 릴리즈 체크리스트 (강제)

- 적용 대상: DB 마이그레이션에서 `contract(레거시 제거)`가 포함된 릴리즈
- 실행 순서: 아래 순서를 고정한다.

1. 의존성 0건 확인
2. 일정 기간 read/write 0건 모니터링
3. 1, 2를 충족한 뒤 레거시 DB `drop` 실행

- 근거 기록: PR/릴리즈 노트에 `DBM-GATE-400` 결과와 로그 경로를 함께 남긴다.
- fail-closed:
    - 1, 2 미충족이면 `drop` 실행 금지
    - 3 미완료면 릴리즈 상태를 `미완료`로 유지(릴리즈 완료 금지)

## 자주 하는 실수 체크

- 태그를 `main`이 아닌 다른 브랜치/커밋에 찍음
- 태그를 만들고 `git push origin <tag>`를 안 해서 원격에 없음
- lightweight tag(`git tag v1.2.1`)로 찍어서 메타데이터(작성자/메시지) 추적이 약해짐
