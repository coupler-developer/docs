import fs from "node:fs";
import path from "node:path";

const docsRoot = process.cwd();
const contentRoot = path.join(docsRoot, "content");
const mkdocsPath = path.join(docsRoot, "mkdocs.yml");
const agentsPath = path.join(contentRoot, "AGENTS.md");

const roleByKind = new Map([
  ["policy", "규범"],
  ["architecture", "설명"],
  ["fsm", "시각화"],
  ["flow", "시나리오"],
  ["technical-debt", "부채"],
]);
const allowedStatuses = new Set(["as-is", "to-be", "transition"]);
const templateStatusPlaceholder = "<as-is | to-be | transition 중 하나>";
const ignoredRootPaths = new Set(["AGENTS.md", "README.md", "CLAUDE.md"]);
const fragmentTemplates = new Set([
  "templates/api-contract-cutover-gate-template.md",
]);
const allowedKindsByTopLevel = new Map([
  ["architecture", new Set(["architecture", "fsm"])],
  ["flows", new Set(["flow"])],
  ["policy", new Set(["policy"])],
  ["releases", new Set(["flow"])],
  ["technical-debt", new Set(["technical-debt"])],
]);

const markdownFiles = [];
walkMarkdownFiles(contentRoot, markdownFiles);

const relativePaths = markdownFiles.map((filePath) =>
  path.relative(contentRoot, filePath),
);
const contentDocs = relativePaths.filter(
  (relativePath) =>
    !ignoredRootPaths.has(relativePath) &&
    !relativePath.startsWith(`templates${path.sep}`),
);
const templateDocs = relativePaths.filter(
  (relativePath) =>
    relativePath.startsWith(`templates${path.sep}`) &&
    !fragmentTemplates.has(relativePath),
);

const navRefs = parseMkdocsRefs(fs.readFileSync(mkdocsPath, "utf8"));
const agentsRefs = parseMarkdownLinks(fs.readFileSync(agentsPath, "utf8"));
const errors = [];

for (const relativePath of contentDocs) {
  const source = fs.readFileSync(path.join(contentRoot, relativePath), "utf8");
  const metadata = validateMetadata(relativePath, source, errors);

  if (metadata) {
    validatePathKind(relativePath, metadata.kind, errors);
    validateTransitionTracking(relativePath, source, metadata, errors);
  }

  if (!navRefs.has(relativePath)) {
    errors.push(`${relativePath}: mkdocs.yml nav에 문서 링크가 없습니다.`);
  }

  if (!agentsRefs.has(relativePath) && relativePath !== "README.md") {
    errors.push(`${relativePath}: content/AGENTS.md 인덱스에 문서 링크가 없습니다.`);
  }
}

for (const relativePath of templateDocs) {
  const source = fs.readFileSync(path.join(contentRoot, relativePath), "utf8");
  validateMetadata(relativePath, source, errors, { isTemplate: true });
}

for (const ref of navRefs) {
  if (!fs.existsSync(path.join(contentRoot, ref))) {
    errors.push(`mkdocs.yml: 존재하지 않는 문서를 참조합니다: ${ref}`);
  }
}

for (const ref of agentsRefs) {
  if (!fs.existsSync(path.join(contentRoot, ref))) {
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
  `docs 구조 검증 통과: ${contentDocs.length}개 문서, ${templateDocs.length}개 독립 템플릿, nav ${navRefs.size}개, AGENTS 인덱스 ${agentsRefs.size}개`,
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

function parseMkdocsRefs(source) {
  const refs = new Set();

  for (const line of source.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed.startsWith("- ") || !trimmed.includes(".md")) {
      continue;
    }

    const [, rawRef] = trimmed.split(":", 2);
    if (rawRef) {
      refs.add(rawRef.trim());
    }
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

function validateMetadata(
  relativePath,
  source,
  errors,
  { isTemplate = false } = {},
) {
  const sectionMatch = source.match(
    /## 문서 역할\s*\n\s*\n- 역할: `([^`]+)`\n- 문서 종류: `([^`]+)`\n- 충돌 시 우선 문서: .+\n- 기준 성격: `([^`]+)`/,
  );

  if (!sectionMatch) {
    errors.push(`${relativePath}: 문서 역할 메타데이터 형식이 정책 표준과 다릅니다.`);
    return null;
  }

  const [, role, kind, status] = sectionMatch;
  const expectedRole = roleByKind.get(kind);

  if (!expectedRole) {
    errors.push(`${relativePath}: 허용되지 않은 문서 종류입니다: ${kind}`);
  } else if (role !== expectedRole) {
    errors.push(
      `${relativePath}: 문서 종류 '${kind}'의 역할은 '${expectedRole}'이어야 합니다 (현재 '${role}').`,
    );
  }

  const statusIsValid =
    allowedStatuses.has(status) ||
    (isTemplate && status === templateStatusPlaceholder);
  if (!statusIsValid) {
    errors.push(`${relativePath}: 허용되지 않은 기준 성격입니다: ${status}`);
  }

  return { kind, role, status };
}

function validatePathKind(relativePath, kind, errors) {
  const [topLevel] = relativePath.split(path.sep);
  const allowedKinds = allowedKindsByTopLevel.get(topLevel);

  if (allowedKinds && !allowedKinds.has(kind)) {
    errors.push(
      `${relativePath}: 디렉터리 분류(${topLevel})에서 문서 종류 '${kind}'을 사용할 수 없습니다.`,
    );
  }
}

function validateTransitionTracking(relativePath, source, metadata, errors) {
  if (metadata.status === "as-is" || metadata.kind === "technical-debt") {
    return;
  }

  const hasTrackingDocumentLink = source
    .split(/\n\s*\n/)
    .some(
      (paragraph) =>
        /(?:완료|추적)/.test(paragraph) &&
        /\[[^\]]+\]\((?:\.\.\/|\.\/|\/|content\/)*(?:technical-debt|flows|releases)\/[^)]*\.md(?:#[^)]*)?\)/.test(
          paragraph,
        ),
    );
  const policyTracksItself =
    metadata.kind === "policy" &&
    source.includes("완료 조건") &&
    source.includes("전환 추적");

  if (!hasTrackingDocumentLink && !policyTracksItself) {
    errors.push(
      `${relativePath}: '${metadata.status}' 문서는 완료 조건을 추적하는 문서 링크 또는 정책 내부 전환 추적을 가져야 합니다.`,
    );
  }
}
