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
    /`best = pinned`/u,
];

function assertPinnedCanonicalCurrentDocs(architecture, policy) {
    const currentDocs = `${architecture}\n${policy}`;
    for (const retiredPattern of retiredContractPatterns) {
        assert.doesNotMatch(currentDocs, retiredPattern);
    }

    assert.match(architecture, /\/admin\/lounge\/pinned/u);
    assert.match(architecture, /AdminLoungePinnedRequest\.pinned/u);
    assert.match(architecture, /AdminLoungeSaveRequest\.pinned/u);
    assert.match(architecture, /Mobile 목록·상세 응답은 canonical `pinned`만 노출/u);
    assert.match(architecture, /2\.5\.0 Mobile bundle/u);
    assert.match(policy, /\/admin\/lounge\/pinned/u);
    assert.match(policy, /\/admin\/lounge\/save`의 `pinned/u);
}

test("current lounge contract exposes only canonical pinned after App cutover", () => {
    assertPinnedCanonicalCurrentDocs(loungeArchitecture, pushPolicy);
});

test("the retired App response alias fixture is rejected", () => {
    const retiredAliasFixture = loungeArchitecture.replace(
        "Mobile 목록·상세 응답은 canonical `pinned`만 노출한다.",
        "Mobile 목록·상세 응답은 `best = pinned`를 노출한다.",
    );

    assert.throws(() =>
        assertPinnedCanonicalCurrentDocs(retiredAliasFixture, pushPolicy),
    );
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
