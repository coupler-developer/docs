# X.Y.Z 릴리스 실행 기록

```release-metadata
{
  "schema": "release-metadata/v3",
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
      "store": {
        "android": null,
        "ios": null
      },
      "nextPush": null,
      "commit": null
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
- `coupler-api`: 태그 `vX.Y.Z 또는 N/A`, 커밋 `sha`
- `coupler-admin-web`: 태그 `vX.Y.Z 또는 N/A`, 커밋 `sha`
- `coupler-mobile-app`: Android Store `version (build) 또는 N/A`, Android 릴리스 태그 `vX.Y.Z 또는 N/A`, Android 커밋 `sha 또는 N/A`, Android source `verified 또는 unavailable-historical`, iOS Store `version (build) 또는 N/A`, iOS 릴리스 태그 `vX.Y.Z 또는 N/A`, iOS 커밋 `sha 또는 N/A`, iOS source `verified 또는 unavailable-historical`, NextPush `app/deployment/label/target 또는 N/A`, NextPush 커밋 `sha 또는 N/A`
- `coupler-mobile-app` 제출 마커 태그:
- 제출 마커 증빙 이관/삭제:

## 작성 기준

- `대상`, `포함 범위`, `제외 범위`는 빈칸으로 두지 않고 이번 릴리스의 실제 범위를 적는다.
- `release-metadata` block은 preflight가 읽는 작성 계약이다. JSON 문법을 지키고 `schema`는
  `release-metadata/v3`로 둔다.
- `release-metadata.schema` 버전은 병합된 최신 계약과 일치해야 한다. 아직 `main`에 합쳐지지 않은
  로컬/작업 브랜치 변경만으로 임의로 올리지 않는다.
- 자동화의 기계 판정 SoT는 `release-metadata`에서 한 번 계산한 derived model이다. Markdown 본문은 사람이 읽는 mirror이며 본문 자유 문장이 새 포함 범위나 cutover 포함 신호가 되지 않게 작성한다.
- `release-metadata` 하위 object에는 템플릿과 descriptor가 정의한 key만 쓴다. 임의 nested key로 별도 상태/증빙 축을 만들지 않는다.
- Mobile Store mapping은 `store.android`와 `store.ios`를 별도로 둔다. 포함하지 않은 플랫폼은 `null`이다.
  정상 source는 `sourceStatus: verified`, 정확한 40자 `commit`, `limitation: null`을 사용한다. nonterminal
  preflight에서는 `releaseTag: null`로 현재 `origin/main`을 검증하고, `released` 전환 때 실제 platform version과
  같은 annotated `releaseTag`를 고정한다. 이미 출시됐지만 archive/source를 복구할 수 없는 과거 예외만
  `sourceStatus: unavailable-historical`, `releaseTag: null`, `commit: null`, 구체적인 `limitation`을 사용한다.
- Mobile NextPush는 기존 단일 계약을 유지한다. `nextPush`에는 app/deployment/label/target 문자열을,
  `commit`에는 exact source 40자 SHA를 기록하며 미적용 시 둘 다 `null`로 둔다.
- Mobile Store scope의 `submittedMarkers.android|ios`는 `verified` 또는 `unavailable-historical` closed
  shape를 사용한다. `verified`는 공통 또는 platform별 submission tag, exact commit, artifact SHA-256, 이관·삭제 증빙과
  `limitation: null`을 요구한다. 원래 marker/hash가 없는 과거 예외는 tag·commit·artifact/evidence를 모두
  `null`로 두고 구체적인 `limitation`만 기록한다. 사후 생성 marker를 `verified`로 바꾸지 않는다.
- `releaseScopes`는 실제 릴리즈 surface의 단일 SoT다. 값은 `db-migration`, `contracts-package`, `coupler-api`, `coupler-admin-web`, `mobile-store`, `mobile-nextpush`, `docs` 중에서 고르고, 항상 `docs`를 포함한다.
- repo 검증 범위는 사람이 직접 쓰지 않고 `releaseScopes` descriptor에서 파생한다.
- `scopeResults`는 scope별 결과 상태와 증적의 단일 SoT다. 각 key는 `releaseScopes`와 정확히 일치해야 하며, scope별 `status`는 `planned`, `pending`, `in_progress`, `released`, `rolled_back`, `superseded` 중 하나다.
- 문서 전체 `status`는 `scopeResults`에서 파생되는 상태와 일치해야 한다. 선행 완료 scope가 `released`이고 나머지가 `pending`이면 전체 상태는 `pending`, 장기 실행에서 일부 scope가 진행 중이면 `in_progress`, 완료된 scope와 후속 릴리스로 대체된 scope만 남으면 `superseded`다.
- 전체 `rolled_back`은 하나 이상의 scope가 실제 `rolled_back`이고 나머지 scope가 모두
  `released | rolled_back | superseded`일 때만 쓴다. 준비·대기·진행 scope가 남아 있으면 전체 상태는
  `in_progress`다.
- `docs` scope의 `released`는 최종 기록이 병합 가능한 상태이고 병합 후 생성할 docs tag가 `versionMapping.docs.tag`에 고정됐다는 뜻이다. 실제 origin tag, GitHub Release, `docs-site-vX.Y.Z.tar.gz` artifact는 final PR merge 뒤 postcheck로 확인한다.
- `release-tag`는 metadata scope로 쓰지 않는다. 서비스 태그 요구는 `released`가 된 `coupler-api`, `coupler-admin-web`, `mobile-store`, `docs` scope에서 파생한다. `mobile-nextpush`는 NextPush-only 정책에 따라 기본적으로 모바일 git tag를 요구하지 않는다.
- `superseded` scope는 완료 증적을 억지로 채우지 않는다. 대신 `supersededBy`, `incompleteReason`, `tagStatus`를 구조화해 대체 릴리스, 완료하지 않은 범위, 태그 생성 여부를 기록한다.
- `coupler-api`를 `released`로 닫을 때는 `scopeResults.coupler-api.evidence.deployment`, `smoke`,
  `publicContract`, `runtimeRecovery`와 `versionMapping.coupler-api.tag`를 채운다. `publicContract`는
  Store 직전/현재 build, OTA label/cohort, Admin artifact별 runtime/contract ref와 REST·WebSocket·
  bootstrap·version interface를 exact inventory로 기록하고, 각 consumer-interface의 current API case를
  연결한다. `runtimeRecovery`는 previous-release, forward-fix, controlled-recovery 중 하나와
  persisted/queued/external-effect 안전 근거를 기록한다. previous-release이면 inventory의 모든
  consumer-interface가 이전 API에서 성공한 rollback case를 정확히 하나씩 가져야 하고 그 전체 ID를
  `previousReleaseCaseIds`에 기록한다.
- Terminal `coupler-api` scope는 `contracts-package` scope를 반드시 함께 포함해 `released`로 닫는다.
  이전 package를 그대로 쓰는 API 릴리스도 현재 API SHA에서 생성·발행된 stable package와 active
  Admin/Mobile exact pin 정렬을 먼저 확인한다.

`publicContract`는 아래 closed shape만 사용한다. `apiRefs.current`는
`versionMapping.coupler-api.commit`과 같은 40자 SHA이고, `contractRefs.current`는 포함된
contracts-package의 `publishedPackage`와 같다. contracts-package `sourceRef`는 실제 stable publish
workflow source 40자 SHA를 기록한다. publish source와 API release source가 다르면 두 ref의
`packages/contracts` git tree SHA가 같아야 하며 `sourceTree.path`, `publishedSourceTree`,
`releaseSourceTree`에 그대로 기록한다. `consumers`에는
`mobile-store | mobile-nextpush | admin` × `previous | current` 여섯 쌍을 정확히 하나씩 둔다.
Store/Admin은 항상 `present`이고 NextPush가 실제 없을 때만 `absent`와 owner/absence evidence를 쓴다.
`present` mobile은 `rest`, `websocket`, `bootstrap`, `version`, Admin은 `rest`, `websocket` exact-set이다.
심사용 Store native bundle이 개발 API를 보고 같은 target binary의 Production NextPush가 운영 API를
보는 특수 제출은 `previous mobile-store`, `current mobile-store`, `current mobile-nextpush` consumer의
artifact/case evidence에 각 API 환경을 구분해 적는다. 개발계 Store case는 심사·QA 근거이며 운영
API+최종 DB 호환 근거로 계산하지 않는다. NextPush 실패 시 native 개발 API fallback은 잔존 위험으로
기록하되 그 사실만으로 cutover 성공·실패, 제출 차단 또는 재제출을 판정하지 않는다.

```json
{
  "apiRefs": {
    "previous": "<previous-api-40-char-sha>",
    "current": "<versionMapping.coupler-api.commit>"
  },
  "contractRefs": {
    "previous": "@coupler-developer/coupler-api-contracts@<previous-version>",
    "current": "@coupler-developer/coupler-api-contracts@<published-version>"
  },
  "consumers": [
    {
      "state": "present",
      "id": "current-store",
      "surface": "mobile-store",
      "generation": "current",
      "artifact": {
        "kind": "store-builds",
        "mappingRef": "Android X.Y.Z (build); iOS X.Y.Z (build)",
        "iosVersionBuild": "X.Y.Z (build)",
        "androidVersionBuild": "X.Y.Z (build)"
      },
      "contractRef": "@coupler-developer/coupler-api-contracts@<published-version>",
      "interfaces": ["rest", "websocket", "bootstrap", "version"],
      "interfaceInventoryEvidence": "<태그/배포 소스에서 실제 소비 인터페이스를 확인한 결과>"
    },
    {
      "state": "present",
      "id": "previous-nextpush",
      "surface": "mobile-nextpush",
      "generation": "previous",
      "artifact": {
        "kind": "nextpush-deployment",
        "mappingRef": "<previous-app/deployment/label/target>",
        "ios": {
          "app": "<app>",
          "deployment": "Production",
          "label": "<label>",
          "cohort": "<cohort>",
          "targetBinary": "X.Y.Z (build)"
        },
        "android": {
          "app": "<app>",
          "deployment": "Production",
          "label": "<label>",
          "cohort": "<cohort>",
          "targetBinary": "X.Y.Z (build)"
        }
      },
      "contractRef": "@coupler-developer/coupler-api-contracts@<previous-version>",
      "interfaces": ["rest", "bootstrap", "version"],
      "interfaceInventoryEvidence": "<이 NextPush 소스에는 REST/bootstrap/version이 있고 WebSocket runtime은 없음을 확인>"
    },
    {
      "state": "absent",
      "id": "current-nextpush",
      "surface": "mobile-nextpush",
      "generation": "current",
      "owner": "<owner>",
      "absenceEvidence": "<Production 배포/label 부재 확인>"
    },
    {
      "state": "present",
      "id": "current-admin",
      "surface": "admin",
      "generation": "current",
      "artifact": {
        "kind": "admin-build",
        "artifactRef": "<versionMapping.coupler-admin-web.commit>"
      },
      "contractRef": "@coupler-developer/coupler-api-contracts@<published-version>",
      "interfaces": ["rest", "websocket"],
      "interfaceInventoryEvidence": "<배포 소스에서 REST/WebSocket 소비를 확인>"
    }
  ],
  "cases": [
    {
      "id": "current-store-rest-current-api",
      "consumerId": "current-store",
      "interface": "rest",
      "apiGeneration": "current",
      "exposure": "post-activation",
      "expected": "success",
      "evidence": "<실제 fixture/smoke 결과>"
    }
  ]
}
```

위 예시의 생략된 `previous-store`, `previous-admin`도 같은
discriminated shape로 채운다. 각 present consumer의 `contractRef`는 그 산출물이 실제로 사용하는 계약
패키지 또는 로컬 wire-contract 소스 ref를 기록한다. current consumer는 발행된
`contractRefs.current`와 정확히 일치해야 한다. 모바일의 필수 인터페이스는 `rest/bootstrap/version`,
Admin은 `rest`이며, `websocket`은 해당 산출물에 실제 runtime 구현이 있을 때만 포함한다.
`interfaceInventoryEvidence`에는 이 목록과 WebSocket 포함·제외를 판정한 태그/배포 소스 근거를 기록한다.
`cases`는 모든 `present consumer × interfaces`에 대해 current API case를 정확히 하나 이상 만들고, key
`consumerId:interface:apiGeneration:exposure`를 중복하지 않는다. non-cutover는 모두 `success`다.
cutover는 이전 mobile의 `bootstrap`/`version`은 계속 `success`, 호환 불가능한 product 요청은
activation에서 `deterministic-rejection`으로 기록한다.

`runtimeRecovery`의 closed shape는 아래 둘 중 하나다. 첫 shape의 `strategy`는 실제 대응에 따라
`forward-fix | controlled-recovery` 중 하나를 쓴다. API scope가 `rolled_back`이면 반드시
`previous-release`이며, 모든 `present consumer × interfaces`에 대한
`apiGeneration: previous`, `exposure: rollback`, `expected: success` case ID exact-set을 넣는다.

```json
{
  "strategy": "forward-fix",
  "stateSafety": {
    "source": "application-evidence",
    "persistedState": "<final DB read/write 검증>",
    "queuedState": "<cursor/in-flight/idempotency 검증>",
    "externalEffects": "<effect ledger/sink 검증>"
  },
  "previousReleaseCaseIds": []
}
```

```json
{
  "strategy": "previous-release",
  "stateSafety": {
    "source": "db-maintenance-execution",
    "scope": "db-migration"
  },
  "previousReleaseCaseIds": [
    "<every successful previous-API rollback case id>"
  ]
}
```

DB-backed `stateSafety`는 `db-migration` scope가 `released | rolled_back`이고 canonical terminal prod
execution root가 내부 dev 이력과 실제 bytes SHA까지 결속된 경우에만 terminal API 증빙으로 쓸 수 있다.
`kind: violation`은 이 근거가 될 수 없다. API client rollback만 수행하고 API runtime을 유지했다면
`coupler-api.status`를 `rolled_back`으로 기록하지 않는다.

- `coupler-admin-web`를 `released`로 닫을 때는 `scopeResults.coupler-admin-web.evidence.deployment`, `smoke`, `rollback`과 `versionMapping.coupler-admin-web.tag`를 concrete 값으로 채운다.
- `contracts-package`를 `released`로 닫을 때는 `scopeResults.contracts-package.evidence.publishedPackage`,
  `workflow`, `sourceRef`를 concrete 값으로 채운다. `publishedPackage`는 package/version 식별자만,
  `sourceRef`는 `versionMapping.coupler-api.commit`과 같은 40자 SHA만 쓴다.
- 신규 `db-migration` evidence는 아래 canonical root 형식을 사용한다. 환경별 archive는 현재 root
  `plan.json`/`execution.jsonl`과 root에서 도달하는
  `history/<failed-plan-sha256>/plan.json|execution.jsonl`만 보존하고, metadata는 현재 단계의 한 쌍만 직접
  참조한다.
- 첫 plan 전 `planned`에서는 `plan: null, execution: null`을 둔다. `pending`에서는 dev plan/null 또는
  `service-completed`로 끝난 dev plan/execution pair를 둔다. 개발계 완료 뒤 그 pair를 내부에서 참조하는 prod plan으로 root를 전진시키고
  `in_progress`로 바꾼다. 그 미병합 PR head에서 preflight를 통과한 뒤 운영계를 실행하며,
  `released | rolled_back`에서는 같은 prod plan과 완료된 prod execution을 기록한다.
- Canonical chain 없이 이미 적용된 과거 작업은 정책의 `kind: violation` 조건으로만 기록하며 이 template을
  운영 실행 우회 수단으로 사용하지 않는다.
- 과거 릴리스 기록은 불투명한 최종본이므로 열어 고치거나 현재 DB evidence 계약으로 재검증하지 않는다.

```json
{
  "schema": "db-migration-maintenance-evidence/v1",
  "kind": "canonical",
  "plan": {
    "path": "content/releases/evidence/db-migrations/vX.Y.Z/dev/plan.json",
    "sha256": "<64-character-sha256>"
  },
  "execution": null
}
```

- `mobile-store`를 `released`로 닫을 때는 `scopeResults.mobile-store.evidence.submission`, `approval`, `release`, `smoke`, `artifact`, `submittedMarkers`와 포함 platform의 `verified` source mapping을 concrete 값으로 채운다.
- `mobile-nextpush`를 `released`로 닫을 때는 `scopeResults.mobile-nextpush.evidence.app`, `productionLabel`, `targetBinary`, `uploadedAt`, `rollout`, `mandatory`, `disabled`를 concrete 값으로 채운다.
- 추가 스냅샷 또는 비교 기준으로만 고정할 repo가 있으면 `extraRepoRefs`에 `docs`, `coupler-api`, `coupler-admin-web`, `coupler-mobile-app` 중 canonical name을 적는다. `extraRepoRefs`는 release 완료 조건을 새로 만들지 않는다.
- `포함 범위`와 `제외 범위`는 사람이 읽는 실행 계약이다. 배포 범위(`DB migration`, `coupler-api`, `coupler-admin-web`, `Mobile Store`, `Mobile NextPush`, `docs`, `Tag/Release Record`)별로 완료/제외를 구분한다.
- 제외한 범위와 완료 판정에 직접 쓰이지 않는 `N/A` 항목은 미적용 사유와 근거를 함께 적는다.
- `released` 또는 `rolled_back` scope의 완료/rollback 증적은 실제 workflow, Gate, smoke, artifact, rollback 기준 같은 concrete 증빙으로 채우며 `N/A - <사유>`로 대체하지 않는다.
- `rolled_back` scope는 `rollbackReason`을 기록한다. scope descriptor에 전용 rollback evidence가 없는
  `contracts-package`, `mobile-store`, `mobile-nextpush`, `docs`는 실제 되돌림 결과를
  `rollbackEvidence`에도 기록한다. `db-migration`은 dev 이력에 결속된 terminal prod maintenance execution
  root가 이 역할을 소유하므로 별도 `rollbackEvidence`를 만들지 않는다.
- `preflightRepoNames`는 `docs + releaseScopes.requiredRepoRefs + extraRepoRefs`로 계산한다.
- `preflightRepoNames`가 `docs`뿐인 릴리스 기록은 서비스 repo workspace 없이 docs-only preflight를 실행할 수 있다.
- 서비스 레포가 `preflightRepoNames`에 포함되면 preflight 실행 시 해당 repo가 있는 workspace root가 필요하다.
- preflight 검증 대상 서비스 ref는 확인된 annotated tag가 없으면 실행 시점의 현재 `origin/main`과 같아야 한다. annotated tag와 commit이 일치하면 그 불변 릴리스 기준점을 허용한다.
- `docs`의 릴리즈 기준점은 `versionMapping.docs.tag`와 실제 docs tag commit으로 확인한다. 릴리즈 기록 문서 안의 `versionMapping.docs.commit`에는 자기 자신을 안정적으로 가리키는 concrete SHA를 적지 않는다.
- `docs` scope가 `released`이면 `versionMapping.docs.tag`를 목표 버전으로 고정한다. 실제 origin annotated tag는 final PR merge 뒤 병합된 main 커밋에 생성하고 postcheck하며, tag commit은 `origin/main` 계보에 있어야 한다.
- `preflightRepoNames`에 포함된 서비스 레포는 `versionMapping`에 확인 가능한 `tag`/`releaseTag` 또는
  `commit` SHA를 적는다. `coupler-api`와 `coupler-admin-web`은 terminal 공개 계약/artifact를 결속하므로
  태그가 있어도 현재 `origin/main` 기준 `commit` SHA를 함께 적는다.
- 서비스 레포 태그를 적으면 origin에서 확인 가능한 annotated tag여야 하며, 태그와 커밋 SHA를 함께 적을 때는 둘이 같은 커밋을 가리켜야 한다.
- `docs` 태그는 릴리스 기록과 Release Note 기준점이고, 서비스 레포 태그를 대체하지 않는다.
- Mobile Store 제출, Mobile Store 출시, Mobile NextPush 배포는 각각 별도 상태와 증빙으로 적는다.
- `versionMapping.coupler-mobile-app.nextPush`는 NextPush app/deployment/label/target 문자열 또는 `null`만 쓴다. NextPush가 있으면 `commit`에 exact source SHA를 함께 적고, 없으면 둘 다 `null`로 두며 Markdown mirror에는 `N/A`를 적는다.
- Store 심사 중이거나 NextPush 적용 전이면 해당 scope와 전체 상태를 `released`로 닫지 않는다.
- Store 심사/승인/출시처럼 외부 대기가 있는 범위는 제출 마커와 대기 범위를 남기고 `planned`, `pending`, `in_progress` 중 실제 단계에 맞는 상태로 유지한다. Store 승인, 운영 출시, 기본 smoke, 모바일 릴리스 태그, 제출 마커 증빙 이관/삭제가 끝난 뒤에만 `mobile-store` scope를 `released`로 닫는다.
- 후속 릴리스가 대기 범위를 대체하면 억지 완료 증빙을 만들지 않고 `superseded`로 닫는다.
- 전체 `released` 상태에는 `대기 범위` 값을 비우거나 `N/A`로 적는다.
- `planned`/`pending`/`in_progress` 상태에서는 아직 확인 전인 값에 `pending`, `미생성` 같은 placeholder를 쓸 수 있다.
- 개발계 migration은 API executor로 먼저 실행하고 dev plan/execution을 보존할 수 있다. 운영 실행 전에는
  그 pair를 참조하는 prod plan/null을 root로 한 원격 PR 기준점에서
  `yarn release:preflight --pending-ref <40자 commit SHA>`를 한 번 실행한다. 개발계 실행 전에 `pending`
  기록을 열 수 있지만 docs PR과 preflight는 선행조건이 아니다. 자동 검증은 PR 내부의 상태 커밋 순서나 과거
  snapshot을 판정 근거로 사용하지 않는다.
- 운영까지의 간격이 길면 completed dev root와 도달 가능한 failed-history만 넣은 checkpoint PR을 release
  record 없이 먼저 `main`에 병합한다. 이 version은 예약되며 기존 bytes를 바꾸거나 다른 용도로 재사용하지
  않는다. 운영 당일 docs `main`의 exact bytes를 API `.runtime` path로 복원하고 fresh prod plan을 만든다.
  같은 version의 최초 release record는 이 dev graph를 참조하는 `db-migration` canonical prod plan root로
  소비해야 한다.
- 릴리즈 기록은 최종본으로 한 번만 `main`에 병합한다. `main`에 존재하는 기록은 불투명한 역사 기록으로서
  수정·삭제·이름 변경·대체할 수 없고 내용도 현재 계약으로 재검증하지 않는다. 오탈자·잘못된 증빙·실패·
  rollback 설명만을 고치기 위한 새 릴리스 기록도 만들지 않는다. 새 기록은 실제 새 배포 또는 DB migration
  실행이 있을 때만 작성한다.
- `main`의 개별 DB migration evidence 파일은 즉시 불변이다. 병합된 release record가 있는 version에는 파일을
  사후 추가하지 않는다. no-record dev checkpoint version에는 기존 dev bytes를 그대로 둔 채 prod evidence와
  이를 소비하는 최종 release record만 나중에 한 번 추가할 수 있다.
- `planned`는 범위나 기준 SHA가 아직 고정되지 않은 초안 공유가 필요한 경우에만 선택적으로 사용하며 배포 시작 기준이 아니다.
- `released`, `rolled_back` scope의 태그와 커밋은 실제 확인 가능한 ref로 적는다.
- `released`, `rolled_back` scope에서는 scope descriptor가 요구하는 evidence에 `null`, `N/A`, `N/A - <사유>`, `pending`, `미생성`, `미검증`, `미완료`, `심사 중`, `대기` 같은 placeholder나 미적용 사유를 남기지 않는다.
- `버전 매핑` 섹션은 사람이 읽는 mirror다. 자동화 기준은 `release-metadata.versionMapping`이며, 둘이 서로 다른 기준점을 가리키지 않게 같이 갱신한다.
- `API cutover: Yes`이면 `release-metadata.apiContractCutover`를 activation과 client rollback의 기계
  판정 SoT로 채운다. 소비자 inventory·API ref·contract case·runtime 복구는
  `scopeResults.coupler-api.evidence`가 소유하고, contracts package publish 증적은
  `scopeResults.contracts-package.evidence.publishedPackage`에 둔다. 이때만
  `content/templates/api-contract-cutover-gate-template.md`의 `API contract cutover Gate` 섹션을
  `검증 근거` 아래에 삽입하고 사람이 읽는 mirror로 채운다.
- 이미 운영 반영된 뒤 사전 activation·old-readable bootstrap 위반을 발견했다면 과거 증빙을 사후 제조하거나
  릴리스를 영구 `in_progress`로 두지 않는다. API scope는 실제 배포 결과인 `released`로 두고
  `apiContractCutover.status`를 `violated`로 닫는다. 정상 Activation·rollback 필드는 만들지 않고 전용
  `violation`에 허용된 실패 요구조건, exact 영향 소비자 ref, 발견 시점, 관측·미관측 범위, 운영 처분과 후속
  통제를 기록한다. 이 상태는 정상 Cutover Gate 통과 근거로 재사용할 수 없다.
- API contract cutover가 없으면 `apiContractCutover: null`로 두고 `API contract cutover Gate` 섹션을 만들지 않는다.
  이는 API 계약 변경 없음 또는 `API cutover: No` 판정이다. `publicContract.cases`에는 모든 지원 이전
  consumer-interface가 현재 API+최종 DB에서 성공한 근거를 남긴다.
- DB 변경은 별도 `Compatible/Cutover` 필드를 만들지 않는다. canonical DB maintenance plan/execution이
  이전·현재·혼합 runtime, 시작·최종 DB, 상태 표면, FENCED/RESUMED/RECOVERING과 복구 전략을 소유한다.
  Docs는 해당 artifact의 경로와 bytes SHA-256만 묶는다.
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
- API 변경 시 `API cutover: No | Yes`와 consumer-interface case를 기록한다. DB 변경 시에는 개발계·운영계
  plan/execution 네 artifact의 경로와 bytes SHA-256만 기록하고, runtime/schema 조합·phase·상태 표면·복구
  결과는 canonical artifact를 참조한다.
- API contract cutover 포함 시 서버·proxy·유지보수 상태의 요청 차단 근거와 적용한
  `force_update`/`min_version` 또는 NextPush 전환 근거를 구분해 기록한다.
- API contract cutover 포함 시 contracts package publish version과 Mobile/Admin 소비 경로 검증 근거를 기록한다. Admin/Mobile이 generated copy를 소비하는 동안에는 `Release Contracts` workflow가 발행한 `@coupler-developer/coupler-api-contracts@x.y.z` version을 `scopeResults.contracts-package.evidence.publishedPackage`에 기록하고 exact match 검증 근거를 함께 남긴다. package dependency 전환 후에는 Mobile/Admin `package.json`/lockfile dependency version, consumer import path, 각 소비자 레포 품질 게이트 결과를 기록한다.
- API contract cutover가 없으면 `N/A - API 하위 호환 검증으로 cutover 불필요` 또는
  `N/A - API 계약 변경 없음`처럼 사유와
  근거를 남기고 Gate 섹션은 만들지 않는다.

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
