import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { initializeReleaseRecord } from "./init-release-record.mjs";

const scriptsRoot = path.dirname(fileURLToPath(import.meta.url));
const docsRoot = path.dirname(scriptsRoot);
const releaseRecordSmokeVersion = "v987654321.0.0";

const candidateExecutables = [
  process.env.DOCS_PYTHON,
  process.env.MKDOCS_PYTHON,
  "python3",
  "python",
  "/Library/Frameworks/Python.framework/Versions/3.11/bin/python3",
  "/opt/homebrew/bin/python3",
  "/usr/local/bin/python3",
].filter(Boolean);

const seen = new Set();
const candidates = candidateExecutables.filter((candidate) => {
  if (seen.has(candidate)) {
    return false;
  }
  seen.add(candidate);
  return true;
});

const attempts = [];
let selectedPython = null;

for (const candidate of candidates) {
  const result = spawnSync(candidate, ["-c", "import mkdocs"], {
    encoding: "utf8",
  });

  if (result.status === 0) {
    selectedPython = candidate;
    break;
  }

  attempts.push({
    candidate,
    status: result.status,
    error: result.error?.message,
    stderr: result.stderr?.trim(),
  });
}

if (!selectedPython) {
  console.error("mkdocs가 설치된 Python 실행 파일을 찾지 못했습니다.");
  console.error("DOCS_PYTHON 또는 MKDOCS_PYTHON으로 Python 경로를 지정할 수 있습니다.");
  for (const attempt of attempts) {
    const details = [
      `candidate=${attempt.candidate}`,
      `status=${attempt.status ?? "unavailable"}`,
      attempt.error ? `error=${attempt.error}` : "",
      attempt.stderr ? `stderr=${attempt.stderr}` : "",
    ].filter(Boolean);
    console.error(`- ${details.join(", ")}`);
  }
  process.exit(1);
}

const sourceBuild = runMkdocsBuild({ cwd: docsRoot });
if (sourceBuild.status !== 0) {
  process.exit(sourceBuild.status ?? 1);
}

const smokeDocsRoot = fs.mkdtempSync(
  path.join(os.tmpdir(), "docs-release-record-build-"),
);

try {
  copyReleaseRecordBuildSurface(smokeDocsRoot);
  initializeReleaseRecord({
    docsRoot: smokeDocsRoot,
    version: releaseRecordSmokeVersion,
  });
  console.log(
    `[docs-build] generated release record smoke: ${releaseRecordSmokeVersion}`,
  );
  const smokeBuild = runMkdocsBuild({
    cwd: smokeDocsRoot,
    siteDir: path.join(smokeDocsRoot, "site"),
  });
  process.exitCode = smokeBuild.status ?? 1;
} catch (error) {
  console.error("[docs-build] generated release record smoke failed");
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
} finally {
  fs.rmSync(smokeDocsRoot, { recursive: true, force: true });
}

function copyReleaseRecordBuildSurface(targetRoot) {
  fs.cpSync(path.join(docsRoot, "content"), path.join(targetRoot, "content"), {
    recursive: true,
  });
  for (const relativePath of [
    "document-lifecycle-registry.json",
    "document-retirement-ledger.json",
    "mkdocs.yml",
  ]) {
    fs.copyFileSync(
      path.join(docsRoot, relativePath),
      path.join(targetRoot, relativePath),
    );
  }
}

function runMkdocsBuild({ cwd, siteDir }) {
  const args = ["-m", "mkdocs", "build", "--strict"];
  if (siteDir) {
    args.push("--site-dir", siteDir);
  }
  return spawnSync(selectedPython, args, { cwd, stdio: "inherit" });
}
