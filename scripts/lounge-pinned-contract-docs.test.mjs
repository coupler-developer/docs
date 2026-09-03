import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const scriptsRoot = path.dirname(fileURLToPath(import.meta.url));
const docsRoot = path.dirname(scriptsRoot);
const loungeArchitecture = fs.readFileSync(
    path.join(docsRoot, "content", "architecture", "lounge-system.md"),
    "utf8",
);
const pushPolicy = fs.readFileSync(
    path.join(
        docsRoot,
        "content",
        "policy",
        "push-notification-policy.md",
    ),
    "utf8",
);

const retiredContractPatterns = [
    /\/admin\/lounge\/best/u,
    /AdminLoungeBestRequest/u,
    /AdminLoungeSaveRequest\.best/u,
    /pinned\s+AS\s+best/u,
    /lounge-pinned-boundary/u,
];

function assertPinnedCanonicalCurrentDocs(architecture, policy) {
    const currentDocs = `${architecture}\n${policy}`;
    for (const retiredPattern of retiredContractPatterns) {
        assert.doesNotMatch(currentDocs, retiredPattern);
    }

    assert.match(architecture, /\/admin\/lounge\/pinned/u);
    assert.match(architecture, /AdminLoungePinnedRequest\.pinned/u);
    assert.match(architecture, /AdminLoungeSaveRequest\.pinned/u);
    assert.match(architecture, /`best = pinned`/u);
    assert.match(architecture, /2\.5\.0 Mobile bundle/u);
    assert.match(policy, /\/admin\/lounge\/pinned/u);
    assert.match(policy, /\/admin\/lounge\/save`의 `pinned/u);
}

test("current lounge contract keeps pinned canonical with the Mobile best response", () => {
    assertPinnedCanonicalCurrentDocs(loungeArchitecture, pushPolicy);
});

test("the closest retired route fixture is rejected", () => {
    const retiredRouteFixture = loungeArchitecture.replace(
        "/admin/lounge/pinned",
        "/admin/lounge/best",
    );

    assert.throws(() =>
        assertPinnedCanonicalCurrentDocs(retiredRouteFixture, pushPolicy),
    );
});
