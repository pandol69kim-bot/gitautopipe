import type { Workflow, Execution, ExecutionResult } from '../types/workflow';
import { GitHubSync } from '../integrations/github';
import type { AnalysisEngine } from '../types/analysis';
import type { FormattedPost, LinkedInPost, MissionContent } from '../types/linkedin';
interface ScheduleEntry {
    workflowId: string;
    cron: string;
    registeredAt: Date;
}
interface WorkflowOrchestratorDeps {
    createAnalysisEngine?: () => AnalysisEngine;
    createOpenAIAnalysisEngine?: () => AnalysisEngine;
    createLinkedInContentGenerator?: () => MissionLinkedInGenerator;
    createGitHubSync?: () => GitHubSync;
    fetch?: (input: string, init?: {
        method?: string;
        headers?: Record<string, string>;
        body?: string;
    }) => Promise<{
        ok: boolean;
        status?: number;
    }>;
}
interface MissionLinkedInGenerator {
    generateDraft(mission: MissionContent): Promise<LinkedInPost>;
    formatForPlatform(post: LinkedInPost, mission: MissionContent): Promise<FormattedPost>;
}
export declare class WorkflowOrchestrator {
    private readonly workflows;
    private readonly history;
    private readonly schedules;
    private readonly emitter;
    private readonly deps;
    constructor(deps?: WorkflowOrchestratorDeps);
    registerWorkflow(workflow: Workflow): void;
    getWorkflow(id: string): Workflow | undefined;
    executeWorkflow(workflowId: string, payload?: Record<string, unknown>): Promise<ExecutionResult>;
    getExecutionHistory(workflowId: string): Execution[];
    scheduleWorkflow(workflowId: string, cron: string): void;
    unscheduleWorkflow(workflowId: string): boolean;
    getSchedules(): ScheduleEntry[];
    runDueSchedules(at?: Date): Promise<ExecutionResult[]>;
    emit(event: string, payload: Record<string, unknown>): Promise<void>;
    private executeStep;
    private sleep;
    private registerPredefinedWorkflows;
    private makeLogStep;
    private createMissionCollectStep;
    private createMissionAnalysisStep;
    private createMissionLinkedInDraftStep;
    private createMeetingReportStep;
    private createWeeklyDigestScanStep;
    private createWeeklyDigestReportStep;
    private createWeeklyDigestGitHubCommitStep;
    private createWeeklyDigestNotifyStep;
    private createVaultScannerFromEnv;
    private collectLatestMissionData;
    private collectMeetingWeeklyData;
    private resolveMeetingDate;
    private createMissionOpenAIAnalysisEngine;
    private createMissionLinkedInContentGenerator;
    private createMissionLinkedInClient;
    private buildLinkedInMissionContent;
    private buildMissionAnalysisFileName;
    private buildMissionAnalysisMarkdown;
    private buildMissionLinkedInDraftMarkdown;
    private isSubPath;
    private escapeYamlString;
    private generateWeeklyDigestReport;
    private readWeeklyDigestPayload;
    private readMissionUpdatePayload;
    private getWeeklyDigestWebhookUrl;
    private buildWeeklyDigestNotificationPayload;
    private hasGitHubSyncEnv;
}
export {};
//# sourceMappingURL=orchestrator.d.ts.map