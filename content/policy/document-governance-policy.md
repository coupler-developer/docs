# 문서 거버넌스 정책

## 문서 역할

- 역할: `규범`
- 문서 종류: `policy`
- 충돌 시 우선 문서: 문서 역할·메타데이터·우선순위·문서 동기화·policy composition·에이전트 실행 문서 경계는 이 문서, 에이전트 실행 순서는 `content/AGENTS.md`, 기술·검증·데이터 세부 판정은 `단일 SoT` 절의 문서
- 기준 성격: `as-is`

## 목적

- docs의 문서 역할, SoT 경계, 문서 동기화, policy composition과 에이전트 실행 문서의 책임 경계를 단일
  정책으로 고정한다.

## 적용 범위

- `docs`
- 워크스페이스에서 관리하는 architecture, fsm, flow, technical-debt, policy 문서
- 워크스페이스 root `AGENTS.md`에서 `content/AGENTS.md`의 bootstrap과 단계·도메인 SoT로 이어지는 새 세션 실행 경로

## 단일 SoT

- 문서 역할/메타데이터/우선순위/문서 동기화와 정책 composition 검토 책임은 이 문서를 단일 기준으로 사용한다.
- 문서 stable ID, current/retired 생명주기, routing 분류와 삭제 책임 승계 규칙은 이 문서를 단일 기준으로
  사용한다. `document-lifecycle-registry.json`은 current descriptor, `document-retirement-ledger.json`은
  삭제된 ID와 경로 예약을 기계 판정한다.
- 새 세션 bootstrap, 요청·권한·범위 판정, 관련 SoT 탐색, 단계별 문서 라우팅과 완료 증빙은
  [`content/AGENTS.md`](../AGENTS.md)의 `작업 계약`을 단일 기준으로 사용한다.
- 상위 공통 기술 원칙과 기술 이행 유형별 완료 기준은 [엔지니어링 가드레일](engineering-guardrails.md)을 단일 기준으로 사용한다. API/DB/테스트 등 세부 판정은 가드레일의 `단일 SoT와 우선순위` 표에 연결된 범위별 문서를 따른다.
- docs 검증 게이트와 표준 검증 명령은 [테스트/CI 전략](testing-strategy.md)을 단일 기준으로 사용한다.
- DB 공개 범위와 데이터 분류는 [데이터 거버넌스 정책](data-governance-policy.md)을 단일 기준으로 사용한다.
- 공개 논리 데이터 모델의 도메인 소유권, ID와 taxonomy는
  [논리 데이터 모델 정책](logical-data-model-policy.md)을 단일 기준으로 사용한다.
- 물리 DB 변경, migration, schema drift 판정은
  [DB Migration Gate 정책](db-migration-gate-policy.md)을 단일 기준으로 사용한다.

## 필수 규칙

- 같은 도메인에 서로 다른 판정 책임을 소유하는 `policy`가 여러 개 존재할 수 있지만, 같은 판정 책임의 규범 문서와 단일 SoT는 1개만 둔다. `architecture`, `fsm`, `flow`, `technical-debt`는 해당 책임의 규범 문서를 링크한다.
- 문서 메타데이터는 아래 폐쇄형 값을 사용한다.
    - `역할`: `규범`, `설명`, `시각화`, `시나리오`, `부채`
    - `문서 종류`: `policy`, `architecture`, `fsm`, `flow`, `technical-debt`
    - `기준 성격`: `as-is`, `to-be`, `transition`
- 문서 종류와 역할은 아래 조합으로 고정한다.
    - `policy` -> `규범`
    - `architecture` -> `설명`
    - `fsm` -> `시각화`
    - `flow` -> `시나리오`
    - `technical-debt` -> `부채`
- 릴리스 실행 기록은 실제로 수행한 배포 흐름과 증빙을 보존하므로 `flow` -> `시나리오`를 사용한다. 실행
  기록만을 위한 별도 문서 종류나 역할을 추가하지 않는다.
- 기본 문서는 `architecture`이며, 규범이 실제로 필요한 도메인에만 `policy`를 추가한다.
- `architecture`, `fsm`, `flow`, `technical-debt`는 규범 문서를 대체하지 않는다.
- `policy`가 없는 도메인은 예외 상태가 아니라, 현재 범위에서 별도 규범 문서가 필요하지 않은 상태로 본다.
- `architecture`는 구성요소, 책임, 관계, 현재/목표 동작과 도메인 불변조건을 설명할 수 있다. 불변조건을
  설명하는 것만으로 별도 `policy`가 필요한 것은 아니다. 다만 승인·변경 절차, 운영 허용/금지 판정,
  배포 Gate처럼 작업자의 행위를 통제하는 규칙은 `policy`가 소유하고 `architecture`는 링크만 둔다.
- `flow`는 규범을 적용하는 순서, 단계별 입력·출력, 실패·rollback 시나리오를 설명한다. 상위 정책의 폐쇄형
  값 목록, metadata field 계약, 상태 파생식, 완료 판정 조건을 다시 열거하지 않고 해당 절을 링크한다.
- 템플릿과 runbook은 작성·실행에 필요한 placeholder와 명령을 포함할 수 있지만, 규범의 우선순위나 폐쇄형
  계약을 새로 정의하지 않는다. 반복이 불가피한 기계 판정 mirror는 원천 schema/descriptor와 drift를 자동
  검증할 수 있어야 한다.
- 같은 도메인 문서가 2개 이상이면 각 문서 상단에 아래를 명시한다.
    - 문서 역할(`규범`, `설명`, `시각화`, `시나리오`, `부채`)
    - 문서 종류(`policy`, `architecture`, `fsm`, `flow`, `technical-debt`)
    - 충돌 시 우선 문서
    - 현재 기준(`as-is`, `to-be`, `transition`)
- `to-be`와 `transition`의 `architecture`, `fsm`, `flow`는 완료 조건을 추적하는 기술부채·flow·릴리스 기록을
  링크한다. `policy`는 같은 링크를 사용하거나 문서 안에 완료 조건과 전환 추적 기준을 함께 둔다.
- 설명 문서는 규범 문서의 MUST/SHOULD/금지 사항을 중복 정의하지 않고 링크로 참조한다.
- 부채 문서는 문제 목록과 우선순위만 기록하며, MUST/SHOULD/금지 사항은 해당 규범 문서로 링크한다.
- 부채 문서에는 현재 미해결 문제만 유지한다. 완료 기준을 충족한 항목은 같은 작업 단위에서 삭제하고, 완료 이력과 검증 근거는 PR 또는 릴리스 기록에 남긴다.
- 완료 항목에 다른 축의 잔여 작업이 있으면 해당 작업을 기존 부채에 옮기거나 별도 부채로 분리한 뒤 완료 항목을 삭제한다. `진행 상태`, `구현 완료 근거`, `상태: 완료` 같은 완료 이력형 절로 항목을 보존하지 않는다.
- 문서 작성/수정/삭제/리뷰 시에는 "이 문장이 없어도 처음 온 사람이 다음 필수 문서 또는 규범 문서까지 확실히 도달하는가"를 먼저 확인한다.
- 문서 작성 시 개인 사용자명, 개인 개발 장비의 홈 디렉터리, 임시 디렉터리 같은 로컬 절대경로를 남기지
  않는다. 증빙 위치가 필요하면 저장소/워크스페이스 상대경로, 산출물 파일명, 익명화된 환경 범위로 기록한다.
- 공유 개발·운영 환경의 실제 배포 경로는 실행 가능한 운영 `flow` 또는 runbook에만 둘 수 있다. 이 경우 환경
  범위를 명시하고, 경로를 명령마다 복제하지 않고 환경별 한 곳에서 정의하며, 실행 전 경로 검증과
  rollback 기준을 함께 둔다.
- `main`에 병합된 릴리스 기록은 병합 시점의 최종본이자 역사적 기록이다. 상태, metadata, 본문, 증빙을
  포함한 파일 전체를 이후 PR에서 수정·삭제·이름 변경·대체하지 않는다. 자동 검증은 base와 현재 최종 트리의
  경로·blob 동일성만 비교하고 과거 파일의 상태, metadata, 증빙이나 실패 내용을 파싱·재검증하지 않는다.
  오탈자·잘못된 증빙·실패·rollback 설명은 당시 기록 그대로 남기고 이 사유만으로 새 릴리스 기록을 만들지
  않는다. 실제 새 배포 또는 DB migration을 수행한 경우에만 그 실행의 새 릴리스 기록을 만든다.
- PR 번호와 소비자 전환 상태처럼 시간이 지나면 바뀌는 진행 현황은 기술부채 또는 릴리스 기록에서만 소유한다.
  `architecture`와 `policy`는 목표 상태와 추적 문서 링크만 남기고 현재 진행 현황을 복제하지 않는다.
- 시점에 따라 바뀌는 API 계약 package의 concrete version은 기술부채 자유 문장에 기록하지 않는다. 현재 source·consumer
  정렬은 package manifest와 lockfile의 생성 가능한 비교 결과로 판정하고, 특정 릴리스의 exact package version은
  기준 repo ref와 함께 릴리스 기록의 구조화된 metadata에서 소유한다. 기술부채에는 숫자 없는 미해결 조건과
  완료 Gate만 유지한다.
- 다중 레포 최종 상태를 한 계약 묶음으로 병합하는 작업에서 `as-is` 문서와 기술부채의 source 상태는 관련 PR이
  모두 병합된 뒤의 상태를 기준으로 작성한다. 리뷰 중인 브랜치의 concrete package version, `main 병합 대기`,
  후속 ref 준비 상태는 PR 본문 또는 pending 릴리스 기록에만 남기고 최종 문서의 현재 상태로 복제하지 않는다.
- 다중 레포 문서 PR은 선행 consumer PR과 merge order를 명시하고, 선행 PR이 source main에 반영되기 전에는
  merge하지 않는다. 최종 리뷰는 개별 브랜치의 현재 상태가 아니라 관련 PR 전체가 병합된 뒤 문서가 사실인지
  판정한다.
- 새 문서, 절, 항목을 만들기 전에는 같은 목적이나 문제를 다루는 기존 문서나 항목을 먼저 확인하고, 가능하면 기존 내용을 보강한다.
- 별도 분리가 필요하면 기존 문서나 항목과의 관계와 분리 사유를 작업 요청자 또는 리뷰어에게 알리고 확인한 뒤 진행한다.
- Wiki, Notion, 공유 문서함 같은 저장소 밖 문서를 현재 규범 또는 DB SoT로 사용하지 않는다. 외부 도구는 초안과
  회의 기록에만 사용할 수 있고, 유효한 결정은 코드 저장소의 규범 문서 또는 생성 가능한 산출물에 반영한다.
- 최초 진입 경로를 이어주는 부트스트랩 안내(`README -> AGENTS -> policy`)는 단순 중복으로 간주해 삭제하지 않는다.
- 문서 간 충돌이 보이면 설명 문서를 보강하지 말고 규범 문서를 먼저 고친다.
- 구현/리뷰/후속 문서 추가 시 어떤 문서가 규범 문서인지 즉시 식별되지 않으면 완료로 간주하지 않는다.

## 에이전트 실행 문서 경계

| 판정 책임 | 단일 SoT | 다른 문서의 역할 |
| --- | --- | --- |
| 새 세션 bootstrap, 요청 유형, 범위·권한, 실행 단계 | [`content/AGENTS.md`](../AGENTS.md) | root `AGENTS.md`와 README는 최초 진입용 최소 mirror |
| 기술·도메인 판정 | 각 범위별 policy/FSM과 생성 계약 | `content/AGENTS.md`는 신호와 필수 열람 경로만 연결 |
| 문서 역할·SoT·동기화·안정성 평가 | 이 문서 | `content/AGENTS.md`는 적용 시점을 연결 |
| 문서 stable ID·생명주기·routing 책임 | 이 문서 | lifecycle registry는 current descriptor, retirement ledger는 삭제된 ID·경로 예약 mirror |
| 검증 명령과 CI | [테스트/CI 전략](testing-strategy.md) | `content/AGENTS.md`는 `VERIFY` 단계에서 실행을 요구 |
| 리뷰 절차와 최종 판정 | [코드 리뷰 정책](code-review-policy.md) | `content/AGENTS.md`는 마지막 변경 이후 `REVIEW`를 요구 |

- workspace root `AGENTS.md`와 README의 bootstrap 예시는 `content/AGENTS.md`에 도달하기 전 필요한
  워크스페이스 위치, 기존 작업 우선, reviewer 권한 Gate만 mirror할 수 있다.
- bootstrap mirror의 모든 안전 규칙은 `content/AGENTS.md`에도 존재해야 하며, mirror만이 소유하는 작업 규칙을
  만들지 않는다.
- 공용 workspace의 실제 root `AGENTS.md`는 README bootstrap 예시와 같은 계약을 유지한다. docs 검증이
  Coupler workspace root를 확인할 수 있으면 실제 파일도 함께 비교하고, 독립 docs checkout처럼 root가 없으면
  README와 `content/AGENTS.md`만 검증한다.
- `content/AGENTS.md`는 세부 기술 MUST를 다시 정의하지 않고 최소 bootstrap, 적용 신호, 판정 순서와 범위별
  단일 SoT를 연결한다.
- 요청 유형, 권한 집합, 작업 범위, 실행 단계는 독립된 분류 축이다. 하나의 값이나 순차 권한 등급으로 합치지
  않는다.
- 적용 상태는 모든 새 세션과 컨텍스트 유실 후 재진입의 `as-is` 실행 경로다. 별도 transition·호환 상태를
  두지 않는다.
- 완료 조건은 새 세션의 `content/AGENTS.md` 직접 열람, 각 분류 축과 종료 조건의 폐쇄형 정의, 기존 작업 연속성,
  관련 SoT 폐쇄 탐색, 단계별 필수 문서 라우팅, 마지막 변경 이후 검증·리뷰, 권한 없는 외부 작업 차단과 적용
  에이전트 작업흐름 검증 통과다.

## 정책 Composition Gate

### 적용 조건

- `policy` 문서를 추가·수정·삭제·이동·개명·분리·통합하거나 정책 리뷰를 수행하면 이 Gate를 적용한다.
- 상위 공통 원칙, 세부 계약, 적용 범위, 우선순위, 상태/단계, 예외, 완료 조건 중 하나를 바꾸면 문장 수와 관계없이 적용한다.
- 의미 변경이 없는 오타·링크 복구만 `N/A`로 둘 수 있으며, diff와 대상 문서 전체에서 규칙 의미가 바뀌지 않았다는 근거를 남긴다.

### 전체 생명주기 검토 범위

변경 또는 삭제 전에 아래 범위를 먼저 고정하고 대상 정책 전체를 읽는다. 삭제는 비교 기준 ref의 삭제 전 본문을 대상 정책으로 사용한다. PR diff만 읽고 새 규칙을 기존 절에 추가하지 않는다.

1. 대상 정책의 목적, 적용 범위, 상위/세부 SoT와 충돌 우선순위
2. 대상 정책이 링크하는 하위 문서와 대상 정책을 상위 원칙·단일 SoT·충돌 우선 문서로 인용하는 역방향 규범 참조
3. 정상/최종 상태, transition, 호환, Shadow, cutover, rollback 등 대상 정책이 구분하는 상태·단계와 각 Exit Gate
4. 대상 정책의 상위 원칙, 필수 규칙, 예외, 검증 기준, 완료 정의, 체크리스트
5. 변경으로 영향을 받는 코드 계약, 템플릿, AGENTS, 검증 스크립트와 기술부채

### 필수 판정

- 새 규칙은 적용 상태·단계와 비적용 범위를 명시한다. 상태를 고르지 않은 전역 MUST/금지 규칙을 기존 정책 끝에 누적하지 않는다.
- 정상/최종 상태의 규칙과 transition/호환 상태의 예외를 분리하고, 각 상태에서 완료 정의를 실제로 만족할 수 있어야 한다.
- Shadow는 같은 의미의 구·신 결과를 비교할 수 있을 때만 적용하며, 호환·version 분기·DB stage의 대체 용어로 사용하지 않는다.
- 상위 공통 정책과 세부 정책의 판정 책임을 표 또는 동등한 폐쇄형 구조로 분리한다. 모든 문서가 자신을 우선한다고 쓰는 순환 우선순위를 허용하지 않는다.
- 세부 SoT를 신설·분리하면 같은 변경에서 상위 문서의 상세 MUST를 제거하거나 상위 원칙·링크 역할로 낮추고, 상단 충돌 우선순위와 관련 문서를 함께 갱신한다.
- 정책 삭제는 해당 판정 책임을 후속 단일 SoT로 이관하거나 책임 종료와 비적용 범위를 명시한다. 역방향 규범 참조, 관련 문서, `content/AGENTS.md`, `mkdocs.yml`, 템플릿, 검증 스크립트와 기술부채를 같은 변경에서 이관·제거하며 파일 삭제만으로 완료하지 않는다.
- 기존 규칙을 보강할 때는 대상 정책 전체의 목적·필수 규칙·예외·검증·완료 정의·체크리스트를 함께 대조해 수정·대체·삭제한다. 새 절 추가만으로 완료하지 않는다.
- Optional/nullable, 상태/단계, source/code/surface처럼 서로 독립적인 축을 하나의 값이나 이름으로 합치지 않는다.
- 자동 검증 통과는 문법·구조 증빙일 뿐 의미상 composition 통과를 대신하지 않는다.

### 필수 증빙

PR/작업 보고 또는 안정성 리뷰 기록에 아래를 남긴다.

- 전체 검토 범위: 대상 정책, 정방향 링크, 역방향 규범 참조, 같은 도메인 정책, 제외 범위
- 책임과 우선순위: 변경 전/후 판정 책임별 단일 SoT와 충돌 해결 순서
- 생명주기: 적용 상태·단계별 진입 조건, 허용 구조, Exit Gate와 `N/A` 근거
- 전역 절 정합성: 목적/필수 규칙/예외/검증/완료 정의/체크리스트의 수정 또는 영향 없음 근거
- 삭제와 책임 승계: 비삭제 변경은 `N/A`; 삭제는 삭제 사유, 후속 단일 SoT/책임 종료 근거, 정방향·역방향 참조와 인덱스 이관·제거 결과
- 검증과 rollback: 실행 명령·결과, 정책 변경을 되돌릴 기준점

### Exit Gate

- 순환 우선순위와 같은 책임의 복수 SoT가 0건이다.
- 모든 규칙이 적용 상태·단계 또는 근거 있는 `N/A`에 연결된다.
- 모든 transition/호환/예외에 진입 조건과 Exit Gate가 있으며 최종 상태의 완료 정의와 충돌하지 않는다.
- 상위 정책과 세부 정책이 같은 상세 MUST를 중복 소유하지 않는다.
- 삭제된 정책이 소유하던 판정 책임 중 승계되지 않은 책임과 잔존 정방향·역방향 규범 참조가 0건이다.
- 마지막 변경 이후 대상 정책 전체(삭제는 삭제 전 본문)와 정방향·역방향 규범 참조를 독립 재리뷰하고 열린
  Finding 0건 체크포인트를 기록한다.
- 체크포인트와 동일한 최종 후보에서 적용 docs 검증이 통과해야 한다.

## DB 문서 경계

- 공개 docs는 도메인 엔티티, 관계, 소유권, 데이터 분류, 불변 조건, 생명주기, 논리 상태 전이만 설명한다.
- 공개 논리 모델은 [논리 데이터 모델 인덱스](../architecture/logical-data-model-index.md)의 도메인별 소유
  문서에서 한 번만 정의하고, 다른 문서는 논리 ID로 참조한다.
- 공개 docs에 서비스 업무 스키마의 전체 테이블·컬럼 사전, 실행 가능한 DDL, schema baseline/lock,
  인덱스·FK 전체 목록, DB 접속 정보 또는 운영 row 샘플을 두지 않는다.
- migration Gate 판정과 로컬 안전장치처럼 DB 거버넌스를 설명하는 최소 범용 SQL 예시는 허용한다.
  실제 서비스 업무 스키마 catalog나 운영 데이터 예시로 확장하지 않는다.
- 현재 동작을 추적하기 위한 최소한의 물리 식별자 참조는 허용하지만, 공개 문서가 물리 스키마의 완전한
  복제본이나 독립 SoT가 되어서는 안 된다.
- 물리 스키마의 단일 기준은 private 서비스 저장소의 schema-only baseline, current SQL/state/fixture와
  생성된 schema lock이다. 실제 환경은 exact plan/execution과 live schema+state로 판정한다.
- baseline과 lock은 생성물이며 직접 편집하지 않는다. 공개 논리 문서와 private 물리 산출물 사이에 동일한
  테이블·컬럼 설명을 이중 관리하지 않는다.
- 물리 테이블·컬럼 의미는 migration의 DB native `COMMENT`를 schema lock에 포함해 한 번만 관리한다. 별도
  컬럼 사전 파일을 추가하지 않는다.
- 기존 `COMMENT` 누락·오탈자·문자 깨짐은 생성된 baseline에서 고치지 않고 다음 `current.sql`의 최종 전이에
  통합해 정정한다.

## 문서 동기화 책임

- 코드 작업자는 사람/AI 구분 없이 변경 영향 범위 문서(FSM, API 스펙, 정책, DB Gate, 테스트 전략) 갱신 필요성을 반드시 점검한다.
- 문서 갱신이 필요하면 동일 작업 단위(PR/changeset)에서 코드와 함께 반영한다.
- 문서 갱신이 불필요하면 PR/작업 보고에 `문서 갱신 불필요` 판단 근거(관련 경로/라인/로그)를 남긴다.
- 작업 완료는 `코드 반영 + 검증 통과 + 문서 동기화(또는 불필요 근거 명시)`까지 포함한다.
- 모든 DB 변경은 private 물리 schema contract 갱신 필요성을 판정한다. 물리 구조가 바뀌면 current trio와
  schema lock 검증을 통과해야 한다.
- DB 변경이 도메인 관계, 소유권, 데이터 분류, 불변 조건, 보관·삭제 생명주기 또는 외부 계약을 바꾸면 공개
  논리 문서를 연결된 docs PR에서 함께 갱신한다.
- 새 물리 객체를 추가하거나 기존 객체를 분할·통합하면 private 논리 모델 매핑에서 공개 논리 ID,
  내부 운영 객체, 파생 조회 객체 중 하나로 반드시 분류한다.
- DB 변경이 물리 이름, 인덱스, 저장 타입, 내부 정규화처럼 공개 논리 계약을 바꾸지 않으면 공개 docs를 억지로
  수정하지 않고 `논리 문서 영향 없음` 근거와 private schema 검증 결과를 남긴다.

## 문서 Lifecycle Registry

`document-lifecycle-registry.json`은 현재 문서·route descriptor만 소유한다.
`document-retirement-ledger.json`은 삭제된 stable ID와 문서 경로를 장기 예약하는 최소 append-only ledger다.
두 파일은 문서 규범이나 상세 변경 이력을 다시 정의하지 않는다.

### 문서 항목

| 필드 | 규칙 |
| --- | --- |
| `id` | 경로가 바뀌어도 유지하는 lowercase stable ID |
| `path` | `content/` 기준 현재 Markdown 경로 |
| `routing` | `core`, `direct`, `closure`, `historical` 중 하나 |
| `coreOrder` | `core` 기반 문서 4개의 stable 순서를 고정 |
| `requiredHeadings` | 자동 검증할 실제 Markdown Gate heading과 level |
| `previousPaths` | 개명·이동 전 경로를 제거하지 않고 누적 |

- 모든 nav·인덱스 대상 `content` 문서는 정확히 하나의 current 항목과 연결한다. README, AGENTS, CLAUDE와 삽입·작성
  템플릿은 registry 대상에서 제외한다.
- `core`는 여러 작업 단계에서 재사용하는 기반 문서 4개, `direct`는 도메인·고위험 신호 route가 직접 가리키는
  문서, `closure`는 관련 SoT 폐쇄 탐색으로 도달하는 문서, `historical`은 불변 릴리스 실행 기록에 사용한다.
  새 세션은 `content/AGENTS.md`만 직접 읽고 `core`를 포함한 추가 문서는 current route가 일치할 때 읽는다.
- `requiredHeadings`는 fenced code, HTML 주석·block, blockquote 안 문자열이 아니라 실제 최상위 Markdown
  heading으로 존재해야 한다.
- 새 문서는 문서·nav·AGENTS 인덱스와 같은 변경 단위에서 current 항목을 추가한다. routing 책임을 판정하지
  않은 새 문서는 완료로 간주하지 않는다.
- 개명·이동은 `id`를 바꾸지 않고 새 `path`를 기록하며, 기존 경로와 과거 `previousPaths`를 보존한다.

### 삭제와 책임 승계

- 삭제 시 current registry 항목을 제거하고 같은 변경에서 retirement ledger 항목을 추가한다.
- retirement 항목은 `id`, `kind`, `retiredAt`만 공통으로 갖는다. 삭제 문서는 마지막 `path`와 모든
  `previousPaths`를 `reservedPaths`에 기록하고, route는 경로가 없으므로 `reservedPaths`를 갖지 않는다.
- 후속 책임이 있으면 선택 필드 `replacementId`로 같은 kind의 알려진 current 또는 retired ID를 가리킨다.
  여러 번 교체된 chain은 허용하되 unknown·교차 kind·self·cycle 참조는 허용하지 않는다.
- 후속 책임이 없으면 `replacementId`를 생략한다. 상세 삭제 사유, 마지막 routing·heading·route descriptor와
  당시 문서 구조는 PR과 Git 이력에 남기며 최소 예약 ledger에 복제하지 않는다.
- retirement ledger 항목은 삭제·수정하지 않는다. 삭제된 ID와 `reservedPaths`는 current registry에서 다시
  사용할 수 없다. 복원은 새 stable ID를 사용한다.
- 로컬 Gate는 사용 가능한 `origin/main`, PR Gate는 base SHA, main 배포 Gate는 push 이전 SHA의 current
  registry와 retirement ledger를 함께 비교한다. current ID 제거에는 같은 kind의 retirement 항목이 필요하고,
  문서 삭제에는 마지막 경로와 모든 과거 경로 예약이 필요하다.
- PR Gate가 drift의 `main` 유입 자체를 막으려면 GitHub `main` 보호 설정에 `docs-structure`,
  `markdown-lint`, `build-docs`를 필수 status check로 지정하고 관리자 우회를 허용하지 않는다. 이 보호가
  없으면 main 배포 Gate는 admission control이 아니라 잘못된 문서의 배포 차단과 사후 탐지만 수행한다.

### Route 항목

- 고위험 current 신호는 stable route `id`, 사용자 입력 `signal`, 표시 계약 `targetSource`, stable 문서 ID
  `targets`를 갖는다.
- `targetSource`의 경로와 `targets`가 가리키는 current 문서 경로·순서는 정확히 일치해야 한다.
- `core`와 `direct` 문서는 하나 이상의 current route가 참조해야 한다. 기반 문서, 고위험 route와 필수 Gate
  descriptor는 registry에서 파생하며 별도 validator 상수로 중복 소유하지 않는다.
- 같은 ID의 route `signal`, `targetSource`, `targets`는 변경하지 않는다. 책임을 교체하려면 기존 ID를
  retirement ledger로 옮기고 새 current ID를 추가한다.

## 구조 변경 규칙

- 문서 추가/삭제/이동/개명 시 `document-lifecycle-registry.json`, 삭제라면
  `document-retirement-ledger.json`, `content/AGENTS.md` 인덱스와 `mkdocs.yml` `nav`를 같은 PR에서 함께
  갱신한다.
- 독립 문서 템플릿은 역할/문서 종류/충돌 시 우선 문서/기준 성격 메타데이터를 갖고 같은 역할-종류 조합을
  사용한다. 다른 문서에 삽입되는 `api-contract-cutover-gate-template.md` 조각은 독립 문서 메타데이터
  대상에서 제외한다.
- 메타데이터 형식, 역할-종류 조합, 디렉터리 분류, 전환 추적 경계, 독립 템플릿, `content/AGENTS.md` 인덱스,
  `mkdocs.yml` `nav` 정합성은 docs 구조 검증으로 자동 확인 가능해야 한다.
- 모든 nav·인덱스 대상 문서의 current coverage, stable ID·과거 경로, routing 분류, 필수 heading, route target
  역참조, retired ID·경로 예약과 base 대비 current→retired 전환은 문서 lifecycle 검증으로 자동 확인 가능해야
  한다.
- `content/AGENTS.md`의 bootstrap, 요청 유형·권한·상태의 폐쇄형 값, registry에서 파생한 라우팅, README
  bootstrap과 확인 가능한 실제 workspace root bootstrap은 에이전트 작업흐름 검증으로 자동 확인 가능해야 한다.
- 자동 검증은 표·상태 순서·경로·필수 heading처럼 구조적으로 판정 가능한 계약을 fail-closed로 검사한다.
  자유 문장의 의미와 간결성은 validator 상수로 복제하지 않고 문서 안정성 평가에서 판정한다.
- 본문이 실제로 설명·규범·시나리오·부채 역할을 지키는지는 의미 검토가 필요하므로 정규식 hard gate로
  대신하지 않고 문서 안정성 평가에서 판정한다.
- 구조·문법·어휘만으로 결정 가능한 자유 문장 hard gate는 [테스트/CI 전략](testing-strategy.md)의
  `차단형 validator 안전성`을 따르며, 의미 구분이 필요한 범위까지 탐지 규칙을 확장하지 않는다.
- 기술부채 인벤토리의 번호 연속성, 미해결 `현상` 존재와 완료 이력형 패턴 부재, 모든 기술부채 문서의 가변 API
  계약 package concrete version 부재는 기술부채 검증으로 자동 확인 가능해야 한다.
- docs 검증이 통과해도 SoT 충돌이 있으면 완료로 간주하지 않는다. 충돌은 규범 문서부터 수정한다.

## 문서 안정성 평가

- 평가 범위는 변경 문서와 직접 연결된 규범/참조 문서로 한정한다. 전체 docs 평가는 명시 요청, 릴리스, 정기 점검 때 수행한다.
- `직접 연결 문서`는 변경 문서의 명시 링크, `관련 문서`, 같은 도메인의 규범 문서, 변경 문서를 상위 원칙·단일 SoT·충돌 우선 문서로 인용하는 역방향 규범 참조, 변경으로 영향받는 `content/AGENTS.md`/`mkdocs.yml`/템플릿/검증 스크립트로 한정한다.
- 구조 검증 통과만으로 안정성 평가를 통과한 것으로 보지 않는다.
- 안정성 평가는 `Scope Gate -> 기본 문서 관점 -> 조건부 추가 관점 -> Finding 병합 -> Exit Gate` 순서로 수행한다.
- `Scope Gate`: 변경 유형, 대상 문서, 직접 연결 문서, 제외 범위, 조건부 추가 관점 적용 여부와 `N/A` 근거를 먼저 고정한다.
- 변경 유형은 `오타`, `문서-only`, `코드+문서`만 사용한다. 문서-only 변경의 위험도는 별도 변경 유형으로 나누지 않는다. 안정성 평가 `N/A`는 변경 유형이 아니라 Scope Gate의 `N/A` 근거로 기록한다.
- 모든 docs 변경에는 아래 기본 문서 관점을 일괄 적용한다.
    - **SoT / Policy Editor**: 규범, 우선순위, 충돌, MUST/SHOULD 중복 정의
    - **Taxonomy / Classification Editor**: 도메인, 상태, enum, 에러 source/code/surface, 문서 역할 같은 분류 체계가 단일 축으로 정의됐는지, 제품면/도메인/동작/원인/문서 종류가 한 이름에 섞이지 않는지 확인
    - **Structure Fitness / Simplification Reviewer**: 변경 범위 안에서 문서나 코드가 더 단순한 SoT, 책임 경계, 파일/절 배치로 정리될 수 있는데도 중복, 우회, 임시 구조를 새로 만들거나 넓히지 않는지 확인
    - **Change Impact / Sync Auditor**: 관련 문서, 인덱스, nav, 템플릿, 테스트/CI 동기화
    - **First-time Reader**: 신규 진입자가 추측 없이 다음 필수 문서까지 도달 가능한지
    - **Fresh Session / Routing Safety Reviewer**: 이전 대화가 없는 새 세션이 워크스페이스 진입 규칙과 작업 신호만으로 필요한 문서까지 도달하고, 열람 범위와 수정 권한을 구분해 요청·필수 동기화 밖의 불필요한 수정을 만들지 않는지 확인
    - **Writing Quality / Style Editor**: 문장 중복, 용어/표현 일관성, 간결성, 작성 기준과 리뷰 기준 일치 여부
    - **Domain Implementer**: API/Mobile/Admin/docs 작업자가 실행 기준으로 사용할 수 있는지
    - **QA / Evidence Reviewer**: 검증 명령, 최신 근거, `N/A` 사유, 로그/출처 증빙
    - **Validation Architecture / Redundancy Reviewer**: event·ref·baseline·산출물·실패 책임이 같은 Gate의
      불필요한 재실행은 없는지, 서로 다른 신뢰 경계와 validator 회귀 테스트를 중복으로 오판하지 않는지 확인
    - **Lifecycle Owner**: `transition`, `임시`, `호환`, `fallback` 제거 조건과 부채/추적 연결
- 조건부 추가 관점은 변경 내용이 보안/권한/결제/API 계약/FSM/상태 전이/푸시/DB/배포/릴리스/데이터 거버넌스/다중 레포 계약 기준, 절차, 판정 근거를 직접 바꾸는 경우에만 적용한다.
- 조건부 추가 관점이 적용되면 [코드 리뷰 정책](code-review-policy.md)의 관련 관점만 선택하고, 적용하지 않은 관점은 `N/A` 근거를 남긴다.
- `policy` 문서 추가·수정·삭제·리뷰에는 **Policy Composition / Lifecycle Consistency Reviewer**를 조건부 필수 관점으로 적용한다.
    - PR diff가 아니라 대상 정책 전체(삭제는 삭제 전 본문)와 정방향·역방향 규범 참조를 읽는다.
    - `정책 Composition Gate`의 책임/우선순위, 상태·단계별 Exit Gate, 전역 절 정합성 증빙을 확인한다.
    - 기존 규칙 끝에 새 예외나 MUST를 누적해 다른 상태의 완료 정의를 불가능하게 만들면 Finding으로 기록한다.
- 문서 거버넌스, taxonomy, 문서 메타데이터, 템플릿 또는 docs 구조 검증을 강화하는 변경에는
  **Docs Taxonomy Transition Readiness Reviewer**를 조건부 추가 관점으로 적용한다.
    - 목표 taxonomy와 이번 변경의 비포함 범위를 먼저 고정한다.
    - 구현 시점의 기존 문서 전체를 대상으로 역할/문서 종류/도메인 SoT/기준 성격/추적 문서 적합성 baseline을 확인한다.
    - 기존 문서가 새 기준에 맞지 않으면 즉시 hard gate를 활성화하지 않고 불일치를 기술부채로 추적한다.
    - hard gate는 목표 taxonomy 적용 대상인 기존 문서의 불일치와 전환용 allowlist가 모두 0건이 된 뒤 활성화한다.
- 과거 릴리스 기록의 역사적 사실을 taxonomy 정리를 이유로 소급 변경하거나 새 schema로 재검증하지 않는다.
  후속 설명은 이슈·장애 기록에서 추적하고, 실제 새 배포가 없는 정정용 릴리스 기록은 만들지 않는다.
  적용하지 않을 문서는 예외 목록이 아니라 목표 taxonomy의 비포함 범위와 근거로 명시한다.
- DB 관점이 적용되면 공개 논리 모델 영향, private schema source 갱신, current 전이, schema lock drift와
  live state 판정을 함께 확인한다.
- 관점별 상세 로그/일반 의견은 남기지 않고, 판정/근거와 병합된 Finding만 기록한다.
- Finding에는 발견 관점(대표 관점 1개 이상)을 기록한다.
- 필수 확인 항목은 아래와 같다.
    - SoT 충돌 없음
    - 분류 체계(taxonomy) 충돌 없음
    - 문서/코드 구조가 변경 범위 안에서 SoT, 책임 경계, 중복 관점으로 불필요하게 복잡해지지 않음
    - 검증 실행 경로에 근거 없는 중복이 없고 유지한 단계별 재검증은 신뢰 경계·baseline·산출물 차이가 있음
    - 문서 역할 혼재 없음
    - `transition`, `임시`, `호환`, `fallback`에 제거 조건 또는 미적용 근거 있음
    - 시간이 지나면 바뀌는 사실에 최신 근거 있음
    - To-Be 또는 임시 구조에 부채/추적 문서 연결 있음
    - taxonomy/메타데이터/검증 hard gate 변경에 기존 문서 baseline, 단계적 활성화, 적용 범위의 전환 완료 조건 있음
    - policy 추가·수정·삭제에 대한 전체 정책·역방향 규범 참조 검토, 책임/우선순위, 상태·단계별 Exit Gate, 전역 절 정합성, 삭제 시 책임 승계 증빙 있음
    - 개인 사용자명·개인 개발 장비 절대경로가 없고, 공유 환경 경로는 운영 flow/runbook 예외 조건을 충족함
- 최종 판정은 `No Findings`, `Finding`, `기존 부채`, `N/A`만 사용한다.
- 마지막 변경 이후 Scope Gate/기본 문서 관점/조건부 추가 관점/필수 확인 항목을 독립 재리뷰하고 열린 Finding이
  0건이면 [코드 리뷰 정책](code-review-policy.md)의 `열린 Finding 0건·검증 대기` 체크포인트를 기록한다.
- `Exit Gate`는 체크포인트와 동일한 최종 후보에서 [테스트/CI 전략](testing-strategy.md)의 docs 표준 통합 품질
  게이트를 통과하고, 각 관점이 `No Findings`, 근거 있는 `N/A`, 또는 변경 범위 밖 `기존 부채`이며 열린 Finding이
  0건일 때만 `No Findings`로 판정한다. Policy 변경은 `정책 Composition Gate`의 Exit Gate도 함께 충족해야 한다.
- Finding이 있으면 원인을 1회 수정하고 같은 범위를 1회 독립 재리뷰한다. 재리뷰에도 열린 Finding이 남으면 최종
  판정은 `Finding`으로 유지하고 추가 수정·재리뷰 없이 자동 실행을 `BLOCKED`로 종료해 보고한다. 열린 Finding이
  0건인 동일 최종 후보에만 docs 표준 통합 품질 게이트를 실행하며, 검증 실패로 파일을 수정하면 새 최종 후보의
  독립 재리뷰부터 다시 시작한다.
- 변경 범위 밖 기존 불일치는 기존 부채로 기록한다. 이번 변경이 만들거나 넓힌 불일치는 Finding으로 본다.

## 관련 문서

- [엔지니어링 가드레일](engineering-guardrails.md)
- [테스트/CI 전략](testing-strategy.md)
- [코드 리뷰 정책](code-review-policy.md)
- [논리 데이터 모델 정책](logical-data-model-policy.md)
