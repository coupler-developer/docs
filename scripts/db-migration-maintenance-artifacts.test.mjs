import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  dbMigrationMaintenanceEvidenceSchema,
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
});
