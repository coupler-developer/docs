# 플랫폼 기준정보 시스템

## 문서 역할

- 역할: `설명`
- 문서 종류: `architecture`
- 충돌 시 우선 문서: 이 문서
- 기준 성격: `as-is`

서비스 전역에서 공유하는 운영 설정과 기준정보의 저장 책임을 설명한다. 별도 규범이 필요한 설정의 값과
변경 절차는 각 도메인 정책을 우선한다.

## 논리 데이터 모델

- 도메인 ID: `platform-config`

### 논리 엔티티

| 논리 ID | 표시명 | 생명주기 역할 | 엔티티 형태 | 기록 역할 | 책임 | 최고 데이터 분류 | 생명주기 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `platform-config.setting` | 운영 설정 | root | entity | reference | Key 비용·보상 등 서버 운영 기준값 | 내부 | 변경 이력을 운영 절차로 추적하며 현재값 유지 |
| `platform-config.app-release` | 앱 배포 기준 | root | entity | reference | 플랫폼별 버전, 최소 버전과 심사 상태 | 내부 | 앱 릴리스 전환 시 갱신 |
| `platform-config.notice` | 공지 | root | entity | reference | 사용자 공지 내용과 노출 상태 | 일반 | 게시 기간과 운영 상태에 따라 보관 |
| `platform-config.signup-message` | 가입 안내 | root | entity | reference | 클럽매니저·성별·지역별 가입 인사와 무료 Key | 내부 | 운영 템플릿 변경 시 갱신 |
| `platform-config.meeting-place` | 만남 장소 | root | entity | reference | 추천 장소와 지도·연락 정보 | 일반 | 운영 사용 여부에 따라 활성·비활성 |
| `platform-config.alias` | 별칭 기준 | root | entity | reference | 비공개 활동에 사용하는 성별·유형별 별칭 | 내부 | 운영 목록 변경 시 갱신 |

### 관계

| 출발 논리 ID | 관계 역할 | 관계 유형 | 도착 논리 ID | 카디널리티 | 소유·삭제 규칙 |
| --- | --- | --- | --- | --- | --- |
| `platform-config.signup-message` | `manager` | references | `club-manager.manager` | N:1 | 클럽매니저 비활성 뒤에도 과거 발송 근거를 보존 |
| `matching.match` | `meeting-place` | references | `platform-config.meeting-place` | N:1 | 장소 기준정보 비활성 뒤 기존 매칭 이력은 유지 |
| `lounge.post` | `display-alias` | references | `platform-config.alias` | N:1 | 공개 프로필 여부에 따라 별칭을 표시 |

### 불변조건

| 규칙 ID | 관련 논리 ID | 불변조건 | 기준 문서 |
| --- | --- | --- | --- |
| `PLATFORM-CONFIG-INV-001` | `platform-config.setting` | 금액·보상 설정은 사용하는 도메인이 기대하는 부호와 범위를 만족해야 한다 | [엔지니어링 가드레일](../policy/engineering-guardrails.md) |
| `PLATFORM-CONFIG-INV-002` | `platform-config.app-release` | 최소 지원 버전은 현재 배포 버전보다 높게 설정할 수 없다 | [배포/릴리즈 프로세스](../policy/release-process.md) |
| `PLATFORM-CONFIG-INV-003` | `platform-config.signup-message` | 활성 가입 안내는 적용 범위에서 하나의 결정적인 템플릿으로 선택돼야 한다 | [엔지니어링 가드레일](../policy/engineering-guardrails.md) |

## 관련 문서

- [배포/릴리즈 프로세스](../policy/release-process.md)
- [결제 운영 정책](../policy/payment-ops-policy.md)
- [매칭 운영 정책](../policy/matching-ops-policy.md)
- [논리 데이터 모델 정책](../policy/logical-data-model-policy.md)
