import fs from "node:fs";
import path from "node:path";

// Docs-only guard: production API contract checks live in coupler-api tests.
// This script only validates response_error(...) examples embedded in markdown.
const docsRoot = process.cwd();
const contentRoot = path.join(docsRoot, "content");
const markdownFiles = [];
const errors = [];

walkMarkdownFiles(contentRoot, markdownFiles);

for (const filePath of markdownFiles) {
  const source = fs.readFileSync(filePath, "utf8");
  validateResponseErrorExamples(path.relative(contentRoot, filePath), source, errors);
}

if (errors.length > 0) {
  for (const error of errors) {
    console.error(error);
  }
  process.exit(1);
}

console.log(`API 에러 문서 예시 검증 통과: ${markdownFiles.length}개 문서`);

function walkMarkdownFiles(dirPath, results) {
  const entries = fs.readdirSync(dirPath, { withFileTypes: true });

  for (const entry of entries) {
    const absolutePath = path.join(dirPath, entry.name);

    if (entry.isDirectory()) {
      walkMarkdownFiles(absolutePath, results);
      continue;
    }

    if (entry.isFile() && entry.name.endsWith(".md")) {
      results.push(absolutePath);
    }
  }
}

function validateResponseErrorExamples(relativePath, source, validationErrors) {
  const pattern = /response_error\s*\(/g;
  for (const match of source.matchAll(pattern)) {
    const matchIndex = match.index ?? 0;
    const openParenIndex = source.indexOf("(", matchIndex);
    const closeParenIndex = findMatchingParen(source, openParenIndex);
    if (closeParenIndex < 0) {
      validationErrors.push(
        `${relativePath}:${getLineNumber(source, matchIndex)}: response_error 호출 괄호를 해석할 수 없습니다.`,
      );
      continue;
    }

    const argumentSource = source.slice(openParenIndex + 1, closeParenIndex);
    const argumentsList = splitTopLevelArguments(argumentSource);
    if (argumentsList.length < 2 || argumentsList.length > 3) {
      validationErrors.push(
        `${relativePath}:${getLineNumber(source, matchIndex)}: 문서 예시는 response_error(res, descriptor, context?) 형태여야 합니다. (${formatSnippet(source, matchIndex, closeParenIndex + 1)})`,
      );
      continue;
    }

    const secondArgument = argumentsList[1] ?? "";
    if (/\bERROR_CODE\b/.test(secondArgument)) {
      validationErrors.push(
        `${relativePath}:${getLineNumber(source, matchIndex)}: response_error 두 번째 인자는 public ERROR_CODE alias가 아니라 ErrorDescriptor여야 합니다. (${formatSnippet(source, matchIndex, closeParenIndex + 1)})`,
      );
    }

    if (/^["'`]/.test(secondArgument)) {
      validationErrors.push(
        `${relativePath}:${getLineNumber(source, matchIndex)}: response_error 두 번째 인자는 raw error_code string이 아니라 ErrorDescriptor여야 합니다. (${formatSnippet(source, matchIndex, closeParenIndex + 1)})`,
      );
    }

    if (!/\bERROR_CATALOG\b/.test(secondArgument) && !/\bdescriptor\b/i.test(secondArgument)) {
      validationErrors.push(
        `${relativePath}:${getLineNumber(source, matchIndex)}: response_error 두 번째 인자는 ERROR_CATALOG descriptor 예시여야 합니다. (${formatSnippet(source, matchIndex, closeParenIndex + 1)})`,
      );
    }

    if (
      /res\.__\s*\(/.test(argumentSource) ||
      /\bbuild[A-Za-z0-9_]*ErrorData\s*\(/.test(argumentSource) ||
      /\bbuildErrorData\s*\(/.test(argumentSource) ||
      /\berrorData\b/.test(argumentSource)
    ) {
      validationErrors.push(
        `${relativePath}:${getLineNumber(source, matchIndex)}: response_error 문서 예시는 메시지나 prebuilt ErrorData를 넘기지 않아야 합니다. (${formatSnippet(source, matchIndex, closeParenIndex + 1)})`,
      );
    }
  }
}

function findMatchingParen(source, openParenIndex) {
  if (openParenIndex < 0) {
    return -1;
  }

  let depth = 0;
  let stringQuote = "";
  let escaped = false;

  for (let index = openParenIndex; index < source.length; index += 1) {
    const char = source[index];

    if (stringQuote) {
      if (escaped) {
        escaped = false;
      } else if (char === "\\") {
        escaped = true;
      } else if (char === stringQuote) {
        stringQuote = "";
      }
      continue;
    }

    if (char === "\"" || char === "'" || char === "`") {
      stringQuote = char;
      continue;
    }

    if (char === "(") {
      depth += 1;
    } else if (char === ")") {
      depth -= 1;
      if (depth === 0) {
        return index;
      }
    }
  }

  return -1;
}

function splitTopLevelArguments(argumentSource) {
  let depth = 0;
  let current = "";
  const args = [];
  let stringQuote = "";
  let escaped = false;

  for (const char of argumentSource) {
    current += char;

    if (stringQuote) {
      if (escaped) {
        escaped = false;
      } else if (char === "\\") {
        escaped = true;
      } else if (char === stringQuote) {
        stringQuote = "";
      }
      continue;
    }

    if (char === "\"" || char === "'" || char === "`") {
      stringQuote = char;
      continue;
    }

    if (char === "(" || char === "{" || char === "[") {
      depth += 1;
    } else if (char === ")" || char === "}" || char === "]") {
      depth -= 1;
    } else if (char === "," && depth === 0) {
      args.push(current.slice(0, -1).trim());
      current = "";
    }
  }

  if (current.trim()) {
    args.push(current.trim());
  }

  return args;
}

function getLineNumber(source, index) {
  return source.slice(0, index).split("\n").length;
}

function formatSnippet(source, startIndex, endIndex) {
  return source.slice(startIndex, endIndex).replace(/\s+/g, " ").slice(0, 180);
}
