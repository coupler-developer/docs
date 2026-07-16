import assert from 'node:assert/strict';
import test from 'node:test';

import { validateTechnicalDebtInventory } from './validate-technical-debt.mjs';

const makeItem = (number, title = `부채 ${number}`) => `## ${number}) ${title} \`P2\` \`S\`

- 현상: 문제가 남아 있다.
- 영향: 영향이 있다.
- 조치: 해결한다.
- 완료: 문제가 제거된다.
`;

test('간결한 항목과 연속 번호를 허용한다', () => {
  const source = `${makeItem(1)}\n${makeItem(2)}`;

  assert.deepEqual(validateTechnicalDebtInventory(source), []);
});

test('완료 이력형 표현을 거부한다', () => {
  const source = `${makeItem(1)}\n완료 기록\n`;
  const errors = validateTechnicalDebtInventory(source);

  assert.match(errors.join('\n'), /완료 이력형 표현/);
});

test('필수 필드 누락을 거부한다', () => {
  const source = `## 1) 부채 \`P2\` \`S\`

- 현상: 문제가 남아 있다.
`;
  const errors = validateTechnicalDebtInventory(source);

  assert.match(errors.join('\n'), /영향 필드는 1개/);
  assert.match(errors.join('\n'), /조치 필드는 1개/);
  assert.match(errors.join('\n'), /완료 필드는 1개/);
});

test('번호 공백을 거부한다', () => {
  const source = `${makeItem(1)}\n${makeItem(3)}`;
  const errors = validateTechnicalDebtInventory(source);

  assert.equal(errors.length, 1);
  assert.match(errors[0], /번호가 연속되지 않습니다/);
});

test('우선순위와 작업량 label 누락을 거부한다', () => {
  const source = makeItem(1).replace(' `P2` `S`', '');
  const errors = validateTechnicalDebtInventory(source);

  assert.equal(errors.length, 1);
  assert.match(errors[0], /우선순위.*작업량/);
});

test('중복 제목을 거부한다', () => {
  const source = `${makeItem(1, '중복 부채')}\n${makeItem(2, '중복 부채')}`;
  const errors = validateTechnicalDebtInventory(source);

  assert.equal(errors.length, 1);
  assert.match(errors[0], /제목이 중복됩니다/);
});

test('필드 순서 변경을 거부한다', () => {
  const source = makeItem(1).replace(
    `- 영향: 영향이 있다.
- 조치: 해결한다.`,
    `- 조치: 해결한다.
- 영향: 영향이 있다.`,
  );
  const errors = validateTechnicalDebtInventory(source);

  assert.equal(errors.length, 1);
  assert.match(errors[0], /필드 순서/);
});

test('필요한 근거 줄을 허용한다', () => {
  const source = `${makeItem(1)}- 근거: 관련 PR 링크\n`;
  const errors = validateTechnicalDebtInventory(source);

  assert.deepEqual(errors, []);
});

test('항목이 없는 인벤토리를 거부한다', () => {
  const errors = validateTechnicalDebtInventory('# 기술 부채 정리\n');

  assert.deepEqual(errors, ['기술부채 항목이 없습니다.']);
});
