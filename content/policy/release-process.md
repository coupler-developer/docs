# 릴리스 프로세스

## 문서 역할

- 역할: `규범`
- 문서 종류: `policy`
- 충돌 시 우선 문서: 이 문서. 단, 태그 이름/시점/증빙 기준은 [릴리스 태그 정책](release-tag-policy.md)
- 기준 성격: `as-is`

## 목적

- 릴리스 범위, 릴리스 기록 상태·metadata·증빙 계약과 완료·불변 조건을 고정한다.
- Gate 실행 순서는 [릴리스 게이트 플로우](../flows/cross-project/release-automation-pipeline.md), 실행 문서
  선택·공통 명령·rollback 진입점은 [운영 릴리스 실행 런북](../flows/cross-project/production-deploy-command-runbook.md)에 위임한다.
- 태그 이름/시점/증빙 기준은 [릴리스 태그 정책](release-tag-policy.md)에 위임한다.
- `docs` GitHub Release와 릴리스 기록 문서로 변경점/주의사항을 한 곳에 모은다.

> 참고: `docs/site/`는 `mkdocs build`가 생성하는 정적 사이트 빌드 산출물이다. 커밋 대상이 아니라 `.gitignore`로 제외한다.

## 적용 범위

- `coupler-api`
- `coupler-admin-web`
- `coupler-mobile-app`
- `docs`

> 이 워크스페이스는 레포가 여러 개라서, **태그는 레포별로 따로** 만든다.

## 용어

- `릴리스(release)`: 범위 확정부터 Gate, scope별 운영 반영, 태그와 릴리스 기록 마감까지의 전체 생명주기다.
- `배포(deploy)`: API·Admin artifact나 NextPush bundle처럼 한 scope의 실행물을 운영 환경에 반영하는 작업이다.
- `실행(operation)`: 런북에 따라 수행하는 명령·확인·복구 단위다.
- 활성 문서의 한국어 일반 표기는 `릴리스`로 통일한다. 코드·schema·workflow의 영문 식별자와 기존 stable 파일
  경로는 호환 계약으로 유지하고, 불변인 과거 릴리스 기록은 소급 수정하지 않는다.

## 환경 경계

- 운영(Production)은 실사용자 대상 환경이고 NextPush `Production`은 현재 사용하는 운영 OTA label이다.
- 개발계 결과를 운영 반영·검증이나 서비스 릴리스 태그 근거로 사용하지 않는다. 운영 런북을 개발계 절차로
  바꿔 실행하지 않는다.
- DB migration의 canonical 개발계 검증은 일반 서비스 배포와 다르다. [DB Migration 유지보수 정책](db-migration-gate-policy.md)과
  [DB Migration 실행 런북](../flows/cross-project/db-migration-operation-flow.md)의 개발계→운영계 순서를 따른다.
- 운영 작업 전 `main` 기준점, `No Findings`, 표준 품질 게이트, rollback 기준과 post-deploy 검증 시나리오를
  고정한다. 환경별 host·도메인·API·DB·인증의 성공을 다른 환경의 근거로 사용하지 않는다.

## 릴리스 범위 선택 원칙

- 운영 릴리스는 항상 모든 구성요소를 포함하지 않는다.
- 릴리스 시작 시 `releaseScopes`를 `db-migration`, `contracts-package`, `coupler-api`, `coupler-admin-web`,
  `mobile-store`, `mobile-nextpush`, `docs` 중에서 고정한다. 태그와 릴리스 기록은 scope가 아니라 scope 결과에서
  파생되는 Gate와 증빙이다.
- 선택되지 않은 범위는 `N/A` 사유와 근거를 릴리스 기록에 남긴다.
- DB 변경이 포함되면 [DB Migration 유지보수 정책](db-migration-gate-policy.md)을 해당 범위의 단일 기준으로 따른다.
- 릴리스 Gate 순서는 [릴리스 게이트 플로우](../flows/cross-project/release-automation-pipeline.md)를 따르되, 충돌 시 이 문서와 각 policy를 우선한다.
- 명령어가 필요한 작업은 [운영 릴리스 실행 런북](../flows/cross-project/production-deploy-command-runbook.md)에서
  scope별 실행 문서를 선택하되, 충돌 시 이 문서와 각 policy를 우선한다.
- 릴리스 태그, 스토어 제출 마커 태그, 태그 증빙 기준은 [릴리스 태그 정책](release-tag-policy.md)을 단일 기준으로 따른다.
- Mobile Store와 Mobile NextPush는 별도 릴리스 범위다. NextPush-only 배포는 기존 스토어 binary를 대상으로 하는
  OTA이므로 native version, store upload, 모바일 git tag를 자동으로 변경하지 않는다. API/DB 변경이 있어도
  [엔지니어링 가드레일](engineering-guardrails.md)의 `API cutover`와 DB runtime/schema 조합을 각각
  판정한다.
- Mobile Store 제출은 운영 출시와 별도 상태다. API 계약 변경을 포함하면 제출 시 운영 `min_version`을 바꾸지
  않는다. `API cutover: No`이면 직전 운영 앱과 새 API/DB의 호환을 유지한 채 일반 출시 절차를 따른다.
  `API cutover: Yes`이면 심사 승인과 출시 가능 상태를 확인한 뒤 서버 측 요청 차단이 포함된 activation
  window에서 플랫폼별 새 build와 API를 전환한다. `force_update`는 사용자 전환 수단이지 요청 차단의 단독 증빙이
  아니다. 릴리스 기록에서 Mobile Store 승인/운영 출시를 통합 릴리스 완료 조건으로 잡은 경우, 해당 gate에
  묶인 `vX.Y.Z` 릴리스 태그는 완료 전 생성하지 않는다.
- Mobile Store gate와 독립적으로 완료되는 범위는 운영 반영/검증 완료 후 [릴리스 태그 정책](release-tag-policy.md)에 따라 별도 태그를 생성할 수 있다.
- API 명세 변경이 포함된 Mobile Store 출시 또는 Mobile NextPush 배포는
  [API 계약 변경 모바일 릴리스 플로우](../flows/cross-project/api-contract-mobile-release-flow.md)를 함께 따른다.
  공개 계약의 기본 경로는 `API cutover: No`다.
- API activation window는 `API cutover: Yes`에만 적용한다. DB migration은 전용 런북에서 같은 마이그레이션
  소스 커밋을 개발계와 운영계에 순서대로 적용한다. 특정 migration의 운영 방식에 별도 조치가 필요하면 해당
  변경의 검토·런북에 명시하며, 모든 migration에 writer 중지·drain을 일괄 요구하지 않는다.
- API cutover에서는 API/Admin 전환과 결정론적 서버 측 요청 차단, 선택한 Store 강제 업데이트 또는
  Android·iOS mandatory, smoke가 끝나기 전에는 장벽을 해제하지 않는다. 이 장벽을 보장할 수 없으면 릴리스 실행을
  `BLOCKED`로 둔다. 장벽 중에도 이전 client가 이해하는 bootstrap/version/upgrade 경로는 성공하고,
  incompatible product request는 이전 client가 파싱할 수 있는 응답으로 거부돼야 한다.

## 계약 패키지 릴리스

대상: `coupler-api/packages/contracts`

- 계약 package의 source, 발행·소비·preview/stable 구분, package manager, registry/auth, version bump와 소비자
  전환 조건은 [API 클라이언트 계약 패키지 정책](api-client-contract-package-policy.md)을 단일 기준으로 따른다.
- API 공통 응답/에러 계약 또는 Swagger public request/success contract 변경이 있으면 `contracts package` 범위를 포함한다.
- 운영 릴리스에는 package 정책이 요구하는 stable 발행과 active consumer 정렬 결과를 scope 증빙으로 남긴다.
  Preview 결과는 운영 완료 증빙으로 인정하지 않는다.
- 계약 package가 포함된 릴리스 순서와 cutover 분기는
  [릴리스 게이트 플로우](../flows/cross-project/release-automation-pipeline.md)와
  [API 계약 변경 모바일 릴리스 플로우](../flows/cross-project/api-contract-mobile-release-flow.md)를 따른다.

## 릴리스 운영 모델

- 문서 레포(`docs`) 단독으로 GitHub Release를 운영한다.
- `docs` `main` push는 문서 사이트 배포(MkDocs Pages), `v*.*.*` 태그 push는 Docs GitHub Release 생성으로 사용한다.
- `coupler-api`, `coupler-admin-web`, `coupler-mobile-app` 태그 push는 GitHub Release 또는 zip artifact를 자동 생성하지 않는다.
- `docs` 버전은 릴리스 기록 번호로 사용하고, 서비스 레포의 실제 배포 버전은 `버전 매핑`으로 별도 고정한다.
- 신규 릴리스 기록은 실제 새 릴리스 범위를 기록한 terminal 최종본으로 한 번 병합한다. nonterminal
  `planned | pending | in_progress` 기록의 PR은 Draft로 유지하고 terminal 전환 뒤에만 Ready/병합한다.
- `main`에 존재하는 terminal 릴리스 기록은 파일 전체가 불투명한 최종본이며 이후 수정·삭제·이름 변경·대체하지
  않는다. nonterminal 기록이 `main`에 잘못 병합된 경우에는 아래 `게시된 nonterminal 기록 복구`의 단일
  terminalization만 허용하며, 일반 사실 정정·증빙 backfill 예외로 확대하지 않는다.
- 기존 `content/releases/evidence/db-migrations/**` 파일은 과거 릴리스 기록의 일부로 불투명하게 보존하며
  수정·삭제·이름 변경·대체하지 않는다. 새 DB migration 절차는 이 경로에 plan·execution 파일을 만들지 않는다.
- `버전 매핑` 섹션은 이 기준 이후 작성하는 신규 릴리스 기록부터 필수로 둔다.
- `버전 매핑`에는 아래 기준점을 함께 기록한다.
    - `docs` 기록 버전/태그
    - `coupler-mobile-app` Android/iOS별 Store version/build와 릴리스 태그/커밋, 제출 마커 태그,
      NextPush label과 대상 Store binary
    - `coupler-api` 태그/커밋 또는 `N/A` 사유
    - `coupler-admin-web` 태그/커밋 또는 `N/A` 사유
- 신규 릴리스 기록의 작성 계약은 `release-metadata` block 하나다. 자동화의 기계 판정 SoT는 여기서 한 번 계산한 derived model이며, `버전 매핑`과 Gate 섹션은 사람이 읽는 mirror다. 자동화가 본문 자유 문장을 포함 신호로 해석하지 않게 작성한다.
- `release-metadata.schema`는 병합된 최신 계약과 일치해야 하며 현재 작성 계약은 `release-metadata/v3`다.
- `release-metadata`의 모든 하위 object는 작성 계약에 정의된 key만 허용한다. 새 nested key가 필요하면 descriptor 또는 cutover required path에 연결하고 unknown key fail-closed 테스트를 함께 갱신한다.
- `release-metadata.releaseScopes`는 실제 릴리스 surface의 단일 SoT이며 항상 `docs`를 포함한다.
- repo 검증 범위는 사람이 별도 입력으로 정하지 않고 `releaseScopes` descriptor에서 파생한다.
- `release-metadata.scopeResults`는 scope별 결과 상태와 증적의 단일 SoT다. key는 `releaseScopes`와 정확히 일치해야 하며, 각 scope의 `status`와 `evidence`만 보고 완료/rollback/대체 여부를 판단한다.
- 문서 전체 `release-metadata.status`는 `scopeResults`에서 파생한 상태와 일치해야 한다. 선행 완료 scope가 `released`이고 나머지가 `pending`이면 전체 상태는 `pending`, 장기 실행에서 일부 scope가 진행 중이면 `in_progress`, 완료된 scope와 후속 릴리스로 대체된 scope만 남으면 `superseded`다.
- 전체 `rolled_back`은 하나 이상의 scope가 실제 `rolled_back`이고 나머지 모든 scope도
  `released | rolled_back | superseded`로 terminal일 때만 파생한다. `planned | pending | in_progress`
  scope가 하나라도 남으면 전체는 `in_progress`이며 최종 기록으로 닫지 않는다.
- `docs` scope의 `released` 판정은 최종 릴리스 기록이 병합 가능한 상태로 확정되고 `versionMapping.docs.tag`에 병합 후 생성할 docs tag가 고정됐다는 뜻이다. 실제 origin tag, GitHub Release, `docs-site-vX.Y.Z.tar.gz` artifact는 final PR merge 뒤 확인하는 운영 postcheck이며, tag push 전 `scopeResults.docs.evidence` hard gate로 요구하지 않는다.
- `release-tag`는 metadata scope로 쓰지 않는다. 서비스 태그 요구는 `released`가 된 `docs`, `coupler-api`,
  `coupler-admin-web`, `mobile-store` scope에서 파생하며, `mobile-store`는 platform별 `verified` source에만
  실제 Store version과 같은 태그를 요구한다. `mobile-nextpush`는 NextPush-only 정책에 따라 기본적으로 모바일
  git tag를 요구하지 않는다.
- `superseded` scope는 완료 증적을 억지로 채우지 않는다. 대신 `supersededBy`, `incompleteReason`, `tagStatus`를 구조화해 어떤 후속 릴리스가 어떤 미완료 범위를 대체했고 태그를 만들지 않았는지 기록한다.
- 신규 `db-migration` scope는 별도 plan·execution·receipt artifact를 만들지 않는다. 개발계 `apply dev`가
  출력한 마이그레이션 소스 커밋을 그대로 checkout해 운영계 `status prod`와 `apply prod`를 수행한다. 실행기는
  그 커밋에 존재하는 정렬된 migration 파일과 각 DB의 기존 `schema_migrations` 적용 이력으로 pending을 계산한다.
- 과거 릴리스 기록과 기존 DB migration artifact는 현재 schema로 재해석하지 않고 경로·blob 불변성만 확인한다.
- `releaseScopes`에 포함된 `released` 또는 `rolled_back` scope의 증적은 실제 증빙이어야 하며 `N/A - <사유>`는 제외 범위 또는 완료 판정에 직접 쓰이지 않는 미적용 사유로만 사용한다.
- `rolled_back`은 사유만으로 닫지 않는다. descriptor가 전용 rollback evidence를 정의하면 그것을 사용하고,
  정의하지 않은 `contracts-package`, `mobile-store`, `mobile-nextpush`, `docs`는
  `scopeResults.<scope>.rollbackEvidence`에 실제 되돌림 결과를 기록한다. DB migration의 중단·복구는 이 변경에서
  새 자동 체계를 만들지 않고 전용 런북의 실패 규칙을 따른다.
- 릴리스 surface, required repo, scope별 결과 상태, terminal evidence 완료 조건을 판단하는 새 최상위 SoT를 추가하지 않는다. 같은 질문을 두 필드가 독립적으로 답할 수 있으면 drift, 예외 backfill, validator별 상수 복제가 생기므로 `releaseScopes` descriptor 또는 `scopeResults.<scope>` 아래 속성으로 흡수한다.
- SoT 분리가 불가피하다고 판단하면 기존 derived model로 표현할 수 없는 이유, 신구 필드 우선순위, drift 검출 방식, 마이그레이션/삭제 계획, 회귀 테스트를 릴리스 자동화 변경과 함께 기록한다.
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
  NextPush-only 릴리스에서 Store binary를 새로 출시하지 않으면 current Store consumer는 실제 fallback
  binary의 기존 contracts version을 그대로 기록하고, 새 contracts version은 current NextPush consumer에
  연결한다. 같은 OTA source를 current Store와 current NextPush에 중복 귀속하지 않는다. Mobile Store가
  release scope인 경우에만 current Store consumer를 current published contracts version과 일치시킨다.
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
- DB에는 별도 `Compatible | Cutover` metadata를 만들지 않는다. DB migration과 공개 API contract cutover는
  독립적으로 판정하며, 공개 API도 깨질 때만 API Gate를 함께 채운다.
- `versionMapping.coupler-mobile-app.nextPush`는 기존 단일 계약을 유지한다. app/deployment/label/target
  문자열과 exact source 40자 `commit`을 함께 기록하고 미적용 시 둘 다 `null`로 둔다. terminal 상태에서는
  `pending`, `미생성`, `대기` 같은 placeholder를 남기지 않는다.
- `release-metadata/v3`의 Mobile Store 기준은 `versionMapping.coupler-mobile-app.store.android|ios`로
  분리한다. 포함하지 않은 platform은 `null`이며, 정상 source는 `sourceStatus: verified`, 실제 platform
  version, 정확한 40자 commit, `limitation: null`을 함께 가져야 한다. nonterminal preflight에서는
  `releaseTag: null`로 현재 `origin/main` commit을 검증하고, `released`로 닫을 때 실제 platform version과 같은
  annotated tag를 필수로 고정한다. 이미 Store
  반영이 끝난 뒤 원본 archive와 exact source를 복구할 수 없는 과거 예외만
  `sourceStatus: unavailable-historical`로 기록하며 tag·commit은 `null`로 두고 한계를 구체적으로 적는다.
  이 예외는 rollback 기준이나 다음 릴리스의 source 증빙으로 재사용하지 않는다. 하나의 terminal
  `mobile-store` scope에는 최소 하나의 `verified` platform source가 있어야 한다.
- `release-metadata/v3`의 `scopeResults.mobile-store.evidence.submittedMarkers.android|ios`는 platform별
  submission provenance를 소유한다. 해당 platform의 submission-time marker가 있으면 `verified`로
  tag·commit·Store version/build·이관/삭제 증빙을 닫는다. 이미 게시된 기존 기록(v2 이하·metadata 미적용 legacy
  포함)의 공통 `submitted/mobile-*`는 그 기록에만 보존하며 v3 완료 증빙으로 승격하지 않는다. 과거 제출에서
  원래 platform marker가 없으면
  `unavailable-historical`로 두고 tag·commit·evidence를 `null`로 유지한 채 한계만 기록한다. 출시 뒤
  사후 생성한 marker는 `verified` 완료 증빙으로 계산하지 않는다.
- terminal evidence hard gate는 terminal 상태의 거짓 완료를 막는 조건에만 추가한다.
  `planned`/`pending`/`in_progress`의 아직 도달하지 않은 후속 artifact와 준비 중 placeholder,
  `releaseScopes`에서 제외한 범위, 사람이 읽는 참고 증빙의 세부 형식은 완료 증빙으로 요구하지 않는다.
  단, 이미 존재하는 구조화 artifact의 closed shape·환경 순서·bytes SHA는 fail-closed 검증하고, 미병합 PR
  preflight 기준점은 운영계 실행의 admission invariant로 사용한다.
- 태그 push, GitHub Release 생성, Store 심사/승인처럼 운영 액션 이후에만 생기는 산출물을 해당 액션의 사전 hard gate로 요구하지 않는다. 사전 조건은 preview/품질 검증/기준점 고정으로 막고, 사후 조건은 postcheck한다. 실패나 사실 오류는 기존 기록을 바꾸지 않고 이슈·장애 기록에서 추적한다. 실제 새 운영 반영이 없으면 정정용 릴리스 기록을 만들지 않는다.
- 새 hard gate를 추가하려면 `releaseScopeDescriptors` 또는 기존 descriptor에만 연결하고, 누락 실패 테스트, 정상 통과 테스트, 제외 scope 미차단 테스트, policy/flow/template 동기화를 같은 변경에 포함한다.
- 즉, 문서 릴리스는 "문서만의 버전"이 아니라 "해당 시점 서비스 구성 버전"의 인덱스 역할을 하며, 서비스 레포가 항상 같은 버전 번호를 가져야 한다는 뜻은 아니다.
- 운영 릴리스 실행 전 `yarn release:continue vX.Y.Z`는 `releaseScopes`와 `extraRepoRefs`에서 derived
  `preflightRepoNames`와 `requiresServiceWorkspace`를 계산한다. 현재 Draft PR head·CI와 내부 preflight가 원격에
  push된 docs clean non-main branch의 `HEAD == origin upstream`, 최신 `origin/main` 포함, metadata
  `pending | in_progress`, 아직 nonterminal인 scope의 서비스 레포 clean `main == origin/main`, 전체 버전 매핑
  기준점을 확인한다. 이미 terminal인 scope의 repo는 원격 ref를 다시 확인하되 로컬 branch·dirty 상태로 재개를
  막지 않는다.
  서비스 배포는 릴리스 기록에 고정한 SHA만 사용하며, 해당 SHA는 `main`에 포함된 commit이어야 한다.
  docs 기록이 이미 `origin/main`에 있으면 과거 기록을 읽지 않고 실패한다. DB migration 실행 범위는 Docs
  artifact가 아니라 `coupler-api`의 마이그레이션 소스 커밋으로 고정한다.
- 서비스 버전 매핑의 태그 전 기준점과 태그 확정은 [릴리스 태그 정책](release-tag-policy.md)의
  `서비스 배포-태그 연속 실행`을 따른다. 확인된 원격 annotated tag와 commit을 불변 릴리스 기준으로 기록하며,
  이후 `main` 전진으로 바꾸지 않는다.
- 장기·메이저 릴리스도 열린 docs PR과 릴리스 기록을 공유 제어판으로 사용한다. `planned`는 로컬 초안으로만
  사용하고 scope와 기준점이 고정된 첫 원격 후보를 `pending`으로 만든다. 이후 외부 handoff와 terminal 전환만
  같은 PR에 checkpoint로 누적하며, 최종 `released` 검증 전에는 PR을 병합하거나 docs 태그를 만들지 않는다.

### 게시된 nonterminal 기록 복구

- 진입 조건은 `main`의 기록이 `pending`, docs scope만 `pending`, 나머지 모든 scope가 `released`이고 해당 docs
  tag와 GitHub Release가 모두 없음을 원격에서 확인한 경우로 닫는다. 하나라도 다르면 이 복구를 사용하지 않고
  이슈·장애 기록에서 별도 처분을 결정한다.
- 복구 PR은 전체 상태와 docs scope를 `released`로 한 번 전환하고 docs summary 및 사람이 읽는 `전체 상태`·
  `완료 범위`·`대기 범위`·`현재 결과`·`기록 복구`·`남은 범위` bullet만 정렬할 수 있다. 다른 scope
  metadata/evidence, 버전 매핑, API cutover와 그 밖의 본문은 base ref와 byte-equivalent여야 한다.
- validator는 위 허용 집합 밖의 수정·삭제·개명·재복구를 fail-closed로 거부하고, 복구 후보 전체를 현행 schema와
  terminal evidence Gate로 다시 검증한다. 복구 PR은 terminal 후보이므로 Draft 강제 대상이 아니며 병합 뒤
  해당 파일은 일반 terminal 불변 규칙으로 돌아간다.
- 복구 병합 커밋은 Final Record Gate commit이며, tag 전 준비 결함이 있으면 아래 Docs Tag Preparation Fix
  규칙을 동일하게 적용한다.

### Docs Tag Preparation Fix

- Final Record Gate 뒤 tag 전 preview에서 Release Note 생성기 또는 tag-readiness 자체의 결함이 발견되면,
  tag와 GitHub Release가 모두 없는 동안에만 **Tag Preparation Fix**를 후속 PR로 병합할 수 있다. 릴리스 기록
  blob은 Final Record Gate commit과 byte-equivalent여야 하며, 변경 경로는 Release Note 생성기·그 테스트·
  tag-readiness validator·그 테스트와 이 절차를 소유한 Release Process·Release Tag Policy·Docs 릴리스
  마감 런북으로 닫는다.
- Tag Preparation Fix가 없으면 Final Record Gate commit, 있으면 마지막 Fix가 병합된 최신 `origin/main`이 최종
  docs tag 대상이다. 태그 전용 validator는 main의 first-parent 이력에서 최초 `released` Final Record Gate
  commit을 고정하고, 그 뒤 모든 commit이 건드린 path의 합집합이 위 허용 집합과 정확히 일치하는지, 릴리스
  기록이 다시 수정되지 않았는지와 전체 상태·docs scope·version mapping tag의 `released`/exact 일치를 함께
  확인한다. 후보 preview 독립 리뷰와 같은 `origin/main` commit의 Pages workflow 검증을 통과하기
  전에는 annotated tag 단계로 진행하지 않는다. terminal PR·Tag Preparation Fix의 검증을 병합
  commit에서 로컬로 반복하지 않고, Pages workflow가 실제 `origin/main` commit을, tag workflow가 tag
  artifact를 각각 검증한다.
- 이 Gate는 릴리스 사실·scope·일반 문서 내용을 다시 여는 수단이 아니다. 허용 경로 밖의 변경, 릴리스 기록
  수정, tag 또는 Release 생성 뒤의 보정은 fail-closed로 거부하고 별도 후속 버전에서 처리한다.
- Tag Preparation Fix 진입과 tag 생성 직전에는 원격 tag fetch뿐 아니라 GitHub Releases 목록 API로 같은 tag의
  published·draft Release가 모두 0건인지 확인한다. 하나라도 있으면 Fix 병합이나 tag 생성을 진행하지 않는다.

## 태그 규칙

- 태그 이름, 생성 시점, 제출 마커 태그, 증빙 기준은 [릴리스 태그 정책](release-tag-policy.md)을 따른다.
- 이 문서는 태그와 릴리스 상태·기록·docs GitHub Release 사이의 완료 조건만 정의한다. 실제 실행 순서는
  [릴리스 게이트 플로우](../flows/cross-project/release-automation-pipeline.md)을 따른다.
- 일부 범위만 완료된 릴리스의 `docs/content/releases/vX.Y.Z.md`는 전체 릴리스 상태를 `released`로 닫지 않고, 완료/대기 범위를 구분해 기록한다.

## 릴리스 기록 상태값

- `planned`: 릴리스 계획 또는 초안이 작성됐지만 운영 반영이 완료되지 않은 상태
- `pending`: 릴리스 범위와 기준 SHA가 고정되고 원격 PR head 및 해당 head에 적용된 필수 CI를 확인해 운영
  반영을 기다리는 상태
- `in_progress`: 일부 범위는 완료됐고 하나 이상의 운영 반영/검증 범위가 아직 대기 중인 상태
- `released`: 포함 범위의 운영 반영/검증/서비스 태그/기록이 완료됐고, final PR merge 뒤 만들 docs 태그가 고정된 상태
- `rolled_back`: 운영 반영 후 문제로 해당 릴리스 기준점에서 되돌린 상태
- `superseded`: 일부 대기 범위를 완료하지 않은 채 후속 릴리스가 동일 또는 상위 범위를 대체해, 더 이상 해당 릴리스를 완료 대상으로 추적하지 않는 상태
- `violated`는 전체 릴리스 상태가 아니라 `apiContractCutover`의 terminal Gate 결과다. 이미
  운영 반영된 API cutover에서 사전 Gate 위반을 사후 확인했을 때만 사용하며 릴리스 자체는 실제 scope 결과에
  따라 `released`로 닫는다.
- `superseded`로 닫을 때는 대체한 후속 릴리스, 완료하지 않은 범위, 태그 생성 여부, 후속 추적 불필요 사유를 릴리스 기록에 남긴다.
- `released`, `rolled_back`, `superseded`로 닫힌 기록을 `planned`, `pending`, `in_progress`로 되돌리지 않는다.
  `main` 병합 뒤 기록은 내용과 상태를 재판정하지 않는다. 단, 위 진입 조건을 모두 만족하는 게시된
  nonterminal 기록은 서비스 사실을 바꾸지 않는 단일 terminalization으로 이 불변조건을 복구한다. 실제 후속
  운영 반영 또는 rollback을 실행하면 그 실행의 새 기록을 만들고, 단순 사실 정정은 이슈·장애 기록에서만 추적한다.

## 운영 상태 전이 기준

- `pending`은 릴리스 scope, 서비스 commit SHA, Store version/build, API contract comparison ref, 검증
  시나리오, rollback 기준이 고정되어 운영 실행을 시작할 수 있는 상태다. 자동 검증은 PR 내부 커밋의 상태
  순서나 과거 snapshot을 검사하지 않고 현재 최종본만 검증한다.
- `in_progress`는 일부 범위가 이미 끝났지만 외부 승인이나 후속 범위가 남아 단일 실행에서 바로 `released`로 전환할 수 없는 장기 릴리스에 사용한다.
- 개발계 migration은 [DB Migration 실행 런북](../flows/cross-project/db-migration-operation-flow.md)의
  `status dev`와 `apply dev`로 실행한다. 운영계는 개발계에서 확인한 정확한 커밋을 checkout한 뒤 `status prod`와
  `apply prod`를 실행한다. 이후 `main`에 추가된 migration은 해당 커밋에 없으므로 이번 운영 적용에 섞이지 않는다.
- Store 심사처럼 외부 대기가 있는 범위는 제출 마커 태그와 대기 범위를 남기고 `in_progress`로 유지한다.
- Store 승인, 운영 출시, 기본 smoke, 모바일 릴리스 태그, 제출 마커 증빙 이관/삭제가 끝나기 전에는 Mobile Store 범위를 `released`로 닫지 않는다.
- 후속 릴리스가 대기 중인 Store 또는 cutover 범위를 대체하면 억지 완료 증빙을 만들지 않고 `superseded`로 닫는다.
- `docs` GitHub Release와 site artifact는 docs tag push 이후 생성되므로 artifact URL을 병합된 릴리스 기록에
  되채우지 않는다. Release workflow 실패, Release 본문·artifact 누락 또는 사실 오류도 기존 기록을 수정하지
  않는다. 이슈·장애 기록에서 추적하며, 실제 새 운영 반영이 없으면 정정용 docs 버전을 만들지 않는다.
- 이 상태 계약을 실제 Gate 순서에 적용하는 절차는
  [릴리스 게이트 플로우](../flows/cross-project/release-automation-pipeline.md)을 따른다.

## 버전 올리는 기준 (SemVer)

- `MAJOR`: 호환 깨짐(Breaking change)
- `MINOR`: 기능 추가(하위 호환 유지)
- `PATCH`: 버그 수정/핫픽스(하위 호환 유지)

## Docs 배포와 불변 규칙

- `docs` `main` push는 문서 사이트 배포, `v*.*.*` tag push는 Docs GitHub Release 생성의 기준점이다.
- 신규 릴리스 기록은 `content/templates/release-record-template.md`를 사용한다. 태그 시점에 해당
  기록이 포함돼 있으면 Release Note의 1차 원본으로 사용하고, 이전 기준점 대비 git log는 보조 이력으로만
  사용한다.
- docs tag push 전에는 Release Note preview, 태그 후보와 같은 `origin/main` commit의 Pages workflow,
  [문서 안정성 평가](document-governance-policy.md)를 완료한다. terminal PR·Tag Preparation Fix의 `yarn verify`를
  병합 commit에서 로컬로 반복하지 않는다. Release와 site artifact는 tag push 뒤
  postcheck하며 사전 metadata hard gate로 사용하지 않는다.
- `main`에 병합된 terminal 릴리스 기록과 이미 발행한 Release Note는 해당 버전의 최종본이다. 기존 릴리스
  기록 파일은 수정·삭제·이름 변경·대체하지 않는다. 게시된 nonterminal 기록은 태그/Release 생성 전의
  fail-closed terminalization만 위 복구 절차로 허용한다.
- Release workflow 실패, Release 본문·artifact 누락, 사실 오류 또는 증빙 보강은 기존 버전과 릴리스
  기록을 바꾸지 않고 이슈·장애 기록에서 추적한다. 실제 rollback 또는 대체 운영 반영을 수행할 때만 새 docs
  버전의 릴리스 기록을 만들고 원래 버전과 후속 사유를 참조한다. 새 기록은 Release Note preview,
  `yarn verify`, 문서 안정성 평가 `No Findings`, 새 tag/Release/artifact postcheck를 모두 통과해야 한다.
- 실제 preview·tag·postcheck 명령은
  [운영 릴리스 실행 런북](../flows/cross-project/production-deploy-command-runbook.md)의 `Docs 릴리스 마감`을 따른다.

## 체크리스트

- [ ] 포함·제외 scope와 `N/A` 근거가 release metadata와 사람이 읽는 mirror에서 일치하는가?
- [ ] 전체 상태가 scope 결과에서 파생된 상태와 일치하고, 허용되지 않은 역전이나 기준점 변경이 없는가?
- [ ] terminal scope의 증빙이 공통 schema/descriptor 계약을 충족하며 placeholder로 완료를 대신하지 않는가?
- [ ] DB migration이 있으면 개발계에서 적용·검증한 마이그레이션 소스 커밋과 운영계 checkout이 정확히 같은가?
- [ ] 사전 Gate와 tag/Release/Store 같은 사후 산출물이 분리돼 순환 hard gate를 만들지 않는가?
- [ ] 태그 판정은 [릴리스 태그 정책](release-tag-policy.md), Gate 순서는 릴리스 게이트 플로우, 실행 라우팅과
      공통 명령은 운영 릴리스 실행 런북을 단일 기준으로 사용하는가?
- [ ] nonterminal 릴리스 PR이 Draft이며 terminal 후보에서만 Ready/병합되는가?
- [ ] `main`에 존재하는 릴리스 기록이 변경·삭제·이름 변경·대체·재검증되지 않았는가? 예외라면 게시된
      nonterminal 복구의 진입 조건·exact 허용 집합·원격 tag/Release 부재·단일 terminalization을 모두 충족하는가?
- [ ] 정정만을 위한 새 버전을 만들지 않았는가?

## 관련 문서

- [릴리스 태그 정책](release-tag-policy.md)
- [엔지니어링 가드레일](engineering-guardrails.md)
- [테스트/CI 전략](testing-strategy.md)
- [문서 거버넌스 정책](document-governance-policy.md)
- [릴리스 게이트 플로우](../flows/cross-project/release-automation-pipeline.md)
- [운영 릴리스 실행 런북](../flows/cross-project/production-deploy-command-runbook.md)
- `content/templates/release-record-template.md`
