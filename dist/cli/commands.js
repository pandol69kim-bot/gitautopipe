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
exports.runAnalyze = runAnalyze;
exports.runDeploy = runDeploy;
exports.runWorkflow = runWorkflow;
exports.runStatus = runStatus;
const path = __importStar(require("path"));
const simple_git_1 = __importDefault(require("simple-git"));
const formatter_1 = require("./formatter");
const vault_scanner_1 = require("../core/vault-scanner");
const github_1 = require("../integrations/github");
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
    await deps.orchestrator.emit(`${target}:sync`, { target });
    const result = {
        action: 'sync',
        target,
        status: 'completed',
        timestamp: new Date().toISOString(),
    };
    return (0, formatter_1.format)(result, deps.outputFormat);
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