import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import { semverTagPattern } from "./release-schema.mjs";

const scriptsRoot = path.dirname(fileURLToPath(import.meta.url));
const defaultDocsRoot = path.dirname(scriptsRoot);

export function initializeReleaseRecord({ docsRoot = defaultDocsRoot, version }) {
  const numericVersion = parseReleaseVersion(version);
  const releaseId = `releases.${version}`;
  const releasePath = `releases/${version}.md`;
  const files = resolveFiles(docsRoot, releasePath);

  if (fs.existsSync(files.releaseRecord)) {
    throw new Error(`릴리스 기록이 이미 존재합니다: content/${releasePath}`);
  }

  const template = readRequiredFile(files.template);
  const registrySource = readRequiredFile(files.registry);
  const retirementLedgerSource = readRequiredFile(files.retirementLedger);
  const agentsSource = readRequiredFile(files.agents);
  const mkdocsSource = readRequiredFile(files.mkdocs);
  const registry = parseJson(registrySource, files.registry);
  const retirementLedger = parseJson(
    retirementLedgerSource,
    files.retirementLedger,
  );

  validateRegistry(registry, releaseId, releasePath);
  validateRetirementLedger(retirementLedger, releaseId, releasePath);

  const releaseRecordSource = renderReleaseRecord(template, numericVersion);
  const updatedRegistrySource = addRegistryEntryToSource(registrySource, registry, {
    id: releaseId,
    path: releasePath,
    routing: "historical",
  });
  const updatedAgents = addAfterUniqueAnchor({
    source: agentsSource,
    anchor: "### Releases\n\n",
    insertion:
      `- [${numericVersion} 릴리스 실행 기록](${releasePath})` +
      ` - ${numericVersion} 운영 릴리스 기록\n`,
    duplicatePatterns: [releasePath, `${numericVersion} 릴리스 실행 기록`],
    context: "content/AGENTS.md Releases 인덱스",
  });
  const updatedMkdocs = addAfterUniqueAnchor({
    source: mkdocsSource,
    anchor: "  - Releases:\n",
    insertion:
      `      - ${numericVersion} 릴리스 실행 기록: ${releasePath}\n`,
    duplicatePatterns: [releasePath],
    context: "mkdocs.yml Releases nav",
  });

  const changes = [
    {
      path: files.releaseRecord,
      source: releaseRecordSource,
      relativePath: `content/${releasePath}`,
    },
    {
      path: files.registry,
      source: updatedRegistrySource,
      originalSource: registrySource,
      relativePath: "document-lifecycle-registry.json",
    },
    {
      path: files.agents,
      source: updatedAgents,
      originalSource: agentsSource,
      relativePath: "content/AGENTS.md",
    },
    {
      path: files.mkdocs,
      source: updatedMkdocs,
      originalSource: mkdocsSource,
      relativePath: "mkdocs.yml",
    },
  ];

  writeFileTransaction(changes);
  return changes.map(({ relativePath }) => relativePath);
}

function parseReleaseVersion(version) {
  if (typeof version !== "string" || !semverTagPattern.test(version)) {
    throw new Error("버전은 vMAJOR.MINOR.PATCH 형식이어야 합니다: v2.5.0");
  }
  return version.slice(1);
}

function resolveFiles(docsRoot, releasePath) {
  return {
    agents: path.join(docsRoot, "content", "AGENTS.md"),
    mkdocs: path.join(docsRoot, "mkdocs.yml"),
    registry: path.join(docsRoot, "document-lifecycle-registry.json"),
    releaseRecord: path.join(docsRoot, "content", releasePath),
    retirementLedger: path.join(
      docsRoot,
      "document-retirement-ledger.json",
    ),
    template: path.join(
      docsRoot,
      "content",
      "templates",
      "release-record-template.md",
    ),
  };
}

function readRequiredFile(filePath) {
  try {
    return fs.readFileSync(filePath, "utf8");
  } catch (error) {
    throw new Error(`필수 파일을 읽을 수 없습니다: ${filePath}`, {
      cause: error,
    });
  }
}

function parseJson(source, filePath) {
  try {
    return JSON.parse(source);
  } catch (error) {
    throw new Error(`JSON 형식이 유효하지 않습니다: ${filePath}`, {
      cause: error,
    });
  }
}

function validateRegistry(registry, releaseId, releasePath) {
  if (
    registry?.schemaVersion !== 2 ||
    !Array.isArray(registry?.documents) ||
    !Array.isArray(registry?.routes)
  ) {
    throw new Error("document lifecycle registry 형식이 유효하지 않습니다.");
  }
  if (
    registry.documents.some(
      (entry) => entry.id === releaseId || entry.path === releasePath,
    )
  ) {
    throw new Error(
      `lifecycle registry에 같은 ID 또는 경로가 이미 있습니다: ${releaseId}`,
    );
  }
}

function validateRetirementLedger(retirementLedger, releaseId, releasePath) {
  if (
    retirementLedger?.schemaVersion !== 1 ||
    !Array.isArray(retirementLedger?.retirements)
  ) {
    throw new Error("document retirement ledger 형식이 유효하지 않습니다.");
  }
  if (
    retirementLedger.retirements.some(
      (entry) =>
        entry.id === releaseId || entry.reservedPaths?.includes(releasePath),
    )
  ) {
    throw new Error(
      `retired ID 또는 경로는 재사용할 수 없습니다: ${releaseId}`,
    );
  }
}

function renderReleaseRecord(template, numericVersion) {
  if (!template.includes("# X.Y.Z 릴리스 실행 기록")) {
    throw new Error("릴리스 기록 템플릿의 제목 placeholder가 없습니다.");
  }
  if (!template.includes('"version": "vX.Y.Z"')) {
    throw new Error("릴리스 기록 템플릿의 metadata placeholder가 없습니다.");
  }
  validateInitialTemplateState(template);
  return template.replaceAll("X.Y.Z", numericVersion);
}

function validateInitialTemplateState(template) {
  const blockMatch = template.match(
    /```release-metadata\s*\n([\s\S]*?)\n```/,
  );
  if (!blockMatch) {
    throw new Error("릴리스 기록 템플릿의 release-metadata block이 없습니다.");
  }

  let metadata;
  try {
    metadata = JSON.parse(blockMatch[1]);
  } catch (error) {
    throw new Error("릴리스 기록 템플릿의 release-metadata JSON이 유효하지 않습니다.", {
      cause: error,
    });
  }

  const scopeResults = metadata?.scopeResults;
  if (
    metadata?.status !== "planned" ||
    !scopeResults ||
    typeof scopeResults !== "object" ||
    Array.isArray(scopeResults) ||
    Object.keys(scopeResults).length === 0 ||
    Object.values(scopeResults).some((result) => result?.status !== "planned")
  ) {
    throw new Error(
      "릴리스 기록 템플릿은 전체 상태와 모든 scopeResults를 planned로 시작해야 합니다.",
    );
  }
}

function addRegistryEntryToSource(source, registry, entry) {
  const lastReleaseIndex = registry.documents.findLastIndex(
    (document) =>
      typeof document.id === "string" && document.id.startsWith("releases."),
  );
  if (lastReleaseIndex < 0) {
    throw new Error("lifecycle registry에 기준 release 항목이 없습니다.");
  }

  const lastReleaseBlock = indentJson(registry.documents[lastReleaseIndex], 8);
  const firstIndex = source.indexOf(lastReleaseBlock);
  if (
    firstIndex < 0 ||
    source.indexOf(lastReleaseBlock, firstIndex + lastReleaseBlock.length) >= 0
  ) {
    throw new Error(
      "lifecycle registry의 마지막 release 항목 형식은 정확히 하나여야 합니다.",
    );
  }

  const blockEnd = firstIndex + lastReleaseBlock.length;
  let nextTokenIndex = blockEnd;
  while (/\s/.test(source[nextTokenIndex] ?? "")) {
    nextTokenIndex += 1;
  }

  const entryBlock = indentJson(entry, 8);
  if (source[nextTokenIndex] === ",") {
    return (
      source.slice(0, nextTokenIndex + 1) +
      `\n${entryBlock},` +
      source.slice(nextTokenIndex + 1)
    );
  }
  if (source[nextTokenIndex] === "]") {
    return (
      source.slice(0, blockEnd) +
      `,\n${entryBlock}` +
      source.slice(blockEnd)
    );
  }

  throw new Error("lifecycle registry release 항목의 배열 경계를 찾을 수 없습니다.");
}

function indentJson(value, spaces) {
  const indent = " ".repeat(spaces);
  return JSON.stringify(value, null, 4)
    .split("\n")
    .map((line) => `${indent}${line}`)
    .join("\n");
}

function addAfterUniqueAnchor({
  source,
  anchor,
  insertion,
  duplicatePatterns,
  context,
}) {
  for (const pattern of duplicatePatterns) {
    if (source.includes(pattern)) {
      throw new Error(`${context}에 같은 릴리스가 이미 있습니다: ${pattern}`);
    }
  }
  const firstIndex = source.indexOf(anchor);
  if (firstIndex < 0 || source.indexOf(anchor, firstIndex + anchor.length) >= 0) {
    throw new Error(`${context} anchor는 정확히 하나여야 합니다.`);
  }
  const insertionIndex = firstIndex + anchor.length;
  return `${source.slice(0, insertionIndex)}${insertion}${source.slice(insertionIndex)}`;
}

function writeFileTransaction(changes) {
  const nonce = `${process.pid}-${Date.now()}`;
  const staged = [];
  const committed = [];

  try {
    for (const [index, change] of changes.entries()) {
      const directory = path.dirname(change.path);
      fs.mkdirSync(directory, { recursive: true });
      const temporaryPath = path.join(
        directory,
        `.${path.basename(change.path)}.${nonce}-${index}.tmp`,
      );
      const backupPath = path.join(
        directory,
        `.${path.basename(change.path)}.${nonce}-${index}.bak`,
      );
      const existed = fs.existsSync(change.path);
      const mode = existed ? fs.statSync(change.path).mode : 0o644;
      fs.writeFileSync(temporaryPath, change.source, { encoding: "utf8", flag: "wx", mode });
      staged.push({ ...change, temporaryPath, backupPath, existed });
    }

    for (const item of staged) {
      if (item.existed) {
        if (fs.readFileSync(item.path, "utf8") !== item.originalSource) {
          throw new Error(`초기화 중 파일이 변경됐습니다: ${item.relativePath}`);
        }
        fs.renameSync(item.path, item.backupPath);
        if (fs.readFileSync(item.backupPath, "utf8") !== item.originalSource) {
          throw new Error(`초기화 중 파일이 변경됐습니다: ${item.relativePath}`);
        }
        fs.linkSync(item.temporaryPath, item.path);
      } else {
        fs.linkSync(item.temporaryPath, item.path);
      }
      committed.push(item);
    }
  } catch (error) {
    const rollbackConflicts = rollbackTransaction(staged, committed);
    if (rollbackConflicts.length > 0) {
      const conflictDetails = rollbackConflicts
        .map(({ relativePath, backupPath }) =>
          backupPath
            ? `${relativePath} (원본 백업: ${backupPath})`
            : relativePath,
        )
        .join(", ");
      throw new Error(
        "릴리스 기록 초기화 중 동시 변경을 보존했습니다. " +
          `다음 파일은 자동 복구하지 않았습니다: ${conflictDetails}`,
        { cause: error },
      );
    }
    throw new Error("릴리스 기록 초기화 중 파일 변경을 되돌렸습니다.", {
      cause: error,
    });
  }

  for (const item of staged) {
    removeIfExists(item.backupPath);
    removeIfExists(item.temporaryPath);
  }
}

function rollbackTransaction(staged, committed) {
  const committedPaths = new Set(committed.map((item) => item.path));
  const conflicts = [];
  for (const item of [...staged].reverse()) {
    const wasCommitted = committedPaths.has(item.path);
    const backupExists = fs.existsSync(item.backupPath);
    const currentExists = fs.existsSync(item.path);
    if (wasCommitted) {
      if (
        !fileMatchesSource(item.path, item.source) ||
        (item.existed && !backupExists)
      ) {
        conflicts.push({
          relativePath: item.relativePath,
          backupPath: backupExists ? item.backupPath : null,
        });
        removeIfExists(item.temporaryPath);
        continue;
      }
      removeIfExists(item.path);
    } else if (
      (item.existed && backupExists && currentExists) ||
      (!item.existed && currentExists)
    ) {
      conflicts.push({
        relativePath: item.relativePath,
        backupPath: backupExists ? item.backupPath : null,
      });
      removeIfExists(item.temporaryPath);
      continue;
    }
    if (backupExists) {
      fs.renameSync(item.backupPath, item.path);
    }
    removeIfExists(item.temporaryPath);
  }
  return conflicts;
}

function fileMatchesSource(filePath, expectedSource) {
  try {
    return fs.readFileSync(filePath, "utf8") === expectedSource;
  } catch (error) {
    if (error?.code === "ENOENT") {
      return false;
    }
    throw error;
  }
}

function removeIfExists(filePath) {
  try {
    fs.unlinkSync(filePath);
  } catch (error) {
    if (error?.code !== "ENOENT") {
      throw error;
    }
  }
}

function printUsage() {
  console.log("Usage: yarn release:record:init vMAJOR.MINOR.PATCH");
}

const isMainModule =
  process.argv[1] &&
  import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href;

if (isMainModule) {
  const args = process.argv.slice(2);
  if (args.length === 1 && ["--help", "-h"].includes(args[0])) {
    printUsage();
  } else if (args.length !== 1) {
    printUsage();
    process.exitCode = 1;
  } else {
    try {
      const changedPaths = initializeReleaseRecord({ version: args[0] });
      console.log(`릴리스 기록 ${args[0]} 초기화 완료:`);
      for (const changedPath of changedPaths) {
        console.log(`- ${changedPath}`);
      }
      console.log(
        "다음 단계: planned 기록을 작성하고 검증한 뒤 현재 PR head의 필수 CI를 확인하세요.",
      );
    } catch (error) {
      console.error(error instanceof Error ? error.message : String(error));
      process.exitCode = 1;
    }
  }
}
