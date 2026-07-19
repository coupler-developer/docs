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
const allowedLiteralIpv4Addresses = new Set([
  "0.0.0.0",
  "10.0.2.2",
  "10.0.3.2",
]);
const ipv4Pattern = /\b(?:\d{1,3}\.){3}\d{1,3}\b/g;
const sensitiveIdentityPatterns = [
  {
    label: "DB database_name",
    pattern: /\bdatabase_name\b["']?\s*[:=]\s*["']?[A-Za-z0-9._-]+\b/g,
  },
  {
    label: "DB server_id",
    pattern: /\bserver_id\b["']?\s*[:=]\s*["']?\d+\b/g,
  },
  {
    label: "DB server_hostname",
    pattern:
      /\bserver_hostname\b["']?\s*[:=]\s*["']?[A-Za-z0-9._-]+\b/g,
  },
  {
    label: "DB server_version",
    pattern:
      /\bserver_version\b["']?\s*[:=]\s*["']?[A-Za-z0-9._-]+\b/g,
  },
];

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

const errors = [];
const navRefs = parseMkdocsNavRefs(
  fs.readFileSync(mkdocsPath, "utf8"),
  errors,
);
const agentsRefs = parseAgentsIndexRefs(
  fs.readFileSync(agentsPath, "utf8"),
  errors,
);
const allowedNavRefs = new Set(["README.md", "AGENTS.md", ...contentDocs]);
const allowedAgentsRefs = new Set(["README.md", ...contentDocs]);

for (const relativePath of relativePaths) {
  const source = fs.readFileSync(path.join(contentRoot, relativePath), "utf8");
  validateSensitiveInfrastructureLiterals(relativePath, source, errors);
}

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

  if (!agentsRefs.has(relativePath)) {
    errors.push(`${relativePath}: content/AGENTS.md 인덱스에 문서 링크가 없습니다.`);
  }
}

for (const relativePath of ["README.md", "AGENTS.md"]) {
  if (!navRefs.has(relativePath)) {
    errors.push(`mkdocs.yml nav에 필수 진입 문서 링크가 없습니다: ${relativePath}`);
  }
}

if (!agentsRefs.has("README.md")) {
  errors.push("content/AGENTS.md 인덱스에 README.md 링크가 없습니다.");
}

for (const relativePath of templateDocs) {
  const source = fs.readFileSync(path.join(contentRoot, relativePath), "utf8");
  validateMetadata(relativePath, source, errors, { isTemplate: true });
}

for (const ref of navRefs) {
  if (!allowedNavRefs.has(ref)) {
    errors.push(`mkdocs.yml nav에 등록할 수 없는 문서 링크가 있습니다: ${ref}`);
  }

  if (!fs.existsSync(path.join(contentRoot, ref))) {
    errors.push(`mkdocs.yml: 존재하지 않는 문서를 참조합니다: ${ref}`);
  }
}

for (const ref of agentsRefs) {
  if (!allowedAgentsRefs.has(ref)) {
    errors.push(`content/AGENTS.md 인덱스에 등록할 수 없는 문서 링크가 있습니다: ${ref}`);
  }

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

function parseMkdocsNavRefs(source, errors) {
  const lines = source.split("\n");
  const navLineIndexes = lines
    .map((line, index) => ({ line, index }))
    .filter(({ line }) => /^nav:\s*$/.test(line))
    .map(({ index }) => index);

  if (navLineIndexes.length !== 1) {
    errors.push("mkdocs.yml: 최상위 'nav:' 절은 정확히 1개여야 합니다.");
    return new Set();
  }

  const navLines = [];
  for (const line of lines.slice(navLineIndexes[0] + 1)) {
    if (line !== "" && !/^\s/.test(line) && !/^\s*#/.test(line)) {
      break;
    }
    navLines.push(line);
  }

  return parseMkdocsRefs(navLines.join("\n"), errors);
}

function parseMkdocsRefs(source, errors) {
  const refs = new Set();

  for (const line of source.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed.startsWith("- ") || !trimmed.includes(".md")) {
      continue;
    }

    const [, rawRef] = trimmed.split(":", 2);
    if (rawRef) {
      addUniqueRef(refs, rawRef.trim(), "mkdocs.yml nav", errors);
    }
  }

  return refs;
}

function parseAgentsIndexRefs(source, errors) {
  const headings = [...source.matchAll(/^## 문서 인덱스\s*$/gm)];

  if (headings.length !== 1) {
    errors.push("content/AGENTS.md: '## 문서 인덱스' 절은 정확히 1개여야 합니다.");
    return new Set();
  }

  const sectionStart = headings[0].index + headings[0][0].length;
  const remainingSource = source.slice(sectionStart);
  const nextSectionOffset = remainingSource.search(/^##\s+/m);
  const indexSource =
    nextSectionOffset === -1
      ? remainingSource
      : remainingSource.slice(0, nextSectionOffset);

  return parseMarkdownLinks(
    indexSource,
    "content/AGENTS.md 문서 인덱스",
    errors,
  );
}

function parseMarkdownLinks(source, context, errors) {
  const refs = new Set();
  const linkPattern = /\[[^\]]+\]\(([^)]+\.md)\)/g;

  for (const match of source.matchAll(linkPattern)) {
    addUniqueRef(refs, match[1], context, errors);
  }

  return refs;
}

function addUniqueRef(refs, ref, context, errors) {
  if (refs.has(ref)) {
    errors.push(`${context}: 중복 문서 링크가 있습니다: ${ref}`);
    return;
  }

  refs.add(ref);
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

  if (!allowedKinds) {
    errors.push(`${relativePath}: 허용되지 않은 최상위 문서 디렉터리입니다: ${topLevel}`);
    return;
  }

  if (!allowedKinds.has(kind)) {
    errors.push(
      `${relativePath}: 디렉터리 분류(${topLevel})에서 문서 종류 '${kind}'을 사용할 수 없습니다.`,
    );
  }
}

function validateSensitiveInfrastructureLiterals(relativePath, source, errors) {
  for (const match of source.matchAll(ipv4Pattern)) {
    const address = match[0];
    const octets = address.split(".").map(Number);
    const isValidIpv4 = octets.every((octet) => octet >= 0 && octet <= 255);
    const isLoopback = octets[0] === 127;
    const isDocumentationRange =
      (octets[0] === 192 && octets[1] === 0 && octets[2] === 2) ||
      (octets[0] === 198 && octets[1] === 51 && octets[2] === 100) ||
      (octets[0] === 203 && octets[1] === 0 && octets[2] === 113);

    if (
      !isValidIpv4 ||
      isLoopback ||
      isDocumentationRange ||
      allowedLiteralIpv4Addresses.has(address)
    ) {
      continue;
    }

    errors.push(
      `${relativePath}:${lineNumberAt(source, match.index)}: 공개 문서에 실제 환경으로 오인 가능한 IPv4 literal을 둘 수 없습니다. 환경명 또는 문서 예시용 주소로 익명화하세요.`,
    );
  }

  for (const { label, pattern } of sensitiveIdentityPatterns) {
    for (const match of source.matchAll(pattern)) {
      errors.push(
        `${relativePath}:${lineNumberAt(source, match.index)}: 공개 문서에 ${label} literal을 둘 수 없습니다. 환경 식별 검증 결과만 남기세요.`,
      );
    }
  }
}

function lineNumberAt(source, index) {
  return source.slice(0, index).split("\n").length;
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
