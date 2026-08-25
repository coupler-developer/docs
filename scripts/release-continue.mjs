import { execFileSync, spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import { initializeReleaseRecord } from "./init-release-record.mjs";
import {
  parseReleaseMetadataBlock,
  validateReleaseMetadata,
} from "./release-record-metadata.mjs";
import {
  activeReleaseStatuses,
  semverTagPattern,
  terminalReleaseStatuses,
} from "./release-schema.mjs";

const scriptsRoot = path.dirname(fileURLToPath(import.meta.url));
const defaultDocsRoot = path.dirname(scriptsRoot);
const preflightScript = path.join(scriptsRoot, "release-preflight.mjs");

export function continueRelease({
  docsRoot = defaultDocsRoot,
  version,
  inspectPullRequest = inspectCurrentPullRequest,
  runPreflight = runReleasePreflight,
} = {}) {
  validateVersion(version);

  const releasePath = path.join(
    docsRoot,
    "content",
    "releases",
    `${version}.md`,
  );
  if (!fs.existsSync(releasePath)) {
    const changedPaths = initializeReleaseRecord({ docsRoot, version });
    return {
      phase: "planned",
      status: "planned",
      created: true,
      changedPaths,
      pendingScopes: ["docs"],
    };
  }

  const metadata = readReleaseMetadata(releasePath, version);
  const pendingScopes = resolvePendingScopes(metadata);
  const phase = resolveReleasePhase(metadata.status);
  if (phase === "planned") {
    return {
      phase: "planned",
      status: metadata.status,
      created: false,
      changedPaths: [],
      pendingScopes,
    };
  }

  if (phase === "execute") {
    const head = git(docsRoot, ["rev-parse", "HEAD"]);
    const pullRequest = inspectPullRequest(docsRoot);
    const admissionErrors = validatePullRequestAdmission(pullRequest, head);
    if (admissionErrors.length > 0) {
      throw new Error(admissionErrors.join("\n"));
    }
    runPreflight({ docsRoot, version });
    const verifiedHead = git(docsRoot, ["rev-parse", "HEAD"]);
    const stillClean = git(docsRoot, ["status", "--porcelain"]).length === 0;
    if (verifiedHead !== head || !stillClean) {
      throw new Error("preflight 중 docs 후보가 바뀌었습니다");
    }
    return {
      phase: "execute",
      status: metadata.status,
      created: false,
      changedPaths: [],
      head,
      pullRequestUrl: pullRequest.url,
      pendingScopes,
    };
  }

  if (phase === "finalize") {
    const head = git(docsRoot, ["rev-parse", "HEAD"]);
    const clean = git(docsRoot, ["status", "--porcelain"]).length === 0;
    if (!clean) {
      return {
        phase: "finalize",
        status: metadata.status,
        created: false,
        changedPaths: [],
        head,
        pendingScopes: [],
        readyForMerge: false,
      };
    }

    const pullRequest = inspectPullRequest(docsRoot);
    const admissionErrors = validatePullRequestAdmission(pullRequest, head);
    if (admissionErrors.length > 0) {
      throw new Error(admissionErrors.join("\n"));
    }
    const verifiedHead = git(docsRoot, ["rev-parse", "HEAD"]);
    const stillClean = git(docsRoot, ["status", "--porcelain"]).length === 0;
    if (verifiedHead !== head || !stillClean) {
      throw new Error("PR 확인 중 docs 최종 후보가 바뀌었습니다");
    }
    return {
      phase: "finalize",
      status: metadata.status,
      created: false,
      changedPaths: [],
      head,
      pullRequestUrl: pullRequest.url,
      pendingScopes: [],
      readyForMerge: true,
    };
  }

  throw new Error(`지원하지 않는 릴리스 상태입니다: ${metadata.status}`);
}

export function validatePullRequestAdmission(pullRequest, expectedHead) {
  const errors = [];
  if (!pullRequest || typeof pullRequest !== "object") {
    return ["현재 브랜치의 Draft PR을 확인할 수 없습니다"];
  }
  if (pullRequest.headRefOid !== expectedHead) {
    errors.push(
      `현재 PR head가 로컬 HEAD와 다릅니다: ${pullRequest.headRefOid ?? "N/A"} != ${expectedHead}`,
    );
  }
  if (pullRequest.isDraft !== true) {
    errors.push("nonterminal 릴리스 PR은 Draft여야 합니다");
  }

  const checks = Array.isArray(pullRequest.requiredChecks)
    ? pullRequest.requiredChecks
    : [];
  if (checks.length === 0) {
    errors.push("현재 PR head에 필수 CI 결과가 없습니다");
    return errors;
  }
  for (const check of checks) {
    const name = check.name ?? "unnamed check";
    if (check.bucket !== "pass") {
      errors.push(`${name}: 필수 CI 상태가 ${check.bucket ?? check.state ?? "N/A"}입니다`);
    }
  }
  return errors;
}

function validateVersion(version) {
  if (typeof version !== "string" || !semverTagPattern.test(version)) {
    throw new Error("버전은 vMAJOR.MINOR.PATCH 형식이어야 합니다: v2.5.3");
  }
}

function readReleaseMetadata(releasePath, version) {
  const source = fs.readFileSync(releasePath, "utf8");
  const errors = [];
  const metadata = parseReleaseMetadataBlock(source, releasePath, errors);
  if (metadata) {
    validateReleaseMetadata(metadata, releasePath, version, errors);
  }
  if (errors.length > 0) {
    throw new Error(errors.join("\n"));
  }
  if (metadata.version !== version) {
    throw new Error(
      `릴리스 기록 버전이 요청과 다릅니다: ${metadata.version ?? "N/A"} != ${version}`,
    );
  }
  return metadata;
}

export function resolvePendingScopes(metadata) {
  if (!Array.isArray(metadata.releaseScopes)) {
    return [];
  }
  return metadata.releaseScopes.filter((scopeName) => {
    const status = metadata.scopeResults?.[scopeName]?.status;
    return activeReleaseStatuses.has(status);
  });
}

export function resolveReleasePhase(status) {
  if (status === "planned") {
    return "planned";
  }
  if (status === "pending" || status === "in_progress") {
    return "execute";
  }
  if (terminalReleaseStatuses.has(status)) {
    return "finalize";
  }
  throw new Error(`지원하지 않는 릴리스 상태입니다: ${status}`);
}

function inspectCurrentPullRequest(docsRoot) {
  const source = execFileSync(
    "gh",
    [
      "pr",
      "view",
      "--json",
      "headRefOid,isDraft,url",
    ],
    {
      cwd: docsRoot,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    },
  );
  const checks = spawnSync(
    "gh",
    ["pr", "checks", "--required", "--json", "name,bucket,state"],
    {
      cwd: docsRoot,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    },
  );
  if (checks.error) {
    throw checks.error;
  }
  if (!checks.stdout.trim()) {
    throw new Error(checks.stderr.trim() || "필수 PR CI를 확인할 수 없습니다");
  }
  return {
    ...JSON.parse(source),
    requiredChecks: JSON.parse(checks.stdout),
  };
}

function runReleasePreflight({ docsRoot, version }) {
  const result = spawnSync(
    process.execPath,
    [preflightScript, version],
    { cwd: docsRoot, encoding: "utf8", stdio: "inherit" },
  );
  if (result.error) {
    throw result.error;
  }
  if (result.status !== 0) {
    throw new Error(`release preflight가 실패했습니다: exit ${result.status ?? "unknown"}`);
  }
}

function git(repoRoot, args) {
  return execFileSync("git", args, {
    cwd: repoRoot,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  }).trim();
}

function printResult(version, result) {
  console.log(`Release ${version}: ${result.status}`);
  if (result.created) {
    console.log("릴리스 기록을 planned 로컬 초안으로 초기화했습니다.");
    for (const changedPath of result.changedPaths) {
      console.log(`- ${changedPath}`);
    }
  }
  if (result.phase === "planned") {
    console.log(
      "다음: scope·기준 SHA·검증·rollback을 채워 pending으로 바꾸고, 독립 리뷰 뒤 yarn verify를 한 번 실행하세요.",
    );
    console.log("검증한 첫 후보만 한 번 커밋해 Draft PR에 push하며 planned 상태는 원격에 push하지 않습니다.");
    return;
  }
  if (result.phase === "execute") {
    console.log(`PR: ${result.pullRequestUrl}`);
    console.log(`docs head: ${result.head}`);
    console.log(`남은 scope: ${result.pendingScopes.join(", ") || "없음"}`);
    console.log(
      "다음: 남은 scope의 런북을 실행하고 동기 작업 결과는 다음 handoff에서 한 번에 기록하세요.",
    );
    return;
  }
  if (!result.readyForMerge) {
    console.log(
      "다음: 마지막 변경 후보를 독립 리뷰하고 yarn verify를 한 번 실행한 뒤 한 번 커밋·push하고 같은 명령을 재실행하세요.",
    );
    return;
  }
  console.log(`PR: ${result.pullRequestUrl}`);
  console.log(`docs head: ${result.head}`);
  console.log(
    "현재 PR head의 필수 CI가 통과했습니다. Ready/merge 뒤 Docs 릴리스 마감 런북을 실행하세요.",
  );
}

function printUsage() {
  console.log("Usage: yarn release:continue vMAJOR.MINOR.PATCH");
}

const isMainModule =
  process.argv[1] &&
  import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href;

if (isMainModule) {
  const args = process.argv.slice(2);
  if (args.length === 1 && ["--help", "-h"].includes(args[0])) {
    printUsage();
  } else if (args.length !== 1) {
    printUsage();
    process.exitCode = 1;
  } else {
    try {
      printResult(args[0], continueRelease({ version: args[0] }));
    } catch (error) {
      console.error(error instanceof Error ? error.message : String(error));
      process.exitCode = 1;
    }
  }
}
