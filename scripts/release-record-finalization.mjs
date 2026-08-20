import { parseReleaseMetadataBlock } from "./release-record-metadata.mjs";

const mirrorFields = Object.freeze([
  { section: "릴리스 상태", prefix: "- 전체 상태:", baseCount: 1, currentCount: 1 },
  { section: "릴리스 상태", prefix: "- 완료 범위:", baseCount: 1, currentCount: 1 },
  { section: "릴리스 상태", prefix: "- 대기 범위:", baseCount: 1, currentCount: 1 },
  { section: "릴리스 결과", prefix: "- 현재 결과:", baseCount: 1, currentCount: 1 },
  { section: "릴리스 결과", prefix: "- 기록 복구:", baseCount: 0, currentCount: 1 },
  { section: "후속 작업", prefix: "- 남은 범위:", baseCount: 1, currentCount: 1 },
]);

export function isAllowedPublishedReleaseFinalization({
  releasePath,
  baseSource,
  currentSource,
}) {
  const baseErrors = [];
  const currentErrors = [];
  const baseMetadata = parseReleaseMetadataBlock(
    baseSource,
    `${releasePath} at base`,
    baseErrors,
  );
  const currentMetadata = parseReleaseMetadataBlock(
    currentSource,
    releasePath,
    currentErrors,
  );

  if (
    baseErrors.length > 0 ||
    currentErrors.length > 0 ||
    !baseMetadata ||
    !currentMetadata
  ) {
    return false;
  }

  const baseDocsResult = baseMetadata.scopeResults?.docs;
  const currentDocsResult = currentMetadata.scopeResults?.docs;
  const nonDocsScopes = Array.isArray(baseMetadata.releaseScopes)
    ? baseMetadata.releaseScopes.filter((scopeName) => scopeName !== "docs")
    : [];

  if (
    baseMetadata.status !== "pending" ||
    currentMetadata.status !== "released" ||
    baseDocsResult?.status !== "pending" ||
    currentDocsResult?.status !== "released" ||
    nonDocsScopes.some(
      (scopeName) => baseMetadata.scopeResults?.[scopeName]?.status !== "released",
    )
  ) {
    return false;
  }

  const expectedMetadata = JSON.parse(JSON.stringify(baseMetadata));
  expectedMetadata.status = "released";
  expectedMetadata.scopeResults.docs.status = "released";
  expectedMetadata.scopeResults.docs.summary = currentDocsResult.summary;

  const baseMetadataJson = extractReleaseMetadataJson(baseSource);
  const currentMetadataJson = extractReleaseMetadataJson(currentSource);
  if (
    baseMetadataJson === null ||
    currentMetadataJson === null ||
    maskAllowedMetadataValues(baseMetadataJson) !==
      maskAllowedMetadataValues(currentMetadataJson) ||
    JSON.stringify(currentMetadata) !== JSON.stringify(expectedMetadata)
  ) {
    return false;
  }

  const baseCounts = countPublishedReleaseMirrorFields(baseSource);
  const currentCounts = countPublishedReleaseMirrorFields(currentSource);
  if (mirrorFields.some((field) =>
    baseCounts.get(mirrorFieldKey(field)) !== field.baseCount ||
    currentCounts.get(mirrorFieldKey(field)) !== field.currentCount
  )) {
    return false;
  }

  const normalizedBase = normalizePublishedReleaseFinalizationSource(baseSource);
  const normalizedCurrent = normalizePublishedReleaseFinalizationSource(currentSource);
  return normalizedBase !== null && normalizedBase === normalizedCurrent;
}

function extractReleaseMetadataJson(source) {
  return source.match(/^```release-metadata\s*\n([\s\S]*?)\n```$/m)?.[1] ?? null;
}

function maskAllowedMetadataValues(source) {
  const targetPaths = new Set([
    "status",
    "scopeResults.docs.status",
    "scopeResults.docs.summary",
  ]);
  const ranges = [];
  let cursor = 0;

  function skipWhitespace() {
    while (/\s/.test(source[cursor] ?? "")) {
      cursor += 1;
    }
  }

  function parseString() {
    const start = cursor;
    cursor += 1;
    while (cursor < source.length) {
      if (source[cursor] === "\\") {
        cursor += 2;
      } else if (source[cursor] === '"') {
        cursor += 1;
        return JSON.parse(source.slice(start, cursor));
      } else {
        cursor += 1;
      }
    }
    throw new Error("unterminated JSON string");
  }

  function parseValue(path) {
    skipWhitespace();
    const start = cursor;
    if (source[cursor] === "{") {
      parseObject(path);
    } else if (source[cursor] === "[") {
      parseArray(path);
    } else if (source[cursor] === '"') {
      parseString();
    } else {
      while (cursor < source.length && !/[\s,}\]]/.test(source[cursor])) {
        cursor += 1;
      }
    }
    if (targetPaths.has(path.join("."))) {
      ranges.push([start, cursor]);
    }
  }

  function parseObject(path) {
    cursor += 1;
    skipWhitespace();
    if (source[cursor] === "}") {
      cursor += 1;
      return;
    }
    while (cursor < source.length) {
      skipWhitespace();
      const key = parseString();
      skipWhitespace();
      if (source[cursor] !== ":") {
        throw new Error("expected JSON object colon");
      }
      cursor += 1;
      parseValue([...path, key]);
      skipWhitespace();
      if (source[cursor] === "}") {
        cursor += 1;
        return;
      }
      if (source[cursor] !== ",") {
        throw new Error("expected JSON object delimiter");
      }
      cursor += 1;
    }
    throw new Error("unterminated JSON object");
  }

  function parseArray(path) {
    cursor += 1;
    skipWhitespace();
    if (source[cursor] === "]") {
      cursor += 1;
      return;
    }
    let index = 0;
    while (cursor < source.length) {
      parseValue([...path, String(index)]);
      index += 1;
      skipWhitespace();
      if (source[cursor] === "]") {
        cursor += 1;
        return;
      }
      if (source[cursor] !== ",") {
        throw new Error("expected JSON array delimiter");
      }
      cursor += 1;
    }
    throw new Error("unterminated JSON array");
  }

  try {
    parseValue([]);
    skipWhitespace();
    if (cursor !== source.length || ranges.length !== targetPaths.size) {
      return null;
    }
  } catch {
    return null;
  }

  let masked = source;
  for (const [start, end] of ranges.sort((left, right) => right[0] - left[0])) {
    masked = `${masked.slice(0, start)}"<DOCS_FINALIZATION>"${masked.slice(end)}`;
  }
  return masked;
}

function countPublishedReleaseMirrorFields(source) {
  const counts = new Map(mirrorFields.map((field) => [mirrorFieldKey(field), 0]));
  let sectionTitle = null;

  for (const line of source.split("\n")) {
    if (line.startsWith("## ")) {
      sectionTitle = line.slice(3);
      continue;
    }
    for (const field of mirrorFields) {
      if (field.section === sectionTitle && line.startsWith(field.prefix)) {
        const key = mirrorFieldKey(field);
        counts.set(key, counts.get(key) + 1);
      }
    }
  }

  return counts;
}

function mirrorFieldKey(field) {
  return `${field.section}\u0000${field.prefix}`;
}

function normalizePublishedReleaseFinalizationSource(source) {
  const metadataPattern = /^```release-metadata\s*\n[\s\S]*?\n```$/m;
  if (!metadataPattern.test(source)) {
    return null;
  }

  const normalized = source.replace(
    metadataPattern,
    "```release-metadata\n<PUBLISHED_DOCS_FINALIZATION>\n```",
  );
  const allowedPrefixesBySection = new Map();
  for (const field of mirrorFields) {
    const prefixes = allowedPrefixesBySection.get(field.section) ?? [];
    prefixes.push(field.prefix);
    allowedPrefixesBySection.set(field.section, prefixes);
  }
  const lines = normalized.split("\n");
  const kept = [];
  let sectionTitle = null;

  for (let index = 0; index < lines.length; index += 1) {
    if (lines[index].startsWith("## ")) {
      sectionTitle = lines[index].slice(3);
      kept.push(lines[index]);
      continue;
    }
    const allowedPrefixes = allowedPrefixesBySection.get(sectionTitle) ?? [];
    if (!allowedPrefixes.some((prefix) => lines[index].startsWith(prefix))) {
      kept.push(lines[index]);
      continue;
    }
    while (index + 1 < lines.length && /^[ \t]+\S/.test(lines[index + 1])) {
      index += 1;
    }
  }

  return kept.join("\n");
}
