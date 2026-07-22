import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

import {
  findMovingContractPackageVersions,
  validateTechnicalDebtInventory,
} from './validate-technical-debt.mjs';

const validatorPath = fileURLToPath(new URL('./validate-technical-debt.mjs', import.meta.url));

const makeItem = (number, title = `부채 ${number}`) => `## ${number}) ${title} \`P2\` \`S\`

- 현상: 문제가 남아 있다.
- 영향: 영향이 있다.
- 조치: 해결한다.
- 완료: 문제가 제거된다.
`;

const writeWorkspaceFile = (workspaceRoot, relativePath, source) => {
  const filePath = path.join(workspaceRoot, relativePath);
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, source);
};

const runTechnicalDebtValidator = (workspaceRoot) =>
  spawnSync(process.execPath, [validatorPath], {
    cwd: workspaceRoot,
    encoding: 'utf8',
  });

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

test('API 계약 package의 concrete version 주장을 거부한다', () => {
  const claims = [
    'stable contract `0.1.20` exact다.',
    'API·Admin·Mobile 모두 stable `0.1.20` exact다.',
    '현재 contracts package version은 `0.1.20`이다.',
    '현재 계약 패키지는 `0.1.20`이다.',
    'API/Admin/Mobile 모두 `0.1.20` exact다.',
    'API, Admin, Mobile 모두 `0.1.20` exact다.',
    'contracts package latest stable exact version은 `0.1.20`이다.',
    'published latest stable contracts package version은 `0.1.20`이다.',
    '계약 패키지 latest stable version은 `0.1.20`이다.',
    '현재 계약 패키지 version은\n  `0.1.20`이다.',
    '`@coupler-developer/coupler-api-contracts` 버전은 `0.1.20`이다.',
    'contracts package의 버전은 `0.1.20`이다.',
    '계약 패키지의 현재 버전은 `0.1.20`이다.',
    'API·Admin·Mobile의 exact version은 `0.1.20`이다.',
    'API·Admin·Mobile exact version은 `0.1.20`이다.',
  ];

  for (const claim of claims) {
    const source = makeItem(1).replace('- 현상: 문제가 남아 있다.', `- 현상: ${claim}`);
    const errors = validateTechnicalDebtInventory(source);

    assert.equal(errors.length, 1);
    assert.match(errors[0], /시점 가변 API 계약 package exact version/);
    assert.match(errors[0], /0\.1\.20/);
  }
});

test('API 계약 package 좌표의 concrete version 기록을 거부한다', () => {
  const versions = ['0.1.20', '0.1.20-pr.163.1.1'];

  for (const version of versions) {
    const source = makeItem(1).replace(
      '- 현상: 문제가 남아 있다.',
      `- 현상: \`@coupler-developer/coupler-api-contracts@${version}\` 소비 전환이 남아 있다.`,
    );
    const errors = validateTechnicalDebtInventory(source);

    assert.equal(errors.length, 1);
    assert.match(errors[0], /시점 가변 API 계약 package exact version/);
    assert.match(errors[0], new RegExp(version.replaceAll('.', '\\.')));
  }
});

test('API 계약 package의 버전 독립적인 미해결 조건을 허용한다', () => {
  const source = makeItem(1).replace(
    '- 현상: 문제가 남아 있다.',
    '- 현상: API·Admin·Mobile의 latest stable exact version 배포 증빙이 남아 있다.',
  );
  const errors = validateTechnicalDebtInventory(source);

  assert.deepEqual(errors, []);
});

test('API 계약 package 문맥의 재현 환경 semver를 package version으로 오인하지 않는다', () => {
  const observations = [
    '`@coupler-developer/coupler-api-contracts` 설치가 Node.js `20.11.0`에서만 실패한다.',
    'contracts package 설치가 Node.js `20.11.0`에서만 실패한다.',
    'API 계약 package 빌드가 Node.js `20.11.0`에서만 실패한다.',
    'contracts package version 검증이 Node.js `20.11.0`에서 실패한다.',
    '계약 패키지 설치가 iOS `18.5.0`에서만 실패한다.',
    'Node.js stable `20.11.0` exact runtime에서 실패한다.',
    'Node.js latest stable exact version은 `20.11.0`이다.',
    'API·Admin·Mobile의 app version은 `2.2.1`이다.',
    '운영 기준은 [docs `v2.2.7`](../releases/v2.2.7.md)에 보존한다.',
  ];

  for (const observation of observations) {
    const source = makeItem(1).replace(
      '- 현상: 문제가 남아 있다.',
      `- 현상: ${observation}`,
    );
    const errors = validateTechnicalDebtInventory(source);

    assert.deepEqual(errors, []);
  }
});

test('인벤토리 밖 기술부채 문서에서도 가변 계약 package version을 찾는다', () => {
  const source = `# 전환 계획

현재 contracts package version은 \`0.1.20\`이다.
`;

  assert.deepEqual(findMovingContractPackageVersions(source), ['0.1.20']);
});

test('인벤토리 밖 기술부채 문서의 다음 문단 재현 버전을 오인하지 않는다', () => {
  const source = `# 전환 계획

contracts package 설치 실패를 추적한다.

재현 환경은 Node.js \`20.11.0\`이다.
`;

  assert.deepEqual(findMovingContractPackageVersions(source), []);
});

test('하위 디렉터리의 기술부채 문서도 concrete 계약 version을 거부한다', () => {
  const workspaceRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'technical-debt-validator-'));

  try {
    writeWorkspaceFile(
      workspaceRoot,
      'content/technical-debt/technical-debt.md',
      makeItem(1),
    );
    writeWorkspaceFile(
      workspaceRoot,
      'content/technical-debt/migrations/contract-cutover.md',
      '# 전환 부채\n\n현재 계약 패키지의 버전은 `0.1.20`이다.\n',
    );

    const result = runTechnicalDebtValidator(workspaceRoot);

    assert.equal(result.status, 1);
    assert.match(result.stderr, /migrations\/contract-cutover\.md/);
    assert.match(result.stderr, /0\.1\.20/);
  } finally {
    fs.rmSync(workspaceRoot, { recursive: true, force: true });
  }
});

test('릴리스 기록의 운영 package version과 tag는 기술부채 검증 범위에서 제외한다', () => {
  const workspaceRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'technical-debt-validator-'));

  try {
    writeWorkspaceFile(
      workspaceRoot,
      'content/technical-debt/technical-debt.md',
      makeItem(1),
    );
    writeWorkspaceFile(
      workspaceRoot,
      'content/releases/v2.2.7.md',
      '# 릴리스\n\npublishedPackage: `@coupler-developer/coupler-api-contracts@0.1.5`\n\n운영 tag: `v2.2.7`\n',
    );

    const result = runTechnicalDebtValidator(workspaceRoot);

    assert.equal(result.status, 0);
    assert.match(result.stdout, /기술부채 문서 검증 통과/);
  } finally {
    fs.rmSync(workspaceRoot, { recursive: true, force: true });
  }
});

test('항목이 없는 인벤토리를 거부한다', () => {
  const errors = validateTechnicalDebtInventory('# 기술 부채 정리\n');

  assert.deepEqual(errors, ['기술부채 항목이 없습니다.']);
});
