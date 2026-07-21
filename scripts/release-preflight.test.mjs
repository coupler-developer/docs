import { execFileSync, spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, it } from "node:test";
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";

const testFilePath = fileURLToPath(import.meta.url);
const scriptsRoot = path.dirname(testFilePath);
const preflightScript = path.join(scriptsRoot, "release-preflight.mjs");

let tempRoot;

beforeEach(() => {
  tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "release-preflight-"));
});

afterEach(() => {
  fs.rmSync(tempRoot, { recursive: true, force: true });
});

describe("release-preflight", () => {
  it("fails when --version is omitted before workspace discovery", () => {
    const workspace = createDocsOnlyWorkspace();

    const result = runPreflight([
      "--include",
      "docs",
    ], workspace.docsRoot);

    assert.notEqual(result.status, 0);
    assert.match(result.stdout, /--version is required for release preflight/);
    assert.match(result.stdout, /workspace root: N\/A \(scope unresolved\)/);
    assert.match(result.stdout, /preflight repos: unresolved/);
    assert.match(result.stdout, /Result: FAIL/);
  });

  it("reports unknown CLI arguments without a stack trace", () => {
    const workspace = createDocsOnlyWorkspace();

    const result = runPreflight([
      "--versions",
      "v9.9.0",
    ], workspace.docsRoot);

    assert.notEqual(result.status, 0);
    assert.match(result.stdout, /Unknown argument: --versions/);
    assert.match(result.stdout, /Result: FAIL/);
    assert.doesNotMatch(result.stderr, /Error:|at /);
  });

  it("reports unknown --include repositories without a stack trace", () => {
    const workspace = createDocsOnlyWorkspace();
    writeReleaseRecord(workspace.docsRoot, "v9.9.0", [
      docsPlannedMappingLine(),
      "- `coupler-api`: `N/A` (이번 릴리스 제외)",
      "- `coupler-admin-web`: `N/A` (이번 릴리스 제외)",
      "- `coupler-mobile-app`: Store `N/A`, 릴리스 태그 `N/A`, 커밋 `N/A`, NextPush `N/A`",
    ], {
      releaseScopes: ["docs"],
      pendingScope: "docs release record",
    });
    commitAll(workspace.docsRoot);

    const result = runPreflight([
      "--version",
      "v9.9.0",
      "--include",
      "unknown",
    ], workspace.docsRoot);

    assert.notEqual(result.status, 0);
    assert.match(result.stdout, /Unknown --include repository: unknown/);
    assert.match(result.stdout, /Result: FAIL/);
    assert.doesNotMatch(result.stderr, /Error:|at /);
  });

  it("passes docs-only preflight without service repositories", () => {
    const workspace = createDocsOnlyWorkspace();
    writeReleaseRecord(workspace.docsRoot, "v9.9.0", [
      docsPlannedMappingLine(),
      "- `coupler-api`: `N/A` (이번 릴리스 제외)",
      "- `coupler-admin-web`: `N/A` (이번 릴리스 제외)",
      "- `coupler-mobile-app`: Store `N/A`, 릴리스 태그 `N/A`, 커밋 `N/A`, NextPush `N/A`",
    ], {
      releaseScopes: ["docs"],
      pendingScope: "docs release record",
    });
    commitAll(workspace.docsRoot);

    const result = runPreflight([
      "--version",
      "v9.9.0",
      "--include",
      "docs",
    ], workspace.docsRoot);

    assert.equal(result.status, 0, result.stdout + result.stderr);
    assert.match(result.stdout, /workspace root: N\/A \(docs only\)/);
    assert.match(result.stdout, /preflight repos: docs/);
    assert.doesNotMatch(result.stdout, /Workspace root not found/);
    assert.match(result.stdout, /Result: PASS/);
  });

  it("fails missing release records before workspace discovery", () => {
    const workspace = createDocsOnlyWorkspace();

    const result = runPreflight([
      "--version",
      "v9.9.0",
    ], workspace.docsRoot);

    assert.notEqual(result.status, 0);
    assert.match(result.stdout, /release record is missing: content\/releases\/v9\.9\.0\.md/);
    assert.match(result.stdout, /workspace root: N\/A \(scope unresolved\)/);
    assert.doesNotMatch(result.stdout, /Workspace root not found/);
    assert.match(result.stdout, /Result: FAIL/);
  });

  it("fails with a report when service repos are targeted but workspace is missing", () => {
    const workspace = createDocsOnlyWorkspace();
    const mobileCommit = "0123456789abcdef0123456789abcdef01234567";
    writeReleaseRecord(workspace.docsRoot, "v9.9.0", [
      docsPlannedMappingLine(),
      "- `coupler-api`: `N/A` (이번 릴리스 제외)",
      "- `coupler-admin-web`: `N/A` (이번 릴리스 제외)",
      "- `coupler-mobile-app`: Store `9.9.0 (900)`, 릴리스 태그 `N/A`, 커밋 `" + mobileCommit + "`",
    ]);
    commitAll(workspace.docsRoot);

    const result = runPreflight([
      "--version",
      "v9.9.0",
    ], workspace.docsRoot);

    assert.notEqual(result.status, 0);
    assert.match(result.stdout, /Workspace root not found/);
    assert.match(result.stdout, /workspace root: N\/A \(service workspace unresolved\)/);
    assert.match(result.stdout, /Result: FAIL/);
  });

  it("passes when repo refs are clean main and mapped service refs match origin/main", () => {
    const workspace = createWorkspace();
    writeReleaseRecord(workspace.docsRoot, "v9.9.0", [
      docsPlannedMappingLine(),
      "- `coupler-api`: `N/A` (이번 릴리스 제외)",
      "- `coupler-admin-web`: `N/A` (이번 릴리스 제외)",
      "- `coupler-mobile-app`: Store `9.9.0 (900)`, 릴리스 태그 `N/A`, 커밋 `" + workspace.refs.mobile + "`",
    ]);
    commitAll(workspace.docsRoot);

    const result = runPreflight([
      "--version",
      "v9.9.0",
      "--workspace-root",
      tempRoot,
    ], workspace.docsRoot);

    assert.equal(result.status, 0, result.stdout + result.stderr);
    assert.match(result.stdout, /Result: PASS/);
  });

  it("passes a pushed pending release PR head without requiring docs main", () => {
    const workspace = createWorkspace();
    git(workspace.docsRoot, ["checkout", "-b", "docs/test/single-pr-release"]);
    writeReleaseRecord(workspace.docsRoot, "v9.9.0", [
      docsPlannedMappingLine(),
      "- `coupler-api`: `N/A` (이번 릴리스 제외)",
      "- `coupler-admin-web`: `N/A` (이번 릴리스 제외)",
      "- `coupler-mobile-app`: Store `9.9.0 (900)`, 릴리스 태그 `N/A`, 커밋 `" + workspace.refs.mobile + "`, NextPush `N/A`",
    ], {
      status: "pending",
      releaseScopes: ["docs", "mobile-nextpush"],
      pendingScope: "Mobile NextPush 운영 배포와 검증",
    });
    const pendingRef = commitAndPushCurrentBranch(workspace.docsRoot);

    const result = runPreflight([
      "--version",
      "v9.9.0",
      "--workspace-root",
      tempRoot,
      "--pending-ref",
      pendingRef,
    ], workspace.docsRoot);

    assert.equal(result.status, 0, result.stdout + result.stderr);
    assert.match(result.stdout, /docs record ref: pending [0-9a-f]{12}/);
    assert.match(result.stdout, /docs: branch=docs\/test\/single-pr-release/);
    assert.match(result.stdout, /Result: PASS/);
  });

  it("rejects --pending-ref when the release record is not pending", () => {
    const workspace = createWorkspace();
    git(workspace.docsRoot, ["checkout", "-b", "docs/test/planned-release"]);
    writeReleaseRecord(workspace.docsRoot, "v9.9.0", [
      docsPlannedMappingLine(),
      "- `coupler-api`: `N/A` (이번 릴리스 제외)",
      "- `coupler-admin-web`: `N/A` (이번 릴리스 제외)",
      "- `coupler-mobile-app`: Store `9.9.0 (900)`, 릴리스 태그 `N/A`, 커밋 `" + workspace.refs.mobile + "`, NextPush `N/A`",
    ], {
      status: "planned",
      releaseScopes: ["docs", "mobile-nextpush"],
      pendingScope: "Mobile NextPush 운영 배포와 검증",
    });
    const plannedRef = commitAndPushCurrentBranch(workspace.docsRoot);

    const result = runPreflight([
      "--version",
      "v9.9.0",
      "--workspace-root",
      tempRoot,
      "--pending-ref",
      plannedRef,
    ], workspace.docsRoot);

    assert.notEqual(result.status, 0);
    assert.match(result.stdout, /--pending-ref requires release-metadata status pending, got planned/);
    assert.match(result.stdout, /Result: FAIL/);
  });

  it("rejects an unpushed pending release branch", () => {
    const workspace = createWorkspace();
    git(workspace.docsRoot, ["checkout", "-b", "docs/test/unpushed-release"]);
    writeReleaseRecord(workspace.docsRoot, "v9.9.0", [
      docsPlannedMappingLine(),
      "- `coupler-api`: `N/A` (이번 릴리스 제외)",
      "- `coupler-admin-web`: `N/A` (이번 릴리스 제외)",
      "- `coupler-mobile-app`: Store `9.9.0 (900)`, 릴리스 태그 `N/A`, 커밋 `" + workspace.refs.mobile + "`, NextPush `N/A`",
    ], {
      status: "pending",
      releaseScopes: ["docs", "mobile-nextpush"],
      pendingScope: "Mobile NextPush 운영 배포와 검증",
    });
    const pendingRef = commitCurrentBranch(workspace.docsRoot);

    const result = runPreflight([
      "--version",
      "v9.9.0",
      "--workspace-root",
      tempRoot,
      "--pending-ref",
      pendingRef,
    ], workspace.docsRoot);

    assert.notEqual(result.status, 0);
    assert.match(result.stdout, /docs: pending release branch must be pushed to an origin upstream/);
    assert.match(result.stdout, /Result: FAIL/);
  });

  it("rejects local commits added after the pushed pending ref", () => {
    const workspace = createWorkspace();
    git(workspace.docsRoot, ["checkout", "-b", "docs/test/advanced-after-pending"]);
    writeReleaseRecord(workspace.docsRoot, "v9.9.0", [
      docsPlannedMappingLine(),
      "- `coupler-api`: `N/A` (이번 릴리스 제외)",
      "- `coupler-admin-web`: `N/A` (이번 릴리스 제외)",
      "- `coupler-mobile-app`: Store `9.9.0 (900)`, 릴리스 태그 `N/A`, 커밋 `" + workspace.refs.mobile + "`, NextPush `N/A`",
    ], {
      status: "pending",
      releaseScopes: ["docs", "mobile-nextpush"],
      pendingScope: "Mobile NextPush 운영 배포와 검증",
    });
    const pendingRef = commitAndPushCurrentBranch(workspace.docsRoot);
    fs.writeFileSync(path.join(workspace.docsRoot, "AFTER_PENDING.md"), "# Changed after pending\n");
    commitCurrentBranch(workspace.docsRoot);

    const result = runPreflight([
      "--version",
      "v9.9.0",
      "--workspace-root",
      tempRoot,
      "--pending-ref",
      pendingRef,
    ], workspace.docsRoot);

    assert.notEqual(result.status, 0);
    assert.match(result.stdout, /docs: --pending-ref must equal the checked-out docs HEAD/);
    assert.match(result.stdout, /Result: FAIL/);
  });

  it("rejects a pushed pending release branch that is behind origin/main", () => {
    const workspace = createWorkspace();
    const releaseBranch = "docs/test/stale-pending-release";
    git(workspace.docsRoot, ["checkout", "-b", releaseBranch]);
    writeReleaseRecord(workspace.docsRoot, "v9.9.0", [
      docsPlannedMappingLine(),
      "- `coupler-api`: `N/A` (이번 릴리스 제외)",
      "- `coupler-admin-web`: `N/A` (이번 릴리스 제외)",
      "- `coupler-mobile-app`: Store `9.9.0 (900)`, 릴리스 태그 `N/A`, 커밋 `" + workspace.refs.mobile + "`, NextPush `N/A`",
    ], {
      status: "pending",
      releaseScopes: ["docs", "mobile-nextpush"],
      pendingScope: "Mobile NextPush 운영 배포와 검증",
    });
    const pendingRef = commitAndPushCurrentBranch(workspace.docsRoot);

    git(workspace.docsRoot, ["checkout", "main"]);
    fs.writeFileSync(path.join(workspace.docsRoot, "MAIN_ADVANCE.md"), "# Main advance\n");
    commitAll(workspace.docsRoot);
    git(workspace.docsRoot, ["checkout", releaseBranch]);

    const result = runPreflight([
      "--version",
      "v9.9.0",
      "--workspace-root",
      tempRoot,
      "--pending-ref",
      pendingRef,
    ], workspace.docsRoot);

    assert.notEqual(result.status, 0);
    assert.match(result.stdout, /docs: pending release branch must include the latest origin\/main/);
    assert.match(result.stdout, /Result: FAIL/);
  });

  it("passes released DB migration preflight when SQL file exists and checksum matches", () => {
    const workspace = createWorkspace();
    const sqlRef = writeSqlFile(
      workspace.apiRoot,
      "db/migrations/99_expand_example.sql",
      "SELECT 1 AS dbm_gate_000;\n",
    );
    const apiCommit = commitAll(workspace.apiRoot);
    writeReleaseRecord(workspace.docsRoot, "v9.9.0", [
      docsReleasedMappingLine(),
      "- `coupler-api`: 태그 `N/A`, 커밋 `" + apiCommit + "`",
      "- `coupler-admin-web`: `N/A` (이번 릴리스 제외)",
      "- `coupler-mobile-app`: Store `N/A`, 릴리스 태그 `N/A`, 커밋 `N/A`, NextPush `N/A`",
    ], {
      status: "released",
      pendingScope: "N/A",
      releaseScopes: ["docs", "db-migration"],
      scopeResults: buildDbMigrationScopeResults(sqlRef),
    });
    commitAll(workspace.docsRoot);
    pushRemoteAnnotatedTagAndDeleteLocal(workspace.docsRoot, "v9.9.0");

    const result = runPreflight([
      "--version",
      "v9.9.0",
      "--workspace-root",
      tempRoot,
    ], workspace.docsRoot);

    assert.equal(result.status, 0, result.stdout + result.stderr);
    assert.match(result.stdout, /preflight repos: docs, coupler-api/);
    assert.match(result.stdout, /Result: PASS/);
  });

  it("fails released DB migration preflight when SQL file is missing from coupler-api", () => {
    const workspace = createWorkspace();
    const sqlRef = {
      repo: "coupler-api",
      path: "db/migrations/99_missing_example.sql",
      checksumSha256: sha256("SELECT 1 AS dbm_gate_000;\n"),
      gateIds: ["DBM-GATE-000", "DBM-GATE-010", "DBM-GATE-100"],
    };
    writeReleaseRecord(workspace.docsRoot, "v9.9.0", [
      docsReleasedMappingLine(),
      "- `coupler-api`: 태그 `N/A`, 커밋 `" + workspace.refs.api + "`",
      "- `coupler-admin-web`: `N/A` (이번 릴리스 제외)",
      "- `coupler-mobile-app`: Store `N/A`, 릴리스 태그 `N/A`, 커밋 `N/A`, NextPush `N/A`",
    ], {
      status: "released",
      pendingScope: "N/A",
      releaseScopes: ["docs", "db-migration"],
      scopeResults: buildDbMigrationScopeResults(sqlRef),
    });
    commitAll(workspace.docsRoot);
    pushRemoteAnnotatedTagAndDeleteLocal(workspace.docsRoot, "v9.9.0");

    const result = runPreflight([
      "--version",
      "v9.9.0",
      "--workspace-root",
      tempRoot,
    ], workspace.docsRoot);

    assert.notEqual(result.status, 0);
    assert.match(result.stdout, /DB migration SQL file is missing: coupler-api\/db\/migrations\/99_missing_example\.sql/);
    assert.match(result.stdout, /Result: FAIL/);
  });

  it("fails released DB migration preflight when SQL checksum mismatches", () => {
    const workspace = createWorkspace();
    const sqlRef = writeSqlFile(
      workspace.apiRoot,
      "db/migrations/99_expand_example.sql",
      "SELECT 1 AS dbm_gate_000;\n",
    );
    sqlRef.checksumSha256 = sha256("SELECT 2 AS dbm_gate_000;\n");
    const apiCommit = commitAll(workspace.apiRoot);
    writeReleaseRecord(workspace.docsRoot, "v9.9.0", [
      docsReleasedMappingLine(),
      "- `coupler-api`: 태그 `N/A`, 커밋 `" + apiCommit + "`",
      "- `coupler-admin-web`: `N/A` (이번 릴리스 제외)",
      "- `coupler-mobile-app`: Store `N/A`, 릴리스 태그 `N/A`, 커밋 `N/A`, NextPush `N/A`",
    ], {
      status: "released",
      pendingScope: "N/A",
      releaseScopes: ["docs", "db-migration"],
      scopeResults: buildDbMigrationScopeResults(sqlRef),
    });
    commitAll(workspace.docsRoot);
    pushRemoteAnnotatedTagAndDeleteLocal(workspace.docsRoot, "v9.9.0");

    const result = runPreflight([
      "--version",
      "v9.9.0",
      "--workspace-root",
      tempRoot,
    ], workspace.docsRoot);

    assert.notEqual(result.status, 0);
    assert.match(result.stdout, /DB migration SQL checksum mismatch for coupler-api\/db\/migrations\/99_expand_example\.sql/);
    assert.match(result.stdout, /Result: FAIL/);
  });

  it("fails when docs metadata uses a concrete commit self-reference", () => {
    const workspace = createWorkspace();
    writeReleaseRecord(workspace.docsRoot, "v9.9.0", [
      "- `docs`: 기록 버전 `v9.9.0`, 태그 `N/A`, 커밋 `" + workspace.refs.docs + "`",
      "- `coupler-api`: `N/A` (이번 릴리스 제외)",
      "- `coupler-admin-web`: `N/A` (이번 릴리스 제외)",
      "- `coupler-mobile-app`: Store `9.9.0 (900)`, 릴리스 태그 `N/A`, 커밋 `" + workspace.refs.mobile + "`",
    ]);
    commitAll(workspace.docsRoot);

    const result = runPreflight([
      "--version",
      "v9.9.0",
      "--workspace-root",
      tempRoot,
    ], workspace.docsRoot);

    assert.notEqual(result.status, 0);
    assert.match(
      result.stdout,
      /docs metadata commit is not a stable self-reference/,
    );
  });

  it("fails when a mapped service commit is behind origin/main", () => {
    const workspace = createWorkspace();
    const staleMobileCommit = workspace.refs.mobile;
    const currentMobileCommit = advanceMain(workspace.mobileRoot);
    writeReleaseRecord(workspace.docsRoot, "v9.9.0", [
      docsPlannedMappingLine(),
      "- `coupler-api`: `N/A` (이번 릴리스 제외)",
      "- `coupler-admin-web`: `N/A` (이번 릴리스 제외)",
      "- `coupler-mobile-app`: Store `9.9.0 (900)`, 릴리스 태그 `N/A`, 커밋 `" + staleMobileCommit + "`",
    ]);
    commitAll(workspace.docsRoot);

    const result = runPreflight([
      "--version",
      "v9.9.0",
      "--workspace-root",
      tempRoot,
    ], workspace.docsRoot);

    assert.notEqual(result.status, 0);
    assert.match(
      result.stdout,
      new RegExp(`coupler-mobile-app: 버전 매핑 ref는 현재 origin/main 기준점과 같아야 합니다: commit ${staleMobileCommit} -> ${staleMobileCommit.slice(0, 12)}, origin/main -> ${currentMobileCommit.slice(0, 12)}`),
    );
  });

  it("fails when a release tag field has an unresolved ref", () => {
    const workspace = createWorkspace();
    writeReleaseRecord(workspace.docsRoot, "v9.9.0", [
      docsPlannedMappingLine(),
      "- `coupler-api`: `N/A` (이번 릴리스 제외)",
      "- `coupler-admin-web`: `N/A` (이번 릴리스 제외)",
      "- `coupler-mobile-app`: Store `9.9.0 (900)`, 릴리스 태그 `v9.9.0`, 커밋 `N/A`",
    ]);
    commitAll(workspace.docsRoot);

    const result = runPreflight([
      "--version",
      "v9.9.0",
      "--workspace-root",
      tempRoot,
    ], workspace.docsRoot);

    assert.notEqual(result.status, 0);
    assert.match(
      result.stdout,
      /coupler-mobile-app: 버전 매핑 tag를 origin에서 확인하지 못했습니다: v9\.9\.0/,
    );
  });

  it("passes when a mapped release tag exists on origin but not in local tags", () => {
    const workspace = createWorkspace();
    pushRemoteAnnotatedTagAndDeleteLocal(workspace.mobileRoot, "v9.9.0");
    writeReleaseRecord(workspace.docsRoot, "v9.9.0", [
      docsPlannedMappingLine(),
      "- `coupler-api`: `N/A` (이번 릴리스 제외)",
      "- `coupler-admin-web`: `N/A` (이번 릴리스 제외)",
      "- `coupler-mobile-app`: Store `9.9.0 (900)`, 릴리스 태그 `v9.9.0`, 커밋 `N/A`",
    ]);
    commitAll(workspace.docsRoot);

    const result = runPreflight([
      "--version",
      "v9.9.0",
      "--workspace-root",
      tempRoot,
    ], workspace.docsRoot);

    assert.equal(result.status, 0, result.stdout + result.stderr);
    assert.match(result.stdout, /Result: PASS/);
  });

  it("fails when a mapped release tag is lightweight", () => {
    const workspace = createWorkspace();
    pushRemoteLightweightTagAndDeleteLocal(workspace.mobileRoot, "v9.9.0");
    writeReleaseRecord(workspace.docsRoot, "v9.9.0", [
      docsPlannedMappingLine(),
      "- `coupler-api`: `N/A` (이번 릴리스 제외)",
      "- `coupler-admin-web`: `N/A` (이번 릴리스 제외)",
      "- `coupler-mobile-app`: Store `9.9.0 (900)`, 릴리스 태그 `v9.9.0`, 커밋 `N/A`",
    ]);
    commitAll(workspace.docsRoot);

    const result = runPreflight([
      "--version",
      "v9.9.0",
      "--workspace-root",
      tempRoot,
    ], workspace.docsRoot);

    assert.notEqual(result.status, 0);
    assert.match(
      result.stdout,
      /coupler-mobile-app: 버전 매핑 tag는 annotated tag여야 합니다: v9\.9\.0/,
    );
  });

  it("fails when a mapped release tag is behind origin/main", () => {
    const workspace = createWorkspace();
    pushRemoteAnnotatedTagAndDeleteLocal(workspace.mobileRoot, "v9.9.0");
    const currentMobileCommit = advanceMain(workspace.mobileRoot);
    writeReleaseRecord(workspace.docsRoot, "v9.9.0", [
      docsPlannedMappingLine(),
      "- `coupler-api`: `N/A` (이번 릴리스 제외)",
      "- `coupler-admin-web`: `N/A` (이번 릴리스 제외)",
      "- `coupler-mobile-app`: Store `9.9.0 (900)`, 릴리스 태그 `v9.9.0`, 커밋 `N/A`",
    ]);
    commitAll(workspace.docsRoot);

    const result = runPreflight([
      "--version",
      "v9.9.0",
      "--workspace-root",
      tempRoot,
    ], workspace.docsRoot);

    assert.notEqual(result.status, 0);
    assert.match(
      result.stdout,
      new RegExp(`coupler-mobile-app: 버전 매핑 ref는 현재 origin/main 기준점과 같아야 합니다: tag v9.9.0 -> ${workspace.refs.mobile.slice(0, 12)}, origin/main -> ${currentMobileCommit.slice(0, 12)}`),
    );
  });

  it("fails when a mapped release tag points outside origin/main", () => {
    const workspace = createWorkspace();
    pushRemoteAnnotatedTagOutsideMain(workspace.mobileRoot, "v9.9.0");
    writeReleaseRecord(workspace.docsRoot, "v9.9.0", [
      docsPlannedMappingLine(),
      "- `coupler-api`: `N/A` (이번 릴리스 제외)",
      "- `coupler-admin-web`: `N/A` (이번 릴리스 제외)",
      "- `coupler-mobile-app`: Store `9.9.0 (900)`, 릴리스 태그 `v9.9.0`, 커밋 `N/A`",
    ]);
    commitAll(workspace.docsRoot);

    const result = runPreflight([
      "--version",
      "v9.9.0",
      "--workspace-root",
      tempRoot,
    ], workspace.docsRoot);

    assert.notEqual(result.status, 0);
    assert.match(
      result.stdout,
      /coupler-mobile-app: 버전 매핑 ref가 origin\/main 계보에 없습니다: v9\.9\.0/,
    );
  });

  it("fails when mapped release tag and commit point to different commits", () => {
    const workspace = createWorkspace();
    pushRemoteAnnotatedTagAndDeleteLocal(workspace.mobileRoot, "v9.9.0");
    const newerCommit = advanceMain(workspace.mobileRoot);
    writeReleaseRecord(workspace.docsRoot, "v9.9.0", [
      docsPlannedMappingLine(),
      "- `coupler-api`: `N/A` (이번 릴리스 제외)",
      "- `coupler-admin-web`: `N/A` (이번 릴리스 제외)",
      "- `coupler-mobile-app`: Store `9.9.0 (900)`, 릴리스 태그 `v9.9.0`, 커밋 `" + newerCommit + "`",
    ]);
    commitAll(workspace.docsRoot);

    const result = runPreflight([
      "--version",
      "v9.9.0",
      "--workspace-root",
      tempRoot,
    ], workspace.docsRoot);

    assert.notEqual(result.status, 0);
    assert.match(
      result.stdout,
      /coupler-mobile-app: 버전 매핑 tag와 commit이 같은 기준점을 가리켜야 합니다:/,
    );
  });

  it("fails when --include omits derived preflight repos from the release record", () => {
    const workspace = createWorkspace();
    writeReleaseRecord(workspace.docsRoot, "v9.9.0", [
      docsPlannedMappingLine(),
      "- `coupler-api`: `N/A` (이번 릴리스 제외)",
      "- `coupler-admin-web`: `N/A` (이번 릴리스 제외)",
      "- `coupler-mobile-app`: 커밋 `" + workspace.refs.mobile + "`",
    ]);
    commitAll(workspace.docsRoot);

    const result = runPreflight([
      "--version",
      "v9.9.0",
      "--workspace-root",
      tempRoot,
      "--include",
      "admin",
    ], workspace.docsRoot);

    assert.notEqual(result.status, 0);
    assert.match(result.stdout, /--include must match release-metadata derived preflightRepoNames/);
    assert.match(result.stdout, /Result: FAIL/);
  });

  it("fails when a mapped included repo has only N/A and no ref", () => {
    const workspace = createWorkspace();
    writeReleaseRecord(workspace.docsRoot, "v9.9.0", [
      docsPlannedMappingLine(),
      "- `coupler-api`: `N/A` (이번 릴리스 제외)",
      "- `coupler-admin-web`: `N/A` (이번 릴리스 제외)",
      "- `coupler-mobile-app`: 릴리스 태그 `N/A`, 커밋 `N/A`",
    ]);
    commitAll(workspace.docsRoot);

    const result = runPreflight([
      "--version",
      "v9.9.0",
      "--workspace-root",
      tempRoot,
    ], workspace.docsRoot);

    assert.notEqual(result.status, 0);
    assert.match(
      result.stdout,
      /coupler-mobile-app: 버전 매핑에 확인 가능한 tag 또는 SHA가 없습니다/,
    );
  });

  it("fails when a mapped included repo has an unresolved ref", () => {
    const workspace = createWorkspace();
    const missingSha = "0123456789abcdef0123456789abcdef01234567";
    writeReleaseRecord(workspace.docsRoot, "v9.9.0", [
      docsPlannedMappingLine(),
      "- `coupler-api`: `N/A` (이번 릴리스 제외)",
      "- `coupler-admin-web`: `N/A` (이번 릴리스 제외)",
      "- `coupler-mobile-app`: 릴리스 태그 `N/A`, 커밋 `" + missingSha + "`",
    ]);
    commitAll(workspace.docsRoot);

    const result = runPreflight([
      "--version",
      "v9.9.0",
      "--workspace-root",
      tempRoot,
    ], workspace.docsRoot);

    assert.notEqual(result.status, 0);
    assert.match(
      result.stdout,
      new RegExp(`coupler-mobile-app: 버전 매핑 commit을 origin/main 로컬 객체에서 확인하지 못했습니다: ${missingSha}`),
    );
  });

  it("fails when a mapped commit exists locally but is outside origin/main", () => {
    const workspace = createWorkspace();
    const sideCommit = createSideBranchCommit(workspace.mobileRoot);
    writeReleaseRecord(workspace.docsRoot, "v9.9.0", [
      docsPlannedMappingLine(),
      "- `coupler-api`: `N/A` (이번 릴리스 제외)",
      "- `coupler-admin-web`: `N/A` (이번 릴리스 제외)",
      "- `coupler-mobile-app`: 릴리스 태그 `N/A`, 커밋 `" + sideCommit + "`",
    ]);
    commitAll(workspace.docsRoot);

    const result = runPreflight([
      "--version",
      "v9.9.0",
      "--workspace-root",
      tempRoot,
    ], workspace.docsRoot);

    assert.notEqual(result.status, 0);
    assert.match(
      result.stdout,
      new RegExp(`coupler-mobile-app: 버전 매핑 ref가 origin/main 계보에 없습니다: ${sideCommit}`),
    );
  });

  it("fetches origin/main and fails when the remote main branch advanced", () => {
    const workspace = createWorkspace();
    writeReleaseRecord(workspace.docsRoot, "v9.9.0", [
      docsPlannedMappingLine(),
      "- `coupler-api`: `N/A` (이번 릴리스 제외)",
      "- `coupler-admin-web`: `N/A` (이번 릴리스 제외)",
      "- `coupler-mobile-app`: 커밋 `" + workspace.refs.mobile + "`",
    ]);
    commitAll(workspace.docsRoot);
    advanceRemoteMainWithoutLocalFetch(workspace.mobileRoot);

    const result = runPreflight([
      "--version",
      "v9.9.0",
      "--workspace-root",
      tempRoot,
    ], workspace.docsRoot);

    assert.notEqual(result.status, 0);
    assert.match(result.stdout, /coupler-mobile-app: HEAD is not exactly origin\/main/);
    assert.match(result.stdout, /Result: FAIL/);
  });

  it("fails when a release record has no version mapping section", () => {
    const workspace = createWorkspace();
    writeReleaseRecord(workspace.docsRoot, "v9.9.0", null);
    commitAll(workspace.docsRoot);

    const result = runPreflight([
      "--version",
      "v9.9.0",
      "--workspace-root",
      tempRoot,
      "--include",
      "docs,mobile",
    ], workspace.docsRoot);

    assert.notEqual(result.status, 0);
    assert.match(result.stdout, /버전 매핑 section is missing or empty/);
  });

  it("passes when released status keeps pending scope explicitly N/A", () => {
    const workspace = createWorkspace();
    writeReleaseRecord(workspace.docsRoot, "v9.9.0", [
      docsReleasedMappingLine(),
      "- `coupler-api`: `N/A` (이번 릴리스 제외)",
      "- `coupler-admin-web`: `N/A` (이번 릴리스 제외)",
      "- `coupler-mobile-app`: Store `9.9.0 (900)`, 릴리스 태그 `v9.9.0`, 커밋 `N/A`",
    ], {
      status: "released",
      pendingScope: "N/A",
    });
    commitAll(workspace.docsRoot);
    pushRemoteAnnotatedTagAndDeleteLocal(workspace.docsRoot, "v9.9.0");
    pushRemoteAnnotatedTagAndDeleteLocal(workspace.mobileRoot, "v9.9.0");

    const result = runPreflight([
      "--version",
      "v9.9.0",
      "--workspace-root",
      tempRoot,
    ], workspace.docsRoot);

    assert.equal(result.status, 0, result.stdout + result.stderr);
    assert.match(result.stdout, /Result: PASS/);
  });

  it("passes when terminal docs tag is an ancestor of current origin/main", () => {
    const workspace = createWorkspace();
    writeReleaseRecord(workspace.docsRoot, "v9.9.0", [
      docsReleasedMappingLine(),
      "- `coupler-api`: `N/A` (이번 릴리스 제외)",
      "- `coupler-admin-web`: `N/A` (이번 릴리스 제외)",
      "- `coupler-mobile-app`: Store `9.9.0 (900)`, 릴리스 태그 `v9.9.0`, 커밋 `N/A`",
    ], {
      status: "released",
      pendingScope: "N/A",
    });
    commitAll(workspace.docsRoot);
    pushRemoteAnnotatedTagAndDeleteLocal(workspace.docsRoot, "v9.9.0");
    advanceMain(workspace.docsRoot);
    pushRemoteAnnotatedTagAndDeleteLocal(workspace.mobileRoot, "v9.9.0");

    const result = runPreflight([
      "--version",
      "v9.9.0",
      "--workspace-root",
      tempRoot,
    ], workspace.docsRoot);

    assert.equal(result.status, 0, result.stdout + result.stderr);
    assert.match(result.stdout, /Result: PASS/);
  });

  it("fails terminal release metadata when docs tag is missing from origin", () => {
    const workspace = createWorkspace();
    writeReleaseRecord(workspace.docsRoot, "v9.9.0", [
      docsReleasedMappingLine(),
      "- `coupler-api`: `N/A` (이번 릴리스 제외)",
      "- `coupler-admin-web`: `N/A` (이번 릴리스 제외)",
      "- `coupler-mobile-app`: Store `9.9.0 (900)`, 릴리스 태그 `v9.9.0`, 커밋 `N/A`",
    ], {
      status: "released",
      pendingScope: "N/A",
    });
    commitAll(workspace.docsRoot);
    pushRemoteAnnotatedTagAndDeleteLocal(workspace.mobileRoot, "v9.9.0");

    const result = runPreflight([
      "--version",
      "v9.9.0",
      "--workspace-root",
      tempRoot,
    ], workspace.docsRoot);

    assert.notEqual(result.status, 0);
    assert.match(
      result.stdout,
      /terminal release metadata tag를 origin에서 확인하지 못했습니다: v9\.9\.0/,
    );
  });

  it("fails when terminal docs tag points outside origin/main", () => {
    const workspace = createWorkspace();
    writeReleaseRecord(workspace.docsRoot, "v9.9.0", [
      docsReleasedMappingLine(),
      "- `coupler-api`: `N/A` (이번 릴리스 제외)",
      "- `coupler-admin-web`: `N/A` (이번 릴리스 제외)",
      "- `coupler-mobile-app`: Store `9.9.0 (900)`, 릴리스 태그 `v9.9.0`, 커밋 `N/A`",
    ], {
      status: "released",
      pendingScope: "N/A",
    });
    commitAll(workspace.docsRoot);
    pushRemoteAnnotatedTagOutsideMain(workspace.docsRoot, "v9.9.0");
    pushRemoteAnnotatedTagAndDeleteLocal(workspace.mobileRoot, "v9.9.0");

    const result = runPreflight([
      "--version",
      "v9.9.0",
      "--workspace-root",
      tempRoot,
    ], workspace.docsRoot);

    assert.notEqual(result.status, 0);
    assert.match(
      result.stdout,
      /docs: 버전 매핑 ref가 origin\/main 계보에 없습니다: v9\.9\.0/,
    );
  });

  it("fails when released status has a pending scope value", () => {
    const workspace = createWorkspace();
    writeReleaseRecord(workspace.docsRoot, "v9.9.0", [
      docsReleasedMappingLine(),
      "- `coupler-api`: `N/A` (이번 릴리스 제외)",
      "- `coupler-admin-web`: `N/A` (이번 릴리스 제외)",
      "- `coupler-mobile-app`: Store `9.9.0 (900)`, 릴리스 태그 `v9.9.0`, 커밋 `N/A`",
    ], {
      status: "released",
      pendingScope: "Store review 대기",
    });
    commitAll(workspace.docsRoot);
    pushRemoteAnnotatedTagAndDeleteLocal(workspace.docsRoot, "v9.9.0");
    pushRemoteAnnotatedTagAndDeleteLocal(workspace.mobileRoot, "v9.9.0");

    const result = runPreflight([
      "--version",
      "v9.9.0",
      "--workspace-root",
      tempRoot,
    ], workspace.docsRoot);

    assert.notEqual(result.status, 0);
    assert.match(result.stdout, /released 상태에는 대기 범위 값을 남길 수 없습니다/);
  });

  it("fails when released status keeps an incomplete signal outside pending scope", () => {
    const workspace = createWorkspace();
    writeReleaseRecord(workspace.docsRoot, "v9.9.0", [
      docsReleasedMappingLine(),
      "- `coupler-api`: `N/A` (이번 릴리스 제외)",
      "- `coupler-admin-web`: `N/A` (이번 릴리스 제외)",
      "- `coupler-mobile-app`: Store `9.9.0 (900)`, 릴리스 태그 `v9.9.0`, 커밋 `N/A`",
    ], {
      status: "released",
      completedScope: "Mobile Store 심사 중",
      pendingScope: "N/A",
    });
    commitAll(workspace.docsRoot);
    pushRemoteAnnotatedTagAndDeleteLocal(workspace.docsRoot, "v9.9.0");
    pushRemoteAnnotatedTagAndDeleteLocal(workspace.mobileRoot, "v9.9.0");

    const result = runPreflight([
      "--version",
      "v9.9.0",
      "--workspace-root",
      tempRoot,
    ], workspace.docsRoot);

    assert.notEqual(result.status, 0);
    assert.match(
      result.stdout,
      /released 상태에는 미완료 신호를 남길 수 없습니다 \(완료 범위: 심사 중\)/,
    );
  });
});

function docsPlannedMappingLine() {
  return "- `docs`: 기록 버전 `v9.9.0`, 태그 `N/A`, 커밋 `pending`";
}

function docsReleasedMappingLine() {
  return "- `docs`: 기록 버전 `v9.9.0`, 태그 `v9.9.0`, 커밋 `pending`";
}

function createWorkspace() {
  const docsRoot = path.join(tempRoot, "docs");
  const apiRoot = path.join(tempRoot, "coupler-api");
  const adminRoot = path.join(tempRoot, "coupler-admin-web");
  const mobileRoot = path.join(tempRoot, "coupler-mobile-app");

  for (const repoRoot of [docsRoot, apiRoot, adminRoot, mobileRoot]) {
    initRepo(repoRoot);
  }

  return {
    docsRoot,
    apiRoot,
    adminRoot,
    mobileRoot,
    refs: {
      docs: git(docsRoot, ["rev-parse", "HEAD"]),
      api: git(apiRoot, ["rev-parse", "HEAD"]),
      admin: git(adminRoot, ["rev-parse", "HEAD"]),
      mobile: git(mobileRoot, ["rev-parse", "HEAD"]),
    },
  };
}

function createDocsOnlyWorkspace() {
  const docsRoot = path.join(tempRoot, "docs");

  initRepo(docsRoot);

  return {
    docsRoot,
    refs: {
      docs: git(docsRoot, ["rev-parse", "HEAD"]),
    },
  };
}

function initRepo(repoRoot) {
  const remoteRoot = path.join(
    tempRoot,
    "_remotes",
    `${path.basename(repoRoot)}.git`,
  );

  fs.mkdirSync(path.dirname(remoteRoot), { recursive: true });
  git(tempRoot, ["init", "--bare", remoteRoot]);
  fs.mkdirSync(repoRoot, { recursive: true });
  git(repoRoot, ["init"]);
  git(repoRoot, ["checkout", "-B", "main"]);
  git(repoRoot, ["config", "user.email", "release-preflight@example.invalid"]);
  git(repoRoot, ["config", "user.name", "Release Preflight Test"]);
  git(repoRoot, ["remote", "add", "origin", remoteRoot]);
  fs.writeFileSync(path.join(repoRoot, "README.md"), "# Test\n");
  commitAll(repoRoot);
}

function writeReleaseRecord(docsRoot, version, mappingLines, options = {}) {
  const releaseDir = path.join(docsRoot, "content", "releases");
  fs.mkdirSync(releaseDir, { recursive: true });

  const versionMapping = mappingLines
    ? ["## 버전 매핑", "", ...mappingLines, ""].join("\n")
    : "";
  const releaseMetadata = mappingLines
    ? [formatReleaseMetadata(version, mappingLines, options), ""].join("\n")
    : "";

  fs.writeFileSync(
    path.join(releaseDir, `${version}.md`),
    [
      "# Test release",
      "",
      releaseMetadata,
      "## 범위",
      "",
      `- 대상: ${formatRepoScope(getPreflightRepoRefs(options))}`,
      "- 포함 범위: docs release record, mobile release basis",
      `- 제외 범위: ${formatRepoScope(getExcludedRepoRefs(getPreflightRepoRefs(options)))}`,
      "",
      "## 릴리스 상태",
      "",
      `- 목표 버전: \`${version}\``,
      `- 전체 상태: \`${options.status ?? "planned"}\``,
      `- 완료 범위: ${options.completedScope ?? "docs release record"}`,
      `- 대기 범위: ${options.pendingScope ?? "mobile release"}`,
      "",
      versionMapping,
    ].join("\n"),
  );
}

function formatReleaseMetadata(version, mappingLines, options) {
  const releaseScopes = options.releaseScopes ?? ["docs", "mobile-store"];
  const extraRepoRefs = options.extraRepoRefs ?? [];
  const status = options.status ?? "planned";

  return [
    "```release-metadata",
    JSON.stringify(
      {
        schema: "release-metadata/v1",
        version,
        status,
        releaseScopes,
        extraRepoRefs,
        versionMapping: buildVersionMappingMetadata(mappingLines),
        scopeResults: options.scopeResults ?? buildScopeResults(releaseScopes, status),
        apiContractCutover: options.apiContractCutover ?? null,
      },
      null,
      2,
    ),
    "```",
  ].join("\n");
}

function formatRepoScope(repoNames) {
  if (repoNames.length === 0) {
    return "N/A";
  }

  return repoNames.map((repoName) => `\`${repoName}\``).join(", ");
}

function getExcludedRepoRefs(repoRefs) {
  const allRepos = [
    "docs",
    "coupler-api",
    "coupler-admin-web",
    "coupler-mobile-app",
  ];

  return allRepos.filter((repoName) => !repoRefs.includes(repoName));
}

function getPreflightRepoRefs(options) {
  const releaseScopes = options.releaseScopes ?? ["docs", "mobile-store"];
  const extraRepoRefs = options.extraRepoRefs ?? [];
  const repoRefs = new Set(["docs", ...extraRepoRefs]);

  if (
    releaseScopes.includes("db-migration") ||
    releaseScopes.includes("contracts-package") ||
    releaseScopes.includes("coupler-api")
  ) {
    repoRefs.add("coupler-api");
  }

  if (releaseScopes.includes("coupler-admin-web")) {
    repoRefs.add("coupler-admin-web");
  }

  if (releaseScopes.includes("mobile-store") || releaseScopes.includes("mobile-nextpush")) {
    repoRefs.add("coupler-mobile-app");
  }

  return [
    "docs",
    "coupler-api",
    "coupler-admin-web",
    "coupler-mobile-app",
  ].filter((repoName) => repoRefs.has(repoName));
}

function buildScopeResults(releaseScopes, status) {
  return Object.fromEntries(
    releaseScopes.map((scopeName) => [
      scopeName,
      {
        status,
        summary: `${scopeName} ${status}`,
        evidence: buildScopeEvidence(scopeName, status),
        ...(status === "rolled_back"
          ? { rollbackReason: `${scopeName} rolled back during preflight fixture` }
          : {}),
        ...(status === "superseded"
          ? {
              supersededBy: "v9.9.1",
              incompleteReason: `${scopeName} replaced by v9.9.1`,
              tagStatus: "not_created",
            }
          : {}),
      },
    ]),
  );
}

function buildScopeEvidence(scopeName, status) {
  const concrete = status === "released" || status === "rolled_back";

  if (scopeName === "docs") {
    return {};
  }

  if (scopeName === "contracts-package") {
    return {
      publishedPackage: concrete
        ? "@coupler-developer/coupler-api-contracts@9.9.0"
        : "pending",
      workflow: concrete ? "Release Contracts workflow https://example.invalid/actions/2" : "pending",
      sourceRef: concrete ? "coupler-api v9.9.0" : "pending",
    };
  }

  if (scopeName === "coupler-api") {
    return {
      deployment: concrete ? "coupler-api production deployed" : "pending",
      smoke: concrete ? "coupler-api smoke passed" : "pending",
      rollback: concrete ? "rollback to previous coupler-api tag" : "pending",
    };
  }

  if (scopeName === "coupler-admin-web") {
    return {
      deployment: concrete ? "coupler-admin-web production deployed" : "pending",
      smoke: concrete ? "coupler-admin-web smoke passed" : "pending",
      rollback: concrete ? "rollback to previous coupler-admin-web artifact" : "pending",
    };
  }

  if (scopeName === "mobile-store") {
    return {
      submission: concrete ? "App Store Connect submitted 9.9.0 (900)" : "pending",
      approval: concrete ? "App Store Connect approved 9.9.0 (900)" : "pending",
      release: concrete ? "App Store Connect released 9.9.0 (900)" : "pending",
      smoke: concrete ? "Mobile production launch smoke passed" : "pending",
      artifact: concrete ? "Store artifact hash sha256:aaaaaaaa" : "pending",
      submittedMarkers: [
        {
          tag: "submitted/mobile-9.9.0-900",
          commit: concrete
            ? "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
            : "pending",
          evidence: concrete ? "submitted marker evidence migrated" : "pending",
          deletedEvidence: concrete ? "submitted marker deleted from origin" : "pending",
        },
      ],
    };
  }

  if (scopeName === "mobile-nextpush") {
    return {
      app: concrete ? "Coupler iOS" : "pending",
      productionLabel: concrete ? "Production label 9.9.0" : "pending",
      targetBinary: concrete ? "Store 9.9.0 (900)" : "pending",
      uploadedAt: concrete ? "2026-07-08 10:00 KST" : "pending",
      rollout: concrete ? "rollout 100%" : "pending",
      mandatory: concrete ? "mandatory false" : "pending",
      disabled: concrete ? "disabled false" : "pending",
    };
  }

  if (scopeName === "db-migration") {
    return {
      sqlRefs: [],
      gateResults: [],
      preflightLog: concrete ? "DB preflight log" : null,
      ledger: {
        dev: {
          databaseIdentity: concrete ? "dev db identity" : null,
          log: concrete ? "dev ledger log" : null,
          rows: [],
        },
        prod: {
          databaseIdentity: concrete ? "prod db identity" : null,
          log: concrete ? "prod ledger log" : null,
          rows: [],
        },
      },
      postcheckLog: concrete ? "DB postcheck log" : null,
      rollbackPlan: concrete ? "DB rollback plan" : null,
    };
  }

  return {};
}

function buildDbMigrationScopeResults(sqlRef) {
  const scopeResults = buildScopeResults(["docs", "db-migration"], "released");
  scopeResults["db-migration"].evidence = {
    sqlRefs: [sqlRef],
    gateResults: [
      dbGateResult("DBM-GATE-000", "passed"),
      dbGateResult("DBM-GATE-010", "passed"),
      dbGateResult("DBM-GATE-100", "passed"),
      dbGateResult("DBM-GATE-200", "not_applicable", "No backfill target for this schema-only migration"),
      dbGateResult("DBM-GATE-300", "not_applicable", "No read/write cutover in this migration"),
      dbGateResult("DBM-GATE-400", "not_applicable", "No legacy object removal in this migration"),
    ],
    preflightLog: "prod read-only preflight log: db identity, ledger, target table counters",
    ledger: {
      dev: dbLedgerEvidence("dev", sqlRef),
      prod: dbLedgerEvidence("prod", sqlRef),
    },
    postcheckLog: "prod postcheck guard returned No Findings",
    rollbackPlan: "restore RDS snapshot rds:release-v9.9.0 if postcheck fails",
  };

  return scopeResults;
}

function dbGateResult(gateId, status, reason = null) {
  return {
    gateId,
    status,
    log: `${gateId} ${status} log path /logs/${gateId}.log`,
    reason,
  };
}

function dbLedgerEvidence(targetEnv, sqlRef) {
  return {
    databaseIdentity: `${targetEnv} database coupler @@server_id 123`,
    log: `${targetEnv} schema_migrations query log path`,
    rows: [
      {
        migrationName: path.basename(sqlRef.path),
        targetEnv,
        checksumSha256: sqlRef.checksumSha256,
        appliedAt: "2026-07-09 10:00 KST",
      },
    ],
  };
}

function buildVersionMappingMetadata(mappingLines) {
  const metadata = {
    docs: {},
    "coupler-api": {},
    "coupler-admin-web": {},
    "coupler-mobile-app": {},
  };

  for (const line of mappingLines) {
    const repoMatch = line.match(/^- `([^`]+)`:/);
    if (!repoMatch) {
      continue;
    }

    const repoName = repoMatch[1];
    const repoMapping = metadata[repoName];
    if (!repoMapping) {
      continue;
    }

    const tagMatch = line.match(/(?:릴리스\s+태그|태그) `([^`]+)`/);
    const commitMatch = line.match(/커밋 `([^`]+)`/);
    const storeMatch = line.match(/Store `([^`]+)`/);
    const nextPushMatch = line.match(/NextPush `([^`]+)`/);

    if (repoName === "coupler-mobile-app") {
      repoMapping.releaseTag = normalizeMetadataValue(tagMatch?.[1]);
      repoMapping.store = normalizeMetadataValue(storeMatch?.[1]);
      repoMapping.nextPush = normalizeMetadataValue(nextPushMatch?.[1]);
    } else {
      repoMapping.tag = normalizeMetadataValue(tagMatch?.[1]);
    }

    repoMapping.commit = normalizeMetadataValue(commitMatch?.[1]);
  }

  return metadata;
}

function normalizeMetadataValue(value) {
  if (!value || value === "N/A") {
    return null;
  }

  return value;
}

function commitAll(repoRoot) {
  git(repoRoot, ["add", "."]);
  git(repoRoot, ["commit", "-m", "test commit"]);
  git(repoRoot, ["push", "-u", "origin", "main"]);

  return git(repoRoot, ["rev-parse", "HEAD"]);
}

function commitCurrentBranch(repoRoot) {
  git(repoRoot, ["add", "."]);
  git(repoRoot, ["commit", "-m", "test pending release"]);

  return git(repoRoot, ["rev-parse", "HEAD"]);
}

function commitAndPushCurrentBranch(repoRoot) {
  const commit = commitCurrentBranch(repoRoot);
  const branch = git(repoRoot, ["branch", "--show-current"]);
  git(repoRoot, ["push", "-u", "origin", branch]);

  return commit;
}

function writeSqlFile(repoRoot, relativePath, content) {
  const sqlPath = path.join(repoRoot, relativePath);
  fs.mkdirSync(path.dirname(sqlPath), { recursive: true });
  fs.writeFileSync(sqlPath, content);

  return {
    repo: "coupler-api",
    path: relativePath,
    checksumSha256: sha256(content),
    gateIds: ["DBM-GATE-000", "DBM-GATE-010", "DBM-GATE-100"],
  };
}

function sha256(content) {
  return createHash("sha256").update(content).digest("hex");
}

function advanceRemoteMainWithoutLocalFetch(repoRoot) {
  const originalHead = git(repoRoot, ["rev-parse", "HEAD"]);

  fs.writeFileSync(path.join(repoRoot, "REMOTE_ADVANCE.md"), "# Remote advance\n");
  git(repoRoot, ["add", "."]);
  git(repoRoot, ["commit", "-m", "remote advance"]);
  git(repoRoot, ["push", "origin", "main"]);
  git(repoRoot, ["reset", "--hard", originalHead]);
  git(repoRoot, ["update-ref", "refs/remotes/origin/main", originalHead]);
}

function pushRemoteAnnotatedTagAndDeleteLocal(repoRoot, tagName) {
  git(repoRoot, ["tag", "-a", tagName, "-m", `Release ${tagName}`]);
  git(repoRoot, ["push", "origin", tagName]);
  git(repoRoot, ["tag", "-d", tagName]);
}

function pushRemoteLightweightTagAndDeleteLocal(repoRoot, tagName) {
  git(repoRoot, ["tag", tagName]);
  git(repoRoot, ["push", "origin", tagName]);
  git(repoRoot, ["tag", "-d", tagName]);
}

function pushRemoteAnnotatedTagOutsideMain(repoRoot, tagName) {
  const sideCommit = createSideBranchCommit(repoRoot);
  git(repoRoot, ["tag", "-a", tagName, sideCommit, "-m", `Release ${tagName}`]);
  git(repoRoot, ["push", "origin", tagName]);
  git(repoRoot, ["tag", "-d", tagName]);
}

function createSideBranchCommit(repoRoot) {
  git(repoRoot, ["checkout", "-B", "release-side"]);
  fs.writeFileSync(path.join(repoRoot, "SIDE_BRANCH.md"), "# Side branch\n");
  git(repoRoot, ["add", "."]);
  git(repoRoot, ["commit", "-m", "side branch commit"]);
  const commit = git(repoRoot, ["rev-parse", "HEAD"]);
  git(repoRoot, ["checkout", "main"]);

  return commit;
}

function advanceMain(repoRoot) {
  fs.writeFileSync(path.join(repoRoot, "MAIN_ADVANCE.md"), "# Main advance\n");
  git(repoRoot, ["add", "."]);
  git(repoRoot, ["commit", "-m", "main advance"]);
  git(repoRoot, ["push", "origin", "main"]);

  return git(repoRoot, ["rev-parse", "HEAD"]);
}

function runPreflight(args, cwd) {
  return spawnSync(process.execPath, [preflightScript, ...args], {
    cwd,
    encoding: "utf8",
  });
}

function git(repoRoot, args) {
  return execFileSync("git", args, {
    cwd: repoRoot,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  }).trim();
}
