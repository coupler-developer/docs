import assert from "node:assert/strict";
import test from "node:test";

import { validateDocumentLifecycle } from "./validate-document-lifecycle.mjs";

const coreDocuments = [1, 2, 3, 4].map((order) => ({
  kind: "policy",
  path: `policy/core-${order}.md`,
  role: "규범",
  source: `# Core ${order}\n`,
  status: "as-is",
}));
const exampleDocument = {
  kind: "policy",
  path: "policy/example.md",
  role: "규범",
  source: "# Example\n\n## Required Gate\n",
  status: "as-is",
};
const baseDocuments = [...coreDocuments, exampleDocument];

const coreRegistryEntries = [1, 2, 3, 4].map((order) => ({
  coreOrder: order,
  id: `policy.core-${order}`,
  lifecycle: "active",
  path: `policy/core-${order}.md`,
  routing: "core",
}));
const exampleRegistryEntry = {
  id: "policy.example",
  lifecycle: "active",
  path: "policy/example.md",
  requiredHeadings: [{ level: 2, title: "Required Gate" }],
  routing: "closure",
};

const baseRegistry = {
  schemaVersion: 1,
  documents: [...coreRegistryEntries, exampleRegistryEntry],
  routes: [],
};

test("현재 문서와 lifecycle registry가 일치하면 허용한다", () => {
  assert.deepEqual(validate(), []);
});

test("새 문서가 lifecycle registry에 없으면 거부한다", () => {
  const documents = [
    ...baseDocuments,
    {
      kind: "architecture",
      path: "architecture/added.md",
      role: "설명",
      source: "# Added\n",
      status: "as-is",
    },
  ];

  assert.match(
    validate({ documents }).join("\n"),
    /architecture\/added\.md: lifecycle registry에 active 항목이 없습니다/,
  );
});

test("문서를 삭제하면서 active registry 항목을 남기면 거부한다", () => {
  assert.match(
    validate({ documents: coreDocuments }).join("\n"),
    /policy\/example\.md: active lifecycle 문서가 존재하지 않습니다/,
  );
});

test("문서와 registry 항목을 함께 조용히 삭제해도 base 비교에서 거부한다", () => {
  const registry = { ...baseRegistry, documents: coreRegistryEntries };

  assert.match(
    validate({ documents: coreDocuments, previousRegistry: baseRegistry, registry }).join("\n"),
    /기존 lifecycle ID를 삭제할 수 없습니다: policy\.example/,
  );
});

test("삭제 문서는 replacement 또는 무대체 사유가 있는 tombstone으로 남긴다", () => {
  const registry = {
    ...baseRegistry,
    documents: [
      ...coreRegistryEntries,
      {
        id: "policy.example",
        lifecycle: "retired",
        noReplacementReason: "정책 책임이 상위 규범에 완전히 흡수되어 별도 문서가 필요하지 않다.",
        path: "policy/example.md",
        requiredHeadings: [{ level: 2, title: "Required Gate" }],
        retiredAt: "2026-07-20",
        retirementReason: "중복된 정책 책임을 제거했다.",
        routing: "closure",
      },
    ],
  };

  assert.deepEqual(
    validate({ documents: coreDocuments, previousRegistry: baseRegistry, registry }),
    [],
  );
});

test("문서 rename은 stable ID와 previousPaths를 보존해야 한다", () => {
  const documents = [
    ...coreDocuments,
    {
      ...exampleDocument,
      path: "policy/renamed.md",
    },
  ];
  const registry = {
    ...baseRegistry,
    documents: [
      ...coreRegistryEntries,
      {
        ...exampleRegistryEntry,
        path: "policy/renamed.md",
        previousPaths: ["policy/example.md"],
      },
    ],
  };

  assert.deepEqual(validate({ documents, previousRegistry: baseRegistry, registry }), []);
});

test("새 문서를 active lifecycle 항목과 함께 추가하면 허용한다", () => {
  const addedDocument = {
    kind: "architecture",
    path: "architecture/added.md",
    role: "설명",
    source: "# Added\n",
    status: "as-is",
  };
  const registry = clone(baseRegistry);
  registry.documents.push({
    id: "architecture.added",
    lifecycle: "active",
    path: addedDocument.path,
    routing: "closure",
  });

  assert.deepEqual(
    validate({ documents: [...baseDocuments, addedDocument], registry }),
    [],
  );
});

test("registry의 알 수 없는 key를 fail-closed로 거부한다", () => {
  const registry = clone(baseRegistry);
  registry.documents.at(-1).optionalBypass = true;

  assert.match(validate({ registry }).join("\n"), /알 수 없는 key입니다: optionalBypass/);
});

test("Core 4 순서가 닫혀 있지 않으면 거부한다", () => {
  const registry = clone(baseRegistry);
  registry.documents.find((entry) => entry.coreOrder === 4).coreOrder = 5;

  assert.match(validate({ registry }).join("\n"), /coreOrder 1~4를 정확히 한 번씩/);
});

test("필수 heading을 fenced code 안으로 숨기면 거부한다", () => {
  const documents = baseDocuments.map((document) =>
    document.path === exampleDocument.path
      ? { ...document, source: "# Example\n\n```text\n## Required Gate\n```\n" }
      : document,
  );

  assert.match(
    validate({ documents }).join("\n"),
    /policy\/example\.md: lifecycle registry 필수 heading이 없습니다: Required Gate/,
  );
});

test("direct 문서가 active route에 연결되지 않으면 거부한다", () => {
  const registry = clone(baseRegistry);
  registry.documents.at(-1).routing = "direct";

  assert.match(validate({ registry }).join("\n"), /direct routing 문서가 active route에서 참조되지 않습니다/);
});

test("route targetSource 경로와 stable target ID가 다르면 거부한다", () => {
  const registry = directRouteRegistry();
  registry.routes[0].targetSource = "`content/policy/core-1.md`";

  assert.match(validate({ registry }).join("\n"), /targetSource의 문서 경로와 targets 순서가 일치하지 않습니다/);
});

test("retired 문서에 lifecycle 증빙이 없으면 거부한다", () => {
  const registry = clone(baseRegistry);
  registry.documents[registry.documents.length - 1] = {
    id: "policy.example",
    lifecycle: "retired",
    path: "policy/example.md",
    routing: "closure",
  };

  const output = validate({ documents: coreDocuments, registry }).join("\n");
  assert.match(output, /retiredAt은 YYYY-MM-DD/);
  assert.match(output, /retirementReason/);
  assert.match(output, /replacementId와 noReplacementReason 중 정확히 하나/);
});

test("존재하지 않는 retired 날짜를 거부한다", () => {
  const registry = retiredExampleRegistry({
    noReplacementReason: "정책 책임이 사라져 대체 문서가 필요하지 않다.",
  });
  registry.documents.at(-1).retiredAt = "2026-02-31";

  assert.match(
    validate({ documents: coreDocuments, registry }).join("\n"),
    /retiredAt은 YYYY-MM-DD 형식이어야 합니다/,
  );
});

test("retired replacementId는 현재 active ID여야 한다", () => {
  const registry = retiredExampleRegistry({ replacementId: "policy.missing" });

  assert.match(
    validate({ documents: coreDocuments, registry }).join("\n"),
    /replacementId가 active lifecycle ID가 아닙니다: policy\.missing/,
  );
});

test("retired 문서는 마지막 routing과 requiredHeading을 보존해야 한다", () => {
  const registry = retiredExampleRegistry({
    noReplacementReason: "정책 책임이 사라져 대체 문서가 필요하지 않다.",
  });
  registry.documents.at(-1).routing = "direct";
  delete registry.documents.at(-1).requiredHeadings;

  const output = validate({
    documents: coreDocuments,
    previousRegistry: baseRegistry,
    registry,
  }).join("\n");
  assert.match(output, /마지막 routing 분류를 보존해야 합니다/);
  assert.match(output, /retired lifecycle은 requiredHeading을 보존해야 합니다/);
});

test("retired tombstone 재활성화를 거부한다", () => {
  const previousRegistry = retiredExampleRegistry({
    noReplacementReason: "정책 책임이 사라져 대체 문서가 필요하지 않다.",
  });

  assert.match(
    validate({ previousRegistry }).join("\n"),
    /retired lifecycle ID를 다시 활성화할 수 없습니다: policy\.example/,
  );
});

test("retired tombstone 수정을 거부한다", () => {
  const previousRegistry = retiredExampleRegistry({
    noReplacementReason: "정책 책임이 사라져 대체 문서가 필요하지 않다.",
  });
  const registry = clone(previousRegistry);
  registry.documents.at(-1).retirementReason = "나중에 다른 이유로 기록을 바꿨다.";

  assert.match(
    validate({ documents: coreDocuments, previousRegistry, registry }).join("\n"),
    /retired lifecycle tombstone은 변경할 수 없습니다: policy\.example/,
  );
});

test("rename 전 path를 previousPaths에 남기지 않으면 거부한다", () => {
  const documents = [
    ...coreDocuments,
    { ...exampleDocument, path: "policy/renamed.md" },
  ];
  const registry = clone(baseRegistry);
  registry.documents.at(-1).path = "policy/renamed.md";

  assert.match(
    validate({ documents, previousRegistry: baseRegistry, registry }).join("\n"),
    /rename 전 path를 previousPaths에 보존해야 합니다/,
  );
});

test("기존 route ID를 삭제하면 거부한다", () => {
  const previousRegistry = directRouteRegistry();
  const registry = clone(baseRegistry);

  assert.match(
    validate({ previousRegistry, registry }).join("\n"),
    /기존 route ID를 삭제할 수 없습니다: route\.example/,
  );
});

test("active route signal 변경은 retire/replacement 없이 허용하지 않는다", () => {
  const previousRegistry = directRouteRegistry();
  const registry = clone(previousRegistry);
  registry.routes[0].signal = "renamed signal";

  assert.match(
    validate({ previousRegistry, registry }).join("\n"),
    /active route signal은 변경할 수 없습니다/,
  );
});

test("active route targetSource 의미 변경은 retire/replacement 없이 허용하지 않는다", () => {
  const previousRegistry = directRouteRegistry();
  const registry = clone(previousRegistry);
  registry.routes[0].targetSource = "`content/policy/example.md`는 읽지 않아도 됨";

  assert.match(
    validate({ previousRegistry, registry }).join("\n"),
    /active route targetSource는 변경할 수 없습니다/,
  );
});

test("active 문서 routing 분류 변경은 retire/replacement 없이 허용하지 않는다", () => {
  const registry = clone(baseRegistry);
  registry.documents.at(-1).routing = "direct";
  registry.routes.push({
    id: "route.example",
    lifecycle: "active",
    signal: "example signal",
    targets: ["policy.example"],
    targetSource: "`content/policy/example.md`",
  });

  assert.match(
    validate({ previousRegistry: baseRegistry, registry }).join("\n"),
    /active routing 분류는 변경할 수 없습니다/,
  );
});

test("기존 requiredHeading 삭제를 거부한다", () => {
  const registry = clone(baseRegistry);
  delete registry.documents.at(-1).requiredHeadings;

  assert.match(
    validate({ previousRegistry: baseRegistry, registry }).join("\n"),
    /기존 requiredHeading을 제거할 수 없습니다: Required Gate/,
  );
});

test("문서 책임을 새 stable ID로 명시적으로 승계하면 허용한다", () => {
  const replacementDocument = {
    ...exampleDocument,
    path: "policy/replacement.md",
    source: "# Replacement\n\n## Required Gate\n",
  };
  const registry = retiredExampleRegistry({ replacementId: "policy.replacement" });
  registry.documents.push({
    ...exampleRegistryEntry,
    id: "policy.replacement",
    path: replacementDocument.path,
  });

  assert.deepEqual(
    validate({
      documents: [...coreDocuments, replacementDocument],
      previousRegistry: baseRegistry,
      registry,
    }),
    [],
  );
});

test("route 의미 변경을 tombstone과 replacement로 기록하면 허용한다", () => {
  const previousRegistry = directRouteRegistry();
  const registry = clone(previousRegistry);
  registry.routes[0] = {
    ...registry.routes[0],
    lifecycle: "retired",
    replacementId: "route.example-v2",
    retiredAt: "2026-07-20",
    retirementReason: "필수 Gate 안내를 확장해 새 route 계약으로 승계했다.",
  };
  registry.routes.push({
    id: "route.example-v2",
    lifecycle: "active",
    signal: "example signal",
    targets: ["policy.example"],
    targetSource: "`content/policy/example.md`와 Required Gate",
  });

  assert.deepEqual(validate({ previousRegistry, registry }), []);
});

test("retired route는 마지막 signal·targetSource·targets를 보존해야 한다", () => {
  const previousRegistry = directRouteRegistry();
  const registry = clone(previousRegistry);
  registry.routes[0] = {
    ...registry.routes[0],
    lifecycle: "retired",
    noReplacementReason: "해당 입력 신호가 제품에서 제거되어 대체 route가 필요하지 않다.",
    retiredAt: "2026-07-20",
    retirementReason: "제품 기능과 함께 고위험 신호가 제거됐다.",
    signal: "rewritten signal",
    targetSource: "`content/policy/core-1.md`",
    targets: ["policy.core-1"],
  };
  registry.documents.at(-1).routing = "closure";

  const output = validate({ previousRegistry, registry }).join("\n");
  assert.match(output, /retired route는 마지막 signal을 보존해야 합니다/);
  assert.match(output, /retired route는 마지막 targetSource를 보존해야 합니다/);
  assert.match(output, /retired route는 마지막 targets를 보존해야 합니다/);
});

function validate({
  documents = baseDocuments,
  previousRegistry,
  registry = baseRegistry,
} = {}) {
  return validateDocumentLifecycle({ documents, previousRegistry, registry });
}

function clone(value) {
  return structuredClone(value);
}

function directRouteRegistry() {
  const registry = clone(baseRegistry);
  registry.documents.at(-1).routing = "direct";
  registry.routes.push({
    id: "route.example",
    lifecycle: "active",
    signal: "example signal",
    targets: ["policy.example"],
    targetSource: "`content/policy/example.md`",
  });
  return registry;
}

function retiredExampleRegistry(replacementEvidence) {
  const registry = clone(baseRegistry);
  registry.documents[registry.documents.length - 1] = {
    id: "policy.example",
    lifecycle: "retired",
    path: "policy/example.md",
    requiredHeadings: [{ level: 2, title: "Required Gate" }],
    retiredAt: "2026-07-20",
    retirementReason: "중복된 정책 책임을 제거했다.",
    routing: "closure",
    ...replacementEvidence,
  };
  return registry;
}
