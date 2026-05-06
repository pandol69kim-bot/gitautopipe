import { EventEmitter } from 'events';
import { randomUUID } from 'crypto';
import type {
  Workflow,
  WorkflowStep,
  WorkflowContext,
  WorkflowStatus,
  StepResult,
  Execution,
  ExecutionResult,
  ErrorHandlingConfig,
} from '../types/workflow';
import * as path from 'path';
import { Client as NotionSdkClient } from '@notionhq/client';
import { ReportGenerator } from '../core/report-generator';
import { VaultScanner } from '../core/vault-scanner';
import { createAnalysisEngineFromEnv } from '../integrations/analysis-factory';
import { GitHubSync } from '../integrations/github';
import { NotionMCPConnector } from '../integrations/notion';
import type { NotionClient as INotionClient } from '../integrations/notion';
import { syncNotionBidirectional } from '../integrations/notion-sync';
import type { AnalysisEngine } from '../types/analysis';
import type { Document, WeeklyData } from '../types/claude';
import { isCronDue } from './cron';

function createGitHubSyncFromEnv(): GitHubSync {
  const token = process.env['GITHUB_TOKEN'] ?? process.env['GITHUB_API_KEY'];
  const owner = process.env['GITHUB_OWNER'];
  const repo = process.env['GITHUB_REPO'];
  const branch = process.env['GITHUB_BRANCH'] ?? 'main';
  const localRepoPath = process.env['GITHUB_LOCAL_PATH'] ?? process.cwd();

  if (!token || !owner || !repo) {
    throw new Error('GITHUB_TOKEN, GITHUB_OWNER, GITHUB_REPO 환경변수가 필요합니다.');
  }

  return new GitHubSync({ owner, repo, branch, token, localRepoPath });
}

function createNotionConnectorFromEnv(): {
  connector: NotionMCPConnector;
  databaseId: string;
  obsidianPath: string;
} {
  const token = process.env['NOTION_TOKEN'];
  const databaseId = process.env['NOTION_DATABASE_ID'];
  const obsidianPath = path.resolve(
    process.env['NOTION_OBSIDIAN_PATH'] ?? path.join(process.cwd(), 'vault', 'meetings')
  );

  if (!token) {
    throw new Error('NOTION_TOKEN 환경변수가 필요합니다.');
  }
  if (!databaseId) {
    throw new Error('NOTION_DATABASE_ID 환경변수가 필요합니다.');
  }

  const client = new NotionSdkClient({ auth: token }) as unknown as INotionClient;
  const connector = new NotionMCPConnector({ token, defaultDatabaseId: databaseId }, client);

  return { connector, databaseId, obsidianPath };
}

interface ScheduleEntry {
  workflowId: string;
  cron: string;
  registeredAt: Date;
}

interface WorkflowOrchestratorDeps {
  createAnalysisEngine?: () => AnalysisEngine;
  createGitHubSync?: () => GitHubSync;
  fetch?: (input: string, init?: { method?: string; headers?: Record<string, string>; body?: string }) => Promise<{ ok: boolean; status?: number }>;
}

interface MeetingCandidate {
  document: Document;
  weekNumber: number;
  weekYear: number;
  timestamp: number;
}

// ── WorkflowOrchestrator 클래스 ───────────────────────────────────────

export class WorkflowOrchestrator {
  private readonly workflows = new Map<string, Workflow>();
  private readonly history = new Map<string, Execution[]>();
  private readonly schedules = new Map<string, ScheduleEntry>();
  private readonly emitter = new EventEmitter();
  private readonly deps: WorkflowOrchestratorDeps;

  constructor(deps: WorkflowOrchestratorDeps = {}) {
    this.deps = deps;
    this.registerPredefinedWorkflows();
  }

  // ── Subtask 2: 등록 ───────────────────────────────────────────────

  registerWorkflow(workflow: Workflow): void {
    this.workflows.set(workflow.id, workflow);

    for (const trigger of workflow.triggers) {
      if (trigger.type === 'event' && trigger.event) {
        this.emitter.removeAllListeners(trigger.event);
        this.emitter.on(trigger.event, async (payload: Record<string, unknown>) => {
          await this.executeWorkflow(workflow.id, payload);
        });
      }
    }
  }

  getWorkflow(id: string): Workflow | undefined {
    return this.workflows.get(id);
  }

  // ── Subtask 2: 실행 ───────────────────────────────────────────────

  async executeWorkflow(
    workflowId: string,
    payload?: Record<string, unknown>
  ): Promise<ExecutionResult> {
    const workflow = this.workflows.get(workflowId);
    if (!workflow) throw new Error(`워크플로우를 찾을 수 없습니다: ${workflowId}`);

    const executionId = randomUUID();
    const triggeredAt = new Date();
    const stepResults: StepResult[] = [];
    let status: WorkflowStatus = 'running';

    const context: WorkflowContext = {
      workflowId,
      executionId,
      triggeredAt,
      payload,
    };

    for (const step of workflow.steps) {
      const stepResult = await this.executeStep(step, context, workflow.errorHandling);
      stepResults.push(stepResult);

      if (stepResult.status === 'failed') {
        if (workflow.errorHandling.strategy === 'stop') {
          status = 'failed';
          break;
        }
      }
    }

    if (status === 'running') {
      status = stepResults.some((r) => r.status === 'failed') ? 'failed' : 'completed';
    }

    const completedAt = new Date();
    const totalDurationMs = completedAt.getTime() - triggeredAt.getTime();

    const execution: Execution = {
      executionId,
      workflowId,
      status,
      triggeredAt,
      completedAt,
      stepResults,
    };

    const existing = this.history.get(workflowId) ?? [];
    this.history.set(workflowId, [...existing, execution]);

    return { executionId, workflowId, status, stepResults, totalDurationMs };
  }

  // ── Subtask 9: 실행 이력 ─────────────────────────────────────────

  getExecutionHistory(workflowId: string): Execution[] {
    return this.history.get(workflowId) ?? [];
  }

  // ── Subtask 4: Cron 스케줄러 ─────────────────────────────────────

  scheduleWorkflow(workflowId: string, cron: string): void {
    if (!this.workflows.has(workflowId)) {
      throw new Error(`워크플로우를 찾을 수 없습니다: ${workflowId}`);
    }

    this.schedules.set(workflowId, {
      workflowId,
      cron,
      registeredAt: new Date(),
    });
  }

  unscheduleWorkflow(workflowId: string): boolean {
    return this.schedules.delete(workflowId);
  }

  getSchedules(): ScheduleEntry[] {
    return Array.from(this.schedules.values());
  }

  async runDueSchedules(at: Date = new Date()): Promise<ExecutionResult[]> {
    const dueSchedules = this.getSchedules().filter((schedule) => isCronDue(schedule.cron, at));
    const executions: ExecutionResult[] = [];

    for (const schedule of dueSchedules) {
      const execution = await this.executeWorkflow(schedule.workflowId, {
        trigger: 'schedule',
        cron: schedule.cron,
        scheduledAt: at.toISOString(),
      });
      executions.push(execution);
    }

    return executions;
  }

  // ── Subtask 3: 이벤트 emit ────────────────────────────────────────

  async emit(event: string, payload: Record<string, unknown>): Promise<void> {
    const listeners = this.emitter.listeners(event);
    await Promise.all(listeners.map((fn) => fn(payload)));
  }

  // ── Subtask 10: 스텝 실행 + 에러 처리 ────────────────────────────

  private async executeStep(
    step: WorkflowStep,
    context: WorkflowContext,
    errorHandling: ErrorHandlingConfig
  ): Promise<StepResult> {
    const startedAt = new Date();
    const maxAttempts =
      errorHandling.strategy === 'retry' ? 1 + (errorHandling.maxRetries ?? 0) : 1;

    let lastError: Error | null = null;
    let output: unknown;

    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      try {
        if (attempt > 0 && errorHandling.retryDelayMs) {
          await this.sleep(errorHandling.retryDelayMs * Math.pow(2, attempt - 1));
        }
        output = await step.execute(context);
        lastError = null;
        break;
      } catch (err) {
        lastError = err instanceof Error ? err : new Error(String(err));
      }
    }

    const completedAt = new Date();
    const durationMs = completedAt.getTime() - startedAt.getTime();

    if (lastError) {
      return {
        stepId: step.id,
        status: 'failed',
        error: lastError.message,
        startedAt,
        completedAt,
        durationMs,
      };
    }

    return {
      stepId: step.id,
      status: 'completed',
      output,
      startedAt,
      completedAt,
      durationMs,
    };
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  // ── Subtask 5~8: 사전 정의 워크플로우 ────────────────────────────

  private registerPredefinedWorkflows(): void {
    // onGitHubSync: github:sync 이벤트 → pull → status 확인 → commit & push
    this.registerWorkflow({
      id: 'onGitHubSync',
      name: 'GitHub 동기화',
      steps: [
        {
          id: 'github-pull',
          name: '원격 최신화 (pull)',
          execute: async (_ctx: WorkflowContext) => {
            const sync = createGitHubSyncFromEnv();
            await sync.pull();
            return { message: 'pull 완료' };
          },
        },
        {
          id: 'github-status',
          name: '변경 파일 확인',
          execute: async (_ctx: WorkflowContext) => {
            const sync = createGitHubSyncFromEnv();
            const status = await sync.getStatus();
            return {
              modified: status.modified,
              created: status.created,
              deleted: status.deleted,
              total: status.modified.length + status.created.length + status.deleted.length,
            };
          },
        },
        {
          id: 'github-commit-push',
          name: '커밋 및 푸시',
          execute: async (_ctx: WorkflowContext) => {
            const sync = createGitHubSyncFromEnv();
            const status = await sync.getStatus();
            const allChanged = [...status.modified, ...status.created, ...status.deleted];

            if (allChanged.length === 0) {
              return { message: '변경 사항 없음 — 커밋 생략' };
            }

            const files = allChanged.map((f) => ({
              filePath: f,
              relativePath: f,
              folderType: 'mission' as const,
              changeType: 'modify' as const,
            }));

            const message = GitHubSync.buildCommitMessage({
              type: 'generic',
              description: `sync: ${new Date().toISOString()}`,
            });

            return sync.commitAndPush(files, message);
          },
        },
      ],
      triggers: [{ type: 'event', event: 'github:sync' }],
      errorHandling: { strategy: 'stop', notifyOnFailure: true },
    });

    // onNotionSync: notion:sync 이벤트 → Notion/Obsidian 양방향 동기화
    this.registerWorkflow({
      id: 'onNotionSync',
      name: 'Notion 동기화',
      steps: [
        {
          id: 'notion-sync-bidirectional',
          name: 'Notion-Obsidian 양방향 동기화',
          execute: async (ctx: WorkflowContext) => {
            const { connector, databaseId, obsidianPath } = createNotionConnectorFromEnv();
            const summary = await syncNotionBidirectional({
              connector,
              databaseId,
              paths: {
                vaultBasePath: path.resolve(process.env['VAULT_PATH'] ?? './vault'),
                meetingsFolder: process.env['VAULT_FOLDER_MEETINGS'] ?? 'meetings',
                meetingsPath: obsidianPath,
              },
            });
            ctx.payload = { ...ctx.payload, summary };
            return summary;
          },
        },
      ],
      triggers: [{ type: 'event', event: 'notion:sync' }],
      errorHandling: { strategy: 'stop', notifyOnFailure: true },
    });

    // onMissionUpdate: Mission 파일 변경 → 분석 → LinkedIn 초안
    this.registerWorkflow({
      id: 'onMissionUpdate',
      name: 'Mission 업데이트 처리',
      steps: [
        this.makeLogStep('mission-log', 'Mission 파일 변경 감지'),
        this.makeLogStep('claude-analyze', 'Claude 분석 실행'),
        this.makeLogStep('linkedin-draft', 'LinkedIn 초안 생성'),
      ],
      triggers: [{ type: 'event', event: 'mission:updated' }],
      errorHandling: { strategy: 'continue', notifyOnFailure: true },
    });

    // onMeetingSync: Notion 동기화 → Analysis 보고서 업데이트
    this.registerWorkflow({
      id: 'onMeetingSync',
      name: 'Notion 미팅 동기화',
      steps: [
        this.makeLogStep('notion-fetch', 'Notion 미팅 데이터 조회'),
        this.makeLogStep('obsidian-sync', 'Obsidian 동기화'),
        this.createMeetingReportStep(),
      ],
      triggers: [{ type: 'event', event: 'meeting:synced' }],
      errorHandling: {
        strategy: 'retry',
        maxRetries: 2,
        retryDelayMs: 1000,
        notifyOnFailure: true,
      },
    });

    // onSkillUpdate: Skill/Insight 변경 → 배포
    this.registerWorkflow({
      id: 'onSkillUpdate',
      name: 'Skill/Insight 게시물 배포',
      steps: [
        this.makeLogStep('site-build', '정적 사이트 빌드'),
        this.makeLogStep('vercel-deploy', 'Vercel 배포'),
        this.makeLogStep('deploy-notify', '배포 알림 전송'),
      ],
      triggers: [{ type: 'event', event: 'skill:updated' }],
      errorHandling: { strategy: 'stop', notifyOnFailure: true },
    });

    // weeklyDigest: 주간 요약 보고서 (매주 월요일 09:00)
    this.registerWorkflow({
      id: 'weeklyDigest',
      name: '주간 다이제스트 생성',
      steps: [
        this.createWeeklyDigestScanStep(),
        this.createWeeklyDigestReportStep(),
        this.createWeeklyDigestGitHubCommitStep(),
        this.createWeeklyDigestNotifyStep(),
      ],
      triggers: [{ type: 'cron', cron: '0 9 * * 1' }],
      errorHandling: { strategy: 'continue', notifyOnFailure: true },
    });

    // weeklyDigest에 cron 스케줄 자동 등록
    this.scheduleWorkflow('weeklyDigest', '0 9 * * 1');
  }

  private makeLogStep(id: string, name: string): WorkflowStep {
    return {
      id,
      name,
      execute: async (_ctx: WorkflowContext) => {
        return { stepId: id, message: `${name} 완료` };
      },
    };
  }

  private createMeetingReportStep(): WorkflowStep {
    return {
      id: 'report-update',
      name: 'Analysis 보고서 업데이트',
      execute: async (ctx: WorkflowContext) => {
        try {
          return await this.generateWeeklyDigestReport(ctx);
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          throw new Error(`Analysis 보고서 업데이트 실패: ${message}`);
        }
      },
    };
  }

  private createWeeklyDigestScanStep(): WorkflowStep {
    return {
      id: 'vault-scan',
      name: '볼트 주간 데이터 수집',
      execute: async (ctx: WorkflowContext) => {
        const scanner = this.createVaultScannerFromEnv();
        const weeklyData = await this.collectMeetingWeeklyData(scanner, ctx.payload);

        if (!weeklyData) {
          const skipped = { status: 'skipped', reason: 'meetings-not-found' };
          ctx.payload = { ...ctx.payload, weeklyDigest: { weeklyData: null, scan: skipped } };
          return skipped;
        }

        const result = {
          status: 'collected',
          weekNumber: weeklyData.weekNumber,
          totalDocuments: weeklyData.documents.length,
          memberCount: weeklyData.memberCount ?? 0,
        };
        ctx.payload = {
          ...ctx.payload,
          weeklyDigest: {
            ...(this.readWeeklyDigestPayload(ctx.payload) ?? {}),
            weeklyData,
            scan: result,
          },
        };

        return result;
      },
    };
  }

  private createWeeklyDigestReportStep(): WorkflowStep {
    return {
      id: 'weekly-report',
      name: '주간 보고서 생성',
      execute: async (ctx: WorkflowContext) => {
        try {
          return await this.generateWeeklyDigestReport(ctx);
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          throw new Error(`주간 보고서 생성 실패: ${message}`);
        }
      },
    };
  }

  private createWeeklyDigestGitHubCommitStep(): WorkflowStep {
    return {
      id: 'github-commit',
      name: 'GitHub 커밋',
      execute: async (ctx: WorkflowContext) => {
        const weeklyDigest = this.readWeeklyDigestPayload(ctx.payload);
        const report = weeklyDigest?.report;

        if (!report || report.status !== 'generated' || !report.reportPath) {
          const skipped = { status: 'skipped', reason: 'report-not-generated' };
          ctx.payload = {
            ...ctx.payload,
            weeklyDigest: {
              ...(weeklyDigest ?? {}),
              github: skipped,
            },
          };
          return skipped;
        }

        if (!this.hasGitHubSyncEnv()) {
          const skipped = { status: 'skipped', reason: 'github-env-not-configured' };
          ctx.payload = {
            ...ctx.payload,
            weeklyDigest: {
              ...(weeklyDigest ?? {}),
              github: skipped,
            },
          };
          return skipped;
        }

        const sync = this.deps.createGitHubSync?.() ?? createGitHubSyncFromEnv();
        const relativePath = path.relative(process.env['GITHUB_LOCAL_PATH'] ?? process.cwd(), report.reportPath);
        const commit = await sync.commitAndPush(
          [
            {
              filePath: report.reportPath,
              relativePath,
              folderType: 'analysis',
              changeType: 'modify',
            },
          ],
          GitHubSync.buildCommitMessage({
            type: 'analysis',
            period: `week${String(report.weekNumber).padStart(2, '0')}`,
          })
        );

        const result = {
          status: 'committed',
          sha: commit.sha,
          message: commit.message,
          filesChanged: commit.filesChanged,
        };
        ctx.payload = {
          ...ctx.payload,
          weeklyDigest: {
            ...(weeklyDigest ?? {}),
            github: result,
          },
        };

        return result;
      },
    };
  }

  private createWeeklyDigestNotifyStep(): WorkflowStep {
    return {
      id: 'digest-notify',
      name: '다이제스트 알림 전송',
      execute: async (ctx: WorkflowContext) => {
        const weeklyDigest = this.readWeeklyDigestPayload(ctx.payload);
        const webhookUrl = this.getWeeklyDigestWebhookUrl();
        if (!webhookUrl) {
          const skipped = {
            status: 'skipped',
            reason: 'webhook-not-configured',
            weekNumber: weeklyDigest?.report?.weekNumber ?? weeklyDigest?.scan?.weekNumber ?? null,
            reportPath: weeklyDigest?.report?.reportPath ?? null,
            githubStatus: weeklyDigest?.github?.status ?? 'skipped',
          };
          ctx.payload = {
            ...ctx.payload,
            weeklyDigest: {
              ...(weeklyDigest ?? {}),
              notification: skipped,
            },
          };
          return skipped;
        }

        const payload = this.buildWeeklyDigestNotificationPayload(weeklyDigest);
        const fetcher = this.deps.fetch ?? globalThis.fetch?.bind(globalThis);
        if (!fetcher) {
          throw new Error('fetch API를 사용할 수 없습니다.');
        }

        const response = await fetcher(webhookUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });

        if (!response.ok) {
          throw new Error(`알림 전송 실패: status=${response.status ?? 'unknown'}`);
        }

        const result = {
          status: 'sent',
          weekNumber: weeklyDigest?.report?.weekNumber ?? weeklyDigest?.scan?.weekNumber ?? null,
          reportPath: weeklyDigest?.report?.reportPath ?? null,
          githubStatus: weeklyDigest?.github?.status ?? 'skipped',
          channel: 'webhook',
        };
        ctx.payload = {
          ...ctx.payload,
          weeklyDigest: {
            ...(weeklyDigest ?? {}),
            notification: result,
          },
        };
        return result;
      },
    };
  }

  private createVaultScannerFromEnv(): VaultScanner {
    return new VaultScanner({
      basePath: path.resolve(process.env['VAULT_PATH'] ?? './vault'),
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

  private async collectMeetingWeeklyData(
    scanner: VaultScanner,
    payload?: Record<string, unknown>
  ): Promise<WeeklyData | null> {
    const files = await scanner.scanFolder('meetings');
    if (files.length === 0) {
      return null;
    }

    const candidates = await Promise.all(
      files.map(async (file) => {
        const parsed = await scanner.parseMarkdown(file.filePath);
        const referenceDate = this.resolveMeetingDate(parsed.frontmatter.date, file.modifiedAt);

        return {
          document: {
            content: parsed.content,
            title: parsed.frontmatter.title ?? file.fileName,
            date: referenceDate,
            author: parsed.frontmatter.author,
            folderType: 'meetings',
          },
          weekNumber: parsed.frontmatter.week ?? getIsoWeek(referenceDate),
          weekYear: getIsoWeekYear(referenceDate),
          timestamp: referenceDate.getTime(),
        } satisfies MeetingCandidate;
      })
    );

    const requestedWeek = typeof payload?.['weekNumber'] === 'number' ? payload['weekNumber'] : undefined;
    const target = requestedWeek
      ? candidates.find((candidate) => candidate.weekNumber === requestedWeek)
      : [...candidates].sort((left, right) => right.timestamp - left.timestamp)[0];

    if (!target) {
      return null;
    }

    const documents = candidates
      .filter((candidate) => {
        return (
          candidate.weekNumber === target.weekNumber && candidate.weekYear === target.weekYear
        );
      })
      .map((candidate) => candidate.document);

    const scopedDocuments = documents.length > 0 ? documents : candidates.map((candidate) => candidate.document);
    const authors = new Set(
      scopedDocuments
        .map((document) => document.author)
        .filter((author): author is string => typeof author === 'string' && author.length > 0)
    );

    return {
      weekNumber: target.weekNumber,
      documents: scopedDocuments,
      memberCount: authors.size > 0 ? authors.size : undefined,
    };
  }

  private resolveMeetingDate(frontmatterDate: Date | undefined, fallbackDate: Date): Date {
    if (frontmatterDate instanceof Date && !Number.isNaN(frontmatterDate.getTime())) {
      return frontmatterDate;
    }
    return fallbackDate;
  }

  private async generateWeeklyDigestReport(ctx: WorkflowContext): Promise<{
    status: 'generated' | 'skipped';
    reason?: string;
    weekNumber?: number;
    totalDocuments?: number;
    reportPath?: string;
  }> {
    const scanner = this.createVaultScannerFromEnv();
    const weeklyDigest = this.readWeeklyDigestPayload(ctx.payload);
    const weeklyData = weeklyDigest?.weeklyData ?? (await this.collectMeetingWeeklyData(scanner, ctx.payload));

    if (!weeklyData) {
      const skipped = { status: 'skipped' as const, reason: 'meetings-not-found' };
      ctx.payload = {
        ...ctx.payload,
        weeklyDigest: {
          ...(weeklyDigest ?? {}),
          weeklyData: null,
          report: skipped,
        },
        report: skipped,
      };
      return skipped;
    }

    const analyzer = this.deps.createAnalysisEngine?.() ?? createAnalysisEngineFromEnv();
    const outputDir = scanner.getFullPath('analysis');
    const generator = new ReportGenerator(analyzer, {
      outputDir,
      weekNumber: weeklyData.weekNumber,
    });
    const report = await generator.generateWeeklyReport(weeklyData);
    const fileName = generator.generateFileName('weekly', weeklyData.weekNumber);
    const outputPath = path.join(outputDir, fileName);

    await generator.saveReport(report, outputPath);

    const result = {
      status: 'generated' as const,
      weekNumber: weeklyData.weekNumber,
      totalDocuments: weeklyData.documents.length,
      reportPath: outputPath,
    };
    ctx.payload = {
      ...ctx.payload,
      weeklyDigest: {
        ...(weeklyDigest ?? {}),
        weeklyData,
        report: result,
      },
      report: result,
    };

    return result;
  }

  private readWeeklyDigestPayload(payload?: Record<string, unknown>): {
    weeklyData?: WeeklyData | null;
    scan?: Record<string, unknown>;
    report?: Record<string, unknown> & { status?: string; reportPath?: string; weekNumber?: number };
    github?: Record<string, unknown> & { status?: string };
    notification?: Record<string, unknown>;
  } | null {
    const weeklyDigest = payload?.['weeklyDigest'];
    if (!weeklyDigest || typeof weeklyDigest !== 'object') {
      return null;
    }

    return weeklyDigest as {
      weeklyData?: WeeklyData | null;
      scan?: Record<string, unknown>;
      report?: Record<string, unknown> & { status?: string; reportPath?: string; weekNumber?: number };
      github?: Record<string, unknown> & { status?: string };
      notification?: Record<string, unknown>;
    };
  }

  private getWeeklyDigestWebhookUrl(): string | undefined {
    const value =
      process.env['WEEKLY_DIGEST_WEBHOOK_URL'] ?? process.env['NOTIFICATION_WEBHOOK_URL'];
    return typeof value === 'string' && value.trim().length > 0 ? value : undefined;
  }

  private buildWeeklyDigestNotificationPayload(
    weeklyDigest: {
      report?: Record<string, unknown> & { reportPath?: string; weekNumber?: number };
      github?: Record<string, unknown> & { status?: string };
      scan?: Record<string, unknown> & { totalDocuments?: number; weekNumber?: number };
    } | null
  ): { text: string; attachments: Array<{ title: string; fields: Array<{ title: string; value: string; short: boolean }> }> } {
    const weekNumber = weeklyDigest?.report?.weekNumber ?? weeklyDigest?.scan?.weekNumber ?? null;
    const reportPath = weeklyDigest?.report?.reportPath ?? '보고서 경로 없음';
    const githubStatus = weeklyDigest?.github?.status ?? 'skipped';
    const totalDocuments = weeklyDigest?.scan?.totalDocuments;

    return {
      text: `✅ weeklyDigest 완료: Week${String(weekNumber ?? '').padStart(2, '0')}`,
      attachments: [
        {
          title: '주간 다이제스트 결과',
          fields: [
            { title: '주차', value: weekNumber === null ? 'unknown' : String(weekNumber), short: true },
            { title: '문서 수', value: typeof totalDocuments === 'number' ? String(totalDocuments) : 'unknown', short: true },
            { title: 'GitHub', value: githubStatus, short: true },
            { title: 'Report', value: reportPath, short: false },
          ],
        },
      ],
    };
  }

  private hasGitHubSyncEnv(): boolean {
    return Boolean(
      (process.env['GITHUB_TOKEN'] ?? process.env['GITHUB_API_KEY']) &&
        process.env['GITHUB_OWNER'] &&
        process.env['GITHUB_REPO']
    );
  }
}

function getIsoWeek(date: Date): number {
  const normalized = toUtcDate(date);
  normalized.setUTCDate(normalized.getUTCDate() + 4 - (normalized.getUTCDay() || 7));
  const yearStart = new Date(Date.UTC(normalized.getUTCFullYear(), 0, 1));
  const diffDays = Math.floor((normalized.getTime() - yearStart.getTime()) / 86_400_000) + 1;
  return Math.ceil(diffDays / 7);
}

function getIsoWeekYear(date: Date): number {
  const normalized = toUtcDate(date);
  normalized.setUTCDate(normalized.getUTCDate() + 4 - (normalized.getUTCDay() || 7));
  return normalized.getUTCFullYear();
}

function toUtcDate(date: Date): Date {
  return new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
}
