export const mobileStorePlatforms = ["android", "ios"];
export const mobileStoreSourceStatuses = new Set([
  "verified",
  "unavailable-historical",
]);

export const releaseMetadataTopLevelKeys = new Set([
  "version",
  "status",
  "releaseScopes",
  "extraRepoRefs",
  "versionMapping",
  "scopeResults",
  "apiContractCutover",
]);

export const releaseMetadataRequiredTopLevelKeys = new Set(releaseMetadataTopLevelKeys);

export const knownRepoNames = [
  "docs",
  "coupler-api",
  "coupler-admin-web",
  "coupler-mobile-app",
];

export const recordRepoName = "docs";

export const serviceRepoNames = knownRepoNames.filter(
  (repoName) => repoName !== recordRepoName,
);

const serviceRepoRefPolicy = {
  allowConcreteCommit: true,
  requiresMappingBasis: true,
  tagOriginRequirement: "always",
  tagMustMatchReleaseVersion: false,
  tagMustBeAnnotated: true,
  tagMustBeAncestorOfOriginMain: true,
  commitMustBeAncestorOfOriginMain: true,
};

export const repoRefPolicyDescriptors = {
  docs: {
    allowConcreteCommit: false,
    concreteCommitError:
      "docs: versionMapping.docs.commit은 안정적인 자기 참조가 아니므로 사용하지 않습니다",
    requiresMappingBasis: false,
    tagOriginRequirement: "terminal",
    tagMustMatchReleaseVersion: true,
    tagMustBeAnnotated: true,
    tagMustBeAncestorOfOriginMain: true,
    commitMustBeAncestorOfOriginMain: false,
  },
  "coupler-api": serviceRepoRefPolicy,
  "coupler-admin-web": serviceRepoRefPolicy,
  "coupler-mobile-app": serviceRepoRefPolicy,
};

export const repoNameAliases = new Map([
  ["api", "coupler-api"],
  ["admin", "coupler-admin-web"],
  ["mobile", "coupler-mobile-app"],
]);

export const releaseScopes = [
  "db-migration",
  "contracts-package",
  "coupler-api",
  "coupler-admin-web",
  "mobile-store",
  "mobile-nextpush",
  "docs",
];

export const allowedReleaseScopes = new Set(releaseScopes);

export const releaseScopeDescriptors = {
  "db-migration": {
    requiredRepoRefs: ["coupler-api"],
    releasedEvidence: [],
    rollbackEvidence: [],
  },
  "contracts-package": {
    requiredRepoRefs: ["coupler-api"],
    releasedEvidence: [
      {
        label: "contracts package published package",
        metadataPath: ["scopeResults", "contracts-package", "evidence", "publishedPackage"],
        valueType: "contractsPackageVersion",
      },
      {
        label: "contracts package workflow",
        metadataPath: ["scopeResults", "contracts-package", "evidence", "workflow"],
        valueType: "concreteEvidence",
      },
      {
        label: "contracts package source ref",
        metadataPath: ["scopeResults", "contracts-package", "evidence", "sourceRef"],
        valueType: "commitSha",
      },
      {
        label: "contracts package source tree",
        metadataPath: ["scopeResults", "contracts-package", "evidence", "sourceTree"],
        valueType: "contractsSourceTree",
      },
    ],
  },
  "coupler-api": {
    requiredRepoRefs: ["coupler-api"],
    releaseTagRepo: "coupler-api",
    releasedEvidence: [
      {
        label: "coupler-api deployment",
        metadataPath: ["scopeResults", "coupler-api", "evidence", "deployment"],
        valueType: "concreteEvidence",
      },
      {
        label: "coupler-api smoke",
        metadataPath: ["scopeResults", "coupler-api", "evidence", "smoke"],
        valueType: "concreteEvidence",
      },
      {
        label: "coupler-api public contract",
        metadataPath: ["scopeResults", "coupler-api", "evidence", "publicContract"],
        valueType: "apiPublicContract",
      },
      {
        label: "coupler-api runtime recovery",
        metadataPath: ["scopeResults", "coupler-api", "evidence", "runtimeRecovery"],
        valueType: "apiRuntimeRecovery",
      },
    ],
    rollbackEvidence: [
      {
        label: "coupler-api runtime recovery",
        metadataPath: ["scopeResults", "coupler-api", "evidence", "runtimeRecovery"],
        valueType: "apiRuntimeRecovery",
      },
    ],
  },
  "coupler-admin-web": {
    requiredRepoRefs: ["coupler-admin-web"],
    releaseTagRepo: "coupler-admin-web",
    releasedEvidence: [
      {
        label: "coupler-admin-web deployment",
        metadataPath: ["scopeResults", "coupler-admin-web", "evidence", "deployment"],
        valueType: "concreteEvidence",
      },
      {
        label: "coupler-admin-web smoke",
        metadataPath: ["scopeResults", "coupler-admin-web", "evidence", "smoke"],
        valueType: "concreteEvidence",
      },
      {
        label: "coupler-admin-web rollback",
        metadataPath: ["scopeResults", "coupler-admin-web", "evidence", "rollback"],
        valueType: "concreteEvidence",
      },
    ],
    rollbackEvidence: [
      {
        label: "coupler-admin-web rollback",
        metadataPath: ["scopeResults", "coupler-admin-web", "evidence", "rollback"],
        valueType: "concreteEvidence",
      },
    ],
  },
  "mobile-store": {
    requiredRepoRefs: ["coupler-mobile-app"],
    releaseTagRepo: "coupler-mobile-app",
    releasedEvidence: [
      {
        label: "mobile store version/build",
        metadataPath: ["versionMapping", "coupler-mobile-app", "store"],
        valueType: "platformMobileStore",
      },
      {
        label: "mobile store submission",
        metadataPath: ["scopeResults", "mobile-store", "evidence", "submission"],
        valueType: "concreteEvidence",
      },
      {
        label: "mobile store approval",
        metadataPath: ["scopeResults", "mobile-store", "evidence", "approval"],
        valueType: "concreteEvidence",
      },
      {
        label: "mobile store release",
        metadataPath: ["scopeResults", "mobile-store", "evidence", "release"],
        valueType: "concreteEvidence",
      },
      {
        label: "mobile store smoke",
        metadataPath: ["scopeResults", "mobile-store", "evidence", "smoke"],
        valueType: "concreteEvidence",
      },
      {
        label: "mobile store artifact",
        metadataPath: ["scopeResults", "mobile-store", "evidence", "artifact"],
        valueType: "concreteEvidence",
      },
      {
        label: "mobile store submitted marker evidence",
        metadataPath: ["scopeResults", "mobile-store", "evidence", "submittedMarkers"],
        valueType: "submittedMarkers",
      },
    ],
  },
  "mobile-nextpush": {
    requiredRepoRefs: ["coupler-mobile-app"],
    releasedEvidence: [
      {
        label: "mobile NextPush deployment",
        metadataPath: ["versionMapping", "coupler-mobile-app", "nextPush"],
        valueType: "concreteEvidence",
      },
      {
        label: "mobile NextPush app",
        metadataPath: ["scopeResults", "mobile-nextpush", "evidence", "app"],
        valueType: "concreteEvidence",
      },
      {
        label: "mobile NextPush production label",
        metadataPath: ["scopeResults", "mobile-nextpush", "evidence", "productionLabel"],
        valueType: "concreteEvidence",
      },
      {
        label: "mobile NextPush Android package hash",
        metadataPath: ["scopeResults", "mobile-nextpush", "evidence", "androidPackageHash"],
        valueType: "sha256",
      },
      {
        label: "mobile NextPush iOS package hash",
        metadataPath: ["scopeResults", "mobile-nextpush", "evidence", "iosPackageHash"],
        valueType: "sha256",
      },
      {
        label: "mobile NextPush target binary",
        metadataPath: ["scopeResults", "mobile-nextpush", "evidence", "targetBinary"],
        valueType: "concreteEvidence",
      },
      {
        label: "mobile NextPush uploaded at",
        metadataPath: ["scopeResults", "mobile-nextpush", "evidence", "uploadedAt"],
        valueType: "concreteEvidence",
      },
      {
        label: "mobile NextPush history",
        metadataPath: ["scopeResults", "mobile-nextpush", "evidence", "history"],
        valueType: "concreteEvidence",
      },
      {
        label: "mobile NextPush rollback target",
        metadataPath: ["scopeResults", "mobile-nextpush", "evidence", "rollbackTarget"],
        valueType: "concreteEvidence",
      },
      {
        label: "mobile NextPush rollout",
        metadataPath: ["scopeResults", "mobile-nextpush", "evidence", "rollout"],
        valueType: "concreteEvidence",
      },
      {
        label: "mobile NextPush mandatory",
        metadataPath: ["scopeResults", "mobile-nextpush", "evidence", "mandatory"],
        valueType: "concreteEvidence",
      },
      {
        label: "mobile NextPush disabled",
        metadataPath: ["scopeResults", "mobile-nextpush", "evidence", "disabled"],
        valueType: "concreteEvidence",
      },
    ],
  },
  docs: {
    requiredRepoRefs: ["docs"],
    releaseTagRepo: "docs",
    releasedEvidence: [],
  },
};

export const releaseStatuses = [
  "planned",
  "pending",
  "in_progress",
  "released",
  "rolled_back",
  "superseded",
];

export const allowedReleaseStatuses = new Set(releaseStatuses);
export const terminalReleaseStatuses = new Set([
  "released",
  "rolled_back",
  "superseded",
]);
export const completedReleaseStatus = "released";
export const activeReleaseStatuses = new Set(["planned", "pending", "in_progress"]);
export const terminalScopeResultStatuses = new Set([
  "released",
  "rolled_back",
  "superseded",
]);
export const apiContractCutoverStatuses = [
  "pending",
  "ready",
  "released",
  "violated",
  "rollback",
];

export const allowedApiContractCutoverStatuses = new Set(apiContractCutoverStatuses);

export const semverTagPattern = /^v\d+\.\d+\.\d+$/;
export const commitShaPattern = /^[0-9a-f]{7,40}$/i;
export const sha256Pattern = /^[0-9a-f]{64}$/i;
export const contractsPackagePattern =
  /^@coupler-developer\/coupler-api-contracts@\d+\.\d+\.\d+$/;

export const emptyRefValues = new Set(["", "N/A", "미생성", "pending", "기록 없음"]);

const releaseIncompleteSignals = [
  {
    label: "pending",
    pattern: /\bpending\b/i,
  },
  {
    label: "in_review",
    pattern: /\bin_review\b/i,
  },
  {
    label: "대기",
    pattern: /대기/,
  },
  {
    label: "심사 중",
    pattern: /심사\s*중/,
  },
  {
    label: "미검증",
    pattern: /미검증/,
  },
  {
    label: "미완료",
    pattern: /미완료/,
  },
];

export const releasePlaceholderSignals = [
  ...releaseIncompleteSignals,
  {
    label: "미생성",
    pattern: /미생성/,
  },
  {
    label: "기록 없음",
    pattern: /기록\s*없음/,
  },
];

export const versionMappingFieldDescriptors = {
  docs: [
    {
      key: "tag",
      valueType: "semverTagOrEmpty",
      mirrorLabelPattern: /태그/,
    },
    {
      key: "commit",
      valueType: "commitShaOrEmpty",
      mirrorLabelPattern: /커밋/,
    },
  ],
  "coupler-api": [
    {
      key: "tag",
      valueType: "semverTagOrEmpty",
      mirrorLabelPattern: /태그/,
    },
    {
      key: "commit",
      valueType: "commitShaOrEmpty",
      mirrorLabelPattern: /커밋/,
    },
  ],
  "coupler-admin-web": [
    {
      key: "tag",
      valueType: "semverTagOrEmpty",
      mirrorLabelPattern: /태그/,
    },
    {
      key: "commit",
      valueType: "commitShaOrEmpty",
      mirrorLabelPattern: /커밋/,
    },
  ],
};

const mobilePlatformVersionMappingFieldDescriptors = [
  ...mobileStorePlatforms.flatMap((platform) => {
    const label = platform === "android" ? "Android" : "iOS";
    return [
      {
        path: ["store", platform, "versionBuild"],
        mirrorLabelPattern: new RegExp(`${label} Store`),
      },
      {
        path: ["store", platform, "releaseTag"],
        mirrorLabelPattern: new RegExp(`${label} 릴리스\\s+태그`),
      },
      {
        path: ["store", platform, "commit"],
        mirrorLabelPattern: new RegExp(`${label} 커밋`),
      },
      {
        path: ["store", platform, "sourceStatus"],
        mirrorLabelPattern: new RegExp(`${label} source`),
      },
    ];
  }),
  {
    path: ["nextPush"],
    mirrorLabelPattern: /NextPush(?!\s+커밋)/,
  },
  {
    path: ["commit"],
    mirrorLabelPattern: /NextPush\s+커밋/,
  },
];

export function getVersionMappingFieldDescriptors(repoName) {
  if (repoName === "coupler-mobile-app") {
    return mobilePlatformVersionMappingFieldDescriptors;
  }

  return (versionMappingFieldDescriptors[repoName] ?? []).map((descriptor) => ({
    ...descriptor,
    path: [descriptor.key],
  }));
}

export const apiContractCutoverCommonValueFields = [
  {
    label: "명령",
    metadataPath: ["apiContractCutover", "contractArtifactSync", "command"],
  },
  {
    label: "결과",
    metadataPath: ["apiContractCutover", "contractArtifactSync", "result"],
  },
  {
    label: "published package",
    metadataPath: ["scopeResults", "contracts-package", "evidence", "publishedPackage"],
  },
  {
    label: "Mobile/Admin consumer path",
    metadataPath: ["apiContractCutover", "contractArtifactSync", "consumerPath"],
  },
];

const apiContractCutoverGateValueFields = [
  {
    label: "Activation case IDs",
    metadataPath: ["apiContractCutover", "activation", "caseIds"],
  },
  {
    label: "Activation 적용 시각",
    metadataPath: ["apiContractCutover", "activation", "appliedAt"],
  },
  {
    label: "Activation 순서 증빙",
    metadataPath: ["apiContractCutover", "activation", "sequenceEvidence"],
  },
  {
    label: "이전 client bootstrap/upgrade 증빙",
    metadataPath: ["apiContractCutover", "activation", "bootstrapUpgradeEvidence"],
  },
  {
    label: "Client rollback case IDs",
    metadataPath: ["apiContractCutover", "rollback", "caseIds"],
  },
  {
    label: "Rollback 순서 증빙",
    metadataPath: ["apiContractCutover", "rollback", "sequenceEvidence"],
  },
  {
    label: "Client rollback 주의 사항",
    metadataPath: ["apiContractCutover", "rollback", "cautions"],
  },
];

export const apiContractCutoverValueFields = [
  ...apiContractCutoverCommonValueFields,
  ...apiContractCutoverGateValueFields,
];

export const apiContractCutoverRequiredPaths = apiContractCutoverValueFields.map(
  ({ metadataPath }) => metadataPath,
);

export const apiContractCutoverViolationValueFields = [
  {
    label: "실패 요구조건",
    metadataPath: ["apiContractCutover", "violation", "failedRequirements"],
  },
  {
    label: "영향 소비자 ref",
    metadataPath: ["apiContractCutover", "violation", "affectedConsumerRefs"],
  },
  {
    label: "발견 시점",
    metadataPath: ["apiContractCutover", "violation", "detectedAt"],
  },
  {
    label: "관측 근거",
    metadataPath: ["apiContractCutover", "violation", "observedEvidence"],
  },
  {
    label: "미관측 범위",
    metadataPath: ["apiContractCutover", "violation", "unobservedScope"],
  },
  {
    label: "운영 처분",
    metadataPath: ["apiContractCutover", "violation", "operationalDisposition"],
  },
  {
    label: "후속 통제",
    metadataPath: ["apiContractCutover", "violation", "followUpControl"],
  },
];

export const apiContractCutoverViolationRequiredPaths =
  apiContractCutoverViolationValueFields.map(({ metadataPath }) => metadataPath);

export const apiContractCutoverViolationFailedRequirements = new Set([
  "consumer-inventory",
  "current-consumer-smoke",
  "pre-deploy-activation-sequence",
  "old-readable-bootstrap",
  "previous-consumer-product-case",
  "client-rollback",
]);

export function getApiContractCutoverValueFields(status) {
  return status === "violated"
    ? [
      ...apiContractCutoverCommonValueFields,
      ...apiContractCutoverViolationValueFields,
    ]
    : apiContractCutoverValueFields;
}

export function isEmptyRefValue(value) {
  return value == null || (typeof value === "string" && emptyRefValues.has(value));
}

export function isSemverTag(value) {
  return typeof value === "string" && semverTagPattern.test(value);
}

export function isCommitSha(value) {
  return typeof value === "string" && commitShaPattern.test(value);
}

export function hasContractsPackageVersion(value) {
  return typeof value === "string" && contractsPackagePattern.test(value);
}

export function getRequiredRepoRefsForReleaseScopes(scopeNames) {
  const repoRefs = new Set([recordRepoName]);

  for (const scopeName of scopeNames) {
    const descriptor = releaseScopeDescriptors[scopeName];
    if (!descriptor) {
      continue;
    }

    for (const repoName of descriptor.requiredRepoRefs) {
      repoRefs.add(repoName);
    }
  }

  return sortRepoNames(repoRefs);
}

export function sortRepoNames(repoNames) {
  const repoNameSet = repoNames instanceof Set ? repoNames : new Set(repoNames);

  return new Set(knownRepoNames.filter((repoName) => repoNameSet.has(repoName)));
}

export function isNonEmptyString(value) {
  return typeof value === "string" && value.trim().length > 0;
}

export function isNonApplicableEvidenceValue(value) {
  if (typeof value !== "string") {
    return false;
  }

  return /^(?:N\/A|NA|not applicable|미적용|해당\s*없음)(?:\b|\s|-|:)/i.test(value.trim());
}

export function findReleasePlaceholderSignals(value, pathParts = []) {
  const findings = [];

  if (typeof value === "string") {
    const signal = getReleasePlaceholderSignal(value);
    if (signal) {
      findings.push({
        path: formatPath(pathParts),
        signal,
      });
    }

    return findings;
  }

  if (Array.isArray(value)) {
    value.forEach((item, index) => {
      findings.push(...findReleasePlaceholderSignals(item, [...pathParts, String(index)]));
    });
    return findings;
  }

  if (value && typeof value === "object") {
    for (const [key, item] of Object.entries(value)) {
      findings.push(...findReleasePlaceholderSignals(item, [...pathParts, key]));
    }
  }

  return findings;
}

export function valueHasReleasePlaceholderSignal(value) {
  return findReleasePlaceholderSignals(value).length > 0;
}

export function getReleasePlaceholderSignal(value) {
  const normalized = value.trim();

  if (normalized === "" || normalized === "N/A") {
    return "empty";
  }

  for (const signal of releasePlaceholderSignals) {
    if (signal.pattern.test(normalized)) {
      return signal.label;
    }
  }

  return null;
}

export function isPlaceholderMirrorValue(value) {
  return /^(pending|in_review|미생성|미검증|미완료|심사\s*중|대기|N\/A)$/i.test(value);
}

export function getNestedValue(value, pathParts) {
  let current = value;

  for (const pathPart of pathParts) {
    if (!current || typeof current !== "object") {
      return undefined;
    }

    current = current[pathPart];
  }

  return current;
}

function formatPath(pathParts) {
  if (pathParts.length === 0) {
    return "";
  }

  return `.${pathParts.join(".")}`;
}
