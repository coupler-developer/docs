# 예정 논리 데이터 모델 인덱스

## 문서 역할

- 역할: `설명`
- 문서 종류: `architecture`
- 충돌 시 우선 문서: [논리 데이터 모델 정책](../policy/logical-data-model-policy.md)
- 기준 성격: `as-is`

아직 현행 서비스 계약으로 승격하지 않은 공개 논리 데이터 모델의 도메인 ID와 소유 문서를 연결한다. 예정
모델은 설계·구현 준비 상태를 뜻하며 물리 스키마와 비공개 연결 정보에 선행 구현되어 있을 수 있다. 물리
구현의 존재만으로 현행 서비스 계약이나 출시 완료로 보지 않는다. 이 인덱스 자체는 현재 예정 모델 등록
상태를 설명하므로 `as-is`다.

## 예정 데이터 소유 도메인

| 도메인 ID | 표시명 | 책임 범위 | 소유 문서 |
| --- | --- | --- | --- |
| `group-meeting` | 그룹미팅 | 신규 n대n 행사, 신청, 참가, 이미지와 감사 이력 | [그룹미팅 시스템](group-meeting-system.md) |

## 승격 규칙

- 구현·migration·운영 전환 조건을 충족하기 전까지 이 인덱스에 둔다.
- 현행 승격 시 이 행을 [현행 인덱스](logical-data-model-index.md)로 이동하고 소유 문서의 기준 성격을
  `as-is`로 변경한다.
- 생성 catalog와 private 물리 매핑을 같은 조정 작업에서 갱신하고 양쪽 drift gate를 통과시킨다.
- 현행과 예정 인덱스에 같은 도메인이나 소유 문서를 동시에 등록하지 않는다.

## 관련 문서

- [논리 데이터 모델 정책](../policy/logical-data-model-policy.md)
- [논리 데이터 모델 인덱스](logical-data-model-index.md)
- [문서 거버넌스 정책](../policy/document-governance-policy.md)
- [데이터 거버넌스 정책](../policy/data-governance-policy.md)
