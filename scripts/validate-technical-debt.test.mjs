import assert from 'node:assert/strict';
import test from 'node:test';

import { validateTechnicalDebtInventory } from './validate-technical-debt.mjs';

const makeItem = (number, title = `부채 ${number}`) => `## ${number}) ${title} \`P2\` \`S\`

현상

- 아직 해결되지 않은 문제가 있다.

영향

- 영향이 있다.
`;

test('미해결 항목과 연속 번호를 허용한다', () => {
  const source = `${makeItem(1)}\n${makeItem(2)}`;

  assert.deepEqual(validateTechnicalDebtInventory(source), []);
});

test('완료 이력형 항목을 거부한다', () => {
  const source = `${makeItem(1)}\n구현 완료 근거\n\n- main에 병합됐다.\n`;
  const errors = validateTechnicalDebtInventory(source);

  assert.equal(errors.length, 1);
  assert.match(errors[0], /완료 이력형 표현/);
});

test('미해결 현상 절이 없는 항목을 거부한다', () => {
  const source = `## 1) 완료된 작업 \`P2\` \`S\`\n\n진행 상태 (2026-07-11)\n\n- 완료됨.\n`;
  const errors = validateTechnicalDebtInventory(source);

  assert.equal(errors.length, 2);
  assert.match(errors[0], /미해결 현상 절/);
  assert.match(errors[1], /완료 이력형 표현/);
});

test('번호 공백을 거부한다', () => {
  const source = `${makeItem(1)}\n${makeItem(3)}`;
  const errors = validateTechnicalDebtInventory(source);

  assert.equal(errors.length, 1);
  assert.match(errors[0], /번호가 연속되지 않습니다/);
});
