import { execFileSync } from "node:child_process";
import {
  parseReleaseMetadataBlock,
} from "./release-record-metadata.mjs";
import { activeReleaseStatuses } from "./release-schema.mjs";

const releaseRecordPattern = /^content\/releases\/v\d+\.\d+\.\d+\.md$/;

let args;
try {
  args = parseArgs(process.argv.slice(2));
  console.log(resolveValidationMode(args.baseRef, args.headRef));
} catch (error) {
  console.error(error.message);
  process.exit(1);
}

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

function resolveValidationMode(baseRef, headRef) {
  const changedPaths = git([
    "diff",
    "--name-only",
    `${baseRef}...${headRef}`,
  ]).split("\n").filter(Boolean);

  if (
    changedPaths.length === 0 ||
    changedPaths.some((changedPath) => !releaseRecordPattern.test(changedPath))
  ) {
    return "full";
  }

  for (const releasePath of changedPaths) {
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
  }

  return "lightweight";
}

function git(args) {
  return execFileSync("git", args, {
    cwd: process.cwd(),
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  }).trim();
}
