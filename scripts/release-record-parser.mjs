import { knownRepoNames } from "./release-schema.mjs";

export function extractSection(source, sectionTitle) {
  const lines = source.split("\n");
  const result = [];
  let inSection = false;

  for (const line of lines) {
    if (line === `## ${sectionTitle}`) {
      inSection = true;
      continue;
    }

    if (inSection && line.startsWith("## ")) {
      break;
    }

    if (inSection) {
      result.push(line);
    }
  }

  return result.join("\n");
}

export function extractHeadingSection(source, level, sectionTitle) {
  const marker = `${"#".repeat(level)} ${sectionTitle}`;
  const lines = source.split("\n");
  const result = [];
  let inSection = false;

  for (const line of lines) {
    if (line === marker) {
      inSection = true;
      continue;
    }

    if (inSection && /^#{1,6}\s+/.test(line)) {
      const headingLevel = line.match(/^#+/)?.[0].length ?? 0;
      if (headingLevel <= level) {
        break;
      }
    }

    if (inSection) {
      result.push(line);
    }
  }

  return result.join("\n");
}

export function parseScopeFields(scopeSection) {
  const fields = new Map();

  for (const rawLine of scopeSection.split("\n")) {
    const line = rawLine.trim();
    const match = line.match(/^- (대상|포함 범위|제외 범위):\s*(.*)$/);

    if (match) {
      fields.set(match[1], match[2].trim());
    }
  }

  return fields;
}

export function extractRepoNames(text) {
  const repos = new Set();

  for (const match of text.matchAll(/`([^`]+)`/g)) {
    if (knownRepoNames.includes(match[1])) {
      repos.add(match[1]);
    }
  }

  return repos;
}

export function setsAreEqual(left, right) {
  if (left.size !== right.size) {
    return false;
  }

  for (const value of left) {
    if (!right.has(value)) {
      return false;
    }
  }

  return true;
}
