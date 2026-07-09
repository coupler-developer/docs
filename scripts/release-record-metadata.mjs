import {
  allowedReleaseScopes,
  allowedApiContractCutoverStatuses,
  allowedDbMigrationGateResultStatuses,
  allowedReleaseStatuses,
  apiContractCutoverRequiredPaths,
  commitShaPattern,
  completedReleaseStatus,
  dbMigrationGateIds,
  findReleasePlaceholderSignals,
  getNestedValue,
  getRequiredRepoRefsForReleaseScopes,
  hasContractsPackageVersion,
  isCommitSha,
  isEmptyRefValue,
  isNonApplicableEvidenceValue,
  isNonEmptyString,
  isSemverTag,
  isSubmittedMarkerTag,
  knownRepoNames,
  recordRepoName,
  releaseScopeDescriptors,
  releaseMetadataSchema,
  releaseMetadataRequiredTopLevelKeys,
  releaseMetadataTopLevelKeys,
  semverTagPattern,
  sha256Pattern,
  valueHasReleasePlaceholderSignal,
  versionMappingFieldDescriptors,
} from "./release-schema.mjs";

export {
  findReleasePlaceholderSignals,
  knownRepoNames,
  releaseMetadataSchema,
};

export function parseReleaseMetadataBlock(source, context, errors) {
  const matches = [
    ...source.matchAll(/^```release-metadata\s*\n([\s\S]*?)\n```$/gm),
  ];

  if (matches.length === 0) {
    errors.push(`${context}: release-metadata block is required`);
    return null;
  }

  if (matches.length > 1) {
    errors.push(`${context}: release-metadata block must appear exactly once`);
    return null;
  }

  try {
    return JSON.parse(matches[0][1]);
  } catch (error) {
    errors.push(`${context}: release-metadata JSON parse failed: ${error.message}`);
    return null;
  }
}

export function hasReleaseMetadataBlock(source) {
  return /^```release-metadata\s*\n[\s\S]*?\n```$/m.test(source);
}

export function validateReleaseMetadata(metadata, context, expectedVersion, errors) {
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) {
    errors.push(`${context}: release-metadata must be a JSON object`);
    return;
  }

  if (metadata.schema !== releaseMetadataSchema) {
    errors.push(`${context}: release-metadata schema must be ${releaseMetadataSchema}`);
  }

  validateTopLevelKeys(metadata, context, errors);
  validateRequiredTopLevelKeys(metadata, context, errors);

  if (!isSemverTag(metadata.version)) {
    errors.push(`${context}: release-metadata version must use vMAJOR.MINOR.PATCH`);
  } else if (metadata.version !== expectedVersion) {
    errors.push(`${context}: release-metadata version does not match file name: ${expectedVersion}`);
  }

  if (!isNonEmptyString(metadata.status)) {
    errors.push(`${context}: release-metadata status is required`);
  } else if (!allowedReleaseStatuses.has(metadata.status)) {
    errors.push(`${context}: release-metadata status is not allowed: ${metadata.status}`);
  }

  validateReleaseScopes(metadata, context, errors);
  validateExtraRepoRefs(metadata, context, errors);
  validateScopeResults(metadata, context, errors);
  validateVersionMapping(metadata.versionMapping, context, errors);
  validateDocsVersionMapping(metadata, context, errors);
  validateApiContractCutoverMetadata(metadata, context, errors);
  validateReleaseCompletionState(metadata, context, errors);
}

function validateTopLevelKeys(metadata, context, errors) {
  for (const key of Object.keys(metadata)) {
    if (releaseMetadataTopLevelKeys.has(key)) {
      continue;
    }

    errors.push(
      `${context}: release-metadata has unknown top-level key: ${key}`,
    );
  }
}

function validateRequiredTopLevelKeys(metadata, context, errors) {
  for (const key of releaseMetadataRequiredTopLevelKeys) {
    if (Object.hasOwn(metadata, key)) {
      continue;
    }

    errors.push(
      `${context}: release-metadata is missing required top-level key: ${key}`,
    );
  }
}

export function getMetadataRepoRefNames(metadata) {
  const releaseScopes = Array.isArray(metadata?.releaseScopes) ? metadata.releaseScopes : [];
  const extraRepoRefs = Array.isArray(metadata?.extraRepoRefs) ? metadata.extraRepoRefs : [];
  const requiredRepoRefs = getRequiredRepoRefsForReleaseScopes(releaseScopes);

  return new Set([...requiredRepoRefs, ...extraRepoRefs]);
}

export function getMetadataReleaseScopes(metadata) {
  return new Set(Array.isArray(metadata?.releaseScopes) ? metadata.releaseScopes : []);
}

export function getMetadataMappingBasis(metadata, repoName) {
  const repoMapping = metadata?.versionMapping?.[repoName];
  const tags = [];
  const commits = [];

  if (!repoMapping || typeof repoMapping !== "object") {
    return {
      tags,
      commits,
    };
  }

  for (const tagValue of [repoMapping.tag, repoMapping.releaseTag]) {
    if (isEmptyRefValue(tagValue)) {
      continue;
    }

    if (typeof tagValue === "string" && semverTagPattern.test(tagValue)) {
      tags.push({
        type: "tag",
        value: tagValue,
      });
    }
  }

  if (
    typeof repoMapping.commit === "string" &&
    commitShaPattern.test(repoMapping.commit)
  ) {
    commits.push({
      type: "commit",
      value: repoMapping.commit.toLowerCase(),
    });
  }

  return {
    tags,
    commits,
  };
}

function validateReleaseScopes(metadata, context, errors) {
  validateStringArray(metadata.releaseScopes, `${context}: release-metadata releaseScopes`, errors);
  const releaseScopes = Array.isArray(metadata.releaseScopes) ? metadata.releaseScopes : [];

  if (releaseScopes.length === 0) {
    errors.push(`${context}: release-metadata releaseScopes must include at least one scope`);
  } else if (!releaseScopes.includes(recordRepoName)) {
    errors.push(`${context}: release-metadata releaseScopes must include ${recordRepoName}`);
  }

  validateUniqueAllowedValues({
    values: releaseScopes,
    allowedValues: allowedReleaseScopes,
    context,
    fieldName: "releaseScopes",
    valueLabel: "scope",
    errors,
  });
}

function validateExtraRepoRefs(metadata, context, errors) {
  if (metadata.repoRefs !== undefined) {
    errors.push(
      `${context}: release-metadata repoRefs is not allowed; derive repo refs from releaseScopes and extraRepoRefs`,
    );
  }

  validateStringArray(metadata.extraRepoRefs, `${context}: release-metadata extraRepoRefs`, errors);
  const extraRepoRefs = Array.isArray(metadata.extraRepoRefs) ? metadata.extraRepoRefs : [];

  validateUniqueAllowedValues({
    values: extraRepoRefs,
    allowedValues: knownRepoNames,
    context,
    fieldName: "extraRepoRefs",
    valueLabel: "repo",
    errors,
  });
}

function validateScopeResults(metadata, context, errors) {
  const scopeResults = metadata.scopeResults;
  const releaseScopes = Array.isArray(metadata.releaseScopes) ? metadata.releaseScopes : [];

  if (!scopeResults || typeof scopeResults !== "object" || Array.isArray(scopeResults)) {
    errors.push(`${context}: release-metadata scopeResults must be a JSON object`);
    return;
  }

  const releaseScopeSet = new Set(releaseScopes);
  for (const scopeName of releaseScopes) {
    if (!Object.hasOwn(scopeResults, scopeName)) {
      errors.push(`${context}: release-metadata scopeResults is missing release scope: ${scopeName}`);
    }
  }

  for (const scopeName of Object.keys(scopeResults)) {
    if (!releaseScopeSet.has(scopeName)) {
      errors.push(`${context}: release-metadata scopeResults has scope not listed in releaseScopes: ${scopeName}`);
    }

    validateScopeResult(metadata, scopeName, scopeResults[scopeName], context, errors);
  }
}

function validateScopeResult(metadata, scopeName, result, context, errors) {
  const descriptor = releaseScopeDescriptors[scopeName];
  if (!descriptor) {
    return;
  }

  if (!result || typeof result !== "object" || Array.isArray(result)) {
    errors.push(`${context}: release-metadata scopeResults.${scopeName} must be an object`);
    return;
  }

  validateScopeResultKeys(scopeName, result, context, errors);

  if (!isNonEmptyString(result.status)) {
    errors.push(`${context}: release-metadata scopeResults.${scopeName}.status is required`);
  } else if (!allowedReleaseStatuses.has(result.status)) {
    errors.push(`${context}: release-metadata scopeResults.${scopeName}.status is not allowed: ${result.status}`);
  }

  if (result.summary !== undefined && result.summary !== null && !isNonEmptyString(result.summary)) {
    errors.push(`${context}: release-metadata scopeResults.${scopeName}.summary must be a string or null`);
  }

  if (!result.evidence || typeof result.evidence !== "object" || Array.isArray(result.evidence)) {
    errors.push(`${context}: release-metadata scopeResults.${scopeName}.evidence must be a JSON object`);
  } else {
    validateScopeEvidenceKeys(scopeName, result.evidence, context, errors);
    validateScopeEvidenceShape(scopeName, result.evidence, context, errors);
    validateEvidenceValueShape(result.evidence, ["scopeResults", scopeName, "evidence"], context, errors);
  }

  if (result.status === "superseded") {
    validateSupersededScopeResult(scopeName, result, context, errors);
  } else {
    for (const key of ["supersededBy", "incompleteReason", "tagStatus"]) {
      if (result[key] !== undefined && result[key] !== null) {
        errors.push(`${context}: release-metadata scopeResults.${scopeName}.${key} is only allowed for superseded scope results`);
      }
    }
  }

  if (result.status === "rolled_back") {
    validateConcreteEvidenceValue({
      value: result.rollbackReason,
      context,
      scopeName,
      fieldPath: `scopeResults.${scopeName}.rollbackReason`,
      errors,
    });
  } else if (result.rollbackReason !== undefined && result.rollbackReason !== null) {
    errors.push(`${context}: release-metadata scopeResults.${scopeName}.rollbackReason is only allowed for rolled_back scope results`);
  }
}

function validateScopeResultKeys(scopeName, result, context, errors) {
  const allowedKeys = new Set([
    "status",
    "summary",
    "evidence",
    "rollbackReason",
    "supersededBy",
    "incompleteReason",
    "tagStatus",
  ]);

  for (const key of Object.keys(result)) {
    if (!allowedKeys.has(key)) {
      errors.push(`${context}: release-metadata scopeResults.${scopeName} has unknown key: ${key}`);
    }
  }
}

function validateScopeEvidenceKeys(scopeName, evidence, context, errors) {
  const expectedKeys = getExpectedScopeEvidenceKeys(scopeName);
  for (const key of expectedKeys) {
    if (!Object.hasOwn(evidence, key)) {
      errors.push(`${context}: release-metadata scopeResults.${scopeName}.evidence is missing ${key}`);
    }
  }

  for (const key of Object.keys(evidence)) {
    if (!expectedKeys.has(key)) {
      errors.push(`${context}: release-metadata scopeResults.${scopeName}.evidence has unknown key: ${key}`);
    }
  }
}

function validateScopeEvidenceShape(scopeName, evidence, context, errors) {
  const seenPaths = new Set();
  for (const descriptor of [
    ...(releaseScopeDescriptors[scopeName]?.releasedEvidence ?? []),
    ...(releaseScopeDescriptors[scopeName]?.rollbackEvidence ?? []),
  ]) {
    const evidenceIndex = descriptor.metadataPath.indexOf("evidence");
    if (evidenceIndex === -1 || evidenceIndex === descriptor.metadataPath.length - 1) {
      continue;
    }

    const relativePath = descriptor.metadataPath.slice(evidenceIndex + 1);
    const fieldPath = `scopeResults.${scopeName}.evidence.${relativePath.join(".")}`;
    if (seenPaths.has(fieldPath)) {
      continue;
    }
    seenPaths.add(fieldPath);

    const value = getNestedValue(evidence, relativePath);
    validateEvidenceShapeValue({
      value,
      valueType: descriptor.valueType,
      context,
      fieldPath,
      errors,
    });
  }
}

function validateEvidenceShapeValue({
  value,
  valueType,
  context,
  fieldPath,
  errors,
}) {
  if (
    valueType === "concreteEvidence" ||
    valueType === "contractsPackageVersion" ||
    valueType === "mobileStore"
  ) {
    if (value !== null && typeof value !== "string") {
      errors.push(`${context}: release-metadata ${fieldPath} must be a string or null`);
    }
    return;
  }

  if (valueType === "submittedMarkers") {
    validateSubmittedMarkersShape(value, context, fieldPath, errors);
    return;
  }

  if (valueType === "dbMigrationSqlRefs") {
    validateDbMigrationSqlRefsShape(value, context, fieldPath, errors);
    return;
  }

  if (valueType === "dbMigrationGateResults") {
    validateDbMigrationGateResultsShape(value, context, fieldPath, errors);
    return;
  }

  if (valueType === "dbMigrationLedger") {
    validateDbMigrationLedgerShape(value, context, fieldPath, errors);
  }
}

function getExpectedScopeEvidenceKeys(scopeName) {
  const descriptor = releaseScopeDescriptors[scopeName];
  const expectedKeys = new Set();
  for (const evidence of [
    ...(descriptor?.releasedEvidence ?? []),
    ...(descriptor?.rollbackEvidence ?? []),
  ]) {
    const evidenceIndex = evidence.metadataPath.indexOf("evidence");
    if (evidenceIndex === -1 || evidenceIndex === evidence.metadataPath.length - 1) {
      continue;
    }

    expectedKeys.add(evidence.metadataPath[evidenceIndex + 1]);
  }

  return expectedKeys;
}

function validateSupersededScopeResult(scopeName, result, context, errors) {
  if (!isSemverTag(result.supersededBy)) {
    errors.push(`${context}: release-metadata scopeResults.${scopeName}.supersededBy must be vMAJOR.MINOR.PATCH`);
  }

  validateConcreteEvidenceValue({
    value: result.incompleteReason,
    context,
    scopeName,
    fieldPath: `scopeResults.${scopeName}.incompleteReason`,
    errors,
  });

  if (!["not_created", "created", "deleted", "retained", "not_required"].includes(result.tagStatus)) {
    errors.push(`${context}: release-metadata scopeResults.${scopeName}.tagStatus is not allowed: ${result.tagStatus}`);
  }
}

function validateEvidenceValueShape(value, pathParts, context, errors) {
  if (value == null || typeof value === "string") {
    return;
  }

  if (Array.isArray(value)) {
    value.forEach((childValue, index) => {
      validateEvidenceValueShape(childValue, [...pathParts, String(index)], context, errors);
    });
    return;
  }

  if (typeof value === "object") {
    for (const [key, childValue] of Object.entries(value)) {
      validateEvidenceValueShape(childValue, [...pathParts, key], context, errors);
    }
    return;
  }

  errors.push(`${context}: release-metadata ${pathParts.join(".")} must contain strings, objects, or null only`);
}

function validateUniqueAllowedValues({
  values,
  allowedValues,
  context,
  fieldName,
  valueLabel,
  errors,
}) {
  const seenValues = new Set();

  for (const value of values) {
    if (!allowedValuesHas(allowedValues, value)) {
      errors.push(`${context}: release-metadata ${fieldName} has unknown ${valueLabel}: ${value}`);
    }

    if (seenValues.has(value)) {
      errors.push(`${context}: release-metadata ${fieldName} has duplicate ${valueLabel}: ${value}`);
    }

    seenValues.add(value);
  }
}

function allowedValuesHas(allowedValues, value) {
  if (allowedValues instanceof Set) {
    return allowedValues.has(value);
  }

  return allowedValues.includes(value);
}

function validateVersionMapping(versionMapping, context, errors) {
  if (!versionMapping || typeof versionMapping !== "object" || Array.isArray(versionMapping)) {
    errors.push(`${context}: release-metadata versionMapping must be a JSON object`);
    return;
  }

  validateAllowedObjectKeys({
    value: versionMapping,
    allowedKeys: knownRepoNames,
    context,
    fieldPath: "versionMapping",
    errors,
  });

  for (const repoName of knownRepoNames) {
    const repoMapping = versionMapping[repoName];

    if (!repoMapping || typeof repoMapping !== "object" || Array.isArray(repoMapping)) {
      errors.push(`${context}: release-metadata versionMapping is missing ${repoName}`);
      continue;
    }

    validateRepoMapping(repoName, repoMapping, context, errors);
  }
}

function validateRepoMapping(repoName, repoMapping, context, errors) {
  validateExactObjectKeys({
    value: repoMapping,
    allowedKeys: (versionMappingFieldDescriptors[repoName] ?? []).map(({ key }) => key),
    context,
    fieldPath: `versionMapping.${repoName}`,
    errors,
  });

  for (const descriptor of versionMappingFieldDescriptors[repoName] ?? []) {
    validateRepoMappingValue(repoName, repoMapping, descriptor, context, errors);
  }
}

function validateRepoMappingValue(repoName, repoMapping, descriptor, context, errors) {
  const value = repoMapping[descriptor.key];

  if (isEmptyRefValue(value)) {
    return;
  }

  if (descriptor.valueType === "semverTagOrEmpty" && !isSemverTag(value)) {
    errors.push(`${context}: ${repoName} metadata ${descriptor.key} must be vMAJOR.MINOR.PATCH or null`);
    return;
  }

  if (descriptor.valueType === "commitShaOrEmpty" && !isCommitSha(value)) {
    errors.push(`${context}: ${repoName} metadata ${descriptor.key} must be a SHA or null`);
    return;
  }

  if (
    descriptor.valueType === "mobileStoreOrEmpty" &&
    (typeof value !== "string" || !/^\d+\.\d+\.\d+\s+\(\d+\)$/.test(value))
  ) {
    errors.push(`${context}: ${repoName} metadata ${descriptor.key} must be "X.Y.Z (build)" or null`);
    return;
  }

  if (descriptor.valueType === "stringOrEmpty" && !isNonEmptyString(value)) {
    errors.push(`${context}: ${repoName} metadata ${descriptor.key} must be a string or null`);
  }
}

function validateDocsVersionMapping(metadata, context, errors) {
  const docsMapping = metadata.versionMapping?.docs;
  if (!docsMapping || typeof docsMapping !== "object" || Array.isArray(docsMapping)) {
    return;
  }

  if (!isEmptyRefValue(docsMapping.commit)) {
    errors.push(
      `${context}: docs metadata commit is not a stable self-reference; use docs tag or null`,
    );
  }

  if (!isEmptyRefValue(docsMapping.tag) && docsMapping.tag !== metadata.version) {
    errors.push(`${context}: docs metadata tag must match release-metadata version`);
  }
}

function validateApiContractCutoverMetadata(metadata, context, errors) {
  const cutover = metadata.apiContractCutover;

  if (cutover == null) {
    return;
  }

  if (typeof cutover !== "object" || Array.isArray(cutover)) {
    errors.push(`${context}: release-metadata apiContractCutover must be an object or null`);
    return;
  }

  validateApiContractCutoverKeys(cutover, context, errors);

  if (!isNonEmptyString(cutover.status)) {
    errors.push(`${context}: release-metadata apiContractCutover.status is required`);
  } else if (!allowedApiContractCutoverStatuses.has(cutover.status)) {
    errors.push(`${context}: release-metadata apiContractCutover.status is not allowed: ${cutover.status}`);
  }

  for (const pathParts of apiContractCutoverRequiredPaths) {
    const value = getNestedValue(metadata, pathParts);
    const fieldPath = pathParts.join(".");

    if (!isNonEmptyString(value)) {
      errors.push(`${context}: release-metadata ${fieldPath} must be a non-empty string`);
    }
  }

  if (cutover.status === "rollback" && metadata.status !== "rolled_back") {
    errors.push(`${context}: release-metadata apiContractCutover.status rollback requires release-metadata status rolled_back`);
  }

  if (isTerminalApiContractCutoverStatus(cutover.status)) {
    validateTerminalApiContractCutoverFields(metadata, context, errors);
  }
}

function validateApiContractCutoverKeys(cutover, context, errors) {
  validateExactObjectKeys({
    value: cutover,
    allowedKeys: [
      "status",
      "comparisonRefs",
      "contractArtifactSync",
      "nPlusOneDeployment",
      "legacyTrafficBlock",
      "adminVerification",
      "rollback",
    ],
    context,
    fieldPath: "apiContractCutover",
    errors,
  });

  validateNestedObjectKeys({
    value: cutover.comparisonRefs,
    allowedKeys: ["coupler-api", "coupler-mobile-app", "coupler-admin-web"],
    context,
    fieldPath: "apiContractCutover.comparisonRefs",
    errors,
  });
  validateNestedObjectKeys({
    value: cutover.contractArtifactSync,
    allowedKeys: ["command", "result", "consumerPath"],
    context,
    fieldPath: "apiContractCutover.contractArtifactSync",
    errors,
  });
  validateNestedObjectKeys({
    value: cutover.nPlusOneDeployment,
    allowedKeys: ["target", "appliedAt", "evidence"],
    context,
    fieldPath: "apiContractCutover.nPlusOneDeployment",
    errors,
  });
  validateNestedObjectKeys({
    value: cutover.legacyTrafficBlock,
    allowedKeys: ["previousVersionBuild", "forceUpdateConfig", "versionCodeCheck"],
    context,
    fieldPath: "apiContractCutover.legacyTrafficBlock",
    errors,
  });
  validateNestedObjectKeys({
    value: cutover.adminVerification,
    allowedKeys: ["versionSettingsSave", "operatorActionSmoke"],
    context,
    fieldPath: "apiContractCutover.adminVerification",
    errors,
  });
  validateNestedObjectKeys({
    value: cutover.rollback,
    allowedKeys: ["previousRefs", "dbBackupRestore", "cautions"],
    context,
    fieldPath: "apiContractCutover.rollback",
    errors,
  });
}

function validateNestedObjectKeys({
  value,
  allowedKeys,
  context,
  fieldPath,
  errors,
}) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    errors.push(`${context}: release-metadata ${fieldPath} must be a JSON object`);
    return;
  }

  validateExactObjectKeys({
    value,
    allowedKeys,
    context,
    fieldPath,
    errors,
  });
}

function validateReleaseCompletionState(metadata, context, errors) {
  validateMetadataStatusMatchesScopeResults(metadata, context, errors);

  const scopeResults = metadata.scopeResults && typeof metadata.scopeResults === "object"
    ? metadata.scopeResults
    : {};
  const releaseScopes = Array.isArray(metadata.releaseScopes) ? metadata.releaseScopes : [];

  for (const scopeName of releaseScopes) {
    const result = scopeResults[scopeName];
    if (!result || typeof result !== "object") {
      continue;
    }

    if (result.status === "released") {
      validateCompletedScopeResult(metadata, context, scopeName, errors);
      continue;
    }

    if (result.status === "rolled_back") {
      validateRolledBackScopeResult(metadata, context, scopeName, errors);
    }
  }

  if (metadata.status === completedReleaseStatus || metadata.status === "rolled_back") {
    validateTerminalApiContractCutoverStatus(metadata, context, errors);
  }
}

function validateMetadataStatusMatchesScopeResults(metadata, context, errors) {
  const derivedStatus = deriveReleaseStatusFromScopeResults(metadata);
  if (!derivedStatus || metadata.status === derivedStatus) {
    return;
  }

  errors.push(
    `${context}: release-metadata status must match scopeResults derived status: ${derivedStatus}`,
  );
}

export function deriveReleaseStatusFromScopeResults(metadata) {
  const releaseScopes = Array.isArray(metadata?.releaseScopes) ? metadata.releaseScopes : [];
  const scopeResults = metadata?.scopeResults;
  if (!scopeResults || typeof scopeResults !== "object" || releaseScopes.length === 0) {
    return null;
  }

  const statuses = releaseScopes
    .map((scopeName) => scopeResults[scopeName]?.status)
    .filter((status) => allowedReleaseStatuses.has(status));

  if (statuses.length !== releaseScopes.length) {
    return null;
  }

  if (statuses.every((status) => status === "planned")) {
    return "planned";
  }

  if (statuses.some((status) => status === "rolled_back")) {
    return "rolled_back";
  }

  if (statuses.every((status) => status === "released")) {
    return "released";
  }

  if (
    statuses.some((status) => status === "superseded") &&
    statuses.every((status) => status === "released" || status === "superseded")
  ) {
    return "superseded";
  }

  return "in_progress";
}

function validateCompletedScopeResult(metadata, context, scopeName, errors) {
  validateScopeRepoRefEvidence(metadata, context, scopeName, errors);
  validateReleasedScopeEvidence(metadata, context, scopeName, errors);
  validateReleasedScopeTagEvidence(metadata, context, scopeName, errors);
}

function validateRolledBackScopeResult(metadata, context, scopeName, errors) {
  validateScopeRepoRefEvidence(metadata, context, scopeName, errors);

  const descriptor = releaseScopeDescriptors[scopeName];
  for (const evidence of descriptor?.rollbackEvidence ?? []) {
    validateScopeEvidenceValue(metadata, context, scopeName, evidence, errors);
  }
}

function validateScopeRepoRefEvidence(metadata, context, scopeName, errors) {
  const descriptor = releaseScopeDescriptors[scopeName];
  for (const repoName of descriptor?.requiredRepoRefs ?? []) {
    const basis = getMetadataMappingBasis(metadata, repoName);
    if (basis.tags.length === 0 && basis.commits.length === 0) {
      errors.push(
        `${context}: ${scopeName} scope must have a concrete tag or commit for repo ref: ${repoName}`,
      );
    }
  }
}

function validateReleasedScopeEvidence(metadata, context, scopeName, errors) {
  const descriptor = releaseScopeDescriptors[scopeName];
  for (const evidence of descriptor?.releasedEvidence ?? []) {
    validateScopeEvidenceValue(metadata, context, scopeName, evidence, errors);
  }

  if (scopeName === "db-migration") {
    validateDbMigrationLedgerMatchesSqlRefs(metadata, context, scopeName, errors);
  }
}

function validateReleasedScopeTagEvidence(metadata, context, scopeName, errors) {
  const descriptor = releaseScopeDescriptors[scopeName];
  const repoName = descriptor?.releaseTagRepo;
  if (!repoName) {
    return;
  }

  const repoMapping = metadata.versionMapping?.[repoName];
  const tagValue = repoName === "coupler-mobile-app"
    ? repoMapping?.releaseTag
    : repoMapping?.tag;

  if (repoName === recordRepoName) {
    if (tagValue !== metadata.version) {
      errors.push(
        `${context}: released docs scope requires docs release tag ${metadata.version}`,
      );
    }
    return;
  }

  if (!isSemverTag(tagValue)) {
    errors.push(
      `${context}: released ${scopeName} scope requires ${repoName} release tag`,
    );
    return;
  }
}

function validateScopeEvidenceValue(metadata, context, scopeName, evidence, errors) {
  const value = getNestedValue(metadata, evidence.metadataPath);
  const fieldPath = evidence.metadataPath.join(".");

  if (evidence.valueType === "contractsPackageVersion") {
    if (!hasContractsPackageVersion(value)) {
      errors.push(
        `${context}: terminal ${scopeName} evidence ${fieldPath} must include @coupler-developer/coupler-api-contracts@x.y.z`,
      );
    }
    return;
  }

  if (evidence.valueType === "mobileStore") {
    if (typeof value !== "string" || !/^\d+\.\d+\.\d+\s+\(\d+\)$/.test(value)) {
      errors.push(
        `${context}: terminal ${scopeName} evidence ${fieldPath} must be "X.Y.Z (build)"`,
      );
      return;
    }
  } else if (evidence.valueType === "submittedMarkers") {
    validateSubmittedMarkers(value, context, scopeName, fieldPath, errors);
    return;
  } else if (evidence.valueType === "dbMigrationSqlRefs") {
    validateDbMigrationSqlRefs(value, context, scopeName, fieldPath, errors);
    return;
  } else if (evidence.valueType === "dbMigrationGateResults") {
    validateDbMigrationGateResults(value, context, scopeName, fieldPath, errors);
    return;
  } else if (evidence.valueType === "dbMigrationLedger") {
    validateDbMigrationLedger(value, context, scopeName, fieldPath, errors);
    return;
  } else if (evidence.valueType === "concreteEvidence") {
    validateConcreteEvidenceValue({ value, context, scopeName, fieldPath, errors });
  } else {
    errors.push(
      `${context}: ${scopeName} evidence ${fieldPath} has unknown valueType: ${evidence.valueType}`,
    );
    return;
  }

  if (valueHasReleasePlaceholderSignal(value)) {
    errors.push(
      `${context}: ${scopeName} evidence ${fieldPath} must not be pending or placeholder evidence`,
    );
  }
}

function validateConcreteEvidenceValue({
  value,
  context,
  scopeName,
  fieldPath,
  errors,
}) {
  if (!isNonEmptyString(value) || isEmptyRefValue(value)) {
    errors.push(`${context}: ${scopeName} evidence ${fieldPath} must be concrete evidence`);
    return;
  }

  if (isNonApplicableEvidenceValue(value)) {
    errors.push(
      `${context}: ${scopeName} evidence ${fieldPath} must be concrete evidence, not an N/A reason`,
    );
    return;
  }

  if (valueHasReleasePlaceholderSignal(value)) {
    errors.push(
      `${context}: ${scopeName} evidence ${fieldPath} must not be pending or placeholder evidence`,
    );
  }
}

function validateSubmittedMarkersShape(value, context, fieldPath, errors) {
  if (!Array.isArray(value)) {
    errors.push(`${context}: release-metadata ${fieldPath} must be an array`);
    return;
  }

  for (const [index, marker] of value.entries()) {
    const markerPath = `${fieldPath}.${index}`;
    if (!marker || typeof marker !== "object" || Array.isArray(marker)) {
      errors.push(`${context}: release-metadata ${markerPath} must be an object`);
      continue;
    }

    validateExactObjectKeys({
      value: marker,
      allowedKeys: ["tag", "commit", "evidence", "deletedEvidence"],
      context,
      fieldPath: markerPath,
      errors,
    });
  }
}

function validateDbMigrationSqlRefsShape(value, context, fieldPath, errors) {
  if (!Array.isArray(value)) {
    errors.push(`${context}: release-metadata ${fieldPath} must be an array`);
    return;
  }

  for (const [index, sqlRef] of value.entries()) {
    const sqlRefPath = `${fieldPath}.${index}`;
    if (!sqlRef || typeof sqlRef !== "object" || Array.isArray(sqlRef)) {
      errors.push(`${context}: release-metadata ${sqlRefPath} must be an object`);
      continue;
    }

    validateExactObjectKeys({
      value: sqlRef,
      allowedKeys: ["repo", "path", "checksumSha256", "gateIds"],
      context,
      fieldPath: sqlRefPath,
      errors,
    });
  }
}

function validateDbMigrationGateResultsShape(value, context, fieldPath, errors) {
  if (!Array.isArray(value)) {
    errors.push(`${context}: release-metadata ${fieldPath} must be an array`);
    return;
  }

  for (const [index, gateResult] of value.entries()) {
    const gateResultPath = `${fieldPath}.${index}`;
    if (!gateResult || typeof gateResult !== "object" || Array.isArray(gateResult)) {
      errors.push(`${context}: release-metadata ${gateResultPath} must be an object`);
      continue;
    }

    validateExactObjectKeys({
      value: gateResult,
      allowedKeys: ["gateId", "status", "log", "reason"],
      context,
      fieldPath: gateResultPath,
      errors,
    });
  }
}

function validateDbMigrationLedgerShape(value, context, fieldPath, errors) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    errors.push(`${context}: release-metadata ${fieldPath} must be a JSON object`);
    return;
  }

  validateExactObjectKeys({
    value,
    allowedKeys: ["dev", "prod"],
    context,
    fieldPath,
    errors,
  });

  validateDbMigrationLedgerEnvironmentShape(value.dev, context, `${fieldPath}.dev`, errors);
  validateDbMigrationLedgerEnvironmentShape(value.prod, context, `${fieldPath}.prod`, errors);
}

function validateDbMigrationLedgerEnvironmentShape(value, context, fieldPath, errors) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    errors.push(`${context}: release-metadata ${fieldPath} must be a JSON object`);
    return;
  }

  validateExactObjectKeys({
    value,
    allowedKeys: ["databaseIdentity", "log", "rows"],
    context,
    fieldPath,
    errors,
  });

  if (!Array.isArray(value.rows)) {
    errors.push(`${context}: release-metadata ${fieldPath}.rows must be an array`);
    return;
  }

  for (const [index, row] of value.rows.entries()) {
    const rowPath = `${fieldPath}.rows.${index}`;
    if (!row || typeof row !== "object" || Array.isArray(row)) {
      errors.push(`${context}: release-metadata ${rowPath} must be an object`);
      continue;
    }

    validateExactObjectKeys({
      value: row,
      allowedKeys: ["migrationName", "targetEnv", "checksumSha256", "appliedAt"],
      context,
      fieldPath: rowPath,
      errors,
    });
  }
}

function validateSubmittedMarkers(value, context, scopeName, fieldPath, errors) {
  if (!Array.isArray(value)) {
    errors.push(`${context}: ${scopeName} evidence ${fieldPath} must be an array`);
    return;
  }

  for (const [index, marker] of value.entries()) {
    const markerPath = `${fieldPath}.${index}`;
    if (!marker || typeof marker !== "object" || Array.isArray(marker)) {
      errors.push(`${context}: ${scopeName} evidence ${markerPath} must be an object`);
      continue;
    }

    validateExactObjectKeys({
      value: marker,
      allowedKeys: ["tag", "commit", "evidence", "deletedEvidence"],
      context,
      fieldPath: markerPath,
      errors,
    });

    if (!isSubmittedMarkerTag(marker.tag)) {
      errors.push(`${context}: ${scopeName} evidence ${markerPath}.tag must be a submitted marker tag`);
    }

    if (!isCommitSha(marker.commit)) {
      errors.push(`${context}: ${scopeName} evidence ${markerPath}.commit must be a SHA`);
    }

    validateConcreteEvidenceValue({
      value: marker.evidence,
      context,
      scopeName,
      fieldPath: `${markerPath}.evidence`,
      errors,
    });

    validateConcreteEvidenceValue({
      value: marker.deletedEvidence,
      context,
      scopeName,
      fieldPath: `${markerPath}.deletedEvidence`,
      errors,
    });
  }
}

function validateDbMigrationSqlRefs(value, context, scopeName, fieldPath, errors) {
  if (!Array.isArray(value) || value.length === 0) {
    errors.push(`${context}: ${scopeName} evidence ${fieldPath} must list SQL files`);
    return;
  }

  const allowedSqlRefRepos = new Set(releaseScopeDescriptors[scopeName]?.requiredRepoRefs ?? []);
  for (const [index, sqlRef] of value.entries()) {
    const sqlRefPath = `${fieldPath}.${index}`;
    if (!sqlRef || typeof sqlRef !== "object" || Array.isArray(sqlRef)) {
      errors.push(`${context}: ${scopeName} evidence ${sqlRefPath} must be an object`);
      continue;
    }

    validateExactObjectKeys({
      value: sqlRef,
      allowedKeys: ["repo", "path", "checksumSha256", "gateIds"],
      context,
      fieldPath: sqlRefPath,
      errors,
    });

    if (!knownRepoNames.includes(sqlRef.repo)) {
      errors.push(`${context}: ${scopeName} evidence ${sqlRefPath}.repo must be a known repo`);
    } else if (allowedSqlRefRepos.size > 0 && !allowedSqlRefRepos.has(sqlRef.repo)) {
      errors.push(`${context}: ${scopeName} evidence ${sqlRefPath}.repo must be one of ${[...allowedSqlRefRepos].join(", ")}`);
    }

    if (!isRepoRelativeSqlPath(sqlRef.path)) {
      errors.push(`${context}: ${scopeName} evidence ${sqlRefPath}.path must be a repo-relative .sql file path`);
    }

    if (typeof sqlRef.checksumSha256 !== "string" || !sha256Pattern.test(sqlRef.checksumSha256)) {
      errors.push(`${context}: ${scopeName} evidence ${sqlRefPath}.checksumSha256 must be a SHA-256 checksum`);
    }

    if (!Array.isArray(sqlRef.gateIds) || sqlRef.gateIds.length === 0) {
      errors.push(`${context}: ${scopeName} evidence ${sqlRefPath}.gateIds must list DBM Gate IDs`);
    } else {
      for (const gateId of sqlRef.gateIds) {
        if (!dbMigrationGateIds.includes(gateId)) {
          errors.push(`${context}: ${scopeName} evidence ${sqlRefPath}.gateIds has unknown DBM Gate ID: ${gateId}`);
        }
      }
    }
  }
}

function isRepoRelativeSqlPath(value) {
  if (!isNonEmptyString(value) || !/\.sql$/i.test(value)) {
    return false;
  }

  if (
    value.startsWith("/") ||
    value.includes("\\") ||
    /^[a-z][a-z0-9+.-]*:/i.test(value)
  ) {
    return false;
  }

  return value
    .split("/")
    .every((segment) => segment.length > 0 && segment !== "." && segment !== "..");
}

function validateDbMigrationGateResults(value, context, scopeName, fieldPath, errors) {
  if (!Array.isArray(value)) {
    errors.push(`${context}: ${scopeName} evidence ${fieldPath} must be an array`);
    return;
  }

  const seenGateIds = new Set();
  for (const [index, gateResult] of value.entries()) {
    const gateResultPath = `${fieldPath}.${index}`;
    if (!gateResult || typeof gateResult !== "object" || Array.isArray(gateResult)) {
      errors.push(`${context}: ${scopeName} evidence ${gateResultPath} must be an object`);
      continue;
    }

    validateExactObjectKeys({
      value: gateResult,
      allowedKeys: ["gateId", "status", "log", "reason"],
      context,
      fieldPath: gateResultPath,
      errors,
    });

    if (!dbMigrationGateIds.includes(gateResult.gateId)) {
      errors.push(`${context}: ${scopeName} evidence ${gateResultPath}.gateId is not an allowed DBM Gate ID`);
    } else if (seenGateIds.has(gateResult.gateId)) {
      errors.push(`${context}: ${scopeName} evidence ${fieldPath} has duplicate Gate ID: ${gateResult.gateId}`);
    } else {
      seenGateIds.add(gateResult.gateId);
    }

    if (!allowedDbMigrationGateResultStatuses.has(gateResult.status)) {
      errors.push(`${context}: ${scopeName} evidence ${gateResultPath}.status is not allowed: ${gateResult.status}`);
    }

    validateConcreteEvidenceValue({
      value: gateResult.log,
      context,
      scopeName,
      fieldPath: `${gateResultPath}.log`,
      errors,
    });

    if (gateResult.status === "not_applicable") {
      validateConcreteEvidenceValue({
        value: gateResult.reason,
        context,
        scopeName,
        fieldPath: `${gateResultPath}.reason`,
        errors,
      });
    } else if (gateResult.reason !== null) {
      errors.push(`${context}: ${scopeName} evidence ${gateResultPath}.reason must be null when status is passed`);
    }
  }

  for (const gateId of dbMigrationGateIds) {
    if (!seenGateIds.has(gateId)) {
      errors.push(`${context}: ${scopeName} evidence ${fieldPath} must include ${gateId}`);
    }
  }
}

function validateDbMigrationLedger(value, context, scopeName, fieldPath, errors) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    errors.push(`${context}: ${scopeName} evidence ${fieldPath} must be an object`);
    return;
  }

  validateExactObjectKeys({
    value,
    allowedKeys: ["dev", "prod"],
    context,
    fieldPath,
    errors,
  });

  validateDbMigrationLedgerEnvironment(value.dev, "dev", context, scopeName, `${fieldPath}.dev`, errors);
  validateDbMigrationLedgerEnvironment(value.prod, "prod", context, scopeName, `${fieldPath}.prod`, errors);
}

function validateDbMigrationLedgerEnvironment(value, targetEnv, context, scopeName, fieldPath, errors) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    errors.push(`${context}: ${scopeName} evidence ${fieldPath} must be an object`);
    return;
  }

  validateExactObjectKeys({
    value,
    allowedKeys: ["databaseIdentity", "log", "rows"],
    context,
    fieldPath,
    errors,
  });

  validateConcreteEvidenceValue({
    value: value.databaseIdentity,
    context,
    scopeName,
    fieldPath: `${fieldPath}.databaseIdentity`,
    errors,
  });

  validateConcreteEvidenceValue({
    value: value.log,
    context,
    scopeName,
    fieldPath: `${fieldPath}.log`,
    errors,
  });

  if (!Array.isArray(value.rows) || value.rows.length === 0) {
    errors.push(`${context}: ${scopeName} evidence ${fieldPath}.rows must list schema_migrations rows`);
    return;
  }

  for (const [index, row] of value.rows.entries()) {
    const rowPath = `${fieldPath}.rows.${index}`;
    if (!row || typeof row !== "object" || Array.isArray(row)) {
      errors.push(`${context}: ${scopeName} evidence ${rowPath} must be an object`);
      continue;
    }

    validateExactObjectKeys({
      value: row,
      allowedKeys: ["migrationName", "targetEnv", "checksumSha256", "appliedAt"],
      context,
      fieldPath: rowPath,
      errors,
    });

    if (!isNonEmptyString(row.migrationName) || !/\.sql$/i.test(row.migrationName)) {
      errors.push(`${context}: ${scopeName} evidence ${rowPath}.migrationName must be a SQL file name`);
    }

    if (row.targetEnv !== targetEnv) {
      errors.push(`${context}: ${scopeName} evidence ${rowPath}.targetEnv must be ${targetEnv}`);
    }

    if (typeof row.checksumSha256 !== "string" || !sha256Pattern.test(row.checksumSha256)) {
      errors.push(`${context}: ${scopeName} evidence ${rowPath}.checksumSha256 must be a SHA-256 checksum`);
    }

    validateConcreteEvidenceValue({
      value: row.appliedAt,
      context,
      scopeName,
      fieldPath: `${rowPath}.appliedAt`,
      errors,
    });
  }
}

function validateDbMigrationLedgerMatchesSqlRefs(metadata, context, scopeName, errors) {
  const evidence = metadata
    ?.scopeResults
    ?.["db-migration"]
    ?.evidence;
  const sqlRefs = Array.isArray(evidence?.sqlRefs) ? evidence.sqlRefs : [];
  const ledger = evidence?.ledger;

  if (!ledger || typeof ledger !== "object" || Array.isArray(ledger)) {
    return;
  }

  for (const sqlRef of sqlRefs) {
    if (
      !sqlRef ||
      typeof sqlRef.path !== "string" ||
      typeof sqlRef.checksumSha256 !== "string" ||
      !sha256Pattern.test(sqlRef.checksumSha256)
    ) {
      continue;
    }

    const migrationName = sqlRef.path.split("/").at(-1);
    const checksumSha256 = sqlRef.checksumSha256.toLowerCase();
    for (const targetEnv of ["dev", "prod"]) {
      validateDbMigrationLedgerRowsMatchSqlRef({
        rows: ledger[targetEnv]?.rows,
        migrationName,
        checksumSha256,
        context,
        scopeName,
        fieldPath: `scopeResults.db-migration.evidence.ledger.${targetEnv}.rows`,
        targetEnv,
        errors,
      });
    }
  }
}

function validateDbMigrationLedgerRowsMatchSqlRef({
  rows,
  migrationName,
  checksumSha256,
  context,
  scopeName,
  fieldPath,
  targetEnv,
  errors,
}) {
  if (!Array.isArray(rows)) {
    return;
  }

  const matchingRows = rows.filter((row) => row?.migrationName === migrationName);
  if (matchingRows.length === 0) {
    errors.push(
      `${context}: ${scopeName} evidence ${fieldPath} must include ${migrationName} for ${targetEnv}`,
    );
    return;
  }

  if (
    !matchingRows.some(
      (row) =>
        typeof row.checksumSha256 === "string" &&
        row.checksumSha256.toLowerCase() === checksumSha256,
    )
  ) {
    errors.push(
      `${context}: ${scopeName} evidence ${fieldPath} checksum for ${migrationName} must match sqlRefs checksum`,
    );
  }
}

function validateExactObjectKeys({
  value,
  allowedKeys,
  context,
  fieldPath,
  errors,
}) {
  const allowedKeySet = new Set(allowedKeys);
  for (const key of Object.keys(value)) {
    if (!allowedKeySet.has(key)) {
      errors.push(`${context}: release-metadata ${fieldPath} has unknown key: ${key}`);
    }
  }

  for (const key of allowedKeys) {
    if (!Object.hasOwn(value, key)) {
      errors.push(`${context}: release-metadata ${fieldPath} is missing ${key}`);
    }
  }
}

function validateAllowedObjectKeys({
  value,
  allowedKeys,
  context,
  fieldPath,
  errors,
}) {
  const allowedKeySet = new Set(allowedKeys);
  for (const key of Object.keys(value)) {
    if (!allowedKeySet.has(key)) {
      errors.push(`${context}: release-metadata ${fieldPath} has unknown key: ${key}`);
    }
  }
}

function validateTerminalApiContractCutoverStatus(metadata, context, errors) {
  const cutover = metadata.apiContractCutover;

  if (cutover == null) {
    return;
  }

  if (metadata.status === completedReleaseStatus && cutover.status !== "released") {
    errors.push(`${context}: released metadata apiContractCutover.status must be released`);
  }

  if (metadata.status === "rolled_back" && cutover.status !== "rollback") {
    errors.push(`${context}: rolled_back metadata apiContractCutover.status must be rollback`);
  }
}

function validateTerminalApiContractCutoverFields(metadata, context, errors) {
  for (const pathParts of apiContractCutoverRequiredPaths) {
    const value = getNestedValue(metadata, pathParts);
    const fieldPath = pathParts.join(".");

    if (pathParts[0] === "apiContractCutover" && pathParts[1] === "comparisonRefs") {
      if (!isCommitSha(value)) {
        errors.push(`${context}: release-metadata ${fieldPath} must be a commit SHA`);
      }
      continue;
    }

    if (
      pathParts[0] === "scopeResults" &&
      pathParts[1] === "contracts-package" &&
      pathParts.at(-1) === "publishedPackage"
    ) {
      if (!hasContractsPackageVersion(value)) {
        errors.push(
          `${context}: released metadata ${fieldPath} must include @coupler-developer/coupler-api-contracts@x.y.z`,
        );
      }
      continue;
    }

    validateConcreteEvidenceValue({
      value,
      context,
      scopeName: "apiContractCutover",
      fieldPath,
      errors,
    });
  }
}

function isTerminalApiContractCutoverStatus(status) {
  return status === completedReleaseStatus || status === "rollback";
}

function validateStringArray(value, context, errors) {
  if (!Array.isArray(value)) {
    errors.push(`${context} must be an array`);
    return;
  }

  for (const item of value) {
    if (!isNonEmptyString(item)) {
      errors.push(`${context} must contain non-empty strings only`);
    }
  }
}
