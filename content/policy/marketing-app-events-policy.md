# 마케팅 앱 이벤트 정책

## 문서 역할

- 역할: `규범`
- 문서 종류: `policy`
- 충돌 시 우선 문서: 이 문서
- 기준 성격: `as-is`

## 목적

- 광고/마케팅 측정용 앱 이벤트의 기록 시점과 제외 조건을 고정해 앱/서버/운영 해석 차이를 줄인다.

## 적용 범위

- `coupler-mobile-app`
- Meta App Events, AppsFlyer 앱 이벤트
- 앱 설치 측정, 신규 회원가입 첫 심사 제출 전환 측정

## 단일 SoT

- 회원 심사 제출 의미: [회원 심사 단일 정책](member-review-policy.md)
- 회원가입 성공 응답: [회원가입 응답 계약](signup-response-contract.md)
- 리뷰/증빙 기준: [코드 리뷰 정책](code-review-policy.md)

## 이벤트 기준

| 제품 기준 | 외부 이벤트 | 기록 시점 | 제외 |
| --- | --- | --- | --- |
| 앱 설치 | AppsFlyer/Meta 모바일 측정 파트너 설치 이벤트 | 모바일 측정 파트너 연동 후 Events Manager에서 수신 여부 검증 | 수동 커스텀 설치 이벤트 추가 |
| 신규 가입 신청 | AppsFlyer `af_complete_registration`, Meta `fb_mobile_complete_registration`(AppsFlyer 포스트백) | 신규 가입자의 최초 `/app/v1/auth/signup`가 `result_code = 0`을 반환하고 클라이언트가 `result_data`를 상태에 반영한 뒤 | 기존 회원/승급 제출, 심사 재제출, 프로필 수정 제출, 버튼 탭만 발생한 경우, 클라이언트 검증 실패, API 실패, 네트워크 실패, 중복 제출 |

## 필수 규칙

- Meta 등록 완료 이벤트는 운영 승인 완료가 아니라 신규 가입자의 첫 심사 요청이 서버에 성공 접수된 시점이다.
- 앱 코드는 AppsFlyer `af_complete_registration`만 기록하고, Meta 전송은 AppsFlyer 인앱 이벤트 포스트백 설정으로 단일화한다.
- AppsFlyer `af_complete_registration`에는 가능한 경우 `af_registration_method`를 함께 전달한다.
- SDK 이벤트 전송 실패는 가입 플로우를 막지 않고 개발 환경 로그로 확인한다.
- 이벤트 의미를 변경하거나 새 마케팅 이벤트를 추가할 때는 이 문서를 같은 변경 단위에서 갱신한다.

## 검증 체크리스트

- [ ] Meta Events Manager에서 모바일 측정 파트너 앱 설치 또는 앱 실행 이벤트 수신을 확인했는가?
- [ ] 신규 가입자의 첫 `심사 요청하기` 성공 후 AppsFlyer `af_complete_registration`과 Meta 등록 완료 이벤트 수신을 확인했는가?
- [ ] AppsFlyer `af_complete_registration`에서 Meta `fb_mobile_complete_registration`으로 포스트백 매핑되어 있는가?
- [ ] 기존 회원/승급/재제출/프로필 수정/실패/중복 제출 시 가입 신청 이벤트가 기록되지 않는가?

## 관련 문서

- [회원 심사 단일 정책](member-review-policy.md)
- [회원가입 응답 계약](signup-response-contract.md)
- [로그 정책](log-policy.md)
