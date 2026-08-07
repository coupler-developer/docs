import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { validateAgentWorkflow } from "./validate-agent-workflow.mjs";

const scriptsRoot = path.dirname(fileURLToPath(import.meta.url));
const docsRoot = path.dirname(scriptsRoot);
const contentRoot = path.join(docsRoot, "content");
const baseAgentsSource = readContent("content/AGENTS.md");
const baseReadmeSource = readContent("content/README.md");
const baseTestingStrategySource = readContent(
    "content/policy/testing-strategy.md",
);
const baseWorkspaceRootAgentsSource = baseReadmeSource
    .match(/```text\s*\n([\s\S]*?)\n\s*```/)?.[1]
    .replace(/^ {3}/gm, "");

test("현재 최소 bootstrap과 단계별 라우팅 계약을 허용한다", () => {
    assert.deepEqual(validate(), []);
});

test("설명 문장 추가를 기계 계약 위반으로 오판하지 않는다", () => {
    const agentsSource = baseAgentsSource.replace(
        "## 문서 인덱스",
        "- 이 문장은 닫힌 값이나 권한을 바꾸지 않는 보충 설명이다.\n\n## 문서 인덱스",
    );
    assert.deepEqual(validate({ agentsSource }), []);
});

test("필수 section heading 누락을 거부한다", () => {
    const agentsSource = baseAgentsSource.replace(
        "## 부트스트랩",
        "## 시작 안내",
    );
    assert.match(
        validate({ agentsSource }).join("\n"),
        /'부트스트랩' 절은 정확히 1개/,
    );
});

test("HTML 주석 안 heading을 실제 section으로 인정하지 않는다", () => {
    const agentsSource = baseAgentsSource.replace(
        "## 부트스트랩",
        "<!--\n## 부트스트랩\n-->",
    );
    assert.match(
        validate({ agentsSource }).join("\n"),
        /'부트스트랩' 절은 정확히 1개/,
    );
});

test("새 세션 ACK 누락을 거부한다", () => {
    const agentsSource = baseAgentsSource.replace(
        "ACK: BOOT@YYYY-MM-DD",
        "BOOT 확인",
    );
    assert.match(
        validate({ agentsSource }).join("\n"),
        /bootstrap에 필수 값이 없습니다/,
    );
});

test("모든 세션 Core 4 선열람의 재도입을 거부한다", () => {
    const agentsSource = baseAgentsSource.replace(
        "- 첫 응답은",
        "- Core 4 전체를 모든 세션에 읽는다.\n- 첫 응답은",
    );
    assert.match(
        validate({ agentsSource }).join("\n"),
        /Core 4 또는 ACK\/EVIDENCE/,
    );
});

test("요청 유형 누락을 거부한다", () => {
    const agentsSource = baseAgentsSource.replace(
        "| `리뷰` | 고정된 대상을 read-only로 평가 | 근거 있는 Finding 또는 `No Findings`; 요청 없이는 수정 금지 |\n",
        "",
    );
    assert.match(
        validate({ agentsSource }).join("\n"),
        /요청 유형은 다음 순서의 폐쇄형 값/,
    );
});

test("요청 유형과 파일 변경 권한의 결합을 거부한다", () => {
    const agentsSource = baseAgentsSource.replace(
        "사용자가 변경까지 명시하지 않으면 파일 변경 권한을 포함하지 않는다",
        "필요하면 파일을 변경한다",
    );
    assert.match(
        validate({ agentsSource }).join("\n"),
        /요청 유형 안전 규칙에 필수 값이 없습니다/,
    );
});

test("권한 행 누락을 거부한다", () => {
    const agentsSource = baseAgentsSource.replace(
        "| deploy | 별도 명시 요청 |\n",
        "",
    );
    assert.match(
        validate({ agentsSource }).join("\n"),
        /권한은 다음 순서의 폐쇄형 값/,
    );
});

test("main 반영 권한 누락을 거부한다", () => {
    const agentsSource = baseAgentsSource.replace(
        "| merge/main integration | 별도 명시 요청 |\n",
        "",
    );
    assert.match(
        validate({ agentsSource }).join("\n"),
        /권한은 다음 순서의 폐쇄형 값/,
    );
});

test("reviewer 별도 승인 조건 누락을 거부한다", () => {
    const agentsSource = baseAgentsSource.replace(
        "| reviewer | 개인 또는 팀을 지정한 별도 명시 승인 |",
        "| reviewer | PR 생성 시 자동 요청 |",
    );
    assert.match(
        validate({ agentsSource }).join("\n"),
        /reviewer 권한에 필수 값이 없습니다/,
    );
});

test("force push와 삭제의 대상 승인 누락을 거부한다", () => {
    const agentsSource = baseAgentsSource.replace(
        "| force push·삭제 | 대상과 동작의 별도 명시 승인 |",
        "| force push·삭제 | 필요 시 실행 |",
    );
    assert.match(
        validate({ agentsSource }).join("\n"),
        /파괴적 권한에 필수 값이 없습니다/,
    );
});

test("ROUTE 필드 누락을 거부한다", () => {
    const agentsSource = baseAgentsSource.replace(" | 위험=<표면>", "");
    assert.match(
        validate({ agentsSource }).join("\n"),
        /ROUTE 실행 계약에 필수 값이 없습니다/,
    );
});

test("ROUTE 목표 단계 누락을 거부한다", () => {
    const agentsSource = baseAgentsSource.replace(
        " | 목표단계=<검증 완료|외부 작업 완료|main 반영 완료|배포 완료>",
        "",
    );
    assert.match(
        validate({ agentsSource }).join("\n"),
        /ROUTE 실행 계약에 필수 값이 없습니다/,
    );
});

test("registry와 다른 라우팅 표를 거부한다", () => {
    const agentsSource = baseAgentsSource.replace(
        "`content/policy/payment-ops-policy.md`",
        "`content/policy/matching-ops-policy.md`",
    );
    assert.match(
        validate({ agentsSource }).join("\n"),
        /current route와 다릅니다/,
    );
});

test("라우팅 대상 파일 누락을 거부한다", () => {
    const errors = validate({
        routeExists: (relativePath) =>
            relativePath !== "content/policy/payment-ops-policy.md",
    }).join("\n");
    assert.match(
        errors,
        /라우팅 문서가 존재하지 않습니다: content\/policy\/payment-ops-policy.md/,
    );
});

test("라우팅 대상의 필수 Gate heading 누락을 거부한다", () => {
    const errors = validate({
        readRouteSource: (relativePath) =>
            relativePath === "content/policy/code-review-policy.md"
                ? ""
                : readContent(relativePath),
    }).join("\n");
    assert.match(errors, /라우팅 필수 Gate heading이 없습니다/);
});

test("상태 순서 변경을 거부한다", () => {
    const agentsSource = baseAgentsSource.replace(
        "REVIEW -> VERIFY",
        "VERIFY -> REVIEW",
    );
    assert.match(
        validate({ agentsSource }).join("\n"),
        /작업 상태 순서는 BOOT -> CLASSIFY/,
    );
});

test("목표 단계 누락을 거부한다", () => {
    const agentsSource = baseAgentsSource.replace(
        "| `main 반영 완료` | 승인된 merge 뒤 원격 main ref의 반영 결과가 검증된 최종 후보와 일치하는 상태 | 요청에 merge/main integration 권한이 있음 |\n",
        "",
    );
    assert.match(
        validate({ agentsSource }).join("\n"),
        /목표 단계는 다음 순서의 폐쇄형 값/,
    );
});

test("목표 단계 선택 조건 누락을 거부한다", () => {
    const agentsSource = baseAgentsSource.replace(
        "| `배포 완료` | 승인된 대상 ref 또는 산출물의 deploy와 postcheck가 끝난 상태 | 요청에 deploy 권한이 있음 |",
        "| `배포 완료` | 승인된 대상 ref 또는 산출물의 deploy와 postcheck가 끝난 상태 | |",
    );
    assert.match(
        validate({ agentsSource }).join("\n"),
        /목표 단계의 완료·선택 조건은 비어 있을 수 없습니다/,
    );
});

test("리뷰 결과 만료 규칙 누락을 거부한다", () => {
    const agentsSource = baseAgentsSource.replace(
        "리뷰·검증 뒤 파일이 바뀌면 두 결과는 만료된다",
        "리뷰 뒤 파일 변경을 기록한다",
    );
    assert.match(
        validate({ agentsSource }).join("\n"),
        /실행과 완료 안전 규칙에 필수 값이 없습니다/,
    );
});

test("testing strategy의 최종 후보 Gate heading 누락을 거부한다", () => {
    const testingStrategySource = baseTestingStrategySource.replace(
        "### 로컬 최종 후보 검증",
        "### 후보 검증",
    );
    assert.match(
        validate({ testingStrategySource }).join("\n"),
        /로컬 최종 후보 검증/,
    );
});

test("README bootstrap 예시 누락을 거부한다", () => {
    const readmeSource = baseReadmeSource.replace(
        "# AGENTS (워크스페이스 전용)",
        "# Workspace",
    );
    assert.match(
        validate({ readmeSource }).join("\n"),
        /bootstrap 예시를 찾을 수 없습니다/,
    );
});

test("README 새 세션 안내 누락을 거부한다", () => {
    const readmeSource = baseReadmeSource.replace(
        "ACK: BOOT@YYYY-MM-DD",
        "BOOT 확인",
    );
    assert.match(
        validate({ readmeSource }).join("\n"),
        /README 새 세션 안내에 필수 값이 없습니다/,
    );
});

test("workspace root bootstrap drift를 거부한다", () => {
    const workspaceRootAgentsSource = baseWorkspaceRootAgentsSource.replace(
        "자동으로 전환하지 않는다",
        "자동으로 전환한다",
    );
    assert.match(
        validate({ workspaceRootAgentsSource }).join("\n"),
        /workspace root AGENTS\.md bootstrap 계약이 README 예시와 다릅니다/,
    );
});

function validate({
    agentsSource = baseAgentsSource,
    readmeSource = baseReadmeSource,
    testingStrategySource = baseTestingStrategySource,
    workspaceRootAgentsSource = null,
    routeExists = (relativePath) =>
        fs.existsSync(path.join(docsRoot, relativePath)),
    readRouteSource = readContent,
} = {}) {
    return validateAgentWorkflow({
        agentsSource,
        readmeSource,
        testingStrategySource,
        workspaceRootAgentsSource,
        routeExists,
        readRouteSource,
    });
}

function readContent(relativePath) {
    return fs.readFileSync(path.join(docsRoot, relativePath), "utf8");
}
