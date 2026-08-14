# X.Y.Z 릴리스 실행 기록

```release-metadata
{
  "schema": "release-metadata/v3",
  "version": "vX.Y.Z",
  "status": "planned",
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
      "status": "planned",
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

- [릴리스 프로세스](../policy/release-process.md)
- [릴리스 태그 정책](../policy/release-tag-policy.md)
- [테스트/CI 전략](../policy/testing-strategy.md)

## 릴리스 상태

- 목표 버전: `vX.Y.Z`
- 전체 상태: `planned`
- 완료 범위:
- 대기 범위:

## 버전 매핑

- `docs`:
- `coupler-api`:
- `coupler-admin-web`:
- `coupler-mobile-app` Android Store:
- `coupler-mobile-app` iOS Store:
- `coupler-mobile-app` NextPush:
- Store 제출 마커 태그와 증빙 이관/삭제:

## 작성 기준

- 신규 기록은 템플릿을 직접 복사하지 않고 docs 레포 루트에서 `yarn release:record:init vX.Y.Z`로 초기화해
  lifecycle registry, `content/AGENTS.md` 인덱스와 `mkdocs.yml` nav를 같은 변경 단위로 준비한다.
- 이 파일은 입력 골격이다. 상태·scope·evidence의 규범과 closed value는
  [릴리스 프로세스](../policy/release-process.md)의 `릴리스 운영 모델`과 `릴리스 기록 상태값`을 따른다.
- 위 `release-metadata`는 docs-only `planned` 시작형이다. 실제 `releaseScopes`와 같은 key만 `scopeResults`에
  추가하고, `scripts/release-schema.mjs`가 정의하지 않은 key나 별도 완료 축을 만들지 않는다.
- scope, exact commit, 검증 시나리오와 rollback 기준을 확정하고 현재 PR head에 적용된 필수 CI를 확인한 뒤
  전체 상태와 nonterminal `scopeResults`를 `pending`으로 전환한다. 전환을 push한 현재 PR head의 필수 CI
  성공을 다시 확인하기 전에는 preflight나 운영 실행을 시작하지 않는다.
- `release-metadata`가 기계 판정 SoT이고 본문은 사람이 읽는 mirror다. 두 표현의 범위·상태·버전 기준을 맞춘다.
- terminal scope는 정책과 descriptor가 요구하는 concrete evidence로 닫는다. placeholder나 `N/A`로 완료
  증빙을 대신하지 않는다.
- API contract cutover가 있을 때만
  [API contract cutover Gate 템플릿](api-contract-cutover-gate-template.md)을 `검증 근거` 아래에 삽입한다.
- DB migration은 [DB Migration 실행 런북](../flows/cross-project/db-migration-operation-flow.md)에 따라 개발계와
  운영계에 사용한 동일한 마이그레이션 소스 커밋과 최종 pending 0건을 사람이 읽는 결과에 기록한다. 별도
  plan·execution artifact는 만들지 않는다.
- `main`에 이미 병합된 릴리스 기록과 evidence는 수정·삭제·개명·대체하거나 현재 계약으로 재검증하지 않는다.
- 개인 사용자명·로컬 home/tmp 경로·secret을 기록하지 않는다. 변동 값에는 확인 시각과 timezone을 남긴다.
- 최종 후보에서 `yarn release:preflight --pending-ref <40자 commit SHA>`와 적용 docs 품질 Gate를 실행한다.

## 릴리스 결과

| Scope | 상태 | 결과·증빙 |
| --- | --- | --- |
|  |  |  |

## 메인 흐름

1. 릴리스 범위와 기준 SHA를 확정한다.
2. 포함 scope별 배포·검증·rollback 판정을 수행한다.
3. 최종 기록과 필요한 태그·사후 확인을 완료한다.

## 검증 근거

- Preflight 명령·결과:
- Scope별 Gate·smoke·artifact:
- API cutover: `No | Yes` + 근거
- DB 마이그레이션 소스 커밋·개발계/운영계 결과:
- Workflow·로그·수동 검증 링크:

### Mobile 개발계 QA 빌드 기록

개발계 QA 빌드가 있을 때만 기록한다. 운영 Store·NextPush·서비스 태그 증빙으로 사용하지 않는다.

- 기록일:
- API 대상:
- iOS TestFlight QA 빌드:
- Android QA APK:
- 운영 릴리스 전 확인:

## 롤백 기준

| Scope | Trigger | 기준점·금지 사항 | 실행 결과 |
| --- | --- | --- | --- |
|  |  |  |  |

## 후속 작업

- 남은 범위:
- 완료 조건:
