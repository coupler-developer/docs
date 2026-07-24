import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  deriveReleaseStatusFromScopeResults,
  validateReleaseMetadata,
} from "./release-record-metadata.mjs";
import { createReleaseRecordModel } from "./release-record-model.mjs";
import {
  apiContractCutoverRequiredPaths,
  releaseScopeDescriptors,
} from "./release-schema.mjs";

const version = "v9.9.0";
const apiCommit = "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
const adminCommit = "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb";
const mobileCommit = "cccccccccccccccccccccccccccccccccccccccc";
const submittedCommit = "dddddddddddddddddddddddddddddddddddddddd";
const checksum = "f".repeat(64);

describe("release metadata scope results", () => {
  it("allows pending scope placeholders and derives the deployable pending state", () => {
    const metadata = buildMetadata({
      scopes: ["docs", "coupler-api"],
      statuses: {
        docs: "pending",
        "coupler-api": "pending",
      },
      status: "pending",
    });

    const errors = validate(metadata);

    assert.deepEqual(errors, []);
    assert.equal(deriveReleaseStatusFromScopeResults(metadata), "pending");
  });

  it("derives pending when completed prerequisites are frozen with remaining pending scopes", () => {
    const metadata = buildMetadata({
      scopes: ["docs", "contracts-package", "coupler-api"],
      statuses: {
        docs: "pending",
        "contracts-package": "released",
        "coupler-api": "pending",
      },
      status: "pending",
    });

    assert.deepEqual(validate(metadata), []);
    assert.equal(deriveReleaseStatusFromScopeResults(metadata), "pending");
  });

  it("allows planned scope placeholders", () => {
    const errors = validate(
      buildMetadata({
        scopes: ["docs", "coupler-api"],
        statuses: {
          docs: "planned",
          "coupler-api": "planned",
        },
      }),
    );

    assert.deepEqual(errors, []);
  });

  it("requires document status to match scopeResults derived status", () => {
    const metadata = buildMetadata({
      scopes: ["docs", "coupler-api"],
      statuses: {
        docs: "planned",
        "coupler-api": "released",
      },
      status: "released",
    });

    const errors = validate(metadata);

    assert(
      errors.some((error) => /status must match scopeResults derived status: in_progress/.test(error)),
    );
  });

  it("rejects release-tag as a metadata scope", () => {
    const metadata = buildMetadata({
      scopes: ["docs", "release-tag"],
      statuses: {
        docs: "planned",
        "release-tag": "planned",
      },
    });

    const errors = validate(metadata);

    assert(errors.some((error) => /releaseScopes has unknown scope: release-tag/.test(error)));
  });

  it("requires scopeResults keys to exactly match releaseScopes", () => {
    const metadata = buildMetadata({
      scopes: ["docs", "coupler-api"],
      statuses: {
        docs: "planned",
        "coupler-api": "planned",
      },
    });
    delete metadata.scopeResults["coupler-api"];
    metadata.scopeResults["coupler-admin-web"] = scopeResult("coupler-admin-web", "planned");

    const errors = validate(metadata);

    assert(errors.some((error) => /scopeResults is missing release scope: coupler-api/.test(error)));
    assert(errors.some((error) => /scopeResults has scope not listed in releaseScopes: coupler-admin-web/.test(error)));
  });

  it("requires the docs tag only when docs scope is released", () => {
    const metadata = buildMetadata({
      scopes: ["docs"],
      statuses: {
        docs: "released",
      },
    });
    metadata.versionMapping.docs.tag = null;

    const errors = validate(metadata);

    assert(errors.some((error) => /released docs scope requires docs release tag v9\.9\.0/.test(error)));
  });

  it("requires service release tags from released service scopes, without a release-tag scope", () => {
    const metadata = buildMetadata({
      scopes: ["docs", "coupler-api"],
      statuses: {
        docs: "released",
        "coupler-api": "released",
      },
    });
    metadata.versionMapping["coupler-api"].tag = null;
    metadata.versionMapping["coupler-api"].commit = apiCommit;

    const errors = validate(metadata);

    assert(errors.some((error) => /released coupler-api scope requires coupler-api release tag/.test(error)));
  });

  it("allows a released service scope with a concrete service tag while excluded repos stay empty", () => {
    const metadata = buildMetadata({
      scopes: ["docs", "coupler-api"],
      statuses: {
        docs: "released",
        "coupler-api": "released",
      },
    });

    const errors = validate(metadata);

    assert.deepEqual(errors, []);
  });

  it("allows superseded scopes to keep incomplete evidence without completion exceptions", () => {
    const metadata = buildMetadata({
      scopes: ["docs", "mobile-store"],
      statuses: {
        docs: "released",
        "mobile-store": "superseded",
      },
    });
    metadata.scopeResults["mobile-store"] = {
      ...metadata.scopeResults["mobile-store"],
      supersededBy: "v9.9.1",
      incompleteReason: "Store approval and rollout moved to v9.9.1 after this submission",
      tagStatus: "not_created",
    };

    const errors = validate(metadata);

    assert.deepEqual(errors, []);
  });

  it("requires structured replacement fields for superseded scopes", () => {
    const metadata = buildMetadata({
      scopes: ["docs", "mobile-store"],
      statuses: {
        docs: "released",
        "mobile-store": "superseded",
      },
    });

    const errors = validate(metadata);

    assert(errors.some((error) => /scopeResults\.mobile-store\.supersededBy/.test(error)));
    assert(errors.some((error) => /scopeResults\.mobile-store\.incompleteReason/.test(error)));
    assert(errors.some((error) => /scopeResults\.mobile-store\.tagStatus/.test(error)));
  });

  it("requires released contracts package evidence from scopeResults", () => {
    const metadata = buildMetadata({
      scopes: ["docs", "contracts-package"],
      statuses: {
        docs: "released",
        "contracts-package": "released",
      },
    });
    metadata.scopeResults["contracts-package"].evidence.publishedPackage = null;

    const errors = validate(metadata);

    assert(
      errors.some((error) => /scopeResults\.contracts-package\.evidence\.publishedPackage/.test(error)),
    );
  });

  it("requires released cutover to mirror the contracts package scope result", () => {
    const metadata = buildMetadata({
      scopes: ["docs", "contracts-package"],
      statuses: {
        docs: "released",
        "contracts-package": "released",
      },
      apiContractCutover: releasedApiContractCutover(),
    });
    metadata.scopeResults["contracts-package"].evidence.publishedPackage = "pending";

    const errors = validate(metadata);

    assert(
      errors.some((error) => /scopeResults\.contracts-package\.evidence\.publishedPackage must include/.test(error)),
    );
  });

  it("rejects released cutover N/A evidence and non-SHA comparison refs", () => {
    const metadata = buildMetadata({
      scopes: ["docs", "contracts-package"],
      statuses: {
        docs: "released",
        "contracts-package": "released",
      },
      apiContractCutover: releasedApiContractCutover(),
    });
    metadata.apiContractCutover.comparisonRefs["coupler-api"] = "main";
    metadata.apiContractCutover.contractArtifactSync.command = "N/A - no command";

    const errors = validate(metadata);

    assert(
      errors.some((error) => /apiContractCutover\.comparisonRefs\.coupler-api must be a commit SHA/.test(error)),
    );
    assert(
      errors.some((error) => /apiContractCutover\.contractArtifactSync\.command must be concrete evidence, not an N\/A reason/.test(error)),
    );
  });

  it("requires released cutover concrete evidence before the whole release is terminal", () => {
    const metadata = buildMetadata({
      scopes: ["docs", "contracts-package"],
      statuses: {
        docs: "planned",
        "contracts-package": "released",
      },
      apiContractCutover: releasedApiContractCutover(),
    });
    metadata.apiContractCutover.nPlusOneDeployment.evidence = "N/A - no store evidence";

    const errors = validate(metadata);

    assert(
      errors.some((error) => /apiContractCutover\.nPlusOneDeployment\.evidence must be concrete evidence, not an N\/A reason/.test(error)),
    );
  });

  it("rejects false-pass fixtures across every released cutover field", () => {
    for (const pathParts of apiContractCutoverRequiredPaths) {
      const fieldPath = pathParts.join(".");
      const fixtures = pathParts[0] === "apiContractCutover" && pathParts[1] === "comparisonRefs"
        ? ["main", "pending"]
        : ["N/A - fixture should not satisfy terminal evidence", "pending"];

      for (const fixtureValue of fixtures) {
        const metadata = buildMetadata({
          scopes: ["docs", "contracts-package"],
          statuses: {
            docs: "released",
            "contracts-package": "released",
          },
          apiContractCutover: releasedApiContractCutover(),
        });

        setNestedValue(metadata, pathParts, fixtureValue);

        const errors = validate(metadata);

        assert(
          errors.some((error) => error.includes(fieldPath)),
          `expected ${fieldPath} fixture ${fixtureValue} to fail, got:\n${errors.join("\n")}`,
        );
      }
    }
  });

  it("rejects false-pass fixtures across every rollback cutover field", () => {
    for (const pathParts of apiContractCutoverRequiredPaths) {
      const fieldPath = pathParts.join(".");
      const fixtures = pathParts[0] === "apiContractCutover" && pathParts[1] === "comparisonRefs"
        ? ["main", "pending"]
        : ["N/A - fixture should not satisfy terminal evidence", "pending"];

      for (const fixtureValue of fixtures) {
        const metadata = buildMetadata({
          scopes: ["docs", "contracts-package"],
          statuses: {
            docs: "released",
            "contracts-package": "rolled_back",
          },
          apiContractCutover: rollbackApiContractCutover(),
        });

        setNestedValue(metadata, pathParts, fixtureValue);

        const errors = validate(metadata);

        assert(
          errors.some((error) => error.includes(fieldPath)),
          `expected rollback ${fieldPath} fixture ${fixtureValue} to fail, got:\n${errors.join("\n")}`,
        );
      }
    }
  });

  it("requires rolled_back release metadata to use rollback cutover status", () => {
    const metadata = buildMetadata({
      scopes: ["docs", "contracts-package"],
      statuses: {
        docs: "released",
        "contracts-package": "rolled_back",
      },
      apiContractCutover: releasedApiContractCutover(),
    });

    const errors = validate(metadata);

    assert(
      errors.some((error) => /rolled_back metadata apiContractCutover\.status must be rollback/.test(error)),
    );
  });

  it("rejects false-pass fixtures across every scope terminal evidence descriptor", () => {
    for (const [scopeName, descriptor] of Object.entries(releaseScopeDescriptors)) {
      if (scopeName === "db-migration") {
        continue;
      }
      for (const evidence of descriptor.releasedEvidence ?? []) {
        assertTerminalEvidencePathRejectsFixtures(scopeName, "released", evidence.metadataPath);
      }

      for (const evidence of descriptor.rollbackEvidence ?? []) {
        assertTerminalEvidencePathRejectsFixtures(scopeName, "rolled_back", evidence.metadataPath);
      }
    }
  });

  it("requires release tags for every released scope descriptor that declares a tag repo", () => {
    for (const [scopeName, descriptor] of Object.entries(releaseScopeDescriptors)) {
      if (!descriptor.releaseTagRepo) {
        continue;
      }

      const scopes = scopeName === "docs" ? ["docs"] : ["docs", scopeName];
      const statuses = Object.fromEntries(scopes.map((name) => [name, "released"]));
      const metadata = buildMetadata({
        scopes,
        statuses,
      });
      const repoMapping = metadata.versionMapping[descriptor.releaseTagRepo];
      const fieldName = descriptor.releaseTagRepo === "coupler-mobile-app" ? "releaseTag" : "tag";
      repoMapping[fieldName] = null;

      const errors = validate(metadata);

      assert(
        errors.some((error) => /release tag/.test(error)),
        `expected released ${scopeName} missing ${descriptor.releaseTagRepo}.${fieldName} to fail, got:\n${errors.join("\n")}`,
      );
    }
  });

  it("rejects unknown keys on every release metadata object path", () => {
    const metadata = buildMetadata({
      scopes: [
        "docs",
        "contracts-package",
        "coupler-api",
        "coupler-admin-web",
        "mobile-store",
        "mobile-nextpush",
      ],
      statuses: {
        docs: "released",
        "contracts-package": "released",
        "coupler-api": "released",
        "coupler-admin-web": "released",
        "mobile-store": "released",
        "mobile-nextpush": "released",
      },
      apiContractCutover: releasedApiContractCutover(),
    });

    assert.deepEqual(validate(metadata), []);

    for (const pathParts of collectObjectPaths(metadata)) {
      const candidate = cloneMetadata(metadata);
      const target = getNestedObject(candidate, pathParts);
      target.__unexpected = "fixture should not be accepted";

      const errors = validate(candidate);

      assert(
        errors.some((error) => error.includes("__unexpected")),
        `expected unknown key at ${pathParts.join(".") || "<root>"} to fail, got:\n${errors.join("\n")}`,
      );
    }
  });

  it("allows new maintenance DB migration records with the exact four artifact references", () => {
    const metadata = buildMetadata({
      scopes: ["docs", "db-migration"],
      statuses: {
        docs: "released",
        "db-migration": "released",
      },
    });
    assert.deepEqual(validate(metadata), []);
  });

  it("rejects DB migration artifact aliases, extra evidence, and byte digest mismatch", () => {
    const metadata = buildMetadata({
      scopes: ["docs", "db-migration"],
      statuses: {
        docs: "released",
        "db-migration": "released",
      },
    });
    metadata.scopeResults["db-migration"].evidence.dev.plan.path =
      `content/releases/evidence/db-migrations/${version}/dev/../dev/plan.json`;
    metadata.scopeResults["db-migration"].evidence.prod.extra = {
      path: "extra",
      sha256: checksum,
    };

    const validationErrors = validate(metadata, {
      readArtifact: () => Buffer.from("different bytes\n"),
    });
    assert(
      validationErrors.some((error) => /dev\.plan\.path must be/.test(error)),
    );
    assert(
      validationErrors.some((error) => /prod has unknown key: extra/.test(error)),
    );
    assert(
      validationErrors.some((error) => /sha256 does not match artifact bytes/.test(error)),
    );
  });

  it("requires plans from pending onward and all four artifacts at terminal status", () => {
    const pendingMetadata = buildMetadata({
      scopes: ["docs", "db-migration"],
      statuses: {
        docs: "pending",
        "db-migration": "pending",
      },
      status: "pending",
    });
    pendingMetadata.scopeResults["db-migration"].evidence.dev.plan = null;
    assert(
      validate(pendingMetadata).some((error) =>
        /dev\.plan must be an artifact reference/.test(error),
      ),
    );

    const releasedMetadata = buildMetadata({
      scopes: ["docs", "db-migration"],
      statuses: {
        docs: "released",
        "db-migration": "released",
      },
    });
    releasedMetadata.scopeResults["db-migration"].evidence.prod.execution = null;
    assert(
      validate(releasedMetadata).some((error) =>
        /prod\.execution must be an artifact reference/.test(error),
      ),
    );
  });

  it("derives coupler-api preflight repo for maintenance DB migration evidence", () => {
    const metadata = buildMetadata({
      scopes: ["docs", "db-migration"],
      statuses: {
        docs: "released",
        "db-migration": "released",
      },
    });

    const model = createReleaseRecordModel(metadata);
    assert.deepEqual([...model.preflightRepoNames], ["docs", "coupler-api"]);
  });

  it("requires released Mobile Store submitted marker evidence and deletion evidence", () => {
    const metadata = buildMetadata({
      scopes: ["docs", "mobile-store"],
      statuses: {
        docs: "released",
        "mobile-store": "released",
      },
    });
    metadata.scopeResults["mobile-store"].evidence.submittedMarkers[0].deletedEvidence = "pending";

    const errors = validate(metadata);

    assert(
      errors.some((error) => /submittedMarkers\.0\.deletedEvidence must be concrete evidence/.test(error)),
    );
  });

  it("allows released Mobile NextPush without a mobile release tag", () => {
    const metadata = buildMetadata({
      scopes: ["docs", "mobile-nextpush"],
      statuses: {
        docs: "released",
        "mobile-nextpush": "released",
      },
    });
    metadata.versionMapping["coupler-mobile-app"].releaseTag = null;

    const errors = validate(metadata);

    assert.deepEqual(errors, []);
  });

  it("requires concrete NextPush evidence when Mobile NextPush is released", () => {
    const metadata = buildMetadata({
      scopes: ["docs", "mobile-nextpush"],
      statuses: {
        docs: "released",
        "mobile-nextpush": "released",
      },
    });
    metadata.scopeResults["mobile-nextpush"].evidence.rollout = "pending";

    const errors = validate(metadata);

    assert(
      errors.some((error) => /mobile-nextpush evidence scopeResults\.mobile-nextpush\.evidence\.rollout/.test(error)),
    );
  });

  it("requires rollbackReason for rolled_back scope results", () => {
    const metadata = buildMetadata({
      scopes: ["docs", "coupler-api"],
      statuses: {
        docs: "released",
        "coupler-api": "rolled_back",
      },
    });
    delete metadata.scopeResults["coupler-api"].rollbackReason;

    const errors = validate(metadata);

    assert(errors.some((error) => /scopeResults\.coupler-api\.rollbackReason/.test(error)));
  });

  it("derives release status from scope results", () => {
    const metadata = buildMetadata({
      scopes: ["docs", "coupler-api", "coupler-admin-web"],
      statuses: {
        docs: "released",
        "coupler-api": "released",
        "coupler-admin-web": "planned",
      },
    });

    assert.equal(deriveReleaseStatusFromScopeResults(metadata), "in_progress");
  });
});

function validate(metadata, options) {
  const errors = [];
  validateReleaseMetadata(
    metadata,
    "content/releases/v9.9.0.md",
    version,
    errors,
    options,
  );

  return errors;
}

function assertTerminalEvidencePathRejectsFixtures(scopeName, status, pathParts) {
  const scopes = scopeName === "docs" ? ["docs"] : ["docs", scopeName];
  const statuses = Object.fromEntries(
    scopes.map((name) => [name, name === scopeName ? status : "released"]),
  );
  const fieldPath = pathParts.join(".");
  const fixtureValues = [
    "N/A - fixture should not satisfy terminal evidence",
    "pending",
  ];

  for (const fixtureValue of fixtureValues) {
    const metadata = buildMetadata({
      scopes,
      statuses,
    });

    setNestedValue(metadata, pathParts, fixtureValue);

    const errors = validate(metadata);

    assert(
      errors.some((error) => error.includes(fieldPath)),
      `expected ${status} ${scopeName} ${fieldPath} fixture ${fixtureValue} to fail, got:\n${errors.join("\n")}`,
    );
  }
}

function setNestedValue(root, pathParts, value) {
  let current = root;
  for (const pathPart of pathParts.slice(0, -1)) {
    current = current[pathPart];
  }

  current[pathParts.at(-1)] = value;
}

function cloneMetadata(metadata) {
  return JSON.parse(JSON.stringify(metadata));
}

function collectObjectPaths(value, pathParts = []) {
  if (!value || typeof value !== "object") {
    return [];
  }

  if (Array.isArray(value)) {
    return value.flatMap((item, index) => collectObjectPaths(item, [...pathParts, String(index)]));
  }

  return [
    pathParts,
    ...Object.entries(value).flatMap(([key, item]) =>
      collectObjectPaths(item, [...pathParts, key]),
    ),
  ];
}

function getNestedObject(root, pathParts) {
  let current = root;
  for (const pathPart of pathParts) {
    current = current[pathPart];
  }

  return current;
}

function buildMetadata({
  scopes,
  statuses,
  status,
  apiContractCutover = null,
}) {
  const metadata = {
    schema: "release-metadata/v1",
    version,
    status: status ?? deriveStatus(scopes, statuses),
    releaseScopes: scopes,
    extraRepoRefs: [],
    versionMapping: versionMappingFor(statuses),
    scopeResults: Object.fromEntries(
      scopes.map((scopeName) => [scopeName, scopeResult(scopeName, statuses[scopeName])]),
    ),
    apiContractCutover,
  };

  return metadata;
}

function deriveStatus(scopes, statuses) {
  const values = scopes.map((scopeName) => statuses[scopeName]);
  if (values.every((status) => status === "planned")) {
    return "planned";
  }

  if (values.some((status) => status === "rolled_back")) {
    return "rolled_back";
  }

  if (values.every((status) => status === "released")) {
    return "released";
  }

  if (
    values.some((status) => status === "superseded") &&
    values.every((status) => status === "released" || status === "superseded")
  ) {
    return "superseded";
  }

  return "in_progress";
}

function versionMappingFor(statuses) {
  return {
    docs: {
      tag: statuses.docs === "released" ? version : null,
      commit: null,
    },
    "coupler-api": {
      tag: statuses["coupler-api"] === "released" ? version : null,
      commit: statuses["coupler-api"] === "released" ? null : apiCommit,
    },
    "coupler-admin-web": {
      tag: statuses["coupler-admin-web"] === "released" ? version : null,
      commit: statuses["coupler-admin-web"] === "released" ? null : adminCommit,
    },
    "coupler-mobile-app": {
      store: statuses["mobile-store"] === "released" ? "9.9.0 (900)" : "pending",
      releaseTag: statuses["mobile-store"] === "released" ? version : null,
      commit: statuses["mobile-store"] === "released" ? null : mobileCommit,
      nextPush: statuses["mobile-nextpush"] === "released" ? "Production v99 target 9.9.0 (900)" : null,
    },
  };
}

function scopeResult(scopeName, status) {
  const result = {
    status,
    summary: `${scopeName} ${status}`,
    evidence: evidenceFor(scopeName, status),
  };

  if (status === "rolled_back") {
    result.rollbackReason = `${scopeName} rolled back after production issue`;
  }

  return result;
}

function evidenceFor(scopeName, status) {
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
      deployment: concrete ? "coupler-api production deployed at 2026-07-09 10:00 KST" : "pending",
      smoke: concrete ? "GET /health and envelope smoke passed" : "pending",
      rollback: concrete ? "rollback to coupler-api v9.8.0" : "pending",
    };
  }

  if (scopeName === "coupler-admin-web") {
    return {
      deployment: concrete ? "coupler-admin-web production build deployed at 2026-07-09 10:05 KST" : "pending",
      smoke: concrete ? "admin member detail smoke passed" : "pending",
      rollback: concrete ? "rollback to coupler-admin-web v9.8.0 build artifact" : "pending",
    };
  }

  if (scopeName === "mobile-store") {
    return {
      submission: concrete ? "App Store Connect submitted 9.9.0 (900)" : "pending",
      approval: concrete ? "Store approved 9.9.0 (900)" : "pending",
      release: concrete ? "Store phased release started 2026-07-09 11:00 KST" : "pending",
      smoke: concrete ? "Mobile production smoke passed on 9.9.0 (900)" : "pending",
      artifact: concrete ? "Android/iOS artifact SHA-256 evidence recorded" : "pending",
      submittedMarkers: [
        {
          tag: "submitted/mobile-9.9.0-900",
          commit: concrete ? submittedCommit : "pending",
          evidence: concrete ? "submitted/mobile-9.9.0-900 evidence migrated to release record" : "pending",
          deletedEvidence: concrete ? "submitted/mobile-9.9.0-900 deleted from origin after migration" : "pending",
        },
      ],
    };
  }

  if (scopeName === "mobile-nextpush") {
    return {
      app: concrete ? "CodePush app Coupler" : "pending",
      productionLabel: concrete ? "Production v99" : "pending",
      targetBinary: concrete ? "9.9.0 (900)" : "pending",
      uploadedAt: concrete ? "2026-07-09 11:00 KST" : "pending",
      rollout: concrete ? "100%" : "pending",
      mandatory: concrete ? "mandatory false" : "pending",
      disabled: concrete ? "disabled false" : "pending",
    };
  }

  if (scopeName === "db-migration") {
    return concrete ? releasedDbMigrationEvidence() : plannedDbMigrationEvidence();
  }

  return {};
}

function plannedDbMigrationEvidence() {
  return {
    schema: "db-migration-maintenance-evidence/v1",
    dev: maintenanceEnvironmentEvidence("dev", false),
    prod: maintenanceEnvironmentEvidence("prod", false),
  };
}

function releasedDbMigrationEvidence() {
  return {
    schema: "db-migration-maintenance-evidence/v1",
    dev: maintenanceEnvironmentEvidence("dev", true),
    prod: maintenanceEnvironmentEvidence("prod", true),
  };
}

function maintenanceEnvironmentEvidence(environment, terminal) {
  const root = `content/releases/evidence/db-migrations/${version}/${environment}`;
  return {
    plan: {
      path: `${root}/plan.json`,
      sha256: checksum,
    },
    execution: terminal
      ? {
          path: `${root}/execution.jsonl`,
          sha256: checksum,
        }
      : null,
  };
}

function releasedApiContractCutover() {
  return {
    status: "released",
    comparisonRefs: {
      "coupler-api": apiCommit,
      "coupler-mobile-app": mobileCommit,
      "coupler-admin-web": adminCommit,
    },
    contractArtifactSync: {
      command: "pnpm check:contracts",
      result: "contracts package exact match",
      consumerPath: "Mobile/Admin package dependency",
    },
    nPlusOneDeployment: {
      target: "Store 9.9.0 (900)",
      appliedAt: "2026-07-09 11:00 KST",
      evidence: "Store console release evidence",
    },
    legacyTrafficBlock: {
      previousVersionBuild: "9.8.0 (899)",
      forceUpdateConfig: "Admin version screen",
      versionCodeCheck: "GET /app/auth/getSettingList -> force_update: 2",
    },
    adminVerification: {
      versionSettingsSave: "Admin version save smoke passed",
      operatorActionSmoke: "Admin operator action smoke passed",
    },
    rollback: {
      previousRefs: "api/admin/mobile v9.8.0 refs",
      dbBackupRestore: "DB migration not included",
      cautions: "Do not disable force update before rollback",
    },
  };
}

function rollbackApiContractCutover() {
  return {
    ...releasedApiContractCutover(),
    status: "rollback",
  };
}
