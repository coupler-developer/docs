import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const scriptsRoot = path.dirname(fileURLToPath(import.meta.url));
const docsRoot = path.dirname(scriptsRoot);
const generator = path.join(
  docsRoot,
  ".github",
  "scripts",
  "generate-release-notes.sh",
);

const execute = (command, args, cwd, environment = {}) =>
  spawnSync(command, args, {
    cwd,
    encoding: "utf8",
    env: { ...process.env, ...environment },
  });

const git = (repository, ...args) => {
  const result = execute("git", args, repository);
  assert.equal(result.status, 0, result.stderr);
  return result.stdout.trim();
};

const createRepository = (context) => {
  const repository = fs.mkdtempSync(
    path.join(os.tmpdir(), "release-notes-test-"),
  );
  context.after(() => fs.rmSync(repository, { recursive: true, force: true }));

  git(repository, "init", "-b", "main");
  git(repository, "config", "user.name", "Docs Test");
  git(repository, "config", "user.email", "docs-test@example.com");

  fs.writeFileSync(path.join(repository, "README.md"), "initial\n");
  git(repository, "add", "README.md");
  git(repository, "commit", "-m", "feat: initial");
  git(repository, "tag", "-a", "v1.0.0", "-m", "Release v1.0.0");

  fs.appendFileSync(path.join(repository, "README.md"), "preview\n");
  git(repository, "add", "README.md");
  git(repository, "commit", "-m", "fix: preview change");

  return repository;
};

const generate = (repository, ...args) =>
  execute("bash", [generator, ...args], repository, {
    GITHUB_REPOSITORY: "coupler-developer/docs",
  });

const normalizeReleaseDate = (output) =>
  output.replace(/^- Release Date:.*$/mu, "- Release Date: <normalized>");

test("commit preview matches the legacy tagged release without creating a tag", (context) => {
  const repository = createRepository(context);
  const targetCommit = git(repository, "rev-parse", "HEAD");

  const preview = generate(repository, "v1.1.0", targetCommit);
  assert.equal(preview.status, 0, preview.stderr);
  assert.match(
    preview.stdout,
    /compare\/v1\.0\.0\.\.\.v1\.1\.0/,
  );
  assert.match(preview.stdout, /- preview change/);

  const missingTag = execute(
    "git",
    ["show-ref", "--verify", "--quiet", "refs/tags/v1.1.0"],
    repository,
  );
  assert.equal(missingTag.status, 1);

  git(repository, "tag", "-a", "v1.1.0", targetCommit, "-m", "Release v1.1.0");
  const release = generate(repository, "v1.1.0");
  assert.equal(release.status, 0, release.stderr);
  assert.equal(
    normalizeReleaseDate(preview.stdout),
    normalizeReleaseDate(release.stdout),
  );
});

test("missing legacy tags and invalid preview refs fail closed", (context) => {
  const repository = createRepository(context);

  const missingTag = generate(repository, "v9.9.9");
  assert.equal(missingTag.status, 1);
  assert.match(missingTag.stderr, /Tag not found: v9\.9\.9/);

  const invalidTarget = generate(repository, "v1.1.0", "not-a-ref");
  assert.equal(invalidTarget.status, 1);
  assert.match(invalidTarget.stderr, /Target ref not found: not-a-ref/);
});

test("commit preview renders release-record links and the exact target commit", (context) => {
  const repository = createRepository(context);
  const releaseRecord = path.join(
    repository,
    "content",
    "releases",
    "v1.1.0.md",
  );
  fs.mkdirSync(path.dirname(releaseRecord), { recursive: true });
  fs.writeFileSync(
    releaseRecord,
    [
      "## 목적",
      "",
      "- preview release",
      "",
      "## 릴리스 상태",
      "",
      "- completed",
      "",
      "## 릴리스 결과",
      "",
      "- released",
      "",
      "## 메인 흐름",
      "",
      "1. deploy",
      "",
      "## 검증 근거",
      "",
      "- verified",
      "",
      "## 롤백 기준",
      "",
      "- rollback target",
      "",
    ].join("\n"),
  );
  git(repository, "add", releaseRecord);
  git(repository, "commit", "-m", "docs: add release record");
  const targetCommit = git(repository, "rev-parse", "HEAD");

  const preview = generate(repository, "v1.1.0", targetCommit);
  assert.equal(preview.status, 0, preview.stderr);
  assert.match(
    preview.stdout,
    /blob\/v1\.1\.0\/content\/releases\/v1\.1\.0\.md/,
  );
  assert.ok(preview.stdout.includes("docs tag commit: `" + targetCommit + "`"));

  const missingTag = execute(
    "git",
    ["show-ref", "--verify", "--quiet", "refs/tags/v1.1.0"],
    repository,
  );
  assert.equal(missingTag.status, 1);
});
