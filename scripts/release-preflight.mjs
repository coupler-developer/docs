import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
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

const docsRoot = process.cwd();
const errors = [];
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
const releaseRecord = version
  ? readReleaseRecord(version, errors)
  : null;
const preflightRepoNames = releaseRecord
  ? resolvePreflightRepoNames(args.include, releaseRecord, errors)
  : new Set();
const workspaceRoot = releaseRecord
  ? resolveWorkspaceRoot(args.workspaceRoot, releaseRecord.model, errors)
  : null;
const repoStates = releaseRecord
  ? buildRepos(docsRoot, workspaceRoot)
    .filter((repo) => preflightRepoNames.has(repo.name))
    .map((repo) => inspectRepo(repo, errors))
  : [];

if (releaseRecord) {
  inspectReleaseRecord(releaseRecord, repoStates, errors);
}

printReport({
  workspaceRoot,
  preflightRepoNames,
  version,
  repoStates,
  errors,
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

function inspectRepo(repo, errors) {
  const state = {
    ...repo,
    branch: null,
    head: null,
    originMain: null,
    originMainFull: null,
    clean: false,
    onMain: false,
    syncedWithOriginMain: false,
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

  const fetchedOriginMain = fetchOriginMain(repo.root);
  state.branch = git(repo.root, ["branch", "--show-current"]);
  state.head = git(repo.root, ["rev-parse", "--short=12", "HEAD"]);
  const status = git(repo.root, ["status", "--porcelain"]);
  state.clean = status.length === 0;
  state.onMain = state.branch === "main";

  if (!state.clean) {
    errors.push(`${repo.name}: working tree is not clean`);
  }

  if (!state.onMain) {
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

    if (!state.syncedWithOriginMain) {
      errors.push(`${repo.name}: HEAD is not exactly origin/main`);
    }
  } catch {
    errors.push(`${repo.name}: origin/main is unavailable; fetch before release judgment`);
  }

  return state;
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

function readReleaseRecord(version, errors) {
  const releaseRecordPath = path.join(
    docsRoot,
    "content",
    "releases",
    `${version}.md`,
  );

  if (!fs.existsSync(releaseRecordPath)) {
    errors.push(`release record is missing: content/releases/${version}.md`);
    return null;
  }

  const source = fs.readFileSync(releaseRecordPath, "utf8");
  const metadata = parseReleaseMetadataBlock(source, version, errors);
  const scopeSection = extractSection(source, "범위");
  const statusSection = extractSection(source, "릴리스 상태");
  const versionMapping = extractSection(source, "버전 매핑");
  const status = parseReleaseStatus(statusSection);
  const scopeFields = parseScopeFields(scopeSection);
  const metadataStatus = metadata?.status ?? null;

  if (metadata) {
    validateReleaseMetadata(metadata, version, version, errors);
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

  validateDbMigrationSqlFiles(releaseRecord, repoStates, errors);
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
    validateResolvedBasisMatchesOriginMain(state.name, state.originMainFull, resolvedRefs, errors);
  }
}

function validateDbMigrationSqlFiles(releaseRecord, repoStates, errors) {
  const sqlRefs = releaseRecord.metadata
    ?.scopeResults
    ?.["db-migration"]
    ?.evidence
    ?.sqlRefs;

  if (!Array.isArray(sqlRefs) || sqlRefs.length === 0) {
    return;
  }

  const repoStateByName = new Map(repoStates.map((state) => [state.name, state]));
  for (const [index, sqlRef] of sqlRefs.entries()) {
    if (!sqlRef || typeof sqlRef !== "object") {
      continue;
    }

    const repoState = repoStateByName.get(sqlRef.repo);
    const fieldPath = `scopeResults.db-migration.evidence.sqlRefs.${index}`;
    if (!repoState) {
      errors.push(`${releaseRecord.version}: DB migration SQL ref repo is not included in preflight repos: ${sqlRef.repo}`);
      continue;
    }

    if (
      typeof sqlRef.path !== "string" ||
      typeof sqlRef.checksumSha256 !== "string" ||
      !repoState.exists
    ) {
      continue;
    }

    const sqlPath = path.resolve(repoState.root, sqlRef.path);
    const relativePath = path.relative(repoState.root, sqlPath);
    if (
      relativePath === ".." ||
      relativePath.startsWith(`..${path.sep}`) ||
      path.isAbsolute(relativePath)
    ) {
      errors.push(`${releaseRecord.version}: DB migration SQL ref ${fieldPath}.path escapes repo root`);
      continue;
    }

    if (!fs.existsSync(sqlPath) || !fs.statSync(sqlPath).isFile()) {
      errors.push(`${releaseRecord.version}: DB migration SQL file is missing: ${sqlRef.repo}/${sqlRef.path}`);
      continue;
    }

    const checksum = createHash("sha256")
      .update(fs.readFileSync(sqlPath))
      .digest("hex");
    if (checksum !== sqlRef.checksumSha256.toLowerCase()) {
      errors.push(`${releaseRecord.version}: DB migration SQL checksum mismatch for ${sqlRef.repo}/${sqlRef.path}`);
    }
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
  try {
    git(repoRoot, ["merge-base", "--is-ancestor", commit, "origin/main"]);
    return true;
  } catch {
    return false;
  }
}

function validateResolvedBasisConsistency(repoName, resolvedRefs, errors) {
  if (resolvedRefs.length <= 1) {
    return;
  }

  const commits = new Set(resolvedRefs.map((ref) => ref.commit));
  if (commits.size <= 1) {
    return;
  }

  const refs = resolvedRefs
    .map((ref) => `${ref.type} ${ref.value} -> ${ref.commit.slice(0, 12)}`)
    .join(", ");
  errors.push(`${repoName}: 버전 매핑 tag와 commit이 같은 기준점을 가리켜야 합니다: ${refs}`);
}

function git(repoRoot, args) {
  return execFileSync("git", args, {
    cwd: repoRoot,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  }).trim();
}

function printReport({
  workspaceRoot,
  preflightRepoNames,
  version,
  repoStates,
  errors,
}) {
  console.log("Release preflight");
  console.log(`workspace root: ${formatWorkspaceRoot(workspaceRoot, preflightRepoNames)}`);
  console.log(`preflight repos: ${formatPreflightRepoNames(preflightRepoNames)}`);
  if (version) {
    console.log(`version: ${version}`);
  }

  console.log("");
  console.log("Repositories");
  for (const state of repoStates) {
    console.log(
      `- ${state.name}: branch=${state.branch ?? "N/A"}, head=${state.head ?? "N/A"}, origin/main=${state.originMain ?? "N/A"}, clean=${state.clean ? "yes" : "no"}`,
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
  yarn release:preflight --version vX.Y.Z --workspace-root .. --include docs,coupler-api

Options:
  --version <vX.Y.Z>       Required. Release record version to inspect.
  --workspace-root <path>  Workspace root containing service repositories.
  --include <repos>        Comma-separated repo refs to check. Values: docs, coupler-api, coupler-admin-web, coupler-mobile-app, api, admin, mobile, all.
  --help                  Show this help.
`);
}
