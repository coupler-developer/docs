import { execFileSync, spawnSync } from "node:child_process";
import { createHash, generateKeyPairSync } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, it } from "node:test";
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";

const scriptsRoot = path.dirname(fileURLToPath(import.meta.url));
const sourceRepoRoot = path.resolve(scriptsRoot, "..");
const validator = path.join(scriptsRoot, "validate-release-pr-transition.mjs");
let repoRoot;

beforeEach(() => {
  repoRoot = fs.mkdtempSync(path.join(os.tmpdir(), "release-pr-transition-"));
  git(["init"]);
  git(["checkout", "-B", "main"]);
  git(["config", "user.email", "release-transition@example.invalid"]);
  git(["config", "user.name", "Release Transition Test"]);
  fs.writeFileSync(path.join(repoRoot, "README.md"), "# Test\n");
  commitAll("base");
});

afterEach(() => {
  fs.rmSync(repoRoot, { recursive: true, force: true });
});

describe("release PR transition validator", () => {
  it("rejects a v2 DB migration release before activation exists on the base", () => {
    const base = git(["rev-parse", "HEAD"]);
    git(["checkout", "-b", "docs/test/db-before-activation"]);
    writeRecord(pendingDbMigrationMetadata());
    commitAll("add DB migration release before activation");

    const result = runValidator(base);

    assert.notEqual(result.status, 0);
    assert.match(
      result.stderr,
      /DB migration v2 records require the activation marker on the base ref/,
    );
  });

  it("rejects trust proposal and activation in the same PR", () => {
    const base = git(["rev-parse", "HEAD"]);
    git(["checkout", "-b", "docs/test/same-pr-trust-activation"]);
    const { publicKey } = generateKeyPairSync("ed25519");
    const publicKeyPem = publicKey.export({ type: "spki", format: "pem" });
    const proposalPath =
      "content/policy/db-migration-trust-proposals/0001-release-signer.json";
    const proposal = {
      schema: "db-migration-trust-proposal/v2",
      epoch: 1,
      keyId: "release-signer",
      algorithm: "ed25519",
      environments: ["dev", "prod"],
      publicKeyPem,
    };
    writeJson(proposalPath, proposal);
    commitAll("propose DB migration signer");
    const proposalCommit = git(["rev-parse", "HEAD"]);
    const proposalSource = fs.readFileSync(path.join(repoRoot, proposalPath), "utf8");
    writeJson("content/policy/db-migration-trust-epochs/0001-release-signer.json", {
      schema: "db-migration-trust-epoch/v2",
      epoch: 1,
      validFromSequence: 1,
      validThroughSequence: null,
      keys: [
        {
          keyId: "release-signer",
          algorithm: "ed25519",
          environments: ["dev", "prod"],
          publicKeyPem,
        },
      ],
      proposal: {
        path: proposalPath,
        sourceRef: proposalCommit,
        sha256: sha256(proposalSource),
      },
      activationBaseRef: base,
    });
    commitAll("activate DB migration signer too early");

    const result = runValidator(base);

    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /proposal\.sourceRef must be on the base first-parent history/);
  });

  it("keeps contract activation separate from the first trust proposal", () => {
    const base = git(["rev-parse", "HEAD"]);
    git(["checkout", "-b", "docs/test/activation-with-trust-proposal"]);
    copyActivationContract();
    const { publicKey } = generateKeyPairSync("ed25519");
    writeJson("content/policy/db-migration-trust-proposals/0001-release-signer.json", {
      schema: "db-migration-trust-proposal/v2",
      epoch: 1,
      keyId: "release-signer",
      algorithm: "ed25519",
      environments: ["dev", "prod"],
      publicKeyPem: publicKey.export({ type: "spki", format: "pem" }),
    });
    commitAll("mix activation and trust proposal");

    const result = runValidator(base);

    assert.notEqual(result.status, 0);
    assert.match(
      result.stderr,
      /activation and trust proposal\/epoch changes must use separate PRs/,
    );
  });

  it("rejects a symlinked trust proposal", () => {
    const base = git(["rev-parse", "HEAD"]);
    git(["checkout", "-b", "docs/test/symlinked-trust-proposal"]);
    const proposalPath = path.join(
      repoRoot,
      "content/policy/db-migration-trust-proposals/0001-release-signer.json",
    );
    fs.mkdirSync(path.dirname(proposalPath), { recursive: true });
    fs.symlinkSync("missing-proposal.json", proposalPath);
    commitAll("add symlinked trust proposal");

    const result = runValidator(base);

    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /trust files must be regular 100644 files \(got 120000\)/);
  });

  it("requires a trust epoch to be base-owned before terminal DB evidence", () => {
    copyActivationContract();
    const { publicKey } = generateKeyPairSync("ed25519");
    const publicKeyPem = publicKey.export({ type: "spki", format: "pem" });
    const proposalPath =
      "content/policy/db-migration-trust-proposals/0001-release-signer.json";
    writeJson(proposalPath, {
      schema: "db-migration-trust-proposal/v2",
      epoch: 1,
      keyId: "release-signer",
      algorithm: "ed25519",
      environments: ["dev", "prod"],
      publicKeyPem,
    });
    commitAll("install activation and propose DB migration signer");
    const base = git(["rev-parse", "HEAD"]);
    const proposalSource = fs.readFileSync(path.join(repoRoot, proposalPath), "utf8");

    git(["checkout", "-b", "docs/test/epoch-with-terminal-evidence"]);
    writeRecord(pendingDbMigrationMetadata());
    commitAll("fix pending DB migration release");
    writeJson("content/policy/db-migration-trust-epochs/0001-release-signer.json", {
      schema: "db-migration-trust-epoch/v2",
      epoch: 1,
      validFromSequence: 1,
      validThroughSequence: null,
      keys: [
        {
          keyId: "release-signer",
          algorithm: "ed25519",
          environments: ["dev", "prod"],
          publicKeyPem,
        },
      ],
      proposal: {
        path: proposalPath,
        sourceRef: base,
        sha256: sha256(proposalSource),
      },
      activationBaseRef: base,
    });
    writeRecord(releasedDbMigrationMetadata());
    commitAll("activate signer and add terminal DB evidence");

    const result = runValidator(base);

    assert.notEqual(result.status, 0);
    assert.match(
      result.stderr,
      /terminal DB migration evidence requires its trust epoch to exist on the base ref/,
    );
  });

  it("allows epoch activation beside an unrelated correction when terminal DB evidence is unchanged", () => {
    copyActivationContract();
    const { publicKey } = generateKeyPairSync("ed25519");
    const publicKeyPem = publicKey.export({ type: "spki", format: "pem" });
    const proposalPath =
      "content/policy/db-migration-trust-proposals/0001-release-signer.json";
    writeJson(proposalPath, {
      schema: "db-migration-trust-proposal/v2",
      epoch: 1,
      keyId: "release-signer",
      algorithm: "ed25519",
      environments: ["dev", "prod"],
      publicKeyPem,
    });
    writeRecord(releasedDbMigrationMetadata());
    commitAll("install base contract, proposal, and historical terminal evidence");
    const base = git(["rev-parse", "HEAD"]);
    const proposalSource = fs.readFileSync(path.join(repoRoot, proposalPath), "utf8");

    git(["checkout", "-b", "docs/test/epoch-with-unrelated-correction"]);
    writeJson("content/policy/db-migration-trust-epochs/0001-release-signer.json", {
      schema: "db-migration-trust-epoch/v2",
      epoch: 1,
      validFromSequence: 1,
      validThroughSequence: null,
      keys: [
        {
          keyId: "release-signer",
          algorithm: "ed25519",
          environments: ["dev", "prod"],
          publicKeyPem,
        },
      ],
      proposal: {
        path: proposalPath,
        sourceRef: base,
        sha256: sha256(proposalSource),
      },
      activationBaseRef: base,
    });
    const corrected = releasedDbMigrationMetadata();
    corrected.scopeResults.docs.evidence = { correction: "updated docs evidence" };
    writeRecord(corrected);
    commitAll("activate signer and correct unrelated docs evidence");

    const result = runValidator(base);

    assert.equal(result.status, 0, result.stdout + result.stderr);

    git(["checkout", "-B", "docs/test/epoch-with-terminal-db-deletion", base]);
    writeJson("content/policy/db-migration-trust-epochs/0001-release-signer.json", {
      schema: "db-migration-trust-epoch/v2",
      epoch: 1,
      validFromSequence: 1,
      validThroughSequence: null,
      keys: [
        {
          keyId: "release-signer",
          algorithm: "ed25519",
          environments: ["dev", "prod"],
          publicKeyPem,
        },
      ],
      proposal: {
        path: proposalPath,
        sourceRef: base,
        sha256: sha256(proposalSource),
      },
      activationBaseRef: base,
    });
    const removedDbScope = releasedDbMigrationMetadata();
    removedDbScope.releaseScopes = removedDbScope.releaseScopes.filter(
      (scope) => scope !== "db-migration",
    );
    delete removedDbScope.scopeResults["db-migration"];
    writeRecord(removedDbScope);
    commitAll("activate signer and delete terminal DB evidence");

    const deletionResult = runValidator(base);

    assert.notEqual(deletionResult.status, 0);
    assert.match(
      deletionResult.stderr,
      /terminal DB migration evidence requires its trust epoch to exist on the base ref/,
    );
  });

  it("passes a new pending then released record in one PR history", () => {
    const base = git(["rev-parse", "HEAD"]);
    git(["checkout", "-b", "docs/test/release"]);
    writeRecord(pendingMetadata());
    commitAll("pending release");
    writeRecord(releasedMetadata());
    commitAll("released evidence");

    const result = runValidator(base);

    assert.equal(result.status, 0, result.stdout + result.stderr);
    assert.match(result.stdout, /Release PR transition validation passed/);
  });

  it("rejects a DB catalog rewrite between pending snapshots", () => {
    copyActivationContract();
    commitAll("install DB migration activation");
    const base = git(["rev-parse", "HEAD"]);
    git(["checkout", "-b", "docs/test/rewrite-pending-db-catalog"]);
    writeRecord(pendingDbMigrationMetadata());
    commitAll("fix first pending DB target");
    const rewrittenPending = pendingDbMigrationMetadata();
    rewrittenPending.scopeResults["db-migration"].evidence.catalog.sha256 = "e".repeat(64);
    writeRecord(rewrittenPending);
    commitAll("rewrite pending DB target");
    const released = releasedDbMigrationMetadata();
    released.scopeResults["db-migration"].evidence.catalog.sha256 = "e".repeat(64);
    writeRecord(released);
    commitAll("release rewritten DB target");

    const result = runValidator(base);

    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /frozen release target changed at scopeResults\.db-migration\.evidence\.catalog/);
  });

  it("rejects a DB target rewrite when pending transitions to rolled_back", () => {
    copyActivationContract();
    commitAll("install DB migration activation");
    const base = git(["rev-parse", "HEAD"]);
    git(["checkout", "-b", "docs/test/rolled-back-db-catalog-rewrite"]);
    writeRecord(pendingDbMigrationMetadata());
    commitAll("fix pending DB target");
    const rolledBack = metadataWithStatus(releasedDbMigrationMetadata(), "rolled_back");
    rolledBack.scopeResults["db-migration"].evidence.catalog.sha256 = "e".repeat(64);
    writeRecord(rolledBack);
    commitAll("roll back rewritten DB target");

    const result = runValidator(base);

    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /frozen release target changed at scopeResults\.db-migration\.evidence\.catalog/);
  });

  it("rejects a terminal correction that rewrites the first pending DB target", () => {
    copyActivationContract();
    writeRecord(pendingDbMigrationMetadata());
    commitAll("fix historical pending DB target");
    writeRecord(releasedDbMigrationMetadata());
    commitAll("record historical terminal DB target");
    const base = git(["rev-parse", "HEAD"]);
    git(["checkout", "-b", "docs/test/terminal-db-catalog-rewrite"]);
    const corrected = releasedDbMigrationMetadata();
    corrected.scopeResults["db-migration"].evidence.catalog.sha256 = "e".repeat(64);
    writeRecord(corrected);
    commitAll("rewrite terminal DB target");

    const result = runValidator(base);

    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /frozen release target changed at scopeResults\.db-migration\.evidence\.catalog/);
  });

  it("rejects deletion of a terminal DB migration release record", () => {
    copyActivationContract();
    writeRecord(pendingDbMigrationMetadata());
    commitAll("fix pending DB migration target");
    writeRecord(releasedDbMigrationMetadata());
    commitAll("record terminal DB migration evidence");
    const base = git(["rev-parse", "HEAD"]);
    git(["checkout", "-b", "docs/test/delete-terminal-db-release"]);
    fs.rmSync(path.join(repoRoot, "content/releases/v9.9.0.md"));
    commitAll("delete terminal DB migration release");

    const result = runValidator(base);

    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /release records cannot be deleted/);
  });

  it("rejects a direct rolled_back DB migration record without pending history", () => {
    copyActivationContract();
    commitAll("install DB migration activation");
    const base = git(["rev-parse", "HEAD"]);
    git(["checkout", "-b", "docs/test/direct-db-rollback"]);
    writeRecord(metadataWithStatus(releasedDbMigrationMetadata(), "rolled_back"));
    commitAll("record direct DB rollback");

    const result = runValidator(base);

    assert.notEqual(result.status, 0);
    assert.match(
      result.stderr,
      /terminal DB migration evidence requires an earlier pending DB migration snapshot/,
    );
  });

  it("rejects in_progress to terminal DB evidence without pending history", () => {
    copyActivationContract();
    writeRecord(metadataWithStatus(pendingDbMigrationMetadata(), "in_progress"));
    commitAll("record DB migration in progress without pending snapshot");
    const base = git(["rev-parse", "HEAD"]);
    git(["checkout", "-b", "docs/test/in-progress-to-terminal-db"]);
    const released = releasedDbMigrationMetadata();
    released.scopeResults["db-migration"].evidence.catalog.sha256 = "e".repeat(64);
    writeRecord(released);
    commitAll("record terminal DB evidence from mutable in-progress target");

    const result = runValidator(base);

    assert.notEqual(result.status, 0);
    assert.match(
      result.stderr,
      /terminal DB migration evidence requires an earlier pending DB migration snapshot/,
    );
  });

  it("rejects a new released record without a pending commit", () => {
    const base = git(["rev-parse", "HEAD"]);
    git(["checkout", "-b", "docs/test/direct-release"]);
    writeRecord(releasedMetadata());
    commitAll("direct released record");

    const result = runValidator(base);

    assert.notEqual(result.status, 0);
    assert.match(
      result.stderr,
      /a new released record must contain a pending commit in the same PR history/,
    );
  });

  for (const terminalStatus of ["released", "rolled_back", "superseded"]) {
    for (const activeStatus of ["planned", "pending", "in_progress"]) {
      it(`rejects ${terminalStatus} to ${activeStatus} status regression`, () => {
        writeRecord(metadataWithStatus(releasedMetadata(), terminalStatus));
        commitAll(`${terminalStatus} release record`);
        const base = git(["rev-parse", "HEAD"]);
        git(["checkout", "-b", `docs/test/${terminalStatus}-to-${activeStatus}`]);
        writeRecord(metadataWithStatus(pendingMetadata(), activeStatus));
        commitAll(`${activeStatus} release regression`);

        const result = runValidator(base);

        assert.notEqual(result.status, 0);
        assert.match(
          result.stderr,
          new RegExp(
            `terminal release status cannot transition back to active \\(${terminalStatus} -> ${activeStatus}\\)`,
          ),
        );
      });

      it(`rejects ${terminalStatus} to ${activeStatus} to ${terminalStatus} history`, () => {
        writeRecord(metadataWithStatus(releasedMetadata(), terminalStatus));
        commitAll(`${terminalStatus} release record`);
        const base = git(["rev-parse", "HEAD"]);
        git([
          "checkout",
          "-b",
          `docs/test/${terminalStatus}-via-${activeStatus}`,
        ]);
        writeRecord(metadataWithStatus(pendingMetadata(), activeStatus));
        commitAll(`${activeStatus} release regression`);
        writeRecord(metadataWithStatus(releasedMetadata(), terminalStatus));
        commitAll(`restore ${terminalStatus} release status`);

        const result = runValidator(base);

        assert.notEqual(result.status, 0);
        assert.match(
          result.stderr,
          new RegExp(
            `terminal release status cannot transition back to active \\(${terminalStatus} -> ${activeStatus}\\)`,
          ),
        );
      });
    }
  }

  it("rejects frozen service ref changes between pending and released", () => {
    const base = git(["rev-parse", "HEAD"]);
    git(["checkout", "-b", "docs/test/ref-change"]);
    writeRecord(pendingMetadata());
    commitAll("pending release");
    const released = releasedMetadata();
    released.versionMapping["coupler-api"].commit = "d".repeat(40);
    writeRecord(released);
    commitAll("changed release ref");

    const result = runValidator(base);

    assert.notEqual(result.status, 0);
    assert.match(
      result.stderr,
      /frozen release target changed at versionMapping\.coupler-api\.commit/,
    );
  });

  for (const terminalStatus of ["released", "rolled_back", "superseded"]) {
    it(`allows ${terminalStatus} corrective updates that stay terminal`, () => {
      writeRecord(metadataWithStatus(releasedMetadata(), terminalStatus));
      commitAll(`existing ${terminalStatus} record`);
      const base = git(["rev-parse", "HEAD"]);
      git(["checkout", "-b", `docs/test/${terminalStatus}-correction`]);
      const corrected = metadataWithStatus(releasedMetadata(), terminalStatus);
      corrected.scopeResults.docs.evidence = { correction: "updated evidence" };
      writeRecord(corrected);
      commitAll(`correct ${terminalStatus} evidence`);

      const result = runValidator(base);

      assert.equal(result.status, 0, result.stdout + result.stderr);
    });
  }
});

function pendingMetadata() {
  return {
    schema: "release-metadata/v2",
    version: "v9.9.0",
    status: "pending",
    releaseScopes: ["docs", "coupler-api"],
    extraRepoRefs: [],
    versionMapping: {
      docs: { tag: null, commit: null },
      "coupler-api": {
        tag: null,
        commit: "a".repeat(40),
      },
      "coupler-admin-web": { tag: null, commit: null },
      "coupler-mobile-app": {
        store: null,
        releaseTag: null,
        commit: null,
        nextPush: null,
      },
    },
    scopeResults: {
      docs: { status: "pending", evidence: {} },
      "coupler-api": {
        status: "pending",
        evidence: { deployment: null, smoke: null, rollback: "rollback plan" },
      },
    },
    apiContractCutover: null,
  };
}

function releasedMetadata() {
  const metadata = structuredClone(pendingMetadata());
  metadata.status = "released";
  metadata.versionMapping.docs.tag = "v9.9.0";
  metadata.versionMapping["coupler-api"].tag = "v9.9.0";
  metadata.scopeResults.docs.status = "released";
  metadata.scopeResults["coupler-api"] = {
    status: "released",
    evidence: {
      deployment: "production deployed",
      smoke: "HTTP 200",
      rollback: "rollback to previous tag",
    },
  };
  return metadata;
}

function pendingDbMigrationMetadata() {
  const metadata = pendingMetadata();
  const migrationRef = {
    path: "db/migrations/95_expand_example.sql",
    checksumSha256: "b".repeat(64),
  };
  metadata.releaseScopes.push("db-migration");
  metadata.scopeResults["db-migration"] = {
    status: "pending",
    evidence: {
      catalog: {
        repo: "coupler-api",
        sourceRef: metadata.versionMapping["coupler-api"].commit,
        path: "db/schema/schema-contract.json",
        sha256: "c".repeat(64),
      },
      plans: Object.fromEntries(
        ["dev", "prod"].map((environment) => [
          environment,
          {
            operation: "apply",
            targetRefs: [migrationRef],
            batches: [
              {
                batchId: "expand-1",
                order: 1,
                stage: "expand",
                sqlRefs: [migrationRef],
                requiredGateIds: [
                  "DBM-GATE-000",
                  "DBM-GATE-010",
                  "DBM-GATE-100",
                ],
                attestation: null,
              },
            ],
          },
        ]),
      ),
      rollbackPlan: null,
    },
  };
  return metadata;
}

function releasedDbMigrationMetadata() {
  const metadata = pendingDbMigrationMetadata();
  metadata.status = "released";
  metadata.versionMapping.docs.tag = "v9.9.0";
  metadata.versionMapping["coupler-api"].tag = "v9.9.0";
  metadata.scopeResults.docs.status = "released";
  metadata.scopeResults["coupler-api"] = {
    status: "released",
    evidence: {
      deployment: "production deployed",
      smoke: "HTTP 200",
      rollback: "rollback to previous tag",
    },
  };
  metadata.scopeResults["db-migration"].status = "released";
  metadata.scopeResults["db-migration"].evidence.rollbackPlan =
    "restore the verified snapshot and run the documented recovery migration";
  for (const [environment, plan] of Object.entries(
    metadata.scopeResults["db-migration"].evidence.plans,
  )) {
    plan.batches[0].attestation = {
      path: `content/releases/evidence/db-migrations/v9.9.0/${environment}/expand-1.attestation.json`,
      sha256: "d".repeat(64),
    };
  }
  return metadata;
}

function metadataWithStatus(metadata, status) {
  const result = structuredClone(metadata);
  result.status = status;

  for (const scopeResult of Object.values(result.scopeResults)) {
    scopeResult.status = status;

    if (status === "rolled_back") {
      scopeResult.rollbackReason = "release was rolled back";
    }

    if (status === "superseded") {
      scopeResult.supersededBy = "v9.9.1";
      scopeResult.incompleteReason = "replaced by v9.9.1";
      scopeResult.tagStatus = "not_created";
    }
  }

  return result;
}

function writeRecord(metadata) {
  const releaseDir = path.join(repoRoot, "content", "releases");
  fs.mkdirSync(releaseDir, { recursive: true });
  fs.writeFileSync(
    path.join(releaseDir, "v9.9.0.md"),
    [
      "# Release",
      "",
      "```release-metadata",
      JSON.stringify(metadata, null, 2),
      "```",
      "",
    ].join("\n"),
  );
}

function writeJson(relativePath, value) {
  const target = path.join(repoRoot, relativePath);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, `${JSON.stringify(value, null, 2)}\n`);
}

function copyActivationContract() {
  for (const relativePath of [
    "content/policy/db-migration-frontier-bootstrap-v2.json",
    "content/policy/db-migration-trust-bootstrap-v2.json",
    "content/policy/db-migration-gate-activation-v2.json",
    "scripts/db-migration-release-contract-v2.mjs",
  ]) {
    const target = path.join(repoRoot, relativePath);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.copyFileSync(path.join(sourceRepoRoot, relativePath), target);
  }
}

function sha256(source) {
  return createHash("sha256").update(source).digest("hex");
}

function runValidator(base) {
  return spawnSync(
    process.execPath,
    [validator, "--base-ref", base, "--head-ref", "HEAD"],
    { cwd: repoRoot, encoding: "utf8" },
  );
}

function commitAll(message) {
  git(["add", "."]);
  git(["commit", "-m", message]);
}

function git(args) {
  return execFileSync("git", args, {
    cwd: repoRoot,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  }).trim();
}
