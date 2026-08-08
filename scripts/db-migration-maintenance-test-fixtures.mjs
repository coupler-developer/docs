import { createHash } from "node:crypto";

const sha256Hex = (source) => createHash("sha256").update(source).digest("hex");
const canonicalJson = (value) => `${JSON.stringify(value, null, 2)}\n`;
const maintenanceReleaseRef = Object.freeze({
  file: "db/migrations/100_release.sql",
  kind: "data",
  sha256: "4".repeat(64),
});
const maintenancePostconditionSha256 = "5".repeat(64);

export const maintenanceInputSources = Object.freeze({
  "db/schema/schema-contract.json": canonicalJson({
    version: 1,
    migrations: [
      {
        ...maintenanceReleaseRef,
        includedInBaseline: false,
      },
    ],
  }),
  "db/schema/ledger-compatibility.json": canonicalJson({
    schema: "db-migration-ledger-compatibility/v1",
    supersededMigrations: [],
    adjudicableLedgerGaps: [],
  }),
  "db/schema/migration-postconditions.json": canonicalJson({
    version: 1,
    entries: [
      {
        migrationFile: maintenanceReleaseRef.file,
        setup: null,
        check: {
          file: "db/schema/migration-fixtures/100_release.check.sql",
          sha256: maintenancePostconditionSha256,
        },
        assertions: [{ column: "ok", expected: 1, scopes: ["live"] }],
      },
    ],
  }),
});

export function maintenancePlanFor(
  environment,
  {
    apiSourceRef = "a".repeat(40),
    createdAt = "2026-08-04T00:00:00.000Z",
    databaseIdentitySha256 = "b".repeat(64),
    devPlan = null,
    devExecution = null,
    runtimeContract = runtimeContractFor(environment, apiSourceRef),
    pendingRefs = [maintenanceReleaseRef],
  } = {},
) {
  const inputRef = (inputPath) => ({
    path: inputPath,
    sha256: sha256Hex(maintenanceInputSources[inputPath]),
  });
  return {
    schema: "db-migration-maintenance-plan/v4",
    environment,
    createdAt,
    apiSourceRef,
    databaseIdentitySha256,
    catalog: inputRef("db/schema/schema-contract.json"),
    ledgerCompatibility: inputRef("db/schema/ledger-compatibility.json"),
    postconditions: inputRef("db/schema/migration-postconditions.json"),
    appliedRefs: [],
    recoveredRefs: [],
    baselineRefs: [],
    supersededRefs: [],
    adjudicableLedgerGapRefs: [],
    pendingRefs,
    devPlan,
    devExecution,
    failedPlan: null,
    failedExecution: null,
    runtimeContract,
  };
}

export function runtimeContractFor(environment, apiRef = "a".repeat(40)) {
  const runtimeUnit = (release) => ({
    id: `${environment}-${release}-api`,
    kind: "api",
    sourceRef: apiRef,
    compatibilityConfig: {
      schema: "db-migration-compatibility-config/v1",
      featureFlags: [],
      serializerModes: [],
      activeRoles: ["db-reader", "db-writer"],
    },
  });
  return {
    schema: "db-migration-runtime-contract/v2",
    runtimeSets: [
      {
        id: `${environment}-previous`,
        release: "previous",
        units: [runtimeUnit("previous")],
      },
      { id: `${environment}-next`, release: "next", units: [runtimeUnit("next")] },
    ],
    changedBoundaries: [
      {
        id: "db-contract",
        kind: "state",
        runtimeUnitIds: [`${environment}-previous-api`, `${environment}-next-api`],
      },
    ],
    mixtures: [
      {
        id: `${environment}-start`,
        runtimeSetId: `${environment}-previous`,
        schemaState: "plan-start",
        schemaFingerprintSha256: "4".repeat(64),
        allowedPhases: ["FENCED"],
        boundaryResults: [
          {
            boundaryId: "db-contract",
            result: "supported",
            legacyStateEvidence: "legacy state verified",
            newRuntimeStateEvidence: "new runtime verified",
          },
        ],
      },
      {
        id: `${environment}-next-final`,
        runtimeSetId: `${environment}-next`,
        schemaState: "plan-final",
        schemaFingerprintSha256: "5".repeat(64),
        allowedPhases: ["FENCED", "RESUMED", "RECOVERING"],
        boundaryResults: [
          {
            boundaryId: "db-contract",
            result: "supported",
            legacyStateEvidence: "legacy state verified",
            newRuntimeStateEvidence: "new runtime verified",
          },
        ],
      },
    ],
    stateSurfaces: [{ id: "database", kind: "database" }],
    fencedSmoke: { mode: "read-only", procedureRef: "procedure/fenced-smoke" },
    recoveryStrategies: [
      {
        kind: "pre-resume-restore",
        procedureRef: "procedure/pre-resume-restore",
        restoreEvidence: "restore tested",
        rpo: "RPO approved",
        rto: "RTO approved",
        followupPlanRequired: true,
      },
      {
        kind: "forward-fix-migration",
        procedureRef: "procedure/forward-fix",
        followupPlanRequired: true,
      },
      {
        kind: "lossless-reconciliation",
        mixtureId: `${environment}-next-final`,
        procedureRef: "procedure/recovery",
        acceptedWriteProcedureRef: "procedure/accepted-write",
        effectLedgerProcedureRef: "procedure/effect-ledger",
        sinkVerificationProcedureRef: "procedure/sink-verification",
        statePostconditionProcedureRef: "procedure/state-postcondition",
      },
    ],
  };
}

function writerInventoryFor(runtimeSet) {
  const [unit] = runtimeSet.units;
  return [
    {
      state: "present",
      id: `${unit.id}-writer`,
      kind: unit.kind,
      runtimeUnitId: unit.id,
      sourceRef: unit.sourceRef,
      compatibilityConfigSha256: runtimeUnitCompatibilitySha256(unit),
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

function runtimeUnitCompatibilitySha256(unit) {
  const config = unit.compatibilityConfig;
  return sha256Hex(canonicalJson({
    schema: config.schema,
    featureFlags: config.featureFlags,
    serializerModes: config.serializerModes,
    activeRoles: config.activeRoles,
  }));
}

export function completedMaintenanceExecution(environment, planSha256, runtimeContract) {
  const startRuntimeSet = runtimeContract.runtimeSets.find(
    (runtimeSet) => runtimeSet.release === "previous",
  );
  const finalRuntimeSet = runtimeContract.runtimeSets.find(
    (runtimeSet) => runtimeSet.release === "next",
  );
  const startDeclaration = runtimeContract.mixtures.find(
    (mixture) => mixture.schemaState === "plan-start",
  );
  const finalDeclaration = runtimeContract.mixtures.find(
    (mixture) => mixture.schemaState === "plan-final",
  );
  const mixtureFor = (declaration, runtimeSet) => ({
    mixtureId: declaration.id,
    runtimeSet,
    schemaState: declaration.schemaState,
    schemaFingerprintSha256: declaration.schemaFingerprintSha256,
  });
  const startMixture = mixtureFor(startDeclaration, startRuntimeSet);
  const finalMixture = mixtureFor(finalDeclaration, finalRuntimeSet);
  const eventData = [
    {
      type: "phase-fenced",
      data: {
        tlsCipher: "TLS_AES_256_GCM_SHA384",
        writerInventorySha256: "9".repeat(64),
        writers: writerInventoryFor(startRuntimeSet),
        backup: { ref: "backup/dev/example", sha256: "a".repeat(64) },
        sessions: 0,
        transactions: 0,
        mixture: startMixture,
      },
    },
    {
      type: "migration-started",
      data: { ref: maintenanceReleaseRef },
    },
    {
      type: "migration-sql-succeeded",
      data: {
        ref: maintenanceReleaseRef,
        postconditionSha256: maintenancePostconditionSha256,
      },
    },
    {
      type: "migration-ledger-succeeded",
      data: { ref: maintenanceReleaseRef },
    },
    {
      type: "database-completed",
      data: {
        catalogSha256: sha256Hex(maintenanceInputSources["db/schema/schema-contract.json"]),
        ledgerCount: 1,
      },
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
        smokeResult: {
          procedureRef: runtimeContract.fencedSmoke.procedureRef,
          resultRef: "result/fenced-smoke",
        },
        surfaceResiduals: [
          { surfaceId: "database", residualCount: 0, evidence: "zero residual verified" },
        ],
      },
    },
    { type: "lock-released", data: {} },
    {
      type: "phase-resumed",
      data: {
        mixture: finalMixture,
        resumeEvidence: "writers resumed",
        startWatermarks: [
          { surfaceId: "database", watermark: "resume watermark", evidence: "observed" },
        ],
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
        runningUnits: finalRuntimeSet.units.map((unit) => ({
          runtimeUnitId: unit.id,
          kind: unit.kind,
          sourceRef: unit.sourceRef,
          compatibilityConfigSha256: runtimeUnitCompatibilitySha256(unit),
          observationEvidence: "runtime source and config observed",
        })),
        runtimeContractSha256: sha256Hex(`${JSON.stringify(runtimeContract, null, 2)}\n`),
      },
    },
  ];
  const events = eventData.map((event, index) => ({
    schema: "db-migration-maintenance-event/v3",
    sequence: index + 1,
    at: new Date(Date.UTC(2026, 7, 4, 0, 0, index)).toISOString(),
    environment,
    planSha256,
    ...event,
  }));
  return Buffer.from(`${events.map((event) => JSON.stringify(event)).join("\n")}\n`);
}
