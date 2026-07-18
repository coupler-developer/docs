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
    /- name: Validate release PR transition\n\s+if: github\.event_name == 'pull_request'/,
  );
});
