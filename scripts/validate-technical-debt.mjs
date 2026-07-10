import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const ITEM_HEADING_PATTERN = /^## (\d+)\) .+$/gm;
const FORBIDDEN_LIFECYCLE_LINE_PATTERN =
  /^(?:진행 상태(?: \([^)]+\))?|구현 완료 근거|완료 상태|완료 기록|- 상태:\s*`?(?:완료|closed|done|resolved)`?)\s*$/im;

export const validateTechnicalDebtInventory = (source) => {
  const errors = [];
  const matches = [...source.matchAll(ITEM_HEADING_PATTERN)];

  matches.forEach((match, index) => {
    const itemNumber = Number(match[1]);
    const expectedNumber = index + 1;
    const itemStart = match.index ?? 0;
    const itemEnd = matches[index + 1]?.index ?? source.length;
    const itemBody = source.slice(itemStart, itemEnd);

    if (itemNumber !== expectedNumber) {
      errors.push(
        `기술부채 번호가 연속되지 않습니다: ${itemNumber}, 예상 번호: ${expectedNumber}`,
      );
    }

    if (!/^현상\s*$/m.test(itemBody)) {
      errors.push(`기술부채 ${itemNumber}번에 미해결 현상 절이 없습니다.`);
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
