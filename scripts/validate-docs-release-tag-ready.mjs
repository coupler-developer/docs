import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

import { parseReleaseMetadataBlock } from "./release-record-metadata.mjs";

export const docsTagPreparationPaths = new Set([
  ".github/scripts/generate-release-notes.sh",
  "content/flows/cross-project/production-deploy-command-runbook.md",
  "content/policy/release-process.md",
  "content/policy/release-tag-policy.md",
  "scripts/generate-release-notes.test.mjs",
  "scripts/validate-docs-release-tag-ready.mjs",
  "scripts/validate-docs-release-tag-ready.test.mjs",
]);

export function validateDocsReleaseTagReady(source, expectedTag) {
  const errors = [];
  const metadata = parseReleaseMetadataBlock(source, expectedTag, errors);
  if (!metadata) {
    return errors;
  }

  if (metadata.version !== expectedTag) {
    errors.push(`release version must equal tag: ${metadata.version} != ${expectedTag}`);
  }
  if (metadata.status !== "released") {
    errors.push(`docs tag requires released metadata status, got ${metadata.status}`);
  }
  if (metadata.scopeResults?.docs?.status !== "released") {
    errors.push(
      `docs tag requires released docs scope, got ${metadata.scopeResults?.docs?.status}`,
    );
  }
  if (metadata.versionMapping?.docs?.tag !== expectedTag) {
    errors.push(
      `docs tag mapping must equal ${expectedTag}, got ${metadata.versionMapping?.docs?.tag}`,
    );
  }

  return errors;
}

export function validateDocsReleaseTagProvenance({
  releaseRecordCommit,
  candidateCommit,
  changedPaths,
}) {
  if (releaseRecordCommit === candidateCommit) {
    return [];
  }

  if (changedPaths.length === 0) {
    return [
      "docs tag candidate differs from the release record commit without a tag-preparation change",
    ];
  }

  const unexpectedPaths = changedPaths.filter(
    (changedPath) => !docsTagPreparationPaths.has(changedPath),
  );
  return unexpectedPaths.length === 0
    ? []
    : [
      `docs tag preparation changed forbidden paths: ${unexpectedPaths.join(", ")}`,
    ];
}

function main(argv) {
  const args = parseArgs(argv);
  const releasePath = `content/releases/${args.tag}.md`;
  const candidateCommit = git(["rev-parse", `${args.ref}^{commit}`]);
  const source = git(["show", `${candidateCommit}:${releasePath}`]);
  const errors = validateDocsReleaseTagReady(source, args.tag);
  const releaseRecordCommit = findFinalRecordGateCommit({
    candidateCommit,
    releasePath,
    expectedTag: args.tag,
  });
  if (!releaseRecordCommit) {
    errors.push(`terminal Final Record Gate commit not found: ${releasePath}`);
  } else {
    const changedPaths = collectTouchedPaths(
      releaseRecordCommit,
      candidateCommit,
    );
    errors.push(...validateDocsReleaseTagProvenance({
      releaseRecordCommit,
      candidateCommit,
      changedPaths,
    }));
  }
  if (errors.length > 0) {
    throw new Error(errors.join("\n"));
  }
  console.log(
    `docs release tag ready: ${args.tag} @ ${candidateCommit} (record ${releaseRecordCommit})`,
  );
}

function findFinalRecordGateCommit({ candidateCommit, releasePath, expectedTag }) {
  const recordCommits = git([
    "log",
    "--first-parent",
    "--reverse",
    "--format=%H",
    candidateCommit,
    "--",
    releasePath,
  ]).split("\n").filter(Boolean);

  for (const recordCommit of recordCommits) {
    const recordErrors = [];
    const recordSource = git(["show", `${recordCommit}:${releasePath}`]);
    const metadata = parseReleaseMetadataBlock(
      recordSource,
      `${releasePath} at ${recordCommit}`,
      recordErrors,
    );
    if (
      recordErrors.length === 0 &&
      metadata?.version === expectedTag &&
      metadata.status === "released" &&
      metadata.scopeResults?.docs?.status === "released"
    ) {
      return recordCommit;
    }
  }

  return null;
}

function collectTouchedPaths(releaseRecordCommit, candidateCommit) {
  if (releaseRecordCommit === candidateCommit) {
    return [];
  }

  const touchedPaths = new Set();
  const commits = git([
    "rev-list",
    "--reverse",
    `${releaseRecordCommit}..${candidateCommit}`,
  ]).split("\n").filter(Boolean);
  for (const commit of commits) {
    for (const changedPath of git([
      "diff",
      "--name-only",
      `${commit}^1`,
      commit,
    ]).split("\n").filter(Boolean)) {
      touchedPaths.add(changedPath);
    }
  }
  return [...touchedPaths].sort();
}

function parseArgs(argv) {
  const args = { tag: null, ref: null };
  for (let index = 0; index < argv.length; index += 1) {
    const option = argv[index];
    if (option !== "--tag" && option !== "--ref") {
      throw new Error(`unknown option: ${option}`);
    }
    const value = argv[index + 1];
    if (!value || value.startsWith("--")) {
      throw new Error(`${option} requires a value`);
    }
    args[option.slice(2)] = value;
    index += 1;
  }
  if (!/^v\d+\.\d+\.\d+$/.test(args.tag ?? "")) {
    throw new Error("--tag must use vMAJOR.MINOR.PATCH");
  }
  if (!args.ref) {
    throw new Error("--ref is required");
  }
  return args;
}

function git(args) {
  return execFileSync("git", args, {
    cwd: process.cwd(),
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  }).trim();
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  try {
    main(process.argv.slice(2));
  } catch (error) {
    console.error(error.message);
    process.exit(1);
  }
}
