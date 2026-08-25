import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";

import {
  docsTagPreparationPaths,
  validateDocsReleaseTagProvenance,
  validateDocsReleaseTagReady,
} from "./validate-docs-release-tag-ready.mjs";

const scriptsRoot = path.dirname(fileURLToPath(import.meta.url));
const validator = path.join(scriptsRoot, "validate-docs-release-tag-ready.mjs");

describe("docs release tag readiness", () => {
  it("accepts a released record with a released docs scope and exact tag", () => {
    assert.deepEqual(validateDocsReleaseTagReady(recordSource(), "v9.9.0"), []);
  });

  it("rejects a pending release or pending docs scope", () => {
    assert(
      validateDocsReleaseTagReady(
        recordSource({ status: "pending", docsStatus: "pending" }),
        "v9.9.0",
      ).some((error) => /requires released metadata status/.test(error)),
    );
    assert(
      validateDocsReleaseTagReady(recordSource({ docsStatus: "pending" }), "v9.9.0")
        .some((error) => /requires released docs scope/.test(error)),
    );
  });

  it("rejects a mismatched version mapping tag", () => {
    assert(
      validateDocsReleaseTagReady(recordSource({ mappedTag: "v9.9.1" }), "v9.9.0")
        .some((error) => /tag mapping must equal v9\.9\.0/.test(error)),
    );
  });
});

describe("docs release tag provenance", () => {
  it("keeps the tag-preparation path allowset exact", () => {
    assert.deepEqual([...docsTagPreparationPaths].sort(), [
      ".github/scripts/generate-release-notes.sh",
      "content/flows/cross-project/production-deploy-command-runbook.md",
      "content/policy/release-process.md",
      "content/policy/release-tag-policy.md",
      "scripts/generate-release-notes.test.mjs",
      "scripts/validate-docs-release-tag-ready.mjs",
      "scripts/validate-docs-release-tag-ready.test.mjs",
    ]);
  });

  it("accepts the exact release record commit", () => {
    assert.deepEqual(validateDocsReleaseTagProvenance({
      releaseRecordCommit: "record",
      candidateCommit: "record",
      changedPaths: [],
    }), []);
  });

  it("accepts a closed tag-preparation descendant", () => {
    assert.deepEqual(validateDocsReleaseTagProvenance({
      releaseRecordCommit: "record",
      candidateCommit: "candidate",
      changedPaths: [
        ".github/scripts/generate-release-notes.sh",
        "content/policy/release-process.md",
        "scripts/validate-docs-release-tag-ready.mjs",
      ],
    }), []);
  });

  it("rejects an empty or out-of-scope descendant", () => {
    assert(
      validateDocsReleaseTagProvenance({
        releaseRecordCommit: "record",
        candidateCommit: "candidate",
        changedPaths: [],
      }).some((error) => /without a tag-preparation change/.test(error)),
    );
    assert(
      validateDocsReleaseTagProvenance({
        releaseRecordCommit: "record",
        candidateCommit: "candidate",
        changedPaths: ["content/releases/v9.9.0.md", "content/architecture/example.md"],
      }).some((error) => /forbidden paths/.test(error)),
    );
  });
});

describe("docs release tag provenance history", () => {
  it("accepts allowed tag-preparation commits after the Final Record Gate", (context) => {
    const repository = createTagRepository(context);
    write(repository, ".github/scripts/generate-release-notes.sh", "fixed\n");
    commit(repository, "fix release notes");

    const result = runValidator(repository);
    assert.equal(result.status, 0, result.stderr);
  });

  it("rejects a release record rewrite after the Final Record Gate", (context) => {
    const repository = createTagRepository(context);
    write(
      repository,
      "content/releases/v9.9.0.md",
      recordSource().replace('"summary":"docs"', '"summary":"rewritten"'),
    );
    commit(repository, "rewrite final record");

    const result = runValidator(repository);
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /forbidden paths: content\/releases\/v9\.9\.0\.md/);
  });

  it("rejects a forbidden path even when a later commit reverts it", (context) => {
    const repository = createTagRepository(context);
    write(repository, "README.md", "temporary change\n");
    commit(repository, "change forbidden path");
    write(repository, "README.md", "initial\n");
    commit(repository, "revert forbidden path");

    const result = runValidator(repository);
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /forbidden paths: README\.md/);
  });
});

function recordSource({
  status = "released",
  docsStatus = "released",
  mappedTag = "v9.9.0",
} = {}) {
  return [
    "```release-metadata",
    JSON.stringify({
      version: "v9.9.0",
      status,
      versionMapping: { docs: { tag: mappedTag, commit: null } },
      scopeResults: { docs: { status: docsStatus, summary: "docs", evidence: {} } },
    }),
    "```",
  ].join("\n");
}

function createTagRepository(context) {
  const repository = fs.mkdtempSync(path.join(os.tmpdir(), "docs-tag-ready-"));
  context.after(() => fs.rmSync(repository, { recursive: true, force: true }));
  run(repository, "git", ["init", "-b", "main"]);
  run(repository, "git", ["config", "user.name", "Docs Test"]);
  run(repository, "git", ["config", "user.email", "docs-test@example.com"]);
  write(repository, "README.md", "initial\n");
  write(repository, "content/releases/v9.9.0.md", recordSource());
  commit(repository, "terminal Final Record Gate");
  return repository;
}

function write(repository, relativePath, source) {
  const absolutePath = path.join(repository, relativePath);
  fs.mkdirSync(path.dirname(absolutePath), { recursive: true });
  fs.writeFileSync(absolutePath, source);
}

function commit(repository, message) {
  run(repository, "git", ["add", "."]);
  run(repository, "git", ["commit", "-m", message]);
}

function runValidator(repository) {
  return spawnSync(
    process.execPath,
    [validator, "--tag", "v9.9.0", "--ref", "HEAD"],
    { cwd: repository, encoding: "utf8" },
  );
}

function run(repository, command, args) {
  const result = spawnSync(command, args, { cwd: repository, encoding: "utf8" });
  assert.equal(result.status, 0, result.stderr);
  return result;
}
