# AGENTS

## 최소 운영 규칙

- 이 문서에는 문서 인덱스와 에이전트 최소 운영 규칙만 포함한다
- 중복이 없이 다른 개념으로 새 문서가 필요할 경우 새 문서 생성 후 여기에 링크 추가
- 문서 추가/삭제/이동/개명 시 `document-lifecycle-registry.json`, `content/AGENTS.md` 문서 인덱스와
  `mkdocs.yml`의 `nav`를 반드시 함께 동기화한다
- 새 nav·인덱스 대상 문서는 lifecycle registry에 stable ID와 `active` 항목을 추가하고 `core`/`direct`/`closure`/
  `historical` routing 책임을 명시한다
- 문서 개명·이동은 stable ID를 유지하고 이전 경로를 `previousPaths`에 남긴다. 삭제는 registry 항목을
  제거하지 않고 `retired` tombstone, 사유와 replacement 또는 무대체 사유를 남긴다
- 작업 완료 전 문서 동기화를 확인한다(필요 시 반영, 불필요 시 근거 기록). 상세 기준은 `content/policy/document-governance-policy.md`를 단일 SoT로 따른다
- 템플릿 문서는 `content/templates/`에 둔다
- 신규 문서 작성 시 `content/templates/` 템플릿을 우선 사용하고, 적합한 템플릿이 없으면 템플릿부터 추가한 뒤 문서를 작성한다
- 같은 도메인에 `policy`, `architecture`, `fsm`, `flow`, `technical-debt` 문서가 2개 이상 존재하면 각 문서 상단에 역할, 문서 종류, 충돌 시 우선 문서, 기준 성격(`as-is`/`to-be`/`transition`)을 명시한다
- 문서 역할은 `규범`, `설명`, `시각화`, `시나리오`, `부채`를 사용한다. `technical-debt`는 문제/우선순위 기록 문서이며 규범 문서를 대체하지 않는다
- `technical-debt`에는 미해결 항목만 유지한다. 완료 기준을 충족한 항목은 같은 작업 단위에서 삭제하고, 다른 축의 잔여 작업은 기존/신규 부채로 분리하며, 완료 이력은 PR 또는 릴리스 기록에 남긴다
- `content/technical-debt/technical-debt.md`의 각 항목은 `현상`, `영향`, `조치`, `완료`를 간결하게 유지한다. 필요한 근거·예외는 추가할 수 있고 상세 이력은 링크된 문서, PR, 릴리스 기록에 둔다
- 문서 역할 기준의 단일 SoT는 `content/policy/document-governance-policy.md`를 따른다
- 문서 작성/수정/삭제/리뷰 시에는 문장 중복 제거보다 "처음 온 사람이 다음 필수 문서까지 실제로 따라 들어갈 수 있는가"를 우선 확인한다
- `policy` 문서 추가·수정·삭제·리뷰 시에는 `content/policy/document-governance-policy.md`의 `정책 Composition Gate`를 적용해 대상 정책 전체(삭제는 삭제 전 본문), 정방향·역방향 규범 참조, 책임/우선순위, 상태·단계별 Exit Gate를 확인한다
- 사용자와 명시적으로 합의하지 않았거나, 처음 온 사람이 추측해야 하는 임의 축약어/내부 은어를 쓰지 않는다
- 새 세션 시작 전에는 아래 Core 4개만 필수 열람한다
    - `content/technical-debt/technical-debt.md`
    - `content/policy/code-review-policy.md`
    - `content/policy/engineering-guardrails.md`
    - `content/policy/testing-strategy.md`
- 새 세션 첫 응답은 아래 형식을 반드시 사용한다
    - `ACK: CORE@YYYY-MM-DD CRP@YYYY-MM-DD`
    - `EVIDENCE: content/technical-debt/technical-debt.md:<line>, content/policy/code-review-policy.md:<line>, content/policy/engineering-guardrails.md:<line>, content/policy/testing-strategy.md:<line>`
    - `CRP`는 `content/policy/code-review-policy.md`를 의미한다
    - `YYYY-MM-DD`는 세션 날짜를 사용한다
- ACK/EVIDENCE 출력 전에는 필수 문서 열람 외 명령 실행/코드 작성/수정을 시작하지 않는다
- 코드 리뷰 관련 답변은 `content/policy/code-review-policy.md`의 "리뷰 근거 표기 의무"를 따른다
    - 근거 없는 일반론/추측 코멘트는 무효로 간주하고, 문서 재독 후 다시 작성한다
- 지시/리뷰에 `논리 데이터 모델`이 포함되면 `content/policy/logical-data-model-policy.md`의
  `충실도 리뷰 판정`을 추가 열람하고 공개 논리 모델 충실도와 물리 DB 설계·운영 안전성을 먼저 분리한다
    - 공개 논리 모델에 물리 컬럼, PK/FK/UNIQUE/CHECK, 인덱스 또는 전체 SQL 의존성이 없다는 이유만으로
      finding을 만들지 않는다
    - 물리 제약 부재만으로 논리 관계나 불변조건을 부정하지 않으며, 실제 의미·동작의 모순 근거가 있을 때만
      논리 모델 finding으로 판정한다
- 커밋 생성/수정 요청을 받으면 staging 또는 commit 전에 `content/policy/code-review-policy.md`, `content/policy/git-branch-strategy.md`, `content/policy/commit-convention.md`를 함께 확인한다
    - 현재 세션에서 마지막 파일 변경 이후 같은 변경 범위를 리뷰한 기록이 없거나 최종 판정이 `No Findings`가 아니면 즉시 멈추고 사용자에게 계속 진행 여부를 물어본다
    - 사용자가 진행을 승인하더라도 커밋 전에는 리뷰 범위, 열린 Finding, 마지막 변경 이후 검증 상태를 다시 보고한다
    - 현재 브랜치가 `main` 또는 `develop`이면 커밋하지 않고 사용자에게 작업 브랜치 생성을 먼저 확인한다
    - 커밋 전 브랜치 적합성은 `content/policy/git-branch-strategy.md`를 함께 확인한다
    - `git status`와 diff를 확인해 사용자 변경, 생성물, 무관 파일이 섞였는지 분리한다
    - staging은 작업 단위별로 수행하며, 한 파일에 무관 변경이 섞이면 `git add -p` 또는 동등한 hunk 단위 staging을 사용한다
    - staging 후 `git diff --cached`로 커밋 범위가 의도한 작업 단위와 일치하는지 재확인한다
    - 커밋 직후 메시지 포맷 확인은 커밋 컨벤션 정책의 CLI 작성 규칙을 따른다
- 브랜치 생성/이름 변경이 필요하면 실행 전에 `content/policy/git-branch-strategy.md`를 확인하고, 브랜치 이름이 해당 규칙을 따르는지 점검한다
- 원격 push, PR 생성, 기존 PR 브랜치 갱신, 태그 push 요청을 받으면 push 전에 `content/policy/code-review-policy.md`의 `Push 전 자체 리뷰 게이트`를 적용한다
    - 마지막 파일 변경 이후 push 대상 범위의 최종 판정이 `No Findings`가 아니거나 열린 Finding이 있으면 push하지 않고 리뷰 범위, 열린 Finding, 마지막 변경 이후 검증 상태를 먼저 보고한다
    - 사용자 승인으로 계속 진행하더라도 push 직전에는 `git status`, push 대상 커밋/태그 범위, 문서 동기화 여부, 적용 품질 게이트 결과를 다시 확인하고 보고한다
    - force push, 태그 삭제, 원격 브랜치 삭제처럼 원격 이력을 바꾸는 작업은 별도 명시 승인 없이는 실행하지 않는다
- 브랜치 push, PR 생성·업데이트, "PR 올려줘" 요청은 GitHub reviewer 요청·지정 권한을 포함하지 않는다
    - 사용자가 reviewer 개인 또는 팀을 별도로 명시해 승인하기 전에는 `Request reviewer`를 실행하거나 reviewer를 추가·재요청·교체·제거하지 않는다
    - 적합한 reviewer를 에이전트가 임의로 추정하지 않으며, 기존 reviewer 상태를 read-only로 확인하더라도 사용자 승인 없이 변경하지 않는다
- 사용자가 "관련 워크트리와 브렌치 정리해줘" 또는 같은 의미의 요청을 하면 `content/policy/git-sync-rebase-policy.md`의 `관련 워크트리와 브랜치 정리 절차`를 따른다
- 지시/리뷰에 `DBM-GATE-*`가 포함되면 `content/policy/db-migration-gate-policy.md`를 추가 열람하고 Gate ID 기준으로 근거를 제시한다
- 테스트 파일(`__tests__`, `*.test.*`, `__snapshots__`) 변경은 `content/policy/testing-strategy.md`의 `테스트 변경 판정` 기준을 따른다
    - 사용자 요청 또는 작업 목표가 `테스트 변경 판정` 기준상 테스트 추가/갱신 대상이면 테스트 파일 변경은 사전 승인된 것으로 본다
    - 테스트 변경 필요성이 작업 중 새로 발견됐고 사용자 요청 또는 작업 목표의 범위를 벗어나면 변경 전 사용자 승인을 받는다
    - 승인 또는 사전 승인 후에는 `content/policy/code-review-policy.md`와 `content/policy/testing-strategy.md`의 품질 기준을 그대로 따르고, 최종 보고에 `테스트 변경 여부`(`추가`/`갱신`/`미변경`)를 남긴다
    - 테스트 파일을 추가/갱신한 경우 최종 보고에 변경 파일과 변경 이유를 함께 남긴다
    - `skip/only`, assertion 완화, 무검토 snapshot 갱신처럼 테스트를 약화하는 변경은 금지한다
    - 필요 시 `docs/.github/scripts/`로 테스트 파일 변경 여부를 확인한다

## 작업 실행 제어

### 기본 원칙

- Core 4 전체 강제 열람은 모든 요청에 유지한다. 요청이 단순하거나 read-only라는 이유로 생략하지 않는다.
- Core 열람은 작업 기준을 현재 컨텍스트에 고정하는 안전 Gate다. 요약문, 이전 세션 기록, 상위 에이전트의
  전달 내용으로 대체하지 않는다.
- 새 세션, 컨텍스트 유실 후 재진입, 독립 작업을 위임받은 에이전트는 각각 Core 4를 직접 다시 읽는다.
- 작업은 `요청 유형`, `권한 집합`, `작업 범위`, `실행 단계`를 서로 독립된 축으로 판정한다. 한 축의 값으로
  다른 축의 권한이나 완료 조건을 추론하지 않는다.
- 요청을 분류할 수 없거나 관련 단일 SoT를 확정할 수 없으면 파일을 수정하지 않고 `스펙 공백`과 필요한
  확인 범위를 보고한다.

### 요청 유형과 종료 조건

| 요청 유형 | 기본 동작 | 종료 조건 |
| --- | --- | --- |
| `설명·상태 확인` | 근거를 read-only로 확인한다 | 확인 범위, 근거, 결론 보고 |
| `진단` | 원인, 영향, 재현 경로를 확인한다 | 원인과 근거 보고; 수정은 별도 요청이 있을 때만 수행 |
| `설계·계획` | 기준 SoT와 대안을 검토한다 | 포함·제외 범위, 책임 경계, 검증·rollback, 계획 최종 리뷰 |
| `변경·구현` | 요청 범위의 코드·문서·테스트를 수정한다 | 구현, 문서 동기화, 마지막 변경 이후 독립 리뷰·검증·최종 판정 |
| `리뷰` | 대상 diff·문서·커밋·PR을 read-only로 평가한다 | 근거 있는 Finding 또는 `No Findings` 판정; 요청 없이는 수정 금지 |
| `운영·관찰` | 승인된 운영 동작 또는 상태 관찰만 수행한다 | 명시된 종료 조건, 결과, 잔여 위험 보고 |

- `변경·구현` 요청은 계획 작성만으로 완료하지 않는다. 안전한 범위에서 구현, 문서 동기화, 마지막 변경 이후
  독립 리뷰와 검증, 최종 판정까지 계속한다.
- `설계·계획`, `리뷰`, `진단`은 파일 변경 권한을 포함하지 않는다. 사용자가 같은 요청에서 변경까지 명시한
  경우에만 `변경·구현`을 함께 적용한다.

### 권한 집합

- 기본 권한은 요청 유형의 종료 조건을 달성하는 데 필요한 read-only 또는 workspace 파일 변경까지다.
- 테스트 파일 변경 권한은 상단 `테스트 파일 변경` Gate를 따른다.
- 외부 의존성 추가·대체와 이를 위한 manifest·lockfile 수정 또는 install 명령은 일반 workspace 파일 변경
  권한에 포함되지 않는다.
- [엔지니어링 가드레일](policy/engineering-guardrails.md)의 `외부 의존성 변경 사전 검토` 근거를 먼저 제시하고
  작업 요청자의 명시적 승인을 받아야 한다. 기능 구현·리팩터링 같은 일반 변경 요청은 외부 의존성 승인으로
  해석하지 않으며, package 또는 적용 범위가 달라지면 다시 승인받는다.
- branch/worktree 생성, commit, push, PR 생성, reviewer 변경, deploy, force push·삭제는 서로 독립된 권한이다.
- 사용자가 명시하지 않은 외부 상태 변경 권한을 작업의 자연스러운 후속 단계라는 이유로 추가하지 않는다.
- `수정하고 PR 올려줘`는 수정·검증·commit·push·PR 생성 권한을 포함하지만 reviewer 변경·deploy 권한을
  포함하지 않는다.
- 권한이 없는 단계 직전에는 현재 완료 상태와 필요한 추가 권한을 보고하고 멈춘다.

### 작업 범위 판정

작업 시작 전에 아래 범위를 고정한다.

- 대상 레포와 기존 branch/worktree/PR
- 산출물 종류: 코드, 테스트, 문서, 설정, DB migration, 릴리스 기록
- 제품·운영 도메인과 관련 architecture/policy/FSM/flow
- 위험 표면: API 계약, DB, 권한·보안, 결제, 푸시, 개인정보, 배포, 모바일 릴리즈, 다중 레포
- 사용자 요청의 포함 범위와 명시적 제외 범위

- 같은 요청, 연관 PR·이슈, 도메인 또는 SoT를 다루는 적합한 기존 branch/worktree/PR이 있으면 새 작업을
  만들지 않고 해당 작업에서 계속한다. 리뷰·상태 확인만 요청받았으면 새 작업을 만들지 않는다.
- 기존 작업이 부적합해 대체 작업이 필요하면 근거와 이관·정리 계획을 먼저 보고하고 사용자 승인을 받는다.
  같은 범위의 활성 PR을 병렬로 유지하지 않는다.
- read-only 탐색을 마치고 첫 파일 변경·branch/worktree 생성·외부 작업 전에 아래 형식으로 실행 계약을
  기록한다. 단순 설명·상태 확인은 같은 항목을 최종 보고에 포함할 수 있다.
    - `ROUTE: 요청=<유형> | 레포=<대상> | 산출물=<종류> | 도메인=<범위> | 위험=<표면> | 권한=<집합> | 필수문서=<경로> | 완료=<종료 조건>`

### 관련 SoT 폐쇄 탐색

1. 요청 문구와 변경 대상에서 도메인·위험 표면을 식별한다.
2. `문서 인덱스`에서 가장 가까운 architecture 또는 policy를 연다.
3. 선택한 문서 상단의 `충돌 시 우선 문서`와 본문에서 단일 SoT·상위 규범으로 지정한 직접 링크를 연다.
4. `관련 문서` 절이 있으면 직접 연결된 policy, architecture, FSM, flow, technical-debt를 확인한다. 없으면
   본문의 직접 규범 링크를 같은 범위로 확인한다.
5. 각 판정 책임이 하나의 단일 SoT에 연결될 때까지 2~4를 반복한다.
6. 충돌, 누락, 불명확한 기대 동작이 있으면 구현보다 규범 문서를 먼저 확정한다.

최종 필수 열람 집합은 `Core 4 + 고위험 신호 라우팅 문서 + 도메인 SoT 폐쇄 탐색 결과`다.
문서 링크가 존재한다는 사실만으로 열람 완료로 간주하지 않는다.

### 고위험 신호 라우팅

| 변경·리뷰 신호 | 추가 필수 문서 |
| --- | --- |
| docs 작성·수정·삭제·리뷰 | `content/policy/document-governance-policy.md`와 적용 템플릿 |
| policy 추가·수정·삭제·리뷰 | `content/policy/document-governance-policy.md`의 `정책 Composition Gate` |
| 논리 데이터 모델 | `content/policy/logical-data-model-policy.md`의 적용 절과 충실도 리뷰 판정 |
| DB, migration, DB schema, `DBM-GATE-*` | `content/policy/db-migration-gate-policy.md` |
| API 성공·실패 envelope | `content/policy/api-response-contract-policy.md` |
| API ErrorData·error taxonomy | `content/policy/api-error-contract-policy.md` |
| public DTO·계약 package | `content/policy/api-client-contract-package-policy.md` |
| 페이지/use-case 조회·동작 operation | `content/policy/api-operation-design-policy.md` |
| 인증·인가·관리자 권한·민감정보 | `content/policy/security-access-control-policy.md`, `content/policy/data-governance-policy.md` |
| 결제·환불·정산 | `content/policy/payment-ops-policy.md` |
| 매칭 상태·키·일정 | `content/policy/matching-ops-policy.md` |
| 회원 심사 | `content/policy/member-review-policy.md`와 연결 architecture/FSM |
| 푸시 타입·발송·장애 대응 | `content/policy/push-notification-policy.md` |
| 배포·릴리즈·태그 | `content/policy/release-process.md`, `content/policy/release-tag-policy.md`, 적용 runbook |

- 표에 없는 도메인은 비적용으로 추론하지 않고 `관련 SoT 폐쇄 탐색`을 적용한다.
- 여러 신호가 함께 있으면 해당 행의 문서를 합집합으로 읽고 판정 책임별 우선순위를 고정한다.

### 작업 상태 머신

모든 작업은 아래 순서를 사용한다. 비적용 단계는 생략하지 않고 근거 있는 `N/A`로 판정한다.

1. `BOOT`: Core 4를 전체 열람하고 ACK/EVIDENCE를 출력한다.
2. `CONTINUITY`: 변경·branch·PR 작업이면 같은 범위의 기존 worktree, branch, PR을 먼저 확인한다.
3. `CLASSIFY`: 요청 유형, 권한 집합, 작업 범위, 위험 표면을 서로 분리해 고정한다.
4. `ROUTE`: 관련 SoT 폐쇄 탐색을 완료하고 추가 필수 문서를 읽는다.
5. `BASELINE`: 현재 코드·문서·Git·외부 상태와 사용자 변경을 read-only로 확인한다.
6. `PLAN`: 목표, 제외 범위, 기준 문서, 영향 범위, 검증, rollback을 고정한다. 신중/안전 지시는 계획 자체를
   먼저 리뷰한다.
7. `EXECUTE`: 요청 유형과 권한 집합 안에서만 작성·수정·운영 작업을 수행한다.
8. `REVIEW`: 마지막 파일 변경 이후 같은 범위로 독립 코드 리뷰 또는 문서 안정성 평가를 수행한다. 열린 Finding이
   0건이면 최종 판정 전 체크포인트인 `열린 Finding 0건·검증 대기`를 기록한다.
9. `VERIFY`: 체크포인트와 동일한 최종 후보에 대해 적용 테스트/CI, 문서 동기화, 수동·운영 검증을 수행한다.
   로컬 표준 통합 품질 게이트는 [테스트/CI 전략](policy/testing-strategy.md)의 후보별 1회 원칙을 따른다.
10. `FINALIZE`: 동일 최종 후보의 독립 리뷰와 적용 검증이 모두 유효할 때만 최종 판정을 확정한다.
11. `EXTERNAL_ACTION`: 명시 권한이 있을 때만 commit, push, PR, reviewer, deploy Gate를 각각 적용한다.
12. `REPORT`: 범위, 변경, 검증, 문서 동기화, 열린 Finding, 최종 판정, 잔여 위험을 보고한다.

- `REVIEW`, `VERIFY` 또는 `FINALIZE` 뒤 파일이 바뀌면 이전 리뷰·검증·최종 판정은 모두 만료된다. 새 최종 후보로
  `REVIEW -> VERIFY -> FINALIZE`를 다시 수행한다.
- Finding이 있으면 `원인 수정 -> 동일 범위 독립 재리뷰`를 반복한다. 열린 Finding이 0건이 되기 전에는 로컬 표준
  통합 품질 게이트를 실행하지 않는다.
- 검증 실패는 `No Findings`로 판정하지 않는다. 파일 수정이 필요하면 새 최종 후보로 돌아가고, 후보가 바뀌지 않은
  환경 실패의 재시도는 [테스트/CI 전략](policy/testing-strategy.md)의 예외 기준을 따른다.
- 요청 범위 밖 기존 부채는 근거와 함께 분리하고 완료를 위해 임의로 확장하지 않는다.

### 단계별 기준 재고정

- 세션 시작: Core 4 전체
- 설계·구현 전: 관련 도메인 SoT 전체
- 마지막 파일 변경 후: 적용된 Core와 도메인 정책의 검증·Exit Gate 절
- 문서 변경 후: 문서 거버넌스 정책과 적용 템플릿
- commit 전: 코드 리뷰, Git 브랜치, 커밋 정책
- push·PR 전: 코드 리뷰 정책의 Push 전 자체 리뷰 Gate
- deploy 전: release 정책, 적용 runbook, DB 변경 시 DB Migration Gate
- 컨텍스트 유실, 새 세션, 독립 에이전트 위임: Core 4 전체 재열람

### 작업별 필수 완료 증빙

- 문서 작성·수정: 적용 템플릿, 직접 연결 문서, 문서 동기화, docs 검증, 문서 안정성 최종 판정
- policy 변경: 대상 정책 전체, 정방향·역방향 규범 참조, 책임·우선순위, 생명주기, Composition Gate
- 설계·계획: 포함·제외, 기준 SoT, 책임 경계, 대안, 검증, rollback, 계획 최종 리뷰
- 코드 변경: 테스트 변경 판정, 적용 품질 Gate, 문서 동기화, 7개 관점 점검, 마지막 변경 이후 최종 판정
- 코드·문서 리뷰: 고정된 리뷰 범위, 적용 기준, 근거 있는 Finding, 검증 상태, 최종 판정
- 외부 작업: 각 권한별 사전 Gate, 실행 결과, 실패·rollback 기준

## 문서 인덱스

### Architecture

- [레포지토리 요약](architecture/repo-overview.md)
- [논리 데이터 모델 인덱스](architecture/logical-data-model-index.md) - 도메인 ID와 데이터 소유 문서
- [예정 논리 데이터 모델 인덱스](architecture/logical-data-model-planned-index.md) - 아직 현행으로 승격하지 않은 도메인과 소유 문서
- [coupler-mobile-app to-be 아키텍처](architecture/mobile-app-to-be.md)
- [회원 라이프사이클](architecture/member-lifecycle.md) - 회원 전체 상태 흐름
- [회원 심사 시스템](architecture/member-review-system.md) - 심사 요청·증거·프로필 버전
- [클럽매니저 시스템](architecture/club-manager-system.md) - 클럽매니저·회원 배정·상세 프로필
- [매칭 시스템](architecture/matching-system.md) - 1:1 매칭 저장 책임
- [매칭 키 시스템](architecture/matching-key-system.md) - 키 소진 및 환불 규칙
- [매칭 스케줄 알고리즘](architecture/matching-schedule-algorithm.md)
- [기존 2:2 그룹미팅 시스템](architecture/meeting-system.md) - 구현·배포된 레거시 계약
- [그룹미팅 시스템](architecture/group-meeting-system.md) - n대n 그룹미팅 to-be 기획
- [라운지 시스템](architecture/lounge-system.md) - 커뮤니티
- [채팅 시스템](architecture/chat-system.md)
- [신고·제재 시스템](architecture/moderation-system.md) - 신고·차단·숨김·패널티
- [결제 시스템](architecture/payment-system.md) - 키 충전 및 인앱결제
- [푸시 알림](architecture/push-notification.md) - FCM
- [고객지원 시스템](architecture/support-system.md) - 고객센터 문의·답변
- [관리자 권한](architecture/admin-permission.md) - 관리자 계정·인가 구현 구조 설명
- [플랫폼 기준정보 시스템](architecture/platform-config-system.md) - 설정·앱 버전·공지·기준정보
- [분석 시스템](architecture/analytics-system.md) - 운영 통계 조회 모델
- [크론 작업](architecture/cron-jobs.md) - 자동화 스케줄
- [업로드/미디어 시스템](architecture/upload-media-system.md) - 파일 업로드, 저장, media_proxy
- [테스트용 개발 데이터 시스템](architecture/development-test-data-system.md) - CMS 전체 component route 합성 데이터·화면 검증 구조

### FSM

- [회원 심사 FSM](architecture/member-review-fsm.md) - 상태머신 및 심사 플로우
- [매칭 FSM](architecture/matching-fsm.md) - 매칭 상태 머신

### Technical Debt

- [기술 부채 정리](technical-debt/technical-debt.md)
- [Firebase Apple SDK CocoaPods 마이그레이션 계획](technical-debt/firebase-apple-sdk-cocoapods-migration-plan.md)

### Policy

- [Git 브랜치 전략](policy/git-branch-strategy.md) - 브랜치 명명 규칙
- [Git 동기화/Rebase 실행 정책](policy/git-sync-rebase-policy.md) - pull/rebase 기준 및 최신화 검증 규칙
- [커밋 메시지 컨벤션](policy/commit-convention.md) - Conventional Commits 기반
- [배포 태그 정책](policy/release-tag-policy.md) - 릴리즈 태그와 스토어 제출 마커 태그 기준
- [배포/릴리즈 프로세스](policy/release-process.md) - 배포 범위, 릴리즈 기록 상태·metadata·완료/정정 조건
- [로그 정책](policy/log-policy.md) - 개발/운영 로그 규칙
- [API 공통 응답 계약 정책](policy/api-response-contract-policy.md) - API/Admin/Mobile 공통 JSON 응답 envelope 기준
- [API 에러 계약 정책](policy/api-error-contract-policy.md) - API/Admin/Mobile 공통 실패 ErrorData 및 taxonomy 기준
- [API 조회·동작 설계 정책](policy/api-operation-design-policy.md) - 페이지/use-case 조회 집계와 증분 조회·동작 명령·전송 경계 기준
- [API 클라이언트 계약 패키지 정책](policy/api-client-contract-package-policy.md) - `@coupler-developer/coupler-api-contracts` 발행과 Admin/Mobile 소비 전환 기준
- [보안/접근통제 정책](policy/security-access-control-policy.md) - 관리자 역할·권한 매트릭스와 인증/인가 단일 SoT
- [결제 운영 정책](policy/payment-ops-policy.md) - 결제 검증/환불/정산 운영 기준
- [매칭 운영 정책](policy/matching-ops-policy.md) - 매칭 상태/키/일정과 클럽매니저 예약 운영 범위 단일화
- [회원 심사 단일 정책](policy/member-review-policy.md) - 가입/설정/Admin/Mobile 심사 기준 단일화
- [회원가입 응답 계약](policy/signup-response-contract.md) - Envelope `ok`/`data` 역할 분리 최종안
- [푸시알림 운영 정책](policy/push-notification-policy.md) - 타입/발송조건/장애대응 기준
- [마케팅 앱 이벤트 정책](policy/marketing-app-events-policy.md) - Meta/Appsflyer 앱 이벤트 기록 기준
- [데이터 거버넌스 정책](policy/data-governance-policy.md) - 분류/보관/접근/삭제 통제
- [테스트용 개발 데이터 정책](policy/development-test-data-policy.md) - 개발계 합성 데이터 생성/검증/reset 기준
- [서비스 용어 정책](policy/service-terminology-policy.md) - 클럽/클럽매니저 UI 노출명과 신규 N:N 그룹미팅 식별자 전환 기준
- [코드 리뷰 정책](policy/code-review-policy.md) - PR 작성 및 리뷰 가이드
- [DB Migration Gate 정책](policy/db-migration-gate-policy.md) - DBM-GATE 인덱스/판정 규칙
- [논리 데이터 모델 정책](policy/logical-data-model-policy.md) - 공개 논리 모델 taxonomy와 private 매핑
- [문서 거버넌스 정책](policy/document-governance-policy.md) - 문서 역할, SoT, 동기화 기준
- [엔지니어링 가드레일](policy/engineering-guardrails.md) - 스펙 고정, Optional/가드, 네이밍
- [테스트/CI 전략](policy/testing-strategy.md) - 레포별 테스트 및 CI 기준

### Flows

- [Kakao 네이티브 로그인 플로우](flows/cross-project/kakao-native-login-flow.md) - React Native 브리지, Kakao 네이티브 SDK, Coupler API 토큰 재검증
- [매칭 플로우](flows/cross-project/matching-flow.md) - 매칭 카드 → 만남
- [API 계약 변경 모바일 릴리즈 플로우](flows/cross-project/api-contract-mobile-release-flow.md) - API 명세 변경 시 Store 출시 activation 강제 업데이트 또는 NextPush mandatory를 포함한 단일 최종 계약 배포 절차
- [API 계약 cutover 최종 리뷰](flows/cross-project/api-contract-cutover-final-review.md) - API/Admin/Mobile 동시 배포 계약 묶음의 검증 결과와 merge 조건
- [릴리즈 자동화 파이프라인](flows/cross-project/release-automation-pipeline.md) - 릴리즈 gate 순서와 read-only preflight 자동화 기준
- [운영 배포 명령어 런북](flows/cross-project/production-deploy-command-runbook.md) - 배포 범위별 DB/API/Admin/Mobile/Tag 실행 명령어
- [Admin 운영 배포 런북](flows/cross-project/admin-web-production-deploy-flow.md) - `coupler-admin-web` 운영 정적 배포 절차
- [테스트용 개발 데이터 운영 흐름](flows/cross-project/development-test-data-flow.md) - plan/apply/verify/coverage/reset 절차
- [개발계 cron 운영 흐름](flows/cross-project/development-cron-operation-flow.md) - 인증·외부 발송 차단·scheduler 설치·rollback 절차
- [Firebase Apple SDK 설치 경로 전환 흐름](flows/cross-project/firebase-apple-sdk-migration-flow.md) - CocoaPods 종료 대응 실행·검증·rollback 절차

### Releases

- [2.2.7 릴리스 실행 기록](releases/v2.2.7.md) - contracts 0.1.5 기준 API/Admin/Mobile NextPush 운영 배포 기록
- [2.2.6 릴리스 실행 기록](releases/v2.2.6.md) - contracts package 0.1.2 발행과 Admin/Mobile 소비자 dependency bump 준비 기록
- [2.2.5 릴리스 실행 기록](releases/v2.2.5.md) - API/Admin/Mobile 공통 응답 contract cutover 진행 기록
- [2.2.4 릴리스 실행 기록](releases/v2.2.4.md) - Mobile Store 2.2.1 (100) 배포 진행 기록
- [2.2.3 릴리스 실행 기록](releases/v2.2.3.md) - Admin/API 운영 배포와 Mobile Store 릴리스 분리 기록
- [2.2.2 릴리스 실행 기록](releases/v2.2.2.md) - API 프로필 사진 승인 알림 hotfix와 Mobile NextPush 운영 배포 완료 기록
- [2.2.1 릴리스 실행 기록](releases/v2.2.1.md) - API 삭제 댓글 표시 정체성 hotfix 운영 배포/태그 완료 기록
- [2.2.0 릴리스 실행 기록](releases/v2.2.0.md) - API 운영 태그, Mobile Store 승인 기준점, 제출 마커 증빙 이관 기록
- [2.1.0 릴리스 실행 기록](releases/v2.1.0.md) - API/Admin 운영 태그와 Mobile Store 심사 대기 상태 기록
- [2.0.0 릴리스 실행 기록](releases/v2.0.0.md) - docs 선행 Release Note 생성부터 RDS contract/drop, 서비스 최종 태그까지

### Setup

- [개발환경 구성](README.md)
