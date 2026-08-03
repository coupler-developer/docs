# 배포/릴리즈 프로세스

## 문서 역할

- 역할: `규범`
- 문서 종류: `policy`
- 충돌 시 우선 문서: 이 문서. 단, 태그 이름/시점/증빙 기준은 [배포 태그 정책](release-tag-policy.md)
- 기준 성격: `as-is`

## 목적

- 배포 범위, 릴리즈 기록 상태·metadata·증빙 계약과 완료·불변 조건을 고정한다.
- Gate 실행 순서는 [릴리즈 자동화 파이프라인](../flows/cross-project/release-automation-pipeline.md), 실제 명령과
  rollback은 [운영 배포 명령어 런북](../flows/cross-project/production-deploy-command-runbook.md)에 위임한다.
- 태그 이름/시점/증빙 기준은 [배포 태그 정책](release-tag-policy.md)에 위임한다.
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
- 운영계 배포는 실사용자 대상 반영이다. 배포 전 `main` 기준 커밋 확정,
  [엔지니어링 가드레일](engineering-guardrails.md)의 `No Findings 게이트`,
  [테스트/CI 전략](testing-strategy.md)의 표준 품질 게이트, 롤백 기준과 post-deploy 검증 시나리오를 먼저
  고정한다.
- 개발계와 운영계는 `EC2` host, 도메인, API base URL, DB/RDS, 환경변수, package registry auth를 각각 확인한다. 한 환경의 성공을 다른 환경의 인증/설정 성공으로 간주하지 않는다.
- `coupler-admin-web` 정적 빌드는 `yarn build` 시점의 환경변수가 번들에 고정된다. CRA build는 `.env.development`를 사용하지 않으므로, 개발계/운영계 각각 빌드 산출물이 어느 API base URL을 바라보는지 배포 전에 확인한다.
- EC2 또는 배포 호스트에서 직접 `yarn install`/`yarn build`를 실행하면 해당 OS 사용자의 GitHub Packages user-level auth가 필요하다. GitHub Packages `Manage Actions access`는 GitHub Actions에만 적용되며 SSH shell에는 적용되지 않는다.
- 운영 DB write, 운영 API restart, 운영 Admin artifact 교체, NextPush `Production` label 배포는 모두 사용자 영향 작업이다. 개발계 확인 목적으로 운영 대상 명령을 실행하지 않는다.
- 개발계 배포 후에는 개발계 host/domain/API/DB 기준으로만 검증 결과를 기록한다. 운영계 배포 후에는 운영 host/domain/API/DB 기준으로 별도 검증 결과를 기록한다.

## 배포 범위 선택 원칙

- 운영 배포는 항상 모든 구성요소를 포함하지 않는다.
- 배포 시작 시 포함 범위를 먼저 고정한다: `DB migration`, `contracts package`, `coupler-api`, `coupler-admin-web`, `Mobile Store`, `Mobile NextPush`, `docs`, `Tag/Release Record`.
- 선택되지 않은 범위는 `N/A` 사유와 근거를 릴리즈 기록에 남긴다.
- DB 변경이 포함되면 [DB Migration 유지보수 정책](db-migration-gate-policy.md)을 해당 범위의 단일 기준으로 따른다.
- `coupler-admin-web`가 포함되면 [Admin 운영 배포 런북](../flows/cross-project/admin-web-production-deploy-flow.md)을 상세 실행 기준으로 따른다.
- 릴리즈 자동화 gate 순서는 [릴리즈 자동화 파이프라인](../flows/cross-project/release-automation-pipeline.md)을 따르되, 충돌 시 이 문서와 각 policy를 우선한다.
- 명령어가 필요한 배포 작업은 [운영 배포 명령어 런북](../flows/cross-project/production-deploy-command-runbook.md)을 사용하되, 충돌 시 이 문서와 각 policy를 우선한다.
- 배포 태그, 스토어 제출 마커 태그, 태그 증빙 기준은 [배포 태그 정책](release-tag-policy.md)을 단일 기준으로 따른다.
- Mobile Store와 Mobile NextPush는 별도 배포 범위다. NextPush-only 배포는 기존 스토어 binary를 대상으로 하는
  OTA이므로 native version, store upload, 모바일 git tag를 자동으로 변경하지 않는다. API/DB 변경이 있어도
  [엔지니어링 가드레일](engineering-guardrails.md)의 `API cutover`와 DB runtime/schema 조합을 각각
  판정한다.
- Mobile Store 제출은 운영 출시와 별도 상태다. API 계약 변경을 포함하면 제출 시 운영 `min_version`을 바꾸지
  않는다. `API cutover: No`이면 직전 운영 앱과 새 API/DB의 호환을 유지한 채 일반 출시 절차를 따른다.
  `API cutover: Yes`이면 심사 승인과 출시 가능 상태를 확인한 뒤 서버 측 요청 차단이 포함된 activation
  window에서 플랫폼별 새 build와 API를 전환한다. `force_update`는 사용자 전환 수단이지 요청 차단의 단독 증빙이
  아니다. 릴리즈 기록에서 Mobile Store 승인/운영 출시를 통합 릴리즈 완료 조건으로 잡은 경우, 해당 gate에
  묶인 `vX.Y.Z` 릴리즈 태그는 완료 전 생성하지 않는다.
- Mobile Store gate와 독립적으로 완료되는 범위는 운영 반영/검증 완료 후 [배포 태그 정책](release-tag-policy.md)에 따라 별도 태그를 생성할 수 있다.
- API 명세 변경이 포함된 Mobile Store 또는 Mobile NextPush 배포는
  [API 계약 변경 모바일 릴리즈 플로우](../flows/cross-project/api-contract-mobile-release-flow.md)를 함께 따른다.
  공개 계약의 기본 경로는 `API cutover: No`다.
- API activation window는 `API cutover: Yes`에만 적용한다. DB는 별도 maintenance window에서 durable
  FENCED → migration → final-DB smoke → RESUMED 순서로 실행한다. 둘이 함께 있으면 activation과
  client/API/state 복구 순서를 하나의 릴리즈 기록에서 결합한다.
- API cutover에서는 API/Admin 전환과 결정론적 서버 측 요청 차단, 선택한 Store 강제 업데이트 또는
  Android·iOS mandatory, smoke가 끝나기 전에는 장벽을 해제하지 않는다. 이 장벽을 보장할 수 없으면 배포를
  `BLOCKED`로 둔다. 장벽 중에도 이전 client가 이해하는 bootstrap/version/upgrade 경로는 성공하고,
  incompatible product request는 이전 client가 파싱할 수 있는 응답으로 거부돼야 한다.

## Contracts Package Release

대상: `coupler-api/packages/contracts`

- 계약 package의 source, 발행·소비·preview/stable 구분, package manager, registry/auth, version bump와 소비자
  전환 조건은 [API 클라이언트 계약 패키지 정책](api-client-contract-package-policy.md)을 단일 기준으로 따른다.
- API 공통 응답/에러 계약 또는 Swagger public request/success contract 변경이 있으면 `contracts package` 범위를 포함한다.
- 운영 배포에는 package 정책이 요구하는 stable 발행과 active consumer 정렬 결과를 scope 증빙으로 남긴다.
  Preview 결과는 운영 완료 증빙으로 인정하지 않는다.
- 계약 package가 포함된 배포 순서와 cutover 분기는
  [릴리즈 자동화 파이프라인](../flows/cross-project/release-automation-pipeline.md)과
  [API 계약 변경 모바일 릴리즈 플로우](../flows/cross-project/api-contract-mobile-release-flow.md)를 따른다.

## 릴리즈 운영 모델

- 문서 레포(`docs`) 단독으로 GitHub Release를 운영한다.
- `docs` `main` push는 문서 사이트 배포(MkDocs Pages), `v*.*.*` 태그 push는 Docs GitHub Release 생성으로 사용한다.
- `coupler-api`, `coupler-admin-web`, `coupler-mobile-app` 태그 push는 GitHub Release 또는 zip artifact를 자동 생성하지 않는다.
- `docs` 버전은 릴리스 기록 번호로 사용하고, 서비스 레포의 실제 배포 버전은 `버전 매핑`으로 별도 고정한다.
- 신규 릴리스 기록은 실제 새 배포 범위를 기록한 최종본으로 한 번 병합한다. `main`에 이미 존재하는 릴리스
  기록은 상태와 무관하게 파일 전체가 불투명한 최종본이며 이후 수정·삭제·이름 변경·대체하지 않는다.
- 병합된 DB migration 릴리스의 `content/releases/evidence/db-migrations/<version>/` 파일도 같은 최종본에
  포함된다. 내용을 현재 계약으로 다시 읽지 않고, 기존 파일의 변경·삭제·이름 변경·대체와 해당 버전 경로의
  사후 추가를 모두 금지한다.
- `버전 매핑` 섹션은 이 기준 이후 작성하는 신규 릴리스 기록부터 필수로 둔다.
- `버전 매핑`에는 아래 기준점을 함께 기록한다.
    - `docs` 기록 버전/태그
    - `coupler-mobile-app` Store version/build, 릴리스 태그/커밋, 제출 마커 태그, NextPush label과 대상 Store binary
    - `coupler-api` 태그/커밋 또는 `N/A` 사유
    - `coupler-admin-web` 태그/커밋 또는 `N/A` 사유
- 신규 릴리스 기록의 작성 계약은 `release-metadata` block 하나다. 자동화의 기계 판정 SoT는 여기서 한 번 계산한 derived model이며, `버전 매핑`과 Gate 섹션은 사람이 읽는 mirror다. 자동화가 본문 자유 문장을 포함 신호로 해석하지 않게 작성한다.
- `release-metadata.schema`는 병합된 최신 계약과 일치해야 하며 현재 작성 계약은 `release-metadata/v2`다.
- `release-metadata`의 모든 하위 object는 작성 계약에 정의된 key만 허용한다. 새 nested key가 필요하면 descriptor 또는 cutover required path에 연결하고 unknown key fail-closed 테스트를 함께 갱신한다.
- `release-metadata.releaseScopes`는 실제 릴리즈 surface의 단일 SoT이며 항상 `docs`를 포함한다.
- repo 검증 범위는 사람이 별도 입력으로 정하지 않고 `releaseScopes` descriptor에서 파생한다.
- `release-metadata.scopeResults`는 scope별 결과 상태와 증적의 단일 SoT다. key는 `releaseScopes`와 정확히 일치해야 하며, 각 scope의 `status`와 `evidence`만 보고 완료/rollback/대체 여부를 판단한다.
- 문서 전체 `release-metadata.status`는 `scopeResults`에서 파생한 상태와 일치해야 한다. 선행 완료 scope가 `released`이고 나머지가 `pending`이면 전체 상태는 `pending`, 장기 실행에서 일부 scope가 진행 중이면 `in_progress`, 완료된 scope와 후속 릴리스로 대체된 scope만 남으면 `superseded`다.
- 전체 `rolled_back`은 하나 이상의 scope가 실제 `rolled_back`이고 나머지 모든 scope도
  `released | rolled_back | superseded`로 terminal일 때만 파생한다. `planned | pending | in_progress`
  scope가 하나라도 남으면 전체는 `in_progress`이며 최종 기록으로 닫지 않는다.
- `docs` scope의 `released` 판정은 최종 릴리즈 기록이 병합 가능한 상태로 확정되고 `versionMapping.docs.tag`에 병합 후 생성할 docs tag가 고정됐다는 뜻이다. 실제 origin tag, GitHub Release, `docs-site-vX.Y.Z.tar.gz` artifact는 final PR merge 뒤 확인하는 운영 postcheck이며, tag push 전 `scopeResults.docs.evidence` hard gate로 요구하지 않는다.
- `release-tag`는 metadata scope로 쓰지 않는다. 서비스 태그 요구는 `released`가 된 `docs`, `coupler-api`, `coupler-admin-web`, `mobile-store` scope에서 파생하며, `mobile-nextpush`는 NextPush-only 정책에 따라 기본적으로 모바일 git tag를 요구하지 않는다.
- `superseded` scope는 완료 증적을 억지로 채우지 않는다. 대신 `supersededBy`, `incompleteReason`, `tagStatus`를 구조화해 어떤 후속 릴리스가 어떤 미완료 범위를 대체했고 태그를 만들지 않았는지 기록한다.
- 신규 `db-migration` evidence는 개발계·운영계의 `plan.json`과 `execution.jsonl` 두 파일씩만 참조한다.
  증빙은 `dev plan → dev execution → prod plan → prod execution`의 연속된 prefix만 허용한다.
  최초 `pending`에서는 dev plan과 SHA-256만 고정하고, 개발계 완료 뒤 dev execution에 결속된 prod plan을
  같은 미병합 PR에 추가한다. 변경된 PR head의 preflight를 다시 통과한 뒤 운영계를 실행하며, terminal
  상태에서는 네 파일의 실제 bytes checksum과 DB ledger 완료가 일치해야 한다.
- 단, canonical executor 도입 전에 운영 migration이 완료된 `v2.3.0`만
  `db-migration-precanonical-transition-evidence/v1`의 일회성 운영 처분을 허용한다. 현재 live
  catalog/ledger/postcondition을 read-only로 검증하고 과거 execution을 사후 제조하지 않으며,
  `db-migration` scope가 `released`일 때만 사용한다. 후속 릴리스와 rollback 증빙에는 이 예외를 재사용하지
  않는다.
- 긴급 운영 대응으로 canonical artifact보다 먼저 migration 98·99가 적용된 `v2.4.0`만
  `db-migration-emergency-completion-evidence/v1`의 일회성 완료 처분을 허용한다. API release ref와 현재
  production catalog·ledger·schema·98·99 postcondition, backup과 fence/resume 사실, canonical execution
  부재를 release metadata의 closed shape로 고정하고 과거 plan/execution을 사후 생성하지 않는다. 이 schema는
  `v2.4.0`의 `released` DB scope 외에는 실패하며 일반 신규 migration, rollback 또는 후속 릴리스에 재사용하지
  않는다.
- Canonical maintenance executor는 plan/execution 의미와 live DB 결과를 검증하고, Docs는 신규 기록의 exact
  artifact 경로·bytes SHA-256만 묶는다. 과거 기록과 DB artifact는 schema·상태·증빙을 읽지 않고 경로·blob
  불변성만 확인한다.
- `releaseScopes`에 포함된 `released` 또는 `rolled_back` scope의 증적은 실제 증빙이어야 하며 `N/A - <사유>`는 제외 범위 또는 완료 판정에 직접 쓰이지 않는 미적용 사유로만 사용한다.
- `rolled_back`은 사유만으로 닫지 않는다. descriptor가 전용 rollback evidence를 정의하면 그것을 사용하고,
  정의하지 않은 `contracts-package`, `mobile-store`, `mobile-nextpush`, `docs`는
  `scopeResults.<scope>.rollbackEvidence`에 실제 되돌림 결과를 기록한다. `db-migration`은 dev/prod
  maintenance execution artifact를 rollback 증빙으로 사용한다.
- 릴리즈 surface, required repo, scope별 결과 상태, terminal evidence 완료 조건을 판단하는 새 최상위 SoT를 추가하지 않는다. 같은 질문을 두 필드가 독립적으로 답할 수 있으면 drift, 예외 backfill, validator별 상수 복제가 생기므로 `releaseScopes` descriptor 또는 `scopeResults.<scope>` 아래 속성으로 흡수한다.
- SoT 분리가 불가피하다고 판단하면 기존 derived model로 표현할 수 없는 이유, 신구 필드 우선순위, drift 검출 방식, 마이그레이션/삭제 계획, 회귀 테스트를 릴리즈 자동화 변경과 함께 기록한다.
- 추가 스냅샷 또는 비교 기준으로만 고정할 repo가 있으면 `release-metadata.extraRepoRefs`에 canonical repo name을 적는다. `extraRepoRefs`는 release 완료 조건을 새로 만들지 않는다.
- API contract cutover 포함 여부는 `release-metadata.apiContractCutover`가 `null`인지 object인지로만 판정한다.
  API 계약 변경이 없거나 `API cutover: No`이면 `apiContractCutover: null`로 두고 Gate 섹션을 만들지 않으며,
  `scopeResults.coupler-api.evidence.publicContract`에 하위 호환 또는 변경 없음 case를 남긴다.
  `API cutover: Yes`이면
  `content/templates/api-contract-cutover-gate-template.md`를 삽입하고, Cutover Gate의 published package
  줄은 `scopeResults.contracts-package.evidence.publishedPackage`를 mirror한다.
- 배포 뒤에 사전 activation 장벽 또는 old-readable bootstrap 위반을 발견해 당시 case를 복구할 수 없으면
  과거 증빙을 사후 제조하거나 해당 릴리스를 영구 `in_progress`로 두지 않는다.
  API scope의 배포 상태는 `released`로 유지하고 `apiContractCutover.status: violated`로 Gate 결과를 분리해
  terminal 기록한다. 정상 Activation·rollback 필드를 재사용하지 않고 `violation`에 허용된 실패 요구조건,
  `consumer-id@commit-sha:interface` 영향 소비자 ref, 발견 시점, 관측·미관측 범위, 운영 처분과 후속 통제를
  구조화한다. 이는 Gate 통과가 아니며 이후 릴리스의 사전 조건이나 호환성 증빙으로 재사용하지 않는다.
- `scopeResults.coupler-api.evidence.publicContract`는 release-scoped 소비자 inventory, API ref와 contract
  case를 소유하고 `runtimeRecovery`는 persisted/queued/external-effect 안전성과 복구 전략을 소유한다.
  previous-release 복구는 inventory의 모든 consumer-interface에 대한 이전 API 성공 rollback case
  exact-set을 요구한다. `apiContractCutover`는 이 case ID를 참조하는 activation/client rollback만
  소유하며 activation에는 선택한 이전 소비자의 결정론적 거부 case를 포함한다. 단, `violated`는 당시
  public contract case를 복구할 수 없다는 처분이므로 `publicContract: null`과 위 `violation` 전용 구조를
  함께 사용하고 Activation·rollback case ID를 만들지 않는다.
- contracts-package `sourceRef`는 stable package를 실제 발행한 workflow source를 보존한다. 그 ref와
  `versionMapping.coupler-api.commit`이 다르면 `packages/contracts`의 양쪽 git tree SHA를
  `sourceTree.publishedSourceTree`와 `sourceTree.releaseSourceTree`에 기록하고 정확히 같아야 한다.
  이후 `main`이 전진했다는 이유로 실제 publish source나 API release source를 바꾸지 않는다.
- 심사용 Store native bundle과 출시 시 같은 target binary에 적용할 NextPush가 서로 다른 API 환경을
  가리키면 기존 Store, 현재 Store native, 현재 NextPush consumer의 artifact/case evidence에
  `production | development` 대상을 각각 명시한다. 개발 API를 본 Store case는 심사·QA 근거일 뿐 운영
  API+최종 DB 호환 근거로 계산하지 않는다. NextPush 확인·다운로드 실패 시 native 개발 API로 진행할 수
  있는 경로는 잔존 위험으로 기록하되, 그 사실만으로 API/DB cutover 판정이나 심사 제출
  차단·재제출을 결정하지 않는다.
- DB에는 별도 `Compatible | Cutover` metadata를 만들지 않는다. DB migration plan/execution이 runtime
  조합·phase·상태 표면·복구를 소유하고 Docs는 artifact 경로와 bytes SHA-256만 묶는다. 공개 API도
  깨질 때만 API Gate를 함께 채운다.
- `versionMapping.coupler-mobile-app.nextPush`는 NextPush app/deployment/label을 문자열로 적거나 미적용 시 `null`로 둔다. `released`, `rolled_back`, `superseded` 상태에서는 `pending`, `미생성`, `대기` 같은 placeholder를 남기지 않는다.
- terminal evidence hard gate는 terminal 상태의 거짓 완료를 막는 조건에만 추가한다.
  `planned`/`pending`/`in_progress`의 아직 도달하지 않은 후속 artifact와 준비 중 placeholder,
  `releaseScopes`에서 제외한 범위, 사람이 읽는 참고 증빙의 세부 형식은 완료 증빙으로 요구하지 않는다.
  단, 이미 존재하는 구조화 artifact의 closed shape·환경 순서·bytes SHA와 미병합 PR preflight 기준점은
  다음 운영성 실행의 admission invariant로 fail-closed 검증한다.
- 태그 push, GitHub Release 생성, Store 심사/승인처럼 운영 액션 이후에만 생기는 산출물을 해당 액션의 사전 hard gate로 요구하지 않는다. 사전 조건은 preview/품질 검증/기준점 고정으로 막고, 사후 조건은 postcheck한다. 실패나 사실 오류는 기존 기록을 바꾸지 않고 이슈·장애 기록에서 추적한다. 실제 새 배포가 없으면 정정용 릴리스 기록을 만들지 않는다.
- 새 hard gate를 추가하려면 `releaseScopeDescriptors` 또는 기존 descriptor에만 연결하고, 누락 실패 테스트, 정상 통과 테스트, 제외 scope 미차단 테스트, policy/flow/template 동기화를 같은 변경에 포함한다.
- 즉, 문서 릴리즈는 "문서만의 버전"이 아니라 "해당 시점 서비스 구성 버전"의 인덱스 역할을 하며, 서비스 레포가 항상 같은 버전 번호를 가져야 한다는 뜻은 아니다.
- 배포 실행 전 local preflight는 `releaseScopes`와 `extraRepoRefs`에서 derived `preflightRepoNames`와
  `requiresServiceWorkspace`를 계산한다. 표준 단일 PR 흐름은 `--pending-ref <40자 SHA>`로 원격에 push된 docs PR
  head를 읽고 docs clean non-main branch의 `HEAD == origin upstream == pending-ref`, 최신 `origin/main` 포함,
  metadata `pending | in_progress`, 서비스 레포 clean `main == origin/main`, 버전 매핑 기준점을 확인한다.
  `--pending-ref`가 없거나 해당 경로가 이미 `origin/main`에 있으면 과거 기록을 읽지 않고 실패한다. DB
  migration scope는 canonical executor가 단계별로 만든 연속된 artifact prefix와 같은 PR head의 exact
  SHA-256을 확인한다. dev execution 또는 prod plan을 추가해 PR head가 바뀌면 다음 환경 실행 전에
  preflight를 다시 통과해야 한다.
- 서비스 버전 매핑은 원격 annotated 태그가 확정되기 전에는 해당 레포의 현재 `origin/main`과 정확히
  일치해야 한다. 배포·검증 뒤 원격 annotated 태그와 commit이 같은 기준점으로 고정되면 그 태그가 불변
  릴리스 기준이 되며, 후속 작업으로 `main`이 전진해도 이미 배포된 commit을 새 `main`으로 바꾸지 않는다.
  태그가 없거나 원격에서 확인되지 않거나 tag/commit이 다르면 과거 commit을 릴리스 기준으로 허용하지 않는다.
- 장기·메이저 릴리즈도 열린 docs PR과 릴리즈 기록을 공유 제어판으로 사용한다. 선택적인 `planned` 커밋을 포함해 모든 상태 변경은 같은 PR에 누적하고, 최종 `released` 검증 전에는 PR을 병합하거나 docs 태그를 만들지 않는다.

## 태그 규칙

- 태그 이름, 생성 시점, 제출 마커 태그, 증빙 기준은 [배포 태그 정책](release-tag-policy.md)을 따른다.
- 이 문서는 태그와 릴리즈 상태·기록·docs GitHub Release 사이의 완료 조건만 정의한다. 실제 실행 순서는
  [릴리즈 자동화 파이프라인](../flows/cross-project/release-automation-pipeline.md)을 따른다.
- 일부 범위만 완료된 릴리스의 `docs/content/releases/vX.Y.Z.md`는 전체 릴리스 상태를 `released`로 닫지 않고, 완료/대기 범위를 구분해 기록한다.

## 릴리즈 기록 상태값

- `planned`: 배포 계획 또는 초안이 작성됐지만 운영 반영이 완료되지 않은 상태
- `pending`: 배포 범위와 기준 SHA가 고정되고 원격 PR head 및 경량 CI를 확인해 운영 반영을 기다리는 상태
- `in_progress`: 일부 범위는 완료됐고 하나 이상의 배포/검증 범위가 아직 대기 중인 상태
- `released`: 포함 범위의 운영 반영/검증/서비스 태그/기록이 완료됐고, final PR merge 뒤 만들 docs 태그가 고정된 상태
- `rolled_back`: 운영 반영 후 문제로 해당 릴리즈 기준점에서 되돌린 상태
- `superseded`: 일부 대기 범위를 완료하지 않은 채 후속 릴리즈가 동일 또는 상위 범위를 대체해, 더 이상 해당 릴리즈를 완료 대상으로 추적하지 않는 상태
- `violated`는 전체 릴리스 상태가 아니라 `apiContractCutover`의 terminal Gate 결과다. 이미
  운영 반영된 API cutover에서 사전 Gate 위반을 사후 확인했을 때만 사용하며 릴리스 자체는 실제 scope 결과에
  따라 `released`로 닫는다.
- `superseded`로 닫을 때는 대체한 후속 릴리즈, 완료하지 않은 범위, 태그 생성 여부, 후속 추적 불필요 사유를 릴리즈 기록에 남긴다.
- `released`, `rolled_back`, `superseded`로 닫힌 기록을 `planned`, `pending`, `in_progress`로 되돌리지 않는다.
  `main` 병합 뒤 기록은 내용과 상태를 재판정하지 않는다. 실제 후속 배포 또는 rollback 배포를 실행하면 그
  실행의 새 기록을 만들고, 단순 사실 정정은 이슈·장애 기록에서만 추적한다.

## 운영 상태 전이 기준

- `pending`은 배포 scope, 서비스 commit SHA, Store version/build, API contract comparison ref, 검증
  시나리오, rollback 기준이 고정되어 운영 배포를 시작할 수 있는 상태다. 자동 검증은 PR 내부 커밋의 상태
  순서나 과거 snapshot을 검사하지 않고 현재 최종본만 검증한다.
- `in_progress`는 일부 범위가 이미 끝났지만 외부 승인이나 후속 범위가 남아 단일 실행에서 바로 `released`로 전환할 수 없는 장기 릴리스에 사용한다.
- DB migration scope는 최초 dev plan을 `pending`에 고정하고 개발계 실행을 시작한 뒤 `in_progress`로
  진행할 수 있다. dev execution 뒤 생성한 prod plan이 같은 PR head에 결속되고 preflight가 다시 통과하기
  전에는 운영 DB 실행으로 넘어가지 않는다.
- Store 심사처럼 외부 대기가 있는 범위는 제출 마커 태그와 대기 범위를 남기고 `in_progress`로 유지한다.
- Store 승인, 운영 출시, 기본 smoke, 모바일 릴리즈 태그, 제출 마커 증빙 이관/삭제가 끝나기 전에는 Mobile Store 범위를 `released`로 닫지 않는다.
- 후속 릴리스가 대기 중인 Store 또는 cutover 범위를 대체하면 억지 완료 증빙을 만들지 않고 `superseded`로 닫는다.
- `docs` GitHub Release와 site artifact는 docs tag push 이후 생성되므로 artifact URL을 병합된 릴리즈 기록에
  되채우지 않는다. Release workflow 실패, Release 본문·artifact 누락 또는 사실 오류도 기존 기록을 수정하지
  않는다. 이슈·장애 기록에서 추적하며, 실제 새 배포가 없으면 정정용 docs 버전을 만들지 않는다.
- 이 상태 계약을 실제 Gate 순서에 적용하는 절차는
  [릴리즈 자동화 파이프라인](../flows/cross-project/release-automation-pipeline.md)을 따른다.

## 버전 올리는 기준 (SemVer)

- `MAJOR`: 호환 깨짐(Breaking change)
- `MINOR`: 기능 추가(하위 호환 유지)
- `PATCH`: 버그 수정/핫픽스(하위 호환 유지)

## 실행 문서 라우팅

| 실행 필요 | 단일 실행 문서 |
| --- | --- |
| 전체 scope/Gate 순서와 장기 릴리즈 상태 반영 | [릴리즈 자동화 파이프라인](../flows/cross-project/release-automation-pipeline.md) |
| DB/API/Admin/Mobile/docs/tag 명령과 rollback | [운영 배포 명령어 런북](../flows/cross-project/production-deploy-command-runbook.md) |
| Admin 정적 artifact 배포 | [Admin 운영 배포 런북](../flows/cross-project/admin-web-production-deploy-flow.md) |
| API/DB 하위 호환 판정·contract cutover | [API 계약 변경 모바일 릴리즈 플로우](../flows/cross-project/api-contract-mobile-release-flow.md) |
| DB migration 유지보수 실행 | [DB Migration 유지보수 정책](db-migration-gate-policy.md) |
| 계약 package 생성·발행·소비 | [API 클라이언트 계약 패키지 정책](api-client-contract-package-policy.md) |

- 이 정책에는 위 문서의 Gate 순서나 실행 명령을 복제하지 않는다. 실행 문서가 이 정책의 상태·metadata·완료
  계약과 다르면 이 정책과 공통 schema/derived model을 먼저 정렬한다.

## Docs 배포와 불변 규칙

- `docs` `main` push는 문서 사이트 배포, `v*.*.*` tag push는 Docs GitHub Release 생성의 기준점이다.
- 신규 릴리즈 기록은 `content/templates/release-record-template.md`를 사용한다. 태그 시점에 해당
  기록이 포함돼 있으면 Release Note의 1차 원본으로 사용하고, 이전 기준점 대비 git log는 보조 이력으로만
  사용한다.
- docs tag push 전에는 Release Note preview, `yarn verify`,
  [문서 안정성 평가](document-governance-policy.md)를 완료한다. Release와 site artifact는 tag push 뒤
  postcheck하며 사전 metadata hard gate로 사용하지 않는다.
- `main`에 병합된 릴리즈 기록과 이미 발행한 Release Note는 해당 버전의 최종본이다. 사유와 범위에 관계없이
  기존 릴리즈 기록 파일을 수정·삭제·이름 변경·대체하지 않는다.
- Release workflow 실패, Release 본문·artifact 누락, 사실 오류 또는 증빙 보강은 기존 버전과 릴리즈
  기록을 바꾸지 않고 이슈·장애 기록에서 추적한다. 실제 rollback 또는 대체 배포를 수행할 때만 새 docs
  버전의 릴리즈 기록을 만들고 원래 버전과 후속 사유를 참조한다. 새 기록은 Release Note preview,
  `yarn verify`, 문서 안정성 평가 `No Findings`, 새 tag/Release/artifact postcheck를 모두 통과해야 한다.
- 실제 preview·tag·postcheck 명령은
  [운영 배포 명령어 런북](../flows/cross-project/production-deploy-command-runbook.md)의 `Docs 포함 시`를 따른다.

## 체크리스트

- [ ] 포함·제외 scope와 `N/A` 근거가 release metadata와 사람이 읽는 mirror에서 일치하는가?
- [ ] 전체 상태가 scope 결과에서 파생된 상태와 일치하고, 허용되지 않은 역전이나 기준점 변경이 없는가?
- [ ] terminal scope의 증빙이 공통 schema/descriptor 계약을 충족하며 placeholder로 완료를 대신하지 않는가?
- [ ] DB migration 증빙이 환경 순서의 연속된 prefix이고 변경된 PR head마다 다음 환경 실행 전 preflight를
      다시 통과했는가?
- [ ] 사전 Gate와 tag/Release/Store 같은 사후 산출물이 분리돼 순환 hard gate를 만들지 않는가?
- [ ] 태그 판정은 [배포 태그 정책](release-tag-policy.md), Gate 순서는 릴리즈 자동화 파이프라인, 명령과
      rollback은 운영 배포 명령어 런북을 단일 기준으로 사용하는가?
- [ ] `main`에 존재하는 릴리즈 기록이 변경·삭제·이름 변경·대체·재검증되지 않았고, 정정만을 위한 새 버전도 만들지 않았는가?

## 관련 문서

- [배포 태그 정책](release-tag-policy.md)
- [엔지니어링 가드레일](engineering-guardrails.md)
- [테스트/CI 전략](testing-strategy.md)
- [문서 거버넌스 정책](document-governance-policy.md)
- [릴리즈 자동화 파이프라인](../flows/cross-project/release-automation-pipeline.md)
- [운영 배포 명령어 런북](../flows/cross-project/production-deploy-command-runbook.md)
- `content/templates/release-record-template.md`
