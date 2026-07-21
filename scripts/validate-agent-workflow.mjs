import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import MarkdownIt from "markdown-it";

const markdownParser = new MarkdownIt({ html: true });
const moduleRoot = path.dirname(fileURLToPath(import.meta.url));
const lifecycleRegistry = JSON.parse(
  fs.readFileSync(path.join(moduleRoot, "..", "document-lifecycle-registry.json"), "utf8"),
);
const activeLifecycleDocuments = lifecycleRegistry.documents.filter(
  (entry) => entry.lifecycle === "active",
);
const activeLifecycleDocumentsById = new Map(
  activeLifecycleDocuments.map((entry) => [entry.id, entry]),
);
const REQUIRED_CORE_PATHS = activeLifecycleDocuments
  .filter((entry) => entry.routing === "core")
  .sort((a, b) => a.coreOrder - b.coreOrder)
  .map((entry) => `content/${entry.path}`);

const REQUIRED_REQUEST_CONTRACTS = [
  {
    type: "설명·상태 확인",
    action: "근거를 read-only로 확인한다",
    completion: "확인 범위, 근거, 결론 보고",
  },
  {
    type: "진단",
    action: "원인, 영향, 재현 경로를 확인한다",
    completion: "원인과 근거 보고; 수정은 별도 요청이 있을 때만 수행",
  },
  {
    type: "설계·계획",
    action: "기준 SoT와 대안을 검토한다",
    completion: "포함·제외 범위, 책임 경계, 검증·rollback, 계획 최종 리뷰",
  },
  {
    type: "변경·구현",
    action: "요청 범위의 코드·문서·테스트를 수정한다",
    completion: "구현, 문서 동기화, 마지막 변경 이후 독립 리뷰·검증·최종 판정",
  },
  {
    type: "리뷰",
    action: "대상 diff·문서·커밋·PR을 read-only로 평가한다",
    completion: "근거 있는 Finding 또는 `No Findings` 판정; 요청 없이는 수정 금지",
  },
  {
    type: "운영·관찰",
    action: "승인된 운영 동작 또는 상태 관찰만 수행한다",
    completion: "명시된 종료 조건, 결과, 잔여 위험 보고",
  },
];

const REQUIRED_REQUEST_RULES = [
  "`변경·구현` 요청은 계획 작성만으로 완료하지 않는다. 안전한 범위에서 구현, 문서 동기화, 마지막 변경 이후 독립 리뷰와 검증, 최종 판정까지 계속한다.",
  "`설계·계획`, `리뷰`, `진단`은 파일 변경 권한을 포함하지 않는다. 사용자가 같은 요청에서 변경까지 명시한 경우에만 `변경·구현`을 함께 적용한다.",
];

const REQUIRED_BASIC_RULES = [
  "Core 4 전체 강제 열람은 모든 요청에 유지한다. 요청이 단순하거나 read-only라는 이유로 생략하지 않는다.",
  "Core 열람은 작업 기준을 현재 컨텍스트에 고정하는 안전 Gate다. 요약문, 이전 세션 기록, 상위 에이전트의 전달 내용으로 대체하지 않는다.",
  "새 세션, 컨텍스트 유실 후 재진입, 독립 작업을 위임받은 에이전트는 각각 Core 4를 직접 다시 읽는다.",
  "작업은 `요청 유형`, `권한 집합`, `작업 범위`, `실행 단계`를 서로 독립된 축으로 판정한다. 한 축의 값으로 다른 축의 권한이나 완료 조건을 추론하지 않는다.",
  "요청을 분류할 수 없거나 관련 단일 SoT를 확정할 수 없으면 파일을 수정하지 않고 `스펙 공백`과 필요한 확인 범위를 보고한다.",
];

const REQUIRED_PERMISSION_SIGNALS = [
  "외부 의존성 추가·대체",
  "branch/worktree 생성",
  "commit",
  "push",
  "PR 생성",
  "reviewer 변경",
  "deploy",
  "force push·삭제",
];

const REQUIRED_PERMISSION_RULES = [
  "기본 권한은 요청 유형의 종료 조건을 달성하는 데 필요한 read-only 또는 workspace 파일 변경까지다.",
  "테스트 파일 변경 권한은 상단 `테스트 파일 변경` Gate를 따른다.",
  "외부 의존성 추가·대체와 이를 위한 manifest·lockfile 수정 또는 install 명령은 일반 workspace 파일 변경 권한에 포함되지 않는다.",
  "[엔지니어링 가드레일](policy/engineering-guardrails.md)의 `외부 의존성 변경 사전 검토` 근거를 먼저 제시하고 작업 요청자의 명시적 승인을 받아야 한다. 기능 구현·리팩터링 같은 일반 변경 요청은 외부 의존성 승인으로 해석하지 않으며, package 또는 적용 범위가 달라지면 다시 승인받는다.",
  "branch/worktree 생성, commit, push, PR 생성, reviewer 변경, deploy, force push·삭제는 서로 독립된 권한이다.",
  "사용자가 명시하지 않은 외부 상태 변경 권한을 작업의 자연스러운 후속 단계라는 이유로 추가하지 않는다.",
  "`수정하고 PR 올려줘`는 수정·검증·commit·push·PR 생성 권한을 포함하지만 reviewer 변경·deploy 권한을 포함하지 않는다.",
  "권한이 없는 단계 직전에는 현재 완료 상태와 필요한 추가 권한을 보고하고 멈춘다.",
];

const REQUIRED_ROUTE_FIELDS = [
  "요청=<유형>",
  "레포=<대상>",
  "산출물=<종류>",
  "도메인=<범위>",
  "위험=<표면>",
  "권한=<집합>",
  "필수문서=<경로>",
  "완료=<종료 조건>",
];

const REQUIRED_ROUTE_CONTRACT =
  "ROUTE: 요청=<유형> | 레포=<대상> | 산출물=<종류> | 도메인=<범위> | 위험=<표면> | 권한=<집합> | 필수문서=<경로> | 완료=<종료 조건>";

const REQUIRED_SCOPE_RULES = [
  "대상 레포와 기존 branch/worktree/PR",
  "산출물 종류: 코드, 테스트, 문서, 설정, DB migration, 릴리스 기록",
  "제품·운영 도메인과 관련 architecture/policy/FSM/flow",
  "위험 표면: API 계약, DB, 권한·보안, 결제, 푸시, 개인정보, 배포, 모바일 릴리즈, 다중 레포",
  "사용자 요청의 포함 범위와 명시적 제외 범위",
  "같은 요청, 연관 PR·이슈, 도메인 또는 SoT를 다루는 적합한 기존 branch/worktree/PR이 있으면 새 작업을 만들지 않고 해당 작업에서 계속한다. 리뷰·상태 확인만 요청받았으면 새 작업을 만들지 않는다.",
  "기존 작업이 부적합해 대체 작업이 필요하면 근거와 이관·정리 계획을 먼저 보고하고 사용자 승인을 받는다. 같은 범위의 활성 PR을 병렬로 유지하지 않는다.",
  "read-only 탐색을 마치고 첫 파일 변경·branch/worktree 생성·외부 작업 전에 아래 형식으로 실행 계약을 기록한다. 단순 설명·상태 확인은 같은 항목을 최종 보고에 포함할 수 있다.",
];

const REQUIRED_CLOSURE_CONTRACT = `1. 요청 문구와 변경 대상에서 도메인·위험 표면을 식별한다.
2. \`문서 인덱스\`에서 가장 가까운 architecture 또는 policy를 연다.
3. 선택한 문서 상단의 \`충돌 시 우선 문서\`와 본문에서 단일 SoT·상위 규범으로 지정한 직접 링크를 연다.
4. \`관련 문서\` 절이 있으면 직접 연결된 policy, architecture, FSM, flow, technical-debt를 확인한다. 없으면
   본문의 직접 규범 링크를 같은 범위로 확인한다.
5. 각 판정 책임이 하나의 단일 SoT에 연결될 때까지 2~4를 반복한다.
6. 충돌, 누락, 불명확한 기대 동작이 있으면 구현보다 규범 문서를 먼저 확정한다.

최종 필수 열람 집합은 \`Core 4 + 고위험 신호 라우팅 문서 + 도메인 SoT 폐쇄 탐색 결과\`다.
문서 링크가 존재한다는 사실만으로 열람 완료로 간주하지 않는다.`;

const REQUIRED_HIGH_RISK_COMPOSITION_RULES = [
  "표에 없는 도메인은 비적용으로 추론하지 않고 `관련 SoT 폐쇄 탐색`을 적용한다.",
  "여러 신호가 함께 있으면 해당 행의 문서를 합집합으로 읽고 판정 책임별 우선순위를 고정한다.",
];

const REQUIRED_HIGH_RISK_ROUTES = lifecycleRegistry.routes
  .filter((route) => route.lifecycle === "active")
  .map((route) => ({
    signal: route.signal,
    targetSource: route.targetSource,
    targets: route.targets.map((targetId) => {
      const target = activeLifecycleDocumentsById.get(targetId);
      return {
        headings: target.requiredHeadings ?? [],
        path: `content/${target.path}`,
      };
    }),
  }));

const REQUIRED_HEADING_TARGETS = activeLifecycleDocuments
  .filter((entry) => entry.requiredHeadings)
  .map((entry) => ({
    headings: entry.requiredHeadings,
    path: `content/${entry.path}`,
  }));

const REQUIRED_STATE_CONTRACTS = [
  { state: "BOOT", action: "Core 4를 전체 열람하고 ACK/EVIDENCE를 출력한다." },
  {
    state: "CONTINUITY",
    action: "변경·branch·PR 작업이면 같은 범위의 기존 worktree, branch, PR을 먼저 확인한다.",
  },
  {
    state: "CLASSIFY",
    action: "요청 유형, 권한 집합, 작업 범위, 위험 표면을 서로 분리해 고정한다.",
  },
  { state: "ROUTE", action: "관련 SoT 폐쇄 탐색을 완료하고 추가 필수 문서를 읽는다." },
  {
    state: "BASELINE",
    action: "현재 코드·문서·Git·외부 상태와 사용자 변경을 read-only로 확인한다.",
  },
  {
    state: "PLAN",
    action:
      "목표, 제외 범위, 기준 문서, 영향 범위, 검증, rollback을 고정한다. 신중/안전 지시는 계획 자체를 먼저 리뷰한다.",
  },
  {
    state: "EXECUTE",
    action: "요청 유형과 권한 집합 안에서만 작성·수정·운영 작업을 수행한다.",
  },
  {
    state: "REVIEW",
    action:
      "마지막 파일 변경 이후 같은 범위로 독립 코드 리뷰 또는 문서 안정성 평가를 수행한다. 열린 Finding이 0건이면 최종 판정 전 체크포인트인 `열린 Finding 0건·검증 대기`를 기록한다.",
  },
  {
    state: "VERIFY",
    action:
      "체크포인트와 동일한 최종 후보에 대해 적용 테스트/CI, 문서 동기화, 수동·운영 검증을 수행한다. 로컬 표준 통합 품질 게이트는 [테스트/CI 전략](policy/testing-strategy.md)의 후보별 1회 원칙을 따른다.",
  },
  {
    state: "FINALIZE",
    action: "동일 최종 후보의 독립 리뷰와 적용 검증이 모두 유효할 때만 최종 판정을 확정한다.",
  },
  {
    state: "EXTERNAL_ACTION",
    action: "명시 권한이 있을 때만 commit, push, PR, reviewer, deploy Gate를 각각 적용한다.",
  },
  {
    state: "REPORT",
    action: "범위, 변경, 검증, 문서 동기화, 열린 Finding, 최종 판정, 잔여 위험을 보고한다.",
  },
];

const REQUIRED_STATE_EXIT_RULES = [
  "`REVIEW`, `VERIFY` 또는 `FINALIZE` 뒤 파일이 바뀌면 이전 리뷰·검증·최종 판정은 모두 만료된다. 새 최종 후보로 `REVIEW -> VERIFY -> FINALIZE`를 다시 수행한다.",
  "Finding이 있으면 `원인 수정 -> 동일 범위 독립 재리뷰`를 반복한다. 열린 Finding이 0건이 되기 전에는 로컬 표준 통합 품질 게이트를 실행하지 않는다.",
  "검증 실패는 `No Findings`로 판정하지 않는다. 파일 수정이 필요하면 새 최종 후보로 돌아가고, 후보가 바뀌지 않은 환경 실패의 재시도는 [테스트/CI 전략](policy/testing-strategy.md)의 예외 기준을 따른다.",
  "요청 범위 밖 기존 부채는 근거와 함께 분리하고 완료를 위해 임의로 확장하지 않는다.",
];

const REQUIRED_LOCAL_FINAL_CANDIDATE_CONTRACT = `- \`최종 후보\`는 비교 baseline, 리뷰 범위의 파일 집합과 내용이 마지막 파일 변경 이후 동일한 상태다. 다중 레포
  변경은 영향받은 각 레포의 후보를 같은 변경 묶음으로 고정한다.
- [코드 리뷰 정책](code-review-policy.md)의 독립 최종 리뷰에서 열린 Finding이 0건이고
  \`열린 Finding 0건·검증 대기\` 체크포인트가 기록된 뒤에만 해당 레포의 표준 통합 품질 게이트를 실행한다.
- 동일한 최종 후보에서는 영향받은 각 레포의 표준 통합 품질 게이트를 1회만 시작한다. 통합 명령에 포함된
  \`lint\`, \`typecheck\`, \`format\`, \`test\`를 관행적으로 먼저 각각 실행한 뒤 같은 통합 명령으로 반복하지 않는다.
- 아래 표적 검증은 표준 통합 품질 게이트와 판정 대상이 다를 때만 별도로 허용한다.
    - 최초 실패 재현
    - 새로 추가·갱신한 테스트의 red/green 확인
    - 통합 품질 게이트 실패 원인 격리
    - 표준 통합 명령에 포함되지 않은 도메인 정책의 필수 검사
- 표적 검증은 입력, 파일 내용 또는 확인할 실패 책임이 달라지지 않으면 같은 명령을 반복하지 않는다. 표적 검증
  결과로 표준 통합 품질 게이트를 대체하지 않는다.
- 통합 품질 게이트가 코드·문서·설정 문제로 실패해 파일을 수정하면 기존 후보와 리뷰 체크포인트는 만료된다.
  새 최종 후보의 독립 리뷰에서 열린 Finding이 0건이 된 뒤 표준 통합 품질 게이트를 새로 1회 실행한다.
- 후보가 바뀌지 않은 비코드 환경 실패는 실패 원인과 앞서 통과한 하위 Gate를 기록하고 실패하거나 실행되지 않은
  하위 Gate만 재시도한다. 같은 통합 명령 전체를 근거 없이 처음부터 다시 실행하지 않는다.
- 검증 명령이 리뷰 범위의 파일을 변경하면 성공 여부와 관계없이 후보가 바뀐 것으로 판정하고 독립 리뷰부터
  다시 수행한다.`;

const REQUIRED_REANCHOR_CONTRACTS = [
  { phase: "세션 시작", requirement: "Core 4 전체" },
  { phase: "설계·구현 전", requirement: "관련 도메인 SoT 전체" },
  {
    phase: "마지막 파일 변경 후",
    requirement: "적용된 Core와 도메인 정책의 검증·Exit Gate 절",
  },
  { phase: "문서 변경 후", requirement: "문서 거버넌스 정책과 적용 템플릿" },
  { phase: "commit 전", requirement: "코드 리뷰, Git 브랜치, 커밋 정책" },
  { phase: "push·PR 전", requirement: "코드 리뷰 정책의 Push 전 자체 리뷰 Gate" },
  {
    phase: "deploy 전",
    requirement: "release 정책, 적용 runbook, DB 변경 시 DB Migration Gate",
  },
  {
    phase: "컨텍스트 유실, 새 세션, 독립 에이전트 위임",
    requirement: "Core 4 전체 재열람",
  },
];

const REQUIRED_COMPLETION_CONTRACTS = [
  {
    scope: "문서 작성·수정",
    evidence: "적용 템플릿, 직접 연결 문서, 문서 동기화, docs 검증, 문서 안정성 최종 판정",
  },
  {
    scope: "policy 변경",
    evidence: "대상 정책 전체, 정방향·역방향 규범 참조, 책임·우선순위, 생명주기, Composition Gate",
  },
  {
    scope: "설계·계획",
    evidence: "포함·제외, 기준 SoT, 책임 경계, 대안, 검증, rollback, 계획 최종 리뷰",
  },
  {
    scope: "코드 변경",
    evidence: "테스트 변경 판정, 적용 품질 Gate, 문서 동기화, 7개 관점 점검, 마지막 변경 이후 최종 판정",
  },
  {
    scope: "코드·문서 리뷰",
    evidence: "고정된 리뷰 범위, 적용 기준, 근거 있는 Finding, 검증 상태, 최종 판정",
  },
  {
    scope: "외부 작업",
    evidence: "각 권한별 사전 Gate, 실행 결과, 실패·rollback 기준",
  },
];

const REQUIRED_BOOTSTRAP_TEXT = [
  "# AGENTS (워크스페이스 전용)",
  "docs/content/AGENTS.md",
  "항상 워크스페이스 루트를 열고 작업한다.",
  "개별 레포지토리를 단독으로 열지 않는다.",
  "## 기존 작업 우선 게이트",
  "같은 범위의 활성 PR을 병렬로 유지하지 않는다.",
  "## PR reviewer 요청 금지 게이트",
  "reviewer 개인 또는 팀을 별도로 명시해 승인",
];

const REQUIRED_BOOTSTRAP_BLOCK = `# AGENTS (워크스페이스 전용)

이 워크스페이스는 \`docs/content/AGENTS.md\`를 최우선으로 따른다.
항상 워크스페이스 루트를 열고 작업한다.
개별 레포지토리를 단독으로 열지 않는다.

## 기존 작업 우선 게이트

- 브랜치, 워크트리, PR을 만들기 전에 대상 레포의 기존 워크트리, 로컬·원격 브랜치, 열린 PR을 확인한다.
  리뷰나 상태 확인만 요청받았으면 새 작업을 만들지 않는다.
- 같은 요청, 연관 PR·이슈, 도메인 또는 SoT를 다루는 적합한 기존 작업이 있으면 세션이 바뀌어도 해당
  브랜치·워크트리·PR에서 계속한다.
- 기존 구조가 부적합해 대체 작업이 필요하면 관련 Git·리뷰 정책에 따라 근거와 이관·정리 계획을 먼저
  보고하고 사용자 승인을 받는다. 같은 범위의 활성 PR을 병렬로 유지하지 않는다.

## PR reviewer 요청 금지 게이트

- 브랜치 push, PR 생성·업데이트, "PR 올려줘" 요청은 GitHub reviewer 요청·지정 권한을 포함하지 않는다.
- 사용자가 reviewer 개인 또는 팀을 별도로 명시해 승인하기 전에는 \`Request reviewer\`를 실행하거나
  reviewer를 추가·재요청·교체·제거하지 않는다. 적합한 reviewer를 에이전트가 임의로 추정해서도 안 된다.
- 기존 reviewer 상태의 read-only 확인은 허용하지만, 사용자 승인 없이 reviewer 상태를 변경하지 않는다.`;

const REQUIRED_CORE_EVIDENCE = `EVIDENCE: ${REQUIRED_CORE_PATHS.map(
  (corePath) => `${corePath}:<line>`,
).join(", ")}`;

const REQUIRED_CORE_SEMANTIC_LIST_ITEMS = [
  { level: 1, text: "새 세션 시작 전에는 아래 Core 4개만 필수 열람한다" },
  ...REQUIRED_CORE_PATHS.map((corePath) => ({ level: 3, text: `\`${corePath}\`` })),
  { level: 1, text: "새 세션 첫 응답은 아래 형식을 반드시 사용한다" },
  { level: 3, text: "`ACK: CORE@YYYY-MM-DD CRP@YYYY-MM-DD`" },
  { level: 3, text: `\`${REQUIRED_CORE_EVIDENCE}\`` },
  { level: 3, text: "`CRP`는 `content/policy/code-review-policy.md`를 의미한다" },
  { level: 3, text: "`YYYY-MM-DD`는 세션 날짜를 사용한다" },
  {
    level: 1,
    text: "ACK/EVIDENCE 출력 전에는 필수 문서 열람 외 명령 실행/코드 작성/수정을 시작하지 않는다",
  },
];

const REQUIRED_REVIEWER_SEMANTIC_LIST_ITEMS = [
  {
    level: 1,
    text: '브랜치 push, PR 생성·업데이트, "PR 올려줘" 요청은 GitHub reviewer 요청·지정 권한을 포함하지 않는다',
  },
  {
    level: 3,
    text: "사용자가 reviewer 개인 또는 팀을 별도로 명시해 승인하기 전에는 `Request reviewer`를 실행하거나 reviewer를 추가·재요청·교체·제거하지 않는다",
  },
  {
    level: 3,
    text: "적합한 reviewer를 에이전트가 임의로 추정하지 않으며, 기존 reviewer 상태를 read-only로 확인하더라도 사용자 승인 없이 변경하지 않는다",
  },
];

const REQUIRED_SECTIONS = [
  [2, "최소 운영 규칙"],
  [2, "작업 실행 제어"],
  [3, "기본 원칙"],
  [3, "요청 유형과 종료 조건"],
  [3, "권한 집합"],
  [3, "작업 범위 판정"],
  [3, "관련 SoT 폐쇄 탐색"],
  [3, "고위험 신호 라우팅"],
  [3, "작업 상태 머신"],
  [3, "단계별 기준 재고정"],
  [3, "작업별 필수 완료 증빙"],
  [2, "문서 인덱스"],
];

export const validateAgentWorkflow = ({
  agentsSource,
  readmeSource,
  testingStrategySource,
  routeExists = () => true,
  readRouteSource = () => "",
}) => {
  const errors = [];

  for (const [level, title] of REQUIRED_SECTIONS) {
    const count = countExactHeadings(agentsSource, level, title);
    if (count !== 1) {
      errors.push(`content/AGENTS.md의 '${title}' 절은 정확히 1개여야 합니다.`);
    }
  }

  const basicsSection = extractSection(agentsSource, 3, "기본 원칙");
  const minimumRulesSection = extractSection(agentsSource, 2, "최소 운영 규칙");
  validateSemanticListSequence(
    minimumRulesSection,
    REQUIRED_CORE_SEMANTIC_LIST_ITEMS,
    "Core 의미 구조",
    errors,
  );
  requireText(
    basicsSection,
    [
      "Core 4 전체 강제 열람은 모든 요청에 유지한다",
      "요약문, 이전 세션 기록, 상위 에이전트의",
      "전달 내용으로 대체하지 않는다",
      "컨텍스트 유실 후 재진입",
      "서로 독립된 축",
      "다른 축의 권한이나 완료 조건을 추론하지 않는다",
      "파일을 수정하지 않고 `스펙 공백`",
    ],
    "기본 실행 원칙",
    errors,
  );
  validateExactRules(
    parseTopLevelBulletItems(basicsSection),
    REQUIRED_BASIC_RULES,
    "기본 실행 원칙",
    errors,
  );
  validateNormalizedContract(
    basicsSection,
    renderBulletRules(REQUIRED_BASIC_RULES),
    "기본 실행 원칙 절 전체",
    errors,
  );
  validateSemanticListSequence(
    minimumRulesSection,
    REQUIRED_REVIEWER_SEMANTIC_LIST_ITEMS,
    "content/AGENTS.md reviewer 의미 구조",
    errors,
  );

  validateCoreContract(agentsSource, errors);

  const requestSection = extractSection(agentsSource, 3, "요청 유형과 종료 조건");
  const actualRequestContracts = parseRequestContracts(requestSection, errors);
  validateRequestContracts(actualRequestContracts, errors);
  validateExactRules(
    parseTopLevelBulletItems(requestSection),
    REQUIRED_REQUEST_RULES,
    "요청 유형 보조 규칙",
    errors,
  );
  validateNormalizedContract(
    requestSection,
    renderRequestSection(),
    "요청 유형 절 전체",
    errors,
  );

  const permissionSection = extractSection(agentsSource, 3, "권한 집합");
  requireText(
    permissionSection,
    [...REQUIRED_PERMISSION_SIGNALS, "서로 독립된 권한"],
    "권한 집합",
    errors,
  );
  validateExactRules(
    parseTopLevelBulletItems(permissionSection),
    REQUIRED_PERMISSION_RULES,
    "권한",
    errors,
  );
  validateNormalizedContract(
    permissionSection,
    renderBulletRules(REQUIRED_PERMISSION_RULES),
    "권한 절 전체",
    errors,
  );

  const scopeSection = extractSection(agentsSource, 3, "작업 범위 판정");
  requireText(scopeSection, REQUIRED_ROUTE_FIELDS, "ROUTE 실행 계약", errors);
  validateNormalizedContract(
    extractInlineCodeContract(scopeSection, "ROUTE:"),
    REQUIRED_ROUTE_CONTRACT,
    "ROUTE 실행",
    errors,
  );
  validateExactRules(
    parseTopLevelBulletItems(scopeSection),
    REQUIRED_SCOPE_RULES,
    "작업 범위",
    errors,
  );
  requireText(
    scopeSection,
    [
      "적합한 기존 branch/worktree/PR이 있으면",
      "리뷰·상태 확인만 요청받았으면 새 작업을 만들지 않는다",
      "같은 범위의 활성 PR을 병렬로 유지하지 않는다",
    ],
    "기존 작업 연속성",
    errors,
  );
  validateNormalizedContract(
    scopeSection,
    renderScopeSection(),
    "작업 범위 절 전체",
    errors,
  );
  const closureSection = extractSection(agentsSource, 3, "관련 SoT 폐쇄 탐색");
  requireText(
    closureSection,
    [
      "충돌 시 우선 문서",
      "단일 SoT·상위 규범으로 지정한 직접 링크",
      "관련 문서` 절이 있으면",
      "없으면",
      "본문의 직접 규범 링크",
      "각 판정 책임이 하나의 단일 SoT에 연결될 때까지",
    ],
    "관련 SoT 폐쇄 탐색",
    errors,
  );
  validateNormalizedContract(
    closureSection,
    REQUIRED_CLOSURE_CONTRACT,
    "관련 SoT 폐쇄 탐색",
    errors,
  );

  const highRiskSection = extractSection(agentsSource, 3, "고위험 신호 라우팅");
  const actualHighRiskRoutes = parseHighRiskRoutes(highRiskSection, errors);
  validateHighRiskRouteMappings(actualHighRiskRoutes, errors);
  requireText(
    highRiskSection,
    ["표에 없는 도메인은 비적용으로 추론하지 않고", "해당 행의 문서를 합집합으로 읽고"],
    "고위험 신호 합성 규칙",
    errors,
  );
  validateExactRules(
    parseTopLevelBulletItems(highRiskSection),
    REQUIRED_HIGH_RISK_COMPOSITION_RULES,
    "고위험 신호 합성 규칙",
    errors,
  );
  validateNormalizedContract(
    highRiskSection,
    renderHighRiskSection(),
    "고위험 신호 라우팅 절 전체",
    errors,
  );
  validateRouteTargets(actualHighRiskRoutes, routeExists, readRouteSource, errors);

  const stateSection = extractSection(agentsSource, 3, "작업 상태 머신");
  validateStateContracts(parseStateContracts(stateSection), errors);
  requireText(
    stateSection,
    [
      "이전 리뷰·검증·최종 판정은 모두 만료된다",
      "원인 수정 -> 동일 범위 독립 재리뷰",
      "열린 Finding이 0건이 되기 전에는 로컬 표준",
      "통합 품질 게이트를 실행하지 않는다",
      "검증 실패는 `No Findings`로 판정하지 않는다",
      "요청 범위 밖 기존 부채",
    ],
    "작업 상태 머신 Exit Gate",
    errors,
  );
  validateExactRules(
    parseTopLevelBulletItems(stateSection),
    REQUIRED_STATE_EXIT_RULES,
    "작업 상태 머신 Exit Gate",
    errors,
  );
  validateNormalizedContract(
    stateSection,
    renderStateSection(),
    "작업 상태 머신 절 전체",
    errors,
  );

  const localFinalCandidateSection = extractSection(
    testingStrategySource,
    3,
    "로컬 최종 후보 검증",
  );
  if (countExactHeadings(testingStrategySource, 3, "로컬 최종 후보 검증") !== 1) {
    errors.push("testing-strategy.md의 '로컬 최종 후보 검증' 절은 정확히 1개여야 합니다.");
  }
  validateNormalizedContract(
    localFinalCandidateSection,
    REQUIRED_LOCAL_FINAL_CANDIDATE_CONTRACT,
    "로컬 최종 후보 검증 절 전체",
    errors,
  );

  const reanchorSection = extractSection(agentsSource, 3, "단계별 기준 재고정");
  validateLabeledContracts(
    parseLabeledBulletContracts(reanchorSection),
    REQUIRED_REANCHOR_CONTRACTS,
    { context: "단계별 기준 재고정", labelKey: "phase", valueKey: "requirement" },
    errors,
  );
  validateNormalizedContract(
    reanchorSection,
    renderLabeledBulletContracts(REQUIRED_REANCHOR_CONTRACTS, "phase", "requirement"),
    "단계별 기준 재고정 절 전체",
    errors,
  );

  const completionSection = extractSection(agentsSource, 3, "작업별 필수 완료 증빙");
  validateLabeledContracts(
    parseLabeledBulletContracts(completionSection),
    REQUIRED_COMPLETION_CONTRACTS,
    { context: "작업별 완료 증빙", labelKey: "scope", valueKey: "evidence" },
    errors,
  );
  validateNormalizedContract(
    completionSection,
    renderLabeledBulletContracts(REQUIRED_COMPLETION_CONTRACTS, "scope", "evidence"),
    "작업별 완료 증빙 절 전체",
    errors,
  );

  requireText(readmeSource, REQUIRED_BOOTSTRAP_TEXT, "README workspace bootstrap", errors);
  if (
    normalizeWhitespace(extractReadmeBootstrap(readmeSource)) !==
    normalizeWhitespace(REQUIRED_BOOTSTRAP_BLOCK)
  ) {
    errors.push("README workspace bootstrap 계약이 다릅니다.");
  }
  requireText(
    agentsSource,
    [
      "같은 범위의 활성 PR을 병렬로 유지하지 않는다",
      "사용자가 reviewer 개인 또는 팀을 별도로 명시해 승인",
    ],
    "content/AGENTS.md bootstrap 안전 Gate",
    errors,
  );
  validateNormalizedContract(
    extractRange(
      agentsSource,
      '- 브랜치 push, PR 생성·업데이트, "PR 올려줘" 요청은',
      '- 사용자가 "관련 워크트리와 브렌치 정리해줘"',
    ),
    renderSemanticListItems(REQUIRED_REVIEWER_SEMANTIC_LIST_ITEMS),
    "content/AGENTS.md reviewer 안전 Gate",
    errors,
  );

  return errors;
};

function validateCoreContract(source, errors) {
  const startMarker = "- 새 세션 시작 전에는 아래 Core 4개만 필수 열람한다";
  const endMarker = "- 새 세션 첫 응답은 아래 형식을 반드시 사용한다";
  const start = source.indexOf(startMarker);
  const end = source.indexOf(endMarker);

  if (start === -1 || end === -1 || end <= start) {
    errors.push("Core 4 또는 새 세션 응답 계약을 찾을 수 없습니다.");
    return;
  }

  const coreSource = source.slice(start, end);
  const corePaths = [...coreSource.matchAll(/`(content\/[^`]+\.md)`/g)].map(
    (match) => match[1],
  );
  if (!sameArray(corePaths, REQUIRED_CORE_PATHS)) {
    errors.push(`Core 4는 다음 경로와 순서를 유지해야 합니다: ${REQUIRED_CORE_PATHS.join(", ")}`);
  }

  requireText(
    source,
    [
      "ACK: CORE@YYYY-MM-DD CRP@YYYY-MM-DD",
      REQUIRED_CORE_EVIDENCE,
      "ACK/EVIDENCE 출력 전에는 필수 문서 열람 외 명령 실행/코드 작성/수정을 시작하지 않는다",
    ],
    "Core ACK/EVIDENCE",
    errors,
  );
  validateNormalizedContract(
    extractRange(source, endMarker, "- 코드 리뷰 관련 답변은"),
    renderSemanticListItems(REQUIRED_CORE_SEMANTIC_LIST_ITEMS.slice(5)),
    "Core 응답",
    errors,
  );
}

function parseRequestContracts(source, errors) {
  return parseMarkdownTableRows(source, 3, "요청 유형", "요청 유형 계약", errors).map(
    ([type, action, completion]) => ({
      action,
      completion,
      type: stripInlineCode(type),
    }),
  );
}

function validateRequestContracts(actualContracts, errors) {
  const expectedTypes = REQUIRED_REQUEST_CONTRACTS.map((contract) => contract.type);
  const actualTypes = actualContracts.map((contract) => contract.type);
  if (!sameArray(actualTypes, expectedTypes)) {
    errors.push(`요청 유형은 다음 순서의 폐쇄형 값이어야 합니다: ${expectedTypes.join(", ")}`);
  }

  for (const expectedContract of REQUIRED_REQUEST_CONTRACTS) {
    const actualContract = actualContracts.find(
      (contract) => contract.type === expectedContract.type,
    );
    if (
      !actualContract ||
      actualContract.action !== expectedContract.action ||
      actualContract.completion !== expectedContract.completion
    ) {
      errors.push(`요청 유형 계약이 다릅니다: ${expectedContract.type}`);
    }
  }
}

function parseMarkdownTableRows(source, columnCount, header, context, errors) {
  const rows = [];
  let foundHeader = false;

  for (const line of source.split("\n")) {
    const trimmedLine = line.trim();
    if (!trimmedLine.startsWith("|") || !trimmedLine.endsWith("|")) {
      continue;
    }

    const cells = trimmedLine
      .slice(1, -1)
      .split("|")
      .map((cell) => normalizeWhitespace(cell));
    if (cells[0] === header) {
      foundHeader = true;
      continue;
    }
    if (cells.every((cell) => /^:?-+:?$/.test(cell))) {
      continue;
    }
    if (cells.length !== columnCount) {
      errors.push(`${context} 표의 열 수는 ${columnCount}개여야 합니다.`);
      continue;
    }
    rows.push(cells);
  }

  if (!foundHeader) {
    errors.push(`${context} 표 header가 없습니다: ${header}`);
  }
  return rows;
}

function parseTopLevelBulletItems(source) {
  const items = [];
  let currentIndex = -1;

  for (const line of source.split("\n")) {
    const bulletMatch = line.match(/^-\s+(.+)$/);
    if (bulletMatch) {
      items.push(bulletMatch[1]);
      currentIndex = items.length - 1;
      continue;
    }

    if (/^\s+-\s+/.test(line)) {
      currentIndex = -1;
      continue;
    }

    if (currentIndex !== -1 && /^\s{2,}\S/.test(line)) {
      items[currentIndex] += ` ${line.trim()}`;
      continue;
    }

    if (line.trim() !== "") {
      currentIndex = -1;
    }
  }

  return items.map(normalizeWhitespace);
}

function validateExactRules(actualRules, expectedRules, context, errors) {
  const normalizedExpectedRules = expectedRules.map(normalizeWhitespace);
  if (!sameArray(actualRules, normalizedExpectedRules)) {
    errors.push(`${context} 계약이 다릅니다.`);
  }
}

function validateNormalizedContract(actual, expected, context, errors) {
  if (normalizeWhitespace(actual) !== normalizeWhitespace(expected)) {
    errors.push(`${context} 계약이 다릅니다.`);
  }
}

function parseSemanticListItems(source) {
  const tokens = markdownParser.parse(source, {});
  const listItemStack = [];
  const items = [];

  for (const token of tokens) {
    if (token.type === "list_item_open") {
      listItemStack.push({ captured: false, level: token.level });
      continue;
    }
    if (token.type === "list_item_close") {
      listItemStack.pop();
      continue;
    }
    const currentItem = listItemStack.at(-1);
    if (token.type === "inline" && currentItem && !currentItem.captured) {
      items.push({ level: currentItem.level, text: normalizeWhitespace(token.content) });
      currentItem.captured = true;
    }
  }

  return items;
}

function validateSemanticListSequence(source, expectedItems, context, errors) {
  const actualItems = parseSemanticListItems(source);
  const firstExpected = expectedItems[0];
  const startIndex = actualItems.findIndex(
    (item) => item.level === firstExpected.level && item.text === firstExpected.text,
  );
  const actualSequence =
    startIndex === -1 ? [] : actualItems.slice(startIndex, startIndex + expectedItems.length);

  if (
    actualSequence.length !== expectedItems.length ||
    actualSequence.some(
      (item, index) =>
        item.level !== expectedItems[index].level || item.text !== expectedItems[index].text,
    )
  ) {
    errors.push(`${context} 계약이 실제 Markdown 목록 구조와 다릅니다.`);
  }
}

function renderSemanticListItems(items) {
  return items
    .map((item) => `${item.level === 1 ? "" : "    "}- ${item.text}`)
    .join("\n");
}

function renderBulletRules(rules) {
  return rules.map((rule) => `- ${rule}`).join("\n");
}

function renderMarkdownTable(headers, rows) {
  return [
    `| ${headers.join(" | ")} |`,
    `| ${headers.map(() => "---").join(" | ")} |`,
    ...rows.map((row) => `| ${row.join(" | ")} |`),
  ].join("\n");
}

function renderRequestSection() {
  const table = renderMarkdownTable(
    ["요청 유형", "기본 동작", "종료 조건"],
    REQUIRED_REQUEST_CONTRACTS.map((contract) => [
      `\`${contract.type}\``,
      contract.action,
      contract.completion,
    ]),
  );
  return `${table}\n\n${renderBulletRules(REQUIRED_REQUEST_RULES)}`;
}

function renderScopeSection() {
  return [
    "작업 시작 전에 아래 범위를 고정한다.",
    renderBulletRules(REQUIRED_SCOPE_RULES),
    `    - \`${REQUIRED_ROUTE_CONTRACT}\``,
  ].join("\n\n");
}

function renderHighRiskSection() {
  const table = renderMarkdownTable(
    ["변경·리뷰 신호", "추가 필수 문서"],
    REQUIRED_HIGH_RISK_ROUTES.map((route) => [route.signal, route.targetSource]),
  );
  return `${table}\n\n${renderBulletRules(REQUIRED_HIGH_RISK_COMPOSITION_RULES)}`;
}

function renderStateSection() {
  const states = REQUIRED_STATE_CONTRACTS.map(
    (contract, index) => `${index + 1}. \`${contract.state}\`: ${contract.action}`,
  ).join("\n");
  return [
    "모든 작업은 아래 순서를 사용한다. 비적용 단계는 생략하지 않고 근거 있는 `N/A`로 판정한다.",
    states,
    renderBulletRules(REQUIRED_STATE_EXIT_RULES),
  ].join("\n\n");
}

function renderLabeledBulletContracts(contracts, labelKey, valueKey) {
  return renderBulletRules(
    contracts.map((contract) => `${contract[labelKey]}: ${contract[valueKey]}`),
  );
}

function parseStateContracts(source) {
  const contracts = [];
  let currentContract = null;

  for (const line of source.split("\n")) {
    const stateMatch = line.match(/^\d+\. `([A-Z_]+)`: (.+)$/);
    if (stateMatch) {
      currentContract = { action: stateMatch[2], state: stateMatch[1] };
      contracts.push(currentContract);
      continue;
    }

    if (currentContract && /^\s{2,}\S/.test(line)) {
      currentContract.action += ` ${line.trim()}`;
      continue;
    }

    if (line.trim() !== "") {
      currentContract = null;
    }
  }

  return contracts.map((contract) => ({
    action: normalizeWhitespace(contract.action),
    state: contract.state,
  }));
}

function validateStateContracts(actualContracts, errors) {
  const expectedStates = REQUIRED_STATE_CONTRACTS.map((contract) => contract.state);
  const actualStates = actualContracts.map((contract) => contract.state);
  if (!sameArray(actualStates, expectedStates)) {
    errors.push(`작업 상태 머신 순서는 ${expectedStates.join(" -> ")}여야 합니다.`);
  }

  for (const expectedContract of REQUIRED_STATE_CONTRACTS) {
    const actualContract = actualContracts.find(
      (contract) => contract.state === expectedContract.state,
    );
    if (!actualContract || actualContract.action !== expectedContract.action) {
      errors.push(`작업 상태 계약이 다릅니다: ${expectedContract.state}`);
    }
  }
}

function parseLabeledBulletContracts(source) {
  return parseTopLevelBulletItems(source).map((item) => {
    const separatorIndex = item.indexOf(":");
    if (separatorIndex === -1) {
      return { label: item, value: "" };
    }
    return {
      label: normalizeWhitespace(item.slice(0, separatorIndex)),
      value: normalizeWhitespace(item.slice(separatorIndex + 1)),
    };
  });
}

function validateLabeledContracts(
  actualContracts,
  expectedContracts,
  { context, labelKey, valueKey },
  errors,
) {
  const expectedLabels = expectedContracts.map((contract) => contract[labelKey]);
  const actualLabels = actualContracts.map((contract) => contract.label);
  if (!sameArray(actualLabels, expectedLabels)) {
    errors.push(`${context} 순서는 다음과 같아야 합니다: ${expectedLabels.join(", ")}`);
  }

  for (const expectedContract of expectedContracts) {
    const label = expectedContract[labelKey];
    const actualContract = actualContracts.find((contract) => contract.label === label);
    if (!actualContract) {
      errors.push(`${context}에 필수 값이 없습니다: ${label}`);
    } else if (actualContract.value !== expectedContract[valueKey]) {
      errors.push(`${context} 계약이 다릅니다: ${label}`);
    }
  }
}

function parseHighRiskRoutes(source, errors) {
  const routes = [];
  const signals = new Set();
  const rows = parseMarkdownTableRows(
    source,
    2,
    "변경·리뷰 신호",
    "고위험 신호 라우팅",
    errors,
  );

  for (const [signal, targetSource] of rows) {

    if (signals.has(signal)) {
      errors.push(`고위험 신호 라우팅에 중복 신호가 있습니다: ${signal}`);
    }
    signals.add(signal);

    const paths = [...targetSource.matchAll(/`(content\/[^`]+\.md)`/g)].map(
      (pathMatch) => pathMatch[1],
    );
    if (new Set(paths).size !== paths.length) {
      errors.push(`고위험 신호 라우팅에 중복 경로가 있습니다: ${signal}`);
    }
    routes.push({ paths, signal, targetSource });
  }

  return routes;
}

function validateHighRiskRouteMappings(actualRoutes, errors) {
  const expectedSignals = REQUIRED_HIGH_RISK_ROUTES.map((route) => route.signal);
  const actualSignals = actualRoutes.map((route) => route.signal);
  if (!sameArray(actualSignals, expectedSignals)) {
    errors.push(`고위험 신호 라우팅 순서는 다음과 같아야 합니다: ${expectedSignals.join(", ")}`);
  }

  for (const expectedRoute of REQUIRED_HIGH_RISK_ROUTES) {
    const actualRoute = actualRoutes.find((route) => route.signal === expectedRoute.signal);
    const expectedPaths = expectedRoute.targets.map((target) => target.path);
    const actualPaths = actualRoute?.paths ?? [];
    if (!sameArray(actualPaths, expectedPaths)) {
      errors.push(
        `고위험 신호 라우팅 매핑이 다릅니다: ${expectedRoute.signal} ` +
          `(기대: ${formatPaths(expectedPaths)}, 실제: ${formatPaths(actualPaths)})`,
      );
    }
    if (actualRoute?.targetSource !== expectedRoute.targetSource) {
      errors.push(`고위험 신호 라우팅 대상 계약이 다릅니다: ${expectedRoute.signal}`);
    }
  }
}

function validateRouteTargets(actualRoutes, routeExists, readRouteSource, errors) {
  const actualPaths = actualRoutes.flatMap((route) => route.paths);
  for (const routePath of new Set(actualPaths)) {
    if (!routeExists(routePath)) {
      errors.push(`고위험 라우팅 문서가 존재하지 않습니다: ${routePath}`);
    }
  }

  const requiredTargets = [
    ...REQUIRED_HIGH_RISK_ROUTES.flatMap((route) => route.targets),
    ...REQUIRED_HEADING_TARGETS,
  ];
  const targetHeadings = mergeTargetHeadings(requiredTargets);
  for (const [targetPath, headings] of targetHeadings) {
    if (!routeExists(targetPath)) {
      errors.push(`필수 Gate 문서가 존재하지 않습니다: ${targetPath}`);
      continue;
    }

    const routeSource = readRouteSource(targetPath);
    const actualHeadings = parseMarkdownHeadings(routeSource);
    for (const heading of headings) {
      if (
        !actualHeadings.some(
          (actualHeading) =>
            actualHeading.level === heading.level && actualHeading.title === heading.title,
        )
      ) {
        errors.push(`${targetPath}: 필수 Gate heading이 없습니다: ${heading.title}`);
      }
    }
  }
}

function mergeTargetHeadings(targets) {
  const headingsByPath = new Map();
  for (const target of targets) {
    const headings = headingsByPath.get(target.path) ?? [];
    for (const heading of target.headings ?? []) {
      if (
        !headings.some(
          (existing) => existing.level === heading.level && existing.title === heading.title,
        )
      ) {
        headings.push(heading);
      }
    }
    headingsByPath.set(target.path, headings);
  }
  return [...headingsByPath];
}

function parseMarkdownHeadings(source) {
  const tokens = markdownParser.parse(source, {});
  return tokens.flatMap((token, index) => {
    if (token.type !== "heading_open" || token.level !== 0 || !token.map) {
      return [];
    }
    const inlineToken = tokens[index + 1];
    return [
      {
        endLine: token.map[1],
        level: Number(token.tag.slice(1)),
        startLine: token.map[0],
        title: inlineToken?.type === "inline" ? inlineToken.content : "",
      },
    ];
  });
}

function formatPaths(paths) {
  return paths.length === 0 ? "없음" : paths.join(", ");
}

function normalizeWhitespace(value) {
  return value.replace(/\s+/g, " ").trim();
}

function extractReadmeBootstrap(source) {
  const marker = "워크스페이스 루트에 `AGENTS.md`를 만들고";
  const tokens = markdownParser.parse(source, {});
  const listItemStack = [];

  for (const token of tokens) {
    if (token.type === "list_item_open") {
      listItemStack.push({ bootstrapStep: false, ordinal: token.info });
      continue;
    }
    if (token.type === "list_item_close") {
      listItemStack.pop();
      continue;
    }

    const currentItem = listItemStack.at(-1);
    if (
      token.type === "inline" &&
      currentItem?.ordinal === "4" &&
      token.content.startsWith(marker)
    ) {
      currentItem.bootstrapStep = true;
      continue;
    }
    if (
      token.type === "fence" &&
      token.info.trim() === "text" &&
      listItemStack.some((item) => item.bootstrapStep)
    ) {
      return token.content.trimEnd();
    }
  }

  return "";
}

function extractInlineCodeContract(source, prefix) {
  for (const match of source.matchAll(/`([^`\n]+)`/g)) {
    if (match[1].startsWith(prefix)) {
      return match[1];
    }
  }
  return "";
}

function extractRange(source, startMarker, endMarker) {
  const start = source.indexOf(startMarker);
  const end = source.indexOf(endMarker, start === -1 ? 0 : start + startMarker.length);
  if (start === -1 || end === -1 || end <= start) {
    return "";
  }
  return source.slice(start, end);
}

function stripInlineCode(value) {
  return value.startsWith("`") && value.endsWith("`") ? value.slice(1, -1) : value;
}

function requireText(source, requiredValues, context, errors) {
  for (const value of requiredValues) {
    if (!source.includes(value)) {
      errors.push(`${context}에 필수 값이 없습니다: ${value}`);
    }
  }
}

function countExactHeadings(source, level, title) {
  return parseMarkdownHeadings(source).filter(
    (heading) => heading.level === level && heading.title === title,
  ).length;
}

function extractSection(source, level, title) {
  const headings = parseMarkdownHeadings(source);
  const sectionIndex = headings.findIndex(
    (heading) => heading.level === level && heading.title === title,
  );
  if (sectionIndex === -1) {
    return "";
  }

  const sectionHeading = headings[sectionIndex];
  const nextHeading = headings
    .slice(sectionIndex + 1)
    .find((heading) => heading.level <= level);
  const lines = source.split("\n");
  return lines.slice(sectionHeading.endLine, nextHeading?.startLine ?? lines.length).join("\n");
}

function sameArray(actual, expected) {
  return actual.length === expected.length && actual.every((value, index) => value === expected[index]);
}

const isMainModule =
  process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href;

if (isMainModule) {
  const docsRoot = process.cwd();
  const agentsPath = path.join(docsRoot, "content", "AGENTS.md");
  const readmePath = path.join(docsRoot, "content", "README.md");
  const testingStrategyPath = path.join(
    docsRoot,
    "content",
    "policy",
    "testing-strategy.md",
  );
  const routeExists = (relativePath) => fs.existsSync(path.join(docsRoot, relativePath));
  const readRouteSource = (relativePath) =>
    fs.readFileSync(path.join(docsRoot, relativePath), "utf8");
  const errors = validateAgentWorkflow({
    agentsSource: fs.readFileSync(agentsPath, "utf8"),
    readmeSource: fs.readFileSync(readmePath, "utf8"),
    testingStrategySource: fs.readFileSync(testingStrategyPath, "utf8"),
    routeExists,
    readRouteSource,
  });

  if (errors.length > 0) {
    for (const error of errors) {
      console.error(error);
    }
    process.exit(1);
  }

  console.log("에이전트 작업흐름 검증 통과");
}
