import assert from "node:assert/strict";
import test from "node:test";

import {
  sha256Hex,
  validateDbMigrationEvidence,
} from "./db-migration-evidence.mjs";
import {
  dbMigrationExecution,
  dbMigrationInputSources,
  dbMigrationPlanFor,
} from "./db-migration-evidence-test-fixtures.mjs";

const version = "v9.9.0";
const apiSourceRef = "a".repeat(40);
const releaseApiSourceRef = "b".repeat(40);
const migrationExecutionSourceFiles = [
  "scripts/db-migration-workflow.ts",
  "scripts/db-migration-executor.ts",
  "scripts/db-schema-contract.ts",
];
const canonical = (value) => `${JSON.stringify(value, null, 2)}\n`;

function scenario(environment = "prod", { outcome, execution = true } = {}) {
  const root = `content/releases/evidence/db-migrations/${version}`;
  const devPlan = dbMigrationPlanFor("dev", { apiSourceRef });
  const devPlanSource = canonical(devPlan);
  const devExecution = dbMigrationExecution("dev", devPlan, "done");
  const plan = dbMigrationPlanFor(environment, {
    apiSourceRef,
    devPlan:
      environment === "prod"
        ? { path: ".runtime/db-migration/dev/plan.json", sha256: sha256Hex(devPlanSource) }
        : null,
    devExecution:
      environment === "prod"
        ? { path: ".runtime/db-migration/dev/execution.jsonl", sha256: sha256Hex(devExecution) }
        : null,
  });
  const planSource = canonical(plan);
  const executionSource = execution
    ? dbMigrationExecution(
        environment,
        plan,
        outcome ?? "done",
      )
    : null;
  const environmentRoot = `${root}/${environment}`;
  const artifacts = {
    [`${root}/dev/plan.json`]: devPlanSource,
    [`${root}/dev/execution.jsonl`]: devExecution,
    [`${environmentRoot}/plan.json`]: planSource,
    ...(executionSource ? { [`${environmentRoot}/execution.jsonl`]: executionSource } : {}),
  };
  return {
    plan,
    planSource,
    execution: executionSource,
    artifacts,
    evidence: {
      plan: { path: `${environmentRoot}/plan.json`, sha256: sha256Hex(planSource) },
      execution: executionSource
        ? { path: `${environmentRoot}/execution.jsonl`, sha256: sha256Hex(executionSource) }
        : null,
    },
  };
}

function validate(
  current,
  scopeStatus,
  apiSources = dbMigrationInputSources,
  { releaseRef = apiSourceRef, ancestor = true, driftedExecutionSource = null } = {},
) {
  return validateDbMigrationEvidence({
    evidence: current.evidence,
    version,
    apiSourceRef: releaseRef,
    scopeStatus,
    readArtifact: (artifactPath) => current.artifacts[artifactPath] ?? null,
    readApiArtifact: (sourceRef, artifactPath) => {
      if (apiSources[artifactPath] !== undefined) return apiSources[artifactPath];
      if (!migrationExecutionSourceFiles.includes(artifactPath)) return null;
      return sourceRef === releaseRef && artifactPath === driftedExecutionSource
        ? "drifted execution source\n"
        : `${artifactPath}\n`;
    },
    isApiAncestor: () => ancestor,
    requireTrustedApiSource: true,
    listArtifacts: (prefix) =>
      Object.keys(current.artifacts).filter((artifactPath) => artifactPath.startsWith(prefix)),
    context: "db evidence",
  });
}

function resealProdAgainstDev(current, devPlanSource, devExecutionSource) {
  const root = `content/releases/evidence/db-migrations/${version}`;
  current.artifacts[`${root}/dev/plan.json`] = devPlanSource;
  current.artifacts[`${root}/dev/execution.jsonl`] = devExecutionSource;
  current.plan.devPlan.sha256 = sha256Hex(devPlanSource);
  current.plan.devExecution.sha256 = sha256Hex(devExecutionSource);
  current.planSource = canonical(current.plan);
  current.artifacts[current.evidence.plan.path] = current.planSource;
  current.evidence.plan.sha256 = sha256Hex(current.planSource);
  current.execution = dbMigrationExecution("prod", current.plan, "done");
  current.artifacts[current.evidence.execution.path] = current.execution;
  current.evidence.execution.sha256 = sha256Hex(current.execution);
}

test("accepts released, restored, in-progress, and dev current evidence", () => {
  const released = scenario("prod");
  assert.deepEqual(validate(released, "released"), []);
  assert.deepEqual(validate(scenario("prod", { outcome: "restored" }), "rolled_back"), []);
  assert.deepEqual(validate(scenario("prod", { outcome: "done" }), "in_progress"), []);
  assert.deepEqual(validate(scenario("prod", { execution: false }), "in_progress"), []);
  assert.deepEqual(validate(scenario("dev"), "pending"), []);
});

test("accepts release API source B while dev and prod stay bound to ancestor A", () => {
  const current = scenario("prod");
  assert.deepEqual(
    validate(current, "released", dbMigrationInputSources, {
      releaseRef: releaseApiSourceRef,
    }),
    [],
  );
  assert.equal(current.plan.apiSourceRef, apiSourceRef);

  assert.deepEqual(
    validateDbMigrationEvidence({
      evidence: current.evidence,
      version,
      apiSourceRef: releaseApiSourceRef,
      scopeStatus: "released",
      readArtifact: (artifactPath) => current.artifacts[artifactPath] ?? null,
      listArtifacts: (prefix) =>
        Object.keys(current.artifacts).filter((artifactPath) => artifactPath.startsWith(prefix)),
      context: "lightweight db evidence",
    }),
    [],
  );
});

test("rejects non-ancestor release source and migration execution source drift", () => {
  const current = scenario("prod");
  assert.match(
    validate(current, "released", dbMigrationInputSources, {
      releaseRef: releaseApiSourceRef,
      ancestor: false,
    }).join("\n"),
    /plan source must be an ancestor of the release API source/,
  );
  for (const relativePath of migrationExecutionSourceFiles) {
    assert.match(
      validate(current, "released", dbMigrationInputSources, {
        releaseRef: releaseApiSourceRef,
        driftedExecutionSource: relativePath,
      }).join("\n"),
      new RegExp(`execution source changed after dev validation: ${relativePath}`),
    );
  }
});

test("rejects unexpected plan and evidence fields", () => {
  const current = scenario("prod");
  const invalidPlan = { ...current.plan, unexpected: true };
  const source = canonical(invalidPlan);
  current.artifacts[current.evidence.plan.path] = source;
  current.evidence.plan.sha256 = sha256Hex(source);
  assert.match(validate(current, "released").join("\n"), /exact single-current plan shape/);

  const invalid = scenario("prod");
  invalid.evidence.unexpected = true;
  assert.deepEqual(validate(invalid, "released"), [
    "db evidence must contain only plan and execution",
  ]);
});

test("rejects API source drift", () => {
  const current = scenario("prod");
  const errors = validateDbMigrationEvidence({
    evidence: current.evidence,
    version,
    apiSourceRef,
    scopeStatus: "released",
    readArtifact: (artifactPath) => current.artifacts[artifactPath] ?? null,
    readApiArtifact: (_sourceRef, artifactPath) =>
      artifactPath === "db/schema/current.sql"
        ? "UPDATE drift SET value=1;\n"
        : dbMigrationInputSources[artifactPath] ?? null,
    requireTrustedApiSource: true,
    listArtifacts: () => Object.keys(current.artifacts),
    context: "db evidence",
  });
  assert.match(errors.join("\n"), /trusted API checksum mismatch: db\/schema\/current.sql/);
});

test("leaves SQL semantics to the sealed API validator without misreading literals", () => {
  const current = scenario("prod");
  const root = `content/releases/evidence/db-migrations/${version}`;
  const apiSources = {
    ...dbMigrationInputSources,
    "db/schema/current.state.sql":
      "SELECT 1 AS source_ok, 0 AS target_ok, 'UPDATE complete' AS evidence;\n",
    "db/schema/current.fixture.sql": "SELECT 'CREATE TABLE is literal text' AS note;\n",
  };
  const devPlan = JSON.parse(current.artifacts[`${root}/dev/plan.json`]);
  for (const plan of [devPlan, current.plan]) {
    plan.source.currentState.sha256 = sha256Hex(apiSources["db/schema/current.state.sql"]);
    plan.source.currentFixture.sha256 = sha256Hex(apiSources["db/schema/current.fixture.sql"]);
  }
  const devPlanSource = canonical(devPlan);
  const devExecutionSource = dbMigrationExecution("dev", devPlan, "done");
  resealProdAgainstDev(current, devPlanSource, devExecutionSource);

  assert.deepEqual(validate(current, "released", apiSources), []);
});

test("rejects SQL modes whose lexer semantics differ", () => {
  const current = scenario("prod");
  current.plan.runtime.sqlMode = "STRICT_TRANS_TABLES,ANSI_QUOTES";
  const root = `content/releases/evidence/db-migrations/${version}/dev`;
  resealProdAgainstDev(
    current,
    current.artifacts[`${root}/plan.json`],
    current.artifacts[`${root}/execution.jsonl`],
  );
  assert.match(validate(current, "released").join("\n"), /unsupported SQL lexical mode/);
});

test("requires dev and prod evidence to use the same DB runtime", () => {
  const current = scenario("prod");
  const root = `content/releases/evidence/db-migrations/${version}/dev`;
  const devPlan = JSON.parse(current.artifacts[`${root}/plan.json`]);
  devPlan.runtime.sqlMode = "NO_ZERO_DATE";
  const devPlanSource = canonical(devPlan);
  const devExecutionSource = dbMigrationExecution("dev", devPlan, "done");
  resealProdAgainstDev(current, devPlanSource, devExecutionSource);
  assert.match(validate(current, "released").join("\n"), /same DB runtime/);
});

test("binds each plan runtime engine to its observed database identity", () => {
  const current = scenario("prod");
  const plan = JSON.parse(current.artifacts[current.evidence.plan.path]);
  plan.runtime.engine = "8.4.1";
  const source = canonical(plan);
  current.artifacts[current.evidence.plan.path] = source;
  current.evidence.plan.sha256 = sha256Hex(source);
  assert.match(
    validate(current, "released").join("\n"),
    /runtime\.engine must match databaseIdentity\.serverVersion/,
  );
});

test("requires DONE for release and START observation for rollback", () => {
  assert.match(
    validate(scenario("prod", { outcome: "restored" }), "released").join("\n"),
    /requires transition-done/,
  );
  const current = scenario("prod", { outcome: "restored" });
  const events = current.execution.trimEnd().split("\n").map(JSON.parse);
  events.at(-1).data.restoredDatabaseIdentity = { database: "coupler" };
  const source = `${events.map(JSON.stringify).join("\n")}\n`;
  current.artifacts[current.evidence.execution.path] = source;
  current.evidence.execution.sha256 = sha256Hex(source);
  assert.match(validate(current, "rolled_back").join("\n"), /exact database identity fields/);

  const runtimeDrift = scenario("prod", { outcome: "restored" });
  const runtimeEvents = runtimeDrift.execution.trimEnd().split("\n").map(JSON.parse);
  runtimeEvents.at(-1).data.restoredDatabaseIdentity.serverVersion = "8.4.1";
  runtimeEvents.at(-1).data.restoredDatabaseIdentitySha256 = sha256Hex(
    canonical(runtimeEvents.at(-1).data.restoredDatabaseIdentity),
  );
  const runtimeSource = `${runtimeEvents.map(JSON.stringify).join("\n")}\n`;
  runtimeDrift.artifacts[runtimeDrift.evidence.execution.path] = runtimeSource;
  runtimeDrift.evidence.execution.sha256 = sha256Hex(runtimeSource);
  assert.match(validate(runtimeDrift, "rolled_back").join("\n"), /sealed DB engine/);

  const databaseDrift = scenario("prod", { outcome: "restored" });
  const databaseEvents = databaseDrift.execution.trimEnd().split("\n").map(JSON.parse);
  databaseEvents.at(-1).data.restoredDatabaseIdentity.database = "other_schema";
  databaseEvents.at(-1).data.restoredDatabaseIdentitySha256 = sha256Hex(
    canonical(databaseEvents.at(-1).data.restoredDatabaseIdentity),
  );
  const databaseSource = `${databaseEvents.map(JSON.stringify).join("\n")}\n`;
  databaseDrift.artifacts[databaseDrift.evidence.execution.path] = databaseSource;
  databaseDrift.evidence.execution.sha256 = sha256Hex(databaseSource);
  assert.match(
    validate(databaseDrift, "rolled_back").join("\n"),
    /sealed logical database name/,
  );
});

test("rejects extra artifacts", () => {
  const current = scenario("prod");
  current.artifacts[
    `content/releases/evidence/db-migrations/${version}/unexpected.json`
  ] = "{}\n";
  assert.match(validate(current, "released").join("\n"), /unsupported artifact/);
});

test("rejects an unreferenced execution file when metadata still says unexecuted", () => {
  const current = scenario("prod", { execution: false });
  current.artifacts[
    `content/releases/evidence/db-migrations/${version}/prod/execution.jsonl`
  ] = "corrupt\n";
  assert.match(validate(current, "in_progress").join("\n"), /unsupported artifact/);
});

test("rejects unexpected fields inside DB journal events", () => {
  for (const { outcome, scopeStatus, eventIndex, expected } of [
    {
      outcome: "done",
      scopeStatus: "released",
      eventIndex: 0,
      expected: /transition-started data must contain only DB evidence/,
    },
    {
      outcome: "done",
      scopeStatus: "released",
      eventIndex: 1,
      expected: /transition-done data must contain only DB observations/,
    },
    {
      outcome: "restored",
      scopeStatus: "rolled_back",
      eventIndex: 1,
      expected: /transition-restored data must contain only DB observations/,
    },
  ]) {
    const current = scenario("prod", { outcome });
    const events = current.execution.trimEnd().split("\n").map(JSON.parse);
    events[eventIndex].data.unexpected = true;
    const source = `${events.map(JSON.stringify).join("\n")}\n`;
    current.artifacts[current.evidence.execution.path] = source;
    current.evidence.execution.sha256 = sha256Hex(source);
    assert.match(validate(current, scopeStatus).join("\n"), expected);
  }
});

test("binds START, DONE, and RESTORED schema observations to the sealed plan", () => {
  const current = scenario("prod");
  const events = current.execution.trimEnd().split("\n").map(JSON.parse);
  events[1].data.schemaSha256 = current.plan.source.startSchemaSha256;
  const source = `${events.map(JSON.stringify).join("\n")}\n`;
  current.artifacts[current.evidence.execution.path] = source;
  current.evidence.execution.sha256 = sha256Hex(source);
  assert.match(validate(current, "released").join("\n"), /sealed TARGET schema/);
});

test("binds every prod plan to the posted dev bytes, DONE journal, and API source", () => {
  const incomplete = scenario("prod");
  const root = `content/releases/evidence/db-migrations/${version}`;
  const devPlanSource = incomplete.artifacts[`${root}/dev/plan.json`];
  const startedOnly = `${incomplete.artifacts[`${root}/dev/execution.jsonl`].split("\n")[0]}\n`;
  resealProdAgainstDev(incomplete, devPlanSource, startedOnly);
  assert.match(
    validate(incomplete, "released").join("\n"),
    /completed dev evidence requires transition-done/,
  );

  const wrongSource = scenario("prod");
  const devPlan = JSON.parse(wrongSource.artifacts[`${root}/dev/plan.json`]);
  devPlan.apiSourceRef = "c".repeat(40);
  const wrongDevPlanSource = canonical(devPlan);
  const wrongDevExecution = dbMigrationExecution("dev", devPlan, "done");
  resealProdAgainstDev(wrongSource, wrongDevPlanSource, wrongDevExecution);
  assert.match(
    validate(wrongSource, "released").join("\n"),
    /boundDevPlan must use the same API source as the prod plan/,
  );

  const sameDatabase = scenario("prod");
  const sameDbDevPlan = JSON.parse(sameDatabase.artifacts[`${root}/dev/plan.json`]);
  sameDbDevPlan.databaseIdentity = sameDatabase.plan.databaseIdentity;
  sameDbDevPlan.databaseIdentitySha256 = sameDatabase.plan.databaseIdentitySha256;
  const sameDbPlanSource = canonical(sameDbDevPlan);
  resealProdAgainstDev(
    sameDatabase,
    sameDbPlanSource,
    dbMigrationExecution("dev", sameDbDevPlan, "done"),
  );
  assert.match(
    validate(sameDatabase, "released").join("\n"),
    /must use distinct DB identities/,
  );
});
