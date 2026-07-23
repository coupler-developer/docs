import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, it } from "node:test";
import { fileURLToPath } from "node:url";

const testFilePath = fileURLToPath(import.meta.url);
const scriptsRoot = path.dirname(testFilePath);
const docsRoot = path.resolve(scriptsRoot, "..");
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
  for (const relativePath of [
    "content/policy/db-migration-frontier-bootstrap-v2.json",
    "content/policy/db-migration-gate-activation-v2.json",
    "content/policy/db-migration-trust-bootstrap-v2.json",
    "scripts/db-migration-release-contract-v2.mjs",
  ]) {
    const targetPath = path.join(tempRoot, relativePath);
    fs.mkdirSync(path.dirname(targetPath), { recursive: true });
    fs.copyFileSync(path.join(docsRoot, relativePath), targetPath);
  }
});

afterEach(() => {
  fs.rmSync(tempRoot, { recursive: true, force: true });
});

describe("validate release records metadata sync", () => {
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
            sourceRef: "coupler-api v9.9.0",
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
      /publishedPackage must include @coupler-developer\/coupler-api-contracts@x\.y\.z/,
    );
  });
});

function runValidator() {
  return spawnSync(process.execPath, [validateScript], {
    cwd: tempRoot,
    encoding: "utf8",
  });
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
    ?? (apiContractCutover ? ["docs", "contracts-package"] : ["docs"]);
  const effectiveScopeTargetLine = scopeTargetLine
    ?? (effectiveReleaseScopes.includes("contracts-package")
      ? "`docs`, `coupler-api`"
      : "`docs`");
  const metadata = {
    schema: "release-metadata/v1",
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
        commit: effectiveReleaseScopes.includes("contracts-package")
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
    effectiveReleaseScopes.includes("contracts-package")
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
          "- 비교 기준 ref:",
          "    - `coupler-api`: " + markdownCutoverValue,
          "    - `coupler-mobile-app`: " + markdownCutoverValue,
          "    - `coupler-admin-web`: " + markdownCutoverValue,
          "- Contract artifact sync:",
          "    - 명령: " + markdownCutoverValue,
          "    - 결과: " + markdownCutoverValue,
          "    - published package: " + markdownPublishedPackageValue,
          "    - Mobile/Admin consumer path: " + markdownCutoverValue,
          "- N+1 배포 근거:",
          "    - Store version/build 또는 NextPush app/deployment/label: " + markdownCutoverValue,
          "    - 운영 출시/적용 시각: " + markdownCutoverValue,
          "    - 확인 URL 또는 콘솔 증빙: " + markdownCutoverValue,
          "- Legacy traffic 차단 근거:",
          "    - 기존 N version/build: " + markdownCutoverValue,
          "    - 강제 업데이트 설정 위치: " + markdownCutoverValue,
          "    - `version_code < min_version` 요청 결과: " + markdownCutoverValue,
          "- Admin 검증:",
          "    - 앱 버전 설정 화면 저장 검증: " + markdownCutoverValue,
          "    - 변경 데이터 조회/운영자 액션 smoke: " + markdownCutoverValue,
          "- Rollback 기준:",
          "    - 직전 호환 API/Admin/Mobile SHA 또는 tag: " + markdownCutoverValue,
          "    - DB 백업/복구 기준: " + markdownCutoverValue,
          "    - 되돌림 금지/주의 사항: " + markdownCutoverValue,
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
    comparisonRefs: {
      "coupler-api": "pending",
      "coupler-mobile-app": "pending",
      "coupler-admin-web": "pending",
    },
    contractArtifactSync: {
      command: "pending",
      result: "pending",
      consumerPath: "pending",
    },
    nPlusOneDeployment: {
      target: "pending",
      appliedAt: "pending",
      evidence: "pending",
    },
    legacyTrafficBlock: {
      previousVersionBuild: "pending",
      forceUpdateConfig: "pending",
      versionCodeCheck: "pending",
    },
    adminVerification: {
      versionSettingsSave: "pending",
      operatorActionSmoke: "pending",
    },
    rollback: {
      previousRefs: "pending",
      dbBackupRestore: "pending",
      cautions: "pending",
    },
  };
}

function releasedCutoverMetadata() {
  return {
    status: "released",
    comparisonRefs: {
      "coupler-api": "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
      "coupler-mobile-app": "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
      "coupler-admin-web": "cccccccccccccccccccccccccccccccccccccccc",
    },
    contractArtifactSync: {
      command: "pnpm check:generated-client-contract-copies",
      result: "generated copies exact match",
      consumerPath: "Mobile/Admin src/api/generated",
    },
    nPlusOneDeployment: {
      target: "Store 9.9.0 (900)",
      appliedAt: "2026-07-08 10:00 KST",
      evidence: "workflow https://example.invalid/actions/1",
    },
    legacyTrafficBlock: {
      previousVersionBuild: "9.8.0 (899)",
      forceUpdateConfig: "Admin 설정 > 버전, API t_app_info.min_version",
      versionCodeCheck: "GET /app/auth/getSettingList?os=google&version_code=899 -> app_info.force_update: 2",
    },
    adminVerification: {
      versionSettingsSave: "Admin version setting saved",
      operatorActionSmoke: "member detail smoke passed",
    },
    rollback: {
      previousRefs: "api/admin/mobile v9.8.0",
      dbBackupRestore: "DB migration N/A - no schema change",
      cautions: "Do not revert min_version below legacy cutoff",
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
        sourceRef: "coupler-api v9.9.0",
      };
    }

    return {
      publishedPackage: "pending",
      workflow: "pending",
      sourceRef: "pending",
    };
  }

  return {};
}
