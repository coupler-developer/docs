# X.Y.Z 릴리스 실행 기록

```release-metadata
{
  "schema": "release-metadata/v1",
  "version": "vX.Y.Z",
  "status": "pending",
  "releaseScopes": [
    "docs"
  ],
  "extraRepoRefs": [],
  "versionMapping": {
    "docs": {
      "tag": null,
      "commit": null
    },
    "coupler-api": {
      "tag": null,
      "commit": null
    },
    "coupler-admin-web": {
      "tag": null,
      "commit": null
    },
    "coupler-mobile-app": {
      "store": null,
      "releaseTag": null,
      "commit": null,
      "nextPush": null
    }
  },
  "scopeResults": {
    "docs": {
      "status": "pending",
      "summary": "배포 기준을 고정한 뒤 최종 릴리스 기록과 docs tag를 준비한다.",
      "evidence": {}
    }
  },
  "apiContractCutover": null
}
```

## 문서 역할

- 역할: `시나리오`
- 문서 종류: `flow`
- 충돌 시 우선 문서: `policy/release-process.md`, 태그 기준은 `policy/release-tag-policy.md`
- 기준 성격: `as-is`

## 목적

- `vX.Y.Z` 릴리스의 실제 반영 결과와 검증 근거를 한 문서에 고정한다.

## 범위

- 대상:
- 포함 범위:
- 제외 범위:

## 상위 규범 문서

- [배포/릴리즈 프로세스](../policy/release-process.md)
- [배포 태그 정책](../policy/release-tag-policy.md)
- [테스트/CI 전략](../policy/testing-strategy.md)

## 릴리스 상태

- 목표 버전: `vX.Y.Z`
- 전체 상태: `pending`
- 완료 범위: 배포 scope, 기준 SHA, 검증 시나리오, rollback 기준 고정
- 대기 범위: 포함 범위별 운영 배포, smoke, 서비스 태그, 최종 기록

## 버전 매핑

- `docs`: 기록 버전 `vX.Y.Z`, 태그 `vX.Y.Z 또는 N/A`, 커밋 `pending 또는 N/A`
- `coupler-api`: 태그 `vX.Y.Z 또는 N/A`, 커밋 `sha 또는 N/A`
- `coupler-admin-web`: 태그 `vX.Y.Z 또는 N/A`, 커밋 `sha 또는 N/A`
- `coupler-mobile-app`: Store `version (build) 또는 N/A`, 릴리스 태그 `vX.Y.Z 또는 N/A`, 커밋 `sha 또는 N/A`, NextPush `label 또는 N/A`
- `coupler-mobile-app` 제출 마커 태그:
- 제출 마커 증빙 이관/삭제:

## 작성 기준

- `대상`, `포함 범위`, `제외 범위`는 빈칸으로 두지 않고 이번 릴리스의 실제 범위를 적는다.
- `release-metadata` block은 preflight가 읽는 작성 계약이다. JSON 문법을 지키고 `schema`는 `release-metadata/v1`로 둔다.
- `release-metadata.schema` 버전은 병합된 최신 계약과 일치해야 한다. 아직 `main`에 합쳐지지 않은 로컬/작업 브랜치 변경만으로 `v2`, `v3`, `v4`처럼 올리지 않는다.
- 자동화의 기계 판정 SoT는 `release-metadata`에서 한 번 계산한 derived model이다. Markdown 본문은 사람이 읽는 mirror이며 본문 자유 문장이 새 포함 범위나 cutover 포함 신호가 되지 않게 작성한다.
- `release-metadata` 하위 object에는 템플릿과 descriptor가 정의한 key만 쓴다. 임의 nested key로 별도 상태/증빙 축을 만들지 않는다.
- `releaseScopes`는 실제 릴리즈 surface의 단일 SoT다. 값은 `db-migration`, `contracts-package`, `coupler-api`, `coupler-admin-web`, `mobile-store`, `mobile-nextpush`, `docs` 중에서 고르고, 항상 `docs`를 포함한다.
- repo 검증 범위는 사람이 직접 쓰지 않고 `releaseScopes` descriptor에서 파생한다.
- `scopeResults`는 scope별 결과 상태와 증적의 단일 SoT다. 각 key는 `releaseScopes`와 정확히 일치해야 하며, scope별 `status`는 `planned`, `pending`, `in_progress`, `released`, `rolled_back`, `superseded` 중 하나다.
- 문서 전체 `status`는 `scopeResults`에서 파생되는 상태와 일치해야 한다. 선행 완료 scope가 `released`이고 나머지가 `pending`이면 전체 상태는 `pending`, 장기 실행에서 일부 scope가 진행 중이면 `in_progress`, 완료된 scope와 후속 릴리스로 대체된 scope만 남으면 `superseded`다.
- `docs` scope의 `released`는 최종 기록이 병합 가능한 상태이고 병합 후 생성할 docs tag가 `versionMapping.docs.tag`에 고정됐다는 뜻이다. 실제 origin tag, GitHub Release, `docs-site-vX.Y.Z.tar.gz` artifact는 final PR merge 뒤 postcheck로 확인한다.
- `release-tag`는 metadata scope로 쓰지 않는다. 서비스 태그 요구는 `released`가 된 `coupler-api`, `coupler-admin-web`, `mobile-store`, `docs` scope에서 파생한다. `mobile-nextpush`는 NextPush-only 정책에 따라 기본적으로 모바일 git tag를 요구하지 않는다.
- `superseded` scope는 완료 증적을 억지로 채우지 않는다. 대신 `supersededBy`, `incompleteReason`, `tagStatus`를 구조화해 대체 릴리스, 완료하지 않은 범위, 태그 생성 여부를 기록한다.
- `coupler-api`를 `released`로 닫을 때는 `scopeResults.coupler-api.evidence.deployment`, `smoke`, `rollback`과 `versionMapping.coupler-api.tag`를 concrete 값으로 채운다.
- `coupler-admin-web`를 `released`로 닫을 때는 `scopeResults.coupler-admin-web.evidence.deployment`, `smoke`, `rollback`과 `versionMapping.coupler-admin-web.tag`를 concrete 값으로 채운다.
- `contracts-package`를 `released`로 닫을 때는 `scopeResults.contracts-package.evidence.publishedPackage`, `workflow`, `sourceRef`를 concrete 값으로 채운다.
- `db-migration`을 `released`로 닫을 때는 `scopeResults.db-migration.evidence.sqlRefs`, `gateResults`, `preflightLog`, `ledger.dev`, `ledger.prod`, `postcheckLog`, `rollbackPlan`을 구조화해 채운다. SQL은 `coupler-api` PR에 포함된 repo-relative `.sql` 파일 경로와 SHA-256 checksum을 참조해야 한다.
- `mobile-store`를 `released`로 닫을 때는 `scopeResults.mobile-store.evidence.submission`, `approval`, `release`, `smoke`, `artifact`, `submittedMarkers`와 `versionMapping.coupler-mobile-app.releaseTag`를 concrete 값으로 채운다.
- `mobile-nextpush`를 `released`로 닫을 때는 `scopeResults.mobile-nextpush.evidence.app`, `productionLabel`, `targetBinary`, `uploadedAt`, `rollout`, `mandatory`, `disabled`를 concrete 값으로 채운다.
- 추가 스냅샷 또는 비교 기준으로만 고정할 repo가 있으면 `extraRepoRefs`에 `docs`, `coupler-api`, `coupler-admin-web`, `coupler-mobile-app` 중 canonical name을 적는다. `extraRepoRefs`는 release 완료 조건을 새로 만들지 않는다.
- `포함 범위`와 `제외 범위`는 사람이 읽는 실행 계약이다. 배포 범위(`DB migration`, `coupler-api`, `coupler-admin-web`, `Mobile Store`, `Mobile NextPush`, `docs`, `Tag/Release Record`)별로 완료/제외를 구분한다.
- 제외한 범위와 완료 판정에 직접 쓰이지 않는 `N/A` 항목은 미적용 사유와 근거를 함께 적는다.
- `released` 또는 `rolled_back` scope의 완료/rollback 증적은 실제 workflow, Gate, smoke, artifact, rollback 기준 같은 concrete 증빙으로 채우며 `N/A - <사유>`로 대체하지 않는다.
- `preflightRepoNames`는 `docs + releaseScopes.requiredRepoRefs + extraRepoRefs`로 계산한다.
- `preflightRepoNames`가 `docs`뿐인 릴리스 기록은 서비스 repo workspace 없이 docs-only preflight를 실행할 수 있다.
- 서비스 레포가 `preflightRepoNames`에 포함되면 preflight 실행 시 해당 repo가 있는 workspace root가 필요하다.
- preflight 검증 대상 릴리즈 기록에서 `preflightRepoNames`에 포함된 서비스 레포의 `versionMapping` ref는 릴리스 상태와 무관하게 실행 시점의 현재 `origin/main` 기준점과 같아야 한다.
- `docs`의 릴리즈 기준점은 `versionMapping.docs.tag`와 실제 docs tag commit으로 확인한다. 릴리즈 기록 문서 안의 `versionMapping.docs.commit`에는 자기 자신을 안정적으로 가리키는 concrete SHA를 적지 않는다.
- `docs` scope가 `released`이면 `versionMapping.docs.tag`를 목표 버전으로 고정한다. 실제 origin annotated tag는 final PR merge 뒤 병합된 main 커밋에 생성하고 postcheck하며, tag commit은 `origin/main` 계보에 있어야 한다.
- `preflightRepoNames`에 포함된 서비스 레포는 `versionMapping`에 확인 가능한 `tag`/`releaseTag` 또는 `commit` SHA를 적는다. 태그가 아직 없으면 `tag: null`과 현재 `origin/main` 기준 `commit` SHA를 함께 적는다.
- 서비스 레포 태그를 적으면 origin에서 확인 가능한 annotated tag여야 하며, 태그와 커밋 SHA를 함께 적을 때는 둘이 같은 커밋을 가리켜야 한다.
- `docs` 태그는 릴리스 기록과 Release Note 기준점이고, 서비스 레포 태그를 대체하지 않는다.
- Mobile Store 제출, Mobile Store 출시, Mobile NextPush 배포는 각각 별도 상태와 증빙으로 적는다.
- `versionMapping.coupler-mobile-app.nextPush`는 NextPush app/deployment/label 문자열 또는 `null`만 쓴다. NextPush가 없으면 `null`로 두고 Markdown mirror에는 `N/A` 사유를 적는다.
- Store 심사 중이거나 NextPush 적용 전이면 해당 scope와 전체 상태를 `released`로 닫지 않는다.
- Store 심사/승인/출시처럼 외부 대기가 있는 범위는 제출 마커와 대기 범위를 남기고 `planned`, `pending`, `in_progress` 중 실제 단계에 맞는 상태로 유지한다. Store 승인, 운영 출시, 기본 smoke, 모바일 릴리스 태그, 제출 마커 증빙 이관/삭제가 끝난 뒤에만 `mobile-store` scope를 `released`로 닫는다.
- 후속 릴리스가 대기 범위를 대체하면 억지 완료 증빙을 만들지 않고 `superseded`로 닫는다.
- 전체 `released` 상태에는 `대기 범위` 값을 비우거나 `N/A`로 적는다.
- `planned`/`pending`/`in_progress` 상태에서는 아직 확인 전인 값에 `pending`, `미생성` 같은 placeholder를 쓸 수 있다.
- 일반 릴리즈는 이 템플릿을 채운 `pending` 첫 커밋을 Draft PR에 push하고, `yarn release:preflight --pending-ref <40자 pending commit SHA>`를 통과한 뒤 PR을 병합하지 않은 채 배포한다.
- 운영 반영, smoke, 서비스 태그가 끝나면 같은 PR의 두 번째 커밋에서 `released`로 전환한다. 이때 `releaseScopes`, `extraRepoRefs`, 서비스 commit SHA, Mobile Store version/build, API contract comparison ref는 `pending` 커밋과 같아야 한다.
- `planned`는 범위나 기준 SHA가 아직 고정되지 않은 초안 공유가 필요한 경우에만 선택적으로 사용하며 배포 시작 기준이 아니다.
- `released` 전체 CI와 리뷰가 끝날 때까지 PR을 Draft로 유지하고, Ready 전환 뒤 한 번만 병합한다.
- `released`, `rolled_back` scope의 태그와 커밋은 실제 확인 가능한 ref로 적는다.
- `released`, `rolled_back` scope에서는 scope descriptor가 요구하는 evidence에 `null`, `N/A`, `N/A - <사유>`, `pending`, `미생성`, `미검증`, `미완료`, `심사 중`, `대기` 같은 placeholder나 미적용 사유를 남기지 않는다.
- `버전 매핑` 섹션은 사람이 읽는 mirror다. 자동화 기준은 `release-metadata.versionMapping`이며, 둘이 서로 다른 기준점을 가리키지 않게 같이 갱신한다.
- API contract cutover가 포함되면 `release-metadata.apiContractCutover`를 cutover 상태/비교 기준/운영 cutover 증적의 기계 판정 SoT로 채우고, contracts package publish 증적은 `scopeResults.contracts-package.evidence.publishedPackage`에 둔다. 이때만 `content/templates/api-contract-cutover-gate-template.md`의 `API contract cutover Gate` 섹션을 `검증 근거` 아래에 삽입하고 사람이 읽는 mirror로 채운다.
- API contract cutover가 없으면 `apiContractCutover: null`로 두고 `API contract cutover Gate` 섹션을 만들지 않는다. `검증 근거`에는 `N/A - API 계약 변경 없음`처럼 사유만 남긴다.
- 이 기본 템플릿은 non-cutover 기본형이다. API contract cutover가 포함된 릴리스에서만 `content/templates/api-contract-cutover-gate-template.md`의 cutover Gate 항목을 별도로 삽입한다.
- 검증 근거에는 명령, 응답, 로그, workflow URL 또는 수동 검증 결과를 남긴다.
- 개인 사용자명, 로컬 home/tmp 절대 경로, 비공개 secret은 릴리스 기록에 남기지 않는다.
- 운영 반영 시각, Store 상태, NextPush 상태처럼 변할 수 있는 값은 확인 시각과 timezone을 같이 적는다.
- 롤백 기준은 포함 범위별로 적고, 제외 범위는 `N/A` 사유를 적는다.

## 릴리스 결과

- 결과를 범위별로 기록한다.

## 메인 흐름

1. 릴리스 범위를 확정한다.
2. 포함 범위별 배포와 검증을 수행한다.
3. 서비스 태그와 docs 릴리스 기록을 확정한다.

## 검증 근거

- 검증 명령, 응답, 로그, workflow URL 또는 수동 검증 결과를 기록한다.
- API contract cutover 포함 시 `force_update`/`min_version` 강제 업데이트 차단 근거를 기록한다.
- API contract cutover 포함 시 contracts package publish version과 Mobile/Admin 소비 경로 검증 근거를 기록한다. Admin/Mobile이 generated copy를 소비하는 동안에는 `Release Contracts` workflow가 발행한 `@coupler-developer/coupler-api-contracts@x.y.z` version을 `scopeResults.contracts-package.evidence.publishedPackage`에 기록하고 exact match 검증 근거를 함께 남긴다. package dependency 전환 후에는 Mobile/Admin `package.json`/lockfile dependency version, consumer import path, 각 소비자 레포 품질 게이트 결과를 기록한다.
- API contract cutover가 없으면 `N/A - API 계약 변경 없음`처럼 사유만 남기고 `API contract cutover Gate` 섹션은 만들지 않는다.

### Mobile 개발계 QA 빌드 기록

개발계 API 확인용 QA 빌드가 있으면 기록한다. 이 기록은 운영 Store 출시, Mobile NextPush 적용, 서비스 태그 생성 근거로 사용하지 않는다.

- 기록일:
- API 대상:
- iOS TestFlight QA 빌드:
- Android QA APK:
- 운영 릴리즈 전 확인:

## 롤백 기준

- 범위별 롤백 기준점과 금지 사항을 기록한다.

## 후속 작업

- 남은 대기 범위와 완료 조건을 기록한다.
