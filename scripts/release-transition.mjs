import { isDeepStrictEqual } from "node:util";
import { pendingTransitionFrozenPaths } from "./release-schema.mjs";

export function validatePendingToReleasedTransition(
  pendingMetadata,
  releasedMetadata,
  context,
) {
  const errors = [];

  if (pendingMetadata?.status !== "pending") {
    errors.push(
      `${context}: transition source status must be pending, got ${formatValue(pendingMetadata?.status)}`,
    );
  }

  if (releasedMetadata?.status !== "released") {
    errors.push(
      `${context}: transition target status must be released, got ${formatValue(releasedMetadata?.status)}`,
    );
  }

  errors.push(...validateFrozenReleaseTarget(pendingMetadata, releasedMetadata, context));

  return errors;
}

export function validateFrozenReleaseTarget(
  frozenMetadata,
  candidateMetadata,
  context,
) {
  const errors = [];

  for (const pathParts of pendingTransitionFrozenPaths) {
    const before = getNestedValue(frozenMetadata, pathParts);
    const after = getNestedValue(candidateMetadata, pathParts);

    if (valuesAreEqual(before, after)) {
      continue;
    }

    errors.push(
      `${context}: frozen release target changed at ${pathParts.join(".")} (${formatValue(before)} -> ${formatValue(after)})`,
    );
  }

  const dbPlanPath = ["scopeResults", "db-migration", "evidence", "plans"];
  const beforePlans = freezeDbMigrationPlans(getNestedValue(frozenMetadata, dbPlanPath));
  const afterPlans = freezeDbMigrationPlans(getNestedValue(candidateMetadata, dbPlanPath));
  if (!valuesAreEqual(beforePlans, afterPlans)) {
    errors.push(
      `${context}: frozen release target changed at ${dbPlanPath.join(".")} (${formatValue(beforePlans)} -> ${formatValue(afterPlans)})`,
    );
  }

  return errors;
}

function freezeDbMigrationPlans(plans) {
  if (!plans || typeof plans !== "object" || Array.isArray(plans)) {
    return plans;
  }

  return Object.fromEntries(
    Object.entries(plans).map(([environment, plan]) => [
      environment,
      !plan || typeof plan !== "object" || Array.isArray(plan)
        ? plan
        : {
            operation: plan.operation,
            targetRefs: plan.targetRefs,
            batches: Array.isArray(plan.batches)
              ? plan.batches.map((batch) => {
                  if (!batch || typeof batch !== "object" || Array.isArray(batch)) {
                    return batch;
                  }
                  const { attestation: _executionEvidence, ...frozenBatch } = batch;
                  return frozenBatch;
                })
              : plan.batches,
          },
    ]),
  );
}

function getNestedValue(value, pathParts) {
  let current = value;

  for (const pathPart of pathParts) {
    if (!current || typeof current !== "object") {
      return undefined;
    }

    current = current[pathPart];
  }

  return current;
}

function valuesAreEqual(left, right) {
  return isDeepStrictEqual(left, right);
}

function formatValue(value) {
  if (value === undefined) {
    return "undefined";
  }

  if (typeof value === "string") {
    return value;
  }

  return JSON.stringify(value);
}
