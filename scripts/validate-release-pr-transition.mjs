import { execFileSync } from "node:child_process";
import {
  parseReleaseMetadataBlock,
} from "./release-record-metadata.mjs";
import {
  validateFrozenReleaseTarget,
} from "./release-transition.mjs";
import {
  activeReleaseStatuses,
  releaseMetadataSchema,
  terminalReleaseStatuses,
} from "./release-schema.mjs";
import {
  dbMigrationGateActivationPath,
  jcsCanonicalize,
  sha256Hex,
  validateDbMigrationGateActivation,
  validateDbMigrationTrustEpochV2,
  validateDbMigrationTrustProposalV2,
} from "./db-migration-release-contract-v2.mjs";

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

  const activation = validateDbMigrationActivationTransition(
    baseRef,
    headRef,
    validationErrors,
  );
  const trustTransition = validateDbMigrationTrustTransition(
    baseRef,
    headRef,
    validationErrors,
  );
  if (activation.introduced && trustTransition.changed) {
    validationErrors.push(
      "DB migration activation and trust proposal/epoch changes must use separate PRs",
    );
  }

  const changedPaths = [...new Set(git([
    "log",
    "--format=",
    "--name-only",
    "--full-history",
    `${baseRef}..${headRef}`,
    "--",
    "content/releases/v*.md",
  ]).split("\n").filter(Boolean))];

  for (const releasePath of changedPaths) {
    validateReleaseRecordHistory(
      baseRef,
      headRef,
      releasePath,
      activation,
      trustTransition,
      validationErrors,
    );
  }
}

function validateDbMigrationTrustTransition(baseRef, headRef, validationErrors) {
  const changeLines = git([
    "diff",
    "--name-status",
    baseRef,
    headRef,
    "--",
    "content/policy/db-migration-trust-proposals",
    "content/policy/db-migration-trust-epochs",
  ])
    .split("\n")
    .filter(Boolean);
  const addedEpochs = [];
  for (const line of changeLines) {
    const [status, ...paths] = line.split("\t");
    const changedPath = paths.at(-1);
    if (!changedPath) {
      continue;
    }
    if (status !== "A") {
      validationErrors.push(
        `${changedPath}: DB migration trust proposals and epochs are append-only`,
      );
      continue;
    }
    const changedMode = readGitMode(headRef, changedPath);
    if (changedMode !== "100644") {
      validationErrors.push(
        `${changedPath}: DB migration trust files must be regular 100644 files (got ${changedMode ?? "missing"})`,
      );
      continue;
    }
    const source = readGitFileRaw(headRef, changedPath);
    let value;
    try {
      value = JSON.parse(source);
    } catch (error) {
      validationErrors.push(`${changedPath}: invalid JSON: ${error.message}`);
      continue;
    }
    if (changedPath.includes("/db-migration-trust-proposals/")) {
      const proposalErrors = validateDbMigrationTrustProposalV2(value, changedPath);
      validationErrors.push(...proposalErrors);
      if (proposalErrors.length > 0) {
        continue;
      }
      const expectedName = `${String(value.epoch).padStart(4, "0")}-${value.keyId}.json`;
      if (!changedPath.endsWith(`/${expectedName}`)) {
        validationErrors.push(`${changedPath}: trust proposal filename must be ${expectedName}`);
      }
      continue;
    }
    const epochErrors = validateDbMigrationTrustEpochV2(value, changedPath);
    validationErrors.push(...epochErrors);
    if (epochErrors.length > 0) {
      continue;
    }
    addedEpochs.push({ path: changedPath, value });
  }
  if (addedEpochs.length > 1) {
    validationErrors.push("DB migration trust activation must add exactly one epoch per PR");
  }
  if (addedEpochs.length === 0) {
    return { changed: changeLines.length > 0, epochAdded: false };
  }
  const baseCommit = git(["rev-parse", `${baseRef}^{commit}`]);
  const firstParentCommits = new Set(
    git(["rev-list", "--first-parent", baseCommit]).split("\n").filter(Boolean),
  );
  const existingEpochPaths = git([
    "ls-tree",
    "-r",
    "--name-only",
    baseRef,
    "--",
    "content/policy/db-migration-trust-epochs",
  ])
    .split("\n")
    .filter((value) => value.endsWith(".json"));
  const expectedEpoch = existingEpochPaths.length + 1;
  const { path: epochPath, value: epoch } = addedEpochs[0];
  if (epoch.epoch !== expectedEpoch) {
    validationErrors.push(
      `${epochPath}.epoch must be the next append-only epoch: ${expectedEpoch}`,
    );
  }
  const expectedName = `${String(epoch.epoch).padStart(4, "0")}-${epoch.keys?.[0]?.keyId}.json`;
  if (!epochPath.endsWith(`/${expectedName}`)) {
    validationErrors.push(`${epochPath}: trust epoch filename must be ${expectedName}`);
  }
  if (epoch.activationBaseRef !== baseCommit) {
    validationErrors.push(
      `${epochPath}.activationBaseRef must equal the PR base commit ${baseCommit}`,
    );
  }
  if (!firstParentCommits.has(epoch.proposal?.sourceRef)) {
    validationErrors.push(
      `${epochPath}.proposal.sourceRef must be on the base first-parent history`,
    );
    return { changed: true, epochAdded: true };
  }
  const proposalSource = readGitFileRaw(epoch.proposal.sourceRef, epoch.proposal.path);
  if (proposalSource === null) {
    validationErrors.push(
      `${epochPath}: trust proposal is missing at ${epoch.proposal.sourceRef}:${epoch.proposal.path}`,
    );
    return { changed: true, epochAdded: true };
  }
  const proposalMode = readGitMode(epoch.proposal.sourceRef, epoch.proposal.path);
  if (proposalMode !== "100644") {
    validationErrors.push(
      `${epochPath}: trust proposal must be a regular 100644 file (got ${proposalMode ?? "missing"})`,
    );
    return { changed: true, epochAdded: true };
  }
  if (sha256Hex(proposalSource) !== epoch.proposal.sha256) {
    validationErrors.push(`${epochPath}: trust proposal checksum mismatch`);
  }
  let proposal;
  try {
    proposal = JSON.parse(proposalSource);
  } catch (error) {
    validationErrors.push(`${epochPath}: trust proposal JSON is invalid: ${error.message}`);
    return { changed: true, epochAdded: true };
  }
  const proposalErrors = validateDbMigrationTrustProposalV2(
    proposal,
    `${epochPath}.proposal`,
  );
  validationErrors.push(...proposalErrors);
  if (proposalErrors.length > 0) {
    return { changed: true, epochAdded: true };
  }
  const epochKey = epoch.keys?.[0];
  const proposalKey = proposal
    ? {
        keyId: proposal.keyId,
        algorithm: proposal.algorithm,
        environments: proposal.environments,
        publicKeyPem: proposal.publicKeyPem,
      }
    : null;
  if (
    epoch.epoch !== proposal?.epoch ||
    jcsCanonicalize(epochKey) !== jcsCanonicalize(proposalKey)
  ) {
    validationErrors.push(
      `${epochPath}: activated epoch must exactly match its base-owned proposal`,
    );
  }
  return { changed: true, epochAdded: true };
}

function validateReleaseRecordHistory(
  baseRef,
  headRef,
  releasePath,
  activation,
  trustTransition,
  validationErrors,
) {
  if (!gitObjectExists(`${headRef}:${releasePath}`)) {
    if (gitObjectExists(`${baseRef}:${releasePath}`)) {
      validationErrors.push(`${releasePath}: release records cannot be deleted`);
    }
    return;
  }
  const currentMetadata = readMetadataAtRef(headRef, releasePath, validationErrors);
  if (!currentMetadata) {
    return;
  }

  const baseMetadata = readMetadataAtRef(
    baseRef,
    releasePath,
    validationErrors,
    true,
  );

  if (
    currentMetadata.schema !== releaseMetadataSchema &&
    (!baseMetadata || activeReleaseStatuses.has(baseMetadata.status))
  ) {
    validationErrors.push(
      `${releasePath}: new or active release records must use ${releaseMetadataSchema}`,
    );
  }

  const currentDbMigrationScope = currentMetadata.scopeResults?.["db-migration"];
  const baseDbMigrationScope = baseMetadata?.scopeResults?.["db-migration"];
  if (
    trustTransition.epochAdded &&
    (terminalReleaseStatuses.has(currentDbMigrationScope?.status) ||
      terminalReleaseStatuses.has(baseDbMigrationScope?.status)) &&
    jcsCanonicalize(currentDbMigrationScope ?? null) !==
      jcsCanonicalize(baseDbMigrationScope ?? null)
  ) {
    validationErrors.push(
      `${releasePath}: terminal DB migration evidence requires its trust epoch to exist on the base ref`,
    );
  }

  if (
    currentMetadata.schema === releaseMetadataSchema &&
    currentMetadata.releaseScopes?.includes("db-migration") &&
    !activation.baseTrusted
  ) {
    validationErrors.push(
      `${releasePath}: DB migration v2 records require the activation marker on the base ref`,
    );
  }

  const commits = git([
    "rev-list",
    "--full-history",
    "--reverse",
    `${baseRef}..${headRef}`,
    "--",
    releasePath,
  ]).split("\n").filter(Boolean);

  const releaseMetadataHistory = commits
    .map((commit) => readMetadataAtRef(commit, releasePath, validationErrors, true))
    .filter(Boolean);

  const lifecycleSnapshots = git([
    "rev-list",
    "--full-history",
    "--reverse",
    headRef,
    "--",
    releasePath,
  ]).split("\n").filter(Boolean).map((commit) => ({
    commit,
    metadata: readMetadataAtRef(commit, releasePath, validationErrors, true),
  })).filter(({ metadata }) => metadata !== null);
  const firstPendingIndex = lifecycleSnapshots.findIndex(
    ({ metadata }) => metadata.status === "pending",
  );
  const firstDbPendingIndex = lifecycleSnapshots.findIndex(
    ({ metadata }) =>
      metadata.schema === releaseMetadataSchema &&
      metadata.status === "pending" &&
      metadata.scopeResults?.["db-migration"]?.status === "pending",
  );
  const firstDbTerminalIndex = lifecycleSnapshots.findIndex(
    ({ metadata }) =>
      metadata.schema === releaseMetadataSchema &&
      terminalReleaseStatuses.has(
        metadata.scopeResults?.["db-migration"]?.status,
      ),
  );
  if (
    firstDbTerminalIndex >= 0 &&
    jcsCanonicalize(currentDbMigrationScope ?? null) !==
      jcsCanonicalize(baseDbMigrationScope ?? null) &&
    (firstDbPendingIndex < 0 || firstDbPendingIndex > firstDbTerminalIndex)
  ) {
    validationErrors.push(
      `${releasePath}: terminal DB migration evidence requires an earlier pending DB migration snapshot`,
    );
  }
  const firstPendingSnapshot =
    firstPendingIndex >= 0 ? lifecycleSnapshots[firstPendingIndex] : null;
  if (firstPendingSnapshot) {
    for (const snapshot of lifecycleSnapshots.slice(firstPendingIndex + 1)) {
      validationErrors.push(
        ...validateFrozenReleaseTarget(
          firstPendingSnapshot.metadata,
          snapshot.metadata,
          `${snapshot.metadata.version ?? releasePath}@${snapshot.commit.slice(0, 12)}`,
        ),
      );
    }
  }

  const regressedMetadata = terminalReleaseStatuses.has(baseMetadata?.status)
    ? releaseMetadataHistory.find((metadata) =>
        activeReleaseStatuses.has(metadata.status),
      )
    : null;

  if (regressedMetadata) {
    validationErrors.push(
      `${releasePath}: terminal release status cannot transition back to active (${baseMetadata.status} -> ${regressedMetadata.status})`,
    );
    return;
  }

  if (firstPendingSnapshot) {
    return;
  }

  if (currentMetadata.status === "released" && !gitObjectExists(`${baseRef}:${releasePath}`)) {
    validationErrors.push(
      `${releasePath}: a new released record must contain a pending commit in the same PR history`,
    );
  }
}

function validateDbMigrationActivationTransition(baseRef, headRef, validationErrors) {
  const baseSource = readGitFileRaw(baseRef, dbMigrationGateActivationPath);
  const headSource = readGitFileRaw(headRef, dbMigrationGateActivationPath);
  let baseTrusted = false;
  if (baseSource !== null) {
    const baseErrors = validateDbMigrationGateActivation({
      source: baseSource,
      markerMode: readGitMode(baseRef, dbMigrationGateActivationPath),
      readFile: (relativePath) => readGitFileRaw(baseRef, relativePath),
      readMode: (relativePath) => readGitMode(baseRef, relativePath),
      context: `${dbMigrationGateActivationPath}@${baseRef.slice(0, 12)}`,
    });
    validationErrors.push(...baseErrors);
    baseTrusted = baseErrors.length === 0;
  }
  if (headSource !== null) {
    validationErrors.push(
      ...validateDbMigrationGateActivation({
        source: headSource,
        markerMode: readGitMode(headRef, dbMigrationGateActivationPath),
        readFile: (relativePath) => readGitFileRaw(headRef, relativePath),
        readMode: (relativePath) => readGitMode(headRef, relativePath),
        context: `${dbMigrationGateActivationPath}@${headRef.slice(0, 12)}`,
      }),
    );
  }
  if (baseSource !== null && headSource !== baseSource) {
    validationErrors.push(`${dbMigrationGateActivationPath}: activation marker is immutable`);
  }
  return {
    baseTrusted,
    introduced: baseSource === null && headSource !== null,
  };
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

function readGitFileRaw(ref, relativePath) {
  try {
    return execFileSync("git", ["show", `${ref}:${relativePath}`], {
      cwd: process.cwd(),
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    });
  } catch {
    return null;
  }
}

function readGitMode(ref, relativePath) {
  try {
    const output = git(["ls-tree", ref, "--", relativePath]);
    return output ? output.split(/\s+/u)[0] : null;
  } catch {
    return null;
  }
}
