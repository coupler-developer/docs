import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, it } from "node:test";

import { readRegularRepoFile } from "./regular-repo-file.mjs";

let repoRoot;

beforeEach(() => {
  repoRoot = fs.mkdtempSync(path.join(os.tmpdir(), "regular-db-evidence-"));
});

afterEach(() => {
  fs.rmSync(repoRoot, { recursive: true, force: true });
});

describe("regular DB migration evidence files", () => {
  for (const relativePath of [
    "content/releases/evidence/db-migrations/v1/dev/apply.attestation.json",
    "content/releases/evidence/db-migrations/v1/dev/DBM-GATE-100.log",
  ]) {
    it(`accepts a regular file and rejects a symlink at ${path.basename(relativePath)}`, () => {
      const target = path.join(repoRoot, relativePath);
      const source = `${relativePath} evidence\n`;
      fs.mkdirSync(path.dirname(target), { recursive: true });
      fs.writeFileSync(target, source);
      assert.equal(readRegularRepoFile(repoRoot, relativePath), source);

      fs.rmSync(target);
      fs.writeFileSync(`${target}.target`, source);
      fs.symlinkSync(`${path.basename(target)}.target`, target);
      assert.equal(readRegularRepoFile(repoRoot, relativePath), null);
    });
  }

  it("rejects paths outside the repository root", () => {
    assert.equal(readRegularRepoFile(repoRoot, "../outside.attestation.json"), null);
  });

  it("rejects a regular file reached through a symlinked parent directory", () => {
    const evidenceRoot = path.join(repoRoot, "content/releases/evidence/db-migrations");
    const actualDirectory = path.join(evidenceRoot, "actual");
    fs.mkdirSync(actualDirectory, { recursive: true });
    fs.writeFileSync(path.join(actualDirectory, "DBM-GATE-100.log"), "gate evidence\n");
    fs.symlinkSync("actual", path.join(evidenceRoot, "alias"), "dir");

    assert.equal(
      readRegularRepoFile(
        repoRoot,
        "content/releases/evidence/db-migrations/alias/DBM-GATE-100.log",
      ),
      null,
    );
  });
});
