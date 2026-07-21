# API contract cutover Gate 템플릿

API/Admin/Mobile 공통 응답 또는 ErrorData contract 변경이 포함될 때만
`content/templates/release-record-template.md`의 `검증 근거` 아래에 이 섹션을 삽입한다.
값을 확인하지 못한 적용 항목은 `N/A`가 아니라 `pending`으로 남기고 최종 계약 배포 완료로 판정하지 않는다.

## Source closure metadata

`release-metadata.apiContractCutover`에는 아래 `sourceClosure`를 추가한다. `dependsOn`은 API와 두 consumer의
선행 source PR을 canonical repo name으로 한 번씩 기록하며, `postMergeContract`는 세 source `main`이 함께
소비할 stable exact version이다. pending 기록 이후 이 object 전체를 바꾸지 않는다.

```json
{
  "sourceClosure": {
    "postMergeContract": "X.Y.Z",
    "dependsOn": [
      { "repo": "coupler-api", "pullRequest": 0 },
      { "repo": "coupler-admin-web", "pullRequest": 0 },
      { "repo": "coupler-mobile-app", "pullRequest": 0 }
    ]
  }
}
```

실제 작성 시 `pullRequest`의 `0`은 각 선행 PR의 양의 정수 번호로 바꾼다. 각 repo는 `releaseScopes` 또는
`extraRepoRefs`의 검증 범위에도 포함해야 한다.

## 삽입 섹션

### API contract cutover Gate

- Cutover 상태: `pending | ready | released | rollback`
- 비교 기준 ref:
    - `coupler-api`:
    - `coupler-mobile-app`:
    - `coupler-admin-web`:
- 병합 후 최종 source main:
    - contracts exact version (`sourceClosure.postMergeContract` mirror):
    - 선행 source PR (`sourceClosure.dependsOn` mirror)과 merge order:
    - docs merge 전 선행 PR의 merged 상태와 source main 반영 확인:
- Contract artifact sync:
    - 명령:
    - 결과:
    - published package:
    - Mobile/Admin consumer path:
- Mobile 교체 방식: `Store 출시 activation 강제 업데이트 | NextPush mandatory`
- Activation barrier:
    - 사용자 요청 차단 수단과 시작/종료 시각:
    - API/Admin/Mobile 전체 적용 전 혼합 계약 요청 0건:
- Store 제출 근거:
    - 플랫폼별 제출 version/build와 commit:
    - 제출·승인·출시 가능 시각과 강제 업데이트 설정 위치:
    - 이전 build 요청 결과: `/app/auth/getSettingList?os=<google|apple>&version_code=<old build>`의
      `app_info.force_update === 2`
    - 제출 build 요청 결과: `app_info.force_update === 0`
- NextPush 근거:
    - Android app/deployment/label/target binary/mandatory:
    - iOS app/deployment/label/target binary/mandatory:
    - 양 플랫폼 적용 시각과 실제 기기 smoke:
- Legacy 제거 근거:
    - 제거한 helper/route/GET 부수효과:
    - API/Admin/Mobile 현재 코드 소비 경로 0건:
    - 404/필수 필드 회귀 테스트:
- 호환 예외: `N/A | approved`
    - `approved`이면 작업 요청자의 명시 승인 근거:
    - 공존 대상·허용 경로·제거 조건·목표 시점·추적 이슈:
- Admin 검증:
    - 앱 버전 설정 화면 저장 검증:
    - 변경 데이터 조회/운영자 액션 smoke:
- Rollback 기준:
    - 직전 검증 API/Admin/Mobile SHA 또는 tag:
    - 강제 업데이트/mandatory 복구 기준:
    - DB 백업/복구 기준:
    - 되돌림 금지/주의 사항:
