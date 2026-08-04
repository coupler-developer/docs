import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  dbMigrationMaintenanceEvidenceSchema,
  sha256Hex,
  validateMaintenanceDbMigrationEvidence,
} from "./db-migration-maintenance-artifacts.mjs";

const version = "v9.9.0";
const apiSourceRef = "a".repeat(40);
const artifactRoot = `content/releases/evidence/db-migrations/${version}`;

function artifactRef(artifactPath, source) {
  return { path: artifactPath, sha256: sha256Hex(source) };
}

function planFor(
  environment,
  {
    devPlan = null,
    devExecution = null,
    failedPlan = null,
    failedExecution = null,
    planApiSourceRef = apiSourceRef,
    pendingRefs = [],
    adjudicableLedgerGapRefs = [],
  } = {},
) {
  return {
    schema: "db-migration-maintenance-plan/v3",
    environment,
    createdAt: "2026-08-04T00:00:00.000Z",
    apiSourceRef: planApiSourceRef,
    databaseIdentitySha256: "b".repeat(64),
    catalog: { path: "db/schema/schema-contract.json", sha256: "c".repeat(64) },
    ledgerCompatibility: {
      path: "db/schema/ledger-compatibility.json",
      sha256: "d".repeat(64),
    },
    appliedRefs: [],
    recoveredRefs: [],
    baselineRefs: [],
    supersededRefs: [],
    adjudicableLedgerGapRefs,
    pendingRefs,
    devPlan,
    devExecution,
    failedPlan,
    failedExecution,
    runtimeContract: {},
  };
}

function executionFor(
  environment,
  planSha256,
  {
    completed = true,
    failedRef = null,
    malformedFailure = false,
    terminalizedFailure = false,
    ledgerOnlyFailure = false,
    adjudicatedFailure = false,
    migrationEventData = [],
  } = {},
) {
  const runtimeSet = {
    id: `${environment}-next`,
    release: "next",
    units: [
      {
        id: `${environment}-next-api`,
        kind: "api",
        sourceRef: apiSourceRef,
        compatibilityConfigSha256: "6".repeat(64),
        roles: ["db-reader", "db-writer"],
      },
    ],
  };
  const startMixture = {
    mixtureId: `${environment}-start`,
    runtimeSet,
    schemaState: "plan-start",
    schemaFingerprintSha256: "4".repeat(64),
  };
  const finalMixture = {
    mixtureId: `${environment}-next-final`,
    runtimeSet,
    schemaState: "plan-final",
    schemaFingerprintSha256: "5".repeat(64),
  };
  const completedEventData = [
    {
      type: "phase-fenced",
      data: {
        tlsCipher: "TLS_AES_256_GCM_SHA384",
        writerInventorySha256: "9".repeat(64),
        writers: closedWriterInventory(runtimeSet),
        backup: { ref: "backup/dev/example", sha256: "a".repeat(64) },
        sessions: 0,
        transactions: 0,
        mixture: startMixture,
      },
    },
    ...migrationEventData,
    {
      type: "database-completed",
      data: { catalogSha256: "c".repeat(64), ledgerCount: 1 },
    },
    { type: "lock-released", data: {} },
    {
      type: "fenced-smoke-completed",
      data: {
        mixture: finalMixture,
        mode: "read-only",
        modeEvidence: {
          mode: "read-only",
          readOnlyAccessEvidence: "read-only access verified",
        },
        smokeResult: evidenceResult("fenced-smoke"),
        surfaceResiduals: [],
      },
    },
    { type: "lock-released", data: {} },
    {
      type: "phase-resumed",
      data: {
        mixture: finalMixture,
        resumeEvidence: "writers resumed",
        startWatermarks: [],
      },
    },
    { type: "lock-released", data: {} },
    {
      type: "service-completed",
      data: {
        activeMixture: finalMixture,
        restartEvidence: "runtime restarted",
        smokeEvidence: "smoke passed",
        recoveryReadinessEvidence: "recovery readiness verified",
        runningRuntimeSha256: "7".repeat(64),
        runningUnits: [
          {
            runtimeUnitId: `${environment}-next-api`,
            kind: "api",
            sourceRef: apiSourceRef,
            compatibilityConfigSha256: "6".repeat(64),
            observationEvidence: "runtime source and config observed",
          },
        ],
        runtimeContractSha256: sha256Hex(`${JSON.stringify({}, null, 2)}\n`),
      },
    },
  ];
  let failedTerminalEvent;
  if (adjudicatedFailure) {
    failedTerminalEvent = {
      type: "migration-outcome-adjudicated",
      data: {
        ref: failedRef,
        outcome: "postcondition-failed-ledger-missing",
        postconditionSha256: "1".repeat(64),
        adjudicationResult: {
          procedureRef: "db-migration-outcome-adjudication/v1",
          resultRef: "result/failed-postcondition",
        },
        resolution: "append-only-recovery-required",
      },
    };
  } else if (malformedFailure) {
    failedTerminalEvent = { type: "migration-failed", data: {} };
  } else {
    failedTerminalEvent = {
      type: "migration-failed",
      data: {
        ref: failedRef,
        phase: ledgerOnlyFailure ? "ledger" : "sql-or-postcondition",
        errorSha256: "e".repeat(64),
        resolution: ledgerOnlyFailure
          ? "ledger-only-repair"
          : "append-only-recovery-required",
      },
    };
  }
  const failedEventData = [
    completedEventData[0],
    { type: "migration-started", data: { ref: failedRef } },
    ...(ledgerOnlyFailure
      ? [
          {
            type: "migration-sql-succeeded",
            data: { ref: failedRef, postconditionSha256: "1".repeat(64) },
          },
        ]
      : []),
    failedTerminalEvent,
  ];
  const eventData = completed
    ? completedEventData
    : [...failedEventData, ...(terminalizedFailure ? completedEventData : [])];
  const events = eventData.map((event, index) => ({
    schema: "db-migration-maintenance-event/v3",
    sequence: index + 1,
    at: new Date(Date.UTC(2026, 7, 4, 0, 0, index)).toISOString(),
    environment,
    planSha256,
    ...event,
  }));
  return `${events.map((event) => JSON.stringify(event)).join("\n")}\n`;
}

function successfulMigrationEvents(ref, recoveryFor = null) {
  if (recoveryFor) {
    return [
      { type: "migration-started", data: { ref, recoveryFor } },
      {
        type: "migration-sql-succeeded",
        data: {
          ref,
          recoveryFor,
          targetPostconditionSha256: "1".repeat(64),
          recoveryPostconditionSha256: "2".repeat(64),
        },
      },
      { type: "migration-ledger-succeeded", data: { ref, recoveredRef: recoveryFor } },
    ];
  }
  return [
    { type: "migration-started", data: { ref } },
    {
      type: "migration-sql-succeeded",
      data: { ref, postconditionSha256: "1".repeat(64) },
    },
    { type: "migration-ledger-succeeded", data: { ref } },
  ];
}

function closedWriterInventory(runtimeSet) {
  const [unit] = runtimeSet.units;
  return [
    {
      state: "present",
      id: `${unit.id}-writer`,
      kind: unit.kind,
      runtimeUnitId: unit.id,
      sourceRef: unit.sourceRef,
      compatibilityConfigSha256: unit.compatibilityConfigSha256,
      owner: "API owner",
      stopEvidence: "writer stopped",
      verificationEvidence: "writer stop verified",
      sideEffectStopEvidence: "side effects stopped",
    },
    ...["admin", "websocket", "cron", "worker", "direct-sql"].map((kind) => ({
      state: "absent",
      kind,
      owner: `${kind} owner`,
      reason: `${kind} is not deployed`,
      verificationEvidence: `${kind} absence verified`,
    })),
  ];
}

function evidenceResult(name) {
  return {
    procedureRef: `procedure/${name}`,
    resultRef: `result/${name}`,
  };
}

function canonicalArchive({
  withProdExecution = true,
  withRecoveryHistory = false,
  devApiSourceRef = apiSourceRef,
  failedEnvironment = "dev",
  bindRecoveryPending = true,
  forceRecoveryPending = false,
  invalidRecoveryPending = false,
  malformedFailedExecution = false,
  terminalizedFailedExecution = false,
  ledgerOnlyFailedExecution = false,
  adjudicatedFailedExecution = false,
  prodFailedAliasesDev = false,
} = {}) {
  const files = new Map();
  let failedPlanRef = null;
  let failedExecutionRef = null;
  let failedTargetRef = null;
  if (withRecoveryHistory) {
    failedTargetRef = {
      file: "db/migrations/100_example.sql",
      kind: "schema",
      sha256: "4".repeat(64),
    };
    const failedPlanSource = `${JSON.stringify(
      planFor(failedEnvironment, {
        planApiSourceRef: "f".repeat(40),
        pendingRefs: [failedTargetRef],
      }),
      null,
      2,
    )}\n`;
    failedPlanRef = artifactRef(".runtime/db-migrations/v9.9.0/dev/failed-plan.json", failedPlanSource);
    const failedHistoryRoot = `${artifactRoot}/${failedEnvironment}/history/${failedPlanRef.sha256}`;
    const failedPlanPath = `${failedHistoryRoot}/plan.json`;
    files.set(failedPlanPath, failedPlanSource);
    const failedExecutionSource = executionFor(failedEnvironment, failedPlanRef.sha256, {
      completed: false,
      failedRef: failedTargetRef,
      malformedFailure: malformedFailedExecution,
      terminalizedFailure: terminalizedFailedExecution,
      ledgerOnlyFailure: ledgerOnlyFailedExecution,
      adjudicatedFailure: adjudicatedFailedExecution,
    });
    const failedExecutionPath = `${failedHistoryRoot}/execution.jsonl`;
    failedExecutionRef = artifactRef(
      ".runtime/db-migrations/v9.9.0/dev/failed-execution.jsonl",
      failedExecutionSource,
    );
    files.set(failedExecutionPath, failedExecutionSource);
  }

  const recoveryRef = {
    file: "db/migrations/101_recover_example.sql",
    kind: "recovery",
    sha256: "9".repeat(64),
  };
  const devPendingRefs =
    (withRecoveryHistory && bindRecoveryPending) || forceRecoveryPending
      ? [
          ...(withRecoveryHistory && failedTargetRef ? [failedTargetRef] : []),
          invalidRecoveryPending ? { kind: "recovery" } : recoveryRef,
        ]
      : [];
  const devPlanSource = `${JSON.stringify(
    planFor("dev", {
      failedPlan: failedPlanRef,
      failedExecution: failedExecutionRef,
      planApiSourceRef: devApiSourceRef,
      pendingRefs: devPendingRefs,
    }),
    null,
    2,
  )}\n`;
  const devPlanPath = `${artifactRoot}/dev/plan.json`;
  const devPlanRef = artifactRef(devPlanPath, devPlanSource);
  files.set(devPlanPath, devPlanSource);
  const devExecutionSource = executionFor("dev", devPlanRef.sha256, {
    migrationEventData:
      withRecoveryHistory && bindRecoveryPending && failedTargetRef && !invalidRecoveryPending
        ? successfulMigrationEvents(recoveryRef, failedTargetRef)
        : [],
  });
  const devExecutionPath = `${artifactRoot}/dev/execution.jsonl`;
  const devExecutionRef = artifactRef(devExecutionPath, devExecutionSource);
  files.set(devExecutionPath, devExecutionSource);

  const prodPlanSource = `${JSON.stringify(
    planFor("prod", {
      devPlan: {
        path: ".runtime/db-migrations/v9.9.0/dev/plan.json",
        sha256: devPlanRef.sha256,
      },
      devExecution: {
        path: ".runtime/db-migrations/v9.9.0/dev/execution.jsonl",
        sha256: devExecutionRef.sha256,
      },
      failedPlan: prodFailedAliasesDev
        ? {
            path: ".runtime/db-migrations/v9.9.0/dev/plan.json",
            sha256: devPlanRef.sha256,
          }
        : null,
      failedExecution: prodFailedAliasesDev
        ? {
            path: ".runtime/db-migrations/v9.9.0/dev/execution.jsonl",
            sha256: devExecutionRef.sha256,
          }
        : null,
      pendingRefs: prodFailedAliasesDev
        ? [
            {
              file: "db/migrations/102_recover_prod_example.sql",
              kind: "recovery",
              sha256: "0".repeat(64),
            },
          ]
        : [],
    }),
    null,
    2,
  )}\n`;
  const prodPlanPath = `${artifactRoot}/prod/plan.json`;
  const prodPlanRef = artifactRef(prodPlanPath, prodPlanSource);
  files.set(prodPlanPath, prodPlanSource);
  const prodExecutionSource = executionFor("prod", prodPlanRef.sha256);
  const prodExecutionPath = `${artifactRoot}/prod/execution.jsonl`;
  const prodExecutionRef = artifactRef(prodExecutionPath, prodExecutionSource);
  if (withProdExecution) {
    files.set(prodExecutionPath, prodExecutionSource);
  }

  return {
    files,
    devPlanRef,
    devExecutionRef,
    prodPlanRef,
    prodExecutionRef,
    readArtifact: (artifactPath) => files.get(artifactPath) ?? null,
    listArtifacts: (prefix) => [...files.keys()].filter((artifactPath) => artifactPath.startsWith(prefix)),
  };
}

function canonicalEvidence(plan, execution = null) {
  return {
    schema: dbMigrationMaintenanceEvidenceSchema,
    kind: "canonical",
    plan,
    execution,
  };
}

function violationEvidenceFor(evidenceVersion = version, evidenceApiSourceRef = apiSourceRef) {
  return {
    schema: dbMigrationMaintenanceEvidenceSchema,
    kind: "violation",
    violation: {
      version: evidenceVersion,
      apiSourceRef: evidenceApiSourceRef,
      verifiedAt: "2026-08-04T00:00:00.000Z",
      catalogState: {
        catalogPath: "db/schema/schema-contract.json",
        catalogSha256: "1".repeat(64),
        ledgerCompatibilityPath: "db/schema/ledger-compatibility.json",
        ledgerCompatibilitySha256: "2".repeat(64),
        catalogEntryCount: 3,
        resolutionCounts: {
          applied: 1,
          recovered: 1,
          baseline: 0,
          superseded: 1,
        },
        pendingCount: 0,
        adjudicableLedgerGapCount: 0,
      },
      prodState: {
        databaseIdentitySha256: "3".repeat(64),
        schemaFingerprintSha256: "4".repeat(64),
        migrations: [
          {
            file: "db/migrations/100a_expand_example.sql",
            sha256: "5".repeat(64),
            ledger: "applied",
            postcondition: "passed",
          },
        ],
      },
      historicalExecution: {
        backupSha256: "6".repeat(64),
        writerFenceEvidence: "API and cron writers were stopped before the historical execution",
        resumeSmokeEvidence: "writers resumed after ledger, postcondition, and smoke verification",
        canonicalExecution: "unavailable-not-recreated",
      },
      limitation: "the historical event chain was unavailable and was not reconstructed from live state",
    },
  };
}

describe("maintenance DB migration root evidence", () => {
  it("uses a dev plan root while pending", () => {
    const archive = canonicalArchive({ withProdExecution: false });
    archive.files.delete(`${artifactRoot}/dev/execution.jsonl`);
    archive.files.delete(`${artifactRoot}/prod/plan.json`);
    assert.deepEqual(
      validateMaintenanceDbMigrationEvidence({
        evidence: canonicalEvidence(archive.devPlanRef),
        version,
        apiSourceRef,
        scopeStatus: "pending",
        readArtifact: archive.readArtifact,
        listArtifacts: archive.listArtifacts,
        context: "db migration evidence",
      }),
      [],
    );
  });

  it("preserves a completed dev pair while production is delayed", () => {
    const archive = canonicalArchive({ withProdExecution: false });
    archive.files.delete(`${artifactRoot}/prod/plan.json`);
    assert.deepEqual(
      validateMaintenanceDbMigrationEvidence({
        evidence: canonicalEvidence(archive.devPlanRef, archive.devExecutionRef),
        version,
        apiSourceRef,
        scopeStatus: "pending",
        readArtifact: archive.readArtifact,
        listArtifacts: archive.listArtifacts,
        context: "db migration evidence",
      }),
      [],
    );
  });

  it("rejects a partial dev execution as a delayed-production checkpoint", () => {
    const archive = canonicalArchive({ withProdExecution: false });
    archive.files.delete(`${artifactRoot}/prod/plan.json`);
    const incompleteExecution = executionFor("dev", archive.devPlanRef.sha256, {
      completed: false,
      failedRef: {
        file: "db/migrations/100_example.sql",
        kind: "schema",
        sha256: "4".repeat(64),
      },
    });
    const executionPath = `${artifactRoot}/dev/execution.jsonl`;
    archive.files.set(executionPath, incompleteExecution);
    const executionRef = artifactRef(executionPath, incompleteExecution);

    assert(
      validateMaintenanceDbMigrationEvidence({
        evidence: canonicalEvidence(archive.devPlanRef, executionRef),
        version,
        apiSourceRef,
        scopeStatus: "pending",
        readArtifact: archive.readArtifact,
        listArtifacts: archive.listArtifacts,
        context: "db migration evidence",
      }).some((error) => /must prove phase-fenced.*service-completed/.test(error)),
    );
  });

  it("rejects a synthetic two-event completion as a delayed-production checkpoint", () => {
    const archive = canonicalArchive({ withProdExecution: false });
    archive.files.delete(`${artifactRoot}/prod/plan.json`);
    const syntheticEvents = executionFor("dev", archive.devPlanRef.sha256)
      .trim()
      .split("\n")
      .map((line) => JSON.parse(line))
      .filter((event) => ["database-completed", "service-completed"].includes(event.type))
      .map((event, index) => ({ ...event, sequence: index + 1 }));
    const syntheticExecution = `${syntheticEvents.map((event) => JSON.stringify(event)).join("\n")}\n`;
    const executionPath = `${artifactRoot}/dev/execution.jsonl`;
    archive.files.set(executionPath, syntheticExecution);

    const errors = validateMaintenanceDbMigrationEvidence({
      evidence: canonicalEvidence(
        archive.devPlanRef,
        artifactRef(executionPath, syntheticExecution),
      ),
      version,
      apiSourceRef,
      scopeStatus: "pending",
      readArtifact: archive.readArtifact,
      listArtifacts: archive.listArtifacts,
      context: "db migration evidence",
    });

    assert(errors.some((error) => /must prove phase-fenced.*service-completed/.test(error)));
  });

  it("requires every pending migration to have an exact causal resolution", () => {
    const archive = canonicalArchive({ withProdExecution: false });
    archive.files.delete(`${artifactRoot}/prod/plan.json`);
    const pendingRef = {
      file: "db/migrations/100_example.sql",
      kind: "schema",
      sha256: "4".repeat(64),
    };
    const planSource = `${JSON.stringify(planFor("dev", { pendingRefs: [pendingRef] }), null, 2)}\n`;
    const planPath = `${artifactRoot}/dev/plan.json`;
    const planRef = artifactRef(planPath, planSource);
    archive.files.set(planPath, planSource);

    const incompleteExecution = executionFor("dev", planRef.sha256);
    const executionPath = `${artifactRoot}/dev/execution.jsonl`;
    archive.files.set(executionPath, incompleteExecution);
    let errors = validateMaintenanceDbMigrationEvidence({
      evidence: canonicalEvidence(planRef, artifactRef(executionPath, incompleteExecution)),
      version,
      apiSourceRef,
      scopeStatus: "pending",
      readArtifact: archive.readArtifact,
      listArtifacts: archive.listArtifacts,
      context: "db migration evidence",
    });
    assert(errors.some((error) => /missing causal migration resolution/.test(error)));

    const completedExecution = executionFor("dev", planRef.sha256, {
      migrationEventData: successfulMigrationEvents(pendingRef),
    });
    archive.files.set(executionPath, completedExecution);
    errors = validateMaintenanceDbMigrationEvidence({
      evidence: canonicalEvidence(planRef, artifactRef(executionPath, completedExecution)),
      version,
      apiSourceRef,
      scopeStatus: "pending",
      readArtifact: archive.readArtifact,
      listArtifacts: archive.listArtifacts,
      context: "db migration evidence",
    });
    assert.deepEqual(errors, []);
  });

  it("accepts only closed outcome and sealed ledger-gap adjudication resolution", () => {
    const pendingRef = {
      file: "db/migrations/100_example.sql",
      kind: "schema",
      sha256: "4".repeat(64),
    };
    const evidenceRef = {
      file: "db/migrations/101_gap_evidence.sql",
      kind: "postcheck",
      sha256: "5".repeat(64),
    };
    const fixtures = [
      {
        plan: planFor("dev", { pendingRefs: [pendingRef] }),
        events: [
          { type: "migration-started", data: { ref: pendingRef } },
          {
            type: "migration-outcome-adjudicated",
            data: {
              ref: pendingRef,
              outcome: "postcondition-passed-ledger-missing",
              postconditionSha256: "1".repeat(64),
              adjudicationResult: {
                procedureRef: "db-migration-outcome-adjudication/v1",
                resultRef: "evidence/outcome-result.json",
              },
              resolution: "ledger-only-repair",
            },
          },
          { type: "migration-ledger-repaired", data: { ref: pendingRef } },
        ],
      },
      {
        plan: planFor("dev", {
          pendingRefs: [pendingRef],
          adjudicableLedgerGapRefs: [{ ref: pendingRef, evidenceRef }],
        }),
        events: [
          {
            type: "migration-ledger-gap-adjudicated",
            data: {
              ref: pendingRef,
              evidenceRef,
              outcome: "postcondition-passed-ledger-missing",
              postconditionSha256: "1".repeat(64),
              adjudicationResult: {
                procedureRef: "db-migration-ledger-gap-adjudication/v1",
                resultRef: "evidence/ledger-gap-result.json",
              },
              resolution: "ledger-only-repair",
            },
          },
          { type: "migration-ledger-repaired", data: { ref: pendingRef } },
        ],
      },
    ];

    for (const fixture of fixtures) {
      const archive = canonicalArchive({ withProdExecution: false });
      archive.files.delete(`${artifactRoot}/prod/plan.json`);
      const planSource = `${JSON.stringify(fixture.plan, null, 2)}\n`;
      const planPath = `${artifactRoot}/dev/plan.json`;
      const planRef = artifactRef(planPath, planSource);
      archive.files.set(planPath, planSource);
      const executionSource = executionFor("dev", planRef.sha256, {
        migrationEventData: fixture.events,
      });
      const executionPath = `${artifactRoot}/dev/execution.jsonl`;
      archive.files.set(executionPath, executionSource);

      assert.deepEqual(
        validateMaintenanceDbMigrationEvidence({
          evidence: canonicalEvidence(planRef, artifactRef(executionPath, executionSource)),
          version,
          apiSourceRef,
          scopeStatus: "pending",
          readArtifact: archive.readArtifact,
          listArtifacts: archive.listArtifacts,
          context: "db migration evidence",
        }),
        [],
      );
    }
  });

  it("rejects malformed or undeclared adjudication before making a durable checkpoint", () => {
    const pendingRef = {
      file: "db/migrations/100_example.sql",
      kind: "schema",
      sha256: "4".repeat(64),
    };
    const evidenceRef = {
      file: "db/migrations/101_gap_evidence.sql",
      kind: "postcheck",
      sha256: "5".repeat(64),
    };
    const fixtures = [
      {
        plan: planFor("dev", { pendingRefs: [pendingRef] }),
        events: [
          { type: "migration-started", data: { ref: pendingRef } },
          { type: "migration-outcome-adjudicated", data: { ref: pendingRef } },
          { type: "migration-ledger-repaired", data: { ref: pendingRef } },
        ],
      },
      {
        plan: planFor("dev", {
          pendingRefs: [pendingRef],
          adjudicableLedgerGapRefs: [{ ref: pendingRef, evidenceRef }],
        }),
        events: [
          { type: "migration-ledger-gap-adjudicated", data: { ref: pendingRef } },
          { type: "migration-ledger-repaired", data: { ref: pendingRef } },
        ],
      },
      {
        plan: planFor("dev", { pendingRefs: [pendingRef] }),
        events: [
          {
            type: "migration-ledger-gap-adjudicated",
            data: {
              ref: pendingRef,
              evidenceRef,
              outcome: "postcondition-passed-ledger-missing",
              postconditionSha256: "1".repeat(64),
              adjudicationResult: {
                procedureRef: "db-migration-ledger-gap-adjudication/v1",
                resultRef: "evidence/ledger-gap-result.json",
              },
              resolution: "ledger-only-repair",
            },
          },
          { type: "migration-ledger-repaired", data: { ref: pendingRef } },
        ],
      },
    ];

    for (const fixture of fixtures) {
      const archive = canonicalArchive({ withProdExecution: false });
      archive.files.delete(`${artifactRoot}/prod/plan.json`);
      const planSource = `${JSON.stringify(fixture.plan, null, 2)}\n`;
      const planPath = `${artifactRoot}/dev/plan.json`;
      const planRef = artifactRef(planPath, planSource);
      archive.files.set(planPath, planSource);
      const executionSource = executionFor("dev", planRef.sha256, {
        migrationEventData: fixture.events,
      });
      const executionPath = `${artifactRoot}/dev/execution.jsonl`;
      archive.files.set(executionPath, executionSource);
      const errors = validateMaintenanceDbMigrationEvidence({
        evidence: canonicalEvidence(planRef, artifactRef(executionPath, executionSource)),
        version,
        apiSourceRef,
        scopeStatus: "pending",
        readArtifact: archive.readArtifact,
        listArtifacts: archive.listArtifacts,
        context: "db migration evidence",
      });

      assert(
        errors.some((error) =>
          /closed v3 migration outcome adjudication shape|sealed plan ledger gap|not causally complete|missing causal migration resolution/.test(
            error,
          ),
        ),
      );
    }
  });

  it("rejects closed adjudication events recorded outside the v3 causal order", () => {
    const firstRef = {
      file: "db/migrations/100_example.sql",
      kind: "schema",
      sha256: "4".repeat(64),
    };
    const secondRef = {
      file: "db/migrations/101_example.sql",
      kind: "data",
      sha256: "5".repeat(64),
    };
    const evidenceFor = (suffix) => ({
      file: `db/migrations/10${suffix}_gap_evidence.sql`,
      kind: "postcheck",
      sha256: suffix.repeat(64),
    });
    const outcome = (ref, passed) => ({
      type: "migration-outcome-adjudicated",
      data: {
        ref,
        outcome: passed
          ? "postcondition-passed-ledger-missing"
          : "postcondition-failed-ledger-missing",
        postconditionSha256: "1".repeat(64),
        adjudicationResult: {
          procedureRef: "db-migration-outcome-adjudication/v1",
          resultRef: passed ? "evidence/passed.json" : "evidence/failed.json",
        },
        resolution: passed ? "ledger-only-repair" : "append-only-recovery-required",
      },
    });
    const firstEvidence = evidenceFor("2");
    const secondEvidence = evidenceFor("3");
    const gap = (ref, evidenceRef) => ({
      type: "migration-ledger-gap-adjudicated",
      data: {
        ref,
        evidenceRef,
        outcome: "postcondition-passed-ledger-missing",
        postconditionSha256: "1".repeat(64),
        adjudicationResult: {
          procedureRef: "db-migration-ledger-gap-adjudication/v1",
          resultRef: `evidence/${ref.file.split("/").at(-1)}.json`,
        },
        resolution: "ledger-only-repair",
      },
    });
    const fixtures = [
      {
        plan: planFor("dev", { pendingRefs: [firstRef] }),
        events: [
          { type: "migration-started", data: { ref: firstRef } },
          outcome(firstRef, false),
          outcome(firstRef, true),
          { type: "migration-ledger-repaired", data: { ref: firstRef } },
        ],
      },
      {
        plan: planFor("dev", {
          pendingRefs: [firstRef, secondRef],
          adjudicableLedgerGapRefs: [
            { ref: firstRef, evidenceRef: firstEvidence },
            { ref: secondRef, evidenceRef: secondEvidence },
          ],
        }),
        events: [
          gap(secondRef, secondEvidence),
          gap(firstRef, firstEvidence),
          { type: "migration-ledger-repaired", data: { ref: firstRef } },
          { type: "migration-ledger-repaired", data: { ref: secondRef } },
        ],
      },
    ];

    for (const fixture of fixtures) {
      const archive = canonicalArchive({ withProdExecution: false });
      archive.files.delete(`${artifactRoot}/prod/plan.json`);
      const planSource = `${JSON.stringify(fixture.plan, null, 2)}\n`;
      const planPath = `${artifactRoot}/dev/plan.json`;
      const planRef = artifactRef(planPath, planSource);
      archive.files.set(planPath, planSource);
      const executionSource = executionFor("dev", planRef.sha256, {
        migrationEventData: fixture.events,
      });
      const executionPath = `${artifactRoot}/dev/execution.jsonl`;
      archive.files.set(executionPath, executionSource);
      const errors = validateMaintenanceDbMigrationEvidence({
        evidence: canonicalEvidence(planRef, artifactRef(executionPath, executionSource)),
        version,
        apiSourceRef,
        scopeStatus: "pending",
        readArtifact: archive.readArtifact,
        listArtifacts: archive.listArtifacts,
        context: "db migration evidence",
      });

      assert(errors.some((error) => /not admissible in v3 history/.test(error)));
    }
  });

  it("advances to a prod plan root and follows its completed dev pair", () => {
    const archive = canonicalArchive({
      withProdExecution: false,
      devApiSourceRef: "e".repeat(40),
    });
    assert.deepEqual(
      validateMaintenanceDbMigrationEvidence({
        evidence: canonicalEvidence(archive.prodPlanRef),
        version,
        apiSourceRef,
        scopeStatus: "in_progress",
        readArtifact: archive.readArtifact,
        listArtifacts: archive.listArtifacts,
        context: "db migration evidence",
      }),
      [],
    );
  });

  it("requires a completed prod execution at terminal state", () => {
    const archive = canonicalArchive();
    assert.deepEqual(
      validateMaintenanceDbMigrationEvidence({
        evidence: canonicalEvidence(archive.prodPlanRef, archive.prodExecutionRef),
        version,
        apiSourceRef,
        scopeStatus: "released",
        readArtifact: archive.readArtifact,
        listArtifacts: archive.listArtifacts,
        context: "db migration evidence",
      }),
      [],
    );
  });

  it("binds recovery failed plan/execution history by archived SHA", () => {
    const archive = canonicalArchive({ withRecoveryHistory: true });
    assert.deepEqual(
      validateMaintenanceDbMigrationEvidence({
        evidence: canonicalEvidence(archive.prodPlanRef, archive.prodExecutionRef),
        version,
        apiSourceRef,
        scopeStatus: "released",
        readArtifact: archive.readArtifact,
        listArtifacts: archive.listArtifacts,
        context: "db migration evidence",
      }),
      [],
    );
  });

  it("accepts append-only recovery before later normal pending migrations", () => {
    const archive = canonicalArchive({
      withProdExecution: false,
      withRecoveryHistory: true,
    });
    archive.files.delete(`${artifactRoot}/prod/plan.json`);
    const planPath = `${artifactRoot}/dev/plan.json`;
    const plan = JSON.parse(archive.files.get(planPath));
    const [targetRef, recoveryRef] = plan.pendingRefs;
    const laterNormalRef = {
      file: "db/migrations/101_later_normal.sql",
      kind: "data",
      sha256: "8".repeat(64),
    };
    plan.pendingRefs = [targetRef, laterNormalRef, recoveryRef];
    const planSource = `${JSON.stringify(plan, null, 2)}\n`;
    const planRef = artifactRef(planPath, planSource);
    archive.files.set(planPath, planSource);
    const executionSource = executionFor("dev", planRef.sha256, {
      migrationEventData: [
        ...successfulMigrationEvents(recoveryRef, targetRef),
        ...successfulMigrationEvents(laterNormalRef),
      ],
    });
    const executionPath = `${artifactRoot}/dev/execution.jsonl`;
    archive.files.set(executionPath, executionSource);

    assert.deepEqual(
      validateMaintenanceDbMigrationEvidence({
        evidence: canonicalEvidence(planRef, artifactRef(executionPath, executionSource)),
        version,
        apiSourceRef,
        scopeStatus: "pending",
        readArtifact: archive.readArtifact,
        listArtifacts: archive.listArtifacts,
        context: "db migration evidence",
      }),
      [],
    );
  });

  it("requires recovery pending ref and failed history to exist together", () => {
    for (const archive of [
      canonicalArchive({ withRecoveryHistory: true, bindRecoveryPending: false }),
      canonicalArchive({ forceRecoveryPending: true }),
    ]) {
      const errors = validateMaintenanceDbMigrationEvidence({
        evidence: canonicalEvidence(archive.prodPlanRef, archive.prodExecutionRef),
        version,
        apiSourceRef,
        scopeStatus: "released",
        readArtifact: archive.readArtifact,
        listArtifacts: archive.listArtifacts,
        context: "db migration evidence",
      });
      assert(errors.some((error) => /pending recovery and failed artifact pair/.test(error)));
    }
  });

  it("does not treat an incomplete recovery marker as a graph edge", () => {
    const archive = canonicalArchive({
      withRecoveryHistory: true,
      invalidRecoveryPending: true,
    });
    const errors = validateMaintenanceDbMigrationEvidence({
      evidence: canonicalEvidence(archive.prodPlanRef, archive.prodExecutionRef),
      version,
      apiSourceRef,
      scopeStatus: "released",
      readArtifact: archive.readArtifact,
      listArtifacts: archive.listArtifacts,
      context: "db migration evidence",
    });
    assert(errors.some((error) => /invalid recovery migration reference/.test(error)));
    assert(errors.some((error) => /pending recovery and failed artifact pair/.test(error)));
  });

  it("requires parser-valid causal failure evidence in failed history", () => {
    for (const archive of [
      canonicalArchive({ withRecoveryHistory: true, malformedFailedExecution: true }),
      canonicalArchive({ withRecoveryHistory: true, terminalizedFailedExecution: true }),
    ]) {
      const errors = validateMaintenanceDbMigrationEvidence({
        evidence: canonicalEvidence(archive.prodPlanRef, archive.prodExecutionRef),
        version,
        apiSourceRef,
        scopeStatus: "released",
        readArtifact: archive.readArtifact,
        listArtifacts: archive.listArtifacts,
        context: "db migration evidence",
      });
      assert(
        errors.some((error) =>
          /v3 migration failure shape|unresolved causal SQL or postcondition failure/.test(
            error,
          ),
        ),
      );
    }
  });

  it("rejects a ledger-only failure as append-only recovery history", () => {
    const archive = canonicalArchive({
      withRecoveryHistory: true,
      ledgerOnlyFailedExecution: true,
    });
    const errors = validateMaintenanceDbMigrationEvidence({
      evidence: canonicalEvidence(archive.prodPlanRef, archive.prodExecutionRef),
      version,
      apiSourceRef,
      scopeStatus: "released",
      readArtifact: archive.readArtifact,
      listArtifacts: archive.listArtifacts,
      context: "db migration evidence",
    });

    assert(
      errors.some((error) => /unresolved causal SQL or postcondition failure/.test(error)),
    );
  });

  it("accepts an adjudicated postcondition failure as append-only recovery history", () => {
    const archive = canonicalArchive({
      withRecoveryHistory: true,
      adjudicatedFailedExecution: true,
    });

    assert.deepEqual(
      validateMaintenanceDbMigrationEvidence({
        evidence: canonicalEvidence(archive.prodPlanRef, archive.prodExecutionRef),
        version,
        apiSourceRef,
        scopeStatus: "released",
        readArtifact: archive.readArtifact,
        listArtifacts: archive.listArtifacts,
        context: "db migration evidence",
      }),
      [],
    );
  });

  it("rejects recovery history from a different environment", () => {
    const archive = canonicalArchive({
      withRecoveryHistory: true,
      failedEnvironment: "prod",
    });
    const errors = validateMaintenanceDbMigrationEvidence({
      evidence: canonicalEvidence(archive.prodPlanRef, archive.prodExecutionRef),
      version,
      apiSourceRef,
      scopeStatus: "released",
      readArtifact: archive.readArtifact,
      listArtifacts: archive.listArtifacts,
      context: "db migration evidence",
    });
    assert(errors.some((error) => /environment must be dev/.test(error)));
  });

  it("does not let a failed edge alias the already-validated dev pair", () => {
    const archive = canonicalArchive({ prodFailedAliasesDev: true });
    const errors = validateMaintenanceDbMigrationEvidence({
      evidence: canonicalEvidence(archive.prodPlanRef, archive.prodExecutionRef),
      version,
      apiSourceRef,
      scopeStatus: "released",
      readArtifact: archive.readArtifact,
      listArtifacts: archive.listArtifacts,
      context: "db migration evidence",
    });
    assert(
      errors.some((error) =>
        /environment must be prod|canonical failed-history layout/.test(error),
      ),
    );
  });

  it("rejects a mismatched execution chain and orphan artifacts", () => {
    const archive = canonicalArchive();
    const prodExecutionPath = `${artifactRoot}/prod/execution.jsonl`;
    archive.files.set(prodExecutionPath, executionFor("prod", "f".repeat(64)));
    archive.files.set(`${artifactRoot}/orphan.json`, "{}\n");
    const errors = validateMaintenanceDbMigrationEvidence({
      evidence: canonicalEvidence(archive.prodPlanRef, {
        path: prodExecutionPath,
        sha256: sha256Hex(archive.files.get(prodExecutionPath)),
      }),
      version,
      apiSourceRef,
      scopeStatus: "released",
      readArtifact: archive.readArtifact,
      listArtifacts: archive.listArtifacts,
      context: "db migration evidence",
    });
    assert(errors.some((error) => /exact plan SHA-256/.test(error)));
    assert(errors.some((error) => /orphan artifacts/.test(error)));
  });

  it("rejects an execution event that the v3 executor cannot parse", () => {
    const archive = canonicalArchive();
    const prodExecutionPath = `${artifactRoot}/prod/execution.jsonl`;
    const events = archive.files
      .get(prodExecutionPath)
      .trimEnd()
      .split("\n")
      .map((line) => JSON.parse(line));
    delete events[0].at;
    const invalidExecution = `${events.map((event) => JSON.stringify(event)).join("\n")}\n`;
    archive.files.set(prodExecutionPath, invalidExecution);
    const errors = validateMaintenanceDbMigrationEvidence({
      evidence: canonicalEvidence(archive.prodPlanRef, {
        path: prodExecutionPath,
        sha256: sha256Hex(invalidExecution),
      }),
      version,
      apiSourceRef,
      scopeStatus: "released",
      readArtifact: archive.readArtifact,
      listArtifacts: archive.listArtifacts,
      context: "db migration evidence",
    });
    assert(errors.some((error) => /is missing key: at|\.at must be an ISO-8601/.test(error)));
  });

  it("validates optional runtime events with their closed v3 data and order", () => {
    const archive = canonicalArchive({ withProdExecution: false });
    archive.files.delete(`${artifactRoot}/prod/plan.json`);
    const executionPath = `${artifactRoot}/dev/execution.jsonl`;
    const baseEvents = archive.files
      .get(executionPath)
      .trimEnd()
      .split("\n")
      .map((line) => JSON.parse(line));
    const startMixture = baseEvents[0].data.mixture;
    const resumedIndex = baseEvents.findIndex((event) => event.type === "phase-resumed");
    const finalMixture = baseEvents[resumedIndex].data.mixture;
    const writers = closedWriterInventory(startMixture.runtimeSet);
    const fenceReverified = {
      type: "fence-reverified",
      data: {
        tlsCipher: "TLS_AES_256_GCM_SHA384",
        writerInventorySha256: "9".repeat(64),
        writers,
        backup: { ref: "backup/dev/example", sha256: "a".repeat(64) },
        sessions: 0,
        transactions: 0,
        runtimeSet: startMixture.runtimeSet,
        schemaFingerprintSha256: startMixture.schemaFingerprintSha256,
      },
    };
    const recovering = {
      type: "phase-recovering",
      data: {
        strategy: "lossless-reconciliation",
        startEvidence: "recovery started",
        writerInventorySha256: "9".repeat(64),
        writers,
        sessions: 0,
        transactions: 0,
        sourceMixture: finalMixture,
        endWatermarks: [],
      },
    };
    const recoveryCompleted = {
      type: "recovery-completed",
      data: {
        strategy: "lossless-reconciliation",
        targetMixture: finalMixture,
        recoveryResult: evidenceResult("recovery"),
        statePostcondition: evidenceResult("state-postcondition"),
        effectRecovery: {
          kind: "lossless-reconciliation",
          acceptedWrite: evidenceResult("accepted-write"),
          effectLedger: evidenceResult("effect-ledger"),
          sinkVerification: evidenceResult("sink-verification"),
        },
      },
    };
    const secondResume = {
      type: "phase-resumed",
      data: {
        mixture: finalMixture,
        resumeEvidence: "writers resumed after recovery",
        startWatermarks: [],
      },
    };
    const withFence = [baseEvents[0], fenceReverified, ...baseEvents.slice(1)];
    const activeResumeIndex = withFence.findIndex((event) => event.type === "phase-resumed");
    const validEvents = [
      ...withFence.slice(0, activeResumeIndex + 1),
      recovering,
      recoveryCompleted,
      secondResume,
      ...withFence.slice(activeResumeIndex + 1),
    ].map((event, index) => ({
      ...event,
      schema: "db-migration-maintenance-event/v3",
      sequence: index + 1,
      at: new Date(Date.UTC(2026, 7, 4, 1, 0, index)).toISOString(),
      environment: "dev",
      planSha256: archive.devPlanRef.sha256,
    }));
    const validExecution = `${validEvents.map((event) => JSON.stringify(event)).join("\n")}\n`;
    archive.files.set(executionPath, validExecution);
    assert.deepEqual(
      validateMaintenanceDbMigrationEvidence({
        evidence: canonicalEvidence(
          archive.devPlanRef,
          artifactRef(executionPath, validExecution),
        ),
        version,
        apiSourceRef,
        scopeStatus: "pending",
        readArtifact: archive.readArtifact,
        listArtifacts: archive.listArtifacts,
        context: "db migration evidence",
      }),
      [],
    );

    for (const type of ["fence-reverified", "phase-recovering", "recovery-completed"]) {
      const malformedEvents = [
        baseEvents[0],
        { type, data: {} },
        ...baseEvents.slice(1),
      ].map((event, index) => ({
        ...event,
        schema: "db-migration-maintenance-event/v3",
        sequence: index + 1,
        at: new Date(Date.UTC(2026, 7, 4, 2, 0, index)).toISOString(),
        environment: "dev",
        planSha256: archive.devPlanRef.sha256,
      }));
      const malformedExecution = `${malformedEvents
        .map((event) => JSON.stringify(event))
        .join("\n")}\n`;
      archive.files.set(executionPath, malformedExecution);
      const errors = validateMaintenanceDbMigrationEvidence({
        evidence: canonicalEvidence(
          archive.devPlanRef,
          artifactRef(executionPath, malformedExecution),
        ),
        version,
        apiSourceRef,
        scopeStatus: "pending",
        readArtifact: archive.readArtifact,
        listArtifacts: archive.listArtifacts,
        context: "db migration evidence",
      });
      assert(
        errors.some((error) =>
          /closed v3 FENCED re-verification shape|closed v3 RECOVERING shape|closed v3 recovery completion shape/.test(
            error,
          ),
        ),
      );
    }
  });

  it("rejects extra runtime lifecycle events that the v3 replay forbids", () => {
    const archive = canonicalArchive({ withProdExecution: false });
    archive.files.delete(`${artifactRoot}/prod/plan.json`);
    const executionPath = `${artifactRoot}/dev/execution.jsonl`;
    const baseEvents = archive.files
      .get(executionPath)
      .trimEnd()
      .split("\n")
      .map((line) => JSON.parse(line));
    const databaseIndex = baseEvents.findIndex((event) => event.type === "database-completed");
    const smokeIndex = baseEvents.findIndex((event) => event.type === "fenced-smoke-completed");
    const resumedIndex = baseEvents.findIndex((event) => event.type === "phase-resumed");
    const fixtures = [
      [baseEvents[0], baseEvents[0], ...baseEvents.slice(1)],
      [baseEvents[0], baseEvents[smokeIndex], ...baseEvents.slice(1)],
      [
        ...baseEvents.slice(0, databaseIndex + 1),
        baseEvents[databaseIndex],
        ...baseEvents.slice(databaseIndex + 1),
      ],
      [...baseEvents, baseEvents.at(-1)],
      [
        ...baseEvents.slice(0, resumedIndex + 1),
        baseEvents[smokeIndex],
        ...baseEvents.slice(resumedIndex + 1),
      ],
    ];

    for (const fixture of fixtures) {
      const rebound = fixture.map((event, index) => ({
        ...event,
        sequence: index + 1,
        at: new Date(Date.UTC(2026, 7, 4, 3, 0, index)).toISOString(),
      }));
      const executionSource = `${rebound.map((event) => JSON.stringify(event)).join("\n")}\n`;
      archive.files.set(executionPath, executionSource);
      const errors = validateMaintenanceDbMigrationEvidence({
        evidence: canonicalEvidence(
          archive.devPlanRef,
          artifactRef(executionPath, executionSource),
        ),
        version,
        apiSourceRef,
        scopeStatus: "pending",
        readArtifact: archive.readArtifact,
        listArtifacts: archive.listArtifacts,
        context: "db migration evidence",
      });
      assert(
        errors.some((error) =>
          /runtime event .*not admissible|FENCED smoke requires lock release|database completion is already recorded|service completion is already recorded/.test(
            error,
          ),
        ),
      );
    }
  });

  it("rejects an impossible completed runtime inventory", () => {
    const archive = canonicalArchive();
    const prodExecutionPath = `${artifactRoot}/prod/execution.jsonl`;
    const events = archive.files
      .get(prodExecutionPath)
      .trimEnd()
      .split("\n")
      .map((line) => JSON.parse(line));
    events.at(-1).data.runningUnits = [];
    const invalidExecution = `${events.map((event) => JSON.stringify(event)).join("\n")}\n`;
    archive.files.set(prodExecutionPath, invalidExecution);
    const errors = validateMaintenanceDbMigrationEvidence({
      evidence: canonicalEvidence(archive.prodPlanRef, {
        path: prodExecutionPath,
        sha256: sha256Hex(invalidExecution),
      }),
      version,
      apiSourceRef,
      scopeStatus: "released",
      readArtifact: archive.readArtifact,
      listArtifacts: archive.listArtifacts,
      context: "db migration evidence",
    });
    assert(errors.some((error) => /active mixture and running runtime inventory/.test(error)));
  });

  it("does not allow a dev root or partial execution for in-progress prod", () => {
    const archive = canonicalArchive();
    const errors = validateMaintenanceDbMigrationEvidence({
      evidence: canonicalEvidence(archive.devPlanRef, archive.prodExecutionRef),
      version,
      apiSourceRef,
      scopeStatus: "in_progress",
      readArtifact: archive.readArtifact,
      listArtifacts: archive.listArtifacts,
      context: "db migration evidence",
    });
    assert(errors.some((error) => /execution must be null for the current DB migration scope status/.test(error)));
    assert(errors.some((error) => /plan\.path must be .*prod\/plan\.json/.test(error)));
  });

  it("preserves the last bound root pair when an unfinished scope is superseded", () => {
    const archive = canonicalArchive({ withProdExecution: false });
    archive.files.delete(`${artifactRoot}/prod/plan.json`);
    const devExecutionRef = artifactRef(
      `${artifactRoot}/dev/execution.jsonl`,
      archive.files.get(`${artifactRoot}/dev/execution.jsonl`),
    );
    assert.deepEqual(
      validateMaintenanceDbMigrationEvidence({
        evidence: canonicalEvidence(archive.devPlanRef, devExecutionRef),
        version,
        apiSourceRef,
        scopeStatus: "superseded",
        readArtifact: archive.readArtifact,
        listArtifacts: archive.listArtifacts,
        context: "db migration evidence",
      }),
      [],
    );
  });
});

describe("historical DB migration violation evidence", () => {
  it("rejects legacy release-specific schemas for new records", () => {
    const errors = validateMaintenanceDbMigrationEvidence({
      evidence: { schema: "db-migration-precanonical-transition-evidence/v1" },
      version,
      apiSourceRef,
      scopeStatus: "released",
      context: "db migration evidence",
    });
    assert(errors.some((error) => /schema must be db-migration-maintenance-evidence\/v1/.test(error)));
  });

  it("accepts a complete already-applied violation record", () => {
    assert.deepEqual(
      validateMaintenanceDbMigrationEvidence({
        evidence: violationEvidenceFor(),
        version,
        apiSourceRef,
        scopeStatus: "released",
        listArtifacts: () => [],
        context: "db migration evidence",
      }),
      [],
    );
  });

  it("accepts catalog-valid numbered migration punctuation", () => {
    const evidence = violationEvidenceFor();
    evidence.violation.prodState.migrations[0].file = "db/migrations/100-hotfix.sql";
    assert.deepEqual(
      validateMaintenanceDbMigrationEvidence({
        evidence,
        version,
        apiSourceRef,
        scopeStatus: "released",
        listArtifacts: () => [],
        context: "db migration evidence",
      }),
      [],
    );
  });

  it("is version-independent but bound to its release envelope", () => {
    const evidence = violationEvidenceFor("v2.5.0");
    assert.deepEqual(
      validateMaintenanceDbMigrationEvidence({
        evidence,
        version: "v2.5.0",
        apiSourceRef,
        scopeStatus: "released",
        listArtifacts: () => [],
        context: "db migration evidence",
      }),
      [],
    );
  });

  it("requires a full API source commit even when the release mapping is also weak", () => {
    for (const weakRef of [null, "abcdef0"]) {
      const evidence = violationEvidenceFor(version, weakRef);
      const errors = validateMaintenanceDbMigrationEvidence({
        evidence,
        version,
        apiSourceRef: weakRef,
        scopeStatus: "released",
        listArtifacts: () => [],
        context: "db migration evidence",
      });
      assert(errors.some((error) => /must be a 40-character commit SHA/.test(error)));
    }
  });

  it("cannot authorize pending, in-progress, rollback, or canonical artifacts", () => {
    const evidence = violationEvidenceFor();
    for (const scopeStatus of ["pending", "in_progress", "rolled_back"]) {
      const errors = validateMaintenanceDbMigrationEvidence({
        evidence,
        version,
        apiSourceRef,
        scopeStatus,
        listArtifacts: () => [
          `content/releases/evidence/db-migrations/${version}/prod/plan.json`,
        ],
        context: "db migration evidence",
      });
      assert(errors.some((error) => /already-applied released/.test(error)));
      assert(errors.some((error) => /must not carry canonical maintenance artifacts/.test(error)));
    }
  });

  it("rejects incomplete live-state proof", () => {
    const evidence = violationEvidenceFor();
    evidence.violation.catalogState.pendingCount = 1;
    evidence.violation.prodState.migrations[0].postcondition = "unknown";
    evidence.violation.historicalExecution.canonicalExecution = "recreated";
    const errors = validateMaintenanceDbMigrationEvidence({
      evidence,
      version,
      apiSourceRef,
      scopeStatus: "released",
      listArtifacts: () => [],
      context: "db migration evidence",
    });
    assert(errors.some((error) => /full catalog resolved/.test(error)));
    assert(errors.some((error) => /applied ledger and passed postcondition/.test(error)));
    assert(errors.some((error) => /unavailable-not-recreated/.test(error)));
  });

  it("rejects more verified applied migrations than the catalog resolution allows", () => {
    const evidence = violationEvidenceFor();
    evidence.violation.catalogState.resolutionCounts.applied = 0;
    evidence.violation.catalogState.resolutionCounts.baseline = 1;
    const errors = validateMaintenanceDbMigrationEvidence({
      evidence,
      version,
      apiSourceRef,
      scopeStatus: "released",
      listArtifacts: () => [],
      context: "db migration evidence",
    });
    assert(errors.some((error) => /cannot exceed the applied catalog count/.test(error)));
  });
});
