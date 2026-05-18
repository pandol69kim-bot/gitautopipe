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
exports.GitHubSync = void 0;
const rest_1 = require("@octokit/rest");
const simple_git_1 = __importDefault(require("simple-git"));
const path = __importStar(require("path"));
const zod_1 = require("zod");
const GitHubConfigSchema = zod_1.z.object({
    owner: zod_1.z.string().min(1),
    repo: zod_1.z.string().min(1),
    branch: zod_1.z.string().min(1),
    token: zod_1.z.string().min(1),
    localRepoPath: zod_1.z.string().min(1),
});
class GitHubSync {
    config;
    octokit;
    git;
    constructor(config) {
        this.config = this.validateConfig(config);
        this.octokit = new rest_1.Octokit({ auth: config.token });
        this.git = (0, simple_git_1.default)(config.localRepoPath);
    }
    // ── 3.2 로컬 Git 작업 ────────────────────────────────────────────
    async commitAndPush(files, message) {
        await this.git.fetch('origin', this.config.branch);
        const status = await this.git.status();
        const conflicts = this.detectConflictsFromStatus(status);
        if (conflicts.length > 0) {
            const paths = conflicts.map((c) => c.filePath).join(', ');
            throw new Error(`충돌 감지됨: ${paths}`);
        }
        const filePaths = files.map((f) => f.relativePath);
        await this.git.add(filePaths);
        const commitResult = await this.git.commit(message);
        await this.git.push('origin', this.config.branch);
        return {
            sha: commitResult.commit,
            message,
            filesChanged: filePaths.length,
            timestamp: new Date(),
        };
    }
    async pull() {
        await this.git.pull('origin', this.config.branch, { '--rebase': 'false' });
    }
    async getStatus() {
        return this.git.status();
    }
    async filterIgnoredFiles(files) {
        if (files.length === 0) {
            return [];
        }
        const relativePaths = [...new Set(files.map((file) => file.relativePath))];
        const ignoredPaths = new Set(await this.git.checkIgnore(relativePaths));
        return files.filter((file) => !ignoredPaths.has(file.relativePath));
    }
    async getLatestChanges(since) {
        const log = await this.git.log({
            from: since.toISOString(),
            to: 'HEAD',
        });
        const changedFiles = [];
        for (const logEntry of log.all) {
            const diff = await this.git.diff([`${logEntry.hash}^`, logEntry.hash, '--name-status']);
            const lines = diff.trim().split('\n').filter(Boolean);
            for (const line of lines) {
                const [status, filePath] = line.split('\t');
                if (!filePath)
                    continue;
                changedFiles.push({
                    filePath: path.join(this.config.localRepoPath, filePath),
                    relativePath: filePath,
                    folderType: 'mission',
                    changeType: status === 'A' ? 'add' : status === 'D' ? 'delete' : 'modify',
                });
            }
        }
        return changedFiles;
    }
    // ── 3.3 GitHub API 연동 ──────────────────────────────────────────
    async createPullRequest(title, body, headBranch) {
        const response = await this.octokit.pulls.create({
            owner: this.config.owner,
            repo: this.config.repo,
            title,
            body,
            head: headBranch ?? this.config.branch,
            base: 'main',
        });
        return {
            number: response.data.number,
            url: response.data.html_url,
            title: response.data.title,
            state: response.data.state,
        };
    }
    async getOpenPullRequests() {
        const response = await this.octokit.pulls.list({
            owner: this.config.owner,
            repo: this.config.repo,
            state: 'open',
        });
        return response.data.map((pr) => ({
            number: pr.number,
            url: pr.html_url,
            title: pr.title,
            state: pr.state,
        }));
    }
    // ── 3.4 자동 커밋 메시지 생성 ────────────────────────────────────
    static buildCommitMessage(context) {
        switch (context.type) {
            case 'mission':
                return `[Mission] Week${String(context.weekNumber).padStart(2, '0')} - ${context.memberName} 과제 업데이트`;
            case 'meetings':
                return `[Meetings] ${context.date} 위클리 회의록 추가`;
            case 'skillInsight':
                return `[Skill/Insight] ${context.topic} 인사이트 추가`;
            case 'sharing':
                return `[Sharing] ${context.title} 공유 콘텐츠 추가`;
            case 'analysis':
                return `[Analysis] ${context.period} 분석 리포트 업데이트`;
            case 'linkedin':
                return `[LinkedIn] ${context.title} 포스트 초안 추가`;
            case 'generic':
                return context.description;
        }
    }
    // ── 3.5 충돌 감지 ────────────────────────────────────────────────
    async detectConflicts() {
        const status = await this.git.status();
        return this.detectConflictsFromStatus(status);
    }
    async sync(files, context) {
        try {
            await this.pull();
            const conflicts = await this.detectConflicts();
            if (conflicts.length > 0) {
                return { success: false, conflicts, error: '원격 브랜치와 충돌이 발생했습니다.' };
            }
            const message = GitHubSync.buildCommitMessage(context);
            const commit = await this.commitAndPush(files, message);
            return { success: true, commit, conflicts: [] };
        }
        catch (error) {
            return {
                success: false,
                conflicts: [],
                error: error instanceof Error ? error.message : '알 수 없는 오류',
            };
        }
    }
    detectConflictsFromStatus(status) {
        return status.conflicted.map((filePath) => ({
            filePath,
            localSha: 'local',
            remoteSha: 'remote',
            detectedAt: new Date(),
        }));
    }
    validateConfig(config) {
        const result = GitHubConfigSchema.safeParse(config);
        if (!result.success) {
            const issues = result.error.issues
                .map((i) => `  - ${i.path.join('.')}: ${i.message}`)
                .join('\n');
            throw new Error(`GitHubConfig 검증 실패:\n${issues}`);
        }
        return config;
    }
}
exports.GitHubSync = GitHubSync;
//# sourceMappingURL=github.js.map