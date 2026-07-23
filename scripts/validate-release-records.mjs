import fs from "node:fs";
import path from "node:path";
import {
  findReleasePlaceholderSignals,
  hasReleaseMetadataBlock,
  knownRepoNames,
  parseReleaseMetadataBlock,
  validateReleaseMetadata,
} from "./release-record-metadata.mjs";
import { createReleaseRecordModel } from "./release-record-model.mjs";
import {
  allowedApiContractCutoverStatuses,
  allowedReleaseStatuses,
  apiContractCutoverValueFields,
  getNestedValue,
  isPlaceholderMirrorValue,
  versionMappingFieldDescriptors,
} from "./release-schema.mjs";
import {
  parseReleaseStatus,
  validateReleaseStatusGate,
} from "./release-status-gate.mjs";
import {
  extractHeadingSection,
  extractRepoNames,
  extractSection,
  parseScopeFields,
  setsAreEqual,
} from "./release-record-parser.mjs";
import {
  dbMigrationGateActivationPath,
  dbMigrationTrustEpochDirectory,
  validateDbMigrationGateActivation,
  validateDbMigrationReleaseHistory,
} from "./db-migration-release-contract-v2.mjs";
import { readRegularRepoFile } from "./regular-repo-file.mjs";

const docsRoot = process.cwd();
const releasesRoot = path.join(docsRoot, "content", "releases");
const requiredSections = [
  "목적",
  "범위",
  "상위 규범 문서",
  "릴리스 상태",
  "릴리스 결과",
  "메인 흐름",
  "검증 근거",
  "롤백 기준",
];
const forbiddenPatterns = [
  /TODO/i,
  /TBD/i,
  /추후 작성/,
  /이 문서가 포함된/,
];
// Published release records remain immutable unless factual evidence changes.
const legacyRecordsWithoutVersionMapping = new Set([
  path.join("content", "releases", "v2.0.0.md"),
  path.join("content", "releases", "v2.1.0.md"),
  path.join("content", "releases", "v2.2.0.md"),
  path.join("content", "releases", "v2.2.1.md"),
  path.join("content", "releases", "v2.2.2.md"),
  path.join("content", "releases", "v2.2.3.md"),
  path.join("content", "releases", "v2.2.4.md"),
]);
const legacyRecordsWithoutReleaseMetadata = new Set([
  ...legacyRecordsWithoutVersionMapping,
]);

const errors = [];
const releaseHistoryRecords = [];

if (fs.existsSync(releasesRoot)) {
  const releaseEntries = fs.readdirSync(releasesRoot, { withFileTypes: true })
    .filter((entry) => entry.isFile() && /^v\d+\.\d+\.\d+\.md$/.test(entry.name))
    .sort((left, right) =>
      left.name.localeCompare(right.name, undefined, { numeric: true }),
    );
  for (const entry of releaseEntries) {
    const tag = entry.name.replace(/\.md$/, "");
    const relativePath = path.join("content", "releases", entry.name);
    const absolutePath = path.join(releasesRoot, entry.name);
    const source = fs.readFileSync(absolutePath, "utf8");
    validateReleaseRecord(relativePath, source, tag, errors);
  }
}

validateCurrentDbMigrationActivation(errors);
validateDbMigrationHistory(errors);

if (errors.length > 0) {
  for (const error of errors) {
    console.error(error);
  }
  process.exit(1);
}

console.log("릴리스 기록 검증 통과");

function validateReleaseRecord(relativePath, source, tag, errors) {
  const metadata = readReleaseMetadata(relativePath, source, tag, errors);
  if (metadata) {
    releaseHistoryRecords.push({ path: relativePath, metadata });
  }
  const releaseModel = metadata ? createReleaseRecordModel(metadata) : null;

  for (const sectionTitle of requiredSections) {
    if (!extractSection(source, sectionTitle).trim()) {
      errors.push(`${relativePath}: 필수 섹션이 없거나 비어 있습니다: ${sectionTitle}`);
    }
  }

  for (const pattern of forbiddenPatterns) {
    if (pattern.test(source)) {
      errors.push(`${relativePath}: 릴리스 기록에 placeholder 표현이 남아 있습니다: ${pattern}`);
    }
  }

  const statusSection = extractSection(source, "릴리스 상태");
  if (!statusSection.includes(`- 목표 버전: \`${tag}\``)) {
    errors.push(`${relativePath}: 목표 버전이 파일명 tag와 일치하지 않습니다: ${tag}`);
  }

  const releaseStatus = parseReleaseStatus(statusSection);
  if (!releaseStatus) {
    errors.push(`${relativePath}: 전체 상태 또는 최종 상태를 backtick 값으로 기록해야 합니다.`);
  } else if (!allowedReleaseStatuses.has(releaseStatus)) {
    errors.push(`${relativePath}: 허용되지 않은 릴리스 상태입니다: ${releaseStatus}`);
  }

  if (metadata?.status && releaseStatus && metadata.status !== releaseStatus) {
    errors.push(`${relativePath}: release-metadata status가 릴리스 상태 섹션과 일치하지 않습니다.`);
  }

  errors.push(
    ...validateReleaseStatusGate({
      context: relativePath,
      status: releaseStatus,
      statusSection,
    }).map((error) => `${error}.`),
  );

  validateListSection(relativePath, source, "목적", /^- /, errors);
  validateScopeMetadataSync(relativePath, source, releaseModel, errors);
  validateListSection(relativePath, source, "릴리스 상태", /^- /, errors);
  validateVersionMappingSectionIfRequired(relativePath, source, metadata, errors);
  validateListSection(relativePath, source, "릴리스 결과", /^- /, errors);
  validateListSection(relativePath, source, "메인 흐름", /^[0-9]+\.\s+/, errors);
  validateListSection(relativePath, source, "검증 근거", /^- /, errors);
  validateApiContractCutoverGate(relativePath, source, releaseStatus, metadata, errors);
  validateListSection(relativePath, source, "롤백 기준", /^- /, errors);
}

function validateDbMigrationHistory(errors) {
  const bootstrapPath = path.join(
    docsRoot,
    "content",
    "policy",
    "db-migration-frontier-bootstrap-v2.json",
  );
  const trustBootstrapPath = path.join(
    docsRoot,
    "content",
    "policy",
    "db-migration-trust-bootstrap-v2.json",
  );
  if (!fs.existsSync(bootstrapPath) || !fs.existsSync(trustBootstrapPath)) {
    errors.push("DB migration v2 bootstrap files are missing");
    return;
  }
  const bootstrap = readJsonForDbMigration(bootstrapPath, errors);
  const trustRegistry = readJsonForDbMigration(trustBootstrapPath, errors);
  if (!bootstrap || !trustRegistry) {
    return;
  }
  const epochRoot = path.join(docsRoot, dbMigrationTrustEpochDirectory);
  if (fs.existsSync(epochRoot)) {
    const allEpochEntries = fs
      .readdirSync(epochRoot, { withFileTypes: true })
      .filter((entry) => entry.name.endsWith(".json"));
    for (const entry of allEpochEntries) {
      if (!entry.isFile()) {
        errors.push(
          `${path.join(dbMigrationTrustEpochDirectory, entry.name)}: trust epoch must be a regular file`,
        );
      }
    }
    const epochEntries = allEpochEntries
      .filter((entry) => entry.isFile())
      .sort((left, right) =>
        left.name.localeCompare(right.name, undefined, {
          numeric: true,
        }),
      );
    trustRegistry.epochs = epochEntries
      .map((entry) => readJsonForDbMigration(path.join(epochRoot, entry.name), errors))
      .filter(Boolean);
  }
  const history = validateDbMigrationReleaseHistory({
    records: releaseHistoryRecords,
    bootstrap,
    trustRegistry,
    readEvidence: (relativePath) => {
      return readRegularRepoFile(docsRoot, relativePath);
    },
  });
  errors.push(...history.errors);
}

function readJsonForDbMigration(filePath, errors) {
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch (error) {
    errors.push(`${path.relative(docsRoot, filePath)}: invalid JSON: ${error.message}`);
    return null;
  }
}

function validateCurrentDbMigrationActivation(errors) {
  const markerPath = path.join(docsRoot, dbMigrationGateActivationPath);
  if (!fs.existsSync(markerPath)) {
    errors.push(`DB migration v2 activation marker is missing: ${dbMigrationGateActivationPath}`);
    return;
  }
  const markerMode = readWorktreeMode(markerPath);
  if (markerMode !== "100644") {
    errors.push(
      `${dbMigrationGateActivationPath} must be a regular 100644 file (got ${markerMode ?? "missing"})`,
    );
    return;
  }
  const source = fs.readFileSync(markerPath, "utf8");
  errors.push(
    ...validateDbMigrationGateActivation({
      source,
      markerMode,
      readFile: (relativePath) => readRegularRepoFile(docsRoot, relativePath),
      readMode: readRepoMode,
    }),
  );
}

function readWorktreeMode(absolutePath) {
  try {
    const stats = fs.lstatSync(absolutePath);
    if (stats.isSymbolicLink()) {
      return "120000";
    }
    if (!stats.isFile()) {
      return null;
    }
    return stats.mode & 0o111 ? "100755" : "100644";
  } catch {
    return null;
  }
}

function readRepoMode(relativePath) {
  const absolutePath = path.resolve(docsRoot, relativePath);
  return absolutePath.startsWith(`${docsRoot}${path.sep}`)
    ? readWorktreeMode(absolutePath)
    : null;
}

function readReleaseMetadata(relativePath, source, tag, errors) {
  const requiresMetadata = !legacyRecordsWithoutReleaseMetadata.has(relativePath);
  if (!requiresMetadata && !hasReleaseMetadataBlock(source)) {
    return null;
  }

  const metadata = parseReleaseMetadataBlock(source, relativePath, errors);
  if (metadata) {
    validateReleaseMetadata(metadata, relativePath, tag, errors);
  }

  return metadata;
}

function validateScopeMetadataSync(relativePath, source, releaseModel, errors) {
  if (!releaseModel) {
    return;
  }

  const scopeFields = parseScopeFields(extractSection(source, "범위"));
  const proseRepoRefs = extractRepoNames(scopeFields.get("대상") ?? "");

  if (!setsAreEqual(proseRepoRefs, releaseModel.preflightRepoNames)) {
    errors.push(`${relativePath}: 범위 대상이 release-metadata derived preflightRepoNames와 일치하지 않습니다.`);
  }
}

function validateApiContractCutoverGate(relativePath, source, releaseStatus, metadata, errors) {
  const section = extractHeadingSection(source, 3, "API contract cutover Gate");
  const hasSection = section.trim().length > 0;
  const metadataCutover = metadata?.apiContractCutover ?? null;

  if (!hasSection && !metadataCutover) {
    return;
  }

  if (hasSection && !metadataCutover) {
    errors.push(
      `${relativePath}: API contract cutover가 포함된 릴리스 기록에는 release-metadata apiContractCutover가 필요합니다.`,
    );
  }

  if (!hasSection) {
    errors.push(
      `${relativePath}: API contract cutover가 포함된 릴리스 기록에는 API contract cutover Gate 섹션이 필요합니다.`,
    );
    return;
  }

  const cutoverStatusMatch = section.match(/- Cutover 상태: `([^`]+)`/);
  if (!cutoverStatusMatch) {
    errors.push(`${relativePath}: API contract cutover Gate에 Cutover 상태를 backtick 값으로 기록해야 합니다.`);
  } else if (!allowedApiContractCutoverStatuses.has(cutoverStatusMatch[1])) {
    errors.push(
      `${relativePath}: 허용되지 않은 API contract cutover 상태입니다: ${cutoverStatusMatch[1]}`,
    );
  } else if (releaseStatus === "released" && cutoverStatusMatch[1] !== "released") {
    errors.push(
      `${relativePath}: released 릴리스의 API contract cutover Gate는 released 상태여야 합니다.`,
    );
  } else if (metadataCutover?.status && cutoverStatusMatch[1] !== metadataCutover.status) {
    errors.push(
      `${relativePath}: API contract cutover Gate 상태가 release-metadata apiContractCutover.status와 일치하지 않습니다.`,
    );
  }

  if (isTerminalApiContractCutoverStatus(metadataCutover?.status)) {
    for (const finding of findReleasePlaceholderSignals(section)) {
      errors.push(
        `${relativePath}: terminal API contract cutover Gate mirror에 placeholder가 남아 있습니다: ${finding.signal}`,
      );
    }
  }

  for (const { label, metadataPath } of apiContractCutoverValueFields) {
    const labelPattern = new RegExp(
      `^\\s*- ${escapeRegExp(label)}:\\s*(.+)$`,
      "m",
    );
    const valueMatch = section.match(labelPattern);
    if (!valueMatch || !valueMatch[1].trim()) {
      errors.push(
        `${relativePath}: API contract cutover Gate 항목 값을 기록해야 합니다: ${label}`,
      );
      continue;
    }

    if (metadataCutover) {
      validateMirrorContainsMetadataValue({
        relativePath,
        sectionName: "API contract cutover Gate",
        metadataRoot: metadata,
        metadataPath,
        markdownValue: valueMatch[1],
        errors,
      });
    }
  }
}

function validateVersionMappingSectionIfRequired(relativePath, source, metadata, errors) {
  const section = extractSection(source, "버전 매핑");
  if (!section.trim() && legacyRecordsWithoutVersionMapping.has(relativePath)) {
    return;
  }

  if (!section.trim()) {
    errors.push(`${relativePath}: 필수 섹션이 없거나 비어 있습니다: 버전 매핑`);
    return;
  }

  const lines = section
    .split("\n")
    .map((line) => line.trimStart())
    .filter((line) => line.startsWith("- "));
  const requiredEntries = [
    "`docs`",
    "`coupler-api`",
    "`coupler-admin-web`",
    "`coupler-mobile-app`",
  ];

  for (const entry of requiredEntries) {
    if (!lines.some((line) => line.startsWith(`- ${entry}:`))) {
      errors.push(`${relativePath}: 버전 매핑 섹션에 ${entry} 항목이 없습니다.`);
    }
  }

  const mobileLine = lines.find((line) => line.startsWith("- `coupler-mobile-app`:"));
  if (!mobileLine) {
    return;
  }

  if (!/Store/.test(mobileLine)) {
    errors.push(`${relativePath}: coupler-mobile-app 버전 매핑에는 Store 기준을 기록해야 합니다.`);
  }

  if (!/(N\/A|기록 없음|\d+\.\d+\.\d+\s+\(\d+\))/.test(mobileLine)) {
    errors.push(
      `${relativePath}: coupler-mobile-app Store 기준은 "X.Y.Z (build)", "N/A", 또는 "기록 없음"으로 기록해야 합니다.`,
    );
  }

  validateVersionMappingMirrorSync(relativePath, lines, metadata, errors);
}

function validateVersionMappingMirrorSync(relativePath, lines, metadata, errors) {
  if (!metadata?.versionMapping || typeof metadata.versionMapping !== "object") {
    return;
  }

  const lineByRepo = new Map();
  for (const line of lines) {
    const repoMatch = line.match(/^- `([^`]+)`:/);
    if (repoMatch) {
      lineByRepo.set(repoMatch[1], line);
    }
  }

  for (const repoName of knownRepoNames) {
    const repoMapping = metadata.versionMapping[repoName];
    const line = lineByRepo.get(repoName);

    if (!repoMapping || !line) {
      continue;
    }

    for (const descriptor of versionMappingFieldDescriptors[repoName] ?? []) {
      validateVersionMappingMirrorValue({
        relativePath,
        metadataPath: ["versionMapping", repoName, descriptor.key],
        metadataValue: repoMapping[descriptor.key],
        markdownValue: extractBacktickValue(line, descriptor.mirrorLabelPattern),
        errors,
      });
    }
  }
}

function validateVersionMappingMirrorValue({
  relativePath,
  metadataPath,
  metadataValue,
  markdownValue,
  errors,
}) {
  const expected = normalizeVersionMappingMirrorValue(metadataValue);
  const actual = normalizeVersionMappingMirrorValue(markdownValue);

  if (actual === expected) {
    return;
  }

  errors.push(
    `${relativePath}: 버전 매핑 mirror가 release-metadata ${metadataPath.join(".")}와 일치하지 않습니다 (markdown: ${formatComparableValue(actual)}, metadata: ${formatComparableValue(expected)}).`,
  );
}

function validateMirrorContainsMetadataValue({
  relativePath,
  sectionName,
  metadataRoot,
  metadataPath,
  markdownValue,
  errors,
}) {
  const expected = normalizeMarkdownMirrorText(getNestedValue(metadataRoot, metadataPath));
  const actual = normalizeMarkdownMirrorText(markdownValue);

  if (!expected) {
    return;
  }

  if (isPlaceholderMirrorValue(expected) && actual === expected) {
    return;
  }

  if (!isPlaceholderMirrorValue(expected) && actual.includes(expected)) {
    return;
  }

  const metadataFieldPath = metadataPath.join(".");
  errors.push(
    `${relativePath}: ${sectionName} mirror가 release-metadata ${metadataFieldPath} 값을 포함하지 않습니다 (markdown: ${formatComparableValue(actual)}, metadata: ${formatComparableValue(expected)}).`,
  );
}

function extractBacktickValue(line, labelPattern) {
  const match = line.match(new RegExp(`${labelPattern.source}\\s+\`([^\`]+)\``));
  return match?.[1] ?? null;
}

function normalizeVersionMappingMirrorValue(value) {
  const normalized = normalizeMarkdownMirrorText(value);

  if (
    normalized === "" ||
    normalized === "N/A" ||
    normalized === "미생성" ||
    normalized === "기록 없음"
  ) {
    return null;
  }

  return normalized;
}

function normalizeMarkdownMirrorText(value) {
  if (value == null) {
    return "";
  }

  return String(value)
    .replace(/`/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function formatComparableValue(value) {
  return value == null || value === "" ? "empty" : value;
}

function isTerminalApiContractCutoverStatus(status) {
  return status === "released" || status === "rollback";
}

function validateListSection(relativePath, source, sectionTitle, itemPattern, errors) {
  const section = extractSection(source, sectionTitle);
  const hasItem = section
    .split("\n")
    .some((line) => itemPattern.test(line.trimStart()));

  if (!hasItem) {
    errors.push(`${relativePath}: ${sectionTitle} 섹션에 필수 목록 항목이 없습니다.`);
  }
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
