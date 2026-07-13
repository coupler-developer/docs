import { execFileSync, spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, it } from "node:test";
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";

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
  commitAll("base");
});

afterEach(() => {
  fs.rmSync(repoRoot, { recursive: true, force: true });
});

describe("release validation mode", () => {
  for (const status of ["planned", "pending", "in_progress"]) {
    it(`uses lightweight validation for a ${status}-only release record change`, () => {
      const base = git(["rev-parse", "HEAD"]);
      writeRecord(status);
      commitAll(`${status} release`);

      const result = runClassifier(base);

      assert.equal(result.status, 0, result.stdout + result.stderr);
      assert.equal(result.stdout.trim(), "lightweight");
    });
  }

  it("uses full validation for a released record", () => {
    const base = git(["rev-parse", "HEAD"]);
    writeRecord("released");
    commitAll("released evidence");

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

  it("uses full validation for ordinary docs changes", () => {
    const base = git(["rev-parse", "HEAD"]);
    fs.writeFileSync(path.join(repoRoot, "README.md"), "# Changed\n");
    commitAll("ordinary docs");

    const result = runClassifier(base);

    assert.equal(result.status, 0, result.stdout + result.stderr);
    assert.equal(result.stdout.trim(), "full");
  });
});

function writeRecord(status) {
  const releaseDir = path.join(repoRoot, "content", "releases");
  fs.mkdirSync(releaseDir, { recursive: true });
  fs.writeFileSync(
    path.join(releaseDir, "v9.9.0.md"),
    [
      "# Release",
      "",
      "```release-metadata",
      JSON.stringify({ schema: "release-metadata/v1", version: "v9.9.0", status }),
      "```",
      "",
    ].join("\n"),
  );
}

function runClassifier(base) {
  return spawnSync(
    process.execPath,
    [classifier, "--base-ref", base, "--head-ref", "HEAD"],
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
