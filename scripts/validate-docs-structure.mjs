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
  const sectionMatch = source.match(
    /## 문서 생명주기 증빙\s*\n([\s\S]*?)(?=\n##\s|\s*$)/,
  );

  if (!sectionMatch) {
    errors.push(`${relativePath}: 문서 생명주기 증빙 절이 없습니다.`);
    return;
  }

  const section = sectionMatch[1];
  const rowCounts = new Map(
    lifecycleVerdictOperations.map((operation) => [operation, 0]),
  );

  for (const line of section.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed.startsWith("|")) {
      continue;
    }

    const firstCell = trimmed.split("|")[1]?.trim();
    if (
      !firstCell ||
      firstCell === "변경 작업" ||
      /^:?-{3,}:?$/.test(firstCell)
    ) {
      continue;
    }

    const operationMatch = firstCell.match(/^([^:]+):/);
    if (!operationMatch) {
      errors.push(
        `${relativePath}: 판정 행은 '<작업>: <검토 기준>' 형식이어야 합니다: '${firstCell}'.`,
      );
      continue;
    }

    const operation = operationMatch[1].trim();
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
