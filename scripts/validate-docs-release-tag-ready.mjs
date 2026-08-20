import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

import { parseReleaseMetadataBlock } from "./release-record-metadata.mjs";

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

function main(argv) {
  const args = parseArgs(argv);
  const releasePath = `content/releases/${args.tag}.md`;
  const source = git(["show", `${args.ref}:${releasePath}`]);
  const errors = validateDocsReleaseTagReady(source, args.tag);
  if (errors.length > 0) {
    throw new Error(errors.join("\n"));
  }
  console.log(`docs release tag ready: ${args.tag} @ ${git(["rev-parse", `${args.ref}^{commit}`])}`);
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
