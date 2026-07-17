# 분석 시스템

## 문서 역할

- 역할: `설명`
- 문서 종류: `architecture`
- 충돌 시 우선 문서: [데이터 거버넌스 정책](../policy/data-governance-policy.md)
- 기준 성격: `as-is`

운영 데이터에서 계산되는 통계 조회 모델의 소유 경계를 설명한다.

## 범위

- 로그인·활동 등 운영 집계
- 원천 업무 데이터의 재정의나 쓰기 기준은 포함하지 않는다.
- 통계 조회 권한은 [관리자 권한 시스템](admin-permission.md)을 따른다.

## 논리 데이터 모델

- 도메인 ID: `analytics`

### 논리 엔티티

| 논리 ID | 표시명 | 생명주기 역할 | 엔티티 형태 | 기록 역할 | 책임 | 최고 데이터 분류 | 생명주기 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `analytics.login-statistic` | 로그인 통계 | root | entity | projection | 일자·성별·시간대별 로그인 집계 | 내부 | 원천 데이터에서 재생성 가능하며 집계 보관 정책 적용 |

### 관계

| 출발 논리 ID | 관계 역할 | 관계 유형 | 도착 논리 ID | 카디널리티 | 소유·삭제 규칙 |
| --- | --- | --- | --- | --- | --- |
| `analytics.login-statistic` | `source-members` | derives-from | `member.member` | N:M | 개인 식별정보 없이 집계하며 원천 회원의 현재 상태를 대체하지 않음 |

### 불변조건

| 규칙 ID | 관련 논리 ID | 불변조건 | 기준 문서 |
| --- | --- | --- | --- |
| `ANALYTICS-INV-001` | `analytics.login-statistic` | 집계 데이터는 회원 상태나 권한 판정의 쓰기 기준으로 사용하지 않는다 | [데이터 거버넌스 정책](../policy/data-governance-policy.md) |
| `ANALYTICS-INV-002` | `analytics.login-statistic` | 공개·공유 결과에서 개인을 재식별할 수 있는 세부값을 노출하지 않는다 | [데이터 거버넌스 정책](../policy/data-governance-policy.md) |

## 관련 문서

- [데이터 거버넌스 정책](../policy/data-governance-policy.md)
- [관리자 권한 시스템](admin-permission.md)
- [논리 데이터 모델 정책](../policy/logical-data-model-policy.md)
