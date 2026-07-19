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
const testingStrategy = fs.readFileSync(
  path.join(docsRoot, "content", "policy", "testing-strategy.md"),
  "utf8",
);

test("local validation and full CI use the same static gate runner", () => {
  assert.equal(
    packageJson.scripts["validate:docs"],
    "yarn validate:docs-static && yarn lint:md && yarn build:docs",
  );
  assert.match(
    workflow,
    /- name: Validate full docs static gates\n\s+if: steps\.validation_mode\.outputs\.mode == 'full'\n\s+run: yarn validate:docs-static/,
  );
  assert.match(
    testingStrategy,
    /문서 공통 정적 검증\(로컬·full CI\): `yarn validate:docs-static`/,
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
