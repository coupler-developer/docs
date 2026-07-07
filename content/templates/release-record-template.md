# X.Y.Z 릴리스 실행 기록

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
- 전체 상태: `planned`
- 완료 범위:
- 대기 범위:

## 버전 매핑

- `docs`: 기록 버전 `vX.Y.Z`, 태그 `vX.Y.Z` -> release workflow의 현재 docs tag commit
- `coupler-api`: 태그 `vX.Y.Z 또는 N/A`, 커밋 `sha 또는 N/A`
- `coupler-admin-web`: 태그 `vX.Y.Z 또는 N/A`, 커밋 `sha 또는 N/A`
- `coupler-mobile-app`: Store `version (build) 또는 N/A`, 릴리스 태그 `vX.Y.Z 또는 N/A`, NextPush `label 또는 N/A`
- `coupler-mobile-app` 제출 마커 태그:
- 제출 마커 증빙 이관/삭제:

## 릴리스 결과

- 결과를 범위별로 기록한다.

## 메인 흐름

1. 릴리스 범위를 확정한다.
2. 포함 범위별 배포와 검증을 수행한다.
3. 서비스 태그와 docs 릴리스 기록을 확정한다.

## 검증 근거

- 검증 명령, 응답, 로그, workflow URL 또는 수동 검증 결과를 기록한다.
- API contract cutover 포함 시 `force_update`/`min_version` 강제 업데이트 차단 근거를 기록한다.
- API contract cutover 포함 시 contracts package publish version과 Mobile/Admin 소비 경로 검증 근거를 기록한다. Admin/Mobile이 generated copy를 소비하는 동안에는 exact match 검증 근거를, package dependency 전환 후에는 dependency version 검증 근거를 기록한다.

### API contract cutover Gate

API/Admin/Mobile 공통 응답 또는 ErrorData contract cutover가 포함되면 아래 항목을 모두 채운다.
값을 확인하지 못한 항목은 `N/A`가 아니라 `pending`으로 남기고 cutover 완료로 판정하지 않는다.

- Cutover 상태: `pending | ready | released | rollback`
- 비교 기준 ref:
    - `coupler-api`:
    - `coupler-mobile-app`:
    - `coupler-admin-web`:
- Contract artifact sync:
    - 명령:
    - 결과:
    - published package:
    - Mobile/Admin consumer path:
- N+1 배포 근거:
    - Store version/build 또는 NextPush app/deployment/label:
    - 운영 출시/적용 시각:
    - 확인 URL 또는 콘솔 증빙:
- Legacy traffic 차단 근거:
    - 기존 N version/build:
    - 강제 업데이트 설정 위치:
    - `version_code < min_version` 요청 결과:
    - 기대값: `/auth/getSettingList?os=<google|apple>&version_code=<N build>` 응답의 `app_info.force_update === 2`
- Admin 검증:
    - 앱 버전 설정 화면 저장 검증:
    - 변경 데이터 조회/운영자 액션 smoke:
- Rollback 기준:
    - 직전 호환 API/Admin/Mobile SHA 또는 tag:
    - DB 백업/복구 기준:
    - 되돌림 금지/주의 사항:

## 롤백 기준

- 범위별 롤백 기준점과 금지 사항을 기록한다.

## 후속 작업

- 남은 대기 범위와 완료 조건을 기록한다.

## 관련 문서

- [배포/릴리즈 프로세스](../policy/release-process.md)
- [배포 태그 정책](../policy/release-tag-policy.md)
