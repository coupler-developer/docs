import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import {
  findReleasePlaceholderSignals,
  knownRepoNames,
  parseReleaseMetadataBlock,
  validateReleaseMetadata,
} from "./release-record-metadata.mjs";
import { createReleaseRecordModel } from "./release-record-model.mjs";
import {
  allowedApiContractCutoverStatuses,
  allowedReleaseStatuses,
  getApiContractCutoverValueFields,
  getNestedValue,
  getVersionMappingFieldDescriptors,
  isPlaceholderMirrorValue,
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
  dbMigrationMaintenanceEvidenceSchema,
  sha256Hex,
  validateMaintenanceDbMigrationEvidence,
} from "./db-migration-maintenance-artifacts.mjs";

const docsRoot = process.cwd();
const releasesRoot = path.join(docsRoot, "content", "releases");
const releaseRecordPattern = /^content\/releases\/v\d+\.\d+\.\d+\.md$/;
const dbMigrationEvidencePattern =
  /^content\/releases\/evidence\/db-migrations\/(v\d+\.\d+\.\d+)(?:\/|$)/;
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
const errors = [];
const releaseMetadataByVersion = new Map();
let baseRef = null;
try {
  baseRef = resolveBaseRef(process.argv.slice(2));
} catch (error) {
  errors.push(error.message);
}

if (baseRef) {
  validatePublishedReleaseImmutability(baseRef, errors);
}

if (fs.existsSync(releasesRoot)) {
  for (const entry of fs.readdirSync(releasesRoot, { withFileTypes: true })) {
    if (!entry.isFile() || !/^v\d+\.\d+\.\d+\.md$/.test(entry.name)) {
      continue;
    }

    const tag = entry.name.replace(/\.md$/, "");
    const relativePath = path.posix.join("content", "releases", entry.name);
    if (baseRef && gitObjectExists(`${baseRef}:${relativePath}`)) {
      continue;
    }
    const absolutePath = path.join(releasesRoot, entry.name);
    const source = fs.readFileSync(absolutePath, "utf8");
    const metadata = validateReleaseRecord(relativePath, source, tag, errors);
    if (metadata) {
      releaseMetadataByVersion.set(tag, metadata);
    }
  }
}

if (baseRef) {
  validateChangedDbMigrationEvidenceOwnership(baseRef, releaseMetadataByVersion, errors);
}

if (errors.length > 0) {
  for (const error of errors) {
    console.error(error);
  }
  process.exit(1);
}

console.log("릴리스 기록 검증 통과");

function validateReleaseRecord(relativePath, source, tag, errors) {
  const metadata = readReleaseMetadata(relativePath, source, tag, errors);
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
  return metadata;
}

function readReleaseMetadata(relativePath, source, tag, errors) {
  const metadata = parseReleaseMetadataBlock(source, relativePath, errors);
  if (metadata) {
    validateReleaseMetadata(metadata, relativePath, tag, errors, {
      readArtifact: readWorkingTreeReleaseArtifact,
      listArtifacts: listWorkingTreeReleaseArtifacts,
      requireCurrentSchema: Boolean(baseRef),
    });
    validateBaseDevCheckpointBinding(relativePath, metadata, errors);
  }

  return metadata;
}

function validateChangedDbMigrationEvidenceOwnership(
  baseRef,
  metadataByVersion,
  validationErrors,
) {
  const changedPaths = git([
    "diff",
    "--name-only",
    "--no-renames",
    baseRef,
    "--",
    "content/releases/evidence/db-migrations",
  ]).split("\n").filter(Boolean);
  const untrackedPaths = git([
    "ls-files",
    "--others",
    "--",
    "content/releases/evidence/db-migrations",
  ]).split("\n").filter(Boolean);
  const evidencePaths = [...new Set([...changedPaths, ...untrackedPaths])];
  for (const artifactPath of evidencePaths) {
    if (!dbMigrationEvidencePattern.test(artifactPath)) {
      validationErrors.push(
        `${artifactPath}: DB migration evidence must be stored under a vMAJOR.MINOR.PATCH namespace`,
      );
    }
  }
  const versions = new Set(
    evidencePaths
      .map((artifactPath) => artifactPath.match(dbMigrationEvidencePattern)?.[1] ?? null)
      .filter(Boolean),
  );

  for (const version of versions) {
    const releasePath = `content/releases/${version}.md`;
    if (gitObjectExists(`${baseRef}:${releasePath}`)) {
      validationErrors.push(
        `${releasePath}: a published release cannot receive new untracked or tracked DB migration evidence`,
      );
      continue;
    }
    validateCrossVersionDevPairUniqueness(version, validationErrors);
    const metadata = metadataByVersion.get(version);
    if (metadata) {
      const dbResult = metadata.scopeResults?.["db-migration"];
      if (
        !metadata.releaseScopes?.includes("db-migration") ||
        dbResult?.evidence?.kind !== "canonical"
      ) {
        validationErrors.push(
          `${releasePath}: same-version DB migration artifacts require a canonical db-migration scope in the release record`,
        );
      }
      continue;
    }

    const checkpointRoot = `content/releases/evidence/db-migrations/${version}`;
    const planPath = `${checkpointRoot}/dev/plan.json`;
    const executionPath = `${checkpointRoot}/dev/execution.jsonl`;
    const planSource = readWorkingTreeReleaseArtifact(planPath);
    const executionSource = readWorkingTreeReleaseArtifact(executionPath);
    const context = `${checkpointRoot}: standalone completed dev checkpoint`;
    if (planSource === null || executionSource === null) {
      validationErrors.push(
        `${context} requires both dev/plan.json and dev/execution.jsonl`,
      );
      continue;
    }

    validationErrors.push(
      ...validateMaintenanceDbMigrationEvidence({
        evidence: {
          schema: dbMigrationMaintenanceEvidenceSchema,
          kind: "canonical",
          plan: { path: planPath, sha256: sha256Hex(planSource) },
          execution: { path: executionPath, sha256: sha256Hex(executionSource) },
        },
        version,
        apiSourceRef: null,
        scopeStatus: "pending",
        readArtifact: readWorkingTreeReleaseArtifact,
        listArtifacts: listWorkingTreeReleaseArtifacts,
        context,
      }),
    );
  }
}

function validateCrossVersionDevPairUniqueness(version, validationErrors) {
  const evidenceRoot = "content/releases/evidence/db-migrations/";
  const planPath = `${evidenceRoot}${version}/dev/plan.json`;
  const executionPath = `${evidenceRoot}${version}/dev/execution.jsonl`;
  const planSource = readWorkingTreeReleaseArtifact(planPath);
  const executionSource = readWorkingTreeReleaseArtifact(executionPath);
  if (planSource === null || executionSource === null) {
    return;
  }
  const artifactPaths = listWorkingTreeReleaseArtifacts(evidenceRoot);
  if (artifactPaths === null) {
    validationErrors.push(
      `${evidenceRoot}: DB migration evidence inventory must contain only regular files and directories`,
    );
    return;
  }
  const otherVersions = new Set(
    artifactPaths
      .map((artifactPath) => artifactPath.match(dbMigrationEvidencePattern)?.[1] ?? null)
      .filter((candidate) => candidate && candidate !== version),
  );
  const planSha256 = sha256Hex(planSource);
  const executionSha256 = sha256Hex(executionSource);
  for (const otherVersion of otherVersions) {
    const otherPlan = readWorkingTreeReleaseArtifact(
      `${evidenceRoot}${otherVersion}/dev/plan.json`,
    );
    const otherExecution = readWorkingTreeReleaseArtifact(
      `${evidenceRoot}${otherVersion}/dev/execution.jsonl`,
    );
    if (
      otherPlan !== null &&
      otherExecution !== null &&
      sha256Hex(otherPlan) === planSha256 &&
      sha256Hex(otherExecution) === executionSha256
    ) {
      validationErrors.push(
        `${evidenceRoot}${version}: a new version must be requalified in dev; it cannot reuse the exact ${otherVersion} dev checkpoint pair`,
      );
    }
  }
}

function validateBaseDevCheckpointBinding(relativePath, metadata, validationErrors) {
  if (!baseRef || gitObjectExists(`${baseRef}:${relativePath}`)) {
    return;
  }
  const version = metadata.version;
  if (typeof version !== "string") {
    return;
  }
  const checkpointRoot = `content/releases/evidence/db-migrations/${version}/dev`;
  const hasPlan = gitObjectExists(`${baseRef}:${checkpointRoot}/plan.json`);
  const hasExecution = gitObjectExists(`${baseRef}:${checkpointRoot}/execution.jsonl`);
  if (!hasPlan && !hasExecution) {
    return;
  }
  if (!hasPlan || !hasExecution) {
    validationErrors.push(
      `${relativePath}: base contains an incomplete standalone dev checkpoint for ${version}`,
    );
    return;
  }

  const dbResult = metadata.scopeResults?.["db-migration"];
  if (!metadata.releaseScopes?.includes("db-migration") || !dbResult) {
    validationErrors.push(
      `${relativePath}: release version ${version} is reserved by a standalone dev checkpoint and must include the db-migration scope`,
    );
    return;
  }
  const expectedProdPlanPath =
    `content/releases/evidence/db-migrations/${version}/prod/plan.json`;
  if (
    !["in_progress", "released", "rolled_back"].includes(dbResult.status) ||
    dbResult.evidence?.kind !== "canonical" ||
    dbResult.evidence?.plan?.path !== expectedProdPlanPath
  ) {
    validationErrors.push(
      `${relativePath}: release version ${version} must consume its standalone dev checkpoint through a canonical prod plan root`,
    );
  }
}

function listWorkingTreeReleaseArtifacts(prefix) {
  if (
    typeof prefix !== "string" ||
    !prefix.startsWith("content/releases/evidence/db-migrations/") ||
    !prefix.endsWith("/") ||
    path.posix.normalize(prefix) !== prefix
  ) {
    return null;
  }
  const inspectedRoot = inspectWorkingTreeEvidencePath(prefix.slice(0, -1), "directory");
  if (inspectedRoot.status === "missing") {
    return [];
  }
  if (inspectedRoot.status !== "ok") {
    return null;
  }
  const artifacts = [];
  let invalidEntry = false;
  const visit = (directory) => {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      const absolutePath = path.join(directory, entry.name);
      if (entry.isSymbolicLink()) {
        invalidEntry = true;
      } else if (entry.isDirectory()) {
        visit(absolutePath);
      } else if (entry.isFile()) {
        artifacts.push(path.relative(docsRoot, absolutePath).split(path.sep).join("/"));
      } else {
        invalidEntry = true;
      }
    }
  };
  visit(inspectedRoot.absolutePath);
  return invalidEntry ? null : artifacts.sort();
}

function readWorkingTreeReleaseArtifact(relativePath) {
  if (
    typeof relativePath !== "string" ||
    path.isAbsolute(relativePath) ||
    relativePath.includes("\\") ||
    path.posix.normalize(relativePath) !== relativePath ||
    !relativePath.startsWith("content/releases/evidence/db-migrations/")
  ) {
    return null;
  }
  const inspected = inspectWorkingTreeEvidencePath(relativePath, "file");
  if (inspected.status !== "ok") {
    return null;
  }
  try {
    return fs.readFileSync(inspected.absolutePath);
  } catch {
    return null;
  }
}

function inspectWorkingTreeEvidencePath(relativePath, expectedKind) {
  const evidenceRoot = "content/releases/evidence/db-migrations";
  if (
    typeof relativePath !== "string" ||
    path.isAbsolute(relativePath) ||
    relativePath.includes("\\") ||
    path.posix.normalize(relativePath) !== relativePath ||
    (relativePath !== evidenceRoot && !relativePath.startsWith(`${evidenceRoot}/`))
  ) {
    return { status: "invalid" };
  }

  let absolutePath = path.resolve(docsRoot);
  for (const component of relativePath.split("/")) {
    absolutePath = path.join(absolutePath, component);
    let stat;
    try {
      stat = fs.lstatSync(absolutePath);
    } catch (error) {
      return { status: error?.code === "ENOENT" ? "missing" : "invalid" };
    }
    if (stat.isSymbolicLink()) {
      return { status: "invalid" };
    }
  }

  let stat;
  try {
    stat = fs.lstatSync(absolutePath);
    const realEvidenceRoot = fs.realpathSync(path.resolve(docsRoot, evidenceRoot));
    const realPath = fs.realpathSync(absolutePath);
    if (
      realPath !== realEvidenceRoot &&
      !realPath.startsWith(`${realEvidenceRoot}${path.sep}`)
    ) {
      return { status: "invalid" };
    }
  } catch {
    return { status: "invalid" };
  }
  if (
    (expectedKind === "file" && !stat.isFile()) ||
    (expectedKind === "directory" && !stat.isDirectory())
  ) {
    return { status: "invalid" };
  }
  return { status: "ok", absolutePath };
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
  } else if (
    releaseStatus === "released" &&
    !["released", "violated"].includes(cutoverStatusMatch[1])
  ) {
    errors.push(
      `${relativePath}: released 릴리스의 API contract cutover Gate는 released 또는 violated 상태여야 합니다.`,
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

  for (const { label, metadataPath } of getApiContractCutoverValueFields(
    metadataCutover?.status,
  )) {
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

    for (const descriptor of getVersionMappingFieldDescriptors(metadata.schema, repoName)) {
      const fieldPath = descriptor.path ?? [descriptor.key];
      validateVersionMappingMirrorValue({
        relativePath,
        metadataPath: ["versionMapping", repoName, ...fieldPath],
        metadataValue: getNestedValue(repoMapping, fieldPath),
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
  return status === "released" || status === "violated" || status === "rollback";
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

function resolveBaseRef(argv) {
  let explicitBaseRef = null;

  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === "--base-ref") {
      explicitBaseRef = argv[index + 1];
      if (!explicitBaseRef || explicitBaseRef.startsWith("--")) {
        throw new Error("--base-ref requires a value");
      }
      index += 1;
      continue;
    }
    if (argument.startsWith("--base-ref=")) {
      explicitBaseRef = argument.slice("--base-ref=".length);
      continue;
    }
    throw new Error(`Unknown argument: ${argument}`);
  }

  const requestedBaseRef =
    explicitBaseRef ||
    process.env.DOCUMENT_LIFECYCLE_BASE_REF?.trim() ||
    null;
  if (requestedBaseRef) {
    if (!gitCommitExists(requestedBaseRef)) {
      throw new Error(`release record base ref is not a commit: ${requestedBaseRef}`);
    }
    return requestedBaseRef;
  }

  for (const candidate of ["origin/main", "main"]) {
    if (!gitCommitExists(candidate)) {
      continue;
    }
    if (!gitCommitExists("HEAD")) {
      return candidate;
    }
    return git(["merge-base", "HEAD", candidate]) || candidate;
  }

  return null;
}

function validatePublishedReleaseImmutability(baseRef, validationErrors) {
  const changedPaths = git([
    "diff",
    "--name-only",
    "--no-renames",
    baseRef,
    "--",
    "content/releases",
  ]).split("\n").filter(Boolean);

  for (const releasePath of changedPaths) {
    if (
      releaseRecordPattern.test(releasePath) &&
      gitObjectExists(`${baseRef}:${releasePath}`)
    ) {
      validationErrors.push(
        `${releasePath}: a release record already present in the base ref is final and immutable; it cannot be modified, deleted, renamed, or replaced`,
      );
    }
    const evidenceMatch = releasePath.match(dbMigrationEvidencePattern);
    if (!evidenceMatch) {
      continue;
    }
    const publishedRecordPath = `content/releases/${evidenceMatch[1]}.md`;
    if (
      gitObjectExists(`${baseRef}:${releasePath}`) ||
      gitObjectExists(`${baseRef}:${publishedRecordPath}`)
    ) {
      validationErrors.push(
        `${releasePath}: DB migration evidence already present in the base ref, or owned by a release record there, is final and immutable; it cannot be added, modified, deleted, renamed, or replaced`,
      );
    }
  }
}

function gitCommitExists(ref) {
  try {
    execFileSync("git", ["rev-parse", "--verify", `${ref}^{commit}`], {
      cwd: docsRoot,
      stdio: "ignore",
    });
    return true;
  } catch {
    return false;
  }
}

function gitObjectExists(objectName) {
  try {
    execFileSync("git", ["cat-file", "-e", objectName], {
      cwd: docsRoot,
      stdio: "ignore",
    });
    return true;
  } catch {
    return false;
  }
}

function git(args) {
  return execFileSync("git", args, {
    cwd: docsRoot,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  }).trim();
}
