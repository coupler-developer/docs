import { createHash } from "node:crypto";
import path from "node:path";

export const dbMigrationMaintenanceEvidenceSchema =
  "db-migration-maintenance-evidence/v1";
export const dbMigrationPrecanonicalTransitionEvidenceSchema =
  "db-migration-precanonical-transition-evidence/v1";
export const dbMigrationEmergencyCompletionEvidenceSchema =
  "db-migration-emergency-completion-evidence/v1";

const sha256Pattern = /^[0-9a-f]{64}$/u;
const environments = ["dev", "prod"];
const precanonicalTransitionVersion = "v2.3.0";
const emergencyCompletionVersion = "v2.4.0";
const emergencyCompletionContract = {
  schema: dbMigrationEmergencyCompletionEvidenceSchema,
  version: emergencyCompletionVersion,
  apiSourceRef: "299abc63d0c4cebaaff9f27a9f1484e0ef82c9db",
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

export function sha256Hex(source) {
  return createHash("sha256").update(source).digest("hex");
}

export function isMaintenanceDbMigrationEvidence(evidence) {
  return [
    dbMigrationMaintenanceEvidenceSchema,
    dbMigrationPrecanonicalTransitionEvidenceSchema,
    dbMigrationEmergencyCompletionEvidenceSchema,
  ].includes(evidence?.schema);
}

export function validateMaintenanceDbMigrationEvidence({
  evidence,
  version,
  apiSourceRef,
  terminal,
  scopeStatus,
  readArtifact,
  context,
}) {
  const errors = [];
  if (!isPlainObject(evidence)) {
    return [`${context} must be an object`];
  }
  if (evidence.schema === dbMigrationEmergencyCompletionEvidenceSchema) {
    return validateEmergencyCompletionEvidence({
      evidence,
      version,
      apiSourceRef,
      terminal,
      scopeStatus,
      context,
    });
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
      `${context}.schema must be ${dbMigrationMaintenanceEvidenceSchema}, ${dbMigrationPrecanonicalTransitionEvidenceSchema}, or ${dbMigrationEmergencyCompletionEvidenceSchema}`,
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

function validateEmergencyCompletionEvidence({
  evidence,
  version,
  apiSourceRef,
  terminal,
  scopeStatus,
  context,
}) {
  const errors = [];
  if (version !== emergencyCompletionVersion || evidence.version !== emergencyCompletionVersion) {
    errors.push(`${context}.schema is allowed only for ${emergencyCompletionVersion}`);
  }
  if (!terminal || scopeStatus !== "released") {
    errors.push(`${context} is allowed only for the released DB migration scope`);
  }
  if (evidence.apiSourceRef !== apiSourceRef) {
    errors.push(`${context}.apiSourceRef must match the v2.4.0 API release commit`);
  }
  if (canonicalJson(evidence) !== canonicalJson(emergencyCompletionContract)) {
    errors.push(`${context} must match the sealed v2.4.0 emergency completion evidence`);
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

function canonicalJson(value) {
  if (Array.isArray(value)) {
    return `[${value.map((entry) => canonicalJson(entry)).join(",")}]`;
  }
  if (isPlainObject(value)) {
    return `{${Object.keys(value)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
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
