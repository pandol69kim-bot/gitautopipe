import type { FolderType } from './vault';
export interface GitHubConfig {
    owner: string;
    repo: string;
    branch: string;
    token: string;
    localRepoPath: string;
}
export interface ChangedFile {
    filePath: string;
    relativePath: string;
    folderType: FolderType;
    changeType: 'add' | 'modify' | 'delete';
}
export interface CommitResult {
    sha: string;
    message: string;
    filesChanged: number;
    timestamp: Date;
}
export interface PullRequestResult {
    number: number;
    url: string;
    title: string;
    state: 'open' | 'closed' | 'merged';
}
export interface ConflictInfo {
    filePath: string;
    localSha: string;
    remoteSha: string;
    detectedAt: Date;
}
export interface SyncResult {
    success: boolean;
    commit?: CommitResult;
    conflicts: ConflictInfo[];
    error?: string;
}
export type CommitContext = {
    type: 'mission';
    weekNumber: number;
    memberName: string;
} | {
    type: 'meetings';
    date: string;
} | {
    type: 'skillInsight';
    topic: string;
} | {
    type: 'sharing';
    title: string;
} | {
    type: 'analysis';
    period: string;
} | {
    type: 'linkedin';
    title: string;
} | {
    type: 'generic';
    description: string;
};
//# sourceMappingURL=github.d.ts.map