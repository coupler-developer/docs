import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, it } from "node:test";

import {
  continueRelease,
  resolvePendingScopes,
  resolveReleasePhase,
  validatePullRequestAdmission,
} from "./release-continue.mjs";

let docsRoot;

beforeEach(() => {
  docsRoot = fs.mkdtempSync(path.join(os.tmpdir(), "release-continue-"));
  writeInitializerFixture();
  git(["init", "--quiet"]);
  git(["checkout", "-B", "main"]);
  git(["config", "user.email", "release-continue@example.invalid"]);
  git(["config", "user.name", "Release Continue Test"]);
  commitAll("base");
});

afterEach(() => {
  fs.rmSync(docsRoot, { recursive: true, force: true });
});

describe("release continuation", () => {
  it("initializes a missing release as a local planned draft", () => {
    const result = continueRelease({ docsRoot, version: "v9.9.0" });

    assert.equal(result.phase, "planned");
    assert.equal(result.created, true);
    assert.deepEqual(result.changedPaths, [
      "content/releases/v9.9.0.md",
      "document-lifecycle-registry.json",
      "content/AGENTS.md",
      "mkdocs.yml",
    ]);
  });

  it("keeps planned local and runs admission plus preflight for pending", () => {
    continueRelease({ docsRoot, version: "v9.9.0" });
    const planned = continueRelease({ docsRoot, version: "v9.9.0" });
    assert.equal(planned.phase, "planned");

    replaceAllInRecord('"status": "planned"', '"status": "pending"');
    commitAll("pending release");
    const head = git(["rev-parse", "HEAD"]);
    let preflightInput = null;
    const pending = continueRelease({
      docsRoot,
      version: "v9.9.0",
      inspectPullRequest: () => passingPullRequest(head),
      runPreflight: (input) => {
        preflightInput = input;
      },
    });

    assert.equal(pending.phase, "execute");
    assert.deepEqual(pending.pendingScopes, ["docs"]);
    assert.deepEqual(preflightInput, {
      docsRoot,
      version: "v9.9.0",
    });
  });

  it("routes an in-progress release back to only its nonterminal scopes", () => {
    continueRelease({ docsRoot, version: "v9.9.0" });
    replaceAllInRecord('"status": "planned"', '"status": "in_progress"');
    commitAll("in progress release");
    const head = git(["rev-parse", "HEAD"]);

    const result = continueRelease({
      docsRoot,
      version: "v9.9.0",
      inspectPullRequest: () => passingPullRequest(head),
      runPreflight: () => {},
    });

    assert.equal(result.phase, "execute");
    assert.deepEqual(result.pendingScopes, ["docs"]);
  });

  it("routes a dirty terminal candidate to final review before PR admission", () => {
    continueRelease({ docsRoot, version: "v9.9.0" });
    replaceAllInRecord('"status": "planned"', '"status": "released"');
    replaceAllInRecord(
      '"docs": {\n      "tag": null',
      '"docs": {\n      "tag": "v9.9.0"',
    );
    let preflightCalled = false;

    const result = continueRelease({
      docsRoot,
      version: "v9.9.0",
      inspectPullRequest: () => {
        throw new Error("terminal release must not inspect a PR");
      },
      runPreflight: () => {
        preflightCalled = true;
      },
    });

    assert.equal(result.phase, "finalize");
    assert.equal(result.readyForMerge, false);
    assert.equal(preflightCalled, false);
  });

  it("admits only the exact clean terminal PR head with required CI", () => {
    continueRelease({ docsRoot, version: "v9.9.0" });
    replaceAllInRecord('"status": "planned"', '"status": "released"');
    replaceAllInRecord(
      '"docs": {\n      "tag": null',
      '"docs": {\n      "tag": "v9.9.0"',
    );
    commitAll("terminal release");
    const head = git(["rev-parse", "HEAD"]);
    let preflightCalled = false;

    const result = continueRelease({
      docsRoot,
      version: "v9.9.0",
      inspectPullRequest: () => passingPullRequest(head),
      runPreflight: () => {
        preflightCalled = true;
      },
    });

    assert.equal(result.phase, "finalize");
    assert.equal(result.readyForMerge, true);
    assert.equal(result.head, head);
    assert.equal(result.pullRequestUrl, "https://example.invalid/pull/1");
    assert.equal(preflightCalled, false);
  });

  it("rejects a terminal candidate change during PR admission", () => {
    continueRelease({ docsRoot, version: "v9.9.0" });
    replaceAllInRecord('"status": "planned"', '"status": "released"');
    replaceAllInRecord(
      '"docs": {\n      "tag": null',
      '"docs": {\n      "tag": "v9.9.0"',
    );
    commitAll("terminal release");
    const admittedHead = git(["rev-parse", "HEAD"]);

    assert.throws(
      () => continueRelease({
        docsRoot,
        version: "v9.9.0",
        inspectPullRequest: () => {
          write("AFTER_TERMINAL_ADMISSION.md", "# Changed during admission\n");
          return passingPullRequest(admittedHead);
        },
        runPreflight: () => {},
      }),
      /PR 확인 중 docs 최종 후보가 바뀌었습니다/,
    );
  });

  it("fails admission when the PR head, Draft state, or CI is not ready", () => {
    const expectedHead = "a".repeat(40);
    const errors = validatePullRequestAdmission(
      {
        headRefOid: "b".repeat(40),
        isDraft: false,
        requiredChecks: [
          {
            name: "docs-structure",
            state: "IN_PROGRESS",
            bucket: "pending",
          },
        ],
      },
      expectedHead,
    );

    assert.equal(errors.length, 3);
    assert.match(errors.join("\n"), /PR head/);
    assert.match(errors.join("\n"), /Draft/);
    assert.match(errors.join("\n"), /필수 CI 상태가 pending/);
  });

  it("does not turn a non-required check into a release gate", () => {
    const head = "a".repeat(40);
    const errors = validatePullRequestAdmission(
      {
        headRefOid: head,
        isDraft: true,
        requiredChecks: [
          { name: "docs-structure", state: "SUCCESS", bucket: "pass" },
        ],
        statusCheckRollup: [
          { name: "optional-report", state: "FAILURE", bucket: "fail" },
        ],
      },
      head,
    );

    assert.deepEqual(errors, []);
  });

  it("rejects a candidate change between CI admission and preflight completion", () => {
    continueRelease({ docsRoot, version: "v9.9.0" });
    replaceAllInRecord('"status": "planned"', '"status": "pending"');
    commitAll("pending release");
    const admittedHead = git(["rev-parse", "HEAD"]);

    assert.throws(
      () => continueRelease({
        docsRoot,
        version: "v9.9.0",
        inspectPullRequest: () => passingPullRequest(admittedHead),
        runPreflight: () => {
          write("AFTER_ADMISSION.md", "# Changed during preflight\n");
          commitAll("move head during preflight");
        },
      }),
      /preflight 중 docs 후보가 바뀌었습니다/,
    );
  });

  it("rejects an uncommitted change during preflight", () => {
    continueRelease({ docsRoot, version: "v9.9.0" });
    replaceAllInRecord('"status": "planned"', '"status": "pending"');
    commitAll("pending release");
    const admittedHead = git(["rev-parse", "HEAD"]);

    assert.throws(
      () => continueRelease({
        docsRoot,
        version: "v9.9.0",
        inspectPullRequest: () => passingPullRequest(admittedHead),
        runPreflight: () => {
          write("AFTER_PREFLIGHT.md", "# Uncommitted change\n");
        },
      }),
      /preflight 중 docs 후보가 바뀌었습니다/,
    );
  });

  it("derives only the active scopes without assuming a fixed deploy sequence", () => {
    const scenarios = [
      { scopes: ["docs"], active: ["docs"] },
      { scopes: ["docs", "coupler-api"], active: ["coupler-api", "docs"] },
      {
        scopes: ["docs", "coupler-admin-web"],
        active: ["coupler-admin-web", "docs"],
      },
      { scopes: ["docs", "db-migration"], active: ["db-migration", "docs"] },
      {
        scopes: ["docs", "coupler-api", "coupler-admin-web"],
        active: ["coupler-admin-web", "docs"],
        released: ["coupler-api"],
      },
      { scopes: ["docs", "mobile-store"], active: ["mobile-store", "docs"] },
      {
        scopes: ["docs", "mobile-nextpush"],
        active: ["mobile-nextpush", "docs"],
      },
    ];

    for (const scenario of scenarios) {
      const released = new Set(scenario.released ?? []);
      const metadata = {
        releaseScopes: scenario.scopes,
        scopeResults: Object.fromEntries(
          scenario.scopes.map((scopeName) => [
            scopeName,
            { status: released.has(scopeName) ? "released" : "pending" },
          ]),
        ),
      };
      assert.deepEqual(
        resolvePendingScopes(metadata).sort(),
        [...scenario.active].sort(),
      );
    }
  });

  it("maps every release lifecycle state to one resumable phase", () => {
    assert.equal(resolveReleasePhase("planned"), "planned");
    assert.equal(resolveReleasePhase("pending"), "execute");
    assert.equal(resolveReleasePhase("in_progress"), "execute");
    for (const status of ["released", "rolled_back", "superseded"]) {
      assert.equal(resolveReleasePhase(status), "finalize");
    }
    assert.throws(() => resolveReleasePhase("unknown"), /지원하지 않는/);
  });
});

function passingPullRequest(head) {
  return {
    headRefOid: head,
    isDraft: true,
    url: "https://example.invalid/pull/1",
    requiredChecks: [
      {
        name: "docs-structure",
        state: "SUCCESS",
        bucket: "pass",
      },
    ],
  };
}

function replaceAllInRecord(from, to) {
  const releasePath = path.join(
    docsRoot,
    "content",
    "releases",
    "v9.9.0.md",
  );
  fs.writeFileSync(
    releasePath,
    fs.readFileSync(releasePath, "utf8").replaceAll(from, to),
  );
}

function writeInitializerFixture() {
  write(
    "content/templates/release-record-template.md",
    [
      "# X.Y.Z 릴리스 실행 기록",
      "",
      "```release-metadata",
      JSON.stringify({
        schema: "release-metadata/v3",
        version: "vX.Y.Z",
        status: "planned",
        releaseScopes: ["docs"],
        extraRepoRefs: [],
        versionMapping: {
          docs: { tag: null, commit: null },
          "coupler-api": { tag: null, commit: null },
          "coupler-admin-web": { tag: null, commit: null },
          "coupler-mobile-app": {
            store: { android: null, ios: null },
            nextPush: null,
            commit: null,
          },
        },
        scopeResults: {
          docs: {
            status: "planned",
            summary: "릴리스 기록 준비",
            evidence: {},
          },
        },
        apiContractCutover: null,
      }, null, 2),
      "```",
      "",
    ].join("\n"),
  );
  write(
    "document-lifecycle-registry.json",
    `${JSON.stringify({
      schemaVersion: 2,
      documents: [
        {
          id: "releases.v9.8.0",
          path: "releases/v9.8.0.md",
          routing: "historical",
        },
      ],
      routes: [],
    }, null, 4)}\n`,
  );
  write(
    "document-retirement-ledger.json",
    `${JSON.stringify({ schemaVersion: 1, retirements: [] }, null, 4)}\n`,
  );
  write(
    "content/AGENTS.md",
    "# AGENTS\n\n### Releases\n\n- [9.8.0 릴리스 실행 기록](releases/v9.8.0.md)\n",
  );
  write(
    "mkdocs.yml",
    "nav:\n  - Releases:\n      - 9.8.0 릴리스 실행 기록: releases/v9.8.0.md\n",
  );
}

function write(relativePath, source) {
  const filePath = path.join(docsRoot, relativePath);
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, source);
}

function commitAll(message) {
  git(["add", "."]);
  git(["commit", "-m", message]);
}

function git(args) {
  return execFileSync("git", args, {
    cwd: docsRoot,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  }).trim();
}
