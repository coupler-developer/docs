import { createHash } from "node:crypto";

const sha256Hex = (source) => createHash("sha256").update(source).digest("hex");
const canonicalJson = (value) => `${JSON.stringify(value, null, 2)}\n`;

const baselineLock = {
  database: { characterSet: "utf8mb4", collation: "utf8mb4_general_ci" },
  objects: [{ name: "old_name", type: "table", sql: "CREATE TABLE old_name (id int PRIMARY KEY)" }],
};
const targetLock = {
  database: { characterSet: "utf8mb4", collation: "utf8mb4_general_ci" },
  objects: [{ name: "new_name", type: "table", sql: "CREATE TABLE new_name (id int PRIMARY KEY)" }],
};

export const dbMigrationInputSources = Object.freeze({
  "db/schema/baseline.sql": "CREATE TABLE old_name (id int PRIMARY KEY);\n",
  "db/schema/baseline.lock.json": canonicalJson(baselineLock),
  "db/schema/schema.lock.json": canonicalJson(targetLock),
  "db/schema/current.sql": "RENAME TABLE old_name TO new_name;\n",
  "db/schema/current.state.sql":
    "SELECT 1 AS source_ok, 0 AS target_ok, 'fixture' AS evidence;\n",
  "db/schema/current.fixture.sql": "SELECT 1;\n",
});

export function dbMigrationPlanFor(
  environment,
  {
    apiSourceRef = "a".repeat(40),
    createdAt = "2026-08-04T00:00:00.000Z",
    databaseIdentity = {
      database: "coupler",
      hostname: `${environment}.db.internal`,
      port: 3306,
      serverId: environment === "dev" ? "10" : "20",
      serverVersion: "8.0.42",
    },
    devPlan = null,
    devExecution = null,
  } = {},
) {
  const inputRef = (inputPath) => ({
    path: inputPath,
    sha256: sha256Hex(dbMigrationInputSources[inputPath]),
  });
  return {
    environment,
    createdAt,
    apiSourceRef,
    databaseIdentity,
    databaseIdentitySha256: sha256Hex(canonicalJson(databaseIdentity)),
    runtime: { engine: databaseIdentity.serverVersion, sqlMode: "STRICT_TRANS_TABLES" },
    source: {
      baselineSql: inputRef("db/schema/baseline.sql"),
      baselineLock: inputRef("db/schema/baseline.lock.json"),
      targetLock: inputRef("db/schema/schema.lock.json"),
      currentSql: inputRef("db/schema/current.sql"),
      currentState: inputRef("db/schema/current.state.sql"),
      currentFixture: inputRef("db/schema/current.fixture.sql"),
      startSchemaSha256: sha256Hex(dbMigrationInputSources["db/schema/baseline.lock.json"]),
      targetSchemaSha256: sha256Hex(dbMigrationInputSources["db/schema/schema.lock.json"]),
    },
    devPlan,
    devExecution,
  };
}

export function dbMigrationExecution(environment, plan, outcome = "done") {
  const planSha256 = sha256Hex(canonicalJson(plan));
  const backup = {
    reference: `backup://${environment}/before`,
    sha256: "b".repeat(64),
    sourceDatabaseIdentitySha256: plan.databaseIdentitySha256,
  };
  const events = [
    {
      type: "transition-started",
      data: {
        databaseIdentity: plan.databaseIdentity,
        databaseIdentitySha256: plan.databaseIdentitySha256,
        backup,
        schemaSha256: plan.source.startSchemaSha256,
        evidenceSha256: "2".repeat(64),
      },
    },
    {
      type: "transition-done",
      data: { schemaSha256: plan.source.targetSchemaSha256, evidenceSha256: "4".repeat(64) },
    },
  ];
  if (outcome === "restored") {
    const restoredDatabaseIdentity = { ...plan.databaseIdentity, serverId: "21" };
    events.splice(1, 1, {
        type: "transition-restored",
        data: {
          restoredDatabaseIdentity,
          restoredDatabaseIdentitySha256: sha256Hex(canonicalJson(restoredDatabaseIdentity)),
          schemaSha256: plan.source.startSchemaSha256,
          evidenceSha256: "5".repeat(64),
        },
      });
  }
  return `${events
    .map((event, index) =>
      JSON.stringify({
        sequence: index + 1,
        at: new Date(Date.UTC(2026, 7, 4, 0, 0, index)).toISOString(),
        environment,
        planSha256,
        ...event,
      }),
    )
    .join("\n")}\n`;
}
