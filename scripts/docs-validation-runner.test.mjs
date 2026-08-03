import assert from "node:assert/strict";
import { test } from "node:test";

import {
  DEFAULT_CONCURRENCY,
  FULL_TASK_IDS,
  STATIC_TASK_IDS,
  runTaskQueue,
} from "./docs-validation-runner.mjs";

const result = (taskId, code = 0) => ({
  taskId,
  code,
  signal: null,
  stdout: "",
  stderr: "",
  durationMs: 0,
});

test("full validation adds lint and build without dropping a static task", () => {
  assert.equal(new Set(STATIC_TASK_IDS).size, STATIC_TASK_IDS.length);
  assert.equal(new Set(FULL_TASK_IDS).size, FULL_TASK_IDS.length);
  assert.deepEqual(
    new Set(FULL_TASK_IDS),
    new Set([...STATIC_TASK_IDS, "lint:md", "build:docs"]),
  );
});

test("the task queue respects its concurrency limit", async () => {
  assert.ok(DEFAULT_CONCURRENCY >= 1 && DEFAULT_CONCURRENCY <= 2);

  let active = 0;
  let maximumActive = 0;

  const results = await runTaskQueue(["a", "b", "c", "d"], {
    concurrency: 2,
    executeTask: async (taskId) => {
      active += 1;
      maximumActive = Math.max(maximumActive, active);
      await new Promise((resolve) => setTimeout(resolve, 20));
      active -= 1;
      return result(taskId);
    },
  });

  assert.equal(maximumActive, 2);
  assert.deepEqual(
    results.map(({ taskId }) => taskId),
    ["a", "b", "c", "d"],
  );
});

test("a failure stops new work while already running tasks finish", async () => {
  const started = [];
  let releaseSlowTask;
  const slowTask = new Promise((resolve) => {
    releaseSlowTask = resolve;
  });

  const queue = runTaskQueue(["fail", "active", "skipped"], {
    concurrency: 2,
    executeTask: async (taskId) => {
      started.push(taskId);
      if (taskId === "fail") {
        return result(taskId, 1);
      }
      if (taskId === "active") {
        await slowTask;
      }
      return result(taskId);
    },
  });

  await new Promise((resolve) => setImmediate(resolve));
  releaseSlowTask();
  const results = await queue;

  assert.deepEqual(started, ["fail", "active"]);
  assert.equal(results[0].code, 1);
  assert.equal(results[1].code, 0);
  assert.equal(results[2], undefined);
});

test("invalid concurrency fails closed", async () => {
  await assert.rejects(
    runTaskQueue(["task"], {
      concurrency: 0,
      executeTask: async (taskId) => result(taskId),
    }),
    /concurrency must be a positive integer/,
  );
});
