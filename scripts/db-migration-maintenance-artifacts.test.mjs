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
const compatibilityRoles = [
  "db-reader",
  "db-writer",
  "queue-consumer",
  "side-effect-producer",
];
const plansBySha256 = new Map();

function artifactRef(artifactPath, source) {
  const sha256 = sha256Hex(source);
  try {
    const value = JSON.parse(source);
    if (String(value?.schema).startsWith("db-migration-maintenance-plan/")) {
      plansBySha256.set(sha256, value);
    }
  } catch {
    // Non-JSON and malformed-artifact tests are intentionally not registered.
  }
  return { path: artifactPath, sha256 };
}

function runtimeContractFor(
  environment,
  schema = "db-migration-runtime-contract/v1",
  sourceRef = apiSourceRef,
) {
  const runtimeUnit = (release) =>
    schema === "db-migration-runtime-contract/v2"
      ? {
          id: `${environment}-${release}-api`,
          kind: "api",
          sourceRef,
          compatibilityConfig: {
            schema: "db-migration-compatibility-config/v1",
            featureFlags: [],
            serializerModes: [],
            activeRoles: ["db-reader", "db-writer"],
          },
        }
      : {
          id: `${environment}-${release}-api`,
          kind: "api",
          sourceRef,
          compatibilityConfigSha256: "6".repeat(64),
          roles: ["db-reader", "db-writer"],
        };
  return {
    schema,
    runtimeSets: [
      { id: `${environment}-previous`, release: "previous", units: [runtimeUnit("previous")] },
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
            newRuntimeStateEvidence: "new runtime state verified",
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
            newRuntimeStateEvidence: "new runtime state verified",
          },
        ],
      },
    ],
    stateSurfaces: [{ id: "database", kind: "database" }],
    fencedSmoke: { mode: "read-only", procedureRef: "procedure/read-only-smoke" },
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

function planFor(
  environment,
  {
    devPlan = null,
    devExecution = null,
    failedPlan = null,
    failedExecution = null,
    planApiSourceRef = apiSourceRef,
    appliedRefs = [],
    recoveredRefs = [],
    baselineRefs = [],
    supersededRefs = [],
    pendingRefs = [],
    adjudicableLedgerGapRefs = [],
    runtimeContract = null,
    createdAt = "2026-08-04T00:00:00.000Z",
  } = {},
) {
  const plan = {
    schema: "db-migration-maintenance-plan/v4",
    environment,
    createdAt,
    apiSourceRef: planApiSourceRef,
    databaseIdentitySha256: "b".repeat(64),
    catalog: { path: "db/schema/schema-contract.json", sha256: "0".repeat(64) },
    ledgerCompatibility: {
      path: "db/schema/ledger-compatibility.json",
      sha256: "0".repeat(64),
    },
    postconditions: {
      path: "db/schema/migration-postconditions.json",
      sha256: "0".repeat(64),
    },
    appliedRefs,
    recoveredRefs,
    baselineRefs,
    supersededRefs,
    adjudicableLedgerGapRefs,
    pendingRefs,
    devPlan,
    devExecution,
    failedPlan,
    failedExecution,
    runtimeContract:
      runtimeContract ??
      runtimeContractFor(
        environment,
        "db-migration-runtime-contract/v2",
        planApiSourceRef,
      ),
  };
  plan.catalog.sha256 = sha256Hex(catalogFixtureSource(plan));
  plan.ledgerCompatibility.sha256 = sha256Hex(compatibilityFixtureSource(plan));
  plan.postconditions.sha256 = sha256Hex(postconditionsFixtureSource(plan));
  return plan;
}

function postconditionsFixtureSource(plan) {
  return `${JSON.stringify(
    {
      version: 1,
      entries: primaryPlanRefs(plan).map((ref) => ({
        migrationFile: ref.file,
        setup: null,
        check: {
          file: `db/schema/migration-fixtures/${ref.file.split("/").at(-1)}.sql`,
          sha256: ref.kind === "recovery" ? "2".repeat(64) : "1".repeat(64),
        },
        assertions: [
          {
            column: "ok",
            expected:
              plan.createdAt === "2026-08-04T00:00:01.000Z" && ref.kind !== "recovery"
                ? 0
                : 1,
            scopes: ["live"],
          },
        ],
      })),
    },
    null,
    2,
  )}\n`;
}

function primaryPlanRefs(plan) {
  return [
    ...plan.appliedRefs,
    ...plan.recoveredRefs.map((entry) => entry.ref),
    ...plan.baselineRefs,
    ...plan.supersededRefs.map((entry) => entry.ref),
    ...plan.pendingRefs,
  ].filter((ref) => typeof ref?.file === "string").sort((left, right) =>
    left.file.localeCompare(right.file, undefined, { numeric: true }),
  );
}

function catalogFixtureSource(plan) {
  const baselineFiles = new Set(plan.baselineRefs.map((ref) => ref.file));
  const recoveredTargets = new Map(
    plan.recoveredRefs.map((entry) => [entry.recoveryRef.file, entry.ref.file]),
  );
  const pendingRecoveryTarget = plan.pendingRefs.find((ref) => ref.kind !== "recovery")?.file;
  return `${JSON.stringify(
    {
      version: 1,
      migrations: primaryPlanRefs(plan).map((ref) => ({
        ...ref,
        schemaEffect: ref.kind === "schema",
        includedInBaseline: baselineFiles.has(ref.file),
        replayInSchemaCheck: !baselineFiles.has(ref.file),
        ...(ref.kind === "recovery"
          ? { recoveryFor: recoveredTargets.get(ref.file) ?? pendingRecoveryTarget }
          : {}),
      })),
    },
    null,
    2,
  )}\n`;
}

function compatibilityFixtureSource(plan) {
  return `${JSON.stringify(
    {
      schema: "db-migration-ledger-compatibility/v1",
      supersededMigrations: plan.supersededRefs.map((entry) => ({
        environment: plan.environment,
        migrationFile: entry.ref.file,
        supersededBy: entry.supersedingRef.file,
      })),
      adjudicableLedgerGaps: plan.adjudicableLedgerGapRefs.map((entry) => ({
        environment: plan.environment,
        migrationFile: entry.ref.file,
        evidenceMigrationFile: entry.evidenceRef.file,
      })),
    },
    null,
    2,
  )}\n`;
}

function synchronizePlanInputArtifacts(files) {
  for (const artifactPath of [...files.keys()]) {
    if (artifactPath.startsWith(`${artifactRoot}/inputs/`)) {
      Map.prototype.delete.call(files, artifactPath);
    }
  }
  for (const [planPath, source] of [...files.entries()]) {
    if (!planPath.endsWith("/plan.json")) {
      continue;
    }
    let plan;
    try {
      plan = JSON.parse(source);
    } catch {
      continue;
    }
    const inputs = [
      [plan.catalog, catalogFixtureSource(plan)],
      [plan.ledgerCompatibility, compatibilityFixtureSource(plan)],
      ...(plan.schema === "db-migration-maintenance-plan/v4"
        ? [[plan.postconditions, postconditionsFixtureSource(plan)]]
        : []),
    ];
    for (const [reference, inputSource] of inputs) {
      if (reference?.sha256 && reference?.path) {
        Map.prototype.set.call(
          files,
          `${artifactRoot}/inputs/${reference.sha256}/${reference.path.split("/").at(-1)}`,
          inputSource,
        );
      }
    }
  }
}

function v4Plan(plan) {
  return {
    ...plan,
    schema: "db-migration-maintenance-plan/v4",
    postconditions: {
      path: "db/schema/migration-postconditions.json",
      sha256: sha256Hex(postconditionsFixtureSource(plan)),
    },
    runtimeContract: runtimeContractFor(plan.environment, "db-migration-runtime-contract/v2"),
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
    runtimeContract = runtimeContractFor(environment, "db-migration-runtime-contract/v2"),
  } = {},
) {
  const catalogSha256 = plansBySha256.get(planSha256)?.catalog?.sha256 ?? "c".repeat(64);
  const ledgerCount = plansBySha256.has(planSha256)
    ? primaryPlanRefs(plansBySha256.get(planSha256)).length
    : 0;
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
    (mixture) => mixture.schemaState === "plan-final" && mixture.runtimeSetId === finalRuntimeSet.id,
  );
  const startMixture = {
    mixtureId: startDeclaration.id,
    runtimeSet: startRuntimeSet,
    schemaState: "plan-start",
    schemaFingerprintSha256: startDeclaration.schemaFingerprintSha256,
  };
  const finalMixture = {
    mixtureId: finalDeclaration.id,
    runtimeSet: finalRuntimeSet,
    schemaState: "plan-final",
    schemaFingerprintSha256: finalDeclaration.schemaFingerprintSha256,
  };
  const completedEventData = [
    {
      type: "phase-fenced",
      data: {
        tlsCipher: "TLS_AES_256_GCM_SHA384",
        writerInventorySha256: "9".repeat(64),
        writers: closedWriterInventory(startRuntimeSet),
        backup: { ref: "backup/dev/example", sha256: "a".repeat(64) },
        sessions: 0,
        transactions: 0,
        mixture: startMixture,
      },
    },
    ...migrationEventData,
    {
      type: "database-completed",
      data: { catalogSha256, ledgerCount },
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
        runningUnits: [
          {
            runtimeUnitId: finalRuntimeSet.units[0].id,
            kind: finalRuntimeSet.units[0].kind,
            sourceRef: finalRuntimeSet.units[0].sourceRef,
            compatibilityConfigSha256: runtimeUnitCompatibilitySha256(
              finalRuntimeSet.units[0],
            ),
            observationEvidence: "runtime source and config observed",
          },
        ],
        runtimeContractSha256: sha256Hex(
          `${JSON.stringify(runtimeContract, null, 2)}\n`,
        ),
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

function runtimeUnitCompatibilitySha256(unit) {
  if (!Object.hasOwn(unit, "compatibilityConfig")) {
    return unit.compatibilityConfigSha256;
  }
  const config = unit.compatibilityConfig;
  const normalized = {
    schema: "db-migration-compatibility-config/v1",
    featureFlags: config.featureFlags
      .map(({ name, value }) => ({ name, value }))
      .sort((left, right) =>
        left.name < right.name ? -1 : left.name > right.name ? 1 : 0,
      ),
    serializerModes: config.serializerModes
      .map(({ name, value }) => ({ name, value }))
      .sort((left, right) =>
        left.name < right.name ? -1 : left.name > right.name ? 1 : 0,
      ),
    activeRoles: compatibilityRoles.filter((role) => config.activeRoles.includes(role)),
  };
  return sha256Hex(`${JSON.stringify(normalized, null, 2)}\n`);
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
  additionalFailedPendingRefs = [],
  additionalCurrentPendingRefs = [],
  mismatchedRecoveryTarget = false,
  weakenRecoveryPostcondition = false,
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
    const causalFailureRef = mismatchedRecoveryTarget
      ? {
          file: "db/migrations/100b_other_example.sql",
          kind: "data",
          sha256: "8".repeat(64),
        }
      : failedTargetRef;
    const failedPlanSource = `${JSON.stringify(
      planFor(failedEnvironment, {
        planApiSourceRef: "f".repeat(40),
        pendingRefs: [
          failedTargetRef,
          ...(mismatchedRecoveryTarget ? [causalFailureRef] : []),
          ...additionalFailedPendingRefs,
        ],
      }),
      null,
      2,
    )}\n`;
    failedPlanRef = artifactRef(".runtime/db-migrations/v9.9.0/dev/failed-plan.json", failedPlanSource);
    const failedHistoryRoot = `${artifactRoot}/${failedEnvironment}/history/${failedPlanRef.sha256}`;
    const failedPlanPath = `${failedHistoryRoot}/plan.json`;
    files.set(failedPlanPath, failedPlanSource);
    const failedExecutionSource = executionFor(failedEnvironment, failedPlanRef.sha256, {
      runtimeContract: JSON.parse(failedPlanSource).runtimeContract,
      completed: false,
      failedRef: causalFailureRef,
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
  const normalReleaseRef = {
    file: "db/migrations/100_example.sql",
    kind: "schema",
    sha256: "4".repeat(64),
  };
  const devPendingRefs =
    (withRecoveryHistory && bindRecoveryPending) || forceRecoveryPending
      ? [
          ...(withRecoveryHistory && failedTargetRef ? [failedTargetRef] : []),
          ...(mismatchedRecoveryTarget
            ? [
                {
                  file: "db/migrations/100b_other_example.sql",
                  kind: "data",
                  sha256: "8".repeat(64),
                },
              ]
            : []),
          ...additionalFailedPendingRefs,
          ...additionalCurrentPendingRefs,
          invalidRecoveryPending ? { kind: "recovery" } : recoveryRef,
        ]
      : [normalReleaseRef];
  const devPlanSource = `${JSON.stringify(
    planFor("dev", {
      failedPlan: failedPlanRef,
      failedExecution: failedExecutionRef,
      planApiSourceRef: devApiSourceRef,
      pendingRefs: devPendingRefs,
      createdAt: weakenRecoveryPostcondition
        ? "2026-08-04T00:00:01.000Z"
        : "2026-08-04T00:00:00.000Z",
    }),
    null,
    2,
  )}\n`;
  const devPlanPath = `${artifactRoot}/dev/plan.json`;
  const devPlanRef = artifactRef(devPlanPath, devPlanSource);
  const parsedDevPlan = JSON.parse(devPlanSource);
  const devRuntimeContract = parsedDevPlan.runtimeContract;
  const devRecoveryRef = parsedDevPlan.pendingRefs.find((ref) => ref.kind === "recovery");
  const devRecoveryTarget = parsedDevPlan.pendingRefs.find((ref) => ref.kind !== "recovery");
  files.set(devPlanPath, devPlanSource);
  const devExecutionSource = executionFor("dev", devPlanRef.sha256, {
    migrationEventData:
      withRecoveryHistory && bindRecoveryPending && failedTargetRef && !invalidRecoveryPending
        ? successfulMigrationEvents(recoveryRef, failedTargetRef)
        : successfulMigrationEvents(normalReleaseRef),
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
        : devRecoveryRef
          ? []
          : parsedDevPlan.pendingRefs,
      appliedRefs:
        prodFailedAliasesDev || !devRecoveryRef
          ? []
          : primaryPlanRefs(parsedDevPlan).filter(
              (ref) => ref.file === devRecoveryRef.file,
            ),
      recoveredRefs:
        prodFailedAliasesDev || !devRecoveryRef || !devRecoveryTarget
          ? []
          : [{ ref: devRecoveryTarget, recoveryRef: devRecoveryRef }],
      runtimeContract: devRuntimeContract,
    }),
    null,
    2,
  )}\n`;
  const prodPlanPath = `${artifactRoot}/prod/plan.json`;
  const prodPlanRef = artifactRef(prodPlanPath, prodPlanSource);
  files.set(prodPlanPath, prodPlanSource);
  const prodExecutionSource = executionFor("prod", prodPlanRef.sha256, {
    runtimeContract: devRuntimeContract,
    migrationEventData: devRecoveryRef ? [] : successfulMigrationEvents(normalReleaseRef),
  });
  const prodExecutionPath = `${artifactRoot}/prod/execution.jsonl`;
  const prodExecutionRef = artifactRef(prodExecutionPath, prodExecutionSource);
  if (withProdExecution) {
    files.set(prodExecutionPath, prodExecutionSource);
  }

  const readArtifact = (artifactPath) => {
    synchronizePlanInputArtifacts(files);
    return files.get(artifactPath) ?? null;
  };
  readArtifact.readApiArtifact = (sourceRef, inputPath) => {
    for (const [planPath, source] of files) {
      if (!planPath.endsWith("/plan.json")) {
        continue;
      }
      let plan;
      try {
        plan = JSON.parse(source);
      } catch {
        continue;
      }
      if (plan.apiSourceRef !== sourceRef) {
        continue;
      }
      if (plan.catalog?.path === inputPath) {
        return catalogFixtureSource(plan);
      }
      if (plan.ledgerCompatibility?.path === inputPath) {
        return compatibilityFixtureSource(plan);
      }
      if (plan.postconditions?.path === inputPath) {
        return postconditionsFixtureSource(plan);
      }
    }
    return null;
  };

  return {
    files,
    devPlanRef,
    devExecutionRef,
    prodPlanRef,
    prodExecutionRef,
    readArtifact,
    listArtifacts: (prefix) => {
      synchronizePlanInputArtifacts(files);
      return [...files.keys()].filter((artifactPath) => artifactPath.startsWith(prefix));
    },
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

  it("accepts v4 plans only when the postcondition source is bound", () => {
    const archive = canonicalArchive({ withProdExecution: false });
    archive.files.delete(`${artifactRoot}/dev/execution.jsonl`);
    archive.files.delete(`${artifactRoot}/prod/plan.json`);
    const planPath = `${artifactRoot}/dev/plan.json`;
    const plan = v4Plan(JSON.parse(archive.files.get(planPath)));
    const source = `${JSON.stringify(plan, null, 2)}\n`;
    const planRef = artifactRef(planPath, source);
    archive.files.set(planPath, source);

    assert.deepEqual(
      validateMaintenanceDbMigrationEvidence({
        evidence: canonicalEvidence(planRef),
        version,
        apiSourceRef,
        scopeStatus: "pending",
        readArtifact: archive.readArtifact,
        listArtifacts: archive.listArtifacts,
        context: "db migration evidence",
      }),
      [],
    );

    const unusedLegacySetPlan = structuredClone(plan);
    unusedLegacySetPlan.runtimeContract.runtimeSets.push({
      id: "unused-mixed",
      release: "mixed",
      units: [
        {
          id: "unused-api",
          kind: "api",
          sourceRef: apiSourceRef,
          compatibilityConfigSha256: "6".repeat(64),
          roles: ["db-reader"],
        },
      ],
    });
    const unusedLegacySetSource = `${JSON.stringify(unusedLegacySetPlan, null, 2)}\n`;
    archive.files.set(planPath, unusedLegacySetSource);
    const unusedLegacySetErrors = validateMaintenanceDbMigrationEvidence({
      evidence: canonicalEvidence(artifactRef(planPath, unusedLegacySetSource)),
      version,
      apiSourceRef,
      scopeStatus: "pending",
      readArtifact: archive.readArtifact,
      listArtifacts: archive.listArtifacts,
      context: "db migration evidence",
    });
    assert.ok(unusedLegacySetErrors.some((error) => error.includes("complete db-migration")));

    const emptyProofPlan = structuredClone(plan);
    emptyProofPlan.runtimeContract.changedBoundaries = [];
    emptyProofPlan.runtimeContract.mixtures.forEach((mixture) => {
      mixture.boundaryResults = [];
    });
    emptyProofPlan.runtimeContract.stateSurfaces = [];
    emptyProofPlan.runtimeContract.recoveryStrategies = [];
    const emptyProofSource = `${JSON.stringify(emptyProofPlan, null, 2)}\n`;
    archive.files.set(planPath, emptyProofSource);
    const emptyProofErrors = validateMaintenanceDbMigrationEvidence({
      evidence: canonicalEvidence(artifactRef(planPath, emptyProofSource)),
      version,
      apiSourceRef,
      scopeStatus: "pending",
      readArtifact: archive.readArtifact,
      listArtifacts: archive.listArtifacts,
      context: "db migration evidence",
    });
    assert.ok(emptyProofErrors.some((error) => error.includes("complete db-migration")));

    const numericIdPlan = structuredClone(plan);
    numericIdPlan.runtimeContract.stateSurfaces[0].id = 1;
    const numericIdSource = `${JSON.stringify(numericIdPlan, null, 2)}\n`;
    archive.files.set(planPath, numericIdSource);
    const numericIdErrors = validateMaintenanceDbMigrationEvidence({
      evidence: canonicalEvidence(artifactRef(planPath, numericIdSource)),
      version,
      apiSourceRef,
      scopeStatus: "pending",
      readArtifact: archive.readArtifact,
      listArtifacts: archive.listArtifacts,
      context: "db migration evidence",
    });
    assert.ok(numericIdErrors.some((error) => error.includes("complete db-migration")));

    const mixedPlan = structuredClone(plan);
    mixedPlan.schema = "db-migration-maintenance-plan/v3";
    delete mixedPlan.postconditions;
    const mixedSource = `${JSON.stringify(mixedPlan, null, 2)}\n`;
    archive.files.set(planPath, mixedSource);
    const mixedErrors = validateMaintenanceDbMigrationEvidence({
      evidence: canonicalEvidence(artifactRef(planPath, mixedSource)),
      version,
      apiSourceRef,
      scopeStatus: "pending",
      readArtifact: archive.readArtifact,
      listArtifacts: archive.listArtifacts,
      context: "db migration evidence",
    });
    assert.ok(
      mixedErrors.some((error) =>
        error.includes("schema must be db-migration-maintenance-plan/v4"),
      ),
    );

    delete plan.postconditions;
    const unboundSource = `${JSON.stringify(plan, null, 2)}\n`;
    archive.files.set(planPath, unboundSource);
    const errors = validateMaintenanceDbMigrationEvidence({
      evidence: canonicalEvidence(artifactRef(planPath, unboundSource)),
      version,
      apiSourceRef,
      scopeStatus: "pending",
      readArtifact: archive.readArtifact,
      listArtifacts: archive.listArtifacts,
      context: "db migration evidence",
    });
    assert.ok(errors.some((error) => error.includes("postconditions")));
  });

  it("binds the next-final API runtime and sealed inputs to the API commit", () => {
    const archive = canonicalArchive({ withProdExecution: false });
    archive.files.delete(`${artifactRoot}/dev/execution.jsonl`);
    archive.files.delete(`${artifactRoot}/prod/plan.json`);
    const planPath = `${artifactRoot}/dev/plan.json`;
    const originalPlan = JSON.parse(archive.files.get(planPath));
    const trustedInputs = new Map([
      [originalPlan.catalog.path, catalogFixtureSource(originalPlan)],
      [originalPlan.ledgerCompatibility.path, compatibilityFixtureSource(originalPlan)],
      [originalPlan.postconditions.path, postconditionsFixtureSource(originalPlan)],
    ]);

    const runtimeDrift = structuredClone(originalPlan);
    runtimeDrift.runtimeContract.runtimeSets
      .find((runtimeSet) => runtimeSet.release === "next")
      .units.find((unit) => unit.kind === "api").sourceRef = "f".repeat(40);
    let source = `${JSON.stringify(runtimeDrift, null, 2)}\n`;
    archive.files.set(planPath, source);
    let errors = validateMaintenanceDbMigrationEvidence({
      evidence: canonicalEvidence(artifactRef(planPath, source)),
      version,
      apiSourceRef,
      scopeStatus: "pending",
      readArtifact: archive.readArtifact,
      listArtifacts: archive.listArtifacts,
      context: "db migration evidence",
    });
    assert(errors.some((error) => error.includes("must include apiSourceRef")));

    const forgedRef = {
      file: "db/migrations/100_forged.sql",
      kind: "data",
      sha256: "8".repeat(64),
    };
    const forgedPlan = planFor("dev", { appliedRefs: [forgedRef] });
    source = `${JSON.stringify(forgedPlan, null, 2)}\n`;
    archive.files.set(planPath, source);
    archive.readArtifact.readApiArtifact = (_sourceRef, inputPath) =>
      trustedInputs.get(inputPath) ?? null;
    errors = validateMaintenanceDbMigrationEvidence({
      evidence: canonicalEvidence(artifactRef(planPath, source)),
      version,
      apiSourceRef,
      scopeStatus: "pending",
      readArtifact: archive.readArtifact,
      listArtifacts: archive.listArtifacts,
      context: "db migration evidence",
    });
    assert(errors.some((error) => error.includes("match the trusted API source bytes")));
  });

  it("fails closed when canonical provenance is required without a resolver", () => {
    const archive = canonicalArchive({ withProdExecution: false });
    archive.files.delete(`${artifactRoot}/dev/execution.jsonl`);
    archive.files.delete(`${artifactRoot}/prod/plan.json`);
    archive.readArtifact.readApiArtifact = undefined;
    const errors = validateMaintenanceDbMigrationEvidence({
      evidence: canonicalEvidence(archive.devPlanRef),
      version,
      apiSourceRef,
      scopeStatus: "pending",
      readArtifact: archive.readArtifact,
      requireTrustedApiSource: true,
      listArtifacts: archive.listArtifacts,
      context: "db migration evidence",
    });
    assert(errors.some((error) => error.includes("requires trusted API source verification")));
  });

  it("binds completion counts and migration postcondition evidence to sealed inputs", () => {
    const pendingRef = {
      file: "db/migrations/100_example.sql",
      kind: "data",
      sha256: "4".repeat(64),
    };
    const archive = canonicalArchive({ withProdExecution: false });
    archive.files.delete(`${artifactRoot}/prod/plan.json`);
    const planPath = `${artifactRoot}/dev/plan.json`;
    const planSource = `${JSON.stringify(planFor("dev", { pendingRefs: [pendingRef] }), null, 2)}\n`;
    const planRef = artifactRef(planPath, planSource);
    archive.files.set(planPath, planSource);
    const events = executionFor("dev", planRef.sha256, {
      migrationEventData: successfulMigrationEvents(pendingRef),
    }).trimEnd().split("\n").map((line) => JSON.parse(line));
    events.find((event) => event.type === "migration-sql-succeeded")
      .data.postconditionSha256 = "f".repeat(64);
    events.find((event) => event.type === "database-completed").data.ledgerCount = 2;
    const executionSource = `${events.map((event) => JSON.stringify(event)).join("\n")}\n`;
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
    assert(errors.some((error) => error.includes("postcondition evidence must match")));
    assert(errors.some((error) => error.includes("ledger count must match")));
  });

  it("fails closed instead of throwing on malformed execution rows", () => {
    const archive = canonicalArchive({ withProdExecution: false });
    archive.files.delete(`${artifactRoot}/prod/plan.json`);
    const executionPath = `${artifactRoot}/dev/execution.jsonl`;
    archive.files.set(executionPath, "null\n");
    assert.doesNotThrow(() => {
      const errors = validateMaintenanceDbMigrationEvidence({
        evidence: canonicalEvidence(archive.devPlanRef, artifactRef(executionPath, "null\n")),
        version,
        apiSourceRef,
        scopeStatus: "pending",
        readArtifact: archive.readArtifact,
        listArtifacts: archive.listArtifacts,
        context: "db migration evidence",
      });
      assert(errors.length > 0);
    });
  });

  it("requires a sealed live postcondition for every pending migration", () => {
    const pendingRef = {
      file: "db/migrations/100_missing_postcondition.sql",
      kind: "data",
      sha256: "7".repeat(64),
    };
    const archive = canonicalArchive({ withProdExecution: false });
    archive.files.delete(`${artifactRoot}/dev/execution.jsonl`);
    archive.files.delete(`${artifactRoot}/prod/plan.json`);
    const emptyManifest = `${JSON.stringify({ version: 1, entries: [] }, null, 2)}\n`;
    const plan = planFor("dev", { pendingRefs: [pendingRef] });
    plan.postconditions.sha256 = sha256Hex(emptyManifest);
    const planPath = `${artifactRoot}/dev/plan.json`;
    const planSource = `${JSON.stringify(plan, null, 2)}\n`;
    archive.files.set(planPath, planSource);
    archive.readArtifact(planPath);
    const inputPath =
      `${artifactRoot}/inputs/${plan.postconditions.sha256}/` +
      "migration-postconditions.json";
    archive.files.set(inputPath, emptyManifest);
    const frozenFiles = new Map(archive.files);
    const readArtifact = (artifactPath) => frozenFiles.get(artifactPath) ?? null;
    const errors = validateMaintenanceDbMigrationEvidence({
      evidence: canonicalEvidence(artifactRef(planPath, planSource)),
      version,
      apiSourceRef,
      scopeStatus: "pending",
      readArtifact,
      listArtifacts: (prefix) =>
        [...frozenFiles.keys()].filter((artifactPath) => artifactPath.startsWith(prefix)),
      context: "db migration evidence",
    });
    assert(errors.some((error) => error.includes("requires a sealed live postcondition")));
  });

  it("rejects executor-impossible plan buckets, input paths, and overlaps", () => {
    const archive = canonicalArchive({ withProdExecution: false });
    archive.files.delete(`${artifactRoot}/dev/execution.jsonl`);
    archive.files.delete(`${artifactRoot}/prod/plan.json`);
    const planPath = `${artifactRoot}/dev/plan.json`;
    const plan = JSON.parse(archive.files.get(planPath));
    plan.catalog.path = "arbitrary/catalog.json";
    plan.ledgerCompatibility.path = "arbitrary/compatibility.json";
    plan.appliedRefs = [{}];
    let planSource = `${JSON.stringify(plan, null, 2)}\n`;
    archive.files.set(planPath, planSource);
    let errors = validateMaintenanceDbMigrationEvidence({
      evidence: canonicalEvidence(artifactRef(planPath, planSource)),
      version,
      apiSourceRef,
      scopeStatus: "pending",
      readArtifact: archive.readArtifact,
      listArtifacts: archive.listArtifacts,
      context: "db migration evidence",
    });
    assert(errors.some((error) => error.includes("catalog.path must be")));
    assert(errors.some((error) => error.includes("ledgerCompatibility.path must be")));
    assert(errors.some((error) => error.includes("appliedRefs must contain")));

    const duplicateRef = {
      file: "db/migrations/100_duplicate.sql",
      kind: "data",
      sha256: "4".repeat(64),
    };
    plan.catalog.path = "db/schema/schema-contract.json";
    plan.ledgerCompatibility.path = "db/schema/ledger-compatibility.json";
    plan.appliedRefs = [duplicateRef];
    plan.pendingRefs = [duplicateRef];
    planSource = `${JSON.stringify(plan, null, 2)}\n`;
    archive.files.set(planPath, planSource);
    errors = validateMaintenanceDbMigrationEvidence({
      evidence: canonicalEvidence(artifactRef(planPath, planSource)),
      version,
      apiSourceRef,
      scopeStatus: "pending",
      readArtifact: archive.readArtifact,
      listArtifacts: archive.listArtifacts,
      context: "db migration evidence",
    });
    assert(errors.some((error) => error.includes("resolution groups must be disjoint")));
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
          appliedRefs: [evidenceRef],
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
          appliedRefs: [evidenceRef],
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

  it("rejects a prod plan that launders a dev-owned migration as pre-applied", () => {
    const archive = canonicalArchive({ withProdExecution: false });
    const planPath = `${artifactRoot}/prod/plan.json`;
    const plan = JSON.parse(archive.files.get(planPath));
    plan.appliedRefs = [...plan.appliedRefs, ...plan.pendingRefs];
    plan.pendingRefs = [];
    plan.catalog.sha256 = sha256Hex(catalogFixtureSource(plan));
    plan.ledgerCompatibility.sha256 = sha256Hex(compatibilityFixtureSource(plan));
    plan.postconditions.sha256 = sha256Hex(postconditionsFixtureSource(plan));
    const source = `${JSON.stringify(plan, null, 2)}\n`;
    const planRef = artifactRef(planPath, source);
    archive.files.set(planPath, source);

    const errors = validateMaintenanceDbMigrationEvidence({
      evidence: canonicalEvidence(planRef),
      version,
      apiSourceRef,
      scopeStatus: "in_progress",
      readArtifact: archive.readArtifact,
      listArtifacts: archive.listArtifacts,
      context: "db migration evidence",
    });
    assert(
      errors.some((error) =>
        error.includes("prod pending refs must exactly match migrations owned by the immutable dev graph"),
      ),
    );
  });

  it("rejects a prod plan that pre-applies a dev-owned recovery pair", () => {
    const archive = canonicalArchive({
      withProdExecution: false,
      withRecoveryHistory: true,
    });

    const errors = validateMaintenanceDbMigrationEvidence({
      evidence: canonicalEvidence(archive.prodPlanRef),
      version,
      apiSourceRef,
      scopeStatus: "in_progress",
      readArtifact: archive.readArtifact,
      listArtifacts: archive.listArtifacts,
      context: "db migration evidence",
    });

    assert(
      errors.some((error) =>
        error.includes("a dev graph that required append-only recovery cannot be promoted to prod"),
      ),
    );
  });

  it("rejects a prod migration that was pre-applied only in dev", () => {
    const archive = canonicalArchive({ withProdExecution: false });
    const devPlanPath = `${artifactRoot}/dev/plan.json`;
    const devExecutionPath = `${artifactRoot}/dev/execution.jsonl`;
    const prodPlanPath = `${artifactRoot}/prod/plan.json`;
    const preAppliedRef = {
      file: "db/migrations/99_pre_applied.sql",
      kind: "data",
      sha256: "3".repeat(64),
    };
    const devPlan = JSON.parse(archive.files.get(devPlanPath));
    const releaseRef = devPlan.pendingRefs[0];
    devPlan.appliedRefs = [preAppliedRef];
    devPlan.catalog.sha256 = sha256Hex(catalogFixtureSource(devPlan));
    devPlan.ledgerCompatibility.sha256 = sha256Hex(compatibilityFixtureSource(devPlan));
    devPlan.postconditions.sha256 = sha256Hex(postconditionsFixtureSource(devPlan));
    const devPlanSource = `${JSON.stringify(devPlan, null, 2)}\n`;
    const devPlanRef = artifactRef(devPlanPath, devPlanSource);
    archive.files.set(devPlanPath, devPlanSource);
    const devExecutionSource = executionFor("dev", devPlanRef.sha256, {
      runtimeContract: devPlan.runtimeContract,
      migrationEventData: successfulMigrationEvents(releaseRef),
    });
    const devExecutionRef = artifactRef(devExecutionPath, devExecutionSource);
    archive.files.set(devExecutionPath, devExecutionSource);

    const prodPlan = JSON.parse(archive.files.get(prodPlanPath));
    prodPlan.catalog = devPlan.catalog;
    prodPlan.ledgerCompatibility = devPlan.ledgerCompatibility;
    prodPlan.postconditions = devPlan.postconditions;
    prodPlan.devPlan.sha256 = devPlanRef.sha256;
    prodPlan.devExecution.sha256 = devExecutionRef.sha256;
    prodPlan.pendingRefs = [preAppliedRef, releaseRef];
    const prodPlanSource = `${JSON.stringify(prodPlan, null, 2)}\n`;
    const prodPlanRef = artifactRef(prodPlanPath, prodPlanSource);
    archive.files.set(prodPlanPath, prodPlanSource);

    const errors = validateMaintenanceDbMigrationEvidence({
      evidence: canonicalEvidence(prodPlanRef),
      version,
      apiSourceRef,
      scopeStatus: "in_progress",
      readArtifact: archive.readArtifact,
      listArtifacts: archive.listArtifacts,
      context: "db migration evidence",
    });

    assert(
      errors.some((error) =>
        error.includes("prod pending refs must exactly match migrations owned by the immutable dev graph"),
      ),
    );
  });

  it("rejects a prod plan that crosses plan generations", () => {
    const archive = canonicalArchive({ withProdExecution: false });
    const planPath = `${artifactRoot}/prod/plan.json`;
    const plan = v4Plan(JSON.parse(archive.files.get(planPath)));
    const source = `${JSON.stringify(plan, null, 2)}\n`;
    const planRef = artifactRef(planPath, source);
    archive.files.set(planPath, source);

    const errors = validateMaintenanceDbMigrationEvidence({
      evidence: canonicalEvidence(planRef),
      version,
      apiSourceRef,
      scopeStatus: "in_progress",
      readArtifact: archive.readArtifact,
      listArtifacts: archive.listArtifacts,
      context: "db migration evidence",
    });

    assert.ok(errors.some((error) => error.includes("dev pair must match the prod plan generation")));
  });

  it("requires v4 prod and dev plans to bind identical postconditions", () => {
    const archive = canonicalArchive({ withProdExecution: false });
    const devPlanPath = `${artifactRoot}/dev/plan.json`;
    const devPlan = v4Plan(JSON.parse(archive.files.get(devPlanPath)));
    for (const runtimeSet of devPlan.runtimeContract.runtimeSets) {
      for (const unit of runtimeSet.units) {
        unit.compatibilityConfig.featureFlags = [
          { value: true, name: "writer-v2" },
          { value: false, name: "reader-v2" },
        ];
        unit.compatibilityConfig.serializerModes = [
          { value: "v2", name: "writer" },
          { value: "v1", name: "reader" },
        ];
        unit.compatibilityConfig.activeRoles = ["db-writer", "db-reader"];
        assert.notEqual(
          runtimeUnitCompatibilitySha256(unit),
          sha256Hex(`${JSON.stringify(unit.compatibilityConfig, null, 2)}\n`),
        );
      }
    }
    const devPlanSource = `${JSON.stringify(devPlan, null, 2)}\n`;
    const devPlanRef = artifactRef(devPlanPath, devPlanSource);
    archive.files.set(devPlanPath, devPlanSource);

    const devExecutionPath = `${artifactRoot}/dev/execution.jsonl`;
    const devExecutionSource = executionFor("dev", devPlanRef.sha256, {
      runtimeContract: devPlan.runtimeContract,
      migrationEventData: successfulMigrationEvents(devPlan.pendingRefs[0]),
    });
    const devExecutionRef = artifactRef(devExecutionPath, devExecutionSource);
    archive.files.set(devExecutionPath, devExecutionSource);

    const prodPlanPath = `${artifactRoot}/prod/plan.json`;
    const prodPlan = v4Plan(JSON.parse(archive.files.get(prodPlanPath)));
    prodPlan.runtimeContract = devPlan.runtimeContract;
    prodPlan.devPlan.sha256 = devPlanRef.sha256;
    prodPlan.devExecution.sha256 = devExecutionRef.sha256;
    let prodPlanSource = `${JSON.stringify(prodPlan, null, 2)}\n`;
    let prodPlanRef = artifactRef(prodPlanPath, prodPlanSource);
    archive.files.set(prodPlanPath, prodPlanSource);

    const validate = () =>
      validateMaintenanceDbMigrationEvidence({
        evidence: canonicalEvidence(prodPlanRef),
        version,
        apiSourceRef,
        scopeStatus: "in_progress",
        readArtifact: archive.readArtifact,
        listArtifacts: archive.listArtifacts,
        context: "db migration evidence",
      });

    assert.deepEqual(validate(), []);

    const inventoryDriftEvents = devExecutionSource
      .trimEnd()
      .split("\n")
      .map((line) => JSON.parse(line));
    inventoryDriftEvents[0].data.writers[0].compatibilityConfigSha256 = "0".repeat(64);
    const inventoryDriftSource = `${inventoryDriftEvents.map((event) => JSON.stringify(event)).join("\n")}\n`;
    archive.files.set(devExecutionPath, inventoryDriftSource);
    prodPlan.devExecution.sha256 = artifactRef(devExecutionPath, inventoryDriftSource).sha256;
    prodPlanSource = `${JSON.stringify(prodPlan, null, 2)}\n`;
    prodPlanRef = artifactRef(prodPlanPath, prodPlanSource);
    archive.files.set(prodPlanPath, prodPlanSource);
    assert.ok(
      validate().some((error) =>
        error.includes("runtime inventories must match their exact runtime sets"),
      ),
    );

    const runningInventoryDriftEvents = devExecutionSource
      .trimEnd()
      .split("\n")
      .map((line) => JSON.parse(line));
    const serviceCompleted = runningInventoryDriftEvents.find(
      (event) => event.type === "service-completed",
    );
    serviceCompleted.data.runningUnits[0].compatibilityConfigSha256 = "0".repeat(64);
    const runningInventoryDriftSource = `${runningInventoryDriftEvents.map((event) => JSON.stringify(event)).join("\n")}\n`;
    archive.files.set(devExecutionPath, runningInventoryDriftSource);
    prodPlan.devExecution.sha256 = artifactRef(
      devExecutionPath,
      runningInventoryDriftSource,
    ).sha256;
    prodPlanSource = `${JSON.stringify(prodPlan, null, 2)}\n`;
    prodPlanRef = artifactRef(prodPlanPath, prodPlanSource);
    archive.files.set(prodPlanPath, prodPlanSource);
    assert.ok(
      validate().some((error) =>
        error.includes("runtime inventories must match their exact runtime sets"),
      ),
    );

    const driftedEvents = devExecutionSource
      .trimEnd()
      .split("\n")
      .map((line) => JSON.parse(line));
    driftedEvents[0].data.mixture.runtimeSet.units[0].sourceRef = "f".repeat(40);
    const driftedExecutionSource = `${driftedEvents.map((event) => JSON.stringify(event)).join("\n")}\n`;
    archive.files.set(devExecutionPath, driftedExecutionSource);
    prodPlan.devExecution.sha256 = artifactRef(
      devExecutionPath,
      driftedExecutionSource,
    ).sha256;
    prodPlanSource = `${JSON.stringify(prodPlan, null, 2)}\n`;
    prodPlanRef = artifactRef(prodPlanPath, prodPlanSource);
    archive.files.set(prodPlanPath, prodPlanSource);
    assert.ok(
      validate().some((error) =>
        error.includes("runtime mixtures must match the exact plan declarations"),
      ),
    );

    const legacyExecutionSource = executionFor("dev", devPlanRef.sha256, {
      runtimeContract: runtimeContractFor("dev", "db-migration-runtime-contract/v1"),
    });
    archive.files.set(devExecutionPath, legacyExecutionSource);
    prodPlan.devExecution.sha256 = artifactRef(
      devExecutionPath,
      legacyExecutionSource,
    ).sha256;
    prodPlanSource = `${JSON.stringify(prodPlan, null, 2)}\n`;
    prodPlanRef = artifactRef(prodPlanPath, prodPlanSource);
    archive.files.set(prodPlanPath, prodPlanSource);
    assert.ok(
      validate().some((error) =>
        error.includes("runtime units must match the plan runtime contract generation"),
      ),
    );

    archive.files.set(devExecutionPath, devExecutionSource);
    prodPlan.devExecution.sha256 = devExecutionRef.sha256;
    prodPlan.postconditions.sha256 = "f".repeat(64);
    prodPlanSource = `${JSON.stringify(prodPlan, null, 2)}\n`;
    prodPlanRef = artifactRef(prodPlanPath, prodPlanSource);
    archive.files.set(prodPlanPath, prodPlanSource);
    assert.ok(
      validate().some((error) =>
        /dev pair must match the prod plan generation|postconditions sealed input/.test(error),
      ),
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
    archive.files.delete(archive.prodPlanRef.path);
    archive.files.delete(archive.prodExecutionRef.path);
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

  it("binds recovery to the failed causal target and one appended catalog ref", () => {
    const mismatchedTarget = canonicalArchive({
      withRecoveryHistory: true,
      mismatchedRecoveryTarget: true,
    });
    const targetErrors = validateMaintenanceDbMigrationEvidence({
      evidence: canonicalEvidence(
        mismatchedTarget.prodPlanRef,
        mismatchedTarget.prodExecutionRef,
      ),
      version,
      apiSourceRef,
      scopeStatus: "released",
      readArtifact: mismatchedTarget.readArtifact,
      listArtifacts: mismatchedTarget.listArtifacts,
      context: "db migration evidence",
    });
    assert(
      targetErrors.some((error) =>
        error.includes("recovery target must equal the failed history causal target"),
      ),
    );

    const extraRef = {
      file: "db/migrations/100c_unrelated.sql",
      kind: "data",
      sha256: "7".repeat(64),
    };
    const driftedCatalog = canonicalArchive({
      withRecoveryHistory: true,
      additionalCurrentPendingRefs: [extraRef],
    });
    const catalogErrors = validateMaintenanceDbMigrationEvidence({
      evidence: canonicalEvidence(
        driftedCatalog.prodPlanRef,
        driftedCatalog.prodExecutionRef,
      ),
      version,
      apiSourceRef,
      scopeStatus: "released",
      readArtifact: driftedCatalog.readArtifact,
      listArtifacts: driftedCatalog.listArtifacts,
      context: "db migration evidence",
    });
    assert(
      catalogErrors.some((error) =>
        error.includes("failed catalog plus one appended recovery migration"),
      ),
    );
  });

  it("preserves failed postconditions before appending a recovery check", () => {
    const archive = canonicalArchive({
      withRecoveryHistory: true,
      weakenRecoveryPostcondition: true,
    });
    const errors = validateMaintenanceDbMigrationEvidence({
      evidence: canonicalEvidence(archive.devPlanRef, archive.devExecutionRef),
      version,
      apiSourceRef,
      scopeStatus: "pending",
      readArtifact: archive.readArtifact,
      listArtifacts: archive.listArtifacts,
      context: "db migration evidence",
    });
    assert(
      errors.some((error) =>
        error.includes("preserve the failed manifest and append only the recovery entry"),
      ),
    );
  });

  it("binds every recovered pair to the sealed catalog recoveryFor relation", () => {
    const targetA = {
      file: "db/migrations/100_target_a.sql",
      kind: "data",
      sha256: "1".repeat(64),
    };
    const targetB = {
      file: "db/migrations/101_target_b.sql",
      kind: "data",
      sha256: "2".repeat(64),
    };
    const recoveryA = {
      file: "db/migrations/102_recovery_a.sql",
      kind: "recovery",
      sha256: "3".repeat(64),
    };
    const recoveryB = {
      file: "db/migrations/103_recovery_b.sql",
      kind: "recovery",
      sha256: "4".repeat(64),
    };
    const archive = canonicalArchive({ withProdExecution: false });
    archive.files.delete(`${artifactRoot}/dev/execution.jsonl`);
    archive.files.delete(`${artifactRoot}/prod/plan.json`);
    const planPath = `${artifactRoot}/dev/plan.json`;
    const validPlan = planFor("dev", {
      appliedRefs: [recoveryA, recoveryB],
      recoveredRefs: [
        { ref: targetA, recoveryRef: recoveryA },
        { ref: targetB, recoveryRef: recoveryB },
      ],
    });
    const validSource = `${JSON.stringify(validPlan, null, 2)}\n`;
    archive.files.set(planPath, validSource);
    archive.readArtifact(planPath);
    const frozenFiles = new Map(archive.files);
    const swappedPlan = structuredClone(validPlan);
    [swappedPlan.recoveredRefs[0].recoveryRef, swappedPlan.recoveredRefs[1].recoveryRef] = [
      swappedPlan.recoveredRefs[1].recoveryRef,
      swappedPlan.recoveredRefs[0].recoveryRef,
    ];
    const swappedSource = `${JSON.stringify(swappedPlan, null, 2)}\n`;
    frozenFiles.set(planPath, swappedSource);
    const readArtifact = (artifactPath) => frozenFiles.get(artifactPath) ?? null;
    readArtifact.readApiArtifact = (_sourceRef, inputPath) => {
      if (inputPath === validPlan.catalog.path) return catalogFixtureSource(validPlan);
      if (inputPath === validPlan.ledgerCompatibility.path) {
        return compatibilityFixtureSource(validPlan);
      }
      if (inputPath === validPlan.postconditions.path) return postconditionsFixtureSource(validPlan);
      return null;
    };

    const errors = validateMaintenanceDbMigrationEvidence({
      evidence: canonicalEvidence(artifactRef(planPath, swappedSource)),
      version,
      apiSourceRef,
      scopeStatus: "pending",
      readArtifact,
      listArtifacts: (prefix) =>
        [...frozenFiles.keys()].filter((artifactPath) => artifactPath.startsWith(prefix)),
      context: "db migration evidence",
    });
    assert(errors.some((error) => error.includes("secondary migration refs")));
  });

  it("rejects a new v3 plan instead of treating it as grandfathered re-entry", () => {
    const archive = canonicalArchive({ withProdExecution: false });
    const devPlanPath = `${artifactRoot}/dev/plan.json`;
    const devPlan = JSON.parse(archive.files.get(devPlanPath));
    devPlan.schema = "db-migration-maintenance-plan/v3";
    delete devPlan.postconditions;
    devPlan.runtimeContract = runtimeContractFor(
      "dev",
      "db-migration-runtime-contract/v1",
    );
    const devPlanSource = `${JSON.stringify(devPlan, null, 2)}\n`;
    const devPlanRef = artifactRef(devPlanPath, devPlanSource);
    archive.files.set(devPlanPath, devPlanSource);
    archive.files.delete(`${artifactRoot}/dev/execution.jsonl`);
    archive.files.delete(`${artifactRoot}/prod/plan.json`);

    const errors = validateMaintenanceDbMigrationEvidence({
      evidence: canonicalEvidence(devPlanRef),
      version,
      apiSourceRef,
      scopeStatus: "pending",
      readArtifact: archive.readArtifact,
      listArtifacts: archive.listArtifacts,
      context: "db migration evidence",
    });

    assert.ok(
      errors.some((error) =>
        error.includes("schema must be db-migration-maintenance-plan/v4"),
      ),
    );
  });

  it("accepts append-only recovery before later normal pending migrations", () => {
    const laterNormalRef = {
      file: "db/migrations/101_later_normal.sql",
      kind: "data",
      sha256: "8".repeat(64),
    };
    const archive = canonicalArchive({
      withProdExecution: false,
      withRecoveryHistory: true,
      additionalFailedPendingRefs: [laterNormalRef],
    });
    archive.files.delete(`${artifactRoot}/prod/plan.json`);
    const planPath = `${artifactRoot}/dev/plan.json`;
    const plan = JSON.parse(archive.files.get(planPath));
    const [targetRef, , recoveryRef] = plan.pendingRefs;
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
    archive.files.delete(archive.prodPlanRef.path);
    archive.files.delete(archive.prodExecutionRef.path);

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
    const recoveringWriters = closedWriterInventory(finalMixture.runtimeSet);
    const recovering = {
      type: "phase-recovering",
      data: {
        strategy: "lossless-reconciliation",
        startEvidence: "recovery started",
        writerInventorySha256: "9".repeat(64),
        writers: recoveringWriters,
        sessions: 0,
        transactions: 0,
        sourceMixture: finalMixture,
        endWatermarks: [
          { surfaceId: "database", watermark: "recovery watermark", evidence: "observed" },
        ],
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
        startWatermarks: [
          { surfaceId: "database", watermark: "resume watermark 2", evidence: "observed" },
        ],
      },
    };
    const withFence = [baseEvents[0], fenceReverified, ...baseEvents.slice(1)];
    const activeResumeIndex = withFence.findIndex((event) => event.type === "phase-resumed");
    const validEvents = [
      ...withFence.slice(0, activeResumeIndex + 2),
      recovering,
      { type: "lock-released", data: {} },
      recoveryCompleted,
      { type: "lock-released", data: {} },
      secondResume,
      { type: "lock-released", data: {} },
      ...withFence.slice(activeResumeIndex + 2),
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

    for (const lockIndex of validEvents
      .map((event, index) => (event.type === "lock-released" ? index : -1))
      .filter((index) => index >= 0)) {
      const withoutLock = validEvents
        .filter((_event, index) => index !== lockIndex)
        .map((event, index) => ({
          ...event,
          sequence: index + 1,
          at: new Date(Date.UTC(2026, 7, 4, 1, 30, index)).toISOString(),
        }));
      const withoutLockSource = `${withoutLock.map((event) => JSON.stringify(event)).join("\n")}\n`;
      archive.files.set(executionPath, withoutLockSource);
      const errors = validateMaintenanceDbMigrationEvidence({
        evidence: canonicalEvidence(
          archive.devPlanRef,
          artifactRef(executionPath, withoutLockSource),
        ),
        version,
        apiSourceRef,
        scopeStatus: "pending",
        readArtifact: archive.readArtifact,
        listArtifacts: archive.listArtifacts,
        context: "db migration evidence",
      });
      assert(errors.some((error) => /lock release/.test(error)));
    }

    const numericSurfaceEvents = structuredClone(validEvents);
    numericSurfaceEvents.find(
      (event) => event.type === "fenced-smoke-completed",
    ).data.surfaceResiduals[0].surfaceId = 1;
    const numericSurfaceSource = `${numericSurfaceEvents
      .map((event) => JSON.stringify(event))
      .join("\n")}\n`;
    archive.files.set(executionPath, numericSurfaceSource);
    const numericSurfaceErrors = validateMaintenanceDbMigrationEvidence({
      evidence: canonicalEvidence(
        archive.devPlanRef,
        artifactRef(executionPath, numericSurfaceSource),
      ),
      version,
      apiSourceRef,
      scopeStatus: "pending",
      readArtifact: archive.readArtifact,
      listArtifacts: archive.listArtifacts,
      context: "db migration evidence",
    });
    assert(numericSurfaceErrors.some((error) => /plan-final FENCED smoke evidence/.test(error)));

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

  it("requires initial RESUMED to use the next-release final mixture", () => {
    const archive = canonicalArchive({ withProdExecution: false });
    archive.files.delete(`${artifactRoot}/prod/plan.json`);
    const planPath = `${artifactRoot}/dev/plan.json`;
    const plan = JSON.parse(archive.files.get(planPath));
    const previousRuntimeSet = plan.runtimeContract.runtimeSets.find(
      (runtimeSet) => runtimeSet.release === "previous",
    );
    const nextFinal = plan.runtimeContract.mixtures.find(
      (mixture) =>
        mixture.schemaState === "plan-final" &&
        plan.runtimeContract.runtimeSets.some(
          (runtimeSet) =>
            runtimeSet.release === "next" && runtimeSet.id === mixture.runtimeSetId,
        ),
    );
    const previousFinalDeclaration = {
      ...nextFinal,
      id: "dev-previous-final",
      runtimeSetId: previousRuntimeSet.id,
    };
    plan.runtimeContract.mixtures.push(previousFinalDeclaration);
    const planSource = `${JSON.stringify(plan, null, 2)}\n`;
    const planRef = artifactRef(planPath, planSource);
    archive.files.set(planPath, planSource);

    const previousFinal = {
      mixtureId: previousFinalDeclaration.id,
      runtimeSet: previousRuntimeSet,
      schemaState: previousFinalDeclaration.schemaState,
      schemaFingerprintSha256: previousFinalDeclaration.schemaFingerprintSha256,
    };
    const events = executionFor("dev", planRef.sha256, {
      runtimeContract: plan.runtimeContract,
    })
      .trimEnd()
      .split("\n")
      .map((line) => JSON.parse(line));
    const smokeIndex = events.findIndex((event) => event.type === "fenced-smoke-completed");
    const previousFinalSmoke = {
      ...structuredClone(events[smokeIndex]),
      data: { ...structuredClone(events[smokeIndex].data), mixture: previousFinal },
    };
    events.splice(smokeIndex + 1, 0, previousFinalSmoke);
    const resumed = events.find((event) => event.type === "phase-resumed");
    resumed.data.mixture = previousFinal;
    const serviceCompleted = events.find((event) => event.type === "service-completed");
    serviceCompleted.data.activeMixture = previousFinal;
    serviceCompleted.data.runningUnits = previousRuntimeSet.units.map((unit) => ({
      runtimeUnitId: unit.id,
      kind: unit.kind,
      sourceRef: unit.sourceRef,
      compatibilityConfigSha256: runtimeUnitCompatibilitySha256(unit),
      observationEvidence: "runtime source and config observed",
    }));
    const rebound = events.map((event, index) => ({
      ...event,
      sequence: index + 1,
      at: new Date(Date.UTC(2026, 7, 4, 2, 30, index)).toISOString(),
    }));
    const executionPath = `${artifactRoot}/dev/execution.jsonl`;
    const executionSource = `${rebound.map((event) => JSON.stringify(event)).join("\n")}\n`;
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
    assert(errors.some((error) => /initial RESUMED must use the next-release final mixture/.test(error)));

    const missingRecoveryTargetSmoke = rebound
      .filter(
        (event) =>
          event.type !== "fenced-smoke-completed" ||
          event.data.mixture.mixtureId === previousFinal.mixtureId,
      )
      .map((event, index) => ({ ...event, sequence: index + 1 }));
    const missingRecoveryTargetSource = `${missingRecoveryTargetSmoke
      .map((event) => JSON.stringify(event))
      .join("\n")}\n`;
    archive.files.set(executionPath, missingRecoveryTargetSource);
    const missingSmokeErrors = validateMaintenanceDbMigrationEvidence({
      evidence: canonicalEvidence(
        planRef,
        artifactRef(executionPath, missingRecoveryTargetSource),
      ),
      version,
      apiSourceRef,
      scopeStatus: "pending",
      readArtifact: archive.readArtifact,
      listArtifacts: archive.listArtifacts,
      context: "db migration evidence",
    });
    assert(
      missingSmokeErrors.some((error) =>
        /initial RESUMED requires smoke for every recovery target mixture/.test(error),
      ),
    );
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

  it("binds a violation to trusted API catalog, compatibility, and migration bytes", () => {
    const evidence = violationEvidenceFor();
    const migration = evidence.violation.prodState.migrations[0];
    const migrationSource = "SELECT 1;\n";
    migration.sha256 = sha256Hex(migrationSource);
    const catalogSource = `${JSON.stringify({
      migrations: [{ file: migration.file, sha256: migration.sha256 }],
    }, null, 2)}\n`;
    const compatibilitySource = "{}\n";
    evidence.violation.catalogState.catalogSha256 = sha256Hex(catalogSource);
    evidence.violation.catalogState.ledgerCompatibilitySha256 =
      sha256Hex(compatibilitySource);
    evidence.violation.catalogState.catalogEntryCount = 1;
    evidence.violation.catalogState.resolutionCounts = {
      applied: 1,
      recovered: 0,
      baseline: 0,
      superseded: 0,
    };
    const trusted = new Map([
      [evidence.violation.catalogState.catalogPath, catalogSource],
      [evidence.violation.catalogState.ledgerCompatibilityPath, compatibilitySource],
      [migration.file, migrationSource],
    ]);
    const validate = (readApiArtifact) =>
      validateMaintenanceDbMigrationEvidence({
        evidence,
        version,
        apiSourceRef,
        scopeStatus: "released",
        readApiArtifact,
        requireTrustedApiSource: true,
        listArtifacts: () => [],
        context: "db migration evidence",
      });

    assert.deepEqual(validate((_sourceRef, sourcePath) => trusted.get(sourcePath) ?? null), []);
    assert(
      validate((_sourceRef, sourcePath) =>
        sourcePath === migration.file ? "SELECT 2;\n" : trusted.get(sourcePath) ?? null,
      ).some((error) => error.includes("checksum must match the trusted API source bytes")),
    );
    assert(
      validate(undefined).some((error) =>
        error.includes("requires trusted API source verification"),
      ),
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
