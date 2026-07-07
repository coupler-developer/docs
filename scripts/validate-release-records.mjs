import fs from "node:fs";
import path from "node:path";

const docsRoot = process.cwd();
const releasesRoot = path.join(docsRoot, "content", "releases");
const requiredSections = [
  "목적",
  "범위",
  "상위 규범 문서",
  "릴리스 상태",
  "릴리스 결과",
  "메인 흐름",
  "검증 근거",
  "롤백 기준",
  "관련 문서",
];
const allowedStatuses = new Set([
  "planned",
  "in_progress",
  "released",
  "rolled_back",
  "superseded",
]);
const allowedApiContractCutoverStatuses = new Set([
  "pending",
  "ready",
  "released",
  "rollback",
]);
const forbiddenPatterns = [
  /TODO/i,
  /TBD/i,
  /추후 작성/,
  /이 문서가 포함된/,
];
const apiContractCutoverSignals = [
  /API contract cutover/i,
  /ErrorData contract cutover/i,
  /공통 응답.*cutover/i,
];
const apiContractCutoverRequiredValueLabels = [
  "`coupler-api`",
  "`coupler-mobile-app`",
  "`coupler-admin-web`",
  "명령",
  "결과",
  "Store version/build 또는 NextPush app/deployment/label",
  "운영 출시/적용 시각",
  "확인 URL 또는 콘솔 증빙",
  "기존 N version/build",
  "강제 업데이트 설정 위치",
  "`version_code < min_version` 요청 결과",
  "앱 버전 설정 화면 저장 검증",
  "변경 데이터 조회/운영자 액션 smoke",
  "직전 호환 API/Admin/Mobile SHA 또는 tag",
  "DB 백업/복구 기준",
  "되돌림 금지/주의 사항",
];
// Published release records remain immutable unless factual evidence changes.
const legacyRecordsWithoutVersionMapping = new Set([
  path.join("content", "releases", "v2.0.0.md"),
  path.join("content", "releases", "v2.1.0.md"),
  path.join("content", "releases", "v2.2.0.md"),
  path.join("content", "releases", "v2.2.1.md"),
  path.join("content", "releases", "v2.2.2.md"),
  path.join("content", "releases", "v2.2.3.md"),
  path.join("content", "releases", "v2.2.4.md"),
]);

const errors = [];

if (fs.existsSync(releasesRoot)) {
  for (const entry of fs.readdirSync(releasesRoot, { withFileTypes: true })) {
    if (!entry.isFile() || !/^v\d+\.\d+\.\d+\.md$/.test(entry.name)) {
      continue;
    }

    const tag = entry.name.replace(/\.md$/, "");
    const relativePath = path.join("content", "releases", entry.name);
    const absolutePath = path.join(releasesRoot, entry.name);
    const source = fs.readFileSync(absolutePath, "utf8");
    validateReleaseRecord(relativePath, source, tag, errors);
  }
}

if (errors.length > 0) {
  for (const error of errors) {
    console.error(error);
  }
  process.exit(1);
}

console.log("릴리스 기록 검증 통과");

function validateReleaseRecord(relativePath, source, tag, errors) {
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

  const statusMatch = statusSection.match(
    /- (?:전체 상태|최종 상태): `([^`]+)`/,
  );
  if (!statusMatch) {
    errors.push(`${relativePath}: 전체 상태 또는 최종 상태를 backtick 값으로 기록해야 합니다.`);
  } else if (!allowedStatuses.has(statusMatch[1])) {
    errors.push(`${relativePath}: 허용되지 않은 릴리스 상태입니다: ${statusMatch[1]}`);
  }

  if (statusMatch?.[1] === "released" && /대기|pending|in_review/i.test(statusSection)) {
    errors.push(`${relativePath}: released 상태에는 대기 범위를 남길 수 없습니다.`);
  }

  if (statusMatch?.[1] === "in_progress" && !/- 대기 범위:/.test(statusSection)) {
    errors.push(`${relativePath}: in_progress 상태에는 대기 범위를 명시해야 합니다.`);
  }

  validateListSection(relativePath, source, "목적", /^- /, errors);
  validateListSection(relativePath, source, "릴리스 상태", /^- /, errors);
  validateVersionMappingSectionIfRequired(relativePath, source, errors);
  validateListSection(relativePath, source, "릴리스 결과", /^- /, errors);
  validateListSection(relativePath, source, "메인 흐름", /^[0-9]+\.\s+/, errors);
  validateListSection(relativePath, source, "검증 근거", /^- /, errors);
  validateApiContractCutoverGate(relativePath, source, statusMatch?.[1], errors);
  validateListSection(relativePath, source, "롤백 기준", /^- /, errors);
}

function validateApiContractCutoverGate(relativePath, source, releaseStatus, errors) {
  const hasCutoverSignal = apiContractCutoverSignals.some((pattern) => pattern.test(source));
  const section = extractHeadingSection(source, 3, "API contract cutover Gate");

  if (!hasCutoverSignal && !section.trim()) {
    return;
  }

  if (!section.trim()) {
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
  } else if (releaseStatus === "released" && cutoverStatusMatch[1] !== "released") {
    errors.push(
      `${relativePath}: released 릴리스의 API contract cutover Gate는 released 상태여야 합니다.`,
    );
  }

  for (const label of apiContractCutoverRequiredValueLabels) {
    const labelPattern = new RegExp(
      `^\\s*- ${escapeRegExp(label)}:\\s*(.+)$`,
      "m",
    );
    const valueMatch = section.match(labelPattern);
    if (!valueMatch || !valueMatch[1].trim()) {
      errors.push(
        `${relativePath}: API contract cutover Gate 항목 값을 기록해야 합니다: ${label}`,
      );
    }
  }
}

function validateVersionMappingSectionIfRequired(relativePath, source, errors) {
  const section = extractSection(source, "버전 매핑");
  if (!section.trim() && legacyRecordsWithoutVersionMapping.has(relativePath)) {
    return;
  }

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

function extractSection(source, sectionTitle) {
  const lines = source.split("\n");
  const result = [];
  let inSection = false;

  for (const line of lines) {
    if (line === `## ${sectionTitle}`) {
      inSection = true;
      continue;
    }

    if (inSection && line.startsWith("## ")) {
      break;
    }

    if (inSection) {
      result.push(line);
    }
  }

  return result.join("\n");
}

function extractHeadingSection(source, level, sectionTitle) {
  const marker = `${"#".repeat(level)} ${sectionTitle}`;
  const lines = source.split("\n");
  const result = [];
  let inSection = false;

  for (const line of lines) {
    if (line === marker) {
      inSection = true;
      continue;
    }

    if (inSection && /^#{1,6}\s+/.test(line)) {
      const headingLevel = line.match(/^#+/)?.[0].length ?? 0;
      if (headingLevel <= level) {
        break;
      }
    }

    if (inSection) {
      result.push(line);
    }
  }

  return result.join("\n");
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
