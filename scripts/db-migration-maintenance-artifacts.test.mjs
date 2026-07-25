import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  dbMigrationMaintenanceEvidenceSchema,
  dbMigrationPrecanonicalTransitionEvidenceSchema,
  sha256Hex,
  validateMaintenanceDbMigrationEvidence,
} from "./db-migration-maintenance-artifacts.mjs";

const version = "v9.9.0";

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
});
