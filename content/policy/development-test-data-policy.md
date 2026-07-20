# 테스트용 개발 데이터 정책

## 문서 역할

- 역할: `규범`
- 문서 종류: `policy`
- 충돌 시 우선 문서: 이 문서
- 기준 성격: `as-is`
- 현재 구조: active namespace는 하나의 완전한 suite generation만 가리키며 모든 갱신은 원자 generation cutover로 수행
- 전환 완료: 공유 개발계 `qa-cms-20260716`을 catalog v7 generation 2로 승격하고 임시 단일-domain·legacy asset 채택 경로를 제거

공유 개발계 검증과 고도화 잔여 범위는 [기술 부채 정리](../technical-debt/technical-debt.md)의
`테스트용 개발 데이터 운영 검증·고도화 미완료`에서 추적한다.

## 목적

- 로컬·개발계에서 회원, 매칭, 그룹미팅, 라운지, 결제·매출, 통계 등 관리자 시스템 화면을 재현할 합성 데이터를 안전하고 반복 가능하게 제공한다.
- 테스트 데이터 생성이 운영 데이터 복제, 실제 결제·알림, 기존 개발 데이터 훼손, 미분류 관리자 화면을 만들지 않도록 기준을 고정한다.

## 적용 범위

- 생성 도구: `coupler-api/tools/dev-data`
- 소비 화면: `coupler-admin-web`의 component route 전체(데이터 탭·상세 화면·비데이터 화면 audit)
- 보조 소비자: 동일 개발계 API를 사용하는 `coupler-mobile-app` QA 빌드
- 허용 환경: 개인 로컬 DB, CI의 일회성 DB, 공유 개발계 DB

다음은 이 정책의 범위가 아니다.

- 단위 테스트 내부 mock·fixture
- 운영 원문 dump를 이용한 테스트 데이터 생성
- 기존 개발계 회원의 빈 컬럼 보정 또는 데이터 복구
- DB schema migration과 운영 기준정보 변경
- 부하·성능 시험용 대량 데이터

## 단일 SoT

- 테스트용 개발 데이터의 생성·식별·검증·초기화 규칙: 이 문서
- 개인정보와 운영 원문 사용 금지: [데이터 거버넌스 정책](data-governance-policy.md)
- 관리자 권한과 중요 액션 통제: [보안/접근통제 정책](security-access-control-policy.md)
- 결제·환불 불변식: [결제 운영 정책](payment-ops-policy.md)
- 회원 심사 상태: [회원 심사 단일 정책](member-review-policy.md)
- 매칭 상태·키·일정: [매칭 운영 정책](matching-ops-policy.md)
- DB schema 변경: [DB Migration Gate 정책](db-migration-gate-policy.md)
- 구현 구조와 도메인 구성: [테스트용 개발 데이터 시스템](../architecture/development-test-data-system.md)
- 실행·검증·초기화 순서: [테스트용 개발 데이터 운영 흐름](../flows/cross-project/development-test-data-flow.md)

## 용어

| 용어 | 의미 |
| --- | --- |
| 합성 데이터 | 실제 회원·거래·운영 기록을 복제하거나 변형하지 않고 새로 만든 테스트 데이터 |
| namespace | 한 번의 데이터 묶음을 식별하는 3~32자의 소문자 ASCII 식별자 |
| 시나리오 | 한 화면 상태와 관련 불변식을 재현하는 최소 데이터 묶음 |
| suite | 여러 시나리오를 목적별로 묶은 실행 단위 |
| run registry | namespace별 owner·유지 기한·적용 상태·catalog/schema version을 보존하는 개발 전용 기록 저장소 |
| generation | 같은 namespace·suite의 완전한 catalog/schema/reference 시점 데이터와 asset을 묶는 불변 실행 단위 |
| active generation | DB·asset·Run Registry 검증을 모두 통과해 소비자가 사용하도록 승격된 유일한 세대 |
| cutover journal | source·candidate 세대, 단계와 ETag를 기록해 DB commit 결과를 복구하는 내구성 기록. 임시 domain-addition 호환 모드가 아니다 |
| 기준정보 | 설정, 별칭, 장소처럼 여러 시나리오가 공유하며 임의 reset 대상이 아닌 데이터 |
| coverage manifest | 관리자 화면별 필수 시나리오와 검증 방법을 빠짐없이 연결한 목록 |
| branch obligation | 상태·전이·권한·filter·시간 경계처럼 최소 한 시나리오가 반드시 충족해야 하는 분기 조건 |
| 정상 시나리오 | 도메인 정책과 허용 상태 조합을 만족하는 정상 데이터 |
| negative 시나리오 | fail-closed 검증을 위해 의도적으로 계약을 위반한 데이터 |
| root | namespace 소유권을 직접 표시하는 최상위 생성 행 |
| child | root의 회원·매칭·게시글 식별자로 역추적되는 관계 행 |
| orphan | 소유 root가 삭제됐지만 남아 있는 생성 child |
| asset | 프로필·게시글·그룹미팅 화면에 사용하는 합성 미디어 파일 |

## 생명주기 최종 상태

- 모든 active namespace는 하나의 완전한 active generation만 가진다.
- catalog/schema/reference/expiry 갱신은 같은 namespace·같은 suite의 다음 generation cutover만 사용한다.
- generation·run-scoped asset identity 또는 합성 `t_member` root exact set이 없는 active record는 자동 채택·보정하지 않고 fail-closed한다.
- 단일 domain 추가·교체, 순차 `reset -> apply`, 임시 namespace 복제와 legacy asset 채택 옵션은 제공하지 않는다.
- cutover journal은 DB commit과 registry 승격 사이 장애를 복구하는 영구 원자성 장치이며 임시 호환 경로가 아니다.
- 2026-07-20 공유 개발계 cutover에서 generation 2, catalog v7, current schema fingerprint, exact scenario manifest, run-scoped asset, journal 0건과 cron 정상 실행을 확인했다.

## 필수 규칙

### 1) 소유 위치와 실행 경계

- DB write를 수행하는 생성 엔진은 DB schema와 상태 상수를 소유한 `coupler-api/tools/dev-data`에 둔다.
- 별도 repository, Mobile, Admin 브라우저 코드에 DB 접속정보나 생성 SQL을 두지 않는다.
- `coupler-admin-web`에는 탭별 coverage descriptor와 검증 테스트만 두며 DB write 기능을 두지 않는다.
- 운영 API route와 Admin 버튼으로 `apply`, `upgrade` 또는 `reset`을 노출하지 않는다.
- 생성 도구는 운영 서버 시작 경로와 import graph에서 분리하고 명시적 CLI 명령으로만 실행한다.
- API `tools/dev-data`와 Admin browser smoke는 각 repository의 표준 typecheck·lint·format·test 필수 경로에 포함하며 별도 경로라는 이유로 skip하지 않는다.

### 2) 환경 식별과 fail-closed

- 실행 전 설정의 개발 데이터 활성화 값, 환경명, 실제 DB 식별값을 모두 확인한다.
- 실제 DB 식별값은 최소 `DATABASE()`, 서버 식별값, host allowlist를 비교한다.
- 허용값 누락, 불일치, 조회 실패는 기본 허용하지 않고 즉시 중단한다.
- 운영 DB로 식별되면 identity 확인 query 뒤 즉시 종료하며 비즈니스 테이블 조회와 write를 모두 금지한다.
- 운영 차단을 우회하는 `--force`, `--skip-guard` 같은 옵션을 만들지 않는다.
- 공유 개발계의 `apply`, `upgrade`, `reset`은 namespace 단위 잠금을 획득한 경우에만 실행한다.

### 3) 데이터 출처와 개인정보

- 회원·결제·신고·상담·미디어 데이터는 합성 데이터만 사용한다.
- 운영 원문, 운영 dump, 실제 회원을 익명화·마스킹·변형한 값을 seed로 사용하지 않는다.
- 이메일은 예약된 예시 도메인, 전화번호와 외부 식별자는 발송·결제가 불가능한 합성 형식을 사용한다.
- 로그인에 사용할 수 있는 원문 비밀번호, 인증 토큰, FCM token, 실제 영수증, 실제 주문번호, 주민식별정보를 저장하지 않는다.
- 합성 데이터라도 로그에는 비밀번호·토큰·접속정보를 출력하지 않는다.

### 4) namespace와 소유권

- 공유 개발계 write 명령은 namespace를 필수 입력으로 받는다.
- namespace는 `^[a-z][a-z0-9-]{2,31}$`를 만족해야 하며 입력을 소문자 변환하거나 잘라서 보정하지 않는다.
- `.`, `..`, `/`, `\\`, percent-encoding, 공백, Unicode 동형 문자가 포함된 namespace는 DB나 저장소에 접근하기 전에 거부한다.
- namespace와 scenario ID는 query parameter로만 사용하고 SQL 식별자나 SQL 문자열을 조립하는 데 사용하지 않는다.
- 미디어 경로는 기준 directory와 대상 경로를 정규화한 뒤 대상이 기준 directory 내부인지 확인하며, containment 검증 실패 시 apply와 reset을 모두 중단한다.
- 생성한 모든 root는 namespace와 scenario ID로 역추적할 수 있어야 한다.
- generation record는 scenario별 보조 row reference와 별도로 해당 generation의 합성 `t_member` root ID exact set을 기록한다. active 검증·upgrade 복구·reset은 DB의 namespace 합성 회원 ID exact set과 이 기록이 같지 않으면 중단한다.
- 기존 행과 식별자가 충돌하면 기존 행을 수정하지 않고 중단한다.
- reset 대상은 해당 namespace가 소유한 root와 그 root에서 생성한 child로 제한한다.
- namespace 밖 행이 삭제 후보에 포함되면 reset 전체를 중단한다.
- 기준정보는 `ensure` 대상으로만 취급하며 일반 `reset`에서 삭제하거나 기존 값을 덮어쓰지 않는다.
- 공유 개발계는 apply 전에 run registry에 namespace를 조건부 생성하고, 이미 존재하거나 registry가 불가용하면 DB write를 시작하지 않는다.
- 하나의 registry root는 `cms-all` 단독 active 모드와 도메인별 분할 active 모드를 동시에 사용하지 않는다.
    - `cms-all`은 모든 도메인 suite와 scope가 겹치므로 다른 active run이 하나라도 있으면 새 namespace로 claim할 수 없다.
    - 도메인 suite는 동일 suite의 active run과만 충돌하며, 서로 다른 도메인 suite는 각각 최대 1개씩 함께 유지할 수 있다.
    - 동일 namespace의 owner·suite·catalog/schema version·reference time이 같은 반복 apply는 신규 claim이 아니라 기존 run 검증으로 처리한다.
    - 같은 도메인에 추가 상태가 필요하면 병렬 namespace를 만들지 않고 해당 suite의 정상 시나리오와 verifier를 보강한다.
    - 기존 active namespace의 catalog, schema 또는 서울 기준 reference·expiry 날짜를 갱신할 때는 namespace와 active suite를 그대로 지정한 `upgrade`만 허용한다. `cms-all`을 `group-meeting-all`로 부분 갱신하거나 suite를 바꾸지 않는다.
    - `upgrade` dry-run은 source·candidate generation, run ID, catalog/schema/reference/expiry, 복구 journal과 asset 계획을 출력한다. 실제 실행은 namespace와 같은 `--confirm` 및 `--apply`를 모두 요구한다.
    - 기존 namespace 전체를 먼저 reset한 뒤 새 catalog를 apply하는 순차 `reapply`, 단일 scenario만 추가·교체하는 호환 모드, 임시 namespace 복제는 제공하지 않는다.
- scope 충돌 검사는 run registry mutex 안에서 active record 전체를 읽고 claim 직전에 다시 수행한다. `plan` 결과만으로 claim 가능성을 확정하지 않는다.
- inventory와 claim은 새 요청과 기존 record만 비교하지 않고 기존 active record 전체를 pairwise 검증한다. 이미 손상된 active scope 집합이 있으면 겹치지 않는 suite 요청도 허용하지 않는다.
- global fence의 namespace는 active record가 반드시 존재해야 하며, `cleaned` finalization 대기를 제외한 active record는 global fence에 반드시 포함돼야 한다. 어느 방향이든 불일치하면 inventory와 claim을 모두 중단한다.
- feeder와 개발 cron은 하나의 Run Registry contract validator를 사용한다. fence namespace 중복·UTC ISO 8601 표준 형식이 아닌 시각과 active record metadata 중 하나라도 있으면 두 경로 모두 fail-closed하며 consumer별 완화 해석을 허용하지 않는다.
- 만료됐거나 `failed`, `cleanup_failed`, `cleaned` finalization 대기 상태인 active record도 명시적 reset·finalization 전에는 새 overlapping suite를 차단한다.
- active generation의 run ID, generation, asset key, namespace/key, owner, suite, catalog/schema, asset root, reference/expiry/created time은 바꾸지 않는다. 갱신은 다음 generation을 만들고 검증한 뒤 active pointer를 승격하는 방식으로만 수행하며 `updatedAt`은 뒤로 이동할 수 없다. 상태 update는 apply·upgrade·재시도·reset의 허용 전이만 사용하고 `cleaned` record는 DB·asset 작업을 반복하지 않으며 현재 record와 ETag가 일치할 때 finalization만 재시도한다.
- scope 충돌을 우회하는 `--force`, 병렬 허용 옵션, 만료 시 자동 삭제를 제공하지 않는다.
- 공유 registry backend는 read-after-write consistency와 ETag 조건부 갱신을 보장해야 하며, 보장할 수 없는 저장소는 지원하지 않는다.
- generation, run ID, asset key, owner, suite, catalog version, schema fingerprint, 정규화된 asset root, reference time, 유지 종료일, 상태, scenario version, 실제 생성·삭제 건수는 namespace가 정리된 뒤에도 history record로 보존한다.
- owner는 내부 계정 ID만 사용하고 history 보관·삭제는 [데이터 거버넌스 정책](data-governance-policy.md)의 90일 기준을 따른다.
- run registry에는 접속정보, token, 실제 개인정보, 비밀번호, 영수증을 저장하지 않는다.

### 5) 반복 실행과 트랜잭션

- 같은 schema version, namespace, scenario version의 반복 실행은 같은 논리 결과를 만들어야 한다.
- 최초 `apply`는 시나리오별 독립 트랜잭션과 prepared/committed reconciliation을 사용한다. source 세대가 없으므로 부분 실패를 active fence 안에 보존하고 같은 namespace 재실행 또는 reset으로 복구한다.
- 기존 namespace의 `upgrade`는 source 전체 reset, active suite의 current scenario 전체 생성, DB verifier와 candidate Run Registry 준비를 하나의 DB 트랜잭션에서 수행한다. verifier 전에는 commit하지 않고 rollback되면 source DB가 그대로 남아야 한다.
- source DB는 candidate 트랜잭션 commit 전까지 외부 연결에 그대로 보인다. commit 뒤에는 candidate 전체만 보여야 하며 source와 candidate 일부가 섞인 중간 DB 상태를 성공으로 허용하지 않는다.
- cutover journal은 source·candidate record와 정확한 row reference를 함께 보존한다. 각 세대의 합성 `t_member` root ID exact set을 필수 판별 기준으로 사용하고, 재실행은 source 전체 존재·candidate 전체 부재 또는 그 반대만 인정한다. 부분 존재·양쪽 존재·소유권 조회 실패는 journal과 maintenance fence를 유지한 채 fail-closed한다.
- candidate asset은 `runId`를 asset key로 사용하는 불변 generation directory에 stage하고 checksum·형식·DB 경로를 검증한다. DB rollback 또는 source 복구 시 candidate directory만 제거하고, candidate 승격·재검증 뒤 source와 legacy asset directory를 정리한다.
- DB commit 뒤 Run Registry 승격이나 asset 정리가 실패해도 DB를 다시 생성·삭제하지 않는다. journal과 정확한 DB 소유권으로 source abort 또는 candidate promote만 재시도한다.
- 동일 namespace 동시 실행은 금지하고 DB advisory lock 또는 동등한 잠금으로 차단한다.
- 시간 의존 데이터는 한 실행에서 확정한 `reference_time`과 `Asia/Seoul` timezone을 공통 사용한다.
- reset의 DB child·root 삭제와 DB 잔존 검증은 단일 트랜잭션에서 실행하고 하나라도 실패하면 전부 rollback한다.
- DB commit 뒤 수행하는 asset 정리는 idempotent하게 재시도할 수 있어야 하며, 실패하면 run을 `cleanup_failed`로 유지하고 성공으로 보고하지 않는다.

### 6) 외부 부작용 차단

- 데이터 생성과 유지 기간 동안 FCM, SMS, 이메일, Kakao, 결제사, App Store, Play Store, 분석 SDK를 호출하지 않는다.
- 운영·앱 controller를 직접 호출해 데이터를 만들지 않는다.
- 도메인 서비스를 재사용할 때는 외부 연동 adapter를 호출하지 않는 대체 구현으로 교체하고 호출 0건을 검증한다.
- 생성 회원의 push token과 외부 인증값은 비워 두고, 전송 가능한 연락처를 사용하지 않는다.
- 자동 만료·cron 대상이 되는 진행 시나리오는 검증 시간 동안 만료되지 않게 만들고, 만료 결과 시나리오는 이미 terminal 상태로 생성한다.
- 개발 cron은 Run Registry 소유권을 기준으로 `REAL_ONLY` target policy를 사용한다. 정상 개발 데이터는 처리하고 active namespace의 합성 회원과 연결 match·meeting·reservation·profile은 제외한다.
- 합성 데이터가 `planning`, `applying`, `resetting`이거나 fenced `cleaned` finalization 대기 상태이면 cron handler를 실행하지 않고 명시적 maintenance `SKIP`으로 처리한다. `applied`, `failed`, `cleanup_failed`에서는 합성 target만 제외하고 cron을 계속 실행한다.
- cron lease가 하나라도 있으면 새 namespace claim과 generation `applying`·`resetting` 전환을 시작하지 않는다. 반대로 합성 데이터 변경 상태에서는 새 cron lease를 만들지 않는다.
- Run Registry 소유권이 없는 합성 root, 읽을 수 없는 registry, 유효하지 않은 fence·active record·active scope 집합은 cron을 실패시킨다. 소유권을 추측하거나 `ALL_TARGETS`로 fallback하지 않는다.
- 운영 cron은 개발 Run Registry와 `DEV_CRON_*` 설정을 사용하지 않고 기존 `ALL_TARGETS` 동작을 유지한다. 운영 process는 개발 cron·feeder 설정이 감지되면 시작 단계에서 실패한다.
- 공유 개발계 apply 전에 14개 `/admin/cron/*` handler의 target fence, maintenance `SKIP`, lease 상호 배제가 자동 검증되는지 확인한다.
- run registry의 global fence index는 `cleaned` finalization 대기를 제외한 active namespace 소유권을 유지한다. `planning`, `applying`, `resetting`과 아직 fenced 상태인 `cleaned` finalization 대기는 handler 전에 maintenance `SKIP`하고 안정 상태는 소유권으로 합성 target을 제외한다.
- cron route는 같은 registry mutex 안에서 active 상태와 같은 job lease를 확인한 뒤 job별 lease를 생성하고, handler가 반환한 비동기 작업이 끝난 뒤에만 lease를 해제한다. 같은 job의 active lease가 있으면 중복 실행하지 않는다.
- feeder의 apply claim과 upgrade generation 시작, `applying`·`resetting` 상태 전환은 같은 registry mutex 안에서 active cron lease가 0건임을 확인한다. cron lease가 하나라도 있거나 lease·mutex 상태를 읽지 못하면 DB write를 시작하지 않는다.
- target fence는 router 공통 경계에 한 번 적용하고 14개 handler는 각 도메인 target을 명시적으로 필터링한다. route test는 공통 경계보다 먼저 등록된 handler가 없고 모든 handler에 target 제외 경계가 있음을 검증한다.
- 개발 환경 cron route에서 registry 조회가 실패해도 cron을 실행하지 않으며, production startup은 개발 데이터 registry나 cron fence 활성화 설정이 있으면 실패해야 한다.
- cron 자체 동작을 검증하는 시나리오는 개인 로컬·일회성 CI DB에서만 실행하며 공유 개발계 `cms-all`과 동시에 실행하지 않는다.
- 허용된 외부 write는 환경 검증 뒤 사용하는 개발 전용 media와 private run registry뿐이며, 둘 다 운영 bucket·prefix와 분리한다.

### 7) 도메인 정합성

- 정상 시나리오는 도메인 정책의 상태, 원장, 관계, 시간 불변식을 모두 만족해야 한다.
- 파생 집계 화면은 집계 row를 직접 조작하지 않고 회원가입, 로그인, 결제, 매칭 같은 원천 사건으로 채운다.
- 회원 심사 결과는 `v_member_review_status`, 매칭 상태는 `t_match.match_status`, 키 잔액은 `t_member.key`와 `t_member_key_log`처럼 각 도메인의 SoT로 검증한다.
- 회원 소개글 심사는 요청 출처와 생애주기를 함께 검증한다. 승급 심사는 `PENDING + SIGNUP_REVIEW`, 설정 수정 심사는 `NORMAL + SETTING_PROFILE_EDIT` 조합을 사용한다.
- `NORMAL + SIGNUP_REVIEW` 소개글 요청 같은 호환 상태는 정상 시나리오로 생성하지 않는다. 해당 호환 분기는 공유 개발 데이터와 분리된 local·CI 호환 회귀 테스트로 검증한다.
- 기존 2:2 그룹미팅은 주최자도 승인된 `t_meeting_member`로 존재해야 하며, `t_meeting.male_cnt`·`female_cnt`는 승인된 멤버의 실제 성별 건수와 일치해야 한다.
- 기존 2:2 그룹미팅 채팅 작성자는 같은 미팅의 멤버십을 가져야 하며, 원본 `t_meeting_chat` 건수와 Admin 목록의 멤버십 join 노출 건수가 일치해야 한다.
- N:N 그룹미팅은 행사 상태 전체, 취소 진입 상태, 신청 상태, 시스템 메시지, 신고, 후기, 프로필 공개와 상세 이미지 처리 상태를 각각 exhaustive obligation으로 검증한다. 행사와 신청의 `version`은 기록된 상태 전이 횟수보다 정확히 1 커야 한다.
- N:N 그룹미팅의 참여 가능한 모든 행사에는 기존 QA 기준 회원 `tt@test.com`(닉네임 `Toto`)과 `dummy-female@coupler.dev`의 승인 신청이 각각 존재해야 하며, 확정·종료·확정 후 취소 행사에는 두 신청의 채팅 멤버십이 각각 정확히 1개 있어야 한다. 그 밖의 행사에는 채팅 멤버십을 만들지 않고, 초안·삭제처럼 신청을 허용하지 않는 상태에는 두 기준 회원의 참여 행도 만들지 않는다. 기준 회원의 프로필·상태·패널티 필드는 feeder가 수정하지 않는다.
- N:N 그룹미팅의 세 채팅 행사에는 두 기준 회원이 각각 작성한 일반 메시지를 두고, 활성·종료 읽기 전용·확정 후 취소 읽기 전용 방을 모두 검증한다. 활성 확정 행사의 `event_at`은 기준 시각에서 전날 오후 1시 개방 경계 이후이면서 `event_at + 24시간` 종료 전인 구간에 두고 verifier가 운영과 같은 파생식을 기준 시각에 대입해 실제 개방 여부를 확인한다. 확정 행사에는 호스트 메시지와 관리자 삭제 메시지도 두며 Admin read model이 발신자 역할, 삭제 tombstone, 시스템 메시지를 모두 반환해야 한다.
- N:N 신고는 두 기준 회원을 신고자로 사용하고 신고 대상은 namespace 소유 합성 참가자로 제한한다. 대기·처리·기각 상태와 미처리 행사 filter를 모두 만들고, 신고 대상 합성 참가자에게만 1일·7일·30일 미팅 패널티 이력을 생성한다. 패널티 row와 `meet_block_date`는 namespace reset 대상이며 기존 QA 기준 회원에게 패널티를 적용하지 않는다.
- N:N 그룹미팅 채팅의 공개 프로필은 확정·종료 행사에서 호스트와 승인 참여자에게 무료로 제공하며 본인 조회도 허용한다. 결제·Key 시스템은 현행이지만 이번 N:N 프로필 조회에는 연결하지 않는다. `group-meeting-all`과 `cms-all`은 N:N 프로필 열람 행 또는 Key 차감 원장을 만들지 않고 verifier가 두 저장 건수 0을 검증한다. 별도 과금 요구가 승인되기 전에는 N:N 그룹미팅 과금 fixture를 추가하지 않는다.
- 신고 처리, 환불, 패널티는 접수 전·접수 대기·처리 완료·만료 상태를 분리한다.
- negative 시나리오는 개인 로컬·일회성 CI DB에서만 허용하고, 공유 개발계 적용과 `cms-all` suite 포함을 금지한다.
- 상태 상수는 서버 export에서 type을 도출하고 `satisfies Record<상태 type, scenario ID[]>` 또는 동등한 exhaustive map으로 모든 값을 branch obligation에 연결한다.
- 허용 전이와 금지 전이, 권한, 주요 filter, null·empty·삭제, 시간 직전·정각·직후, 외부 부작용 여부를 독립 coverage 축으로 관리한다.
- 가능한 모든 축의 Cartesian product를 생성하지 않는다. 각 단일 축 값은 100% 포함하고, 서로 영향을 주는 두 축은 pairwise로 포함하며, 도메인 정책이 3개 이상 축의 결합 규칙을 정의하면 해당 조합을 명시 scenario로 추가한다.
- 상태·권한·filter가 추가되면 missing obligation으로, 삭제되면 stale scenario로 typecheck 또는 coverage test가 실패해야 한다.
- Environment Guard, Namespace Validator, Run Registry, lock, cron lease, transaction, cron fence, coverage, reset 같은 안전 모듈은 허용·거부·dependency failure 분기를 모두 unit test하고 해당 모듈의 branch coverage 100%를 요구한다.
- DB 연결 실패, registry 불가용·ETag 충돌, lock 충돌, scenario rollback, commit 결과 불명, promotion 실패, source/candidate 혼합 소유권, asset stage·cleanup 실패는 local·CI fault-injection test로 검증한다.

### 8) 관리자 시스템 전체 coverage

- `coupler-admin-web/src/config/page-route.tsx`에서 component가 연결된 route 전체를 관리자 화면 모집단으로 사용한다.
- 각 route는 변경되지 않는 `routeId`와 `data-surface`, `non-data` 중 하나의 화면 종류를 가져야 한다.
- `data-surface` route는 coverage manifest에서 `scenario-backed`, `reference-backed`, `live-only` 중 하나로 정확히 분류한다.
- `non-data` route는 데이터가 필요하지 않은 이유와 인증·권한 검증 방법을 기록한다.
- `live-only`는 외부 연동이나 운영 전용 기능이라 합성 데이터로 재현할 수 없는 경우만 허용하며 이유와 대체 검증을 필수로 기록한다.
- 목록·통계·상세처럼 데이터를 표시하는 노출 탭에는 `live-only`를 사용할 수 없고 `scenario-backed` 또는 `reference-backed` 데이터가 실제로 보여야 한다.
- route 객체의 literal `routeId` union과 화면 audit를 `satisfies Record<AdminRouteId, ScreenAudit>`, 데이터 coverage를 `satisfies Record<DataRouteId, CoverageEntry>` 또는 동등한 두 exact map으로 연결한다.
- route 추가·삭제·화면 종류 변경은 TypeScript typecheck에서 missing·stale entry로 실패하고, path·filter·권한 변경은 coverage test에서 실패해야 한다.
- 미분류 route, 존재하지 않는 scenario ID, 검증 방법이 없는 entry, 이유 없는 `live-only`·`non-data`가 하나라도 있으면 coverage 실패다.
- 필터가 다른 동일 route는 사용자에게 별도 탭으로 노출되면 각각 coverage entry를 둔다.
- 목록 탭은 최소 1개 row 노출만으로 끝내지 않고, 화면이 구분하는 actionable·terminal·empty boundary 상태를 포함한다.
- 상태 상수나 관리자 route가 추가되면 catalog와 coverage 검증이 함께 실패하도록 정적 테스트를 둔다.
- DB 불변식과 Admin API 결과가 통과한 뒤 실제 브라우저에서 route·audience·주요 filter별 화면을 열어 table row, card 값, 상세 연결, console error·오류 overlay 부재를 확인한다.
- browser smoke는 기존 QA super admin·일반 매니저 session을 비밀 저장소에서 주입하고, 로그인 가능한 합성 관리자 생성이나 인증정보 파일 commit을 금지한다.
- 브라우저 smoke가 실패하거나 실행되지 않으면 “화면에서 보임” coverage는 성공으로 판정하지 않는다.

### 9) 필수 suite

| suite | 필수 범위 |
| --- | --- |
| `member-all` | 심사 단계, 등급, 정상·홀딩·차단·탈퇴·거절, 초대, 추천인, 컨시어지 |
| `matching-all` | 모든 매칭 진행·취소 상태, 큐레이터, 예약, 일정, 채팅, 후기, 연락처, 직진만남, 신고, 환불 |
| `meeting-all` | 모집, 참여, 확정, 채팅, 완료, 후기, 신고, 패널티 |
| `group-meeting-all` | N:N 행사 전체 상태, 취소 진입 상태, Toto·dummy-female 신청, 활성·종료·취소 채팅, 후기, 신고·미처리 filter, 합성 대상 패널티, 프로필 공개, 상세 이미지 처리 |
| `lounge-all` | 카테고리, 정상·베스트·삭제 글, 댓글·대댓글·삭제 tombstone, 좋아요, 신고, 회원 차단, 패널티 |
| `revenue-all` | 결제 상태, 유료·무료 키 원장, 환불, 일·주·월 매출, 랭킹 |
| `statistics-all` | 시간대·일·주·월별 가입, 로그인, 성별, 인증, 매칭 지표 |
| `settings-all` | 버전, 약관, 별칭, 공지, 가입 메시지 등 화면 조회에 필요한 기준정보 검증 |
| `manager-all` | 권한별 매니저 목록, 담당 회원 연결, 로그인 불가능한 합성 표시 행 |
| `cms-all` | 위 suite 전체, 관리자 component route exact coverage, 데이터 화면 브라우저 smoke 검증 |

### 10) 결제와 관리자 권한 데이터

- 합성 결제는 실제 provider API를 호출하지 않고 실제 주문번호·영수증 형식을 재사용하지 않는다.
- 합성 결제의 잔액과 원장은 [결제 운영 정책](payment-ops-policy.md)의 트랜잭션 불변식을 만족해야 한다.
- 합성 결제는 개발계 매출과 운영 매출을 혼동하지 않게 namespace와 합성 order ID로 식별한다.
- feeder는 로그인 가능한 관리자 계정, 권한 상승, 공유 비밀번호를 만들지 않는다.
- 관리자·매니저 목록용 행이 필요하면 충분히 긴 무작위 비밀값을 생성해 hash만 저장한 뒤 원문을 즉시 폐기하고, 기존 QA 관리자의 권한을 수정하지 않는다.

### 11) 미디어

- 프로필, 라운지, 그룹미팅 미디어는 repository에 포함된 소형 합성 asset만 사용한다.
- 실제 회원 사진, 운영 업로드 경로, 외부 임시 URL을 재사용하지 않는다.
- 합성 회원 프로필은 최소 3개의 서로 다른 이미지 경로를 사용하고, 화면에서 합성 데이터와 actor를 구분할 수 있는 테스트 표식을 포함한다. 모든 회원이 하나의 공용 placeholder를 공유하면 안 된다.
- 프로필 영상은 선택적으로 생성하되 영상 보유 회원마다 고유한 namespace 경로를 사용하고, repository의 성별·인물별 소형 합성 영상 중 하나와 결정적으로 연결한다.
- 기준 asset과 동기화된 영상은 checksum으로 검증하고 `uploads/dev-data/{namespace}/generations/{runId}/profiles/`, `uploads/dev-data/{namespace}/generations/{runId}/videos/` 아래에만 배치한다.
- 공유 개발계 write는 API 서버가 실제로 제공하는 미디어 저장소의 절대 경로를 `DEV_DATA_ASSET_ROOT`로 명시해야 한다. 정규화한 asset root와 run-scoped asset key를 generation identity로 보존하고 현재 설정과 다르면 DB와 asset을 모두 변경하지 않고 중단한다.
- verifier는 회원별 대표 프로필 경로의 고유성, 프로필 이미지 최소 수·고유 경로 수, 영상 경로 고유성과 양수 건수를 검증한다.
- reset은 해당 namespace asset만 삭제하며 공용 placeholder와 기존 업로드를 삭제하지 않는다.

### 12) DB migration과 데이터 보정 경계

- 테스트 데이터 insert·update·delete 이력을 `schema_migrations`에 기록하지 않는다.
- feeder 구현을 위해 schema, index, constraint, 기준정보 계약을 바꿔야 하면 별도 DB migration 작업으로 분리하고 DB Migration Gate를 적용한다.
- 기존 개발계 행의 결측·오류를 발견해도 feeder가 보정하지 않고 별도 data repair 작업으로 보고한다.
- DB schema version이 scenario catalog의 지원 범위 밖이면 부분 적용하지 않고 즉시 중단한다.

### 13) dry-run, 검증, reset

- 공유 개발계 명령은 기본적으로 dry-run하며 실제 write에는 명시적 `--apply`가 필요하다.
- `active`는 DB에 연결하지 않고 현재 active namespace의 owner, suite, scope, 상태, 기준 시각, 유지 종료일, 만료 여부, 검증 count를 출력한다.
- dry-run은 대상 DB 식별값, namespace, suite, run registry 상태, overlapping active scope, schema fingerprint, 기존 namespace root 건수, 적용할 scenario 목록, cron fence 필요 여부와 외부 write 0건을 출력한다. 실제 생성 건수는 apply의 transaction mutation counter로 집계해 registry에 기록한다.
- upgrade dry-run은 기존 active run을 바꾸지 않고 source·candidate generation, current/target catalog·schema·reference·expiry, cutover journal 단계, asset stage·복구 필요 여부와 확인값을 출력한다.
- apply 직후 DB 불변식, branch obligation, 관리자 API, 브라우저 smoke를 검증하고 데이터·화면 coverage가 모두 100%가 아니면 성공으로 판정하지 않는다.
- reset은 먼저 삭제 계획과 소유권을 검증하고 명시적 확인값을 받은 뒤 실행한다. active generation에 기록된 asset root가 없거나 현재 설정과 정확히 다르면 DB·asset write 전에 중단한다.
- reset은 DB 삭제 트랜잭션 commit 뒤 namespace asset을 정리하고, root·child orphan·media가 모두 0건일 때만 registry를 `cleaned`로 전환한다.
- `upgrade`는 owner·active suite exact match, source status·row ownership, target catalog/schema/reference/expiry와 asset root를 write 전에 preflight한다. DB commit과 registry 승격 사이의 실패는 source/candidate generation row reference로 복구하며 어느 결과도 증명할 수 없으면 `applying` fence와 journal을 유지한다.

## 운영 절차

1. 변경 요청에서 대상 suite, namespace, 환경, reference time, 예상 규모를 고정한다.
2. active inventory, catalog·coverage·DB identity를 검증하고 dry-run의 scope 충돌 결과를 검토한다.
3. namespace 잠금을 획득하고 기준정보 확인 후 최초 apply는 시나리오별로 적용한다. 기존 run의 upgrade는 source 전체 reset·active suite 전체 생성·검증을 한 트랜잭션으로 수행하고 candidate generation을 승격한다.
4. DB 불변식, branch obligation, 관리자 API, 브라우저 화면, 전체 route coverage, 유지 기간 외부 호출 0건을 검증한다.
5. 유지 기한이 끝나면 같은 namespace로 reset하고 orphan·미디어 잔존 0건을 확인한다.

상세 명령 순서와 실패 대응은 [테스트용 개발 데이터 운영 흐름](../flows/cross-project/development-test-data-flow.md)을 따른다.

## 증빙/추적

- 작업 또는 PR에는 다음을 남긴다.
    - 대상 환경의 비밀값을 제외한 DB identity 요약
    - namespace, suite, scenario catalog version, schema version, reference time
    - source/candidate generation과 run ID, asset key, owner, 유지 종료일, registry version·journal·상태
    - dry-run과 apply의 생성·갱신·유지 건수
    - branch·route·API·브라우저 coverage 결과와 미분류·`live-only`·`non-data` 목록
    - maintenance `SKIP`, 14개 target 제외와 유지 기간 외부 호출 0건 검증 결과
    - reset 실행 여부와 orphan·미디어 잔존 건수
- 공유 개발계 데이터는 owner와 유지 종료일을 기록한다.
- 실제 개인정보, 접속정보, 비밀번호, token, 영수증은 증빙에 포함하지 않는다.

## 체크리스트

- [ ] 생성 엔진이 `coupler-api/tools/dev-data`에만 있는가?
- [ ] API `tools`와 Admin `e2e`가 표준 typecheck·lint·format·test에 포함되는가?
- [ ] 운영 DB 우회 옵션 없이 fail-closed로 차단되는가?
- [ ] 운영 원문이나 실제 개인정보를 사용하지 않았는가?
- [ ] namespace 소유권과 반복 실행 결과가 검증되는가?
- [ ] `cms-all`과 도메인별 active scope가 registry mutex 안에서 중복 claim되지 않는가?
- [ ] 만료·실패·finalization 대기 run이 자동 삭제되지 않고 active inventory와 충돌 결과에 남는가?
- [ ] namespace 형식·SQL parameter·asset 경로 containment가 fail-closed로 검증되는가?
- [ ] run registry가 owner·유지 기한·상태를 공유 환경에 영속화하는가?
- [ ] 외부 알림·결제·분석 호출이 0건인가?
- [ ] 공유 개발계 유지 기간에 정상 개발 target은 처리되고 합성 target 변경은 0건인가?
- [ ] 정상 시나리오가 도메인 SoT와 원장 불변식을 만족하는가?
- [ ] 기존 그룹미팅의 주최자 멤버십·성별 인원수·Admin 채팅 join이 원본 데이터와 일치하는가?
- [ ] N:N 그룹미팅의 상태·취소 진입, Toto·dummy-female 신청·채팅 멤버십·메시지, 신고·미처리 filter·합성 대상 패널티, 후기·프로필 공개·상세 이미지 obligation이 일치하고, Admin 행사·채팅·신고·패널티 목록에 노출되며 현재 무료 프로필 조회의 저장 행·Key 차감 원장이 0건인가?
- [ ] 합성 프로필이 회원별로 구분되고 이미지 최소 수·영상 경로·checksum 검증을 통과하는가?
- [ ] 상태·전이·권한·filter·시간 경계 branch obligation이 100% 충족되는가?
- [ ] 안전 모듈 branch 100%와 dependency fault-injection test가 통과하는가?
- [ ] 관리자 component route가 100% 분류되고 데이터 화면이 브라우저에서 검증되는가?
- [ ] 결제·매출·통계가 원천 사건에서 집계되는가?
- [ ] reset DB 삭제가 단일 트랜잭션이며 asset 실패를 idempotent하게 재시도하는가?
- [ ] reset이 namespace 밖 데이터와 공용 기준정보를 건드리지 않는가?
- [ ] 같은 namespace·같은 suite의 전체 catalog generation 교체가 한 DB 트랜잭션으로 실행되고 source/candidate row ownership 복구를 검증하는가?
- [ ] 순차 `reset -> apply`, 단일 scenario 추가·교체, 임시 namespace 호환 경로가 없고 모든 갱신이 generation cutover 하나로 수렴하는가?
- [ ] candidate asset이 run-scoped directory에 stage되고 승격 후 inactive generation·과거 namespace-level directory만 정리되는가?
- [ ] schema 변경과 기존 데이터 보정이 별도 작업으로 분리됐는가?
- [ ] apply 후 coverage와 reset 후 orphan 검증 근거가 남았는가?

## 관련 문서

- [테스트용 개발 데이터 시스템](../architecture/development-test-data-system.md)
- [테스트용 개발 데이터 운영 흐름](../flows/cross-project/development-test-data-flow.md)
- [데이터 거버넌스 정책](data-governance-policy.md)
- [보안/접근통제 정책](security-access-control-policy.md)
- [테스트/CI 전략](testing-strategy.md)
- [Cron 작업](../architecture/cron-jobs.md)
- [DB Migration Gate 정책](db-migration-gate-policy.md)
