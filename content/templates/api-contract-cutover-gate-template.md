# API contract cutover Gate 템플릿

API/Admin/Mobile 공개 API 계약 변경 중 `API cutover: Yes`일 때만
`content/templates/release-record-template.md`의 `검증 근거` 아래에 이 섹션을 삽입한다.
소비자 inventory, API ref, contract case와 runtime 복구는
`scopeResults.coupler-api.evidence`에 한 번만 기록한다. 이 Gate는 그 case ID를 참조하는 activation과
client rollback만 소유하며 DB backup/restore를 소유하지 않는다.
Exact `publicContract` consumer/artifact/case와 `runtimeRecovery` JSON shape는
[릴리스 실행 기록 템플릿](release-record-template.md)의 예시를 그대로 따른다.
Terminal cutover는 contracts-package scope가 `released`이고 package `sourceRef`가 current API 40자
SHA와 같거나, 두 ref의 `packages/contracts` git tree SHA가 같다는 `sourceTree` 증빙이 있을 때만
기록한다. `released` cutover는 API scope `released`, `rollback` cutover는 API scope
`rolled_back`과 정확히 대응한다.
배포 뒤에 사전 Gate 위반을 발견해 당시 증빙을 만들 수 없으면 API scope는 실제 배포 결과인 `released`로
두고 cutover는 `violated`로 닫는다. 이 상태는 Gate 통과가 아니며 누락된 과거 case를 사후 제조하지 않는다.
정상 Activation·rollback 구조 대신 실패 요구조건, exact 영향 소비자 ref, 발견 시점, 관측·미관측 범위,
운영 처분과 후속 통제를 전용 `violation` 구조에 기록한다.
Activation case IDs에는 선택한 이전 소비자의 결정론적 거부 case를 포함한다. Client rollback case IDs는
이전 소비자가 현재 API에서 성공하는 rollback case만 참조한다. 이전 API/runtime 복구 case는
`runtimeRecovery.previousReleaseCaseIds`가 별도로 소유한다.

## 삽입 섹션

### API contract cutover Gate

- Cutover 상태: `pending | ready | released | violated | rollback`
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

`violated`에서는 위 Activation과 Client rollback을 제거하고 다음 블록으로 대체한다.

- 사후 위반 처분:
    - 실패 요구조건:
    - 영향 소비자 ref:
    - 발견 시점:
    - 관측 근거:
    - 미관측 범위:
    - 운영 처분:
    - 후속 통제:
