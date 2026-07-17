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
  fs.mkdirSync(path.join(docsRoot, "content", "policy"), { recursive: true });
  writePolicy("policy/example.md");
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
    writePolicy("policy/added.md");
    writeAgents(["policy/example.md", "policy/added.md"]);

    const result = runValidator();

    assert.equal(result.status, 1, combinedOutput(result));
    assert.match(result.stderr, /policy\/added\.md: mkdocs\.yml nav에 문서 링크가 없습니다/);
  });

  it("rejects an added document missing from the AGENTS index", () => {
    writePolicy("policy/added.md");
    writeNav(["policy/example.md", "policy/added.md"]);

    const result = runValidator();

    assert.equal(result.status, 1, combinedOutput(result));
    assert.match(result.stderr, /policy\/added\.md: content\/AGENTS\.md 인덱스에 문서 링크가 없습니다/);
  });

  it("rejects invalid metadata introduced by a document modification", () => {
    writePolicy("policy/example.md", "invalid-status");

    const result = runValidator();

    assert.equal(result.status, 1, combinedOutput(result));
    assert.match(result.stderr, /허용되지 않은 기준 성격입니다: invalid-status/);
  });

  it("rejects a deleted document left in mkdocs nav", () => {
    deletePolicy("policy/example.md");
    writeAgents([]);

    const result = runValidator();

    assert.equal(result.status, 1, combinedOutput(result));
    assert.match(result.stderr, /mkdocs\.yml: 존재하지 않는 문서를 참조합니다: policy\/example\.md/);
  });

  it("rejects a deleted document left in the AGENTS index", () => {
    deletePolicy("policy/example.md");
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
    deletePolicy("policy/example.md");
    writeNav([]);
    writeAgents([]);

    const result = runValidator();

    assert.equal(result.status, 0, combinedOutput(result));
    assert.match(result.stdout, /docs 구조 검증 통과: 0개 문서/);
  });
});

function writePolicy(relativePath, status = "as-is") {
  const targetPath = path.join(docsRoot, "content", relativePath);
  fs.mkdirSync(path.dirname(targetPath), { recursive: true });
  fs.writeFileSync(
    targetPath,
    `# Example Policy

## 문서 역할

- 역할: \`규범\`
- 문서 종류: \`policy\`
- 충돌 시 우선 문서: 이 문서
- 기준 성격: \`${status}\`
`,
  );
}

function deletePolicy(relativePath) {
  fs.rmSync(path.join(docsRoot, "content", relativePath));
}

function writeNav(relativePaths) {
  const lines = ["site_name: Test Docs", "nav:"];
  for (const relativePath of relativePaths) {
    lines.push(`  - Document: ${relativePath}`);
  }
  fs.writeFileSync(path.join(docsRoot, "mkdocs.yml"), `${lines.join("\n")}\n`);
}

function writeAgents(relativePaths) {
  const lines = ["# AGENTS", ""];
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
