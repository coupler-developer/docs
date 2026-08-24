import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

import MarkdownIt from "markdown-it";

const markdownParser = new MarkdownIt({ html: true });
const registryFile = "document-lifecycle-registry.json";
const retirementLedgerFile = "document-retirement-ledger.json";
const allowedRoutingModes = new Set([
    "closure",
    "core",
    "direct",
    "historical",
]);
const documentKeys = new Set([
    "coreOrder",
    "id",
    "path",
    "previousPaths",
    "requiredHeadings",
    "routing",
]);
const routeKeys = new Set(["id", "signal", "targets", "targetSource"]);
const registryKeys = new Set(["documents", "routes", "schemaVersion"]);
const retirementLedgerKeys = new Set(["retirements", "schemaVersion"]);
const retirementKeys = new Set([
    "id",
    "kind",
    "replacementId",
    "reservedPaths",
    "retiredAt",
]);
const ignoredContentPaths = new Set(["AGENTS.md", "CLAUDE.md", "README.md"]);
const lowercaseKebabSegmentPattern = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const lowercaseKebabMarkdownPattern = /^[a-z0-9]+(?:-[a-z0-9]+)*\.md$/;
const releaseMarkdownPattern = /^v\d+\.\d+\.\d+\.md$/;

export function validateDocumentLifecycle({
    documents,
    previousRegistry,
    previousRetirementLedger,
    registry,
    retirementLedger,
}) {
    const errors = [];
    validateRegistryShape(registry, errors);
    validateRetirementLedgerShape(retirementLedger, errors);
    if (
        !isRegistryShapeUsable(registry) ||
        !isRetirementLedgerShapeUsable(retirementLedger)
    ) {
        return errors;
    }

    validateRegistryDocuments(registry.documents, errors);
    validateRegistryRoutes(registry.routes, registry.documents, errors);
    validateRetirementLedger(retirementLedger, registry, errors);
    validateCurrentDocumentCoverage(
        documents,
        registry.documents,
        retirementLedger,
        errors,
    );
    validateRequiredHeadings(documents, registry.documents, errors);

    if (previousRegistry !== undefined) {
        const previousState = normalizePreviousState(
            previousRegistry,
            previousRetirementLedger,
            errors,
        );
        if (previousState) {
            validateRegistryDocuments(previousState.registry.documents, errors);
            validateRegistryRoutes(
                previousState.registry.routes,
                previousState.registry.documents,
                errors,
            );
            validateRetirementLedger(
                previousState.retirementLedger,
                previousState.registry,
                errors,
            );
            validateRegistryTransition(
                previousState.registry,
                previousState.retirementLedger,
                registry,
                retirementLedger,
                errors,
            );
        }
    } else if (previousRetirementLedger !== undefined) {
        errors.push(
            "base retirement ledger에는 base document lifecycle registry가 필요합니다.",
        );
    }

    return errors;
}

function validateRegistryShape(registry, errors) {
    if (!isPlainObject(registry)) {
        errors.push("document lifecycle registry는 object여야 합니다.");
        return;
    }
    validateExactKeys(
        registry,
        registryKeys,
        "document lifecycle registry",
        errors,
    );
    if (registry.schemaVersion !== 2) {
        errors.push(
            "document lifecycle registry schemaVersion은 2여야 합니다.",
        );
    }
    if (!Array.isArray(registry.documents)) {
        errors.push(
            "document lifecycle registry documents는 배열이어야 합니다.",
        );
    }
    if (!Array.isArray(registry.routes)) {
        errors.push("document lifecycle registry routes는 배열이어야 합니다.");
    }
}

function isRegistryShapeUsable(registry) {
    return (
        isPlainObject(registry) &&
        registry.schemaVersion === 2 &&
        Array.isArray(registry.documents) &&
        Array.isArray(registry.routes)
    );
}

function validateRetirementLedgerShape(ledger, errors) {
    if (!isPlainObject(ledger)) {
        errors.push("document retirement ledger는 object여야 합니다.");
        return;
    }
    validateExactKeys(
        ledger,
        retirementLedgerKeys,
        "document retirement ledger",
        errors,
    );
    if (ledger.schemaVersion !== 1) {
        errors.push(
            "document retirement ledger schemaVersion은 1이어야 합니다.",
        );
    }
    if (!Array.isArray(ledger.retirements)) {
        errors.push(
            "document retirement ledger retirements는 배열이어야 합니다.",
        );
    }
}

function isRetirementLedgerShapeUsable(ledger) {
    return (
        isPlainObject(ledger) &&
        ledger.schemaVersion === 1 &&
        Array.isArray(ledger.retirements)
    );
}

function validateRegistryDocuments(entries, errors) {
    const ids = new Set();
    const paths = new Set();
    const coreOrders = [];

    for (const [index, entry] of entries.entries()) {
        const context = `document lifecycle documents[${index}]`;
        if (!isPlainObject(entry)) {
            errors.push(`${context}는 object여야 합니다.`);
            continue;
        }
        validateExactKeys(entry, documentKeys, context, errors);
        validateIdentifier(entry.id, `${context}.id`, errors);
        validateUnique(ids, entry.id, "중복 current document ID", errors);
        validateDocumentPath(entry.path, `${context}.path`, errors);
        validateCurrentDocumentPathName(entry.path, `${context}.path`, errors);
        validateUnique(paths, entry.path, "중복 current document path", errors);

        if (!allowedRoutingModes.has(entry.routing)) {
            errors.push(
                `${context}.routing 값이 허용되지 않습니다: ${entry.routing}`,
            );
        }
        if (
            entry.path?.startsWith("releases/") !==
            (entry.routing === "historical")
        ) {
            errors.push(
                `${context}: releases 문서와 historical routing 분류가 일치해야 합니다.`,
            );
        }

        validatePreviousPaths(entry, context, paths, errors);
        validateRequiredHeadingDescriptors(
            entry.requiredHeadings,
            context,
            errors,
        );
        if (entry.routing === "core") {
            if (!Number.isInteger(entry.coreOrder)) {
                errors.push(
                    `${context}: Core 문서는 정수 coreOrder가 필요합니다.`,
                );
            } else {
                coreOrders.push(entry.coreOrder);
            }
        } else if ("coreOrder" in entry) {
            errors.push(
                `${context}: core가 아닌 문서에는 coreOrder를 둘 수 없습니다.`,
            );
        }
    }

    coreOrders.sort((left, right) => left - right);
    if (!sameArray(coreOrders, [1, 2, 3, 4])) {
        errors.push(
            "current Core 문서는 coreOrder 1~4를 정확히 한 번씩 가져야 합니다.",
        );
    }
}

function validatePreviousPaths(entry, context, paths, errors) {
    if (entry.previousPaths === undefined) {
        return;
    }
    if (
        !Array.isArray(entry.previousPaths) ||
        entry.previousPaths.length === 0
    ) {
        errors.push(
            `${context}.previousPaths는 비어 있지 않은 배열이어야 합니다.`,
        );
        return;
    }
    const localPaths = new Set();
    for (const previousPath of entry.previousPaths) {
        validateDocumentPath(previousPath, `${context}.previousPaths`, errors);
        validateUnique(
            localPaths,
            previousPath,
            `${context}.previousPaths 중복`,
            errors,
        );
        if (previousPath === entry.path) {
            errors.push(
                `${context}.previousPaths에 현재 path를 둘 수 없습니다.`,
            );
        }
        validateUnique(
            paths,
            previousPath,
            "다른 current 문서가 사용하는 과거 path",
            errors,
        );
    }
}

function validateRequiredHeadingDescriptors(headings, context, errors) {
    if (headings === undefined) {
        return;
    }
    if (!Array.isArray(headings) || headings.length === 0) {
        errors.push(
            `${context}.requiredHeadings는 비어 있지 않은 배열이어야 합니다.`,
        );
        return;
    }
    const seen = new Set();
    for (const [index, heading] of headings.entries()) {
        const headingContext = `${context}.requiredHeadings[${index}]`;
        if (!isPlainObject(heading)) {
            errors.push(`${headingContext}는 object여야 합니다.`);
            continue;
        }
        validateExactKeys(
            heading,
            new Set(["level", "title"]),
            headingContext,
            errors,
        );
        if (
            !Number.isInteger(heading.level) ||
            heading.level < 1 ||
            heading.level > 6
        ) {
            errors.push(`${headingContext}.level은 1~6 정수여야 합니다.`);
        }
        if (typeof heading.title !== "string" || heading.title.trim() === "") {
            errors.push(
                `${headingContext}.title은 비어 있지 않은 문자열이어야 합니다.`,
            );
        }
        validateUnique(
            seen,
            `${heading.level}:${heading.title}`,
            `${context}.requiredHeadings 중복`,
            errors,
        );
    }
}

function validateRegistryRoutes(routes, documentEntries, errors) {
    const routeIds = new Set();
    const signals = new Set();
    const documentsById = new Map(
        documentEntries.map((entry) => [entry.id, entry]),
    );
    const targetIds = new Set();

    for (const [index, route] of routes.entries()) {
        const context = `document lifecycle routes[${index}]`;
        if (!isPlainObject(route)) {
            errors.push(`${context}는 object여야 합니다.`);
            continue;
        }
        validateExactKeys(route, routeKeys, context, errors);
        validateIdentifier(route.id, `${context}.id`, errors);
        validateUnique(routeIds, route.id, "중복 current route ID", errors);
        if (typeof route.signal !== "string" || route.signal.trim() === "") {
            errors.push(
                `${context}.signal은 비어 있지 않은 문자열이어야 합니다.`,
            );
        }
        validateUnique(
            signals,
            route.signal,
            "중복 current route signal",
            errors,
        );
        validateCurrentRoute(route, context, documentsById, targetIds, errors);
    }

    for (const entry of documentEntries) {
        if (entry.routing === "direct" && !targetIds.has(entry.id)) {
            errors.push(
                `${entry.id}: direct routing 문서가 current route에서 참조되지 않습니다.`,
            );
        }
    }
}

function validateCurrentRoute(
    route,
    context,
    documentsById,
    activeTargetIds,
    errors,
) {
    if (
        typeof route.targetSource !== "string" ||
        route.targetSource.trim() === ""
    ) {
        errors.push(
            `${context}.targetSource는 비어 있지 않은 문자열이어야 합니다.`,
        );
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
        if (!target) {
            errors.push(
                `${context}: current target 문서가 없습니다: ${targetId}`,
            );
            continue;
        }
        if (!new Set(["core", "direct"]).has(target.routing)) {
            errors.push(
                `${context}: route target은 core 또는 direct 문서여야 합니다: ${targetId}`,
            );
        }
        activeTargetIds.add(targetId);
        targetPaths.push(target.path);
    }

    const sourcePaths = [
        ...(route.targetSource ?? "").matchAll(/`(content\/[^`]+\.md)`/g),
    ].map((match) => match[1].replace(/^content\//, ""));
    if (!sameArray(sourcePaths, targetPaths)) {
        errors.push(
            `${context}: targetSource의 문서 경로와 targets 순서가 일치하지 않습니다.`,
        );
    }
}

function validateRetirementLedger(ledger, registry, errors) {
    const ids = new Set();
    const reservedPaths = new Set();
    const activeKinds = new Map();

    for (const document of registry.documents) {
        registerKnownId(
            activeKinds,
            document.id,
            "document",
            "current registry",
            errors,
        );
    }
    for (const route of registry.routes) {
        registerKnownId(
            activeKinds,
            route.id,
            "route",
            "current registry",
            errors,
        );
    }

    for (const [index, entry] of ledger.retirements.entries()) {
        const context = `document retirement ledger retirements[${index}]`;
        if (!isPlainObject(entry)) {
            errors.push(`${context}는 object여야 합니다.`);
            continue;
        }
        validateExactKeys(entry, retirementKeys, context, errors);
        validateIdentifier(entry.id, `${context}.id`, errors);
        validateUnique(ids, entry.id, "중복 retirement ID", errors);
        if (entry.kind !== "document" && entry.kind !== "route") {
            errors.push(`${context}.kind는 document 또는 route여야 합니다.`);
        }
        if (!isIsoDate(entry.retiredAt)) {
            errors.push(`${context}.retiredAt은 YYYY-MM-DD 형식이어야 합니다.`);
        }
        if (entry.replacementId !== undefined) {
            validateIdentifier(
                entry.replacementId,
                `${context}.replacementId`,
                errors,
            );
            if (entry.replacementId === entry.id) {
                errors.push(
                    `${context}: 자기 자신을 replacementId로 사용할 수 없습니다.`,
                );
            }
        }

        if (entry.kind === "document") {
            if (
                !Array.isArray(entry.reservedPaths) ||
                entry.reservedPaths.length === 0
            ) {
                errors.push(
                    `${context}.reservedPaths는 비어 있지 않은 배열이어야 합니다.`,
                );
            } else {
                const localPaths = new Set();
                for (const reservedPath of entry.reservedPaths) {
                    validateDocumentPath(
                        reservedPath,
                        `${context}.reservedPaths`,
                        errors,
                    );
                    validateUnique(
                        localPaths,
                        reservedPath,
                        `${context}.reservedPaths 중복`,
                        errors,
                    );
                    validateUnique(
                        reservedPaths,
                        reservedPath,
                        "중복 retired document path",
                        errors,
                    );
                }
            }
        } else if ("reservedPaths" in entry) {
            errors.push(
                `${context}: route retirement에는 reservedPaths를 둘 수 없습니다.`,
            );
        }
    }

    const retiredKinds = new Map();
    for (const entry of ledger.retirements.filter(isPlainObject)) {
        registerKnownId(
            retiredKinds,
            entry.id,
            entry.kind,
            "retirement ledger",
            errors,
        );
        if (activeKinds.has(entry.id)) {
            errors.push(
                `retired ID를 current registry에서 재사용할 수 없습니다: ${entry.id}`,
            );
        }
    }

    for (const document of registry.documents) {
        for (const currentPath of [
            document.path,
            ...(document.previousPaths ?? []),
        ]) {
            if (reservedPaths.has(currentPath)) {
                errors.push(
                    `retired document path를 current registry에서 재사용할 수 없습니다: ${currentPath}`,
                );
            }
        }
    }

    const knownKinds = new Map([...activeKinds, ...retiredKinds]);
    for (const entry of ledger.retirements.filter(isPlainObject)) {
        if (entry.replacementId === undefined) {
            continue;
        }
        const replacementKind = knownKinds.get(entry.replacementId);
        if (replacementKind === undefined) {
            errors.push(
                `${entry.id}: 알려진 replacementId가 아닙니다: ${entry.replacementId}`,
            );
        } else if (replacementKind !== entry.kind) {
            errors.push(
                `${entry.id}: replacementId kind가 일치하지 않습니다: ${entry.replacementId}`,
            );
        }
    }
    validateReplacementCycles(ledger.retirements.filter(isPlainObject), errors);
}

function registerKnownId(knownKinds, id, kind, label, errors) {
    if (knownKinds.has(id)) {
        errors.push(`${label}에서 stable ID가 중복됩니다: ${id}`);
    } else {
        knownKinds.set(id, kind);
    }
}

function validateReplacementCycles(retirements, errors) {
    const retiredIds = new Set(retirements.map((entry) => entry.id));
    const replacements = new Map(
        retirements
            .filter((entry) => typeof entry.replacementId === "string")
            .map((entry) => [entry.id, entry.replacementId]),
    );
    const reported = new Set();

    for (const start of replacements.keys()) {
        const visited = new Set();
        let current = start;
        while (retiredIds.has(current) && replacements.has(current)) {
            if (visited.has(current)) {
                if (!reported.has(current)) {
                    errors.push(
                        `retirement replacement chain에 cycle이 있습니다: ${current}`,
                    );
                    reported.add(current);
                }
                break;
            }
            visited.add(current);
            current = replacements.get(current);
        }
    }
}

function validateCurrentDocumentCoverage(
    documents,
    entries,
    retirementLedger,
    errors,
) {
    const activeByPath = new Map(entries.map((entry) => [entry.path, entry]));
    const retiredPaths = new Set(
        retirementLedger.retirements.flatMap(
            (entry) => entry.reservedPaths ?? [],
        ),
    );
    const documentPaths = new Set();

    for (const document of documents) {
        if (documentPaths.has(document.path)) {
            errors.push(
                `중복 current document path가 있습니다: ${document.path}`,
            );
        }
        documentPaths.add(document.path);
        if (!activeByPath.has(document.path)) {
            errors.push(
                `${document.path}: lifecycle registry에 current 항목이 없습니다.`,
            );
        }
        if (retiredPaths.has(document.path)) {
            errors.push(
                `${document.path}: retired document path를 재사용할 수 없습니다.`,
            );
        }
    }

    for (const entry of entries) {
        if (!documentPaths.has(entry.path)) {
            errors.push(
                `${entry.path}: current lifecycle 문서가 존재하지 않습니다.`,
            );
        }
    }
}

function validateRequiredHeadings(documents, entries, errors) {
    const sourcesByPath = new Map(
        documents.map((document) => [document.path, document.source]),
    );
    for (const entry of entries) {
        if (!entry.requiredHeadings) {
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
                        heading.level === requiredHeading.level &&
                        heading.title === requiredHeading.title,
                )
            ) {
                errors.push(
                    `${entry.path}: lifecycle registry 필수 heading이 없습니다: ${requiredHeading.title}`,
                );
            }
        }
    }
}

function normalizePreviousState(
    previousRegistry,
    previousRetirementLedger,
    errors,
) {
    if (!isPlainObject(previousRegistry)) {
        errors.push(
            "base document lifecycle registry 형식이 유효하지 않습니다.",
        );
        return undefined;
    }
    if (previousRegistry.schemaVersion === 2) {
        if (!isRegistryShapeUsable(previousRegistry)) {
            errors.push(
                "base document lifecycle registry 형식이 유효하지 않습니다.",
            );
            return undefined;
        }
        if (!isRetirementLedgerShapeUsable(previousRetirementLedger)) {
            errors.push(
                "schemaVersion 2 base에는 document retirement ledger가 필요합니다.",
            );
            return undefined;
        }
        return {
            registry: previousRegistry,
            retirementLedger: previousRetirementLedger,
        };
    }
    if (previousRegistry.schemaVersion !== 1) {
        errors.push(
            "base document lifecycle registry schemaVersion을 지원하지 않습니다.",
        );
        return undefined;
    }
    if (
        !Array.isArray(previousRegistry.documents) ||
        !Array.isArray(previousRegistry.routes)
    ) {
        errors.push(
            "base document lifecycle registry 형식이 유효하지 않습니다.",
        );
        return undefined;
    }
    if (previousRetirementLedger !== undefined) {
        errors.push(
            "schemaVersion 1 base에는 별도 retirement ledger를 둘 수 없습니다.",
        );
        return undefined;
    }

    const retirements = [];
    const normalizeEntries = (entries, kind) =>
        entries.flatMap((entry) => {
            if (!isPlainObject(entry)) {
                errors.push(
                    `base ${kind} lifecycle 항목 형식이 유효하지 않습니다.`,
                );
                return [];
            }
            if (entry.lifecycle === "active") {
                const { lifecycle: _lifecycle, ...activeEntry } = entry;
                return [activeEntry];
            }
            if (entry.lifecycle === "retired") {
                retirements.push({
                    id: entry.id,
                    kind,
                    retiredAt: entry.retiredAt,
                    ...(kind === "document"
                        ? {
                              reservedPaths: [
                                  entry.path,
                                  ...(entry.previousPaths ?? []),
                              ],
                          }
                        : {}),
                    ...(typeof entry.replacementId === "string"
                        ? { replacementId: entry.replacementId }
                        : {}),
                });
                return [];
            }
            errors.push(
                `base ${kind} lifecycle 값이 유효하지 않습니다: ${entry.id}`,
            );
            return [];
        });

    return {
        registry: {
            schemaVersion: 2,
            documents: normalizeEntries(previousRegistry.documents, "document"),
            routes: normalizeEntries(previousRegistry.routes, "route"),
        },
        retirementLedger: { schemaVersion: 1, retirements },
    };
}

function validateRegistryTransition(
    previousRegistry,
    previousRetirementLedger,
    currentRegistry,
    currentRetirementLedger,
    errors,
) {
    validateRetirementTransition(
        previousRetirementLedger,
        currentRetirementLedger,
        errors,
    );
    validateEntryTransition(
        previousRegistry.documents,
        currentRegistry.documents,
        currentRetirementLedger,
        "document",
        errors,
    );
    validateEntryTransition(
        previousRegistry.routes,
        currentRegistry.routes,
        currentRetirementLedger,
        "route",
        errors,
    );
}

function validateRetirementTransition(previousLedger, currentLedger, errors) {
    for (const [index, previous] of previousLedger.retirements.entries()) {
        const current = currentLedger.retirements[index];
        if (!current) {
            errors.push(
                `기존 retirement ID를 삭제할 수 없습니다: ${previous.id}`,
            );
        } else if (stableStringify(previous) !== stableStringify(current)) {
            errors.push(
                `retirement ledger는 기존 배열의 exact prefix를 보존해야 합니다: index ${index}, ${previous.id}`,
            );
        }
    }
}

function validateEntryTransition(
    previousEntries,
    currentEntries,
    currentLedger,
    kind,
    errors,
) {
    const currentById = new Map(
        currentEntries.map((entry) => [entry.id, entry]),
    );
    const retirementById = new Map(
        currentLedger.retirements.map((entry) => [entry.id, entry]),
    );

    for (const previous of previousEntries) {
        const current = currentById.get(previous.id);
        if (!current) {
            const retirement = retirementById.get(previous.id);
            if (!retirement || retirement.kind !== kind) {
                errors.push(
                    `기존 ${kind} ID를 retirement 없이 삭제할 수 없습니다: ${previous.id}`,
                );
                continue;
            }
            if (kind === "document") {
                const expectedPaths = [
                    previous.path,
                    ...(previous.previousPaths ?? []),
                ];
                if (!sameSet(retirement.reservedPaths ?? [], expectedPaths)) {
                    errors.push(
                        `${previous.id}: retirement에 마지막 path와 모든 previousPaths가 필요합니다.`,
                    );
                }
            }
            continue;
        }

        if (kind === "route") {
            if (previous.signal !== current.signal) {
                errors.push(
                    `${previous.id}: current route signal은 변경할 수 없습니다. retire/replacement를 사용하세요.`,
                );
            }
            if (previous.targetSource !== current.targetSource) {
                errors.push(
                    `${previous.id}: current route targetSource는 변경할 수 없습니다. retire/replacement를 사용하세요.`,
                );
            }
            if (!sameArray(previous.targets ?? [], current.targets ?? [])) {
                errors.push(
                    `${previous.id}: current route targets는 변경할 수 없습니다. retire/replacement를 사용하세요.`,
                );
            }
            continue;
        }

        if (previous.routing !== current.routing) {
            errors.push(
                `${previous.id}: current routing 분류는 변경할 수 없습니다. retire/replacement를 사용하세요.`,
            );
        }
        if (previous.coreOrder !== current.coreOrder) {
            errors.push(
                `${previous.id}: current coreOrder는 변경할 수 없습니다. retire/replacement를 사용하세요.`,
            );
        }
        if (
            current.path !== previous.path &&
            !(current.previousPaths ?? []).includes(previous.path)
        ) {
            errors.push(
                `${previous.id}: rename 전 path를 previousPaths에 보존해야 합니다.`,
            );
        }
        for (const previousPath of previous.previousPaths ?? []) {
            if (!(current.previousPaths ?? []).includes(previousPath)) {
                errors.push(
                    `${previous.id}: 기존 previousPaths를 제거할 수 없습니다: ${previousPath}`,
                );
            }
        }
        for (const heading of previous.requiredHeadings ?? []) {
            if (
                !(current.requiredHeadings ?? []).some(
                    (candidate) =>
                        candidate.level === heading.level &&
                        candidate.title === heading.title,
                )
            ) {
                errors.push(
                    `${previous.id}: 기존 requiredHeading을 제거할 수 없습니다: ${heading.title}`,
                );
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
}

function validateIdentifier(value, context, errors) {
    if (
        typeof value !== "string" ||
        !/^[a-z0-9]+(?:[.-][a-z0-9]+)*$/.test(value)
    ) {
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

function validateCurrentDocumentPathName(value, context, errors) {
    if (typeof value !== "string") {
        return;
    }
    const segments = value.split("/");
    const filename = segments.pop();
    const hasValidDirectories = segments.every((segment) =>
        lowercaseKebabSegmentPattern.test(segment),
    );
    const hasValidFilename = value.startsWith("releases/")
        ? releaseMarkdownPattern.test(filename)
        : lowercaseKebabMarkdownPattern.test(filename);

    if (!hasValidDirectories || !hasValidFilename) {
        errors.push(
            `${context}: 디렉터리·일반 파일명은 lowercase kebab-case, releases 파일명은 vMAJOR.MINOR.PATCH.md여야 합니다.`,
        );
    }
}

function validateUnique(seen, value, context, errors) {
    if (seen.has(value)) {
        errors.push(`${context}: ${value}`);
    }
    seen.add(value);
}

function isIsoDate(value) {
    const match =
        typeof value === "string" && value.match(/^(\d{4})-(\d{2})-(\d{2})$/);
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
                title:
                    inlineToken?.type === "inline" ? inlineToken.content : "",
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
            .map(
                (key) =>
                    `${JSON.stringify(key)}:${stableStringify(value[key])}`,
            )
            .join(",")}}`;
    }
    return JSON.stringify(value);
}

function sameArray(actual, expected) {
    return (
        actual.length === expected.length &&
        actual.every((value, index) => value === expected[index])
    );
}

function sameSet(actual, expected) {
    return (
        actual.length === expected.length &&
        actual.every((value) => expected.includes(value))
    );
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
                !ignoredContentPaths.has(document.path) &&
                !document.path.startsWith(`templates${path.sep}`),
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

function readBaseJson(docsRoot, baseRef, file) {
    const result = spawnSync("git", ["show", `${baseRef}:${file}`], {
        cwd: docsRoot,
        encoding: "utf8",
    });
    if (result.status === 0) {
        return JSON.parse(result.stdout);
    }
    if (/does not exist|exists on disk, but not in/.test(result.stderr)) {
        return undefined;
    }
    throw new Error(
        result.stderr.trim() ||
            `base 파일을 읽을 수 없습니다: ${baseRef}:${file}`,
    );
}

function findDefaultBaseRef(docsRoot) {
    const branchResult = spawnSync(
        "git",
        ["symbolic-ref", "--quiet", "--short", "HEAD"],
        {
            cwd: docsRoot,
            encoding: "utf8",
        },
    );
    if (branchResult.status !== 0) {
        return undefined;
    }
    const result = spawnSync(
        "git",
        ["rev-parse", "--verify", "--quiet", "origin/main"],
        {
            cwd: docsRoot,
            encoding: "utf8",
        },
    );
    return result.status === 0 ? "origin/main" : undefined;
}

function parseCliArgs(args) {
    if (args.length === 0) {
        return {};
    }
    if (
        args.length === 2 &&
        args[0] === "--base-ref" &&
        args[1].trim() !== ""
    ) {
        return { baseRef: args[1] };
    }
    throw new Error(
        "Usage: node scripts/validate-document-lifecycle.mjs [--base-ref <git-ref>]",
    );
}

const isMainModule =
    process.argv[1] &&
    import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href;

if (isMainModule) {
    try {
        const docsRoot = process.cwd();
        const { baseRef } = parseCliArgs(process.argv.slice(2));
        const environmentBaseRef =
            process.env.DOCUMENT_LIFECYCLE_BASE_REF?.trim() || undefined;
        const effectiveBaseRef =
            baseRef ?? environmentBaseRef ?? findDefaultBaseRef(docsRoot);
        const registry = JSON.parse(
            fs.readFileSync(path.join(docsRoot, registryFile), "utf8"),
        );
        const retirementLedger = JSON.parse(
            fs.readFileSync(path.join(docsRoot, retirementLedgerFile), "utf8"),
        );
        const previousRegistry = effectiveBaseRef
            ? readBaseJson(docsRoot, effectiveBaseRef, registryFile)
            : undefined;
        const previousRetirementLedger = effectiveBaseRef
            ? readBaseJson(docsRoot, effectiveBaseRef, retirementLedgerFile)
            : undefined;
        const documents = readCurrentDocuments(docsRoot);
        const errors = validateDocumentLifecycle({
            documents,
            previousRegistry,
            previousRetirementLedger,
            registry,
            retirementLedger,
        });
        if (errors.length > 0) {
            for (const error of errors) {
                console.error(error);
            }
            process.exit(1);
        }
        console.log(
            `문서 lifecycle 검증 통과: current ${registry.documents.length}개, retired ${retirementLedger.retirements.length}개, current route ${registry.routes.length}개, base ${effectiveBaseRef ?? "current-only"}`,
        );
    } catch (error) {
        console.error(error instanceof Error ? error.message : String(error));
        process.exit(1);
    }
}
