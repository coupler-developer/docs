import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, it } from "node:test";
import { fileURLToPath } from "node:url";

const scriptsRoot = path.dirname(fileURLToPath(import.meta.url));
const validator = path.join(scriptsRoot, "validate-docs-structure.mjs");
const lifecycleVerdictOperations = [
  "추가",
  "수정",
  "삭제",
  "이동",
  "개명",
  "분리",
  "통합",
];
let docsRoot;

beforeEach(() => {
  docsRoot = fs.mkdtempSync(path.join(os.tmpdir(), "docs-structure-"));
  fs.mkdirSync(path.join(docsRoot, "content", "policy"), { recursive: true });
  writePolicy("policy/example.md");
  writeNav(["policy/example.md"]);
  writeAgents(["policy/example.md"]);
  writeStabilityReviewTemplate(lifecycleVerdictOperations);
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

  it("allows lifecycle verdict rows in a different order", () => {
    writeStabilityReviewTemplate([...lifecycleVerdictOperations].reverse());

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

  it("rejects a missing docs stability review template", () => {
    fs.rmSync(stabilityReviewTemplatePath());

    const result = runValidator();

    assert.equal(result.status, 1, combinedOutput(result));
    assert.match(result.stderr, /필수 안정성 리뷰 템플릿이 없습니다/);
  });

  it("rejects a stability review template without lifecycle evidence", () => {
    fs.writeFileSync(stabilityReviewTemplatePath(), "# Docs Stability Review\n");

    const result = runValidator();

    assert.equal(result.status, 1, combinedOutput(result));
    assert.match(result.stderr, /문서 생명주기 증빙 절이 없습니다/);
  });

  it("rejects lifecycle evidence without a table", () => {
    writeRawStabilityReviewTemplate(["검토 결과 없음"]);

    const result = runValidator();

    assert.equal(result.status, 1, combinedOutput(result));
    assert.match(result.stderr, /문서 생명주기 증빙 표가 없습니다/);
  });

  it("rejects a lifecycle table missing the verdict column", () => {
    writeStabilityReviewTemplate(lifecycleVerdictOperations, {
      header: ["변경 작업", "근거"],
      rowCells: (operation) => [operation, ""],
      separator: ["---", "---"],
    });

    const result = runValidator();
    const output = combinedOutput(result);

    assert.equal(result.status, 1, output);
    assert.match(output, /표 헤더는 '변경 작업 \| 판정 \| 근거' 3개 열이어야 합니다/);
    assert.match(output, /판정 행은 정확히 3개 셀이어야 합니다/);
  });

  it("rejects reordered lifecycle table headers", () => {
    writeStabilityReviewTemplate(lifecycleVerdictOperations, {
      header: ["변경 작업", "근거", "판정"],
    });

    const result = runValidator();

    assert.equal(result.status, 1, combinedOutput(result));
    assert.match(result.stderr, /표 헤더는 '변경 작업 \| 판정 \| 근거' 3개 열이어야 합니다/);
  });

  it("rejects renamed lifecycle table headers", () => {
    writeStabilityReviewTemplate(lifecycleVerdictOperations, {
      header: ["작업", "판정", "근거"],
    });

    const result = runValidator();

    assert.equal(result.status, 1, combinedOutput(result));
    assert.match(result.stderr, /표 헤더는 '변경 작업 \| 판정 \| 근거' 3개 열이어야 합니다/);
  });

  it("rejects extra lifecycle table header columns", () => {
    writeStabilityReviewTemplate(lifecycleVerdictOperations, {
      header: ["변경 작업", "판정", "근거", "조치"],
      rowCells: (operation) => [operation, "", "", ""],
      separator: ["---", "---", "---", "---"],
    });

    const result = runValidator();

    assert.equal(result.status, 1, combinedOutput(result));
    assert.match(result.stderr, /표 헤더는 '변경 작업 \| 판정 \| 근거' 3개 열이어야 합니다/);
  });

  it("rejects an invalid lifecycle table separator", () => {
    writeStabilityReviewTemplate(lifecycleVerdictOperations, {
      separator: ["---", "판정", "---"],
    });

    const result = runValidator();

    assert.equal(result.status, 1, combinedOutput(result));
    assert.match(
      result.stderr,
      /표 구분 행은 '--- \| --- \| ---' 형식의 3개 열이어야 합니다/,
    );
  });

  it("rejects lifecycle verdict rows with the wrong cell count", () => {
    writeStabilityReviewTemplate(lifecycleVerdictOperations, {
      rowCells: (operation) =>
        operation === "수정" ? [operation, ""] : [operation, "", ""],
    });

    const result = runValidator();

    assert.equal(result.status, 1, combinedOutput(result));
    assert.match(result.stderr, /판정 행은 정확히 3개 셀이어야 합니다 \(현재 2개\): '수정 \| '/);
  });

  it("rejects a missing lifecycle verdict row", () => {
    writeStabilityReviewTemplate(
      lifecycleVerdictOperations.filter((operation) => operation !== "삭제"),
    );

    const result = runValidator();

    assert.equal(result.status, 1, combinedOutput(result));
    assert.match(
      result.stderr,
      /'삭제' 판정 행은 각각 정확히 1개여야 합니다 \(현재 0개\)/,
    );
  });

  it("rejects review criteria duplicated in operation cells", () => {
    writeStabilityReviewTemplate([
      "추가: 기존 문서 검색",
      ...lifecycleVerdictOperations.slice(1),
    ]);

    const result = runValidator();
    const output = combinedOutput(result);

    assert.equal(result.status, 1, output);
    assert.match(
      output,
      /허용되지 않은 문서 생명주기 판정 행입니다: '추가: 기존 문서 검색'/,
    );
    assert.match(
      output,
      /'추가' 판정 행은 각각 정확히 1개여야 합니다 \(현재 0개\)/,
    );
  });

  it("rejects combined lifecycle verdict rows", () => {
    writeStabilityReviewTemplate([
      "추가",
      "수정",
      "삭제",
      "이동/개명",
      "분리/통합",
    ]);

    const result = runValidator();
    const output = combinedOutput(result);

    assert.equal(result.status, 1, output);
    assert.match(output, /허용되지 않은 문서 생명주기 판정 행입니다: '이동\/개명'/);
    assert.match(output, /허용되지 않은 문서 생명주기 판정 행입니다: '분리\/통합'/);
  });

  it("rejects an extra combined row beside separate lifecycle rows", () => {
    writeStabilityReviewTemplate([
      ...lifecycleVerdictOperations,
      "이동/개명",
    ]);

    const result = runValidator();

    assert.equal(result.status, 1, combinedOutput(result));
    assert.match(
      result.stderr,
      /허용되지 않은 문서 생명주기 판정 행입니다: '이동\/개명'/,
    );
  });

  it("rejects duplicate lifecycle verdict rows", () => {
    writeStabilityReviewTemplate([...lifecycleVerdictOperations, "이동"]);

    const result = runValidator();

    assert.equal(result.status, 1, combinedOutput(result));
    assert.match(
      result.stderr,
      /'이동' 판정 행은 각각 정확히 1개여야 합니다 \(현재 2개\)/,
    );
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

function stabilityReviewTemplatePath() {
  return path.join(
    docsRoot,
    "content",
    "templates",
    "docs-stability-review-template.md",
  );
}

function writeStabilityReviewTemplate(
  operations,
  {
    header = ["변경 작업", "판정", "근거"],
    separator = ["---", "---", "---"],
    rowCells = (operation) => [operation, "", ""],
  } = {},
) {
  writeRawStabilityReviewTemplate([
    formatTableRow(header),
    formatTableRow(separator),
    ...operations.map((operation) => formatTableRow(rowCells(operation))),
  ]);
}

function writeRawStabilityReviewTemplate(sectionLines) {
  const targetPath = stabilityReviewTemplatePath();
  const lines = [
    "# Docs Stability Review",
    "",
    "## 문서 생명주기 증빙",
    "",
    ...sectionLines,
  ];

  fs.mkdirSync(path.dirname(targetPath), { recursive: true });
  fs.writeFileSync(targetPath, `${lines.join("\n")}\n`);
}

function formatTableRow(cells) {
  return `| ${cells.join(" | ")} |`;
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
