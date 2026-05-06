import * as path from 'path';
import simpleGit, { SimpleGit, StatusResult } from 'simple-git';
import type { WorkflowOrchestrator } from '../workflows/orchestrator';
import type { OutputFormat } from './formatter';
import { format } from './formatter';
import { VaultScanner } from '../core/vault-scanner';
import type { FolderType } from '../types/vault';
import { GitHubSync } from '../integrations/github';
import type { ChangedFile, GitHubConfig, SyncResult } from '../types/github';

const DEFAULT_GITHUB_SYNC_EXCLUDES = [
  '.claude/',
  '.git/',
  'node_modules/',
  'vault/.obsidian/',
];

function createVaultScannerFromEnv(): VaultScanner {
  const basePath = path.resolve(process.env['VAULT_PATH'] ?? './vault');
  return new VaultScanner({
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

export interface CommandDeps {
  orchestrator: WorkflowOrchestrator;
  outputFormat: OutputFormat;
}

export interface ScanOptions {
  folder?: string;
}

export interface SyncOptions {
  target?: string;
}

export interface AnalyzeOptions {
  week?: number;
}

export interface DeployOptions {
  preview?: boolean;
}

export interface WorkflowRunOptions {
  workflowId: string;
  payload?: Record<string, unknown>;
}

export async function runScan(opts: ScanOptions, deps: CommandDeps): Promise<string> {
  const scanner = createVaultScannerFromEnv();
  const folderTypes: FolderType[] = [
    'mission',
    'meetings',
    'skillInsight',
    'sharing',
    'analysis',
    'linkedin',
  ];
  const targets = opts.folder ? [opts.folder as FolderType] : folderTypes;

  const counts: Record<string, number> = {};
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
  return format(result, deps.outputFormat);
}

export async function runSync(opts: SyncOptions, deps: CommandDeps): Promise<string> {
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
    return format(result, deps.outputFormat);
  }

  await deps.orchestrator.emit(`${target}:sync`, { target });
  const result = {
    action: 'sync',
    target,
    status: 'completed',
    timestamp: new Date().toISOString(),
  };
  return format(result, deps.outputFormat);
}

async function runGitHubSync(): Promise<SyncResult> {
  const cwd = process.cwd();
  const git = simpleGit(cwd);
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
  const githubSync = new GitHubSync(config);
  return githubSync.sync(files, {
    type: 'generic',
    description: `sync: ${new Date().toISOString()}`,
  });
}

async function createGitHubConfig(
  git: SimpleGit,
  cwd: string
): Promise<GitHubConfig> {
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

function parseGitHubRemote(remoteUrl: string): { owner: string; repo: string } {
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

function mapStatusToChangedFiles(status: StatusResult, cwd: string): ChangedFile[] {
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

function isExcludedFromGitHubSync(filePath: string): boolean {
  const normalized = filePath.replace(/\\/g, '/');
  return DEFAULT_GITHUB_SYNC_EXCLUDES.some((prefix) => normalized.startsWith(prefix));
}

function inferFolderType(filePath: string): FolderType {
  const normalized = filePath.replace(/\\/g, '/').toLowerCase();
  if (normalized.includes('/meetings/') || normalized.startsWith('meetings/')) return 'meetings';
  if (normalized.includes('/skillinsight/') || normalized.startsWith('skillinsight/')) {
    return 'skillInsight';
  }
  if (normalized.includes('/sharing/') || normalized.startsWith('sharing/')) return 'sharing';
  if (normalized.includes('/analysis/') || normalized.startsWith('analysis/')) return 'analysis';
  if (normalized.includes('/linkedin/') || normalized.startsWith('linkedin/')) return 'linkedin';
  return 'mission';
}

export async function runAnalyze(opts: AnalyzeOptions, deps: CommandDeps): Promise<string> {
  await deps.orchestrator.executeWorkflow('onMissionUpdate', { week: opts.week });
  const result = {
    action: 'analyze',
    week: opts.week ?? 'current',
    status: 'completed',
    timestamp: new Date().toISOString(),
  };
  return format(result, deps.outputFormat);
}

export async function runDeploy(opts: DeployOptions, deps: CommandDeps): Promise<string> {
  await deps.orchestrator.emit('skill:updated', { preview: opts.preview ?? false });
  const result = {
    action: 'deploy',
    preview: opts.preview ?? false,
    status: 'completed',
    timestamp: new Date().toISOString(),
  };
  return format(result, deps.outputFormat);
}

export async function runWorkflow(opts: WorkflowRunOptions, deps: CommandDeps): Promise<string> {
  const execution = await deps.orchestrator.executeWorkflow(opts.workflowId, opts.payload);
  return format(execution, deps.outputFormat);
}

export function runStatus(deps: CommandDeps): string {
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
  return format(result, deps.outputFormat);
}
