import {
  allowedReleaseScopes,
  allowedApiContractCutoverStatuses,
  allowedReleaseStatuses,
  apiContractCutoverViolationFailedRequirements,
  apiContractCutoverRequiredPaths,
  commitShaPattern,
  completedReleaseStatus,
  findReleasePlaceholderSignals,
  getApiContractCutoverValueFields,
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
  mobileStorePlatforms,
  mobileStoreSourceStatuses,
  recordRepoName,
  releaseScopeDescriptors,
  releaseMetadataSchema,
  releaseMetadataRequiredTopLevelKeys,
  releaseMetadataTopLevelKeys,
  semverTagPattern,
  supportedReleaseMetadataSchemas,
  valueHasReleasePlaceholderSignal,
  versionMappingFieldDescriptors,
} from "./release-schema.mjs";
export {
  findReleasePlaceholderSignals,
  knownRepoNames,
  releaseMetadataSchema,
};

const isFullCommitSha = (value) =>
  typeof value === "string" && /^[0-9a-f]{40}$/i.test(value);

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

export function validateReleaseMetadata(
  metadata,
  context,
  expectedVersion,
  errors,
  { requireCurrentSchema = false } = {},
) {
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) {
    errors.push(`${context}: release-metadata must be a JSON object`);
    return;
  }

  if (!supportedReleaseMetadataSchemas.has(metadata.schema)) {
    errors.push(`${context}: release-metadata schema must be ${releaseMetadataSchema}`);
  } else if (requireCurrentSchema && metadata.schema !== releaseMetadataSchema) {
    errors.push(`${context}: new release-metadata schema must be ${releaseMetadataSchema}`);
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
  validateVersionMapping(metadata.versionMapping, metadata.schema, context, errors);
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

  const platformMappings =
    metadata?.schema === releaseMetadataSchema && repoName === "coupler-mobile-app"
      ? mobileStorePlatforms
        .map((platform) => ({ platform, ...repoMapping.store?.[platform] }))
        .filter((mapping) => mapping?.sourceStatus === "verified")
      : [];
  const usesPlatformMapping =
    metadata?.schema === releaseMetadataSchema && repoName === "coupler-mobile-app";
  const tagValues = usesPlatformMapping
    ? platformMappings.map((mapping) => ({
        value: mapping.releaseTag,
        group: `store.${mapping.platform}`,
        frozenArtifact: false,
      }))
    : [
        { value: repoMapping.tag, group: "default", frozenArtifact: false },
        { value: repoMapping.releaseTag, group: "default", frozenArtifact: false },
      ];
  const commitValues = usesPlatformMapping
    ? [
        ...platformMappings.map((mapping) => ({
          value: mapping.commit,
          group: `store.${mapping.platform}`,
          frozenArtifact: false,
        })),
        {
          value: repoMapping.nextPush ? repoMapping.commit : null,
          group: "nextPush",
          frozenArtifact: false,
        },
      ]
    : [{ value: repoMapping.commit, group: "default", frozenArtifact: false }];

  for (const tagRef of tagValues) {
    const tagValue = tagRef.value;
    if (isEmptyRefValue(tagValue)) {
      continue;
    }

    if (typeof tagValue === "string" && semverTagPattern.test(tagValue)) {
      tags.push({
        type: "tag",
        value: tagValue,
        group: tagRef.group,
        frozenArtifact: tagRef.frozenArtifact,
      });
    }
  }

  for (const commitRef of commitValues) {
    const commitValue = commitRef.value;
    if (typeof commitValue === "string" && commitShaPattern.test(commitValue)) {
      commits.push({
        type: "commit",
        value: commitValue.toLowerCase(),
        group: commitRef.group,
        frozenArtifact: commitRef.frozenArtifact,
      });
    }
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

function validateScopeResult(
  metadata,
  scopeName,
  result,
  context,
  errors,
) {
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
  } else if (scopeName === "db-migration") {
    if (Object.keys(result.evidence).length > 0) {
      errors.push(
        `${context}: release-metadata scopeResults.db-migration.evidence must be empty; DB migration uses the source commit and existing application history without plan/execution artifacts`,
      );
    }
  } else {
    validateScopeEvidenceKeys(metadata, scopeName, result.evidence, context, errors);
    validateScopeEvidenceShape(metadata, scopeName, result.evidence, context, errors);
    validateEvidenceValueShape(result.evidence, ["scopeResults", scopeName, "evidence"], context, errors);
    if (scopeName === "coupler-api") {
      const terminal = result.status === "released" || result.status === "rolled_back";
      const publicContractTerminal =
        terminal &&
        metadata.apiContractCutover?.status !== "violated";
      validateApiPublicContractEvidence(
        result.evidence.publicContract,
        metadata,
        context,
        errors,
        { terminal: publicContractTerminal },
      );
      validateApiRuntimeRecoveryEvidence(
        result.evidence.runtimeRecovery,
        metadata,
        context,
        errors,
        { terminal, scopeStatus: result.status },
      );
    }
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
    const hasDescriptorRollbackEvidence =
      (releaseScopeDescriptors[scopeName]?.rollbackEvidence ?? []).length > 0;
    if (!hasDescriptorRollbackEvidence && scopeName !== "db-migration") {
      validateConcreteEvidenceValue({
        value: result.rollbackEvidence,
        context,
        scopeName,
        fieldPath: `scopeResults.${scopeName}.rollbackEvidence`,
        errors,
      });
    } else if (result.rollbackEvidence !== undefined && result.rollbackEvidence !== null) {
      errors.push(`${context}: release-metadata scopeResults.${scopeName}.rollbackEvidence duplicates canonical rollback evidence`);
    }
  } else {
    if (result.rollbackReason !== undefined && result.rollbackReason !== null) {
      errors.push(`${context}: release-metadata scopeResults.${scopeName}.rollbackReason is only allowed for rolled_back scope results`);
    }
    if (result.rollbackEvidence !== undefined && result.rollbackEvidence !== null) {
      errors.push(`${context}: release-metadata scopeResults.${scopeName}.rollbackEvidence is only allowed for rolled_back scope results`);
    }
  }
}

function validateScopeResultKeys(scopeName, result, context, errors) {
  const allowedKeys = new Set([
    "status",
    "summary",
    "evidence",
    "rollbackReason",
    "rollbackEvidence",
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

function validateScopeEvidenceKeys(metadata, scopeName, evidence, context, errors) {
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

function validateScopeEvidenceShape(metadata, scopeName, evidence, context, errors) {
  if (metadata.schema === releaseMetadataSchema && scopeName === "mobile-store") {
    validatePlatformSubmittedMarkersShape(
      evidence.submittedMarkers,
      context,
      "scopeResults.mobile-store.evidence.submittedMarkers",
      errors,
    );
  }
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
    if (
      metadata.schema === releaseMetadataSchema &&
      scopeName === "mobile-store" &&
      relativePath[0] === "submittedMarkers"
    ) {
      continue;
    }
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

  if (valueType === "contractsSourceTree") {
    validateContractsSourceTreeShape(value, context, fieldPath, errors);
    return;
  }

  if (valueType === "submittedMarkers") {
    validateSubmittedMarkersShape(value, context, fieldPath, errors);
    return;
  }

  if (valueType === "apiPublicContract" || valueType === "apiRuntimeRecovery") {
    return;
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

function validateVersionMapping(versionMapping, schema, context, errors) {
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

    validateRepoMapping(repoName, repoMapping, schema, context, errors);
  }
}

function validateRepoMapping(repoName, repoMapping, schema, context, errors) {
  if (schema === releaseMetadataSchema && repoName === "coupler-mobile-app") {
    validatePlatformMobileMapping(repoMapping, context, errors);
    return;
  }

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

function validatePlatformMobileMapping(repoMapping, context, errors) {
  const fieldPath = "versionMapping.coupler-mobile-app";
  validateExactObjectKeys({
    value: repoMapping,
    allowedKeys: ["store", "nextPush", "commit"],
    context,
    fieldPath,
    errors,
  });

  if (repoMapping.store !== null) {
    if (!repoMapping.store || typeof repoMapping.store !== "object" || Array.isArray(repoMapping.store)) {
      errors.push(`${context}: release-metadata ${fieldPath}.store must be an object or null`);
    } else {
      validateExactObjectKeys({
        value: repoMapping.store,
        allowedKeys: mobileStorePlatforms,
        context,
        fieldPath: `${fieldPath}.store`,
        errors,
      });
      for (const platform of mobileStorePlatforms) {
        validateMobileStorePlatformMapping(
          repoMapping.store[platform],
          platform,
          context,
          errors,
        );
      }
    }
  }

  if (repoMapping.nextPush !== null && !isNonEmptyString(repoMapping.nextPush)) {
    errors.push(`${context}: release-metadata ${fieldPath}.nextPush must be a string or null`);
  }
  if (repoMapping.nextPush === null && repoMapping.commit !== null) {
    errors.push(`${context}: release-metadata ${fieldPath}.commit must be null when nextPush is null`);
  }
  if (repoMapping.nextPush !== null && !isFullCommitSha(repoMapping.commit)) {
    errors.push(`${context}: release-metadata ${fieldPath}.commit must be a full 40-character commit SHA when nextPush is present`);
  }
}

function validateMobileStorePlatformMapping(mapping, platform, context, errors) {
  const fieldPath = `versionMapping.coupler-mobile-app.store.${platform}`;
  if (mapping === null) {
    return;
  }
  if (!mapping || typeof mapping !== "object" || Array.isArray(mapping)) {
    errors.push(`${context}: release-metadata ${fieldPath} must be an object or null`);
    return;
  }

  validateExactObjectKeys({
    value: mapping,
    allowedKeys: [
      "versionBuild",
      "releaseTag",
      "commit",
      "sourceStatus",
      "limitation",
    ],
    context,
    fieldPath,
    errors,
  });

  if (typeof mapping.versionBuild !== "string" || !/^\d+\.\d+\.\d+\s+\(\d+\)$/.test(mapping.versionBuild)) {
    errors.push(`${context}: ${fieldPath}.versionBuild must be "X.Y.Z (build)"`);
  }
  if (!mobileStoreSourceStatuses.has(mapping.sourceStatus)) {
    errors.push(`${context}: ${fieldPath}.sourceStatus is not allowed: ${mapping.sourceStatus}`);
    return;
  }

  if (mapping.sourceStatus === "verified") {
    if (mapping.releaseTag !== null && !isSemverTag(mapping.releaseTag)) {
      errors.push(`${context}: verified ${fieldPath}.releaseTag must be a release tag or null before terminal release`);
    }
    if (!isFullCommitSha(mapping.commit)) {
      errors.push(`${context}: verified ${fieldPath} requires a full 40-character commit SHA`);
    }
    if (mapping.limitation !== null) {
      errors.push(`${context}: verified ${fieldPath}.limitation must be null`);
    }
    const expectedTag = typeof mapping.versionBuild === "string"
      ? `v${mapping.versionBuild.split(" ")[0]}`
      : null;
    if (expectedTag && mapping.releaseTag !== null && mapping.releaseTag !== expectedTag) {
      errors.push(`${context}: verified ${fieldPath}.releaseTag must match versionBuild: ${expectedTag}`);
    }
    return;
  }

  if (mapping.releaseTag !== null || mapping.commit !== null) {
    errors.push(`${context}: unavailable-historical ${fieldPath} must not claim a release tag or commit`);
  }
  validateConcreteEvidenceValue({
    value: mapping.limitation,
    context,
    scopeName: "mobile-store",
    fieldPath: `${fieldPath}.limitation`,
    errors,
  });
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

function validateConsumerArtifact(
  consumer,
  metadata,
  context,
  consumerPath,
  errors,
  { terminal },
) {
  const artifact = consumer.artifact;
  const validateTerminalArtifactValue = (value, fieldPath) => {
    if (terminal) {
      validateConcreteEvidenceValue({
        value,
        context,
        scopeName: "coupler-api",
        fieldPath,
        errors,
      });
    }
  };
  if (!artifact || typeof artifact !== "object" || Array.isArray(artifact)) {
    if (terminal || artifact !== null) {
      errors.push(`${context}: release-metadata ${consumerPath}.artifact must be an object${terminal ? "" : " or null"}`);
    }
    return;
  }
  const current = consumer.generation === "current";
  if (consumer.surface === "mobile-store") {
    validateExactObjectKeys({
      value: artifact,
      allowedKeys: ["kind", "mappingRef", "iosVersionBuild", "androidVersionBuild"],
      context,
      fieldPath: `${consumerPath}.artifact`,
      errors,
    });
    if (artifact.kind !== "store-builds") {
      errors.push(`${context}: release-metadata ${consumerPath}.artifact.kind must be store-builds`);
    }
    for (const key of ["mappingRef", "iosVersionBuild", "androidVersionBuild"]) {
      if (!isNonEmptyString(artifact[key])) {
        errors.push(`${context}: release-metadata ${consumerPath}.artifact.${key} must be a non-empty string`);
      }
      validateTerminalArtifactValue(
        artifact[key],
        `${consumerPath}.artifact.${key}`,
      );
    }
    for (const key of ["iosVersionBuild", "androidVersionBuild"]) {
      if (isNonEmptyString(artifact[key]) && !/^\d+\.\d+\.\d+\s+\(\d+\)$/.test(artifact[key])) {
        errors.push(`${context}: release-metadata ${consumerPath}.artifact.${key} must be "X.Y.Z (build)"`);
      }
    }
    if (terminal && current) {
      validateCurrentMobileStoreConsumerMapping(
        artifact,
        metadata,
        context,
        consumerPath,
        errors,
      );
    }
    return;
  }
  if (consumer.surface === "mobile-nextpush") {
    validateExactObjectKeys({
      value: artifact,
      allowedKeys: ["kind", "mappingRef", "ios", "android"],
      context,
      fieldPath: `${consumerPath}.artifact`,
      errors,
    });
    if (artifact.kind !== "nextpush-deployment") {
      errors.push(`${context}: release-metadata ${consumerPath}.artifact.kind must be nextpush-deployment`);
    }
    if (!isNonEmptyString(artifact.mappingRef)) {
      errors.push(`${context}: release-metadata ${consumerPath}.artifact.mappingRef must be a non-empty string`);
    }
    validateTerminalArtifactValue(
      artifact.mappingRef,
      `${consumerPath}.artifact.mappingRef`,
    );
    for (const platform of ["ios", "android"]) {
      validateNestedObjectKeys({
        value: artifact[platform],
        allowedKeys: ["app", "deployment", "label", "cohort", "targetBinary"],
        context,
        fieldPath: `${consumerPath}.artifact.${platform}`,
        errors,
      });
      if (artifact[platform] && typeof artifact[platform] === "object") {
        for (const key of ["app", "deployment", "label", "cohort", "targetBinary"]) {
          if (!isNonEmptyString(artifact[platform][key])) {
            errors.push(`${context}: release-metadata ${consumerPath}.artifact.${platform}.${key} must be a non-empty string`);
          }
          validateTerminalArtifactValue(
            artifact[platform][key],
            `${consumerPath}.artifact.${platform}.${key}`,
          );
        }
      }
    }
    if (terminal && current) {
      validateCurrentMobileNextPushConsumerMapping(
        artifact,
        metadata,
        context,
        consumerPath,
        errors,
      );
    }
    return;
  }
  if (consumer.surface === "admin") {
    validateExactObjectKeys({
      value: artifact,
      allowedKeys: ["kind", "artifactRef"],
      context,
      fieldPath: `${consumerPath}.artifact`,
      errors,
    });
    if (artifact.kind !== "admin-build" || !isFullCommitSha(artifact.artifactRef)) {
      errors.push(`${context}: release-metadata ${consumerPath}.artifact must identify an admin-build full commit SHA artifactRef`);
    }
    validateTerminalArtifactValue(
      artifact.artifactRef,
      `${consumerPath}.artifact.artifactRef`,
    );
    if (
      terminal &&
      current &&
      !isFullCommitSha(metadata.versionMapping?.["coupler-admin-web"]?.commit)
    ) {
      errors.push(`${context}: terminal current admin consumer requires versionMapping.coupler-admin-web.commit`);
    } else if (
      terminal &&
      current &&
      artifact.artifactRef !== metadata.versionMapping["coupler-admin-web"].commit
    ) {
      errors.push(`${context}: release-metadata ${consumerPath}.artifact.artifactRef must match versionMapping.coupler-admin-web.commit`);
    }
  }
}

function validateCurrentMobileNextPushConsumerMapping(
  artifact,
  metadata,
  context,
  consumerPath,
  errors,
) {
  const nextPush = metadata.versionMapping?.["coupler-mobile-app"]?.nextPush;
  if (artifact.mappingRef !== nextPush) {
    errors.push(`${context}: release-metadata ${consumerPath}.artifact.mappingRef must match versionMapping.coupler-mobile-app.nextPush`);
  }
}

function validateCurrentMobileStoreConsumerMapping(
  artifact,
  metadata,
  context,
  consumerPath,
  errors,
) {
  const store = metadata.versionMapping?.["coupler-mobile-app"]?.store;
  if (metadata.schema !== releaseMetadataSchema) {
    if (typeof store !== "string" || !/^\d+\.\d+\.\d+\s+\(\d+\)$/.test(store)) {
      errors.push(`${context}: terminal current mobile-store consumer requires versionMapping.coupler-mobile-app.store`);
    } else if (artifact.mappingRef !== store) {
      errors.push(`${context}: release-metadata ${consumerPath}.artifact.mappingRef must match versionMapping.coupler-mobile-app.store`);
    }
    return;
  }

  const androidVersionBuild = store?.android?.versionBuild;
  const iosVersionBuild = store?.ios?.versionBuild;
  if (!androidVersionBuild || !iosVersionBuild) {
    errors.push(`${context}: terminal current mobile-store consumer requires Android and iOS platform mappings`);
    return;
  }

  const expectedMappingRef = `Android ${androidVersionBuild}; iOS ${iosVersionBuild}`;
  if (artifact.mappingRef !== expectedMappingRef) {
    errors.push(`${context}: release-metadata ${consumerPath}.artifact.mappingRef must equal ${expectedMappingRef}`);
  }
  if (artifact.androidVersionBuild !== androidVersionBuild) {
    errors.push(`${context}: release-metadata ${consumerPath}.artifact.androidVersionBuild must match versionMapping.coupler-mobile-app.store.android.versionBuild`);
  }
  if (artifact.iosVersionBuild !== iosVersionBuild) {
    errors.push(`${context}: release-metadata ${consumerPath}.artifact.iosVersionBuild must match versionMapping.coupler-mobile-app.store.ios.versionBuild`);
  }
}

function validateApiPublicContractEvidence(
  publicContract,
  metadata,
  context,
  errors,
  { terminal },
) {
  const fieldPath = "scopeResults.coupler-api.evidence.publicContract";
  const releaseScopes = Array.isArray(metadata.releaseScopes) ? metadata.releaseScopes : [];
  if (!publicContract || typeof publicContract !== "object" || Array.isArray(publicContract)) {
    if (publicContract !== null || terminal) {
      errors.push(`${context}: release-metadata ${fieldPath} must be an object${terminal ? "" : " or null"}`);
    }
    return;
  }
  if (
    terminal &&
    (!releaseScopes.includes("contracts-package") ||
      metadata.scopeResults?.["contracts-package"]?.status !== "released")
  ) {
    errors.push(`${context}: terminal coupler-api public contract requires a released contracts-package scope`);
  }

  validateExactObjectKeys({
    value: publicContract,
    allowedKeys: ["apiRefs", "contractRefs", "consumers", "cases"],
    context,
    fieldPath,
    errors,
  });
  validateNestedObjectKeys({
    value: publicContract.apiRefs,
    allowedKeys: ["previous", "current"],
    context,
    fieldPath: `${fieldPath}.apiRefs`,
    errors,
  });
  if (publicContract.apiRefs && typeof publicContract.apiRefs === "object") {
    for (const generation of ["previous", "current"]) {
      const value = publicContract.apiRefs[generation];
      if (terminal ? !isFullCommitSha(value) : value !== null && !isNonEmptyString(value)) {
        errors.push(`${context}: release-metadata ${fieldPath}.apiRefs.${generation} must be ${terminal ? "a commit SHA" : "a string or null"}`);
      }
    }
    if (terminal) {
      const mappedCommit = metadata.versionMapping?.["coupler-api"]?.commit;
      if (!isFullCommitSha(mappedCommit)) {
        errors.push(`${context}: terminal coupler-api public contract requires versionMapping.coupler-api.commit`);
      } else if (publicContract.apiRefs.current !== mappedCommit) {
        errors.push(`${context}: release-metadata ${fieldPath}.apiRefs.current must exactly match versionMapping.coupler-api.commit`);
      }
    }
  }
  validateNestedObjectKeys({
    value: publicContract.contractRefs,
    allowedKeys: ["previous", "current"],
    context,
    fieldPath: `${fieldPath}.contractRefs`,
    errors,
  });
  if (publicContract.contractRefs && typeof publicContract.contractRefs === "object") {
    for (const generation of ["previous", "current"]) {
      const value = publicContract.contractRefs[generation];
      if (terminal ? !hasContractsPackageVersion(value) : value !== null && !isNonEmptyString(value)) {
        errors.push(`${context}: release-metadata ${fieldPath}.contractRefs.${generation} must be ${terminal ? "a canonical contracts package/version" : "a string or null"}`);
      }
    }
    const publishedPackage = metadata.scopeResults?.["contracts-package"]?.evidence?.publishedPackage;
    if (
      terminal &&
      releaseScopes.includes("contracts-package") &&
      publicContract.contractRefs.current !== publishedPackage
    ) {
      errors.push(`${context}: release-metadata ${fieldPath}.contractRefs.current must exactly match the published contracts package`);
    }
  }

  if (!Array.isArray(publicContract.consumers)) {
    errors.push(`${context}: release-metadata ${fieldPath}.consumers must be an array`);
    return;
  }
  if (!Array.isArray(publicContract.cases)) {
    errors.push(`${context}: release-metadata ${fieldPath}.cases must be an array`);
    return;
  }

  const allowedSurfaces = new Set(["mobile-store", "mobile-nextpush", "admin"]);
  const allowedInterfaces = new Set(["rest", "websocket", "bootstrap", "version"]);
  const allowedGenerations = new Set(["previous", "current"]);
  const consumerIds = new Set();
  const consumerById = new Map();
  for (const [index, consumer] of publicContract.consumers.entries()) {
    const consumerPath = `${fieldPath}.consumers.${index}`;
    if (!consumer || typeof consumer !== "object" || Array.isArray(consumer)) {
      errors.push(`${context}: release-metadata ${consumerPath} must be an object`);
      continue;
    }
    const present = consumer.state === "present";
    const absent = consumer.state === "absent";
    validateExactObjectKeys({
      value: consumer,
      allowedKeys: present
        ? ["state", "id", "surface", "generation", "artifact", "contractRef", "interfaces", "interfaceInventoryEvidence"]
        : ["state", "id", "surface", "generation", "owner", "absenceEvidence"],
      context,
      fieldPath: consumerPath,
      errors,
    });
    if (!isNonEmptyString(consumer.id) || consumerIds.has(consumer.id)) {
      errors.push(`${context}: release-metadata ${consumerPath}.id must be a unique non-empty string`);
    } else {
      consumerIds.add(consumer.id);
      consumerById.set(consumer.id, consumer);
    }
    if (!allowedSurfaces.has(consumer.surface)) {
      errors.push(`${context}: release-metadata ${consumerPath}.surface is not allowed: ${consumer.surface}`);
    }
    if (!allowedGenerations.has(consumer.generation)) {
      errors.push(`${context}: release-metadata ${consumerPath}.generation is not allowed: ${consumer.generation}`);
    }
    if (!present && !absent) {
      errors.push(`${context}: release-metadata ${consumerPath}.state must be present or absent`);
    } else if (absent) {
      if (consumer.surface !== "mobile-nextpush") {
        errors.push(`${context}: release-metadata ${consumerPath} only mobile-nextpush may be absent`);
      }
      for (const key of ["owner", "absenceEvidence"]) {
        if (!isNonEmptyString(consumer[key])) {
          errors.push(`${context}: release-metadata ${consumerPath}.${key} must be a non-empty string`);
        }
        if (terminal) {
          validateConcreteEvidenceValue({
            value: consumer[key],
            context,
            scopeName: "coupler-api",
            fieldPath: `${consumerPath}.${key}`,
            errors,
          });
        }
      }
    } else {
      if (terminal) {
        validateConcreteEvidenceValue({
          value: consumer.contractRef,
          context,
          scopeName: "coupler-api",
          fieldPath: `${consumerPath}.contractRef`,
          errors,
        });
      } else if (consumer.contractRef !== null && !isNonEmptyString(consumer.contractRef)) {
        errors.push(`${context}: release-metadata ${consumerPath}.contractRef must be a string or null`);
      }
      if (
        terminal &&
        consumer.generation === "current" &&
        consumer.contractRef !== publicContract.contractRefs?.[consumer.generation]
      ) {
        errors.push(`${context}: release-metadata ${consumerPath}.contractRef must match publicContract.contractRefs.${consumer.generation}`);
      }
      if (!isNonEmptyString(consumer.interfaceInventoryEvidence)) {
        errors.push(`${context}: release-metadata ${consumerPath}.interfaceInventoryEvidence must be a non-empty string`);
      } else if (terminal) {
        validateConcreteEvidenceValue({
          value: consumer.interfaceInventoryEvidence,
          context,
          scopeName: "coupler-api",
          fieldPath: `${consumerPath}.interfaceInventoryEvidence`,
          errors,
        });
      }
      validateConsumerArtifact(
        consumer,
        metadata,
        context,
        consumerPath,
        errors,
        { terminal },
      );
      const minimumInterfaces =
        consumer.surface === "admin"
          ? ["rest"]
          : ["rest", "bootstrap", "version"];
      validateClosedStringArray(
        consumer.interfaces,
        allowedInterfaces,
        context,
        `${consumerPath}.interfaces`,
        errors,
        { nonEmpty: true },
      );
      if (
        terminal &&
        (!Array.isArray(consumer.interfaces) ||
          minimumInterfaces.some((interfaceName) => !consumer.interfaces.includes(interfaceName)))
      ) {
        errors.push(`${context}: release-metadata ${consumerPath}.interfaces must include ${minimumInterfaces.join(", ")} and list websocket only when the artifact implements it`);
      }
    }
  }

  const caseIds = new Set();
  const currentCoverage = new Set();
  const caseCoverage = new Set();
  for (const [index, contractCase] of publicContract.cases.entries()) {
    const casePath = `${fieldPath}.cases.${index}`;
    if (!contractCase || typeof contractCase !== "object" || Array.isArray(contractCase)) {
      errors.push(`${context}: release-metadata ${casePath} must be an object`);
      continue;
    }
    validateExactObjectKeys({
      value: contractCase,
      allowedKeys: [
        "id",
        "consumerId",
        "interface",
        "apiGeneration",
        "exposure",
        "expected",
        "evidence",
      ],
      context,
      fieldPath: casePath,
      errors,
    });
    if (!isNonEmptyString(contractCase.id) || caseIds.has(contractCase.id)) {
      errors.push(`${context}: release-metadata ${casePath}.id must be a unique non-empty string`);
    } else {
      caseIds.add(contractCase.id);
    }
    const consumer = consumerById.get(contractCase.consumerId);
    if (!consumer) {
      errors.push(`${context}: release-metadata ${casePath}.consumerId references an unknown consumer`);
    }
    if (!allowedInterfaces.has(contractCase.interface)) {
      errors.push(`${context}: release-metadata ${casePath}.interface is not allowed: ${contractCase.interface}`);
    } else if (
      consumer &&
      (!Array.isArray(consumer.interfaces) ||
        !consumer.interfaces.includes(contractCase.interface))
    ) {
      errors.push(`${context}: release-metadata ${casePath}.interface is not declared by its consumer`);
    }
    if (!allowedGenerations.has(contractCase.apiGeneration)) {
      errors.push(`${context}: release-metadata ${casePath}.apiGeneration is not allowed`);
    }
    if (!["rollout", "activation", "post-activation", "rollback"].includes(contractCase.exposure)) {
      errors.push(`${context}: release-metadata ${casePath}.exposure is not allowed`);
    }
    if (!["success", "deterministic-rejection"].includes(contractCase.expected)) {
      errors.push(`${context}: release-metadata ${casePath}.expected is not allowed`);
    }
    if (terminal) {
      validateConcreteEvidenceValue({
        value: contractCase.evidence,
        context,
        scopeName: "coupler-api",
        fieldPath: `${casePath}.evidence`,
        errors,
      });
    } else if (contractCase.evidence !== null && !isNonEmptyString(contractCase.evidence)) {
      errors.push(`${context}: release-metadata ${casePath}.evidence must be a string or null`);
    }
    const exactCoverageKey = `${contractCase.consumerId}:${contractCase.interface}:${contractCase.apiGeneration}:${contractCase.exposure}`;
    if (caseCoverage.has(exactCoverageKey)) {
      errors.push(`${context}: release-metadata ${fieldPath}.cases duplicates contract coverage: ${exactCoverageKey}`);
    }
    caseCoverage.add(exactCoverageKey);
    if (contractCase.apiGeneration === "current") {
      currentCoverage.add(`${contractCase.consumerId}:${contractCase.interface}`);
    }
  }

  if (terminal) {
    const inventoryConsumers = publicContract.consumers.filter(
      (consumer) => consumer && typeof consumer === "object" && !Array.isArray(consumer),
    );
    const validConsumers = inventoryConsumers.filter(({ state }) => state === "present");
    const surfaces = new Set(inventoryConsumers.map(({ surface }) => surface));
    const generations = new Set(inventoryConsumers.map(({ generation }) => generation));
    if ([...allowedSurfaces].some((surface) => !surfaces.has(surface))) {
      errors.push(`${context}: release-metadata ${fieldPath}.consumers must cover mobile-store, mobile-nextpush, and admin`);
    }
    if ([...allowedGenerations].some((generation) => !generations.has(generation))) {
      errors.push(`${context}: release-metadata ${fieldPath}.consumers must include previous and current generations`);
    }
    for (const surface of allowedSurfaces) {
      for (const generation of allowedGenerations) {
        const pairCount = inventoryConsumers.filter(
          (consumer) =>
            consumer.surface === surface &&
            consumer.generation === generation,
        ).length;
        if (pairCount !== 1) {
          errors.push(`${context}: release-metadata ${fieldPath}.consumers must contain exactly one ${surface}:${generation}`);
        }
      }
    }
    for (const consumer of validConsumers) {
      for (const interfaceName of Array.isArray(consumer.interfaces) ? consumer.interfaces : []) {
        const coverageKey = `${consumer.id}:${interfaceName}`;
        const currentCases = publicContract.cases.filter(
          (candidate) =>
            candidate &&
            candidate.consumerId === consumer.id &&
            candidate.interface === interfaceName &&
            candidate.apiGeneration === "current",
        );
        if (!currentCoverage.has(coverageKey) || currentCases.length === 0) {
          errors.push(`${context}: release-metadata ${fieldPath}.cases is missing current API coverage: ${coverageKey}`);
          continue;
        }
        if (
          (consumer.generation === "current" || metadata.apiContractCutover == null) &&
          currentCases.some((contractCase) => contractCase.expected !== "success")
        ) {
          errors.push(`${context}: release-metadata ${fieldPath}.cases requires success for ${coverageKey}`);
        }
        if (
          metadata.apiContractCutover != null &&
          consumer.generation === "previous" &&
          (interfaceName === "bootstrap" || interfaceName === "version") &&
          currentCases.some((contractCase) => contractCase.expected !== "success")
        ) {
          errors.push(`${context}: release-metadata ${fieldPath}.cases requires old-readable bootstrap/version success for ${coverageKey}`);
        }
      }
    }
    const currentNextPush = inventoryConsumers.find(
      ({ surface, generation }) => surface === "mobile-nextpush" && generation === "current",
    );
    const nextPushMapping = metadata.versionMapping?.["coupler-mobile-app"]?.nextPush;
    const hasCurrentNextPushMapping = !isEmptyRefValue(nextPushMapping);
    if (
      currentNextPush &&
      ((!hasCurrentNextPushMapping && currentNextPush.state !== "absent") ||
        (hasCurrentNextPushMapping && currentNextPush.state !== "present"))
    ) {
      errors.push(`${context}: release-metadata ${fieldPath}.consumers current mobile-nextpush presence must match versionMapping.coupler-mobile-app.nextPush`);
    }
    if (
      metadata.apiContractCutover != null &&
      !publicContract.cases.some(
        (contractCase) =>
          contractCase &&
          consumerById.get(contractCase.consumerId)?.generation === "previous" &&
          contractCase.apiGeneration === "current" &&
          contractCase.exposure === "activation" &&
          contractCase.expected === "deterministic-rejection",
      )
    ) {
      errors.push(`${context}: release-metadata ${fieldPath}.cases API cutover requires a deterministic previous-consumer rejection case`);
    }
  }

}

function validateApiRuntimeRecoveryEvidence(
  runtimeRecovery,
  metadata,
  context,
  errors,
  { terminal, scopeStatus },
) {
  const fieldPath = "scopeResults.coupler-api.evidence.runtimeRecovery";
  if (!runtimeRecovery || typeof runtimeRecovery !== "object" || Array.isArray(runtimeRecovery)) {
    if (runtimeRecovery !== null || terminal) {
      errors.push(`${context}: release-metadata ${fieldPath} must be an object${terminal ? "" : " or null"}`);
    }
    return;
  }
  validateExactObjectKeys({
    value: runtimeRecovery,
    allowedKeys: ["strategy", "stateSafety", "previousReleaseCaseIds"],
    context,
    fieldPath,
    errors,
  });
  if (!["previous-release", "forward-fix", "controlled-recovery"].includes(runtimeRecovery.strategy)) {
    errors.push(`${context}: release-metadata ${fieldPath}.strategy is not allowed`);
  }
  validateClosedStringArray(
    runtimeRecovery.previousReleaseCaseIds,
    null,
    context,
    `${fieldPath}.previousReleaseCaseIds`,
    errors,
    { nonEmpty: runtimeRecovery.strategy === "previous-release" },
  );
  if (
    runtimeRecovery.strategy !== "previous-release" &&
    Array.isArray(runtimeRecovery.previousReleaseCaseIds) &&
    runtimeRecovery.previousReleaseCaseIds.length !== 0
  ) {
    errors.push(`${context}: release-metadata ${fieldPath}.previousReleaseCaseIds is only allowed for previous-release`);
  }

  const stateSafety = runtimeRecovery.stateSafety;
  if (!stateSafety || typeof stateSafety !== "object" || Array.isArray(stateSafety)) {
    errors.push(`${context}: release-metadata ${fieldPath}.stateSafety must be an object`);
  } else if (stateSafety.source === "application-evidence") {
    validateExactObjectKeys({
      value: stateSafety,
      allowedKeys: ["source", "persistedState", "queuedState", "externalEffects"],
      context,
      fieldPath: `${fieldPath}.stateSafety`,
      errors,
    });
    for (const key of ["persistedState", "queuedState", "externalEffects"]) {
      if (terminal) {
        validateConcreteEvidenceValue({
          value: stateSafety[key],
          context,
          scopeName: "coupler-api",
          fieldPath: `${fieldPath}.stateSafety.${key}`,
          errors,
        });
      } else if (stateSafety[key] !== null && !isNonEmptyString(stateSafety[key])) {
        errors.push(`${context}: release-metadata ${fieldPath}.stateSafety.${key} must be a string or null`);
      }
    }
  } else {
    errors.push(`${context}: release-metadata ${fieldPath}.stateSafety.source is not allowed`);
  }

  if (terminal && scopeStatus === "rolled_back" && runtimeRecovery.strategy !== "previous-release") {
    errors.push(`${context}: release-metadata ${fieldPath}.strategy must be previous-release when coupler-api is rolled_back`);
  }

  if (terminal && runtimeRecovery.strategy === "previous-release") {
    const publicContract =
      metadata.scopeResults?.["coupler-api"]?.evidence?.publicContract;
    const consumers = Array.isArray(publicContract?.consumers)
      ? publicContract.consumers
      : [];
    const cases = Array.isArray(publicContract?.cases)
      ? publicContract.cases
      : [];
    const expectedCaseIds = [];
    for (const consumer of consumers) {
      if (
        !consumer ||
        typeof consumer !== "object" ||
        Array.isArray(consumer) ||
        consumer.state !== "present" ||
        !Array.isArray(consumer.interfaces)
      ) {
        continue;
      }
      for (const interfaceName of consumer.interfaces) {
        const matchingCases = cases.filter(
          (contractCase) =>
            contractCase?.consumerId === consumer.id &&
            contractCase.interface === interfaceName &&
            contractCase.apiGeneration === "previous" &&
            contractCase.exposure === "rollback" &&
            contractCase.expected === "success",
        );
        if (matchingCases.length !== 1) {
          errors.push(`${context}: release-metadata ${fieldPath}.previousReleaseCaseIds requires exact successful previous-API rollback coverage: ${consumer.id}:${interfaceName}`);
          continue;
        }
        expectedCaseIds.push(matchingCases[0].id);
      }
    }
    for (const caseId of Array.isArray(runtimeRecovery.previousReleaseCaseIds)
      ? runtimeRecovery.previousReleaseCaseIds
      : []) {
      const contractCase = cases.find((candidate) => candidate?.id === caseId);
      if (
        !contractCase ||
        contractCase.apiGeneration !== "previous" ||
        contractCase.exposure !== "rollback" ||
        contractCase.expected !== "success"
      ) {
        errors.push(`${context}: release-metadata ${fieldPath}.previousReleaseCaseIds must reference successful previous-API rollback cases: ${caseId}`);
      }
    }
    const actualCaseIds = Array.isArray(runtimeRecovery.previousReleaseCaseIds)
      ? [...runtimeRecovery.previousReleaseCaseIds].sort()
      : [];
    expectedCaseIds.sort();
    if (JSON.stringify(actualCaseIds) !== JSON.stringify(expectedCaseIds)) {
      errors.push(`${context}: release-metadata ${fieldPath}.previousReleaseCaseIds must exactly cover every release consumer interface`);
    }
  }
}

function validateClosedStringArray(
  value,
  allowedValues,
  context,
  fieldPath,
  errors,
  { nonEmpty = false } = {},
) {
  if (!Array.isArray(value)) {
    errors.push(`${context}: release-metadata ${fieldPath} must be an array`);
    return;
  }
  if (nonEmpty && value.length === 0) {
    errors.push(`${context}: release-metadata ${fieldPath} must not be empty`);
  }
  const seen = new Set();
  for (const item of value) {
    if (!isNonEmptyString(item) || seen.has(item)) {
      errors.push(`${context}: release-metadata ${fieldPath} must contain unique non-empty strings`);
      continue;
    }
    seen.add(item);
    if (allowedValues && !allowedValues.has(item)) {
      errors.push(`${context}: release-metadata ${fieldPath} contains an unsupported value: ${item}`);
    }
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

  if (
    !(Array.isArray(metadata.releaseScopes) && metadata.releaseScopes.includes("coupler-api")) ||
    !(Array.isArray(metadata.releaseScopes) && metadata.releaseScopes.includes("contracts-package"))
  ) {
    errors.push(`${context}: release-metadata apiContractCutover requires coupler-api and contracts-package scopes`);
  }

  if (
    cutover.status === "rollback" &&
    metadata.scopeResults?.["coupler-api"]?.status !== "rolled_back"
  ) {
    errors.push(`${context}: release-metadata apiContractCutover.status rollback requires scopeResults.coupler-api.status rolled_back`);
  }
  if (
    cutover.status === "released" &&
    metadata.scopeResults?.["coupler-api"]?.status !== "released"
  ) {
    errors.push(`${context}: release-metadata apiContractCutover.status released requires scopeResults.coupler-api.status released`);
  }
  if (
    cutover.status === "violated" &&
    metadata.scopeResults?.["coupler-api"]?.status !== "released"
  ) {
    errors.push(`${context}: release-metadata apiContractCutover.status violated requires scopeResults.coupler-api.status released`);
  }
  if (
    isTerminalApiContractCutoverStatus(cutover.status) &&
    metadata.scopeResults?.["contracts-package"]?.status !== "released"
  ) {
    errors.push(`${context}: terminal apiContractCutover requires scopeResults.contracts-package.status released`);
  }

  if (cutover.status === "violated") {
    validateApiContractCutoverViolationFields(metadata, context, errors);
  } else if (isTerminalApiContractCutoverStatus(cutover.status)) {
    validateTerminalApiContractCutoverFields(metadata, context, errors);
  }
}

function validateApiContractCutoverKeys(cutover, context, errors) {
  const violated = cutover.status === "violated";
  validateExactObjectKeys({
    value: cutover,
    allowedKeys: violated
      ? ["status", "contractArtifactSync", "violation"]
      : ["status", "contractArtifactSync", "activation", "rollback"],
    context,
    fieldPath: "apiContractCutover",
    errors,
  });

  validateNestedObjectKeys({
    value: cutover.contractArtifactSync,
    allowedKeys: ["command", "result", "consumerPath"],
    context,
    fieldPath: "apiContractCutover.contractArtifactSync",
    errors,
  });

  if (violated) {
    validateNestedObjectKeys({
      value: cutover.violation,
      allowedKeys: [
        "failedRequirements",
        "affectedConsumerRefs",
        "detectedAt",
        "observedEvidence",
        "unobservedScope",
        "operationalDisposition",
        "followUpControl",
      ],
      context,
      fieldPath: "apiContractCutover.violation",
      errors,
    });
    validateClosedStringArray(
      cutover.violation?.failedRequirements,
      apiContractCutoverViolationFailedRequirements,
      context,
      "apiContractCutover.violation.failedRequirements",
      errors,
      { nonEmpty: true },
    );
    validateClosedStringArray(
      cutover.violation?.affectedConsumerRefs,
      null,
      context,
      "apiContractCutover.violation.affectedConsumerRefs",
      errors,
      { nonEmpty: true },
    );
    for (const [index, consumerRef] of (
      Array.isArray(cutover.violation?.affectedConsumerRefs)
        ? cutover.violation.affectedConsumerRefs
        : []
    ).entries()) {
      if (
        !/^[a-z0-9][a-z0-9-]*@[0-9a-f]{7,40}:(?:rest|websocket|bootstrap|version)$/i.test(
          consumerRef,
        )
      ) {
        errors.push(
          `${context}: release-metadata apiContractCutover.violation.affectedConsumerRefs.${index} must use consumer-id@commit-sha:interface`,
        );
      }
    }
    for (const [fieldPath, value] of [
      ["apiContractCutover.violation.detectedAt", cutover.violation?.detectedAt],
      ["apiContractCutover.violation.observedEvidence", cutover.violation?.observedEvidence],
      ["apiContractCutover.violation.unobservedScope", cutover.violation?.unobservedScope],
      ["apiContractCutover.violation.operationalDisposition", cutover.violation?.operationalDisposition],
      ["apiContractCutover.violation.followUpControl", cutover.violation?.followUpControl],
    ]) {
      if (!isNonEmptyString(value)) {
        errors.push(`${context}: release-metadata ${fieldPath} must be a non-empty string`);
      }
    }
    return;
  }

  validateNestedObjectKeys({
    value: cutover.activation,
    allowedKeys: [
      "caseIds",
      "appliedAt",
      "barrierEvidence",
      "bootstrapUpgradeEvidence",
    ],
    context,
    fieldPath: "apiContractCutover.activation",
    errors,
  });
  validateNestedObjectKeys({
    value: cutover.rollback,
    allowedKeys: ["caseIds", "barrierEvidence", "cautions"],
    context,
    fieldPath: "apiContractCutover.rollback",
    errors,
  });

  for (const [fieldPath, value] of [
    ["apiContractCutover.contractArtifactSync.command", cutover.contractArtifactSync?.command],
    ["apiContractCutover.contractArtifactSync.result", cutover.contractArtifactSync?.result],
    ["apiContractCutover.contractArtifactSync.consumerPath", cutover.contractArtifactSync?.consumerPath],
    ["apiContractCutover.activation.appliedAt", cutover.activation?.appliedAt],
    ["apiContractCutover.activation.barrierEvidence", cutover.activation?.barrierEvidence],
    ["apiContractCutover.activation.bootstrapUpgradeEvidence", cutover.activation?.bootstrapUpgradeEvidence],
    ["apiContractCutover.rollback.barrierEvidence", cutover.rollback?.barrierEvidence],
    ["apiContractCutover.rollback.cautions", cutover.rollback?.cautions],
  ]) {
    if (!isNonEmptyString(value)) {
      errors.push(`${context}: release-metadata ${fieldPath} must be a non-empty string`);
    }
  }
  validateClosedStringArray(
    cutover.activation?.caseIds,
    null,
    context,
    "apiContractCutover.activation.caseIds",
    errors,
    { nonEmpty: true },
  );
  validateClosedStringArray(
    cutover.rollback?.caseIds,
    null,
    context,
    "apiContractCutover.rollback.caseIds",
    errors,
    { nonEmpty: true },
  );
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

  if (metadata.apiContractCutover != null) {
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

  if (
    statuses.some((status) => status === "pending") &&
    statuses.every((status) => status === "pending" || status === "released")
  ) {
    return "pending";
  }

  if (statuses.every((status) => status === "released")) {
    return "released";
  }

  if (
    statuses.some((status) => status === "rolled_back") &&
    statuses.every((status) =>
      ["released", "rolled_back", "superseded"].includes(status),
    )
  ) {
    return "rolled_back";
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
    if (
      metadata.schema === releaseMetadataSchema &&
      scopeName === "mobile-store" &&
      evidence.valueType === "mobileStore"
    ) {
      validateTerminalPlatformMobileStoreMapping(metadata, context, errors);
      continue;
    }
    validateScopeEvidenceValue(metadata, context, scopeName, evidence, errors);
  }
}

function validateTerminalPlatformMobileStoreMapping(metadata, context, errors) {
  const store = metadata.versionMapping?.["coupler-mobile-app"]?.store;
  const mappings = mobileStorePlatforms
    .map((platform) => [platform, store?.[platform]])
    .filter(([, mapping]) => mapping !== null && mapping !== undefined);

  if (mappings.length === 0) {
    errors.push(`${context}: terminal mobile-store scope requires at least one platform mapping`);
    return;
  }

  if (!mappings.some(([, mapping]) => mapping?.sourceStatus === "verified")) {
    errors.push(`${context}: terminal mobile-store scope requires at least one verified platform source`);
  }
}

function validateReleasedScopeTagEvidence(metadata, context, scopeName, errors) {
  const descriptor = releaseScopeDescriptors[scopeName];
  const repoName = descriptor?.releaseTagRepo;
  if (!repoName) {
    return;
  }

  if (metadata.schema === releaseMetadataSchema && scopeName === "mobile-store") {
    const store = metadata.versionMapping?.["coupler-mobile-app"]?.store;
    for (const platform of mobileStorePlatforms) {
      const mapping = store?.[platform];
      if (mapping?.sourceStatus === "verified" && !isSemverTag(mapping.releaseTag)) {
        errors.push(
          `${context}: released mobile-store scope requires a release tag for verified ${platform} source`,
        );
      }
    }
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
        `${context}: terminal ${scopeName} evidence ${fieldPath} must equal @coupler-developer/coupler-api-contracts@x.y.z`,
      );
    }
    return;
  }

  if (evidence.valueType === "commitSha") {
    if (!isFullCommitSha(value)) {
      errors.push(`${context}: terminal ${scopeName} evidence ${fieldPath} must be a full 40-character commit SHA`);
    }
    return;
  }

  if (evidence.valueType === "contractsSourceTree") {
    validateContractsSourceTreeEvidence(value, context, scopeName, fieldPath, errors);
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
    if (metadata.schema === releaseMetadataSchema && scopeName === "mobile-store") {
      validatePlatformSubmittedMarkers(
        value,
        metadata,
        context,
        fieldPath,
        errors,
      );
    } else {
      validateSubmittedMarkers(value, context, scopeName, fieldPath, errors);
    }
    return;
  } else if (evidence.valueType === "concreteEvidence") {
    validateConcreteEvidenceValue({ value, context, scopeName, fieldPath, errors });
  } else if (
    evidence.valueType === "apiPublicContract" ||
    evidence.valueType === "apiRuntimeRecovery"
  ) {
    return;
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

function validateContractsSourceTreeShape(value, context, fieldPath, errors) {
  if (value === null) {
    return;
  }
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    errors.push(`${context}: release-metadata ${fieldPath} must be an object or null`);
    return;
  }
  validateExactObjectKeys({
    value,
    allowedKeys: ["path", "publishedSourceTree", "releaseSourceTree"],
    context,
    fieldPath,
    errors,
  });
  if (value.path !== "packages/contracts") {
    errors.push(`${context}: release-metadata ${fieldPath}.path must equal packages/contracts`);
  }
  for (const key of ["publishedSourceTree", "releaseSourceTree"]) {
    if (!isFullCommitSha(value[key])) {
      errors.push(`${context}: release-metadata ${fieldPath}.${key} must be a full 40-character git tree SHA`);
    }
  }
}

function validateContractsSourceTreeEvidence(
  value,
  context,
  scopeName,
  fieldPath,
  errors,
) {
  validateContractsSourceTreeShape(value, context, fieldPath, errors);
  if (
    !value ||
    typeof value !== "object" ||
    Array.isArray(value) ||
    !isFullCommitSha(value.publishedSourceTree) ||
    !isFullCommitSha(value.releaseSourceTree)
  ) {
    return;
  }
  if (value.publishedSourceTree !== value.releaseSourceTree) {
    errors.push(
      `${context}: terminal ${scopeName} evidence ${fieldPath} must prove identical published and release contracts trees`,
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

function validatePlatformSubmittedMarkersShape(value, context, fieldPath, errors) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    errors.push(`${context}: release-metadata ${fieldPath} must be an object`);
    return;
  }
  validateExactObjectKeys({
    value,
    allowedKeys: mobileStorePlatforms,
    context,
    fieldPath,
    errors,
  });
  for (const platform of mobileStorePlatforms) {
    const marker = value[platform];
    const markerPath = `${fieldPath}.${platform}`;
    if (marker === null) {
      continue;
    }
    if (!marker || typeof marker !== "object" || Array.isArray(marker)) {
      errors.push(`${context}: release-metadata ${markerPath} must be an object or null`);
      continue;
    }
    validateExactObjectKeys({
      value: marker,
      allowedKeys: [
        "status",
        "tag",
        "commit",
        "artifactSha256",
        "evidence",
        "deletedEvidence",
        "limitation",
      ],
      context,
      fieldPath: markerPath,
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

function validatePlatformSubmittedMarkers(value, metadata, context, fieldPath, errors) {
  validatePlatformSubmittedMarkersShape(value, context, fieldPath, errors);
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return;
  }

  const store = metadata.versionMapping?.["coupler-mobile-app"]?.store;
  for (const platform of mobileStorePlatforms) {
    const mapping = store?.[platform];
    const marker = value[platform];
    const markerPath = `${fieldPath}.${platform}`;
    if (!mapping) {
      if (marker !== null) {
        errors.push(`${context}: ${markerPath} must be null when the Store platform is excluded`);
      }
      continue;
    }
    if (!marker || typeof marker !== "object" || Array.isArray(marker)) {
      errors.push(`${context}: terminal mobile-store evidence requires ${markerPath}`);
      continue;
    }
    if (!mobileStoreSourceStatuses.has(marker.status)) {
      errors.push(`${context}: ${markerPath}.status is not allowed: ${marker.status}`);
      continue;
    }

    if (marker.status === "verified") {
      const versionBuildMatch = mapping.versionBuild?.match(/^(\d+\.\d+\.\d+)\s+\((\d+)\)$/);
      const expectedTags = versionBuildMatch
        ? new Set([`submitted/${platform}-${versionBuildMatch[1]}-${versionBuildMatch[2]}`])
        : new Set();
      if (!expectedTags.has(marker.tag)) {
        errors.push(`${context}: verified ${markerPath}.tag must match its platform submission marker`);
      }
      if (!isFullCommitSha(marker.commit) || marker.commit !== mapping.commit) {
        errors.push(`${context}: verified ${markerPath}.commit must match the platform source commit`);
      }
      if (typeof marker.artifactSha256 !== "string" || !/^[0-9a-f]{64}$/i.test(marker.artifactSha256)) {
        errors.push(`${context}: verified ${markerPath}.artifactSha256 must be a SHA-256 digest`);
      }
      for (const key of ["evidence", "deletedEvidence"]) {
        validateConcreteEvidenceValue({
          value: marker[key],
          context,
          scopeName: "mobile-store",
          fieldPath: `${markerPath}.${key}`,
          errors,
        });
      }
      if (marker.limitation !== null) {
        errors.push(`${context}: verified ${markerPath}.limitation must be null`);
      }
      if (mapping.sourceStatus !== "verified") {
        errors.push(`${context}: verified ${markerPath} requires a verified platform source`);
      }
      continue;
    }

    for (const key of ["tag", "commit", "artifactSha256", "evidence", "deletedEvidence"]) {
      if (marker[key] !== null) {
        errors.push(`${context}: unavailable-historical ${markerPath}.${key} must be null`);
      }
    }
    validateConcreteEvidenceValue({
      value: marker.limitation,
      context,
      scopeName: "mobile-store",
      fieldPath: `${markerPath}.limitation`,
      errors,
    });
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

  const apiStatus = metadata.scopeResults?.["coupler-api"]?.status;
  if (
    apiStatus === completedReleaseStatus &&
    !["released", "violated"].includes(cutover.status)
  ) {
    errors.push(`${context}: released coupler-api scope requires apiContractCutover.status released or violated`);
  }

  if (apiStatus === "rolled_back" && cutover.status !== "rollback") {
    errors.push(`${context}: rolled_back coupler-api scope requires apiContractCutover.status rollback`);
  }
}

function validateApiContractCutoverViolationFields(metadata, context, errors) {
  const publicContract =
    metadata.scopeResults?.["coupler-api"]?.evidence?.publicContract;
  if (publicContract !== null) {
    errors.push(
      `${context}: release-metadata violated apiContractCutover requires scopeResults.coupler-api.evidence.publicContract null and violation-specific evidence`,
    );
  }

  for (const { metadataPath: pathParts } of getApiContractCutoverValueFields(
    "violated",
  )) {
    const value = getNestedValue(metadata, pathParts);
    if (
      pathParts.at(-1) === "failedRequirements" ||
      pathParts.at(-1) === "affectedConsumerRefs"
    ) {
      for (const [index, item] of (Array.isArray(value) ? value : []).entries()) {
        validateConcreteEvidenceValue({
          value: item,
          context,
          scopeName: "apiContractCutover",
          fieldPath: `${pathParts.join(".")}.${index}`,
          errors,
        });
      }
      continue;
    }
    validateConcreteEvidenceValue({
      value,
      context,
      scopeName: "apiContractCutover",
      fieldPath: pathParts.join("."),
      errors,
    });
  }
}

function validateTerminalApiContractCutoverFields(metadata, context, errors) {
  const cutover = metadata.apiContractCutover;
  for (const pathParts of apiContractCutoverRequiredPaths.filter(
    (parts) => parts.at(-1) !== "caseIds",
  )) {
    const value = getNestedValue(metadata, pathParts);
    const fieldPath = pathParts.join(".");
    validateConcreteEvidenceValue({
      value,
      context,
      scopeName: "apiContractCutover",
      fieldPath,
      errors,
    });
  }

  const publicContract =
    metadata.scopeResults?.["coupler-api"]?.evidence?.publicContract;
  const contractCases = Array.isArray(publicContract?.cases)
    ? publicContract.cases
    : [];
  const consumers = Array.isArray(publicContract?.consumers)
    ? publicContract.consumers
    : [];
  const consumerById = new Map(
    consumers
      .filter((consumer) => consumer && typeof consumer === "object")
      .map((consumer) => [consumer.id, consumer]),
  );
  for (const [phase, caseIds] of [
    ["activation", cutover.activation?.caseIds],
    ["rollback", cutover.rollback?.caseIds],
  ]) {
    for (const caseId of Array.isArray(caseIds) ? caseIds : []) {
      const contractCase = contractCases.find((candidate) => candidate?.id === caseId);
      if (!contractCase || contractCase.exposure !== phase) {
        errors.push(`${context}: release-metadata apiContractCutover.${phase}.caseIds must reference ${phase} public contract cases: ${caseId}`);
      }
    }
  }
  const activationCaseIds = Array.isArray(cutover.activation?.caseIds)
    ? cutover.activation.caseIds
    : [];
  const activationCases = activationCaseIds
    .map((caseId) => contractCases.find((candidate) => candidate?.id === caseId))
    .filter(Boolean);
  if (
    activationCases.some(
      (contractCase) => contractCase.apiGeneration !== "current",
    )
  ) {
    errors.push(`${context}: release-metadata apiContractCutover.activation.caseIds must exercise the current API`);
  }
  if (
    !activationCases.some(
      (contractCase) =>
        contractCase.expected === "deterministic-rejection" &&
        consumerById.get(contractCase.consumerId)?.generation === "previous",
    )
  ) {
    errors.push(`${context}: release-metadata apiContractCutover.activation.caseIds must include a deterministic previous-consumer rejection`);
  }
  const rollbackCases = (
    Array.isArray(cutover.rollback?.caseIds)
      ? cutover.rollback.caseIds
      : []
  )
    .map((caseId) => contractCases.find((candidate) => candidate?.id === caseId))
    .filter(Boolean);
  if (
    rollbackCases.some(
      (contractCase) =>
        contractCase.apiGeneration !== "current" ||
        contractCase.expected !== "success" ||
        consumerById.get(contractCase.consumerId)?.generation !== "previous",
    )
  ) {
    errors.push(`${context}: release-metadata apiContractCutover.rollback.caseIds must reference successful previous-consumer/current-API rollback cases`);
  }
}

function isTerminalApiContractCutoverStatus(status) {
  return (
    status === completedReleaseStatus ||
    status === "violated" ||
    status === "rollback"
  );
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
