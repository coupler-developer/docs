export const releaseMetadataSchema = "release-metadata/v1";

export const releaseMetadataTopLevelKeys = new Set([
  "schema",
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
  refMustEqualCurrentOriginMain: true,
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
    refMustEqualCurrentOriginMain: false,
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
    releasedEvidence: [
      {
        label: "DB migration SQL refs",
        metadataPath: ["scopeResults", "db-migration", "evidence", "sqlRefs"],
        valueType: "dbMigrationSqlRefs",
      },
      {
        label: "DB migration Gate results",
        metadataPath: ["scopeResults", "db-migration", "evidence", "gateResults"],
        valueType: "dbMigrationGateResults",
      },
      {
        label: "DB migration preflight log",
        metadataPath: ["scopeResults", "db-migration", "evidence", "preflightLog"],
        valueType: "concreteEvidence",
      },
      {
        label: "DB migration ledger",
        metadataPath: ["scopeResults", "db-migration", "evidence", "ledger"],
        valueType: "dbMigrationLedger",
      },
      {
        label: "DB migration postcheck log",
        metadataPath: ["scopeResults", "db-migration", "evidence", "postcheckLog"],
        valueType: "concreteEvidence",
      },
      {
        label: "DB migration rollback plan",
        metadataPath: ["scopeResults", "db-migration", "evidence", "rollbackPlan"],
        valueType: "concreteEvidence",
      },
    ],
    rollbackEvidence: [
      {
        label: "DB migration rollback plan",
        metadataPath: ["scopeResults", "db-migration", "evidence", "rollbackPlan"],
        valueType: "concreteEvidence",
      },
    ],
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
        valueType: "concreteEvidence",
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
        label: "coupler-api rollback",
        metadataPath: ["scopeResults", "coupler-api", "evidence", "rollback"],
        valueType: "concreteEvidence",
      },
    ],
    rollbackEvidence: [
      {
        label: "coupler-api rollback",
        metadataPath: ["scopeResults", "coupler-api", "evidence", "rollback"],
        valueType: "concreteEvidence",
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
        valueType: "mobileStore",
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
export const dbMigrationGateIds = [
  "DBM-GATE-000",
  "DBM-GATE-010",
  "DBM-GATE-100",
  "DBM-GATE-200",
  "DBM-GATE-300",
  "DBM-GATE-400",
];
export const allowedDbMigrationGateResultStatuses = new Set([
  "passed",
  "not_applicable",
]);

export const apiContractCutoverStatuses = [
  "pending",
  "ready",
  "released",
  "rollback",
];

export const allowedApiContractCutoverStatuses = new Set(apiContractCutoverStatuses);

export const semverTagPattern = /^v\d+\.\d+\.\d+$/;
export const commitShaPattern = /^[0-9a-f]{7,40}$/i;
export const sha256Pattern = /^[0-9a-f]{64}$/i;
export const contractsPackagePattern =
  /@coupler-developer\/coupler-api-contracts@\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?/;
export const submittedMarkerTagPattern =
  /^submitted\/(?:mobile|android|ios)-\d+\.\d+\.\d+-\d+$/;

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
  "coupler-mobile-app": [
    {
      key: "store",
      valueType: "mobileStoreOrEmpty",
      mirrorLabelPattern: /Store/,
    },
    {
      key: "releaseTag",
      valueType: "semverTagOrEmpty",
      mirrorLabelPattern: /릴리스\s+태그/,
    },
    {
      key: "commit",
      valueType: "commitShaOrEmpty",
      mirrorLabelPattern: /커밋/,
    },
    {
      key: "nextPush",
      valueType: "stringOrEmpty",
      mirrorLabelPattern: /NextPush/,
    },
  ],
};

export const apiContractCutoverValueFields = [
  {
    label: "`coupler-api`",
    metadataPath: ["apiContractCutover", "comparisonRefs", "coupler-api"],
  },
  {
    label: "`coupler-mobile-app`",
    metadataPath: ["apiContractCutover", "comparisonRefs", "coupler-mobile-app"],
  },
  {
    label: "`coupler-admin-web`",
    metadataPath: ["apiContractCutover", "comparisonRefs", "coupler-admin-web"],
  },
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
  {
    label: "Store version/build 또는 NextPush app/deployment/label",
    metadataPath: ["apiContractCutover", "nPlusOneDeployment", "target"],
  },
  {
    label: "운영 출시/적용 시각",
    metadataPath: ["apiContractCutover", "nPlusOneDeployment", "appliedAt"],
  },
  {
    label: "확인 URL 또는 콘솔 증빙",
    metadataPath: ["apiContractCutover", "nPlusOneDeployment", "evidence"],
  },
  {
    label: "기존 N version/build",
    metadataPath: ["apiContractCutover", "legacyTrafficBlock", "previousVersionBuild"],
  },
  {
    label: "강제 업데이트 설정 위치",
    metadataPath: ["apiContractCutover", "legacyTrafficBlock", "forceUpdateConfig"],
  },
  {
    label: "`version_code < min_version` 요청 결과",
    metadataPath: ["apiContractCutover", "legacyTrafficBlock", "versionCodeCheck"],
  },
  {
    label: "앱 버전 설정 화면 저장 검증",
    metadataPath: ["apiContractCutover", "adminVerification", "versionSettingsSave"],
  },
  {
    label: "변경 데이터 조회/운영자 액션 smoke",
    metadataPath: ["apiContractCutover", "adminVerification", "operatorActionSmoke"],
  },
  {
    label: "직전 호환 API/Admin/Mobile SHA 또는 tag",
    metadataPath: ["apiContractCutover", "rollback", "previousRefs"],
  },
  {
    label: "DB 백업/복구 기준",
    metadataPath: ["apiContractCutover", "rollback", "dbBackupRestore"],
  },
  {
    label: "되돌림 금지/주의 사항",
    metadataPath: ["apiContractCutover", "rollback", "cautions"],
  },
];

export const apiContractCutoverRequiredPaths = apiContractCutoverValueFields.map(
  ({ metadataPath }) => metadataPath,
);

export const pendingTransitionFrozenPaths = [
  ["version"],
  ["releaseScopes"],
  ["extraRepoRefs"],
  ["versionMapping", "coupler-api", "commit"],
  ["versionMapping", "coupler-admin-web", "commit"],
  ["versionMapping", "coupler-mobile-app", "commit"],
  ["versionMapping", "coupler-mobile-app", "store"],
  ["apiContractCutover", "comparisonRefs", "coupler-api"],
  ["apiContractCutover", "comparisonRefs", "coupler-admin-web"],
  ["apiContractCutover", "comparisonRefs", "coupler-mobile-app"],
];

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

export function isSubmittedMarkerTag(value) {
  return typeof value === "string" && submittedMarkerTagPattern.test(value);
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
