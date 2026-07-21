# API 조회·동작 설계 정책

## 문서 역할

- 역할: `규범`
- 문서 종류: `policy`
- 충돌 시 우선 문서: 페이지/use-case 조회 집계 단위, operation 분류와 분리 기준은 이 문서, 응답 envelope·에러·공개 DTO·도메인 권한·결제 세부 규칙은 `단일 SoT와 우선순위` 표의 문서
- 기준 성격: `as-is`

## 목적

- Mobile/Admin 페이지가 필요한 데이터를 UI 요소별 연쇄 호출 없이 일관된 한 조회로 받고, 상태 변경·과금·대용량·실시간 경계만 근거 있게 분리하도록 API operation 설계 기준을 고정한다.

## 적용 범위

- `coupler-api`의 Mobile/Admin용 JSON API 신규 operation
- 성공 응답 구조, endpoint 동작 또는 소비 화면을 직접 수정하는 기존 operation
- API를 소비하는 `coupler-mobile-app`, `coupler-admin-web`의 페이지 진입·증분 조회·사용자 동작 요청 구조
- 기존 operation을 조합해 새 페이지/use-case를 만드는 변경
- 미디어 원본 전송, 외부 provider API, worker·cron 내부 호출은 operation 분류와 사용자 화면 집계 판정에서 제외하되, 공개 JSON API를 함께 제공하면 해당 공개 경계에는 이 정책을 적용한다.
- 변경 범위 밖 기존 operation은 자동 준수로 간주하지 않는다. 직접 수정하거나 새 소비 흐름에서 사용하면 이 정책으로 재평가한다.

## 단일 SoT와 우선순위

| 판정 책임 | 단일 SoT | 이 문서의 역할 | 충돌 해결 순서 |
| --- | --- | --- | --- |
| 페이지/use-case 조회 집계, operation 분류·분리 | 이 문서 | 최종 규칙 | 이 문서 |
| 공통 기술 원칙과 기술 이행 유형 | [엔지니어링 가드레일](engineering-guardrails.md) | 세부 API 구조 규칙 | 가드레일의 이행 유형을 고정한 뒤 이 문서 적용 |
| JSON 성공/실패 envelope | [API 공통 응답 계약 정책](api-response-contract-policy.md) | operation 내부 `data`의 설계 단위만 판정 | 응답 계약 정책 |
| 실패 `ErrorData`와 taxonomy | [API 에러 계약 정책](api-error-contract-policy.md) | 화면 집계 실패와 분리 예외의 경계만 판정 | 에러 계약 정책 |
| method/path와 operation별 공개 DTO | Swagger/OpenAPI | 설계한 operation의 책임·형태 기준 제공 | 이 문서로 operation 경계를 결정한 뒤 OpenAPI로 wire 계약 고정 |
| 계약 package 발행·소비 | [API 클라이언트 계약 패키지 정책](api-client-contract-package-policy.md) | 생성 계약 우회 금지 | 계약 패키지 정책 |
| 인증·인가와 민감정보 | [보안/접근통제 정책](security-access-control-policy.md) | 조회 집계가 권한 경계를 약화하지 않는 조건만 소유 | 보안 정책 |
| 결제·Key 원장과 사용자 동의 | [결제 운영 정책](payment-ops-policy.md), [매칭 운영 정책](matching-ops-policy.md) | 과금은 명시적 동작 명령으로 분리한다는 상위 operation 경계만 소유 | 도메인 결제 정책 |
| 테스트 범위와 표준 명령 | [테스트/CI 전략](testing-strategy.md) | operation 구조별 필수 시나리오 정의 | 테스트 전략 |
| 리뷰 절차와 증빙 | [코드 리뷰 정책](code-review-policy.md) | 설계 증빙 항목 제공 | 코드 리뷰 정책 |

- 도메인 policy/FSM은 누가 어떤 상태에서 무엇을 할 수 있는지를 소유한다. 이 문서는 그 결과를 몇 개의 API operation으로 전달할지 소유하며 도메인 권한을 다시 정의하지 않는다.
- 페이지 조회는 한 HTTP operation을 뜻하며 한 SQL, 한 테이블 또는 항상 한 DB transaction을 뜻하지 않는다. 서버는 필요한 source를 조합하되 권한과 상태의 논리적 시점을 일치시킨다.

## 용어와 operation 분류

| 분류 | 목적 | 대표 형태 | 기본 분리 기준 |
| --- | --- | --- | --- |
| `페이지 조회` | 페이지가 의미 있는 최초 화면을 그리는 데 필요한 서버 소유 상태 제공 | `GET` | 페이지/use-case당 페이지 소유 초기 데이터 1회 |
| `증분 조회` | 최초 화면 이후 더 보기, 검색, 갱신, 독립 주기 데이터 제공 | `GET` | cursor·검색조건·갱신주기가 독립적일 때 |
| `동작 명령` | 상태 변경, 과금, 신고, 발송, 읽음 처리 같은 부수효과 실행 | `POST`·`PUT`·`PATCH`·`DELETE` | 하나의 명시적 사용자·운영 의도와 transaction 경계 |
| `전송·스트림` | 파일 업로드·다운로드, 실시간 이벤트·미디어 스트림 | media/WebSocket 등 | 전송 프로토콜, 크기, 연결 생명주기가 다를 때 |

- `페이지`는 Mobile screen, Admin route 또는 사용자가 하나의 작업으로 인식하는 화면 단위를 뜻한다. 공통 앱 shell, 로그인 bootstrap, 전역 기준정보 cache는 페이지 소유 초기 데이터에서 제외할 수 있다.
- `의미 있는 최초 화면`은 핵심 콘텐츠와 현재 가능한 동작을 placeholder 추측 없이 표시할 수 있는 상태다. 사용자가 추가 동작을 하기 전부터 필요한 데이터는 최초 화면 데이터다.
- UI 컴포넌트, 버튼, 탭 내부 요소, DB 테이블, Repository 또는 담당 팀은 operation 분류 축이 아니다.

## 적용 상태와 생명주기

| 상태/단계 | 진입 조건 | 허용 구조 | Exit Gate | 비적용 근거 |
| --- | --- | --- | --- | --- |
| 신규·직접 수정 최종 상태 | 신규 operation, 성공 DTO/endpoint 동작/소비 페이지 직접 변경 | 단일 페이지 조회, 근거 있는 증분 조회·동작 명령·전송 경계 | 페이지 데이터 목록·요청 그래프·계약·테스트·리뷰 통과 | 없음 |
| 호환 배포 | 작업 요청자가 기존/다음 Mobile 또는 Admin 계약의 공존을 명시적으로 승인 | additive 페이지 조회 또는 경계가 명시된 versioned DTO/adapter | 승인 근거, 두 소비자 시나리오, 제거 조건·목표 시점·추적 이슈·검증 근거 | [엔지니어링 가드레일](engineering-guardrails.md)의 호환 배포 조건을 충족할 때만 적용 |
| 운영 legacy cutover | 이미 배포된 승인 예외의 요소별 조회·waterfall·구 DTO를 제거 | 제거 대상으로 고정된 legacy operation/adapter 삭제 | 강제 업데이트/mandatory, 현재 소비 경로 0건과 단일 페이지 조회 수렴 | 실제 운영 legacy 제거가 아니면 `N/A` |
| 변경 범위 밖 기존 구현 | operation과 소비 호출 경로를 수정·재사용하지 않음 | 현행 유지 가능, 준수 완료로 표기 금지 | 후속 직접 변경 시 재분류 | 영향 경로가 없다는 코드·호출 그래프 근거 필요 |

- 미래 기능을 위한 미사용 endpoint, enum mode, 응답 필드는 정상/최종 상태에 미리 공개하지 않는다. 제품 정책이
  확정되면 신규·직접 수정 최종 상태로 진입하며, 작업 요청자가 공존을 명시적으로 승인한 경우에만 호환 배포로
  진입한다.
- 기존 페이지의 요소별 호출을 새 페이지가 그대로 재사용하면 변경 범위 밖으로 보지 않는다. 새 소비 흐름의 요청 그래프 전체를 재평가한다.
- 기존 Mobile 화면과 Admin route 전체의 준수 여부 baseline 및 잔여 전환은 [기술 부채 정리](../technical-debt/technical-debt.md)의 `기존 API 페이지 조회 구조 감사·전환 미완료`에서 추적한다.

## 기존 API 고도화

- 기존 API는 endpoint 개수가 아니라 Mobile 화면·Admin route의 의미 있는 최초 화면까지 이어지는 소비자 요청 그래프를 단위로 감사한다.
- 각 요청 그래프를 `준수`, `허용된 분리`, `전환 필요`, `정책 비적용`으로 분류한다. `허용된 분리`에는 분리 조건과 독립 실패 UX, `정책 비적용`에는 인증·동작 명령·전송·스트림·내부 작업 등 비적용 근거를 남긴다.
- 사용자 진입 차단·부분 실패 시 핵심 데이터 소실, 종속 waterfall, visible item N+1, 권한·상태 혼합 snapshot, 높은 호출량·지연, 명령 뒤 강제 전체 재조회 순으로 우선순위를 높인다.
- 전환은 페이지별 vertical slice로 수행한다. 페이지 조회 DTO·서버 query·Swagger/OpenAPI·generated contract·Mobile/Admin 소비·테스트를 한 변경 묶음으로 정렬하고, 모든 기존 API를 한 번에 재작성하는 big-bang 작업으로 만들지 않는다.
- 기존 endpoint의 현재 소비 경로를 코드와 계약에서 확인하고, Store 출시 activation 강제 업데이트 또는 NextPush mandatory
  같은 교체 근거를 확보한 뒤 같은 최종 계약 배포에서 legacy를 제거한다. 일반적인 다른 소비자 가능성이나 24시간
  traffic 관찰을 기본 전제로 두지 않는다.
- baseline에 없는 기존 API를 준수로 추정하지 않으며, 감사만 끝내고 전환 필요 항목을 완료 처리하지 않는다. 잔여 전환이 있으면 기술부채 항목 또는 연결된 작업에서 계속 추적한다.

## 필수 규칙

### 1. 페이지/use-case에서 operation을 도출한다

1. 사용자 진입점과 의미 있는 최초 화면을 먼저 고정한다.
2. 화면 데이터 목록을 `필수 초기`, `선택 초기`, `증분`, `동작 결과`, `전역 cache`로 분류한다.
3. 페이지 소유 `필수 초기`와 첫 동작 판정에 필요한 `선택 초기`는 하나의 페이지 조회에 집계한다.
4. 증분 조회와 동작 명령은 이 문서의 분리 조건을 충족할 때만 별도 operation으로 둔다.
5. DB entity CRUD 목록을 먼저 만들고 Mobile/Admin이 조합하게 하지 않는다.

- 새로운 버튼이나 컴포넌트가 추가됐다는 이유만으로 endpoint를 추가하지 않는다.
- 같은 데이터가 여러 페이지에서 필요하면 필드별 endpoint를 만들지 않고 공통 domain query·read model 조각 또는 서버 내부 조합 로직을 재사용한다. 외부 operation은 각 use-case의 완결성을 유지한다.
- Mobile과 Admin의 권한·필드·payload 요구가 다르면 하나의 거대 공용 DTO에 합치지 않는다. 같은 use-case와 공개 계약이 실제로 같을 때만 operation을 공유하고, 다르면 소비면별 typed page read model을 둔다.
- 여러 endpoint를 한 HTTP 요청에 담기만 하는 범용 batch endpoint나 클라이언트가 `include` 목록으로 응답 구조를 조립하는 catch-all endpoint는 페이지 집계로 보지 않는다. 서버가 typed page DTO와 실패·권한·크기 경계를 소유해야 한다.
- 페이지 조회 controller는 조합을 오케스트레이션하되 domain 권한·상태 규칙을 복제하지 않는다. 재사용 가능한 domain service/query가 판정하고 page read model이 결과를 투영한다.
- operation 이름과 설명은 컴포넌트 이름보다 사용자·운영 use-case를 표현한다.

### 2. 페이지 조회는 최초 화면을 완결한다

- 페이지 소유 초기 서버 데이터의 네트워크 임계 경로는 페이지 조회 1회여야 한다.
- 페이지 조회 성공만으로 아래를 결정할 수 있어야 한다.
    - 핵심 콘텐츠와 header
    - 호출자의 역할·현재 상태
    - 서버가 판정한 사용 가능 동작
    - 화면에 즉시 보이는 bounded child summary 또는 최초 목록 page
    - 익명화·권한별 표시가 적용된 공개 display model
    - empty, read-only, terminal 같은 화면 상태
- 첫 응답에서 ID 목록만 받은 뒤 visible item마다 상세를 다시 호출하는 client N+1을 금지한다.
- 첫 응답의 상태를 해석하려고 권한·설정·상태 endpoint를 순서대로 호출하는 waterfall을 금지한다.
- 페이지 조회 안의 `capabilities` 또는 동등한 필드는 서버 도메인 판정의 projection이어야 한다. 클라이언트가 raw 상태 조합으로 권한을 재구현하지 않는다.
- 서버 내부에서는 여러 Repository나 query를 조합할 수 있다. 다만 권한·상태 변경에 따라 응답 의미가 달라지면 같은 transaction snapshot, 잠금 또는 동등한 일관성 경계로 혼합 시점 응답을 막는다.
- 페이지 조회가 커진다는 이유만으로 바로 분리하지 않는다. 필요한 컬럼 projection, bounded collection, summary read model과 적절한 query 계획을 먼저 검토한다.
- 전역 bootstrap/cache 데이터는 페이지와 독립된 생명주기, cold start 경로, 만료·실패 UX가 계약돼 있을 때만 페이지 조회에서 제외한다. warm cache만 가정해 최초 요청 수를 축소해서 기록하지 않는다.

### 3. 증분 조회는 최초 화면 이후에만 둔다

아래 중 하나가 증명될 때 별도 증분 조회를 허용한다.

- 목록이 unbounded이고 cursor/page 단위로 더 가져와야 한다.
- 데이터 크기나 생성 비용이 커서 최초 화면에 포함하면 사용자 지연이 유의미하게 증가한다.
- 사용자가 펼치기·검색·필터·새로고침을 하기 전에는 필요하지 않다.
- 페이지의 나머지 데이터와 갱신 주기·cache 수명이 독립적이다.
- 실시간 갱신 또는 스트림 연결 생명주기가 페이지 조회와 다르다.
- 더 강한 권한, 감사 또는 민감정보 경계를 별도로 적용해야 한다.

- unbounded 목록도 최초 화면에 보이는 첫 page가 필요하면 페이지 조회에 포함하고 후속 cursor만 증분 조회로 둔다.
- 별도 조회를 실패해도 페이지가 어떤 상태로 남는지 UI와 API 계약에 정의한다. 실패를 빈 배열·`null`로 조용히 바꾸지 않는다.
- “다른 컴포넌트”, “다른 테이블”, “재사용 가능성”, “나중에 필요할 수 있음”만으로는 분리할 수 없다.

### 4. 동작 명령은 조회와 분리한다

- 상태 변경, 읽음 경계 갱신, 메시지 전송, 신고, 차단, 나가기, 후기, 결제·환불·보상은 동작 명령으로 둔다.
- 조회 operation은 과금·읽음 상태·열람 보상·권한처럼 사용자나 domain 상태를 바꾸는 write를 숨겨 수행하지 않는다. 상태를 바꾸는 열람이면 명시적 동작 명령으로 이름·method·확인 흐름을 드러낸다.
- access log, trace, metric처럼 domain 판정에 사용하지 않는 관측 기록은 조회의 안전성을 깨는 write로 보지 않는다. 관측 기록 실패가 조회 결과를 바꾸거나 나중에 과금·보상 원장으로 승격되면 이 예외를 적용하지 않는다.
- 하나의 동작 명령은 하나의 사용자·운영 의도와 원자적 결론을 가져야 한다. 여러 독립 동작을 편의상 한 command로 묶지 않는다.
- 재시도 가능한 생성·전송·신고·결제 명령은 도메인 정책에 따른 idempotency key와 동일 요청 판정을 사용한다.
- 명령 성공 응답은 변경된 canonical 상태, version, 후속 `capabilities` 등 소비 페이지가 즉시 갱신하는 데 필요한 결과를 반환한다. 성공 직후 같은 페이지 조회를 의무적으로 다시 호출해야만 정확해지는 빈 응답을 기본으로 하지 않는다.
- 이벤트가 여러 페이지를 갱신해야 하면 명령 결과와 명시적 invalidation/event를 사용한다. 화면별 후속 GET 묶음을 command handler에 숨기지 않는다.

### 5. 과금과 민감정보는 명시적 경계로 둔다

- 현재 무료 조회를 서버 설정만 바꿔 같은 클릭에서 과금하도록 전환하지 않는다.
- 과금 기능은 가격·대상·사용자 확인이 보이는 별도 동작 명령으로 도입하고 결제/Key 정책의 transaction·원장·멱등성 규칙을 따른다.
- 미래 과금 가능성은 도메인 service와 read model 책임을 분리해 보존하되, 미사용 과금 endpoint나 응답 mode를 미리 공개하지 않는다.
- 페이지에 필요한 익명 닉네임, 공개 프로필 summary, 공개 이미지 URL은 권한·데이터 최소화 기준을 충족하면 페이지 조회에 포함할 수 있다.
- 전체 프로필, 인증정보, 결제정보처럼 별도 권한·감사·과금이 필요한 데이터는 페이지 공개 summary와 분리한다.
- 내부 회원 PK를 UI 동작 연결용으로 노출하지 않는다. 신고·프로필·차단 등에는 현재 page/use-case에 scope가 고정된 public action identifier를 사용하고 서버가 같은 scope 소속을 검증한다.

### 6. 응답은 페이지 read model이며 DB 복제본이 아니다

- 페이지 조회 DTO는 화면 use-case에 필요한 projection으로 정의한다. 테이블 row, 범용 entity, `SELECT *` 결과를 그대로 공개하지 않는다.
- 같은 원천 entity라도 페이지별 공개 필드·익명화·권한이 다르면 서버 내부 typed read model과 Presenter/Mapper로 의미를 투영할 수 있다.
- field가 UI 컴포넌트별 중복 객체로 반복되지 않게 정규화하되, 클라이언트가 여러 endpoint를 조합해야 할 정도로 외부 DTO를 DB 정규형으로 쪼개지 않는다.
- 응답의 collection은 최대 크기, 정렬, cursor와 `null`/empty 의미를 계약에 고정한다.
- path parameter는 scope를 드러내는 의미 이름을 사용한다. 중첩 자원에서 의미가 불명확한 `{id}` 대신 `{group_meeting_id}`, `{member_action_id}`처럼 서버가 검증할 대상을 구분한다.
- 선택 필드와 nullable 필드는 [엔지니어링 가드레일](engineering-guardrails.md)의 Optional/nullable 규칙을 따른다.

### 7. 실패와 부분 성공을 명시한다

- 페이지 핵심 데이터나 권한 판정이 실패하면 공통 실패 envelope로 전체 페이지 조회를 실패시킨다.
- 선택 section의 부분 실패를 허용하려면 해당 section 없이도 페이지의 핵심 목적이 안전하게 성립해야 하고, section 상태와 재시도 동작을 공개 DTO에 명시해야 한다.
- 서버 오류를 빈 목록, 숨김 버튼, 기본 권한 또는 이전 cache로 조용히 바꾸지 않는다.
- 병렬 내부 조회 중 하나가 실패했을 때 임의로 성공 부분만 조립하지 않는다. 승인된 degraded mode가 아니면 전체 실패한다.
- 페이지 조회와 증분 조회의 에러 action은 화면이 재시도·이탈·로그인·수정 중 무엇을 해야 하는지 구분할 수 있어야 한다.

### 8. 성능은 요청 수와 payload를 함께 판정한다

- 페이지 집계는 client 왕복을 줄이는 대신 서버 query N+1을 만들지 않아야 한다.
- visible item 수에 비례해 DB query 수나 외부 호출 수가 증가하면 batch query, join, projection 또는 bounded loader로 고친다.
- 페이지 조회의 payload는 최초 렌더에 필요한 범위로 제한하고 원본 media binary, 무제한 history, 전체 감사 이력을 포함하지 않는다.
- 성능 판정은 endpoint 개수만 세지 않고 client critical-path round trip, 서버 query/외부 호출 증가 차수, payload 크기, 권한 snapshot 일관성을 함께 본다.
- 주요 페이지 조회는 bounded collection 최대치에서 payload와 서버 query 수가 상한 안에 머무는지 검증한다. 성능 민감 변경은 같은 fixture·환경의 p95 또는 동등한 비교값을 남긴다.
- 성능 때문에 분리했다면 측정 조건, 비교값, 허용한 추가 로딩 상태를 PR에 남긴다. 측정 없는 “응답이 클 것 같음”은 분리 근거가 아니다.

### 9. 계약 진화와 호환을 숨기지 않는다

- 페이지 조회에 field를 추가·변경하거나 여러 기존 조회를 집계 operation으로 전환하면
  [엔지니어링 가드레일](engineering-guardrails.md)의 API 계약 변경과 강제 업데이트 배포 기준을 따른다.
- 기존/다음 소비자 공존을 작업 요청자가 명시적으로 승인한 경우에만 additive field, versioned DTO 또는 경계가
  보이는 adapter를 사용한다. 클라이언트가 여러 shape를 fallback으로 추측하지 않는다.
- 승인된 요소별 legacy endpoint를 유지해야 하면 승인 근거, 제거 조건, 목표 시점, 추적 이슈와 검증 근거를 둔다.
  traffic 관찰은 작업 요청자가 별도로 요구한 경우에만 Exit Gate에 추가한다.
- 미래 기능을 위해 현재 의미 없는 nullable field, disabled enum, 미사용 endpoint를 추가하지 않는다. 기능 활성 시 계약과 소비자 확인 흐름을 같은 변경 단위에서 설계한다.

## 분리 판단표

| 후보 데이터·동작 | 기본 배치 | 별도 operation 허용 조건 |
| --- | --- | --- |
| page header, self context, 권한·capabilities | 페이지 조회 | 별도 허용 안 함. 전역 bootstrap cache는 근거가 있을 때 제외 |
| 화면에 즉시 보이는 bounded 구성원·summary | 페이지 조회 | 더 강한 민감정보 경계가 summary 자체에도 필요한 경우 |
| 최초 목록 page | 페이지 조회 | 목록 없이도 의미 있는 최초 화면이 성립하고 독립 skeleton/error UX가 계약된 경우 |
| 과거 메시지·무한 스크롤 다음 page | 증분 조회 | cursor·정렬·중복 제거 계약 필요 |
| 공개 프로필 summary | 페이지 조회 | 대상별 별도 권한이 summary에도 적용되는 경우 |
| bounded 구성원의 공개 profile card | 페이지 조회 | 클릭 전 불필요하고 크기·생성 비용 또는 더 강한 권한이 측정·계약된 경우 |
| 전체 민감 프로필 | 별도 조회 또는 동작 명령 | 별도 권한·감사·과금 중 하나가 실제 존재할 때 |
| 메시지 전송·읽음·신고·나가기 | 동작 명령 | 항상 분리 |
| 이미지·영상 binary | 전송 | metadata·URL은 페이지 조회 포함 가능 |
| 실시간 신규 이벤트 | 스트림/구독 | 최초 snapshot은 페이지 조회에 포함 |

## 설계 절차

1. 페이지/use-case 이름과 사용자 목표를 한 문장으로 작성한다.
2. 화면 데이터 목록과 가능한 동작을 표로 작성한다.
3. 각 항목을 `필수 초기`, `선택 초기`, `증분`, `동작 결과`, `전역 cache`로 분류한다.
4. operation을 `페이지 조회`, `증분 조회`, `동작 명령`, `전송·스트림` 중 하나로 분류한다.
5. 페이지 진입부터 의미 있는 최초 화면까지 client 요청 그래프를 그린다.
6. 페이지 조회 1회를 넘는 각 초기 조회에 분리 조건과 실패 UX 근거를 붙인다.
7. 서버 내부 query/외부 호출 그래프와 권한 snapshot 경계를 검토한다.
8. 공개 field의 민감도, 익명화, public action identifier와 최대 collection 크기를 고정한다.
9. 의미 있는 path parameter 이름과 Swagger/OpenAPI operation DTO·generated contract를 작성한다.
10. 페이지 완결성, 권한별 field, 증분 경계, command 결과, client waterfall 부재를 테스트한다.

## 증빙/추적

신규 또는 직접 수정한 페이지/use-case API의 PR/작업 보고에는 아래를 남긴다.

- 페이지/use-case와 의미 있는 최초 화면 정의
- 화면 데이터 목록과 `필수 초기`·`선택 초기`·`증분`·`동작 결과`·`전역 cache` 분류
- operation 분류와 요청 그래프
- 페이지 소유 초기 조회가 1회를 넘으면 각 분리 근거와 독립 실패 UX
- 서버 query/외부 호출 증가 차수와 권한 snapshot 경계
- bounded collection 최대치의 payload·query 수와 성능 민감 변경의 비교 측정값
- 공개 field·익명화·민감정보 제외·public action identifier 근거
- command 성공 후 강제 재조회 필요 여부와 page state 갱신 방식
- Swagger/OpenAPI·generated contract·소비자 경계 정렬 결과
- 적용 테스트와 [테스트/CI 전략](testing-strategy.md)의 표준 품질 게이트 결과
- 호환/legacy가 있으면 제거 조건, 목표 시점, 추적 이슈와 검증 근거
- 기존 API 고도화면 요청 그래프 baseline 분류, 우선순위, 페이지별 전환·legacy 제거 결과

## 검증 기준

- 페이지 조회 계약 테스트는 역할·상태별 필수 초기 데이터, `capabilities`, bounded 최초 collection과 민감정보 비노출을 검증한다.
- 소비자 화면 테스트는 페이지 진입이 page-owned dependent API waterfall 없이 의미 있는 최초 화면에 도달하는지 검증한다.
- visible item별 추가 조회가 필요한 구현은 허용된 증분·민감정보 경계인지 검증하고, 아니면 실패 테스트로 고정한다.
- 증분 조회는 cursor 경계, 정렬, 중복·누락, empty/terminal page를 검증한다.
- 동작 명령은 허용·거부 권한, 멱등성 적용 대상, canonical 변경 결과와 후속 page 갱신을 검증한다.
- 페이지 집계 내부에서 상태·권한이 바뀌는 동시성 시나리오가 있으면 혼합 snapshot이 공개되지 않는지 검증한다.
- 과금·결제 기능이 포함되면 [테스트/CI 전략](testing-strategy.md)의 High 변경 최소 검증과 도메인 결제 정책을 추가 적용한다.

## 완료 정의

- 페이지/use-case의 operation 분류와 요청 그래프가 기록돼 있다.
- 페이지 소유 초기 데이터가 페이지 조회 1회로 완결되거나, 모든 추가 초기 조회가 허용 조건과 독립 실패 UX를 가진다.
- UI 요소·DB entity·Repository 단위 endpoint와 client N+1/waterfall이 신규·직접 수정 범위에 0건이다.
- 페이지 조회, 증분 조회, 동작 명령, 전송·스트림의 책임이 섞이지 않는다.
- 공개 DTO가 bounded projection이며 민감정보와 내부 식별자를 노출하지 않는다.
- command 성공 뒤 정확한 화면 갱신을 위해 동일 페이지 전체를 의무적으로 재조회하는 구조가 없거나, 실시간·외부 일관성상 필요한 근거가 있다.
- 호환/legacy 예외는 제거 조건·목표 시점·추적·검증 근거를 갖고 최종 상태와 충돌하지 않는다.
- 기존 API 전체 고도화 완료를 주장하려면 정책 적용 대상 화면·route baseline 100%, 전환 필요 0건, legacy 제거 Gate 통과가 확인돼 있다.
- Swagger/OpenAPI, generated contract, API runtime, Mobile/Admin 소비와 관련 정책이 같은 결론을 가리킨다.
- 마지막 변경 이후 적용 검증과 [문서 거버넌스 정책](document-governance-policy.md)의 `정책 Composition Gate`가 `No Findings`다.

## 체크리스트

- [ ] 페이지/use-case와 의미 있는 최초 화면을 먼저 정의했는가?
- [ ] 화면 데이터 목록을 `필수 초기`·`선택 초기`·`증분`·`동작 결과`·`전역 cache`로 분류했는가?
- [ ] operation을 `페이지 조회`·`증분 조회`·`동작 명령`·`전송·스트림` 중 하나로 분류했는가?
- [ ] 페이지 소유 초기 서버 데이터가 페이지 조회 1회로 완결되는가?
- [ ] ID 목록 후 item별 상세 조회, 권한·설정 순차 조회 같은 client N+1/waterfall이 없는가?
- [ ] 각 별도 초기 조회가 허용 조건과 독립 실패 UX를 갖는가?
- [ ] 버튼·컴포넌트·테이블·Repository 차이를 endpoint 분리 근거로 사용하지 않았는가?
- [ ] 범용 batch·임의 `include` endpoint로 페이지 조합 책임을 클라이언트에 되돌리지 않았는가?
- [ ] 페이지 조회가 bounded projection이고 권한 snapshot이 일관적인가?
- [ ] path parameter가 `{id}`가 아니라 scope와 검증 대상을 드러내는 의미 이름인가?
- [ ] 공개 summary와 민감·과금 대상 상세를 구분했는가?
- [ ] 동작 명령이 명시적 의도, transaction, 멱등성 적용 여부와 canonical 결과를 갖는가?
- [ ] command 성공 후 불필요한 동일 페이지 전체 재조회 묶음이 없는가?
- [ ] 미래 기능을 위한 미사용 endpoint·field·enum mode를 공개하지 않았는가?
- [ ] 호환/legacy 예외에 제거 조건·목표 시점·추적 이슈·검증 근거가 있는가?
- [ ] 기존 API 고도화면 대상 화면·route 요청 그래프를 빠짐없이 분류하고 잔여 전환을 기술부채로 추적했는가?
- [ ] Swagger/OpenAPI·generated contract·API·소비자 테스트와 표준 품질 게이트를 통과했는가?
- [ ] [문서 거버넌스 정책](document-governance-policy.md)의 `정책 Composition Gate`를 통과했는가?

## 예시: 그룹미팅 채팅 페이지의 목표 operation 구조

이 예시는 operation 구조를 설명하며 구성원 노출 상태·공개 profile field·과금 여부 같은 domain 제품 정책을 새로 정의하지 않는다. 페이지 조회는 행사 header, 호출자 `self`, read-only 상태, domain 정책상 노출 가능한 구성원과 클릭 즉시 그릴 수 있는 공개 profile card, 가능한 동작, 최초 메시지 page를 한 응답으로 제공한다. 과거 메시지 cursor 조회와 메시지 전송·읽음·신고·나가기는 별도 operation으로 둔다.

```text
페이지 진입
  -> GET /app/group-meetings/{group_meeting_id}/chat
       - event
       - self
       - members[] + public_profile_card
       - capabilities
       - initial_messages

최초 화면 이후
  -> GET  /app/group-meetings/{group_meeting_id}/chat/messages?before_id=...
  -> POST /app/group-meetings/{group_meeting_id}/chat/messages
  -> POST /app/group-meetings/{group_meeting_id}/chat/read
  -> POST /app/group-meetings/{group_meeting_id}/reports
  -> POST /app/group-meetings/{group_meeting_id}/chat/leave
```

아래 구조는 금지한다.

```text
GET /chat/header
GET /chat/self
GET /chat/member-ids
GET /chat/members/{id}/nickname      # visible item마다 반복
GET /chat/members/{id}/image         # visible item마다 반복
GET /chat/permissions
GET /chat/review-availability
POST /batch                              # 요소별 요청을 포장만 함
GET /chat?include=header,self,members    # 클라이언트가 응답 책임을 조립
```

## 롤백

- 정책 변경 자체의 rollback 기준점은 변경 전 `main` commit이다.
- API 계약 적용 중 rollback은 API, Admin, Mobile과 강제 업데이트/mandatory 기준을 직전 검증 snapshot으로
  함께 되돌린다.
- 승인된 additive 호환 배포를 되돌릴 때는 승인 범위와 두 소비자 상태를 확인한 뒤 새 page DTO/endpoint를
  제거한다.
- legacy endpoint 제거를 되돌려야 하면 전체 직전 snapshot을 복구한다. 작업 요청자의 새 명시 승인 없이 제거 전
  adapter만 한시 복원하지 않는다.

## 관련 문서

- [엔지니어링 가드레일](engineering-guardrails.md)
- [API 공통 응답 계약 정책](api-response-contract-policy.md)
- [API 에러 계약 정책](api-error-contract-policy.md)
- [API 클라이언트 계약 패키지 정책](api-client-contract-package-policy.md)
- [보안/접근통제 정책](security-access-control-policy.md)
- [결제 운영 정책](payment-ops-policy.md)
- [테스트/CI 전략](testing-strategy.md)
- [코드 리뷰 정책](code-review-policy.md)
- [문서 거버넌스 정책](document-governance-policy.md)
- [기술 부채 정리](../technical-debt/technical-debt.md)
