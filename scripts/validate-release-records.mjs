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
import { isAllowedPublishedReleaseFinalization } from "./release-record-finalization.mjs";
import {
  extractHeadingSection,
  extractRepoNames,
  extractSection,
  parseScopeFields,
  setsAreEqual,
} from "./release-record-parser.mjs";
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
const publishedReleaseFinalizationPaths = new Set();
let baseRef = null;
try {
  baseRef = resolveBaseRef(process.argv.slice(2));
} catch (error) {
  errors.push(error.message);
}

if (baseRef) {
  validatePublishedReleaseImmutability(
    baseRef,
    errors,
    publishedReleaseFinalizationPaths,
  );
}

if (fs.existsSync(releasesRoot)) {
  for (const entry of fs.readdirSync(releasesRoot, { withFileTypes: true })) {
    if (!entry.isFile() || !/^v\d+\.\d+\.\d+\.md$/.test(entry.name)) {
      continue;
    }

    const tag = entry.name.replace(/\.md$/, "");
    const relativePath = path.posix.join("content", "releases", entry.name);
    if (
      baseRef &&
      gitObjectExists(`${baseRef}:${relativePath}`) &&
      !publishedReleaseFinalizationPaths.has(relativePath)
    ) {
      continue;
    }
    const absolutePath = path.join(releasesRoot, entry.name);
    const source = fs.readFileSync(absolutePath, "utf8");
    validateReleaseRecord(relativePath, source, tag, errors);
  }
}

if (baseRef) {
  validateNoNewDbMigrationEvidence(baseRef, errors);
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
      requireCurrentSchema: Boolean(baseRef),
    });
  }

  return metadata;
}

function validateNoNewDbMigrationEvidence(baseRef, validationErrors) {
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
  for (const artifactPath of new Set([...changedPaths, ...untrackedPaths])) {
    if (!gitObjectExists(`${baseRef}:${artifactPath}`)) {
      validationErrors.push(
        `${artifactPath}: new DB migration evidence artifacts are not allowed; use the migration source commit and existing application history`,
      );
    }
  }
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

function validatePublishedReleaseImmutability(
  baseRef,
  validationErrors,
  finalizationPaths,
) {
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
      const currentPath = path.join(docsRoot, releasePath);
      const baseSource = git(["show", `${baseRef}:${releasePath}`]);
      const currentSource = fs.existsSync(currentPath)
        ? fs.readFileSync(currentPath, "utf8").trim()
        : null;

      if (
        currentSource &&
        isAllowedPublishedReleaseFinalization({
          releasePath,
          baseSource,
          currentSource,
        })
      ) {
        finalizationPaths.add(releasePath);
      } else {
        validationErrors.push(
          `${releasePath}: a release record already present in the base ref is final and immutable; only a fail-closed pending docs finalization may modify it`,
        );
      }
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
