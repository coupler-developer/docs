import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const allowedLifecycleRoles = new Set(["root", "child"]);
const allowedEntityShapes = new Set(["entity", "association"]);
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
const relationshipRolePattern = /^[a-z0-9]+(?:-[a-z0-9]+)*$/u;
const invariantIdPattern = /^[A-Z0-9]+(?:-[A-Z0-9]+)*-INV-\d{3}$/u;
const physicalSchemaPattern =
  /\b(?:t|v)_[a-z0-9_]+\b|\b(?:CREATE|ALTER|DROP)\s+(?:TABLE|VIEW)\b|\b(?:BIGINT|TINYINT|SMALLINT|MEDIUMINT|INT|INTEGER|DECIMAL|NUMERIC|FLOAT|DOUBLE|BOOLEAN|BOOL|CHAR|VARCHAR|TEXT|JSON|DATE|DATETIME|TIMESTAMP|BLOB|BINARY|VARBINARY)\b/iu;

const entityHeaders = [
  "논리 ID",
  "표시명",
  "생명주기 역할",
  "엔티티 형태",
  "기록 역할",
  "책임",
  "최고 데이터 분류",
  "생명주기",
];
const relationshipHeaders = [
  "출발 논리 ID",
  "관계 역할",
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
const developerViewHeading = "먼저 보는 그림";
const contractSubheadings = ["논리 엔티티", "관계", "불변조건"];
const contractDetailsMarker = '??? info "정확한 값과 조건 보기"';
const detailsLintDisable = "<!-- markdownlint-disable MD046 -->";
const detailsLintEnable = "<!-- markdownlint-enable MD046 -->";

const defaultRoot = process.cwd();
const defaultIndexPath = path.join(
  defaultRoot,
  "content",
  "architecture",
  "logical-data-model-index.md",
);
const defaultPlannedIndexPath = path.join(
  defaultRoot,
  "content",
  "architecture",
  "logical-data-model-planned-index.md",
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
  plannedIndexPath = defaultPlannedIndexPath,
  catalogPath = defaultCatalogPath,
  checkCatalog = true,
  checkViews = true,
} = {}) {
  const errors = [];
  const registries = [
    {
      path: indexPath,
      label: "논리 데이터 모델 인덱스",
      heading: "## 데이터 소유 도메인",
      stage: "as-is",
    },
    {
      path: plannedIndexPath,
      label: "예정 논리 데이터 모델 인덱스",
      heading: "## 예정 데이터 소유 도메인",
      stage: "to-be",
    },
  ];
  const domains = [];
  const domainIds = new Set();
  const ownerDocuments = new Set();

  for (const registry of registries) {
    const source = readFile(registry.path, errors, registry.label);
    if (source === null) {
      continue;
    }
    const domainTable = parseTableAfterHeading(
      source,
      registry.heading,
      domainHeaders,
      registry.label,
      errors,
    );

    for (const row of domainTable.rows) {
      const domainId = stripCode(cell(row, 0));
      const displayName = cell(row, 1).trim();
      const responsibility = cell(row, 2).trim();
      const ownerLink = parseMarkdownLink(cell(row, 3));

      if (!domainIdPattern.test(domainId)) {
        errors.push(`${registry.label}: 잘못된 도메인 ID입니다: ${domainId || "(없음)"}`);
      }
      if (domainIds.has(domainId)) {
        errors.push(`${registry.label}: 현행·예정 인덱스에 중복된 도메인 ID입니다: ${domainId}`);
      }
      domainIds.add(domainId);
      if (!displayName) {
        errors.push(`${registry.label}: 표시명이 비어 있습니다: ${domainId || "(없음)"}`);
      }
      if (!responsibility) {
        errors.push(`${registry.label}: 책임 범위가 비어 있습니다: ${domainId || "(없음)"}`);
      }

      if (!ownerLink || !isLocalOwnerTarget(ownerLink.target)) {
        errors.push(`${registry.label}: 소유 문서는 architecture 내부 Markdown 링크여야 합니다: ${domainId}`);
        continue;
      }

      const ownerRelativePath = path.posix.join(
        "content/architecture",
        ownerLink.target,
      );
      if (ownerDocuments.has(ownerRelativePath)) {
        errors.push(
          `${registry.label}: 현행·예정 인덱스에서 하나의 문서가 여러 도메인을 소유합니다: ${ownerRelativePath}`,
        );
      }
      ownerDocuments.add(ownerRelativePath);
      domains.push({
        id: domainId,
        name: displayName,
        responsibility,
        ownerDocument: ownerRelativePath,
        stage: registry.stage,
      });
    }
  }

  const architectureRoot = path.join(root, "content", "architecture");
  for (const documentPath of findModelOwnerDocuments(architectureRoot, root)) {
    if (!ownerDocuments.has(documentPath)) {
      errors.push(
        `${documentPath}: 논리 데이터 모델 절이 있지만 현행·예정 인덱스에 등록되지 않았습니다.`,
      );
    }
  }

  const entityIds = new Set();
  const invariantIds = new Set();
  const relationshipKeys = new Set();
  const relationships = [];
  const invariants = [];
  const catalogDomains = [];
  const catalogEntities = [];
  const modelEntities = [];
  const ownerModels = [];

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
    const declaredDomainIds = [
      ...modelSection.matchAll(/^\s*- 도메인 ID:\s*`([^`]+)`\s*$/gmu),
    ];
    if (declaredDomainIds.length !== 1) {
      errors.push(
        `${domain.ownerDocument}: 도메인 ID 선언은 정확히 1개여야 합니다. 현재 ${declaredDomainIds.length}개`,
      );
    }
    const declaredDomainId = declaredDomainIds[0]?.[1] ?? "";
    if (declaredDomainIds.length === 1 && declaredDomainId !== domain.id) {
      errors.push(
        `${domain.ownerDocument}: 도메인 ID가 인덱스와 다릅니다. expected=${domain.id}, actual=${declaredDomainId || "(없음)"}`,
      );
    }

    const actualSubheadings = [...modelSection.matchAll(/^\s*###\s+(.+?)\s*$/gmu)].map(
      (match) => match[1],
    );
    const expectedSubheadings = checkViews
      ? [developerViewHeading, ...contractSubheadings]
      : contractSubheadings;
    const comparableSubheadings = checkViews
      ? actualSubheadings
      : actualSubheadings.filter((heading) => heading !== developerViewHeading);
    if (canonicalJson(comparableSubheadings) !== canonicalJson(expectedSubheadings)) {
      errors.push(
        `${domain.ownerDocument}: 논리 데이터 모델 하위 절은 ${expectedSubheadings.join(" -> ")} 순서로 각각 정확히 1개여야 합니다. actual=${actualSubheadings.join(" -> ") || "(없음)"}`,
      );
    }
    if (checkViews) {
      validateContractDetailsLayout(modelSection, domain.ownerDocument, errors);
    }

    const firstSubheadingOffset = modelSection.search(/^\s*###\s+/mu);
    const domainIdOffset = declaredDomainIds[0]?.index ?? -1;
    if (
      declaredDomainIds.length === 1 &&
      firstSubheadingOffset >= 0 &&
      domainIdOffset > firstSubheadingOffset
    ) {
      errors.push(`${domain.ownerDocument}: 도메인 ID 선언은 먼저 보는 그림과 상세 표보다 앞에 있어야 합니다.`);
    }

    const status =
      ownerSource.match(/^- 기준 성격:\s*`([^`]+)`\s*$/mu)?.[1] ?? "";
    if (status !== domain.stage) {
      errors.push(
        `${domain.ownerDocument}: 기준 성격이 등록 인덱스와 다릅니다. expected=${domain.stage}, actual=${status || "(없음)"}`,
      );
    }

    if (physicalSchemaPattern.test(modelSection)) {
      errors.push(
        `${domain.ownerDocument}: 논리 데이터 모델 절에 물리 테이블·뷰·DDL·SQL 타입이 포함되어 있습니다.`,
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
      const entityId = stripCode(cell(row, 0));
      const displayName = cell(row, 1).trim();
      const lifecycleRole = stripCode(cell(row, 2));
      const entityShape = stripCode(cell(row, 3));
      const recordRole = stripCode(cell(row, 4));
      const responsibility = cell(row, 5).trim();
      const classification = stripCode(cell(row, 6));
      const lifecycle = cell(row, 7).trim();

      if (!entityIdPattern.test(entityId)) {
        errors.push(`${domain.ownerDocument}: 잘못된 논리 ID입니다: ${entityId || "(없음)"}`);
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

      if (!displayName) {
        errors.push(`${domain.ownerDocument}: 표시명이 비어 있습니다: ${entityId}`);
      }
      if (!allowedLifecycleRoles.has(lifecycleRole)) {
        errors.push(`${domain.ownerDocument}: 허용되지 않은 생명주기 역할입니다: ${lifecycleRole}`);
      }
      if (!allowedEntityShapes.has(entityShape)) {
        errors.push(`${domain.ownerDocument}: 허용되지 않은 엔티티 형태입니다: ${entityShape}`);
      }
      if (!allowedRecordRoles.has(recordRole)) {
        errors.push(`${domain.ownerDocument}: 허용되지 않은 기록 역할입니다: ${recordRole}`);
      }
      if (!responsibility) {
        errors.push(`${domain.ownerDocument}: 책임이 비어 있습니다: ${entityId}`);
      }
      if (!allowedClassifications.has(classification)) {
        errors.push(
          `${domain.ownerDocument}: 허용되지 않은 데이터 분류입니다: ${classification}`,
        );
      }
      if (!lifecycle) {
        errors.push(`${domain.ownerDocument}: 생명주기가 비어 있습니다: ${entityId}`);
      }

      catalogEntities.push({
        id: entityId,
        name: displayName,
        domainId: domain.id,
        ownerDocument: domain.ownerDocument,
        stage: domain.stage,
        lifecycleRole,
        entityShape,
        recordRole,
        responsibility,
        classification,
        lifecycle,
      });
      modelEntities.push({
        id: entityId,
        domainId: domain.id,
        displayName,
        responsibility,
      });
    }

    if (domainEntityIds.length === 0) {
      errors.push(`${domain.ownerDocument}: 논리 엔티티가 1개 이상 필요합니다.`);
    }

    for (const row of relationshipTable.rows) {
      const source = stripCode(cell(row, 0));
      const role = stripCode(cell(row, 1));
      const kind = stripCode(cell(row, 2));
      const target = stripCode(cell(row, 3));
      const cardinality = stripCode(cell(row, 4));
      const rule = cell(row, 5).trim();
      const key = `${source}#${role}`;

      if (!relationshipRolePattern.test(role)) {
        errors.push(`${domain.ownerDocument}: 잘못된 관계 역할입니다: ${role || "(없음)"}`);
      }
      if (relationshipKeys.has(key)) {
        errors.push(`${domain.ownerDocument}: 출발 논리 ID의 관계 역할이 중복됩니다: ${key}`);
      }
      relationshipKeys.add(key);
      if (!allowedRelationshipKinds.has(kind)) {
        errors.push(`${domain.ownerDocument}: 허용되지 않은 관계 유형입니다: ${kind}`);
      }
      if (!allowedCardinalities.has(cardinality)) {
        errors.push(`${domain.ownerDocument}: 허용되지 않은 카디널리티입니다: ${cardinality}`);
      }
      if (!rule) {
        errors.push(`${domain.ownerDocument}: 소유·삭제 규칙이 비어 있습니다: ${key}`);
      }
      relationships.push({
        source,
        role,
        kind,
        target,
        cardinality,
        rule,
        ownerDocument: domain.ownerDocument,
      });
    }

    for (const row of invariantTable.rows) {
      const invariantId = stripCode(cell(row, 0));
      const relatedEntityId = stripCode(cell(row, 1));
      const invariant = cell(row, 2).trim();
      const basis = cell(row, 3).trim();

      if (!invariantIdPattern.test(invariantId)) {
        errors.push(`${domain.ownerDocument}: 잘못된 불변조건 ID입니다: ${invariantId}`);
      }
      if (invariantIds.has(invariantId)) {
        errors.push(`${domain.ownerDocument}: 중복 불변조건 ID입니다: ${invariantId}`);
      }
      invariantIds.add(invariantId);
      if (!invariant) {
        errors.push(`${domain.ownerDocument}: 불변조건이 비어 있습니다: ${invariantId}`);
      }
      if (!basis) {
        errors.push(`${domain.ownerDocument}: 불변조건 기준 문서가 비어 있습니다: ${invariantId}`);
      }
      if (!entityIds.has(relatedEntityId)) {
        errors.push(
          `${domain.ownerDocument}: 불변조건 관련 논리 ID가 존재하지 않습니다: ${relatedEntityId}`,
        );
      }
      invariants.push({
        id: invariantId,
        relatedEntityId,
        statement: invariant,
        basis,
        ownerDocument: domain.ownerDocument,
      });
    }

    ownerModels.push({
      domain,
      actualView: extractDeveloperView(modelSection),
    });

    catalogDomains.push({
      id: domain.id,
      name: domain.name,
      responsibility: domain.responsibility,
      ownerDocument: domain.ownerDocument,
      stage: domain.stage,
      entityIds: [...domainEntityIds].sort(),
    });
  }

  for (const relationship of relationships) {
    if (!entityIds.has(relationship.source)) {
      errors.push(
        `${relationship.ownerDocument}: 관계 출발 논리 ID가 존재하지 않습니다: ${relationship.source}`,
      );
    }
    if (!entityIds.has(relationship.target)) {
      errors.push(
        `${relationship.ownerDocument}: 관계 도착 논리 ID가 존재하지 않습니다: ${relationship.target}`,
      );
    }
  }

  const entityById = new Map(catalogEntities.map((entity) => [entity.id, entity]));
  for (const entity of catalogEntities) {
    const incomingOwnership = relationships.filter(
      (relationship) => relationship.kind === "owns" && relationship.target === entity.id,
    );
    if (entity.lifecycleRole === "child" && incomingOwnership.length !== 1) {
      errors.push(
        `${entity.ownerDocument}: child 엔티티는 정확히 하나의 owns 관계 대상이어야 합니다: ${entity.id} (actual=${incomingOwnership.length})`,
      );
    }
    if (entity.lifecycleRole === "root" && incomingOwnership.length > 0) {
      errors.push(
        `${entity.ownerDocument}: root 엔티티는 owns 관계 대상일 수 없습니다: ${entity.id}`,
      );
    }
    if (entity.entityShape === "association") {
      const endpoints = relationships.filter(
        (relationship) => relationship.source === entity.id || relationship.target === entity.id,
      );
      const nonOwnershipEndpoint = endpoints.some(
        (relationship) => relationship.kind !== "owns",
      );
      if (endpoints.length < 2 || !nonOwnershipEndpoint) {
        errors.push(
          `${entity.ownerDocument}: association 엔티티는 소유 관계를 포함해 둘 이상의 끝점과 참조·연결 끝점이 필요합니다: ${entity.id}`,
        );
      }
    }
  }

  for (const relationship of relationships.filter(({ kind }) => kind === "owns")) {
    const target = entityById.get(relationship.target);
    if (target && target.lifecycleRole !== "child") {
      errors.push(
        `${relationship.ownerDocument}: owns 관계의 도착 엔티티는 child여야 합니다: ${relationship.target}`,
      );
    }
  }

  const catalogRelationships = relationships
    .map((relationship) => ({
      sourceEntityId: relationship.source,
      role: relationship.role,
      kind: relationship.kind,
      targetEntityId: relationship.target,
      cardinality: relationship.cardinality,
      lifecycleRule: relationship.rule,
      ownerDocument: relationship.ownerDocument,
    }))
    .sort(
      (left, right) =>
        left.sourceEntityId.localeCompare(right.sourceEntityId) ||
        left.role.localeCompare(right.role),
    );
  const catalogInvariants = invariants
    .map((invariant) => ({
      id: invariant.id,
      relatedEntityId: invariant.relatedEntityId,
      statement: invariant.statement,
      basis: invariant.basis,
      ownerDocument: invariant.ownerDocument,
    }))
    .sort((left, right) => left.id.localeCompare(right.id));

  const catalog = {
    version: 3,
    source: {
      currentIndex: "content/architecture/logical-data-model-index.md",
      plannedIndex: "content/architecture/logical-data-model-planned-index.md",
    },
    domains: catalogDomains.sort((left, right) => left.id.localeCompare(right.id)),
    entities: catalogEntities.sort((left, right) => left.id.localeCompare(right.id)),
    relationships: catalogRelationships,
    invariants: catalogInvariants,
  };

  const modelEntityById = new Map(modelEntities.map((entity) => [entity.id, entity]));
  const views = ownerModels.map(({ domain, actualView }) => {
    const markdown = renderDeveloperView({
      domain,
      entities: modelEntities.filter((entity) => entity.domainId === domain.id),
      relationships: relationships.filter(
        (relationship) => relationship.ownerDocument === domain.ownerDocument,
      ),
      invariants: invariants.filter(
        (invariant) => invariant.ownerDocument === domain.ownerDocument,
      ),
      entityById: modelEntityById,
    });

    if (checkViews && actualView && normalizeMarkdown(actualView) !== normalizeMarkdown(markdown)) {
      errors.push(
        `${domain.ownerDocument}: 먼저 보는 그림이 상세 표와 다릅니다. 'yarn generate:logical-data-model'로 다시 생성하세요.`,
      );
    }

    return {
      ownerDocument: domain.ownerDocument,
      markdown,
    };
  });

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

  return { errors, catalog, views };
}

export function writeLogicalModelViews({ root = defaultRoot, views }) {
  for (const view of views) {
    const ownerPath = path.join(root, ...view.ownerDocument.split("/"));
    const source = fs.readFileSync(ownerPath, "utf8");
    const nextSource = renderLogicalModelDocument(
      source,
      view.markdown,
      view.ownerDocument,
    );

    if (nextSource !== source) {
      fs.writeFileSync(ownerPath, nextSource);
    }
  }
}

function renderLogicalModelDocument(source, viewMarkdown, ownerDocument) {
  const modelRange = findSectionRange(source, "## 논리 데이터 모델");
  if (modelRange === null) {
    throw new Error(`${ownerDocument}: 논리 데이터 모델 절을 찾을 수 없습니다.`);
  }

  const modelSection = modelRange.source;
  const domainId = modelSection.match(/^\s*- 도메인 ID:\s*`[^`]+`\s*$/mu);
  const contractRange = findSectionRange(modelSection, "### 논리 엔티티");
  if (domainId === null || contractRange === null) {
    throw new Error(`${ownerDocument}: 도메인 ID 또는 상세 표를 찾을 수 없습니다.`);
  }

  const lintEnableOffset = findExactLineOffset(
    modelSection,
    detailsLintEnable,
    contractRange.start,
  );
  const contractEnd = lintEnableOffset < 0 ? modelSection.length : lintEnableOffset;
  const contract = normalizeContractIndent(
    modelSection.slice(contractRange.start, contractEnd),
  );
  const preamble = modelSection
    .slice(0, domainId.index + domainId[0].length)
    .trimEnd();
  const renderedModel = [
    preamble,
    viewMarkdown.trim(),
    detailsLintDisable,
    contractDetailsMarker,
    indentContract(contract),
    detailsLintEnable,
  ].join("\n\n");
  const suffix = source.slice(modelRange.end).replace(/^\s+/u, "");

  return `${source.slice(0, modelRange.start)}${renderedModel}${suffix ? `\n\n${suffix}` : "\n"}`;
}

function normalizeContractIndent(source) {
  return source
    .replace(/\s+$/u, "")
    .split("\n")
    .map((line) => line.trimStart())
    .join("\n");
}

function indentContract(source) {
  return source
    .split("\n")
    .map((line) => (line.length > 0 ? `    ${line}` : ""))
    .join("\n");
}

function renderDeveloperView({ domain, entities, relationships, invariants, entityById }) {
  const involvedEntityIds = new Set(entities.map((entity) => entity.id));
  for (const relationship of relationships) {
    involvedEntityIds.add(relationship.source);
    involvedEntityIds.add(relationship.target);
  }

  const diagramRelationships = new Map();
  for (const relationship of relationships) {
    const key = [
      relationship.source,
      relationship.target,
      relationship.kind,
    ].join("#");
    if (!diagramRelationships.has(key)) {
      diagramRelationships.set(key, relationship);
    }
  }

  const lines = [
    `### ${developerViewHeading}`,
    "",
    "이 그림은 데이터가 어디에 속하고 무엇을 참고하는지 먼저 보여준다.",
    "정확한 이름과 조건은 아래 상세 표를 따른다.",
    "",
    "```mermaid",
    "flowchart LR",
  ];

  for (const entityId of [...involvedEntityIds].sort()) {
    const entity = entityById.get(entityId);
    const displayName = entity?.displayName || entityId;
    const external = entity?.domainId !== domain.id;
    const suffix = external ? " · 다른 영역" : "";
    lines.push(
      `    ${mermaidNodeId(entityId)}["${escapeMermaidLabel(displayName)}${escapeMermaidLabel(suffix)}<br/>${escapeMermaidLabel(entityId)}"]`,
    );
  }

  for (const relationship of diagramRelationships.values()) {
    lines.push(
      `    ${mermaidNodeId(relationship.source)} -->|"${relationshipLabel(relationship.kind)}"| ${mermaidNodeId(relationship.target)}`,
    );
  }

  lines.push("```", "", "꼭 지킬 규칙:", "");
  if (invariants.length === 0) {
    lines.push("- 따로 등록된 핵심 규칙이 없다.");
  } else {
    for (const invariant of invariants) {
      lines.push(`- ${invariant.statement}`);
    }
  }

  return `${lines.join("\n")}\n`;
}

function mermaidNodeId(entityId) {
  return `entity_${entityId.replaceAll("-", "_dash_").replaceAll(".", "_dot_")}`;
}

function escapeMermaidLabel(value) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll('"', "&quot;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

function relationshipLabel(kind) {
  return new Map([
    ["owns", "같이 관리"],
    ["references", "참고"],
    ["associates", "연결"],
    ["derives-from", "계산해 만듦"],
  ]).get(kind) || kind;
}

function normalizeMarkdown(source) {
  return source.replaceAll("\r\n", "\n").trim();
}

function readFile(filePath, errors, label) {
  if (!fs.existsSync(filePath)) {
    errors.push(`${label}: 파일이 존재하지 않습니다.`);
    return null;
  }
  return fs.readFileSync(filePath, "utf8");
}

function findModelOwnerDocuments(architectureRoot, root) {
  if (!fs.existsSync(architectureRoot)) {
    return [];
  }
  return fs
    .readdirSync(architectureRoot, { withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith(".md"))
    .map((entry) => path.join(architectureRoot, entry.name))
    .filter((filePath) => countHeading(fs.readFileSync(filePath, "utf8"), "## 논리 데이터 모델") > 0)
    .map((filePath) => path.relative(root, filePath).split(path.sep).join("/"))
    .sort();
}

function isLocalOwnerTarget(target) {
  return (
    /^[a-z0-9-]+\.md$/u.test(target) &&
    path.posix.normalize(target) === target &&
    !target.includes("..")
  );
}

function countHeading(source, heading) {
  return source.split("\n").filter((line) => line.trim() === heading).length;
}

function extractSection(source, heading) {
  return findSectionRange(source, heading)?.source ?? "";
}

function findSectionRange(source, heading) {
  const lines = source.split("\n");
  const start = lines.findIndex((line) => line.trim() === heading);
  if (start < 0) {
    return null;
  }
  const level = heading.match(/^#+/u)?.[0].length ?? 1;
  let end = lines.length;
  for (let index = start + 1; index < lines.length; index += 1) {
    const match = lines[index].match(/^\s*(#+)\s/u);
    if (match && match[1].length <= level) {
      end = index;
      break;
    }
  }
  const offsets = [];
  let offset = 0;
  for (const line of lines) {
    offsets.push(offset);
    offset += line.length + 1;
  }
  const startOffset = offsets[start];
  const endOffset = end < lines.length ? offsets[end] : source.length;
  return {
    start: startOffset,
    end: endOffset,
    source: source.slice(startOffset, endOffset),
  };
}

function extractDeveloperView(source) {
  const section = extractSection(source, `### ${developerViewHeading}`);
  const boundaries = [detailsLintDisable, contractDetailsMarker]
    .map((marker) => section.indexOf(`\n${marker}`))
    .filter((offset) => offset >= 0);
  return boundaries.length === 0 ? section : section.slice(0, Math.min(...boundaries));
}

function countExactLine(source, expected) {
  return source.split("\n").filter((line) => line.trim() === expected).length;
}

function findExactLineOffset(source, expected, minimumOffset = 0) {
  let offset = 0;
  for (const line of source.split("\n")) {
    if (offset >= minimumOffset && line.trim() === expected) {
      return offset;
    }
    offset += line.length + 1;
  }
  return -1;
}

function validateContractDetailsLayout(modelSection, ownerDocument, errors) {
  const detailsCount = countExactLine(modelSection, contractDetailsMarker);
  if (detailsCount !== 1) {
    errors.push(
      `${ownerDocument}: 상세 표는 '정확한 값과 조건 보기' 접기 영역에 정확히 한 번 있어야 합니다.`,
    );
  }
  if (
    countExactLine(modelSection, detailsLintDisable) !== 1 ||
    countExactLine(modelSection, detailsLintEnable) !== 1
  ) {
    errors.push(
      `${ownerDocument}: 접힌 상세 표의 문서 검사 범위 표시가 없거나 중복되었습니다.`,
    );
  }

  const lines = modelSection.split("\n");
  const expectedOrder = [
    `### ${developerViewHeading}`,
    detailsLintDisable,
    contractDetailsMarker,
    ...contractSubheadings.map((heading) => `### ${heading}`),
    detailsLintEnable,
  ];
  const positions = expectedOrder.map((expected) =>
    lines.findIndex((line) => line.trim() === expected),
  );
  if (
    positions.some((position) => position < 0) ||
    positions.some((position, index) => index > 0 && position <= positions[index - 1])
  ) {
    errors.push(
      `${ownerDocument}: 먼저 보는 그림과 접힌 상세 표의 위치가 표준 순서와 다릅니다.`,
    );
    return;
  }

  const detailsStart = positions[2] + 1;
  const detailsEnd = positions.at(-1);
  const escapedLines = lines
    .slice(detailsStart, detailsEnd)
    .filter((line) => line.trim().length > 0 && !/^ {4}\S/u.test(line));
  if (escapedLines.length > 0) {
    errors.push(
      `${ownerDocument}: 논리 엔티티·관계·불변조건 표는 '정확한 값과 조건 보기' 안에 들여써야 합니다.`,
    );
  }
  const contentBetweenLintAndDetails = lines
    .slice(positions[1] + 1, positions[2])
    .some((line) => line.trim().length > 0);
  const contentAfterDetails = lines
    .slice(positions.at(-1) + 1)
    .some((line) => line.trim().length > 0);
  if (contentBetweenLintAndDetails || contentAfterDetails) {
    errors.push(
      `${ownerDocument}: 접힌 상세 표 바깥에 허용되지 않은 내용이 있습니다.`,
    );
  }
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
    .filter((row) => row.some((tableCell) => tableCell.length > 0));

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
    .map((tableCell) => tableCell.trim());
}

function cell(row, index) {
  return typeof row[index] === "string" ? row[index] : "";
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
  const writeViews = process.argv.includes("--write-views");
  const result = validateLogicalDataModel({
    checkCatalog: !writeCatalog && !writeViews,
    checkViews: !writeViews,
  });

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
  }

  if (writeViews) {
    writeLogicalModelViews({ views: result.views });
    const verified = validateLogicalDataModel({ checkCatalog: false });
    if (verified.errors.length > 0) {
      verified.errors.forEach((error) => console.error(error));
      process.exit(1);
    }
    console.log(`논리 데이터 모델 쉬운 그림 생성: ${result.views.length}개 문서`);
  }

  if (!writeCatalog && !writeViews) {
    console.log(
      `논리 데이터 모델 검증 통과: ${result.catalog.domains.length}개 도메인, ${result.catalog.entities.length}개 엔티티`,
    );
  }
}
