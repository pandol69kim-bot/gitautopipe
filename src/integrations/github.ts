import { Octokit } from '@octokit/rest';
import simpleGit, { SimpleGit, StatusResult } from 'simple-git';
import * as path from 'path';
import { z } from 'zod';
import type {
  GitHubConfig,
  ChangedFile,
  CommitResult,
  PullRequestResult,
  ConflictInfo,
  SyncResult,
  CommitContext,
} from '../types/github';

const GitHubConfigSchema = z.object({
  owner: z.string().min(1),
  repo: z.string().min(1),
  branch: z.string().min(1),
  token: z.string().min(1),
  localRepoPath: z.string().min(1),
});

export class GitHubSync {
  private readonly config: GitHubConfig;
  private readonly octokit: Octokit;
  private readonly git: SimpleGit;

  constructor(config: GitHubConfig) {
    this.config = this.validateConfig(config);
    this.octokit = new Octokit({ auth: config.token });
    this.git = simpleGit(config.localRepoPath);
  }

  // ── 3.2 로컬 Git 작업 ────────────────────────────────────────────

  async commitAndPush(files: ChangedFile[], message: string): Promise<CommitResult> {
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

  async pull(): Promise<void> {
    await this.git.pull('origin', this.config.branch, { '--rebase': 'false' });
  }

  async getStatus(): Promise<StatusResult> {
    return this.git.status();
  }

  async filterIgnoredFiles(files: ChangedFile[]): Promise<ChangedFile[]> {
    if (files.length === 0) {
      return [];
    }

    const relativePaths = [...new Set(files.map((file) => file.relativePath))];
    const ignoredPaths = new Set(await this.git.checkIgnore(relativePaths));

    return files.filter((file) => !ignoredPaths.has(file.relativePath));
  }

  async getLatestChanges(since: Date): Promise<ChangedFile[]> {
    const log = await this.git.log({
      from: since.toISOString(),
      to: 'HEAD',
    });

    const changedFiles: ChangedFile[] = [];

    for (const logEntry of log.all) {
      const diff = await this.git.diff([`${logEntry.hash}^`, logEntry.hash, '--name-status']);
      const lines = diff.trim().split('\n').filter(Boolean);

      for (const line of lines) {
        const [status, filePath] = line.split('\t');
        if (!filePath) continue;

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

  async createPullRequest(
    title: string,
    body: string,
    headBranch?: string
  ): Promise<PullRequestResult> {
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
      state: response.data.state as 'open' | 'closed' | 'merged',
    };
  }

  async getOpenPullRequests(): Promise<PullRequestResult[]> {
    const response = await this.octokit.pulls.list({
      owner: this.config.owner,
      repo: this.config.repo,
      state: 'open',
    });

    return response.data.map((pr) => ({
      number: pr.number,
      url: pr.html_url,
      title: pr.title,
      state: pr.state as 'open' | 'closed' | 'merged',
    }));
  }

  // ── 3.4 자동 커밋 메시지 생성 ────────────────────────────────────

  static buildCommitMessage(context: CommitContext): string {
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

  async detectConflicts(): Promise<ConflictInfo[]> {
    const status = await this.git.status();
    return this.detectConflictsFromStatus(status);
  }

  async sync(files: ChangedFile[], context: CommitContext): Promise<SyncResult> {
    try {
      await this.pull();

      const conflicts = await this.detectConflicts();
      if (conflicts.length > 0) {
        return { success: false, conflicts, error: '원격 브랜치와 충돌이 발생했습니다.' };
      }

      const message = GitHubSync.buildCommitMessage(context);
      const commit = await this.commitAndPush(files, message);

      return { success: true, commit, conflicts: [] };
    } catch (error: unknown) {
      return {
        success: false,
        conflicts: [],
        error: error instanceof Error ? error.message : '알 수 없는 오류',
      };
    }
  }

  private detectConflictsFromStatus(status: StatusResult): ConflictInfo[] {
    return status.conflicted.map((filePath) => ({
      filePath,
      localSha: 'local',
      remoteSha: 'remote',
      detectedAt: new Date(),
    }));
  }

  private validateConfig(config: GitHubConfig): GitHubConfig {
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
