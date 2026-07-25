import { createHash } from "node:crypto";
import path from "node:path";

export const dbMigrationMaintenanceEvidenceSchema =
  "db-migration-maintenance-evidence/v1";
export const dbMigrationPrecanonicalTransitionEvidenceSchema =
  "db-migration-precanonical-transition-evidence/v1";

const sha256Pattern = /^[0-9a-f]{64}$/u;
const environments = ["dev", "prod"];
const precanonicalTransitionVersion = "v2.3.0";

export function sha256Hex(source) {
  return createHash("sha256").update(source).digest("hex");
}

export function isMaintenanceDbMigrationEvidence(evidence) {
  return [
    dbMigrationMaintenanceEvidenceSchema,
    dbMigrationPrecanonicalTransitionEvidenceSchema,
  ].includes(evidence?.schema);
}

export function validateMaintenanceDbMigrationEvidence({
  evidence,
  version,
  terminal,
  scopeStatus,
  readArtifact,
  context,
}) {
  const errors = [];
  if (!isPlainObject(evidence)) {
    return [`${context} must be an object`];
  }
  const transition =
    evidence.schema === dbMigrationPrecanonicalTransitionEvidenceSchema;
  validateExactKeys(
    evidence,
    transition
      ? ["schema", "dev", "prod", "prodDisposition"]
      : ["schema", "dev", "prod"],
    context,
    errors,
  );
  if (!isMaintenanceDbMigrationEvidence(evidence)) {
    errors.push(
      `${context}.schema must be ${dbMigrationMaintenanceEvidenceSchema} or ${dbMigrationPrecanonicalTransitionEvidenceSchema}`,
    );
  }

  const active = scopeStatus === "pending" || scopeStatus === "in_progress";
  for (const environment of environments) {
    const transitionProd = transition && environment === "prod";
    const requirePlan =
      environment === "dev" ? terminal || active : terminal;
    validateEnvironmentArtifacts({
      value: evidence[environment],
      environment,
      version,
      terminal: terminal && !transitionProd,
      requirePlan: requirePlan && !transitionProd,
      readArtifact,
      context: `${context}.${environment}`,
      errors,
    });
  }
  if (!transition) {
    validateArtifactSequence(evidence, context, errors);
  }
  if (transition) {
    validatePrecanonicalProdDisposition({
      evidence,
      version,
      terminal,
      scopeStatus,
      readArtifact,
      context,
      errors,
    });
  }
  return errors;
}

function validateArtifactSequence(evidence, context, errors) {
  const artifacts = [
    ["dev.plan", evidence.dev?.plan],
    ["dev.execution", evidence.dev?.execution],
    ["prod.plan", evidence.prod?.plan],
    ["prod.execution", evidence.prod?.execution],
  ];
  let missingPredecessor = false;

  for (const [artifactName, artifact] of artifacts) {
    if (artifact === null || artifact === undefined) {
      missingPredecessor = true;
      continue;
    }
    if (missingPredecessor) {
      errors.push(
        `${context} artifacts must follow dev.plan -> dev.execution -> prod.plan -> prod.execution; ${artifactName} has a missing predecessor`,
      );
    }
  }
}

function validatePrecanonicalProdDisposition({
  evidence,
  version,
  terminal,
  scopeStatus,
  readArtifact,
  context,
  errors,
}) {
  const disposition = evidence.prodDisposition;
  if (version !== precanonicalTransitionVersion) {
    errors.push(
      `${context}.schema is a one-time transition allowed only for ${precanonicalTransitionVersion}`,
    );
  }
  if (!terminal || scopeStatus !== "released") {
    errors.push(`${context}.prodDisposition is allowed only for the released DB migration scope`);
  }
  if (evidence.prod?.plan !== null || evidence.prod?.execution !== null) {
    errors.push(`${context}.prod plan and execution must be null for the pre-canonical disposition`);
  }
  if (!isPlainObject(disposition)) {
    errors.push(`${context}.prodDisposition must be an object`);
    return;
  }
  validateExactKeys(
    disposition,
    [
      "kind",
      "version",
      "verifiedAt",
      "catalogSha256",
      "ledgerCompatibilitySha256",
      "databaseIdentitySha256",
      "schemaFingerprintSha256",
      "catalogEntryCount",
      "catalogResolvedCount",
      "pendingCount",
      "adjudicableLedgerGapCount",
      "migration91Postcondition",
      "historicalEvidence",
      "limitation",
    ],
    `${context}.prodDisposition`,
    errors,
  );
  if (disposition.kind !== "pre-canonical-applied") {
    errors.push(`${context}.prodDisposition.kind must be pre-canonical-applied`);
  }
  if (
    disposition.version !== version ||
    disposition.version !== precanonicalTransitionVersion
  ) {
    errors.push(
      `${context}.prodDisposition.version must be ${precanonicalTransitionVersion}`,
    );
  }
  if (!isIsoUtcTimestamp(disposition.verifiedAt)) {
    errors.push(`${context}.prodDisposition.verifiedAt must be an ISO-8601 UTC timestamp`);
  }
  for (const key of [
    "catalogSha256",
    "ledgerCompatibilitySha256",
    "databaseIdentitySha256",
    "schemaFingerprintSha256",
  ]) {
    if (
      typeof disposition[key] !== "string" ||
      !sha256Pattern.test(disposition[key])
    ) {
      errors.push(`${context}.prodDisposition.${key} must be a lowercase SHA-256`);
    }
  }
  if (
    !Number.isSafeInteger(disposition.catalogEntryCount) ||
    disposition.catalogEntryCount <= 0
  ) {
    errors.push(`${context}.prodDisposition.catalogEntryCount must be a positive integer`);
  }
  if (
    disposition.catalogResolvedCount !== disposition.catalogEntryCount ||
    disposition.pendingCount !== 0 ||
    disposition.adjudicableLedgerGapCount !== 0
  ) {
    errors.push(
      `${context}.prodDisposition must prove the full catalog resolved with zero pending or adjudicable gaps`,
    );
  }
  if (disposition.migration91Postcondition !== "passed") {
    errors.push(`${context}.prodDisposition.migration91Postcondition must be passed`);
  }
  for (const key of ["historicalEvidence", "limitation"]) {
    if (!isConcreteText(disposition[key])) {
      errors.push(`${context}.prodDisposition.${key} must be concrete evidence`);
    }
  }

  const devPlanRef = evidence.dev?.plan;
  if (
    readArtifact &&
    isPlainObject(devPlanRef) &&
    typeof devPlanRef.path === "string"
  ) {
    const source = readArtifact(devPlanRef.path);
    if (source !== null) {
      try {
        const devPlan = JSON.parse(source.toString());
        const partitionCount = [
          ...(devPlan.appliedRefs ?? []),
          ...(devPlan.recoveredRefs ?? []),
          ...(devPlan.baselineRefs ?? []),
          ...(devPlan.supersededRefs ?? []),
          ...(devPlan.pendingRefs ?? []),
        ].length;
        if (
          devPlan.catalog?.sha256 !== disposition.catalogSha256 ||
          devPlan.ledgerCompatibility?.sha256 !==
            disposition.ledgerCompatibilitySha256 ||
          partitionCount !== disposition.catalogEntryCount
        ) {
          errors.push(
            `${context}.prodDisposition must match the canonical dev plan catalog and ledger compatibility`,
          );
        }
      } catch {
        errors.push(`${context}.dev.plan must contain valid JSON for the transition disposition`);
      }
    }
  }
}

function validateEnvironmentArtifacts({
  value,
  environment,
  version,
  terminal,
  requirePlan,
  readArtifact,
  context,
  errors,
}) {
  if (!isPlainObject(value)) {
    errors.push(`${context} must be an object`);
    return;
  }
  validateExactKeys(value, ["plan", "execution"], context, errors);
  validateArtifactRef({
    value: value.plan,
    expectedSuffix: "plan.json",
    environment,
    version,
    terminal,
    required: requirePlan,
    readArtifact,
    context: `${context}.plan`,
    errors,
  });
  validateArtifactRef({
    value: value.execution,
    expectedSuffix: "execution.jsonl",
    environment,
    version,
    terminal,
    required: terminal,
    readArtifact,
    context: `${context}.execution`,
    errors,
  });
}

function validateArtifactRef({
  value,
  expectedSuffix,
  environment,
  version,
  terminal,
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
