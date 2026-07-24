import { createHash } from "node:crypto";
import path from "node:path";

export const dbMigrationMaintenanceEvidenceSchema =
  "db-migration-maintenance-evidence/v1";

const sha256Pattern = /^[0-9a-f]{64}$/u;
const environments = ["dev", "prod"];

export function sha256Hex(source) {
  return createHash("sha256").update(source).digest("hex");
}

export function isMaintenanceDbMigrationEvidence(evidence) {
  return evidence?.schema === dbMigrationMaintenanceEvidenceSchema;
}

export function validateMaintenanceDbMigrationEvidence({
  evidence,
  version,
  terminal,
  requirePlan = terminal,
  readArtifact,
  context,
}) {
  const errors = [];
  if (!isPlainObject(evidence)) {
    return [`${context} must be an object`];
  }
  validateExactKeys(evidence, ["schema", "dev", "prod"], context, errors);
  if (evidence.schema !== dbMigrationMaintenanceEvidenceSchema) {
    errors.push(`${context}.schema must be ${dbMigrationMaintenanceEvidenceSchema}`);
  }

  for (const environment of environments) {
    validateEnvironmentArtifacts({
      value: evidence[environment],
      environment,
      version,
      terminal,
      requirePlan,
      readArtifact,
      context: `${context}.${environment}`,
      errors,
    });
  }
  return errors;
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
