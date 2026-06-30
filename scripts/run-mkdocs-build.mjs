import { spawnSync } from "node:child_process";

const candidateExecutables = [
  process.env.DOCS_PYTHON,
  process.env.MKDOCS_PYTHON,
  "python3",
  "python",
  "/Library/Frameworks/Python.framework/Versions/3.11/bin/python3",
  "/opt/homebrew/bin/python3",
  "/usr/local/bin/python3",
].filter(Boolean);

const seen = new Set();
const candidates = candidateExecutables.filter((candidate) => {
  if (seen.has(candidate)) {
    return false;
  }
  seen.add(candidate);
  return true;
});

const attempts = [];
let selectedPython = null;

for (const candidate of candidates) {
  const result = spawnSync(candidate, ["-c", "import mkdocs"], {
    encoding: "utf8",
  });

  if (result.status === 0) {
    selectedPython = candidate;
    break;
  }

  attempts.push({
    candidate,
    status: result.status,
    error: result.error?.message,
    stderr: result.stderr?.trim(),
  });
}

if (!selectedPython) {
  console.error("mkdocs가 설치된 Python 실행 파일을 찾지 못했습니다.");
  console.error("DOCS_PYTHON 또는 MKDOCS_PYTHON으로 Python 경로를 지정할 수 있습니다.");
  for (const attempt of attempts) {
    const details = [
      `candidate=${attempt.candidate}`,
      `status=${attempt.status ?? "unavailable"}`,
      attempt.error ? `error=${attempt.error}` : "",
      attempt.stderr ? `stderr=${attempt.stderr}` : "",
    ].filter(Boolean);
    console.error(`- ${details.join(", ")}`);
  }
  process.exit(1);
}

const build = spawnSync(
  selectedPython,
  ["-m", "mkdocs", "build", "--strict"],
  { stdio: "inherit" },
);

process.exit(build.status ?? 1);
