# X.Y.Z 릴리스 실행 기록

## 문서 역할

- 역할: `시나리오`
- 문서 종류: `flow`
- 충돌 시 우선 문서: `policy/release-process.md`
- 기준 성격: `as-is`

## 목적

- `vX.Y.Z` 릴리스의 실제 반영 결과와 검증 근거를 한 문서에 고정한다.

## 범위

- 대상:
- 포함 범위:
- 제외 범위:

## 상위 규범 문서

- [배포 태그/릴리즈 프로세스](../policy/release-process.md)
- [테스트/CI 전략](../policy/testing-strategy.md)

## 릴리스 상태

- 목표 버전: `vX.Y.Z`
- 전체 상태: `planned`
- 완료 범위:
- 대기 범위:
- `docs` 태그: `vX.Y.Z` -> release workflow의 현재 docs tag commit
- `coupler-api` 태그:
- `coupler-admin-web` 태그:
- `coupler-mobile-app` 태그:

## 릴리스 결과

- 결과를 범위별로 기록한다.

## 메인 흐름

1. 릴리스 범위를 확정한다.
2. 포함 범위별 배포와 검증을 수행한다.
3. 서비스 태그와 docs 릴리스 기록을 확정한다.

## 검증 근거

- 검증 명령, 응답, 로그, workflow URL 또는 수동 검증 결과를 기록한다.

## 롤백 기준

- 범위별 롤백 기준점과 금지 사항을 기록한다.

## 후속 작업

- 남은 대기 범위와 완료 조건을 기록한다.

## 관련 문서

- [배포 태그/릴리즈 프로세스](../policy/release-process.md)
