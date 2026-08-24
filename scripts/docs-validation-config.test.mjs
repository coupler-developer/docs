import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

import {
    FULL_TASK_IDS,
    STATIC_TASK_IDS,
    VALIDATION_TASKS,
} from "./docs-validation-runner.mjs";

const scriptsRoot = path.dirname(fileURLToPath(import.meta.url));
const docsRoot = path.dirname(scriptsRoot);
const packageJson = JSON.parse(
    fs.readFileSync(path.join(docsRoot, "package.json"), "utf8"),
);
const contentReadme = fs.readFileSync(
    path.join(docsRoot, "content", "README.md"),
    "utf8",
);
const releaseRecordTemplate = fs.readFileSync(
    path.join(docsRoot, "content", "templates", "release-record-template.md"),
    "utf8",
);
const releaseProcess = fs.readFileSync(
    path.join(docsRoot, "content", "policy", "release-process.md"),
    "utf8",
);
const releaseRecordInitializer = fs.readFileSync(
    path.join(docsRoot, "scripts", "init-release-record.mjs"),
    "utf8",
);
const releaseContinue = fs.readFileSync(
    path.join(docsRoot, "scripts", "release-continue.mjs"),
    "utf8",
);
const releasePreflight = fs.readFileSync(
    path.join(docsRoot, "scripts", "release-preflight.mjs"),
    "utf8",
);
const mkdocsBuildRunner = fs.readFileSync(
    path.join(docsRoot, "scripts", "run-mkdocs-build.mjs"),
    "utf8",
);
const workflow = fs.readFileSync(
    path.join(docsRoot, ".github", "workflows", "lint.yml"),
    "utf8",
);
const operationalRunbookPaths = [
    "db-migration-operation-flow.md",
    "api-production-deploy-flow.md",
    "admin-web-production-deploy-flow.md",
    "mobile-production-release-flow.md",
    "production-deploy-command-runbook.md",
].map((name) =>
    path.join(docsRoot, "content", "flows", "cross-project", name),
);
const operationalRunbooks = new Map(
    operationalRunbookPaths.map((runbookPath) => [
        path.basename(runbookPath),
        fs.readFileSync(runbookPath, "utf8"),
    ]),
);
const deployWorkflow = fs.readFileSync(
    path.join(docsRoot, ".github", "workflows", "deploy-docs.yml"),
    "utf8",
);
const releaseWorkflow = fs.readFileSync(
    path.join(docsRoot, ".github", "workflows", "release.yml"),
    "utf8",
);
const workflowDirectory = path.join(docsRoot, ".github", "workflows");
const allWorkflows = fs
    .readdirSync(workflowDirectory)
    .filter((fileName) => fileName.endsWith(".yml"))
    .map((fileName) =>
        fs.readFileSync(path.join(workflowDirectory, fileName), "utf8"),
    )
    .join("\n");
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
    path.join(
        docsRoot,
        "content",
        "templates",
        "docs-stability-review-template.md",
    ),
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
const runnerScript = "node scripts/docs-validation-runner.mjs";
const taskScript = (taskId) => `${runnerScript} task ${taskId}`;
const expectedStaticTaskIds = [
    "test:release-preflight",
    "test:docs-structure",
    "test:agent-workflow",
    "test:document-lifecycle",
    "test:logical-data-model",
    "test:technical-debt",
    "test:docs-validation-runner",
    "test:docs-validation-config",
    "validate:docs-structure",
    "validate:document-lifecycle",
    "validate:agent-workflow",
    "validate:logical-data-model",
    "validate:technical-debt",
    "validate:release-records",
    "validate:api-error-docs",
];

test("local validation and full CI use the same static gate runner", () => {
    assert.equal(packageJson.scripts["validate:docs"], `${runnerScript} full`);
    assert.equal(packageJson.scripts.verify, `${runnerScript} full`);
    assert.equal(
        packageJson.scripts["validate:docs-static"],
        `${runnerScript} static`,
    );
    assert.match(
        workflow,
        /- name: Validate full docs static gates\n\s+if: steps\.validation_mode\.outputs\.mode == 'full'\n\s+env:\n\s+DOCUMENT_LIFECYCLE_BASE_REF: \$\{\{ github\.event\.pull_request\.base\.sha \}\}\n\s+run: yarn validate:docs-static/,
    );
    assert.match(
        deployWorkflow,
        /uses: actions\/checkout@v6\n\s+with:\n\s+fetch-depth: 0/,
    );
    assert.match(
        deployWorkflow,
        /- name: Validate docs\n\s+env:\n\s+DOCUMENT_LIFECYCLE_BASE_REF: \$\{\{ github\.event\.before \}\}\n\s+run: yarn verify/,
    );
    assert.match(releaseWorkflow, /- name: Validate docs\n\s+run: yarn verify/);
    assert.match(workflow, /- name: Run markdownlint\n\s+run: yarn lint:md/);
    assert.match(workflow, /- name: Build docs\n\s+run: yarn build:docs/);
    assert.match(
        testingStrategy,
        /문서 공통 정적 검증\(로컬·full CI\): `yarn validate:docs-static`/,
    );
});

test("the runner owns the exact static and full task sets", () => {
    assert.deepEqual(STATIC_TASK_IDS, expectedStaticTaskIds);
    assert.deepEqual(
        new Set(FULL_TASK_IDS),
        new Set([...expectedStaticTaskIds, "lint:md", "build:docs"]),
    );
    assert.equal(FULL_TASK_IDS.length, expectedStaticTaskIds.length + 2);

    for (const taskId of new Set([
        ...FULL_TASK_IDS,
        "validate:docs-sensitive",
    ])) {
        assert.ok(VALIDATION_TASKS[taskId], `missing runner task: ${taskId}`);
        assert.equal(packageJson.scripts[taskId], taskScript(taskId));
    }

    assert.match(
        testingStrategy,
        /단일 `docs-validation-runner`가 폐쇄형 leaf 목록과 최대 2개 병렬\s+실행을 소유한다/,
    );
});

test("verification aliases cannot drift from CI", () => {
    const forbiddenAliases = ["test:ci", "verify:ci", "ci:test", "ci:verify"];

    for (const alias of forbiddenAliases) {
        assert.equal(packageJson.scripts[alias], undefined);
        assert.doesNotMatch(
            allWorkflows,
            new RegExp(alias.replace(":", "\\:")),
        );
    }
    assert.match(
        testingStrategy,
        /개발자용 전체 검증 진입점은 `verify` 하나만 사용한다/,
    );
});

test("release initialization and resume stay wired to one public command", () => {
    assert.equal(
        packageJson.scripts["release:continue"],
        "node scripts/release-continue.mjs",
    );
    assert.equal(packageJson.scripts["release:record:init"], undefined);
    assert.equal(packageJson.scripts["release:preflight"], undefined);
    assert.ok(
        VALIDATION_TASKS["test:release-preflight"].args.some((arg) =>
            arg.endsWith("init-release-record.test.mjs"),
        ),
    );
    assert.ok(
        VALIDATION_TASKS["test:release-preflight"].args.some((arg) =>
            arg.endsWith("release-continue.test.mjs"),
        ),
    );
    assert.match(contentReadme, /yarn release:continue vX\.Y\.Z/);
    assert.match(contentReadme, /생성된 `planned`는 로컬 초안이며 push하지 않는다/);
    assert.match(releaseRecordTemplate, /yarn release:continue vX\.Y\.Z/);
    assert.equal(
        (releaseRecordTemplate.match(/"status": "planned"/g) ?? []).length,
        2,
    );
    assert.match(releaseRecordTemplate, /전체 상태: `planned`/);
    assert.match(releaseRecordTemplate, /현재 PR head의\s+필수 CI/);
    assert.match(
        releaseRecordTemplate,
        /`content\/templates\/api-contract-cutover-gate-template\.md`/,
    );
    assert.match(
        releaseProcess,
        /원격 PR head 및 해당 head에 적용된 필수 CI를 확인해/,
    );
    assert.match(releaseRecordInitializer, /planned 로컬 초안/);
    assert.match(releaseContinue, /pr", "checks", "--required"/);
    assert.match(releaseContinue, /release-preflight\.mjs/);
    assert.doesNotMatch(
        releasePreflight,
        /--include|--workspace-root|--pending-ref/,
    );
    for (const source of [
        contentReadme,
        releaseRecordTemplate,
        releaseProcess,
        releaseRecordInitializer,
        operationalRunbooks.get("production-deploy-command-runbook.md"),
    ]) {
        assert.doesNotMatch(source, /경량 CI/);
    }
    assert.match(
        operationalRunbooks.get("production-deploy-command-runbook.md"),
        /yarn release:continue vX\.Y\.Z/,
    );
    assert.doesNotMatch(
        operationalRunbooks.get("production-deploy-command-runbook.md"),
        /PR_NUMBER|PENDING_REF|--workspace-root/,
    );
    assert.match(mkdocsBuildRunner, /initializeReleaseRecord\(\{/);
    assert.match(mkdocsBuildRunner, /generated release record smoke/);
});

test("agent workflow validation is part of the shared static gate", () => {
    assert.equal(
        packageJson.scripts["validate:agent-workflow"],
        taskScript("validate:agent-workflow"),
    );
    assert.equal(
        packageJson.scripts["test:agent-workflow"],
        taskScript("test:agent-workflow"),
    );
    assert.ok(STATIC_TASK_IDS.includes("validate:agent-workflow"));
    assert.ok(STATIC_TASK_IDS.includes("test:agent-workflow"));
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
        taskScript("validate:document-lifecycle"),
    );
    assert.equal(
        packageJson.scripts["test:document-lifecycle"],
        taskScript("test:document-lifecycle"),
    );
    assert.ok(STATIC_TASK_IDS.includes("validate:document-lifecycle"));
    assert.ok(STATIC_TASK_IDS.includes("test:document-lifecycle"));
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
        /문서 lifecycle current registry·retirement ledger 검증\(로컬, 사용 가능한 `origin\/main` baseline 포함\):\s+`yarn validate:document-lifecycle`/,
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
    assert.match(
        documentLifecycleValidator,
        /const retirementLedgerFile = "document-retirement-ledger\.json"/,
    );
    assert.equal(
        [...workflow.matchAll(/yarn validate:document-lifecycle/g)].length,
        1,
        "PR workflow should keep only the lightweight explicit lifecycle run",
    );
    assert.equal(
        [...deployWorkflow.matchAll(/yarn validate:document-lifecycle/g)]
            .length,
        0,
        "deploy should inject its baseline into the shared full runner",
    );
    assert.doesNotMatch(
        deployWorkflow,
        /Validate document lifecycle transition/,
    );
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
    assert.deepEqual(
        headingIndexes,
        [...headingIndexes].sort((a, b) => a - b),
    );
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

test("foundation and high-risk route descriptors come from the lifecycle registry", () => {
    assert.match(
        agentWorkflowValidator,
        /const currentRoutes = lifecycleRegistry\.routes;/,
    );
    assert.doesNotMatch(
        agentWorkflowValidator,
        /route\.lifecycle === "active"/,
    );
    assert.match(agentWorkflowValidator, /routing === "core"/);
    assert.doesNotMatch(
        agentWorkflowValidator,
        /REQUIRED_(BASIC_RULES|LOCAL_FINAL_CANDIDATE_CONTRACT|CLOSURE_CONTRACT)/,
    );
});

test("lightweight release validation remains separate from the full runner", () => {
    assert.match(
        workflow,
        /- name: Validate release records \(lightweight\)\n\s+if: steps\.validation_mode\.outputs\.mode != 'full'\n\s+env:\n\s+DOCUMENT_LIFECYCLE_BASE_REF: \$\{\{ github\.event\.pull_request\.base\.sha \}\}\n\s+run: node scripts\/validate-release-records\.mjs/,
    );
    assert.match(
        workflow,
        /- name: Validate sensitive docs \(lightweight\)\n\s+if: steps\.validation_mode\.outputs\.mode != 'full'\n\s+run: yarn validate:docs-sensitive/,
    );
    assert.equal(
        packageJson.scripts["validate:docs-sensitive"],
        taskScript("validate:docs-sensitive"),
    );
    assert.match(
        testingStrategy,
        /문서 민감 인프라 식별자 검증\(로컬·경량 CI\): `yarn validate:docs-sensitive`/,
    );
    assert.match(
        workflow,
        /types: \[opened, synchronize, reopened, ready_for_review, converted_to_draft\]/,
    );
    assert.match(
        workflow,
        /PR_DRAFT: \$\{\{ github\.event\.pull_request\.draft \}\}/,
    );
    assert.match(workflow, /--pr-draft "\$PR_DRAFT"/);
});

test("operator runbook bash blocks are syntactically executable", () => {
    for (const [name, source] of operationalRunbooks) {
        const blocks = [...source.matchAll(/```bash\n([\s\S]*?)\n```/g)];
        assert(blocks.length > 0, `${name} must contain an executable bash block`);
        for (const [index, match] of blocks.entries()) {
            const result = spawnSync("bash", ["-n"], {
                input: match[1],
                encoding: "utf8",
            });
            assert.equal(
                result.status,
                0,
                `${name} bash block ${index + 1}: ${result.stderr}`,
            );
        }
    }
});

test("release runbooks bind rollback, NextPush, marker, and docs postcheck evidence", () => {
    const admin = operationalRunbooks.get("admin-web-production-deploy-flow.md");
    const mobile = operationalRunbooks.get("mobile-production-release-flow.md");
    const api = operationalRunbooks.get("api-production-deploy-flow.md");
    const db = operationalRunbooks.get("db-migration-operation-flow.md");
    const release = operationalRunbooks.get("production-deploy-command-runbook.md");

    assert.match(admin, /BACKUP_METADATA=.*\.coupler-admin-backup/);
    assert.match(admin, /ROLLBACK_COMMIT=.*awk[\s\S]*BACKUP_INDEX_SHA256/);
    assert.doesNotMatch(admin, /: "\$\{ROLLBACK_COMMIT:\?/);
    assert.doesNotMatch(admin, /: "\$\{INDEX_SHA256:\?/);
    assert.doesNotMatch(admin, /EXPECTED_API_ORIGIN:\?|ADMIN_SERVER:\?|DEPLOY_USER:\?/);
    assert.match(admin, /ADMIN_TARGET:\?set ADMIN_TARGET to user@host/);
    assert.match(
        mobile,
        /nextpush release-react "\$\{APP_ID\}" "\$\{PLATFORM\}" -d Production -m -t "\$\{TARGET_BINARY\}"/,
    );
    assert.doesNotMatch(mobile, /SCRIPT_COMMAND|checkout --detach/);
    assert.match(mobile, /set MARKER_SCOPE to android or ios/);
    assert.doesNotMatch(mobile, /SUBMITTED_COMMIT/);
    assert.doesNotMatch(mobile, /mobile \| android \| ios/);
    assert.doesNotMatch(
        mobile,
        /ARTIFACT_FILE|ARTIFACT_REF|ARTIFACT_SHA256|BUNDLE_HASH|SOURCE_EVIDENCE/,
    );
    assert.match(mobile, /PR head SHA는 병합 과정에서 바뀔 수 있으므로 artifact\s+기준으로 사용하지 않는다/);
    assert.match(api, /test "\$\(id -u\)" -eq 0/);
    assert.match(api, /curl --retry 10 --retry-all-errors/);
    assert.doesNotMatch(api, /API_ACTION/);
    assert.doesNotMatch(api, /pm2 status|pm2 describe|crontab -l|git grep/);
    assert.equal(
        [...db.matchAll(/test -z "\$\(git status --porcelain\)"/g)].length,
        2,
    );

    const docsClose = release.slice(release.indexOf("## Docs 릴리스 마감"));
    assert.doesNotMatch(docsClose, /^yarn verify$/mu);
    assert.match(docsClose, /deploy-docs\.yml[\s\S]*git tag -a/);
    assert.match(docsClose, /gh run watch[\s\S]*gh release download[\s\S]*repos\/\$\{REPO\}\/pages/);
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

    const end = workflow.indexOf(
        `  ${nextJobName}:\n`,
        start + startMarker.length,
    );
    assert.notEqual(end, -1, `missing workflow job: ${nextJobName}`);
    return workflow.slice(start, end);
}
