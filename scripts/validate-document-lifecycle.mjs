import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

import MarkdownIt from "markdown-it";

const markdownParser = new MarkdownIt({ html: true });
const registryFile = "document-lifecycle-registry.json";
const allowedRoutingModes = new Set(["closure", "core", "direct", "historical"]);
const documentKeys = new Set([
  "coreOrder",
  "id",
  "lifecycle",
  "noReplacementReason",
  "path",
  "previousPaths",
  "replacementId",
  "requiredHeadings",
  "retiredAt",
  "retirementReason",
  "routing",
]);
const routeKeys = new Set([
  "id",
  "lifecycle",
  "noReplacementReason",
  "replacementId",
  "retiredAt",
  "retirementReason",
  "signal",
  "targets",
  "targetSource",
]);
const registryKeys = new Set(["documents", "routes", "schemaVersion"]);
const ignoredContentPaths = new Set(["AGENTS.md", "CLAUDE.md", "README.md"]);

export function validateDocumentLifecycle({ documents, previousRegistry, registry }) {
  const errors = [];
  validateRegistryShape(registry, errors);
  if (!isRegistryShapeUsable(registry)) {
    return errors;
  }

  const registryDocuments = registry.documents;
  const registryRoutes = registry.routes;
  validateRegistryDocuments(registryDocuments, errors);
  validateRegistryRoutes(registryRoutes, registryDocuments, errors);
  validateCurrentDocumentCoverage(documents, registryDocuments, errors);
  validateRequiredHeadings(documents, registryDocuments, errors);

  if (previousRegistry !== undefined) {
    validateRegistryTransition(previousRegistry, registry, errors);
  }

  return errors;
}

function validateRegistryShape(registry, errors) {
  if (!isPlainObject(registry)) {
    errors.push("document lifecycle registry는 object여야 합니다.");
    return;
  }
  validateExactKeys(registry, registryKeys, "document lifecycle registry", errors);
  if (registry.schemaVersion !== 1) {
    errors.push("document lifecycle registry schemaVersion은 1이어야 합니다.");
  }
  if (!Array.isArray(registry.documents)) {
    errors.push("document lifecycle registry documents는 배열이어야 합니다.");
  }
  if (!Array.isArray(registry.routes)) {
    errors.push("document lifecycle registry routes는 배열이어야 합니다.");
  }
}

function isRegistryShapeUsable(registry) {
  return (
    isPlainObject(registry) &&
    registry.schemaVersion === 1 &&
    Array.isArray(registry.documents) &&
    Array.isArray(registry.routes)
  );
}

function validateRegistryDocuments(entries, errors) {
  const ids = new Set();
  const paths = new Set();
  const activeCoreOrders = [];

  for (const [index, entry] of entries.entries()) {
    const context = `document lifecycle documents[${index}]`;
    if (!isPlainObject(entry)) {
      errors.push(`${context}는 object여야 합니다.`);
      continue;
    }
    validateExactKeys(entry, documentKeys, context, errors);
    validateIdentifier(entry.id, `${context}.id`, errors);
    validateUnique(ids, entry.id, "중복 lifecycle ID", errors);
    validateDocumentPath(entry.path, `${context}.path`, errors);
    validateUnique(paths, entry.path, "중복 lifecycle path", errors);

    if (!allowedRoutingModes.has(entry.routing)) {
      errors.push(`${context}.routing 값이 허용되지 않습니다: ${entry.routing}`);
    }
    if (entry.path?.startsWith("releases/") !== (entry.routing === "historical")) {
      errors.push(`${context}: releases 문서와 historical routing 분류가 일치해야 합니다.`);
    }

    validatePreviousPaths(entry, context, paths, errors);
    validateRequiredHeadingDescriptors(entry.requiredHeadings, context, errors);

    if (entry.lifecycle === "active") {
      validateActiveEntry(entry, context, activeCoreOrders, errors);
    } else if (entry.lifecycle === "retired") {
      validateRetiredEntry(entry, context, errors);
    } else {
      errors.push(`${context}.lifecycle 값은 active 또는 retired여야 합니다.`);
    }
  }

  activeCoreOrders.sort((a, b) => a - b);
  if (!sameArray(activeCoreOrders, [1, 2, 3, 4])) {
    errors.push("active Core 문서는 coreOrder 1~4를 정확히 한 번씩 가져야 합니다.");
  }
  validateReplacementTargets(entries, "lifecycle", errors);
}

function validateActiveEntry(entry, context, activeCoreOrders, errors) {
  for (const key of [
    "noReplacementReason",
    "replacementId",
    "retiredAt",
    "retirementReason",
  ]) {
    if (key in entry) {
      errors.push(`${context}: active 항목에는 ${key}를 둘 수 없습니다.`);
    }
  }

  if (entry.routing === "core") {
    if (!Number.isInteger(entry.coreOrder)) {
      errors.push(`${context}: Core 문서는 정수 coreOrder가 필요합니다.`);
    } else {
      activeCoreOrders.push(entry.coreOrder);
    }
  } else if ("coreOrder" in entry) {
    errors.push(`${context}: core가 아닌 문서에는 coreOrder를 둘 수 없습니다.`);
  }
}

function validateRetiredEntry(entry, context, errors) {
  if (entry.routing === "core" && !Number.isInteger(entry.coreOrder)) {
    errors.push(`${context}: retired Core 항목도 마지막 coreOrder를 보존해야 합니다.`);
  }
  if (entry.routing !== "core" && "coreOrder" in entry) {
    errors.push(`${context}: core가 아닌 retired 항목에는 coreOrder를 둘 수 없습니다.`);
  }
  if (!isIsoDate(entry.retiredAt)) {
    errors.push(`${context}: retiredAt은 YYYY-MM-DD 형식이어야 합니다.`);
  }
  requireReason(entry.retirementReason, `${context}.retirementReason`, errors);
  validateReplacementEvidence(entry, context, errors);
}

function validatePreviousPaths(entry, context, paths, errors) {
  if (entry.previousPaths === undefined) {
    return;
  }
  if (!Array.isArray(entry.previousPaths) || entry.previousPaths.length === 0) {
    errors.push(`${context}.previousPaths는 비어 있지 않은 배열이어야 합니다.`);
    return;
  }
  const localPaths = new Set();
  for (const previousPath of entry.previousPaths) {
    validateDocumentPath(previousPath, `${context}.previousPaths`, errors);
    validateUnique(localPaths, previousPath, `${context}.previousPaths 중복`, errors);
    if (previousPath === entry.path) {
      errors.push(`${context}.previousPaths에 현재 path를 둘 수 없습니다.`);
    }
    validateUnique(paths, previousPath, "다른 lifecycle 문서가 사용하는 과거 path", errors);
  }
}

function validateRequiredHeadingDescriptors(headings, context, errors) {
  if (headings === undefined) {
    return;
  }
  if (!Array.isArray(headings) || headings.length === 0) {
    errors.push(`${context}.requiredHeadings는 비어 있지 않은 배열이어야 합니다.`);
    return;
  }
  const seen = new Set();
  for (const [index, heading] of headings.entries()) {
    const headingContext = `${context}.requiredHeadings[${index}]`;
    if (!isPlainObject(heading)) {
      errors.push(`${headingContext}는 object여야 합니다.`);
      continue;
    }
    validateExactKeys(heading, new Set(["level", "title"]), headingContext, errors);
    if (!Number.isInteger(heading.level) || heading.level < 1 || heading.level > 6) {
      errors.push(`${headingContext}.level은 1~6 정수여야 합니다.`);
    }
    if (typeof heading.title !== "string" || heading.title.trim() === "") {
      errors.push(`${headingContext}.title은 비어 있지 않은 문자열이어야 합니다.`);
    }
    validateUnique(seen, `${heading.level}:${heading.title}`, `${context}.requiredHeadings 중복`, errors);
  }
}

function validateRegistryRoutes(routes, documentEntries, errors) {
  const routeIds = new Set();
  const activeSignals = new Set();
  const documentsById = new Map(documentEntries.map((entry) => [entry.id, entry]));
  const activeTargetIds = new Set();

  for (const [index, route] of routes.entries()) {
    const context = `document lifecycle routes[${index}]`;
    if (!isPlainObject(route)) {
      errors.push(`${context}는 object여야 합니다.`);
      continue;
    }
    validateExactKeys(route, routeKeys, context, errors);
    validateIdentifier(route.id, `${context}.id`, errors);
    validateUnique(routeIds, route.id, "중복 route ID", errors);
    if (typeof route.signal !== "string" || route.signal.trim() === "") {
      errors.push(`${context}.signal은 비어 있지 않은 문자열이어야 합니다.`);
    }

    if (route.lifecycle === "active") {
      validateUnique(activeSignals, route.signal, "중복 active route signal", errors);
      validateActiveRoute(route, context, documentsById, activeTargetIds, errors);
    } else if (route.lifecycle === "retired") {
      validateRetiredRoute(route, context, documentsById, errors);
    } else {
      errors.push(`${context}.lifecycle 값은 active 또는 retired여야 합니다.`);
    }
  }

  for (const entry of documentEntries) {
    if (
      entry.lifecycle === "active" &&
      entry.routing === "direct" &&
      !activeTargetIds.has(entry.id)
    ) {
      errors.push(`${entry.id}: direct routing 문서가 active route에서 참조되지 않습니다.`);
    }
  }
  validateReplacementTargets(routes, "route", errors);
}

function validateActiveRoute(route, context, documentsById, activeTargetIds, errors) {
  for (const key of [
    "noReplacementReason",
    "replacementId",
    "retiredAt",
    "retirementReason",
  ]) {
    if (key in route) {
      errors.push(`${context}: active route에는 ${key}를 둘 수 없습니다.`);
    }
  }
  if (typeof route.targetSource !== "string" || route.targetSource.trim() === "") {
    errors.push(`${context}.targetSource는 비어 있지 않은 문자열이어야 합니다.`);
  }
  if (!Array.isArray(route.targets) || route.targets.length === 0) {
    errors.push(`${context}.targets는 비어 있지 않은 배열이어야 합니다.`);
    return;
  }

  const targetIds = new Set();
  const targetPaths = [];
  for (const targetId of route.targets) {
    validateIdentifier(targetId, `${context}.targets`, errors);
    validateUnique(targetIds, targetId, `${context}.targets 중복`, errors);
    const target = documentsById.get(targetId);
    if (!target || target.lifecycle !== "active") {
      errors.push(`${context}: active target 문서가 없습니다: ${targetId}`);
      continue;
    }
    if (!new Set(["core", "direct"]).has(target.routing)) {
      errors.push(`${context}: route target은 core 또는 direct 문서여야 합니다: ${targetId}`);
    }
    activeTargetIds.add(targetId);
    targetPaths.push(target.path);
  }

  const sourcePaths = [...(route.targetSource ?? "").matchAll(/`(content\/[^`]+\.md)`/g)].map(
    (match) => match[1].replace(/^content\//, ""),
  );
  if (!sameArray(sourcePaths, targetPaths)) {
    errors.push(`${context}: targetSource의 문서 경로와 targets 순서가 일치하지 않습니다.`);
  }
}

function validateRetiredRoute(route, context, documentsById, errors) {
  if (!isIsoDate(route.retiredAt)) {
    errors.push(`${context}: retiredAt은 YYYY-MM-DD 형식이어야 합니다.`);
  }
  requireReason(route.retirementReason, `${context}.retirementReason`, errors);
  validateReplacementEvidence(route, context, errors);
  if (typeof route.targetSource !== "string" || route.targetSource.trim() === "") {
    errors.push(`${context}: retired route도 마지막 targetSource를 보존해야 합니다.`);
  }
  if (!Array.isArray(route.targets) || route.targets.length === 0) {
    errors.push(`${context}: retired route도 마지막 targets를 보존해야 합니다.`);
  } else {
    for (const targetId of route.targets) {
      if (!documentsById.has(targetId)) {
        errors.push(`${context}: retired route target ID가 registry에 없습니다: ${targetId}`);
      }
    }
  }
}

function validateReplacementEvidence(entry, context, errors) {
  const hasReplacement = typeof entry.replacementId === "string";
  const hasNoReplacement = typeof entry.noReplacementReason === "string";
  if (hasReplacement === hasNoReplacement) {
    errors.push(`${context}: replacementId와 noReplacementReason 중 정확히 하나가 필요합니다.`);
  }
  if (hasReplacement) {
    validateIdentifier(entry.replacementId, `${context}.replacementId`, errors);
    if (entry.replacementId === entry.id) {
      errors.push(`${context}: 자기 자신을 replacementId로 사용할 수 없습니다.`);
    }
  }
  if (hasNoReplacement) {
    requireReason(entry.noReplacementReason, `${context}.noReplacementReason`, errors);
  }
}

function validateReplacementTargets(entries, label, errors) {
  const activeIds = new Set(
    entries.filter((entry) => entry.lifecycle === "active").map((entry) => entry.id),
  );
  for (const entry of entries) {
    if (
      entry.lifecycle === "retired" &&
      entry.replacementId !== undefined &&
      !activeIds.has(entry.replacementId)
    ) {
      errors.push(`${entry.id}: replacementId가 active ${label} ID가 아닙니다: ${entry.replacementId}`);
    }
  }
}

function validateCurrentDocumentCoverage(documents, entries, errors) {
  const activeEntries = entries.filter((entry) => entry.lifecycle === "active");
  const retiredEntries = entries.filter((entry) => entry.lifecycle === "retired");
  const activeByPath = new Map(activeEntries.map((entry) => [entry.path, entry]));
  const documentPaths = new Set();

  for (const document of documents) {
    if (documentPaths.has(document.path)) {
      errors.push(`중복 current document path가 있습니다: ${document.path}`);
    }
    documentPaths.add(document.path);
    if (!activeByPath.has(document.path)) {
      errors.push(`${document.path}: lifecycle registry에 active 항목이 없습니다.`);
    }
  }

  for (const entry of activeEntries) {
    if (!documentPaths.has(entry.path)) {
      errors.push(`${entry.path}: active lifecycle 문서가 존재하지 않습니다.`);
    }
  }
  for (const entry of retiredEntries) {
    if (documentPaths.has(entry.path)) {
      errors.push(`${entry.path}: retired lifecycle path를 active 문서가 재사용할 수 없습니다.`);
    }
  }
}

function validateRequiredHeadings(documents, entries, errors) {
  const sourcesByPath = new Map(documents.map((document) => [document.path, document.source]));
  for (const entry of entries) {
    if (entry.lifecycle !== "active" || !entry.requiredHeadings) {
      continue;
    }
    const source = sourcesByPath.get(entry.path);
    if (source === undefined) {
      continue;
    }
    const actualHeadings = parseMarkdownHeadings(source);
    for (const requiredHeading of entry.requiredHeadings) {
      if (
        !actualHeadings.some(
          (heading) =>
            heading.level === requiredHeading.level && heading.title === requiredHeading.title,
        )
      ) {
        errors.push(
          `${entry.path}: lifecycle registry 필수 heading이 없습니다: ${requiredHeading.title}`,
        );
      }
    }
  }
}

function validateRegistryTransition(previousRegistry, currentRegistry, errors) {
  if (!isRegistryShapeUsable(previousRegistry)) {
    errors.push("base document lifecycle registry 형식이 유효하지 않습니다.");
    return;
  }
  validateEntryTransition(
    previousRegistry.documents,
    currentRegistry.documents,
    "lifecycle",
    { documentEntries: true },
    errors,
  );
  validateEntryTransition(
    previousRegistry.routes,
    currentRegistry.routes,
    "route",
    { routeEntries: true },
    errors,
  );
}

function validateEntryTransition(previousEntries, currentEntries, label, options, errors) {
  const currentById = new Map(currentEntries.map((entry) => [entry.id, entry]));
  for (const previous of previousEntries) {
    const current = currentById.get(previous.id);
    if (!current) {
      errors.push(`기존 ${label} ID를 삭제할 수 없습니다: ${previous.id}`);
      continue;
    }
    if (previous.lifecycle === "retired" && current.lifecycle !== "retired") {
      errors.push(`retired ${label} ID를 다시 활성화할 수 없습니다: ${previous.id}`);
    }
    if (previous.lifecycle === "retired" && current.lifecycle === "retired") {
      if (stableStringify(previous) !== stableStringify(current)) {
        errors.push(`retired ${label} tombstone은 변경할 수 없습니다: ${previous.id}`);
      }
      continue;
    }
    if (current.lifecycle === "retired" && current.path !== undefined && current.path !== previous.path) {
      errors.push(`retired ${label}은 마지막 path를 보존해야 합니다: ${previous.id}`);
    }
    if (previous.lifecycle === "active" && current.lifecycle === "retired") {
      if (options.routeEntries) {
        if (previous.signal !== current.signal) {
          errors.push(`${previous.id}: retired route는 마지막 signal을 보존해야 합니다.`);
        }
        if (previous.targetSource !== current.targetSource) {
          errors.push(`${previous.id}: retired route는 마지막 targetSource를 보존해야 합니다.`);
        }
        if (!sameArray(previous.targets ?? [], current.targets ?? [])) {
          errors.push(`${previous.id}: retired route는 마지막 targets를 보존해야 합니다.`);
        }
      }
      if (options.documentEntries) {
        if (previous.routing !== current.routing) {
          errors.push(`${previous.id}: retired lifecycle은 마지막 routing 분류를 보존해야 합니다.`);
        }
        if (previous.coreOrder !== current.coreOrder) {
          errors.push(`${previous.id}: retired Core lifecycle은 마지막 coreOrder를 보존해야 합니다.`);
        }
        for (const heading of previous.requiredHeadings ?? []) {
          if (
            !(current.requiredHeadings ?? []).some(
              (candidate) =>
                candidate.level === heading.level && candidate.title === heading.title,
            )
          ) {
            errors.push(
              `${previous.id}: retired lifecycle은 requiredHeading을 보존해야 합니다: ${heading.title}`,
            );
          }
        }
      }
    }
    if (previous.path !== undefined && current.lifecycle === "active" && current.path !== previous.path) {
      const previousPaths = current.previousPaths ?? [];
      if (!previousPaths.includes(previous.path)) {
        errors.push(`${previous.id}: rename 전 path를 previousPaths에 보존해야 합니다.`);
      }
    }
    for (const previousPath of previous.previousPaths ?? []) {
      if (!(current.previousPaths ?? []).includes(previousPath)) {
        errors.push(`${previous.id}: 기존 previousPaths를 제거할 수 없습니다: ${previousPath}`);
      }
    }
    if (previous.lifecycle === "active" && current.lifecycle === "active") {
      if (options.routeEntries && previous.signal !== current.signal) {
        errors.push(`${previous.id}: active route signal은 변경할 수 없습니다. retire/replacement를 사용하세요.`);
      }
      if (options.routeEntries && previous.targetSource !== current.targetSource) {
        errors.push(`${previous.id}: active route targetSource는 변경할 수 없습니다. retire/replacement를 사용하세요.`);
      }
      if (
        options.routeEntries &&
        !sameArray(previous.targets ?? [], current.targets ?? [])
      ) {
        errors.push(`${previous.id}: active route targets는 변경할 수 없습니다. retire/replacement를 사용하세요.`);
      }
      if (options.documentEntries) {
        if (previous.routing !== current.routing) {
          errors.push(`${previous.id}: active routing 분류는 변경할 수 없습니다. retire/replacement를 사용하세요.`);
        }
        if (previous.coreOrder !== current.coreOrder) {
          errors.push(`${previous.id}: active coreOrder는 변경할 수 없습니다. retire/replacement를 사용하세요.`);
        }
        for (const heading of previous.requiredHeadings ?? []) {
          if (
            !(current.requiredHeadings ?? []).some(
              (candidate) =>
                candidate.level === heading.level && candidate.title === heading.title,
            )
          ) {
            errors.push(
              `${previous.id}: 기존 requiredHeading을 제거할 수 없습니다: ${heading.title}`,
            );
          }
        }
      }
    }
  }
}

function validateExactKeys(value, allowedKeys, context, errors) {
  for (const key of Object.keys(value)) {
    if (!allowedKeys.has(key)) {
      errors.push(`${context}: 알 수 없는 key입니다: ${key}`);
    }
  }
  for (const key of allowedKeys) {
    if (new Set(["documents", "routes", "schemaVersion"]).has(key) && !(key in value)) {
      errors.push(`${context}: 필수 key가 없습니다: ${key}`);
    }
  }
}

function validateIdentifier(value, context, errors) {
  if (typeof value !== "string" || !/^[a-z0-9]+(?:[.-][a-z0-9]+)*$/.test(value)) {
    errors.push(`${context}는 안정적인 lowercase ID 형식이어야 합니다.`);
  }
}

function validateDocumentPath(value, context, errors) {
  if (
    typeof value !== "string" ||
    !value.endsWith(".md") ||
    value.startsWith("/") ||
    value.startsWith("content/") ||
    value.split("/").includes("..")
  ) {
    errors.push(`${context}는 content 기준 상대 Markdown 경로여야 합니다.`);
  }
}

function validateUnique(seen, value, context, errors) {
  if (seen.has(value)) {
    errors.push(`${context}: ${value}`);
  }
  seen.add(value);
}

function requireReason(value, context, errors) {
  if (
    typeof value !== "string" ||
    value.trim().length < 10 ||
    /^(?:tbd|todo|n\/?a|없음|미정|-|<.*>)$/i.test(value.trim())
  ) {
    errors.push(`${context}은 10자 이상의 구체적 사유여야 합니다.`);
  }
}

function isIsoDate(value) {
  const match = typeof value === "string" && value.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) {
    return false;
  }
  const [, year, month, day] = match.map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return (
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day
  );
}

function parseMarkdownHeadings(source) {
  const tokens = markdownParser.parse(source, {});
  return tokens.flatMap((token, index) => {
    if (token.type !== "heading_open" || token.level !== 0) {
      return [];
    }
    const inlineToken = tokens[index + 1];
    return [
      {
        level: Number(token.tag.slice(1)),
        title: inlineToken?.type === "inline" ? inlineToken.content : "",
      },
    ];
  });
}

function isPlainObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function stableStringify(value) {
  if (Array.isArray(value)) {
    return `[${value.map(stableStringify).join(",")}]`;
  }
  if (isPlainObject(value)) {
    return `{${Object.keys(value)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${stableStringify(value[key])}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
}

function sameArray(actual, expected) {
  return actual.length === expected.length && actual.every((value, index) => value === expected[index]);
}

function readCurrentDocuments(docsRoot) {
  const contentRoot = path.join(docsRoot, "content");
  const markdownPaths = [];
  walkMarkdownFiles(contentRoot, markdownPaths);
  return markdownPaths
    .map((absolutePath) => ({
      absolutePath,
      path: path.relative(contentRoot, absolutePath),
    }))
    .filter(
      (document) =>
        !ignoredContentPaths.has(document.path) && !document.path.startsWith(`templates${path.sep}`),
    )
    .map((document) => {
      const source = fs.readFileSync(document.absolutePath, "utf8");
      const metadata = source.match(
        /## 문서 역할\s*\n\s*\n- 역할: `([^`]+)`\n- 문서 종류: `([^`]+)`\n- 충돌 시 우선 문서: .+\n- 기준 성격: `([^`]+)`/,
      );
      return {
        kind: metadata?.[2] ?? "unknown",
        path: document.path,
        role: metadata?.[1] ?? "unknown",
        source,
        status: metadata?.[3] ?? "unknown",
      };
    });
}

function walkMarkdownFiles(directory, results) {
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const absolutePath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      walkMarkdownFiles(absolutePath, results);
    } else if (entry.isFile() && entry.name.endsWith(".md")) {
      results.push(absolutePath);
    }
  }
}

function readBaseRegistry(docsRoot, baseRef) {
  const result = spawnSync("git", ["show", `${baseRef}:${registryFile}`], {
    cwd: docsRoot,
    encoding: "utf8",
  });
  if (result.status === 0) {
    return JSON.parse(result.stdout);
  }
  if (/does not exist|exists on disk, but not in/.test(result.stderr)) {
    return undefined;
  }
  throw new Error(result.stderr.trim() || `base registry를 읽을 수 없습니다: ${baseRef}`);
}

function findDefaultBaseRef(docsRoot) {
  const branchResult = spawnSync("git", ["symbolic-ref", "--quiet", "--short", "HEAD"], {
    cwd: docsRoot,
    encoding: "utf8",
  });
  if (branchResult.status !== 0) {
    return undefined;
  }
  const result = spawnSync("git", ["rev-parse", "--verify", "--quiet", "origin/main"], {
    cwd: docsRoot,
    encoding: "utf8",
  });
  return result.status === 0 ? "origin/main" : undefined;
}

function parseCliArgs(args) {
  if (args.length === 0) {
    return {};
  }
  if (args.length === 2 && args[0] === "--base-ref" && args[1].trim() !== "") {
    return { baseRef: args[1] };
  }
  throw new Error("Usage: node scripts/validate-document-lifecycle.mjs [--base-ref <git-ref>]");
}

const isMainModule =
  process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href;

if (isMainModule) {
  try {
    const docsRoot = process.cwd();
    const { baseRef } = parseCliArgs(process.argv.slice(2));
    const environmentBaseRef =
      process.env.DOCUMENT_LIFECYCLE_BASE_REF?.trim() || undefined;
    const effectiveBaseRef =
      baseRef ?? environmentBaseRef ?? findDefaultBaseRef(docsRoot);
    const registry = JSON.parse(fs.readFileSync(path.join(docsRoot, registryFile), "utf8"));
    const previousRegistry = effectiveBaseRef
      ? readBaseRegistry(docsRoot, effectiveBaseRef)
      : undefined;
    const documents = readCurrentDocuments(docsRoot);
    const errors = validateDocumentLifecycle({ documents, previousRegistry, registry });
    if (errors.length > 0) {
      for (const error of errors) {
        console.error(error);
      }
      process.exit(1);
    }
    const activeCount = registry.documents.filter((entry) => entry.lifecycle === "active").length;
    const retiredCount = registry.documents.length - activeCount;
    const activeRouteCount = registry.routes.filter((entry) => entry.lifecycle === "active").length;
    console.log(
      `문서 lifecycle 검증 통과: active ${activeCount}개, retired ${retiredCount}개, active route ${activeRouteCount}개, base ${effectiveBaseRef ?? "current-only"}`,
    );
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  }
}
