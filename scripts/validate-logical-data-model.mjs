import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const allowedEntityKinds = new Set(["root", "child", "relation"]);
const allowedRecordRoles = new Set([
  "state",
  "ledger",
  "history",
  "snapshot",
  "reference",
  "projection",
]);
const allowedClassifications = new Set(["일반", "내부", "민감"]);
const allowedRelationshipKinds = new Set([
  "owns",
  "references",
  "associates",
  "derives-from",
]);
const allowedCardinalities = new Set(["1:1", "1:N", "N:1", "N:M"]);
const domainIdPattern = /^[a-z0-9]+(?:-[a-z0-9]+)*$/u;
const entityIdPattern =
  /^[a-z0-9]+(?:-[a-z0-9]+)*\.[a-z0-9]+(?:-[a-z0-9]+)*$/u;
const invariantIdPattern = /^[A-Z0-9]+(?:-[A-Z0-9]+)*-INV-\d{3}$/u;
const physicalSchemaPattern =
  /\bt_[a-z0-9_]+\b|\b(?:CREATE|ALTER|DROP)\s+(?:TABLE|VIEW)\b|\b(?:BIGINT|TINYINT|SMALLINT|VARCHAR|DATETIME|TIMESTAMP)\b/iu;

const entityHeaders = [
  "논리 ID",
  "표시명",
  "구조 유형",
  "기록 역할",
  "책임",
  "최고 데이터 분류",
  "생명주기",
];
const relationshipHeaders = [
  "출발 논리 ID",
  "관계 유형",
  "도착 논리 ID",
  "카디널리티",
  "소유·삭제 규칙",
];
const invariantHeaders = [
  "규칙 ID",
  "관련 논리 ID",
  "불변조건",
  "기준 문서",
];
const domainHeaders = ["도메인 ID", "표시명", "책임 범위", "소유 문서"];

const defaultRoot = process.cwd();
const defaultIndexPath = path.join(
  defaultRoot,
  "content",
  "architecture",
  "logical-data-model-index.md",
);
const defaultCatalogPath = path.join(
  defaultRoot,
  "generated",
  "logical-data-model-catalog.json",
);

export const canonicalJson = (value) => `${JSON.stringify(value, null, 2)}\n`;

export function validateLogicalDataModel({
  root = defaultRoot,
  indexPath = defaultIndexPath,
  catalogPath = defaultCatalogPath,
  checkCatalog = true,
} = {}) {
  const errors = [];
  const indexSource = readFile(indexPath, errors, "논리 데이터 모델 인덱스");
  if (indexSource === null) {
    return { errors, catalog: null };
  }

  const domainTable = parseTableAfterHeading(
    indexSource,
    "## 데이터 소유 도메인",
    domainHeaders,
    "논리 데이터 모델 인덱스",
    errors,
  );
  const domains = [];
  const domainIds = new Set();
  const ownerDocuments = new Set();

  for (const row of domainTable.rows) {
    const domainId = stripCode(row[0]);
    const displayName = row[1].trim();
    const responsibility = row[2].trim();
    const ownerLink = parseMarkdownLink(row[3]);

    if (!domainIdPattern.test(domainId)) {
      errors.push(`인덱스: 잘못된 도메인 ID입니다: ${domainId}`);
    }
    if (domainIds.has(domainId)) {
      errors.push(`인덱스: 중복 도메인 ID입니다: ${domainId}`);
    }
    domainIds.add(domainId);

    if (!ownerLink) {
      errors.push(`인덱스: 소유 문서는 Markdown 링크여야 합니다: ${domainId}`);
      continue;
    }

    const ownerRelativePath = path
      .join("content", "architecture", ownerLink.target)
      .split(path.sep)
      .join("/");
    if (ownerDocuments.has(ownerRelativePath)) {
      errors.push(`인덱스: 하나의 문서가 여러 도메인을 소유합니다: ${ownerRelativePath}`);
    }
    ownerDocuments.add(ownerRelativePath);

    domains.push({
      id: domainId,
      name: displayName,
      responsibility,
      ownerDocument: ownerRelativePath,
    });
  }

  const entityIds = new Set();
  const invariantIds = new Set();
  const relationships = [];
  const catalogDomains = [];
  const catalogEntities = [];

  for (const domain of domains) {
    const ownerPath = path.join(root, ...domain.ownerDocument.split("/"));
    const ownerSource = readFile(ownerPath, errors, domain.ownerDocument);
    if (ownerSource === null) {
      continue;
    }

    const modelSectionCount = countHeading(ownerSource, "## 논리 데이터 모델");
    if (modelSectionCount !== 1) {
      errors.push(
        `${domain.ownerDocument}: 논리 데이터 모델 절은 정확히 1개여야 합니다. 현재 ${modelSectionCount}개`,
      );
      continue;
    }

    const modelSection = extractSection(ownerSource, "## 논리 데이터 모델");
    const declaredDomainId =
      modelSection.match(/^- 도메인 ID:\s*`([^`]+)`\s*$/mu)?.[1] ?? "";
    if (declaredDomainId !== domain.id) {
      errors.push(
        `${domain.ownerDocument}: 도메인 ID가 인덱스와 다릅니다. expected=${domain.id}, actual=${declaredDomainId || "(없음)"}`,
      );
    }

    const status =
      ownerSource.match(/^- 기준 성격:\s*`([^`]+)`\s*$/mu)?.[1] ?? "";
    if (status === "transition") {
      errors.push(
        `${domain.ownerDocument}: 논리 모델 소유 문서는 transition 기준을 사용할 수 없습니다.`,
      );
    }

    if (physicalSchemaPattern.test(modelSection)) {
      errors.push(
        `${domain.ownerDocument}: 논리 데이터 모델 절에 물리 테이블·DDL·SQL 타입이 포함되어 있습니다.`,
      );
    }

    const entityTable = parseTableAfterHeading(
      modelSection,
      "### 논리 엔티티",
      entityHeaders,
      domain.ownerDocument,
      errors,
    );
    const relationshipTable = parseTableAfterHeading(
      modelSection,
      "### 관계",
      relationshipHeaders,
      domain.ownerDocument,
      errors,
    );
    const invariantTable = parseTableAfterHeading(
      modelSection,
      "### 불변조건",
      invariantHeaders,
      domain.ownerDocument,
      errors,
    );

    const domainEntityIds = [];
    for (const row of entityTable.rows) {
      const entityId = stripCode(row[0]);
      const kind = stripCode(row[2]);
      const recordRole = stripCode(row[3]);
      const classification = stripCode(row[5]);

      if (!entityIdPattern.test(entityId)) {
        errors.push(`${domain.ownerDocument}: 잘못된 논리 ID입니다: ${entityId}`);
      }
      if (!entityId.startsWith(`${domain.id}.`)) {
        errors.push(
          `${domain.ownerDocument}: 논리 ID가 소유 도메인 prefix를 사용하지 않습니다: ${entityId}`,
        );
      }
      if (entityIds.has(entityId)) {
        errors.push(`${domain.ownerDocument}: 중복 논리 ID입니다: ${entityId}`);
      }
      entityIds.add(entityId);
      domainEntityIds.push(entityId);

      if (!allowedEntityKinds.has(kind)) {
        errors.push(`${domain.ownerDocument}: 허용되지 않은 구조 유형입니다: ${kind}`);
      }
      if (!allowedRecordRoles.has(recordRole)) {
        errors.push(`${domain.ownerDocument}: 허용되지 않은 기록 역할입니다: ${recordRole}`);
      }
      if (!allowedClassifications.has(classification)) {
        errors.push(
          `${domain.ownerDocument}: 허용되지 않은 데이터 분류입니다: ${classification}`,
        );
      }

      catalogEntities.push({
        id: entityId,
        domainId: domain.id,
        ownerDocument: domain.ownerDocument,
        kind,
        recordRole,
        classification,
      });
    }

    if (domainEntityIds.length === 0) {
      errors.push(`${domain.ownerDocument}: 논리 엔티티가 1개 이상 필요합니다.`);
    }

    for (const row of relationshipTable.rows) {
      const source = stripCode(row[0]);
      const kind = stripCode(row[1]);
      const target = stripCode(row[2]);
      const cardinality = stripCode(row[3]);

      if (!allowedRelationshipKinds.has(kind)) {
        errors.push(`${domain.ownerDocument}: 허용되지 않은 관계 유형입니다: ${kind}`);
      }
      if (!allowedCardinalities.has(cardinality)) {
        errors.push(`${domain.ownerDocument}: 허용되지 않은 카디널리티입니다: ${cardinality}`);
      }
      relationships.push({ source, target, ownerDocument: domain.ownerDocument });
    }

    for (const row of invariantTable.rows) {
      const invariantId = stripCode(row[0]);
      const relatedEntityId = stripCode(row[1]);

      if (!invariantIdPattern.test(invariantId)) {
        errors.push(`${domain.ownerDocument}: 잘못된 불변조건 ID입니다: ${invariantId}`);
      }
      if (invariantIds.has(invariantId)) {
        errors.push(`${domain.ownerDocument}: 중복 불변조건 ID입니다: ${invariantId}`);
      }
      invariantIds.add(invariantId);
      relationships.push({
        source: relatedEntityId,
        target: relatedEntityId,
        ownerDocument: domain.ownerDocument,
        invariant: true,
      });
    }

    catalogDomains.push({
      id: domain.id,
      name: domain.name,
      ownerDocument: domain.ownerDocument,
      entityIds: [...domainEntityIds].sort(),
    });
  }

  for (const relationship of relationships) {
    if (!entityIds.has(relationship.source)) {
      const label = relationship.invariant ? "불변조건 관련" : "관계 출발";
      errors.push(
        `${relationship.ownerDocument}: ${label} 논리 ID가 존재하지 않습니다: ${relationship.source}`,
      );
    }
    if (!entityIds.has(relationship.target)) {
      errors.push(
        `${relationship.ownerDocument}: 관계 도착 논리 ID가 존재하지 않습니다: ${relationship.target}`,
      );
    }
  }

  const catalog = {
    version: 1,
    source: {
      index: "content/architecture/logical-data-model-index.md",
    },
    domains: catalogDomains.sort((left, right) => left.id.localeCompare(right.id)),
    entities: catalogEntities.sort((left, right) => left.id.localeCompare(right.id)),
  };

  if (checkCatalog) {
    const catalogSource = readFile(
      catalogPath,
      errors,
      path.relative(root, catalogPath) || catalogPath,
    );
    if (catalogSource !== null && catalogSource !== canonicalJson(catalog)) {
      errors.push(
        `${path.relative(root, catalogPath)}: 생성된 논리 데이터 모델 catalog가 최신 상태가 아닙니다.`,
      );
    }
  }

  return { errors, catalog };
}

function readFile(filePath, errors, label) {
  if (!fs.existsSync(filePath)) {
    errors.push(`${label}: 파일이 존재하지 않습니다.`);
    return null;
  }
  return fs.readFileSync(filePath, "utf8");
}

function countHeading(source, heading) {
  return source
    .split("\n")
    .filter((line) => line.trim() === heading).length;
}

function extractSection(source, heading) {
  const lines = source.split("\n");
  const start = lines.findIndex((line) => line.trim() === heading);
  if (start < 0) {
    return "";
  }
  const level = heading.match(/^#+/u)?.[0].length ?? 1;
  let end = lines.length;
  for (let index = start + 1; index < lines.length; index += 1) {
    const match = lines[index].match(/^(#+)\s/u);
    if (match && match[1].length <= level) {
      end = index;
      break;
    }
  }
  return lines.slice(start, end).join("\n");
}

function parseTableAfterHeading(source, heading, expectedHeaders, label, errors) {
  const section = extractSection(source, heading);
  if (!section) {
    errors.push(`${label}: 필수 절이 없습니다: ${heading}`);
    return { headers: [], rows: [] };
  }

  const tableLines = section
    .split("\n")
    .filter((line) => line.trim().startsWith("|"));
  if (tableLines.length < 2) {
    errors.push(`${label}: ${heading} 표가 없습니다.`);
    return { headers: [], rows: [] };
  }

  const headers = parseTableRow(tableLines[0]);
  if (canonicalJson(headers) !== canonicalJson(expectedHeaders)) {
    errors.push(
      `${label}: ${heading} 표 헤더가 표준과 다릅니다. expected=${expectedHeaders.join(" | ")}`,
    );
  }

  const rows = tableLines
    .slice(2)
    .map(parseTableRow)
    .filter((row) => row.some((cell) => cell.length > 0));

  for (const row of rows) {
    if (row.length !== expectedHeaders.length) {
      errors.push(
        `${label}: ${heading} 표의 열 수가 다릅니다. expected=${expectedHeaders.length}, actual=${row.length}`,
      );
    }
  }

  return { headers, rows };
}

function parseTableRow(line) {
  return line
    .trim()
    .replace(/^\|/u, "")
    .replace(/\|$/u, "")
    .split("|")
    .map((cell) => cell.trim());
}

function stripCode(value) {
  return value.trim().replace(/^`([^`]+)`$/u, "$1");
}

function parseMarkdownLink(value) {
  const match = value.trim().match(/^\[([^\]]+)\]\(([^)]+)\)$/u);
  return match ? { label: match[1], target: match[2] } : null;
}

const isMain =
  process.argv[1] &&
  path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url));

if (isMain) {
  const writeCatalog = process.argv.includes("--write-catalog");
  const result = validateLogicalDataModel({ checkCatalog: !writeCatalog });

  if (result.errors.length > 0) {
    result.errors.forEach((error) => console.error(error));
    process.exit(1);
  }

  if (writeCatalog) {
    fs.mkdirSync(path.dirname(defaultCatalogPath), { recursive: true });
    fs.writeFileSync(defaultCatalogPath, canonicalJson(result.catalog));
    console.log(
      `논리 데이터 모델 catalog 생성: ${result.catalog.domains.length}개 도메인, ${result.catalog.entities.length}개 엔티티`,
    );
  } else {
    console.log(
      `논리 데이터 모델 검증 통과: ${result.catalog.domains.length}개 도메인, ${result.catalog.entities.length}개 엔티티`,
    );
  }
}
