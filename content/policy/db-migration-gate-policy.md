# DB Migration Gate 정책

## 문서 역할

- 역할: `규범`
- 문서 종류: `policy`
- 충돌 시 우선 문서: DB migration 단계·artifact·ledger·schema contract 판정은 이 문서, 전체 릴리즈 순서는 [릴리즈 자동화 파이프라인](../flows/cross-project/release-automation-pipeline.md)
- 기준 성격: `as-is`

## 목적

- DB 변경을 `Gate ID`로 판정하고 실패·중단 상태를 ledger로 덮지 않는다.
- migration artifact, 환경별 적용 상태, baseline 편입 상태를 분리해 migration 누적 후에도 catalog와 DB
  ledger가 같은 이력을 가리키게 한다.
- private 저장소의 schema-only baseline, append-only migration catalog, 생성된 schema lock을 물리 스키마
  계약으로 고정한다.
- 완성된 최종 후보의 Local 통합 검증은 한 번만 실행하고, 개발계·운영계의 서로 다른 DB 상태 전이는 순서대로
  증명한다.
- docs 정적 검증은 실제 DB 상태를 안다고 주장하지 않는다. 승인된 실행이 만든 offline 검증 가능 서명
  bundle과 환경별 전이 계보만 검증한다.

## 적용 범위

- DDL, backfill, read/write 기준 전환, 레거시 객체 제거
- migration SQL, catalog/checksum, schema baseline/lock, DB-local ledger
- 개발계·운영계 수동 SQL과 동등한 migration tool 실행

합성 테스트 데이터의 생성·reset과 애플리케이션 코드만의 배포는 제외한다. 해당 작업에서 DB 구조나 운영
데이터를 바꾸면 이 정책을 다시 적용한다.

## 단일 SoT와 책임

| 판정 책임 | 단일 SoT | 이 문서의 역할 |
| --- | --- | --- |
| DB 설계 원칙 | [엔지니어링 가드레일](engineering-guardrails.md) | `DBM-GATE-000`에서 설계 리뷰 결과를 입력으로 사용 |
| migration 단계·artifact·ledger·schema contract | 이 문서 | 최종 규칙 |
| 물리 schema와 migration catalog | private 서비스 저장소의 생성 가능 contract | 이 정책을 구현하는 비공개 SoT |
| 환경별 실제 적용 상태 | 각 DB의 migration ledger와 대상 객체 | 승인된 실행 절차가 읽는 운영 SoT |
| 릴리즈 판단용 환경별 상태 | 서명 bundle chain의 `effectiveTrustedFrontier` | 실제 DB를 대신하지 않고 승인된 증거 계보만 표현 |
| 공개 논리 모델 taxonomy·매핑 | [논리 데이터 모델 정책](logical-data-model-policy.md) | 논리 영향 판정만 위임 |
| 공개/비공개 DB 문서 경계·데이터 분류 | [문서 거버넌스 정책](document-governance-policy.md), [데이터 거버넌스 정책](data-governance-policy.md) | 공개 범위와 동기화 기준만 위임 |
| Local 최종 후보의 통합 검증 | [테스트/CI 전략](testing-strategy.md) | 후보별 1회 원칙에 DB 전용 산출물을 합성 |
| 전체 릴리즈·activation 순서 | [릴리즈 자동화 파이프라인](../flows/cross-project/release-automation-pipeline.md) | DB 단계의 진입·종료 조건만 제공 |
| 운영 명령 | [운영 배포 명령어 런북](../flows/cross-project/production-deploy-command-runbook.md) | 명령을 중복 소유하지 않음 |

- 저장소 catalog는 가능한 migration 집합, DB ledger는 해당 환경에서 완료된 집합이다. 둘은 서로 대체하지
  않는다.
- `rawHistoricalFrontier`는 관측·복구된 이력을 보존하고 `effectiveTrustedFrontier`만 신규 적용 대상을
  계산하는 데 사용한다. 두 값을 같다고 추정하거나 docs 검증 결과를 DB read 결과로 표현하지 않는다.
- 공개 docs에 서비스 업무 스키마의 전체 DDL·컬럼 catalog를 복제하지 않는다.

## 분류 축

`Gate 종류`, `migration 단계`, `artifact 상태`, `환경별 적용 상태`는 독립된 축이다. `Precheck`와 `Ledger`를
`Expand/Backfill/Cutover/Contract` 단계에 섞거나 Local/Dev/Prod를 단계명으로 사용하지 않는다.

### Gate ID

- 형식은 `DBM-GATE-###`이며 한 ID는 하나의 판정 책임만 가진다.
- SQL header, PR, release evidence와 로그에서 같은 ID를 사용한다.
- 각 migration SQL header에 적용 `Gate IDs:`를 명시하고 postcheck는 Gate별 counter와 최종 guard를 출력한다.
- guard 실패는 SQL 실행을 fail-fast로 종료해야 하며 경고나 성공 exit code로 낮추지 않는다.

| Gate ID | 종류 | 적용 조건 | 통과 기준 | 최소 증빙 |
| --- | --- | --- | --- | --- |
| `DBM-GATE-000` | 공통 | 모든 DB 변경 | 설계 리뷰와 선행 객체·버전 조건 충족 | 설계 판정, precheck 결과, baseline ref |
| `DBM-GATE-010` | 공통 | 공유 DB write | 적용 전 중복·checksum 일치, 적용 후 완료 row와 DB identity 일치 | ledger 조회/기록, DB identity |
| `DBM-GATE-100` | 단계 | Expand | 신규 객체와 schema lock 일치 | DDL 결과, schema diff |
| `DBM-GATE-200` | 단계 | Backfill | 대상 건수와 무결성 일치 | source/target count, guard 결과 |
| `DBM-GATE-300` | 단계 | Cutover | 명시한 범위의 구·신 결과 diff 0건 | 시나리오·기간 또는 표본, diff 로그 |
| `DBM-GATE-400` | 단계 | Contract | 의존성과 관측 범위의 read/write 0건, 제거 후 postcheck 통과 | 의존성·관측 로그, postcheck |

- 하나라도 실패하거나 적용 대상 Gate의 증빙이 없으면 즉시 중단한다.
- 비적용 Gate는 해당 `(환경, operation, batch, Gate)` 좌표가 하나도 없을 때 적용 Gate의 여집합으로만
  도출한다. 작성자가 N/A 사유·더미 SQL·의미 없는 0건 결과를 넣어 통과시킬 수 없다.

### Migration 단계

| 단계 | 진입 조건 | Exit Gate | 실패·rollback 기준 |
| --- | --- | --- | --- |
| `Expand` | 기존 runtime이 허용하는 additive 구조 | `DBM-GATE-000/100`, schema lock 일치 | 기존 runtime snapshot 유지; 제거는 별도 Contract |
| `Backfill` | Expand 완료, 결정적인 source→target 규칙 | `DBM-GATE-200`, 누락·중복·불일치 0건 | backup 또는 보상 SQL로 이전 데이터 상태 복구 |
| `Cutover` | 구·신 계산을 같은 범위에서 비교 가능 | `DBM-GATE-300`, activation barrier와 smoke 완료 | 직전 검증 snapshot의 read/write 기준으로 복귀 |
| `Contract` | 활성 runtime 의존성 0건, 복구 기준 확보 | `DBM-GATE-400`, 제거 후 postcheck | 복구 가능한 schema/data와 runtime snapshot을 함께 복원 |

전체 구성요소의 실제 순서는 릴리즈 자동화 파이프라인의 `Deploy Evidence Gate`를 따른다. DB-only 선반영은
기존 runtime과 호환되는 Expand/Backfill에만 허용하고, Contract는 activation과 의존성 0건 확인 뒤 실행한다.

PR admission은 migration 파일 전체에 한 분류를 추정하지 않고 실행 SQL 문장별로 영속 DDL의 필요 단계를
결정한다. 한 파일의 모든 영속 DDL이 catalog에 선언한 정확히 한 단계와 일치해야 하며, 서로 다른 단계가
필요한 문장을 한 migration에 섞으면 거부한다. 신규 table·view·index와 top-level clause가 모두 `ADD`인
`ALTER TABLE`은 Expand/`DBM-GATE-100`, 제거·rename·truncate 등 파괴 DDL은
Contract/`DBM-GATE-400`으로 고정한다.

모든 migration artifact에는 실행 SQL 문장이 하나 이상 있어야 한다. `precheck`와 `postcheck`만 모든 문장이
read-only일 수 있고, schema·data·cutover·contract artifact에는 실제 schema-write 또는 data-write 문장이
하나 이상 있어야 한다. header·주석만 있거나 조회만 하는 단계 migration은 catalog·ledger·frontier를
전진시키지 못한다.

각 `CREATE VIEW` 문장은 다른 View 문장과 독립적으로 `VIEW` keyword 이전의 생성 option에서
`SQL SECURITY INVOKER`를 명시하고 `DEFINER=`를 두지 않아야 한다. View 본문의 동일한 column·alias 이름은
생성 option으로 판정하지 않는다. `CREATE OR REPLACE VIEW`는 신규 객체 추가로 간주하지 않으며, migration
경로·checksum에 exact binding된 base-owned 구조화 리뷰가 `cutover`로 분류한 경우에만
Cutover/`DBM-GATE-300`에서 허용한다. 따라서 같은 파일에 신규 additive DDL을 함께 넣을 수 없다. 자유 문장
해석이나 운영 데이터 추론은 이 admission의 책임이 아니며 별도 설계·운영 리뷰에서 판정한다.

## Migration artifact 생명주기

| 상태 | 진입 조건 | 허용 동작 | Exit Gate |
| --- | --- | --- | --- |
| `Draft` | main에 없고 공유 DB side effect·완료 row가 없음 | 같은 번호 파일 수정·제거, 표적 확인 | Local 통합 Gate 통과, 개발계 적용 준비 완료 |
| `Sealed` | main 포함, 공유 DB side effect, 또는 완료 row 중 하나가 발생 | 수정·삭제 금지, 문제는 새 번호 recovery로 처리 | 개발계와 운영계의 선언된 완료 조건·ledger 완료 |
| `Baseline included` | catalog와 운영 ledger의 exact-set·checksum 일치 | 파일·checksum·kind 보존, baseline 뒤 replay만 제외 | 별도 baseline 교체 검증 통과 |

- main에는 개발계에서 완료되고 동일 checksum으로 봉인된 migration만 병합한다. main에 먼저 들어온 미적용
  migration은 예외 상태가 아니라 release 차단 상태다.
- `replayInSchemaCheck=false`는 Local schema replay 제외만 뜻한다. 공유 DB 적용이나 ledger 기록 제외를 뜻하지
  않는다.
- `includedInBaseline=true`가 되어도 migration artifact와 운영 ledger row를 삭제하지 않는다.

### 환경별 적용 상태

각 SQL은 개발계와 운영계에서 독립적으로 아래 상태 중 하나다.

| 상태 | 판정 |
| --- | --- |
| `미적용` | 대상 side effect와 완료 row가 모두 없음 |
| `부분 적용` | side effect가 있지만 선언된 완료 조건 또는 완료 row가 없음 |
| `완료 후 ledger 누락` | 완료 조건과 성공 근거가 있지만 완료 row가 없음 |
| `완료` | 완료 조건, checksum, DB identity와 완료 row가 모두 일치 |

실패 시도는 실행 로그에 남기고 완료 ledger에 기록하지 않는다. 상태를 확인하기 전 같은 SQL 세트를 즉시
재실행하지 않는다.

## 실행 검증 파이프라인

### 1. PR admission과 개발계

1. 변경을 단계와 `DBM-GATE-*`로 분류하고 migration, catalog, 필요한 migration별 fixture와 연결 문서를
   작성한다. schema 변경이면 생성된 lock을 포함하고, 별도 baseline 교체 작업일 때만 새 baseline을 포함한다.
2. 마지막 파일 변경 뒤 테스트/CI 전략의 `로컬 최종 후보 검증`을 적용한다. 전체 후보의 독립 리뷰에서 열린
   Finding 0건이 된 뒤 고정된 최종 후보의 표준 통합 품질 Gate를 한 번 실행한다.
3. 개발계 write 직전에 개발계 DB identity, ledger, 대상 객체·counter를 확인하고 Local에서 통과한 동일
   checksum의 SQL을 적용한다. 선언된 완료 조건과 postcheck가 통과한 뒤 파일별 완료 row를 기록한다.
4. 최종 후보의 이번 배치 파일·checksum exact-set이 개발계 ledger와 일치해야 main 병합이 가능하다.

### 2. 운영 반영

1. 배포 ref의 catalog와 개발계 ledger checksum을 다시 대조한다.
2. 각 운영 write batch 직전에 DB identity, ledger, 대상 객체·counter를 fresh read-only preflight로 확인한다.
3. 릴리즈 자동화 파이프라인의 단계 순서에 따라 동일 SQL을 운영계에 적용한다.
4. 각 파일의 선언된 완료 조건과 적용 Gate가 통과한 뒤에만 운영 완료 row를 기록한다.
5. Gate별 SQL 경로, checksum, 로그 artifact, ledger/DB identity digest와 rollback 기준을 서명 bundle로
   고정하고 릴리즈 기록에는 bundle 경로와 checksum을 남긴다.

운영 read-only preflight는 각 write batch 직전 한 번만 Gate 증빙으로 채택한다. 작성 중 확인한 운영 상태는
설계 입력일 뿐 이 preflight를 대신하지 않는다. activation 경계로 write batch가 나뉘면 직전 DB 상태가
달라지므로 각각 fresh preflight를 수행한다. Local 최종 후보 검증과 개발계·운영계 적용은 각각 정적
계약·재생 결과와 서로 다른 DB 상태 전이를 증명하므로 중복이 아니다.

### 3. 릴리즈 증거 v2와 환경별 frontier

- 신규·활성 릴리즈 기록은 `release-metadata/v2`를 사용한다. 종료된 v1 기록은 역사적 증거로 보존하고 v2
  모양으로 재작성하지 않는다.
- 각 환경의 적용 대상은 `target catalog − effectiveTrustedFrontier`이며 `apply`와
  `frontier_adoption` plan의 `targetRefs`는 이 집합과 정확히 같아야 한다.
- `batches`는 `targetRefs`의 순서 있는 exact partition이다. 누락·중복·추가 ref가 있으면 실패한다.
- terminal batch마다 정확히 하나의 attestation이 필요하다. attestation payload의
  `(environment, operation, batch, required Gate)` 결과가 exact-set이어야 하며 적용 Gate는 모두 `passed`다.
- 각 환경은 sequence와 `previousTransitionDigest`로 연결된 하나의 전이 chain만 가진다. 같은 base frontier에서
  병렬 작성한 두 릴리즈 중 뒤에 검증되는 하나는 chain 불일치로 실패한다.
- `apply`·`frontier_adoption`은 batch ref를 raw/effective frontier에 정확히 추가한다.
  `ledger_recovery`·`recovery_apply`는 이미 trusted인 ref만 대상으로 하고 effective frontier를 늘리지 않는다.
- bundle은 `coupler/db-migration-attestation/v2` domain separation, NFC 문자열, safe integer와 RFC 8785/JCS
  canonical JSON을 사용하고 Ed25519로 서명한다. 원문 checksum과 서명을 모두 검증한다.
- 신뢰 키는 protected base의 proposal PR과 그 proposal을 참조하는 후속 epoch activation PR의 두 단계로만
  활성화한다. epoch는 append-only이고 proposal commit은 activation base의 first-parent 계보에 있어야 한다.
- 한 번 등장한 `keyId`와 Ed25519 public-key fingerprint는 이후 epoch에서 다시 사용할 수 없다. 환경 범위나
  PEM 표현을 바꿔도 같은 signer를 재활성화한 것으로 보고 실패한다.
- trust proposal/epoch의 `publicKeyPem`은 정확히 하나의 canonical Ed25519 SPKI `PUBLIC KEY` PEM block이어야
  한다. PKCS#8 private key, public/private 다중 block, trailing data는 저장소 반입 단계에서 거부한다.
- 서명 환경에서 해당 sequence 이전에 시작된 epoch 중 번호가 가장 높은 epoch만 선택한 뒤 그 epoch의
  만료 범위를 검사한다. successor가 시작된 뒤 생긴 공백에는 낮은 epoch로 되돌아가지 않고 실패한다. 따라서
  과거 epoch를 수정하지 않고 새 epoch를 추가해 키를 교체하며, 서명자가 이전 키를 다시 활성화할 수 없다.
- trust epoch가 하나도 활성화되지 않은 상태에서는 terminal DB migration 증거가 안전하게 실패한다. 키를
  임의 생성하거나 private key를 저장소에 넣어 우회하지 않는다.

bootstrap과 activation은 별도 단계다. 정책·validator·bootstrap·marker를 설치하는 PR에는 새 migration이나
v2 DB 릴리즈 기록을 넣지 않는다. marker가 base branch에 merge된 뒤 trust proposal/activation을 완료하고,
그 다음 릴리즈부터 v2를 사용한다. activation marker는 자기 SHA를 포함하지 않고 versioned contract source,
bootstrap, trust bootstrap의 경로·mode·blob checksum만 고정한다.

### 4. Baseline 교체

- 일반 feature와 분리한 변경으로 수행한다.
- 운영 read-only 절차가 source main commit, TLS CA와 endpoint, DB identity, schema lock과 ledger digest를
  고정한 capture authority를 먼저 별도 PR로 base에 병합한다. baseline 교체 PR은 그 base-owned authority를
  exact하게 재현하며 authority와 baseline 교체를 같은 PR에 넣지 않는다.
- capture authority PR은 지원된 read-only proposal 명령이 생성한 authority 파일 하나만 추가한다. source
  main commit은 PR base에 이미 있고 현재 baseline source의 strict descendant여야 하며 authority는 7일 안에
  만료된다. authority 수정·삭제·복수 추가 및 migration이나 도구 변경과 혼합을 거부한다.
- baseline 교체가 authority를 소비하는 시점에도 만료를 다시 확인하며, 만료 뒤에는 digest가 같아도 새
  authority proposal부터 다시 시작한다.
- 운영 ledger와 catalog의 migration 이름·checksum exact-set, `target_env=prod`, DB identity가 모두 일치해야
  시작할 수 있다.
- 운영 schema-only capture, source main commit, baseline lock과 current lock 동등성을 함께 검증한다.
- 기존 catalog entry는 `includedInBaseline=true`, `replayInSchemaCheck=false`로만 전환하고 파일·checksum·kind는
  유지한다.
- baseline source main commit은 strict descendant로만 전진하며 과거 source/authority 재사용을 거부한다.
- 새 migration 추가와 baseline 교체를 같은 변경에 섞지 않으며, DB ledger row를 삭제하거나 압축하지 않는다.

## 실패와 복구

| 상태 | 조치 |
| --- | --- |
| Draft + 미적용 | 원인을 수정한 같은 Draft 파일로 전체 파이프라인을 다시 시작 |
| Sealed + 미적용 | DB 상태와 실패 원인을 먼저 확인하고, 동일 checksum 재시도 가능성이 입증될 때만 fresh preflight부터 재개 |
| 부분 적용 | 기존 파일을 수정하지 않고 새 번호 recovery를 추가해 원래 완료 조건을 완성 |
| 완료 후 ledger 누락 | 적용 당시 checksum, postcheck, DB identity를 확인한 뒤 완료 row만 복구 |
| checksum 불일치 또는 원래 완료 조건 폐기 필요 | ledger를 만들지 않고 release와 baseline 교체를 차단 |

- recovery 뒤 원래 migration과 recovery의 완료 조건을 모두 검증한다. 두 migration의 완료
  row를 기록하고 원래 row의 `note`에 recovery 파일을 연결한다.
- recovery로 원래 완료 조건을 달성할 수 없으면 `skipped`, 가짜 성공 row, checksum 변경으로 닫지 않는다.
  schema contract 자체의 별도 전환이 승인될 때까지 차단한다.

### 출시 전 개발계 reset 예외

개발계에만 적용한 branch-only migration을 폐기하고 다시 설계해야 할 때 아래 조건을 모두 충족하면 정확한
대상만 reset할 수 있다.

- 사용자 또는 서비스 책임자가 기능과 개발계 reset을 명시적으로 승인한다.
- 대상 migration이 main과 운영 ledger에 없고, 운영 객체·데이터·runtime 사용이 0건이다.
- 개발계 업무 데이터, 외부 FK·Trigger·Event·활성 runtime 의존성이 0건이다.
- 제거할 객체·설정·ledger의 exact-set, checksum과 rollback 기준을 reset 전에 기록한다.
- 객체·설정·ledger exact-set을 같은 reset 범위로 처리하며 ledger row만 지우지 않는다.
- DDL auto-commit을 전제로 각 단계 뒤 객체·데이터·ledger를 다시 조회한다.
- reset된 branch artifact는 최종 main catalog에 남기지 않는다. 새 Draft는 현재 main과 reset 대상보다 큰 번호를
  사용해 봉인된 `migration_name`을 재사용하지 않고 Local 검증과 개발계 적용을 다시 시작한다.

main 또는 운영계에 들어간 migration, 출시 runtime이 사용한 계약에는 이 예외를 적용하지 않는다. 이 제한이
branch 이력과 장기 catalog에 실행되지 않은 migration이 누적되는 것을 막는다.

## Migration ledger 계약

- `schema_migrations` 또는 동등한 tool ledger는 각 DB 안의 append-only 완료 이력이다.
- 한 row는 파일 실행 시도가 아니라 해당 checksum의 선언된 완료 조건 충족을 뜻한다. 실패·중단 시도는
  실행 로그에만 남긴다.
- `migration_name`은 DB 안에서 유일한 SQL 파일명이다. 같은 DB를 쓰는 모든 서비스가 이름을 재사용하지 않는다.
- `migration_type`은 `precheck`, `schema`, `data`, `postcheck` 같은 artifact kind만 나타내며 성공/실패 상태를
  섞지 않는다.
- `target_env`, `database_name`, `server_hostname`, `server_id`, `server_version`으로 실제 대상을 확인한다.
- `applied_by`는 `CURRENT_USER()`의 DB 실행 계정, `applied_at`은 완료 확인 시각이다. 작업자 식별과 recovery
  연결은 `note`에 보조 기록한다.
- 같은 `migration_name`과 checksum의 완료 row가 있으면 재적용하지 않는다. 이름이 같고 checksum이 다르면
  즉시 중단한다.
- ledger가 없거나 DB identity가 대상 환경과 다르면 신규 migration을 시작하지 않는다. ledger 복구는 성공
  근거가 있는 row만 별도 작업으로 수행한다.
- 완료 row는 baseline 편입 뒤에도 보존한다. 삭제는 이 정책의 branch-only 개발계 reset exact-set에만 허용한다.

ledger 물리 DDL은 private schema contract, 운영 preflight·apply·rollback 명령은 운영 배포 명령어 런북에서
관리한다. 별도 도구를 사용하면 위 identity, checksum, 완료 의미와 append-only 성질이 동등해야 한다.

## Catalog와 schema lock

- catalog는 migration 디렉터리의 SQL 파일과 exact-set이며 숫자 prefix 순서를 사용한다.
- v2 entry는 `file`, `kind`, header와 정확히 같은 `gateIds`, 그 Gate에서 도출한 `migrationStages`,
  migration별 `verification`, 구조화된 `alterReview`, `schemaEffect`, `includedInBaseline`,
  `replayInSchemaCheck`, `sha256`를 기록한다.
- target catalog는 stage Gate(`100`~`400`) 유무와 관계없이 모든 migration entry를 포함한다. stage Gate가
  하나도 없거나 둘 이상인 기존 artifact가 포함된 apply batch의 stage는 `legacy`이며, 해당 artifact도
  frontier 차감·exact ordered partition·서명 attestation에서 생략할 수 없다.
- Sealed 파일과 entry의 checksum·kind·schema 영향 판정은 immutable이다. baseline 교체는 편입·replay flag만
  정책에 정한 방식으로 바꿀 수 있다.
- 공유 DB write는 Local replay와 migration별 read-only check가 가능해야 한다. Backfill/Cutover만 결정적 대상
  row를 만드는 setup fixture가 필수이고 Expand/Contract는 검증에 실제로 필요할 때만 setup을 둔다.
  precheck/postcheck처럼 read-only인 artifact에는 replay fixture를 요구하지 않는다.
- 신규·정의 변경 table/column의 의미는 DB native `COMMENT`에 두고 빈 값·문자 깨짐을 실패시킨다. schema
  lock과 baseline은 생성물이며 직접 편집하지 않는다.

## 증빙과 판정

- 적용 Gate: `Gate ID + SQL 경로 + checksum + 로그 경로 + 환경별 ledger row`
- 운영 preflight: `로그 경로 + DB identity + ledger + 대상 객체 정의/counter`
- 비적용 Gate: required Gate 좌표의 여집합으로 자동 도출한 `Gate ID` 목록
- 공개 논리 영향: 관계·소유권·분류·불변 조건·생명주기·외부 계약 변경이면 연결 docs, 물리 구현만 바뀌면
  `논리 문서 영향 없음` 근거
- 저장소 상대 증빙 경로는 저장소 밖을 가리킬 수 없고, 경로의 중간 구성요소와 최종 파일 어디에도 symlink를
  허용하지 않는다. 최종 대상은 선언 경로에 있는 regular file이어야 한다. 로컬에서 생성 후 커밋하는 정상
  증빙까지 base-owned로 요구하지 않으며, base-owned 계약이 필요한 별도 artifact만 해당 Gate에서 Git ref와
  mode를 추가 검증한다.

`No Findings`는 적용 Gate, 환경별 완료 상태, catalog/lock, 공개 문서 영향과 비적용 근거가 모두 닫혔을 때만
선언한다. `DBM-GATE-400`은 명시한 제거 대상만 판정하며 삭제 대상으로 지정하지 않은 객체를 제거하지 않는다.

## 표준 자동 검증

- DB 관련 경로의 표준 runner는 catalog exact-set·checksum·순서, baseline/lock canonical form, 기존 migration
  불변성을 확인하고, 빈 Local DB에 baseline과 `replayInSchemaCheck=true` migration을 replay해 schema lock과
  migration별 assertion을 확인한다.
- 저장소는 모든 운영 DB 엔진·권한·복구를 대신하는 범용 write runner를 제공하지 않는다. 실제 write,
  credential, topology, backup/restore는 승인된 운영 절차의 책임이고 docs validator는 결과의 서명 증거만
  확인한다.
- 통합 runner에 포함된 contract check나 replay를 같은 event·ref·baseline에서 먼저 개별 실행하거나 별도
  workflow로 반복하지 않는다. 테스트/CI 전략이 허용한 표적 검증은 최종 통합 Gate의 대체 증빙이 아니다.
- Local reset/replay 명령은 localhost DB와 명시적 reset flag가 모두 있을 때만 실행한다.

## 체크리스트

- [ ] Gate 종류, migration 단계, artifact 상태, 환경별 적용 상태를 섞지 않았는가?
- [ ] 모든 산출물 작성과 Finding 수정이 끝난 최종 후보에서 Local 통합 Gate를 한 번만 실행했는가?
- [ ] main 후보가 Local 통합 Gate와 개발계 ledger를 동일 checksum으로 통과했는가?
- [ ] 실패/부분 적용을 가짜 완료 row나 기존 파일 수정으로 숨기지 않았는가?
- [ ] 운영 read-only preflight를 각 write batch 직전 한 번 수행했는가?
- [ ] 운영 반영 순서가 릴리즈 자동화 파이프라인의 activation·Contract 경계와 일치하는가?
- [ ] `target catalog − effectiveTrustedFrontier`, batch partition, attestation 좌표가 exact-set인가?
- [ ] 서명 epoch와 환경별 `previousTransitionDigest` chain이 이어지고 raw/effective frontier를 혼동하지 않았는가?
- [ ] baseline 교체가 별도 변경이며 운영 ledger exact-set과 기존 row 보존을 확인했는가?
- [ ] 같은 event·ref·baseline의 contract check를 반복하지 않았는가?

## 관련 문서

- [엔지니어링 가드레일](engineering-guardrails.md)
- [테스트/CI 전략](testing-strategy.md)
- [문서 거버넌스 정책](document-governance-policy.md)
- [논리 데이터 모델 정책](logical-data-model-policy.md)
- [데이터 거버넌스 정책](data-governance-policy.md)
- [배포/릴리즈 프로세스](release-process.md)
- [릴리즈 자동화 파이프라인](../flows/cross-project/release-automation-pipeline.md)
- [운영 배포 명령어 런북](../flows/cross-project/production-deploy-command-runbook.md)
