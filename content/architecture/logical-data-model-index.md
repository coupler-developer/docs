# 논리 데이터 모델 인덱스

## 문서 역할

- 역할: `설명`
- 문서 종류: `architecture`
- 충돌 시 우선 문서: [논리 데이터 모델 정책](../policy/logical-data-model-policy.md)
- 기준 성격: `as-is`

공개 논리 데이터 모델의 도메인 ID와 소유 문서를 연결하는 진입점이다. 엔티티와 관계의 실제 정의는 각 소유
문서에 한 번만 작성한다.

## 데이터 소유 도메인

| 도메인 ID | 표시명 | 책임 범위 | 소유 문서 |
| --- | --- | --- | --- |
| `member` | 회원 | 계정, 현재 프로필, 회원 생애주기와 회원 관계 이력 | [회원 라이프사이클](member-lifecycle.md) |
| `member-review` | 회원 심사 | 심사 요청, 인증 증거, 프로필 버전과 심사 조회 모델 | [회원 심사 시스템](member-review-system.md) |
| `club-manager` | 클럽매니저 | 클럽매니저 계정, 회원 배정, 상세 프로필 버전 | [클럽매니저 시스템](club-manager-system.md) |
| `matching` | 1:1 매칭 | 매칭, 일정, 통화, 후기와 상태 이력 | [매칭 시스템](matching-system.md) |
| `key-wallet` | Key 지갑 | 회원 Key 잔액, 변동 원장과 프로필 열람 거래 | [매칭 Key 시스템](matching-key-system.md) |
| `payment` | 결제 | 인앱결제 거래와 지급 결과 | [결제 시스템](payment-system.md) |
| `legacy-meeting` | 기존 2:2 미팅 | 기존 2:2 행사, 참가, 후기와 별점 | [기존 2:2 그룹미팅 시스템](meeting-system.md) |
| `group-meeting` | 그룹미팅 | 신규 n대n 행사, 신청, 참가, 이미지와 감사 이력 | [그룹미팅 시스템](group-meeting-system.md) |
| `lounge` | 라운지 | 게시글, 댓글과 반응 | [라운지 시스템](lounge-system.md) |
| `conversation` | 대화 | 상담·매칭·미팅 대화방, 참여자와 메시지 | [채팅 시스템](chat-system.md) |
| `moderation` | 신고·제재 | 신고, 차단, 숨김과 패널티 | [신고·제재 시스템](moderation-system.md) |
| `notification` | 알림 | 회원 알림 설정과 발송·저장 이력 | [푸시알림 시스템](push-notification.md) |
| `support` | 고객지원 | 고객센터 문의와 답변 생명주기 | [고객지원 시스템](support-system.md) |
| `admin-access` | 관리자 접근 | 관리자 계정과 접근 권한 | [관리자 권한 시스템](admin-permission.md) |
| `platform-config` | 플랫폼 기준정보 | 앱 버전, 설정, 공지, 가입 안내, 장소와 별칭 기준정보 | [플랫폼 기준정보 시스템](platform-config-system.md) |
| `analytics` | 분석 | 운영 데이터에서 계산한 통계 조회 모델 | [분석 시스템](analytics-system.md) |

## 공통 기능 문서

아래 문서는 여러 도메인의 데이터를 처리하지만 독립적인 데이터 소유권을 선언하지 않는다.

| 기능 | 문서 | 데이터 사용 기준 |
| --- | --- | --- |
| 자동화 작업 | [Cron 작업](cron-jobs.md) | 소유 도메인의 상태와 생명주기를 변경 |
| 미디어 처리 | [업로드/미디어 시스템](upload-media-system.md) | 소유 도메인의 이미지·영상 버전을 처리 |
| 개발 검증 | [테스트용 개발 데이터 시스템](development-test-data-system.md) | 소유 도메인의 합성 fixture를 생성·정리 |

## 사용 방법

- 새 논리 엔티티를 추가하기 전에 기존 도메인 소유권으로 설명 가능한지 확인한다.
- 새 도메인이 필요하면 이 인덱스, 소유 문서, 논리 모델 검증 fixture를 같은 변경에서 갱신한다.
- 물리 스키마 이름과 연결은 private 서비스 저장소의 매핑에서 관리한다.

## 관련 문서

- [논리 데이터 모델 정책](../policy/logical-data-model-policy.md)
- [문서 거버넌스 정책](../policy/document-governance-policy.md)
- [데이터 거버넌스 정책](../policy/data-governance-policy.md)
