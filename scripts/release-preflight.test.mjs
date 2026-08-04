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

  it("rejects a DB pending dev root as operational preflight admission", () => {
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

    assert.notEqual(result.status, 0);
    assert.match(
      result.stdout,
      /DB migration operational preflight requires an in_progress canonical prod plan root with null execution/,
    );
  });

  it("revalidates an in-progress DB release after recording dev execution and the prod plan", () => {
    const workspace = createWorkspace();
    const apiRef = git(workspace.apiRoot, ["rev-parse", "HEAD"]);
    git(workspace.docsRoot, ["checkout", "-b", "docs/db-release-in-progress"]);
    writePendingRelease(workspace.docsRoot, {
      dbMigration: true,
      apiRef,
      status: "in_progress",
      dbMigrationStage: "prod-planned",
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

  it("allows later non-DB preflight after the DB scope has terminal execution evidence", () => {
    const workspace = createWorkspace();
    const apiRef = git(workspace.apiRoot, ["rev-parse", "HEAD"]);
    git(workspace.docsRoot, ["checkout", "-b", "docs/db-complete-release-in-progress"]);
    writePendingRelease(workspace.docsRoot, {
      dbMigration: true,
      apiRef,
      status: "in_progress",
      dbMigrationStatus: "released",
      dbMigrationStage: "prod-completed",
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

  it("preserves and consumes exact origin/main dev checkpoint bytes after a delayed production start", () => {
    const workspace = createWorkspace();
    const apiRef = git(workspace.apiRoot, ["rev-parse", "HEAD"]);
    writePendingRelease(workspace.docsRoot, {
      dbMigration: true,
      apiRef,
      dbMigrationStage: "dev-completed",
    });
    fs.rmSync(path.join(workspace.docsRoot, "content", "releases", "v9.9.0.md"));
    commitAndPush(workspace.docsRoot, "completed dev checkpoint");

    git(workspace.docsRoot, ["checkout", "-b", "docs/delayed-prod-release"]);
    writePendingRelease(workspace.docsRoot, {
      dbMigration: true,
      apiRef,
      status: "in_progress",
      dbMigrationStage: "prod-planned",
    });
    const pendingRef = commit(workspace.docsRoot, "consume delayed dev checkpoint");
    git(workspace.docsRoot, ["push", "-u", "origin", "docs/delayed-prod-release"]);

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

  it("rejects replacing an origin/main dev checkpoint before production execution", () => {
    const workspace = createWorkspace();
    const apiRef = git(workspace.apiRoot, ["rev-parse", "HEAD"]);
    writePendingRelease(workspace.docsRoot, {
      dbMigration: true,
      apiRef,
      dbMigrationStage: "dev-completed",
    });
    fs.rmSync(path.join(workspace.docsRoot, "content", "releases", "v9.9.0.md"));
    commitAndPush(workspace.docsRoot, "completed dev checkpoint");

    git(workspace.docsRoot, ["checkout", "-b", "docs/replaced-dev-checkpoint"]);
    writePendingRelease(workspace.docsRoot, {
      dbMigration: true,
      apiRef,
      status: "in_progress",
      dbMigrationStage: "prod-planned",
      devPlanCreatedAt: "2026-08-03T00:00:00.000Z",
    });
    const pendingRef = commit(workspace.docsRoot, "replace delayed dev checkpoint");
    git(workspace.docsRoot, ["push", "-u", "origin", "docs/replaced-dev-checkpoint"]);

    const result = runPreflight([
      "--version",
      "v9.9.0",
      "--pending-ref",
      pendingRef,
      "--workspace-root",
      tempRoot,
    ], workspace.docsRoot);

    assert.notEqual(result.status, 0);
    assert.match(
      result.stdout,
      /DB migration evidence already present in the base ref.*is final and immutable/,
    );
  });

  it("rejects superseding a reserved checkpoint version instead of consuming it", () => {
    const workspace = createWorkspace();
    const apiRef = git(workspace.apiRoot, ["rev-parse", "HEAD"]);
    writePendingRelease(workspace.docsRoot, {
      dbMigration: true,
      apiRef,
      dbMigrationStage: "dev-completed",
    });
    fs.rmSync(path.join(workspace.docsRoot, "content", "releases", "v9.9.0.md"));
    commitAndPush(workspace.docsRoot, "completed dev checkpoint");

    git(workspace.docsRoot, ["checkout", "-b", "docs/superseded-checkpoint"]);
    writePendingRelease(workspace.docsRoot, {
      dbMigration: true,
      apiRef,
      status: "in_progress",
      dbMigrationStatus: "superseded",
      dbMigrationStage: "prod-planned",
    });
    const pendingRef = commit(workspace.docsRoot, "supersede reserved checkpoint");
    git(workspace.docsRoot, ["push", "-u", "origin", "docs/superseded-checkpoint"]);

    const result = runPreflight([
      "--version",
      "v9.9.0",
      "--pending-ref",
      pendingRef,
      "--workspace-root",
      tempRoot,
    ], workspace.docsRoot);

    assert.notEqual(result.status, 0);
    assert.match(
      result.stdout,
      /must consume its standalone dev checkpoint through a canonical prod plan root/,
    );
  });

  it("rejects reusing an older version dev checkpoint pair in operational preflight", () => {
    const workspace = createWorkspace();
    const apiRef = git(workspace.apiRoot, ["rev-parse", "HEAD"]);
    writePendingRelease(workspace.docsRoot, {
      dbMigration: true,
      apiRef,
      dbMigrationStage: "dev-completed",
      version: "v9.8.0",
    });
    fs.rmSync(path.join(workspace.docsRoot, "content", "releases", "v9.8.0.md"));
    commitAndPush(workspace.docsRoot, "earlier completed dev checkpoint");

    git(workspace.docsRoot, ["checkout", "-b", "docs/reused-dev-checkpoint"]);
    writePendingRelease(workspace.docsRoot, {
      dbMigration: true,
      apiRef,
      status: "in_progress",
      dbMigrationStage: "prod-planned",
    });
    const pendingRef = commit(workspace.docsRoot, "reuse earlier dev checkpoint");
    git(workspace.docsRoot, ["push", "-u", "origin", "docs/reused-dev-checkpoint"]);

    const result = runPreflight([
      "--version",
      "v9.9.0",
      "--pending-ref",
      pendingRef,
      "--workspace-root",
      tempRoot,
    ], workspace.docsRoot);

    assert.notEqual(result.status, 0);
    assert.match(result.stdout, /new version must be requalified in dev.*v9\.8\.0/);
  });

  it("rejects same-version DB artifacts when operational metadata omits the DB scope", () => {
    const docsRoot = createRepository("docs");
    git(docsRoot, ["checkout", "-b", "docs/unowned-db-artifacts"]);
    writePendingRelease(docsRoot, {
      dbMigration: true,
      apiRef: "a".repeat(40),
      status: "in_progress",
      dbMigrationStage: "prod-planned",
    });
    writePendingRelease(docsRoot, { status: "in_progress" });
    const pendingRef = commit(docsRoot, "omit DB scope with artifacts");
    git(docsRoot, ["push", "-u", "origin", "docs/unowned-db-artifacts"]);

    const result = runPreflight([
      "--version",
      "v9.9.0",
      "--pending-ref",
      pendingRef,
    ], docsRoot);

    assert.notEqual(result.status, 0);
    assert.match(result.stdout, /same-version DB migration artifacts require a canonical db-migration scope/);
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
      dbMigrationStage: "prod-planned",
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
      dbMigrationStage: "prod-planned",
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
    apiRef = null,
    apiTag = null,
    status = "pending",
    dbMigrationStatus = status,
    dbMigrationStage = "dev-planned",
    devPlanCreatedAt = "2026-08-04T00:00:00.000Z",
    version = "v9.9.0",
  } = {},
) {
  const releaseScopes = dbMigration ? ["docs", "db-migration"] : ["docs"];
  const scopeResults = {
    docs: {
      status,
      summary: `docs ${status}`,
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
    const planFor = (environment, devPlan = null, devExecution = null) => ({
      schema: "db-migration-maintenance-plan/v3",
      environment,
      createdAt:
        environment === "dev" ? devPlanCreatedAt : "2026-08-04T00:00:00.000Z",
      apiSourceRef: apiRef,
      databaseIdentitySha256: "b".repeat(64),
      catalog: { path: "db/schema/schema-contract.json", sha256: "c".repeat(64) },
      ledgerCompatibility: {
        path: "db/schema/ledger-compatibility.json",
        sha256: "d".repeat(64),
      },
      appliedRefs: [],
      recoveredRefs: [],
      baselineRefs: [],
      supersededRefs: [],
      adjudicableLedgerGapRefs: [],
      pendingRefs: [],
      devPlan,
      devExecution,
      failedPlan: null,
      failedExecution: null,
      runtimeContract: {},
    });
    const devPlan = Buffer.from(`${JSON.stringify(planFor("dev"), null, 2)}\n`);
    const devPlanSha256 = sha256Hex(devPlan);
    const devExecution = maintenanceExecutionFor("dev", devPlanSha256, apiRef);
    const devExecutionSha256 = sha256Hex(devExecution);
    const prodPlan = Buffer.from(
      `${JSON.stringify(
        planFor(
          "prod",
          { path: `.runtime/db-migrations/${version}/dev/plan.json`, sha256: devPlanSha256 },
          {
            path: `.runtime/db-migrations/${version}/dev/execution.jsonl`,
            sha256: devExecutionSha256,
          },
        ),
        null,
        2,
      )}\n`,
    );
    const prodPlanSha256 = sha256Hex(prodPlan);
    const prodExecution = maintenanceExecutionFor("prod", prodPlanSha256, apiRef);
    const prodExecutionSha256 = sha256Hex(prodExecution);
    fs.mkdirSync(path.join(artifactRoot, "dev"), { recursive: true });
    fs.mkdirSync(path.join(artifactRoot, "prod"), { recursive: true });
    fs.writeFileSync(path.join(artifactRoot, "dev", "plan.json"), devPlan);
    if (dbMigrationStage !== "dev-planned") {
      fs.writeFileSync(
        path.join(artifactRoot, "dev", "execution.jsonl"),
        devExecution,
      );
    }
    if (["prod-planned", "prod-completed"].includes(dbMigrationStage)) {
      fs.writeFileSync(path.join(artifactRoot, "prod", "plan.json"), prodPlan);
    }
    if (dbMigrationStage === "prod-completed") {
      fs.writeFileSync(
        path.join(artifactRoot, "prod", "execution.jsonl"),
        prodExecution,
      );
    }
    scopeResults["db-migration"] = {
      status: dbMigrationStatus,
      summary: `DB maintenance ${dbMigrationStatus}`,
      evidence: {
        schema: "db-migration-maintenance-evidence/v1",
        kind: "canonical",
        plan:
          ["prod-planned", "prod-completed"].includes(dbMigrationStage)
            ? {
                path: `content/releases/evidence/db-migrations/${version}/prod/plan.json`,
                sha256: prodPlanSha256,
              }
            : {
                path: `content/releases/evidence/db-migrations/${version}/dev/plan.json`,
                sha256: devPlanSha256,
              },
        execution:
          dbMigrationStage === "prod-completed"
            ? {
                path: `content/releases/evidence/db-migrations/${version}/prod/execution.jsonl`,
                sha256: prodExecutionSha256,
              }
            : dbMigrationStage === "dev-completed"
            ? {
                path: `content/releases/evidence/db-migrations/${version}/dev/execution.jsonl`,
                sha256: devExecutionSha256,
              }
            : null,
      },
    };
  }

  const metadata = {
    schema: "release-metadata/v2",
    version,
    status,
    releaseScopes,
    extraRepoRefs: [],
    versionMapping: {
      docs: { tag: null, commit: "pending" },
      "coupler-api": { tag: apiTag, commit: apiRef },
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
      "- `coupler-mobile-app`: Store `N/A`, 릴리스 태그 `N/A`, 커밋 `N/A`, NextPush `N/A`",
      "",
      "## 롤백 기준",
      "",
      "- preflight 실패 시 실행하지 않는다.",
      "",
    ].join("\n"),
  );
}

function sha256Hex(source) {
  return createHash("sha256").update(source).digest("hex");
}

function closedWriterInventory(runtimeSet) {
  const [unit] = runtimeSet.units;
  return [
    {
      state: "present",
      id: `${unit.id}-writer`,
      kind: unit.kind,
      runtimeUnitId: unit.id,
      sourceRef: unit.sourceRef,
      compatibilityConfigSha256: unit.compatibilityConfigSha256,
      owner: "API owner",
      stopEvidence: "writer stopped",
      verificationEvidence: "writer stop verified",
      sideEffectStopEvidence: "side effects stopped",
    },
    ...["admin", "websocket", "cron", "worker", "direct-sql"].map((kind) => ({
      state: "absent",
      kind,
      owner: `${kind} owner`,
      reason: `${kind} is not deployed`,
      verificationEvidence: `${kind} absence verified`,
    })),
  ];
}

function evidenceResult(name) {
  return { procedureRef: `procedure/${name}`, resultRef: `result/${name}` };
}

function maintenanceExecutionFor(environment, planSha256, apiRef) {
  const runtimeSet = {
    id: `${environment}-next`,
    release: "next",
    units: [
      {
        id: `${environment}-next-api`,
        kind: "api",
        sourceRef: apiRef,
        compatibilityConfigSha256: "6".repeat(64),
        roles: ["db-reader", "db-writer"],
      },
    ],
  };
  const startMixture = {
    mixtureId: `${environment}-start`,
    runtimeSet,
    schemaState: "plan-start",
    schemaFingerprintSha256: "4".repeat(64),
  };
  const finalMixture = {
    mixtureId: `${environment}-next-final`,
    runtimeSet,
    schemaState: "plan-final",
    schemaFingerprintSha256: "5".repeat(64),
  };
  const eventData = [
    {
      type: "phase-fenced",
      data: {
        tlsCipher: "TLS_AES_256_GCM_SHA384",
        writerInventorySha256: "9".repeat(64),
        writers: closedWriterInventory(runtimeSet),
        backup: { ref: "backup/dev/example", sha256: "a".repeat(64) },
        sessions: 0,
        transactions: 0,
        mixture: startMixture,
      },
    },
    {
      type: "database-completed",
      data: { catalogSha256: "c".repeat(64), ledgerCount: 1 },
    },
    { type: "lock-released", data: {} },
    {
      type: "fenced-smoke-completed",
      data: {
        mixture: finalMixture,
        mode: "read-only",
        modeEvidence: {
          mode: "read-only",
          readOnlyAccessEvidence: "read-only access verified",
        },
        smokeResult: evidenceResult("fenced-smoke"),
        surfaceResiduals: [],
      },
    },
    { type: "lock-released", data: {} },
    {
      type: "phase-resumed",
      data: {
        mixture: finalMixture,
        resumeEvidence: "writers resumed",
        startWatermarks: [],
      },
    },
    { type: "lock-released", data: {} },
    {
      type: "service-completed",
      data: {
        activeMixture: finalMixture,
        restartEvidence: "runtime restarted",
        smokeEvidence: "smoke passed",
        recoveryReadinessEvidence: "recovery readiness verified",
        runningRuntimeSha256: "7".repeat(64),
        runningUnits: [
          {
            runtimeUnitId: `${environment}-next-api`,
            kind: "api",
            sourceRef: apiRef,
            compatibilityConfigSha256: "6".repeat(64),
            observationEvidence: "runtime source and config observed",
          },
        ],
        runtimeContractSha256: sha256Hex(`${JSON.stringify({}, null, 2)}\n`),
      },
    },
  ];
  const events = eventData.map((event, index) => ({
    schema: "db-migration-maintenance-event/v3",
    sequence: index + 1,
    at: new Date(Date.UTC(2026, 7, 4, 0, 0, index)).toISOString(),
    environment,
    planSha256,
    ...event,
  }));
  return Buffer.from(`${events.map((event) => JSON.stringify(event)).join("\n")}\n`);
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
