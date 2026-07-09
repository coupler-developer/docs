# 릴리즈 자동화 파이프라인

## 문서 역할

- 역할: `시나리오`
- 문서 종류: `flow`
- 충돌 시 우선 문서: [배포/릴리즈 프로세스](../../policy/release-process.md), [배포 태그 정책](../../policy/release-tag-policy.md), [테스트/CI 전략](../../policy/testing-strategy.md), [엔지니어링 가드레일](../../policy/engineering-guardrails.md)
- 기준 성격: `as-is`

## 목적

- `docs` 릴리스 기록을 기준으로 `coupler-api`, `coupler-admin-web`, `coupler-mobile-app`, `docs`의 릴리즈 가능 여부를 같은 순서로 판정한다.
- 릴리즈 자동화의 책임을 `policy`, `flow`, `runbook`, `script`, `release record`로 분리해 중복 규칙과 수동 누락을 줄인다.
- 자동화 범위는 `origin/main` fetch를 포함한 local preflight와 증빙 누락 탐지이며, 배포 실행은 포함하지 않는다.

## 범위

- 시작 조건: 릴리즈 목표 버전, 배포 포함 범위, 대상 레포, 검증 시나리오 초안이 정해진 상태
- 종료 조건: 포함 범위별 운영 반영, 검증, 태그, 릴리즈 기록 또는 대기 범위가 문서화된 상태
- 제외 범위: 운영 DB write, EC2 배포 실행, Mobile Store 제출, NextPush 배포, Git tag push, GitHub Release 본문 수동 정정 실행

## 상위 규범 문서

- [배포/릴리즈 프로세스](../../policy/release-process.md)
- [배포 태그 정책](../../policy/release-tag-policy.md)
- [테스트/CI 전략](../../policy/testing-strategy.md)
- [엔지니어링 가드레일](../../policy/engineering-guardrails.md)
- [문서 거버넌스 정책](../../policy/document-governance-policy.md)
- [DB Migration Gate 정책](../../policy/db-migration-gate-policy.md)

## 액터

- 릴리즈 작업자: 배포 범위, 릴리즈 기록, 검증 증빙, 태그 기준점을 확정한다.
- `docs`: 릴리즈 기록, Release Note, preflight 스크립트, 문서 검증을 관리한다.
- `coupler-api`: API 코드, 서버 런타임 설정, API 계약 생성물, 운영 API 배포 기준점을 제공한다.
- `coupler-admin-web`: Admin 정적 산출물, 운영 화면 검증, Admin 계약 사본 기준점을 제공한다.
- `coupler-mobile-app`: Store binary, NextPush bundle, 모바일 계약 사본, 제출 마커 태그 기준점을 제공한다.
- GitHub Actions: docs 검증, docs Release 생성, 서비스 레포 PR 품질 게이트를 실행한다.

## 책임 분리

| 영역 | 역할 |
| --- | --- |
| `policy` | 릴리즈 완료 조건, 태그 생성 시점, 품질 게이트 같은 규범을 정의한다. |
| `flow` | 어떤 gate를 어떤 순서로 통과해야 하는지 정의한다. |
| `runbook` | 사람이 실행할 명령어, 운영 확인, 롤백 절차를 제공한다. |
| `script` | `origin/main` fetch를 포함한 상태 점검과 누락 증빙 탐지를 자동화한다. |
| `release record` | 버전 매핑, 검증 근거, 롤백 기준, 대기 범위를 남긴다. |

## 운영 상태 전이

릴리즈 기록은 한 번만 쓰고 끝나는 문서가 아니라 운영 상태를 따라가는 기록이다.
단, 모든 릴리즈를 불필요하게 재발행하지 않도록 pre-tag 조건과 post-tag 확인을 분리한다.

1. 계획/제출 전에는 릴리즈 기록을 `planned` 또는 `in_progress`로 작성한다.
2. `docs` 태그와 GitHub Release는 릴리즈 제어판 또는 최종 기록 기준점이다. `docs` GitHub Release와 `docs-site-vX.Y.Z.tar.gz` artifact는 태그 push 이후 생성되는 post-tag 산출물이므로, 태그 push 전 `release-metadata.scopeResults.docs.evidence` hard gate로 요구하지 않는다.
3. `docs` 태그 push 전에는 Release Note preview, `yarn validate:docs`, 문서 안정성 평가를 완료한다.
4. `docs` 태그 push 후에는 `Release Docs` workflow 성공, GitHub Release 생성, Release 본문 링크, site artifact 첨부를 확인한다. 실패하면 원인을 수정하고 [배포/릴리즈 프로세스](../../policy/release-process.md)의 `docs-only corrective reissue` 조건으로 정정한다.
5. Mobile Store처럼 심사/승인/출시가 태그 이후까지 이어지는 범위는 `mobile-store` scope를 `planned` 또는 `in_progress`로 유지하고, 제출 마커 태그와 대기 범위를 기록한다.
6. Store 승인, 운영 출시, 기본 smoke, 모바일 릴리즈 태그, 제출 마커 증빙 이관/삭제가 끝난 뒤에만 `mobile-store` scope를 `released`로 닫는다. 후속 릴리스가 대기 범위를 대체하면 `superseded`로 닫는다.
7. 최종 `released`는 포함된 scope가 모두 완료됐고 대기 범위가 없을 때만 사용한다. 일부 범위가 남으면 `in_progress` 또는 `superseded`로 남긴다.

## 안정화 원인 분석

릴리즈 구조의 공백은 릴리즈 규칙이 없어서가 아니라, 규칙이 문서와 스크립트에 나뉘어 들어가면서 실패 조건이 1:1로 연결되지 않은 데서 생긴다.

| 원인 | 발생 형태 | 안정화 기준 |
| --- | --- | --- |
| 상태 gate 이중화 | `released` 상태의 금지 조건이 릴리즈 기록 검증에는 있으나 preflight 판정과 별도로 유지됨 | 상태값, 대기 범위, 미검증 항목 차단 조건을 preflight에서도 같은 결론으로 검사한다. |
| 자유 서술 필드 | `범위`/`버전 매핑` 문장은 사람이 읽기에는 충분하지만 자동화가 regex로 읽으면 문장 변화에 취약함 | `release-metadata` JSON block을 자동화 입력 SoT로 두고, 본문 섹션은 사람이 읽는 mirror로 유지한다. |
| 기준 축 혼재 | 릴리즈 surface와 repo 검증 범위를 사람이 각각 적으면 서로 어긋날 수 있음 | `releaseScopes`를 실제 릴리즈 surface의 단일 SoT로 두고 repo 검증 범위와 terminal evidence는 scope descriptor에서 파생한다. |
| 증빙 책임 분산 | Store, NextPush, 서비스 태그, docs Release가 각각 다른 기준점으로 움직임 | 릴리즈 기록을 증빙 SoT로 두고, 범위별 완료/대기/N/A를 같은 문서에 남긴다. |

## 릴리즈 기록 작성 계약

- 릴리즈 기록 상단에는 `release-metadata` fenced JSON block을 둔다.
- `release-metadata.schema`는 `release-metadata/v1`로 고정한다.
- `release-metadata.schema` 버전은 병합된 최신 계약과 일치해야 한다. 아직 `main`에 합쳐지지 않은 로컬/작업 브랜치 변경만으로 새 버전을 선언하지 않는다.
- `release-metadata` 하위 object에는 descriptor 또는 cutover required path가 정의한 key만 둔다. 임의 nested key는 새 SoT로 취급해 fail-closed로 차단한다.
- `release-metadata.releaseScopes`는 실제 릴리즈 surface의 단일 SoT다. 값은 `db-migration`, `contracts-package`, `coupler-api`, `coupler-admin-web`, `mobile-store`, `mobile-nextpush`, `docs` 중에서 고르며, `docs`를 반드시 포함한다.
- repo 검증 범위는 사람이 직접 쓰지 않고 `releaseScopes` descriptor에서 파생한다.
- `release-metadata.scopeResults`는 scope별 결과 상태와 증적의 단일 SoT다. key는 `releaseScopes`와 정확히 일치해야 하며, 각 scope의 `status`와 `evidence`만 보고 완료/rollback/대체 여부를 판단한다.
- 문서 전체 `release-metadata.status`는 `scopeResults`에서 파생한 상태와 일치해야 한다. 일부 scope가 끝나고 일부 scope가 남아 있으면 전체 상태는 `in_progress`이며, 완료된 scope와 후속 릴리스로 대체된 scope만 남으면 전체 상태는 `superseded`다.
- `docs` scope의 `released` 판정은 릴리즈 기록이 docs tag 기준점에 포함되고 origin에서 확인 가능한 docs tag가 생성됐는지를 의미한다. GitHub Release 생성과 site artifact 첨부는 tag push 이후 확인하는 운영 postcheck이며, 실패 시 `docs-only corrective reissue`로 정정한다.
- `release-tag`는 metadata scope로 쓰지 않는다. 서비스 태그 요구는 `released`가 된 `docs`, `coupler-api`, `coupler-admin-web`, `mobile-store` scope에서 파생한다. `mobile-nextpush`는 NextPush-only 정책에 따라 기본적으로 모바일 git tag를 요구하지 않는다.
- `superseded` scope는 완료 증적을 억지로 채우지 않고 `supersededBy`, `incompleteReason`, `tagStatus`로 후속 릴리스와 미완료 범위를 기록한다.
- SoT를 쪼개는 변경은 기본적으로 금지한다. `releaseScopes` 밖의 새 필드가 포함 범위, required repo, terminal evidence 완료 조건을 독립 판단하면 metadata mirror drift, 과거 기록 예외, validator별 분기 상수, placeholder 우회 경로가 동시에 늘어난다.
- 새 필드는 상태/범위 판단 축이 아니라 기존 scope 또는 repo의 속성인지 먼저 확인한다. 속성이면 `releaseScopeDescriptors`, `versionMappingFieldDescriptors`, `scopeResults.<scope>`처럼 기존 descriptor나 scope result에 붙이고, 축이면 `releaseScopes` 값 추가와 descriptor 보강으로 처리한다.
- 정말 별도 SoT가 필요하면 한 PR 안에 우선순위, 상호 불일치 차단, legacy 기록 처리, 제거 조건, 회귀 테스트를 포함한다.
- 추가 스냅샷 또는 비교 기준으로만 고정할 repo가 있으면 `release-metadata.extraRepoRefs`에 `docs`, `coupler-api`, `coupler-admin-web`, `coupler-mobile-app` 중 canonical name을 적는다. `extraRepoRefs`는 release 완료 조건을 새로 만들지 않는다.
- `범위`의 `대상`은 사람이 읽는 mirror이며 derived `preflightRepoNames`와 같은 레포 집합을 backtick canonical name으로 적는다.
- `포함 범위`는 운영 반영하거나 기준점으로 기록할 작업을 적는다.
- `제외 범위`는 이번 릴리즈에서 하지 않는 DB/API/Admin/Mobile/Tag 범위와 `N/A` 근거를 적는다.
- `release-metadata.versionMapping`에는 4개 레포(`docs`, `coupler-api`, `coupler-admin-web`, `coupler-mobile-app`) 키를 모두 둔다.
- preflight는 raw metadata를 직접 재해석하지 않고 derived release model을 사용한다. model은 `releaseScopes`, `extraRepoRefs`, `requiredRepoRefs`, `serviceRepoRefs`, `preflightRepoNames`, `requiresServiceWorkspace`를 한 번만 계산한다.
- `preflightRepoNames`는 `docs + releaseScopes.requiredRepoRefs + extraRepoRefs`로 계산한다.
- preflight 검증 대상 릴리즈 기록에서 `preflightRepoNames`에 포함된 서비스 레포의 `versionMapping` ref는 릴리즈 상태와 무관하게 실행 시점의 현재 `origin/main` 기준점과 같아야 한다.
- 서비스 레포 `versionMapping`에 tag를 적으면 origin에서 확인 가능한 annotated tag여야 하고, commit SHA는 `origin/main` 계보에서 확인 가능해야 한다.
- 같은 repo의 `versionMapping`에 tag와 commit SHA를 함께 적으면 둘은 같은 커밋을 가리켜야 한다.
- `docs`의 `versionMapping.docs.commit`에는 concrete SHA를 적지 않는다. `docs` 릴리즈 기준점은 `versionMapping.docs.tag`와 tag commit으로 확인하며, tag 생성 전 local preflight는 clean `docs` `main`과 `origin/main` 일치를 기준으로 삼는다. `released`, `rolled_back`, `superseded` 상태에서는 `docs` tag도 origin에서 확인되어야 한다. terminal `docs` tag commit은 `origin/main` 계보에 있어야 하지만 현재 `origin/main`과 같을 필요는 없다.
- `versionMapping.coupler-mobile-app.nextPush`는 NextPush app/deployment/label 문자열 또는 `null`만 허용한다. terminal 상태에서는 placeholder를 남기지 않는다.
- `버전 매핑` 섹션은 사람이 읽는 mirror이며, 자동화 기준은 `release-metadata.versionMapping`이다.
- release 상태, release scope 목록, scope별 required repo/evidence, version mapping 필드, scope result/evidence 필드, placeholder 신호, API contract cutover 필드는 `scripts/release-schema.mjs`를 공통 descriptor로 사용한다. validator별로 같은 상수를 다시 정의하지 않는다.
- API contract cutover 포함 여부는 본문 문자열 검색이 아니라 `release-metadata.apiContractCutover` object 또는 실제 `API contract cutover Gate` 섹션 존재로만 판단한다. cutover가 없으면 `apiContractCutover: null`로 두고 Gate 섹션을 만들지 않는다.
- API contract cutover가 포함되면 `release-metadata.apiContractCutover`를 cutover 상태/비교 기준/운영 cutover 증적의 기계 판정 SoT로 둔다. Contracts package publish 증적은 `scopeResults.contracts-package.evidence.publishedPackage`에 두고, `content/templates/api-contract-cutover-gate-template.md`의 `API contract cutover Gate` Markdown 섹션을 사람이 읽는 mirror로 삽입한다.

### 상태별 placeholder 정책

상태별 placeholder 판정은 `scripts/release-record-metadata.mjs`의 completion state validator가 단일로 수행한다.

| 릴리즈 상태 | placeholder 허용 | 자동 차단 기준 |
| --- | --- | --- |
| `planned` | 허용 | 기본 schema, release scope 집합, derived preflight repo mirror 정합성만 검사한다. |
| `in_progress` | 허용 | `scopeResults`의 일부 scope가 `planned` 또는 `in_progress`인데 전체 status가 다르면 차단한다. |
| `released` | 완료 증빙에는 금지 | 모든 scope가 `released`여야 하며, released scope의 derived repo ref, 태그, scope descriptor evidence, 제출 마커 증빙, API contract cutover 증빙에 `pending`, `미생성`, `미검증`, `미완료`, `심사 중`, `대기`가 남으면 차단한다. |
| `rolled_back` | 완료/rollback 증빙에는 금지 | 하나 이상의 scope가 `rolled_back`이어야 하며, rolled_back scope의 `rollbackReason`과 rollback/cutover 증빙에 placeholder 신호가 남으면 차단한다. |
| `superseded` | 대체 사유에는 허용 | `released`/`superseded` scope만 남아야 하며, superseded scope는 `supersededBy`, `incompleteReason`, `tagStatus`로 미완료 대체 범위를 표현한다. |

- `N/A - <사유>`는 제외 범위, cutover 미포함 사유, 참고 mirror처럼 완료 판정에 직접 쓰이지 않는 항목에만 쓴다. `releaseScopes`에 포함된 `released` 또는 `rolled_back` scope의 terminal evidence는 실제 workflow, Gate, smoke, artifact, rollback 기준 같은 concrete 증빙이어야 하며 `N/A - <사유>`로 대체하지 않는다.
- `preflightRepoNames`에 포함되지 않은 레포의 `versionMapping` placeholder는 해당 릴리즈의 완료 차단 조건이 아니다. 제외 근거는 `범위`의 `제외 범위`에 남긴다.

### Hard Gate 추가 원칙

- hard gate는 `released`, `rolled_back`, `superseded` 같은 terminal 상태의 거짓 완료를 막는 조건에만 추가한다.
- `planned`/`in_progress` 상태의 준비 중 값, `releaseScopes`에 없는 범위, 참고용 본문 문장, 콘솔 URL 형식처럼 완료 여부를 직접 바꾸지 않는 항목은 hard gate로 추가하지 않는다.
- 태그 push, Store 심사, GitHub Release 생성처럼 해당 운영 액션 이후에만 생기는 산출물을 그 액션의 사전 hard gate로 요구하지 않는다. 필요한 경우 pre-tag preview/검증과 post-tag 확인/정정 절차로 나눈다.
- 새 차단 조건은 `scripts/release-schema.mjs`의 descriptor에서 파생한다. validator별 독립 상수, 본문 자유 문장 검색, scope 밖 예외 분기는 추가하지 않는다.
- 새 hard gate를 추가하는 변경은 누락 시 실패 테스트, concrete 증빙 정상 통과 테스트, 해당 scope 제외 시 미차단 테스트를 함께 포함한다.
- 운영 누락이 반복되거나 실제 릴리즈 완료 판정을 거짓으로 만들 수 있다는 근거가 없으면 hard gate 대신 릴리즈 기록 작성 기준 또는 review checklist로만 남긴다.

## 메인 흐름

### 0) Scope Gate

1. 목표 버전과 릴리즈 상태 초안을 고정한다.
2. 포함 범위를 `DB migration`, `coupler-api`, `coupler-admin-web`, `Mobile Store`, `Mobile NextPush`, `docs`, `Tag/Release Record`로 나눈다.
3. 제외 범위는 `N/A` 사유와 근거를 릴리즈 기록에 남긴다.
4. API 계약 변경, DB contract/drop, Mobile Store 제출, NextPush-only 배포 여부를 먼저 분류한다.

### 1) Release Record Gate

1. `docs/content/releases/vX.Y.Z.md`를 `content/templates/release-record-template.md` 기준으로 작성한다.
2. 신규 릴리즈 기록은 `release-metadata.versionMapping`에 `docs`, `coupler-api`, `coupler-admin-web`, `coupler-mobile-app` 기준점을 모두 남긴다.
3. 릴리즈 기록 상태가 `in_progress`면 대기 범위를 명시한다.
4. 릴리즈 기록 상태가 `released`면 대기 범위, 심사 중, 미검증 항목이 남아 있지 않아야 한다.
5. Store 심사/승인처럼 운영 시간이 긴 범위는 제출 마커와 대기 범위를 기록하고, 완료 전에는 `released`로 닫지 않는다.

### 2) Static Preflight Gate

배포 실행 전에 `docs`에서 local preflight를 실행한다. 이 명령은 원격 최신성 확인을 위해 포함 레포의 `origin/main`을 fetch하고 `release-metadata.versionMapping`의 tag를 origin에서 조회하지만, 운영 배포나 태그 push는 수행하지 않는다.

```bash
yarn release:preflight --version vX.Y.Z --workspace-root .. --include docs,coupler-api
```

1. `--version vX.Y.Z`는 필수이며, 해당 릴리즈 기록을 찾지 못하면 실패한다.
2. `--include`에는 릴리즈 기록의 derived model `preflightRepoNames`와 같은 레포 집합만 지정한다. 값은 `docs`, `coupler-api`, `coupler-admin-web`, `coupler-mobile-app` 또는 축약값 `api`, `admin`, `mobile`을 사용한다.
3. `--include`를 생략하면 릴리즈 기록의 `releaseScopes`와 `extraRepoRefs`에서 preflight repo를 계산한다.
4. preflight는 먼저 릴리즈 기록에서 derived model을 만들고, `requiresServiceWorkspace`가 true인 경우에만 workspace root를 찾는다.
5. `preflightRepoNames`가 `docs`뿐이면 `coupler-api`, `coupler-admin-web`, `coupler-mobile-app` sibling repo 없이도 docs-only preflight를 실행할 수 있다.
6. 서비스 레포가 포함됐고 `docs`를 별도 worktree에서 열어 작업 중이면 `--workspace-root`에 `coupler-api`, `coupler-admin-web`, `coupler-mobile-app`이 있는 워크스페이스 루트를 명시한다.
7. preflight는 포함 레포의 `origin/main`을 fetch한 뒤 local git 상태, `main`/`origin/main` 일치, 릴리즈 기록 존재 여부, `release-metadata` 기본 형식을 확인한다.
8. preflight는 origin에서 확인할 수 없는 tag, annotated tag가 아닌 tag, tag/commit 기준점 불일치, 현재 `origin/main` 기준점과 다른 서비스 레포 ref, `origin/main` 계보에서 확인할 수 없는 commit SHA, `N/A`만 남은 포함 레포 기준점, DB migration SQL 파일 누락/checksum 불일치, metadata/versionMapping 누락, 원격 최신성 불확실성을 모두 차단한다.
9. preflight는 non-blocking warning을 만들지 않는다. 불확실하거나 사람이 후속 확인해야 하는 항목은 실패로 보고, 원인 수정 또는 증빙 기록 후 다시 실행한다.
10. preflight는 `released` 상태에 `대기 범위` 값이 남아 있으면 차단한다.
11. preflight는 운영 배포, DB write, Store 제출, NextPush 배포, tag push를 실행하지 않는다.

### 3) Clean Main Gate

1. 포함된 서비스 레포와 `docs`는 배포 기준 커밋에서 clean 상태여야 한다.
2. 릴리즈 태그 대상 커밋은 `origin/main` 계보에 있어야 한다.
3. feature branch, local-only commit, dirty working tree, 원격 미동기화 상태에서는 배포 태그를 만들지 않는다.
4. 필요한 명령은 [운영 배포 명령어 런북](production-deploy-command-runbook.md)의 공통 사전 확인과 Tag 절차를 사용한다.

### 4) Quality Gate

1. 포함된 코드 레포는 [테스트/CI 전략](../../policy/testing-strategy.md)의 표준 품질 게이트를 통과해야 한다.
2. `docs`는 `yarn validate:docs`를 통과해야 한다.
3. 레포에서 미제공인 항목은 `N/A`로 표시하고 미적용 근거를 릴리즈 기록에 남긴다.
4. 검증 실패가 있으면 배포 실행으로 넘어가지 않는다.

### 5) Cross Repo Compatibility Gate

1. API 계약 변경이 없으면 `N/A` 근거를 릴리즈 기록에 남긴다.
2. API 계약 변경이 있으면 [API 계약 변경 모바일 릴리즈 플로우](api-contract-mobile-release-flow.md)에 따라 호환 배포와 cutover 배포를 분리한다.
3. `contracts package` 범위가 포함되면 `Release Contracts` workflow 성공과 `@coupler-developer/coupler-api-contracts@x.y.z` publish version을 릴리즈 기록에 남긴다.
4. Mobile/Admin generated contract copy exact match 검증이 필요한 경우 해당 명령, 비교 ref, published package version을 릴리즈 기록에 남긴다.
5. Admin/Mobile이 package dependency로 전환된 뒤에는 registry/auth 설정, `package.json`, lockfile의 package version, 소비자 표준 품질 게이트 결과를 릴리즈 기록에 남긴다.
6. 기존 운영 앱을 깨는 cutover는 다음 Mobile Store 출시 또는 NextPush 적용, legacy traffic 차단, rollback 기준 확보 전에는 진행하지 않는다.

### 6) Deploy Evidence Gate

1. 포함된 범위만 운영 반영한다.
2. DB migration은 SQL을 `coupler-api` PR의 repo-relative `.sql` 파일로 올리고 SHA-256 checksum을 계산한 뒤, [DB Migration Gate 정책](../../policy/db-migration-gate-policy.md)의 Gate와 ledger/postcheck/rollback 증빙을 `scopeResults.db-migration.evidence.sqlRefs`, `gateResults`, `preflightLog`, `ledger`, `postcheckLog`, `rollbackPlan`에 남긴다.
3. API/Admin 배포는 `scopeResults.coupler-api.evidence.*`, `scopeResults.coupler-admin-web.evidence.*`에 배포 기준점, 핵심 응답 또는 운영 화면 smoke, rollback 기준을 남긴다.
4. Mobile Store는 제출/승인/출시/기본 smoke 검증과 artifact/hash/제출 마커 이관 증빙을 `scopeResults.mobile-store.evidence.submission`, `approval`, `release`, `smoke`, `artifact`, `submittedMarkers`에 남긴다.
5. Mobile NextPush는 app, `Production` label, target binary version, uploaded time, rollout/mandatory/disabled 상태를 `scopeResults.mobile-nextpush.evidence.app`, `productionLabel`, `targetBinary`, `uploadedAt`, `rollout`, `mandatory`, `disabled`에 남긴다.

### 7) Tag Gate

1. 태그 이름, 생성 시점, 제출 마커 태그, 삭제 조건은 [배포 태그 정책](../../policy/release-tag-policy.md)을 따른다.
2. 서비스 레포 릴리즈 태그는 운영 반영과 검증이 완료된 커밋에만 만든다.
3. Store 심사 중인 모바일 빌드는 릴리즈 태그가 아니라 `submitted/*` 제출 마커 태그로 기록한다.
4. 태그 생성과 검증 명령은 [운영 배포 명령어 런북](production-deploy-command-runbook.md)의 Tag 절차를 사용한다.

### 8) Release Note Gate

1. `docs` tag push 전 Release Note preview를 생성한다.
2. Release Note가 `content/releases/vX.Y.Z.md` 링크, 버전 매핑, 릴리즈 상태, 검증 근거를 포함하는지 확인한다.
3. docs GitHub Release 생성 후 `docs-site-vX.Y.Z.tar.gz` artifact 첨부 여부를 postcheck로 확인한다. 이 postcheck는 tag push 후 확인이며, tag push 전 metadata hard gate로 되돌리지 않는다.
4. 선행 docs Release Note가 `planned` 또는 `in_progress`였고 서비스/Store 상태가 이후 확정됐으면 실배포 완료 후 최종 상태로 갱신한다.
5. postcheck 실패 또는 사실 오류 정정이 필요할 때만 `docs-only corrective reissue`를 수행한다.

### 9) Final Record Gate

1. 릴리즈 기록에 실제 태그/SHA, 운영 반영 시각, 검증 결과, 롤백 기준을 반영한다.
2. 완료되지 않은 범위가 있으면 `released`로 닫지 않고 `in_progress` 또는 `superseded` 상태와 근거를 남긴다.
3. 제출 마커 태그를 삭제했다면 삭제 완료 증빙을 릴리즈 기록에 남긴다.
4. 마지막 수정 이후 `yarn validate:docs`를 다시 실행한다.

## 자동화 범위

- `release-preflight`는 `origin/main` fetch, local git 상태, 릴리즈 기록 기본 구조, scope descriptor 기반 repo/evidence 요구사항을 한 명령으로 판정한다.
- docs validation workflow는 릴리즈 기록 구조, release metadata, release preflight 테스트, markdownlint, `mkdocs build --strict`를 검증한다.
- 서비스 레포 CI 결과, docs Release Note preview, 운영 배포 실행, 태그 push는 자동 실행하지 않고 릴리즈 기록의 검증 근거로 남긴다.
- 배포 secret, 승인 UI, runner 격리가 필요해지면 별도 release operations repo를 만들기 전에 이 문서와 [배포/릴리즈 프로세스](../../policy/release-process.md)의 책임 경계를 먼저 갱신한다.

## 평가 기준

`release-preflight`의 판정은 `PASS`, `FAIL`로 나눈다. 원격 최신성 확인을 위해 `origin/main` fetch와 `release-metadata.versionMapping` tag 조회를 수행한다. CI, 배포 실행, 태그 push는 별도 증빙으로 기록한다.

| 판정 | 기준 |
| --- | --- |
| `PASS` | `preflightRepoNames`의 레포가 clean `main`이고 `HEAD == origin/main`이며, 릴리즈 기록이 존재하고 목표 버전이 일치한다. `release-metadata`가 작성되어 있고 포함 서비스 레포의 tag는 origin의 annotated tag로, commit SHA는 `origin/main` 계보에서 확인 가능하다. 서비스 레포 ref는 현재 `origin/main` 기준점과 같고, tag와 commit SHA가 함께 있으면 같은 커밋을 가리킨다. `docs`는 concrete commit 대신 tag 또는 tag 생성 전 clean `main` 기준으로 확인하며, terminal 상태의 `docs` tag는 origin에서 확인 가능하고 `origin/main` 계보에 있어야 한다. `docs` tag는 릴리즈 기록 기준점이므로 현재 `origin/main`과 같을 필요는 없다. `released` 상태에 대기 범위 값이 남아 있지 않다. `preflightRepoNames`가 `docs`뿐이면 서비스 repo workspace 없이 docs repo 상태와 릴리즈 기록만으로 판정한다. |
| `FAIL` | `--version` 누락, preflight 레포 dirty 상태, `main`/`origin/main` 기준점 불일치, 릴리즈 기록 누락, 목표 버전 불일치, `--include`와 derived `preflightRepoNames` 불일치, metadata 누락, 버전 매핑 누락, 서비스 레포 포함 시 workspace root 누락, origin에서 확인할 수 없는 서비스 tag, annotated tag가 아닌 tag, tag/commit 기준점 불일치, 현재 `origin/main` 기준점과 다른 서비스 레포 ref, `origin/main` 계보에서 확인할 수 없는 commit SHA, `N/A`만 남은 포함 서비스 레포 기준점, concrete `docs` commit SHA, terminal 상태의 origin docs tag 누락, 원격 최신성 확인 불가, `released` 상태의 대기 범위 값, preflight의 배포성 side effect가 있으면 차단한다. |

- `N/A`는 생략이 아니라 제외 사유와 근거가 있는 상태로만 인정한다.
- Store 심사 중, NextPush 대기, 태그 대기는 `released`가 아니라 `in_progress` 또는 명시된 대기 범위로 평가한다.
- 포함되지 않은 레포는 clean main 판정 대상에서 제외하되, 릴리즈 기록의 제외 범위에 남긴다.
- 자동화가 판단할 수 없는 운영 확인은 검증 근거에 명령, 로그, workflow URL 또는 수동 확인 결과로 남긴다.

## 예외 흐름

- preflight가 실패하면 실패 항목을 릴리즈 기록 또는 PR 체크리스트에 반영하고, 원인 수정 후 다시 실행한다.
- 원격 fetch가 실패하거나 `origin/main`을 확인할 수 없으면 preflight가 실패하므로, 네트워크/remote 설정을 복구한 뒤 다시 실행한다.
- Store 심사가 지연되면 호환 배포는 유지하고, Mobile 릴리즈 태그와 cutover는 보류한다.
- NextPush-only 배포면 native version, Store upload, 모바일 릴리즈 태그를 자동 변경하지 않는다.
- docs Release Note 정정만 필요한 경우 [배포/릴리즈 프로세스](../../policy/release-process.md)의 docs-only corrective reissue 조건을 따른다.

## 비포함 / 금지

- 이 문서를 release/tag policy 대신 사용하지 않는다.
- 이 문서에 배포 명령어를 중복 정의하지 않는다. 명령어는 [운영 배포 명령어 런북](production-deploy-command-runbook.md)을 따른다.
- `release-preflight`는 원격 최신성 확인을 위한 git fetch와 tag 조회 외에 배포, DB write, Store 제출, NextPush 배포, tag push를 실행하지 않는다.
- 서비스 레포 태그를 docs 선행 태그로 대체하지 않는다.
- API 계약 변경 cutover를 도메인 테스트 계정 통과, 내부테스트 통과, 앱 심사 승인만으로 진행하지 않는다.

## 관련 문서

- [배포/릴리즈 프로세스](../../policy/release-process.md)
- [배포 태그 정책](../../policy/release-tag-policy.md)
- [운영 배포 명령어 런북](production-deploy-command-runbook.md)
- [API 계약 변경 모바일 릴리즈 플로우](api-contract-mobile-release-flow.md)
- [Admin 운영 배포 런북](admin-web-production-deploy-flow.md)
- [테스트/CI 전략](../../policy/testing-strategy.md)
- [문서 거버넌스 정책](../../policy/document-governance-policy.md)
