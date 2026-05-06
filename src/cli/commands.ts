import * as path from 'path';
import simpleGit, { SimpleGit, StatusResult } from 'simple-git';
import type { WorkflowOrchestrator } from '../workflows/orchestrator';
import type { OutputFormat } from './formatter';
import { format } from './formatter';
import { VaultScanner } from '../core/vault-scanner';
import type { FolderType } from '../types/vault';
import { GitHubSync } from '../integrations/github';
import type { ChangedFile, GitHubConfig, SyncResult } from '../types/github';
import { Client as NotionSdkClient } from '@notionhq/client';
import { NotionMCPConnector, normalizeNotionId } from '../integrations/notion';
import type { NotionClient } from '../integrations/notion';
import { syncNotionBidirectional } from '../integrations/notion-sync';
import { ConfigManager } from './config-manager';
import { validateCronExpression } from '../workflows/cron';

interface NotionApiErrorLike {
  code?: string;
  message?: string;
  request_id?: string;
  additional_data?: {
    integration_id?: string;
  };
}

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
  configManager?: ConfigManager;
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

export interface NotionCheckOptions {
  id?: string;
}

export interface ScheduleAddOptions {
  workflowId: string;
  cron: string;
}

export interface ScheduleRemoveOptions {
  workflowId: string;
}

export interface ScheduleRunDueOptions {
  at?: string;
}

export interface ScheduleStartOptions {
  intervalSeconds?: number;
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

  if (target === 'notion') {
    const syncSummary = await runNotionSync();
    return format(
      {
        action: 'sync',
        target,
        status: 'completed',
        ...syncSummary,
        timestamp: new Date().toISOString(),
      },
      deps.outputFormat
    );
  }

  if (target === 'all') {
    const [notion, github] = await Promise.all([runNotionSync(), runGitHubSync()]);
    return format(
      {
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
      },
      deps.outputFormat
    );
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

async function runNotionSync(): Promise<Awaited<ReturnType<typeof syncNotionBidirectional>>> {
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

  const connector = new NotionMCPConnector(
    {
      token,
      defaultDatabaseId: databaseId,
      titlePropertyName: process.env['NOTION_TITLE_PROPERTY'],
    },
    new NotionSdkClient({ auth: token }) as unknown as NotionClient
  );

  try {
    return await syncNotionBidirectional({
      connector,
      databaseId,
      paths: {
        vaultBasePath,
        meetingsFolder,
        meetingsPath: configuredMeetingsPath ? path.resolve(configuredMeetingsPath) : undefined,
      },
    });
  } catch (error) {
    throw mapNotionSyncError(error, databaseId);
  }
}

export function mapNotionSyncError(error: unknown, databaseId: string): Error {
  const notionError = error as NotionApiErrorLike;
  if (
    notionError?.code === 'validation_error' &&
    notionError.message?.includes('Name is not a property that exists')
  ) {
    return new Error(
      [
        'Notion title 속성명이 현재 코드의 기본값과 일치하지 않습니다.',
        'DB의 title 속성명을 자동 탐지하도록 구성되어 있으니 최신 빌드로 다시 실행하세요.',
        '계속 실패하면 .env에 NOTION_TITLE_PROPERTY=<실제 title 속성명>을 지정하세요.',
        `database_id=${databaseId}`,
        notionError.request_id ? `request_id=${notionError.request_id}` : undefined,
      ]
        .filter(Boolean)
        .join(' ')
    );
  }

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

async function runNotionProbe<T>(
  operation: () => Promise<T>
): Promise<{ ok: boolean; data?: T; error?: { code?: string; message: string; status?: number } }> {
  try {
    const data = await operation();
    return { ok: true, data };
  } catch (error) {
    if (error instanceof Error) {
      const apiError = error as Error & { code?: string; status?: number };
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

function extractNotionTitle(
  title: Array<{ plain_text?: string }> | undefined
): string | undefined {
  return Array.isArray(title) ? title.map((item) => item.plain_text ?? '').join('').trim() : undefined;
}

function extractDataSourceTitle(response: unknown): string | undefined {
  const dataSource = response as {
    title?: Array<{ plain_text?: string }>;
    name?: string;
  };

  if (typeof dataSource.name === 'string' && dataSource.name.trim().length > 0) {
    return dataSource.name;
  }

  return extractNotionTitle(dataSource.title);
}

function buildNotionDiagnosis(params: {
  rawId: string;
  normalizedId: string;
  databaseCheck: {
    ok: boolean;
    data?: { id: string; title?: string; dataSourceIds: string[] };
    error?: { code?: string; message: string; status?: number };
  };
  dataSourceChecks: Array<{
    ok: boolean;
    targetId: string;
    data?: { id: string; title?: string; parent?: unknown };
    error?: { code?: string; message: string; status?: number };
  }>;
}): { status: 'ok' | 'warning' | 'failed'; guidance: string[] } {
  const guidance: string[] = [];

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

export function runScheduleList(deps: CommandDeps): string {
  return format(
    {
      action: 'schedule-list',
      schedules: deps.orchestrator.getSchedules().map((schedule) => ({
        workflowId: schedule.workflowId,
        cron: schedule.cron,
        registeredAt: schedule.registeredAt.toISOString(),
      })),
      timestamp: new Date().toISOString(),
    },
    deps.outputFormat
  );
}

export function runScheduleAdd(opts: ScheduleAddOptions, deps: CommandDeps): string {
  if (!deps.configManager) {
    throw new Error('configManager is required for schedule management.');
  }

  validateCronExpression(opts.cron);
  deps.orchestrator.scheduleWorkflow(opts.workflowId, opts.cron);
  deps.configManager.setWorkflowSchedule(opts.workflowId, opts.cron);

  return format(
    {
      action: 'schedule-add',
      workflowId: opts.workflowId,
      cron: opts.cron,
      status: 'scheduled',
      timestamp: new Date().toISOString(),
    },
    deps.outputFormat
  );
}

export function runScheduleRemove(opts: ScheduleRemoveOptions, deps: CommandDeps): string {
  if (!deps.configManager) {
    throw new Error('configManager is required for schedule management.');
  }

  const removed = deps.configManager.removeWorkflowSchedule(opts.workflowId);
  const unscheduled = deps.orchestrator.unscheduleWorkflow(opts.workflowId);

  return format(
    {
      action: 'schedule-remove',
      workflowId: opts.workflowId,
      removed,
      unscheduled,
      timestamp: new Date().toISOString(),
    },
    deps.outputFormat
  );
}

export async function runScheduleRunDue(
  opts: ScheduleRunDueOptions,
  deps: CommandDeps
): Promise<string> {
  const at = parseScheduleDate(opts.at);
  const executions = await deps.orchestrator.runDueSchedules(at);

  return format(
    {
      action: 'schedule-run-due',
      requestedAt: at.toISOString(),
      dueCount: executions.length,
      executions,
      timestamp: new Date().toISOString(),
    },
    deps.outputFormat
  );
}

export async function runScheduleStart(
  opts: ScheduleStartOptions,
  deps: CommandDeps
): Promise<string> {
  const intervalSeconds = opts.intervalSeconds ?? 60;
  if (!Number.isFinite(intervalSeconds) || intervalSeconds <= 0) {
    throw new Error(`intervalSeconds는 1 이상의 숫자여야 합니다: ${intervalSeconds}`);
  }

  const intervalMs = intervalSeconds * 1000;
  let isTickRunning = false;

  const tick = async () => {
    if (isTickRunning) {
      return;
    }

    isTickRunning = true;
    try {
      const executions = await deps.orchestrator.runDueSchedules(new Date());
      if (executions.length > 0) {
        console.log(
          format(
            {
              action: 'schedule-tick',
              dueCount: executions.length,
              executions,
              timestamp: new Date().toISOString(),
            },
            deps.outputFormat
          )
        );
      }
    } finally {
      isTickRunning = false;
    }
  };

  await tick();
  const timer = setInterval(() => {
    void tick();
  }, intervalMs);

  const stop = () => {
    clearInterval(timer);
    process.off('SIGINT', stop);
    process.off('SIGTERM', stop);
  };

  process.on('SIGINT', stop);
  process.on('SIGTERM', stop);

  return format(
    {
      action: 'schedule-start',
      status: 'running',
      intervalSeconds,
      schedules: deps.orchestrator.getSchedules().length,
      timestamp: new Date().toISOString(),
    },
    deps.outputFormat
  );
}

export async function runNotionCheck(
  opts: NotionCheckOptions,
  deps: CommandDeps
): Promise<string> {
  const token = process.env['NOTION_TOKEN'];
  if (!token) {
    throw new Error('NOTION_TOKEN is required.');
  }

  const rawId = opts.id ?? process.env['NOTION_DATABASE_ID'];
  if (!rawId) {
    throw new Error('NOTION_DATABASE_ID is required.');
  }

  const normalizedId = normalizeNotionId(rawId);
  const client = new NotionSdkClient({ auth: token });

  const databaseCheck = await runNotionProbe(async () => {
    const response = await client.databases.retrieve({ database_id: normalizedId });
    const database = response as {
      id: string;
      title?: Array<{ plain_text?: string }>;
      data_sources?: Array<{ id?: string }>;
    };

    return {
      id: database.id,
      title: extractNotionTitle(database.title),
      dataSourceIds: (database.data_sources ?? [])
        .map((item) => item.id)
        .filter((value): value is string => typeof value === 'string' && value.length > 0),
    };
  });

  const candidateIds = Array.from(
    new Set([normalizedId, ...(databaseCheck.data?.dataSourceIds ?? [])])
  );

  const dataSourceChecks = await Promise.all(
    candidateIds.map(async (targetId) => {
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
    })
  );

  const diagnosis = buildNotionDiagnosis({
    rawId,
    normalizedId,
    databaseCheck,
    dataSourceChecks,
  });

  return format(
    {
      action: 'notion-check',
      status: diagnosis.status,
      rawId,
      normalizedId,
      databaseCheck,
      dataSourceChecks,
      guidance: diagnosis.guidance,
      timestamp: new Date().toISOString(),
    },
    deps.outputFormat
  );
}

export function runStatus(deps: CommandDeps): string {
  const schedules = deps.orchestrator.getSchedules();
  const predefined = ['onMissionUpdate', 'onMeetingSync', 'onSkillUpdate', 'weeklyDigest'];
  const workflows = predefined.map((id) => ({
    id,
    registered: !!deps.orchestrator.getWorkflow(id),
    historyCount: deps.orchestrator.getExecutionHistory(id).length,
  }));
  const defaultSchedules = predefined
    .map((id) => deps.orchestrator.getWorkflow(id))
    .filter((workflow): workflow is NonNullable<typeof workflow> => Boolean(workflow))
    .flatMap((workflow) =>
      workflow.triggers
        .filter((trigger) => trigger.type === 'cron' && Boolean(trigger.cron))
        .map((trigger) => ({
          workflowId: workflow.id,
          cron: trigger.cron as string,
          source: 'default' as const,
        }))
    );
  const configuredSchedules = (deps.configManager?.listWorkflowSchedules() ?? []).map((schedule) => ({
    ...schedule,
    source: 'config' as const,
  }));
  const defaultScheduleIds = new Set(defaultSchedules.map((schedule) => schedule.workflowId));
  const configuredScheduleIds = new Set(configuredSchedules.map((schedule) => schedule.workflowId));
  const result = {
    workflows,
    schedules: schedules.length,
    defaultSchedules,
    configuredSchedules,
    effectiveSchedules: schedules.map((schedule) => ({
      workflowId: schedule.workflowId,
      cron: schedule.cron,
      source: defaultScheduleIds.has(schedule.workflowId) && configuredScheduleIds.has(schedule.workflowId)
        ? 'default+config'
        : defaultScheduleIds.has(schedule.workflowId)
          ? 'default'
          : configuredScheduleIds.has(schedule.workflowId)
            ? 'config'
            : 'runtime',
      registeredAt: schedule.registeredAt.toISOString(),
    })),
    timestamp: new Date().toISOString(),
  };
  return format(result, deps.outputFormat);
}

function parseScheduleDate(value: string | undefined): Date {
  if (!value) {
    return new Date();
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    throw new Error(`잘못된 날짜 형식입니다: ${value}`);
  }

  return date;
}
