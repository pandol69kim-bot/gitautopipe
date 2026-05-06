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
import { GitHubSync } from '../integrations/github';
import { NotionMCPConnector } from '../integrations/notion';
import type { NotionClient as INotionClient } from '../integrations/notion';
import { syncNotionBidirectional } from '../integrations/notion-sync';

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

// ── WorkflowOrchestrator 클래스 ───────────────────────────────────────

export class WorkflowOrchestrator {
  private readonly workflows = new Map<string, Workflow>();
  private readonly history = new Map<string, Execution[]>();
  private readonly schedules = new Map<string, ScheduleEntry>();
  private readonly emitter = new EventEmitter();

  constructor() {
    this.registerPredefinedWorkflows();
  }

  // ── Subtask 2: 등록 ───────────────────────────────────────────────

  registerWorkflow(workflow: Workflow): void {
    this.workflows.set(workflow.id, workflow);

    for (const trigger of workflow.triggers) {
      if (trigger.type === 'event' && trigger.event) {
        this.emitter.removeAllListeners(trigger.event);
        this.emitter.on(trigger.event, async (payload: Record<string, unknown>) => {
          await this.executeWorkflow(workflow.id, payload).catch(() => {});
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
    this.schedules.set(workflowId, {
      workflowId,
      cron,
      registeredAt: new Date(),
    });
  }

  getSchedules(): ScheduleEntry[] {
    return Array.from(this.schedules.values());
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
        this.makeLogStep('report-update', 'Analysis 보고서 업데이트'),
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
        this.makeLogStep('vault-scan', '볼트 주간 데이터 수집'),
        this.makeLogStep('weekly-report', '주간 보고서 생성'),
        this.makeLogStep('github-commit', 'GitHub 커밋'),
        this.makeLogStep('digest-notify', '다이제스트 알림 전송'),
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
}
