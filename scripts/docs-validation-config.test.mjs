import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const scriptsRoot = path.dirname(fileURLToPath(import.meta.url));
const docsRoot = path.dirname(scriptsRoot);
const packageJson = JSON.parse(
  fs.readFileSync(path.join(docsRoot, "package.json"), "utf8"),
);
const workflow = fs.readFileSync(
  path.join(docsRoot, ".github", "workflows", "lint.yml"),
  "utf8",
);
const deployWorkflow = fs.readFileSync(
  path.join(docsRoot, ".github", "workflows", "deploy-docs.yml"),
  "utf8",
);
const testingStrategy = fs.readFileSync(
  path.join(docsRoot, "content", "policy", "testing-strategy.md"),
  "utf8",
);
const documentGovernancePolicy = fs.readFileSync(
  path.join(docsRoot, "content", "policy", "document-governance-policy.md"),
  "utf8",
);
const codeReviewPolicy = fs.readFileSync(
  path.join(docsRoot, "content", "policy", "code-review-policy.md"),
  "utf8",
);
const docsStabilityReviewTemplate = fs.readFileSync(
  path.join(docsRoot, "content", "templates", "docs-stability-review-template.md"),
  "utf8",
);
const policyTemplate = fs.readFileSync(
  path.join(docsRoot, "content", "templates", "policy-template.md"),
  "utf8",
);
const agentWorkflowValidator = fs.readFileSync(
  path.join(docsRoot, "scripts", "validate-agent-workflow.mjs"),
  "utf8",
);
const documentLifecycleValidator = fs.readFileSync(
  path.join(docsRoot, "scripts", "validate-document-lifecycle.mjs"),
  "utf8",
);

test("local validation and full CI use the same static gate runner", () => {
  assert.equal(
    packageJson.scripts["validate:docs"],
    "yarn validate:docs-static && yarn lint:md && yarn build:docs",
  );
  assert.match(
    workflow,
    /- name: Validate full docs static gates\n\s+if: steps\.validation_mode\.outputs\.mode == 'full'\n\s+env:\n\s+DOCUMENT_LIFECYCLE_BASE_REF: \$\{\{ github\.event\.pull_request\.base\.sha \}\}\n\s+run: yarn validate:docs-static/,
  );
  assert.match(deployWorkflow, /uses: actions\/checkout@v6\n\s+with:\n\s+fetch-depth: 0/);
  assert.match(
    deployWorkflow,
    /- name: Validate docs\n\s+env:\n\s+DOCUMENT_LIFECYCLE_BASE_REF: \$\{\{ github\.event\.before \}\}\n\s+run: yarn validate:docs/,
  );
  assert.match(
    testingStrategy,
    /문서 공통 정적 검증\(로컬·full CI\): `yarn validate:docs-static`/,
  );
});

test("agent workflow validation is part of the shared static gate", () => {
  assert.equal(
    packageJson.scripts["validate:agent-workflow"],
    "node scripts/validate-agent-workflow.mjs",
  );
  assert.equal(
    packageJson.scripts["test:agent-workflow"],
    "node --test scripts/validate-agent-workflow.test.mjs",
  );
  assert.match(
    packageJson.scripts["validate:docs-static"],
    /yarn validate:agent-workflow/,
  );
  assert.match(
    packageJson.scripts["validate:docs-static"],
    /yarn test:agent-workflow/,
  );
  assert.match(
    testingStrategy,
    /에이전트 작업흐름 검증\(로컬\): `yarn validate:agent-workflow`/,
  );
  assert.match(
    testingStrategy,
    /에이전트 작업흐름 검증 테스트\(로컬\): `yarn test:agent-workflow`/,
  );
});

test("document lifecycle validation is wired for local, full, and lightweight PR gates", () => {
  assert.equal(
    packageJson.scripts["validate:document-lifecycle"],
    "node scripts/validate-document-lifecycle.mjs",
  );
  assert.equal(
    packageJson.scripts["test:document-lifecycle"],
    "node --test scripts/validate-document-lifecycle.test.mjs",
  );
  assert.match(
    packageJson.scripts["validate:docs-static"],
    /yarn validate:document-lifecycle/,
  );
  assert.match(
    packageJson.scripts["validate:docs-static"],
    /yarn test:document-lifecycle/,
  );
  assert.match(
    workflow,
    /- name: Install Node dependencies\n\s+run: yarn install --frozen-lockfile/,
  );
  assert.match(
    workflow,
    /- name: Validate document lifecycle transition\n\s+if: github\.event_name == 'pull_request' && steps\.validation_mode\.outputs\.mode != 'full'[\s\S]*?run: yarn validate:document-lifecycle --base-ref "\$BASE_SHA"/,
  );
  assert.match(
    testingStrategy,
    /문서 lifecycle 검증\(로컬, 사용 가능한 `origin\/main` baseline 포함\): `yarn validate:document-lifecycle`/,
  );
  assert.match(
    testingStrategy,
    /문서 lifecycle 검증 테스트\(로컬\): `yarn test:document-lifecycle`/,
  );
});

test("each full CI path runs lifecycle current and transition validation once", () => {
  assert.match(
    documentLifecycleValidator,
    /process\.env\.DOCUMENT_LIFECYCLE_BASE_REF\?\.trim\(\)/,
  );
  assert.equal(
    [...workflow.matchAll(/yarn validate:document-lifecycle/g)].length,
    1,
    "PR workflow should keep only the lightweight explicit lifecycle run",
  );
  assert.equal(
    [...deployWorkflow.matchAll(/yarn validate:document-lifecycle/g)].length,
    0,
    "deploy should inject its baseline into the shared full runner",
  );
  assert.doesNotMatch(deployWorkflow, /Validate document lifecycle transition/);
  assert.match(
    testingStrategy,
    /같은 deploy job 안에서 lifecycle을 별도 선행 실행하지 않는다/,
  );
});

test("validation redundancy review stays synchronized across policies and templates", () => {
  assert.match(testingStrategy, /^### 검증 중복 판정$/mu);
  assert.match(
    documentGovernancePolicy,
    /\*\*Validation Architecture \/ Redundancy Reviewer\*\*/,
  );
  assert.match(
    codeReviewPolicy,
    /\*\*QA \/ Release\*\*:[\s\S]*?동일 Gate가 불필요하게 반복되는지/,
  );
  assert.match(
    docsStabilityReviewTemplate,
    /\| Validation Architecture \/ Redundancy Reviewer \|  \|  \|/,
  );
  assert.match(
    policyTemplate,
    /검증 경로의 event·ref·baseline·산출물별 책임과 근거 없는 중복 실행 확인/,
  );
});

test("final candidate validation follows independent review evidence", () => {
  const orderedHeadings = [
    "## 정책 Composition Gate (policy 추가·수정·삭제 시)",
    "## 독립 리뷰 판정",
    "## Findings",
    "## 독립 리뷰 체크포인트",
    "## 검증",
    "## 결론",
  ];
  const headingIndexes = orderedHeadings.map((heading) =>
    docsStabilityReviewTemplate.indexOf(heading),
  );

  assert.ok(headingIndexes.every((index) => index >= 0));
  assert.deepEqual(headingIndexes, [...headingIndexes].sort((a, b) => a - b));
  assert.match(
    docsStabilityReviewTemplate,
    /구현·문서 구조와 검증 계획을 판정한다\. 실제 검증 결과와 최종 Exit Gate는 아래 `결론`에서 결합한다\./,
  );
  assert.doesNotMatch(codeReviewPolicy, /^[-] \[ \] 자체 테스트 완료$/mu);
  assert.match(
    codeReviewPolicy,
    /별도 표적 검증을 실행했다면 허용 사유·명령·결과를/,
  );
  assert.match(
    codeReviewPolicy,
    /독립 최종 리뷰 체크포인트: `열린 Finding 0건·검증 대기` \/ `미도달` \+ 근거/,
  );
  assert.match(
    codeReviewPolicy,
    /검증 결과는 독립 리뷰나 체크포인트를 대체하지 않는다/,
  );
  assert.doesNotMatch(
    codeReviewPolicy,
    /독립 최종 리뷰 체크포인트:[^\n]*N\/A/,
  );
});

test("Core and high-risk route descriptors come from the lifecycle registry", () => {
  assert.match(
    agentWorkflowValidator,
    /const REQUIRED_CORE_PATHS = activeLifecycleDocuments/,
  );
  assert.match(
    agentWorkflowValidator,
    /const REQUIRED_HIGH_RISK_ROUTES = lifecycleRegistry\.routes/,
  );
  assert.doesNotMatch(
    agentWorkflowValidator,
    /const REQUIRED_HIGH_RISK_ROUTES = \[/,
  );
});

test("lightweight release validation remains separate from the full runner", () => {
  assert.match(
    workflow,
    /- name: Validate release records \(lightweight\)\n\s+if: steps\.validation_mode\.outputs\.mode != 'full'\n\s+run: node scripts\/validate-release-records\.mjs/,
  );
  assert.match(
    workflow,
    /- name: Validate sensitive docs \(lightweight\)\n\s+if: steps\.validation_mode\.outputs\.mode != 'full'\n\s+run: yarn validate:docs-sensitive/,
  );
  assert.equal(
    packageJson.scripts["validate:docs-sensitive"],
    "node scripts/validate-docs-structure.mjs --sensitive-only",
  );
  assert.match(
    testingStrategy,
    /문서 민감 인프라 식별자 검증\(로컬·경량 CI\): `yarn validate:docs-sensitive`/,
  );
  assert.match(
    workflow,
    /- name: Validate release PR transition\n\s+if: github\.event_name == 'pull_request'/,
  );
});

test("lint and build jobs start independently from docs structure validation", () => {
  const markdownLintJob = readJob("markdown-lint", "build-docs");
  const buildDocsJob = readJob("build-docs");

  for (const job of [markdownLintJob, buildDocsJob]) {
    assert.doesNotMatch(job, /^\s{4}needs:/mu);
    assert.doesNotMatch(job, /^\s{4}if:/mu);
  }

  assert.match(buildDocsJob, /^\s{10}cache: "pip"$/mu);
  assert.match(
    buildDocsJob,
    /^\s{10}cache-dependency-path: requirements\.txt$/mu,
  );
  assert.match(
    testingStrategy,
    /`markdown-lint`와 `build-docs`는 validation mode와 무관하게 `docs-structure`와 동시에 시작한다/,
  );
});

function readJob(jobName, nextJobName = null) {
  const startMarker = `  ${jobName}:\n`;
  const start = workflow.indexOf(startMarker);

  assert.notEqual(start, -1, `missing workflow job: ${jobName}`);

  if (!nextJobName) {
    return workflow.slice(start);
  }

  const end = workflow.indexOf(`  ${nextJobName}:\n`, start + startMarker.length);
  assert.notEqual(end, -1, `missing workflow job: ${nextJobName}`);
  return workflow.slice(start, end);
}
