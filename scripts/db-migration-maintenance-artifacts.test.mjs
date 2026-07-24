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

  it("allows null artifacts only before terminal state", () => {
    const evidence = evidenceFor();
    evidence.dev.plan = null;
    assert.deepEqual(
      validateMaintenanceDbMigrationEvidence({
        evidence,
        version,
        terminal: false,
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
