import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  deriveReleaseStatusFromScopeResults,
  validateReleaseMetadata,
} from "./release-record-metadata.mjs";
import { createReleaseRecordModel } from "./release-record-model.mjs";
import {
  apiContractCutoverRequiredPaths,
  apiContractCutoverViolationRequiredPaths,
  releaseScopeDescriptors,
} from "./release-schema.mjs";

const version = "v9.9.0";
const apiCommit = "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
const adminCommit = "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb";
const mobileCommit = "cccccccccccccccccccccccccccccccccccccccc";
const submittedCommit = "dddddddddddddddddddddddddddddddddddddddd";
const checksum = "f".repeat(64);

describe("release metadata scope results", () => {
  it("allows pending scope placeholders and derives the deployable pending state", () => {
    const metadata = buildMetadata({
      scopes: ["docs", "coupler-api"],
      statuses: {
        docs: "pending",
        "coupler-api": "pending",
      },
      status: "pending",
    });

    const errors = validate(metadata);

    assert.deepEqual(errors, []);
    assert.equal(deriveReleaseStatusFromScopeResults(metadata), "pending");
  });

  it("derives pending when completed prerequisites are frozen with remaining pending scopes", () => {
    const metadata = buildMetadata({
      scopes: ["docs", "contracts-package", "coupler-api"],
      statuses: {
        docs: "pending",
        "contracts-package": "released",
        "coupler-api": "pending",
      },
      status: "pending",
    });

    assert.deepEqual(validate(metadata), []);
    assert.equal(deriveReleaseStatusFromScopeResults(metadata), "pending");
  });

  it("allows planned scope placeholders", () => {
    const errors = validate(
      buildMetadata({
        scopes: ["docs", "coupler-api"],
        statuses: {
          docs: "planned",
          "coupler-api": "planned",
        },
      }),
    );

    assert.deepEqual(errors, []);
  });

  it("requires document status to match scopeResults derived status", () => {
    const metadata = buildMetadata({
      scopes: ["docs", "coupler-api"],
      statuses: {
        docs: "planned",
        "coupler-api": "released",
      },
      status: "released",
    });

    const errors = validate(metadata);

    assert(
      errors.some((error) => /status must match scopeResults derived status: in_progress/.test(error)),
    );
  });

  it("rejects release-tag as a metadata scope", () => {
    const metadata = buildMetadata({
      scopes: ["docs", "release-tag"],
      statuses: {
        docs: "planned",
        "release-tag": "planned",
      },
    });

    const errors = validate(metadata);

    assert(errors.some((error) => /releaseScopes has unknown scope: release-tag/.test(error)));
  });

  it("requires scopeResults keys to exactly match releaseScopes", () => {
    const metadata = buildMetadata({
      scopes: ["docs", "coupler-api"],
      statuses: {
        docs: "planned",
        "coupler-api": "planned",
      },
    });
    delete metadata.scopeResults["coupler-api"];
    metadata.scopeResults["coupler-admin-web"] = scopeResult("coupler-admin-web", "planned");

    const errors = validate(metadata);

    assert(errors.some((error) => /scopeResults is missing release scope: coupler-api/.test(error)));
    assert(errors.some((error) => /scopeResults has scope not listed in releaseScopes: coupler-admin-web/.test(error)));
  });

  it("requires the docs tag only when docs scope is released", () => {
    const metadata = buildMetadata({
      scopes: ["docs"],
      statuses: {
        docs: "released",
      },
    });
    metadata.versionMapping.docs.tag = null;

    const errors = validate(metadata);

    assert(errors.some((error) => /released docs scope requires docs release tag v9\.9\.0/.test(error)));
  });

  it("requires service release tags from released service scopes, without a release-tag scope", () => {
    const metadata = buildMetadata({
      scopes: ["docs", "coupler-api"],
      statuses: {
        docs: "released",
        "coupler-api": "released",
      },
    });
    metadata.versionMapping["coupler-api"].tag = null;
    metadata.versionMapping["coupler-api"].commit = apiCommit;

    const errors = validate(metadata);

    assert(errors.some((error) => /released coupler-api scope requires coupler-api release tag/.test(error)));
  });

  it("allows a released API with its released contract package while excluded consumers stay empty", () => {
    const metadata = buildMetadata({
      scopes: ["docs", "contracts-package", "coupler-api"],
      statuses: {
        docs: "released",
        "contracts-package": "released",
        "coupler-api": "released",
      },
    });

    const errors = validate(metadata);

    assert.deepEqual(errors, []);
  });

  it("requires a released contracts package for every terminal API scope", () => {
    const metadata = buildMetadata({
      scopes: ["docs", "coupler-api"],
      statuses: {
        docs: "released",
        "coupler-api": "released",
      },
    });

    assert(
      validate(metadata).some((error) =>
        /terminal coupler-api public contract requires a released contracts-package scope/.test(error),
      ),
    );
  });

  it("allows superseded scopes to keep incomplete evidence without completion exceptions", () => {
    const metadata = buildMetadata({
      scopes: ["docs", "mobile-store"],
      statuses: {
        docs: "released",
        "mobile-store": "superseded",
      },
    });
    metadata.scopeResults["mobile-store"] = {
      ...metadata.scopeResults["mobile-store"],
      supersededBy: "v9.9.1",
      incompleteReason: "Store approval and rollout moved to v9.9.1 after this submission",
      tagStatus: "not_created",
    };

    const errors = validate(metadata);

    assert.deepEqual(errors, []);
  });

  it("requires structured replacement fields for superseded scopes", () => {
    const metadata = buildMetadata({
      scopes: ["docs", "mobile-store"],
      statuses: {
        docs: "released",
        "mobile-store": "superseded",
      },
    });

    const errors = validate(metadata);

    assert(errors.some((error) => /scopeResults\.mobile-store\.supersededBy/.test(error)));
    assert(errors.some((error) => /scopeResults\.mobile-store\.incompleteReason/.test(error)));
    assert(errors.some((error) => /scopeResults\.mobile-store\.tagStatus/.test(error)));
  });

  it("requires released contracts package evidence from scopeResults", () => {
    const metadata = buildMetadata({
      scopes: ["docs", "contracts-package", "coupler-api"],
      statuses: {
        docs: "released",
        "contracts-package": "released",
        "coupler-api": "released",
      },
    });
    metadata.scopeResults["contracts-package"].evidence.publishedPackage = null;

    const errors = validate(metadata);

    assert(
      errors.some((error) => /scopeResults\.contracts-package\.evidence\.publishedPackage/.test(error)),
    );
  });

  it("requires released cutover to mirror the contracts package scope result", () => {
    const metadata = buildMetadata({
      scopes: ["docs", "contracts-package"],
      statuses: {
        docs: "released",
        "contracts-package": "released",
      },
      apiContractCutover: releasedApiContractCutover(),
    });
    metadata.scopeResults["contracts-package"].evidence.publishedPackage = "pending";

    const errors = validate(metadata);

    assert(
      errors.some((error) => /scopeResults\.contracts-package\.evidence\.publishedPackage must equal/.test(error)),
    );
  });

  it("rejects released cutover N/A evidence and non-SHA API refs", () => {
    const metadata = buildMetadata({
      scopes: ["docs", "contracts-package", "coupler-api"],
      statuses: {
        docs: "released",
        "contracts-package": "released",
        "coupler-api": "released",
      },
      apiContractCutover: releasedApiContractCutover(),
    });
    metadata.scopeResults["coupler-api"].evidence.publicContract.apiRefs.current = "main";
    metadata.apiContractCutover.contractArtifactSync.command = "N/A - no command";

    const errors = validate(metadata);

    assert(
      errors.some((error) => /publicContract\.apiRefs\.current must be a commit SHA/.test(error)),
    );
    assert(
      errors.some((error) => /apiContractCutover\.contractArtifactSync\.command must be concrete evidence, not an N\/A reason/.test(error)),
    );
  });

  it("requires released cutover concrete evidence before the whole release is terminal", () => {
    const metadata = buildMetadata({
      scopes: ["docs", "contracts-package", "coupler-api"],
      statuses: {
        docs: "planned",
        "contracts-package": "released",
        "coupler-api": "released",
      },
      apiContractCutover: releasedApiContractCutover(),
    });
    metadata.apiContractCutover.activation.barrierEvidence = "N/A - no barrier evidence";

    const errors = validate(metadata);

    assert(
      errors.some((error) => /apiContractCutover\.activation\.barrierEvidence must be concrete evidence, not an N\/A reason/.test(error)),
    );
  });

  it("closes a post-deploy cutover violation without fabricating missing pre-deploy cases", () => {
    const metadata = buildMetadata({
      scopes: ["docs", "contracts-package", "coupler-api"],
      statuses: {
        docs: "released",
        "contracts-package": "released",
        "coupler-api": "released",
      },
      apiContractCutover: violatedApiContractCutover(),
    });
    metadata.scopeResults["coupler-api"].evidence.publicContract = null;

    assert.deepEqual(validate(metadata), []);
  });

  it("does not let the violation disposition weaken a normal released cutover", () => {
    const metadata = buildMetadata({
      scopes: ["docs", "contracts-package", "coupler-api"],
      statuses: {
        docs: "released",
        "contracts-package": "released",
        "coupler-api": "released",
      },
      apiContractCutover: releasedApiContractCutover(),
    });
    metadata.scopeResults["coupler-api"].evidence.publicContract = null;

    assert(
      validate(metadata).some((error) =>
        /publicContract must be an object/.test(error),
      ),
    );
  });

  it("requires violated cutover to use violation-specific evidence instead of public contract cases", () => {
    const metadata = buildMetadata({
      scopes: ["docs", "contracts-package", "coupler-api"],
      statuses: {
        docs: "released",
        "contracts-package": "released",
        "coupler-api": "released",
      },
      apiContractCutover: violatedApiContractCutover(),
    });

    assert(
      validate(metadata).some((error) =>
        /violated apiContractCutover requires scopeResults\.coupler-api\.evidence\.publicContract null/.test(error),
      ),
    );
  });

  it("rejects false-pass fixtures across every violated cutover evidence field", () => {
    for (const pathParts of apiContractCutoverViolationRequiredPaths) {
      const fieldPath = pathParts.join(".");
      const fixtureValue = pathParts.at(-1) === "failedRequirements" ||
        pathParts.at(-1) === "affectedConsumerRefs"
        ? ["pending"]
        : "pending";
      const metadata = buildMetadata({
        scopes: ["docs", "contracts-package", "coupler-api"],
        statuses: {
          docs: "released",
          "contracts-package": "released",
          "coupler-api": "released",
        },
        apiContractCutover: violatedApiContractCutover(),
      });
      metadata.scopeResults["coupler-api"].evidence.publicContract = null;
      setNestedValue(metadata, pathParts, fixtureValue);

      const errors = validate(metadata);

      assert(
        errors.some((error) => error.includes(fieldPath)),
        `expected violated ${fieldPath} fixture to fail, got:\n${errors.join("\n")}`,
      );
    }
  });

  it("rejects affected consumer refs without an exact source and interface", () => {
    const metadata = buildMetadata({
      scopes: ["docs", "contracts-package", "coupler-api"],
      statuses: {
        docs: "released",
        "contracts-package": "released",
        "coupler-api": "released",
      },
      apiContractCutover: violatedApiContractCutover(),
    });
    metadata.scopeResults["coupler-api"].evidence.publicContract = null;
    metadata.apiContractCutover.violation.affectedConsumerRefs = [
      "previous-store@unknown:bootstrap",
    ];

    assert(
      validate(metadata).some((error) =>
        /affectedConsumerRefs\.0 must use consumer-id@commit-sha:interface/.test(error),
      ),
    );
  });

  it("rejects normal activation fields on a violated cutover", () => {
    const metadata = buildMetadata({
      scopes: ["docs", "contracts-package", "coupler-api"],
      statuses: {
        docs: "released",
        "contracts-package": "released",
        "coupler-api": "released",
      },
      apiContractCutover: violatedApiContractCutover(),
    });
    metadata.scopeResults["coupler-api"].evidence.publicContract = null;
    metadata.apiContractCutover.activation = releasedApiContractCutover().activation;

    assert(
      validate(metadata).some((error) =>
        /apiContractCutover has unknown key: activation/.test(error),
      ),
    );
  });

  it("rejects false-pass fixtures across every released cutover field", () => {
    for (const pathParts of apiContractCutoverRequiredPaths) {
      const fieldPath = pathParts.join(".");
      const fixtures = pathParts.at(-1) === "caseIds"
        ? [[], ["pending"]]
        : ["N/A - fixture should not satisfy terminal evidence", "pending"];

      for (const fixtureValue of fixtures) {
        const metadata = buildMetadata({
          scopes: ["docs", "contracts-package", "coupler-api"],
          statuses: {
            docs: "released",
            "contracts-package": "released",
            "coupler-api": "released",
          },
          apiContractCutover: releasedApiContractCutover(),
        });

        setNestedValue(metadata, pathParts, fixtureValue);

        const errors = validate(metadata);

        assert(
          errors.some((error) => error.includes(fieldPath)),
          `expected ${fieldPath} fixture ${fixtureValue} to fail, got:\n${errors.join("\n")}`,
        );
      }
    }
  });

  it("rejects false-pass fixtures across every rollback cutover field", () => {
    for (const pathParts of apiContractCutoverRequiredPaths) {
      const fieldPath = pathParts.join(".");
      const fixtures = pathParts.at(-1) === "caseIds"
        ? [[], ["pending"]]
        : ["N/A - fixture should not satisfy terminal evidence", "pending"];

      for (const fixtureValue of fixtures) {
        const metadata = buildMetadata({
          scopes: ["docs", "contracts-package", "coupler-api"],
          statuses: {
            docs: "released",
            "contracts-package": "rolled_back",
            "coupler-api": "rolled_back",
          },
          apiContractCutover: rollbackApiContractCutover(),
        });

        setNestedValue(metadata, pathParts, fixtureValue);

        const errors = validate(metadata);

        assert(
          errors.some((error) => error.includes(fieldPath)),
          `expected rollback ${fieldPath} fixture ${fixtureValue} to fail, got:\n${errors.join("\n")}`,
        );
      }
    }
  });

  it("requires rolled_back API scope to use rollback cutover status", () => {
    const metadata = buildMetadata({
      scopes: ["docs", "contracts-package", "coupler-api"],
      statuses: {
        docs: "released",
        "contracts-package": "rolled_back",
        "coupler-api": "rolled_back",
      },
      apiContractCutover: releasedApiContractCutover(),
    });

    const errors = validate(metadata);

    assert(
      errors.some((error) => /rolled_back coupler-api scope requires apiContractCutover\.status rollback/.test(error)),
    );
  });

  it("requires every supported previous consumer interface to succeed when API cutover is No", () => {
    const metadata = buildMetadata({
      scopes: ["docs", "contracts-package", "coupler-api"],
      statuses: {
        docs: "released",
        "contracts-package": "released",
        "coupler-api": "released",
      },
    });
    metadata.scopeResults["coupler-api"].evidence.publicContract.cases.find(
      ({ id }) => id === "previous-store-rest-current-api",
    ).expected = "deterministic-rejection";

    const errors = validate(metadata);

    assert(
      errors.some((error) =>
        /publicContract\.cases requires success for previous-store:rest/.test(error),
      ),
    );
  });

  it("keeps previous mobile bootstrap and version readable during API cutover", () => {
    const metadata = buildMetadata({
      scopes: ["docs", "contracts-package", "coupler-api"],
      statuses: {
        docs: "released",
        "contracts-package": "released",
        "coupler-api": "released",
      },
      apiContractCutover: releasedApiContractCutover(),
    });
    metadata.scopeResults["coupler-api"].evidence.publicContract.cases.find(
      ({ id }) => id === "previous-store-bootstrap-current-api",
    ).expected = "deterministic-rejection";

    const errors = validate(metadata);

    assert(
      errors.some((error) =>
        /old-readable bootstrap\/version success for previous-store:bootstrap/.test(error),
      ),
    );
  });

  it("requires API cutover to identify at least one incompatible previous-consumer request", () => {
    const metadata = buildMetadata({
      scopes: ["docs", "contracts-package", "coupler-api"],
      statuses: {
        docs: "released",
        "contracts-package": "released",
        "coupler-api": "released",
      },
      apiContractCutover: releasedApiContractCutover(),
    });
    for (const contractCase of metadata.scopeResults["coupler-api"].evidence.publicContract.cases) {
      contractCase.expected = "success";
    }

    assert(
      validate(metadata).some((error) =>
        /API cutover requires a deterministic previous-consumer rejection case/.test(error),
      ),
    );
  });

  it("requires API cutover activation evidence to include the selected previous-consumer rejection", () => {
    const metadata = buildMetadata({
      scopes: ["docs", "contracts-package", "coupler-api"],
      statuses: {
        docs: "released",
        "contracts-package": "released",
        "coupler-api": "released",
      },
      apiContractCutover: releasedApiContractCutover(),
    });
    metadata.apiContractCutover.activation.caseIds = [
      "previous-store-bootstrap-current-api",
    ];

    assert(
      validate(metadata).some((error) =>
        /activation\.caseIds must include a deterministic previous-consumer rejection/.test(error),
      ),
    );
  });

  it("allows rollout and activation cases for one interface but restricts client rollback ownership", () => {
    const metadata = buildMetadata({
      scopes: ["docs", "contracts-package", "coupler-api"],
      statuses: {
        docs: "released",
        "contracts-package": "released",
        "coupler-api": "released",
      },
      apiContractCutover: releasedApiContractCutover(),
    });
    const publicContract =
      metadata.scopeResults["coupler-api"].evidence.publicContract;
    publicContract.cases.push({
      id: "previous-store-rest-current-api-rollout",
      consumerId: "previous-store",
      interface: "rest",
      apiGeneration: "current",
      exposure: "rollout",
      expected: "success",
      evidence: "previous Store REST succeeded before activation",
    });
    assert.deepEqual(validate(metadata), []);

    publicContract.cases.push({
      id: "current-store-rest-current-api-rollback",
      consumerId: "current-store",
      interface: "rest",
      apiGeneration: "current",
      exposure: "rollback",
      expected: "success",
      evidence: "current Store REST rollback probe",
    });
    metadata.apiContractCutover.rollback.caseIds = [
      "current-store-rest-current-api-rollback",
    ];
    assert(
      validate(metadata).some((error) =>
        /rollback\.caseIds must reference successful previous-consumer\/current-API/.test(error),
      ),
    );
  });

  it("rejects malformed contract arrays without throwing the validator", () => {
    const metadata = buildMetadata({
      scopes: ["docs", "contracts-package", "coupler-api"],
      statuses: {
        docs: "released",
        "contracts-package": "released",
        "coupler-api": "released",
      },
      apiContractCutover: releasedApiContractCutover(),
    });
    metadata.scopeResults["coupler-api"].evidence.publicContract.consumers[0].interfaces = {};
    metadata.apiContractCutover.activation.caseIds = {};

    const errors = validate(metadata);

    assert(
      errors.some((error) =>
        /publicContract\.consumers\.0\.interfaces must be an array/.test(error),
      ),
    );
    assert(
      errors.some((error) =>
        /apiContractCutover\.activation\.caseIds must be an array/.test(error),
      ),
    );

    const malformedScopes = buildMetadata({
      scopes: ["docs", "contracts-package", "coupler-api"],
      statuses: {
        docs: "released",
        "contracts-package": "released",
        "coupler-api": "released",
      },
      apiContractCutover: releasedApiContractCutover(),
    });
    malformedScopes.releaseScopes = {};
    assert.doesNotThrow(() => validate(malformedScopes));
    assert(
      validate(malformedScopes).some((error) =>
        /releaseScopes must be an array/.test(error),
      ),
    );
  });

  it("binds terminal API, contract, consumer artifact, and interface refs to their SoT", () => {
    const metadata = buildMetadata({
      scopes: ["docs", "contracts-package", "coupler-api"],
      statuses: {
        docs: "released",
        "contracts-package": "released",
        "coupler-api": "released",
      },
    });
    const publicContract =
      metadata.scopeResults["coupler-api"].evidence.publicContract;

    publicContract.apiRefs.current = "e".repeat(40);
    publicContract.apiRefs.previous = "d".repeat(7);
    publicContract.contractRefs.previous = "old-contract";
    publicContract.consumers.find(
      ({ id }) => id === "current-store",
    ).contractRef = "@coupler-developer/coupler-api-contracts@9.8.0";
    publicContract.consumers.find(
      ({ id }) => id === "previous-store",
    ).interfaces = ["rest", "version"];
    publicContract.consumers.find(
      ({ id }) => id === "previous-admin",
    ).interfaceInventoryEvidence = "pending";
    publicContract.consumers.find(
      ({ id }) => id === "current-admin",
    ).artifact.artifactRef = "e".repeat(40);
    publicContract.consumers.find(
      ({ id }) => id === "current-store",
    ).artifact.mappingRef = "pending";
    publicContract.consumers.find(
      ({ id }) => id === "previous-nextpush",
    ).artifact.ios.label = "N/A";
    publicContract.consumers.find(
      ({ id }) => id === "current-nextpush",
    ).absenceEvidence = "pending";
    publicContract.consumers.find(
      ({ id }) => id === "previous-admin",
    ).artifact.artifactRef = "b".repeat(7);
    metadata.scopeResults["contracts-package"].evidence.sourceRef =
      `coupler-api ${apiCommit}`;
    metadata.scopeResults["contracts-package"].evidence.publishedPackage =
      "workflow output @coupler-developer/coupler-api-contracts@9.9.0 passed";

    const errors = validate(metadata);
    assert(
      errors.some((error) =>
        /apiRefs\.current must exactly match versionMapping\.coupler-api\.commit/.test(error),
      ),
    );
    assert(
      errors.some((error) =>
        /apiRefs\.previous must be a commit SHA/.test(error),
      ),
    );
    assert(
      errors.some((error) =>
        /contractRefs\.previous must be a canonical contracts package\/version/.test(error),
      ),
    );
    assert(
      errors.some((error) =>
        /consumers\.1\.contractRef must match publicContract\.contractRefs\.current/.test(error),
      ),
    );
    assert(
      errors.some((error) =>
        /consumers\.0\.interfaces must include rest, bootstrap, version/.test(error),
      ),
    );
    assert(
      errors.some((error) =>
        /consumers\.4\.interfaceInventoryEvidence must be concrete evidence/.test(error),
      ),
    );
    assert(
      errors.some((error) =>
        /consumers\.5\.artifact\.artifactRef must match versionMapping\.coupler-admin-web\.commit/.test(error),
      ),
    );
    assert(
      errors.some((error) =>
        /contracts-package evidence .*sourceRef must be a full 40-character commit SHA/.test(error),
      ),
    );
    assert(
      errors.some((error) =>
        /publishedPackage must equal @coupler-developer\/coupler-api-contracts@x\.y\.z/.test(error),
      ),
    );
    assert(
      errors.some((error) =>
        /artifact\.mappingRef must be concrete evidence/.test(error),
      ),
    );
    assert(
      errors.some((error) =>
        /artifact\.ios\.label must be concrete evidence/.test(error),
      ),
    );
    assert(
      errors.some((error) =>
        /absenceEvidence must be concrete evidence/.test(error),
      ),
    );
    assert(
      errors.some((error) =>
        /admin-build full commit SHA artifactRef/.test(error),
      ),
    );
  });

  it("accepts a historical package source only when its contracts tree matches the release source", () => {
    const metadata = buildMetadata({
      scopes: ["docs", "contracts-package", "coupler-api"],
      statuses: {
        docs: "released",
        "contracts-package": "released",
        "coupler-api": "released",
      },
    });
    metadata.scopeResults["contracts-package"].evidence.sourceRef = "d".repeat(40);
    metadata.scopeResults["contracts-package"].evidence.sourceTree = {
      path: "packages/contracts",
      publishedSourceTree: "e".repeat(40),
      releaseSourceTree: "e".repeat(40),
    };

    assert.deepEqual(validate(metadata), []);

    metadata.scopeResults["contracts-package"].evidence.sourceTree.releaseSourceTree =
      "f".repeat(40);
    assert(
      validate(metadata).some((error) =>
        /must prove identical published and release contracts trees/.test(error),
      ),
    );
  });

  it("requires terminal current Store and Admin mappings instead of skipping null bindings", () => {
    const metadata = buildMetadata({
      scopes: ["docs", "contracts-package", "coupler-api"],
      statuses: {
        docs: "released",
        "contracts-package": "released",
        "coupler-api": "released",
      },
    });
    metadata.versionMapping["coupler-mobile-app"].store = null;
    metadata.versionMapping["coupler-admin-web"].commit = null;

    const errors = validate(metadata);

    assert(
      errors.some((error) =>
        /current mobile-store consumer requires versionMapping\.coupler-mobile-app\.store/.test(
          error,
        ),
      ),
    );
    assert(
      errors.some((error) =>
        /current admin consumer requires versionMapping\.coupler-admin-web\.commit/.test(
          error,
        ),
      ),
    );
  });

  it("accepts artifact-specific previous contract refs and actual historical interface inventories", () => {
    const metadata = buildMetadata({
      scopes: ["docs", "contracts-package", "coupler-api"],
      statuses: {
        docs: "released",
        "contracts-package": "released",
        "coupler-api": "released",
      },
    });
    const consumers =
      metadata.scopeResults["coupler-api"].evidence.publicContract.consumers;
    const previousStore = consumers.find(({ id }) => id === "previous-store");
    const previousAdmin = consumers.find(({ id }) => id === "previous-admin");

    previousStore.contractRef =
      "coupler-mobile-app@1111111111111111111111111111111111111111 local wire contract";
    previousStore.interfaces = ["rest", "bootstrap", "version"];
    previousAdmin.interfaces = ["rest"];

    assert.deepEqual(validate(metadata), []);
  });

  it("keeps the minimum mobile and Admin interfaces fail-closed", () => {
    const metadata = buildMetadata({
      scopes: ["docs", "contracts-package", "coupler-api"],
      statuses: {
        docs: "released",
        "contracts-package": "released",
        "coupler-api": "released",
      },
    });
    const consumers =
      metadata.scopeResults["coupler-api"].evidence.publicContract.consumers;
    consumers.find(({ id }) => id === "previous-store").interfaces = [
      "rest",
      "version",
    ];
    consumers.find(({ id }) => id === "previous-admin").interfaces = [
      "websocket",
    ];

    const errors = validate(metadata);
    assert(
      errors.some((error) =>
        /consumers\.0\.interfaces must include rest, bootstrap, version/.test(
          error,
        ),
      ),
    );
    assert(
      errors.some((error) =>
        /consumers\.4\.interfaces must include rest/.test(error),
      ),
    );
  });

  it("requires exactly one consumer for each surface and generation", () => {
    const metadata = buildMetadata({
      scopes: ["docs", "coupler-api"],
      statuses: {
        docs: "released",
        "coupler-api": "released",
      },
    });
    const consumers =
      metadata.scopeResults["coupler-api"].evidence.publicContract.consumers;
    consumers.push({
      ...structuredClone(consumers.find(({ id }) => id === "current-store")),
      id: "duplicate-current-store",
    });

    assert(
      validate(metadata).some((error) =>
        /must contain exactly one mobile-store:current/.test(error),
      ),
    );
  });

  it("allows previous-release runtime recovery only with exact successful previous-API rollback coverage", () => {
    const metadata = buildMetadata({
      scopes: ["docs", "contracts-package", "coupler-api"],
      statuses: {
        docs: "released",
        "contracts-package": "released",
        "coupler-api": "released",
      },
    });
    const apiEvidence = metadata.scopeResults["coupler-api"].evidence;
    apiEvidence.runtimeRecovery = {
      strategy: "previous-release",
      stateSafety: {
        source: "application-evidence",
        persistedState: "previous runtime reads every accepted current row",
        queuedState: "cursor and in-flight work are replayable by the previous runtime",
        externalEffects: "idempotency and sink reconciliation passed",
      },
      previousReleaseCaseIds: ["previous-api-rollback"],
    };

    assert(
      validate(metadata).some((error) =>
        /requires exact successful previous-API rollback coverage/.test(error),
      ),
    );

    const rollbackCases = apiEvidence.publicContract.consumers
      .filter(({ state }) => state === "present")
      .flatMap((consumer) =>
      consumer.interfaces.map((interfaceName) => ({
        id: `${consumer.id}-${interfaceName}-previous-api-rollback`,
        consumerId: consumer.id,
        interface: interfaceName,
        apiGeneration: "previous",
        exposure: "rollback",
        expected: "success",
        evidence: `${consumer.id} ${interfaceName} succeeded against the previous API and final persisted state`,
      })),
      );
    apiEvidence.publicContract.cases.push(...rollbackCases);
    apiEvidence.runtimeRecovery.previousReleaseCaseIds = rollbackCases.map(
      (contractCase) => contractCase.id,
    );

    assert.deepEqual(validate(metadata), []);
  });

  it("requires DB-backed runtime recovery evidence to reference an included DB migration scope", () => {
    const metadata = buildMetadata({
      scopes: ["docs", "coupler-api"],
      statuses: {
        docs: "released",
        "coupler-api": "released",
      },
    });
    metadata.scopeResults["coupler-api"].evidence.runtimeRecovery.stateSafety = {
      source: "db-maintenance-execution",
      scope: "db-migration",
    };

    assert(
      validate(metadata).some((error) =>
        /stateSafety must reference an included db-migration scope/.test(error),
      ),
    );
  });

  it("does not accept a pending DB execution as terminal API recovery evidence", () => {
    const metadata = buildMetadata({
      scopes: ["docs", "db-migration", "coupler-api"],
      statuses: {
        docs: "released",
        "db-migration": "pending",
        "coupler-api": "released",
      },
    });
    metadata.scopeResults["coupler-api"].evidence.runtimeRecovery.stateSafety = {
      source: "db-maintenance-execution",
      scope: "db-migration",
    };

    assert(
      validate(metadata).some((error) =>
        /requires a terminal canonical prod DB maintenance execution/.test(error),
      ),
    );
  });

  it("does not accept violation evidence as terminal API recovery state safety", () => {
    const metadata = buildMetadata({
      scopes: ["docs", "contracts-package", "db-migration", "coupler-api"],
      statuses: {
        docs: "released",
        "contracts-package": "released",
        "db-migration": "released",
        "coupler-api": "released",
      },
    });
    metadata.scopeResults["db-migration"].evidence = {
      schema: "db-migration-maintenance-evidence/v1",
      kind: "violation",
      violation: {},
    };
    metadata.scopeResults["coupler-api"].evidence.runtimeRecovery.stateSafety = {
      source: "db-maintenance-execution",
      scope: "db-migration",
    };

    assert(
      validate(metadata).some((error) =>
        /requires a terminal canonical prod DB maintenance execution/.test(error),
      ),
    );
  });

  it("does not accept violation evidence as non-terminal API recovery state safety", () => {
    const metadata = buildMetadata({
      scopes: ["docs", "contracts-package", "db-migration", "coupler-api"],
      statuses: {
        docs: "in_progress",
        "contracts-package": "released",
        "db-migration": "released",
        "coupler-api": "in_progress",
      },
      status: "in_progress",
    });
    metadata.scopeResults["db-migration"].evidence = {
      schema: "db-migration-maintenance-evidence/v1",
      kind: "violation",
      violation: {},
    };
    metadata.scopeResults["coupler-api"].evidence.runtimeRecovery = {
      strategy: "forward-fix",
      stateSafety: {
        source: "db-maintenance-execution",
        scope: "db-migration",
      },
      previousReleaseCaseIds: [],
    };

    assert(
      validate(metadata).some((error) =>
        /requires a terminal canonical prod DB maintenance execution/.test(error),
      ),
    );
  });

  it("binds cutover terminal state to the API scope, not an unrelated rollback", () => {
    const metadata = buildMetadata({
      scopes: ["docs", "contracts-package", "coupler-api"],
      statuses: {
        docs: "released",
        "contracts-package": "rolled_back",
        "coupler-api": "released",
      },
      apiContractCutover: releasedApiContractCutover(),
    });
    assert(
      !validate(metadata).some((error) =>
        /coupler-api scope requires apiContractCutover\.status rollback/.test(error),
      ),
    );

    metadata.apiContractCutover = rollbackApiContractCutover();
    assert(
      validate(metadata).some((error) =>
        /rollback requires scopeResults\.coupler-api\.status rolled_back/.test(error),
      ),
    );

    const pendingApi = buildMetadata({
      scopes: ["docs", "contracts-package", "coupler-api"],
      statuses: {
        docs: "pending",
        "contracts-package": "released",
        "coupler-api": "pending",
      },
      apiContractCutover: releasedApiContractCutover(),
    });
    assert(
      validate(pendingApi).some((error) =>
        /status released requires scopeResults\.coupler-api\.status released/.test(error),
      ),
    );

    const pendingPackage = buildMetadata({
      scopes: ["docs", "contracts-package", "coupler-api"],
      statuses: {
        docs: "pending",
        "contracts-package": "pending",
        "coupler-api": "released",
      },
      apiContractCutover: releasedApiContractCutover(),
    });
    assert(
      validate(pendingPackage).some((error) =>
        /terminal apiContractCutover requires scopeResults\.contracts-package\.status released/.test(error),
      ),
    );
  });

  it("rejects false-pass fixtures across every scope terminal evidence descriptor", () => {
    for (const [scopeName, descriptor] of Object.entries(releaseScopeDescriptors)) {
      if (scopeName === "db-migration") {
        continue;
      }
      for (const evidence of descriptor.releasedEvidence ?? []) {
        assertTerminalEvidencePathRejectsFixtures(scopeName, "released", evidence.metadataPath);
      }

      for (const evidence of descriptor.rollbackEvidence ?? []) {
        assertTerminalEvidencePathRejectsFixtures(scopeName, "rolled_back", evidence.metadataPath);
      }
    }
  });

  it("requires release tags for every released scope descriptor that declares a tag repo", () => {
    for (const [scopeName, descriptor] of Object.entries(releaseScopeDescriptors)) {
      if (!descriptor.releaseTagRepo) {
        continue;
      }

      const scopes = scopeName === "docs" ? ["docs"] : ["docs", scopeName];
      const statuses = Object.fromEntries(scopes.map((name) => [name, "released"]));
      const metadata = buildMetadata({
        scopes,
        statuses,
      });
      const repoMapping = metadata.versionMapping[descriptor.releaseTagRepo];
      const fieldName = descriptor.releaseTagRepo === "coupler-mobile-app" ? "releaseTag" : "tag";
      repoMapping[fieldName] = null;

      const errors = validate(metadata);

      assert(
        errors.some((error) => /release tag/.test(error)),
        `expected released ${scopeName} missing ${descriptor.releaseTagRepo}.${fieldName} to fail, got:\n${errors.join("\n")}`,
      );
    }
  });

  it("rejects unknown keys on every release metadata object path", () => {
    const metadata = buildMetadata({
      scopes: [
        "docs",
        "contracts-package",
        "coupler-api",
        "coupler-admin-web",
        "mobile-store",
        "mobile-nextpush",
      ],
      statuses: {
        docs: "released",
        "contracts-package": "released",
        "coupler-api": "released",
        "coupler-admin-web": "released",
        "mobile-store": "released",
        "mobile-nextpush": "released",
      },
      apiContractCutover: releasedApiContractCutover(),
    });

    assert.deepEqual(validate(metadata), []);

    for (const pathParts of collectObjectPaths(metadata)) {
      const candidate = cloneMetadata(metadata);
      const target = getNestedObject(candidate, pathParts);
      target.__unexpected = "fixture should not be accepted";

      const errors = validate(candidate);

      assert(
        errors.some((error) => error.includes("__unexpected")),
        `expected unknown key at ${pathParts.join(".") || "<root>"} to fail, got:\n${errors.join("\n")}`,
      );
    }
  });

  it("allows new maintenance DB migration records with one terminal prod root pair", () => {
    const metadata = buildMetadata({
      scopes: ["docs", "db-migration"],
      statuses: {
        docs: "released",
        "db-migration": "released",
      },
    });
    assert.deepEqual(validate(metadata), []);
  });

  it("rejects DB migration artifact aliases, extra evidence, and byte digest mismatch", () => {
    const metadata = buildMetadata({
      scopes: ["docs", "db-migration"],
      statuses: {
        docs: "released",
        "db-migration": "released",
      },
    });
    metadata.scopeResults["db-migration"].evidence.plan.path =
      `content/releases/evidence/db-migrations/${version}/dev/../dev/plan.json`;
    metadata.scopeResults["db-migration"].evidence.extra = {
      path: "extra",
      sha256: checksum,
    };

    const validationErrors = validate(metadata, {
      readArtifact: () => Buffer.from("different bytes\n"),
    });
    assert(
      validationErrors.some((error) => /evidence\.plan\.path must be/.test(error)),
    );
    assert(
      validationErrors.some((error) => /evidence has unknown key: extra/.test(error)),
    );
    assert(
      validationErrors.some((error) => /sha256 does not match artifact bytes/.test(error)),
    );
  });

  it("allows a planned or completed dev root while pending and requires prod execution at terminal status", () => {
    const pendingMetadata = buildMetadata({
      scopes: ["docs", "db-migration"],
      statuses: {
        docs: "pending",
        "db-migration": "pending",
      },
      status: "pending",
    });
    assert.deepEqual(validate(pendingMetadata), []);

    pendingMetadata.scopeResults["db-migration"].evidence.execution =
      maintenanceArtifactRef("dev", "execution.jsonl");
    assert.deepEqual(validate(pendingMetadata), []);

    pendingMetadata.scopeResults["db-migration"].evidence.plan = null;
    assert(
      validate(pendingMetadata).some((error) =>
        /evidence\.plan must be an artifact reference/.test(error),
      ),
    );

    const releasedMetadata = buildMetadata({
      scopes: ["docs", "db-migration"],
      statuses: {
        docs: "released",
        "db-migration": "released",
      },
    });
    releasedMetadata.scopeResults["db-migration"].evidence.execution = null;
    assert(
      validate(releasedMetadata).some((error) =>
        /evidence\.execution must be an artifact reference/.test(error),
      ),
    );
  });

  it("requires an in-progress DB scope to advance its root to the prod plan", () => {
    const inProgressMetadata = buildMetadata({
      scopes: ["docs", "db-migration"],
      statuses: {
        docs: "in_progress",
        "db-migration": "in_progress",
      },
      status: "in_progress",
    });
    assert.deepEqual(validate(inProgressMetadata), []);

    const evidence = inProgressMetadata.scopeResults["db-migration"].evidence;
    evidence.plan = maintenanceArtifactRef("dev", "plan.json");
    assert(
      validate(inProgressMetadata).some((error) =>
        /evidence\.plan\.path must be .*prod\/plan\.json/.test(error),
      ),
    );
  });

  it("derives coupler-api preflight repo for maintenance DB migration evidence", () => {
    const metadata = buildMetadata({
      scopes: ["docs", "db-migration"],
      statuses: {
        docs: "released",
        "db-migration": "released",
      },
    });

    const model = createReleaseRecordModel(metadata);
    assert.deepEqual([...model.preflightRepoNames], ["docs", "coupler-api"]);
  });

  it("requires released Mobile Store submitted marker evidence and deletion evidence", () => {
    const metadata = buildMetadata({
      scopes: ["docs", "mobile-store"],
      statuses: {
        docs: "released",
        "mobile-store": "released",
      },
    });
    metadata.scopeResults["mobile-store"].evidence.submittedMarkers[0].deletedEvidence = "pending";

    const errors = validate(metadata);

    assert(
      errors.some((error) => /submittedMarkers\.0\.deletedEvidence must be concrete evidence/.test(error)),
    );
  });

  it("allows released Mobile NextPush without a mobile release tag", () => {
    const metadata = buildMetadata({
      scopes: ["docs", "mobile-nextpush"],
      statuses: {
        docs: "released",
        "mobile-nextpush": "released",
      },
    });
    metadata.versionMapping["coupler-mobile-app"].releaseTag = null;

    const errors = validate(metadata);

    assert.deepEqual(errors, []);
  });

  it("requires concrete NextPush evidence when Mobile NextPush is released", () => {
    const metadata = buildMetadata({
      scopes: ["docs", "mobile-nextpush"],
      statuses: {
        docs: "released",
        "mobile-nextpush": "released",
      },
    });
    metadata.scopeResults["mobile-nextpush"].evidence.rollout = "pending";

    const errors = validate(metadata);

    assert(
      errors.some((error) => /mobile-nextpush evidence scopeResults\.mobile-nextpush\.evidence\.rollout/.test(error)),
    );
  });

  it("requires rollbackReason for rolled_back scope results", () => {
    const metadata = buildMetadata({
      scopes: ["docs", "coupler-api"],
      statuses: {
        docs: "released",
        "coupler-api": "rolled_back",
      },
    });
    delete metadata.scopeResults["coupler-api"].rollbackReason;

    const errors = validate(metadata);

    assert(errors.some((error) => /scopeResults\.coupler-api\.rollbackReason/.test(error)));
  });

  it("requires concrete fallback rollback evidence when a scope has no rollback descriptor", () => {
    const metadata = buildMetadata({
      scopes: ["docs", "contracts-package"],
      statuses: {
        docs: "released",
        "contracts-package": "rolled_back",
      },
    });
    metadata.scopeResults["contracts-package"].rollbackEvidence = "pending";

    const errors = validate(metadata);

    assert(
      errors.some((error) =>
        /scopeResults\.contracts-package\.rollbackEvidence/.test(error),
      ),
    );
  });

  it("rejects preview contracts packages as terminal stable evidence", () => {
    const metadata = buildMetadata({
      scopes: ["docs", "contracts-package", "coupler-api"],
      statuses: {
        docs: "released",
        "contracts-package": "released",
        "coupler-api": "released",
      },
    });
    metadata.scopeResults["contracts-package"].evidence.publishedPackage =
      "@coupler-developer/coupler-api-contracts@9.9.0-pr.42";
    metadata.scopeResults["coupler-api"].evidence.publicContract.contractRefs.current =
      "@coupler-developer/coupler-api-contracts@9.9.0-pr.42";

    const errors = validate(metadata);

    assert(
      errors.some((error) =>
        /publishedPackage must equal @coupler-developer\/coupler-api-contracts@x\.y\.z/.test(
          error,
        ),
      ),
    );
  });

  it("derives release status from scope results", () => {
    const metadata = buildMetadata({
      scopes: ["docs", "coupler-api", "coupler-admin-web"],
      statuses: {
        docs: "released",
        "coupler-api": "released",
        "coupler-admin-web": "planned",
      },
    });

    assert.equal(deriveReleaseStatusFromScopeResults(metadata), "in_progress");
  });

  it("keeps a partially rolled back release active until every remaining scope is terminal", () => {
    const metadata = buildMetadata({
      scopes: ["docs", "coupler-api"],
      statuses: {
        docs: "pending",
        "coupler-api": "rolled_back",
      },
      status: "rolled_back",
    });

    assert.equal(deriveReleaseStatusFromScopeResults(metadata), "in_progress");
    assert(
      validate(metadata).some((error) =>
        /status must match scopeResults derived status: in_progress/.test(error),
      ),
    );
  });
});

function validate(metadata, options) {
  const errors = [];
  validateReleaseMetadata(
    metadata,
    "content/releases/v9.9.0.md",
    version,
    errors,
    options,
  );

  return errors;
}

function assertTerminalEvidencePathRejectsFixtures(scopeName, status, pathParts) {
  const scopes = scopeName === "docs" ? ["docs"] : ["docs", scopeName];
  const statuses = Object.fromEntries(
    scopes.map((name) => [name, name === scopeName ? status : "released"]),
  );
  const fieldPath = pathParts.join(".");
  const fixtureValues = [
    "N/A - fixture should not satisfy terminal evidence",
    "pending",
  ];

  for (const fixtureValue of fixtureValues) {
    const metadata = buildMetadata({
      scopes,
      statuses,
    });

    setNestedValue(metadata, pathParts, fixtureValue);

    const errors = validate(metadata);

    assert(
      errors.some((error) => error.includes(fieldPath)),
      `expected ${status} ${scopeName} ${fieldPath} fixture ${fixtureValue} to fail, got:\n${errors.join("\n")}`,
    );
  }
}

function setNestedValue(root, pathParts, value) {
  let current = root;
  for (const pathPart of pathParts.slice(0, -1)) {
    current = current[pathPart];
  }

  current[pathParts.at(-1)] = value;
}

function cloneMetadata(metadata) {
  return JSON.parse(JSON.stringify(metadata));
}

function collectObjectPaths(value, pathParts = []) {
  if (!value || typeof value !== "object") {
    return [];
  }

  if (Array.isArray(value)) {
    return value.flatMap((item, index) => collectObjectPaths(item, [...pathParts, String(index)]));
  }

  return [
    pathParts,
    ...Object.entries(value).flatMap(([key, item]) =>
      collectObjectPaths(item, [...pathParts, key]),
    ),
  ];
}

function getNestedObject(root, pathParts) {
  let current = root;
  for (const pathPart of pathParts) {
    current = current[pathPart];
  }

  return current;
}

function buildMetadata({
  scopes,
  statuses,
  status,
  apiContractCutover = null,
}) {
  const metadata = {
    schema: "release-metadata/v2",
    version,
    status: status ?? deriveStatus(scopes, statuses),
    releaseScopes: scopes,
    extraRepoRefs: [],
    versionMapping: versionMappingFor(statuses),
    scopeResults: Object.fromEntries(
      scopes.map((scopeName) => [scopeName, scopeResult(scopeName, statuses[scopeName])]),
    ),
    apiContractCutover,
  };

  if (metadata.scopeResults["coupler-api"]?.evidence?.publicContract) {
    const apiStatus = metadata.scopeResults["coupler-api"].status;
    metadata.scopeResults["coupler-api"].evidence.publicContract =
      apiPublicContractEvidence(Boolean(apiContractCutover), {
        previousApi: apiStatus === "rolled_back",
        currentNextPush:
          metadata.versionMapping["coupler-mobile-app"].nextPush !== null,
      });
    if (apiStatus === "rolled_back") {
      metadata.scopeResults["coupler-api"].evidence.runtimeRecovery.previousReleaseCaseIds =
        metadata.scopeResults["coupler-api"].evidence.publicContract.cases
          .filter(({ apiGeneration }) => apiGeneration === "previous")
          .map(({ id }) => id);
    }
  }

  return metadata;
}

function deriveStatus(scopes, statuses) {
  const values = scopes.map((scopeName) => statuses[scopeName]);
  if (values.every((status) => status === "planned")) {
    return "planned";
  }

  if (values.every((status) => status === "released")) {
    return "released";
  }

  if (
    values.some((status) => status === "rolled_back") &&
    values.every((status) =>
      ["released", "rolled_back", "superseded"].includes(status),
    )
  ) {
    return "rolled_back";
  }

  if (
    values.some((status) => status === "superseded") &&
    values.every((status) => status === "released" || status === "superseded")
  ) {
    return "superseded";
  }

  return "in_progress";
}

function versionMappingFor(statuses) {
  return {
    docs: {
      tag: statuses.docs === "released" ? version : null,
      commit: null,
    },
    "coupler-api": {
      tag: statuses["coupler-api"] === "released" ? version : null,
      commit: apiCommit,
    },
    "coupler-admin-web": {
      tag: statuses["coupler-admin-web"] === "released" ? version : null,
      commit: adminCommit,
    },
    "coupler-mobile-app": {
      store:
        ["released", "rolled_back"].includes(statuses["coupler-api"]) ||
        statuses["mobile-store"] === "released"
          ? "9.9.0 (900)"
          : null,
      releaseTag: statuses["mobile-store"] === "released" ? version : null,
      commit: mobileCommit,
      nextPush: statuses["mobile-nextpush"] === "released" ? "Production v99 target 9.9.0 (900)" : null,
    },
  };
}

function scopeResult(scopeName, status) {
  const result = {
    status,
    summary: `${scopeName} ${status}`,
    evidence: evidenceFor(scopeName, status),
  };

  if (status === "rolled_back") {
    result.rollbackReason = `${scopeName} rolled back after production issue`;
    if (
      ["contracts-package", "mobile-store", "mobile-nextpush", "docs"].includes(
        scopeName,
      )
    ) {
      result.rollbackEvidence = `${scopeName} rollback action completed and verified`;
    }
  }

  return result;
}

function evidenceFor(scopeName, status) {
  const concrete = status === "released" || status === "rolled_back";

  if (scopeName === "docs") {
    return {};
  }

  if (scopeName === "contracts-package") {
    return {
      publishedPackage: concrete
        ? "@coupler-developer/coupler-api-contracts@9.9.0"
        : "pending",
      workflow: concrete ? "Release Contracts workflow https://example.invalid/actions/2" : "pending",
      sourceRef: concrete ? apiCommit : "pending",
      sourceTree: concrete
        ? {
            path: "packages/contracts",
            publishedSourceTree: "e".repeat(40),
            releaseSourceTree: "e".repeat(40),
          }
        : null,
    };
  }

  if (scopeName === "coupler-api") {
    const publicContract = concrete
      ? apiPublicContractEvidence(false, { previousApi: status === "rolled_back" })
      : null;
    return {
      deployment: concrete ? "coupler-api production deployed at 2026-07-09 10:00 KST" : "pending",
      smoke: concrete ? "GET /health and envelope smoke passed" : "pending",
      publicContract,
      runtimeRecovery: concrete
        ? {
            strategy: status === "rolled_back" ? "previous-release" : "forward-fix",
            stateSafety: {
              source: "application-evidence",
              persistedState: "final DB remains readable by the forward-fix candidate",
              queuedState: "queue cursor and in-flight ownership remain on the current runtime",
              externalEffects: "idempotency ledger and sink verification passed",
            },
            previousReleaseCaseIds:
              status === "rolled_back"
                ? publicContract.cases
                    .filter(({ apiGeneration }) => apiGeneration === "previous")
                    .map(({ id }) => id)
                : [],
          }
        : null,
    };
  }

  if (scopeName === "coupler-admin-web") {
    return {
      deployment: concrete ? "coupler-admin-web production build deployed at 2026-07-09 10:05 KST" : "pending",
      smoke: concrete ? "admin member detail smoke passed" : "pending",
      rollback: concrete ? "rollback to coupler-admin-web v9.8.0 build artifact" : "pending",
    };
  }

  if (scopeName === "mobile-store") {
    return {
      submission: concrete ? "App Store Connect submitted 9.9.0 (900)" : "pending",
      approval: concrete ? "Store approved 9.9.0 (900)" : "pending",
      release: concrete ? "Store phased release started 2026-07-09 11:00 KST" : "pending",
      smoke: concrete ? "Mobile production smoke passed on 9.9.0 (900)" : "pending",
      artifact: concrete ? "Android/iOS artifact SHA-256 evidence recorded" : "pending",
      submittedMarkers: [
        {
          tag: "submitted/mobile-9.9.0-900",
          commit: concrete ? submittedCommit : "pending",
          evidence: concrete ? "submitted/mobile-9.9.0-900 evidence migrated to release record" : "pending",
          deletedEvidence: concrete ? "submitted/mobile-9.9.0-900 deleted from origin after migration" : "pending",
        },
      ],
    };
  }

  if (scopeName === "mobile-nextpush") {
    return {
      app: concrete ? "CodePush app Coupler" : "pending",
      productionLabel: concrete ? "Production v99" : "pending",
      targetBinary: concrete ? "9.9.0 (900)" : "pending",
      uploadedAt: concrete ? "2026-07-09 11:00 KST" : "pending",
      rollout: concrete ? "100%" : "pending",
      mandatory: concrete ? "mandatory false" : "pending",
      disabled: concrete ? "disabled false" : "pending",
    };
  }

  if (scopeName === "db-migration") {
    return dbMigrationEvidence(status);
  }

  return {};
}

function dbMigrationEvidence(status) {
  const environment = status === "planned" ? null : status === "pending" ? "dev" : "prod";
  return {
    schema: "db-migration-maintenance-evidence/v1",
    kind: "canonical",
    plan: environment ? maintenanceArtifactRef(environment, "plan.json") : null,
    execution: ["released", "rolled_back"].includes(status)
      ? maintenanceArtifactRef(environment, "execution.jsonl")
      : null,
  };
}

function maintenanceArtifactRef(environment, fileName) {
  return {
    path: `content/releases/evidence/db-migrations/${version}/${environment}/${fileName}`,
    sha256: checksum,
  };
}

function releasedApiContractCutover() {
  return {
    status: "released",
    contractArtifactSync: {
      command: "pnpm check:contracts",
      result: "contracts package exact match",
      consumerPath: "Mobile/Admin package dependency",
    },
    activation: {
      caseIds: [
        "previous-store-rest-current-api",
        "previous-store-bootstrap-current-api",
      ],
      appliedAt: "2026-07-09 11:00 KST",
      barrierEvidence:
        "Proxy barrier rejected incompatible product requests and reopened after current smoke",
      bootstrapUpgradeEvidence:
        "Previous mobile bootstrap/version responses remained parseable and directed upgrade",
    },
    rollback: {
      caseIds: [
        "previous-store-version-current-api",
        "previous-nextpush-version-current-api",
      ],
      barrierEvidence: "Client rollback cases passed behind the request barrier",
      cautions: "Do not reopen incompatible product requests before rollback smoke",
    },
  };
}

function rollbackApiContractCutover() {
  return {
    ...releasedApiContractCutover(),
    status: "rollback",
  };
}

function violatedApiContractCutover() {
  return {
    status: "violated",
    contractArtifactSync: {
      command: "pnpm check:contracts",
      result: "contracts package exact match",
      consumerPath: "Mobile/Admin package dependency",
    },
    violation: {
      failedRequirements: [
        "pre-deploy-activation-barrier",
        "old-readable-bootstrap",
      ],
      affectedConsumerRefs: [
        "previous-store@abcdef0:bootstrap",
        "previous-admin@abcdef1:rest",
      ],
      detectedAt: "2026-07-09 11:00 KST post-deploy review",
      observedEvidence:
        "Tagged source and response comparison confirmed incompatible previous consumers",
      unobservedScope:
        "Live previous-client request volume and affected user count were not observed",
      operationalDisposition:
        "Current runtime remains active and previous clients are not rollback candidates",
      followUpControl:
        "Future contract changes require pre-deploy consumer inventory and old-readable bootstrap evidence",
    },
  };
}

function apiPublicContractEvidence(
  cutover,
  { previousApi = false, currentNextPush = false } = {},
) {
  const consumers = [
    {
      state: "present",
      id: "previous-store",
      surface: "mobile-store",
      generation: "previous",
      artifact: {
        kind: "store-builds",
        mappingRef: "9.8.0 (899)",
        iosVersionBuild: "9.8.0 (899)",
        androidVersionBuild: "9.8.0 (899)",
      },
      contractRef: "@coupler-developer/coupler-api-contracts@9.8.0",
      interfaces: ["rest", "bootstrap", "version"],
      interfaceInventoryEvidence:
        "Store 9.8.0 source inventory contains REST, bootstrap, and version consumers; no WebSocket runtime",
    },
    {
      state: "present",
      id: "current-store",
      surface: "mobile-store",
      generation: "current",
      artifact: {
        kind: "store-builds",
        mappingRef: "9.9.0 (900)",
        iosVersionBuild: "9.9.0 (900)",
        androidVersionBuild: "9.9.0 (900)",
      },
      contractRef: "@coupler-developer/coupler-api-contracts@9.9.0",
      interfaces: ["rest", "websocket", "bootstrap", "version"],
      interfaceInventoryEvidence:
        "Store 9.9.0 source inventory contains REST, WebSocket, bootstrap, and version consumers",
    },
    {
      state: "present",
      id: "previous-nextpush",
      surface: "mobile-nextpush",
      generation: "previous",
      artifact: {
        kind: "nextpush-deployment",
        mappingRef: "Production v98 target 9.8.0 (899)",
        ios: {
          app: "coupler-ios",
          deployment: "Production",
          label: "v98",
          cohort: "100%",
          targetBinary: "9.8.0 (899)",
        },
        android: {
          app: "coupler-android",
          deployment: "Production",
          label: "v98",
          cohort: "100%",
          targetBinary: "9.8.0 (899)",
        },
      },
      contractRef: "@coupler-developer/coupler-api-contracts@9.8.0",
      interfaces: ["rest", "bootstrap", "version"],
      interfaceInventoryEvidence:
        "NextPush v98 source inventory contains REST, bootstrap, and version consumers; no WebSocket runtime",
    },
    currentNextPush
      ? {
          state: "present",
          id: "current-nextpush",
          surface: "mobile-nextpush",
          generation: "current",
          artifact: {
            kind: "nextpush-deployment",
            mappingRef: "Production v99 target 9.9.0 (900)",
            ios: {
              app: "coupler-ios",
              deployment: "Production",
              label: "v99",
              cohort: "100%",
              targetBinary: "9.9.0 (900)",
            },
            android: {
              app: "coupler-android",
              deployment: "Production",
              label: "v99",
              cohort: "100%",
              targetBinary: "9.9.0 (900)",
            },
          },
          contractRef: "@coupler-developer/coupler-api-contracts@9.9.0",
          interfaces: ["rest", "websocket", "bootstrap", "version"],
          interfaceInventoryEvidence:
            "NextPush v99 source inventory contains REST, WebSocket, bootstrap, and version consumers",
        }
      : {
          state: "absent",
          id: "current-nextpush",
          surface: "mobile-nextpush",
          generation: "current",
          owner: "mobile release owner",
          absenceEvidence: "No current-generation Production NextPush deployment exists",
        },
    {
      state: "present",
      id: "previous-admin",
      surface: "admin",
      generation: "previous",
      artifact: { kind: "admin-build", artifactRef: adminCommit },
      contractRef: "@coupler-developer/coupler-api-contracts@9.8.0",
      interfaces: ["rest"],
      interfaceInventoryEvidence:
        "Admin 9.8.0 source inventory contains REST consumers; no WebSocket runtime",
    },
    {
      state: "present",
      id: "current-admin",
      surface: "admin",
      generation: "current",
      artifact: { kind: "admin-build", artifactRef: adminCommit },
      contractRef: "@coupler-developer/coupler-api-contracts@9.9.0",
      interfaces: ["rest", "websocket"],
      interfaceInventoryEvidence:
        "Admin 9.9.0 source inventory contains REST and WebSocket consumers",
    },
  ];
  const cases = consumers.filter(({ state }) => state === "present").flatMap((consumer) =>
    consumer.interfaces.map((interfaceName) => {
      const previous = consumer.generation === "previous";
      const oldReadable = interfaceName === "bootstrap" || interfaceName === "version";
      let exposure = "post-activation";
      if (previous && interfaceName === "version") {
        exposure = "rollback";
      } else if (previous) {
        exposure = "activation";
      }
      return {
        id: `${consumer.id}-${interfaceName}-current-api`,
        consumerId: consumer.id,
        interface: interfaceName,
        apiGeneration: "current",
        exposure,
        expected:
          cutover && previous && !oldReadable
            ? "deterministic-rejection"
            : "success",
        evidence: `${consumer.id} ${interfaceName} current API contract fixture passed`,
      };
    }),
  );
  if (previousApi) {
    cases.push(
      ...consumers
        .filter(({ state }) => state === "present")
        .flatMap((consumer) =>
          consumer.interfaces.map((interfaceName) => ({
            id: `${consumer.id}-${interfaceName}-previous-api`,
            consumerId: consumer.id,
            interface: interfaceName,
            apiGeneration: "previous",
            exposure: "rollback",
            expected: "success",
            evidence: `${consumer.id} ${interfaceName} previous API rollback fixture passed`,
          })),
        ),
    );
  }
  return {
    apiRefs: {
      previous: "d".repeat(40),
      current: apiCommit,
    },
    contractRefs: {
      previous: "@coupler-developer/coupler-api-contracts@9.8.0",
      current: "@coupler-developer/coupler-api-contracts@9.9.0",
    },
    consumers,
    cases,
  };
}
