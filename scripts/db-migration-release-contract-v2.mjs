import {
    createHash,
    createPublicKey,
    verify as verifySignature,
} from "node:crypto";

export const dbMigrationEvidenceEnvironments = ["dev", "prod"];
export const dbMigrationGateIdsV2 = [
    "DBM-GATE-000",
    "DBM-GATE-010",
    "DBM-GATE-100",
    "DBM-GATE-200",
    "DBM-GATE-300",
    "DBM-GATE-400",
];
export const dbMigrationOperationsV2 = [
    "apply",
    "frontier_adoption",
    "ledger_recovery",
    "recovery_apply",
];
export const dbMigrationGateActivationPath =
    "content/policy/db-migration-gate-activation-v2.json";
export const dbMigrationTrustProposalDirectory =
    "content/policy/db-migration-trust-proposals";
export const dbMigrationTrustEpochDirectory =
    "content/policy/db-migration-trust-epochs";
const activationManifestPaths = [
    "content/policy/db-migration-frontier-bootstrap-v2.json",
    "content/policy/db-migration-trust-bootstrap-v2.json",
    "scripts/db-migration-release-contract-v2.mjs",
];
const stageByGateId = new Map([
    ["DBM-GATE-100", "expand"],
    ["DBM-GATE-200", "backfill"],
    ["DBM-GATE-300", "cutover"],
    ["DBM-GATE-400", "contract"],
]);

const sha256Pattern = /^[0-9a-f]{64}$/u;
const fullCommitPattern = /^[0-9a-f]{40}$/u;
const asciiIdentifierPattern = /^[\x21-\x7e]+$/u;
const evidencePathPattern =
    /^content\/releases\/evidence\/db-migrations\/[A-Za-z0-9._/-]+\.attestation\.json$/u;
const evidenceArtifactPathPattern =
    /^content\/releases\/evidence\/db-migrations\/[A-Za-z0-9._/-]+\.(?:json|log|txt)$/u;

export function sha256Hex(value) {
    return createHash("sha256").update(value).digest("hex");
}

export function validateDbMigrationGateActivation({
    source,
    markerMode,
    readFile,
    readMode,
    context = dbMigrationGateActivationPath,
}) {
    const errors = [];
    if (markerMode !== "100644") {
        errors.push(
            `${context} must be a regular 100644 file (got ${markerMode ?? "missing"})`,
        );
    }
    let marker;
    try {
        marker = JSON.parse(source);
    } catch (error) {
        return [`${context}: invalid JSON: ${error.message}`];
    }
    if (!isExactObject(marker, ["schema", "manifest"], context, errors)) {
        return errors;
    }
    if (marker.schema !== "db-migration-gate-activation/v2") {
        errors.push(`${context}.schema is invalid`);
    }
    if (!Array.isArray(marker.manifest)) {
        errors.push(`${context}.manifest must be an array`);
        return errors;
    }
    const actualPaths = marker.manifest.map((entry) => entry?.path);
    if (!sameOrderedStrings(actualPaths, activationManifestPaths)) {
        errors.push(
            `${context}.manifest must exactly list immutable v2 sources in canonical order`,
        );
    }
    for (const [index, entry] of marker.manifest.entries()) {
        const entryPath = `${context}.manifest.${index}`;
        if (
            !isExactObject(entry, ["path", "mode", "sha256"], entryPath, errors)
        ) {
            continue;
        }
        if (entry.path === dbMigrationGateActivationPath) {
            errors.push(
                `${entryPath}.path must not reference the activation marker itself`,
            );
            continue;
        }
        if (!sha256Pattern.test(entry.sha256)) {
            errors.push(`${entryPath}.sha256 must be a lowercase SHA-256`);
        }
        const fileSource = readFile(entry.path);
        if (fileSource === null) {
            errors.push(
                `${context}: manifest source is missing: ${entry.path}`,
            );
        } else if (sha256Hex(fileSource) !== entry.sha256) {
            errors.push(
                `${context}: manifest checksum mismatch: ${entry.path}`,
            );
        }
        if (
            entry.path ===
                "content/policy/db-migration-trust-bootstrap-v2.json" &&
            fileSource !== null
        ) {
            let trustBootstrap;
            try {
                trustBootstrap = JSON.parse(fileSource);
            } catch (error) {
                errors.push(
                    `${context}: trust bootstrap is invalid JSON: ${error.message}`,
                );
            }
            if (trustBootstrap) {
                errors.push(
                    ...validateDbMigrationTrustRegistryV2(
                        trustBootstrap,
                        `${context}: trust bootstrap`,
                        { requireEmptyEpochs: true },
                    ),
                );
            }
        }
        const mode = readMode(entry.path);
        if (mode === null) {
            errors.push(
                `${context}: manifest mode source is missing: ${entry.path}`,
            );
        } else if (mode !== entry.mode) {
            errors.push(`${context}: manifest mode mismatch: ${entry.path}`);
        }
    }
    return errors;
}

export function validateDbMigrationTrustProposalV2(proposal, context) {
    const errors = [];
    if (
        !isExactObject(
            proposal,
            [
                "schema",
                "epoch",
                "keyId",
                "algorithm",
                "environments",
                "publicKeyPem",
            ],
            context,
            errors,
        )
    ) {
        return errors;
    }
    if (proposal.schema !== "db-migration-trust-proposal/v2") {
        errors.push(`${context}.schema is invalid`);
    }
    if (!Number.isSafeInteger(proposal.epoch) || proposal.epoch < 1) {
        errors.push(`${context}.epoch must be a positive integer`);
    }
    validateTrustKey(proposal, context, errors, false);
    return errors;
}

export function validateDbMigrationTrustEpochV2(epoch, context) {
    const errors = [];
    if (
        !isExactObject(
            epoch,
            [
                "schema",
                "epoch",
                "validFromSequence",
                "validThroughSequence",
                "keys",
                "proposal",
                "activationBaseRef",
            ],
            context,
            errors,
        )
    ) {
        return errors;
    }
    if (epoch.schema !== "db-migration-trust-epoch/v2") {
        errors.push(`${context}.schema is invalid`);
    }
    if (!Number.isSafeInteger(epoch.epoch) || epoch.epoch < 1) {
        errors.push(`${context}.epoch must be a positive integer`);
    }
    if (
        !Number.isSafeInteger(epoch.validFromSequence) ||
        epoch.validFromSequence < 1
    ) {
        errors.push(`${context}.validFromSequence must be a positive integer`);
    }
    if (
        epoch.validThroughSequence !== null &&
        (!Number.isSafeInteger(epoch.validThroughSequence) ||
            epoch.validThroughSequence < epoch.validFromSequence)
    ) {
        errors.push(
            `${context}.validThroughSequence must be null or not precede validFromSequence`,
        );
    }
    if (!Array.isArray(epoch.keys) || epoch.keys.length !== 1) {
        errors.push(`${context}.keys must contain exactly one proposed key`);
    } else {
        validateTrustKey(epoch.keys[0], `${context}.keys.0`, errors);
    }
    if (
        isExactObject(
            epoch.proposal,
            ["path", "sourceRef", "sha256"],
            `${context}.proposal`,
            errors,
        )
    ) {
        if (
            typeof epoch.proposal.path !== "string" ||
            !/^content\/policy\/db-migration-trust-proposals\/\d{4}-[a-z0-9][a-z0-9._-]*\.json$/u.test(
                epoch.proposal.path,
            )
        ) {
            errors.push(`${context}.proposal.path is invalid`);
        }
        if (
            typeof epoch.proposal.sourceRef !== "string" ||
            !fullCommitPattern.test(epoch.proposal.sourceRef)
        ) {
            errors.push(
                `${context}.proposal.sourceRef must be a full lowercase commit SHA`,
            );
        }
        if (
            typeof epoch.proposal.sha256 !== "string" ||
            !sha256Pattern.test(epoch.proposal.sha256)
        ) {
            errors.push(
                `${context}.proposal.sha256 must be a lowercase SHA-256`,
            );
        }
    }
    if (
        typeof epoch.activationBaseRef !== "string" ||
        !fullCommitPattern.test(epoch.activationBaseRef)
    ) {
        errors.push(
            `${context}.activationBaseRef must be a full lowercase commit SHA`,
        );
    }
    return errors;
}

export function validateDbMigrationTrustRegistryV2(
    trustRegistry,
    context,
    { requireEmptyEpochs = false } = {},
) {
    const errors = [];
    if (
        !isExactObject(
            trustRegistry,
            [
                "schema",
                "algorithms",
                "proposalDirectory",
                "epochDirectory",
                "epochs",
            ],
            context,
            errors,
        )
    ) {
        return errors;
    }
    if (trustRegistry.schema !== "db-migration-evidence-trust/v2") {
        errors.push(`${context}.schema is invalid`);
    }
    if (
        !Array.isArray(trustRegistry.algorithms) ||
        !sameOrderedStrings(trustRegistry.algorithms, ["ed25519"])
    ) {
        errors.push(`${context}.algorithms must exactly contain ed25519`);
    }
    if (
        trustRegistry.proposalDirectory !==
        dbMigrationTrustProposalDirectory
    ) {
        errors.push(`${context}.proposalDirectory is invalid`);
    }
    if (trustRegistry.epochDirectory !== dbMigrationTrustEpochDirectory) {
        errors.push(`${context}.epochDirectory is invalid`);
    }
    if (!Array.isArray(trustRegistry.epochs)) {
        errors.push(`${context}.epochs must be an array`);
    } else if (requireEmptyEpochs && trustRegistry.epochs.length !== 0) {
        errors.push(`${context}.epochs must be empty in the immutable bootstrap`);
    } else {
        const seenKeyIds = new Map();
        const seenPublicKeyFingerprints = new Map();
        for (const [epochIndex, epoch] of trustRegistry.epochs.entries()) {
            const keys = Array.isArray(epoch?.keys) ? epoch.keys : [];
            for (const [keyIndex, key] of keys.entries()) {
                const keyContext = `${context}.epochs.${epochIndex}.keys.${keyIndex}`;
                if (typeof key?.keyId === "string") {
                    const previous = seenKeyIds.get(key.keyId);
                    if (previous) {
                        errors.push(
                            `${keyContext}.keyId reuses retired trust key ID from ${previous}`,
                        );
                    } else {
                        seenKeyIds.set(key.keyId, keyContext);
                    }
                }
                const fingerprint = publicKeyFingerprint(key?.publicKeyPem);
                if (fingerprint) {
                    const previous = seenPublicKeyFingerprints.get(fingerprint);
                    if (previous) {
                        errors.push(
                            `${keyContext}.publicKeyPem reuses retired trust public key from ${previous}`,
                        );
                    } else {
                        seenPublicKeyFingerprints.set(fingerprint, keyContext);
                    }
                }
            }
        }
    }
    return errors;
}

function publicKeyFingerprint(publicKeyPem) {
    if (typeof publicKeyPem !== "string") {
        return null;
    }
    try {
        const publicKey = createPublicKey(publicKeyPem);
        if (publicKey.asymmetricKeyType !== "ed25519") {
            return null;
        }
        return sha256Hex(
            publicKey.export({ type: "spki", format: "der" }),
        );
    } catch {
        return null;
    }
}

function validateTrustKey(key, context, errors, requireExactObject = true) {
    if (!key || typeof key !== "object" || Array.isArray(key)) {
        errors.push(`${context} must be an object`);
        return;
    }
    if (
        requireExactObject &&
        !isExactObject(
            key,
            ["keyId", "algorithm", "environments", "publicKeyPem"],
            context,
            errors,
        )
    ) {
        return;
    }
    if (
        typeof key.keyId !== "string" ||
        !/^[a-z0-9][a-z0-9._-]*$/u.test(key.keyId)
    ) {
        errors.push(`${context}.keyId is invalid`);
    }
    if (key.algorithm !== "ed25519") {
        errors.push(`${context}.algorithm must be ed25519`);
    }
    if (
        !Array.isArray(key.environments) ||
        key.environments.length === 0 ||
        key.environments.some(
            (environment) =>
                !dbMigrationEvidenceEnvironments.includes(environment),
        ) ||
        jcsCanonicalize(key.environments) !==
            jcsCanonicalize(
                dbMigrationEvidenceEnvironments.filter((environment) =>
                    key.environments.includes(environment),
                ),
            )
    ) {
        errors.push(
            `${context}.environments must be known, unique, and canonical`,
        );
    }
    if (typeof key.publicKeyPem !== "string") {
        errors.push(`${context}.publicKeyPem is required`);
        return;
    }
    try {
        const publicKey = createPublicKey(key.publicKeyPem);
        if (publicKey.asymmetricKeyType !== "ed25519") {
            errors.push(
                `${context}.publicKeyPem must contain an Ed25519 public key`,
            );
            return;
        }
        const canonicalPublicKeyPem = publicKey.export({
            type: "spki",
            format: "pem",
        });
        if (key.publicKeyPem !== canonicalPublicKeyPem) {
            errors.push(
                `${context}.publicKeyPem must contain exactly one canonical Ed25519 SPKI public-key PEM block`,
            );
        }
    } catch {
        errors.push(`${context}.publicKeyPem must contain a valid public key`);
    }
}

export function jcsCanonicalize(value) {
    assertCanonicalJsonValue(value, "$", new Set());
    return serializeCanonicalJsonValue(value);
}

function assertCanonicalJsonValue(value, fieldPath, ancestors) {
    if (
        value === null ||
        typeof value === "string" ||
        typeof value === "boolean"
    ) {
        if (typeof value === "string" && value !== value.normalize("NFC")) {
            throw new Error(`${fieldPath} must use NFC-normalized strings`);
        }
        return;
    }
    if (typeof value === "number") {
        if (!Number.isSafeInteger(value)) {
            throw new Error(`${fieldPath} numbers must be safe integers`);
        }
        return;
    }
    if (typeof value !== "object" || value === undefined) {
        throw new Error(`${fieldPath} contains an unsupported JSON value`);
    }
    if (ancestors.has(value)) {
        throw new Error(`${fieldPath} contains a cycle`);
    }
    ancestors.add(value);
    if (Array.isArray(value)) {
        value.forEach((item, index) =>
            assertCanonicalJsonValue(item, `${fieldPath}[${index}]`, ancestors),
        );
    } else {
        for (const [key, nestedValue] of Object.entries(value)) {
            if (key !== key.normalize("NFC")) {
                throw new Error(`${fieldPath} contains a non-NFC key`);
            }
            assertCanonicalJsonValue(
                nestedValue,
                `${fieldPath}.${key}`,
                ancestors,
            );
        }
    }
    ancestors.delete(value);
}

function serializeCanonicalJsonValue(value) {
    if (value === null || typeof value !== "object") {
        return JSON.stringify(value);
    }
    if (Array.isArray(value)) {
        return `[${value.map(serializeCanonicalJsonValue).join(",")}]`;
    }
    return `{${Object.keys(value)
        .sort()
        .map(
            (key) =>
                `${JSON.stringify(key)}:${serializeCanonicalJsonValue(value[key])}`,
        )
        .join(",")}}`;
}

export function parseCanonicalJsonSource(source, context) {
    let value;
    try {
        value = JSON.parse(source);
    } catch (error) {
        throw new Error(`${context}: invalid JSON: ${error.message}`);
    }
    const canonicalSource = `${jcsCanonicalize(value)}\n`;
    if (source !== canonicalSource) {
        throw new Error(
            `${context}: must be RFC 8785/JCS canonical JSON with one trailing newline`,
        );
    }
    return value;
}

export function deriveNotApplicableGateIds(requiredGateCoordinates) {
    const required = new Set(
        requiredGateCoordinates.map(({ gateId }) => gateId),
    );
    return dbMigrationGateIdsV2.filter((gateId) => !required.has(gateId));
}

function compareMigrationRefs(left, right) {
    return left.path.localeCompare(right.path, undefined, { numeric: true });
}

function refKey(ref) {
    return `${ref.path}\u0000${ref.checksumSha256}`;
}

function normalizeMigrationRefs(
    refs,
    context,
    errors,
    { allowEmpty = true } = {},
) {
    if (!Array.isArray(refs)) {
        errors.push(`${context} must be an array`);
        return [];
    }
    if (!allowEmpty && refs.length === 0) {
        errors.push(`${context} must not be empty`);
    }
    const result = [];
    const seen = new Set();
    const seenPaths = new Set();
    for (const [index, ref] of refs.entries()) {
        const refPath = `${context}.${index}`;
        if (!isExactObject(ref, ["path", "checksumSha256"], refPath, errors)) {
            continue;
        }
        let validRef = true;
        if (!isRepoRelativeSqlPath(ref.path)) {
            errors.push(`${refPath}.path must be a repo-relative .sql path`);
            validRef = false;
        }
        if (
            typeof ref.checksumSha256 !== "string" ||
            !sha256Pattern.test(ref.checksumSha256)
        ) {
            errors.push(
                `${refPath}.checksumSha256 must be a lowercase SHA-256`,
            );
            validRef = false;
        }
        if (!validRef) {
            continue;
        }
        const key = refKey(ref);
        if (seenPaths.has(ref.path)) {
            errors.push(
                `${context} contains a duplicate migration path: ${ref.path}`,
            );
        }
        seenPaths.add(ref.path);
        if (seen.has(key)) {
            errors.push(
                `${context} contains a duplicate migration ref: ${ref.path}`,
            );
        }
        seen.add(key);
        result.push({ path: ref.path, checksumSha256: ref.checksumSha256 });
    }
    const sorted = [...result].sort(compareMigrationRefs);
    if (jcsCanonicalize(result) !== jcsCanonicalize(sorted)) {
        errors.push(`${context} must use canonical numeric migration order`);
    }
    return result;
}

function isRepoRelativeSqlPath(value) {
    return (
        typeof value === "string" &&
        value.endsWith(".sql") &&
        !value.startsWith("/") &&
        !value.includes("\\") &&
        !/^[a-z][a-z0-9+.-]*:/iu.test(value) &&
        value
            .split("/")
            .every((segment) => segment && segment !== "." && segment !== "..")
    );
}

function isExactObject(value, keys, context, errors) {
    if (!value || typeof value !== "object" || Array.isArray(value)) {
        errors.push(`${context} must be an object`);
        return false;
    }
    const expected = new Set(keys);
    let exact = true;
    for (const key of Object.keys(value)) {
        if (!expected.has(key)) {
            errors.push(`${context} has unknown key: ${key}`);
            exact = false;
        }
    }
    for (const key of keys) {
        if (!Object.hasOwn(value, key)) {
            errors.push(`${context} is missing ${key}`);
            exact = false;
        }
    }
    return exact;
}

function sameRefs(left, right) {
    return jcsCanonicalize(left) === jcsCanonicalize(right);
}

function unionRefs(left, right) {
    const byKey = new Map(left.map((ref) => [refKey(ref), ref]));
    for (const ref of right) {
        byKey.set(refKey(ref), ref);
    }
    return [...byKey.values()].sort(compareMigrationRefs);
}

function subtractRefs(left, right) {
    const excluded = new Set(right.map(refKey));
    return left.filter((ref) => !excluded.has(refKey(ref)));
}

function isSubset(subset, superset) {
    const allowed = new Set(superset.map(refKey));
    return subset.every((ref) => allowed.has(refKey(ref)));
}

export function validateDbMigrationEvidenceShapeV2({
    evidence,
    context,
    terminal,
    requirePlan = terminal,
}) {
    const errors = [];
    if (
        !isExactObject(
            evidence,
            ["catalog", "plans", "rollbackPlan"],
            context,
            errors,
        )
    ) {
        return errors;
    }
    if (!requirePlan && evidence.catalog === null) {
        // Planned records may leave the target catalog unresolved.
    } else if (
        isExactObject(
            evidence.catalog,
            ["repo", "sourceRef", "path", "sha256"],
            `${context}.catalog`,
            errors,
        )
    ) {
        if (evidence.catalog.repo !== "coupler-api") {
            errors.push(`${context}.catalog.repo must be coupler-api`);
        }
        if (
            typeof evidence.catalog.sourceRef !== "string" ||
            !fullCommitPattern.test(evidence.catalog.sourceRef)
        ) {
            errors.push(
                `${context}.catalog.sourceRef must be a full lowercase commit SHA`,
            );
        }
        if (evidence.catalog.path !== "db/schema/schema-contract.json") {
            errors.push(
                `${context}.catalog.path must be db/schema/schema-contract.json`,
            );
        }
        if (
            typeof evidence.catalog.sha256 !== "string" ||
            !sha256Pattern.test(evidence.catalog.sha256)
        ) {
            errors.push(
                `${context}.catalog.sha256 must be a lowercase SHA-256`,
            );
        }
    }
    if (
        !evidence.plans ||
        typeof evidence.plans !== "object" ||
        Array.isArray(evidence.plans)
    ) {
        errors.push(`${context}.plans must be an object`);
    } else {
        const actualEnvironments = Object.keys(evidence.plans);
        if (!sameStringSet(actualEnvironments, dbMigrationEvidenceEnvironments)) {
            errors.push(
                `${context}.plans must exactly contain dev and prod in canonical order`,
            );
        }
        for (const environment of dbMigrationEvidenceEnvironments) {
            if (!requirePlan && evidence.plans[environment] === null) {
                continue;
            }
            validateEnvironmentPlanShape({
                plan: evidence.plans[environment],
                environment,
                context: `${context}.plans.${environment}`,
                terminal,
                requirePlan,
                errors,
            });
        }
    }
    if (terminal) {
        if (
            typeof evidence.rollbackPlan !== "string" ||
            evidence.rollbackPlan.trim().length === 0
        ) {
            errors.push(
                `${context}.rollbackPlan must be concrete for a terminal DB migration scope`,
            );
        }
    } else if (
        evidence.rollbackPlan !== null &&
        typeof evidence.rollbackPlan !== "string"
    ) {
        errors.push(`${context}.rollbackPlan must be a string or null`);
    }
    return errors;
}

function validateEnvironmentPlanShape({
    plan,
    environment,
    context,
    terminal,
    requirePlan,
    errors,
}) {
    if (
        !isExactObject(
            plan,
            ["operation", "targetRefs", "batches"],
            context,
            errors,
        )
    ) {
        return;
    }
    if (!dbMigrationOperationsV2.includes(plan.operation)) {
        errors.push(
            `${context}.operation is invalid: ${String(plan.operation)}`,
        );
    }
    const targetRefs = normalizeMigrationRefs(
        plan.targetRefs,
        `${context}.targetRefs`,
        errors,
        {
            allowEmpty: !requirePlan,
        },
    );
    if (!Array.isArray(plan.batches)) {
        errors.push(`${context}.batches must be an array`);
        return;
    }
    if (requirePlan && plan.batches.length === 0) {
        errors.push(
            `${context}.batches must not be empty once a DB migration plan is fixed`,
        );
    }
    const partition = [];
    const coordinates = [];
    const seenBatchIds = new Set();
    for (const [index, batch] of plan.batches.entries()) {
        const batchPath = `${context}.batches.${index}`;
        if (
            !isExactObject(
                batch,
                [
                    "batchId",
                    "order",
                    "stage",
                    "sqlRefs",
                    "requiredGateIds",
                    "attestation",
                ],
                batchPath,
                errors,
            )
        ) {
            continue;
        }
        if (
            typeof batch.batchId !== "string" ||
            !/^[a-z0-9][a-z0-9._-]*$/u.test(batch.batchId)
        ) {
            errors.push(
                `${batchPath}.batchId must use lowercase ASCII identifiers`,
            );
        } else if (seenBatchIds.has(batch.batchId)) {
            errors.push(
                `${context}.batches has duplicate batchId: ${batch.batchId}`,
            );
        }
        seenBatchIds.add(batch.batchId);
        if (batch.order !== index + 1) {
            errors.push(`${batchPath}.order must be ${index + 1}`);
        }
        if (
            ![
                "expand",
                "backfill",
                "cutover",
                "contract",
                "legacy",
                "maintenance",
            ].includes(batch.stage)
        ) {
            errors.push(
                `${batchPath}.stage is invalid: ${String(batch.stage)}`,
            );
        }
        const sqlRefs = normalizeMigrationRefs(
            batch.sqlRefs,
            `${batchPath}.sqlRefs`,
            errors,
            {
                allowEmpty: false,
            },
        );
        partition.push(...sqlRefs);
        if (
            !Array.isArray(batch.requiredGateIds) ||
            batch.requiredGateIds.length === 0
        ) {
            errors.push(`${batchPath}.requiredGateIds must not be empty`);
        } else {
            const canonicalGates = dbMigrationGateIdsV2.filter((gateId) =>
                batch.requiredGateIds.includes(gateId),
            );
            if (
                batch.requiredGateIds.some(
                    (gateId) => !dbMigrationGateIdsV2.includes(gateId),
                ) ||
                jcsCanonicalize(batch.requiredGateIds) !==
                    jcsCanonicalize(canonicalGates)
            ) {
                errors.push(
                    `${batchPath}.requiredGateIds must be known, unique, and canonical`,
                );
            }
            for (const gateId of canonicalGates) {
                coordinates.push({
                    environment,
                    operation: plan.operation,
                    batchId: batch.batchId,
                    gateId,
                });
            }
        }
        validateAttestationRef(batch.attestation, batchPath, terminal, errors);
    }
    if (!sameRefs(partition, targetRefs)) {
        errors.push(
            `${context}.batches must be an exact ordered partition of targetRefs`,
        );
    }
    return coordinates;
}

function validateAttestationRef(attestation, batchPath, terminal, errors) {
    if (!terminal && attestation === null) {
        return;
    }
    if (
        !isExactObject(
            attestation,
            ["path", "sha256"],
            `${batchPath}.attestation`,
            errors,
        )
    ) {
        return;
    }
    if (
        typeof attestation.path !== "string" ||
        !asciiIdentifierPattern.test(attestation.path) ||
        !evidencePathPattern.test(attestation.path) ||
        attestation.path
            .split("/")
            .some((segment) => segment === "." || segment === "..")
    ) {
        errors.push(
            `${batchPath}.attestation.path must use the DB migration evidence directory`,
        );
    }
    if (
        typeof attestation.sha256 !== "string" ||
        !sha256Pattern.test(attestation.sha256)
    ) {
        errors.push(
            `${batchPath}.attestation.sha256 must be a lowercase SHA-256`,
        );
    }
}

export function validateDbMigrationPlanAgainstCatalog({
    evidence,
    catalogMigrations,
    effectiveTrustedFrontier,
    context,
}) {
    const errors = [];
    const migrationsByRef = new Map();
    for (const migration of catalogMigrations) {
        const ref = { path: migration.file, checksumSha256: migration.sha256 };
        migrationsByRef.set(refKey(ref), migration);
    }
    const targetCatalog = [...migrationsByRef.values()]
        .map((migration) => ({
            path: migration.file,
            checksumSha256: migration.sha256,
        }))
        .sort(compareMigrationRefs);
    for (const environment of dbMigrationEvidenceEnvironments) {
        const plan = evidence?.plans?.[environment];
        if (!plan) {
            continue;
        }
        const frontier = effectiveTrustedFrontier[environment] ?? [];
        const outstanding = subtractRefs(targetCatalog, frontier);
        if (
            ["apply", "frontier_adoption"].includes(plan.operation) &&
            !sameRefs(plan.targetRefs, outstanding)
        ) {
            errors.push(
                `${context}.plans.${environment}.targetRefs must exactly equal catalog minus effective trusted frontier`,
            );
        }
        if (
            ["ledger_recovery", "recovery_apply"].includes(plan.operation) &&
            !isSubset(plan.targetRefs, frontier)
        ) {
            errors.push(
                `${context}.plans.${environment}.targetRefs must be a subset of the effective trusted frontier for recovery`,
            );
        }
        for (const [index, batch] of (plan.batches ?? []).entries()) {
            const expectedGates = new Set();
            const batchStages = new Set();
            let containsMultiStageMigration = false;
            for (const ref of batch.sqlRefs ?? []) {
                const migration = migrationsByRef.get(refKey(ref));
                if (!migration) {
                    errors.push(
                        `${context}.plans.${environment}.batches.${index} contains a ref not present in the target catalog: ${ref.path}`,
                    );
                    continue;
                }
                if (!Array.isArray(migration.gateIds)) {
                    errors.push(
                        `${context}.catalog migration is missing exact gateIds: ${migration.file}`,
                    );
                    continue;
                }
                const migrationStages = new Set();
                migration.gateIds.forEach((gateId) => {
                    if (!dbMigrationGateIdsV2.includes(gateId)) {
                        errors.push(
                            `${context}.catalog migration has unknown gateId ${String(gateId)}: ${migration.file}`,
                        );
                    } else {
                        expectedGates.add(gateId);
                        const stage = stageByGateId.get(gateId);
                        if (stage) {
                            migrationStages.add(stage);
                            batchStages.add(stage);
                        }
                    }
                });
                if (migrationStages.size !== 1) {
                    containsMultiStageMigration = true;
                }
            }
            const canonicalExpectedGates = dbMigrationGateIdsV2.filter(
                (gateId) => expectedGates.has(gateId),
            );
            if (
                jcsCanonicalize(batch.requiredGateIds ?? []) !==
                jcsCanonicalize(canonicalExpectedGates)
            ) {
                errors.push(
                    `${context}.plans.${environment}.batches.${index}.requiredGateIds must exactly match catalog gateIds`,
                );
            }
            const expectedStage = ["ledger_recovery", "recovery_apply"].includes(
                plan.operation,
            )
                ? "maintenance"
                : containsMultiStageMigration || batchStages.size !== 1
                  ? "legacy"
                  : [...batchStages][0];
            if (batch.stage !== expectedStage) {
                errors.push(
                    `${context}.plans.${environment}.batches.${index}.stage must be ${expectedStage} for its exact catalog Gate set`,
                );
            }
        }
    }
    return errors;
}

export function createBootstrapFrontierState(bootstrap) {
    const errors = [];
    if (
        !isExactObject(
            bootstrap,
            ["schema", "cutoffApiCommit", "environments", "provenance"],
            "bootstrap",
            errors,
        )
    ) {
        return { states: {}, errors };
    }
    if (bootstrap.schema !== "db-migration-frontier-bootstrap/v2") {
        errors.push("bootstrap.schema is invalid");
    }
    if (
        typeof bootstrap.cutoffApiCommit !== "string" ||
        !fullCommitPattern.test(bootstrap.cutoffApiCommit)
    ) {
        errors.push(
            "bootstrap.cutoffApiCommit must be a full lowercase commit SHA",
        );
    }
    if (
        !bootstrap.environments ||
        typeof bootstrap.environments !== "object" ||
        Array.isArray(bootstrap.environments) ||
        !sameStringSet(
            Object.keys(bootstrap.environments),
            dbMigrationEvidenceEnvironments,
        )
    ) {
        errors.push(
            "bootstrap.environments must exactly contain dev and prod in canonical order",
        );
    }
    const states = {};
    for (const environment of dbMigrationEvidenceEnvironments) {
        const envValue = bootstrap.environments?.[environment];
        if (
            !isExactObject(
                envValue,
                ["rawHistoricalFrontier", "effectiveTrustedFrontier"],
                `bootstrap.environments.${environment}`,
                errors,
            )
        ) {
            continue;
        }
        const raw = normalizeMigrationRefs(
            envValue.rawHistoricalFrontier,
            `bootstrap.environments.${environment}.rawHistoricalFrontier`,
            errors,
        );
        const effective = normalizeMigrationRefs(
            envValue.effectiveTrustedFrontier,
            `bootstrap.environments.${environment}.effectiveTrustedFrontier`,
            errors,
        );
        if (!isSubset(effective, raw)) {
            errors.push(
                `bootstrap.environments.${environment}.effectiveTrustedFrontier must be a subset of rawHistoricalFrontier`,
            );
        }
        const checkpoint = {
            domain: "coupler/db-migration-frontier-bootstrap/v2",
            cutoffApiCommit: bootstrap.cutoffApiCommit,
            environment,
            rawHistoricalFrontier: raw,
            effectiveTrustedFrontier: effective,
        };
        states[environment] = {
            sequence: 0,
            previousTransitionDigest: sha256Hex(jcsCanonicalize(checkpoint)),
            rawHistoricalFrontier: raw,
            effectiveTrustedFrontier: effective,
        };
    }
    if (
        !Array.isArray(bootstrap.provenance) ||
        bootstrap.provenance.length === 0
    ) {
        errors.push("bootstrap.provenance must not be empty");
    } else {
        const provenanceByEnvironment = new Map();
        for (const [index, provenance] of bootstrap.provenance.entries()) {
            const provenancePath = `bootstrap.provenance.${index}`;
            if (
                !isExactObject(
                    provenance,
                    ["environment", "source", "acceptedRefs"],
                    provenancePath,
                    errors,
                )
            ) {
                continue;
            }
            if (
                !dbMigrationEvidenceEnvironments.includes(
                    provenance.environment,
                )
            ) {
                errors.push(`${provenancePath}.environment is invalid`);
            } else if (provenanceByEnvironment.has(provenance.environment)) {
                errors.push(
                    `bootstrap.provenance has duplicate environment: ${provenance.environment}`,
                );
            }
            provenanceByEnvironment.set(provenance.environment, provenance);
            if (
                typeof provenance.source !== "string" ||
                provenance.source.trim().length === 0
            ) {
                errors.push(`${provenancePath}.source must be non-empty`);
            }
            const expectedPaths =
                states[provenance.environment]?.rawHistoricalFrontier?.map(
                    ({ path }) => path,
                ) ?? [];
            if (
                !Array.isArray(provenance.acceptedRefs) ||
                jcsCanonicalize(provenance.acceptedRefs) !==
                    jcsCanonicalize(expectedPaths)
            ) {
                errors.push(
                    `${provenancePath}.acceptedRefs must exactly match rawHistoricalFrontier paths`,
                );
            }
        }
        for (const environment of dbMigrationEvidenceEnvironments) {
            if (!provenanceByEnvironment.has(environment)) {
                errors.push(`bootstrap.provenance is missing ${environment}`);
            }
        }
    }
    return { states, errors };
}

export function validateSignedAttestationBundle({
    source,
    trustRegistry,
    expected,
    context,
}) {
    const errors = [];
    let bundle;
    try {
        bundle = parseCanonicalJsonSource(source, context);
    } catch (error) {
        return { bundle: null, digest: null, errors: [error.message] };
    }
    if (
        !isExactObject(
            bundle,
            ["schema", "payload", "signature"],
            context,
            errors,
        )
    ) {
        return { bundle: null, digest: null, errors };
    }
    if (bundle.schema !== "db-migration-attestation/v2") {
        errors.push(`${context}.schema is invalid`);
    }
    validateAttestationPayload(bundle.payload, expected, context, errors);
    const signature = bundle.signature;
    if (
        isExactObject(
            signature,
            ["algorithm", "keyId", "trustEpoch", "valueBase64"],
            `${context}.signature`,
            errors,
        )
    ) {
        if (signature.algorithm !== "ed25519") {
            errors.push(`${context}.signature.algorithm must be ed25519`);
        }
        if (
            typeof signature.keyId !== "string" ||
            !/^[a-z0-9][a-z0-9._-]*$/u.test(signature.keyId)
        ) {
            errors.push(`${context}.signature.keyId is invalid`);
        }
        if (
            !Number.isSafeInteger(signature.trustEpoch) ||
            signature.trustEpoch < 1
        ) {
            errors.push(
                `${context}.signature.trustEpoch must be a positive integer`,
            );
        }
        if (
            typeof signature.valueBase64 !== "string" ||
            !/^[A-Za-z0-9+/]+={0,2}$/u.test(signature.valueBase64)
        ) {
            errors.push(`${context}.signature.valueBase64 is invalid`);
        }
        const trustedKey = findTrustedKey(
            trustRegistry,
            bundle.payload,
            signature,
            context,
            errors,
        );
        if (trustedKey) {
            try {
                const signedBytes = Buffer.from(
                    `${bundle.payload.domain}\n${jcsCanonicalize(bundle.payload)}`,
                    "utf8",
                );
                const signatureBytes = Buffer.from(
                    signature.valueBase64,
                    "base64",
                );
                const publicKey = createPublicKey(trustedKey.publicKeyPem);
                if (
                    !verifySignature(
                        null,
                        signedBytes,
                        publicKey,
                        signatureBytes,
                    )
                ) {
                    errors.push(`${context}.signature does not verify`);
                }
            } catch (error) {
                errors.push(
                    `${context}.signature verification failed: ${error.message}`,
                );
            }
        }
    }
    return { bundle, digest: sha256Hex(source), errors };
}

function validateAttestationPayload(payload, expected, context, errors) {
    const keys = [
        "domain",
        "releaseVersion",
        "environment",
        "sequence",
        "previousTransitionDigest",
        "operation",
        "batch",
        "rawFrontierBefore",
        "rawFrontierAfter",
        "effectiveFrontierBefore",
        "effectiveFrontierAfter",
        "gateResults",
        "databaseIdentityDigest",
        "startedAt",
        "completedAt",
    ];
    if (!isExactObject(payload, keys, `${context}.payload`, errors)) {
        return;
    }
    if (payload.domain !== "coupler/db-migration-attestation/v2") {
        errors.push(`${context}.payload.domain is invalid`);
    }
    for (const key of [
        "releaseVersion",
        "environment",
        "operation",
        "previousTransitionDigest",
    ]) {
        if (expected?.[key] !== undefined && payload[key] !== expected[key]) {
            errors.push(
                `${context}.payload.${key} does not match release metadata/frontier`,
            );
        }
    }
    if (
        expected?.sequence !== undefined &&
        payload.sequence !== expected.sequence
    ) {
        errors.push(`${context}.payload.sequence must be ${expected.sequence}`);
    }
    if (!dbMigrationEvidenceEnvironments.includes(payload.environment)) {
        errors.push(`${context}.payload.environment is invalid`);
    }
    if (!dbMigrationOperationsV2.includes(payload.operation)) {
        errors.push(`${context}.payload.operation is invalid`);
    }
    if (!Number.isSafeInteger(payload.sequence) || payload.sequence < 1) {
        errors.push(`${context}.payload.sequence must be a positive integer`);
    }
    if (
        typeof payload.previousTransitionDigest !== "string" ||
        !sha256Pattern.test(payload.previousTransitionDigest)
    ) {
        errors.push(
            `${context}.payload.previousTransitionDigest must be a lowercase SHA-256`,
        );
    }
    if (
        expected?.batch &&
        jcsCanonicalize(payload.batch) !== jcsCanonicalize(expected.batch)
    ) {
        errors.push(
            `${context}.payload.batch does not exactly match release metadata`,
        );
    }
    const rawBefore = normalizeMigrationRefs(
        payload.rawFrontierBefore,
        `${context}.payload.rawFrontierBefore`,
        errors,
    );
    const rawAfter = normalizeMigrationRefs(
        payload.rawFrontierAfter,
        `${context}.payload.rawFrontierAfter`,
        errors,
    );
    const effectiveBefore = normalizeMigrationRefs(
        payload.effectiveFrontierBefore,
        `${context}.payload.effectiveFrontierBefore`,
        errors,
    );
    const effectiveAfter = normalizeMigrationRefs(
        payload.effectiveFrontierAfter,
        `${context}.payload.effectiveFrontierAfter`,
        errors,
    );
    if (
        expected?.rawFrontierBefore &&
        !sameRefs(rawBefore, expected.rawFrontierBefore)
    ) {
        errors.push(
            `${context}.payload.rawFrontierBefore does not match the transition chain`,
        );
    }
    if (
        expected?.effectiveFrontierBefore &&
        !sameRefs(effectiveBefore, expected.effectiveFrontierBefore)
    ) {
        errors.push(
            `${context}.payload.effectiveFrontierBefore does not match the transition chain`,
        );
    }
    validateFrontierTransition({
        payload,
        rawBefore,
        rawAfter,
        effectiveBefore,
        effectiveAfter,
        context,
        errors,
    });
    validateGateResults(
        payload.gateResults,
        payload.batch?.requiredGateIds,
        context,
        errors,
    );
    for (const key of ["databaseIdentityDigest"]) {
        if (
            typeof payload[key] !== "string" ||
            !sha256Pattern.test(payload[key])
        ) {
            errors.push(
                `${context}.payload.${key} must be a lowercase SHA-256`,
            );
        }
    }
    for (const key of ["startedAt", "completedAt"]) {
        if (
            typeof payload[key] !== "string" ||
            !isCanonicalTimestamp(payload[key])
        ) {
            errors.push(
                `${context}.payload.${key} must be a canonical ISO timestamp`,
            );
        }
    }
    if (
        isCanonicalTimestamp(payload.startedAt) &&
        isCanonicalTimestamp(payload.completedAt) &&
        payload.completedAt < payload.startedAt
    ) {
        errors.push(
            `${context}.payload.completedAt must not precede startedAt`,
        );
    }
}

function validateFrontierTransition({
    payload,
    rawBefore,
    rawAfter,
    effectiveBefore,
    effectiveAfter,
    context,
    errors,
}) {
    const refs = Array.isArray(payload.batch?.sqlRefs)
        ? payload.batch.sqlRefs
        : [];
    if (["apply", "frontier_adoption"].includes(payload.operation)) {
        const effectiveKeys = new Set(effectiveBefore.map(refKey));
        if (refs.some((ref) => effectiveKeys.has(refKey(ref)))) {
            errors.push(
                `${context}.payload.batch.sqlRefs must be disjoint from the effective frontier`,
            );
        }
        if (!sameRefs(rawAfter, unionRefs(rawBefore, refs))) {
            errors.push(
                `${context}.payload.rawFrontierAfter must exactly add the batch refs`,
            );
        }
        if (!sameRefs(effectiveAfter, unionRefs(effectiveBefore, refs))) {
            errors.push(
                `${context}.payload.effectiveFrontierAfter must exactly add the batch refs`,
            );
        }
        return;
    }
    if (!isSubset(refs, effectiveBefore)) {
        errors.push(
            `${context}.payload.batch.sqlRefs must already exist in effective frontier for recovery`,
        );
    }
    if (!sameRefs(effectiveAfter, effectiveBefore)) {
        errors.push(
            `${context}.payload.effectiveFrontierAfter must remain unchanged for recovery`,
        );
    }
    if (!sameRefs(rawAfter, unionRefs(rawBefore, refs))) {
        errors.push(
            `${context}.payload.rawFrontierAfter must exactly restore the recovery refs`,
        );
    }
}

function validateGateResults(gateResults, requiredGateIds, context, errors) {
    if (!Array.isArray(gateResults)) {
        errors.push(`${context}.payload.gateResults must be an array`);
        return;
    }
    const actualGateIds = [];
    for (const [index, result] of gateResults.entries()) {
        const resultPath = `${context}.payload.gateResults.${index}`;
        if (
            !isExactObject(
                result,
                ["gateId", "status", "artifact"],
                resultPath,
                errors,
            )
        ) {
            continue;
        }
        if (!dbMigrationGateIdsV2.includes(result.gateId)) {
            errors.push(`${resultPath}.gateId is invalid`);
        } else {
            actualGateIds.push(result.gateId);
        }
        if (result.status !== "passed") {
            errors.push(`${resultPath}.status must be passed`);
        }
        if (
            isExactObject(
                result.artifact,
                ["path", "sha256"],
                `${resultPath}.artifact`,
                errors,
            )
        ) {
            if (
                typeof result.artifact.path !== "string" ||
                !asciiIdentifierPattern.test(result.artifact.path) ||
                !evidenceArtifactPathPattern.test(result.artifact.path) ||
                result.artifact.path
                    .split("/")
                    .some((segment) => segment === "." || segment === "..")
            ) {
                errors.push(
                    `${resultPath}.artifact.path must be a repo-relative DB evidence artifact`,
                );
            }
            if (
                typeof result.artifact.sha256 !== "string" ||
                !sha256Pattern.test(result.artifact.sha256)
            ) {
                errors.push(
                    `${resultPath}.artifact.sha256 must be a lowercase SHA-256`,
                );
            }
        }
    }
    if (
        jcsCanonicalize(actualGateIds) !==
        jcsCanonicalize(requiredGateIds ?? [])
    ) {
        errors.push(
            `${context}.payload.gateResults must exactly cover batch.requiredGateIds`,
        );
    }
}

function findTrustedKey(trustRegistry, payload, signature, context, errors) {
    const epochs = Array.isArray(trustRegistry?.epochs)
        ? trustRegistry.epochs
        : [];
    const highestStartedEpoch = epochs
        .filter(
            (candidate) =>
                Number.isSafeInteger(candidate?.epoch) &&
                Number.isSafeInteger(candidate?.validFromSequence) &&
                payload.sequence >= candidate.validFromSequence &&
                Array.isArray(candidate.keys) &&
                candidate.keys.some(
                    (key) =>
                        Array.isArray(key?.environments) &&
                        key.environments.includes(payload.environment),
                ),
        )
        .sort((left, right) => right.epoch - left.epoch)[0];
    if (!highestStartedEpoch) {
        errors.push(
            `${context}.signature has no active trust epoch for its environment and sequence`,
        );
        return null;
    }
    if (
        highestStartedEpoch.validThroughSequence !== null &&
        payload.sequence > highestStartedEpoch.validThroughSequence
    ) {
        errors.push(
            `${context}.signature has no active trust epoch because highest started trust epoch ${highestStartedEpoch.epoch} expired at sequence ${highestStartedEpoch.validThroughSequence}`,
        );
        return null;
    }
    if (highestStartedEpoch.epoch !== signature.trustEpoch) {
        errors.push(
            `${context}.signature.trustEpoch must be the highest active trust epoch ${highestStartedEpoch.epoch}`,
        );
        return null;
    }
    const key = Array.isArray(highestStartedEpoch.keys)
        ? highestStartedEpoch.keys.find(
              (candidate) => candidate?.keyId === signature.keyId,
          )
        : null;
    if (!key || key.algorithm !== "ed25519") {
        errors.push(
            `${context}.signature.keyId is not trusted for the declared epoch`,
        );
        return null;
    }
    if (
        !Array.isArray(key.environments) ||
        !key.environments.includes(payload.environment)
    ) {
        errors.push(
            `${context}.signature.keyId is not trusted for ${payload.environment}`,
        );
        return null;
    }
    return key;
}

function isCanonicalTimestamp(value) {
    if (typeof value !== "string" || Number.isNaN(Date.parse(value))) {
        return false;
    }
    return new Date(value).toISOString() === value;
}

export function validateDbMigrationReleaseHistory({
    records,
    bootstrap,
    trustRegistry,
    readEvidence,
}) {
    const { states, errors } = createBootstrapFrontierState(bootstrap);
    const trustRegistryErrors = validateDbMigrationTrustRegistryV2(
        trustRegistry,
        "trustRegistry",
    );
    errors.push(...trustRegistryErrors);
    if (trustRegistryErrors.length > 0) {
        return { states, errors };
    }
    if (Array.isArray(trustRegistry.epochs)) {
        for (const [index, epoch] of trustRegistry.epochs.entries()) {
            errors.push(
                ...validateDbMigrationTrustEpochV2(
                    epoch,
                    `trustRegistry.epochs.${index}`,
                ),
            );
            if (epoch?.epoch !== index + 1) {
                errors.push(
                    `trustRegistry.epochs.${index}.epoch must be ${index + 1}`,
                );
            }
        }
    }
    for (const record of records) {
        const metadata = record.metadata;
        const dbResult = metadata?.scopeResults?.["db-migration"];
        if (
            metadata?.schema !== "release-metadata/v2" ||
            !["released", "rolled_back"].includes(dbResult?.status)
        ) {
            continue;
        }
        const evidence = dbResult.evidence;
        errors.push(
            ...validateDbMigrationEvidenceShapeV2({
                evidence,
                context: record.path,
                terminal: true,
                requirePlan: true,
            }),
        );
        for (const environment of dbMigrationEvidenceEnvironments) {
            const plan = evidence?.plans?.[environment];
            const state = states[environment];
            if (!plan || !state) {
                continue;
            }
            for (const batch of plan.batches ?? []) {
                const attestation = batch.attestation;
                if (!attestation?.path) {
                    continue;
                }
                const source = readEvidence(attestation.path);
                const context = `${record.path}:${environment}:${batch.batchId}`;
                if (source === null) {
                    errors.push(
                        `${context}: attestation file is missing: ${attestation.path}`,
                    );
                    continue;
                }
                if (sha256Hex(source) !== attestation.sha256) {
                    errors.push(
                        `${context}: attestation checksum does not match release metadata`,
                    );
                }
                const expectedBatch = {
                    batchId: batch.batchId,
                    order: batch.order,
                    stage: batch.stage,
                    sqlRefs: batch.sqlRefs,
                    requiredGateIds: batch.requiredGateIds,
                };
                const validation = validateSignedAttestationBundle({
                    source,
                    trustRegistry,
                    expected: {
                        releaseVersion: metadata.version,
                        environment,
                        operation: plan.operation,
                        sequence: state.sequence + 1,
                        previousTransitionDigest:
                            state.previousTransitionDigest,
                        rawFrontierBefore: state.rawHistoricalFrontier,
                        effectiveFrontierBefore: state.effectiveTrustedFrontier,
                        batch: expectedBatch,
                    },
                    context,
                });
                errors.push(...validation.errors);
                const artifactErrors = [];
                if (validation.bundle && validation.errors.length === 0) {
                    for (const gateResult of validation.bundle.payload
                        .gateResults) {
                        const artifactSource = readEvidence(
                            gateResult.artifact.path,
                        );
                        if (artifactSource === null) {
                            artifactErrors.push(
                                `${context}: Gate artifact is missing: ${gateResult.artifact.path}`,
                            );
                        } else if (
                            sha256Hex(artifactSource) !==
                            gateResult.artifact.sha256
                        ) {
                            artifactErrors.push(
                                `${context}: Gate artifact checksum mismatch: ${gateResult.artifact.path}`,
                            );
                        }
                    }
                }
                errors.push(...artifactErrors);
                if (
                    validation.bundle &&
                    validation.errors.length === 0 &&
                    artifactErrors.length === 0
                ) {
                    state.sequence = validation.bundle.payload.sequence;
                    state.previousTransitionDigest = validation.digest;
                    state.rawHistoricalFrontier =
                        validation.bundle.payload.rawFrontierAfter;
                    state.effectiveTrustedFrontier =
                        validation.bundle.payload.effectiveFrontierAfter;
                }
            }
        }
    }
    return { states, errors };
}

function sameStringSet(left, right) {
    return (
        left.length === right.length &&
        new Set(left).size === left.length &&
        new Set(right).size === right.length &&
        left.every((value) => right.includes(value))
    );
}

function sameOrderedStrings(left, right) {
    return (
        left.length === right.length &&
        left.every(
            (value, index) =>
                typeof value === "string" && value === right[index],
        )
    );
}
