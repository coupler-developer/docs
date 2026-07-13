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

  for (const pathParts of pendingTransitionFrozenPaths) {
    const before = getNestedValue(pendingMetadata, pathParts);
    const after = getNestedValue(releasedMetadata, pathParts);

    if (valuesAreEqual(before, after)) {
      continue;
    }

    errors.push(
      `${context}: frozen release target changed at ${pathParts.join(".")} (${formatValue(before)} -> ${formatValue(after)})`,
    );
  }

  return errors;
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
  return JSON.stringify(left) === JSON.stringify(right);
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
