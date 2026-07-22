import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const ITEM_HEADING_PATTERN = /^## (\d+)\) (.+)$/gm;
const SECOND_LEVEL_HEADING_PATTERN = /^## .+$/gm;
const COMPLETE_ITEM_HEADING_PATTERN = /^## \d+\) .+ `P[123]` `(S|M|L)`$/;
const ITEM_TITLE_SUFFIX_PATTERN = / `P[123]` `(S|M|L)`$/;
const REQUIRED_FIELDS = ['현상', '영향', '조치', '완료'];
const FIELD_LINE_PATTERN = /^- (현상|영향|조치|완료):\s*(.+)$/gm;
const FORBIDDEN_LIFECYCLE_LINE_PATTERN =
  /^(?:진행 상태(?: \([^)]+\))?|구현 완료 근거|완료 상태|완료 기록|- 상태:\s*`?(?:완료|closed|done|resolved)`?)\s*$/im;
const CONCRETE_SEMVER_SOURCE = String.raw`\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?`;
const CONCRETE_SEMVER_PATTERN = new RegExp(CONCRETE_SEMVER_SOURCE, 'g');
const CODE_SEMVER_SOURCE = String.raw`\`?${CONCRETE_SEMVER_SOURCE}\`?`;
const VERSION_VALUE_SEPARATOR_SOURCE =
  String.raw`\s*(?:(?:은|는|이|가|is)\s*)?(?:[:=]\s*)?`;
const CONTRACT_PACKAGE_IDENTIFIER_SOURCE =
  String.raw`@coupler-developer/coupler-api-contracts`;
const CODE_CONTRACT_PACKAGE_IDENTIFIER_SOURCE =
  String.raw`\`?${CONTRACT_PACKAGE_IDENTIFIER_SOURCE}\`?`;
const CONTRACT_PACKAGE_LABEL_SOURCE =
  String.raw`(?:contracts?\s+package|계약\s*(?:package|패키지))`;
const CONTRACT_PACKAGE_REFERENCE_SOURCE =
  String.raw`(?:${CODE_CONTRACT_PACKAGE_IDENTIFIER_SOURCE}|${CONTRACT_PACKAGE_LABEL_SOURCE})`;
const CONTRACT_VERSION_QUALIFIER_SOURCE =
  String.raw`(?:published|current|latest|stable|exact|현재)`;
const API_ADMIN_MOBILE_SOURCE =
  String.raw`\bAPI\b\s*[·/,]\s*\bAdmin\b\s*[·/,]\s*\bMobile\b`;
const MOVING_CONTRACT_VERSION_PATTERNS = [
  new RegExp(
    String.raw`${CONTRACT_PACKAGE_IDENTIFIER_SOURCE}@${CODE_SEMVER_SOURCE}`,
    'gi',
  ),
  new RegExp(
    String.raw`(?:${CONTRACT_VERSION_QUALIFIER_SOURCE}\s+)*${CONTRACT_PACKAGE_REFERENCE_SOURCE}\s*(?:의\s*)?(?:${CONTRACT_VERSION_QUALIFIER_SOURCE}\s*)*(?:(?:exact\s+)?(?:version|버전)\s*)?${VERSION_VALUE_SEPARATOR_SOURCE}${CODE_SEMVER_SOURCE}`,
    'gi',
  ),
  new RegExp(
    String.raw`stable\s+contract\s*(?:(?:exact\s+)?version\s*)?${VERSION_VALUE_SEPARATOR_SOURCE}${CODE_SEMVER_SOURCE}\s*\bexact\b`,
    'gi',
  ),
  new RegExp(
    String.raw`${API_ADMIN_MOBILE_SOURCE}\s*(?:의\s*)?(?:모두\s*)?(?:(?:published|current|latest|stable|현재)\s*)*${CODE_SEMVER_SOURCE}\s*\bexact\b`,
    'gi',
  ),
  new RegExp(
    String.raw`${API_ADMIN_MOBILE_SOURCE}\s*(?:의\s*)?(?:모두\s*)?(?:(?:published|current|latest|stable|현재)\s*)*exact\s*(?:version|버전)${VERSION_VALUE_SEPARATOR_SOURCE}${CODE_SEMVER_SOURCE}`,
    'gi',
  ),
  new RegExp(
    String.raw`${API_ADMIN_MOBILE_SOURCE}\s*(?:의\s*)?(?:모두\s*)?(?:(?:published|current|latest|stable|현재)\s*)*(?:contract(?:s?\s+package)?\s+version|계약\s*(?:package|패키지)?\s*버전)${VERSION_VALUE_SEPARATOR_SOURCE}${CODE_SEMVER_SOURCE}`,
    'gi',
  ),
];

const findMarkdownFilesRecursively = (directoryPath) =>
  fs
    .readdirSync(directoryPath, { withFileTypes: true })
    .sort((left, right) => left.name.localeCompare(right.name))
    .flatMap((entry) => {
      const entryPath = path.join(directoryPath, entry.name);

      if (entry.isDirectory()) {
        return findMarkdownFilesRecursively(entryPath);
      }

      return entry.isFile() && entry.name.endsWith('.md') ? [entryPath] : [];
    });

export const findMovingContractPackageVersions = (source) => {
  const normalizedSource = source.replace(/\s+/g, ' ');
  const movingContractVersionPhrases = MOVING_CONTRACT_VERSION_PATTERNS.flatMap(
    (pattern) => [...normalizedSource.matchAll(pattern)].map((versionMatch) => versionMatch[0]),
  );

  return [
    ...new Set(
      movingContractVersionPhrases.flatMap(
        (phrase) => phrase.match(CONCRETE_SEMVER_PATTERN) ?? [],
      ),
    ),
  ];
};

const movingContractVersionError = (context, versions) =>
  `${context}에 시점 가변 API 계약 package exact version을 직접 기록할 수 없습니다: ${versions.join(', ')}. 현재 정렬은 package manifest/lockfile 비교로 판정하고 concrete release version은 release-metadata에 기록하세요.`;

export const validateTechnicalDebtInventory = (source) => {
  const errors = [];
  const matches = [...source.matchAll(ITEM_HEADING_PATTERN)];
  const secondLevelHeadings = [...source.matchAll(SECOND_LEVEL_HEADING_PATTERN)];
  const itemTitles = new Map();

  if (matches.length === 0) {
    errors.push('기술부채 항목이 없습니다.');
  }

  matches.forEach((match, index) => {
    const itemNumber = Number(match[1]);
    const expectedNumber = index + 1;
    const itemStart = match.index ?? 0;
    const itemEnd =
      secondLevelHeadings.find((heading) => (heading.index ?? 0) > itemStart)?.index ??
      source.length;
    const itemBody = source.slice(itemStart, itemEnd);
    const itemHeading = match[0];
    const itemTitle = match[2].replace(ITEM_TITLE_SUFFIX_PATTERN, '');

    if (itemNumber !== expectedNumber) {
      errors.push(
        `기술부채 번호가 연속되지 않습니다: ${itemNumber}, 예상 번호: ${expectedNumber}`,
      );
    }

    if (!COMPLETE_ITEM_HEADING_PATTERN.test(itemHeading)) {
      errors.push(
        `기술부채 ${itemNumber}번 제목에 우선순위(P1|P2|P3)와 작업량(S|M|L)이 없습니다.`,
      );
    }

    if (itemTitles.has(itemTitle)) {
      errors.push(
        `기술부채 제목이 중복됩니다: ${itemTitle} (${itemTitles.get(itemTitle)}번, ${itemNumber}번)`,
      );
    } else {
      itemTitles.set(itemTitle, itemNumber);
    }

    const fieldMatches = [...itemBody.matchAll(FIELD_LINE_PATTERN)];
    const fieldNames = fieldMatches.map((fieldMatch) => fieldMatch[1]);
    REQUIRED_FIELDS.forEach((field) => {
      const count = fieldNames.filter((fieldName) => fieldName === field).length;

      if (count !== 1) {
        errors.push(`기술부채 ${itemNumber}번의 ${field} 필드는 1개여야 합니다.`);
      }
    });

    if (
      fieldNames.length === REQUIRED_FIELDS.length &&
      fieldNames.some((fieldName, fieldIndex) => fieldName !== REQUIRED_FIELDS[fieldIndex])
    ) {
      errors.push(
        `기술부채 ${itemNumber}번 필드 순서는 현상 -> 영향 -> 조치 -> 완료여야 합니다.`,
      );
    }

    const forbiddenMatch = itemBody.match(FORBIDDEN_LIFECYCLE_LINE_PATTERN);
    if (forbiddenMatch) {
      errors.push(
        `기술부채 ${itemNumber}번에 완료 이력형 표현이 남아 있습니다: ${forbiddenMatch[0].trim()}`,
      );
    }

    const concreteVersions = findMovingContractPackageVersions(itemBody);

    if (concreteVersions.length > 0) {
      errors.push(movingContractVersionError(`기술부채 ${itemNumber}번`, concreteVersions));
    }
  });

  return errors;
};

const isMainModule =
  process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href;

if (isMainModule) {
  const technicalDebtDirectory = path.join(process.cwd(), 'content', 'technical-debt');
  const inventoryFileName = 'technical-debt.md';
  const technicalDebtFiles = findMarkdownFilesRecursively(technicalDebtDirectory);
  const errors = [];

  for (const filePath of technicalDebtFiles) {
    const relativeFilePath = path.relative(technicalDebtDirectory, filePath);
    const displayFilePath = relativeFilePath.split(path.sep).join('/');
    const source = fs.readFileSync(filePath, 'utf8');

    if (relativeFilePath === inventoryFileName) {
      errors.push(...validateTechnicalDebtInventory(source));
      continue;
    }

    const concreteVersions = findMovingContractPackageVersions(source);
    if (concreteVersions.length > 0) {
      errors.push(
        movingContractVersionError(
          `기술부채 문서 content/technical-debt/${displayFilePath}`,
          concreteVersions,
        ),
      );
    }
  }

  if (errors.length > 0) {
    errors.forEach((error) => console.error(error));
    process.exit(1);
  }

  console.log('기술부채 문서 검증 통과');
}
