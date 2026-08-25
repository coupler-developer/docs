import { spawn } from "node:child_process";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptsRoot = path.dirname(fileURLToPath(import.meta.url));
const docsRoot = path.dirname(scriptsRoot);
const node = process.execPath;
const script = (fileName) => path.join(scriptsRoot, fileName);

const task = (...args) =>
  Object.freeze({ command: node, args: Object.freeze(args) });

export const VALIDATION_TASKS = Object.freeze({
  "validate:docs-structure": task(script("validate-docs-structure.mjs")),
  "validate:document-lifecycle": task(
    script("validate-document-lifecycle.mjs"),
  ),
  "validate:agent-workflow": task(script("validate-agent-workflow.mjs")),
  "validate:docs-sensitive": task(
    script("validate-docs-structure.mjs"),
    "--sensitive-only",
  ),
  "validate:logical-data-model": task(
    script("validate-logical-data-model.mjs"),
  ),
  "validate:technical-debt": task(script("validate-technical-debt.mjs")),
  "validate:release-records": task(script("validate-release-records.mjs")),
  "validate:api-error-docs": task(script("validate-api-error-docs.mjs")),
  "test:docs-structure": task(
    "--test",
    script("validate-docs-structure.test.mjs"),
    script("lounge-pinned-contract-docs.test.mjs"),
  ),
  "test:document-lifecycle": task(
    "--test",
    script("validate-document-lifecycle.test.mjs"),
  ),
  "test:agent-workflow": task(
    "--test",
    script("validate-agent-workflow.test.mjs"),
  ),
  "test:logical-data-model": task(
    "--test",
    script("validate-logical-data-model.test.mjs"),
  ),
  "test:technical-debt": task(
    "--test",
    script("validate-technical-debt.test.mjs"),
  ),
  "test:release-preflight": task(
    "--test",
    script("init-release-record.test.mjs"),
    script("release-continue.test.mjs"),
    script("generate-release-notes.test.mjs"),
    script("release-record-metadata.test.mjs"),
    script("validate-docs-release-tag-ready.test.mjs"),
    script("validate-release-records.test.mjs"),
    script("release-status-gate.test.mjs"),
    script("release-validation-mode.test.mjs"),
    script("release-preflight.test.mjs"),
  ),
  "test:docs-validation-config": task(
    "--test",
    script("docs-validation-config.test.mjs"),
  ),
  "test:docs-validation-runner": task(
    "--test",
    script("docs-validation-runner.test.mjs"),
  ),
  "lint:md": task(
    path.join(
      docsRoot,
      "node_modules",
      "markdownlint-cli2",
      "markdownlint-cli2-bin.mjs",
    ),
    "--config",
    ".markdownlint.json",
    "**/*.md",
    "#node_modules",
    "#site",
  ),
  "build:docs": task(script("run-mkdocs-build.mjs")),
});

export const STATIC_TASK_IDS = Object.freeze([
  "test:release-preflight",
  "test:docs-structure",
  "test:agent-workflow",
  "test:document-lifecycle",
  "test:logical-data-model",
  "test:technical-debt",
  "test:docs-validation-runner",
  "test:docs-validation-config",
  "validate:docs-structure",
  "validate:document-lifecycle",
  "validate:agent-workflow",
  "validate:logical-data-model",
  "validate:technical-debt",
  "validate:release-records",
  "validate:api-error-docs",
]);

export const FULL_TASK_IDS = Object.freeze([
  "test:release-preflight",
  "build:docs",
  "lint:md",
  ...STATIC_TASK_IDS.filter((taskId) => taskId !== "test:release-preflight"),
]);

export const DEFAULT_CONCURRENCY = Math.max(
  1,
  Math.min(2, os.availableParallelism?.() ?? os.cpus().length),
);

export async function runTaskQueue(
  taskIds,
  { concurrency = DEFAULT_CONCURRENCY, executeTask = executeValidationTask } = {},
) {
  if (!Number.isInteger(concurrency) || concurrency < 1) {
    throw new Error(`concurrency must be a positive integer: ${concurrency}`);
  }

  const results = new Array(taskIds.length);
  let nextIndex = 0;
  let stopScheduling = false;

  async function worker() {
    while (!stopScheduling) {
      const taskIndex = nextIndex;
      nextIndex += 1;

      if (taskIndex >= taskIds.length) {
        return;
      }

      const taskId = taskIds[taskIndex];
      let result;

      try {
        result = await executeTask(taskId);
      } catch (error) {
        result = {
          taskId,
          code: 1,
          signal: null,
          stdout: "",
          stderr:
            error instanceof Error
              ? error.stack ?? error.message
              : String(error),
          durationMs: 0,
        };
      }

      results[taskIndex] = result;
      if (result.code !== 0) {
        stopScheduling = true;
      }
    }
  }

  const workerCount = Math.min(concurrency, taskIds.length);
  await Promise.all(Array.from({ length: workerCount }, () => worker()));
  return results;
}

export function executeValidationTask(taskId, extraArgs = []) {
  const definition = VALIDATION_TASKS[taskId];
  if (!definition) {
    throw new Error(`unknown docs validation task: ${taskId}`);
  }

  const startedAt = performance.now();

  return new Promise((resolve) => {
    const child = spawn(definition.command, [...definition.args, ...extraArgs], {
      cwd: docsRoot,
      env: process.env,
      stdio: ["ignore", "pipe", "pipe"],
    });
    const stdout = [];
    const stderr = [];
    let spawnError = null;

    child.stdout.on("data", (chunk) => stdout.push(chunk));
    child.stderr.on("data", (chunk) => stderr.push(chunk));
    child.once("error", (error) => {
      spawnError = error;
    });
    child.once("close", (code, signal) => {
      if (spawnError) {
        stderr.push(Buffer.from(`${spawnError.stack ?? spawnError.message}\n`));
      }

      resolve({
        taskId,
        code: spawnError ? 1 : (code ?? 1),
        signal,
        stdout: Buffer.concat(stdout).toString("utf8"),
        stderr: Buffer.concat(stderr).toString("utf8"),
        durationMs: performance.now() - startedAt,
      });
    });
  });
}

function printTaskResult(result) {
  const status = result.code === 0 ? "PASS" : "FAIL";
  const seconds = (result.durationMs / 1000).toFixed(2);
  process.stdout.write(
    `\n[docs-validation] ${status} ${result.taskId} (${seconds}s)\n`,
  );

  if (result.stdout) {
    process.stdout.write(
      result.stdout.endsWith("\n") ? result.stdout : `${result.stdout}\n`,
    );
  }
  if (result.stderr) {
    process.stderr.write(
      result.stderr.endsWith("\n") ? result.stderr : `${result.stderr}\n`,
    );
  }
  if (result.signal) {
    process.stderr.write(
      `[docs-validation] ${result.taskId} terminated by ${result.signal}\n`,
    );
  }
}

async function runMode(mode) {
  const taskIds = mode === "static" ? STATIC_TASK_IDS : FULL_TASK_IDS;
  process.stdout.write(
    `[docs-validation] mode=${mode} tasks=${taskIds.length} concurrency=${DEFAULT_CONCURRENCY}\n`,
  );

  const results = await runTaskQueue(taskIds, {
    executeTask: async (taskId) => {
      process.stdout.write(`[docs-validation] START ${taskId}\n`);
      const result = await executeValidationTask(taskId);
      printTaskResult(result);
      return result;
    },
  });
  const failed = results.find((result) => result?.code !== 0);
  const skipped = taskIds.length - results.filter(Boolean).length;

  if (skipped > 0) {
    process.stderr.write(
      `[docs-validation] skipped=${skipped} after the first failed task\n`,
    );
  }

  return failed ? 1 : 0;
}

async function main(args = process.argv.slice(2)) {
  const [mode, taskId, ...extraArgs] = args;

  if (mode === "static" || mode === "full") {
    if (taskId !== undefined) {
      throw new Error(`${mode} mode does not accept extra arguments`);
    }
    return runMode(mode);
  }

  if (mode === "task") {
    if (!taskId) {
      throw new Error("task mode requires a task ID");
    }
    const result = await executeValidationTask(taskId, extraArgs);
    printTaskResult(result);
    return result.code;
  }

  throw new Error("usage: docs-validation-runner.mjs <static|full|task TASK_ID>");
}

const isEntryPoint =
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isEntryPoint) {
  try {
    process.exitCode = await main();
  } catch (error) {
    process.stderr.write(
      `[docs-validation] ${error instanceof Error ? error.message : String(error)}\n`,
    );
    process.exitCode = 1;
  }
}
