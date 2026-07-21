import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { validateAgentWorkflow } from "./validate-agent-workflow.mjs";

const scriptsRoot = path.dirname(fileURLToPath(import.meta.url));
const docsRoot = path.dirname(scriptsRoot);
const contentRoot = path.join(docsRoot, "content");
const baseAgentsSource = fs.readFileSync(path.join(contentRoot, "AGENTS.md"), "utf8");
const baseReadmeSource = fs.readFileSync(path.join(contentRoot, "README.md"), "utf8");
const baseTestingStrategySource = fs.readFileSync(
  path.join(contentRoot, "policy", "testing-strategy.md"),
  "utf8",
);

test("현재 에이전트 작업흐름 계약을 허용한다", () => {
  assert.deepEqual(validate(), []);
});

for (const [label, replacement] of [
  ["fenced code", "```text\n## 최소 운영 규칙\n```"],
  ["HTML 주석", "<!--\n## 최소 운영 규칙\n-->"],
  ["raw HTML block", "<div>\n## 최소 운영 규칙\n</div>"],
  ["blockquote", "> ## 최소 운영 규칙"],
]) {
  test(`content AGENTS의 ${label} 안 필수 section heading을 거부한다`, () => {
    const agentsSource = baseAgentsSource.replace("## 최소 운영 규칙", replacement);

    assert.match(
      validate({ agentsSource }).join("\n"),
      /content\/AGENTS\.md의 '최소 운영 규칙' 절은 정확히 1개여야 합니다/,
    );
  });
}

for (const [label, wrap] of [
  ["fenced code", (content) => `\`\`\`text\n${content}\`\`\``],
  ["raw HTML block", (content) => `<div>\n${content}</div>`],
]) {
  test(`content AGENTS의 ${label} 안 Core 계약을 거부한다`, () => {
    const agentsSource = baseAgentsSource.replace(
      /(## 최소 운영 규칙\n\n)([\s\S]*?)(\n## 작업 실행 제어)/,
      (_, start, content, end) => `${start}${wrap(content)}${end}`,
    );

    assert.match(validate({ agentsSource }).join("\n"), /Core 의미 구조 계약이/);
  });
}

for (const [heading, context] of [
  ["기본 원칙", "기본 실행 원칙"],
  ["요청 유형과 종료 조건", "요청 유형"],
  ["권한 집합", "권한"],
  ["작업 범위 판정", "작업 범위"],
  ["고위험 신호 라우팅", "고위험 신호 라우팅"],
  ["작업 상태 머신", "작업 상태 머신"],
  ["단계별 기준 재고정", "단계별 기준 재고정"],
  ["작업별 필수 완료 증빙", "작업별 완료 증빙"],
]) {
  test(`${heading} 절의 미인식 의미 문장을 거부한다`, () => {
    const agentsSource = baseAgentsSource.replace(
      `### ${heading}\n`,
      `### ${heading}\n\n기존 규칙과 달리 이 절의 필수 Gate는 생략할 수 있다.\n`,
    );

    assert.match(
      validate({ agentsSource }).join("\n"),
      new RegExp(`${context} 절 전체 계약이 다릅니다`),
    );
  });
}

test("Core 4 경로 누락을 거부한다", () => {
  const agentsSource = baseAgentsSource.replace(
    "    - `content/policy/testing-strategy.md`\n",
    "",
  );

  assert.match(validate({ agentsSource }).join("\n"), /Core 4는 다음 경로와 순서/);
});

test("Core 직접 재열람 계약 누락을 거부한다", () => {
  const agentsSource = baseAgentsSource.replace(
    "Core 4 전체 강제 열람은 모든 요청에 유지한다",
    "Core 4 전체 열람을 권장한다",
  );

  assert.match(validate({ agentsSource }).join("\n"), /기본 실행 원칙에 필수 값이 없습니다/);
});

test("Core ACK/EVIDENCE 계약 누락을 거부한다", () => {
  const agentsSource = baseAgentsSource.replace(
    "ACK: CORE@YYYY-MM-DD CRP@YYYY-MM-DD",
    "ACK: CORE@YYYY-MM-DD",
  );

  assert.match(validate({ agentsSource }).join("\n"), /Core ACK\/EVIDENCE에 필수 값이 없습니다/);
});

test("Core 실행 금지 규칙 뒤의 반대 조건 추가를 거부한다", () => {
  const agentsSource = baseAgentsSource.replace(
    "ACK/EVIDENCE 출력 전에는 필수 문서 열람 외 명령 실행/코드 작성/수정을 시작하지 않는다",
    "ACK/EVIDENCE 출력 전에는 필수 문서 열람 외 명령 실행/코드 작성/수정을 시작하지 않는다. 단, 필요하면 생략한다",
  );

  assert.match(validate({ agentsSource }).join("\n"), /Core 응답 계약이 다릅니다/);
});

test("Core EVIDENCE의 개별 문서 경로 누락을 거부한다", () => {
  const agentsSource = baseAgentsSource.replace(
    ", content/policy/code-review-policy.md:<line>",
    "",
  );

  assert.match(validate({ agentsSource }).join("\n"), /Core ACK\/EVIDENCE에 필수 값이 없습니다/);
});

test("요청 유형 누락을 거부한다", () => {
  const agentsSource = baseAgentsSource.replace(
    /^\| `진단` \|.*\n/m,
    "",
  );

  assert.match(validate({ agentsSource }).join("\n"), /요청 유형은 다음 순서의 폐쇄형 값/);
});

test("요청 유형의 기본 동작 약화를 거부한다", () => {
  const agentsSource = baseAgentsSource.replace(
    "요청 범위의 코드·문서·테스트를 수정한다",
    "계획만 작성한다",
  );

  assert.match(validate({ agentsSource }).join("\n"), /요청 유형 계약이 다릅니다: 변경·구현/);
});

test("요청 유형의 종료 조건 약화를 거부한다", () => {
  const agentsSource = baseAgentsSource.replace(
    "구현, 문서 동기화, 마지막 변경 이후 독립 리뷰·검증·최종 판정",
    "계획 작성만 보고",
  );

  assert.match(validate({ agentsSource }).join("\n"), /요청 유형 계약이 다릅니다: 변경·구현/);
});

test("독립 외부 권한 누락을 거부한다", () => {
  const agentsSource = baseAgentsSource.replaceAll("reviewer 변경", "reviewer 처리");

  assert.match(validate({ agentsSource }).join("\n"), /권한 집합에 필수 값이 없습니다: reviewer 변경/);
});

test("외부 의존성 독립 승인 누락을 거부한다", () => {
  const agentsSource = baseAgentsSource.replace(
    "외부 의존성 추가·대체와 이를 위한 manifest·lockfile 수정 또는 install 명령은 일반 workspace 파일 변경\n  권한에 포함되지 않는다.",
    "외부 의존성 변경은 일반 workspace 파일 변경 권한에 포함된다.",
  );

  assert.match(validate({ agentsSource }).join("\n"), /권한 계약이 다릅니다/);
});

test("일반 변경 요청을 외부 의존성 승인으로 해석하지 않는다", () => {
  const agentsSource = baseAgentsSource.replace(
    "기능 구현·리팩터링 같은 일반 변경 요청은 외부 의존성 승인으로\n  해석하지 않으며",
    "기능 구현·리팩터링 같은 일반 변경 요청은 외부 의존성 승인으로 해석하며",
  );

  assert.match(validate({ agentsSource }).join("\n"), /권한 계약이 다릅니다/);
});

test("PR 요청의 deploy 권한 반전을 거부한다", () => {
  const agentsSource = baseAgentsSource.replace(
    "포함하지 않는다.\n- 권한이 없는 단계",
    "포함한다.\n- 권한이 없는 단계",
  );

  assert.match(validate({ agentsSource }).join("\n"), /권한 계약이 다릅니다/);
});

test("독립 분류 축 계약 누락을 거부한다", () => {
  const agentsSource = baseAgentsSource.replace("서로 독립된 축", "한 순서의 단계");

  assert.match(validate({ agentsSource }).join("\n"), /기본 실행 원칙에 필수 값이 없습니다: 서로 독립된 축/);
});

test("기본 원칙 뒤의 반대 조건 추가를 거부한다", () => {
  const agentsSource = baseAgentsSource.replace(
    "전달 내용으로 대체하지 않는다.",
    "전달 내용으로 대체하지 않는다. 단, 편의상 대체한다.",
  );

  assert.match(validate({ agentsSource }).join("\n"), /기본 실행 원칙 계약이 다릅니다/);
});

test("ROUTE 실행 계약 필드 누락을 거부한다", () => {
  const agentsSource = baseAgentsSource.replace(" | 완료=<종료 조건>", "");

  assert.match(validate({ agentsSource }).join("\n"), /ROUTE 실행 계약에 필수 값이 없습니다/);
});

test("기존 작업 연속성 누락을 거부한다", () => {
  const agentsSource = baseAgentsSource.replace(
    "  같은 범위의 활성 PR을 병렬로 유지하지 않는다.\n",
    "",
  );

  assert.match(validate({ agentsSource }).join("\n"), /기존 작업 연속성에 필수 값이 없습니다/);
});

test("기존 작업 연속성 뒤의 반대 조건 추가를 거부한다", () => {
  const agentsSource = baseAgentsSource.replace(
    "같은 범위의 활성 PR을 병렬로 유지하지 않는다.\n- read-only 탐색",
    "같은 범위의 활성 PR을 병렬로 유지하지 않는다. 단, 매번 새 PR을 만든다.\n- read-only 탐색",
  );

  assert.match(validate({ agentsSource }).join("\n"), /작업 범위 계약이 다릅니다/);
});

test("관련 SoT fail-closed 누락을 거부한다", () => {
  const agentsSource = baseAgentsSource.replace(
    "파일을 수정하지 않고 `스펙 공백`",
    "추가 확인 없이 진행하고 `스펙 공백`",
  );

  assert.match(validate({ agentsSource }).join("\n"), /기본 실행 원칙에 필수 값이 없습니다/);
});

test("관련 SoT 폐쇄 조건 누락을 거부한다", () => {
  const agentsSource = baseAgentsSource.replace(
    "각 판정 책임이 하나의 단일 SoT에 연결될 때까지",
    "가까운 문서가 하나 보일 때까지",
  );

  assert.match(
    validate({ agentsSource }).join("\n"),
    /관련 SoT 폐쇄 탐색에 필수 값이 없습니다: 각 판정 책임이 하나의 단일 SoT/,
  );
});

test("관련 문서 절이 없는 문서의 fallback 누락을 거부한다", () => {
  const agentsSource = baseAgentsSource.replace(
    "없으면\n   본문의 직접 규범 링크",
    "없으면 탐색을 종료한다.\n   이전 링크",
  );

  assert.match(
    validate({ agentsSource }).join("\n"),
    /관련 SoT 폐쇄 탐색에 필수 값이 없습니다: 본문의 직접 규범 링크/,
  );
});

test("관련 SoT 폐쇄 조건 뒤의 반대 조건 추가를 거부한다", () => {
  const agentsSource = baseAgentsSource.replace(
    "각 판정 책임이 하나의 단일 SoT에 연결될 때까지 2~4를 반복한다.",
    "각 판정 책임이 하나의 단일 SoT에 연결될 때까지 2~4를 반복한다. 단, 첫 문서에서 종료한다.",
  );

  assert.match(validate({ agentsSource }).join("\n"), /관련 SoT 폐쇄 탐색 계약이 다릅니다/);
});

test("고위험 라우팅 문서 누락을 거부한다", () => {
  const agentsSource = baseAgentsSource.replace(
    "content/policy/payment-ops-policy.md",
    "content/policy/missing-payment-policy.md",
  );

  const errors = validate({ agentsSource }).join("\n");
  assert.match(errors, /고위험 신호 라우팅 매핑이 다릅니다: 결제·환불·정산/);
  assert.match(errors, /고위험 라우팅 문서가 존재하지 않습니다: content\/policy\/missing-payment-policy.md/);
});

test("고위험 라우팅 신호 누락을 거부한다", () => {
  const agentsSource = baseAgentsSource.replace("결제·환불·정산", "금융 관련 기능");

  assert.match(
    validate({ agentsSource }).join("\n"),
    /고위험 신호 라우팅 매핑이 다릅니다: 결제·환불·정산/,
  );
});

test("서로 존재하는 고위험 라우팅 경로 교환을 거부한다", () => {
  const securityPath = "content/policy/security-access-control-policy.md";
  const paymentPath = "content/policy/payment-ops-policy.md";
  const agentsSource = baseAgentsSource
    .replace(securityPath, "content/policy/__route_swap__.md")
    .replace(paymentPath, securityPath)
    .replace("content/policy/__route_swap__.md", paymentPath);

  assert.match(
    validate({ agentsSource }).join("\n"),
    /고위험 신호 라우팅 매핑이 다릅니다/,
  );
});

test("고위험 라우팅 행에 다른 기존 경로 추가를 거부한다", () => {
  const agentsSource = baseAgentsSource.replace(
    "`content/policy/api-operation-design-policy.md` |",
    "`content/policy/api-operation-design-policy.md`, `content/policy/payment-ops-policy.md` |",
  );

  assert.match(
    validate({ agentsSource }).join("\n"),
    /고위험 신호 라우팅 매핑이 다릅니다/,
  );
});

test("고위험 라우팅 행의 필수 Gate 안내 제거를 거부한다", () => {
  const agentsSource = baseAgentsSource.replace(
    "| policy 추가·수정·삭제·리뷰 | `content/policy/document-governance-policy.md`의 `정책 Composition Gate` |",
    "| policy 추가·수정·삭제·리뷰 | `content/policy/document-governance-policy.md` |",
  );

  assert.match(
    validate({ agentsSource }).join("\n"),
    /고위험 신호 라우팅 대상 계약이 다릅니다: policy 추가·수정·삭제·리뷰/,
  );
});

test("고위험 라우팅 행의 필수 Gate 의미 반전을 거부한다", () => {
  const agentsSource = baseAgentsSource.replace(
    "`content/policy/document-governance-policy.md`와 적용 템플릿",
    "`content/policy/document-governance-policy.md`와 적용 템플릿은 읽지 않아도 됨",
  );

  assert.match(
    validate({ agentsSource }).join("\n"),
    /고위험 신호 라우팅 대상 계약이 다릅니다: docs 작성·수정·삭제·리뷰/,
  );
});

test("고위험 라우팅의 중복 신호를 거부한다", () => {
  const agentsSource = baseAgentsSource.replace("| 결제·환불·정산 |", "| 인증·인가·관리자 권한·민감정보 |");

  assert.match(validate({ agentsSource }).join("\n"), /고위험 신호 라우팅에 중복 신호가 있습니다/);
});

test("고위험 라우팅 행의 중복 경로를 거부한다", () => {
  const routePath = "`content/policy/payment-ops-policy.md`";
  const agentsSource = baseAgentsSource.replace(`${routePath} |`, `${routePath}, ${routePath} |`);

  assert.match(validate({ agentsSource }).join("\n"), /고위험 신호 라우팅에 중복 경로가 있습니다/);
});

test("고위험 라우팅 합성 규칙 뒤의 반대 조건 추가를 거부한다", () => {
  const agentsSource = baseAgentsSource.replace(
    "해당 행의 문서를 합집합으로 읽고 판정 책임별 우선순위를 고정한다.",
    "해당 행의 문서를 합집합으로 읽고 판정 책임별 우선순위를 고정한다. 단, 하나만 읽어도 된다.",
  );

  assert.match(validate({ agentsSource }).join("\n"), /고위험 신호 합성 규칙 계약이 다릅니다/);
});

test("라우팅 대상의 필수 Gate heading 누락을 거부한다", () => {
  const readRouteSource = (relativePath) => {
    const source = readContent(relativePath);
    if (relativePath === "content/policy/document-governance-policy.md") {
      return source.replace("## 정책 Composition Gate", "## 정책 검토");
    }
    return source;
  };

  assert.match(
    validate({ readRouteSource }).join("\n"),
    /document-governance-policy\.md: 필수 Gate heading이 없습니다: 정책 Composition Gate/,
  );
});

test("라우팅 대상의 코드 블록 안 Gate heading을 거부한다", () => {
  const readRouteSource = (relativePath) => {
    const source = readContent(relativePath);
    if (relativePath === "content/policy/document-governance-policy.md") {
      return source.replace(
        "## 정책 Composition Gate",
        "```text\n## 정책 Composition Gate\n```\n\n## 정책 검토",
      );
    }
    return source;
  };

  assert.match(
    validate({ readRouteSource }).join("\n"),
    /document-governance-policy\.md: 필수 Gate heading이 없습니다: 정책 Composition Gate/,
  );
});

test("라우팅 대상의 HTML 주석 안 Gate heading을 거부한다", () => {
  const readRouteSource = (relativePath) => {
    const source = readContent(relativePath);
    if (relativePath === "content/policy/document-governance-policy.md") {
      return source.replace(
        "## 정책 Composition Gate",
        "<!--\n## 정책 Composition Gate\n-->\n\n## 정책 검토",
      );
    }
    return source;
  };

  assert.match(
    validate({ readRouteSource }).join("\n"),
    /document-governance-policy\.md: 필수 Gate heading이 없습니다: 정책 Composition Gate/,
  );
});

test("라우팅 대상의 raw HTML block 안 Gate heading을 거부한다", () => {
  const readRouteSource = (relativePath) => {
    const source = readContent(relativePath);
    if (relativePath === "content/policy/document-governance-policy.md") {
      return source.replace(
        "## 정책 Composition Gate",
        "<div>\n## 정책 Composition Gate\n</div>\n\n## 정책 검토",
      );
    }
    return source;
  };

  assert.match(
    validate({ readRouteSource }).join("\n"),
    /document-governance-policy\.md: 필수 Gate heading이 없습니다: 정책 Composition Gate/,
  );
});

test("라우팅 대상의 blockquote 안 Gate heading을 거부한다", () => {
  const readRouteSource = (relativePath) => {
    const source = readContent(relativePath);
    if (relativePath === "content/policy/document-governance-policy.md") {
      return source.replace(
        "## 정책 Composition Gate",
        "> ## 정책 Composition Gate\n\n## 정책 검토",
      );
    }
    return source;
  };

  assert.match(
    validate({ readRouteSource }).join("\n"),
    /document-governance-policy\.md: 필수 Gate heading이 없습니다: 정책 Composition Gate/,
  );
});

test("라우팅 대상의 Gate heading level 변경을 거부한다", () => {
  const readRouteSource = (relativePath) => {
    const source = readContent(relativePath);
    if (relativePath === "content/policy/document-governance-policy.md") {
      return source.replace("## 정책 Composition Gate", "###### 정책 Composition Gate");
    }
    return source;
  };

  assert.match(
    validate({ readRouteSource }).join("\n"),
    /document-governance-policy\.md: 필수 Gate heading이 없습니다: 정책 Composition Gate/,
  );
});

test("작업 상태 머신 순서 변경을 거부한다", () => {
  const agentsSource = baseAgentsSource
    .replace("8. `REVIEW`:", "8. `VERIFY`:")
    .replace("9. `VERIFY`:", "9. `REVIEW`:");

  assert.match(validate({ agentsSource }).join("\n"), /작업 상태 머신 순서는 BOOT -> CONTINUITY/);
});

test("작업 상태의 허용 동작 약화를 거부한다", () => {
  const agentsSource = baseAgentsSource.replace(
    "명시 권한이 있을 때만 commit, push, PR, reviewer, deploy Gate를 각각 적용한다",
    "권한 확인 없이 외부 작업을 적용한다",
  );

  assert.match(validate({ agentsSource }).join("\n"), /작업 상태 계약이 다릅니다: EXTERNAL_ACTION/);
});

test("마지막 변경 이후 검증 만료 규칙 누락을 거부한다", () => {
  const agentsSource = baseAgentsSource.replace(
    "이전 리뷰·검증·최종 판정은 모두 만료된다",
    "이전 리뷰·검증·최종 판정을 유지한다",
  );

  assert.match(validate({ agentsSource }).join("\n"), /작업 상태 머신 Exit Gate에 필수 값이 없습니다/);
});

test("재검증 규칙 뒤의 반대 조건 추가를 거부한다", () => {
  const agentsSource = baseAgentsSource.replace(
    "새 최종 후보로\n  `REVIEW -> VERIFY -> FINALIZE`를 다시 수행한다.",
    "새 최종 후보로\n  `REVIEW -> VERIFY -> FINALIZE`를 다시 수행한다. 단, 이전 판정을 재사용한다.",
  );

  assert.match(validate({ agentsSource }).join("\n"), /작업 상태 머신 Exit Gate 계약이 다릅니다/);
});

test("Finding이 남은 후보의 통합 품질 게이트 실행을 거부한다", () => {
  const agentsSource = baseAgentsSource.replace(
    "열린 Finding이 0건이 되기 전에는 로컬 표준\n  통합 품질 게이트를 실행하지 않는다.",
    "열린 Finding이 남아 있어도 로컬 표준 통합 품질 게이트를 실행한다.",
  );

  assert.match(validate({ agentsSource }).join("\n"), /작업 상태 머신 Exit Gate/);
});

test("검증 실패를 No Findings로 판정하는 조건을 거부한다", () => {
  const agentsSource = baseAgentsSource.replace(
    "검증 실패는 `No Findings`로 판정하지 않는다.",
    "검증 실패도 `No Findings`로 판정한다.",
  );

  assert.match(validate({ agentsSource }).join("\n"), /작업 상태 머신 Exit Gate/);
});

test("동일 최종 후보의 통합 품질 게이트 반복을 거부한다", () => {
  const testingStrategySource = baseTestingStrategySource.replace(
    "표준 통합 품질 게이트를 1회만 시작한다.",
    "표준 통합 품질 게이트를 필요할 때마다 반복한다.",
  );

  assert.match(
    validate({ testingStrategySource }).join("\n"),
    /로컬 최종 후보 검증 절 전체 계약이 다릅니다/,
  );
});

test("환경 실패에서 통합 명령 전체 재실행 허용을 거부한다", () => {
  const testingStrategySource = baseTestingStrategySource.replace(
    "같은 통합 명령 전체를 근거 없이 처음부터 다시 실행하지 않는다.",
    "같은 통합 명령 전체를 처음부터 다시 실행한다.",
  );

  assert.match(
    validate({ testingStrategySource }).join("\n"),
    /로컬 최종 후보 검증 절 전체 계약이 다릅니다/,
  );
});

test("단계별 기준 재고정 누락을 거부한다", () => {
  const agentsSource = baseAgentsSource.replace("- deploy 전:", "- 운영 직전:");

  assert.match(validate({ agentsSource }).join("\n"), /단계별 기준 재고정에 필수 값이 없습니다: deploy 전/);
});

test("단계별 기준 재고정 내용 약화를 거부한다", () => {
  const agentsSource = baseAgentsSource.replace(
    "deploy 전: release 정책, 적용 runbook, DB 변경 시 DB Migration Gate",
    "deploy 전: 필요 시 확인",
  );

  assert.match(validate({ agentsSource }).join("\n"), /단계별 기준 재고정 계약이 다릅니다: deploy 전/);
});

test("작업별 완료 증빙 누락을 거부한다", () => {
  const agentsSource = baseAgentsSource.replace(/^\- 설계·계획:.*\n/m, "");

  assert.match(validate({ agentsSource }).join("\n"), /작업별 완료 증빙에 필수 값이 없습니다: 설계·계획/);
});

test("작업별 완료 증빙 내용 약화를 거부한다", () => {
  const agentsSource = baseAgentsSource.replace(
    "코드 변경: 테스트 변경 판정, 적용 품질 Gate, 문서 동기화, 7개 관점 점검, 마지막 변경 이후 최종 판정",
    "코드 변경: 구현 파일 목록",
  );

  assert.match(validate({ agentsSource }).join("\n"), /작업별 완료 증빙 계약이 다릅니다: 코드 변경/);
});

test("README bootstrap 안전 Gate 누락을 거부한다", () => {
  const readmeSource = baseReadmeSource.replace("## PR reviewer 요청 금지 게이트", "");

  assert.match(validate({ readmeSource }).join("\n"), /README workspace bootstrap에 필수 값이 없습니다/);
});

test("README bootstrap reviewer 승인 조건 반전을 거부한다", () => {
  const readmeSource = baseReadmeSource.replace(
    "사용자가 reviewer 개인 또는 팀을 별도로 명시해 승인하기 전에는",
    "사용자가 reviewer 개인 또는 팀을 별도로 명시해 승인하지 않아도",
  );

  assert.match(validate({ readmeSource }).join("\n"), /README workspace bootstrap 계약이 다릅니다/);
});

test("README의 HTML 주석 안 bootstrap 예시를 거부한다", () => {
  const start = baseReadmeSource.indexOf("4. 워크스페이스 루트에 `AGENTS.md`를 만들고");
  const end = baseReadmeSource.indexOf("\n5. IDE에서", start);
  const readmeSource =
    baseReadmeSource.slice(0, start) +
    "<!--\n" +
    baseReadmeSource.slice(start, end) +
    "\n-->" +
    baseReadmeSource.slice(end);

  assert.match(validate({ readmeSource }).join("\n"), /README workspace bootstrap 계약이 다릅니다/);
});

test("content AGENTS bootstrap 안전 Gate 누락을 거부한다", () => {
  const agentsSource = baseAgentsSource.replace(
    "사용자가 reviewer 개인 또는 팀을 별도로 명시해 승인",
    "reviewer가 필요해 보이면",
  );

  assert.match(
    validate({ agentsSource }).join("\n"),
    /content\/AGENTS\.md bootstrap 안전 Gate에 필수 값이 없습니다/,
  );
});

test("content AGENTS reviewer 승인 조건 반전을 거부한다", () => {
  const agentsSource = baseAgentsSource.replace(
    "사용자가 reviewer 개인 또는 팀을 별도로 명시해 승인하기 전에는",
    "사용자가 reviewer 개인 또는 팀을 별도로 명시해 승인하지 않아도",
  );

  assert.match(
    validate({ agentsSource }).join("\n"),
    /content\/AGENTS\.md reviewer 안전 Gate 계약이 다릅니다/,
  );
});

function validate({
  agentsSource = baseAgentsSource,
  readmeSource = baseReadmeSource,
  testingStrategySource = baseTestingStrategySource,
  routeExists = (relativePath) => fs.existsSync(path.join(docsRoot, relativePath)),
  readRouteSource = readContent,
} = {}) {
  return validateAgentWorkflow({
    agentsSource,
    readmeSource,
    testingStrategySource,
    routeExists,
    readRouteSource,
  });
}

function readContent(relativePath) {
  return fs.readFileSync(path.join(docsRoot, relativePath), "utf8");
}
