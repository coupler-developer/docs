import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

import {
  canonicalJson,
  validateLogicalDataModel,
} from "./validate-logical-data-model.mjs";

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

const makeIndex = ({ planned = false, includeSample = true } = {}) => `# ${
  planned ? "예정 " : ""
}논리 데이터 모델 인덱스

## ${planned ? "예정 " : ""}데이터 소유 도메인

| 도메인 ID | 표시명 | 책임 범위 | 소유 문서 |
| --- | --- | --- | --- |
${
  includeSample
    ? "| `sample` | 예시 | 검증 fixture | [예시 시스템](sample-system.md) |"
    : ""
}
`;

const makeOwner = ({
  entityId = "sample.item",
  lifecycleRole = "root",
  entityShape = "entity",
  recordRole = "state",
  targetId = "sample.item",
  extraEntity = "",
  relationshipRows,
  sectionSuffix = "",
  status = "as-is",
  entityRow,
} = {}) => `# 예시 시스템

## 문서 역할

- 역할: \`설명\`
- 문서 종류: \`architecture\`
- 충돌 시 우선 문서: 이 문서
- 기준 성격: \`${status}\`

## 논리 데이터 모델

- 도메인 ID: \`sample\`

### 논리 엔티티

| 논리 ID | 표시명 | 생명주기 역할 | 엔티티 형태 | 기록 역할 | 책임 | 최고 데이터 분류 | 생명주기 |
| --- | --- | --- | --- | --- | --- | --- | --- |
${
  entityRow ??
  `| \`${entityId}\` | 예시 | ${lifecycleRole} | ${entityShape} | ${recordRole} | 검증 대상 | 내부 | 보존 |`
}
${extraEntity}

### 관계

| 출발 논리 ID | 관계 역할 | 관계 유형 | 도착 논리 ID | 카디널리티 | 소유·삭제 규칙 |
| --- | --- | --- | --- | --- | --- |
${
  relationshipRows ??
  `| \`${entityId}\` | \`subject\` | references | \`${targetId}\` | 1:1 | 함께 보존 |`
}

### 불변조건

| 규칙 ID | 관련 논리 ID | 불변조건 | 기준 문서 |
| --- | --- | --- | --- |
| \`SAMPLE-INV-001\` | \`${entityId}\` | 예시 조건 | 이 문서 |
${sectionSuffix}
`;

function withFixture(
  ownerSource,
  run,
  {
    currentIndex = makeIndex(),
    plannedIndex = makeIndex({ planned: true, includeSample: false }),
    extraArchitecture = {},
  } = {},
) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "logical-data-model-"));
  const architectureRoot = path.join(root, "content", "architecture");
  const generatedRoot = path.join(root, "generated");
  fs.mkdirSync(architectureRoot, { recursive: true });
  fs.mkdirSync(generatedRoot, { recursive: true });
  fs.writeFileSync(
    path.join(architectureRoot, "logical-data-model-index.md"),
    currentIndex,
  );
  fs.writeFileSync(
    path.join(architectureRoot, "logical-data-model-planned-index.md"),
    plannedIndex,
  );
  fs.writeFileSync(path.join(architectureRoot, "sample-system.md"), ownerSource);
  for (const [fileName, source] of Object.entries(extraArchitecture)) {
    fs.writeFileSync(path.join(architectureRoot, fileName), source);
  }

  const options = {
    root,
    indexPath: path.join(architectureRoot, "logical-data-model-index.md"),
    plannedIndexPath: path.join(
      architectureRoot,
      "logical-data-model-planned-index.md",
    ),
    catalogPath: path.join(
      generatedRoot,
      "logical-data-model-catalog.json",
    ),
  };
  const unchecked = validateLogicalDataModel({
    ...options,
    checkCatalog: false,
  });
  fs.writeFileSync(options.catalogPath, canonicalJson(unchecked.catalog));

  try {
    run(options);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
}

test("현행 표준 논리 모델과 생성 catalog를 허용한다", () => {
  withFixture(makeOwner(), (options) => {
    const result = validateLogicalDataModel(options);
    assert.deepEqual(result.errors, []);
    assert.deepEqual(result.catalog.entities, [
      {
        id: "sample.item",
        domainId: "sample",
        ownerDocument: "content/architecture/sample-system.md",
        stage: "as-is",
        lifecycleRole: "root",
        entityShape: "entity",
        recordRole: "state",
        classification: "내부",
      },
    ]);
  });
});

test("현행 매칭 예약과 프로필 열람 의미를 실제 실행 경로에 맞춘다", () => {
  const result = validateLogicalDataModel({
    root: repositoryRoot,
    indexPath: path.join(
      repositoryRoot,
      "content",
      "architecture",
      "logical-data-model-index.md",
    ),
    plannedIndexPath: path.join(
      repositoryRoot,
      "content",
      "architecture",
      "logical-data-model-planned-index.md",
    ),
    catalogPath: path.join(
      repositoryRoot,
      "generated",
      "logical-data-model-catalog.json",
    ),
    checkCatalog: false,
  });
  const reservation = result.catalog.entities.find(
    ({ id }) => id === "matching.reservation",
  );
  const matchingSource = fs.readFileSync(
    path.join(
      repositoryRoot,
      "content",
      "architecture",
      "matching-system.md",
    ),
    "utf8",
  );
  const keyWalletSource = fs.readFileSync(
    path.join(
      repositoryRoot,
      "content",
      "architecture",
      "matching-key-system.md",
    ),
    "utf8",
  );

  assert.deepEqual(result.errors, []);
  assert.equal(reservation?.recordRole, "state");
  assert.doesNotMatch(
    matchingSource,
    /^\| `matching\.reservation` \| `policy` \|/mu,
  );
  assert.match(
    matchingSource,
    /^\| `matching\.reservation` \| `female-candidate` \| references \| `member\.member` \|/mu,
  );
  assert.match(
    matchingSource,
    /^\| `matching\.reservation` \| `male-candidate` \| references \| `member\.member` \|/mu,
  );
  assert.doesNotMatch(
    keyWalletSource,
    /최초 Key 차감|최초 열람은 한 번만 과금|하나의 transaction에서 확정/u,
  );
  assert.match(keyWalletSource, /요청별 과금을 판정/u);
  assert.match(keyWalletSource, /전역 최초 1회로 간주하지 않는다/u);
});

test("architecture 템플릿이 표준 논리 모델 구조를 유지한다", () => {
  const template = fs.readFileSync(
    path.join(repositoryRoot, "content", "templates", "architecture-template.md"),
    "utf8",
  );

  assert.match(template, /^- 도메인 ID: `<domain-id>`$/mu);
  assert.match(
    template,
    /^\| 논리 ID \| 표시명 \| 생명주기 역할 \| 엔티티 형태 \| 기록 역할 \| 책임 \| 최고 데이터 분류 \| 생명주기 \|$/mu,
  );
  assert.match(
    template,
    /^\| 출발 논리 ID \| 관계 역할 \| 관계 유형 \| 도착 논리 ID \| 카디널리티 \| 소유·삭제 규칙 \|$/mu,
  );
  assert.doesNotMatch(template, /구조 유형|<root, child, relation>/u);
});

test("예정 레지스트리의 단계가 catalog에 보존된다", () => {
  withFixture(
    makeOwner({ status: "to-be" }),
    (options) => {
      const result = validateLogicalDataModel(options);
      assert.deepEqual(result.errors, []);
      assert.equal(result.catalog.domains[0].stage, "to-be");
      assert.equal(result.catalog.entities[0].stage, "to-be");
    },
    {
      currentIndex: makeIndex({ includeSample: false }),
      plannedIndex: makeIndex({ planned: true }),
    },
  );
});

test("폐쇄형 taxonomy 밖의 값을 거부한다", () => {
  withFixture(
    makeOwner({
      lifecycleRole: "aggregate",
      entityShape: "link",
      recordRole: "current",
    }),
    (options) => {
      const errors = validateLogicalDataModel(options).errors.join("\n");
      assert.match(errors, /생명주기 역할/);
      assert.match(errors, /엔티티 형태/);
      assert.match(errors, /기록 역할/);
    },
  );
});

test("존재하지 않는 관계 대상과 중복 논리 ID를 거부한다", () => {
  withFixture(
    makeOwner({
      targetId: "missing.item",
      extraEntity:
        "| `sample.item` | 중복 | child | entity | history | 중복 | 내부 | 보존 |",
    }),
    (options) => {
      const errors = validateLogicalDataModel(options).errors.join("\n");
      assert.match(errors, /중복 논리 ID/);
      assert.match(errors, /관계 도착 논리 ID가 존재하지 않습니다/);
    },
  );
});

test("논리 모델 절의 테이블·뷰 이름과 넓은 SQL 타입을 거부한다", () => {
  withFixture(
    makeOwner({
      sectionSuffix: "\n물리 구현은 `v_secret` 뷰의 INT와 JSON 타입을 사용한다.\n",
    }),
    (options) => {
      assert.ok(
        validateLogicalDataModel(options).errors.some((error) =>
          /물리 테이블·뷰·DDL·SQL 타입/.test(error),
        ),
      );
    },
  );
});

test("인덱스와 소유 문서의 현행·예정 단계 불일치를 거부한다", () => {
  withFixture(makeOwner({ status: "to-be" }), (options) => {
    assert.ok(
      validateLogicalDataModel(options).errors.some((error) =>
        /기준 성격이 등록 인덱스와 다릅니다/.test(error),
      ),
    );
  });
});

test("논리 모델 하위 절의 중복과 순서 drift를 거부한다", () => {
  const duplicatedSection = makeOwner().replace(
    "### 관계",
    "### 논리 엔티티\n\n### 관계",
  );
  withFixture(duplicatedSection, (options) => {
    assert.ok(
      validateLogicalDataModel(options).errors.some((error) =>
        /하위 절은 논리 엔티티 -> 관계 -> 불변조건 순서/.test(error),
      ),
    );
  });

  const misplacedDomainId = makeOwner().replace(
    "- 도메인 ID: `sample`\n\n### 논리 엔티티",
    "### 논리 엔티티\n\n- 도메인 ID: `sample`",
  );
  withFixture(misplacedDomainId, (options) => {
    assert.ok(
      validateLogicalDataModel(options).errors.some((error) =>
        /도메인 ID 선언은 논리 엔티티 절보다 앞/.test(error),
      ),
    );
  });
});

test("인덱스에 없는 논리 모델 소유 문서를 역방향으로 거부한다", () => {
  withFixture(
    makeOwner(),
    (options) => {
      assert.ok(
        validateLogicalDataModel(options).errors.some((error) =>
          /논리 데이터 모델 절이 있지만 현행·예정 인덱스에 등록되지 않았습니다/.test(
            error,
          ),
        ),
      );
    },
    {
      extraArchitecture: {
        "rogue-system.md": makeOwner().replaceAll("sample", "rogue"),
      },
    },
  );
});

test("child 소유권과 association 끝점 누락을 거부한다", () => {
  withFixture(
    makeOwner({ lifecycleRole: "child", entityShape: "association" }),
    (options) => {
      const errors = validateLogicalDataModel(options).errors.join("\n");
      assert.match(errors, /child 엔티티는 정확히 하나의 owns 관계 대상/);
      assert.match(errors, /association 엔티티는 소유 관계를 포함해 둘 이상의 끝점/);
    },
  );
});

test("잘못된 표 열 수를 예외 없이 fail-closed로 거부한다", () => {
  withFixture(
    makeOwner({ entityRow: "| `sample.item` | 예시 |" }),
    (options) => {
      assert.doesNotThrow(() => validateLogicalDataModel(options));
      assert.ok(
        validateLogicalDataModel(options).errors.some((error) =>
          /표의 열 수가 다릅니다/.test(error),
        ),
      );
    },
  );
});

test("생성 catalog drift를 거부한다", () => {
  withFixture(makeOwner(), (options) => {
    fs.writeFileSync(options.catalogPath, "{}\n");
    assert.ok(
      validateLogicalDataModel(options).errors.some((error) =>
        /catalog가 최신 상태가 아닙니다/.test(error),
      ),
    );
  });
});
