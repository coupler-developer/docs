# 레포지토리 요약

## 문서 역할

- 역할: `설명`
- 문서 종류: `architecture`
- 충돌 시 우선 문서: 레포 책임은 이 문서, 기술·운영 세부 기준은 각 행의 연결 문서
- 기준 성격: `as-is`

## 목적

- 공용 workspace의 네 레포 책임과 다음에 읽을 문서를 한 곳에서 연결한다.

## 범위

- 레포별 안정적인 책임과 교차 레포 경계를 설명한다.
- 실행 명령, 배포 경로, 현재 package·runtime·release 상태는 소유 policy, flow, release 기록을 따른다.

## 상위 규범 문서

- 공통 기술·클라이언트/서버 책임은 [엔지니어링 가드레일](../policy/engineering-guardrails.md)을 따른다.
- 문서 역할과 동기화 책임은 [문서 거버넌스 정책](../policy/document-governance-policy.md)을 따른다.

## 레포 책임

| 레포 | 책임 | 먼저 볼 문서 |
| --- | --- | --- |
| `coupler-api` | 서버 비즈니스 판정, API 계약과 데이터 저장 경계 | [엔지니어링 가드레일](../policy/engineering-guardrails.md), [API 조회·동작 설계 정책](../policy/api-operation-design-policy.md) |
| `coupler-admin-web` | 관리자 운영 화면과 서버가 허용한 운영 액션의 표시·입력 | [관리자 권한](admin-permission.md), [Admin 운영 배포 런북](../flows/cross-project/admin-web-production-deploy-flow.md) |
| `coupler-mobile-app` | 사용자 화면, 입력 전달과 네이티브 기능 연동 | [Mobile to-be 아키텍처](mobile-app-to-be.md), [Kakao 네이티브 로그인 플로우](../flows/cross-project/kakao-native-login-flow.md) |
| `docs` | 교차 레포 policy·architecture·flow·릴리스 증빙과 agent routing | [문서 거버넌스 정책](../policy/document-governance-policy.md), [Workspace AGENTS](../AGENTS.md) |

## 교차 레포 경계

- Admin과 Mobile은 API가 공개한 계약을 소비하며, 계약의 생성·발행·소비 경계는
  [API 클라이언트 계약 패키지 정책](../policy/api-client-contract-package-policy.md)이 설명한다.
- 비즈니스 판정의 서버 단일 기준과 클라이언트 경계는
  [엔지니어링 가드레일](../policy/engineering-guardrails.md)을 따른다.
- 다중 레포 변경의 적용 순서와 검증은 연결된 policy, flow와 release 기록에서 소유한다.

## 관련 문서

- [API 계약 변경 모바일 릴리즈 플로우](../flows/cross-project/api-contract-mobile-release-flow.md)
- [배포/릴리즈 프로세스](../policy/release-process.md)
- [테스트/CI 전략](../policy/testing-strategy.md)
