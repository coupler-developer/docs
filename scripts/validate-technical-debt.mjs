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
  });

  return errors;
};

const isMainModule =
  process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href;

if (isMainModule) {
  const technicalDebtPath = path.join(
    process.cwd(),
    'content',
    'technical-debt',
    'technical-debt.md',
  );
  const source = fs.readFileSync(technicalDebtPath, 'utf8');
  const errors = validateTechnicalDebtInventory(source);

  if (errors.length > 0) {
    errors.forEach((error) => console.error(error));
    process.exit(1);
  }

  console.log('기술부채 인벤토리 검증 통과');
}
