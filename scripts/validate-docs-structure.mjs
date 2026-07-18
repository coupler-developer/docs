import fs from "node:fs";
import path from "node:path";

const docsRoot = process.cwd();
const contentRoot = path.join(docsRoot, "content");
const mkdocsPath = path.join(docsRoot, "mkdocs.yml");
const agentsPath = path.join(contentRoot, "AGENTS.md");
const stabilityReviewTemplatePath = path.join(
  contentRoot,
  "templates",
  "docs-stability-review-template.md",
);

const allowedRoles = new Set(["규범", "설명", "시각화", "시나리오", "부채"]);
const allowedKinds = new Set([
  "policy",
  "architecture",
  "fsm",
  "flow",
  "technical-debt",
]);
const allowedStatuses = new Set(["as-is", "to-be", "transition"]);
const lifecycleVerdictOperations = [
  "추가",
  "수정",
  "삭제",
  "이동",
  "개명",
  "분리",
  "통합",
];
const lifecycleVerdictOperationSet = new Set(lifecycleVerdictOperations);
const lifecycleVerdictSectionHeading = "문서 생명주기 증빙";
const lifecycleVerdictTableHeader = ["변경 작업", "판정", "근거"];
const ignoredRelativePaths = new Set(["AGENTS.md", "README.md", "CLAUDE.md"]);

const docFiles = [];
walkMarkdownFiles(contentRoot, docFiles);

const contentDocs = docFiles
  .map((filePath) => path.relative(contentRoot, filePath))
  .filter((relativePath) => !shouldIgnore(relativePath));

const navRefs = parseMkdocsRefs(fs.readFileSync(mkdocsPath, "utf8"));
const agentsRefs = parseMarkdownLinks(fs.readFileSync(agentsPath, "utf8"));

const errors = [];

validateStabilityReviewTemplate(stabilityReviewTemplatePath, errors);

for (const relativePath of contentDocs) {
  const absolutePath = path.join(contentRoot, relativePath);
  const source = fs.readFileSync(absolutePath, "utf8");

  validateMetadata(relativePath, source, errors);

  if (!navRefs.has(relativePath)) {
    errors.push(`${relativePath}: mkdocs.yml nav에 문서 링크가 없습니다.`);
  }

  if (!agentsRefs.has(relativePath) && relativePath !== "README.md") {
    errors.push(`${relativePath}: content/AGENTS.md 인덱스에 문서 링크가 없습니다.`);
  }
}

for (const ref of navRefs) {
  const targetPath = path.join(contentRoot, ref);
  if (!fs.existsSync(targetPath)) {
    errors.push(`mkdocs.yml: 존재하지 않는 문서를 참조합니다: ${ref}`);
  }
}

for (const ref of agentsRefs) {
  const targetPath = path.join(contentRoot, ref);
  if (!fs.existsSync(targetPath)) {
    errors.push(`content/AGENTS.md: 존재하지 않는 문서를 참조합니다: ${ref}`);
  }
}

if (errors.length > 0) {
  for (const error of errors) {
    console.error(error);
  }
  process.exit(1);
}

console.log(
  `docs 구조 검증 통과: ${contentDocs.length}개 문서, nav ${navRefs.size}개, AGENTS 인덱스 ${agentsRefs.size}개`,
);

function walkMarkdownFiles(dirPath, results) {
  const entries = fs.readdirSync(dirPath, { withFileTypes: true });

  for (const entry of entries) {
    const absolutePath = path.join(dirPath, entry.name);

    if (entry.isDirectory()) {
      walkMarkdownFiles(absolutePath, results);
      continue;
    }

    if (entry.isFile() && entry.name.endsWith(".md")) {
      results.push(absolutePath);
    }
  }
}

function shouldIgnore(relativePath) {
  if (ignoredRelativePaths.has(relativePath)) {
    return true;
  }

  const parts = relativePath.split(path.sep);
  return parts.includes("templates");
}

function parseMkdocsRefs(source) {
  const refs = new Set();
  const lines = source.split("\n");

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed.startsWith("- ") || !trimmed.includes(".md")) {
      continue;
    }

    const [, rawRef] = trimmed.split(":", 2);
    if (!rawRef) {
      continue;
    }

    refs.add(rawRef.trim());
  }

  return refs;
}

function parseMarkdownLinks(source) {
  const refs = new Set();
  const linkPattern = /\[[^\]]+\]\(([^)]+\.md)\)/g;

  for (const match of source.matchAll(linkPattern)) {
    refs.add(match[1]);
  }

  return refs;
}

function validateMetadata(relativePath, source, errors) {
  const sectionMatch = source.match(
    /## 문서 역할\s*\n\s*\n- 역할: `([^`]+)`\n- 문서 종류: `([^`]+)`\n- 충돌 시 우선 문서: .+\n- 기준 성격: `([^`]+)`/,
  );

  if (!sectionMatch) {
    errors.push(
      `${relativePath}: 문서 역할 메타데이터 형식이 정책 표준과 다릅니다.`,
    );
    return;
  }

  const [, role, kind, status] = sectionMatch;

  if (!allowedRoles.has(role)) {
    errors.push(`${relativePath}: 허용되지 않은 역할입니다: ${role}`);
  }

  if (!allowedKinds.has(kind)) {
    errors.push(`${relativePath}: 허용되지 않은 문서 종류입니다: ${kind}`);
  }

  if (!allowedStatuses.has(status)) {
    errors.push(`${relativePath}: 허용되지 않은 기준 성격입니다: ${status}`);
  }

  const directoryKind = inferDirectoryKind(relativePath);
  if (directoryKind && directoryKind !== kind) {
    errors.push(
      `${relativePath}: 디렉터리 분류(${directoryKind})와 메타데이터 문서 종류(${kind})가 다릅니다.`,
    );
  }
}

function validateStabilityReviewTemplate(templatePath, errors) {
  const relativePath = "content/templates/docs-stability-review-template.md";

  if (!fs.existsSync(templatePath)) {
    errors.push(`${relativePath}: 필수 안정성 리뷰 템플릿이 없습니다.`);
    return;
  }

  const source = fs.readFileSync(templatePath, "utf8");
  const scannedLines = scanMarkdownLines(source.split("\n"));
  const levelTwoHeadings = scannedLines
    .map((entry, index) => ({
      index: entry.index,
      title: parseLevelTwoHeading(scannedLines, index),
    }))
    .filter((heading) => heading.title !== null);
  const lifecycleSectionHeadings = levelTwoHeadings.filter(
    (heading) =>
      normalizeMarkdownHeadingText(heading.title) ===
      lifecycleVerdictSectionHeading,
  );

  if (lifecycleSectionHeadings.length === 0) {
    errors.push(`${relativePath}: 문서 생명주기 증빙 절이 없습니다.`);
    return;
  }

  if (lifecycleSectionHeadings.length !== 1) {
    errors.push(
      `${relativePath}: 문서 생명주기 증빙 절은 정확히 1개여야 합니다 (현재 ${lifecycleSectionHeadings.length}개).`,
    );
    return;
  }

  const sectionHeading = lifecycleSectionHeadings[0];
  const nextLevelTwoHeading = levelTwoHeadings.find(
    (heading) => heading.index > sectionHeading.index,
  );
  const sectionEnd = nextLevelTwoHeading?.index ?? scannedLines.length;
  const sectionLines = scannedLines.slice(
    sectionHeading.index + 1,
    sectionEnd,
  );
  const tableBlocks = findMarkdownTableBlocks(sectionLines);

  if (tableBlocks.length === 0) {
    errors.push(
      `${relativePath}: 문서 생명주기 증빙 표가 없습니다.`,
    );
    return;
  }

  if (tableBlocks.length !== 1) {
    errors.push(
      `${relativePath}: 문서 생명주기 증빙 판정 표는 정확히 1개여야 합니다 (현재 ${tableBlocks.length}개).`,
    );
    return;
  }

  const [headerCells, separatorCells, ...dataRows] = tableBlocks[0];

  if (!cellsEqual(headerCells, lifecycleVerdictTableHeader)) {
    errors.push(
      `${relativePath}: 문서 생명주기 증빙 표 헤더는 '변경 작업 | 판정 | 근거' 3개 열이어야 합니다 (현재 '${headerCells.join(" | ")}').`,
    );
  }

  if (
    !separatorCells ||
    separatorCells.length !== lifecycleVerdictTableHeader.length ||
    !separatorCells.every(isMarkdownTableSeparatorCell)
  ) {
    errors.push(
      `${relativePath}: 문서 생명주기 증빙 표 구분 행은 '--- | --- | ---' 형식의 3개 열이어야 합니다.`,
    );
  }

  const rowCounts = new Map(
    lifecycleVerdictOperations.map((operation) => [operation, 0]),
  );

  for (const cells of dataRows) {
    if (cells.length !== lifecycleVerdictTableHeader.length) {
      errors.push(
        `${relativePath}: 문서 생명주기 판정 행은 정확히 3개 셀이어야 합니다 (현재 ${cells.length}개): '${cells.join(" | ")}'.`,
      );
      continue;
    }

    const operation = cells[0];
    if (!lifecycleVerdictOperationSet.has(operation)) {
      errors.push(
        `${relativePath}: 허용되지 않은 문서 생명주기 판정 행입니다: '${operation}'.`,
      );
      continue;
    }

    rowCounts.set(operation, rowCounts.get(operation) + 1);
  }

  for (const operation of lifecycleVerdictOperations) {
    const rowCount = rowCounts.get(operation);

    if (rowCount !== 1) {
      errors.push(
        `${relativePath}: '${operation}' 판정 행은 각각 정확히 1개여야 합니다 (현재 ${rowCount}개).`,
      );
    }
  }
}

function findMarkdownTableBlocks(sectionLines) {
  const sourceBlocks = [];
  let currentBlock = [];

  const finishCurrentBlock = () => {
    if (currentBlock.length > 0) {
      sourceBlocks.push(currentBlock);
      currentBlock = [];
    }
  };

  for (const entry of sectionLines) {
    if (
      entry.insideFence ||
      entry.insideHtmlComment ||
      entry.line.trim() === ""
    ) {
      finishCurrentBlock();
      continue;
    }

    currentBlock.push(entry.line);
  }
  finishCurrentBlock();

  return sourceBlocks
    .map(parseMarkdownTableBlock)
    .filter((block) => block !== null);
}

function parseMarkdownTableBlock(lines) {
  if (lines.length < 2 || /^(?: {4}|\t)/.test(lines[0])) {
    return null;
  }

  const headerCells = parseMarkdownTableRow(lines[0]);
  const separatorCells = parseMarkdownTableRow(lines[1]);
  if (
    headerCells === null ||
    separatorCells === null ||
    !separatorCells.some(isMarkdownTableSeparatorCell)
  ) {
    return null;
  }

  const dataRows = lines.slice(2).map(
    (line) => parseMarkdownTableRow(line) ?? [line.trim()],
  );
  return [headerCells, separatorCells, ...dataRows];
}

function isMarkdownTableSeparatorCell(cell) {
  return /^:?-{3,}:?$/.test(cell);
}

function parseMarkdownTableRow(line) {
  const trimmed = line.trim();
  const cells = splitMarkdownTableCells(trimmed);

  if (cells === null) {
    return null;
  }

  if (cells[0] === "") {
    cells.shift();
  }
  if (cells.at(-1) === "") {
    cells.pop();
  }

  return cells.map((cell) => cell.trim());
}

function splitMarkdownTableCells(source) {
  const cells = [""];
  let hasSeparator = false;

  for (let index = 0; index < source.length; index += 1) {
    const character = source[index];

    if (character === "|") {
      let precedingBackslashCount = 0;
      for (
        let lookbehindIndex = index - 1;
        lookbehindIndex >= 0 && source[lookbehindIndex] === "\\";
        lookbehindIndex -= 1
      ) {
        precedingBackslashCount += 1;
      }

      if (precedingBackslashCount % 2 === 1) {
        cells[cells.length - 1] += character;
        continue;
      }

      cells.push("");
      hasSeparator = true;
      continue;
    }

    cells[cells.length - 1] += character;
  }

  return hasSeparator ? cells : null;
}

function scanMarkdownLines(lines) {
  const scannedLines = lines.map((line, index) => ({
    index,
    insideFence: false,
    insideHtmlComment: false,
    line,
  }));

  for (let index = 0; index < lines.length; index += 1) {
    const openingFence = parseMarkdownFenceOpening(lines[index]);

    if (openingFence === null) {
      continue;
    }

    const closingFenceIndex = lines.findIndex(
      (line, candidateIndex) =>
        candidateIndex > index &&
        isMarkdownFenceClosing(line, openingFence),
    );

    if (closingFenceIndex === -1) {
      continue;
    }

    for (
      let fencedIndex = index;
      fencedIndex <= closingFenceIndex;
      fencedIndex += 1
    ) {
      scannedLines[fencedIndex].insideFence = true;
    }

    index = closingFenceIndex;
  }

  let insideHtmlComment = false;
  for (const entry of scannedLines) {
    if (entry.insideFence) {
      continue;
    }

    const commentStart = entry.line.indexOf("<!--");
    const startsHtmlComment =
      commentStart !== -1 &&
      entry.line.slice(0, commentStart).trim() === "";
    if (insideHtmlComment || startsHtmlComment) {
      entry.insideHtmlComment = true;
    }

    if (insideHtmlComment) {
      if (entry.line.includes("-->")) {
        insideHtmlComment = false;
      }
      continue;
    }

    if (
      startsHtmlComment &&
      entry.line.indexOf("-->", commentStart + 4) === -1
    ) {
      insideHtmlComment = true;
    }
  }

  return scannedLines;
}

function parseMarkdownFenceOpening(line) {
  const match = line.match(/^[ \t]{0,3}(`{3,}|~{3,})[ \t]*(.*)$/);

  if (!match) {
    return null;
  }

  const header = match[2].trim();
  if (!isSupportedMarkdownFenceHeader(header)) {
    return null;
  }

  return {
    character: match[1][0],
    length: match[1].length,
  };
}

function isSupportedMarkdownFenceHeader(header) {
  if (header === "") {
    return true;
  }

  if (
    isMarkdownFenceAttributeList(header) ||
    isMarkdownFenceOptionList(header)
  ) {
    return true;
  }

  const languageMatch = header.match(
    /^\.?[\p{L}\p{N}_#.+-]+(?:[ \t]+|$)/u,
  );
  if (!languageMatch) {
    return false;
  }

  const remainder = header.slice(languageMatch[0].length).trim();
  return (
    remainder === "" ||
    isMarkdownFenceAttributeList(remainder) ||
    isMarkdownFenceOptionList(remainder)
  );
}

function isMarkdownFenceAttributeList(source) {
  return source.startsWith("{") && source.endsWith("}");
}

function isMarkdownFenceOptionList(source) {
  let remainder = source;
  let optionCount = 0;

  while (remainder !== "") {
    const optionMatch = remainder.match(
      /^(hl_lines|linenums|title)(?:=("|')(.*?)\2)?(?:[ \t]+|$)/,
    );

    if (!optionMatch) {
      return false;
    }

    const [, name, quote, value] = optionMatch;
    if (
      name === "hl_lines" &&
      (!quote || !/^\d+(?:-\d+)?(?:[ \t]+\d+(?:-\d+)?)*$/.test(value))
    ) {
      return false;
    }
    if (
      name === "linenums" &&
      (!quote || !/^\d+(?:[ \t]+\d+)?(?:[ \t]+\d+)?$/.test(value))
    ) {
      return false;
    }

    optionCount += 1;
    remainder = remainder.slice(optionMatch[0].length).trim();
  }

  return optionCount > 0;
}

function isMarkdownFenceClosing(line, openingFence) {
  const match = line.match(/^[ \t]{0,3}(`{3,}|~{3,})[ \t]*$/);

  return (
    match !== null &&
    match[1][0] === openingFence.character &&
    match[1].length === openingFence.length
  );
}

function parseLevelTwoHeading(scannedLines, index) {
  const entry = scannedLines[index];
  if (entry.insideFence || entry.insideHtmlComment) {
    return null;
  }

  const match = entry.line.match(
    /^[ \t]{0,3}##(?!#)(?:[ \t]+(.*)|[ \t]*)$/,
  );

  if (match) {
    return (match[1] ?? "")
      .replace(/[ \t]+#+[ \t]*$/, "")
      .trim();
  }

  const rawHtmlHeading = parseRawHtmlLevelTwoHeading(scannedLines, index);
  if (rawHtmlHeading !== null) {
    return rawHtmlHeading;
  }

  const underline = scannedLines[index + 1];
  if (
    !underline ||
    underline.insideFence ||
    underline.insideHtmlComment ||
    !/^-+[ \t]*$/.test(underline.line) ||
    /^(?: {4}|\t)/.test(entry.line) ||
    entry.line.trim() === ""
  ) {
    return null;
  }

  return entry.line.trim();
}

function parseRawHtmlLevelTwoHeading(scannedLines, index) {
  const openingMatch = scannedLines[index].line.match(
    /^[ \t]{0,3}<h2(?=[\s>]|$)/i,
  );
  if (!openingMatch) {
    return null;
  }

  const sourceLines = [];
  for (let lineIndex = index; lineIndex < scannedLines.length; lineIndex += 1) {
    if (
      scannedLines[lineIndex].insideFence ||
      scannedLines[lineIndex].insideHtmlComment
    ) {
      break;
    }
    sourceLines.push(scannedLines[lineIndex].line);
  }
  const source = sourceLines.join("\n");
  const openingTagEnd = findHtmlTagEnd(source, openingMatch[0].length);
  if (openingTagEnd === -1) {
    return null;
  }

  const content = source.slice(openingTagEnd + 1);
  const closingTagIndex = content.search(/<\/h2[ \t]*>/i);
  return closingTagIndex === -1
    ? null
    : content.slice(0, closingTagIndex).trim();
}

function findHtmlTagEnd(source, startIndex) {
  let quote = null;

  for (let index = startIndex; index < source.length; index += 1) {
    const character = source[index];

    if (quote !== null) {
      if (character === quote) {
        quote = null;
      }
      continue;
    }

    if (character === '"' || character === "'") {
      quote = character;
      continue;
    }

    if (character === ">") {
      return index;
    }
  }

  return -1;
}

function normalizeMarkdownHeadingText(source) {
  const withoutInlineMarkup = source
    .replace(/<!--[\s\S]*?-->/g, "")
    .replace(/<\/?[A-Za-z][^>]*>/g, "")
    .replace(/!\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
    .replace(/\[([^\]]+)\]\[[^\]]*\]/g, "$1")
    .replace(/`+([^`]*?)`+/g, "$1")
    .replace(/\\([\\`*_[\]{}()#+\-.!<>])/g, "$1")
    .replace(/[*_~]/g, "");

  const decodedEntities = withoutInlineMarkup
    .replace(/&#(?:x([0-9a-f]+)|([0-9]+));/gi, (entity, hex, decimal) => {
      const codePoint = Number.parseInt(hex ?? decimal, hex ? 16 : 10);
      return Number.isInteger(codePoint) && codePoint <= 0x10ffff
        ? String.fromCodePoint(codePoint)
        : entity;
    })
    .replace(
      /&(amp|lt|gt|quot|apos|nbsp|ZeroWidthSpace|zwj|zwnj);/gi,
      (entity, name) => {
        const namedEntities = {
          amp: "&",
          apos: "'",
          gt: ">",
          lt: "<",
          nbsp: " ",
          quot: '"',
          zerowidthspace: "\u200b",
          zwj: "\u200d",
          zwnj: "\u200c",
        };
        return namedEntities[name.toLowerCase()] ?? entity;
      },
    );

  return decodedEntities
    .normalize("NFKC")
    .replace(/\p{Cf}/gu, "")
    .replace(/\s+/g, " ")
    .trim();
}

function cellsEqual(actual, expected) {
  return (
    actual.length === expected.length &&
    actual.every((cell, index) => cell === expected[index])
  );
}

function inferDirectoryKind(relativePath) {
  const parts = relativePath.split(path.sep);

  if (parts.includes("policy")) {
    return "policy";
  }
  if (parts.includes("flows")) {
    return "flow";
  }
  if (parts.includes("technical-debt")) {
    return "technical-debt";
  }
  if (parts.includes("releases")) {
    return "flow";
  }

  return null;
}
