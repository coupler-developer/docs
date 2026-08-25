import { execFileSync, spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, it } from "node:test";
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";

import { initializeReleaseRecord } from "./init-release-record.mjs";

const scriptsRoot = path.dirname(fileURLToPath(import.meta.url));
const classifier = path.join(scriptsRoot, "release-validation-mode.mjs");
let repoRoot;

beforeEach(() => {
  repoRoot = fs.mkdtempSync(path.join(os.tmpdir(), "release-validation-mode-"));
  git(["init"]);
  git(["checkout", "-B", "main"]);
  git(["config", "user.email", "release-mode@example.invalid"]);
  git(["config", "user.name", "Release Mode Test"]);
  fs.writeFileSync(path.join(repoRoot, "README.md"), "# Test\n");
  writeInitializerFixture();
  commitAll("base");
});

afterEach(() => {
  fs.rmSync(repoRoot, { recursive: true, force: true });
});

describe("release validation mode", () => {
  for (const status of ["planned", "pending", "in_progress"]) {
    it(`uses lightweight validation for an exact ${status} initializer change set`, () => {
      const base = git(["rev-parse", "HEAD"]);
      writeRecord(status);
      commitAll(`${status} release`);

      const result = runClassifier(base);

      assert.equal(result.status, 0, result.stdout + result.stderr);
      assert.equal(result.stdout.trim(), "lightweight");
    });
  }

  it("rejects a ready PR while a changed release record is nonterminal", () => {
    const base = git(["rev-parse", "HEAD"]);
    writeRecord("pending");
    commitAll("pending release");

    const result = runClassifier(base, { prDraft: false });

    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /pending release records must remain in a draft PR/);
  });

  it("allows a draft PR to validate a nonterminal release record", () => {
    const base = git(["rev-parse", "HEAD"]);
    writeRecord("pending");
    commitAll("pending release");

    const result = runClassifier(base, { prDraft: true });

    assert.equal(result.status, 0, result.stdout + result.stderr);
    assert.equal(result.stdout.trim(), "lightweight");
  });

  it("uses full validation for a released record", () => {
    const base = git(["rev-parse", "HEAD"]);
    writeRecord("released");
    commitAll("released evidence");

    const result = runClassifier(base, { prDraft: false });

    assert.equal(result.status, 0, result.stdout + result.stderr);
    assert.equal(result.stdout.trim(), "full");
  });

  it("uses full validation without parsing a release record already present at base", () => {
    writeRecord("released");
    commitAll("published release");
    const base = git(["rev-parse", "HEAD"]);
    fs.writeFileSync(
      path.join(repoRoot, "content", "releases", "v9.9.0.md"),
      "# opaque historical bytes\n",
    );
    commitAll("attempt historical edit");

    const result = runClassifier(base);

    assert.equal(result.status, 0, result.stdout + result.stderr);
    assert.equal(result.stdout.trim(), "full");
  });

  it("uses full validation when policy or automation files change with pending metadata", () => {
    const base = git(["rev-parse", "HEAD"]);
    writeRecord("pending");
    fs.mkdirSync(path.join(repoRoot, "content", "policy"), { recursive: true });
    fs.writeFileSync(path.join(repoRoot, "content", "policy", "release.md"), "# Policy\n");
    commitAll("pending release and policy");

    const result = runClassifier(base);

    assert.equal(result.status, 0, result.stdout + result.stderr);
    assert.equal(result.stdout.trim(), "full");
  });

  it("uses full validation when an initializer companion file is altered", () => {
    const base = git(["rev-parse", "HEAD"]);
    writeRecord("pending");
    fs.appendFileSync(path.join(repoRoot, "mkdocs.yml"), "  - Unexpected: README.md\n");
    commitAll("alter generated companion");

    const result = runClassifier(base);

    assert.equal(result.status, 0, result.stdout + result.stderr);
    assert.equal(result.stdout.trim(), "full");
  });

  it("uses full validation when an initializer companion file is missing", () => {
    const base = git(["rev-parse", "HEAD"]);
    writeRecord("pending");
    git(["checkout", "--", "mkdocs.yml"]);
    commitAll("omit generated companion");

    const result = runClassifier(base);

    assert.equal(result.status, 0, result.stdout + result.stderr);
    assert.equal(result.stdout.trim(), "full");
  });

  it("uses full validation for ordinary docs changes", () => {
    const base = git(["rev-parse", "HEAD"]);
    fs.writeFileSync(path.join(repoRoot, "README.md"), "# Changed\n");
    commitAll("ordinary docs");

    const result = runClassifier(base);

    assert.equal(result.status, 0, result.stdout + result.stderr);
    assert.equal(result.stdout.trim(), "full");
  });

  it("uses full validation for a deleted policy", () => {
    const policyDir = path.join(repoRoot, "content", "policy");
    const policyPath = path.join(policyDir, "example.md");
    fs.mkdirSync(policyDir, { recursive: true });
    fs.writeFileSync(policyPath, "# Policy\n");
    commitAll("add policy");
    const base = git(["rev-parse", "HEAD"]);
    fs.rmSync(policyPath);
    commitAll("delete policy");

    const result = runClassifier(base);

    assert.equal(result.status, 0, result.stdout + result.stderr);
    assert.equal(result.stdout.trim(), "full");
  });
});

function writeRecord(status) {
  initializeReleaseRecord({ docsRoot: repoRoot, version: "v9.9.0" });
  const releasePath = path.join(repoRoot, "content", "releases", "v9.9.0.md");
  const source = fs.readFileSync(releasePath, "utf8");
  fs.writeFileSync(
    releasePath,
    source.replaceAll('"status": "planned"', `"status": "${status}"`),
  );
}

function writeInitializerFixture() {
  write(
    "content/templates/release-record-template.md",
    [
      "# X.Y.Z 릴리스 실행 기록",
      "",
      "```release-metadata",
      JSON.stringify({
        version: "vX.Y.Z",
        status: "planned",
        releaseScopes: ["docs"],
        extraRepoRefs: [],
        versionMapping: {
          docs: { tag: null, commit: null },
          "coupler-api": { tag: null, commit: null },
          "coupler-admin-web": { tag: null, commit: null },
          "coupler-mobile-app": {
            store: { android: null, ios: null },
            nextPush: null,
            commit: null,
          },
        },
        scopeResults: {
          docs: {
            status: "planned",
            summary: "릴리스 기록 준비",
            evidence: {},
          },
        },
        apiContractCutover: null,
      }, null, 2),
      "```",
      "",
    ].join("\n"),
  );
  write(
    "document-lifecycle-registry.json",
    `${JSON.stringify({
      schemaVersion: 2,
      documents: [
        {
          id: "releases.v9.8.0",
          path: "releases/v9.8.0.md",
          routing: "historical",
        },
      ],
      routes: [],
    }, null, 4)}\n`,
  );
  write(
    "document-retirement-ledger.json",
    `${JSON.stringify({ schemaVersion: 1, retirements: [] }, null, 4)}\n`,
  );
  write(
    "content/AGENTS.md",
    "# AGENTS\n\n### Releases\n\n- [9.8.0 릴리스 실행 기록](releases/v9.8.0.md)\n",
  );
  write(
    "mkdocs.yml",
    "nav:\n  - Releases:\n      - 9.8.0 릴리스 실행 기록: releases/v9.8.0.md\n",
  );
}

function write(relativePath, source) {
  const filePath = path.join(repoRoot, relativePath);
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, source);
}

function runClassifier(base, { prDraft = null } = {}) {
  const args = [classifier, "--base-ref", base, "--head-ref", "HEAD"];
  if (prDraft !== null) {
    args.push("--pr-draft", String(prDraft));
  }
  return spawnSync(
    process.execPath,
    args,
    { cwd: repoRoot, encoding: "utf8" },
  );
}

function commitAll(message) {
  git(["add", "."]);
  git(["commit", "-m", message]);
}

function git(args) {
  return execFileSync("git", args, {
    cwd: repoRoot,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  }).trim();
}
