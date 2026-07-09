# API contract cutover Gate 템플릿

API/Admin/Mobile 공통 응답 또는 ErrorData contract cutover가 포함될 때만
`content/templates/release-record-template.md`의 `검증 근거` 아래에 이 섹션을 삽입한다.
값을 확인하지 못한 항목은 `N/A`가 아니라 `pending`으로 남기고 cutover 완료로 판정하지 않는다.

## 삽입 섹션

### API contract cutover Gate

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
    - 기대값: `/app/auth/getSettingList?os=<google|apple>&version_code=<N build>` 응답의 `app_info.force_update === 2`
- Admin 검증:
    - 앱 버전 설정 화면 저장 검증:
    - 변경 데이터 조회/운영자 액션 smoke:
- Rollback 기준:
    - 직전 호환 API/Admin/Mobile SHA 또는 tag:
    - DB 백업/복구 기준:
    - 되돌림 금지/주의 사항:
