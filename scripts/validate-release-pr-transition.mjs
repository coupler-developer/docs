import { execFileSync } from "node:child_process";
import {
  parseReleaseMetadataBlock,
} from "./release-record-metadata.mjs";
import {
  validatePendingToReleasedTransition,
} from "./release-transition.mjs";

const errors = [];
let args = {};

try {
  args = parseArgs(process.argv.slice(2));
} catch (error) {
  errors.push(error.message);
}

if (errors.length === 0) {
  validateChangedReleaseRecords(args.baseRef, args.headRef, errors);
}

if (errors.length > 0) {
  console.error("Release PR transition validation failed:");
  for (const error of errors) {
    console.error(`- ${error}`);
  }
  process.exit(1);
}

console.log("Release PR transition validation passed");

function parseArgs(argv) {
  const result = {
    baseRef: null,
    headRef: "HEAD",
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];

    if (arg === "--base-ref") {
      result.baseRef = requireValue(argv, index, arg);
      index += 1;
      continue;
    }

    if (arg.startsWith("--base-ref=")) {
      result.baseRef = arg.slice("--base-ref=".length);
      continue;
    }

    if (arg === "--head-ref") {
      result.headRef = requireValue(argv, index, arg);
      index += 1;
      continue;
    }

    if (arg.startsWith("--head-ref=")) {
      result.headRef = arg.slice("--head-ref=".length);
      continue;
    }

    throw new Error(`Unknown argument: ${arg}`);
  }

  if (!result.baseRef) {
    throw new Error("--base-ref is required");
  }

  return result;
}

function requireValue(argv, index, option) {
  const value = argv[index + 1];
  if (!value || value.startsWith("--")) {
    throw new Error(`${option} requires a value`);
  }

  return value;
}

function validateChangedReleaseRecords(baseRef, headRef, validationErrors) {
  ensureCommitExists(baseRef, "--base-ref", validationErrors);
  ensureCommitExists(headRef, "--head-ref", validationErrors);
  if (validationErrors.length > 0) {
    return;
  }

  const changedPaths = git([
    "diff",
    "--name-only",
    `${baseRef}...${headRef}`,
    "--",
    "content/releases/v*.md",
  ]).split("\n").filter(Boolean);

  for (const releasePath of changedPaths) {
    validateReleaseRecordHistory(baseRef, headRef, releasePath, validationErrors);
  }
}

function validateReleaseRecordHistory(baseRef, headRef, releasePath, validationErrors) {
  const currentMetadata = readMetadataAtRef(headRef, releasePath, validationErrors);
  if (!currentMetadata || currentMetadata.status !== "released") {
    return;
  }

  const commits = git([
    "rev-list",
    "--reverse",
    `${baseRef}..${headRef}`,
    "--",
    releasePath,
  ]).split("\n").filter(Boolean);

  const pendingSnapshot = commits
    .map((commit) => readMetadataAtRef(commit, releasePath, validationErrors, true))
    .filter((metadata) => metadata?.status === "pending")
    .at(-1);

  if (pendingSnapshot) {
    validationErrors.push(
      ...validatePendingToReleasedTransition(
        pendingSnapshot,
        currentMetadata,
        currentMetadata.version ?? releasePath,
      ),
    );
    return;
  }

  if (!gitObjectExists(`${baseRef}:${releasePath}`)) {
    validationErrors.push(
      `${releasePath}: a new released record must contain a pending commit in the same PR history`,
    );
  }
}

function readMetadataAtRef(ref, releasePath, validationErrors, ignoreMissing = false) {
  let source;
  try {
    source = git(["show", `${ref}:${releasePath}`]);
  } catch {
    if (!ignoreMissing) {
      validationErrors.push(`${releasePath}: cannot read release record at ${ref}`);
    }
    return null;
  }

  const parseErrors = [];
  const context = `${releasePath}@${ref.slice(0, 12)}`;
  const metadata = parseReleaseMetadataBlock(source, context, parseErrors);
  validationErrors.push(...parseErrors);
  return metadata;
}

function ensureCommitExists(ref, option, validationErrors) {
  if (!gitObjectExists(`${ref}^{commit}`)) {
    validationErrors.push(`${option} is not a commit: ${ref}`);
  }
}

function gitObjectExists(object) {
  try {
    git(["cat-file", "-e", object]);
    return true;
  } catch {
    return false;
  }
}

function git(args) {
  return execFileSync("git", args, {
    cwd: process.cwd(),
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  }).trim();
}
