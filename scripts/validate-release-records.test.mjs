import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, it } from "node:test";
import { fileURLToPath } from "node:url";

import { parseReleaseMetadataBlock } from "./release-record-metadata.mjs";
const testFilePath = fileURLToPath(import.meta.url);
const scriptsRoot = path.dirname(testFilePath);
const validateScript = path.join(scriptsRoot, "validate-release-records.mjs");
const releaseRecordTemplate = path.resolve(
  scriptsRoot,
  "..",
  "content",
  "templates",
  "release-record-template.md",
);
const apiContractCutoverGateTemplate = path.resolve(
  scriptsRoot,
  "..",
  "content",
  "templates",
  "api-contract-cutover-gate-template.md",
);

let tempRoot;

beforeEach(() => {
  tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "validate-release-records-"));
});

afterEach(() => {
  fs.rmSync(tempRoot, { recursive: true, force: true });
});

describe("validate release records metadata sync", () => {
  it("accepts a new DB migration scope without plan or execution artifacts", () => {
    writeReleaseRecord({
      releaseStatus: "pending",
      apiContractCutover: null,
      includeCutoverGate: false,
      metadataReleaseScopes: ["docs", "db-migration"],
      metadataScopeResults: {
        docs: {
          status: "pending",
          summary: "docs pending",
          evidence: {},
        },
        "db-migration": {
          status: "pending",
          summary: "DB migration pending",
          evidence: {},
        },
      },
      scopeTargetLine: "`docs`, `coupler-api`",
      pendingScopeLine: "개발계와 운영계 DB migration 실행",
      verificationNote: "DB migration source commit fixed before production execution",
    });

    const valid = runValidator();
    assert.equal(valid.status, 0, valid.stdout + valid.stderr);
  });

  it("rejects new DB migration plan or execution evidence", () => {
    writeReleaseRecord({
      releaseStatus: "pending",
      apiContractCutover: null,
      includeCutoverGate: false,
      metadataReleaseScopes: ["docs", "db-migration"],
      metadataScopeResults: {
        docs: {
          status: "pending",
          summary: "docs pending",
          evidence: {},
        },
        "db-migration": {
          status: "pending",
          summary: "DB migration pending",
          evidence: { plan: { path: "plan.json" } },
        },
      },
      scopeTargetLine: "`docs`, `coupler-api`",
      pendingScopeLine: "개발계와 운영계 DB migration 실행",
      verificationNote: "DB migration source commit fixed before production execution",
    });

    const result = runValidator();

    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /scopeResults\.db-migration\.evidence must be empty/);
  });

  it("keeps API cutover Gate out of the base release record template", () => {
    const template = fs.readFileSync(releaseRecordTemplate, "utf8");
    const cutoverTemplate = fs.readFileSync(apiContractCutoverGateTemplate, "utf8");
    const errors = [];
    const metadata = parseReleaseMetadataBlock(template, "release record template", errors);

    assert.deepEqual(errors, []);
    assert.equal(metadata.apiContractCutover, null);
    assert.doesNotMatch(template, /^### API contract cutover Gate$/m);
    assert.match(cutoverTemplate, /^### API contract cutover Gate$/m);
  });

  it("fails when API cutover markdown exists without metadata cutover object", () => {
    writeReleaseRecord({
      apiContractCutover: null,
      markdownCutoverStatus: "pending",
    });

    const result = runValidator();

    assert.notEqual(result.status, 0);
    assert.match(
      result.stderr,
      /API contract cutover가 포함된 릴리스 기록에는 release-metadata apiContractCutover가 필요합니다/,
    );
  });

  it("passes when a non-cutover release records API cutover as N/A prose", () => {
    writeReleaseRecord({
      apiContractCutover: null,
      includeCutoverGate: false,
      verificationNote: "API contract cutover N/A - API 계약 변경 없음",
    });

    const result = runValidator();

    assert.equal(result.status, 0, result.stdout + result.stderr);
    assert.match(result.stdout, /릴리스 기록 검증 통과/);
  });

  it("fails when markdown cutover status diverges from metadata cutover status", () => {
    writeReleaseRecord({
      apiContractCutover: cutoverMetadata("pending"),
      markdownCutoverStatus: "ready",
    });

    const result = runValidator();

    assert.notEqual(result.status, 0);
    assert.match(
      result.stderr,
      /API contract cutover Gate 상태가 release-metadata apiContractCutover.status와 일치하지 않습니다/,
    );
  });

  it("passes when markdown cutover status mirrors metadata cutover status", () => {
    writeReleaseRecord({
      apiContractCutover: cutoverMetadata("pending"),
      markdownCutoverStatus: "pending",
    });

    const result = runValidator();

    assert.equal(result.status, 0, result.stdout + result.stderr);
    assert.match(result.stdout, /릴리스 기록 검증 통과/);
  });

  it("fails when version mapping markdown mirror diverges from metadata", () => {
    writeReleaseRecord({
      metadataDocsCommit: "0123456789abcdef0123456789abcdef01234567",
      markdownDocsCommit: "pending",
      apiContractCutover: null,
      includeCutoverGate: false,
    });

    const result = runValidator();

    assert.notEqual(result.status, 0);
    assert.match(
      result.stderr,
      /버전 매핑 mirror가 release-metadata versionMapping\.docs\.commit와 일치하지 않습니다/,
    );
  });

  it("fails when scope target uses a CLI alias instead of a canonical repo name", () => {
    writeReleaseRecord({
      metadataReleaseScopes: ["docs", "coupler-api"],
      scopeTargetLine: "`api`",
      apiContractCutover: null,
      includeCutoverGate: false,
    });

    const result = runValidator();

    assert.notEqual(result.status, 0);
    assert.match(
      result.stderr,
      /범위 대상이 release-metadata derived preflightRepoNames와 일치하지 않습니다/,
    );
  });

  it("fails when API cutover markdown mirror omits metadata evidence", () => {
    writeReleaseRecord({
      apiContractCutover: cutoverMetadata("pending"),
      metadataScopeResults: {
        ...defaultScopeResults(["docs", "contracts-package"], cutoverMetadata("pending"), "planned"),
        "contracts-package": {
          ...defaultScopeResults(["docs", "contracts-package"], cutoverMetadata("pending"), "planned")["contracts-package"],
          evidence: {
            ...defaultScopeResults(["docs", "contracts-package"], cutoverMetadata("pending"), "planned")["contracts-package"].evidence,
            publishedPackage: "@coupler-developer/coupler-api-contracts@9.9.0",
          },
        },
      },
      markdownCutoverStatus: "pending",
      markdownPublishedPackageValue: "pending",
    });

    const result = runValidator();

    assert.notEqual(result.status, 0);
    assert.match(
      result.stderr,
      /API contract cutover Gate mirror가 release-metadata scopeResults\.contracts-package\.evidence\.publishedPackage 값을 포함하지 않습니다/,
    );
  });

  it("fails when released cutover markdown mirror keeps placeholders", () => {
    writeReleaseRecord({
      releaseStatus: "released",
      apiContractCutover: releasedCutoverMetadata(),
      markdownCutoverStatus: "released",
      markdownCutoverValue: "pending",
      pendingScopeLine: "N/A",
    });

    const result = runValidator();

    assert.notEqual(result.status, 0);
    assert.match(
      result.stderr,
      /terminal API contract cutover Gate mirror에 placeholder가 남아 있습니다: pending/,
    );
  });

  it("passes when a released API records a structured violated cutover disposition", () => {
    writeReleaseRecord({
      releaseStatus: "released",
      apiContractCutover: violatedCutoverMetadata(),
      markdownCutoverStatus: "violated",
      markdownCutoverValue: "post-deploy contract comparison",
      markdownDocsCommit: "N/A",
      markdownPublishedPackageValue:
        "@coupler-developer/coupler-api-contracts@9.9.0",
      pendingScopeLine: "N/A",
    });

    const result = runValidator();

    assert.equal(result.status, 0, result.stdout + result.stderr);
    assert.match(result.stdout, /릴리스 기록 검증 통과/);
  });

  it("fails when violated cutover markdown omits structured disposition evidence", () => {
    writeReleaseRecord({
      releaseStatus: "released",
      apiContractCutover: violatedCutoverMetadata(),
      markdownCutoverStatus: "violated",
      markdownCutoverValue: "post-deploy contract comparison",
      markdownPublishedPackageValue:
        "@coupler-developer/coupler-api-contracts@9.9.0",
      markdownViolationValues: {
        observedEvidence: "different evidence",
      },
      pendingScopeLine: "N/A",
    });

    const result = runValidator();

    assert.notEqual(result.status, 0);
    assert.match(
      result.stderr,
      /API contract cutover Gate mirror가 release-metadata apiContractCutover\.violation\.observedEvidence 값을 포함하지 않습니다/,
    );
  });

  it("fails when violated cutover markdown keeps placeholders", () => {
    writeReleaseRecord({
      releaseStatus: "released",
      apiContractCutover: violatedCutoverMetadata(),
      markdownCutoverStatus: "violated",
      markdownCutoverValue: "post-deploy contract comparison",
      markdownPublishedPackageValue:
        "@coupler-developer/coupler-api-contracts@9.9.0",
      markdownViolationValues: {
        followUpControl: "pending",
      },
      pendingScopeLine: "N/A",
    });

    const result = runValidator();

    assert.notEqual(result.status, 0);
    assert.match(
      result.stderr,
      /terminal API contract cutover Gate mirror에 placeholder가 남아 있습니다: pending/,
    );
  });

  it("fails when rollback cutover markdown mirror keeps placeholders", () => {
    writeReleaseRecord({
      releaseStatus: "rolled_back",
      apiContractCutover: rollbackCutoverMetadata(),
      metadataScopeResults: {
        docs: {
          status: "planned",
          summary: "docs release record remains untagged after rollback",
          evidence: {},
        },
        "contracts-package": {
          status: "rolled_back",
          summary: "contract cutover was rolled back",
          rollbackReason: "contract cutover rollback completed after production issue",
          evidence: {
            publishedPackage: "@coupler-developer/coupler-api-contracts@9.9.0",
            workflow: "Release Contracts workflow https://example.invalid/actions/2",
            sourceRef: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
            sourceTree: {
              path: "packages/contracts",
              publishedSourceTree: "eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee",
              releaseSourceTree: "eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee",
            },
          },
        },
      },
      markdownCutoverStatus: "rollback",
      markdownCutoverValue: "pending",
    });

    const result = runValidator();

    assert.notEqual(result.status, 0);
    assert.match(
      result.stderr,
      /terminal API contract cutover Gate mirror에 placeholder가 남아 있습니다: pending/,
    );
  });

  it("fails released cutover metadata without a published contracts package version", () => {
    writeReleaseRecord({
      releaseStatus: "released",
      apiContractCutover: releasedCutoverMetadata(),
      metadataScopeResults: {
        ...defaultScopeResults(["docs", "contracts-package"], releasedCutoverMetadata(), "released"),
        "contracts-package": {
          ...defaultScopeResults(["docs", "contracts-package"], releasedCutoverMetadata(), "released")["contracts-package"],
          evidence: {
            ...defaultScopeResults(["docs", "contracts-package"], releasedCutoverMetadata(), "released")["contracts-package"].evidence,
            publishedPackage: "N/A - generated copy exact match phase",
          },
        },
      },
      markdownCutoverStatus: "released",
      markdownCutoverValue: "released evidence",
      markdownPublishedPackageValue: "N/A - generated copy exact match phase",
      pendingScopeLine: "N/A",
    });

    const result = runValidator();

    assert.notEqual(result.status, 0);
    assert.match(
      result.stderr,
      /publishedPackage must equal @coupler-developer\/coupler-api-contracts@x\.y\.z/,
    );
  });
});

describe("published release record immutability", () => {

  it("allows one fail-closed docs finalization when a pending record was published", () => {
    initGitRepository();
    const baseRef = writePublishedPendingDocsFinalizationBase();
    finalizePublishedDocsRecord();

    const result = runValidator(baseRef);

    assert.equal(result.status, 0, result.stdout + result.stderr);
    assert.match(result.stdout, /릴리스 기록 검증 통과/);
  });

  it("rejects a published pending finalization that changes non-docs evidence", () => {
    initGitRepository();
    const baseRef = writePublishedPendingDocsFinalizationBase();
    finalizePublishedDocsRecord();
    rewriteReleaseMetadata((metadata) => {
      metadata.scopeResults["db-migration"].summary = "rewritten DB evidence";
    });

    assertImmutableReleaseFailure(runValidator(baseRef));
  });

  it("rejects semantic-only metadata reordering during published finalization", () => {
    initGitRepository();
    const baseRef = writePublishedPendingDocsFinalizationBase();
    finalizePublishedDocsRecord();
    const releasePath = path.join(tempRoot, "content", "releases", "v9.9.0.md");
    const source = fs.readFileSync(releasePath, "utf8");
    fs.writeFileSync(
      releasePath,
      source.replace(
        '  "schema": "release-metadata/v3",\n  "version": "v9.9.0",',
        '  "version": "v9.9.0",\n  "schema": "release-metadata/v3",',
      ),
    );

    assertImmutableReleaseFailure(runValidator(baseRef));
  });

  it("rejects duplicate or missing allowed mirror bullets", () => {
    for (const operation of ["duplicate", "missing"]) {
      fs.rmSync(tempRoot, { recursive: true, force: true });
      tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "validate-release-records-"));
      initGitRepository();
      const baseRef = writePublishedPendingDocsFinalizationBase();
      finalizePublishedDocsRecord();
      const releasePath = path.join(tempRoot, "content", "releases", "v9.9.0.md");
      const source = fs.readFileSync(releasePath, "utf8");
      const changedSource = operation === "duplicate"
        ? source.replace(
          "- 전체 상태: `released`",
          "- 전체 상태: `released`\n- 전체 상태: `released`",
        )
        : source
          .split("\n")
          .filter((line) => !line.startsWith("- 완료 범위:"))
          .join("\n");
      fs.writeFileSync(releasePath, changedSource);

      assertImmutableReleaseFailure(runValidator(baseRef));
    }
  });

  it("rejects a published pending finalization that rewrites an unrelated section", () => {
    initGitRepository();
    const baseRef = writePublishedPendingDocsFinalizationBase();
    finalizePublishedDocsRecord();
    const releasePath = path.join(tempRoot, "content", "releases", "v9.9.0.md");
    const source = fs.readFileSync(releasePath, "utf8");
    fs.writeFileSync(
      releasePath,
      source.replace("- API contract cutover 검증 테스트 기록", "- rewritten purpose"),
    );

    assertImmutableReleaseFailure(runValidator(baseRef));
  });

  it("rejects any second edit after the published record is terminalized", () => {
    initGitRepository();
    writePublishedPendingDocsFinalizationBase();
    finalizePublishedDocsRecord();
    commitAll("terminalize published release");
    const terminalBaseRef = git(["rev-parse", "HEAD"]);
    const releasePath = path.join(tempRoot, "content", "releases", "v9.9.0.md");
    const source = fs.readFileSync(releasePath, "utf8");
    fs.writeFileSync(
      releasePath,
      source.replace("- 현재 결과: `released`", "- 현재 결과: rewritten"),
    );

    assertImmutableReleaseFailure(runValidator(terminalBaseRef));
  });

  it("rejects same-PR DB artifacts when the new release record omits the DB scope", () => {
    initGitRepository();
    fs.writeFileSync(path.join(tempRoot, "README.md"), "checkpoint baseline\n");
    commitAll("baseline");
    const baseRef = git(["rev-parse", "HEAD"]);
    writePendingDbEvidence();
    writeReleaseRecord({
      apiContractCutover: null,
      includeCutoverGate: false,
    });
    commitAll("unowned partial dev evidence");

    const result = runValidator(baseRef);

    assert.notEqual(result.status, 0);
    assert.match(
      result.stderr,
      /new DB migration evidence artifacts are not allowed/,
    );
  });

  it("rejects DB evidence without its same-version release record", () => {
    initGitRepository();
    fs.writeFileSync(path.join(tempRoot, "README.md"), "checkpoint baseline\n");
    commitAll("baseline");
    const baseRef = git(["rev-parse", "HEAD"]);
    writePendingDbEvidence();

    const result = runValidator(baseRef);

    assert.notEqual(result.status, 0);
    assert.match(
      result.stderr,
      /new DB migration evidence artifacts are not allowed/,
    );
  });

  it("rejects DB evidence reached through an ancestor symlink", () => {
    initGitRepository();
    fs.writeFileSync(path.join(tempRoot, "README.md"), "checkpoint baseline\n");
    commitAll("baseline");
    const baseRef = git(["rev-parse", "HEAD"]);
    writePendingDbEvidence({ completed: true });
    const evidenceRoot = path.join(
      tempRoot,
      "content",
      "releases",
      "evidence",
      "db-migrations",
    );
    const versionRoot = path.join(evidenceRoot, "v9.9.0");
    const targetRoot = path.join(evidenceRoot, "checkpoint-target");
    fs.renameSync(versionRoot, targetRoot);
    fs.symlinkSync("checkpoint-target", versionRoot, "dir");
    commitAll("symlinked checkpoint");

    const result = runValidator(baseRef);

    assert.notEqual(result.status, 0);
    assert.match(
      result.stderr,
      /new DB migration evidence artifacts are not allowed/,
    );
  });

  it("rejects malformed evidence namespace roots instead of leaving them mutable", () => {
    initGitRepository();
    fs.writeFileSync(path.join(tempRoot, "README.md"), "checkpoint baseline\n");
    commitAll("baseline");
    const baseRef = git(["rev-parse", "HEAD"]);
    writeOpaqueDbMigrationEvidence("checkpoint-target", "dev", "plan.json", "opaque\n");

    const result = runValidator(baseRef);

    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /new DB migration evidence artifacts are not allowed/);
  });

  it("does not parse or revalidate an unchanged release record already present at base", () => {
    initGitRepository();
    writeOpaqueRelease("v1.0.0.md", "historical bytes are intentionally opaque\n");
    commitAll("published release");
    const baseRef = git(["rev-parse", "HEAD"]);

    const result = runValidator(baseRef);

    assert.equal(result.status, 0, result.stdout + result.stderr);
  });

  it("rejects untracked DB evidence added to a version whose release is already published", () => {
    initGitRepository();
    writeOpaqueRelease("v9.9.0.md", "historical bytes are intentionally opaque\n");
    commitAll("published release");
    const baseRef = git(["rev-parse", "HEAD"]);
    writePendingDbEvidence({ completed: true });

    const result = runValidator(baseRef);

    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /new DB migration evidence artifacts are not allowed/);
  });

  it("rejects editing a release record already present at base", () => {
    initGitRepository();
    writeOpaqueRelease("v1.0.0.md", "historical bytes\n");
    commitAll("published release");
    const baseRef = git(["rev-parse", "HEAD"]);
    writeOpaqueRelease("v1.0.0.md", "rewritten historical bytes\n");

    const result = runValidator(baseRef);

    assertImmutableReleaseFailure(result);
  });

  it("rejects deleting or renaming a release record already present at base", () => {
    for (const operation of ["delete", "rename"]) {
      fs.rmSync(tempRoot, { recursive: true, force: true });
      tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "validate-release-records-"));
      initGitRepository();
      writeOpaqueRelease("v1.0.0.md", "historical bytes\n");
      commitAll("published release");
      const baseRef = git(["rev-parse", "HEAD"]);
      const originalPath = path.join(tempRoot, "content", "releases", "v1.0.0.md");
      if (operation === "delete") {
        fs.rmSync(originalPath);
      } else {
        fs.renameSync(
          originalPath,
          path.join(tempRoot, "content", "releases", "v1.0.1.md"),
        );
      }

      assertImmutableReleaseFailure(runValidator(baseRef));
    }
  });

  it("ignores intermediate edit history when the final tree matches the published bytes", () => {
    initGitRepository();
    const original = "historical bytes\n";
    writeOpaqueRelease("v1.0.0.md", original);
    commitAll("published release");
    const baseRef = git(["rev-parse", "HEAD"]);
    writeOpaqueRelease("v1.0.0.md", "intermediate rewrite\n");
    commitAll("intermediate rewrite");
    writeOpaqueRelease("v1.0.0.md", original);
    commitAll("restore published bytes");

    const result = runValidator(baseRef);

    assert.equal(result.status, 0, result.stdout + result.stderr);
  });

  it("rejects changing, deleting, or renaming DB migration evidence for a published release", () => {
    for (const operation of ["change", "delete", "rename"]) {
      fs.rmSync(tempRoot, { recursive: true, force: true });
      tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "validate-release-records-"));
      initGitRepository();
      writeOpaqueRelease("v1.0.0.md", "historical bytes stay opaque\n");
      const evidencePath = writeOpaqueDbMigrationEvidence(
        "v1.0.0",
        "dev",
        "plan.json",
        "opaque plan bytes\n",
      );
      commitAll("published release and DB evidence");
      const baseRef = git(["rev-parse", "HEAD"]);

      if (operation === "change") {
        fs.writeFileSync(evidencePath, "rewritten plan bytes\n");
      } else if (operation === "delete") {
        fs.rmSync(evidencePath);
      } else {
        fs.renameSync(evidencePath, path.join(path.dirname(evidencePath), "renamed-plan.json"));
      }

      const result = runValidator(baseRef);
      assert.notEqual(result.status, 0);
      assert.match(
        result.stderr,
        /DB migration evidence already present in the base ref.*is final and immutable/,
      );
      assert.doesNotMatch(result.stderr, /release-metadata block is required/);
    }
  });

  it("rejects adding DB migration evidence after its release record is published", () => {
    initGitRepository();
    writeOpaqueRelease("v1.0.0.md", "historical bytes stay opaque\n");
    commitAll("published release");
    const baseRef = git(["rev-parse", "HEAD"]);
    writeOpaqueDbMigrationEvidence(
      "v1.0.0",
      "prod",
      "execution.jsonl",
      "late evidence bytes\n",
    );
    commitAll("late evidence addition");

    const result = runValidator(baseRef);
    assert.notEqual(result.status, 0);
    assert.match(
      result.stderr,
      /DB migration evidence already present in the base ref.*is final and immutable/,
    );
    assert.doesNotMatch(result.stderr, /release-metadata block is required/);
  });
});

function runValidator(baseRef = null, extraEnv = {}) {
  const args = [validateScript];
  if (baseRef) {
    args.push("--base-ref", baseRef);
  }
  return spawnSync(process.execPath, args, {
    cwd: tempRoot,
    encoding: "utf8",
    env: {
      ...process.env,
      DOCUMENT_LIFECYCLE_BASE_REF: "",
      ...extraEnv,
    },
  });
}

function initGitRepository() {
  git(["init"]);
  git(["checkout", "-B", "main"]);
  git(["config", "user.email", "release-records@example.invalid"]);
  git(["config", "user.name", "Release Records Test"]);
}

function writeOpaqueRelease(fileName, source) {
  const releasesRoot = path.join(tempRoot, "content", "releases");
  fs.mkdirSync(releasesRoot, { recursive: true });
  fs.writeFileSync(path.join(releasesRoot, fileName), source);
}

function writeOpaqueDbMigrationEvidence(
  version,
  environment,
  fileName,
  source,
) {
  const evidenceRoot = path.join(
    tempRoot,
    "content",
    "releases",
    "evidence",
    "db-migrations",
    version,
    environment,
  );
  fs.mkdirSync(evidenceRoot, { recursive: true });
  const evidencePath = path.join(evidenceRoot, fileName);
  fs.writeFileSync(evidencePath, source);
  return evidencePath;
}

function commitAll(message) {
  git(["add", "."]);
  git(["commit", "-m", message]);
}

function git(args) {
  return execFileSync("git", args, {
    cwd: tempRoot,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  }).trim();
}

function assertImmutableReleaseFailure(result) {
  assert.notEqual(result.status, 0);
  assert.match(
    result.stderr,
    /a release record already present in the base ref is final and immutable/,
  );
}

function writePublishedPendingDocsFinalizationBase() {
  writeReleaseRecord({
    releaseStatus: "pending",
    apiContractCutover: null,
    includeCutoverGate: false,
    metadataReleaseScopes: ["docs", "db-migration"],
    metadataScopeResults: {
      docs: {
        status: "pending",
        summary: "docs final record pending",
        evidence: {},
      },
      "db-migration": {
        status: "released",
        summary: "DB migration released",
        evidence: {},
      },
    },
    markdownDocsCommit: "N/A",
    pendingScopeLine: "docs final record merge",
    scopeTargetLine: "`docs`, `coupler-api`",
    verificationNote: "DB migration source verified",
  });
  rewriteReleaseMetadata((metadata) => {
    metadata.versionMapping.docs.tag = "v9.9.0";
    metadata.versionMapping.docs.commit = null;
  });
  const releasePath = path.join(tempRoot, "content", "releases", "v9.9.0.md");
  const source = fs.readFileSync(releasePath, "utf8");
  fs.writeFileSync(
    releasePath,
    source
      .replace(
        "- `docs`: 기록 버전 `v9.9.0`, 태그 `미생성`, 커밋 `N/A`",
        "- `docs`: 기록 버전 `v9.9.0`, 태그 `v9.9.0`, 커밋 `N/A`",
      )
      .replace("- 아직 릴리스 전이다.", "- 현재 결과: `pending`")
      .replace(
        "## 관련 문서",
        "## 후속 작업\n\n- 남은 범위: docs final tag postcheck\n\n## 관련 문서",
      ),
  );
  commitAll("published pending release");
  return git(["rev-parse", "HEAD"]);
}

function finalizePublishedDocsRecord() {
  rewriteReleaseMetadata((metadata) => {
    metadata.status = "released";
    metadata.scopeResults.docs.status = "released";
    metadata.scopeResults.docs.summary = "docs final record fixed";
  });
  const releasePath = path.join(tempRoot, "content", "releases", "v9.9.0.md");
  const source = fs.readFileSync(releasePath, "utf8");
  fs.writeFileSync(
    releasePath,
    source
      .replace("- 전체 상태: `pending`", "- 전체 상태: `released`")
      .replace("- 대기 범위: docs final record merge", "- 대기 범위: N/A")
      .replace(
        "- 현재 결과: `pending`",
        "- 현재 결과: `released`\n- 기록 복구: published pending record terminalized",
      ),
  );
}

function rewriteReleaseMetadata(mutator) {
  const releasePath = path.join(tempRoot, "content", "releases", "v9.9.0.md");
  const source = fs.readFileSync(releasePath, "utf8");
  const parseErrors = [];
  const metadata = parseReleaseMetadataBlock(source, "v9.9.0", parseErrors);
  assert.deepEqual(parseErrors, []);
  mutator(metadata);
  fs.writeFileSync(
    releasePath,
    source.replace(
      /^```release-metadata\s*\n[\s\S]*?\n```$/m,
      `\`\`\`release-metadata\n${JSON.stringify(metadata, null, 2)}\n\`\`\``,
    ),
  );
}

function writeReleaseRecord({
  releaseStatus = "planned",
  apiContractCutover,
  markdownCutoverStatus,
  markdownCutoverValue = "pending",
  markdownViolationValues = {},
  markdownDocsCommit = "pending",
  markdownPublishedPackageValue = markdownCutoverValue,
  metadataDocsCommit,
  metadataReleaseScopes,
  metadataExtraRepoRefs = [],
  metadataScopeResults,
  includeCutoverGate = true,
  pendingScopeLine = "릴리스 범위 확정",
  scopeTargetLine,
  verificationNote = "API contract cutover metadata sync test",
}) {
  const releasesRoot = path.join(tempRoot, "content", "releases");
  fs.mkdirSync(releasesRoot, { recursive: true });
  fs.writeFileSync(
    path.join(releasesRoot, "v9.9.0.md"),
    releaseRecordSource({
      releaseStatus,
      apiContractCutover,
      markdownCutoverStatus,
      markdownCutoverValue,
      markdownViolationValues,
      markdownDocsCommit,
      markdownPublishedPackageValue,
      metadataDocsCommit,
      metadataReleaseScopes,
      metadataExtraRepoRefs,
      metadataScopeResults,
      includeCutoverGate,
      pendingScopeLine,
      scopeTargetLine,
      verificationNote,
    }),
  );
}

function releaseRecordSource({
  releaseStatus,
  apiContractCutover,
  markdownCutoverStatus,
  markdownCutoverValue,
  markdownViolationValues,
  markdownDocsCommit,
  markdownPublishedPackageValue,
  metadataDocsCommit,
  metadataReleaseScopes,
  metadataExtraRepoRefs,
  metadataScopeResults,
  includeCutoverGate,
  pendingScopeLine,
  scopeTargetLine,
  verificationNote,
}) {
  const effectiveReleaseScopes = metadataReleaseScopes
    ?? (apiContractCutover ? ["docs", "contracts-package", "coupler-api"] : ["docs"]);
  const effectiveScopeTargetLine = scopeTargetLine
    ?? (effectiveReleaseScopes.includes("contracts-package")
      ? "`docs`, `coupler-api`"
      : "`docs`");
  const metadata = {
    schema: "release-metadata/v3",
    version: "v9.9.0",
    status: releaseStatus,
    releaseScopes: effectiveReleaseScopes,
    extraRepoRefs: metadataExtraRepoRefs,
    versionMapping: {
      docs: {
        tag: releaseStatus === "released" ? "v9.9.0" : null,
        commit: metadataDocsCommit ?? (releaseStatus === "released" ? null : "pending"),
      },
      "coupler-api": {
        tag:
          releaseStatus === "released" &&
          effectiveReleaseScopes.includes("coupler-api")
            ? "v9.9.0"
            : null,
        commit: effectiveReleaseScopes.some((scope) =>
          ["contracts-package", "db-migration"].includes(scope),
        )
          ? "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
          : null,
      },
      "coupler-admin-web": {
        tag: null,
        commit: null,
      },
      "coupler-mobile-app": {
        store: {
          android: null,
          ios: null,
        },
        nextPush: null,
        commit: null,
      },
    },
    scopeResults: metadataScopeResults
      ?? defaultScopeResults(effectiveReleaseScopes, apiContractCutover, releaseStatus),
    apiContractCutover,
  };

  return [
    "# 9.9.0 릴리스 실행 기록",
    "",
    "```release-metadata",
    JSON.stringify(metadata, null, 2),
    "```",
    "",
    "## 목적",
    "",
    "- API contract cutover 검증 테스트 기록",
    "",
    "## 범위",
    "",
    "- 대상: " + effectiveScopeTargetLine,
    "- 포함 범위: docs release record",
    "- 제외 범위: `coupler-api`, `coupler-admin-web`, `coupler-mobile-app`",
    "",
    "## 상위 규범 문서",
    "",
    "- [릴리스 프로세스](../policy/release-process.md)",
    "",
    "## 릴리스 상태",
    "",
    "- 목표 버전: `v9.9.0`",
    "- 전체 상태: `" + releaseStatus + "`",
    "- 완료 범위: docs 릴리스 기록과 API contract cutover 검증 완료",
    "- 대기 범위: " + pendingScopeLine,
    "",
    "## 버전 매핑",
    "",
    "- `docs`: 기록 버전 `v9.9.0`, 태그 `" + (releaseStatus === "released" ? "v9.9.0" : "미생성") + "`, 커밋 `" + markdownDocsCommit + "`",
    effectiveReleaseScopes.some((scope) =>
      ["contracts-package", "db-migration"].includes(scope),
    )
      ? "- `coupler-api`: 태그 `" +
        (metadata.versionMapping["coupler-api"].tag ?? "N/A") +
        "`, 커밋 `aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa`"
      : "- `coupler-api`: `N/A` (이번 릴리스 제외)",
    "- `coupler-admin-web`: `N/A` (이번 릴리스 제외)",
    "- `coupler-mobile-app`: Store `N/A`, 릴리스 태그 `N/A`, 커밋 `N/A`, NextPush `N/A`",
    "",
    "## 릴리스 결과",
    "",
    "- 아직 릴리스 전이다.",
    "",
    "## 메인 흐름",
    "",
    "1. 릴리스 기록을 작성한다.",
    "",
    "## 검증 근거",
    "",
    "- " + verificationNote,
    "",
    ...(includeCutoverGate
      ? apiContractCutover?.status === "violated"
        ? [
          "### API contract cutover Gate",
          "",
          "- Cutover 상태: `" + markdownCutoverStatus + "`",
          "- Contract artifact sync:",
          "    - 명령: " + markdownCutoverValue,
          "    - 결과: " + markdownCutoverValue,
          "    - published package: " + markdownPublishedPackageValue,
          "    - Mobile/Admin consumer path: " + markdownCutoverValue,
          "- 사후 위반 처분:",
          "    - 실패 요구조건: " + (
            markdownViolationValues.failedRequirements ??
            apiContractCutover.violation.failedRequirements.join(",")
          ),
          "    - 영향 소비자 ref: " + (
            markdownViolationValues.affectedConsumerRefs ??
            apiContractCutover.violation.affectedConsumerRefs.join(",")
          ),
          "    - 발견 시점: " + (
            markdownViolationValues.detectedAt ??
            apiContractCutover.violation.detectedAt
          ),
          "    - 관측 근거: " + (
            markdownViolationValues.observedEvidence ??
            apiContractCutover.violation.observedEvidence
          ),
          "    - 미관측 범위: " + (
            markdownViolationValues.unobservedScope ??
            apiContractCutover.violation.unobservedScope
          ),
          "    - 운영 처분: " + (
            markdownViolationValues.operationalDisposition ??
            apiContractCutover.violation.operationalDisposition
          ),
          "    - 후속 통제: " + (
            markdownViolationValues.followUpControl ??
            apiContractCutover.violation.followUpControl
          ),
          "",
        ]
        : [
          "### API contract cutover Gate",
          "",
          "- Cutover 상태: `" + markdownCutoverStatus + "`",
          "- Contract artifact sync:",
          "    - 명령: " + markdownCutoverValue,
          "    - 결과: " + markdownCutoverValue,
          "    - published package: " + markdownPublishedPackageValue,
          "    - Mobile/Admin consumer path: " + markdownCutoverValue,
          "- Activation:",
          "    - Activation case IDs: " + markdownCutoverValue,
          "    - Activation 적용 시각: " + markdownCutoverValue,
          "    - 요청 장벽 증빙: " + markdownCutoverValue,
          "    - 이전 client bootstrap/upgrade 증빙: " + markdownCutoverValue,
          "- Client rollback:",
          "    - Client rollback case IDs: " + markdownCutoverValue,
          "    - Rollback 요청 장벽 증빙: " + markdownCutoverValue,
          "    - Client rollback 주의 사항: " + markdownCutoverValue,
          "",
        ]
      : []),
    "## 롤백 기준",
    "",
    "- 릴리스 전이므로 rollback N/A",
    "",
    "## 관련 문서",
    "",
    "- [릴리스 프로세스](../policy/release-process.md)",
    "",
  ].join("\n");
}

function cutoverMetadata(status) {
  return {
    status,
    contractArtifactSync: {
      command: "pending",
      result: "pending",
      consumerPath: "pending",
    },
    activation: {
      caseIds: ["pending"],
      appliedAt: "pending",
      barrierEvidence: "pending",
      bootstrapUpgradeEvidence: "pending",
    },
    rollback: {
      caseIds: ["pending"],
      barrierEvidence: "pending",
      cautions: "pending",
    },
  };
}

function releasedCutoverMetadata() {
  return {
    status: "released",
    contractArtifactSync: {
      command: "pnpm check:generated-client-contract-copies",
      result: "generated copies exact match",
      consumerPath: "Mobile/Admin src/api/generated",
    },
    activation: {
      caseIds: [
        "previous-store-rest-current-api",
        "previous-store-bootstrap-current-api",
      ],
      appliedAt: "2026-07-08 10:00 KST",
      barrierEvidence:
        "Proxy barrier rejected incompatible product requests and reopened after smoke",
      bootstrapUpgradeEvidence:
        "Previous mobile bootstrap/version remained parseable and directed upgrade",
    },
    rollback: {
      caseIds: [
        "previous-store-version-current-api",
        "previous-nextpush-version-current-api",
      ],
      barrierEvidence: "Client rollback case smoke passed behind the barrier",
      cautions: "Do not reopen product requests before rollback smoke",
    },
  };
}

function rollbackCutoverMetadata() {
  return {
    ...releasedCutoverMetadata(),
    status: "rollback",
  };
}

function violatedCutoverMetadata() {
  return {
    status: "violated",
    contractArtifactSync: {
      command: "post-deploy contract comparison",
      result: "post-deploy contract comparison",
      consumerPath: "post-deploy contract comparison",
    },
    violation: {
      failedRequirements: [
        "pre-deploy-activation-barrier",
        "old-readable-bootstrap",
      ],
      affectedConsumerRefs: [
        "previous-store@abcdef0:bootstrap",
        "previous-admin@abcdef1:rest",
      ],
      detectedAt: "2026-07-09 11:00 KST post-deploy review",
      observedEvidence:
        "Tagged source and response comparison confirmed incompatible previous consumers",
      unobservedScope:
        "Live previous-client request volume and affected user count were not observed",
      operationalDisposition:
        "Current runtime remains active and previous clients are not rollback candidates",
      followUpControl:
        "Future contract changes require pre-deploy consumer inventory and old-readable bootstrap evidence",
    },
  };
}

function defaultScopeResults(releaseScopes, apiContractCutover, releaseStatus) {
  return Object.fromEntries(
    releaseScopes.map((scopeName) => [
      scopeName,
      {
        status: releaseStatus,
        summary: `${scopeName} ${releaseStatus}`,
        evidence: defaultScopeEvidence(scopeName, apiContractCutover, releaseStatus),
      },
    ]),
  );
}

function defaultScopeEvidence(scopeName, apiContractCutover, releaseStatus) {
  if (scopeName === "docs") {
    return {};
  }

  if (scopeName === "contracts-package") {
    if (!apiContractCutover) {
      return {
        publishedPackage: null,
        workflow: null,
        sourceRef: null,
        sourceTree: null,
      };
    }

    if (releaseStatus === "released") {
      return {
        publishedPackage: "@coupler-developer/coupler-api-contracts@9.9.0",
        workflow: "Release Contracts workflow https://example.invalid/actions/2",
        sourceRef: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
        sourceTree: {
          path: "packages/contracts",
          publishedSourceTree: "eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee",
          releaseSourceTree: "eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee",
        },
      };
    }

    return {
      publishedPackage: "pending",
      workflow: "pending",
      sourceRef: "pending",
      sourceTree: null,
    };
  }

  if (scopeName === "coupler-api") {
    const concrete = releaseStatus === "released" || releaseStatus === "rolled_back";
    return {
      deployment: concrete ? "coupler-api production deployment evidence" : "pending",
      smoke: concrete ? "coupler-api production smoke evidence" : "pending",
      publicContract:
        concrete && apiContractCutover?.status !== "violated"
          ? apiPublicContractEvidence(Boolean(apiContractCutover))
          : null,
      runtimeRecovery: concrete
        ? {
            strategy: "forward-fix",
            stateSafety: {
              source: "application-evidence",
              persistedState: "current final DB remains forward-readable",
              queuedState: "queue cursor and in-flight ownership stay current",
              externalEffects: "idempotency ledger and sink verification passed",
            },
            previousReleaseCaseIds: [],
          }
        : null,
    };
  }

  return {};
}

function apiPublicContractEvidence(cutover) {
  const consumers = [
    {
      state: "present",
      id: "previous-store",
      surface: "mobile-store",
      generation: "previous",
      artifact: {
        kind: "store-builds",
        mappingRef: "9.8.0 (899)",
        iosVersionBuild: "9.8.0 (899)",
        androidVersionBuild: "9.8.0 (899)",
      },
      contractRef: "@coupler-developer/coupler-api-contracts@9.8.0",
      interfaces: ["rest", "websocket", "bootstrap", "version"],
    },
    {
      state: "present",
      id: "current-store",
      surface: "mobile-store",
      generation: "current",
      artifact: {
        kind: "store-builds",
        mappingRef: "9.9.0 (900)",
        iosVersionBuild: "9.9.0 (900)",
        androidVersionBuild: "9.9.0 (900)",
      },
      contractRef: "@coupler-developer/coupler-api-contracts@9.9.0",
      interfaces: ["rest", "websocket", "bootstrap", "version"],
    },
    {
      state: "present",
      id: "previous-nextpush",
      surface: "mobile-nextpush",
      generation: "previous",
      artifact: {
        kind: "nextpush-deployment",
        mappingRef: "Production v98 target 9.8.0 (899)",
        ios: {
          app: "coupler-ios",
          deployment: "Production",
          label: "v98",
          cohort: "100%",
          targetBinary: "9.8.0 (899)",
        },
        android: {
          app: "coupler-android",
          deployment: "Production",
          label: "v98",
          cohort: "100%",
          targetBinary: "9.8.0 (899)",
        },
      },
      contractRef: "@coupler-developer/coupler-api-contracts@9.8.0",
      interfaces: ["rest", "websocket", "bootstrap", "version"],
    },
    {
      state: "absent",
      id: "current-nextpush",
      surface: "mobile-nextpush",
      generation: "current",
      owner: "mobile release owner",
      absenceEvidence: "No current-generation Production NextPush deployment exists",
    },
    {
      state: "present",
      id: "previous-admin",
      surface: "admin",
      generation: "previous",
      artifact: {
        kind: "admin-build",
        artifactRef: "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
      },
      contractRef: "@coupler-developer/coupler-api-contracts@9.8.0",
      interfaces: ["rest", "websocket"],
    },
    {
      state: "present",
      id: "current-admin",
      surface: "admin",
      generation: "current",
      artifact: {
        kind: "admin-build",
        artifactRef: "cccccccccccccccccccccccccccccccccccccccc",
      },
      contractRef: "@coupler-developer/coupler-api-contracts@9.9.0",
      interfaces: ["rest", "websocket"],
    },
  ];
  return {
    apiRefs: {
      previous: "dddddddddddddddddddddddddddddddddddddddd",
      current: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
    },
    contractRefs: {
      previous: "@coupler-developer/coupler-api-contracts@9.8.0",
      current: "@coupler-developer/coupler-api-contracts@9.9.0",
    },
    consumers,
    cases: consumers.filter(({ state }) => state === "present").flatMap((consumer) =>
      consumer.interfaces.map((interfaceName) => {
        const previous = consumer.generation === "previous";
        const oldReadable = interfaceName === "bootstrap" || interfaceName === "version";
        let exposure = "post-activation";
        if (previous && interfaceName === "version") {
          exposure = "rollback";
        } else if (previous) {
          exposure = "activation";
        }
        return {
          id: `${consumer.id}-${interfaceName}-current-api`,
          consumerId: consumer.id,
          interface: interfaceName,
          apiGeneration: "current",
          exposure,
          expected:
            cutover && previous && !oldReadable
              ? "deterministic-rejection"
              : "success",
          evidence: `${consumer.id} ${interfaceName} evidence`,
        };
      }),
    ),
  };
}

function writePendingDbEvidence({ completed = false, version = "v9.9.0" } = {}) {
  const root = path.join(
    tempRoot,
    "content",
    "releases",
    "evidence",
    "db-migrations",
    version,
  );
  fs.mkdirSync(path.join(root, "dev"), { recursive: true });
  fs.writeFileSync(path.join(root, "dev", "plan.json"), "opaque legacy plan\n");
  if (completed) {
    fs.writeFileSync(path.join(root, "dev", "execution.jsonl"), "opaque legacy execution\n");
  }
}
