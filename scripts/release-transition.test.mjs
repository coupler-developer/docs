import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { validatePendingToReleasedTransition } from "./release-transition.mjs";

const apiCommit = "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
const adminCommit = "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb";
const mobileCommit = "cccccccccccccccccccccccccccccccccccccccc";

describe("pending to released transition", () => {
  it("allows deployment evidence and release tags to be added without changing frozen targets", () => {
    const pending = pendingMetadata();
    const released = releasedMetadata();

    assert.deepEqual(
      validatePendingToReleasedTransition(pending, released, "v9.9.0"),
      [],
    );
  });

  it("rejects a service commit change after pending", () => {
    const pending = pendingMetadata();
    const released = releasedMetadata();
    released.versionMapping["coupler-api"].commit = "d".repeat(40);

    assert.deepEqual(
      validatePendingToReleasedTransition(pending, released, "v9.9.0"),
      [
        `v9.9.0: frozen release target changed at versionMapping.coupler-api.commit (${apiCommit} -> ${"d".repeat(40)})`,
      ],
    );
  });

  it("rejects release scope changes after pending", () => {
    const pending = pendingMetadata();
    const released = releasedMetadata();
    released.releaseScopes = ["docs", "coupler-api", "coupler-admin-web"];

    assert.deepEqual(
      validatePendingToReleasedTransition(pending, released, "v9.9.0"),
      [
        "v9.9.0: frozen release target changed at releaseScopes ([\"docs\",\"coupler-api\",\"coupler-admin-web\",\"mobile-nextpush\"] -> [\"docs\",\"coupler-api\",\"coupler-admin-web\"])",
      ],
    );
  });

  it("rejects Mobile Store and contract comparison ref changes after pending", () => {
    const pending = pendingMetadata();
    const released = releasedMetadata();
    released.versionMapping["coupler-mobile-app"].store = "9.9.1 (901)";
    released.apiContractCutover.comparisonRefs["coupler-api"] = "e".repeat(40);

    assert.deepEqual(
      validatePendingToReleasedTransition(pending, released, "v9.9.0"),
      [
        "v9.9.0: frozen release target changed at versionMapping.coupler-mobile-app.store (9.9.0 (900) -> 9.9.1 (901))",
        `v9.9.0: frozen release target changed at apiContractCutover.comparisonRefs.coupler-api (${apiCommit} -> ${"e".repeat(40)})`,
      ],
    );
  });
});

function pendingMetadata() {
  return {
    schema: "release-metadata/v1",
    version: "v9.9.0",
    status: "pending",
    releaseScopes: [
      "docs",
      "coupler-api",
      "coupler-admin-web",
      "mobile-nextpush",
    ],
    extraRepoRefs: [],
    versionMapping: {
      docs: { tag: null, commit: null },
      "coupler-api": { tag: null, commit: apiCommit },
      "coupler-admin-web": { tag: null, commit: adminCommit },
      "coupler-mobile-app": {
        store: "9.9.0 (900)",
        releaseTag: null,
        commit: mobileCommit,
        nextPush: null,
      },
    },
    scopeResults: {},
    apiContractCutover: {
      status: "pending",
      comparisonRefs: {
        "coupler-api": apiCommit,
        "coupler-mobile-app": mobileCommit,
        "coupler-admin-web": adminCommit,
      },
    },
  };
}

function releasedMetadata() {
  const metadata = structuredClone(pendingMetadata());
  metadata.status = "released";
  metadata.versionMapping.docs.tag = "v9.9.0";
  metadata.versionMapping["coupler-api"].tag = "v9.9.0";
  metadata.versionMapping["coupler-admin-web"].tag = "v9.9.0";
  metadata.versionMapping["coupler-mobile-app"].nextPush =
    "Android Production v99; iOS Production v99";
  metadata.apiContractCutover.status = "released";
  metadata.scopeResults = {
    docs: { status: "released", evidence: {} },
  };

  return metadata;
}
