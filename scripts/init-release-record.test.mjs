import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, it } from "node:test";
import { fileURLToPath } from "node:url";

import { initializeReleaseRecord } from "./init-release-record.mjs";

const scriptsRoot = path.dirname(fileURLToPath(import.meta.url));
const workspaceDocsRoot = path.dirname(scriptsRoot);
let docsRoot;

beforeEach(() => {
  docsRoot = fs.mkdtempSync(path.join(os.tmpdir(), "init-release-record-"));
  writeFixture(docsRoot);
});

afterEach(() => {
  fs.rmSync(docsRoot, { recursive: true, force: true });
});

describe("release record initializer", () => {
  it("creates a release record and registers every required surface", () => {
    const changedPaths = initializeReleaseRecord({ docsRoot, version: "v1.1.0" });

    assert.deepEqual(changedPaths, [
      "content/releases/v1.1.0.md",
      "document-lifecycle-registry.json",
      "content/AGENTS.md",
      "mkdocs.yml",
    ]);

    const releaseRecord = read("content/releases/v1.1.0.md");
    assert.match(releaseRecord, /^# 1\.1\.0 릴리스 실행 기록/m);
    assert.match(releaseRecord, /"version": "v1\.1\.0"/);
    assert.equal((releaseRecord.match(/"status": "planned"/g) ?? []).length, 2);
    assert.doesNotMatch(releaseRecord, /"status": "pending"/);
    assert.doesNotMatch(releaseRecord, /X\.Y\.Z/);

    const registry = JSON.parse(read("document-lifecycle-registry.json"));
    assert.deepEqual(registry.documents, [
      {
        id: "releases.v1.0.0",
        path: "releases/v1.0.0.md",
        routing: "historical",
      },
      {
        id: "releases.v1.1.0",
        path: "releases/v1.1.0.md",
        routing: "historical",
      },
      {
        id: "technical-debt.example",
        path: "technical-debt/example.md",
        routing: "closure",
      },
    ]);

    assert.match(
      read("content/AGENTS.md"),
      /### Releases\n\n- \[1\.1\.0 릴리스 실행 기록\]\(releases\/v1\.1\.0\.md\).*\n- \[1\.0\.0/m,
    );
    assert.match(
      read("mkdocs.yml"),
      /  - Releases:\n      - 1\.1\.0 릴리스 실행 기록: releases\/v1\.1\.0\.md\n      - 1\.0\.0/m,
    );
  });

  it("rejects an existing release without changing any file", () => {
    initializeReleaseRecord({ docsRoot, version: "v1.1.0" });
    const before = snapshot();

    assert.throws(
      () => initializeReleaseRecord({ docsRoot, version: "v1.1.0" }),
      /릴리스 기록이 이미 존재합니다/,
    );
    assert.deepEqual(snapshot(), before);
  });

  it("rejects invalid versions before changing any file", () => {
    const before = snapshot();

    assert.throws(
      () => initializeReleaseRecord({ docsRoot, version: "1.1.0" }),
      /vMAJOR\.MINOR\.PATCH/,
    );
    assert.deepEqual(snapshot(), before);
  });

  it("rejects a template that does not start in planned without changing any file", () => {
    const templatePath = "content/templates/release-record-template.md";
    write(
      templatePath,
      read(templatePath).replace('"status": "planned"', '"status": "pending"'),
    );
    const before = snapshot();

    assert.throws(
      () => initializeReleaseRecord({ docsRoot, version: "v1.1.0" }),
      /모든 scopeResults를 planned로 시작/,
    );
    assert.deepEqual(snapshot(), before);
  });

  it("rejects lifecycle registry collisions before changing any file", () => {
    const registry = JSON.parse(read("document-lifecycle-registry.json"));
    registry.documents.push({
      id: "releases.v1.1.0",
      path: "releases/v1.1.0.md",
      routing: "historical",
    });
    write("document-lifecycle-registry.json", `${JSON.stringify(registry, null, 4)}\n`);
    const before = snapshot();

    assert.throws(
      () => initializeReleaseRecord({ docsRoot, version: "v1.1.0" }),
      /lifecycle registry에 같은 ID 또는 경로/,
    );
    assert.deepEqual(snapshot(), before);
  });

  it("rejects retired IDs and paths before changing any file", () => {
    write(
      "document-retirement-ledger.json",
      `${JSON.stringify({
        schemaVersion: 1,
        retirements: [
          {
            id: "releases.v1.1.0",
            kind: "document",
            reservedPaths: ["releases/v1.1.0.md"],
            retiredAt: "2026-08-14",
          },
        ],
      }, null, 4)}\n`,
    );
    const before = snapshot();

    assert.throws(
      () => initializeReleaseRecord({ docsRoot, version: "v1.1.0" }),
      /retired ID 또는 경로는 재사용할 수 없습니다/,
    );
    assert.deepEqual(snapshot(), before);
  });

  it("rejects missing or ambiguous index anchors before changing any file", () => {
    write("content/AGENTS.md", "# AGENTS\n\nNo release index.\n");
    const before = snapshot();

    assert.throws(
      () => initializeReleaseRecord({ docsRoot, version: "v1.1.0" }),
      /Releases 인덱스 anchor는 정확히 하나/,
    );
    assert.deepEqual(snapshot(), before);
  });

  it("preserves a concurrent edit and rolls back earlier writes", () => {
    const registryPath = path.join(
      docsRoot,
      "document-lifecycle-registry.json",
    );
    const originalRegistry = read("document-lifecycle-registry.json");
    const originalLinkSync = fs.linkSync;
    fs.linkSync = (...args) => {
      originalLinkSync(...args);
      fs.appendFileSync(registryPath, "\n");
    };

    try {
      assert.throws(
        () => initializeReleaseRecord({ docsRoot, version: "v1.1.0" }),
        /파일 변경을 되돌렸습니다/,
      );
    } finally {
      fs.linkSync = originalLinkSync;
    }

    assert.equal(read("document-lifecycle-registry.json"), `${originalRegistry}\n`);
    assert.equal(fs.existsSync(path.join(docsRoot, "content/releases/v1.1.0.md")), false);
    assert.doesNotMatch(read("content/AGENTS.md"), /1\.1\.0/);
    assert.doesNotMatch(read("mkdocs.yml"), /1\.1\.0/);
  });

  it("does not overwrite a concurrent edit made after replacing a file", () => {
    const registryPath = path.join(
      docsRoot,
      "document-lifecycle-registry.json",
    );
    const agentsPath = path.join(docsRoot, "content/AGENTS.md");
    const originalRegistry = read("document-lifecycle-registry.json");
    const originalLink = fs.linkSync;
    const originalRename = fs.renameSync;
    let registryReplaced = false;
    fs.linkSync = (source, target) => {
      originalLink(source, target);
      if (target === registryPath) {
        fs.appendFileSync(target, "CONCURRENT_EDIT\n");
        registryReplaced = true;
      }
    };
    fs.renameSync = (source, target) => {
      if (registryReplaced && source === agentsPath) {
        throw new Error("forced failure after concurrent edit");
      }
      originalRename(source, target);
    };

    try {
      assert.throws(
        () => initializeReleaseRecord({ docsRoot, version: "v1.1.0" }),
        /동시 변경을 보존했습니다.*자동 복구하지 않았습니다/,
      );
    } finally {
      fs.linkSync = originalLink;
      fs.renameSync = originalRename;
    }

    assert.match(read("document-lifecycle-registry.json"), /CONCURRENT_EDIT/);
    const backupNames = fs
      .readdirSync(docsRoot)
      .filter(
        (fileName) =>
          fileName.startsWith(".document-lifecycle-registry.json.") &&
          fileName.endsWith(".bak"),
      );
    assert.equal(backupNames.length, 1);
    assert.equal(read(backupNames[0]), originalRegistry);
    assert.equal(
      fs.existsSync(path.join(docsRoot, "content/releases/v1.1.0.md")),
      false,
    );
  });

  it("does not overwrite a file created during replacement", () => {
    const registryPath = path.join(
      docsRoot,
      "document-lifecycle-registry.json",
    );
    const originalRegistry = read("document-lifecycle-registry.json");
    const originalLink = fs.linkSync;
    fs.linkSync = (source, target) => {
      if (target === registryPath) {
        fs.writeFileSync(target, "CONCURRENT_EDIT\n");
      }
      originalLink(source, target);
    };

    try {
      assert.throws(
        () => initializeReleaseRecord({ docsRoot, version: "v1.1.0" }),
        /동시 변경을 보존했습니다.*자동 복구하지 않았습니다/,
      );
    } finally {
      fs.linkSync = originalLink;
    }

    assert.equal(read("document-lifecycle-registry.json"), "CONCURRENT_EDIT\n");
    const backupNames = fs
      .readdirSync(docsRoot)
      .filter(
        (fileName) =>
          fileName.startsWith(".document-lifecycle-registry.json.") &&
          fileName.endsWith(".bak"),
      );
    assert.equal(backupNames.length, 1);
    assert.equal(read(backupNames[0]), originalRegistry);
    assert.equal(
      fs.existsSync(path.join(docsRoot, "content/releases/v1.1.0.md")),
      false,
    );
  });

  it("changes only required bytes on the current workspace surfaces", () => {
    const version = "v987654321.0.0";
    const numericVersion = version.slice(1);
    const surfacePaths = [
      "content/templates/release-record-template.md",
      "document-lifecycle-registry.json",
      "document-retirement-ledger.json",
      "content/AGENTS.md",
      "mkdocs.yml",
    ];
    for (const relativePath of surfacePaths) {
      write(
        relativePath,
        fs.readFileSync(path.join(workspaceDocsRoot, relativePath), "utf8"),
      );
    }
    runGit(["init", "--quiet"]);
    runGit(["add", "."]);
    runGit([
      "-c",
      "user.name=Release Record Test",
      "-c",
      "user.email=release-record-test@example.invalid",
      "commit",
      "--quiet",
      "-m",
      "fixture baseline",
    ]);

    const before = {
      agents: read("content/AGENTS.md"),
      mkdocs: read("mkdocs.yml"),
      registry: read("document-lifecycle-registry.json"),
      template: read("content/templates/release-record-template.md"),
    };

    initializeReleaseRecord({ docsRoot, version });

    const validation = spawnSync(
      process.execPath,
      [
        path.join(scriptsRoot, "validate-release-records.mjs"),
        "--base-ref",
        "HEAD",
      ],
      { cwd: docsRoot, encoding: "utf8" },
    );
    assert.equal(
      validation.status,
      0,
      validation.stderr || validation.stdout,
    );

    assert.equal(
      read(`content/releases/${version}.md`),
      before.template.replaceAll("X.Y.Z", numericVersion),
    );
    assert.equal(
      removeExactlyOnce(
        read("document-lifecycle-registry.json"),
        registryEntrySource(version),
      ),
      before.registry,
    );
    assert.equal(
      removeExactlyOnce(
        read("content/AGENTS.md"),
        `- [${numericVersion} 릴리스 실행 기록](releases/${version}.md) - ${numericVersion} 운영 릴리스 기록\n`,
      ),
      before.agents,
    );
    assert.equal(
      removeExactlyOnce(
        read("mkdocs.yml"),
        `      - ${numericVersion} 릴리스 실행 기록: releases/${version}.md\n`,
      ),
      before.mkdocs,
    );
  });
});

function registryEntrySource(version) {
  return [
    "        {",
    `            "id": "releases.${version}",`,
    `            "path": "releases/${version}.md",`,
    '            "routing": "historical"',
    "        },",
    "",
  ].join("\n");
}

function removeExactlyOnce(source, fragment) {
  const firstIndex = source.indexOf(fragment);
  assert.notEqual(firstIndex, -1, `missing expected fragment: ${fragment}`);
  assert.equal(
    source.indexOf(fragment, firstIndex + fragment.length),
    -1,
    `duplicate expected fragment: ${fragment}`,
  );
  return source.slice(0, firstIndex) + source.slice(firstIndex + fragment.length);
}

function writeFixture(root) {
  fs.mkdirSync(path.join(root, "content", "templates"), { recursive: true });
  fs.mkdirSync(path.join(root, "content", "releases"), { recursive: true });
  write(
    "content/templates/release-record-template.md",
    [
      "# X.Y.Z 릴리스 실행 기록",
      "",
      "```release-metadata",
      "{",
      '  "version": "vX.Y.Z",',
      '  "status": "planned",',
      '  "scopeResults": {',
      '    "docs": { "status": "planned" }',
      "  }",
      "}",
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
          id: "releases.v1.0.0",
          path: "releases/v1.0.0.md",
          routing: "historical",
        },
        {
          id: "technical-debt.example",
          path: "technical-debt/example.md",
          routing: "closure",
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
    "# AGENTS\n\n### Releases\n\n- [1.0.0 릴리스 실행 기록](releases/v1.0.0.md) - 기존 기록\n",
  );
  write(
    "mkdocs.yml",
    "nav:\n  - Releases:\n      - 1.0.0 릴리스 실행 기록: releases/v1.0.0.md\n",
  );
}

function read(relativePath) {
  return fs.readFileSync(path.join(docsRoot, relativePath), "utf8");
}

function write(relativePath, source) {
  const absolutePath = path.join(docsRoot, relativePath);
  fs.mkdirSync(path.dirname(absolutePath), { recursive: true });
  fs.writeFileSync(absolutePath, source);
}

function runGit(args) {
  const result = spawnSync("git", args, { cwd: docsRoot, encoding: "utf8" });
  assert.equal(result.status, 0, result.stderr || result.stdout);
}

function snapshot() {
  return {
    agents: read("content/AGENTS.md"),
    files: fs.readdirSync(path.join(docsRoot, "content", "releases")),
    ledger: read("document-retirement-ledger.json"),
    mkdocs: read("mkdocs.yml"),
    registry: read("document-lifecycle-registry.json"),
  };
}
