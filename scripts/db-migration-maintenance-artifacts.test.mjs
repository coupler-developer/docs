import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

import {
  dbMigrationMaintenanceEvidenceSchema,
  dbMigrationPrecanonicalTransitionEvidenceSchema,
  sha256Hex,
  validateMaintenanceDbMigrationEvidence,
} from "./db-migration-maintenance-artifacts.mjs";
import { parseReleaseMetadataBlock } from "./release-record-metadata.mjs";

const version = "v9.9.0";
const v240MetadataErrors = [];
const v240Metadata = parseReleaseMetadataBlock(
  readFileSync(new URL("../content/releases/v2.4.0.md", import.meta.url), "utf8"),
  "v2.4.0 release record",
  v240MetadataErrors,
);
assert.deepEqual(v240MetadataErrors, []);
const v240DbScope = v240Metadata.scopeResults["db-migration"];
const v240ApiSourceRef = v240Metadata.versionMapping["coupler-api"].commit;

function evidenceFor(source = "evidence\n") {
  const sha256 = sha256Hex(source);
  return {
    schema: dbMigrationMaintenanceEvidenceSchema,
    dev: {
      plan: {
        path: `content/releases/evidence/db-migrations/${version}/dev/plan.json`,
        sha256,
      },
      execution: {
        path: `content/releases/evidence/db-migrations/${version}/dev/execution.jsonl`,
        sha256,
      },
    },
    prod: {
      plan: {
        path: `content/releases/evidence/db-migrations/${version}/prod/plan.json`,
        sha256,
      },
      execution: {
        path: `content/releases/evidence/db-migrations/${version}/prod/execution.jsonl`,
        sha256,
      },
    },
  };
}

function transitionEvidence() {
  const devPlan = {
    catalog: { sha256: "a".repeat(64) },
    ledgerCompatibility: { sha256: "b".repeat(64) },
    appliedRefs: [{ file: "one" }],
    recoveredRefs: [],
    baselineRefs: [{ file: "two" }],
    supersededRefs: [],
    pendingRefs: [],
  };
  const devPlanSource = `${JSON.stringify(devPlan)}\n`;
  const devExecutionSource = "completed dev execution\n";
  return {
    evidence: {
      schema: dbMigrationPrecanonicalTransitionEvidenceSchema,
      dev: {
        plan: {
          path: "content/releases/evidence/db-migrations/v2.3.0/dev/plan.json",
          sha256: sha256Hex(devPlanSource),
        },
        execution: {
          path: "content/releases/evidence/db-migrations/v2.3.0/dev/execution.jsonl",
          sha256: sha256Hex(devExecutionSource),
        },
      },
      prod: {
        plan: null,
        execution: null,
      },
      prodDisposition: {
        kind: "pre-canonical-applied",
        version: "v2.3.0",
        verifiedAt: "2026-07-25T08:09:13.364Z",
        catalogSha256: "a".repeat(64),
        ledgerCompatibilitySha256: "b".repeat(64),
        databaseIdentitySha256: "c".repeat(64),
        schemaFingerprintSha256: "d".repeat(64),
        catalogEntryCount: 2,
        catalogResolvedCount: 2,
        pendingCount: 0,
        adjudicableLedgerGapCount: 0,
        migration91Postcondition: "passed",
        historicalEvidence: "operator-retained apply log and pre-apply backup digest reviewed",
        limitation: "production execution preceded the canonical executor; no execution was backfilled",
      },
    },
    readArtifact: (artifactPath) =>
      artifactPath.endsWith("plan.json") ? devPlanSource : devExecutionSource,
  };
}

function emergencyCompletionEvidence() {
  return JSON.parse(JSON.stringify(v240DbScope.evidence));
}

describe("maintenance DB migration artifact reference format", () => {
  it("checks exactly two digest-bound references per environment without asserting execution semantics", () => {
    const source = "evidence\n";
    assert.deepEqual(
      validateMaintenanceDbMigrationEvidence({
        evidence: evidenceFor(source),
        version,
        terminal: true,
        readArtifact: () => source,
        context: "db migration evidence",
      }),
      [],
    );
  });

  it("allows an empty planned artifact prefix but requires all four artifacts at terminal state", () => {
    const evidence = evidenceFor();
    evidence.dev.plan = null;
    evidence.dev.execution = null;
    evidence.prod.plan = null;
    evidence.prod.execution = null;
    assert.deepEqual(
      validateMaintenanceDbMigrationEvidence({
        evidence,
        version,
        terminal: false,
        scopeStatus: "planned",
        context: "db migration evidence",
      }),
      [],
    );
    assert(
      validateMaintenanceDbMigrationEvidence({
        evidence,
        version,
        terminal: true,
        context: "db migration evidence",
      }).some((error) => /dev\.plan must be an artifact reference/.test(error)),
    );
  });

  it("accepts each ordered non-terminal artifact prefix", () => {
    const devPlanned = evidenceFor();
    devPlanned.dev.execution = null;
    devPlanned.prod.plan = null;
    devPlanned.prod.execution = null;
    assert.deepEqual(
      validateMaintenanceDbMigrationEvidence({
        evidence: devPlanned,
        version,
        terminal: false,
        scopeStatus: "pending",
        context: "db migration evidence",
      }),
      [],
    );

    const devCompleted = evidenceFor();
    devCompleted.prod.plan = null;
    devCompleted.prod.execution = null;
    assert.deepEqual(
      validateMaintenanceDbMigrationEvidence({
        evidence: devCompleted,
        version,
        terminal: false,
        scopeStatus: "in_progress",
        context: "db migration evidence",
      }),
      [],
    );

    const prodPlanned = evidenceFor();
    prodPlanned.prod.execution = null;
    assert.deepEqual(
      validateMaintenanceDbMigrationEvidence({
        evidence: prodPlanned,
        version,
        terminal: false,
        scopeStatus: "in_progress",
        context: "db migration evidence",
      }),
      [],
    );
  });

  it("rejects prod artifacts whose dev or prod predecessor is missing", () => {
    const prodPlanBeforeDevExecution = evidenceFor();
    prodPlanBeforeDevExecution.dev.execution = null;
    prodPlanBeforeDevExecution.prod.execution = null;
    const prodPlanErrors = validateMaintenanceDbMigrationEvidence({
      evidence: prodPlanBeforeDevExecution,
      version,
      terminal: false,
      scopeStatus: "in_progress",
      context: "db migration evidence",
    });
    assert(
      prodPlanErrors.some((error) =>
        /prod\.plan has a missing predecessor/.test(error),
      ),
    );

    const prodExecutionBeforePlan = evidenceFor();
    prodExecutionBeforePlan.prod.plan = null;
    const prodExecutionErrors = validateMaintenanceDbMigrationEvidence({
      evidence: prodExecutionBeforePlan,
      version,
      terminal: false,
      scopeStatus: "in_progress",
      context: "db migration evidence",
    });
    assert(
      prodExecutionErrors.some((error) =>
        /prod\.execution has a missing predecessor/.test(error),
      ),
    );
  });

  it("rejects traversal, aliases, extra artifacts, and digest mismatch", () => {
    const evidence = evidenceFor();
    evidence.dev.plan.path =
      `content/releases/evidence/db-migrations/${version}/dev/../dev/plan.json`;
    evidence.prod.extra = { path: "extra", sha256: "a".repeat(64) };
    const errors = validateMaintenanceDbMigrationEvidence({
      evidence,
      version,
      terminal: true,
      readArtifact: () => "different bytes\n",
      context: "db migration evidence",
    });
    assert(errors.some((error) => /dev\.plan\.path must be/.test(error)));
    assert(errors.some((error) => /prod has unknown key: extra/.test(error)));
    assert(errors.some((error) => /sha256 does not match artifact bytes/.test(error)));
  });

  it("allows the one-time v2.3.0 pre-canonical production disposition", () => {
    const { evidence, readArtifact } = transitionEvidence();
    assert.deepEqual(
      validateMaintenanceDbMigrationEvidence({
        evidence,
        version: "v2.3.0",
        terminal: true,
        scopeStatus: "released",
        readArtifact,
        context: "db migration evidence",
      }),
      [],
    );
  });

  it("rejects reusing the transition disposition for another release", () => {
    const { evidence } = transitionEvidence();
    const errors = validateMaintenanceDbMigrationEvidence({
      evidence,
      version: "v2.3.1",
      terminal: true,
      scopeStatus: "released",
      context: "db migration evidence",
    });
    assert(errors.some((error) => /one-time transition allowed only for v2\.3\.0/.test(error)));
    assert(errors.some((error) => /prodDisposition\.version must be v2\.3\.0/.test(error)));
  });

  it("rejects using the transition disposition before the DB scope is released", () => {
    const { evidence } = transitionEvidence();
    const errors = validateMaintenanceDbMigrationEvidence({
      evidence,
      version: "v2.3.0",
      terminal: false,
      scopeStatus: "pending",
      context: "db migration evidence",
    });
    assert(errors.some((error) => /allowed only for the released DB migration scope/.test(error)));
  });

  it("rejects using the transition disposition as rollback evidence", () => {
    const { evidence } = transitionEvidence();
    const errors = validateMaintenanceDbMigrationEvidence({
      evidence,
      version: "v2.3.0",
      terminal: true,
      scopeStatus: "rolled_back",
      context: "db migration evidence",
    });
    assert(errors.some((error) => /allowed only for the released DB migration scope/.test(error)));
  });

  it("rejects an incomplete or unbound transition disposition", () => {
    const { evidence, readArtifact } = transitionEvidence();
    evidence.prodDisposition.pendingCount = 1;
    evidence.prodDisposition.catalogSha256 = "f".repeat(64);
    evidence.prodDisposition.verifiedAt = "2026-02-31T08:09:13.364Z";
    evidence.prodDisposition.unexpected = true;
    delete evidence.prodDisposition.historicalEvidence;
    evidence.prod.plan = evidence.dev.plan;
    const errors = validateMaintenanceDbMigrationEvidence({
      evidence,
      version: "v2.3.0",
      terminal: true,
      scopeStatus: "released",
      readArtifact,
      context: "db migration evidence",
    });
    assert(errors.some((error) => /prod plan and execution must be null/.test(error)));
    assert(errors.some((error) => /full catalog resolved/.test(error)));
    assert(errors.some((error) => /must match the canonical dev plan catalog/.test(error)));
    assert(errors.some((error) => /verifiedAt must be an ISO-8601 UTC timestamp/.test(error)));
    assert(errors.some((error) => /prodDisposition has unknown key: unexpected/.test(error)));
    assert(errors.some((error) => /prodDisposition is missing key: historicalEvidence/.test(error)));
  });

  it("allows only the DB evidence subtree from the v2.4.0 release record", () => {
    assert.deepEqual(
      validateMaintenanceDbMigrationEvidence({
        evidence: emergencyCompletionEvidence(),
        version: v240Metadata.version,
        apiSourceRef: v240ApiSourceRef,
        scopeStatus: v240DbScope.status,
        context: "db migration evidence",
      }),
      [],
    );
  });

  it("ignores object key order while preserving the sealed evidence meaning", () => {
    const reorderedEvidence = Object.fromEntries(
      Object.entries(emergencyCompletionEvidence()).reverse(),
    );
    assert.deepEqual(
      validateMaintenanceDbMigrationEvidence({
        evidence: reorderedEvidence,
        version: v240Metadata.version,
        apiSourceRef: v240ApiSourceRef,
        scopeStatus: v240DbScope.status,
        context: "db migration evidence",
      }),
      [],
    );
  });

  it("rejects reusing the v2.4.0 emergency completion for another release or DB state", () => {
    const wrongVersion = validateMaintenanceDbMigrationEvidence({
      evidence: emergencyCompletionEvidence(),
      version: "v2.4.1",
      apiSourceRef: v240ApiSourceRef,
      scopeStatus: "released",
      context: "db migration evidence",
    });
    assert(wrongVersion.some((error) => /allowed only for v2\.4\.0/.test(error)));

    for (const scopeStatus of ["in_progress", "rolled_back"]) {
      const errors = validateMaintenanceDbMigrationEvidence({
        evidence: emergencyCompletionEvidence(),
        version: v240Metadata.version,
        apiSourceRef: v240ApiSourceRef,
        scopeStatus,
        context: "db migration evidence",
      });
      assert(errors.some((error) => /allowed only for the released DB migration scope/.test(error)));
    }
  });

  it("rejects every drift from the sealed v2.4.0 emergency completion", () => {
    const mutations = [
      (evidence) => {
        evidence.unexpected = true;
      },
      (evidence) => {
        delete evidence.limitation;
      },
      (evidence) => {
        evidence.catalogState.pendingCount = 1;
      },
      (evidence) => {
        evidence.prodState.migrations.reverse();
      },
      (evidence) => {
        evidence.prodState.migrations[0].sha256 = "f".repeat(64);
      },
      (evidence) => {
        evidence.historicalExecution.backupSha256 = "f".repeat(64);
      },
    ];
    for (const mutate of mutations) {
      const evidence = emergencyCompletionEvidence();
      mutate(evidence);
      const errors = validateMaintenanceDbMigrationEvidence({
        evidence,
        version: v240Metadata.version,
        apiSourceRef: v240ApiSourceRef,
        scopeStatus: v240DbScope.status,
        context: "db migration evidence",
      });
      assert(errors.some((error) => /must match the sealed v2\.4\.0/.test(error)));
    }
  });

  it("binds the sealed evidence version and API ref to the release envelope", () => {
    const wrongEvidenceVersion = emergencyCompletionEvidence();
    wrongEvidenceVersion.version = "v2.4.1";
    const versionErrors = validateMaintenanceDbMigrationEvidence({
      evidence: wrongEvidenceVersion,
      version: v240Metadata.version,
      apiSourceRef: v240ApiSourceRef,
      scopeStatus: v240DbScope.status,
      context: "db migration evidence",
    });
    assert(versionErrors.some((error) => /allowed only for v2\.4\.0/.test(error)));
    assert(versionErrors.some((error) => /must match the sealed v2\.4\.0/.test(error)));

    const wrongEvidenceApiRef = emergencyCompletionEvidence();
    wrongEvidenceApiRef.apiSourceRef = "a".repeat(40);
    const evidenceApiRefErrors = validateMaintenanceDbMigrationEvidence({
      evidence: wrongEvidenceApiRef,
      version: v240Metadata.version,
      apiSourceRef: v240ApiSourceRef,
      scopeStatus: v240DbScope.status,
      context: "db migration evidence",
    });
    assert(evidenceApiRefErrors.some((error) => /apiSourceRef must match/.test(error)));
    assert(evidenceApiRefErrors.some((error) => /must match the sealed v2\.4\.0/.test(error)));

    const mappingApiRefErrors = validateMaintenanceDbMigrationEvidence({
      evidence: emergencyCompletionEvidence(),
      version: v240Metadata.version,
      apiSourceRef: "b".repeat(40),
      scopeStatus: v240DbScope.status,
      context: "db migration evidence",
    });
    assert(mappingApiRefErrors.some((error) => /apiSourceRef must match/.test(error)));
  });
});
