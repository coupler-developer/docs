import { execFileSync, spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, it } from "node:test";
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";

const scriptsRoot = path.dirname(fileURLToPath(import.meta.url));
const validator = path.join(scriptsRoot, "validate-release-pr-transition.mjs");
let repoRoot;

beforeEach(() => {
  repoRoot = fs.mkdtempSync(path.join(os.tmpdir(), "release-pr-transition-"));
  git(["init"]);
  git(["checkout", "-B", "main"]);
  git(["config", "user.email", "release-transition@example.invalid"]);
  git(["config", "user.name", "Release Transition Test"]);
  fs.writeFileSync(path.join(repoRoot, "README.md"), "# Test\n");
  commitAll("base");
});

afterEach(() => {
  fs.rmSync(repoRoot, { recursive: true, force: true });
});

describe("release PR transition validator", () => {
  it("passes a new pending then released record in one PR history", () => {
    const base = git(["rev-parse", "HEAD"]);
    git(["checkout", "-b", "docs/test/release"]);
    writeRecord(pendingMetadata());
    commitAll("pending release");
    writeRecord(releasedMetadata());
    commitAll("released evidence");

    const result = runValidator(base);

    assert.equal(result.status, 0, result.stdout + result.stderr);
    assert.match(result.stdout, /Release PR transition validation passed/);
  });

  it("rejects a new released record without a pending commit", () => {
    const base = git(["rev-parse", "HEAD"]);
    git(["checkout", "-b", "docs/test/direct-release"]);
    writeRecord(releasedMetadata());
    commitAll("direct released record");

    const result = runValidator(base);

    assert.notEqual(result.status, 0);
    assert.match(
      result.stderr,
      /a new released record must contain a pending commit in the same PR history/,
    );
  });

  it("rejects frozen service ref changes between pending and released", () => {
    const base = git(["rev-parse", "HEAD"]);
    git(["checkout", "-b", "docs/test/ref-change"]);
    writeRecord(pendingMetadata());
    commitAll("pending release");
    const released = releasedMetadata();
    released.versionMapping["coupler-api"].commit = "d".repeat(40);
    writeRecord(released);
    commitAll("changed release ref");

    const result = runValidator(base);

    assert.notEqual(result.status, 0);
    assert.match(
      result.stderr,
      /frozen release target changed at versionMapping\.coupler-api\.commit/,
    );
  });

  it("keeps legacy updates valid when the release record already exists on main", () => {
    writeRecord(releasedMetadata());
    commitAll("existing released record");
    const base = git(["rev-parse", "HEAD"]);
    git(["checkout", "-b", "docs/test/corrective-update"]);
    const corrected = releasedMetadata();
    corrected.scopeResults = { docs: { status: "released", evidence: {} } };
    writeRecord(corrected);
    commitAll("correct release evidence");

    const result = runValidator(base);

    assert.equal(result.status, 0, result.stdout + result.stderr);
  });
});

function pendingMetadata() {
  return {
    schema: "release-metadata/v1",
    version: "v9.9.0",
    status: "pending",
    releaseScopes: ["docs", "coupler-api"],
    extraRepoRefs: [],
    versionMapping: {
      docs: { tag: null, commit: null },
      "coupler-api": {
        tag: null,
        commit: "a".repeat(40),
      },
      "coupler-admin-web": { tag: null, commit: null },
      "coupler-mobile-app": {
        store: null,
        releaseTag: null,
        commit: null,
        nextPush: null,
      },
    },
    scopeResults: {
      docs: { status: "pending", evidence: {} },
      "coupler-api": {
        status: "pending",
        evidence: { deployment: null, smoke: null, rollback: "rollback plan" },
      },
    },
    apiContractCutover: null,
  };
}

function releasedMetadata() {
  const metadata = structuredClone(pendingMetadata());
  metadata.status = "released";
  metadata.versionMapping.docs.tag = "v9.9.0";
  metadata.versionMapping["coupler-api"].tag = "v9.9.0";
  metadata.scopeResults.docs.status = "released";
  metadata.scopeResults["coupler-api"] = {
    status: "released",
    evidence: {
      deployment: "production deployed",
      smoke: "HTTP 200",
      rollback: "rollback to previous tag",
    },
  };
  return metadata;
}

function writeRecord(metadata) {
  const releaseDir = path.join(repoRoot, "content", "releases");
  fs.mkdirSync(releaseDir, { recursive: true });
  fs.writeFileSync(
    path.join(releaseDir, "v9.9.0.md"),
    [
      "# Release",
      "",
      "```release-metadata",
      JSON.stringify(metadata, null, 2),
      "```",
      "",
    ].join("\n"),
  );
}

function runValidator(base) {
  return spawnSync(
    process.execPath,
    [validator, "--base-ref", base, "--head-ref", "HEAD"],
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
