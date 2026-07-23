import assert from "node:assert/strict";
import { generateKeyPairSync, sign } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";

import {
    createBootstrapFrontierState,
    dbMigrationGateActivationPath,
    deriveNotApplicableGateIds,
    jcsCanonicalize,
    parseCanonicalJsonSource,
    sha256Hex,
    validateDbMigrationGateActivation,
    validateDbMigrationEvidenceShapeV2,
    validateDbMigrationPlanAgainstCatalog,
    validateDbMigrationReleaseHistory,
    validateDbMigrationTrustProposalV2,
    validateDbMigrationTrustRegistryV2,
} from "./db-migration-release-contract-v2.mjs";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const checksum = "a".repeat(64);
const ref = {
    path: "db/migrations/95_expand_example.sql",
    checksumSha256: checksum,
};

describe("DB migration release contract v2", () => {
    it("pins every activation source by path, mode, and checksum", () => {
        const source = fs.readFileSync(
            path.join(repoRoot, dbMigrationGateActivationPath),
            "utf8",
        );
        const readFile = (relativePath) =>
            fs.readFileSync(path.join(repoRoot, relativePath), "utf8");
        const readMode = () => "100644";

        assert.deepEqual(
            validateDbMigrationGateActivation({
                source,
                markerMode: "100644",
                readFile,
                readMode,
            }),
            [],
        );
        assert(
            validateDbMigrationGateActivation({
                source,
                markerMode: "100644",
                readFile: (relativePath) =>
                    relativePath.endsWith("frontier-bootstrap-v2.json")
                        ? `${readFile(relativePath)}\n`
                        : readFile(relativePath),
                readMode,
            }).some((error) => /manifest checksum mismatch/.test(error)),
        );
        const malformedMarker = JSON.parse(source);
        malformedMarker.manifest[0] = null;
        assert.doesNotThrow(() =>
            validateDbMigrationGateActivation({
                source: JSON.stringify(malformedMarker),
                markerMode: "100644",
                readFile,
                readMode,
            }),
        );
        assert(
            validateDbMigrationGateActivation({
                source: JSON.stringify(malformedMarker),
                markerMode: "100644",
                readFile,
                readMode,
            }).length > 0,
        );
        assert(
            validateDbMigrationGateActivation({
                source,
                markerMode: "120000",
                readFile,
                readMode,
            }).some((error) => /regular 100644 file/.test(error)),
        );
        assert(
            validateDbMigrationGateActivation({
                source,
                markerMode: "100644",
                readFile,
                readMode: (relativePath) =>
                    relativePath === JSON.parse(source).manifest[0].path
                        ? "120000"
                        : "100644",
            }).some((error) => /manifest mode mismatch/.test(error)),
        );
    });

    it("accepts only canonical signed JSON encoding", () => {
        assert.deepEqual(
            parseCanonicalJsonSource('{"a":1,"b":2}\n', "bundle"),
            {
                a: 1,
                b: 2,
            },
        );
        assert.throws(
            () => parseCanonicalJsonSource('{ "a": 1, "b": 2 }\n', "bundle"),
            /RFC 8785\/JCS canonical JSON/,
        );
        assert.throws(() => jcsCanonicalize({ value: 1.5 }), /safe integers/);
    });

    it("accepts exactly one canonical Ed25519 public-key PEM block", () => {
        const { privateKey, publicKey } = generateKeyPairSync("ed25519");
        const publicKeyPem = publicKey.export({ type: "spki", format: "pem" });
        const privateKeyPem = privateKey.export({ type: "pkcs8", format: "pem" });
        const proposal = {
            schema: "db-migration-trust-proposal/v2",
            epoch: 1,
            keyId: "release-signer",
            algorithm: "ed25519",
            environments: ["dev", "prod"],
            publicKeyPem,
        };
        assert.deepEqual(
            validateDbMigrationTrustProposalV2(proposal, "proposal"),
            [],
        );
        for (const invalidPem of [
            privateKeyPem,
            `${publicKeyPem}${privateKeyPem}`,
        ]) {
            assert(
                validateDbMigrationTrustProposalV2(
                    { ...proposal, publicKeyPem: invalidPem },
                    "proposal",
                ).some((error) => /exactly one canonical Ed25519 SPKI/.test(error)),
            );
        }
    });

    it("derives N/A only from Gates with no required coordinate", () => {
        assert.deepEqual(
            deriveNotApplicableGateIds([
                {
                    environment: "dev",
                    operation: "apply",
                    batchId: "expand-1",
                    gateId: "DBM-GATE-000",
                },
                {
                    environment: "prod",
                    operation: "apply",
                    batchId: "expand-1",
                    gateId: "DBM-GATE-100",
                },
            ]),
            ["DBM-GATE-010", "DBM-GATE-200", "DBM-GATE-300", "DBM-GATE-400"],
        );
    });

    it("requires every environment plan to be an exact batch partition", () => {
        const evidence = buildEvidence({ terminal: false });
        evidence.plans = {
            prod: evidence.plans.prod,
            dev: evidence.plans.dev,
        };
        assert.deepEqual(
            validateDbMigrationEvidenceShapeV2({
                evidence,
                context: "release",
                terminal: false,
            }),
            [],
        );

        evidence.plans.dev.targetRefs = [];
        assert(
            validateDbMigrationEvidenceShapeV2({
                evidence,
                context: "release",
                terminal: false,
            }).some((error) => /exact ordered partition/.test(error)),
        );
    });

    it("computes outstanding migrations from the effective frontier only", () => {
        const evidence = buildEvidence({ terminal: false });
        const stageLessRef = {
            path: "db/migrations/96_postcheck_example.sql",
            checksumSha256: "b".repeat(64),
        };
        for (const plan of Object.values(evidence.plans)) {
            plan.targetRefs.push(stageLessRef);
            plan.batches[0].sqlRefs.push(stageLessRef);
            plan.batches[0].requiredGateIds = [
                "DBM-GATE-000",
                "DBM-GATE-010",
                "DBM-GATE-100",
            ];
            plan.batches[0].stage = "legacy";
        }
        const catalogMigrations = [
            {
                file: ref.path,
                sha256: ref.checksumSha256,
                gateIds: ["DBM-GATE-000", "DBM-GATE-100"],
                migrationStages: ["expand"],
            },
            {
                file: stageLessRef.path,
                sha256: stageLessRef.checksumSha256,
                gateIds: ["DBM-GATE-000", "DBM-GATE-010"],
                migrationStages: [],
            },
        ];
        assert.deepEqual(
            validateDbMigrationPlanAgainstCatalog({
                evidence,
                catalogMigrations,
                effectiveTrustedFrontier: { dev: [], prod: [] },
                context: "release",
            }),
            [],
        );
        const omittedStageLess = structuredClone(evidence);
        for (const plan of Object.values(omittedStageLess.plans)) {
            plan.targetRefs = [ref];
            plan.batches[0].sqlRefs = [ref];
            plan.batches[0].stage = "expand";
        }
        assert(
            validateDbMigrationPlanAgainstCatalog({
                evidence: omittedStageLess,
                catalogMigrations,
                effectiveTrustedFrontier: { dev: [], prod: [] },
                context: "release",
            }).some((error) =>
                /catalog minus effective trusted frontier/.test(error),
            ),
        );
        assert(
            validateDbMigrationPlanAgainstCatalog({
                evidence,
                catalogMigrations,
                effectiveTrustedFrontier: { dev: [ref], prod: [] },
                context: "release",
            }).some((error) =>
                /catalog minus effective trusted frontier/.test(error),
            ),
        );
    });

    it("verifies signatures and serializes each environment transition chain", () => {
        const { privateKey, publicKey } = generateKeyPairSync("ed25519");
        const bootstrap = emptyBootstrap();
        const trustRegistry = {
            schema: "db-migration-evidence-trust/v2",
            algorithms: ["ed25519"],
            proposalDirectory:
                "content/policy/db-migration-trust-proposals",
            epochDirectory: "content/policy/db-migration-trust-epochs",
            epochs: [
                {
                    schema: "db-migration-trust-epoch/v2",
                    epoch: 1,
                    validFromSequence: 1,
                    validThroughSequence: null,
                    keys: [
                        {
                            keyId: "release-signer",
                            algorithm: "ed25519",
                            environments: ["dev", "prod"],
                            publicKeyPem: publicKey.export({
                                type: "spki",
                                format: "pem",
                            }),
                        },
                    ],
                    proposal: {
                        path: "content/policy/db-migration-trust-proposals/0001-release-signer.json",
                        sourceRef: "e".repeat(40),
                        sha256: "f".repeat(64),
                    },
                    activationBaseRef: "e".repeat(40),
                },
            ],
        };
        const { states: initialStates } =
            createBootstrapFrontierState(bootstrap);
        const evidence = buildEvidence({ terminal: true });
        const sources = new Map();
        for (const environment of ["dev", "prod"]) {
            const batch = evidence.plans[environment].batches[0];
            const payload = {
                domain: "coupler/db-migration-attestation/v2",
                releaseVersion: "v9.9.0",
                environment,
                sequence: 1,
                previousTransitionDigest:
                    initialStates[environment].previousTransitionDigest,
                operation: "apply",
                batch: {
                    batchId: batch.batchId,
                    order: batch.order,
                    stage: batch.stage,
                    sqlRefs: batch.sqlRefs,
                    requiredGateIds: batch.requiredGateIds,
                },
                rawFrontierBefore: [],
                rawFrontierAfter: [ref],
                effectiveFrontierBefore: [],
                effectiveFrontierAfter: [ref],
                gateResults: batch.requiredGateIds.map((gateId) => {
                    const artifactPath = `content/releases/evidence/db-migrations/v9.9.0/${environment}/${gateId}.json`;
                    const artifactSource = `${jcsCanonicalize({ gateId, result: "passed" })}\n`;
                    sources.set(artifactPath, artifactSource);
                    return {
                        gateId,
                        status: "passed",
                        artifact: {
                            path: artifactPath,
                            sha256: sha256Hex(artifactSource),
                        },
                    };
                }),
                databaseIdentityDigest: "d".repeat(64),
                startedAt: "2026-07-22T00:00:00.000Z",
                completedAt: "2026-07-22T00:01:00.000Z",
            };
            const signature = sign(
                null,
                Buffer.from(
                    `${payload.domain}\n${jcsCanonicalize(payload)}`,
                    "utf8",
                ),
                privateKey,
            ).toString("base64");
            const source = `${jcsCanonicalize({
                schema: "db-migration-attestation/v2",
                payload,
                signature: {
                    algorithm: "ed25519",
                    keyId: "release-signer",
                    trustEpoch: 1,
                    valueBase64: signature,
                },
            })}\n`;
            sources.set(batch.attestation.path, source);
            batch.attestation.sha256 = sha256Hex(source);
        }

        const result = validateDbMigrationReleaseHistory({
            records: [
                {
                    path: "content/releases/v9.9.0.md",
                    metadata: {
                        schema: "release-metadata/v2",
                        version: "v9.9.0",
                        scopeResults: {
                            "db-migration": { status: "released", evidence },
                        },
                    },
                },
            ],
            bootstrap,
            trustRegistry,
            readEvidence: (evidencePath) => sources.get(evidencePath) ?? null,
        });

        assert.deepEqual(result.errors, []);
        assert.deepEqual(result.states.dev.effectiveTrustedFrontier, [ref]);
        assert.equal(result.states.dev.sequence, 1);
        assert.deepEqual(result.states.prod.effectiveTrustedFrontier, [ref]);

        const rolledBackResult = validateDbMigrationReleaseHistory({
            records: [
                {
                    path: "content/releases/v9.9.0.md",
                    metadata: {
                        schema: "release-metadata/v2",
                        version: "v9.9.0",
                        scopeResults: {
                            "db-migration": {
                                status: "rolled_back",
                                evidence,
                            },
                        },
                    },
                },
            ],
            bootstrap,
            trustRegistry,
            readEvidence: (evidencePath) => sources.get(evidencePath) ?? null,
        });
        assert.deepEqual(rolledBackResult.errors, []);
        assert.deepEqual(
            rolledBackResult.states.prod.effectiveTrustedFrontier,
            [ref],
        );

        const { publicKey: rotatedPublicKey } =
            generateKeyPairSync("ed25519");
        const rotatedTrustRegistry = {
            ...trustRegistry,
            epochs: [
                trustRegistry.epochs[0],
                {
                    schema: "db-migration-trust-epoch/v2",
                    epoch: 2,
                    validFromSequence: 1,
                    validThroughSequence: null,
                    keys: [
                        {
                            keyId: "rotated-prod-signer",
                            algorithm: "ed25519",
                            environments: ["prod"],
                            publicKeyPem: rotatedPublicKey.export({
                                type: "spki",
                                format: "pem",
                            }),
                        },
                    ],
                    proposal: {
                        path: "content/policy/db-migration-trust-proposals/0002-rotated-prod-signer.json",
                        sourceRef: "e".repeat(40),
                        sha256: "f".repeat(64),
                    },
                    activationBaseRef: "e".repeat(40),
                },
            ],
        };
        const reusedKeyIdRegistry = structuredClone(rotatedTrustRegistry);
        reusedKeyIdRegistry.epochs[1].keys[0].keyId = "release-signer";
        assert(
            validateDbMigrationTrustRegistryV2(
                reusedKeyIdRegistry,
                "trustRegistry",
            ).some((error) => /reuses retired trust key ID/.test(error)),
        );
        const reusedPublicKeyRegistry = structuredClone(rotatedTrustRegistry);
        reusedPublicKeyRegistry.epochs[1].keys[0].publicKeyPem =
            trustRegistry.epochs[0].keys[0].publicKeyPem;
        assert(
            validateDbMigrationTrustRegistryV2(
                reusedPublicKeyRegistry,
                "trustRegistry",
            ).some((error) => /reuses retired trust public key/.test(error)),
        );
        const staleEpochResult = validateDbMigrationReleaseHistory({
            records: [
                {
                    path: "content/releases/v9.9.0.md",
                    metadata: {
                        schema: "release-metadata/v2",
                        version: "v9.9.0",
                        scopeResults: {
                            "db-migration": { status: "released", evidence },
                        },
                    },
                },
            ],
            bootstrap,
            trustRegistry: rotatedTrustRegistry,
            readEvidence: (evidencePath) => sources.get(evidencePath) ?? null,
        });
        assert(
            staleEpochResult.errors.some((error) =>
                /highest active trust epoch 2/.test(error),
            ),
        );

        const expiringTrustRegistry = structuredClone(rotatedTrustRegistry);
        expiringTrustRegistry.epochs[1].validFromSequence = 5;
        expiringTrustRegistry.epochs[1].validThroughSequence = 10;
        const expiredEvidence = structuredClone(evidence);
        const expiredSources = new Map(sources);
        const prodBatch = expiredEvidence.plans.prod.batches[0];
        const expiredBundle = JSON.parse(
            expiredSources.get(prodBatch.attestation.path),
        );
        expiredBundle.payload.sequence = 11;
        expiredBundle.signature.valueBase64 = sign(
            null,
            Buffer.from(
                `${expiredBundle.payload.domain}\n${jcsCanonicalize(expiredBundle.payload)}`,
                "utf8",
            ),
            privateKey,
        ).toString("base64");
        const expiredSource = `${jcsCanonicalize(expiredBundle)}\n`;
        expiredSources.set(prodBatch.attestation.path, expiredSource);
        prodBatch.attestation.sha256 = sha256Hex(expiredSource);
        const expiredEpochResult = validateDbMigrationReleaseHistory({
            records: [
                {
                    path: "content/releases/v9.9.0.md",
                    metadata: {
                        schema: "release-metadata/v2",
                        version: "v9.9.0",
                        scopeResults: {
                            "db-migration": {
                                status: "released",
                                evidence: expiredEvidence,
                            },
                        },
                    },
                },
            ],
            bootstrap,
            trustRegistry: expiringTrustRegistry,
            readEvidence: (evidencePath) =>
                expiredSources.get(evidencePath) ?? null,
        });
        assert(
            expiredEpochResult.errors.some((error) =>
                /highest started trust epoch 2 expired at sequence 10/.test(
                    error,
                ),
            ),
        );
    });
});

function buildEvidence({ terminal }) {
    const plans = {};
    for (const environment of ["dev", "prod"]) {
        plans[environment] = {
            operation: "apply",
            targetRefs: [ref],
            batches: [
                {
                    batchId: "expand-1",
                    order: 1,
                    stage: "expand",
                    sqlRefs: [ref],
                    requiredGateIds: [
                        "DBM-GATE-000",
                        "DBM-GATE-100",
                    ],
                    attestation: terminal
                        ? {
                              path: `content/releases/evidence/db-migrations/v9.9.0/${environment}/expand-1.attestation.json`,
                              sha256: "0".repeat(64),
                          }
                        : null,
                },
            ],
        };
    }
    return {
        catalog: {
            repo: "coupler-api",
            sourceRef: "e".repeat(40),
            path: "db/schema/schema-contract.json",
            sha256: "f".repeat(64),
        },
        plans,
        rollbackPlan: terminal
            ? "restore the approved snapshot and runtime ref"
            : null,
    };
}

function emptyBootstrap() {
    return {
        schema: "db-migration-frontier-bootstrap/v2",
        cutoffApiCommit: "e".repeat(40),
        environments: {
            dev: { rawHistoricalFrontier: [], effectiveTrustedFrontier: [] },
            prod: { rawHistoricalFrontier: [], effectiveTrustedFrontier: [] },
        },
        provenance: [
            { environment: "dev", source: "test", acceptedRefs: [] },
            { environment: "prod", source: "test", acceptedRefs: [] },
        ],
    };
}
