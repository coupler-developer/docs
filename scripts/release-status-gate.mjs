import { getReleasePlaceholderSignal } from "./release-schema.mjs";

export function parseReleaseStatus(statusSection) {
  const statusMatch = statusSection.match(
    /- (?:전체 상태|최종 상태): `([^`]+)`/,
  );

  return statusMatch?.[1] ?? null;
}

export function parseStatusFields(statusSection) {
  const fields = new Map();

  for (const rawLine of statusSection.split("\n")) {
    const line = rawLine.trim();
    const match = line.match(/^- ([^:]+):\s*(.*)$/);

    if (match) {
      fields.set(match[1], match[2].trim());
    }
  }

  return fields;
}

export function validateReleaseStatusGate({ context, status, statusSection }) {
  const errors = [];
  const statusFields = parseStatusFields(statusSection);
  const pendingScope = statusFields.get("대기 범위") ?? "";

  if (status === "released") {
    if (!isEmptyPendingScope(pendingScope)) {
      errors.push(`${context}: released 상태에는 대기 범위 값을 남길 수 없습니다`);
    }

    for (const finding of findReleasedPlaceholderSignals(statusFields)) {
      errors.push(
        `${context}: released 상태에는 미완료 신호를 남길 수 없습니다 (${finding.fieldName}: ${finding.signal})`,
      );
    }
  }

  if (status === "in_progress" && isEmptyPendingScope(pendingScope)) {
    errors.push(`${context}: in_progress 상태에는 대기 범위를 명시해야 합니다`);
  }

  return errors;
}

function isEmptyPendingScope(value) {
  return value === "" || value === "`N/A`" || value === "N/A";
}

function findReleasedPlaceholderSignals(statusFields) {
  const findings = [];

  for (const [fieldName, rawValue] of statusFields.entries()) {
    if (fieldName === "대기 범위") {
      continue;
    }

    const value = rawValue.replace(/`/g, "");
    const signal = getReleasePlaceholderSignal(value);

    if (signal && signal !== "empty") {
      findings.push({
        fieldName,
        signal,
      });
    }
  }

  return findings;
}
