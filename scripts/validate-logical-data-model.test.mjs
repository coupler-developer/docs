import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import {
  canonicalJson,
  validateLogicalDataModel,
} from "./validate-logical-data-model.mjs";

const validIndex = `# 논리 데이터 모델 인덱스

## 데이터 소유 도메인

| 도메인 ID | 표시명 | 책임 범위 | 소유 문서 |
| --- | --- | --- | --- |
| \`sample\` | 예시 | 검증 fixture | [예시 시스템](sample-system.md) |
`;

const makeOwner = ({
  entityId = "sample.item",
  entityKind = "root",
  recordRole = "state",
  targetId = "sample.item",
  extraEntity = "",
  sectionSuffix = "",
  status = "as-is",
} = {}) => `# 예시 시스템

## 문서 역할

- 역할: \`설명\`
- 문서 종류: \`architecture\`
- 충돌 시 우선 문서: 이 문서
- 기준 성격: \`${status}\`

## 논리 데이터 모델

- 도메인 ID: \`sample\`

### 논리 엔티티

| 논리 ID | 표시명 | 구조 유형 | 기록 역할 | 책임 | 최고 데이터 분류 | 생명주기 |
| --- | --- | --- | --- | --- | --- | --- |
| \`${entityId}\` | 예시 | ${entityKind} | ${recordRole} | 검증 대상 | 내부 | 보존 |
${extraEntity}

### 관계

| 출발 논리 ID | 관계 유형 | 도착 논리 ID | 카디널리티 | 소유·삭제 규칙 |
| --- | --- | --- | --- | --- |
| \`${entityId}\` | references | \`${targetId}\` | 1:1 | 함께 보존 |

### 불변조건

| 규칙 ID | 관련 논리 ID | 불변조건 | 기준 문서 |
| --- | --- | --- | --- |
| \`SAMPLE-INV-001\` | \`${entityId}\` | 예시 조건 | 이 문서 |
${sectionSuffix}
`;

function withFixture(ownerSource, run) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "logical-data-model-"));
  const architectureRoot = path.join(root, "content", "architecture");
  const generatedRoot = path.join(root, "generated");
  fs.mkdirSync(architectureRoot, { recursive: true });
  fs.mkdirSync(generatedRoot, { recursive: true });
  fs.writeFileSync(
    path.join(architectureRoot, "logical-data-model-index.md"),
    validIndex,
  );
  fs.writeFileSync(path.join(architectureRoot, "sample-system.md"), ownerSource);

  const unchecked = validateLogicalDataModel({
    root,
    indexPath: path.join(
      architectureRoot,
      "logical-data-model-index.md",
    ),
    catalogPath: path.join(
      generatedRoot,
      "logical-data-model-catalog.json",
    ),
    checkCatalog: false,
  });
  if (unchecked.catalog) {
    fs.writeFileSync(
      path.join(generatedRoot, "logical-data-model-catalog.json"),
      canonicalJson(unchecked.catalog),
    );
  }

  try {
    run({
      root,
      indexPath: path.join(
        architectureRoot,
        "logical-data-model-index.md",
      ),
      catalogPath: path.join(
        generatedRoot,
        "logical-data-model-catalog.json",
      ),
    });
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
}

test("표준 논리 모델과 생성 catalog를 허용한다", () => {
  withFixture(makeOwner(), (options) => {
    const result = validateLogicalDataModel(options);
    assert.deepEqual(result.errors, []);
    assert.deepEqual(result.catalog.entities.map((entity) => entity.id), [
      "sample.item",
    ]);
  });
});

test("폐쇄형 taxonomy 밖의 값을 거부한다", () => {
  withFixture(
    makeOwner({ entityKind: "aggregate", recordRole: "current" }),
    (options) => {
      const result = validateLogicalDataModel(options);
      assert.equal(result.errors.length, 2);
      assert.match(result.errors[0], /구조 유형/);
      assert.match(result.errors[1], /기록 역할/);
    },
  );
});

test("존재하지 않는 관계 대상과 중복 논리 ID를 거부한다", () => {
  withFixture(
    makeOwner({
      targetId: "missing.item",
      extraEntity:
        "| `sample.item` | 중복 | child | history | 중복 | 내부 | 보존 |",
    }),
    (options) => {
      const result = validateLogicalDataModel(options);
      assert.ok(result.errors.some((error) => /중복 논리 ID/.test(error)));
      assert.ok(
        result.errors.some((error) =>
          /관계 도착 논리 ID가 존재하지 않습니다/.test(error),
        ),
      );
    },
  );
});

test("논리 모델 절의 물리 스키마 사전을 거부한다", () => {
  withFixture(
    makeOwner({
      sectionSuffix: "\n물리 구현은 `t_sample` VARCHAR 컬럼을 사용한다.\n",
    }),
    (options) => {
      const result = validateLogicalDataModel(options);
      assert.ok(
        result.errors.some((error) =>
          /물리 테이블·DDL·SQL 타입/.test(error),
        ),
      );
    },
  );
});

test("소유 문서의 transition 기준을 거부한다", () => {
  withFixture(makeOwner({ status: "transition" }), (options) => {
    const result = validateLogicalDataModel(options);
    assert.ok(
      result.errors.some((error) =>
        /transition 기준을 사용할 수 없습니다/.test(error),
      ),
    );
  });
});

test("생성 catalog drift를 거부한다", () => {
  withFixture(makeOwner(), (options) => {
    fs.writeFileSync(options.catalogPath, "{}\n");
    const result = validateLogicalDataModel(options);
    assert.ok(
      result.errors.some((error) => /catalog가 최신 상태가 아닙니다/.test(error)),
    );
  });
});
