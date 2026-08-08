import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  getMetadataMappingBasis,
  knownRepoNames,
  parseReleaseMetadataBlock,
  validateReleaseMetadata,
} from "./release-record-metadata.mjs";
import { createReleaseRecordModel } from "./release-record-model.mjs";
import {
  allowedReleaseStatuses,
  repoRefPolicyDescriptors,
  repoNameAliases,
  terminalReleaseStatuses,
} from "./release-schema.mjs";
import {
  parseReleaseStatus,
  validateReleaseStatusGate,
} from "./release-status-gate.mjs";
import {
  extractRepoNames,
  extractSection,
  parseScopeFields,
  setsAreEqual,
} from "./release-record-parser.mjs";
import { dbMigrationMaintenanceEvidenceSchema } from "./db-migration-maintenance-artifacts.mjs";

const docsRoot = process.cwd();
const validateReleaseRecordsScript = fileURLToPath(
  new URL("./validate-release-records.mjs", import.meta.url),
);
const errors = [];
const preflightReleaseStatuses = new Set(["pending", "in_progress"]);
let args = {};
try {
  args = parseArgs(process.argv.slice(2));
} catch (error) {
  errors.push(error.message);
}
const version = args.version ?? null;
if (!version) {
  errors.push("--version is required for release preflight");
}
if (version && !args.pendingRef) {
  errors.push(
    "--pending-ref is required; release preflight only reads an unpublished PR record, never a record already merged to main",
  );
}
const releaseRecord = version && args.pendingRef
  ? readReleaseRecord(version, errors, args.pendingRef)
  : null;
if (
  args.pendingRef &&
  releaseRecord &&
  !preflightReleaseStatuses.has(releaseRecord.status)
) {
  errors.push(
    `--pending-ref requires release-metadata status pending or in_progress, got ${releaseRecord.status ?? "unknown"}`,
  );
}
if (releaseRecord && args.pendingRef) {
  validateDbMigrationOperationalAdmission(releaseRecord, errors);
}
const preflightRepoNames = releaseRecord
  ? resolvePreflightRepoNames(args.include, releaseRecord, errors)
  : new Set();
const workspaceRoot = releaseRecord
  ? resolveWorkspaceRoot(args.workspaceRoot, releaseRecord.model, errors)
  : null;
const repoStates = releaseRecord
  ? buildRepos(docsRoot, workspaceRoot)
    .filter((repo) => preflightRepoNames.has(repo.name))
    .map((repo) => inspectRepo(repo, errors, {
      pendingRef: repo.name === "docs" ? args.pendingRef : null,
      originMainAlreadyFetched: repo.name === "docs",
    }))
  : [];

if (releaseRecord) {
  inspectReleaseRecord(releaseRecord, repoStates, errors);
  validatePendingReleaseTransition(args.pendingRef, repoStates, errors);
}

printReport({
  workspaceRoot,
  preflightRepoNames,
  version,
  repoStates,
  errors,
  pendingRef: args.pendingRef,
});

if (errors.length > 0) {
  process.exit(1);
}

function parseArgs(argv) {
  const result = {};

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];

    if (arg === "--version") {
      result.version = requireValue(argv, index, arg);
      index += 1;
      continue;
    }

    if (arg.startsWith("--version=")) {
      result.version = arg.slice("--version=".length);
      continue;
    }

    if (arg === "--workspace-root") {
      result.workspaceRoot = requireValue(argv, index, arg);
      index += 1;
      continue;
    }

    if (arg.startsWith("--workspace-root=")) {
      result.workspaceRoot = arg.slice("--workspace-root=".length);
      continue;
    }

    if (arg === "--include") {
      result.include = requireValue(argv, index, arg);
      index += 1;
      continue;
    }

    if (arg === "--pending-ref") {
      result.pendingRef = requireValue(argv, index, arg).toLowerCase();
      index += 1;
      continue;
    }

    if (arg.startsWith("--pending-ref=")) {
      result.pendingRef = arg.slice("--pending-ref=".length).toLowerCase();
      continue;
    }

    if (arg.startsWith("--include=")) {
      result.include = arg.slice("--include=".length);
      continue;
    }

    if (arg === "--help" || arg === "-h") {
      printUsage();
      process.exit(0);
    }

    throw new Error(`Unknown argument: ${arg}`);
  }

  if (result.version && !/^v\d+\.\d+\.\d+$/.test(result.version)) {
    throw new Error(`--version must use vMAJOR.MINOR.PATCH format: ${result.version}`);
  }

  if (result.pendingRef && !/^[0-9a-f]{40}$/.test(result.pendingRef)) {
    throw new Error(`--pending-ref must be a full 40-character commit SHA: ${result.pendingRef}`);
  }

  return result;
}

function resolvePreflightRepoNames(rawInclude, releaseRecord, errors) {
  if (rawInclude) {
    let requestedRepoNames;
    try {
      requestedRepoNames = parseRepoRefNames(rawInclude);
    } catch (error) {
      errors.push(error.message);
      return new Set();
    }

    if (releaseRecord?.model.preflightRepoNames.size > 0) {
      validatePreflightRepoNamesAgainstRecord(
        releaseRecord.version,
        requestedRepoNames,
        releaseRecord.model.preflightRepoNames,
        errors,
      );
    } else if (releaseRecord) {
      errors.push(
        `${releaseRecord.version}: release-metadata releaseScopes를 확인할 수 없어 --include를 신뢰할 수 없습니다`,
      );
    }

    return requestedRepoNames;
  }

  if (releaseRecord?.model.preflightRepoNames.size > 0) {
    return releaseRecord.model.preflightRepoNames;
  }

  if (releaseRecord) {
    errors.push(
      `${releaseRecord.version}: preflight 레포를 release-metadata releaseScopes에서 추론할 수 없습니다`,
    );
    return new Set();
  }

  return new Set(knownRepoNames);
}

function validatePreflightRepoNamesAgainstRecord(
  version,
  requestedRepoNames,
  expectedRepoNames,
  errors,
) {
  const missing = [...expectedRepoNames].filter(
    (repoName) => !requestedRepoNames.has(repoName),
  );
  const extra = [...requestedRepoNames].filter(
    (repoName) => !expectedRepoNames.has(repoName),
  );

  if (missing.length === 0 && extra.length === 0) {
    return;
  }

  errors.push(
    `${version}: --include must match release-metadata derived preflightRepoNames (missing: ${formatRepoList(missing)}, extra: ${formatRepoList(extra)})`,
  );
}

function formatRepoList(repoNames) {
  if (repoNames.length === 0) {
    return "none";
  }

  return repoNames.join(", ");
}

function parseRepoRefNames(rawInclude) {
  const values = rawInclude
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);

  if (values.length === 0) {
    throw new Error("--include requires at least one repository name");
  }

  if (values.includes("all")) {
    return new Set(knownRepoNames);
  }

  const included = new Set();
  for (const value of values) {
    const repoName = repoNameAliases.get(value) ?? value;

    if (!knownRepoNames.includes(repoName)) {
      throw new Error(`Unknown --include repository: ${value}`);
    }

    included.add(repoName);
  }

  return included;
}

function requireValue(argv, index, flagName) {
  const value = argv[index + 1];

  if (!value || value.startsWith("--")) {
    throw new Error(`${flagName} requires a value`);
  }

  return value;
}

function findWorkspaceRoot(startDir) {
  let current = path.resolve(startDir);

  while (true) {
    const hasServiceRepos = [
      "coupler-api",
      "coupler-admin-web",
      "coupler-mobile-app",
    ].every((repoName) => fs.existsSync(path.join(current, repoName)));

    if (hasServiceRepos) {
      return current;
    }

    const parent = path.dirname(current);
    if (parent === current) {
      throw new Error(
        "Workspace root not found. Pass --workspace-root <path>.",
      );
    }

    current = parent;
  }
}

function resolveWorkspaceRoot(rawWorkspaceRoot, releaseModel, errors) {
  if (!releaseModel.requiresServiceWorkspace) {
    return null;
  }

  if (rawWorkspaceRoot) {
    return path.resolve(rawWorkspaceRoot);
  }

  try {
    return findWorkspaceRoot(docsRoot);
  } catch (error) {
    errors.push(error.message);
    return null;
  }
}

function includesServiceRepo(repoNames) {
  return [...repoNames].some((repoName) => repoName !== "docs");
}

function buildRepos(docsRoot, workspaceRoot) {
  const repos = [
    {
      name: "docs",
      root: docsRoot,
    },
  ];

  if (!workspaceRoot) {
    return repos;
  }

  repos.push(
    {
      name: "coupler-api",
      root: path.join(workspaceRoot, "coupler-api"),
    },
    {
      name: "coupler-admin-web",
      root: path.join(workspaceRoot, "coupler-admin-web"),
    },
    {
      name: "coupler-mobile-app",
      root: path.join(workspaceRoot, "coupler-mobile-app"),
    },
  );

  return repos;
}

function inspectRepo(repo, errors, options = {}) {
  const state = {
    ...repo,
    branch: null,
    head: null,
    originMain: null,
    originMainFull: null,
    clean: false,
    onMain: false,
    syncedWithOriginMain: false,
    upstream: null,
    exists: fs.existsSync(repo.root),
  };

  if (!state.exists) {
    errors.push(`${repo.name}: repo path does not exist: ${repo.root}`);
    return state;
  }

  try {
    git(repo.root, ["rev-parse", "--show-toplevel"]);
  } catch {
    errors.push(`${repo.name}: not a git repository: ${repo.root}`);
    return state;
  }

  const fetchedOriginMain =
    options.originMainAlreadyFetched || fetchOriginMain(repo.root);
  state.branch = git(repo.root, ["branch", "--show-current"]);
  state.head = git(repo.root, ["rev-parse", "--short=12", "HEAD"]);
  const status = git(repo.root, ["status", "--porcelain"]);
  state.clean = status.length === 0;
  state.onMain = state.branch === "main";

  if (!state.clean) {
    errors.push(`${repo.name}: working tree is not clean`);
  }

  if (!options.pendingRef && !state.onMain) {
    errors.push(`${repo.name}: branch must be main for release preflight, got ${state.branch || "(detached)"}`);
  }

  if (!fetchedOriginMain) {
    errors.push(`${repo.name}: failed to fetch origin/main; remote freshness is unavailable`);
  }

  try {
    state.originMain = git(repo.root, [
      "rev-parse",
      "--short=12",
      "origin/main",
    ]);
    const headFull = git(repo.root, ["rev-parse", "HEAD"]);
    const originMainFull = git(repo.root, ["rev-parse", "origin/main"]);
    state.originMainFull = originMainFull;
    state.syncedWithOriginMain = headFull === originMainFull;

    if (!options.pendingRef && !state.syncedWithOriginMain) {
      errors.push(`${repo.name}: HEAD is not exactly origin/main`);
    }
  } catch {
    errors.push(`${repo.name}: origin/main is unavailable; fetch before release judgment`);
  }

  if (options.pendingRef) {
    validatePendingDocsRepo(state, options.pendingRef, errors);
  }

  return state;
}

function validatePendingDocsRepo(state, pendingRef, errors) {
  const headFull = resolveLocalCommit(state.root, "HEAD");
  if (headFull !== pendingRef) {
    errors.push(
      `docs: --pending-ref must equal the checked-out docs HEAD (${pendingRef} != ${headFull ?? "unresolved"})`,
    );
  }

  if (state.branch === "main") {
    errors.push("docs: --pending-ref requires a non-main release PR branch");
  }

  let upstream;
  try {
    upstream = git(state.root, [
      "rev-parse",
      "--abbrev-ref",
      "--symbolic-full-name",
      "@{upstream}",
    ]);
  } catch {
    errors.push("docs: pending release branch must be pushed to an origin upstream");
    return;
  }

  if (!upstream.startsWith("origin/")) {
    errors.push(`docs: pending release branch upstream must use origin, got ${upstream}`);
    return;
  }

  state.upstream = upstream;
  const remoteBranch = upstream.slice("origin/".length);
  if (!fetchOriginBranch(state.root, remoteBranch)) {
    errors.push(`docs: failed to fetch pending release branch ${upstream}`);
    return;
  }

  const upstreamHead = resolveLocalCommit(state.root, upstream);
  if (upstreamHead !== pendingRef) {
    errors.push(
      `docs: pending release branch HEAD must equal pushed upstream and --pending-ref (${upstreamHead ?? "unresolved"} != ${pendingRef})`,
    );
  }

  if (
    state.originMainFull &&
    !gitCommitIsAncestor(state.root, state.originMainFull, pendingRef)
  ) {
    errors.push("docs: pending release branch must include the latest origin/main");
  }
}

function fetchOriginMain(repoRoot) {
  try {
    git(repoRoot, [
      "fetch",
      "--no-tags",
      "origin",
      "+refs/heads/main:refs/remotes/origin/main",
    ]);
    return true;
  } catch {
    return false;
  }
}

function fetchOriginBranch(repoRoot, branch) {
  try {
    git(repoRoot, [
      "fetch",
      "--no-tags",
      "origin",
      `+refs/heads/${branch}:refs/remotes/origin/${branch}`,
    ]);
    return true;
  } catch {
    return false;
  }
}

function readReleaseRecord(version, errors, pendingRef) {
  const relativeReleaseRecordPath = path.posix.join("content", "releases", `${version}.md`);

  if (!fetchOriginMain(docsRoot)) {
    errors.push(
      "docs: failed to fetch origin/main before release record classification; the record was not read",
    );
    return null;
  }

  if (
    ["origin/main"].some((ref) =>
      gitObjectExists(docsRoot, `${ref}:${relativeReleaseRecordPath}`),
    )
  ) {
    errors.push(
      `release record is already published and opaque; preflight does not parse or revalidate it: ${relativeReleaseRecordPath}`,
    );
    return null;
  }

  let source;
  try {
    source = git(docsRoot, ["show", `${pendingRef}:${relativeReleaseRecordPath}`]);
  } catch {
    errors.push(
      `release record is missing from --pending-ref ${pendingRef}: content/releases/${version}.md`,
    );
    return null;
  }
  const metadata = parseReleaseMetadataBlock(source, version, errors);
  const scopeSection = extractSection(source, "범위");
  const statusSection = extractSection(source, "릴리스 상태");
  const versionMapping = extractSection(source, "버전 매핑");
  const status = parseReleaseStatus(statusSection);
  const scopeFields = parseScopeFields(scopeSection);
  const metadataStatus = metadata?.status ?? null;

  if (metadata) {
    validateReleaseMetadata(metadata, version, version, errors, {
      readArtifact: (relativePath) =>
        readPendingReleaseArtifact(pendingRef, relativePath),
      readApiArtifact: readTrustedApiArtifact,
      requireTrustedApiSource: true,
      listArtifacts: (prefix) => listPendingReleaseArtifacts(pendingRef, prefix),
      requireCurrentSchema: true,
    });
  }

  if (!statusSection.includes(`- 목표 버전: \`${version}\``)) {
    errors.push(`${version}: release status target version does not match file name`);
  }

  if (!status) {
    errors.push(`${version}: 전체 상태 또는 최종 상태를 확인할 수 없습니다`);
  } else if (!allowedReleaseStatuses.has(status)) {
    errors.push(`${version}: 허용되지 않은 릴리스 상태입니다: ${status}`);
  }

  if (metadataStatus && status && metadataStatus !== status) {
    errors.push(`${version}: release-metadata status must match 릴리스 상태 section`);
  }

  const model = createReleaseRecordModel(metadata);

  return {
    version,
    source,
    metadata,
    model,
    scopeSection,
    scopeFields,
    statusSection,
    versionMapping,
    status: metadataStatus ?? status,
  };
}

function readTrustedApiArtifact(sourceRef, relativePath) {
  if (
    !/^[0-9a-f]{40}$/u.test(sourceRef ?? "") ||
    !relativePath ||
    path.posix.isAbsolute(relativePath) ||
    relativePath.split("/").includes("..")
  ) {
    return null;
  }
  const apiRoot = process.env.DB_MIGRATION_API_ROOT ??
    path.join(args.workspaceRoot ?? path.dirname(docsRoot), "coupler-api");
  try {
    return execFileSync("git", ["show", `${sourceRef}:${relativePath}`], {
      cwd: apiRoot,
      encoding: null,
      stdio: ["ignore", "pipe", "ignore"],
    });
  } catch {
    return null;
  }
}

function readPendingReleaseArtifact(pendingRef, relativePath) {
  return readGitReleaseArtifact(pendingRef, relativePath);
}

function readGitReleaseArtifact(ref, relativePath) {
  if (
    typeof relativePath !== "string" ||
    path.isAbsolute(relativePath) ||
    relativePath.includes("\\") ||
    path.posix.normalize(relativePath) !== relativePath ||
    !relativePath.startsWith("content/releases/evidence/db-migrations/")
  ) {
    return null;
  }
  let treeEntry;
  try {
    treeEntry = git(docsRoot, [
      "ls-tree",
      ref,
      "--",
      relativePath,
    ]);
  } catch {
    return null;
  }
  const [metadata, listedPath] = treeEntry.split("\t");
  if (
    listedPath !== relativePath ||
    !/^100(?:644|755) blob [0-9a-f]{40}$/u.test(metadata)
  ) {
    return null;
  }
  try {
    return execFileSync("git", ["show", `${ref}:${relativePath}`], {
      cwd: docsRoot,
      stdio: ["ignore", "pipe", "pipe"],
    });
  } catch {
    return null;
  }
}

function listPendingReleaseArtifacts(pendingRef, prefix) {
  return listGitReleaseArtifacts(pendingRef, prefix);
}

function listGitReleaseArtifacts(ref, prefix) {
  if (
    typeof prefix !== "string" ||
    !prefix.startsWith("content/releases/evidence/db-migrations/") ||
    !prefix.endsWith("/") ||
    path.posix.normalize(prefix) !== prefix
  ) {
    return null;
  }
  try {
    const output = git(docsRoot, [
      "ls-tree",
      "-r",
      "--name-only",
      ref,
      "--",
      prefix,
    ]);
    return output
      .split("\n")
      .filter((relativePath) => relativePath.startsWith(prefix))
      .sort();
  } catch {
    return null;
  }
}

function validateDbMigrationOperationalAdmission(releaseRecord, validationErrors) {
  const dbResult = releaseRecord.metadata?.scopeResults?.["db-migration"];
  const hasDbScope = releaseRecord.metadata?.releaseScopes?.includes("db-migration") || dbResult;
  if (!hasDbScope) {
    return;
  }

  const expectedProdPlanPath =
    `content/releases/evidence/db-migrations/${releaseRecord.version}/prod/plan.json`;
  if (["planned", "pending"].includes(dbResult?.status)) {
    validationErrors.push(
      `${releaseRecord.version}: DB migration operational preflight requires an in_progress canonical prod plan root with null execution`,
    );
    return;
  }
  if (
    dbResult?.status === "in_progress" &&
    (dbResult?.evidence?.schema !== dbMigrationMaintenanceEvidenceSchema ||
      dbResult?.evidence?.kind !== "canonical" ||
      dbResult?.evidence?.plan?.path !== expectedProdPlanPath ||
      dbResult?.evidence?.execution !== null)
  ) {
    validationErrors.push(
      `${releaseRecord.version}: DB migration operational preflight requires an in_progress canonical prod plan root with null execution`,
    );
    return;
  }
}

function validatePendingReleaseTransition(pendingRef, repoStates, validationErrors) {
  const docsState = repoStates.find((state) => state.name === "docs");
  if (
    !pendingRef ||
    !docsState?.clean ||
    docsState.originMainFull === null ||
    resolveLocalCommit(docsRoot, "HEAD") !== pendingRef
  ) {
    return;
  }
  try {
    execFileSync(
      process.execPath,
      [validateReleaseRecordsScript, "--base-ref", "origin/main"],
      {
        cwd: docsRoot,
        encoding: "utf8",
        stdio: ["ignore", "pipe", "pipe"],
      },
    );
  } catch (error) {
    const details = String(error?.stderr || error?.stdout || error?.message || "").trim();
    validationErrors.push(
      `docs: pending release transition validation failed${details ? `: ${details}` : ""}`,
    );
  }
}

function inspectReleaseRecord(releaseRecord, repoStates, errors) {
  const { version, metadata, model, versionMapping, status, statusSection, scopeFields } = releaseRecord;

  validateScopeFields(version, scopeFields, model, errors);
  errors.push(
    ...validateReleaseStatusGate({
      context: version,
      status,
      statusSection,
    }),
  );

  if (!versionMapping.trim()) {
    errors.push(`${version}: 버전 매핑 section is missing or empty`);
    return;
  }

  for (const repoName of [
    "`docs`",
    "`coupler-api`",
    "`coupler-admin-web`",
    "`coupler-mobile-app`",
  ]) {
    if (!versionMapping.includes(`- ${repoName}:`)) {
      errors.push(`${version}: 버전 매핑 is missing ${repoName}`);
    }
  }

  for (const state of repoStates) {
    validateMappingBasis(
      state,
      getMetadataMappingBasis(metadata, state.name),
      releaseRecord,
      errors,
    );
  }

}

function validateScopeFields(version, scopeFields, releaseModel, errors) {
  for (const fieldName of ["대상", "포함 범위", "제외 범위"]) {
    const value = scopeFields.get(fieldName);

    if (!value) {
      errors.push(`${version}: 범위 섹션에 ${fieldName}을 비워둘 수 없습니다`);
    }
  }

  const proseRepoRefs = extractRepoNames(scopeFields.get("대상") ?? "");
  if (proseRepoRefs.size === 0) {
    errors.push(
      `${version}: 범위의 대상에는 backtick으로 감싼 repo ref를 1개 이상 기록해야 합니다`,
    );
  }

  if (!setsAreEqual(proseRepoRefs, releaseModel.preflightRepoNames)) {
    errors.push(`${version}: 범위 대상 must match release-metadata derived preflightRepoNames`);
  }
}

function validateMappingBasis(state, basis, releaseRecord, errors) {
  const policy = repoRefPolicyDescriptors[state.name];
  if (!policy) {
    errors.push(`${state.name}: repo ref policy is not configured`);
    return;
  }

  if (basis.tags.length === 0 && basis.commits.length === 0) {
    if (policy.requiresMappingBasis) {
      errors.push(`${state.name}: 버전 매핑에 확인 가능한 tag 또는 SHA가 없습니다`);
    }
    return;
  }

  if (!policy.allowConcreteCommit && basis.commits.length > 0) {
    errors.push(policy.concreteCommitError);
  }

  if (!state.exists) {
    return;
  }

  if (!state.originMainFull) {
    errors.push(`${state.name}: origin/main 기준점을 확인할 수 없습니다`);
    return;
  }

  const resolvedRefs = [];

  for (const tag of basis.tags) {
    if (policy.tagMustMatchReleaseVersion && tag.value !== releaseRecord.version) {
      errors.push(`${state.name}: versionMapping.${state.name}.tag는 릴리스 버전과 같아야 합니다: ${releaseRecord.version}`);
      continue;
    }

    const tagResolution = resolveRemoteAnnotatedTagCommit(state.root, tag.value);

    if (tagResolution.status === "missing") {
      if (requiresOriginTag(policy, releaseRecord.status)) {
        errors.push(formatMissingOriginTagError(state.name, policy, releaseRecord.status, tag.value));
      }
      continue;
    }

    if (policy.tagMustBeAnnotated && tagResolution.status === "not_annotated") {
      errors.push(`${state.name}: 버전 매핑 tag는 annotated tag여야 합니다: ${tag.value}`);
      continue;
    }

    if (
      policy.tagMustBeAncestorOfOriginMain &&
      !gitCommitIsAncestorOfOriginMain(state.root, tagResolution.commit)
    ) {
      errors.push(`${state.name}: 버전 매핑 ref가 origin/main 계보에 없습니다: ${tag.value}`);
      continue;
    }

    resolvedRefs.push({
      ...tag,
      commit: tagResolution.commit,
    });
  }

  for (const commitRef of basis.commits) {
    if (!policy.allowConcreteCommit) {
      continue;
    }

    const commit = resolveLocalCommit(state.root, commitRef.value);

    if (!commit) {
      errors.push(`${state.name}: 버전 매핑 commit을 origin/main 로컬 객체에서 확인하지 못했습니다: ${commitRef.value}`);
      continue;
    }

    if (
      policy.commitMustBeAncestorOfOriginMain &&
      !gitCommitIsAncestorOfOriginMain(state.root, commit)
    ) {
      errors.push(`${state.name}: 버전 매핑 ref가 origin/main 계보에 없습니다: ${commitRef.value}`);
      continue;
    }

    resolvedRefs.push({
      ...commitRef,
      commit,
    });
  }

  validateResolvedBasisConsistency(state.name, resolvedRefs, errors);
  if (policy.refMustEqualCurrentOriginMain) {
    const frozenGroups = policy.annotatedOriginTagFreezesHistoricalRef
      ? new Set(
          resolvedRefs
            .filter((ref) => ref.type === "tag")
            .map((ref) => ref.group ?? "default"),
        )
      : new Set();
    const refsRequiringCurrentOrigin = resolvedRefs.filter(
      (ref) =>
        !ref.frozenArtifact &&
        !frozenGroups.has(ref.group ?? "default"),
    );
    validateResolvedBasisMatchesOriginMain(
      state.name,
      state.originMainFull,
      refsRequiringCurrentOrigin,
      errors,
    );
  }
}

function requiresOriginTag(policy, releaseStatus) {
  return policy.tagOriginRequirement === "always" ||
    (policy.tagOriginRequirement === "terminal" &&
      terminalReleaseStatuses.has(releaseStatus));
}

function formatMissingOriginTagError(repoName, policy, releaseStatus, tagValue) {
  if (
    policy.tagOriginRequirement === "terminal" &&
    terminalReleaseStatuses.has(releaseStatus)
  ) {
    return `${repoName}: terminal release metadata tag를 origin에서 확인하지 못했습니다: ${tagValue}`;
  }

  return `${repoName}: 버전 매핑 tag를 origin에서 확인하지 못했습니다: ${tagValue}`;
}

function validateResolvedBasisMatchesOriginMain(
  repoName,
  originMainFull,
  resolvedRefs,
  errors,
) {
  for (const ref of resolvedRefs) {
    if (ref.commit !== originMainFull) {
      errors.push(
        `${repoName}: 버전 매핑 ref는 현재 origin/main 기준점과 같아야 합니다: ${ref.type} ${ref.value} -> ${ref.commit.slice(0, 12)}, origin/main -> ${originMainFull.slice(0, 12)}`,
      );
    }
  }
}

function resolveRemoteAnnotatedTagCommit(repoRoot, tagName) {
  try {
    const output = git(repoRoot, [
      "ls-remote",
      "--tags",
      "origin",
      `refs/tags/${tagName}`,
      `refs/tags/${tagName}^{}`,
    ]);
    const lines = output
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean);
    const peeledLine = lines.find((line) => line.endsWith(`refs/tags/${tagName}^{}`));

    if (lines.length === 0) {
      return {
        status: "missing",
        commit: null,
      };
    }

    if (!peeledLine) {
      return {
        status: "not_annotated",
        commit: null,
      };
    }

    return {
      status: "ok",
      commit: peeledLine.split(/\s+/)[0],
    };
  } catch {
    return {
      status: "missing",
      commit: null,
    };
  }
}

function resolveLocalCommit(repoRoot, commitRef) {
  try {
    return git(repoRoot, ["rev-parse", "--verify", `${commitRef}^{commit}`]);
  } catch {
    return null;
  }
}

function gitCommitIsAncestorOfOriginMain(repoRoot, commit) {
  return gitCommitIsAncestor(repoRoot, commit, "origin/main");
}

function gitCommitIsAncestor(repoRoot, ancestor, descendant) {
  try {
    git(repoRoot, ["merge-base", "--is-ancestor", ancestor, descendant]);
    return true;
  } catch {
    return false;
  }
}

function validateResolvedBasisConsistency(repoName, resolvedRefs, errors) {
  const refsByGroup = new Map();
  for (const ref of resolvedRefs) {
    const group = ref.group ?? "default";
    refsByGroup.set(group, [...(refsByGroup.get(group) ?? []), ref]);
  }
  for (const [group, groupedRefs] of refsByGroup) {
    if (groupedRefs.length <= 1) {
      continue;
    }
    const commits = new Set(groupedRefs.map((ref) => ref.commit));
    if (commits.size <= 1) {
      continue;
    }
    const refs = groupedRefs
      .map((ref) => `${ref.type} ${ref.value} -> ${ref.commit.slice(0, 12)}`)
      .join(", ");
    errors.push(`${repoName}: 버전 매핑 ${group} tag와 commit이 같은 기준점을 가리켜야 합니다: ${refs}`);
  }
}

function git(repoRoot, args) {
  return execFileSync("git", args, {
    cwd: repoRoot,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  }).trim();
}

function gitObjectExists(repoRoot, objectName) {
  try {
    git(repoRoot, ["cat-file", "-e", objectName]);
    return true;
  } catch {
    return false;
  }
}

function printReport({
  workspaceRoot,
  preflightRepoNames,
  version,
  repoStates,
  errors,
  pendingRef,
}) {
  console.log("Release preflight");
  console.log(`workspace root: ${formatWorkspaceRoot(workspaceRoot, preflightRepoNames)}`);
  console.log(`preflight repos: ${formatPreflightRepoNames(preflightRepoNames)}`);
  if (version) {
    console.log(`version: ${version}`);
  }
  if (pendingRef) {
    console.log(`docs record ref: pending ${pendingRef.slice(0, 12)}`);
  }

  console.log("");
  console.log("Repositories");
  for (const state of repoStates) {
    console.log(
      `- ${state.name}: branch=${state.branch ?? "N/A"}, head=${state.head ?? "N/A"}, origin/main=${state.originMain ?? "N/A"}, upstream=${state.upstream ?? "N/A"}, clean=${state.clean ? "yes" : "no"}`,
    );
  }

  if (errors.length > 0) {
    console.log("");
    console.log("Errors");
    for (const error of errors) {
      console.log(`- ${error}`);
    }
    console.log("");
    console.log("Result: FAIL");
    return;
  }

  console.log("");
  console.log("Result: PASS");
}

function formatWorkspaceRoot(workspaceRoot, preflightRepoNames) {
  if (workspaceRoot) {
    return workspaceRoot;
  }

  if (preflightRepoNames.size === 0) {
    return "N/A (scope unresolved)";
  }

  if (!includesServiceRepo(preflightRepoNames)) {
    return "N/A (docs only)";
  }

  return "N/A (service workspace unresolved)";
}

function formatPreflightRepoNames(preflightRepoNames) {
  if (preflightRepoNames.size === 0) {
    return "unresolved";
  }

  return [...preflightRepoNames].join(", ");
}

function printUsage() {
  console.log(`Usage:
  yarn release:preflight --version vX.Y.Z --workspace-root .. --pending-ref <40-character-SHA>

Options:
  --version <vX.Y.Z>       Required. Release record version to inspect.
  --workspace-root <path>  Workspace root containing service repositories.
  --include <repos>        Comma-separated repo refs to check. Values: docs, coupler-api, coupler-admin-web, coupler-mobile-app, api, admin, mobile, all.
  --pending-ref <SHA>      Full pushed docs PR head SHA. Requires pending or in_progress metadata and a clean non-main branch synced with origin upstream.
  --help                  Show this help.
`);
}
