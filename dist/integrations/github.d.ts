import { StatusResult } from 'simple-git';
import type { GitHubConfig, ChangedFile, CommitResult, PullRequestResult, ConflictInfo, SyncResult, CommitContext } from '../types/github';
export declare class GitHubSync {
    private readonly config;
    private readonly octokit;
    private readonly git;
    constructor(config: GitHubConfig);
    commitAndPush(files: ChangedFile[], message: string): Promise<CommitResult>;
    pull(): Promise<void>;
    getStatus(): Promise<StatusResult>;
    getLatestChanges(since: Date): Promise<ChangedFile[]>;
    createPullRequest(title: string, body: string, headBranch?: string): Promise<PullRequestResult>;
    getOpenPullRequests(): Promise<PullRequestResult[]>;
    static buildCommitMessage(context: CommitContext): string;
    detectConflicts(): Promise<ConflictInfo[]>;
    sync(files: ChangedFile[], context: CommitContext): Promise<SyncResult>;
    private detectConflictsFromStatus;
    private validateConfig;
}
//# sourceMappingURL=github.d.ts.map