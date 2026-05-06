"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.runScan = runScan;
exports.runSync = runSync;
exports.mapNotionSyncError = mapNotionSyncError;
exports.runAnalyze = runAnalyze;
exports.runDeploy = runDeploy;
exports.runWorkflow = runWorkflow;
exports.runNotionCheck = runNotionCheck;
exports.runStatus = runStatus;
const path = __importStar(require("path"));
const simple_git_1 = __importDefault(require("simple-git"));
const formatter_1 = require("./formatter");
const vault_scanner_1 = require("../core/vault-scanner");
const github_1 = require("../integrations/github");
const client_1 = require("@notionhq/client");
const notion_1 = require("../integrations/notion");
const notion_sync_1 = require("../integrations/notion-sync");
const DEFAULT_GITHUB_SYNC_EXCLUDES = [
    '.claude/',
    '.git/',
    'node_modules/',
    'vault/.obsidian/',
];
function createVaultScannerFromEnv() {
    const basePath = path.resolve(process.env['VAULT_PATH'] ?? './vault');
    return new vault_scanner_1.VaultScanner({
        basePath,
        folders: {
            mission: process.env['VAULT_FOLDER_MISSION'] ?? 'mission',
            meetings: process.env['VAULT_FOLDER_MEETINGS'] ?? 'meetings',
            skillInsight: process.env['VAULT_FOLDER_SKILL_INSIGHT'] ?? 'skillInsight',
            sharing: process.env['VAULT_FOLDER_SHARING'] ?? 'sharing',
            analysis: process.env['VAULT_FOLDER_ANALYSIS'] ?? 'analysis',
            linkedin: process.env['VAULT_FOLDER_LINKEDIN'] ?? 'linkedin',
        },
    });
}
async function runScan(opts, deps) {
    const scanner = createVaultScannerFromEnv();
    const folderTypes = [
        'mission',
        'meetings',
        'skillInsight',
        'sharing',
        'analysis',
        'linkedin',
    ];
    const targets = opts.folder ? [opts.folder] : folderTypes;
    const counts = {};
    for (const folderType of targets) {
        const files = await scanner.scanFolder(folderType);
        counts[folderType] = files.length;
    }
    const total = Object.values(counts).reduce((s, n) => s + n, 0);
    const result = {
        action: 'scan',
        folder: opts.folder ?? 'all',
        files: counts,
        total,
        status: 'completed',
        timestamp: new Date().toISOString(),
    };
    return (0, formatter_1.format)(result, deps.outputFormat);
}
async function runSync(opts, deps) {
    const target = opts.target ?? 'github';
    if (target === 'github') {
        const syncResult = await runGitHubSync();
        const result = {
            action: 'sync',
            target,
            status: syncResult.success ? 'completed' : 'failed',
            commit: syncResult.commit,
            conflicts: syncResult.conflicts,
            error: syncResult.error,
            timestamp: new Date().toISOString(),
        };
        return (0, formatter_1.format)(result, deps.outputFormat);
    }
    if (target === 'notion') {
        const syncSummary = await runNotionSync();
        return (0, formatter_1.format)({
            action: 'sync',
            target,
            status: 'completed',
            ...syncSummary,
            timestamp: new Date().toISOString(),
        }, deps.outputFormat);
    }
    if (target === 'all') {
        const [notion, github] = await Promise.all([runNotionSync(), runGitHubSync()]);
        return (0, formatter_1.format)({
            action: 'sync',
            target,
            status: notion ? (github.success ? 'completed' : 'failed') : 'failed',
            notion,
            github: {
                status: github.success ? 'completed' : 'failed',
                commit: github.commit,
                conflicts: github.conflicts,
                error: github.error,
            },
            timestamp: new Date().toISOString(),
        }, deps.outputFormat);
    }
    await deps.orchestrator.emit(`${target}:sync`, { target });
    const result = {
        action: 'sync',
        target,
        status: 'completed',
        timestamp: new Date().toISOString(),
    };
    return (0, formatter_1.format)(result, deps.outputFormat);
}
async function runNotionSync() {
    const token = process.env['NOTION_TOKEN'];
    const databaseId = process.env['NOTION_DATABASE_ID'];
    if (!token) {
        throw new Error('NOTION_TOKEN is required.');
    }
    if (!databaseId) {
        throw new Error('NOTION_DATABASE_ID is required.');
    }
    const meetingsFolder = process.env['VAULT_FOLDER_MEETINGS'] ?? 'meetings';
    const configuredMeetingsPath = process.env['NOTION_OBSIDIAN_PATH'];
    const vaultBasePath = path.resolve(process.env['VAULT_PATH'] ?? './vault');
    const connector = new notion_1.NotionMCPConnector({ token, defaultDatabaseId: databaseId }, new client_1.Client({ auth: token }));
    try {
        return await (0, notion_sync_1.syncNotionBidirectional)({
            connector,
            databaseId,
            paths: {
                vaultBasePath,
                meetingsFolder,
                meetingsPath: configuredMeetingsPath ? path.resolve(configuredMeetingsPath) : undefined,
            },
        });
    }
    catch (error) {
        throw mapNotionSyncError(error, databaseId);
    }
}
function mapNotionSyncError(error, databaseId) {
    const notionError = error;
    if (notionError?.code !== 'object_not_found') {
        return error instanceof Error ? error : new Error(String(error));
    }
    const integrationId = notionError.additional_data?.integration_id;
    const requestId = notionError.request_id;
    const details = [
        `Notion 데이터베이스에 접근할 수 없습니다: ${databaseId}`,
        '확인 사항: 1) 해당 데이터베이스 또는 상위 페이지를 integration "gitautopipe"와 공유했는지, 2) NOTION_DATABASE_ID가 실제 대상 ID와 일치하는지 확인하세요.',
    ];
    if (integrationId) {
        details.push(`integration_id=${integrationId}`);
    }
    if (requestId) {
        details.push(`request_id=${requestId}`);
    }
    return new Error(details.join(' '));
}
async function runNotionProbe(operation) {
    try {
        const data = await operation();
        return { ok: true, data };
    }
    catch (error) {
        if (error instanceof Error) {
            const apiError = error;
            return {
                ok: false,
                error: {
                    code: apiError.code,
                    message: apiError.message,
                    status: apiError.status,
                },
            };
        }
        return {
            ok: false,
            error: {
                message: String(error),
            },
        };
    }
}
function extractNotionTitle(title) {
    return Array.isArray(title) ? title.map((item) => item.plain_text ?? '').join('').trim() : undefined;
}
function extractDataSourceTitle(response) {
    const dataSource = response;
    if (typeof dataSource.name === 'string' && dataSource.name.trim().length > 0) {
        return dataSource.name;
    }
    return extractNotionTitle(dataSource.title);
}
function buildNotionDiagnosis(params) {
    const guidance = [];
    if (params.rawId !== params.normalizedId) {
        guidance.push(`Normalized NOTION_DATABASE_ID to ${params.normalizedId}.`);
    }
    if (params.databaseCheck.ok && params.dataSourceChecks.some((check) => check.ok)) {
        guidance.push('At least one reachable data source was found for the configured target.');
        return { status: 'ok', guidance };
    }
    if (params.databaseCheck.error?.code === 'object_not_found') {
        guidance.push('The database is not shared with the integration, or the configured ID points to the wrong object.');
    }
    if (params.dataSourceChecks.some((check) => check.error?.code === 'object_not_found')) {
        guidance.push('The data source is not reachable. Check Add connections / Share in Notion and confirm the ID is correct.');
    }
    if (params.databaseCheck.error?.code === 'invalid_request_url') {
        guidance.push('The configured value is not a valid Notion database URL or ID.');
    }
    if (params.databaseCheck.ok && params.dataSourceChecks.every((check) => !check.ok)) {
        guidance.push('The database is reachable, but no linked data source is reachable. This usually means the integration is not connected to the data source layer yet.');
        return { status: 'warning', guidance };
    }
    if (guidance.length === 0) {
        guidance.push('Check the NOTION_DATABASE_ID value and verify the target is shared with the integration.');
    }
    return { status: 'failed', guidance };
}
async function runGitHubSync() {
    const cwd = process.cwd();
    const git = (0, simple_git_1.default)(cwd);
    const status = await git.status();
    const files = mapStatusToChangedFiles(status, cwd);
    if (files.length === 0) {
        return {
            success: true,
            conflicts: [],
            commit: undefined,
            error: undefined,
        };
    }
    const config = await createGitHubConfig(git, cwd);
    const githubSync = new github_1.GitHubSync(config);
    return githubSync.sync(files, {
        type: 'generic',
        description: `sync: ${new Date().toISOString()}`,
    });
}
async function createGitHubConfig(git, cwd) {
    const branchSummary = await git.branchLocal();
    const branch = process.env['GITHUB_BRANCH'] ?? branchSummary.current;
    const remotes = await git.getRemotes(true);
    const origin = remotes.find((remote) => remote.name === 'origin');
    const remoteUrl = process.env['GITHUB_REMOTE_URL'] ?? origin?.refs.push ?? origin?.refs.fetch;
    if (!remoteUrl) {
        throw new Error('GitHub remote origin is not configured.');
    }
    const parsed = parseGitHubRemote(remoteUrl);
    const token = process.env['GITHUB_TOKEN'];
    if (!token) {
        throw new Error('GITHUB_TOKEN is required.');
    }
    return {
        owner: process.env['GITHUB_OWNER'] ?? parsed.owner,
        repo: process.env['GITHUB_REPO'] ?? parsed.repo,
        branch,
        token,
        localRepoPath: cwd,
    };
}
function parseGitHubRemote(remoteUrl) {
    const normalized = remoteUrl.trim().replace(/\.git$/, '');
    const httpsMatch = normalized.match(/github\.com[:/](?<owner>[^/]+)\/(?<repo>[^/]+)$/);
    if (httpsMatch?.groups) {
        return {
            owner: httpsMatch.groups['owner'],
            repo: httpsMatch.groups['repo'],
        };
    }
    throw new Error(`Unsupported GitHub remote URL: ${remoteUrl}`);
}
function mapStatusToChangedFiles(status, cwd) {
    return status.files
        .filter((file) => file.path && (file.index !== ' ' || file.working_dir !== ' '))
        .filter((file) => !isExcludedFromGitHubSync(file.path))
        .map((file) => ({
        filePath: path.join(cwd, file.path),
        relativePath: file.path,
        folderType: inferFolderType(file.path),
        changeType: file.working_dir === 'D' ? 'delete' : file.index === 'A' ? 'add' : 'modify',
    }));
}
function isExcludedFromGitHubSync(filePath) {
    const normalized = filePath.replace(/\\/g, '/');
    return DEFAULT_GITHUB_SYNC_EXCLUDES.some((prefix) => normalized.startsWith(prefix));
}
function inferFolderType(filePath) {
    const normalized = filePath.replace(/\\/g, '/').toLowerCase();
    if (normalized.includes('/meetings/') || normalized.startsWith('meetings/'))
        return 'meetings';
    if (normalized.includes('/skillinsight/') || normalized.startsWith('skillinsight/')) {
        return 'skillInsight';
    }
    if (normalized.includes('/sharing/') || normalized.startsWith('sharing/'))
        return 'sharing';
    if (normalized.includes('/analysis/') || normalized.startsWith('analysis/'))
        return 'analysis';
    if (normalized.includes('/linkedin/') || normalized.startsWith('linkedin/'))
        return 'linkedin';
    return 'mission';
}
async function runAnalyze(opts, deps) {
    await deps.orchestrator.executeWorkflow('onMissionUpdate', { week: opts.week });
    const result = {
        action: 'analyze',
        week: opts.week ?? 'current',
        status: 'completed',
        timestamp: new Date().toISOString(),
    };
    return (0, formatter_1.format)(result, deps.outputFormat);
}
async function runDeploy(opts, deps) {
    await deps.orchestrator.emit('skill:updated', { preview: opts.preview ?? false });
    const result = {
        action: 'deploy',
        preview: opts.preview ?? false,
        status: 'completed',
        timestamp: new Date().toISOString(),
    };
    return (0, formatter_1.format)(result, deps.outputFormat);
}
async function runWorkflow(opts, deps) {
    const execution = await deps.orchestrator.executeWorkflow(opts.workflowId, opts.payload);
    return (0, formatter_1.format)(execution, deps.outputFormat);
}
async function runNotionCheck(opts, deps) {
    const token = process.env['NOTION_TOKEN'];
    if (!token) {
        throw new Error('NOTION_TOKEN is required.');
    }
    const rawId = opts.id ?? process.env['NOTION_DATABASE_ID'];
    if (!rawId) {
        throw new Error('NOTION_DATABASE_ID is required.');
    }
    const normalizedId = (0, notion_1.normalizeNotionId)(rawId);
    const client = new client_1.Client({ auth: token });
    const databaseCheck = await runNotionProbe(async () => {
        const response = await client.databases.retrieve({ database_id: normalizedId });
        const database = response;
        return {
            id: database.id,
            title: extractNotionTitle(database.title),
            dataSourceIds: (database.data_sources ?? [])
                .map((item) => item.id)
                .filter((value) => typeof value === 'string' && value.length > 0),
        };
    });
    const candidateIds = Array.from(new Set([normalizedId, ...(databaseCheck.data?.dataSourceIds ?? [])]));
    const dataSourceChecks = await Promise.all(candidateIds.map(async (targetId) => {
        const probe = await runNotionProbe(async () => {
            const response = await client.dataSources.retrieve({ data_source_id: targetId });
            return {
                id: response.id,
                title: extractDataSourceTitle(response),
                parent: 'parent' in response ? response.parent : undefined,
            };
        });
        return {
            targetId,
            ...probe,
        };
    }));
    const diagnosis = buildNotionDiagnosis({
        rawId,
        normalizedId,
        databaseCheck,
        dataSourceChecks,
    });
    return (0, formatter_1.format)({
        action: 'notion-check',
        status: diagnosis.status,
        rawId,
        normalizedId,
        databaseCheck,
        dataSourceChecks,
        guidance: diagnosis.guidance,
        timestamp: new Date().toISOString(),
    }, deps.outputFormat);
}
function runStatus(deps) {
    const schedules = deps.orchestrator.getSchedules();
    const predefined = ['onMissionUpdate', 'onMeetingSync', 'onSkillUpdate', 'weeklyDigest'];
    const workflows = predefined.map((id) => ({
        id,
        registered: !!deps.orchestrator.getWorkflow(id),
        historyCount: deps.orchestrator.getExecutionHistory(id).length,
    }));
    const result = {
        workflows,
        schedules: schedules.length,
        timestamp: new Date().toISOString(),
    };
    return (0, formatter_1.format)(result, deps.outputFormat);
}
//# sourceMappingURL=commands.js.map