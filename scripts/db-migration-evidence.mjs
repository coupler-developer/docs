import { createHash } from "node:crypto";

const shaPattern = /^[a-f0-9]{64}$/u;
const commitPattern = /^[a-f0-9]{40}$/u;
const versionPattern = /^v\d+\.\d+\.\d+$/u;
const eventTypes = new Set([
  "transition-started",
  "transition-done",
  "transition-restored",
]);

export function sha256Hex(source) {
  return createHash("sha256").update(source).digest("hex");
}

const isObject = (value) =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const exactKeys = (value, keys) =>
  isObject(value) &&
  JSON.stringify(Object.keys(value).sort()) === JSON.stringify([...keys].sort());

const canonicalJson = (value) => `${JSON.stringify(value, null, 2)}\n`;

function validateRef(value, expectedPath, context, errors, { nullable = false } = {}) {
  if (nullable && value === null) return;
  if (
    !exactKeys(value, ["path", "sha256"]) ||
    value.path !== expectedPath ||
    !shaPattern.test(value.sha256 ?? "")
  ) {
    errors.push(`${context} must bind ${expectedPath} and its SHA-256`);
  }
}

function readBoundArtifact(ref, readArtifact, context, errors) {
  if (!isObject(ref) || typeof ref.path !== "string" || !shaPattern.test(ref.sha256 ?? "")) {
    return null;
  }
  if (typeof readArtifact !== "function") return undefined;
  const rawSource = readArtifact(ref.path);
  if (typeof rawSource !== "string" && !Buffer.isBuffer(rawSource)) {
    errors.push(`${context} is missing: ${ref.path}`);
    return null;
  }
  const source = Buffer.isBuffer(rawSource) ? rawSource.toString("utf8") : rawSource;
  if (sha256Hex(source) !== ref.sha256) {
    errors.push(`${context} checksum mismatch: ${ref.path}`);
    return null;
  }
  return source;
}

function validateDatabaseIdentity(value, context, errors) {
  if (
    !exactKeys(value, ["database", "hostname", "port", "serverId", "serverVersion"]) ||
    typeof value.database !== "string" ||
    !value.database ||
    typeof value.hostname !== "string" ||
    !value.hostname ||
    !Number.isSafeInteger(value.port) ||
    value.port <= 0 ||
    typeof value.serverId !== "string" ||
    !value.serverId ||
    typeof value.serverVersion !== "string" ||
    !value.serverVersion
  ) {
    errors.push(`${context} must contain the exact database identity fields`);
  }
}

function validateSourceRef(value, expectedPath, context, errors) {
  if (
    !exactKeys(value, ["path", "sha256"]) ||
    value.path !== expectedPath ||
    !shaPattern.test(value.sha256 ?? "")
  ) {
    errors.push(`${context} must bind ${expectedPath}`);
  }
}

function validatePlanShape(plan, environment, context, errors) {
  if (
    !exactKeys(plan, [
      "environment",
      "createdAt",
      "apiSourceRef",
      "databaseIdentity",
      "databaseIdentitySha256",
      "runtime",
      "source",
      "devPlan",
      "devExecution",
    ])
  ) {
    errors.push(`${context} must use the exact single-current plan shape`);
    return false;
  }
  if (
    plan.environment !== environment ||
    typeof plan.createdAt !== "string" ||
    !commitPattern.test(plan.apiSourceRef ?? "") ||
    !shaPattern.test(plan.databaseIdentitySha256 ?? "")
  ) {
    errors.push(`${context} environment, timestamp, source ref, or DB identity digest is invalid`);
  }
  validateDatabaseIdentity(plan.databaseIdentity, `${context}.databaseIdentity`, errors);
  if (
    isObject(plan.databaseIdentity) &&
    sha256Hex(canonicalJson(plan.databaseIdentity)) !== plan.databaseIdentitySha256
  ) {
    errors.push(`${context}.databaseIdentitySha256 does not match databaseIdentity`);
  }
  if (
    !exactKeys(plan.runtime, ["engine", "sqlMode"]) ||
    typeof plan.runtime.engine !== "string" ||
    !plan.runtime.engine ||
    typeof plan.runtime.sqlMode !== "string"
  ) {
    errors.push(`${context}.runtime is invalid`);
  } else if (
    plan.runtime.sqlMode
      .split(",")
      .map((mode) => mode.trim().toUpperCase())
      .some((mode) => mode === "ANSI_QUOTES" || mode === "NO_BACKSLASH_ESCAPES")
  ) {
    errors.push(`${context}.runtime uses an unsupported SQL lexical mode`);
  }
  if (
    isObject(plan.databaseIdentity) &&
    isObject(plan.runtime) &&
    plan.runtime.engine !== plan.databaseIdentity.serverVersion
  ) {
    errors.push(`${context}.runtime.engine must match databaseIdentity.serverVersion`);
  }
  if (
    !exactKeys(plan.source, [
      "baselineSql",
      "baselineLock",
      "targetLock",
      "currentSql",
      "currentState",
      "currentFixture",
      "startSchemaSha256",
      "targetSchemaSha256",
    ])
  ) {
    errors.push(`${context}.source must bind the baseline and exact current trio`);
  } else {
    for (const [key, expected] of Object.entries({
      baselineSql: "db/schema/baseline.sql",
      baselineLock: "db/schema/baseline.lock.json",
      targetLock: "db/schema/schema.lock.json",
      currentSql: "db/schema/current.sql",
      currentState: "db/schema/current.state.sql",
      currentFixture: "db/schema/current.fixture.sql",
    })) {
      validateSourceRef(plan.source[key], expected, `${context}.source.${key}`, errors);
    }
    if (
      !shaPattern.test(plan.source.startSchemaSha256 ?? "") ||
      !shaPattern.test(plan.source.targetSchemaSha256 ?? "")
    ) {
      errors.push(`${context}.source schema fingerprints are invalid`);
    }
  }
  if (environment === "dev" && (plan.devPlan !== null || plan.devExecution !== null)) {
    errors.push(`${context} dev plan must not contain promotion evidence`);
  }
  if (environment === "prod") {
    validateRef(
      plan.devPlan,
      ".runtime/db-migration/dev/plan.json",
      `${context}.devPlan`,
      errors,
    );
    validateRef(
      plan.devExecution,
      ".runtime/db-migration/dev/execution.jsonl",
      `${context}.devExecution`,
      errors,
    );
  }
  return true;
}

function validateApiSource(plan, readApiArtifact, requireTrustedApiSource, context, errors) {
  if (typeof readApiArtifact !== "function") {
    if (requireTrustedApiSource) errors.push(`${context} requires a trusted API source reader`);
    return;
  }
  const readSource = (artifactPath) => {
    const source = readApiArtifact(plan.apiSourceRef, artifactPath);
    return Buffer.isBuffer(source) ? source.toString("utf8") : source;
  };
  for (const reference of Object.values(plan.source ?? {}).filter(
    (value) => isObject(value) && typeof value.path === "string",
  )) {
    const source = readSource(reference.path);
    if (typeof source !== "string") {
      errors.push(`${context} trusted API source is missing ${reference.path}`);
    } else if (sha256Hex(source) !== reference.sha256) {
      errors.push(`${context} trusted API checksum mismatch: ${reference.path}`);
    }
  }
  for (const [label, file, expected] of [
    ["baseline", "db/schema/baseline.lock.json", plan.source?.startSchemaSha256],
    ["target", "db/schema/schema.lock.json", plan.source?.targetSchemaSha256],
  ]) {
    try {
      const parsed = JSON.parse(readSource(file));
      if (!exactKeys(parsed, ["database", "objects"])) {
        errors.push(`${context} ${label} lock must be versionless database+objects`);
      } else if (sha256Hex(canonicalJson(parsed)) !== expected) {
        errors.push(`${context} ${label} lock does not match its sealed fingerprint`);
      }
    } catch {
      errors.push(`${context} ${label} lock is invalid JSON`);
    }
  }
}

function parseExecution(source, plan, context, errors) {
  if (!source.endsWith("\n")) {
    errors.push(`${context} must end with a newline`);
    return [];
  }
  const lines = source.trimEnd() ? source.trimEnd().split("\n") : [];
  const planHash = sha256Hex(canonicalJson(plan));
  const events = [];
  lines.forEach((line, index) => {
    let event;
    try {
      event = JSON.parse(line);
    } catch {
      errors.push(`${context} line ${index + 1} is invalid JSON`);
      return;
    }
    if (
      !exactKeys(event, ["sequence", "at", "environment", "planSha256", "type", "data"]) ||
      event.sequence !== index + 1 ||
      typeof event.at !== "string" ||
      event.environment !== plan.environment ||
      event.planSha256 !== planHash ||
      !eventTypes.has(event.type) ||
      !isObject(event.data)
    ) {
      errors.push(`${context} line ${index + 1} does not match the immutable plan envelope`);
      return;
    }
    events.push(event);
  });
  return events;
}

function validateBackup(value, plan, context, errors) {
  if (
    !exactKeys(value, ["reference", "sha256", "sourceDatabaseIdentitySha256"]) ||
    typeof value.reference !== "string" ||
    !value.reference ||
    !shaPattern.test(value.sha256 ?? "") ||
    value.sourceDatabaseIdentitySha256 !== plan.databaseIdentitySha256
  ) {
    errors.push(`${context} must bind the plan's sealed backup`);
  }
}

function validateExecution(events, plan, scopeStatus, context, errors) {
  let outcome = "none";
  for (const event of events) {
    if (event.type === "transition-started") {
      if (outcome !== "none") errors.push(`${context} transition-started is not reentrant`);
      if (!exactKeys(event.data, [
        "databaseIdentity",
        "databaseIdentitySha256",
        "backup",
        "schemaSha256",
        "evidenceSha256",
      ])) {
        errors.push(`${context} transition-started data must contain only DB evidence`);
      }
      validateDatabaseIdentity(event.data.databaseIdentity, `${context} databaseIdentity`, errors);
      if (
        event.data.databaseIdentitySha256 !== plan.databaseIdentitySha256 ||
        canonicalJson(event.data.databaseIdentity) !== canonicalJson(plan.databaseIdentity)
      ) {
        errors.push(`${context} transition-started database identity must match its plan`);
      }
      validateBackup(event.data.backup, plan, `${context} transition-started backup`, errors);
      if (
        !shaPattern.test(event.data.schemaSha256 ?? "") ||
        !shaPattern.test(event.data.evidenceSha256 ?? "")
      ) {
        errors.push(`${context} transition-started DB observations are invalid`);
      }
      if (event.data.schemaSha256 !== plan.source.startSchemaSha256) {
        errors.push(`${context} transition-started must observe the sealed START schema`);
      }
      outcome = "started";
    }
    if (event.type === "transition-done") {
      if (outcome !== "started") errors.push(`${context} transition-done requires started`);
      if (
        !exactKeys(event.data, ["schemaSha256", "evidenceSha256"]) ||
        !shaPattern.test(event.data.schemaSha256 ?? "") ||
        !shaPattern.test(event.data.evidenceSha256 ?? "")
      ) {
        errors.push(`${context} transition-done data must contain only DB observations`);
      }
      if (event.data.schemaSha256 !== plan.source.targetSchemaSha256) {
        errors.push(`${context} transition-done must observe the sealed TARGET schema`);
      }
      outcome = "done";
    }
    if (event.type === "transition-restored") {
      if (outcome !== "started") errors.push(`${context} transition-restored requires started`);
      if (!exactKeys(event.data, [
        "restoredDatabaseIdentity",
        "restoredDatabaseIdentitySha256",
        "schemaSha256",
        "evidenceSha256",
      ])) {
        errors.push(`${context} transition-restored data must contain only DB observations`);
      }
      validateDatabaseIdentity(
        event.data.restoredDatabaseIdentity,
        `${context} restoredDatabaseIdentity`,
        errors,
      );
      if (
        !shaPattern.test(event.data.restoredDatabaseIdentitySha256 ?? "") ||
        sha256Hex(canonicalJson(event.data.restoredDatabaseIdentity)) !==
          event.data.restoredDatabaseIdentitySha256
      ) {
        errors.push(`${context} restored transition lacks the observed DB identity digest`);
      }
      if (
        isObject(event.data.restoredDatabaseIdentity) &&
        event.data.restoredDatabaseIdentity.database !== plan.databaseIdentity.database
      ) {
        errors.push(`${context} restored database must use the sealed logical database name`);
      }
      if (
        isObject(event.data.restoredDatabaseIdentity) &&
        event.data.restoredDatabaseIdentity.serverVersion !== plan.runtime.engine
      ) {
        errors.push(`${context} restored database must use the sealed DB engine`);
      }
      if (
        !shaPattern.test(event.data.schemaSha256 ?? "") ||
        !shaPattern.test(event.data.evidenceSha256 ?? "")
      ) {
        errors.push(`${context} transition-restored DB observations are invalid`);
      }
      if (event.data.schemaSha256 !== plan.source.startSchemaSha256) {
        errors.push(`${context} transition-restored must observe the sealed START schema`);
      }
      outcome = "restored";
    }
  }
  if (scopeStatus === "pending" && outcome !== "done") {
    errors.push(`${context} completed dev evidence requires transition-done`);
  }
  if (scopeStatus === "released" && outcome !== "done") {
    errors.push(`${context} released production evidence requires transition-done`);
  }
  if (scopeStatus === "rolled_back" && outcome !== "restored") {
    errors.push(`${context} rolled_back production evidence requires transition-restored`);
  }
  return outcome;
}

function expectedEvidencePaths(version, scopeStatus) {
  const environment = scopeStatus === "pending" ? "dev" : "prod";
  const root = `content/releases/evidence/db-migrations/${version}/${environment}`;
  return {
    environment,
    plan: `${root}/plan.json`,
    execution: `${root}/execution.jsonl`,
  };
}

function validateBoundDevPair({
  version,
  prodPlan,
  apiSourceRef,
  readArtifact,
  readApiArtifact,
  requireTrustedApiSource,
  context,
  errors,
}) {
  if (typeof readArtifact !== "function") return;
  const root = `content/releases/evidence/db-migrations/${version}/dev`;
  const devPlanRef = {
    path: `${root}/plan.json`,
    sha256: prodPlan.devPlan?.sha256,
  };
  const devExecutionRef = {
    path: `${root}/execution.jsonl`,
    sha256: prodPlan.devExecution?.sha256,
  };
  const devPlanSource = readBoundArtifact(
    devPlanRef,
    readArtifact,
    `${context}.boundDevPlan`,
    errors,
  );
  const devExecutionSource = readBoundArtifact(
    devExecutionRef,
    readArtifact,
    `${context}.boundDevExecution`,
    errors,
  );
  if (devPlanSource == null || devExecutionSource == null) return;
  let devPlan;
  try {
    devPlan = JSON.parse(devPlanSource);
  } catch {
    errors.push(`${context}.boundDevPlan is invalid JSON`);
    return;
  }
  if (devPlanSource !== canonicalJson(devPlan)) {
    errors.push(`${context}.boundDevPlan must use canonical JSON`);
  }
  validatePlanShape(devPlan, "dev", `${context}.boundDevPlan`, errors);
  if (
    devPlan.apiSourceRef !== prodPlan.apiSourceRef ||
    (apiSourceRef && devPlan.apiSourceRef !== apiSourceRef)
  ) {
    errors.push(`${context}.boundDevPlan must use the same API source as the prod plan`);
  }
  if (canonicalJson(devPlan.runtime) !== canonicalJson(prodPlan.runtime)) {
    errors.push(`${context}.boundDevPlan must use the same DB runtime as the prod plan`);
  }
  if (devPlan.databaseIdentitySha256 === prodPlan.databaseIdentitySha256) {
    errors.push(`${context}.boundDevPlan and prod plan must use distinct DB identities`);
  }
  validateApiSource(
    devPlan,
    readApiArtifact,
    requireTrustedApiSource,
    `${context}.boundDevPlan`,
    errors,
  );
  const devEvents = parseExecution(
    devExecutionSource,
    devPlan,
    `${context}.boundDevExecution`,
    errors,
  );
  validateExecution(devEvents, devPlan, "pending", `${context}.boundDevExecution`, errors);
}

export function validateDbMigrationEvidence({
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
  const errors = [];
  if (!versionPattern.test(version ?? "")) errors.push(`${context} release version must use vX.Y.Z`);
  if (!exactKeys(evidence, ["plan", "execution"])) {
    return [`${context} must contain only plan and execution`];
  }
  if (scopeStatus === "planned") {
    if (evidence.plan !== null || evidence.execution !== null) {
      errors.push(`${context} planned evidence must have null plan and execution`);
    }
    return errors;
  }
  const paths = expectedEvidencePaths(version, scopeStatus);
  validateRef(evidence.plan, paths.plan, `${context}.plan`, errors);
  validateRef(evidence.execution, paths.execution, `${context}.execution`, errors, {
    nullable: scopeStatus === "pending" || scopeStatus === "in_progress",
  });
  const planSource = readBoundArtifact(evidence.plan, readArtifact, `${context}.plan`, errors);
  if (planSource == null) return errors;
  let plan;
  try {
    plan = JSON.parse(planSource);
  } catch {
    errors.push(`${context}.plan is invalid JSON`);
    return errors;
  }
  if (planSource !== canonicalJson(plan)) errors.push(`${context}.plan must use canonical JSON`);
  validatePlanShape(plan, paths.environment, `${context}.plan`, errors);
  if (apiSourceRef && plan.apiSourceRef !== apiSourceRef) {
    errors.push(`${context}.plan API source ref does not match release metadata`);
  }
  validateApiSource(plan, readApiArtifact, requireTrustedApiSource, `${context}.plan`, errors);
  if (paths.environment === "prod") {
    validateBoundDevPair({
      version,
      prodPlan: plan,
      apiSourceRef,
      readArtifact,
      readApiArtifact,
      requireTrustedApiSource,
      context: `${context}.plan`,
      errors,
    });
  }

  if (evidence.execution !== null) {
    const executionSource = readBoundArtifact(
      evidence.execution,
      readArtifact,
      `${context}.execution`,
      errors,
    );
    if (executionSource !== null) {
      const events = parseExecution(executionSource, plan, `${context}.execution`, errors);
      validateExecution(events, plan, scopeStatus, `${context}.execution`, errors);
    }
  } else if (!new Set(["pending", "in_progress"]).has(scopeStatus)) {
    errors.push(`${context} requires execution.jsonl`);
  }

  if (typeof listArtifacts === "function") {
    const root = `content/releases/evidence/db-migrations/${version}/`;
    const allowed = new Set([evidence.plan?.path]);
    if (evidence.execution?.path) allowed.add(evidence.execution.path);
    if (paths.environment === "prod") {
      allowed.add(`${root}dev/plan.json`);
      allowed.add(`${root}dev/execution.jsonl`);
    }
    const inventory = listArtifacts(root);
    if (inventory === null) {
      errors.push(`${context} artifact inventory is unreadable or contains a special entry`);
      return errors;
    }
    for (const file of inventory ?? []) {
      if (!allowed.has(file)) errors.push(`${context} contains unsupported artifact: ${file}`);
    }
  }
  return errors;
}
