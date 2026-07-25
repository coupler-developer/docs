import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, it } from "node:test";
import { fileURLToPath } from "node:url";

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
  it("binds a new DB migration record to exact working-tree artifact bytes", () => {
    const evidence = writeMaintenancePlans();
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
          summary: "DB maintenance pending",
          evidence,
        },
      },
      scopeTargetLine: "`docs`, `coupler-api`",
      pendingScopeLine: "개발계와 운영계 maintenance 실행",
      verificationNote: "DB plan artifact SHA-256 fixed before execution",
    });

    const valid = runValidator();
    assert.equal(valid.status, 0, valid.stdout + valid.stderr);

    fs.writeFileSync(
      path.join(
        tempRoot,
        "content",
        "releases",
        "evidence",
        "db-migrations",
        "v9.9.0",
        "prod",
        "plan.json",
      ),
      "changed bytes\n",
    );
    const changed = runValidator();
    assert.notEqual(changed.status, 0);
    assert.match(changed.stderr, /sha256 does not match artifact bytes/);
  });

  it("keeps API cutover Gate out of the base release record template", () => {
    const template = fs.readFileSync(releaseRecordTemplate, "utf8");
    const cutoverTemplate = fs.readFileSync(apiContractCutoverGateTemplate, "utf8");

    assert.match(template, /"apiContractCutover": null/);
    assert.match(
      template,
      /API contract cutover가 없으면 `apiContractCutover: null`로 두고 `API contract cutover Gate` 섹션을 만들지 않는다/,
    );
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
  it("does not parse or revalidate an unchanged release record already present at base", () => {
    initGitRepository();
    writeOpaqueRelease("v1.0.0.md", "historical bytes are intentionally opaque\n");
    commitAll("published release");
    const baseRef = git(["rev-parse", "HEAD"]);

    const result = runValidator(baseRef);

    assert.equal(result.status, 0, result.stdout + result.stderr);
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
        /DB migration evidence for a release already present in the base ref is final and immutable/,
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
      /DB migration evidence for a release already present in the base ref is final and immutable/,
    );
    assert.doesNotMatch(result.stderr, /release-metadata block is required/);
  });
});

function runValidator(baseRef = null) {
  const args = [validateScript];
  if (baseRef) {
    args.push("--base-ref", baseRef);
  }
  return spawnSync(process.execPath, args, {
    cwd: tempRoot,
    encoding: "utf8",
    env: { ...process.env, DOCUMENT_LIFECYCLE_BASE_REF: "" },
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

function writeReleaseRecord({
  releaseStatus = "planned",
  apiContractCutover,
  markdownCutoverStatus,
  markdownCutoverValue = "pending",
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
    schema: "release-metadata/v2",
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
        tag: null,
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
        store: null,
        releaseTag: null,
        commit: null,
        nextPush: null,
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
    "- [배포/릴리즈 프로세스](../policy/release-process.md)",
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
      ? "- `coupler-api`: 태그 `N/A`, 커밋 `aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa`"
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
      ? [
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
    "- [배포/릴리즈 프로세스](../policy/release-process.md)",
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
      };
    }

    if (releaseStatus === "released") {
      return {
        publishedPackage: "@coupler-developer/coupler-api-contracts@9.9.0",
        workflow: "Release Contracts workflow https://example.invalid/actions/2",
        sourceRef: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
      };
    }

    return {
      publishedPackage: "pending",
      workflow: "pending",
      sourceRef: "pending",
    };
  }

  if (scopeName === "coupler-api") {
    const concrete = releaseStatus === "released" || releaseStatus === "rolled_back";
    return {
      deployment: concrete ? "coupler-api production deployment evidence" : "pending",
      smoke: concrete ? "coupler-api production smoke evidence" : "pending",
      publicContract: concrete ? apiPublicContractEvidence(Boolean(apiContractCutover)) : null,
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

function writeMaintenancePlans() {
  const version = "v9.9.0";
  const root = path.join(
    tempRoot,
    "content",
    "releases",
    "evidence",
    "db-migrations",
    version,
  );
  const devPlan = Buffer.from('{"environment":"dev"}\n');
  const prodPlan = Buffer.from('{"environment":"prod"}\n');
  fs.mkdirSync(path.join(root, "dev"), { recursive: true });
  fs.mkdirSync(path.join(root, "prod"), { recursive: true });
  fs.writeFileSync(path.join(root, "dev", "plan.json"), devPlan);
  fs.writeFileSync(path.join(root, "prod", "plan.json"), prodPlan);
  return {
    schema: "db-migration-maintenance-evidence/v1",
    dev: {
      plan: {
        path: `content/releases/evidence/db-migrations/${version}/dev/plan.json`,
        sha256: createHash("sha256").update(devPlan).digest("hex"),
      },
      execution: null,
    },
    prod: {
      plan: {
        path: `content/releases/evidence/db-migrations/${version}/prod/plan.json`,
        sha256: createHash("sha256").update(prodPlan).digest("hex"),
      },
      execution: null,
    },
  };
}
