# API contract cutover Gate 템플릿

API/Admin/Mobile 공개 API 계약 변경 중 `API cutover: Yes`일 때만
`content/templates/release-record-template.md`의 `검증 근거` 아래에 이 섹션을 삽입한다.
소비자 inventory, API ref, contract case와 runtime 복구는
`scopeResults.coupler-api.evidence`에 한 번만 기록한다. 이 Gate는 그 case ID를 참조하는 activation과
client rollback만 소유하며 DB backup/restore를 소유하지 않는다.
Exact `publicContract` consumer/artifact/case와 `runtimeRecovery` JSON shape는
[릴리스 실행 기록 템플릿](release-record-template.md)의 예시를 그대로 따른다.
Terminal cutover는 contracts-package scope가 `released`이고 package `sourceRef`가 current API 40자 SHA와
같을 때만 기록한다. `released` cutover는 API scope `released`, `rollback` cutover는 API scope
`rolled_back`과 정확히 대응한다.
Activation case IDs에는 선택한 이전 소비자의 결정론적 거부 case를 포함한다. Client rollback case IDs는
이전 소비자가 현재 API에서 성공하는 rollback case만 참조한다. 이전 API/runtime 복구 case는
`runtimeRecovery.previousReleaseCaseIds`가 별도로 소유한다.

## 삽입 섹션

### API contract cutover Gate

- Cutover 상태: `pending | ready | released | rollback`
- Contract artifact sync:
    - 명령:
    - 결과:
    - published package:
    - Mobile/Admin consumer path:
- Activation:
    - Activation case IDs:
    - Activation 적용 시각:
    - 요청 장벽 증빙:
    - 이전 client bootstrap/upgrade 증빙:
- Client rollback:
    - Client rollback case IDs:
    - Rollback 요청 장벽 증빙:
    - Client rollback 주의 사항:
