import { execFileSync, spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import assert from "node:assert/strict";
import { afterEach, beforeEach, describe, it } from "node:test";
import { fileURLToPath } from "node:url";

const scriptsRoot = path.dirname(fileURLToPath(import.meta.url));
const preflightScript = path.join(scriptsRoot, "release-preflight.mjs");
let tempRoot;
let extraTempRoots;

beforeEach(() => {
  tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "release-preflight-"));
  extraTempRoots = [];
});

afterEach(() => {
  for (const extraRoot of extraTempRoots) {
    fs.rmSync(extraRoot, { recursive: true, force: true });
  }
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

  it("accepts a pending DB scope without a plan artifact", () => {
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
    assert.match(result.stdout, /Result: PASS/);
  });

  it("rejects an API source that exists locally but is not in origin/main history", () => {
    const workspace = createWorkspace();
    git(workspace.apiRoot, ["checkout", "-b", "unmerged/db-source"]);
    fs.writeFileSync(path.join(workspace.apiRoot, "UNMERGED.md"), "# Local-only source\n");
    const unmergedApiRef = commit(workspace.apiRoot, "local-only API source");
    git(workspace.apiRoot, ["checkout", "main"]);

    git(workspace.docsRoot, ["checkout", "-b", "docs/unmerged-db-source"]);
    writePendingRelease(workspace.docsRoot, {
      dbMigration: true,
      apiRef: unmergedApiRef,
      status: "in_progress",
    });
    const pendingRef = commit(workspace.docsRoot, "reference local-only API source");
    git(workspace.docsRoot, ["push", "-u", "origin", "docs/unmerged-db-source"]);

    const result = runPreflight([
      "--version",
      "v9.9.0",
      "--pending-ref",
      pendingRef,
    ], workspace.docsRoot);

    assert.notEqual(result.status, 0);
    assert.match(result.stdout, /버전 매핑 ref가 origin\/main 계보에 없습니다/);
  });

  it("revalidates an in-progress DB release without plan or execution artifacts", () => {
    const workspace = createWorkspace();
    const apiRef = git(workspace.apiRoot, ["rev-parse", "HEAD"]);
    git(workspace.docsRoot, ["checkout", "-b", "docs/db-release-in-progress"]);
    writePendingRelease(workspace.docsRoot, {
      dbMigration: true,
      apiRef,
      status: "in_progress",
    });
    const pendingRef = commit(workspace.docsRoot, "in-progress DB release");
    git(workspace.docsRoot, [
      "push",
      "-u",
      "origin",
      "docs/db-release-in-progress",
    ]);

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

  it("keeps the release API source when an unrelated API commit reaches main", () => {
    const workspace = createWorkspace();
    fs.writeFileSync(path.join(workspace.apiRoot, "UNRELATED.md"), "# Unrelated API change\n");
    const releaseApiRef = commitAndPush(workspace.apiRoot, "advance API main without DB drift");

    git(workspace.docsRoot, ["checkout", "-b", "docs/db-release-after-api-advance"]);
    writePendingRelease(workspace.docsRoot, {
      dbMigration: true,
      apiRef: releaseApiRef,
      status: "in_progress",
    });
    const pendingRef = commit(workspace.docsRoot, "bind DB migration release API source");
    git(workspace.docsRoot, [
      "push",
      "-u",
      "origin",
      "docs/db-release-after-api-advance",
    ]);

    const result = runPreflight([
      "--version",
      "v9.9.0",
      "--pending-ref",
      pendingRef,
      "--workspace-root",
      tempRoot,
    ], workspace.docsRoot);

    assert.equal(result.status, 0, result.stdout + result.stderr);
    assert.match(result.stdout, /Result: PASS/);
  });

  it("discovers the canonical workspace from a nested Docs worktree", () => {
    const workspace = createWorkspace();
    const apiRef = git(workspace.apiRoot, ["rev-parse", "HEAD"]);
    const docsWorktree = path.join(tempRoot, "_worktrees", "docs-db-release");
    fs.mkdirSync(path.dirname(docsWorktree), { recursive: true });
    git(workspace.docsRoot, [
      "worktree",
      "add",
      "-b",
      "docs/nested-db-release",
      docsWorktree,
      "main",
    ]);
    writePendingRelease(docsWorktree, {
      dbMigration: true,
      apiRef,
      status: "in_progress",
    });
    const pendingRef = commit(docsWorktree, "nested worktree DB release");
    git(docsWorktree, ["push", "-u", "origin", "docs/nested-db-release"]);

    const result = runPreflight([
      "--version",
      "v9.9.0",
      "--pending-ref",
      pendingRef,
    ], docsWorktree);

    assert.equal(result.status, 0, result.stdout + result.stderr);
    assert.match(
      result.stdout,
      new RegExp(`workspace root: ${escapeRegExp(fs.realpathSync(tempRoot))}`),
    );
    assert.match(result.stdout, /Result: PASS/);
  });

  it("discovers the canonical workspace from an external Docs worktree", () => {
    const workspace = createWorkspace();
    const apiRef = git(workspace.apiRoot, ["rev-parse", "HEAD"]);
    const externalRoot = fs.mkdtempSync(path.join(os.tmpdir(), "docs-release-worktree-"));
    extraTempRoots.push(externalRoot);
    git(workspace.docsRoot, [
      "worktree",
      "add",
      "-b",
      "docs/external-db-release",
      externalRoot,
      "main",
    ]);
    writePendingRelease(externalRoot, {
      dbMigration: true,
      apiRef,
      status: "in_progress",
    });
    const pendingRef = commit(externalRoot, "external worktree DB release");
    git(externalRoot, ["push", "-u", "origin", "docs/external-db-release"]);

    const result = runPreflight([
      "--version",
      "v9.9.0",
      "--pending-ref",
      pendingRef,
    ], externalRoot);

    assert.equal(result.status, 0, result.stdout + result.stderr);
    assert.match(
      result.stdout,
      new RegExp(`workspace root: ${escapeRegExp(fs.realpathSync(tempRoot))}`),
    );
    assert.match(result.stdout, /Result: PASS/);
  });

  it("rejects an explicit workspace root without the canonical service layout", () => {
    const workspace = createWorkspace();
    const apiRef = git(workspace.apiRoot, ["rev-parse", "HEAD"]);
    git(workspace.docsRoot, ["checkout", "-b", "docs/invalid-workspace-root"]);
    writePendingRelease(workspace.docsRoot, {
      dbMigration: true,
      apiRef,
      status: "in_progress",
    });
    const pendingRef = commit(workspace.docsRoot, "invalid explicit workspace root");
    git(workspace.docsRoot, ["push", "-u", "origin", "docs/invalid-workspace-root"]);
    const invalidRoot = path.join(tempRoot, "_worktrees");
    fs.mkdirSync(invalidRoot, { recursive: true });

    const result = runPreflight([
      "--version",
      "v9.9.0",
      "--pending-ref",
      pendingRef,
      "--workspace-root",
      invalidRoot,
    ], workspace.docsRoot);

    assert.notEqual(result.status, 0);
    assert.match(result.stdout, /Workspace root must contain coupler-api, coupler-admin-web, and coupler-mobile-app/);
  });

  it("allows later non-DB preflight after the DB scope is terminal", () => {
    const workspace = createWorkspace();
    const apiRef = git(workspace.apiRoot, ["rev-parse", "HEAD"]);
    git(workspace.docsRoot, ["checkout", "-b", "docs/db-complete-release-in-progress"]);
    writePendingRelease(workspace.docsRoot, {
      dbMigration: true,
      apiRef,
      status: "in_progress",
      dbMigrationStatus: "released",
    });
    const pendingRef = commit(workspace.docsRoot, "DB complete with remaining release work");
    git(workspace.docsRoot, [
      "push",
      "-u",
      "origin",
      "docs/db-complete-release-in-progress",
    ]);

    const result = runPreflight([
      "--version",
      "v9.9.0",
      "--pending-ref",
      pendingRef,
      "--workspace-root",
      tempRoot,
    ], workspace.docsRoot);

    assert.equal(result.status, 0, result.stdout + result.stderr);
    assert.match(result.stdout, /Result: PASS/);
  });

  it("rejects new DB artifacts when operational metadata omits the DB scope", () => {
    const docsRoot = createRepository("docs");
    git(docsRoot, ["checkout", "-b", "docs/unowned-db-artifacts"]);
    writePendingRelease(docsRoot, {
      dbMigration: true,
      apiRef: "a".repeat(40),
      status: "in_progress",
    });
    writePendingRelease(docsRoot, { status: "in_progress" });
    const unownedArtifact = path.join(
      docsRoot,
      "content/releases/evidence/db-migrations/v9.9.0/dev/plan.json",
    );
    fs.mkdirSync(path.dirname(unownedArtifact), { recursive: true });
    fs.writeFileSync(unownedArtifact, "new artifact is forbidden\n");
    const pendingRef = commit(docsRoot, "omit DB scope with artifacts");
    git(docsRoot, ["push", "-u", "origin", "docs/unowned-db-artifacts"]);

    const result = runPreflight([
      "--version",
      "v9.9.0",
      "--pending-ref",
      pendingRef,
    ], docsRoot);

    assert.notEqual(result.status, 0);
    assert.match(result.stdout, /new DB migration evidence artifacts are not allowed/);
  });

  it("rejects unrelated published release edits through the shared transition validator", () => {
    const docsRoot = createRepository("docs");
    writeOpaqueRelease(docsRoot, "v1.0.0");
    commitAndPush(docsRoot, "published historical release");
    git(docsRoot, ["checkout", "-b", "docs/rewrite-history"]);
    writePendingRelease(docsRoot);
    fs.writeFileSync(
      path.join(docsRoot, "content", "releases", "v1.0.0.md"),
      "rewritten historical bytes\n",
    );
    const pendingRef = commit(docsRoot, "rewrite published release");
    git(docsRoot, ["push", "-u", "origin", "docs/rewrite-history"]);

    const result = runPreflight([
      "--version",
      "v9.9.0",
      "--pending-ref",
      pendingRef,
    ], docsRoot);

    assert.notEqual(result.status, 0);
    assert.match(result.stdout, /release record already present in the base ref is final and immutable/);
  });

  it("continues to reject a planned release record", () => {
    const docsRoot = createRepository("docs");
    git(docsRoot, ["checkout", "-b", "docs/planned-release"]);
    writePendingRelease(docsRoot, { status: "planned" });
    const plannedRef = commit(docsRoot, "planned release");
    git(docsRoot, ["push", "-u", "origin", "docs/planned-release"]);

    const result = runPreflight([
      "--version",
      "v9.9.0",
      "--pending-ref",
      plannedRef,
    ], docsRoot);

    assert.notEqual(result.status, 0);
    assert.match(
      result.stdout,
      /--pending-ref requires release-metadata status pending or in_progress, got planned/,
    );
  });

  it("keeps an annotated service tag as the immutable release ref after main advances", () => {
    const workspace = createWorkspace();
    const apiRef = git(workspace.apiRoot, ["rev-parse", "HEAD"]);
    git(workspace.apiRoot, ["tag", "-a", "v9.9.0", "-m", "release v9.9.0", apiRef]);
    git(workspace.apiRoot, ["push", "origin", "refs/tags/v9.9.0"]);
    fs.writeFileSync(path.join(workspace.apiRoot, "AFTER_RELEASE.md"), "# Next work\n");
    commitAndPush(workspace.apiRoot, "advance API main after release");

    git(workspace.docsRoot, ["checkout", "-b", "docs/tagged-release"]);
    writePendingRelease(workspace.docsRoot, {
      dbMigration: true,
      apiRef,
      apiTag: "v9.9.0",
      status: "in_progress",
    });
    const pendingRef = commit(workspace.docsRoot, "record immutable tagged release");
    git(workspace.docsRoot, ["push", "-u", "origin", "docs/tagged-release"]);

    const result = runPreflight([
      "--version",
      "v9.9.0",
      "--pending-ref",
      pendingRef,
      "--workspace-root",
      tempRoot,
    ], workspace.docsRoot);

    assert.equal(result.status, 0, result.stdout + result.stderr);
    assert.match(result.stdout, /Result: PASS/);
  });

  it("accepts independently tagged Android and iOS Store sources on different commits", () => {
    const workspace = createWorkspace();
    const androidCommit = git(workspace.mobileRoot, ["rev-parse", "HEAD"]);
    git(workspace.mobileRoot, ["tag", "-a", "v9.9.0", "-m", "Android 9.9.0", androidCommit]);
    git(workspace.mobileRoot, ["push", "origin", "refs/tags/v9.9.0"]);
    fs.writeFileSync(path.join(workspace.mobileRoot, "IOS_991.md"), "# iOS 9.9.1 source\n");
    const iosCommit = commitAndPush(workspace.mobileRoot, "add iOS 9.9.1 source");
    git(workspace.mobileRoot, ["tag", "-a", "v9.9.1", "-m", "iOS 9.9.1", iosCommit]);
    git(workspace.mobileRoot, ["push", "origin", "refs/tags/v9.9.1"]);

    git(workspace.docsRoot, ["checkout", "-b", "docs/platform-store-release"]);
    writePendingRelease(workspace.docsRoot, {
      status: "in_progress",
      mobileStoreMapping: {
        android: {
          versionBuild: "9.9.0 (900)",
          releaseTag: "v9.9.0",
          commit: androidCommit,
          sourceStatus: "verified",
          limitation: null,
        },
        ios: {
          versionBuild: "9.9.1 (900)",
          releaseTag: "v9.9.1",
          commit: iosCommit,
          sourceStatus: "verified",
          limitation: null,
        },
      },
    });
    const pendingRef = commit(workspace.docsRoot, "record split Store source refs");
    git(workspace.docsRoot, ["push", "-u", "origin", "docs/platform-store-release"]);

    const result = runPreflight([
      "--version",
      "v9.9.0",
      "--pending-ref",
      pendingRef,
      "--workspace-root",
      tempRoot,
    ], workspace.docsRoot);

    assert.equal(result.status, 0, result.stdout + result.stderr);
    assert.match(result.stdout, /Result: PASS/);
  });

  it("accepts the current Store source commit before its release tag exists", () => {
    const workspace = createWorkspace();
    const mobileCommit = git(workspace.mobileRoot, ["rev-parse", "HEAD"]);
    git(workspace.docsRoot, ["checkout", "-b", "docs/pretag-store-release"]);
    writePendingRelease(workspace.docsRoot, {
      status: "in_progress",
      mobileStoreMapping: {
        android: {
          versionBuild: "9.9.0 (900)",
          releaseTag: null,
          commit: mobileCommit,
          sourceStatus: "verified",
          limitation: null,
        },
        ios: null,
      },
    });
    const pendingRef = commit(workspace.docsRoot, "record pre-tag Store source");
    git(workspace.docsRoot, ["push", "-u", "origin", "docs/pretag-store-release"]);

    const result = runPreflight([
      "--version",
      "v9.9.0",
      "--pending-ref",
      pendingRef,
      "--workspace-root",
      tempRoot,
    ], workspace.docsRoot);

    assert.equal(result.status, 0, result.stdout + result.stderr);
    assert.match(result.stdout, /Result: PASS/);
  });

  it("rejects a Store platform tag and commit that resolve to different sources", () => {
    const workspace = createWorkspace();
    const taggedCommit = git(workspace.mobileRoot, ["rev-parse", "HEAD"]);
    git(workspace.mobileRoot, ["tag", "-a", "v9.9.0", "-m", "Android 9.9.0", taggedCommit]);
    git(workspace.mobileRoot, ["push", "origin", "refs/tags/v9.9.0"]);
    fs.writeFileSync(path.join(workspace.mobileRoot, "AFTER_ANDROID_TAG.md"), "# Later source\n");
    const differentCommit = commitAndPush(workspace.mobileRoot, "advance after Android tag");

    git(workspace.docsRoot, ["checkout", "-b", "docs/mismatched-store-source"]);
    writePendingRelease(workspace.docsRoot, {
      status: "in_progress",
      mobileStoreMapping: {
        android: {
          versionBuild: "9.9.0 (900)",
          releaseTag: "v9.9.0",
          commit: differentCommit,
          sourceStatus: "verified",
          limitation: null,
        },
        ios: null,
      },
    });
    const pendingRef = commit(workspace.docsRoot, "record mismatched Store source refs");
    git(workspace.docsRoot, ["push", "-u", "origin", "docs/mismatched-store-source"]);

    const result = runPreflight([
      "--version",
      "v9.9.0",
      "--pending-ref",
      pendingRef,
      "--workspace-root",
      tempRoot,
    ], workspace.docsRoot);

    assert.notEqual(result.status, 0);
    assert.match(result.stdout, /store\.android tag와 commit이 같은 기준점을 가리켜야 합니다/);
  });

  it("still rejects an untagged historical service ref after main advances", () => {
    const workspace = createWorkspace();
    const apiRef = git(workspace.apiRoot, ["rev-parse", "HEAD"]);
    fs.writeFileSync(path.join(workspace.apiRoot, "AFTER_BASIS.md"), "# Advance\n");
    commitAndPush(workspace.apiRoot, "advance API main before tag");

    git(workspace.docsRoot, ["checkout", "-b", "docs/untagged-release"]);
    writePendingRelease(workspace.docsRoot, {
      dbMigration: true,
      apiRef,
      status: "in_progress",
    });
    const pendingRef = commit(workspace.docsRoot, "record stale untagged release");
    git(workspace.docsRoot, ["push", "-u", "origin", "docs/untagged-release"]);

    const result = runPreflight([
      "--version",
      "v9.9.0",
      "--pending-ref",
      pendingRef,
      "--workspace-root",
      tempRoot,
    ], workspace.docsRoot);

    assert.notEqual(result.status, 0);
    assert.match(result.stdout, /버전 매핑 ref는 현재 origin\/main 기준점과 같아야 합니다/);
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
  {
    dbMigration = false,
    contractsPackage = false,
    apiRef = null,
    apiTag = null,
    status = "pending",
    dbMigrationStatus = status,
    mobileStoreMapping = null,
    version = "v9.9.0",
  } = {},
) {
  const releaseScopes = dbMigration
    ? ["docs", "db-migration", ...(contractsPackage ? ["contracts-package"] : [])]
    : mobileStoreMapping
      ? ["docs", "mobile-store"]
      : ["docs"];
  const scopeResults = {
    docs: {
      status,
      summary: `docs ${status}`,
      evidence: {},
    },
  };
  if (dbMigration) {
    scopeResults["db-migration"] = {
      status: dbMigrationStatus,
      summary: `DB migration ${dbMigrationStatus}`,
      evidence: {},
    };
  }
  if (contractsPackage) {
    scopeResults["contracts-package"] = {
      status,
      summary: `contracts-package ${status}`,
      evidence: {
        publishedPackage: "pending",
        workflow: "pending",
        sourceRef: "pending",
        sourceTree: null,
      },
    };
  }
  if (mobileStoreMapping) {
    scopeResults["mobile-store"] = {
      status,
      summary: `mobile-store ${status}`,
      evidence: {
        submission: "pending",
        approval: "pending",
        release: "pending",
        smoke: "pending",
        artifact: "pending",
        submittedMarkers: {
          android: null,
          ios: null,
        },
      },
    };
  }

  const metadata = {
    schema: "release-metadata/v3",
    version,
    status,
    releaseScopes,
    extraRepoRefs: [],
    versionMapping: {
      docs: { tag: null, commit: "pending" },
      "coupler-api": { tag: apiTag, commit: apiRef },
      "coupler-admin-web": { tag: null, commit: null },
      "coupler-mobile-app": {
        store: mobileStoreMapping ?? {
          android: null,
          ios: null,
        },
        nextPush: null,
        commit: null,
      },
    },
    scopeResults,
    apiContractCutover: null,
  };
  const targetRepos = dbMigration
    ? "`docs`, `coupler-api`"
    : mobileStoreMapping
      ? "`docs`, `coupler-mobile-app`"
      : "`docs`";
  const mobileStoreValue = (platform, key) =>
    mobileStoreMapping?.[platform]?.[key] ?? "N/A";
  const mobileMappingMirror = mobileStoreMapping
    ? `- \`coupler-mobile-app\`: Android Store \`${mobileStoreValue("android", "versionBuild")}\`, Android 릴리스 태그 \`${mobileStoreValue("android", "releaseTag")}\`, Android 커밋 \`${mobileStoreValue("android", "commit")}\`, Android source \`${mobileStoreValue("android", "sourceStatus")}\`, iOS Store \`${mobileStoreValue("ios", "versionBuild")}\`, iOS 릴리스 태그 \`${mobileStoreValue("ios", "releaseTag")}\`, iOS 커밋 \`${mobileStoreValue("ios", "commit")}\`, iOS source \`${mobileStoreValue("ios", "sourceStatus")}\`, NextPush \`N/A\`, NextPush 커밋 \`N/A\``
    : "- `coupler-mobile-app`: Android Store `N/A`, Android 릴리스 태그 `N/A`, Android 커밋 `N/A`, Android source `N/A`, iOS Store `N/A`, iOS 릴리스 태그 `N/A`, iOS 커밋 `N/A`, iOS source `N/A`, NextPush `N/A`, NextPush 커밋 `N/A`";
  const releaseRoot = path.join(docsRoot, "content", "releases");
  fs.mkdirSync(releaseRoot, { recursive: true });
  fs.writeFileSync(
    path.join(releaseRoot, `${version}.md`),
    [
      "# Active release",
      "",
      "## 목적",
      "",
      "- active release transition",
      "",
      "```release-metadata",
      JSON.stringify(metadata, null, 2),
      "```",
      "",
      "## 범위",
      "",
      `- 대상: ${targetRepos}`,
      "- 포함 범위: active release",
      "- 제외 범위: none",
      "",
      "## 상위 규범 문서",
      "",
      "- release process",
      "",
      "## 릴리스 상태",
      "",
      `- 목표 버전: \`${version}\``,
      `- 전체 상태: \`${status}\``,
      "- 완료 범위: N/A",
      "- 대기 범위: 운영 배포",
      "",
      "## 릴리스 결과",
      "",
      "- 현재 상태를 metadata와 동일하게 기록",
      "",
      "## 메인 흐름",
      "",
      "1. preflight로 현재 transition을 검증한다.",
      "",
      "## 검증 근거",
      "",
      "- pending ref exact validation",
      "",
      "## 버전 매핑",
      "",
      `- \`docs\`: 기록 버전 \`${version}\`, 태그 \`N/A\`, 커밋 \`pending\``,
      `- \`coupler-api\`: 태그 \`${apiTag ?? "N/A"}\`, 커밋 \`${apiRef ?? "N/A"}\``,
      "- `coupler-admin-web`: `N/A`",
      mobileMappingMirror,
      "",
      "## 롤백 기준",
      "",
      "- preflight 실패 시 실행하지 않는다.",
      "",
    ].join("\n"),
  );
}


function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
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
