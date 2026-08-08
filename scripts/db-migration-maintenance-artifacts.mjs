import { createHash } from "node:crypto";
import path from "node:path";
import { isDeepStrictEqual } from "node:util";

export const dbMigrationMaintenanceEvidenceSchema =
  "db-migration-maintenance-evidence/v1";

const sha256Pattern = /^[0-9a-f]{64}$/u;
const closedIdPattern = /^[a-z0-9](?:[a-z0-9-]{0,62}[a-z0-9])?$/u;
const isClosedId = (value) => typeof value === "string" && closedIdPattern.test(value);
const environments = ["dev", "prod"];
const writerKinds = ["api", "admin", "websocket", "cron", "worker", "direct-sql"];
const compatibilityRoles = [
  "db-reader",
  "db-writer",
  "queue-consumer",
  "side-effect-producer",
];
const migrationKinds = [
  "schema",
  "data",
  "precheck",
  "postcheck",
  "cutover",
  "contract",
  "recovery",
];
const maintenancePlanSchema = "db-migration-maintenance-plan/v4";
const maintenanceEventSchema = "db-migration-maintenance-event/v3";
const maintenanceEventTypes = new Set([
  "phase-fenced",
  "fence-reverified",
  "migration-started",
  "migration-sql-succeeded",
  "migration-ledger-succeeded",
  "migration-ledger-repaired",
  "artifact-reconciled",
  "migration-outcome-adjudicated",
  "migration-ledger-gap-adjudicated",
  "migration-failed",
  "database-completed",
  "lock-released",
  "fenced-smoke-completed",
  "phase-resumed",
  "phase-recovering",
  "recovery-completed",
  "service-completed",
]);
const migrationEventTypes = new Set([
  "migration-started",
  "migration-sql-succeeded",
  "migration-ledger-succeeded",
  "migration-ledger-repaired",
  "artifact-reconciled",
  "migration-outcome-adjudicated",
  "migration-ledger-gap-adjudicated",
  "migration-failed",
]);
const migrationResolutionTypes = new Set([
  "migration-ledger-succeeded",
  "migration-ledger-repaired",
  "artifact-reconciled",
]);
const migrationTerminalTypes = new Set([
  ...migrationResolutionTypes,
  "migration-outcome-adjudicated",
  "migration-ledger-gap-adjudicated",
  "migration-failed",
]);
const maintenancePlanKeys = [
  "schema",
  "environment",
  "createdAt",
  "apiSourceRef",
  "databaseIdentitySha256",
  "catalog",
  "ledgerCompatibility",
  "appliedRefs",
  "recoveredRefs",
  "baselineRefs",
  "supersededRefs",
  "adjudicableLedgerGapRefs",
  "pendingRefs",
  "devPlan",
  "devExecution",
  "failedPlan",
  "failedExecution",
  "runtimeContract",
];

export function sha256Hex(source) {
  return createHash("sha256").update(source).digest("hex");
}

export function isMaintenanceDbMigrationEvidence(evidence) {
  return evidence?.schema === dbMigrationMaintenanceEvidenceSchema;
}

export function isTerminalCanonicalMaintenanceEvidence(evidence, version) {
  return (
    evidence?.schema === dbMigrationMaintenanceEvidenceSchema &&
    evidence?.kind === "canonical" &&
    evidence?.plan?.path ===
      `content/releases/evidence/db-migrations/${version}/prod/plan.json` &&
    evidence?.execution?.path ===
      `content/releases/evidence/db-migrations/${version}/prod/execution.jsonl`
  );
}

export function validateMaintenanceDbMigrationEvidence({
  evidence,
  version,
  apiSourceRef,
  scopeStatus,
  readArtifact,
  readApiArtifact,
  requireTrustedApiSource = false,
  listArtifacts,
  context,
}) {
  if (!isPlainObject(evidence)) {
    return [`${context} must be an object`];
  }
  if (evidence.schema !== dbMigrationMaintenanceEvidenceSchema) {
    return [`${context}.schema must be ${dbMigrationMaintenanceEvidenceSchema}`];
  }
  const terminal = scopeStatus === "released" || scopeStatus === "rolled_back";
  return validateCurrentMaintenanceEvidence({
    evidence,
    version,
    apiSourceRef,
    terminal,
    scopeStatus,
    readArtifact,
    readApiArtifact: readApiArtifact ?? readArtifact?.readApiArtifact,
    requireTrustedApiSource,
    listArtifacts,
    context,
  });
}

function validateCurrentMaintenanceEvidence({
  evidence,
  version,
  apiSourceRef,
  terminal,
  scopeStatus,
  readArtifact,
  readApiArtifact,
  requireTrustedApiSource,
  listArtifacts,
  context,
}) {
  const errors = [];
  if (evidence.kind === "canonical") {
    validateCanonicalEvidence({
      evidence,
      version,
      apiSourceRef,
      terminal,
      scopeStatus,
      readArtifact,
      readApiArtifact,
      requireTrustedApiSource,
      listArtifacts,
      context,
      errors,
    });
  } else if (evidence.kind === "violation") {
    validateViolationEvidence({
      evidence,
      version,
      apiSourceRef,
      terminal,
      scopeStatus,
      readApiArtifact,
      requireTrustedApiSource,
      listArtifacts,
      context,
      errors,
    });
  } else {
    errors.push(`${context}.kind must be canonical or violation`);
  }
  return errors;
}

function validateCanonicalEvidence({
  evidence,
  version,
  apiSourceRef,
  terminal,
  scopeStatus,
  readArtifact,
  readApiArtifact,
  requireTrustedApiSource,
  listArtifacts,
  context,
  errors,
}) {
  validateExactKeys(evidence, ["schema", "kind", "plan", "execution"], context, errors);

  let environment = null;
  let requirePlan = false;
  let requireExecution = false;
  let allowExecution = false;
  let requireEmptyRoot = false;
  if (scopeStatus === "planned") {
    requireEmptyRoot = true;
  } else if (scopeStatus === "pending") {
    environment = "dev";
    requirePlan = true;
    allowExecution = true;
  } else if (scopeStatus === "in_progress") {
    environment = "prod";
    requirePlan = true;
  } else if (scopeStatus === "superseded") {
    allowExecution = true;
    if (evidence.plan !== null) {
      environment = evidence.plan?.path ===
        `content/releases/evidence/db-migrations/${version}/prod/plan.json`
        ? "prod"
        : "dev";
    }
  } else if (terminal) {
    environment = "prod";
    requirePlan = true;
    requireExecution = true;
  }

  if (requireEmptyRoot && evidence.plan !== null) {
    errors.push(`${context}.plan must be null while the DB migration scope is planned`);
  }
  if (!requireExecution && !allowExecution && evidence.execution !== null) {
    errors.push(`${context}.execution must be null for the current DB migration scope status`);
  }
  if (scopeStatus === "superseded" && evidence.plan === null && evidence.execution !== null) {
    errors.push(`${context}.execution requires a plan root`);
  }

  if (environment !== null) {
    validateArtifactRef({
      value: evidence.plan,
      expectedSuffix: "plan.json",
      environment,
      version,
      required: requirePlan,
      readArtifact,
      readApiArtifact,
      requireTrustedApiSource,
      context: `${context}.plan`,
      errors,
    });
    validateArtifactRef({
      value: evidence.execution,
      expectedSuffix: "execution.jsonl",
      environment,
      version,
      required: requireExecution,
      readArtifact,
      context: `${context}.execution`,
      errors,
    });
  }

  const artifactPaths = listVersionArtifacts({ listArtifacts, version, context, errors });
  const reachable = new Set();
  if (isArtifactRef(evidence.plan) && readArtifact) {
    const completedDevCheckpoint =
      scopeStatus === "pending" && isArtifactRef(evidence.execution);
    validateCanonicalGraph({
      planRef: evidence.plan,
      executionRef: isArtifactRef(evidence.execution) ? evidence.execution : null,
      expectedEnvironment: environment,
      apiSourceRef,
      requireCompletedExecution: terminal || completedDevCheckpoint,
      version,
      artifactPaths,
      reachable,
      readArtifact,
      readApiArtifact,
      requireTrustedApiSource,
      context,
      errors,
    });
  }
  rejectOrphanArtifacts({ artifactPaths, reachable, context, errors });
}

function validateViolationEvidence({
  evidence,
  version,
  apiSourceRef,
  terminal,
  scopeStatus,
  readApiArtifact,
  requireTrustedApiSource,
  listArtifacts,
  context,
  errors,
}) {
  validateExactKeys(evidence, ["schema", "kind", "violation"], context, errors);
  if (!terminal || scopeStatus !== "released") {
    errors.push(`${context}.violation is allowed only for an already-applied released DB migration scope`);
  }
  const violation = evidence.violation;
  if (!isPlainObject(violation)) {
    errors.push(`${context}.violation must be an object`);
    return;
  }
  validateExactKeys(
    violation,
    [
      "version",
      "apiSourceRef",
      "verifiedAt",
      "catalogState",
      "prodState",
      "historicalExecution",
      "limitation",
    ],
    `${context}.violation`,
    errors,
  );
  if (violation.version !== version) {
    errors.push(`${context}.violation.version must match the release version`);
  }
  if (
    typeof violation.apiSourceRef !== "string" ||
    !/^[0-9a-f]{40}$/u.test(violation.apiSourceRef)
  ) {
    errors.push(`${context}.violation.apiSourceRef must be a 40-character commit SHA`);
  } else if (violation.apiSourceRef !== apiSourceRef) {
    errors.push(`${context}.violation.apiSourceRef must match the API release commit`);
  }
  if (!isIsoUtcTimestamp(violation.verifiedAt)) {
    errors.push(`${context}.violation.verifiedAt must be an ISO-8601 UTC timestamp`);
  }
  validateViolationCatalogState(violation.catalogState, `${context}.violation.catalogState`, errors);
  validateViolationProdState(violation.prodState, `${context}.violation.prodState`, errors);
  const verifiedMigrationCount = Array.isArray(violation.prodState?.migrations)
    ? violation.prodState.migrations.length
    : null;
  const appliedMigrationCount = violation.catalogState?.resolutionCounts?.applied;
  if (
    verifiedMigrationCount !== null &&
    Number.isSafeInteger(appliedMigrationCount) &&
    verifiedMigrationCount > appliedMigrationCount
  ) {
    errors.push(`${context}.violation.prodState.migrations cannot exceed the applied catalog count`);
  }
  validateViolationHistoricalExecution(
    violation.historicalExecution,
    `${context}.violation.historicalExecution`,
    errors,
  );
  if (!isConcreteText(violation.limitation)) {
    errors.push(`${context}.violation.limitation must state the canonical evidence gap`);
  }

  validateTrustedViolationSources({
    violation,
    readApiArtifact,
    requireTrustedApiSource,
    context: `${context}.violation`,
    errors,
  });

  const artifactPaths = listVersionArtifacts({ listArtifacts, version, context, errors });
  if (artifactPaths && artifactPaths.length > 0) {
    errors.push(`${context}.violation must not carry canonical maintenance artifacts`);
  }
}

function validateTrustedViolationSources({
  violation,
  readApiArtifact,
  requireTrustedApiSource,
  context,
  errors,
}) {
  if (typeof readApiArtifact !== "function") {
    if (requireTrustedApiSource) {
      errors.push(`${context} requires trusted API source verification`);
    }
    return;
  }
  if (!/^[0-9a-f]{40}$/u.test(violation.apiSourceRef ?? "")) {
    return;
  }
  const catalogState = violation.catalogState;
  const migrations = Array.isArray(violation.prodState?.migrations)
    ? violation.prodState.migrations
    : [];
  const sources = [
    ["catalog", catalogState?.catalogPath, catalogState?.catalogSha256],
    [
      "ledger compatibility",
      catalogState?.ledgerCompatibilityPath,
      catalogState?.ledgerCompatibilitySha256,
    ],
    ...migrations.map((migration, index) => [
      `migration[${index}]`,
      migration?.file,
      migration?.sha256,
    ]),
  ];
  let trustedCatalog = null;
  for (const [label, sourcePath, expectedSha256] of sources) {
    if (typeof sourcePath !== "string" || !sha256Pattern.test(expectedSha256 ?? "")) {
      continue;
    }
    const source = readApiArtifact(violation.apiSourceRef, sourcePath);
    if (source === null || source === undefined) {
      errors.push(
        `${context}.${label} trusted API source is missing at ${violation.apiSourceRef}:${sourcePath}`,
      );
      continue;
    }
    const buffer = Buffer.isBuffer(source) ? source : Buffer.from(source);
    if (sha256Hex(buffer) !== expectedSha256) {
      errors.push(`${context}.${label} checksum must match the trusted API source bytes`);
      continue;
    }
    if (label === "catalog") {
      trustedCatalog = buffer.toString("utf8");
    }
  }
  if (trustedCatalog === null) {
    return;
  }
  let catalog;
  try {
    catalog = JSON.parse(trustedCatalog);
  } catch {
    errors.push(`${context}.catalog trusted API source must contain valid JSON`);
    return;
  }
  if (!Array.isArray(catalog?.migrations)) {
    errors.push(`${context}.catalog trusted API source must declare migrations`);
    return;
  }
  if (catalog.migrations.length !== catalogState?.catalogEntryCount) {
    errors.push(`${context}.catalogEntryCount must match the trusted API catalog`);
  }
  const catalogByFile = new Map(catalog.migrations.map((entry) => [entry?.file, entry]));
  for (const [index, migration] of migrations.entries()) {
    const entry = catalogByFile.get(migration?.file);
    if (entry?.sha256 !== migration?.sha256) {
      errors.push(`${context}.prodState.migrations[${index}] must match the trusted API catalog`);
    }
  }
}

function validateViolationCatalogState(value, context, errors) {
  if (!isPlainObject(value)) {
    errors.push(`${context} must be an object`);
    return;
  }
  validateExactKeys(
    value,
    [
      "catalogPath",
      "catalogSha256",
      "ledgerCompatibilityPath",
      "ledgerCompatibilitySha256",
      "catalogEntryCount",
      "resolutionCounts",
      "pendingCount",
      "adjudicableLedgerGapCount",
    ],
    context,
    errors,
  );
  if (value.catalogPath !== "db/schema/schema-contract.json") {
    errors.push(`${context}.catalogPath must be db/schema/schema-contract.json`);
  }
  if (value.ledgerCompatibilityPath !== "db/schema/ledger-compatibility.json") {
    errors.push(`${context}.ledgerCompatibilityPath must be db/schema/ledger-compatibility.json`);
  }
  for (const key of ["catalogSha256", "ledgerCompatibilitySha256"]) {
    if (!sha256Pattern.test(value[key] ?? "")) {
      errors.push(`${context}.${key} must be a lowercase SHA-256`);
    }
  }
  if (!Number.isSafeInteger(value.catalogEntryCount) || value.catalogEntryCount < 0) {
    errors.push(`${context}.catalogEntryCount must be a non-negative integer`);
  }
  const resolutionCounts = value.resolutionCounts;
  if (!isPlainObject(resolutionCounts)) {
    errors.push(`${context}.resolutionCounts must be an object`);
  } else {
    validateExactKeys(
      resolutionCounts,
      ["applied", "recovered", "baseline", "superseded"],
      `${context}.resolutionCounts`,
      errors,
    );
    for (const key of ["applied", "recovered", "baseline", "superseded"]) {
      if (!Number.isSafeInteger(resolutionCounts[key]) || resolutionCounts[key] < 0) {
        errors.push(`${context}.resolutionCounts.${key} must be a non-negative integer`);
      }
    }
  }
  const resolutionCountTotal = isPlainObject(resolutionCounts)
    ? ["applied", "recovered", "baseline", "superseded"].reduce(
        (total, key) => total + (Number.isSafeInteger(resolutionCounts[key]) ? resolutionCounts[key] : 0),
        0,
      )
    : -1;
  if (
    value.catalogEntryCount <= 0 ||
    resolutionCountTotal !== value.catalogEntryCount ||
    value.pendingCount !== 0 ||
    value.adjudicableLedgerGapCount !== 0
  ) {
    errors.push(`${context} must prove the full catalog resolved with zero pending or adjudicable gaps`);
  }
}

function validateViolationProdState(value, context, errors) {
  if (!isPlainObject(value)) {
    errors.push(`${context} must be an object`);
    return;
  }
  validateExactKeys(
    value,
    ["databaseIdentitySha256", "schemaFingerprintSha256", "migrations"],
    context,
    errors,
  );
  for (const key of ["databaseIdentitySha256", "schemaFingerprintSha256"]) {
    if (!sha256Pattern.test(value[key] ?? "")) {
      errors.push(`${context}.${key} must be a lowercase SHA-256`);
    }
  }
  if (!Array.isArray(value.migrations) || value.migrations.length === 0) {
    errors.push(`${context}.migrations must contain at least one verified migration`);
    return;
  }
  const files = new Set();
  for (const [index, migration] of value.migrations.entries()) {
    const migrationContext = `${context}.migrations[${index}]`;
    if (!isPlainObject(migration)) {
      errors.push(`${migrationContext} must be an object`);
      continue;
    }
    validateExactKeys(
      migration,
      ["file", "sha256", "ledger", "postcondition"],
      migrationContext,
      errors,
    );
    if (!isNumberedMigrationPath(migration.file) || files.has(migration.file)) {
      errors.push(`${migrationContext}.file must be a unique numbered migration path`);
    }
    files.add(migration.file);
    if (!sha256Pattern.test(migration.sha256 ?? "")) {
      errors.push(`${migrationContext}.sha256 must be a lowercase SHA-256`);
    }
    if (migration.ledger !== "applied" || migration.postcondition !== "passed") {
      errors.push(`${migrationContext} must have applied ledger and passed postcondition`);
    }
  }
}

function validateViolationHistoricalExecution(value, context, errors) {
  if (!isPlainObject(value)) {
    errors.push(`${context} must be an object`);
    return;
  }
  validateExactKeys(
    value,
    ["backupSha256", "writerFenceEvidence", "resumeSmokeEvidence", "canonicalExecution"],
    context,
    errors,
  );
  if (!sha256Pattern.test(value.backupSha256 ?? "")) {
    errors.push(`${context}.backupSha256 must be a lowercase SHA-256`);
  }
  for (const key of ["writerFenceEvidence", "resumeSmokeEvidence"]) {
    if (!isConcreteText(value[key])) {
      errors.push(`${context}.${key} must be concrete historical evidence`);
    }
  }
  if (value.canonicalExecution !== "unavailable-not-recreated") {
    errors.push(`${context}.canonicalExecution must be unavailable-not-recreated`);
  }
}

function validateCanonicalGraph({
  planRef,
  executionRef,
  expectedEnvironment,
  apiSourceRef,
  requireCompletedExecution,
  version,
  artifactPaths,
  reachable,
  readArtifact,
  readApiArtifact,
  requireTrustedApiSource,
  context,
  errors,
  history = false,
  graphState = { activePlans: new Set() },
}) {
  const planKey = `${planRef.path}:${planRef.sha256}`;
  if (graphState.activePlans.has(planKey)) {
    errors.push(`${context} contains a cyclic maintenance plan reference`);
    return null;
  }
  const planSource = readBoundArtifact({
    ref: planRef,
    readArtifact,
    context: `${context}.plan`,
    errors,
  });
  if (planSource === null) {
    return null;
  }
  reachable.add(planRef.path);
  graphState.activePlans.add(planKey);

  let plan;
  try {
    plan = JSON.parse(planSource.toString());
  } catch {
    errors.push(`${context}.plan must contain valid JSON`);
    graphState.activePlans.delete(planKey);
    return null;
  }
  validatePlanEnvelope({ plan, expectedEnvironment, apiSourceRef, context: `${context}.plan`, errors });
  const sealedInputs = validatePlanInputSnapshots({
    plan,
    version,
    artifactPaths,
    reachable,
    readArtifact,
    readApiArtifact,
    requireTrustedApiSource,
    context: `${context}.plan`,
    errors,
  });
  let releaseOwnedRefs = [];
  if (history && environments.includes(plan?.environment)) {
    const historyRoot =
      `content/releases/evidence/db-migrations/${version}/${plan.environment}/history/${planRef.sha256}`;
    if (planRef.path !== `${historyRoot}/plan.json`) {
      errors.push(`${context}.plan.path must use the canonical failed-history layout`);
    }
    if (executionRef?.path !== `${historyRoot}/execution.jsonl`) {
      errors.push(`${context}.execution.path must use the canonical failed-history layout`);
    }
  }

  let executionEvents = null;
  if (executionRef !== null) {
    const executionSource = readBoundArtifact({
      ref: executionRef,
      readArtifact,
      context: `${context}.execution`,
      errors,
    });
    if (executionSource !== null) {
      reachable.add(executionRef.path);
      executionEvents = validateExecutionEnvelope({
        source: executionSource,
        plan,
        environment: plan?.environment,
        planSha256: planRef.sha256,
        requireCompleted: requireCompletedExecution,
        failedPlan: history ? plan : null,
        context: `${context}.execution`,
        errors,
      });
      validateExecutionPostconditionBindings({
        plan,
        events: executionEvents,
        catalog: sealedInputs?.catalog,
        postconditions: sealedInputs?.postconditions,
        context: `${context}.execution`,
        errors,
      });
      const pendingRefs = Array.isArray(plan?.pendingRefs)
        ? plan.pendingRefs.filter(isMigrationRef)
        : [];
      for (const event of executionEvents) {
        if (!migrationResolutionTypes.has(event?.type) || !isPlainObject(event.data)) {
          continue;
        }
        if (!isMigrationRef(event.data.ref)) {
          continue;
        }
        const resolvedRefs = event.data.ref.kind === "recovery"
          ? isMigrationRef(event.data.recoveredRef)
            ? [event.data.recoveredRef, event.data.ref]
            : []
          : event.data.recoveredRef === undefined
            ? [event.data.ref]
            : [];
        for (const resolvedRef of resolvedRefs) {
          if (
            pendingRefs.some((pendingRef) => sameMigrationRef(pendingRef, resolvedRef)) &&
            !releaseOwnedRefs.some((ownedRef) => sameMigrationRef(ownedRef, resolvedRef))
          ) {
            releaseOwnedRefs.push(resolvedRef);
          }
        }
      }
    }
  }

  if (plan?.environment === "prod") {
    validateInternalArtifactRef(plan.devPlan, "plan", `${context}.plan.devPlan`, errors);
    validateInternalArtifactRef(plan.devExecution, "execution", `${context}.plan.devExecution`, errors);
    if (isArtifactRef(plan.devPlan) && isArtifactRef(plan.devExecution)) {
      const devPlanRef = {
        path: `content/releases/evidence/db-migrations/${version}/dev/plan.json`,
        sha256: plan.devPlan.sha256,
      };
      const devExecutionRef = {
        path: `content/releases/evidence/db-migrations/${version}/dev/execution.jsonl`,
        sha256: plan.devExecution.sha256,
      };
      const devGraph = validateCanonicalGraph({
        planRef: devPlanRef,
        executionRef: devExecutionRef,
        expectedEnvironment: "dev",
        apiSourceRef: null,
        requireCompletedExecution: true,
        version,
        artifactPaths,
        reachable,
        readArtifact,
        readApiArtifact,
        requireTrustedApiSource,
        context: `${context}.devPair`,
        errors,
        graphState,
      });
      const devPlan = devGraph?.plan;
      if (
        isPlainObject(devPlan) &&
        (devPlan.schema !== plan.schema ||
          devPlan.catalog?.sha256 !== plan.catalog?.sha256 ||
          devPlan.ledgerCompatibility?.sha256 !== plan.ledgerCompatibility?.sha256 ||
          !isDeepStrictEqual(devPlan.runtimeContract, plan.runtimeContract) ||
          (plan.schema === maintenancePlanSchema &&
            !isDeepStrictEqual(devPlan.postconditions, plan.postconditions)))
      ) {
        errors.push(
          `${context}.plan dev pair must match the prod plan generation, catalog, compatibility, runtime, and postconditions`,
        );
      }
      const devReleaseOwnedRefs = devGraph?.releaseOwnedRefs;
      const prodPendingRefs = Array.isArray(plan.pendingRefs)
        ? plan.pendingRefs.filter(isMigrationRef)
        : [];
      if (
        Array.isArray(devReleaseOwnedRefs) &&
        devReleaseOwnedRefs.some((ref) => ref.kind === "recovery")
      ) {
        errors.push(
          `${context}.plan a dev graph that required append-only recovery cannot be promoted to prod`,
        );
      }
      if (
        !Array.isArray(devReleaseOwnedRefs) ||
        devReleaseOwnedRefs.length === 0 ||
        !Array.isArray(plan.pendingRefs) ||
        prodPendingRefs.length !== plan.pendingRefs.length ||
        prodPendingRefs.length !== devReleaseOwnedRefs.length ||
        prodPendingRefs.some(
          (pendingRef) =>
            !devReleaseOwnedRefs.some((releaseRef) => sameMigrationRef(releaseRef, pendingRef)),
        ) ||
        devReleaseOwnedRefs.some(
          (releaseRef) =>
            !prodPendingRefs.some((pendingRef) => sameMigrationRef(pendingRef, releaseRef)),
        )
      ) {
        errors.push(
          `${context}.plan prod pending refs must exactly match migrations owned by the immutable dev graph`,
        );
      }
    }
  } else if (plan?.environment === "dev") {
    if (plan.devPlan !== null || plan.devExecution !== null) {
      errors.push(`${context}.plan dev plan must not contain dev pair references`);
    }
  }

  const failedPlanPresent = plan?.failedPlan !== null && plan?.failedPlan !== undefined;
  const failedExecutionPresent =
    plan?.failedExecution !== null && plan?.failedExecution !== undefined;
  const recoveryMarkers = Array.isArray(plan?.pendingRefs)
    ? plan.pendingRefs.filter((ref) => isPlainObject(ref) && ref.kind === "recovery")
    : [];
  const pendingRecoveryRefs = recoveryMarkers.filter(isMigrationRef);
  if (pendingRecoveryRefs.length !== recoveryMarkers.length) {
    errors.push(`${context}.plan.pendingRefs contains an invalid recovery migration reference`);
  }
  const pendingRecoveryCount = pendingRecoveryRefs.length;
  if (pendingRecoveryCount > 1) {
    errors.push(`${context}.plan may contain only one pending recovery migration`);
  }
  if (failedPlanPresent !== failedExecutionPresent) {
    errors.push(`${context}.plan failedPlan and failedExecution must be supplied together`);
  } else if ((pendingRecoveryCount === 1) !== (failedPlanPresent && failedExecutionPresent)) {
    errors.push(`${context}.plan pending recovery and failed artifact pair must exist together`);
  } else if (failedPlanPresent && failedExecutionPresent) {
    validateInternalArtifactRef(plan.failedPlan, "plan", `${context}.plan.failedPlan`, errors);
    validateInternalArtifactRef(
      plan.failedExecution,
      "execution",
      `${context}.plan.failedExecution`,
      errors,
    );
    const failedPlanRef = isArtifactRef(plan.failedPlan)
      ? resolveArchivedRef({
          internalRef: plan.failedPlan,
          artifactPaths,
          extension: ".json",
          readArtifact,
          context: `${context}.plan.failedPlan`,
          errors,
        })
      : null;
    const failedExecutionRef = isArtifactRef(plan.failedExecution)
      ? resolveArchivedRef({
          internalRef: plan.failedExecution,
          artifactPaths,
          extension: ".jsonl",
          readArtifact,
          context: `${context}.plan.failedExecution`,
          errors,
        })
      : null;
    if (failedPlanRef && failedExecutionRef) {
      const failedGraph = validateCanonicalGraph({
        planRef: failedPlanRef,
        executionRef: failedExecutionRef,
        expectedEnvironment: plan.environment,
        apiSourceRef: null,
        requireCompletedExecution: false,
        version,
        artifactPaths,
        reachable,
        readArtifact,
        readApiArtifact,
        requireTrustedApiSource,
        context: `${context}.failedExecution`,
        errors,
        history: true,
        graphState,
      });
      const failedPlan = failedGraph?.plan;
      if (Array.isArray(failedGraph?.releaseOwnedRefs)) {
        releaseOwnedRefs = [...failedGraph.releaseOwnedRefs, ...releaseOwnedRefs].filter(
          (ref, index, refs) =>
            refs.findIndex((candidate) => candidate.file === ref.file) === index,
        );
      }
      if (
        isPlainObject(failedPlan) &&
        (failedPlan.schema !== plan.schema ||
          failedPlan.databaseIdentitySha256 !== plan.databaseIdentitySha256 ||
          failedPlan.catalog?.path !== plan.catalog?.path ||
          failedPlan.ledgerCompatibility?.sha256 !== plan.ledgerCompatibility?.sha256)
      ) {
        errors.push(
          `${context}.plan failed pair must match the recovery plan generation, database, catalog, and compatibility`,
        );
      }
      if (isPlainObject(failedPlan)) {
        validateRecoveryPlanBinding({
          plan,
          executionEvents,
          recoveryRef: pendingRecoveryRefs[0],
          failedPlan,
          failedEvents: failedGraph?.events,
          catalog: sealedInputs?.catalog,
          currentPostconditions: sealedInputs?.postconditions,
          failedPostconditions: failedGraph?.sealedInputs?.postconditions,
          context,
          errors,
        });
      }
    }
  }

  if (
    plan?.environment === "dev" &&
    !failedPlanPresent &&
    !failedExecutionPresent &&
    (!Array.isArray(plan.pendingRefs) || plan.pendingRefs.filter(isMigrationRef).length === 0)
  ) {
    errors.push(
      `${context}.plan initial dev graph requires a pending release migration; already-applied work must use violation evidence`,
    );
  }

  graphState.activePlans.delete(planKey);
  return {
    plan,
    events: executionEvents,
    sealedInputs,
    releaseOwnedRefs,
  };
}

function validatePlanEnvelope({ plan, expectedEnvironment, apiSourceRef, context, errors }) {
  if (!isPlainObject(plan)) {
    errors.push(`${context} must be a maintenance plan object`);
    return;
  }
  const expectedKeys = [...maintenancePlanKeys, "postconditions"];
  validateExactKeys(plan, expectedKeys, context, errors);
  if (plan.schema !== maintenancePlanSchema) {
    errors.push(`${context}.schema must be ${maintenancePlanSchema}`);
  }
  if (!environments.includes(plan.environment)) {
    errors.push(`${context}.environment must be dev or prod`);
  } else if (expectedEnvironment !== null && plan.environment !== expectedEnvironment) {
    errors.push(`${context}.environment must be ${expectedEnvironment}`);
  }
  if (!isIsoUtcTimestamp(plan.createdAt)) {
    errors.push(`${context}.createdAt must be an ISO-8601 UTC timestamp`);
  }
  if (typeof plan.apiSourceRef !== "string" || !/^[0-9a-f]{40}$/u.test(plan.apiSourceRef)) {
    errors.push(`${context}.apiSourceRef must be a 40-character commit SHA`);
  } else if (apiSourceRef !== null && plan.apiSourceRef !== apiSourceRef) {
    errors.push(`${context}.apiSourceRef must match the API release commit`);
  }
  if (!sha256Pattern.test(plan.databaseIdentitySha256 ?? "")) {
    errors.push(`${context}.databaseIdentitySha256 must be a lowercase SHA-256`);
  }
  const planInputs = ["catalog", "ledgerCompatibility", "postconditions"];
  for (const key of planInputs) {
    validateInternalArtifactRef(plan[key], "plan-input", `${context}.${key}`, errors);
  }
  const canonicalPlanInputPaths = {
    catalog: "db/schema/schema-contract.json",
    ledgerCompatibility: "db/schema/ledger-compatibility.json",
    postconditions: "db/schema/migration-postconditions.json",
  };
  for (const key of planInputs) {
    if (isArtifactRef(plan[key]) && plan[key].path !== canonicalPlanInputPaths[key]) {
      errors.push(`${context}.${key}.path must be ${canonicalPlanInputPaths[key]}`);
    }
  }
  for (const key of [
    "appliedRefs",
    "recoveredRefs",
    "baselineRefs",
    "supersededRefs",
    "adjudicableLedgerGapRefs",
    "pendingRefs",
  ]) {
    if (!Array.isArray(plan[key])) {
      errors.push(`${context}.${key} must be an array`);
    }
  }
  if (
    Array.isArray(plan.appliedRefs) &&
    !plan.appliedRefs.every(isMigrationRef)
  ) {
    errors.push(`${context}.appliedRefs must contain closed migration references`);
  }
  if (
    Array.isArray(plan.recoveredRefs) &&
    !plan.recoveredRefs.every(isRecoveredRef)
  ) {
    errors.push(`${context}.recoveredRefs must contain closed recovery pairs`);
  }
  if (
    Array.isArray(plan.baselineRefs) &&
    !plan.baselineRefs.every(isMigrationRef)
  ) {
    errors.push(`${context}.baselineRefs must contain closed migration references`);
  }
  if (
    Array.isArray(plan.supersededRefs) &&
    !plan.supersededRefs.every(isSupersededRef)
  ) {
    errors.push(`${context}.supersededRefs must contain closed supersession pairs`);
  }
  if (
    Array.isArray(plan.pendingRefs) &&
    (!plan.pendingRefs.every(isMigrationRef) ||
      new Set(plan.pendingRefs.map((ref) => ref.file)).size !== plan.pendingRefs.length)
  ) {
    errors.push(`${context}.pendingRefs must contain unique closed migration references`);
  }
  const partitionRefs = planCatalogRefs(plan);
  if (
    partitionRefs !== null &&
    new Set(partitionRefs.map((ref) => ref.file)).size !== partitionRefs.length
  ) {
    errors.push(`${context} migration resolution groups must be disjoint`);
  }
  if (
    Array.isArray(plan.adjudicableLedgerGapRefs) &&
    !plan.adjudicableLedgerGapRefs.every(isAdjudicableLedgerGapRef)
  ) {
    errors.push(
      `${context}.adjudicableLedgerGapRefs must contain closed gap and evidence references`,
    );
  } else if (
    Array.isArray(plan.adjudicableLedgerGapRefs) &&
    Array.isArray(plan.pendingRefs)
  ) {
    const pendingFiles = new Set(plan.pendingRefs.filter(isMigrationRef).map((ref) => ref.file));
    if (
      new Set(plan.adjudicableLedgerGapRefs.map((entry) => entry.ref.file)).size !==
        plan.adjudicableLedgerGapRefs.length ||
      plan.adjudicableLedgerGapRefs.some(
        (entry) =>
          !pendingFiles.has(entry.ref.file) ||
          pendingFiles.has(entry.evidenceRef.file) ||
          entry.ref.file === entry.evidenceRef.file,
      )
    ) {
      errors.push(
        `${context}.adjudicableLedgerGapRefs must be unique pending refs with resolved later evidence`,
      );
    }
  }
  if (!isPlainObject(plan.runtimeContract)) {
    errors.push(`${context}.runtimeContract must be an object`);
  } else {
    const expectedRuntimeSchema = "db-migration-runtime-contract/v2";
    if (!isDeclaredRuntimeContract(plan.runtimeContract, expectedRuntimeSchema)) {
      errors.push(
        `${context}.runtimeContract must be a complete ${expectedRuntimeSchema} contract for ${plan.schema}`,
      );
    } else if (!nextFinalApiSourceRefs(plan.runtimeContract).includes(plan.apiSourceRef)) {
      errors.push(`${context}.runtimeContract next final runtime set must include apiSourceRef`);
    }
  }
  if (plan.environment === "prod") {
    if (!isArtifactRef(plan.devPlan) || !isArtifactRef(plan.devExecution)) {
      errors.push(`${context} prod plan requires exact dev plan and execution references`);
    }
  } else if (plan.environment === "dev" && (plan.devPlan !== null || plan.devExecution !== null)) {
    errors.push(`${context} dev plan must not contain dev pair references`);
  }
}

function validatePlanInputSnapshots({
  plan,
  version,
  artifactPaths,
  reachable,
  readArtifact,
  readApiArtifact,
  requireTrustedApiSource,
  context,
  errors,
}) {
  if (!isPlainObject(plan)) {
    return null;
  }
  const inputs = [
    ["catalog", plan.catalog],
    ["ledgerCompatibility", plan.ledgerCompatibility],
    ...(plan.schema === maintenancePlanSchema ? [["postconditions", plan.postconditions]] : []),
  ];
  const sources = new Map();
  for (const [key, reference] of inputs) {
    if (!isArtifactRef(reference)) {
      continue;
    }
    const artifactPath =
      `content/releases/evidence/db-migrations/${version}/inputs/` +
      `${reference.sha256}/${path.posix.basename(reference.path)}`;
    if (artifactPaths && !artifactPaths.includes(artifactPath)) {
      errors.push(`${context}.${key} sealed input snapshot is missing from the evidence archive`);
      continue;
    }
    const source = readBoundArtifact({
      ref: { path: artifactPath, sha256: reference.sha256 },
      readArtifact,
      context: `${context}.${key} sealed input`,
      errors,
    });
    if (source !== null) {
      reachable.add(artifactPath);
      sources.set(key, source.toString("utf8"));
      if (typeof readApiArtifact !== "function") {
        if (requireTrustedApiSource) {
          errors.push(`${context}.${key} requires trusted API source verification`);
        }
        continue;
      }
      const trustedSource = readApiArtifact(plan.apiSourceRef, reference.path);
      if (trustedSource === null || trustedSource === undefined) {
        errors.push(
          `${context}.${key} trusted API source is missing at ${plan.apiSourceRef}:${reference.path}`,
        );
        continue;
      }
      const trustedBuffer = Buffer.isBuffer(trustedSource)
        ? trustedSource
        : Buffer.from(trustedSource);
      if (
        sha256Hex(trustedBuffer) !== reference.sha256 ||
        !trustedBuffer.equals(Buffer.from(source))
      ) {
        errors.push(`${context}.${key} sealed input must match the trusted API source bytes`);
      }
    }
  }
  const catalog = parseCanonicalInputJson(sources.get("catalog"), `${context}.catalog`, errors);
  const compatibility = parseCanonicalInputJson(
    sources.get("ledgerCompatibility"),
    `${context}.ledgerCompatibility`,
    errors,
  );
  let postconditions = null;
  if (sources.has("postconditions")) {
    postconditions = parseCanonicalInputJson(
      sources.get("postconditions"),
      `${context}.postconditions`,
      errors,
    );
  }
  validatePlanAgainstSealedInputs({
    plan,
    catalog,
    compatibility,
    postconditions,
    context,
    errors,
  });
  return { catalog, compatibility, postconditions };
}

function parseCanonicalInputJson(source, context, errors) {
  if (source === undefined) {
    return null;
  }
  let value;
  try {
    value = JSON.parse(source);
  } catch {
    errors.push(`${context} sealed input must contain valid JSON`);
    return null;
  }
  if (`${JSON.stringify(value, null, 2)}\n` !== source) {
    errors.push(`${context} sealed input must use canonical JSON formatting`);
  }
  return value;
}

function validatePlanAgainstSealedInputs({
  plan,
  catalog,
  compatibility,
  postconditions,
  context,
  errors,
}) {
  if (!isPlainObject(catalog) || !Array.isArray(catalog.migrations)) {
    if (catalog !== null) {
      errors.push(`${context}.catalog sealed input must declare migrations`);
    }
    return;
  }
  const catalogEntries = catalog.migrations;
  const catalogRefs = catalogEntries.map((entry) => ({
    file: entry?.file,
    kind: entry?.kind,
    sha256: entry?.sha256,
  }));
  const expectedRefs = planCatalogRefs(plan);
  if (
    !catalogRefs.every(isMigrationRef) ||
    new Set(catalogRefs.map((ref) => ref.file)).size !== catalogRefs.length ||
    expectedRefs === null ||
    !isDeepStrictEqual(catalogRefs, expectedRefs)
  ) {
    errors.push(`${context} must exactly partition the sealed migration catalog`);
    return;
  }
  const catalogByFile = new Map(catalogEntries.map((entry) => [entry.file, entry]));
  if (plan.baselineRefs.some((ref) => catalogByFile.get(ref.file)?.includedInBaseline !== true)) {
    errors.push(`${context}.baselineRefs must be baseline entries in the sealed catalog`);
  }
  const exactCatalogRef = (ref) => {
    const entry = catalogByFile.get(ref?.file);
    return (
      isMigrationRef(ref) &&
      entry?.kind === ref.kind &&
      entry?.sha256 === ref.sha256
    );
  };
  if (
    plan.recoveredRefs.some(
      (entry) =>
        !exactCatalogRef(entry.recoveryRef) ||
        catalogByFile.get(entry.recoveryRef.file)?.recoveryFor !== entry.ref.file,
    ) ||
    plan.supersededRefs.some((entry) => !exactCatalogRef(entry.supersedingRef)) ||
    plan.adjudicableLedgerGapRefs.some((entry) => !exactCatalogRef(entry.evidenceRef))
  ) {
    errors.push(`${context} secondary migration refs must match the sealed catalog`);
  }
  const catalogRecoveryEntries = catalogEntries.filter((entry) => entry?.kind === "recovery");
  if (
    catalogRecoveryEntries.some(
      (entry) =>
        typeof entry.recoveryFor !== "string" || !catalogByFile.has(entry.recoveryFor),
    )
  ) {
    errors.push(`${context} sealed recovery migrations must bind a catalog target`);
  }
  if (!isPlainObject(compatibility)) {
    if (compatibility !== null) {
      errors.push(`${context}.ledgerCompatibility sealed input must be an object`);
    }
    return;
  }
  const superseded = Array.isArray(compatibility.supersededMigrations)
    ? compatibility.supersededMigrations
    : [];
  const gaps = Array.isArray(compatibility.adjudicableLedgerGaps)
    ? compatibility.adjudicableLedgerGaps
    : [];
  if (
    plan.supersededRefs.some(
      (entry) =>
        !superseded.some(
          (declared) =>
            declared?.environment === plan.environment &&
            declared?.migrationFile === entry.ref.file &&
            declared?.supersededBy === entry.supersedingRef.file,
        ),
    )
  ) {
    errors.push(`${context}.supersededRefs must match the sealed compatibility input`);
  }
  if (
    plan.adjudicableLedgerGapRefs.some(
      (entry) =>
        !gaps.some(
          (declared) =>
            declared?.environment === plan.environment &&
            declared?.migrationFile === entry.ref.file &&
            declared?.evidenceMigrationFile === entry.evidenceRef.file,
        ),
    )
  ) {
    errors.push(`${context}.adjudicableLedgerGapRefs must match the sealed compatibility input`);
  }
  validatePostconditionManifest({ plan, catalogByFile, postconditions, context, errors });
}

function nextFinalApiSourceRefs(runtimeContract) {
  const nextRuntimeSetIds = new Set(
    runtimeContract.runtimeSets
      .filter((runtimeSet) => runtimeSet.release === "next")
      .map((runtimeSet) => runtimeSet.id),
  );
  const runtimeSetId = runtimeContract.mixtures.find(
    (mixture) =>
      nextRuntimeSetIds.has(mixture.runtimeSetId) &&
      mixture.schemaState === "plan-final" &&
      mixture.allowedPhases.includes("RESUMED") &&
      mixture.boundaryResults.every((result) => result.result === "supported"),
  )?.runtimeSetId;
  return runtimeContract.runtimeSets
    .find((runtimeSet) => runtimeSet.id === runtimeSetId)
    ?.units.filter((unit) => unit.kind === "api")
    .map((unit) => unit.sourceRef) ?? [];
}

function validatePostconditionManifest({ plan, catalogByFile, postconditions, context, errors }) {
  if (!isPlainObject(postconditions) || postconditions.version !== 1 || !Array.isArray(postconditions.entries)) {
    errors.push(`${context}.postconditions sealed input must declare version 1 entries`);
    return;
  }
  const entriesByFile = new Map();
  for (const entry of postconditions.entries) {
    if (
      !isPlainObject(entry) ||
      typeof entry.migrationFile !== "string" ||
      !catalogByFile.has(entry.migrationFile) ||
      entriesByFile.has(entry.migrationFile) ||
      !isPlainObject(entry.check) ||
      !sha256Pattern.test(entry.check.sha256 ?? "")
    ) {
      errors.push(`${context}.postconditions sealed input contains an invalid or duplicate entry`);
      return;
    }
    entriesByFile.set(entry.migrationFile, entry.check.sha256);
  }
  for (const ref of plan.pendingRefs) {
    if (!entriesByFile.has(ref.file)) {
      errors.push(`${context}.pendingRefs requires a sealed live postcondition for ${ref.file}`);
    }
  }
}

function validateExecutionPostconditionBindings({ events, catalog, postconditions, context, errors }) {
  if (!Array.isArray(events)) {
    return;
  }
  const completed = events.find((event) => event?.type === "database-completed");
  if (
    completed &&
    isPlainObject(completed.data) &&
    isPlainObject(catalog) &&
    Array.isArray(catalog.migrations) &&
    completed.data.ledgerCount !== catalog.migrations.length
  ) {
    errors.push(`${context} ledger count must match the sealed migration catalog`);
  }
  if (!isPlainObject(postconditions) || !Array.isArray(postconditions.entries)) {
    return;
  }
  const checks = new Map(
    postconditions.entries
      .filter((entry) => typeof entry?.migrationFile === "string")
      .map((entry) => [entry.migrationFile, entry.check?.sha256]),
  );
  for (const event of events) {
    if (!isPlainObject(event) || !isPlainObject(event.data)) {
      continue;
    }
    if (
      event.type !== "migration-sql-succeeded" &&
      event.type !== "migration-outcome-adjudicated" &&
      event.type !== "migration-ledger-gap-adjudicated"
    ) {
      continue;
    }
    if (!isMigrationRef(event.data.ref)) {
      continue;
    }
    const refSha256 = checks.get(event.data.ref.file);
    if (isMigrationRef(event.data.recoveryFor)) {
      const targetSha256 = checks.get(event.data.recoveryFor.file);
      if (
        event.data.recoveryPostconditionSha256 !== refSha256 ||
        event.data.targetPostconditionSha256 !== targetSha256
      ) {
        errors.push(`${context} recovery postcondition evidence must match the sealed manifest`);
      }
    } else if (event.data.postconditionSha256 !== refSha256) {
      errors.push(`${context} migration postcondition evidence must match the sealed manifest`);
    }
  }
}

function validateExecutionEnvelope({
  source,
  plan,
  environment,
  planSha256,
  requireCompleted,
  failedPlan,
  context,
  errors,
}) {
  const text = source.toString("utf8");
  if (text.length === 0 || !text.endsWith("\n")) {
    errors.push(`${context} must be a non-empty newline-terminated JSONL artifact`);
    return null;
  }
  const lines = text.slice(0, -1).split("\n");
  const events = [];
  for (const [index, line] of lines.entries()) {
    let event;
    try {
      event = JSON.parse(line);
    } catch {
      errors.push(`${context} line ${index + 1} must contain valid JSON`);
      continue;
    }
    events.push(event);
    const eventContext = `${context} line ${index + 1}`;
    if (!isPlainObject(event)) {
      errors.push(`${eventContext} must be an event object`);
      continue;
    }
    validateExactKeys(
      event,
      ["schema", "sequence", "at", "environment", "planSha256", "type", "data"],
      eventContext,
      errors,
    );
    if (event.schema !== maintenanceEventSchema) {
      errors.push(`${eventContext}.schema must be ${maintenanceEventSchema}`);
    }
    if (event.sequence !== index + 1) {
      errors.push(`${eventContext}.sequence must be ${index + 1}`);
    }
    if (!isIsoUtcTimestamp(event.at)) {
      errors.push(`${eventContext}.at must be an ISO-8601 UTC timestamp`);
    }
    if (event.environment !== environment || event.planSha256 !== planSha256) {
      errors.push(`${eventContext} must bind ${environment} and the exact plan SHA-256`);
    }
    if (!maintenanceEventTypes.has(event.type)) {
      errors.push(`${eventContext}.type is not allowed`);
    }
    if (!isPlainObject(event.data)) {
      errors.push(`${eventContext}.data must be an object`);
    } else if (event.type === "phase-fenced") {
      validatePhaseFencedData(event.data, `${eventContext}.data`, errors);
    } else if (event.type === "fence-reverified") {
      validateFenceReverifiedData(event.data, `${eventContext}.data`, errors);
    } else if (event.type === "database-completed") {
      validateExactKeys(event.data, ["catalogSha256", "ledgerCount"], `${eventContext}.data`, errors);
      if (
        !sha256Pattern.test(event.data.catalogSha256 ?? "") ||
        !Number.isSafeInteger(event.data.ledgerCount) ||
        event.data.ledgerCount < 0
      ) {
        errors.push(`${eventContext}.data must contain the catalog SHA-256 and ledger count`);
      }
    } else if (event.type === "lock-released") {
      validateExactKeys(event.data, [], `${eventContext}.data`, errors);
    } else if (event.type === "fenced-smoke-completed") {
      validateFencedSmokeCompletedData(event.data, `${eventContext}.data`, errors);
    } else if (event.type === "phase-resumed") {
      validatePhaseResumedData(event.data, `${eventContext}.data`, errors);
    } else if (event.type === "phase-recovering") {
      validatePhaseRecoveringData(event.data, `${eventContext}.data`, errors);
    } else if (event.type === "recovery-completed") {
      validateRecoveryCompletedData(event.data, `${eventContext}.data`, errors);
    } else if (event.type === "migration-started") {
      validateMigrationStartedData(event.data, `${eventContext}.data`, errors);
    } else if (event.type === "migration-sql-succeeded") {
      validateMigrationSqlSucceededData(event.data, `${eventContext}.data`, errors);
    } else if (
      ["migration-ledger-succeeded", "migration-ledger-repaired", "artifact-reconciled"].includes(
        event.type,
      )
    ) {
      validateMigrationResolutionData(event.data, `${eventContext}.data`, errors);
    } else if (event.type === "migration-outcome-adjudicated") {
      validateMigrationOutcomeAdjudicatedData(event.data, `${eventContext}.data`, errors);
    } else if (event.type === "migration-ledger-gap-adjudicated") {
      validateMigrationLedgerGapAdjudicatedData({
        value: event.data,
        plan,
        context: `${eventContext}.data`,
        errors,
      });
    } else if (event.type === "service-completed") {
      validateServiceCompletedData(event.data, `${eventContext}.data`, errors);
    } else if (event.type === "migration-failed") {
      validateMigrationFailedData(event.data, `${eventContext}.data`, errors);
    }
  }
  const runtimeContractSchema = plan?.runtimeContract?.schema;
  if (
    ["db-migration-runtime-contract/v1", "db-migration-runtime-contract/v2"].includes(
      runtimeContractSchema,
    ) &&
    events.some((event) => {
      const runtimeSet = eventRuntimeSet(event);
      return runtimeSet !== null && !isRuntimeSet(runtimeSet, runtimeContractSchema);
    })
  ) {
    errors.push(`${context} runtime units must match the plan runtime contract generation`);
  }
  if (
    events.some((event) => {
      const mixture = eventRuntimeMixture(event);
      const phase = eventRuntimePhase(event);
      return mixture !== null && phase !== null && !isDeclaredRuntimeMixture(plan, mixture, phase);
    })
  ) {
    errors.push(`${context} runtime mixtures must match the exact plan declarations`);
  }
  if (events.some((event) => !eventRuntimeInventoryMatches(event))) {
    errors.push(`${context} runtime inventories must match their exact runtime sets`);
  }
  if (events.some((event) => !eventRuntimeContractMatches(plan, event))) {
    errors.push(`${context} runtime evidence must match the exact plan contract`);
  }
  validateMigrationEventHistory({ events, plan, context, errors });
  validateOptionalRuntimeEventHistory({ events, plan, context, errors });
  if (requireCompleted) {
    validateCompletedExecutionHistory({ events, plan, context, errors });
  }
  if (failedPlan !== null) {
    const failedPendingRefs = Array.isArray(failedPlan?.pendingRefs)
      ? failedPlan.pendingRefs.filter(isMigrationRef)
      : [];
    const hasCausalPendingFailure = failedPendingRefs.some((ref) =>
      failedExecutionHasCausalTargetFailure(events, ref),
    );
    if (
      !hasCausalPendingFailure ||
      events.some((event) => event?.type === "database-completed")
    ) {
      errors.push(
        `${context} must prove one unresolved causal SQL or postcondition failure for a pending migration`,
      );
    }
  }
  return events;
}

function validateRecoveryPlanBinding({
  plan,
  executionEvents,
  recoveryRef,
  failedPlan,
  failedEvents,
  catalog,
  currentPostconditions,
  failedPostconditions,
  context,
  errors,
}) {
  const currentRefs = planCatalogRefs(plan);
  const failedRefs = planCatalogRefs(failedPlan);
  if (currentRefs === null || failedRefs === null || !isMigrationRef(recoveryRef)) {
    return;
  }
  const appendedRefs = currentRefs.slice(failedRefs.length);
  if (
    !isDeepStrictEqual(currentRefs.slice(0, failedRefs.length), failedRefs) ||
    appendedRefs.length !== 1 ||
    !sameMigrationRef(appendedRefs[0], recoveryRef)
  ) {
    errors.push(
      `${context}.plan recovery catalog must equal the failed catalog plus one appended recovery migration`,
    );
  }
  const currentEntries = currentPostconditions?.entries;
  const failedEntries = failedPostconditions?.entries;
  if (
    !Array.isArray(currentEntries) ||
    !Array.isArray(failedEntries) ||
    currentEntries.length !== failedEntries.length + 1 ||
    !isDeepStrictEqual(currentEntries.slice(0, failedEntries.length), failedEntries) ||
    currentEntries.at(-1)?.migrationFile !== recoveryRef.file
  ) {
    errors.push(
      `${context}.plan recovery postconditions must preserve the failed manifest and append only the recovery entry`,
    );
  }
  if (!Array.isArray(failedEvents)) {
    return;
  }
  const causalTargets = failedPlan.pendingRefs.filter((ref) =>
    failedExecutionHasCausalTargetFailure(failedEvents, ref),
  );
  const recoveryCatalogEntry = Array.isArray(catalog?.migrations)
    ? catalog.migrations.find((entry) => entry?.file === recoveryRef.file)
    : null;
  if (
    causalTargets.length === 1 &&
    recoveryCatalogEntry?.recoveryFor !== causalTargets[0].file
  ) {
    errors.push(`${context}.plan recoveryFor must equal the failed history causal target`);
  }
  if (!Array.isArray(executionEvents)) {
    return;
  }
  const recoveryTargets = executionEvents
    .filter(
      (event) =>
        migrationEventTypes.has(event?.type) &&
        sameMigrationRefData(event?.data?.ref, recoveryRef),
    )
    .map((event) => event.data.recoveryFor ?? event.data.recoveredRef)
    .filter(isMigrationRef);
  const uniqueRecoveryTargets = recoveryTargets.filter(
    (target, index) =>
      recoveryTargets.findIndex((candidate) => sameMigrationRef(candidate, target)) === index,
  );
  if (
    causalTargets.length !== 1 ||
    uniqueRecoveryTargets.length !== 1 ||
    !sameMigrationRef(causalTargets[0], uniqueRecoveryTargets[0])
  ) {
    errors.push(
      `${context}.execution recovery target must equal the failed history causal target`,
    );
  }
}

function failedExecutionHasCausalTargetFailure(events, targetRef) {
  const exactTarget = (event) => sameMigrationRefData(event?.data?.ref, targetRef);
  return events.some((event, failureIndex) => {
    if (!exactTarget(event) || !eventProvesSqlOrPostconditionFailure(event, targetRef)) {
      return false;
    }
    let startIndex = -1;
    for (let index = failureIndex - 1; index >= 0; index -= 1) {
      const candidate = events[index];
      if (candidate?.type === "migration-started" && exactTarget(candidate)) {
        startIndex = index;
        break;
      }
    }
    if (startIndex < 0) {
      return false;
    }
    const terminalBeforeFailure = events
      .slice(startIndex + 1, failureIndex)
      .some(
        (candidate) =>
          exactTarget(candidate) &&
          (candidate?.type === "migration-failed" ||
            candidate?.type === "migration-outcome-adjudicated" ||
            migrationResolutionTypes.has(candidate?.type)),
      );
    const resolvedAfterFailure = events
      .slice(failureIndex + 1)
      .some(
        (candidate) =>
          candidate?.type === "database-completed" ||
          (exactTarget(candidate) && migrationResolutionTypes.has(candidate?.type)),
      );
    return !terminalBeforeFailure && !resolvedAfterFailure;
  });
}

function eventProvesSqlOrPostconditionFailure(event, targetRef) {
  return (
    sameMigrationRefData(event?.data?.ref, targetRef) &&
    ((event?.type === "migration-failed" &&
      event.data.phase === "sql-or-postcondition") ||
      (event?.type === "migration-outcome-adjudicated" &&
        event.data.outcome === "postcondition-failed-ledger-missing"))
  );
}

function validateCompletedExecutionHistory({ events, plan, context, errors }) {
  const databaseCompletedIndex = events
    .map((event) => event?.type)
    .lastIndexOf("database-completed");
  const lockReleasedIndex = events.findIndex(
    (event, index) => index > databaseCompletedIndex && event?.type === "lock-released",
  );
  const fencedSmokeIndex = events.findIndex(
    (event, index) => index > lockReleasedIndex && event?.type === "fenced-smoke-completed",
  );
  const phaseResumedIndex = events.findIndex(
    (event, index) => index > fencedSmokeIndex && event?.type === "phase-resumed",
  );
  const lastPhaseResumedIndex = events
    .map((event) => event?.type)
    .lastIndexOf("phase-resumed");
  const serviceCompletedIndex = events.length - 1;
  const finalService = events[serviceCompletedIndex];

  if (
    events[0]?.type !== "phase-fenced" ||
    databaseCompletedIndex < 0 ||
    lockReleasedIndex < 0 ||
    fencedSmokeIndex < 0 ||
    phaseResumedIndex < 0 ||
    finalService?.type !== "service-completed" ||
    lastPhaseResumedIndex >= serviceCompletedIndex
  ) {
    errors.push(
      `${context} must prove phase-fenced -> database-completed -> lock-released -> fenced-smoke-completed -> phase-resumed -> service-completed`,
    );
    return;
  }

  const databaseCompleted = events[databaseCompletedIndex];
  if (databaseCompleted?.data?.catalogSha256 !== plan?.catalog?.sha256) {
    errors.push(`${context} database-completed must bind the exact plan catalog SHA-256`);
  }
  validateCompletedMigrationResolutions({
    events: events.slice(0, databaseCompletedIndex),
    pendingRefs: Array.isArray(plan?.pendingRefs) ? plan.pendingRefs : [],
    context,
    errors,
  });

  const activeResume = events[lastPhaseResumedIndex];
  if (!isDeepStrictEqual(finalService.data.activeMixture, activeResume?.data?.mixture)) {
    errors.push(`${context} service-completed active mixture must match the active RESUMED mixture`);
  }

  const runtimeContractSha256 = isPlainObject(plan?.runtimeContract)
    ? sha256Hex(`${JSON.stringify(plan.runtimeContract, null, 2)}\n`)
    : null;
  if (finalService.data.runtimeContractSha256 !== runtimeContractSha256) {
    errors.push(`${context} service-completed must bind the exact plan runtime contract SHA-256`);
  }
}

function validateCompletedMigrationResolutions({
  events,
  pendingRefs,
  context,
  errors,
}) {
  if (!pendingRefs.every(isMigrationRef)) {
    return;
  }
  const plannedByFile = new Map(pendingRefs.map((ref) => [ref.file, ref]));
  const resolvedAt = new Map();

  for (const [index, event] of events.entries()) {
    if (!migrationResolutionTypes.has(event?.type) || !isPlainObject(event.data)) {
      continue;
    }
    const ref = event.data.ref;
    const recoveredRef = event.data.recoveredRef;
    const plannedRef = isMigrationRef(ref) ? plannedByFile.get(ref.file) : null;
    const plannedRecoveredRef = isMigrationRef(recoveredRef)
      ? plannedByFile.get(recoveredRef.file)
      : null;
    if (
      !plannedRef ||
      !sameMigrationRef(plannedRef, ref) ||
      (recoveredRef !== undefined &&
        (!plannedRecoveredRef || !sameMigrationRef(plannedRecoveredRef, recoveredRef)))
    ) {
      errors.push(`${context} migration resolution must bind exact pending plan references`);
      continue;
    }
    for (const resolvedRef of [ref, recoveredRef].filter(isMigrationRef)) {
      if (resolvedAt.has(resolvedRef.file)) {
        errors.push(`${context} migration ${resolvedRef.file} is resolved more than once`);
      } else {
        resolvedAt.set(resolvedRef.file, index);
      }
    }
  }

  const unresolved = pendingRefs.filter((ref) => !resolvedAt.has(ref.file));
  if (unresolved.length > 0) {
    errors.push(
      `${context} database-completed is missing causal migration resolution: ${unresolved
        .map((ref) => ref.file)
        .join(", ")}`,
    );
  }
}

function validateMigrationEventHistory({ events, plan, context, errors }) {
  const accepted = [];
  for (const event of events) {
    if (
      migrationEventTypes.has(event?.type) &&
      !isMigrationEventAdmissible(plan, accepted, event)
    ) {
      errors.push(
        `${context} migration event ${event?.sequence ?? accepted.length + 1} is not admissible in v3 history`,
      );
    }
    accepted.push(event);
  }
}

function isMigrationEventAdmissible(plan, events, event) {
  if (!isPlainObject(event?.data) || !isMigrationRef(event.data.ref)) {
    return false;
  }
  const ref = event.data.ref;
  const pendingRefs = Array.isArray(plan?.pendingRefs) ? plan.pendingRefs : [];
  const plannedIndex = pendingRefs.findIndex(
    (candidate) => isMigrationRef(candidate) && sameMigrationRef(candidate, ref),
  );
  if (plannedIndex < 0) {
    return false;
  }
  const target = event.data.recoveryFor ?? event.data.recoveredRef ?? null;
  if ((ref.kind === "recovery") !== (target !== null)) {
    return false;
  }

  if (event.type === "migration-started") {
    return (
      !events.some(
        (candidate) =>
          candidate?.type === "migration-started" &&
          sameMigrationRefData(candidate?.data?.ref, ref),
      ) && isMigrationOperationNext(plan, events, event, plannedIndex)
    );
  }

  const previous = events.at(-1);
  if (event.type === "migration-sql-succeeded") {
    return previous?.type === "migration-started" && sameMigrationOperation(previous, event);
  }
  if (event.type === "migration-ledger-succeeded") {
    return previous?.type === "migration-sql-succeeded" && sameMigrationOperation(previous, event);
  }
  if (event.type === "migration-failed") {
    const requiredPreviousType =
      event.data.phase === "ledger" ? "migration-sql-succeeded" : "migration-started";
    return previous?.type === requiredPreviousType && sameMigrationOperation(previous, event);
  }
  if (event.type === "migration-outcome-adjudicated") {
    if (migrationReconciliationMode(events, ref) !== "apply") {
      return false;
    }
    const start = [...events]
      .reverse()
      .find(
        (candidate) =>
          candidate?.type === "migration-started" &&
          sameMigrationRefData(candidate?.data?.ref, ref),
      );
    return Boolean(start) && sameMigrationOperation(start, event);
  }
  if (event.type === "migration-ledger-gap-adjudicated") {
    const declaredGap = Array.isArray(plan?.adjudicableLedgerGapRefs)
      ? plan.adjudicableLedgerGapRefs.some(
          (entry) =>
            isAdjudicableLedgerGapRef(entry) &&
            sameMigrationRef(entry.ref, ref) &&
            sameMigrationRefData(entry.evidenceRef, event.data.evidenceRef),
        )
      : false;
    return (
      declaredGap &&
      ref.kind !== "recovery" &&
      !events.some(
        (candidate) =>
          candidate?.type === "migration-started" &&
          sameMigrationRefData(candidate?.data?.ref, ref),
      ) &&
      isMigrationOperationNext(plan, events, event, plannedIndex)
    );
  }
  if (event.type === "migration-ledger-repaired") {
    if (!isMigrationLedgerRepairEligible(events, ref)) {
      return false;
    }
    if (
      events.some(
        (candidate) =>
          candidate?.type === "migration-ledger-gap-adjudicated" &&
          sameMigrationRefData(candidate?.data?.ref, ref),
      )
    ) {
      return true;
    }
  } else if (event.type === "artifact-reconciled") {
    if (migrationReconciliationMode(events, ref) === null) {
      return false;
    }
    if (
      events.some(
        (candidate) =>
          candidate?.type === "migration-ledger-gap-adjudicated" &&
          sameMigrationRefData(candidate?.data?.ref, ref),
      )
    ) {
      return true;
    }
  }
  const start = events.find(
    (candidate) =>
      candidate?.type === "migration-started" &&
      sameMigrationRefData(candidate?.data?.ref, ref),
  );
  return Boolean(start) && sameMigrationOperation(start, event);
}

function isMigrationOperationNext(plan, events, event, plannedIndex) {
  if (!isMigrationExecutionApplicable(events)) {
    return false;
  }
  const pendingRefs = plan.pendingRefs;
  const resolved = migrationResolutionFiles(events);
  const ref = event.data.ref;
  const target = event.data.recoveryFor ?? event.data.recoveredRef ?? null;
  if (ref.kind === "recovery") {
    const targetIndex = isMigrationRef(target)
      ? pendingRefs.findIndex(
          (candidate) => isMigrationRef(candidate) && sameMigrationRef(candidate, target),
        )
      : -1;
    return (
      targetIndex >= 0 &&
      targetIndex < plannedIndex &&
      !resolved.has(target.file) &&
      !pendingRefs.slice(0, targetIndex).some((candidate) => !resolved.has(candidate.file)) &&
      !pendingRefs.slice(0, plannedIndex).some((candidate) => candidate.kind === "recovery")
    );
  }
  return !pendingRefs.slice(0, plannedIndex).some((candidate) => !resolved.has(candidate.file));
}

function isMigrationExecutionApplicable(events) {
  if (events.some((event) => event?.type === "database-completed")) {
    return false;
  }
  const repaired = new Set(
    events
      .filter((event) =>
        ["migration-ledger-repaired", "artifact-reconciled"].includes(event?.type),
      )
      .map((event) => event?.data?.ref)
      .filter(isMigrationRef)
      .map((ref) => ref.file),
  );
  for (const event of events) {
    const ref = event?.data?.ref;
    if (!isMigrationRef(ref)) {
      continue;
    }
    if (event.type === "migration-ledger-gap-adjudicated" && !repaired.has(ref.file)) {
      return false;
    }
    if (event.type === "migration-outcome-adjudicated") {
      if (event.data.outcome === "postcondition-failed-ledger-missing") {
        return false;
      }
      if (
        event.data.outcome === "postcondition-passed-ledger-missing" &&
        !repaired.has(ref.file)
      ) {
        return false;
      }
    }
    if (event.type === "migration-failed") {
      if (event.data.phase === "sql-or-postcondition") {
        return false;
      }
      if (event.data.phase === "ledger" && !repaired.has(ref.file)) {
        return false;
      }
    }
  }
  return events.every((event, index) => {
    if (event?.type !== "migration-started" || !isMigrationRef(event?.data?.ref)) {
      return true;
    }
    return events.slice(index + 1).some(
      (candidate) =>
        migrationTerminalTypes.has(candidate?.type) &&
        candidate?.data?.ref?.file === event.data.ref.file,
    );
  });
}

function migrationReconciliationMode(events, ref) {
  const hasUnresolvedStart = events.some((event, index) => {
    if (
      event?.type !== "migration-started" ||
      event?.data?.ref?.file !== ref.file
    ) {
      return false;
    }
    return !events
      .slice(index + 1)
      .some(
        (candidate) =>
          migrationTerminalTypes.has(candidate?.type) &&
          candidate?.data?.ref?.file === ref.file,
      );
  });
  if (hasUnresolvedStart) {
    return "apply";
  }
  if (
    events.some(
      (event) =>
        ["migration-outcome-adjudicated", "migration-ledger-gap-adjudicated"].includes(
          event?.type,
        ) &&
        event?.data?.outcome === "postcondition-passed-ledger-missing" &&
        event?.data?.ref?.file === ref.file,
    )
  ) {
    return "repair";
  }
  return events.some(
    (event, index) =>
      event?.type === "migration-failed" &&
      event?.data?.phase === "ledger" &&
      event?.data?.ref?.file === ref.file &&
      !events
        .slice(index + 1)
        .some(
          (candidate) =>
            ["migration-ledger-repaired", "artifact-reconciled"].includes(candidate?.type) &&
            candidate?.data?.ref?.file === ref.file,
        ),
  )
    ? "repair"
    : null;
}

function isMigrationLedgerRepairEligible(events, ref) {
  const adjudicatedSuccess = events.some(
    (event) =>
      event?.type === "migration-outcome-adjudicated" &&
      event?.data?.ref?.file === ref.file &&
      event?.data?.outcome === "postcondition-passed-ledger-missing",
  );
  const adjudicatedLedgerGap = events.some(
    (event) =>
      event?.type === "migration-ledger-gap-adjudicated" &&
      event?.data?.ref?.file === ref.file &&
      event?.data?.outcome === "postcondition-passed-ledger-missing",
  );
  const ledgerFailureIndex = events.findIndex(
    (event) =>
      event?.type === "migration-failed" &&
      event?.data?.ref?.file === ref.file &&
      event?.data?.phase === "ledger",
  );
  const sqlSuccessIndex = events.findIndex(
    (event) =>
      event?.type === "migration-sql-succeeded" && event?.data?.ref?.file === ref.file,
  );
  return (
    (adjudicatedSuccess ||
      adjudicatedLedgerGap ||
      (sqlSuccessIndex >= 0 && ledgerFailureIndex === sqlSuccessIndex + 1)) &&
    !events.some(
      (event) =>
        event?.type === "migration-ledger-repaired" && event?.data?.ref?.file === ref.file,
    )
  );
}

function migrationResolutionFiles(events) {
  const files = new Set();
  for (const event of events) {
    if (!migrationResolutionTypes.has(event?.type)) {
      continue;
    }
    for (const ref of [event?.data?.ref, event?.data?.recoveredRef].filter(isMigrationRef)) {
      files.add(ref.file);
    }
  }
  return files;
}

function validateMigrationStartedData(value, context, errors) {
  const expectedKeys = Object.hasOwn(value, "recoveryFor")
    ? ["ref", "recoveryFor"]
    : ["ref"];
  validateExactKeys(value, expectedKeys, context, errors);
  if (
    !isMigrationRef(value.ref) ||
    (Object.hasOwn(value, "recoveryFor") && !isMigrationRef(value.recoveryFor))
  ) {
    errors.push(`${context} must bind a closed migration operation`);
  }
}

function validateMigrationSqlSucceededData(value, context, errors) {
  const recovery = Object.hasOwn(value, "recoveryFor");
  validateExactKeys(
    value,
    recovery
      ? ["ref", "recoveryFor", "targetPostconditionSha256", "recoveryPostconditionSha256"]
      : ["ref", "postconditionSha256"],
    context,
    errors,
  );
  if (
    !isMigrationRef(value.ref) ||
    (recovery && !isMigrationRef(value.recoveryFor)) ||
    ["postconditionSha256", "targetPostconditionSha256", "recoveryPostconditionSha256"].some(
      (key) => Object.hasOwn(value, key) && !sha256Pattern.test(value[key] ?? ""),
    )
  ) {
    errors.push(`${context} must bind a closed migration operation and postcondition digests`);
  }
}

function validateMigrationResolutionData(value, context, errors) {
  const recovery = Object.hasOwn(value, "recoveredRef");
  validateExactKeys(value, recovery ? ["ref", "recoveredRef"] : ["ref"], context, errors);
  if (
    !isMigrationRef(value.ref) ||
    (recovery && !isMigrationRef(value.recoveredRef)) ||
    ((value.ref?.kind === "recovery") !== recovery)
  ) {
    errors.push(`${context} must bind exact normal or recovery migration references`);
  }
}

function validateMigrationOutcomeAdjudicatedData(value, context, errors) {
  const recovery = Object.hasOwn(value, "recoveryFor");
  validateExactKeys(
    value,
    recovery
      ? [
          "ref",
          "recoveryFor",
          "outcome",
          "targetPostconditionSha256",
          "recoveryPostconditionSha256",
          "adjudicationResult",
          "resolution",
        ]
      : ["ref", "outcome", "postconditionSha256", "adjudicationResult", "resolution"],
    context,
    errors,
  );
  const validOutcome = [
    "postcondition-passed-ledger-missing",
    "postcondition-failed-ledger-missing",
  ].includes(value.outcome);
  const validResolution = [
    "ledger-only-repair",
    "append-only-recovery-required",
    "manual-review-required",
  ].includes(value.resolution);
  const validOutcomeResolution =
    (value.outcome === "postcondition-passed-ledger-missing" &&
      value.resolution === "ledger-only-repair") ||
    (value.outcome === "postcondition-failed-ledger-missing" &&
      value.resolution !== "ledger-only-repair");
  if (
    !isMigrationRef(value.ref) ||
    (recovery && !isMigrationRef(value.recoveryFor)) ||
    ((value.ref?.kind === "recovery") !== recovery) ||
    !validOutcome ||
    !validResolution ||
    !validOutcomeResolution ||
    !isAdjudicationEvidenceResult(
      value.adjudicationResult,
      "db-migration-outcome-adjudication/v1",
    ) ||
    ["postconditionSha256", "targetPostconditionSha256", "recoveryPostconditionSha256"].some(
      (key) => Object.hasOwn(value, key) && !sha256Pattern.test(value[key] ?? ""),
    )
  ) {
    errors.push(`${context} must use the closed v3 migration outcome adjudication shape`);
  }
}

function validateMigrationLedgerGapAdjudicatedData({ value, plan, context, errors }) {
  validateExactKeys(
    value,
    ["ref", "evidenceRef", "outcome", "postconditionSha256", "adjudicationResult", "resolution"],
    context,
    errors,
  );
  const declaredGap = Array.isArray(plan?.adjudicableLedgerGapRefs)
    ? plan.adjudicableLedgerGapRefs.find(
        (entry) =>
          isAdjudicableLedgerGapRef(entry) &&
          isMigrationRef(value.ref) &&
          isMigrationRef(value.evidenceRef) &&
          sameMigrationRef(entry.ref, value.ref) &&
          sameMigrationRef(entry.evidenceRef, value.evidenceRef),
      )
    : null;
  if (
    !isMigrationRef(value.ref) ||
    value.ref?.kind === "recovery" ||
    !isMigrationRef(value.evidenceRef) ||
    value.outcome !== "postcondition-passed-ledger-missing" ||
    value.resolution !== "ledger-only-repair" ||
    !sha256Pattern.test(value.postconditionSha256 ?? "") ||
    !isAdjudicationEvidenceResult(
      value.adjudicationResult,
      "db-migration-ledger-gap-adjudication/v1",
    ) ||
    !declaredGap
  ) {
    errors.push(`${context} must match one sealed plan ledger gap and its closed v3 evidence`);
  }
}

function isAdjudicationEvidenceResult(value, procedureRef) {
  return (
    isPlainObject(value) &&
    hasExactKeys(value, ["procedureRef", "resultRef"]) &&
    value.procedureRef === procedureRef &&
    isNonEmptyText(value.resultRef) &&
    value.resultRef !== value.procedureRef
  );
}

function sameMigrationRefData(left, right) {
  return isMigrationRef(left) && isMigrationRef(right) && sameMigrationRef(left, right);
}

function sameMigrationOperation(left, right) {
  if (!sameMigrationRefData(left?.data?.ref, right?.data?.ref)) {
    return false;
  }
  const leftTarget = left.data.recoveryFor ?? left.data.recoveredRef ?? null;
  const rightTarget = right.data.recoveryFor ?? right.data.recoveredRef ?? null;
  if (leftTarget === null || rightTarget === null) {
    return leftTarget === rightTarget;
  }
  return sameMigrationRefData(leftTarget, rightTarget);
}

function validatePhaseFencedData(value, context, errors) {
  validateExactKeys(
    value,
    [
      "tlsCipher",
      "writerInventorySha256",
      "writers",
      "backup",
      "sessions",
      "transactions",
      "mixture",
    ],
    context,
    errors,
  );
  if (
    !isConcreteText(value.tlsCipher) ||
    !sha256Pattern.test(value.writerInventorySha256 ?? "") ||
    !isWriterInventoryEntries(value.writers) ||
    !isPlainObject(value.backup) ||
    !hasExactKeys(value.backup, ["ref", "sha256"]) ||
    !isConcreteText(value.backup.ref) ||
    !sha256Pattern.test(value.backup.sha256 ?? "") ||
    value.sessions !== 0 ||
    value.transactions !== 0 ||
    !isActualRuntimeMixture(value.mixture) ||
    value.mixture.schemaState !== "plan-start"
  ) {
    errors.push(`${context} must contain the durable plan-start FENCED evidence`);
  }
}

function validateFenceReverifiedData(value, context, errors) {
  validateExactKeys(
    value,
    [
      "tlsCipher",
      "writerInventorySha256",
      "writers",
      "backup",
      "sessions",
      "transactions",
      "runtimeSet",
      "schemaFingerprintSha256",
    ],
    context,
    errors,
  );
  if (
    !isConcreteText(value.tlsCipher) ||
    !sha256Pattern.test(value.writerInventorySha256 ?? "") ||
    !isWriterInventoryEntries(value.writers) ||
    !isPlainObject(value.backup) ||
    !hasExactKeys(value.backup, ["ref", "sha256"]) ||
    !isConcreteText(value.backup.ref) ||
    !sha256Pattern.test(value.backup.sha256 ?? "") ||
    value.sessions !== 0 ||
    value.transactions !== 0 ||
    !isRuntimeSet(value.runtimeSet) ||
    !sha256Pattern.test(value.schemaFingerprintSha256 ?? "")
  ) {
    errors.push(`${context} must use the closed v3 FENCED re-verification shape`);
  }
}

function validateFencedSmokeCompletedData(value, context, errors) {
  validateExactKeys(
    value,
    ["mixture", "mode", "modeEvidence", "smokeResult", "surfaceResiduals"],
    context,
    errors,
  );
  if (
    !isActualRuntimeMixture(value.mixture) ||
    value.mixture.schemaState !== "plan-final" ||
    !["read-only", "transaction-rollback", "isolated-synthetic"].includes(value.mode) ||
    !isFencedSmokeModeEvidence(value.modeEvidence) ||
    value.modeEvidence?.mode !== value.mode ||
    !isEvidenceResult(value.smokeResult) ||
    !Array.isArray(value.surfaceResiduals) ||
    !value.surfaceResiduals.every(isSurfaceResidual)
  ) {
    errors.push(`${context} must contain plan-final FENCED smoke evidence`);
  }
}

function validatePhaseResumedData(value, context, errors) {
  validateExactKeys(value, ["mixture", "resumeEvidence", "startWatermarks"], context, errors);
  if (
    !isActualRuntimeMixture(value.mixture) ||
    value.mixture.schemaState !== "plan-final" ||
    !isConcreteText(value.resumeEvidence) ||
    !Array.isArray(value.startWatermarks) ||
    !value.startWatermarks.every(isSurfaceWatermark)
  ) {
    errors.push(`${context} must contain plan-final RESUMED evidence`);
  }
}

function validatePhaseRecoveringData(value, context, errors) {
  validateExactKeys(
    value,
    [
      "strategy",
      "startEvidence",
      "writerInventorySha256",
      "writers",
      "sessions",
      "transactions",
      "sourceMixture",
      "endWatermarks",
    ],
    context,
    errors,
  );
  if (
    !isRecoveryStrategy(value.strategy) ||
    !isConcreteText(value.startEvidence) ||
    !sha256Pattern.test(value.writerInventorySha256 ?? "") ||
    !isWriterInventoryEntries(value.writers) ||
    value.sessions !== 0 ||
    value.transactions !== 0 ||
    !isActualRuntimeMixture(value.sourceMixture) ||
    !Array.isArray(value.endWatermarks) ||
    !value.endWatermarks.every(isSurfaceWatermark)
  ) {
    errors.push(`${context} must use the closed v3 RECOVERING shape`);
  }
}

function validateRecoveryCompletedData(value, context, errors) {
  validateExactKeys(
    value,
    ["strategy", "targetMixture", "recoveryResult", "statePostcondition", "effectRecovery"],
    context,
    errors,
  );
  if (
    !isRecoveryStrategy(value.strategy) ||
    !isActualRuntimeMixture(value.targetMixture) ||
    !isEvidenceResult(value.recoveryResult) ||
    !isEvidenceResult(value.statePostcondition) ||
    !isEffectRecoveryEvidence(value.effectRecovery)
  ) {
    errors.push(`${context} must use the closed v3 recovery completion shape`);
  }
}

function validateOptionalRuntimeEventHistory({ events, plan, context, errors }) {
  let resumedCount = 0;
  let recoveringCount = 0;
  let completedRecoveryCount = 0;
  let latestRecoveryStrategy = null;
  let latestRecoveryTarget = null;
  let databaseCompleted = false;
  let lockReleasedAfterDatabase = false;
  let serviceCompletedForActivePhase = false;
  let fenced = false;
  const initialFence = events.find((event) => event?.type === "phase-fenced");
  const forbiddenAfterResume = new Set([
    "phase-fenced",
    "fence-reverified",
    ...migrationEventTypes,
    "database-completed",
    "fenced-smoke-completed",
  ]);
  const hasPriorLockReleaseAfter = (priorEvents, target) => {
    const targetIndex = priorEvents.lastIndexOf(target);
    return (
      targetIndex >= 0 &&
      priorEvents.slice(targetIndex + 1).some((candidate) => candidate?.type === "lock-released")
    );
  };
  const contract = plan?.runtimeContract;
  const nextRuntimeSetIds = new Set(
    Array.isArray(contract?.runtimeSets)
      ? contract.runtimeSets
          .filter((runtimeSet) => runtimeSet?.release === "next")
          .map((runtimeSet) => runtimeSet.id)
      : [],
  );
  const currentFinalMixtureId = Array.isArray(contract?.mixtures)
    ? contract.mixtures.find(
        (mixture) =>
          nextRuntimeSetIds.has(mixture?.runtimeSetId) &&
          mixture?.schemaState === "plan-final" &&
          mixture?.allowedPhases?.includes("RESUMED"),
      )?.id
    : undefined;

  for (const [index, event] of events.entries()) {
    const priorEvents = events.slice(0, index);
    if (
      (index === 0 && event?.type !== "phase-fenced") ||
      (event?.type === "phase-fenced" && index !== 0) ||
      (event?.type !== "phase-fenced" && !fenced) ||
      (resumedCount > 0 && forbiddenAfterResume.has(event?.type))
    ) {
      errors.push(`${context} runtime event ${event?.sequence ?? index + 1} is not admissible in v3 history`);
    }

    if (event?.type === "phase-fenced") {
      fenced = true;
    } else if (event?.type === "fence-reverified") {
      if (
        !initialFence ||
        resumedCount > 0 ||
        !isDeepStrictEqual(event?.data?.runtimeSet, initialFence?.data?.mixture?.runtimeSet)
      ) {
        errors.push(`${context} FENCED re-verification must preserve the active initial fence`);
      }
    } else if (event?.type === "database-completed") {
      if (databaseCompleted) {
        errors.push(`${context} database completion is already recorded`);
      }
      databaseCompleted = true;
      lockReleasedAfterDatabase = false;
    } else if (event?.type === "lock-released") {
      if (databaseCompleted) {
        lockReleasedAfterDatabase = true;
      }
    } else if (event?.type === "fenced-smoke-completed") {
      if (!databaseCompleted || !lockReleasedAfterDatabase) {
        errors.push(`${context} FENCED smoke requires lock release after database completion`);
      }
    } else if (event?.type === "phase-resumed") {
      if (
        recoveringCount !== completedRecoveryCount ||
        resumedCount !== completedRecoveryCount
      ) {
        errors.push(`${context} RESUMED must follow initial startup or one completed recovery`);
      }
      if (
        completedRecoveryCount > 0 &&
        !isDeepStrictEqual(event?.data?.mixture, latestRecoveryTarget)
      ) {
        errors.push(`${context} post-recovery RESUMED must match the recovery target mixture`);
      }
      if (completedRecoveryCount === 0) {
        const smokedMixtureIds = new Set(
          priorEvents
            .filter((candidate) => candidate?.type === "fenced-smoke-completed")
            .map((candidate) => candidate?.data?.mixture?.mixtureId),
        );
        const requiredSmokeMixtureIds = new Set([
          event?.data?.mixture?.mixtureId,
          ...(Array.isArray(contract?.recoveryStrategies)
            ? contract.recoveryStrategies.flatMap((strategy) =>
                ["previous-complete-release-final-db", "lossless-reconciliation"].includes(
                  strategy?.kind,
                )
                  ? [strategy.mixtureId]
                  : [],
              )
            : []),
        ]);
        const missingSmokeMixtureIds = [...requiredSmokeMixtureIds].filter(
          (mixtureId) => !smokedMixtureIds.has(mixtureId),
        );
        if (missingSmokeMixtureIds.length > 0) {
          errors.push(
            `${context} initial RESUMED requires smoke for every recovery target mixture`,
          );
        }
        const latestSmoke = [...priorEvents]
          .reverse()
          .find((candidate) => candidate?.type === "fenced-smoke-completed");
        if (!latestSmoke || !hasPriorLockReleaseAfter(priorEvents, latestSmoke)) {
          errors.push(`${context} RESUMED requires lock release after FENCED smoke`);
        }
        if (
          !currentFinalMixtureId ||
          event?.data?.mixture?.mixtureId !== currentFinalMixtureId
        ) {
          errors.push(`${context} initial RESUMED must use the next-release final mixture`);
        }
      } else {
        const latestRecovery = [...priorEvents]
          .reverse()
          .find((candidate) => candidate?.type === "recovery-completed");
        if (!latestRecovery || !hasPriorLockReleaseAfter(priorEvents, latestRecovery)) {
          errors.push(`${context} RESUMED requires lock release after recovery completion`);
        }
      }
      resumedCount += 1;
      serviceCompletedForActivePhase = false;
    } else if (event?.type === "phase-recovering") {
      const activeResume = [...priorEvents]
        .reverse()
        .find((candidate) => candidate?.type === "phase-resumed");
      if (
        resumedCount !== completedRecoveryCount + 1 ||
        recoveringCount !== completedRecoveryCount
      ) {
        errors.push(`${context} RECOVERING must follow the latest durable RESUMED phase`);
      }
      if (!isDeepStrictEqual(event?.data?.sourceMixture, activeResume?.data?.mixture)) {
        errors.push(`${context} RECOVERING source mixture must match the active RESUMED mixture`);
      }
      if (!activeResume || !hasPriorLockReleaseAfter(priorEvents, activeResume)) {
        errors.push(`${context} RECOVERING requires lock release after RESUMED`);
      }
      const strategy = Array.isArray(contract?.recoveryStrategies)
        ? contract.recoveryStrategies.find(
            (candidate) => candidate?.kind === event?.data?.strategy,
          )
        : undefined;
      if (
        !["previous-complete-release-final-db", "lossless-reconciliation"].includes(
          strategy?.kind,
        ) ||
        !priorEvents.some(
          (candidate) =>
            candidate?.type === "fenced-smoke-completed" &&
            candidate?.data?.mixture?.mixtureId === strategy?.mixtureId,
        )
      ) {
        errors.push(`${context} RECOVERING requires its declared target mixture smoke`);
      }
      recoveringCount += 1;
      latestRecoveryStrategy = event?.data?.strategy ?? null;
    } else if (event?.type === "recovery-completed") {
      const activeRecovery = [...priorEvents]
        .reverse()
        .find((candidate) => candidate?.type === "phase-recovering");
      if (
        recoveringCount !== completedRecoveryCount + 1 ||
        latestRecoveryStrategy !== event?.data?.strategy
      ) {
        errors.push(`${context} recovery completion must match the active RECOVERING phase`);
      }
      if (!activeRecovery || !hasPriorLockReleaseAfter(priorEvents, activeRecovery)) {
        errors.push(`${context} recovery completion requires lock release after RECOVERING`);
      }
      completedRecoveryCount += 1;
      latestRecoveryTarget = event?.data?.targetMixture ?? null;
    } else if (event?.type === "service-completed") {
      const activeResume = [...priorEvents]
        .reverse()
        .find((candidate) => candidate?.type === "phase-resumed");
      if (
        resumedCount !== completedRecoveryCount + 1 ||
        recoveringCount !== completedRecoveryCount
      ) {
        errors.push(`${context} service completion requires a post-recovery RESUMED phase`);
      }
      if (serviceCompletedForActivePhase) {
        errors.push(`${context} service completion is already recorded for the active phase`);
      }
      if (!isDeepStrictEqual(event?.data?.activeMixture, activeResume?.data?.mixture)) {
        errors.push(`${context} service completion must match the active RESUMED mixture`);
      }
      if (!activeResume || !hasPriorLockReleaseAfter(priorEvents, activeResume)) {
        errors.push(`${context} service completion requires lock release after RESUMED`);
      }
      serviceCompletedForActivePhase = true;
    }
  }
}

function validateMigrationFailedData(value, context, errors) {
  const allowedKeys = [
    ["ref", "phase", "errorSha256", "resolution"],
    ["ref", "recoveryFor", "phase", "errorSha256", "resolution"],
  ];
  if (!allowedKeys.some((keys) => hasExactKeys(value, keys))) {
    errors.push(`${context} must use the v3 migration failure shape`);
  }
  if (!isMigrationRef(value.ref)) {
    errors.push(`${context}.ref must be a migration reference`);
  }
  if (Object.hasOwn(value, "recoveryFor") && !isMigrationRef(value.recoveryFor)) {
    errors.push(`${context}.recoveryFor must be a migration reference`);
  }
  if (
    !["sql-or-postcondition", "ledger"].includes(value.phase) ||
    !sha256Pattern.test(value.errorSha256 ?? "") ||
    ![
      "append-only-recovery-required",
      "ledger-only-repair",
      "manual-review-required",
    ].includes(value.resolution)
  ) {
    errors.push(`${context} must contain a valid failure phase, error SHA-256, and resolution`);
  }
}

function validateServiceCompletedData(value, context, errors) {
  validateExactKeys(
    value,
    [
      "activeMixture",
      "restartEvidence",
      "smokeEvidence",
      "recoveryReadinessEvidence",
      "runningRuntimeSha256",
      "runningUnits",
      "runtimeContractSha256",
    ],
    context,
    errors,
  );
  if (!isActualRuntimeMixture(value.activeMixture) || !isRunningUnitList(value.runningUnits)) {
    errors.push(`${context} must contain the active mixture and running runtime inventory`);
  }
  for (const key of ["restartEvidence", "smokeEvidence", "recoveryReadinessEvidence"]) {
    if (!isConcreteText(value[key])) {
      errors.push(`${context}.${key} must be concrete evidence`);
    }
  }
  for (const key of ["runningRuntimeSha256", "runtimeContractSha256"]) {
    if (!sha256Pattern.test(value[key] ?? "")) {
      errors.push(`${context}.${key} must be a lowercase SHA-256`);
    }
  }
}

function isActualRuntimeMixture(value) {
  return (
    isPlainObject(value) &&
    hasExactKeys(value, ["mixtureId", "runtimeSet", "schemaState", "schemaFingerprintSha256"]) &&
    isClosedId(value.mixtureId) &&
    isRuntimeSet(value.runtimeSet) &&
    ["plan-start", "plan-final"].includes(value.schemaState) &&
    sha256Pattern.test(value.schemaFingerprintSha256 ?? "")
  );
}

function isRecoveryStrategy(value) {
  return [
    "pre-resume-restore",
    "append-only-recovery-migration",
    "previous-complete-release-final-db",
    "forward-fix-migration",
    "lossless-reconciliation",
  ].includes(value);
}

function isSurfaceWatermark(value) {
  return (
    isPlainObject(value) &&
    hasExactKeys(value, ["surfaceId", "watermark", "evidence"]) &&
    isClosedId(value.surfaceId) &&
    isNonEmptyText(value.watermark) &&
    isNonEmptyText(value.evidence)
  );
}

function isSurfaceResidual(value) {
  return (
    isPlainObject(value) &&
    hasExactKeys(value, ["surfaceId", "residualCount", "evidence"]) &&
    isClosedId(value.surfaceId) &&
    value.residualCount === 0 &&
    isNonEmptyText(value.evidence)
  );
}

function isFencedSmokeModeEvidence(value) {
  if (!isPlainObject(value)) {
    return false;
  }
  if (value.mode === "read-only") {
    return (
      hasExactKeys(value, ["mode", "readOnlyAccessEvidence"]) &&
      isNonEmptyText(value.readOnlyAccessEvidence)
    );
  }
  if (value.mode === "transaction-rollback") {
    return (
      hasExactKeys(value, ["mode", "transactionEvidence", "rollbackEvidence"]) &&
      isNonEmptyText(value.transactionEvidence) &&
      isNonEmptyText(value.rollbackEvidence)
    );
  }
  return (
    value.mode === "isolated-synthetic" &&
    hasExactKeys(value, ["mode", "sinkEvidence", "cleanupEvidence"]) &&
    isNonEmptyText(value.sinkEvidence) &&
    isNonEmptyText(value.cleanupEvidence)
  );
}

function isEvidenceResult(value) {
  return (
    isPlainObject(value) &&
    hasExactKeys(value, ["procedureRef", "resultRef"]) &&
    isNonEmptyText(value.procedureRef) &&
    isNonEmptyText(value.resultRef) &&
    value.procedureRef !== value.resultRef
  );
}

function isEffectRecoveryEvidence(value) {
  if (!isPlainObject(value)) {
    return false;
  }
  if (value.kind === "producer-safe-rollback") {
    return (
      hasExactKeys(value, ["kind", "acceptedWrite", "producerEvidence"]) &&
      isEvidenceResult(value.acceptedWrite) &&
      Array.isArray(value.producerEvidence) &&
      value.producerEvidence.every(isProducerSafetyEvidence)
    );
  }
  return (
    value.kind === "lossless-reconciliation" &&
    hasExactKeys(value, ["kind", "acceptedWrite", "effectLedger", "sinkVerification"]) &&
    isEvidenceResult(value.acceptedWrite) &&
    isEvidenceResult(value.effectLedger) &&
    isEvidenceResult(value.sinkVerification)
  );
}

function isProducerSafetyEvidence(value) {
  return (
    isPlainObject(value) &&
    hasExactKeys(value, ["runtimeUnitId", "procedureRef", "resultRef"]) &&
    isClosedId(value.runtimeUnitId) &&
    isNonEmptyText(value.procedureRef) &&
    isNonEmptyText(value.resultRef) &&
    value.procedureRef !== value.resultRef
  );
}

function isWriterInventoryEntries(value) {
  if (!Array.isArray(value) || value.length < writerKinds.length) {
    return false;
  }
  const presentIds = new Set();
  const entriesByKind = new Map(writerKinds.map((kind) => [kind, []]));
  for (const writer of value) {
    if (!isPlainObject(writer) || !writerKinds.includes(writer.kind)) {
      return false;
    }
    if (writer.state === "present") {
      if (
        !hasExactKeys(writer, [
          "state",
          "id",
          "kind",
          "runtimeUnitId",
          "sourceRef",
          "compatibilityConfigSha256",
          "owner",
          "stopEvidence",
          "verificationEvidence",
          "sideEffectStopEvidence",
        ]) ||
        !isClosedId(writer.id) ||
        !isClosedId(writer.runtimeUnitId) ||
        !isNonEmptyText(writer.sourceRef) ||
        !sha256Pattern.test(writer.compatibilityConfigSha256 ?? "") ||
        !isNonEmptyText(writer.owner) ||
        !isNonEmptyText(writer.stopEvidence) ||
        !isNonEmptyText(writer.verificationEvidence) ||
        !isNonEmptyText(writer.sideEffectStopEvidence) ||
        presentIds.has(writer.id)
      ) {
        return false;
      }
      presentIds.add(writer.id);
    } else if (
      writer.state !== "absent" ||
      !hasExactKeys(writer, ["state", "kind", "owner", "reason", "verificationEvidence"]) ||
      !isNonEmptyText(writer.owner) ||
      !isNonEmptyText(writer.reason) ||
      !isNonEmptyText(writer.verificationEvidence)
    ) {
      return false;
    }
    entriesByKind.get(writer.kind).push(writer);
  }
  return [...entriesByKind.values()].every(
    (entries) =>
      entries.length > 0 &&
      (!entries.some((entry) => entry.state === "absent") ||
        (entries.length === 1 && entries[0]?.state === "absent")),
  );
}

function runtimeUnitCompatibilitySha256(unit) {
  return Object.hasOwn(unit, "compatibilityConfig")
    ? sha256Hex(`${JSON.stringify(normalizeCompatibilityConfig(unit.compatibilityConfig), null, 2)}\n`)
    : unit.compatibilityConfigSha256;
}

function writerInventoryMatchesRuntimeSet(writers, runtimeSet) {
  if (!isWriterInventoryEntries(writers) || !isRuntimeSet(runtimeSet)) {
    return false;
  }
  const actual = writers
    .filter((writer) => writer.state === "present")
    .map((writer) => ({
      id: writer.runtimeUnitId,
      kind: writer.kind,
      sourceRef: writer.sourceRef,
      compatibilityConfigSha256: writer.compatibilityConfigSha256,
    }))
    .sort((left, right) => left.id.localeCompare(right.id));
  const expected = runtimeSet.units
    .map((unit) => ({
      id: unit.id,
      kind: unit.kind,
      sourceRef: unit.sourceRef,
      compatibilityConfigSha256: runtimeUnitCompatibilitySha256(unit),
    }))
    .sort((left, right) => left.id.localeCompare(right.id));
  return isDeepStrictEqual(actual, expected);
}

function runningInventoryMatchesRuntimeSet(units, runtimeSet) {
  if (!isRunningUnitList(units) || !isRuntimeSet(runtimeSet)) {
    return false;
  }
  const actual = units
    .map(({ observationEvidence: _observationEvidence, ...unit }) => unit)
    .sort((left, right) => left.runtimeUnitId.localeCompare(right.runtimeUnitId));
  const expected = runtimeSet.units
    .map((unit) => ({
      runtimeUnitId: unit.id,
      kind: unit.kind,
      sourceRef: unit.sourceRef,
      compatibilityConfigSha256: runtimeUnitCompatibilitySha256(unit),
    }))
    .sort((left, right) => left.runtimeUnitId.localeCompare(right.runtimeUnitId));
  return isDeepStrictEqual(actual, expected);
}

function eventRuntimeInventoryMatches(event) {
  if (["phase-fenced", "fence-reverified", "phase-recovering"].includes(event?.type)) {
    return writerInventoryMatchesRuntimeSet(event?.data?.writers, eventRuntimeSet(event));
  }
  if (event?.type === "service-completed") {
    return runningInventoryMatchesRuntimeSet(
      event?.data?.runningUnits,
      eventRuntimeSet(event),
    );
  }
  return true;
}

function hasExactSurfaceCoverage(contract, values) {
  if (!Array.isArray(contract?.stateSurfaces) || !Array.isArray(values)) {
    return false;
  }
  const expected = contract.stateSurfaces.map((surface) => surface?.id).sort();
  const actual = values.map((value) => value?.surfaceId).sort();
  return new Set(actual).size === actual.length && isDeepStrictEqual(actual, expected);
}

function eventRuntimeContractMatches(plan, event) {
  const contract = plan?.runtimeContract;
  if (!isPlainObject(contract)) {
    return false;
  }
  if (event?.type === "fenced-smoke-completed") {
    return (
      event.data.mode === contract.fencedSmoke?.mode &&
      event.data.smokeResult?.procedureRef === contract.fencedSmoke?.procedureRef &&
      hasExactSurfaceCoverage(contract, event.data.surfaceResiduals)
    );
  }
  if (event?.type === "phase-resumed") {
    return hasExactSurfaceCoverage(contract, event.data.startWatermarks);
  }
  if (event?.type === "phase-recovering") {
    const strategy = contract.recoveryStrategies?.find(
      (candidate) => candidate?.kind === event.data.strategy,
    );
    return (
      ["previous-complete-release-final-db", "lossless-reconciliation"].includes(
        strategy?.kind,
      ) && hasExactSurfaceCoverage(contract, event.data.endWatermarks)
    );
  }
  if (event?.type === "recovery-completed") {
    const strategy = contract.recoveryStrategies?.find(
      (candidate) => candidate?.kind === event.data.strategy,
    );
    if (
      !strategy ||
      strategy.mixtureId !== event.data.targetMixture?.mixtureId ||
      strategy.procedureRef !== event.data.recoveryResult?.procedureRef ||
      strategy.statePostconditionProcedureRef !== event.data.statePostcondition?.procedureRef
    ) {
      return false;
    }
    if (strategy.kind === "lossless-reconciliation") {
      return (
        event.data.effectRecovery?.kind === "lossless-reconciliation" &&
        strategy.acceptedWriteProcedureRef ===
          event.data.effectRecovery.acceptedWrite?.procedureRef &&
        strategy.effectLedgerProcedureRef === event.data.effectRecovery.effectLedger?.procedureRef &&
        strategy.sinkVerificationProcedureRef ===
          event.data.effectRecovery.sinkVerification?.procedureRef
      );
    }
    if (strategy.kind === "previous-complete-release-final-db") {
      if (!Array.isArray(strategy.producerSafetyRequirements)) {
        return false;
      }
      const expected = strategy.producerSafetyRequirements
        .map(({ runtimeUnitId, procedureRef }) => ({ runtimeUnitId, procedureRef }))
        .sort((left, right) => left.runtimeUnitId.localeCompare(right.runtimeUnitId));
      const actual = (event.data.effectRecovery?.producerEvidence ?? [])
        .map(({ runtimeUnitId, procedureRef }) => ({ runtimeUnitId, procedureRef }))
        .sort((left, right) => left.runtimeUnitId.localeCompare(right.runtimeUnitId));
      return (
        event.data.effectRecovery?.kind === "producer-safe-rollback" &&
        strategy.acceptedWriteProcedureRef ===
          event.data.effectRecovery.acceptedWrite?.procedureRef &&
        isDeepStrictEqual(actual, expected)
      );
    }
    return false;
  }
  if (event?.type === "service-completed") {
    return (
      event.data.runtimeContractSha256 ===
      sha256Hex(`${JSON.stringify(contract, null, 2)}\n`)
    );
  }
  return true;
}

function eventRuntimeSet(event) {
  if (event?.type === "fence-reverified") {
    return event?.data?.runtimeSet ?? null;
  }
  return eventRuntimeMixture(event)?.runtimeSet ?? null;
}

function eventRuntimeMixture(event) {
  const mixtureKey =
    event?.type === "phase-recovering"
      ? "sourceMixture"
      : event?.type === "recovery-completed"
        ? "targetMixture"
        : event?.type === "service-completed"
          ? "activeMixture"
          : ["phase-fenced", "fenced-smoke-completed", "phase-resumed"].includes(event?.type)
            ? "mixture"
            : null;
  return mixtureKey === null ? null : event?.data?.[mixtureKey] ?? null;
}

function eventRuntimePhase(event) {
  if (["phase-fenced", "fenced-smoke-completed"].includes(event?.type)) {
    return "FENCED";
  }
  if (event?.type === "phase-resumed") {
    return "RESUMED";
  }
  if (["phase-recovering", "recovery-completed"].includes(event?.type)) {
    return "RECOVERING";
  }
  return null;
}

function isDeclaredRuntimeMixture(plan, actualMixture, phase) {
  const contract = plan?.runtimeContract;
  if (
    !isPlainObject(contract) ||
    !Array.isArray(contract.mixtures) ||
    !Array.isArray(contract.runtimeSets) ||
    !isPlainObject(actualMixture)
  ) {
    return false;
  }
  const declared = contract.mixtures.find(
    (mixture) => isPlainObject(mixture) && mixture.id === actualMixture.mixtureId,
  );
  const runtimeSet = contract.runtimeSets.find(
    (candidate) => isPlainObject(candidate) && candidate.id === declared?.runtimeSetId,
  );
  return (
    isPlainObject(declared) &&
    isPlainObject(runtimeSet) &&
    declared.schemaState === actualMixture.schemaState &&
    declared.schemaFingerprintSha256 === actualMixture.schemaFingerprintSha256 &&
    Array.isArray(declared.allowedPhases) &&
    declared.allowedPhases.includes(phase) &&
    (phase !== "RESUMED" ||
      (Array.isArray(declared.boundaryResults) &&
        declared.boundaryResults.every((result) => result?.result === "supported"))) &&
    isDeepStrictEqual(runtimeSet, actualMixture.runtimeSet)
  );
}

function isCompatibilityConfigEntry(value, isValue) {
  return (
    isPlainObject(value) &&
    hasExactKeys(value, ["name", "value"]) &&
    isNonEmptyText(value.name) &&
    isValue(value.value)
  );
}

function isCompatibilityConfig(value) {
  return (
    isPlainObject(value) &&
    hasExactKeys(value, ["schema", "featureFlags", "serializerModes", "activeRoles"]) &&
    value.schema === "db-migration-compatibility-config/v1" &&
    Array.isArray(value.featureFlags) &&
    value.featureFlags.every((entry) =>
      isCompatibilityConfigEntry(entry, (entryValue) => typeof entryValue === "boolean"),
    ) &&
    new Set(value.featureFlags.map((entry) => entry.name)).size === value.featureFlags.length &&
    Array.isArray(value.serializerModes) &&
    value.serializerModes.every((entry) =>
      isCompatibilityConfigEntry(entry, isNonEmptyText),
    ) &&
    new Set(value.serializerModes.map((entry) => entry.name)).size ===
      value.serializerModes.length &&
    Array.isArray(value.activeRoles) &&
    value.activeRoles.length > 0 &&
    value.activeRoles.every((role) => compatibilityRoles.includes(role)) &&
    new Set(value.activeRoles).size === value.activeRoles.length
  );
}

function normalizeCompatibilityConfig(value) {
  return {
    schema: "db-migration-compatibility-config/v1",
    featureFlags: value.featureFlags
      .map(({ name, value: entryValue }) => ({ name, value: entryValue }))
      .sort((left, right) =>
        left.name < right.name ? -1 : left.name > right.name ? 1 : 0,
      ),
    serializerModes: value.serializerModes
      .map(({ name, value: entryValue }) => ({ name, value: entryValue }))
      .sort((left, right) =>
        left.name < right.name ? -1 : left.name > right.name ? 1 : 0,
      ),
    activeRoles: compatibilityRoles.filter((role) => value.activeRoles.includes(role)),
  };
}

function isChangedBoundary(value) {
  return (
    isPlainObject(value) &&
    hasExactKeys(value, ["id", "kind", "runtimeUnitIds"]) &&
    isClosedId(value.id) &&
    ["read", "write", "state"].includes(value.kind) &&
    Array.isArray(value.runtimeUnitIds) &&
    value.runtimeUnitIds.length > 0 &&
    value.runtimeUnitIds.every(isClosedId) &&
    new Set(value.runtimeUnitIds).size === value.runtimeUnitIds.length
  );
}

function isBoundaryResult(value) {
  return (
    isPlainObject(value) &&
    hasExactKeys(value, [
      "boundaryId",
      "result",
      "legacyStateEvidence",
      "newRuntimeStateEvidence",
    ]) &&
    isClosedId(value.boundaryId) &&
    ["supported", "unsupported"].includes(value.result) &&
    isNonEmptyText(value.legacyStateEvidence) &&
    isNonEmptyText(value.newRuntimeStateEvidence)
  );
}

function isPlannedMixture(value) {
  return (
    isPlainObject(value) &&
    hasExactKeys(value, [
      "id",
      "runtimeSetId",
      "schemaState",
      "schemaFingerprintSha256",
      "allowedPhases",
      "boundaryResults",
    ]) &&
    isClosedId(value.id) &&
    isClosedId(value.runtimeSetId) &&
    ["plan-start", "plan-final"].includes(value.schemaState) &&
    sha256Pattern.test(value.schemaFingerprintSha256 ?? "") &&
    Array.isArray(value.allowedPhases) &&
    value.allowedPhases.length > 0 &&
    value.allowedPhases.every((phase) => ["FENCED", "RESUMED", "RECOVERING"].includes(phase)) &&
    new Set(value.allowedPhases).size === value.allowedPhases.length &&
    Array.isArray(value.boundaryResults) &&
    value.boundaryResults.every(isBoundaryResult)
  );
}

function isStateSurface(value) {
  return (
    isPlainObject(value) &&
    hasExactKeys(value, ["id", "kind"]) &&
    isClosedId(value.id) &&
    ["database", "queue", "external-effect"].includes(value.kind)
  );
}

function isProducerSafetyRequirement(value) {
  return (
    isPlainObject(value) &&
    hasExactKeys(value, ["runtimeUnitId", "procedureRef"]) &&
    isClosedId(value.runtimeUnitId) &&
    isNonEmptyText(value.procedureRef)
  );
}

function isDeclaredRecoveryStrategy(value) {
  if (!isPlainObject(value) || !isNonEmptyText(value.kind)) {
    return false;
  }
  if (value.kind === "pre-resume-restore") {
    return (
      hasExactKeys(value, [
        "kind",
        "procedureRef",
        "restoreEvidence",
        "rpo",
        "rto",
        "followupPlanRequired",
      ]) &&
      isNonEmptyText(value.procedureRef) &&
      isNonEmptyText(value.restoreEvidence) &&
      isNonEmptyText(value.rpo) &&
      isNonEmptyText(value.rto) &&
      value.followupPlanRequired === true
    );
  }
  if (["append-only-recovery-migration", "forward-fix-migration"].includes(value.kind)) {
    return (
      hasExactKeys(value, ["kind", "procedureRef", "followupPlanRequired"]) &&
      isNonEmptyText(value.procedureRef) &&
      value.followupPlanRequired === true
    );
  }
  if (value.kind === "previous-complete-release-final-db") {
    return (
      hasExactKeys(value, [
        "kind",
        "mixtureId",
        "procedureRef",
        "acceptedWriteProcedureRef",
        "statePostconditionProcedureRef",
        "producerSafetyRequirements",
      ]) &&
      isClosedId(value.mixtureId) &&
      isNonEmptyText(value.procedureRef) &&
      isNonEmptyText(value.acceptedWriteProcedureRef) &&
      isNonEmptyText(value.statePostconditionProcedureRef) &&
      Array.isArray(value.producerSafetyRequirements) &&
      value.producerSafetyRequirements.every(isProducerSafetyRequirement)
    );
  }
  return (
    value.kind === "lossless-reconciliation" &&
    hasExactKeys(value, [
      "kind",
      "mixtureId",
      "procedureRef",
      "acceptedWriteProcedureRef",
      "effectLedgerProcedureRef",
      "sinkVerificationProcedureRef",
      "statePostconditionProcedureRef",
    ]) &&
    isClosedId(value.mixtureId) &&
    isNonEmptyText(value.procedureRef) &&
    isNonEmptyText(value.acceptedWriteProcedureRef) &&
    isNonEmptyText(value.effectLedgerProcedureRef) &&
    isNonEmptyText(value.sinkVerificationProcedureRef) &&
    isNonEmptyText(value.statePostconditionProcedureRef)
  );
}

function runtimeUnitRoles(unit) {
  return Array.isArray(unit?.roles) ? unit.roles : unit?.compatibilityConfig?.activeRoles ?? [];
}

function isDeclaredRuntimeContract(value, expectedSchema) {
  if (
    !isPlainObject(value) ||
    !hasExactKeys(value, [
      "schema",
      "runtimeSets",
      "changedBoundaries",
      "mixtures",
      "stateSurfaces",
      "fencedSmoke",
      "recoveryStrategies",
    ]) ||
    value.schema !== expectedSchema ||
    !Array.isArray(value.runtimeSets) ||
    value.runtimeSets.length === 0 ||
    !value.runtimeSets.every((runtimeSet) => isRuntimeSet(runtimeSet, expectedSchema)) ||
    !Array.isArray(value.changedBoundaries) ||
    value.changedBoundaries.length === 0 ||
    !value.changedBoundaries.every(isChangedBoundary) ||
    !Array.isArray(value.mixtures) ||
    value.mixtures.length === 0 ||
    !value.mixtures.every(isPlannedMixture) ||
    !Array.isArray(value.stateSurfaces) ||
    value.stateSurfaces.length === 0 ||
    !value.stateSurfaces.every(isStateSurface) ||
    !isPlainObject(value.fencedSmoke) ||
    !hasExactKeys(value.fencedSmoke, ["mode", "procedureRef"]) ||
    !["read-only", "transaction-rollback", "isolated-synthetic"].includes(
      value.fencedSmoke.mode,
    ) ||
    !isNonEmptyText(value.fencedSmoke.procedureRef) ||
    !Array.isArray(value.recoveryStrategies) ||
    value.recoveryStrategies.length === 0 ||
    !value.recoveryStrategies.every(isDeclaredRecoveryStrategy)
  ) {
    return false;
  }

  const runtimeSetIds = value.runtimeSets.map((runtimeSet) => runtimeSet.id);
  const runtimeUnits = value.runtimeSets.flatMap((runtimeSet) => runtimeSet.units);
  const runtimeUnitIds = runtimeUnits.map((unit) => unit.id);
  const boundaryIds = value.changedBoundaries.map((boundary) => boundary.id);
  const mixtureIds = value.mixtures.map((mixture) => mixture.id);
  const surfaceIds = value.stateSurfaces.map((surface) => surface.id);
  const strategyKinds = value.recoveryStrategies.map((strategy) => strategy.kind);
  if (
    [runtimeSetIds, runtimeUnitIds, boundaryIds, mixtureIds, surfaceIds, strategyKinds].some(
      (ids) => new Set(ids).size !== ids.length,
    ) ||
    !value.stateSurfaces.some((surface) => surface.kind === "database") ||
    (runtimeUnits.some((unit) => runtimeUnitRoles(unit).includes("queue-consumer")) &&
      !value.stateSurfaces.some((surface) => surface.kind === "queue")) ||
    (runtimeUnits.some((unit) => runtimeUnitRoles(unit).includes("side-effect-producer")) &&
      !value.stateSurfaces.some((surface) => surface.kind === "external-effect"))
  ) {
    return false;
  }
  for (const schemaState of ["plan-start", "plan-final"]) {
    const fingerprints = new Set(
      value.mixtures
        .filter((mixture) => mixture.schemaState === schemaState)
        .map((mixture) => mixture.schemaFingerprintSha256),
    );
    if (fingerprints.size !== 1) {
      return false;
    }
  }
  const runtimeUnitIdSet = new Set(runtimeUnitIds);
  if (
    value.changedBoundaries.some((boundary) =>
      boundary.runtimeUnitIds.some((id) => !runtimeUnitIdSet.has(id)),
    )
  ) {
    return false;
  }
  const boundaryIdSet = new Set(boundaryIds);
  const runtimeSetById = new Map(
    value.runtimeSets.map((runtimeSet) => [runtimeSet.id, runtimeSet]),
  );
  for (const mixture of value.mixtures) {
    const resultIds = mixture.boundaryResults.map((result) => result.boundaryId);
    if (
      !runtimeSetById.has(mixture.runtimeSetId) ||
      new Set(resultIds).size !== resultIds.length ||
      resultIds.length !== boundaryIds.length ||
      resultIds.some((id) => !boundaryIdSet.has(id)) ||
      (mixture.allowedPhases.includes("RESUMED") &&
        mixture.boundaryResults.some((result) => result.result !== "supported")) ||
      (mixture.allowedPhases.includes("RESUMED") &&
        runtimeSetById.get(mixture.runtimeSetId)?.release === "mixed")
    ) {
      return false;
    }
  }
  if (
    !value.runtimeSets.some((runtimeSet) => runtimeSet.release === "previous") ||
    !value.runtimeSets.some((runtimeSet) => runtimeSet.release === "next")
  ) {
    return false;
  }
  const planStartMixtures = value.mixtures.filter(
    (mixture) => mixture.schemaState === "plan-start",
  );
  const planStartRuntimeSet =
    planStartMixtures.length === 1
      ? runtimeSetById.get(planStartMixtures[0].runtimeSetId)
      : undefined;
  if (
    planStartMixtures.length !== 1 ||
    !planStartMixtures[0].allowedPhases.includes("FENCED") ||
    !["previous", "mixed"].includes(planStartRuntimeSet?.release)
  ) {
    return false;
  }
  const nextRuntimeSetIds = new Set(
    value.runtimeSets
      .filter((runtimeSet) => runtimeSet.release === "next")
      .map((runtimeSet) => runtimeSet.id),
  );
  const nextFinal = value.mixtures.filter(
    (mixture) =>
      nextRuntimeSetIds.has(mixture.runtimeSetId) &&
      mixture.schemaState === "plan-final" &&
      mixture.allowedPhases.includes("RESUMED") &&
      mixture.boundaryResults.every((result) => result.result === "supported"),
  );
  if (
    nextFinal.length !== 1 ||
    !nextFinal[0].allowedPhases.includes("FENCED") ||
    !nextFinal[0].allowedPhases.includes("RECOVERING") ||
    !value.recoveryStrategies.some((strategy) => strategy.kind === "pre-resume-restore") ||
    !value.recoveryStrategies.some((strategy) =>
      [
        "previous-complete-release-final-db",
        "forward-fix-migration",
        "lossless-reconciliation",
      ].includes(strategy.kind),
    )
  ) {
    return false;
  }
  const mixtureById = new Map(value.mixtures.map((mixture) => [mixture.id, mixture]));
  for (const strategy of value.recoveryStrategies) {
    if (
      !["previous-complete-release-final-db", "lossless-reconciliation"].includes(strategy.kind)
    ) {
      continue;
    }
    const mixture = mixtureById.get(strategy.mixtureId);
    if (
      !mixture ||
      mixture.schemaState !== "plan-final" ||
      mixture.boundaryResults.some((result) => result.result !== "supported") ||
      !["FENCED", "RESUMED", "RECOVERING"].every((phase) =>
        mixture.allowedPhases.includes(phase),
      )
    ) {
      return false;
    }
    if (strategy.kind === "lossless-reconciliation") {
      continue;
    }
    const runtimeSet = runtimeSetById.get(mixture.runtimeSetId);
    const producerIds = runtimeSet?.units
      .filter(
        (unit) =>
          runtimeUnitRoles(unit).includes("queue-consumer") ||
          runtimeUnitRoles(unit).includes("side-effect-producer"),
      )
      .map((unit) => unit.id)
      .sort();
    const evidenceIds = strategy.producerSafetyRequirements
      .map((entry) => entry.runtimeUnitId)
      .sort();
    if (
      runtimeSet?.release !== "previous" ||
      new Set(evidenceIds).size !== evidenceIds.length ||
      !isDeepStrictEqual(producerIds, evidenceIds)
    ) {
      return false;
    }
  }
  return true;
}

function isRuntimeSet(value, runtimeContractSchema = null) {
  return (
    isPlainObject(value) &&
    hasExactKeys(value, ["id", "release", "units"]) &&
    isClosedId(value.id) &&
    ["previous", "next", "mixed"].includes(value.release) &&
    Array.isArray(value.units) &&
    value.units.length > 0 &&
    value.units.every((unit) => isRuntimeUnitRef(unit, runtimeContractSchema))
  );
}

function isRuntimeUnitRef(value, runtimeContractSchema = null) {
  if (
    !isPlainObject(value) ||
    !isClosedId(value.id) ||
    !writerKinds.includes(value.kind) ||
    !isNonEmptyText(value.sourceRef)
  ) {
    return false;
  }
  const legacy =
    hasExactKeys(value, ["id", "kind", "sourceRef", "compatibilityConfigSha256", "roles"]) &&
    sha256Pattern.test(value.compatibilityConfigSha256 ?? "") &&
    Array.isArray(value.roles) &&
    value.roles.length > 0 &&
    value.roles.every((role) =>
      ["db-reader", "db-writer", "queue-consumer", "side-effect-producer"].includes(role),
    ) &&
    new Set(value.roles).size === value.roles.length;
  const current =
    hasExactKeys(value, ["id", "kind", "sourceRef", "compatibilityConfig"]) &&
    /^[0-9a-f]{40}$/u.test(value.sourceRef) &&
    isCompatibilityConfig(value.compatibilityConfig);
  return (
    (runtimeContractSchema === "db-migration-runtime-contract/v1" && legacy) ||
    (runtimeContractSchema === "db-migration-runtime-contract/v2" && current) ||
    (runtimeContractSchema === null && (legacy || current))
  );
}

function isRunningUnitList(value) {
  return (
    Array.isArray(value) &&
    value.length > 0 &&
    value.every(
      (unit) =>
        isPlainObject(unit) &&
        hasExactKeys(unit, [
          "runtimeUnitId",
          "kind",
          "sourceRef",
          "compatibilityConfigSha256",
          "observationEvidence",
        ]) &&
        isClosedId(unit.runtimeUnitId) &&
        writerKinds.includes(unit.kind) &&
        isNonEmptyText(unit.sourceRef) &&
        sha256Pattern.test(unit.compatibilityConfigSha256 ?? "") &&
        isNonEmptyText(unit.observationEvidence),
    ) &&
    new Set(value.map((unit) => unit.runtimeUnitId)).size === value.length
  );
}

function hasExactKeys(value, expectedKeys) {
  return (
    Object.keys(value).length === expectedKeys.length &&
    expectedKeys.every((key) => Object.hasOwn(value, key))
  );
}

function isNonEmptyText(value) {
  return typeof value === "string" && value.trim().length > 0;
}

function isMigrationRef(value) {
  return (
    isPlainObject(value) &&
    hasExactKeys(value, ["file", "kind", "sha256"]) &&
    typeof value.file === "string" &&
    value.file.startsWith("db/migrations/") &&
    migrationKinds.includes(value.kind) &&
    sha256Pattern.test(value.sha256 ?? "")
  );
}

function isRecoveredRef(value) {
  return (
    isPlainObject(value) &&
    hasExactKeys(value, ["ref", "recoveryRef"]) &&
    isMigrationRef(value.ref) &&
    isMigrationRef(value.recoveryRef) &&
    value.recoveryRef.kind === "recovery"
  );
}

function isSupersededRef(value) {
  return (
    isPlainObject(value) &&
    hasExactKeys(value, ["ref", "supersedingRef"]) &&
    isMigrationRef(value.ref) &&
    isMigrationRef(value.supersedingRef)
  );
}

function planCatalogRefs(plan) {
  if (
    !Array.isArray(plan?.appliedRefs) ||
    !plan.appliedRefs.every(isMigrationRef) ||
    !Array.isArray(plan?.recoveredRefs) ||
    !plan.recoveredRefs.every(isRecoveredRef) ||
    !Array.isArray(plan?.baselineRefs) ||
    !plan.baselineRefs.every(isMigrationRef) ||
    !Array.isArray(plan?.supersededRefs) ||
    !plan.supersededRefs.every(isSupersededRef) ||
    !Array.isArray(plan?.pendingRefs) ||
    !plan.pendingRefs.every(isMigrationRef) ||
    !Array.isArray(plan?.adjudicableLedgerGapRefs) ||
    !plan.adjudicableLedgerGapRefs.every(isAdjudicableLedgerGapRef)
  ) {
    return null;
  }
  return [
    ...plan.appliedRefs,
    ...plan.recoveredRefs.map((entry) => entry.ref),
    ...plan.baselineRefs,
    ...plan.supersededRefs.map((entry) => entry.ref),
    ...plan.pendingRefs,
  ].sort((left, right) =>
    left.file.localeCompare(right.file, undefined, { numeric: true }),
  );
}

function isAdjudicableLedgerGapRef(value) {
  return (
    isPlainObject(value) &&
    hasExactKeys(value, ["ref", "evidenceRef"]) &&
    isMigrationRef(value.ref) &&
    isMigrationRef(value.evidenceRef)
  );
}

function sameMigrationRef(left, right) {
  return left.file === right.file && left.kind === right.kind && left.sha256 === right.sha256;
}

function isNumberedMigrationPath(value) {
  if (typeof value !== "string" || path.posix.dirname(value) !== "db/migrations") {
    return false;
  }
  const fileName = path.posix.basename(value);
  return /^[0-9]/u.test(fileName) && fileName.endsWith(".sql");
}

function validateInternalArtifactRef(value, type, context, errors) {
  if (!isArtifactRef(value)) {
    errors.push(`${context} must be an artifact reference`);
    return;
  }
  validateExactKeys(value, ["path", "sha256"], context, errors);
  if (
    typeof value.path !== "string" ||
    path.isAbsolute(value.path) ||
    value.path.includes("\\") ||
    path.posix.normalize(value.path) !== value.path ||
    value.path.startsWith("../")
  ) {
    errors.push(`${context}.path must be normalized and repository-relative`);
  }
  if (!sha256Pattern.test(value.sha256 ?? "")) {
    errors.push(`${context}.sha256 must be a lowercase SHA-256`);
  }
  if (type === "plan" && !value.path.endsWith(".json")) {
    errors.push(`${context}.path must identify a JSON plan`);
  }
  if (type === "execution" && !value.path.endsWith(".jsonl")) {
    errors.push(`${context}.path must identify a JSONL execution`);
  }
}

function readBoundArtifact({ ref, readArtifact, context, errors }) {
  const source = readArtifact(ref.path);
  if (source === null) {
    errors.push(`${context}.path must be a regular repository file`);
    return null;
  }
  if (sha256Hex(source) !== ref.sha256) {
    errors.push(`${context}.sha256 does not match artifact bytes`);
    return null;
  }
  return source;
}

function resolveArchivedRef({
  internalRef,
  artifactPaths,
  extension,
  readArtifact,
  context,
  errors,
}) {
  if (!artifactPaths) {
    errors.push(`${context} cannot be resolved without the release artifact inventory`);
    return null;
  }
  const matches = artifactPaths.filter((artifactPath) => {
    if (!artifactPath.endsWith(extension)) {
      return false;
    }
    const source = readArtifact(artifactPath);
    return source !== null && sha256Hex(source) === internalRef.sha256;
  });
  if (matches.length !== 1) {
    errors.push(`${context} must resolve to exactly one archived artifact by SHA-256`);
    return null;
  }
  return { path: matches[0], sha256: internalRef.sha256 };
}

function listVersionArtifacts({ listArtifacts, version, context, errors }) {
  if (!listArtifacts) {
    return null;
  }
  const prefix = `content/releases/evidence/db-migrations/${version}/`;
  const artifactPaths = listArtifacts(prefix);
  if (!Array.isArray(artifactPaths)) {
    errors.push(`${context} could not enumerate the release artifact directory`);
    return null;
  }
  const normalized = [...new Set(artifactPaths)].sort();
  if (
    normalized.some(
      (artifactPath) =>
        typeof artifactPath !== "string" ||
        !artifactPath.startsWith(prefix) ||
        path.posix.normalize(artifactPath) !== artifactPath,
    )
  ) {
    errors.push(`${context} artifact inventory contains an invalid path`);
    return null;
  }
  return normalized;
}

function rejectOrphanArtifacts({ artifactPaths, reachable, context, errors }) {
  if (!artifactPaths) {
    return;
  }
  const orphanPaths = artifactPaths.filter((artifactPath) => !reachable.has(artifactPath));
  if (orphanPaths.length > 0) {
    errors.push(`${context} contains orphan artifacts not reachable from the evidence root: ${orphanPaths.join(", ")}`);
  }
}

function isArtifactRef(value) {
  return (
    isPlainObject(value) &&
    typeof value.path === "string" &&
    typeof value.sha256 === "string" &&
    sha256Pattern.test(value.sha256)
  );
}

function validateArtifactRef({
  value,
  expectedSuffix,
  environment,
  version,
  required,
  readArtifact,
  context,
  errors,
}) {
  if (value === null && !required) {
    return;
  }
  if (!isPlainObject(value)) {
    errors.push(`${context} must be an artifact reference`);
    return;
  }
  validateExactKeys(value, ["path", "sha256"], context, errors);

  const expectedPath =
    `content/releases/evidence/db-migrations/${version}/${environment}/${expectedSuffix}`;
  if (
    typeof value.path !== "string" ||
    value.path.includes("\\") ||
    path.posix.normalize(value.path) !== value.path ||
    value.path !== expectedPath
  ) {
    errors.push(`${context}.path must be ${expectedPath}`);
  }
  if (typeof value.sha256 !== "string" || !sha256Pattern.test(value.sha256)) {
    errors.push(`${context}.sha256 must be a lowercase SHA-256`);
  }

  if (readArtifact && value.path && sha256Pattern.test(value.sha256 ?? "")) {
    const source = readArtifact(value.path);
    if (source === null) {
      errors.push(`${context}.path must be a regular repository file`);
    } else if (sha256Hex(source) !== value.sha256) {
      errors.push(`${context}.sha256 does not match artifact bytes`);
    }
  }
}

function validateExactKeys(value, expectedKeys, context, errors) {
  const expected = new Set(expectedKeys);
  for (const key of Object.keys(value)) {
    if (!expected.has(key)) {
      errors.push(`${context} has unknown key: ${key}`);
    }
  }
  for (const key of expectedKeys) {
    if (!Object.hasOwn(value, key)) {
      errors.push(`${context} is missing key: ${key}`);
    }
  }
}

function isPlainObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function isConcreteText(value) {
  return (
    typeof value === "string" &&
    value.trim().length > 0 &&
    !/(?:^|\b)(?:n\/a|pending|todo|tbd)(?:\b|$)|(?:대기|미검증|미완료|미생성)/iu.test(
      value,
    )
  );
}

function isIsoUtcTimestamp(value) {
  if (
    typeof value !== "string" ||
    !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/u.test(value)
  ) {
    return false;
  }
  const timestamp = Date.parse(value);
  return !Number.isNaN(timestamp) && new Date(timestamp).toISOString() === value;
}
