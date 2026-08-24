import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { initializeReleaseRecord } from "./init-release-record.mjs";
import {
  parseReleaseMetadataBlock,
} from "./release-record-metadata.mjs";
import { activeReleaseStatuses } from "./release-schema.mjs";

const releaseRecordPattern = /^content\/releases\/v\d+\.\d+\.\d+\.md$/;
const initializerCompanionPaths = [
  "document-lifecycle-registry.json",
  "content/AGENTS.md",
  "mkdocs.yml",
];
const initializerInputPaths = [
  "content/templates/release-record-template.md",
  "document-lifecycle-registry.json",
  "document-retirement-ledger.json",
  "content/AGENTS.md",
  "mkdocs.yml",
];

let args;
try {
  args = parseArgs(process.argv.slice(2));
  console.log(resolveValidationMode(args.baseRef, args.headRef, args.prDraft));
} catch (error) {
  console.error(error.message);
  process.exit(1);
}

function parseArgs(argv) {
  const result = {
    baseRef: null,
    headRef: "HEAD",
    prDraft: null,
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

    if (arg === "--pr-draft") {
      result.prDraft = parseBoolean(requireValue(argv, index, arg), arg);
      index += 1;
      continue;
    }

    if (arg.startsWith("--pr-draft=")) {
      result.prDraft = parseBoolean(arg.slice("--pr-draft=".length), "--pr-draft");
      continue;
    }

    throw new Error(`Unknown argument: ${arg}`);
  }

  if (!result.baseRef) {
    throw new Error("--base-ref is required");
  }

  return result;
}

function parseBoolean(value, option) {
  if (value === "true") {
    return true;
  }
  if (value === "false") {
    return false;
  }
  throw new Error(`${option} must be true or false`);
}

function requireValue(argv, index, option) {
  const value = argv[index + 1];
  if (!value || value.startsWith("--")) {
    throw new Error(`${option} requires a value`);
  }

  return value;
}

function resolveValidationMode(baseRef, headRef, prDraft) {
  const changedPaths = git([
    "diff",
    "--name-only",
    `${baseRef}...${headRef}`,
  ]).split("\n").filter(Boolean);

  validateActiveReleasePrState(changedPaths, headRef, prDraft);

  const releasePaths = changedPaths.filter((changedPath) =>
    releaseRecordPattern.test(changedPath),
  );
  if (changedPaths.length === 0 || releasePaths.length !== 1) {
    return "full";
  }

  const [releasePath] = releasePaths;
  if (gitObjectExists(`${baseRef}:${releasePath}`)) {
    return "full";
  }
  const expectedPaths = new Set([releasePath, ...initializerCompanionPaths]);
  if (
    changedPaths.length !== expectedPaths.size ||
    changedPaths.some((changedPath) => !expectedPaths.has(changedPath)) ||
    !initializerCompanionsMatch({ baseRef, headRef, releasePath })
  ) {
    return "full";
  }

  let source;
  try {
    source = git(["show", `${headRef}:${releasePath}`]);
  } catch {
    return "full";
  }

  const errors = [];
  const metadata = parseReleaseMetadataBlock(source, releasePath, errors);
  if (errors.length > 0) {
    throw new Error(errors.join("\n"));
  }

  if (!activeReleaseStatuses.has(metadata?.status)) {
    return "full";
  }

  return "lightweight";
}

function initializerCompanionsMatch({ baseRef, headRef, releasePath }) {
  const temporaryRoot = fs.mkdtempSync(
    path.join(os.tmpdir(), "release-validation-mode-expected-"),
  );
  try {
    for (const relativePath of initializerInputPaths) {
      const source = git(["show", `${baseRef}:${relativePath}`]);
      const targetPath = path.join(temporaryRoot, relativePath);
      fs.mkdirSync(path.dirname(targetPath), { recursive: true });
      fs.writeFileSync(targetPath, source.endsWith("\n") ? source : `${source}\n`);
    }
    const version = path.basename(releasePath, ".md");
    initializeReleaseRecord({ docsRoot: temporaryRoot, version });

    return initializerCompanionPaths.every((relativePath) => {
      let actualSource;
      try {
        actualSource = git(["show", `${headRef}:${relativePath}`]);
      } catch {
        return false;
      }
      const expectedSource = fs
        .readFileSync(path.join(temporaryRoot, relativePath), "utf8")
        .trimEnd();
      return actualSource === expectedSource;
    });
  } catch {
    return false;
  } finally {
    fs.rmSync(temporaryRoot, { recursive: true, force: true });
  }
}

function validateActiveReleasePrState(changedPaths, headRef, prDraft) {
  if (prDraft === null) {
    return;
  }

  for (const releasePath of changedPaths.filter((changedPath) =>
    releaseRecordPattern.test(changedPath),
  )) {
    if (!gitObjectExists(`${headRef}:${releasePath}`)) {
      continue;
    }
    const source = git(["show", `${headRef}:${releasePath}`]);
    const errors = [];
    const metadata = parseReleaseMetadataBlock(source, releasePath, errors);
    if (errors.length > 0) {
      throw new Error(errors.join("\n"));
    }
    if (activeReleaseStatuses.has(metadata?.status) && !prDraft) {
      throw new Error(
        `${releasePath}: ${metadata.status} release records must remain in a draft PR until terminal finalization`,
      );
    }
  }
}

function git(args) {
  return execFileSync("git", args, {
    cwd: process.cwd(),
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  }).trim();
}

function gitObjectExists(objectName) {
  try {
    git(["cat-file", "-e", objectName]);
    return true;
  } catch {
    return false;
  }
}
