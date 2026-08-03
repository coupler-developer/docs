import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  dbMigrationEmergencyCompletionEvidenceSchema,
  dbMigrationMaintenanceEvidenceSchema,
  dbMigrationPrecanonicalTransitionEvidenceSchema,
  sha256Hex,
  validateMaintenanceDbMigrationEvidence,
} from "./db-migration-maintenance-artifacts.mjs";

const version = "v9.9.0";
const v240ApiSourceRef = "299abc63d0c4cebaaff9f27a9f1484e0ef82c9db";

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
  return {
    schema: dbMigrationEmergencyCompletionEvidenceSchema,
    version: "v2.4.0",
    apiSourceRef: v240ApiSourceRef,
    verifiedAt: "2026-08-03T17:29:40.000Z",
    catalogState: {
      catalogPath: "db/schema/schema-contract.json",
      catalogSha256: "c1afce7707a25cd8e7003eb9dedae85695ad646d51321e0f3bd16db12a8af66a",
      ledgerCompatibilityPath: "db/schema/ledger-compatibility.json",
      ledgerCompatibilitySha256:
        "b3f7b274bb82ff3a0d18541eec0e3c46a66395fb59ea902606fc1e1ab9346fe9",
      catalogEntryCount: 26,
      appliedCount: 25,
      supersededCount: 1,
      resolvedCount: 26,
      pendingCount: 0,
      adjudicableLedgerGapCount: 0,
    },
    prodState: {
      databaseIdentitySha256:
        "fda77e0b97d327b13e2e215f170204c441143a6159d95d8e65acc6d1381b8b69",
      schemaFingerprintSha256:
        "607387544c052a59c960cf1fc34540497b9d438176d4d28ad4fd9c0a61ea5efe",
      migrations: [
        {
          file: "db/migrations/98_expand_match_lounge_source.sql",
          sha256: "37b81efdf3e5154def46d891cd56b9ae6f0f1686f0f554480164e14100b7f57f",
          ledger: "applied",
          postcondition: "passed",
        },
        {
          file: "db/migrations/99_expand_match_finding_send_card_setting.sql",
          sha256: "3f1b9bd74c6a6d95804bb73643916d883c1c24832dead8ee0792fb8d72c405ab",
          ledger: "applied",
          postcondition: "passed",
        },
      ],
    },
    historicalExecution: {
      backupSha256: "949b81ce249212d0df8b47e9f1a1878028dc5a2c5d138ccc01d8978ee3cd5315",
      writerFenceEvidence: "2026-08-04 KST API와 cron을 중지한 뒤 migration 98·99를 실행했다.",
      resumeSmokeEvidence:
        "ledger·postcondition 확인 뒤 API와 cron을 재개하고 내부·외부 smoke를 통과했다.",
      canonicalExecution: "unavailable-not-recreated",
    },
    limitation:
      "긴급 실행 전에 canonical dev/prod plan·execution을 만들지 못했으며 현재 상태 검증으로 과거 execution event를 사후 제조하지 않는다.",
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

  it("allows only the exact v2.4.0 emergency completion evidence", () => {
    assert.deepEqual(
      validateMaintenanceDbMigrationEvidence({
        evidence: emergencyCompletionEvidence(),
        version: "v2.4.0",
        apiSourceRef: v240ApiSourceRef,
        terminal: true,
        scopeStatus: "released",
        context: "db migration evidence",
      }),
      [],
    );
  });

  it("rejects reusing the v2.4.0 emergency completion for another release or state", () => {
    const wrongVersion = validateMaintenanceDbMigrationEvidence({
      evidence: emergencyCompletionEvidence(),
      version: "v2.4.1",
      apiSourceRef: v240ApiSourceRef,
      terminal: true,
      scopeStatus: "released",
      context: "db migration evidence",
    });
    assert(wrongVersion.some((error) => /allowed only for v2\.4\.0/.test(error)));

    for (const [terminal, scopeStatus] of [
      [false, "in_progress"],
      [true, "rolled_back"],
    ]) {
      const errors = validateMaintenanceDbMigrationEvidence({
        evidence: emergencyCompletionEvidence(),
        version: "v2.4.0",
        apiSourceRef: v240ApiSourceRef,
        terminal,
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
        version: "v2.4.0",
        apiSourceRef: v240ApiSourceRef,
        terminal: true,
        scopeStatus: "released",
        context: "db migration evidence",
      });
      assert(errors.some((error) => /must match the sealed v2\.4\.0/.test(error)));
    }

    const unbound = emergencyCompletionEvidence();
    unbound.apiSourceRef = "a".repeat(40);
    const unboundErrors = validateMaintenanceDbMigrationEvidence({
      evidence: unbound,
      version: "v2.4.0",
      apiSourceRef: v240ApiSourceRef,
      terminal: true,
      scopeStatus: "released",
      context: "db migration evidence",
    });
    assert(unboundErrors.some((error) => /apiSourceRef must match/.test(error)));
    assert(unboundErrors.some((error) => /must match the sealed v2\.4\.0/.test(error)));
  });
});
