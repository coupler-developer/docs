import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, it } from "node:test";
import { fileURLToPath } from "node:url";

const scriptsRoot = path.dirname(fileURLToPath(import.meta.url));
const validator = path.join(scriptsRoot, "validate-docs-structure.mjs");
let docsRoot;

beforeEach(() => {
  docsRoot = fs.mkdtempSync(path.join(os.tmpdir(), "docs-structure-"));
  fs.mkdirSync(path.join(docsRoot, "content"), { recursive: true });
  fs.writeFileSync(path.join(docsRoot, "content", "README.md"), "# Home\n");
  writeDocument("policy/example.md", {
    kind: "policy",
    role: "규범",
    status: "as-is",
  });
  writeNav(["policy/example.md"]);
  writeAgents(["policy/example.md"]);
});

afterEach(() => {
  fs.rmSync(docsRoot, { recursive: true, force: true });
});

describe("docs structure validation", () => {
  it("allows a synchronized document tree", () => {
    const result = runValidator();

    assert.equal(result.status, 0, combinedOutput(result));
    assert.match(result.stdout, /docs 구조 검증 통과/);
  });

  it("rejects an added document missing from mkdocs nav", () => {
    writeDocument("policy/added.md", {
      kind: "policy",
      role: "규범",
      status: "as-is",
    });
    writeAgents(["policy/example.md", "policy/added.md"]);

    const result = runValidator();

    assert.equal(result.status, 1, combinedOutput(result));
    assert.match(result.stderr, /policy\/added\.md: mkdocs\.yml nav에 문서 링크가 없습니다/);
  });

  it("rejects an added document missing from the AGENTS index", () => {
    writeDocument("policy/added.md", {
      kind: "policy",
      role: "규범",
      status: "as-is",
    });
    writeNav(["policy/example.md", "policy/added.md"]);

    const result = runValidator();

    assert.equal(result.status, 1, combinedOutput(result));
    assert.match(result.stderr, /policy\/added\.md: content\/AGENTS\.md 인덱스에 문서 링크가 없습니다/);
  });

  it("rejects invalid metadata status", () => {
    writeDocument("policy/example.md", {
      kind: "policy",
      role: "규범",
      status: "invalid-status",
    });

    const result = runValidator();

    assert.equal(result.status, 1, combinedOutput(result));
    assert.match(result.stderr, /허용되지 않은 기준 성격입니다: invalid-status/);
  });

  it("rejects a role that does not match the document kind", () => {
    writeDocument("policy/example.md", {
      kind: "policy",
      role: "설명",
      status: "as-is",
    });

    const result = runValidator();

    assert.equal(result.status, 1, combinedOutput(result));
    assert.match(result.stderr, /문서 종류 'policy'의 역할은 '규범'이어야 합니다/);
  });

  it("rejects a document kind that does not match its directory", () => {
    writeDocument("policy/example.md", {
      kind: "flow",
      role: "시나리오",
      status: "as-is",
    });

    const result = runValidator();

    assert.equal(result.status, 1, combinedOutput(result));
    assert.match(result.stderr, /디렉터리 분류\(policy\)에서 문서 종류 'flow'을 사용할 수 없습니다/);
  });

  it("rejects an unregistered top-level document directory", () => {
    writeDocument("notes/example.md", {
      kind: "architecture",
      role: "설명",
      status: "as-is",
    });
    writeNav(["policy/example.md", "notes/example.md"]);
    writeAgents(["policy/example.md", "notes/example.md"]);

    const result = runValidator();

    assert.equal(result.status, 1, combinedOutput(result));
    assert.match(result.stderr, /허용되지 않은 최상위 문서 디렉터리입니다: notes/);
  });

  it("does not count links outside the AGENTS document index", () => {
    writeDocument("policy/added.md", {
      kind: "policy",
      role: "규범",
      status: "as-is",
    });
    writeNav(["policy/example.md", "policy/added.md"]);
    writeAgents(["policy/example.md"], {
      rulePaths: ["policy/added.md"],
    });

    const result = runValidator();

    assert.equal(result.status, 1, combinedOutput(result));
    assert.match(result.stderr, /policy\/added\.md: content\/AGENTS\.md 인덱스에 문서 링크가 없습니다/);
  });

  it("does not count Markdown paths outside the mkdocs nav section", () => {
    writeDocument("policy/added.md", {
      kind: "policy",
      role: "규범",
      status: "as-is",
    });
    writeAgents(["policy/example.md", "policy/added.md"]);
    fs.appendFileSync(
      path.join(docsRoot, "mkdocs.yml"),
      "extra_config:\n  - Reference: policy/added.md\n",
    );

    const result = runValidator();

    assert.equal(result.status, 1, combinedOutput(result));
    assert.match(result.stderr, /policy\/added\.md: mkdocs\.yml nav에 문서 링크가 없습니다/);
  });

  it("requires exactly one mkdocs nav section", () => {
    fs.writeFileSync(path.join(docsRoot, "mkdocs.yml"), "site_name: Test Docs\n");

    const result = runValidator();

    assert.equal(result.status, 1, combinedOutput(result));
    assert.match(result.stderr, /최상위 'nav:' 절은 정확히 1개여야 합니다/);
  });

  it("rejects duplicate nav and AGENTS index links", () => {
    writeNav(["policy/example.md", "policy/example.md"]);
    writeAgents(["policy/example.md", "policy/example.md"]);

    const result = runValidator();

    assert.equal(result.status, 1, combinedOutput(result));
    assert.match(result.stderr, /mkdocs\.yml nav: 중복 문서 링크/);
    assert.match(result.stderr, /content\/AGENTS\.md 문서 인덱스: 중복 문서 링크/);
  });

  it("requires exactly one AGENTS document index section", () => {
    fs.writeFileSync(
      path.join(docsRoot, "content", "AGENTS.md"),
      "# AGENTS\n\n- [Document](policy/example.md)\n",
    );

    const result = runValidator();

    assert.equal(result.status, 1, combinedOutput(result));
    assert.match(result.stderr, /'## 문서 인덱스' 절은 정확히 1개여야 합니다/);
  });

  it("rejects templates registered as navigation or index documents", () => {
    writeDocument("templates/policy-template.md", {
      kind: "policy",
      role: "규범",
      status: "as-is",
    });
    writeNav(["policy/example.md", "templates/policy-template.md"]);
    writeAgents(["policy/example.md", "templates/policy-template.md"]);

    const result = runValidator();

    assert.equal(result.status, 1, combinedOutput(result));
    assert.match(result.stderr, /mkdocs\.yml nav에 등록할 수 없는 문서 링크/);
    assert.match(result.stderr, /content\/AGENTS\.md 인덱스에 등록할 수 없는 문서 링크/);
  });

  it("rejects non-documentation IPv4 and database identity literals", () => {
    writeDocument("policy/example.md", {
      kind: "policy",
      role: "규범",
      status: "as-is",
      body: [
        "- host: `198.18.0.10`",
        "- database: `database_name=coupler`, `server_id=1234`",
        '- identity: `"server_hostname": "ip-10-0-0-1"`, `"server_version": "10.6.24-MariaDB-log"`',
      ].join("\n"),
    });

    const result = runValidator();

    assert.equal(result.status, 1, combinedOutput(result));
    assert.match(result.stderr, /실제 환경으로 오인 가능한 IPv4 literal/);
    assert.match(result.stderr, /DB database_name literal/);
    assert.match(result.stderr, /DB server_id literal/);
    assert.match(result.stderr, /DB server_hostname literal/);
    assert.match(result.stderr, /DB server_version literal/);
  });

  it("allows loopback, emulator, and documentation-only IPv4 addresses", () => {
    writeDocument("policy/example.md", {
      kind: "policy",
      role: "규범",
      status: "as-is",
      body: "- local: `127.0.0.1`, `10.0.2.2`, `10.0.3.2`, `0.0.0.0`\n- examples: `192.0.2.10`, `198.51.100.20`, `203.0.113.30`",
    });

    const result = runValidator();

    assert.equal(result.status, 0, combinedOutput(result));
  });

  it("rejects a transition document without a tracking boundary", () => {
    writeDocument("policy/example.md", {
      kind: "policy",
      role: "규범",
      status: "transition",
    });

    const result = runValidator();

    assert.equal(result.status, 1, combinedOutput(result));
    assert.match(result.stderr, /완료 조건을 추적하는 문서 링크 또는 정책 내부 전환 추적/);
  });

  it("does not treat an unrelated flow link as transition tracking", () => {
    writeDocument("policy/example.md", {
      kind: "policy",
      role: "규범",
      status: "transition",
      body: "- [관련 흐름](../flows/example.md)",
    });

    const result = runValidator();

    assert.equal(result.status, 1, combinedOutput(result));
    assert.match(result.stderr, /완료 조건을 추적하는 문서 링크 또는 정책 내부 전환 추적/);
  });

  it("does not match a filename that only contains a tracking directory name", () => {
    writeDocument("policy/example.md", {
      kind: "policy",
      role: "규범",
      status: "transition",
      body: "전환 완료는 [관련 문서](../policy/workflows.md)에서 추적한다.",
    });

    const result = runValidator();

    assert.equal(result.status, 1, combinedOutput(result));
    assert.match(result.stderr, /완료 조건을 추적하는 문서 링크 또는 정책 내부 전환 추적/);
  });

  it("allows a transition document with an explicit tracking link", () => {
    writeDocument("policy/example.md", {
      kind: "policy",
      role: "규범",
      status: "transition",
      body: "전환 완료는 [기술 부채](../technical-debt/technical-debt.md)에서 추적한다.",
    });

    const result = runValidator();

    assert.equal(result.status, 0, combinedOutput(result));
  });

  it("allows a policy to own explicit transition tracking", () => {
    writeDocument("policy/example.md", {
      kind: "policy",
      role: "규범",
      status: "transition",
      body: "- 완료 조건: 전환 검증 통과\n- 전환 추적: 이 문서와 릴리스 기록을 사용한다.",
    });

    const result = runValidator();

    assert.equal(result.status, 0, combinedOutput(result));
  });

  it("validates standalone template metadata without nav registration", () => {
    writeDocument("templates/policy-template.md", {
      kind: "policy",
      role: "설명",
      status: "<as-is | to-be | transition 중 하나>",
    });

    const result = runValidator();

    assert.equal(result.status, 1, combinedOutput(result));
    assert.match(result.stderr, /templates\/policy-template\.md: 문서 종류 'policy'의 역할은 '규범'/);
  });

  it("allows the documented template status placeholder", () => {
    writeDocument("templates/policy-template.md", {
      kind: "policy",
      role: "규범",
      status: "<as-is | to-be | transition 중 하나>",
    });

    const result = runValidator();

    assert.equal(result.status, 0, combinedOutput(result));
  });

  it("allows the insertion-only cutover template fragment", () => {
    const targetPath = path.join(
      docsRoot,
      "content",
      "templates",
      "api-contract-cutover-gate-template.md",
    );
    fs.mkdirSync(path.dirname(targetPath), { recursive: true });
    fs.writeFileSync(targetPath, "# 삽입용 조각\n");

    const result = runValidator();

    assert.equal(result.status, 0, combinedOutput(result));
  });

  it("rejects a deleted document left in mkdocs nav", () => {
    deleteDocument("policy/example.md");
    writeAgents([]);

    const result = runValidator();

    assert.equal(result.status, 1, combinedOutput(result));
    assert.match(result.stderr, /mkdocs\.yml: 존재하지 않는 문서를 참조합니다: policy\/example\.md/);
  });

  it("rejects a deleted document left in the AGENTS index", () => {
    deleteDocument("policy/example.md");
    writeNav([]);

    const result = runValidator();

    assert.equal(result.status, 1, combinedOutput(result));
    assert.match(result.stderr, /content\/AGENTS\.md: 존재하지 않는 문서를 참조합니다: policy\/example\.md/);
  });

  it("rejects stale paths after a document rename", () => {
    fs.renameSync(
      path.join(docsRoot, "content", "policy", "example.md"),
      path.join(docsRoot, "content", "policy", "renamed.md"),
    );

    const result = runValidator();
    const output = combinedOutput(result);

    assert.equal(result.status, 1, output);
    assert.match(output, /policy\/renamed\.md: mkdocs\.yml nav에 문서 링크가 없습니다/);
    assert.match(output, /존재하지 않는 문서를 참조합니다: policy\/example\.md/);
  });

  it("allows a deletion after nav and AGENTS synchronization", () => {
    deleteDocument("policy/example.md");
    writeNav([]);
    writeAgents([]);

    const result = runValidator();

    assert.equal(result.status, 0, combinedOutput(result));
    assert.match(result.stdout, /docs 구조 검증 통과: 0개 문서/);
  });
});

function writeDocument(relativePath, { kind, role, status, body = "" }) {
  const targetPath = path.join(docsRoot, "content", relativePath);
  fs.mkdirSync(path.dirname(targetPath), { recursive: true });
  fs.writeFileSync(
    targetPath,
    `# Example

## 문서 역할

- 역할: \`${role}\`
- 문서 종류: \`${kind}\`
- 충돌 시 우선 문서: 이 문서
- 기준 성격: \`${status}\`

${body}
`,
  );
}

function deleteDocument(relativePath) {
  fs.rmSync(path.join(docsRoot, "content", relativePath));
}

function writeNav(relativePaths) {
  const lines = [
    "site_name: Test Docs",
    "nav:",
    "  - Home: README.md",
    "  - Workspace AGENTS: AGENTS.md",
  ];
  for (const relativePath of relativePaths) {
    lines.push(`  - Document: ${relativePath}`);
  }
  fs.writeFileSync(path.join(docsRoot, "mkdocs.yml"), `${lines.join("\n")}\n`);
}

function writeAgents(relativePaths, { rulePaths = [] } = {}) {
  const lines = ["# AGENTS", ""];
  for (const relativePath of rulePaths) {
    lines.push(`- [Rule](${relativePath})`);
  }
  if (rulePaths.length > 0) {
    lines.push("");
  }
  lines.push("## 문서 인덱스", "", "- [Setup](README.md)");
  for (const relativePath of relativePaths) {
    lines.push(`- [Document](${relativePath})`);
  }
  fs.writeFileSync(
    path.join(docsRoot, "content", "AGENTS.md"),
    `${lines.join("\n")}\n`,
  );
}

function runValidator() {
  return spawnSync(process.execPath, [validator], {
    cwd: docsRoot,
    encoding: "utf8",
  });
}

function combinedOutput(result) {
  return `${result.stdout}${result.stderr}`;
}
