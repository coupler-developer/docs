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
    path: `policy/core-${order}.md`,
    routing: "core",
}));
const exampleRegistryEntry = {
    id: "policy.example",
    path: "policy/example.md",
    requiredHeadings: [{ level: 2, title: "Required Gate" }],
    routing: "closure",
};
const baseRegistry = {
    schemaVersion: 2,
    documents: [...coreRegistryEntries, exampleRegistryEntry],
    routes: [],
};
const emptyRetirementLedger = { schemaVersion: 1, retirements: [] };

test("현재 문서와 current registry가 일치하면 허용한다", () => {
    assert.deepEqual(validate(), []);
});

test("current document path의 디렉터리와 파일명은 lowercase kebab-case여야 한다", () => {
    for (const invalidPath of [
        "policy/example_name.md",
        "policy/sub_dir/example.md",
    ]) {
        const registry = clone(baseRegistry);
        registry.documents.at(-1).path = invalidPath;
        const documents = baseDocuments.map((document) =>
            document.path === exampleDocument.path
                ? { ...document, path: invalidPath }
                : document,
        );

        assert.match(
            validate({ documents, registry }).join("\n"),
            /디렉터리·일반 파일명은 lowercase kebab-case/,
            invalidPath,
        );
    }
});

test("current 명명 규칙을 previousPaths에 소급하지 않는다", () => {
    const registry = clone(baseRegistry);
    registry.documents.at(-1).previousPaths = ["policy/legacy_name.md"];

    assert.deepEqual(validate({ registry }), []);
});

test("release document path는 vMAJOR.MINOR.PATCH 파일명을 허용한다", () => {
    assert.deepEqual(validate(releaseFixture("v9.8.7.md")), []);
});

test("release document path는 일반 kebab-case 파일명을 거부한다", () => {
    assert.match(
        validate(releaseFixture("release-9-8-7.md")).join("\n"),
        /releases 파일명은 vMAJOR.MINOR.PATCH\.md/,
    );
});

test("새 문서가 current registry에 없으면 거부한다", () => {
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
        /lifecycle registry에 current 항목이 없습니다/,
    );
});

test("문서를 삭제하면서 current registry 항목을 남기면 거부한다", () => {
    assert.match(
        validate({ documents: coreDocuments }).join("\n"),
        /policy\/example\.md: current lifecycle 문서가 존재하지 않습니다/,
    );
});

test("문서와 current 항목을 ledger 없이 함께 삭제하면 거부한다", () => {
    const registry = { ...baseRegistry, documents: coreRegistryEntries };
    assert.match(
        validate({
            documents: coreDocuments,
            previousRegistry: baseRegistry,
            registry,
        }).join("\n"),
        /기존 document ID를 retirement 없이 삭제할 수 없습니다: policy\.example/,
    );
});

test("삭제 문서는 최소 retirement entry만 남기면 허용한다", () => {
    const registry = { ...baseRegistry, documents: coreRegistryEntries };
    const retirementLedger = ledger(
        documentRetirement("policy.example", ["policy/example.md"]),
    );
    assert.deepEqual(
        validate({
            documents: coreDocuments,
            previousRegistry: baseRegistry,
            registry,
            retirementLedger,
        }),
        [],
    );
});

test("문서 rename은 stable ID와 previousPaths를 보존해야 한다", () => {
    const documents = [
        ...coreDocuments,
        { ...exampleDocument, path: "policy/renamed.md" },
    ];
    const registry = clone(baseRegistry);
    Object.assign(registry.documents.at(-1), {
        path: "policy/renamed.md",
        previousPaths: ["policy/example.md"],
    });
    assert.deepEqual(
        validate({ documents, previousRegistry: baseRegistry, registry }),
        [],
    );
});

test("새 문서를 current 항목과 함께 추가하면 허용한다", () => {
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
    assert.match(
        validate({ registry }).join("\n"),
        /알 수 없는 key입니다: optionalBypass/,
    );
});

test("Core 4 순서가 닫혀 있지 않으면 거부한다", () => {
    const registry = clone(baseRegistry);
    registry.documents.find((entry) => entry.coreOrder === 4).coreOrder = 5;
    assert.match(
        validate({ registry }).join("\n"),
        /coreOrder 1~4를 정확히 한 번씩/,
    );
});

test("필수 heading을 fenced code 안으로 숨기면 거부한다", () => {
    const documents = baseDocuments.map((document) =>
        document.path === exampleDocument.path
            ? {
                  ...document,
                  source: "# Example\n\n```text\n## Required Gate\n```\n",
              }
            : document,
    );
    assert.match(
        validate({ documents }).join("\n"),
        /필수 heading이 없습니다: Required Gate/,
    );
});

test("direct 문서가 current route에 연결되지 않으면 거부한다", () => {
    const registry = clone(baseRegistry);
    registry.documents.at(-1).routing = "direct";
    assert.match(
        validate({ registry }).join("\n"),
        /current route에서 참조되지 않습니다/,
    );
});

test("route targetSource 경로와 stable target ID가 다르면 거부한다", () => {
    const registry = directRouteRegistry();
    registry.routes[0].targetSource = "`content/policy/core-1.md`";
    assert.match(
        validate({ registry }).join("\n"),
        /targetSource의 문서 경로와 targets 순서/,
    );
});

test("retirement 날짜가 실제 날짜가 아니면 거부한다", () => {
    const retirementLedger = ledger(
        documentRetirement("policy.old", ["policy/old.md"]),
    );
    retirementLedger.retirements[0].retiredAt = "2026-02-31";
    assert.match(
        validate({ retirementLedger }).join("\n"),
        /retiredAt은 YYYY-MM-DD/,
    );
});

test("document retirement는 reservedPaths가 필요하다", () => {
    const retirementLedger = ledger({
        id: "policy.old",
        kind: "document",
        retiredAt: "2026-07-20",
    });
    assert.match(
        validate({ retirementLedger }).join("\n"),
        /reservedPaths는 비어 있지 않은 배열/,
    );
});

test("route retirement에는 reservedPaths를 둘 수 없다", () => {
    const retirementLedger = ledger({
        id: "route.old",
        kind: "route",
        reservedPaths: ["policy/old.md"],
        retiredAt: "2026-07-20",
    });
    assert.match(
        validate({ retirementLedger }).join("\n"),
        /route retirement에는 reservedPaths/,
    );
});

test("replacementId는 알려진 current 또는 retired ID여야 한다", () => {
    const retirementLedger = ledger({
        id: "route.old",
        kind: "route",
        replacementId: "route.missing",
        retiredAt: "2026-07-20",
    });
    assert.match(
        validate({ retirementLedger }).join("\n"),
        /알려진 replacementId가 아닙니다/,
    );
});

test("replacementId는 같은 kind만 참조할 수 있다", () => {
    const retirementLedger = ledger({
        id: "route.old",
        kind: "route",
        replacementId: "policy.example",
        retiredAt: "2026-07-20",
    });
    assert.match(
        validate({ retirementLedger }).join("\n"),
        /replacementId kind가 일치하지 않습니다/,
    );
});

test("replacementId는 자기 자신을 참조할 수 없다", () => {
    const retirementLedger = ledger({
        id: "route.old",
        kind: "route",
        replacementId: "route.old",
        retiredAt: "2026-07-20",
    });
    assert.match(
        validate({ retirementLedger }).join("\n"),
        /자기 자신을 replacementId/,
    );
});

test("replacement chain cycle을 거부한다", () => {
    const retirementLedger = ledger(
        routeRetirement("route.v1", "route.v2"),
        routeRetirement("route.v2", "route.v1"),
    );
    assert.match(
        validate({ retirementLedger }).join("\n"),
        /replacement chain에 cycle/,
    );
});

test("여러 세대 replacement chain이 retired ID를 거쳐 current ID로 이어질 수 있다", () => {
    const registry = clone(baseRegistry);
    registry.routes.push(route("route.v3"));
    const retirementLedger = ledger(
        routeRetirement("route.v1", "route.v2"),
        routeRetirement("route.v2", "route.v3"),
    );
    assert.deepEqual(validate({ registry, retirementLedger }), []);
});

test("retired stable ID를 current registry에서 재사용하면 거부한다", () => {
    const retirementLedger = ledger(
        documentRetirement("policy.example", ["policy/old.md"]),
    );
    assert.match(
        validate({ retirementLedger }).join("\n"),
        /retired ID를 current registry에서 재사용/,
    );
});

test("retired document path를 다른 current 문서가 재사용하면 거부한다", () => {
    const retirementLedger = ledger(
        documentRetirement("policy.old", ["policy/example.md"]),
    );
    assert.match(
        validate({ retirementLedger }).join("\n"),
        /retired document path를 current registry에서 재사용/,
    );
});

test("기존 retirement entry 삭제를 거부한다", () => {
    const previousRetirementLedger = ledger(
        documentRetirement("policy.old", ["policy/old.md"]),
    );
    assert.match(
        validate({
            previousRegistry: baseRegistry,
            previousRetirementLedger,
        }).join("\n"),
        /기존 retirement ID를 삭제할 수 없습니다: policy\.old/,
    );
});

test("기존 retirement entry 수정을 거부한다", () => {
    const previousRetirementLedger = ledger(
        documentRetirement("policy.old", ["policy/old.md"]),
    );
    const retirementLedger = clone(previousRetirementLedger);
    retirementLedger.retirements[0].retiredAt = "2026-07-21";
    assert.match(
        validate({
            previousRegistry: baseRegistry,
            previousRetirementLedger,
            retirementLedger,
        }).join("\n"),
        /retirement ledger는 기존 배열의 exact prefix를 보존해야 합니다/,
    );
});

test("기존 retirement entry 재정렬을 거부한다", () => {
    const previousRetirementLedger = ledger(
        documentRetirement("policy.old-a", ["policy/old-a.md"]),
        documentRetirement("policy.old-b", ["policy/old-b.md"]),
    );
    const retirementLedger = ledger(
        ...clone(previousRetirementLedger.retirements).reverse(),
    );
    assert.match(
        validate({
            previousRegistry: baseRegistry,
            previousRetirementLedger,
            retirementLedger,
        }).join("\n"),
        /retirement ledger는 기존 배열의 exact prefix를 보존해야 합니다/,
    );
});

test("새 retirement entry의 앞삽입을 거부한다", () => {
    const previousRetirementLedger = ledger(
        documentRetirement("policy.old", ["policy/old.md"]),
    );
    const retirementLedger = ledger(
        documentRetirement("policy.newer", ["policy/newer.md"]),
        ...clone(previousRetirementLedger.retirements),
    );
    assert.match(
        validate({
            previousRegistry: baseRegistry,
            previousRetirementLedger,
            retirementLedger,
        }).join("\n"),
        /retirement ledger는 기존 배열의 exact prefix를 보존해야 합니다/,
    );
});

test("document retirement은 마지막 path와 모든 previousPaths를 예약해야 한다", () => {
    const previousRegistry = clone(baseRegistry);
    Object.assign(previousRegistry.documents.at(-1), {
        path: "policy/latest.md",
        previousPaths: ["policy/example.md", "policy/older.md"],
    });
    const registry = { ...baseRegistry, documents: coreRegistryEntries };
    const retirementLedger = ledger(
        documentRetirement("policy.example", [
            "policy/latest.md",
            "policy/example.md",
        ]),
    );
    assert.match(
        validate({
            documents: coreDocuments,
            previousRegistry,
            registry,
            retirementLedger,
        }).join("\n"),
        /마지막 path와 모든 previousPaths/,
    );
});

test("같은 route ID의 signal 변경을 거부한다", () => {
    const previousRegistry = directRouteRegistry();
    const registry = clone(previousRegistry);
    registry.routes[0].signal = "renamed signal";
    assert.match(
        validate({
            previousRegistry,
            previousRetirementLedger: emptyRetirementLedger,
            registry,
        }).join("\n"),
        /current route signal은 변경할 수 없습니다/,
    );
});

test("같은 route ID의 targetSource 변경을 거부한다", () => {
    const previousRegistry = directRouteRegistry();
    const registry = clone(previousRegistry);
    registry.routes[0].targetSource = "`content/policy/example.md`와 다른 의미";
    assert.match(
        validate({
            previousRegistry,
            previousRetirementLedger: emptyRetirementLedger,
            registry,
        }).join("\n"),
        /current route targetSource는 변경할 수 없습니다/,
    );
});

test("같은 route ID의 targets 변경을 거부한다", () => {
    const previousRegistry = directRouteRegistry();
    const registry = clone(previousRegistry);
    registry.routes[0].targets = ["policy.core-1"];
    registry.routes[0].targetSource = "`content/policy/core-1.md`";
    assert.match(
        validate({
            previousRegistry,
            previousRetirementLedger: emptyRetirementLedger,
            registry,
        }).join("\n"),
        /current route targets는 변경할 수 없습니다/,
    );
});

test("같은 document ID의 routing 변경을 거부한다", () => {
    const registry = directRouteRegistry();
    assert.match(
        validate({ previousRegistry: baseRegistry, registry }).join("\n"),
        /current routing 분류는 변경할 수 없습니다/,
    );
});

test("기존 requiredHeading 삭제를 거부한다", () => {
    const registry = clone(baseRegistry);
    delete registry.documents.at(-1).requiredHeadings;
    assert.match(
        validate({ previousRegistry: baseRegistry, registry }).join("\n"),
        /기존 requiredHeading을 제거할 수 없습니다/,
    );
});

test("route 의미 변경은 retirement와 새 current ID로 승계할 수 있다", () => {
    const previousRegistry = directRouteRegistry();
    const registry = clone(previousRegistry);
    registry.routes = [
        route("route.example-v2", "policy.example", "policy/example.md"),
    ];
    const retirementLedger = ledger(
        routeRetirement("route.example", "route.example-v2"),
    );
    assert.deepEqual(
        validate({
            previousRegistry,
            previousRetirementLedger: emptyRetirementLedger,
            registry,
            retirementLedger,
        }),
        [],
    );
});

test("schemaVersion 1 base의 상세 tombstone 순서를 보존하고 새 retirement를 append한다", () => {
    const previousRegistry = legacyRegistry();
    previousRegistry.documents.push({
        id: "policy.old",
        lifecycle: "retired",
        noReplacementReason: "과거 상세 사유",
        path: "policy/old.md",
        previousPaths: ["policy/older.md"],
        requiredHeadings: [{ level: 2, title: "Old Gate" }],
        retiredAt: "2026-07-20",
        retirementReason: "과거 상세 retirement 기록",
        routing: "closure",
    });
    previousRegistry.routes.push(
        {
            ...route("route.old"),
            lifecycle: "retired",
            replacementId: "route.old-v2",
            retiredAt: "2026-07-20",
            retirementReason: "과거 상세 retirement 기록",
        },
        { ...route("route.old-v2"), lifecycle: "active" },
        { ...route("route.new"), lifecycle: "active" },
    );
    const registry = clone(baseRegistry);
    registry.routes.push(route("route.old-v2"), route("route.new-v2"));
    const retirementLedger = ledger(
        documentRetirement("policy.old", ["policy/old.md", "policy/older.md"]),
        routeRetirement("route.old", "route.old-v2"),
        routeRetirement("route.new", "route.new-v2"),
    );
    assert.deepEqual(
        validate({ previousRegistry, registry, retirementLedger }),
        [],
    );
});

test("schemaVersion 2 base에는 별도 retirement ledger가 필요하다", () => {
    assert.match(
        validateDocumentLifecycle({
            documents: baseDocuments,
            previousRegistry: baseRegistry,
            registry: baseRegistry,
            retirementLedger: emptyRetirementLedger,
        }).join("\n"),
        /schemaVersion 2 base에는 document retirement ledger가 필요합니다/,
    );
});

function validate({
    documents = baseDocuments,
    previousRegistry,
    previousRetirementLedger,
    registry = baseRegistry,
    retirementLedger = emptyRetirementLedger,
} = {}) {
    const effectivePreviousRetirementLedger =
        previousRetirementLedger ??
        (previousRegistry?.schemaVersion === 2
            ? emptyRetirementLedger
            : undefined);
    return validateDocumentLifecycle({
        documents,
        previousRegistry,
        previousRetirementLedger: effectivePreviousRetirementLedger,
        registry,
        retirementLedger,
    });
}

function clone(value) {
    return structuredClone(value);
}

function releaseFixture(filename) {
    const releaseDocument = {
        kind: "flow",
        path: `releases/${filename}`,
        role: "시나리오",
        source: "# Release\n",
        status: "as-is",
    };
    const registry = clone(baseRegistry);
    registry.documents.push({
        id: `releases.${filename.slice(0, -3)}`,
        path: releaseDocument.path,
        routing: "historical",
    });
    return { documents: [...baseDocuments, releaseDocument], registry };
}

function ledger(...retirements) {
    return { schemaVersion: 1, retirements };
}

function documentRetirement(id, reservedPaths) {
    return { id, kind: "document", reservedPaths, retiredAt: "2026-07-20" };
}

function routeRetirement(id, replacementId) {
    return { id, kind: "route", replacementId, retiredAt: "2026-07-20" };
}

function route(
    id,
    targetId = "policy.core-1",
    targetPath = "policy/core-1.md",
) {
    return {
        id,
        signal: `${id} signal`,
        targets: [targetId],
        targetSource: `\`content/${targetPath}\``,
    };
}

function directRouteRegistry() {
    const registry = clone(baseRegistry);
    registry.documents.at(-1).routing = "direct";
    registry.routes.push({
        id: "route.example",
        signal: "example signal",
        targets: ["policy.example"],
        targetSource: "`content/policy/example.md`",
    });
    return registry;
}

function legacyRegistry() {
    return {
        schemaVersion: 1,
        documents: baseRegistry.documents.map((entry) => ({
            ...clone(entry),
            lifecycle: "active",
        })),
        routes: baseRegistry.routes.map((entry) => ({
            ...clone(entry),
            lifecycle: "active",
        })),
    };
}
