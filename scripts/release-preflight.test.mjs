import { execFileSync, spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import assert from "node:assert/strict";
import { afterEach, beforeEach, describe, it } from "node:test";
import { fileURLToPath } from "node:url";

const scriptsRoot = path.dirname(fileURLToPath(import.meta.url));
const preflightScript = path.join(scriptsRoot, "release-preflight.mjs");
let tempRoot;

beforeEach(() => {
  tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "release-preflight-"));
});

afterEach(() => {
  fs.rmSync(tempRoot, { recursive: true, force: true });
});

describe("release preflight for unpublished PR records", () => {
  it("requires a version and an unpublished PR ref", () => {
    const docsRoot = createRepository("docs");

    const missingVersion = runPreflight([], docsRoot);
    assert.notEqual(missingVersion.status, 0);
    assert.match(missingVersion.stdout, /--version is required/);

    const missingRef = runPreflight(["--version", "v9.9.0"], docsRoot);
    assert.notEqual(missingRef.status, 0);
    assert.match(
      missingRef.stdout,
      /--pending-ref is required; release preflight only reads an unpublished PR record/,
    );
  });

  it("does not parse or revalidate a record already published on origin/main", () => {
    const docsRoot = createRepository("docs");
    writeOpaqueRelease(docsRoot, "v1.0.0");
    const publishedRef = commitAndPush(docsRoot, "publish opaque history");

    const result = runPreflight([
      "--version",
      "v1.0.0",
      "--pending-ref",
      publishedRef,
    ], docsRoot);

    assert.notEqual(result.status, 0);
    assert.match(
      result.stdout,
      /release record is already published and opaque; preflight does not parse or revalidate it/,
    );
    assert.doesNotMatch(result.stdout, /release-metadata block is required/);
  });

  it("refreshes origin/main before deciding whether a pending ref may be read", () => {
    const docsRoot = createRepository("docs");
    git(docsRoot, ["checkout", "-b", "docs/stale-origin"]);
    writeOpaqueRelease(docsRoot, "v9.9.0");
    const pendingRef = commit(docsRoot, "opaque pending ref");
    git(docsRoot, ["push", "-u", "origin", "docs/stale-origin"]);

    const publisherRoot = cloneMain(docsRoot, "docs-publisher");
    writeOpaqueRelease(publisherRoot, "v9.9.0");
    commitAndPush(publisherRoot, "publish same version on main");

    const result = runPreflight([
      "--version",
      "v9.9.0",
      "--pending-ref",
      pendingRef,
    ], docsRoot);

    assert.notEqual(result.status, 0);
    assert.match(
      result.stdout,
      /release record is already published and opaque; preflight does not parse or revalidate it/,
    );
    assert.doesNotMatch(result.stdout, /release-metadata block is required/);
  });

  it("fails closed before reading a record when origin/main cannot be refreshed", () => {
    const docsRoot = createRepository("docs");
    const pendingRef = createPendingReleaseBranch(docsRoot);
    const remoteRoot = git(docsRoot, ["remote", "get-url", "origin"]);
    fs.renameSync(remoteRoot, `${remoteRoot}.offline`);

    const result = runPreflight([
      "--version",
      "v9.9.0",
      "--pending-ref",
      pendingRef,
    ], docsRoot);

    assert.notEqual(result.status, 0);
    assert.match(
      result.stdout,
      /failed to fetch origin\/main before release record classification; the record was not read/,
    );
  });

  it("passes a clean pushed pending PR ref", () => {
    const docsRoot = createRepository("docs");
    const pendingRef = createPendingReleaseBranch(docsRoot);

    const result = runPreflight([
      "--version",
      "v9.9.0",
      "--pending-ref",
      pendingRef,
    ], docsRoot);

    assert.equal(result.status, 0, result.stdout + result.stderr);
    assert.match(result.stdout, /preflight repos: docs/);
    assert.match(result.stdout, /Result: PASS/);
  });

  it("rejects an unpushed or stale pending PR ref", () => {
    const docsRoot = createRepository("docs");
    git(docsRoot, ["checkout", "-b", "docs/release"]);
    writePendingRelease(docsRoot);
    const unpushedRef = commit(docsRoot, "unpublished release");

    const unpushed = runPreflight([
      "--version",
      "v9.9.0",
      "--pending-ref",
      unpushedRef,
    ], docsRoot);
    assert.notEqual(unpushed.status, 0);
    assert.match(unpushed.stdout, /pending release branch must be pushed to an origin upstream/);

    git(docsRoot, ["push", "-u", "origin", "docs/release"]);
    const pushedRef = git(docsRoot, ["rev-parse", "HEAD"]);
    git(docsRoot, ["checkout", "main"]);
    fs.writeFileSync(path.join(docsRoot, "MAIN_ADVANCE.md"), "# Advance\n");
    commitAndPush(docsRoot, "advance main");
    git(docsRoot, ["checkout", "docs/release"]);

    const stale = runPreflight([
      "--version",
      "v9.9.0",
      "--pending-ref",
      pushedRef,
    ], docsRoot);
    assert.notEqual(stale.status, 0);
    assert.match(
      stale.stdout,
      /pending release branch must include the latest origin\/main/,
    );
  });

  it("validates a new DB migration record from the same unpublished pending ref", () => {
    const workspace = createWorkspace();
    const apiRef = git(workspace.apiRoot, ["rev-parse", "HEAD"]);
    git(workspace.docsRoot, ["checkout", "-b", "docs/db-release"]);
    writePendingRelease(workspace.docsRoot, {
      dbMigration: true,
      apiRef,
    });
    const pendingRef = commit(workspace.docsRoot, "pending DB release");
    git(workspace.docsRoot, ["push", "-u", "origin", "docs/db-release"]);

    const result = runPreflight([
      "--version",
      "v9.9.0",
      "--pending-ref",
      pendingRef,
      "--workspace-root",
      tempRoot,
    ], workspace.docsRoot);

    assert.equal(result.status, 0, result.stdout + result.stderr);
    assert.match(result.stdout, /preflight repos: docs, coupler-api/);
    assert.match(result.stdout, /Result: PASS/);
  });
});

function createWorkspace() {
  return {
    docsRoot: createRepository("docs"),
    apiRoot: createRepository("coupler-api"),
    adminRoot: createRepository("coupler-admin-web"),
    mobileRoot: createRepository("coupler-mobile-app"),
  };
}

function createRepository(name) {
  const repositoryRoot = path.join(tempRoot, name);
  const remoteRoot = path.join(tempRoot, "_remotes", `${name}.git`);
  fs.mkdirSync(path.dirname(remoteRoot), { recursive: true });
  git(tempRoot, ["init", "--bare", remoteRoot]);
  fs.mkdirSync(repositoryRoot, { recursive: true });
  git(repositoryRoot, ["init"]);
  git(repositoryRoot, ["checkout", "-B", "main"]);
  git(repositoryRoot, ["config", "user.email", "release-preflight@example.invalid"]);
  git(repositoryRoot, ["config", "user.name", "Release Preflight Test"]);
  git(repositoryRoot, ["remote", "add", "origin", remoteRoot]);
  fs.writeFileSync(path.join(repositoryRoot, "README.md"), "# Test\n");
  commitAndPush(repositoryRoot, "initial main");
  return repositoryRoot;
}

function cloneMain(sourceRepositoryRoot, name) {
  const remoteRoot = git(sourceRepositoryRoot, ["remote", "get-url", "origin"]);
  const cloneRoot = path.join(tempRoot, name);
  git(tempRoot, ["clone", remoteRoot, cloneRoot]);
  git(cloneRoot, ["checkout", "-B", "main", "origin/main"]);
  git(cloneRoot, ["config", "user.email", "release-preflight@example.invalid"]);
  git(cloneRoot, ["config", "user.name", "Release Preflight Test"]);
  return cloneRoot;
}

function createPendingReleaseBranch(docsRoot) {
  git(docsRoot, ["checkout", "-b", "docs/release"]);
  writePendingRelease(docsRoot);
  const pendingRef = commit(docsRoot, "pending release");
  git(docsRoot, ["push", "-u", "origin", "docs/release"]);
  return pendingRef;
}

function writeOpaqueRelease(docsRoot, version) {
  const releaseRoot = path.join(docsRoot, "content", "releases");
  fs.mkdirSync(releaseRoot, { recursive: true });
  fs.writeFileSync(
    path.join(releaseRoot, `${version}.md`),
    "historical bytes are intentionally opaque\n",
  );
}

function writePendingRelease(
  docsRoot,
  { dbMigration = false, apiRef = null } = {},
) {
  const version = "v9.9.0";
  const releaseScopes = dbMigration ? ["docs", "db-migration"] : ["docs"];
  const scopeResults = {
    docs: {
      status: "pending",
      summary: "docs pending",
      evidence: {},
    },
  };
  if (dbMigration) {
    const artifactRoot = path.join(
      docsRoot,
      "content",
      "releases",
      "evidence",
      "db-migrations",
      version,
    );
    const devPlan = Buffer.from('{"environment":"dev"}\n');
    const prodPlan = Buffer.from('{"environment":"prod"}\n');
    fs.mkdirSync(path.join(artifactRoot, "dev"), { recursive: true });
    fs.mkdirSync(path.join(artifactRoot, "prod"), { recursive: true });
    fs.writeFileSync(path.join(artifactRoot, "dev", "plan.json"), devPlan);
    fs.writeFileSync(path.join(artifactRoot, "prod", "plan.json"), prodPlan);
    scopeResults["db-migration"] = {
      status: "pending",
      summary: "DB maintenance pending",
      evidence: {
        schema: "db-migration-maintenance-evidence/v1",
        dev: {
          plan: {
            path: `content/releases/evidence/db-migrations/${version}/dev/plan.json`,
            sha256: sha256Hex(devPlan),
          },
          execution: null,
        },
        prod: {
          plan: {
            path: `content/releases/evidence/db-migrations/${version}/prod/plan.json`,
            sha256: sha256Hex(prodPlan),
          },
          execution: null,
        },
      },
    };
  }

  const metadata = {
    schema: "release-metadata/v1",
    version,
    status: "pending",
    releaseScopes,
    extraRepoRefs: [],
    versionMapping: {
      docs: { tag: null, commit: "pending" },
      "coupler-api": { tag: null, commit: apiRef },
      "coupler-admin-web": { tag: null, commit: null },
      "coupler-mobile-app": {
        store: null,
        releaseTag: null,
        commit: null,
        nextPush: null,
      },
    },
    scopeResults,
    apiContractCutover: null,
  };
  const targetRepos = dbMigration ? "`docs`, `coupler-api`" : "`docs`";
  const releaseRoot = path.join(docsRoot, "content", "releases");
  fs.mkdirSync(releaseRoot, { recursive: true });
  fs.writeFileSync(
    path.join(releaseRoot, `${version}.md`),
    [
      "# Pending release",
      "",
      "```release-metadata",
      JSON.stringify(metadata, null, 2),
      "```",
      "",
      "## 범위",
      "",
      `- 대상: ${targetRepos}`,
      "- 포함 범위: pending release",
      "- 제외 범위: none",
      "",
      "## 릴리스 상태",
      "",
      `- 목표 버전: \`${version}\``,
      "- 전체 상태: `pending`",
      "- 완료 범위: N/A",
      "- 대기 범위: 운영 배포",
      "",
      "## 버전 매핑",
      "",
      "- `docs`: 기록 버전 `v9.9.0`, 태그 `N/A`, 커밋 `pending`",
      `- \`coupler-api\`: 태그 \`N/A\`, 커밋 \`${apiRef ?? "N/A"}\``,
      "- `coupler-admin-web`: `N/A`",
      "- `coupler-mobile-app`: Store `N/A`, 릴리스 태그 `N/A`, 커밋 `N/A`, NextPush `N/A`",
      "",
    ].join("\n"),
  );
}

function sha256Hex(source) {
  return createHash("sha256").update(source).digest("hex");
}

function runPreflight(args, docsRoot) {
  return spawnSync(process.execPath, [preflightScript, ...args], {
    cwd: docsRoot,
    encoding: "utf8",
  });
}

function commit(repositoryRoot, message) {
  git(repositoryRoot, ["add", "."]);
  git(repositoryRoot, ["commit", "-m", message]);
  return git(repositoryRoot, ["rev-parse", "HEAD"]);
}

function commitAndPush(repositoryRoot, message) {
  const commitRef = commit(repositoryRoot, message);
  git(repositoryRoot, ["push", "-u", "origin", "main"]);
  return commitRef;
}

function git(repositoryRoot, args) {
  return execFileSync("git", args, {
    cwd: repositoryRoot,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  }).trim();
}
