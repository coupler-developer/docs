# 릴리스 태그 정책

## 문서 역할

- 역할: `규범`
- 문서 종류: `policy`
- 충돌 시 우선 문서: `이 문서`
- 기준 성격: `as-is`

## 목적

- Production 릴리스 태그와 Mobile Store 제출 마커 태그의 이름, 생성 시점, 증빙 기준을 단일화한다.
- 심사 제출 기준점과 운영 출시 기준점을 분리해, 어떤 binary와 commit이 언제 제출되고 운영에 반영됐는지 추적 가능하게 만든다.

## 적용 범위

- `coupler-api`
- `coupler-admin-web`
- `coupler-mobile-app`
- `docs`
- 릴리스 기록 문서와 운영 릴리스 실행 런북의 태그 관련 절차

## 단일 SoT

- 이 문서는 릴리스 태그, 스토어 제출 마커 태그, 태그 증빙 기준의 단일 SoT다.
- [릴리스 프로세스](release-process.md)는 릴리스 범위, 릴리스 상태·metadata·증빙과 docs GitHub Release
  완료·불변 조건을 정의한다.
- [운영 릴리스 실행 런북](../flows/cross-project/production-deploy-command-runbook.md)은 이 정책을 적용할 태그
  실행 진입점을 제공하며, 이 정책을 대체하지 않는다.
- [코드 리뷰 정책](code-review-policy.md)은 이 정책을 태그/제출 마커 리뷰 기준으로 참조한다.

## 용어

- 릴리스 태그: 운영 반영과 검증이 완료된 기준점을 고정하는 `vMAJOR.MINOR.PATCH` 형식의 annotated tag
- 제출 마커 태그: Mobile Store 심사 중 binary provenance를 임시 고정하는 `submitted/*` 형식의 annotated tag
- platform별 제출 마커 태그: Android 또는 iOS artifact 하나의 provenance를 고정하는 표준 제출 마커

## 필수 규칙

- 릴리스 태그 이름은 `vMAJOR.MINOR.PATCH`로 고정한다(예: `v1.2.0`, `v1.2.1`).
- 릴리스 태그와 제출 마커 태그는 모두 **annotated tag**로 생성한다.
- 릴리스 태그는 **해당 scope의 운영 반영 또는 출시와 검증이 완료된 기준점**에만 생성한다.
- 표준 흐름의 `docs` 태그는 최종 릴리스 기록의 병합이 끝난 뒤 병합 커밋에 생성한다.
- `planned`, `pending`, `in_progress` 상태에서는 docs 태그를 선행 생성하지 않는다. 열린 PR과 릴리스 기록을 제어판으로 사용한다.
- `docs` 태그가 서비스 레포 태그를 대체하지 않는다. 서비스 레포 태그는 각 레포의 실제 운영 반영/검증 완료 커밋에 별도로 생성한다.
- 릴리스 기록에서 Mobile Store 승인/운영 출시를 통합 릴리스 완료 조건으로 잡은 경우, 해당 조건에 묶인 서비스 레포의 `vX.Y.Z` 태그는 gate 완료 후 생성한다.
- Mobile Store gate와 독립적으로 완료되는 범위는 운영 반영/검증 완료 후 별도 태그를 생성할 수 있다.
- 같은 `vX.Y.Z` 릴리스 태그를 여러 커밋에 나눠 찍지 않는다.
- 서비스 레포(`coupler-api`, `coupler-admin-web`, `coupler-mobile-app`) 태그 push는 GitHub Release 또는 zip artifact를 자동 생성하지 않는다.
- 스토어 심사 중인 모바일 빌드는 `submitted` 또는 `in_review`로만 기록한다. `coupler-mobile-app`의 `vX.Y.Z` 릴리스 태그는 스토어 승인 후 운영 출시와 기본 검증이 끝난 커밋에 생성한다.
- 스토어 제출 마커 태그는 릴리스 태그가 아니라 심사 중 binary provenance를 잃지 않기 위한 임시 기록이다.
- 신규 제출 마커는 artifact 하나당 `submitted/android-<version>-<build>` 또는
  `submitted/ios-<version>-<build>` 하나로 고정한다. 두 platform을 함께 제출해도 각각 만들며 artifact
  경로·SHA-256·bundle/hash tuple을 다른 platform과 공유하지 않는다.
- 기존 `submitted/mobile-<version>-<build>`는 이미 게시된 기존 기록(v2 이하·metadata 미적용 legacy 포함)에
  역사적 사실로만 보존한다. v3 증빙으로 이관하거나 신규 제출에 만들지 않는다.
- Mobile Store 승인, 실제 출시, 기본 smoke 검증, `coupler-mobile-app` `vX.Y.Z` 릴리스 태그 push, 릴리스 기록 문서의 제출 증빙 이관이 모두 끝나면 해당 릴리스의 `submitted/*` 태그는 로컬과 원격에서 삭제한다.
- 릴리스 기록 문서에 제출 마커 태그 이름, tag commit SHA, artifact/hash 요약, 삭제 여부를 남기기 전에는 `submitted/*` 태그를 삭제하지 않는다.
- NextPush-only 모바일 배포는 기본적으로 모바일 git tag를 새로 만들지 않는다. 스토어 binary 출시 또는 릴리스 기록에서 모바일 레포 기준점 태그가 필요하다고 명시한 경우에만 새 태그를 만든다.
- 기존 native version 태그와 다른 커밋에 같은 버전 태그를 다시 만들지 않는다.
- Android와 iOS의 실제 Store version이 다르면 하나의 모바일 태그로 통합하지 않는다. 각 platform mapping은
  실제 version과 같은 태그와 exact source commit을 사용한다.
- 이미 출시된 platform의 원본 archive와 exact source를 복구할 수 없으면 추정 커밋에 태그를 사후 생성하지
  않는다. `release-metadata/v3`의 `unavailable-historical`과 구체적인 한계로만 닫고, 확인 가능한 다른
  platform 태그를 해당 platform의 근거로만 사용한다.
- 출시 뒤 사후 생성한 `submitted/*` 태그는 원래 submission-time marker가 아니다. 이런 태그의 object나
  commit을 정상 제출 증빙으로 이관하지 않고 platform별 `unavailable-historical` 한계에만 기록한다.

## 증빙/추적

제출 마커 태그 메시지에는 최소 아래를 남긴다.

- version/build
- 제출 또는 업로드 시각
- Android/iOS artifact 경로
- artifact SHA-256
- bundle/hash 값
- 제출 커밋 판단 근거

릴리스 기록에는 최소 아래를 남긴다.

- 레포 이름
- 태그 이름
- 태그 커밋 SHA
- 운영 반영 시각 또는 스토어 제출/승인 시각
- 검증 결과
- 제출 마커 태그가 있으면 해당 태그 이름, tag commit SHA, 증빙 요약, 삭제 여부

## 체크리스트

- [ ] 릴리스 태그가 `vMAJOR.MINOR.PATCH` 형식인가?
- [ ] 태그가 annotated tag인가?
- [ ] 릴리스 태그가 운영 반영과 검증이 완료된 커밋을 가리키는가?
- [ ] Mobile Store 포함 시 제출한 각 platform에 `submitted/android-*` 또는 `submitted/ios-*` 마커와 해당
  platform만의 artifact tuple을 남겼는가?
- [ ] Mobile Store gate에 묶인 통합 릴리스라면 태그 보류/완료 범위를 릴리스 기록에 구분했는가?
- [ ] 제출 마커 태그 메시지에 artifact, hash, 제출 시각, 커밋 판단 근거가 남았는가?
- [ ] Mobile Store 승인/출시/검증 후 `vX.Y.Z` 릴리스 태그와 릴리스 기록에 제출 증빙을 이관했는가?
- [ ] 제출 증빙 이관 후 해당 릴리스의 `submitted/*` 로컬/원격 태그를 삭제했거나, 삭제 보류 사유를 기록했는가?
- [ ] 릴리스 기록 문서에 태그/SHA/검증 결과가 남았는가?

## 관련 문서

- [릴리스 프로세스](release-process.md)
- [운영 릴리스 실행 런북](../flows/cross-project/production-deploy-command-runbook.md)
- [코드 리뷰 정책](code-review-policy.md)
