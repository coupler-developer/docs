import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { validateDocsReleaseTagReady } from "./validate-docs-release-tag-ready.mjs";

describe("docs release tag readiness", () => {
  it("accepts a released record with a released docs scope and exact tag", () => {
    assert.deepEqual(validateDocsReleaseTagReady(recordSource(), "v9.9.0"), []);
  });

  it("rejects a pending release or pending docs scope", () => {
    assert(
      validateDocsReleaseTagReady(
        recordSource({ status: "pending", docsStatus: "pending" }),
        "v9.9.0",
      ).some((error) => /requires released metadata status/.test(error)),
    );
    assert(
      validateDocsReleaseTagReady(recordSource({ docsStatus: "pending" }), "v9.9.0")
        .some((error) => /requires released docs scope/.test(error)),
    );
  });

  it("rejects a mismatched version mapping tag", () => {
    assert(
      validateDocsReleaseTagReady(recordSource({ mappedTag: "v9.9.1" }), "v9.9.0")
        .some((error) => /tag mapping must equal v9\.9\.0/.test(error)),
    );
  });
});

function recordSource({
  status = "released",
  docsStatus = "released",
  mappedTag = "v9.9.0",
} = {}) {
  return [
    "```release-metadata",
    JSON.stringify({
      schema: "release-metadata/v3",
      version: "v9.9.0",
      status,
      versionMapping: { docs: { tag: mappedTag, commit: null } },
      scopeResults: { docs: { status: docsStatus, summary: "docs", evidence: {} } },
    }),
    "```",
  ].join("\n");
}
