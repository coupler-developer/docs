import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import MarkdownIt from "markdown-it";

const markdownParser = new MarkdownIt({ html: true });
const moduleRoot = path.dirname(fileURLToPath(import.meta.url));
const lifecycleRegistry = JSON.parse(
    fs.readFileSync(
        path.join(moduleRoot, "..", "document-lifecycle-registry.json"),
        "utf8",
    ),
);
const currentDocuments = lifecycleRegistry.documents;
const currentDocumentsById = new Map(
    currentDocuments.map((entry) => [entry.id, entry]),
);
const currentRoutes = lifecycleRegistry.routes;
const foundationDocuments = currentDocuments
    .filter((entry) => entry.routing === "core")
    .sort((left, right) => left.coreOrder - right.coreOrder);

const REQUEST_TYPES = [
    "설명·상태 확인",
    "진단",
    "설계·계획",
    "변경·구현",
    "리뷰",
    "운영·관찰",
];

const PERMISSIONS = [
    "workspace 파일 변경",
    "외부 의존성",
    "branch/worktree",
    "commit",
    "push",
    "PR",
    "merge/main integration",
    "reviewer",
    "deploy",
    "force push·삭제",
];

const TARGET_STAGES = [
    "검증 완료",
    "외부 작업 완료",
    "main 반영 완료",
    "배포 완료",
];

const STATES = [
    "BOOT",
    "CLASSIFY",
    "ROUTE",
    "BASELINE",
    "PLAN",
    "EXECUTE",
    "REVIEW",
    "VERIFY",
    "EXTERNAL_ACTION",
    "REPORT",
];

const ROUTE_FIELDS = [
    "요청=<유형>",
    "레포=<대상>",
    "산출물=<종류>",
    "도메인=<범위>",
    "위험=<표면>",
    "목표단계=<검증 완료|외부 작업 완료|main 반영 완료|배포 완료>",
    "권한=<집합>",
    "필수문서=<경로>",
    "완료=<종료 조건>",
];

const REQUIRED_SECTIONS = [
    [2, "부트스트랩"],
    [2, "작업 계약"],
    [3, "요청 유형과 종료 조건"],
    [3, "범위와 권한"],
    [3, "문서 라우팅"],
    [3, "실행과 완료"],
    [2, "문서 인덱스"],
];

export function validateAgentWorkflow({
    agentsSource,
    readmeSource,
    testingStrategySource = "",
    workspaceRootAgentsSource = null,
    routeExists = () => true,
    readRouteSource = () => "",
}) {
    const errors = [];

    validateSections(agentsSource, errors);
    validateBootstrap(agentsSource, errors);
    validateRequestTypes(agentsSource, errors);
    validateScopeAndPermissions(agentsSource, errors);
    validateRoutes(agentsSource, routeExists, readRouteSource, errors);
    validateExecution(agentsSource, errors);
    validateTestingStrategy(testingStrategySource, errors);
    validateWorkspaceBootstrap(readmeSource, workspaceRootAgentsSource, errors);

    return errors;
}

function validateSections(source, errors) {
    for (const [level, title] of REQUIRED_SECTIONS) {
        if (countExactHeadings(source, level, title) !== 1) {
            errors.push(
                `content/AGENTS.md의 '${title}' 절은 정확히 1개여야 합니다.`,
            );
        }
    }
}

function validateBootstrap(source, errors) {
    const section = extractSection(source, 2, "부트스트랩");
    requireText(
        section,
        [
            "새 세션",
            "컨텍스트 유실 후 재진입",
            "독립 작업 위임",
            "`부트스트랩`과 `작업 계약`",
            "ACK: BOOT@YYYY-MM-DD",
            "ACK 전에는",
            "단일 SoT를 확정할 수 없으면 수정하지 않고",
        ],
        "bootstrap",
        errors,
    );
    if (source.includes("Core 4") || source.includes("ACK/EVIDENCE")) {
        errors.push(
            "content/AGENTS.md는 모든 세션의 Core 4 또는 ACK/EVIDENCE 선열람을 요구할 수 없습니다.",
        );
    }
}

function validateRequestTypes(source, errors) {
    const section = extractSection(source, 3, "요청 유형과 종료 조건");
    const rows = parseTable(section, "요청 유형", 3, "요청 유형", errors).map(
        ([type, action, completion]) => ({
            action,
            completion,
            type: stripInlineCode(type),
        }),
    );
    const actualTypes = rows.map((row) => row.type);
    if (!sameArray(actualTypes, REQUEST_TYPES)) {
        errors.push(
            `요청 유형은 다음 순서의 폐쇄형 값이어야 합니다: ${REQUEST_TYPES.join(", ")}`,
        );
    }
    for (const row of rows) {
        if (!row.action || !row.completion) {
            errors.push(
                `요청 유형의 동작과 종료 조건은 비어 있을 수 없습니다: ${row.type}`,
            );
        }
    }
    requireText(
        section,
        [
            "요청 유형, 권한, 범위, 실행 단계는 독립적으로 판정한다",
            "사용자가 변경까지 명시하지 않으면 파일 변경 권한을 포함하지 않는다",
        ],
        "요청 유형 안전 규칙",
        errors,
    );
}

function validateScopeAndPermissions(source, errors) {
    const section = extractSection(source, 3, "범위와 권한");
    const rows = parseTable(section, "권한", 2, "권한", errors).map(
        ([permission, condition]) => ({
            condition,
            permission: stripInlineCode(permission),
        }),
    );
    const actualPermissions = rows.map((row) => row.permission);
    if (!sameArray(actualPermissions, PERMISSIONS)) {
        errors.push(
            `권한은 다음 순서의 폐쇄형 값이어야 합니다: ${PERMISSIONS.join(", ")}`,
        );
    }
    for (const row of rows) {
        if (!row.condition) {
            errors.push(
                `권한 포함 조건은 비어 있을 수 없습니다: ${row.permission}`,
            );
        }
    }

    const conditionByPermission = new Map(
        rows.map((row) => [row.permission, row.condition]),
    );
    requireText(
        conditionByPermission.get("workspace 파일 변경") ?? "",
        ["변경·구현"],
        "파일 변경 권한",
        errors,
    );
    requireText(
        conditionByPermission.get("외부 의존성") ?? "",
        ["사전 검토", "승인"],
        "외부 의존성 권한",
        errors,
    );
    requireText(
        conditionByPermission.get("merge/main integration") ?? "",
        ["별도 명시 요청"],
        "main 반영 권한",
        errors,
    );
    requireText(
        conditionByPermission.get("reviewer") ?? "",
        ["개인 또는 팀", "승인"],
        "reviewer 권한",
        errors,
    );
    requireText(
        conditionByPermission.get("force push·삭제") ?? "",
        ["대상", "승인"],
        "파괴적 권한",
        errors,
    );

    requireText(
        section,
        [
            "직전 요청에서 합의한",
            "범위 밖 branch/worktree/PR을 탐색하기 전에",
            "자동 전환",
            "활성 PR을 병렬 유지하지 않고",
            "권한은 서로 독립적",
            "reviewer 변경·merge/main integration·deploy를 포함하지",
        ],
        "범위와 권한 안전 규칙",
        errors,
    );

    const routeContract =
        [...section.matchAll(/`(ROUTE:[^`]+)`/g)]
            .map((match) => match[1])
            .at(0) ?? "";
    requireText(routeContract, ROUTE_FIELDS, "ROUTE 실행 계약", errors);
}

function validateRoutes(source, routeExists, readRouteSource, errors) {
    const section = extractSection(source, 3, "문서 라우팅");
    const rows = parseTable(
        section,
        "적용 신호·단계",
        2,
        "문서 라우팅",
        errors,
    ).map(([signal, targetSource]) => ({ signal, targetSource }));
    const expectedRows = currentRoutes.map(({ signal, targetSource }) => ({
        signal,
        targetSource,
    }));
    if (JSON.stringify(rows) !== JSON.stringify(expectedRows)) {
        errors.push(
            "문서 라우팅 표가 document-lifecycle-registry.json의 current route와 다릅니다.",
        );
    }

    const activeRouteTargetIds = new Set(
        currentRoutes.flatMap((route) => route.targets),
    );
    for (const foundation of foundationDocuments) {
        if (!activeRouteTargetIds.has(foundation.id)) {
            errors.push(
                `기반 문서가 current route에서 참조되지 않습니다: content/${foundation.path}`,
            );
        }
    }

    for (const route of currentRoutes) {
        const targetPaths = [];
        for (const targetId of route.targets) {
            const target = currentDocumentsById.get(targetId);
            if (!target) {
                errors.push(
                    `current route target 문서가 registry에 없습니다: ${targetId}`,
                );
                continue;
            }
            const relativePath = `content/${target.path}`;
            targetPaths.push(target.path);
            if (!routeExists(relativePath)) {
                errors.push(`라우팅 문서가 존재하지 않습니다: ${relativePath}`);
                continue;
            }
            const routeSource = readRouteSource(relativePath);
            for (const heading of target.requiredHeadings ?? []) {
                if (
                    countExactHeadings(
                        routeSource,
                        heading.level,
                        heading.title,
                    ) !== 1
                ) {
                    errors.push(
                        `라우팅 필수 Gate heading이 없습니다: ${relativePath}#${heading.title}`,
                    );
                }
            }
        }
        const sourcePaths = [
            ...route.targetSource.matchAll(/`content\/([^`]+\.md)`/g),
        ].map((match) => match[1]);
        if (!sameArray(sourcePaths, targetPaths)) {
            errors.push(`route targetSource와 targets가 다릅니다: ${route.id}`);
        }
    }

    requireText(
        section,
        [
            "일치하는 행의 문서를 합집합으로 읽는다",
            "각 판정 책임이 하나의 SoT에 연결될 때까지",
            "충돌·누락이 있으면 구현보다 규범을 먼저 확정한다",
            "표에 없는 도메인은 비적용으로 추론하지 않고",
            "이전 세션 요약으로 대체하지 않고",
        ],
        "문서 라우팅 안전 규칙",
        errors,
    );
}

function validateExecution(source, errors) {
    const section = extractSection(source, 3, "실행과 완료");
    const targetStageRows = parseTable(
        section,
        "목표 단계",
        3,
        "목표 단계",
        errors,
    ).map(([stage, completion, selection]) => ({
        completion,
        selection,
        stage: stripInlineCode(stage),
    }));
    const actualTargetStages = targetStageRows.map((row) => row.stage);
    if (!sameArray(actualTargetStages, TARGET_STAGES)) {
        errors.push(
            `목표 단계는 다음 순서의 폐쇄형 값이어야 합니다: ${TARGET_STAGES.join(", ")}`,
        );
    }
    for (const row of targetStageRows) {
        if (!row.completion || !row.selection) {
            errors.push(
                `목표 단계의 완료·선택 조건은 비어 있을 수 없습니다: ${row.stage}`,
            );
        }
    }
    const stateSource = [...section.matchAll(/`([A-Z_]+(?: -> [A-Z_]+)+)`/g)]
        .map((match) => match[1])
        .at(0);
    const actualStates = stateSource?.split(" -> ") ?? [];
    if (!sameArray(actualStates, STATES)) {
        errors.push(`작업 상태 순서는 ${STATES.join(" -> ")}여야 합니다.`);
    }
    requireText(
        section,
        [
            "열린 Finding 0건·검증 대기",
            "원인을 1회 수정",
            "동일 범위를 1회 재리뷰",
            "리뷰·검증 뒤 파일이 바뀌면 두 결과는 만료된다",
            "검증 실패는 `No Findings`로 판정하지 않는다",
            "commit 전에는",
            "push·PR 전에는",
            "merge/main integration 전에는",
            "병합 전 체크리스트",
            "deploy 전에는",
            "잔여 위험",
        ],
        "실행과 완료 안전 규칙",
        errors,
    );
}

function validateTestingStrategy(source, errors) {
    if (source && countExactHeadings(source, 3, "로컬 최종 후보 검증") !== 1) {
        errors.push(
            "testing-strategy.md의 '로컬 최종 후보 검증' 절은 정확히 1개여야 합니다.",
        );
    }
}

function validateWorkspaceBootstrap(
    readmeSource,
    workspaceRootAgentsSource,
    errors,
) {
    const readmeBootstrap = extractReadmeBootstrap(readmeSource);
    if (!readmeBootstrap) {
        errors.push("README workspace bootstrap 예시를 찾을 수 없습니다.");
        return;
    }
    requireText(
        readmeBootstrap,
        [
            "# AGENTS (워크스페이스 전용)",
            "docs/content/AGENTS.md",
            "## 기존 작업 우선 게이트",
            "자동으로 전환하지 않는다",
            "같은 범위의 활성 PR을 병렬로 유지하지 않는다",
            "## PR reviewer 요청 금지 게이트",
            "reviewer 개인 또는 팀을 별도로 명시해 승인",
        ],
        "README workspace bootstrap",
        errors,
    );
    requireText(
        readmeSource,
        [
            "docs/content/AGENTS.md",
            "ACK: BOOT@YYYY-MM-DD",
            "요청·단계별 필수 문서를 라우팅",
        ],
        "README 새 세션 안내",
        errors,
    );
    if (
        workspaceRootAgentsSource !== null &&
        normalizeWhitespace(workspaceRootAgentsSource) !==
            normalizeWhitespace(readmeBootstrap)
    ) {
        errors.push(
            "workspace root AGENTS.md bootstrap 계약이 README 예시와 다릅니다.",
        );
    }
}

function parseTable(source, firstHeader, columnCount, context, errors) {
    const rows = [];
    let inTargetTable = false;

    for (const line of source.split("\n")) {
        const trimmed = line.trim();
        if (!trimmed.startsWith("|") || !trimmed.endsWith("|")) {
            if (inTargetTable && trimmed !== "") {
                break;
            }
            continue;
        }
        const cells = trimmed
            .slice(1, -1)
            .split("|")
            .map((cell) => normalizeWhitespace(cell));
        if (!inTargetTable) {
            inTargetTable = cells[0] === firstHeader;
            continue;
        }
        if (cells.every((cell) => /^:?-+:?$/.test(cell))) {
            continue;
        }
        if (cells.length !== columnCount) {
            errors.push(`${context} 표의 열 수는 ${columnCount}개여야 합니다.`);
            continue;
        }
        rows.push(cells);
    }
    if (!inTargetTable) {
        errors.push(`${context} 표 header가 없습니다: ${firstHeader}`);
    }
    return rows;
}

function extractReadmeBootstrap(source) {
    for (const token of markdownParser.parse(source, {})) {
        if (
            token.type === "fence" &&
            token.info.trim() === "text" &&
            token.content.startsWith("# AGENTS (워크스페이스 전용)")
        ) {
            return token.content.trimEnd();
        }
    }
    return "";
}

function parseMarkdownHeadings(source) {
    const tokens = markdownParser.parse(source, {});
    const headings = [];
    for (let index = 0; index < tokens.length; index += 1) {
        const token = tokens[index];
        if (token.type !== "heading_open" || !token.map) {
            continue;
        }
        const inline = tokens[index + 1];
        headings.push({
            endLine: token.map[1],
            level: Number(token.tag.slice(1)),
            startLine: token.map[0],
            title: inline?.type === "inline" ? inline.content.trim() : "",
        });
    }
    return headings;
}

function countExactHeadings(source, level, title) {
    return parseMarkdownHeadings(source).filter(
        (heading) => heading.level === level && heading.title === title,
    ).length;
}

function extractSection(source, level, title) {
    const headings = parseMarkdownHeadings(source);
    const index = headings.findIndex(
        (heading) => heading.level === level && heading.title === title,
    );
    if (index === -1) {
        return "";
    }
    const heading = headings[index];
    const next = headings
        .slice(index + 1)
        .find((candidate) => candidate.level <= level);
    return source
        .split("\n")
        .slice(heading.endLine, next?.startLine ?? undefined)
        .join("\n");
}

function requireText(source, values, context, errors) {
    for (const value of values) {
        if (!source.includes(value)) {
            errors.push(`${context}에 필수 값이 없습니다: ${value}`);
        }
    }
}

function stripInlineCode(value) {
    return value.startsWith("`") && value.endsWith("`")
        ? value.slice(1, -1)
        : value;
}

function normalizeWhitespace(value) {
    return value.replace(/\s+/g, " ").trim();
}

function sameArray(actual, expected) {
    return (
        actual.length === expected.length &&
        actual.every((value, index) => value === expected[index])
    );
}

const isMainModule =
    process.argv[1] &&
    import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href;

if (isMainModule) {
    const docsRoot = process.cwd();
    const workspaceRootAgentsSource = [
        path.resolve(docsRoot, "..", "AGENTS.md"),
        path.resolve(docsRoot, "..", "..", "AGENTS.md"),
    ]
        .filter(
            (candidate, index, candidates) =>
                candidates.indexOf(candidate) === index,
        )
        .filter((candidate) =>
            fs.existsSync(
                path.join(
                    path.dirname(candidate),
                    "docs",
                    "content",
                    "AGENTS.md",
                ),
            ),
        )
        .filter((candidate) => fs.existsSync(candidate))
        .map((candidate) => fs.readFileSync(candidate, "utf8"))
        .at(0);
    const routeExists = (relativePath) =>
        fs.existsSync(path.join(docsRoot, relativePath));
    const readRouteSource = (relativePath) =>
        fs.readFileSync(path.join(docsRoot, relativePath), "utf8");
    const errors = validateAgentWorkflow({
        agentsSource: fs.readFileSync(
            path.join(docsRoot, "content", "AGENTS.md"),
            "utf8",
        ),
        readmeSource: fs.readFileSync(
            path.join(docsRoot, "content", "README.md"),
            "utf8",
        ),
        testingStrategySource: fs.readFileSync(
            path.join(docsRoot, "content", "policy", "testing-strategy.md"),
            "utf8",
        ),
        workspaceRootAgentsSource: workspaceRootAgentsSource ?? null,
        routeExists,
        readRouteSource,
    });

    if (errors.length > 0) {
        for (const error of errors) {
            console.error(error);
        }
        process.exit(1);
    }
    console.log("에이전트 작업흐름 검증 통과");
}
