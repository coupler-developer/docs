import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { validatePendingToReleasedTransition } from "./release-transition.mjs";

const apiCommit = "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
const adminCommit = "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb";
const mobileCommit = "cccccccccccccccccccccccccccccccccccccccc";

describe("pending to released transition", () => {
  it("allows deployment evidence and release tags to be added without changing frozen targets", () => {
    const pending = pendingMetadata();
    const released = releasedMetadata();

    assert.deepEqual(
      validatePendingToReleasedTransition(pending, released, "v9.9.0"),
      [],
    );
  });

  it("rejects a service commit change after pending", () => {
    const pending = pendingMetadata();
    const released = releasedMetadata();
    released.versionMapping["coupler-api"].commit = "d".repeat(40);

    assert.deepEqual(
      validatePendingToReleasedTransition(pending, released, "v9.9.0"),
      [
        `v9.9.0: frozen release target changed at versionMapping.coupler-api.commit (${apiCommit} -> ${"d".repeat(40)})`,
      ],
    );
  });

  it("rejects release scope changes after pending", () => {
    const pending = pendingMetadata();
    const released = releasedMetadata();
    released.releaseScopes = ["docs", "coupler-api", "coupler-admin-web"];

    assert.deepEqual(
      validatePendingToReleasedTransition(pending, released, "v9.9.0"),
      [
        "v9.9.0: frozen release target changed at releaseScopes ([\"docs\",\"coupler-api\",\"coupler-admin-web\",\"mobile-nextpush\"] -> [\"docs\",\"coupler-api\",\"coupler-admin-web\"])",
      ],
    );
  });

  it("rejects Mobile Store and contract comparison ref changes after pending", () => {
    const pending = pendingMetadata();
    const released = releasedMetadata();
    released.versionMapping["coupler-mobile-app"].store = "9.9.1 (901)";
    released.apiContractCutover.comparisonRefs["coupler-api"] = "e".repeat(40);

    assert.deepEqual(
      validatePendingToReleasedTransition(pending, released, "v9.9.0"),
      [
        "v9.9.0: frozen release target changed at versionMapping.coupler-mobile-app.store (9.9.0 (900) -> 9.9.1 (901))",
        `v9.9.0: frozen release target changed at apiContractCutover.comparisonRefs.coupler-api (${apiCommit} -> ${"e".repeat(40)})`,
      ],
    );
  });

  it("freezes the DB catalog and plan while allowing terminal attestations", () => {
    const pending = pendingMetadata();
    pending.scopeResults["db-migration"] = plannedDbMigrationScope();
    const released = structuredClone(pending);
    released.status = "released";
    released.scopeResults["db-migration"].status = "released";
    released.scopeResults["db-migration"].evidence.plans.dev.batches[0].attestation = {
      path: "content/releases/evidence/db-migrations/v9.9.0/dev/legacy-1.attestation.json",
      sha256: "d".repeat(64),
    };
    released.scopeResults["db-migration"].evidence.rollbackPlan = "restore snapshot";
    released.scopeResults["db-migration"].evidence.catalog = Object.fromEntries(
      Object.entries(released.scopeResults["db-migration"].evidence.catalog).reverse(),
    );
    released.scopeResults["db-migration"].evidence.plans = Object.fromEntries(
      Object.entries(released.scopeResults["db-migration"].evidence.plans).reverse(),
    );
    released.scopeResults["db-migration"].evidence.plans.dev.batches[0] = Object.fromEntries(
      Object.entries(
        released.scopeResults["db-migration"].evidence.plans.dev.batches[0],
      ).reverse(),
    );

    assert.deepEqual(validatePendingToReleasedTransition(pending, released, "v9.9.0"), []);

    released.scopeResults["db-migration"].evidence.catalog.sha256 = "e".repeat(64);
    released.scopeResults["db-migration"].evidence.plans.dev.batches[0].sqlRefs[0].checksumSha256 =
      "f".repeat(64);
    const errors = validatePendingToReleasedTransition(pending, released, "v9.9.0");
    assert(errors.some((error) => /db-migration\.evidence\.catalog/.test(error)));
    assert(errors.some((error) => /db-migration\.evidence\.plans/.test(error)));
  });
});

function plannedDbMigrationScope() {
  const migrationRef = {
    path: "db/migrations/79_precheck_example.sql",
    checksumSha256: "9".repeat(64),
  };
  const plan = {
    operation: "apply",
    targetRefs: [migrationRef],
    batches: [
      {
        batchId: "legacy-1",
        order: 1,
        stage: "legacy",
        sqlRefs: [migrationRef],
        requiredGateIds: ["DBM-GATE-000", "DBM-GATE-010"],
        attestation: null,
      },
    ],
  };
  return {
    status: "pending",
    evidence: {
      catalog: {
        repo: "coupler-api",
        sourceRef: "a".repeat(40),
        path: "db/schema/schema-contract.json",
        sha256: "b".repeat(64),
      },
      plans: { dev: plan, prod: structuredClone(plan) },
      rollbackPlan: null,
    },
  };
}

function pendingMetadata() {
  return {
    schema: "release-metadata/v1",
    version: "v9.9.0",
    status: "pending",
    releaseScopes: [
      "docs",
      "coupler-api",
      "coupler-admin-web",
      "mobile-nextpush",
    ],
    extraRepoRefs: [],
    versionMapping: {
      docs: { tag: null, commit: null },
      "coupler-api": { tag: null, commit: apiCommit },
      "coupler-admin-web": { tag: null, commit: adminCommit },
      "coupler-mobile-app": {
        store: "9.9.0 (900)",
        releaseTag: null,
        commit: mobileCommit,
        nextPush: null,
      },
    },
    scopeResults: {},
    apiContractCutover: {
      status: "pending",
      comparisonRefs: {
        "coupler-api": apiCommit,
        "coupler-mobile-app": mobileCommit,
        "coupler-admin-web": adminCommit,
      },
    },
  };
}

function releasedMetadata() {
  const metadata = structuredClone(pendingMetadata());
  metadata.status = "released";
  metadata.versionMapping.docs.tag = "v9.9.0";
  metadata.versionMapping["coupler-api"].tag = "v9.9.0";
  metadata.versionMapping["coupler-admin-web"].tag = "v9.9.0";
  metadata.versionMapping["coupler-mobile-app"].nextPush =
    "Android Production v99; iOS Production v99";
  metadata.apiContractCutover.status = "released";
  metadata.scopeResults = {
    docs: { status: "released", evidence: {} },
  };

  return metadata;
}
