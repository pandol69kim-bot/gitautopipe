import type { Workflow, Execution, ExecutionResult } from '../types/workflow';
import { GitHubSync } from '../integrations/github';
import type { AnalysisEngine } from '../types/analysis';
import type { BuildResult, DeploymentResult, DeploymentStatus, DeploymentVerification } from '../types/deployer';
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
    createWebsiteDeployer?: () => SkillWebsiteDeployer;
    createGitHubSync?: () => GitHubSync;
    fetch?: (input: string, init?: {
        method?: string;
        headers?: Record<string, string>;
        body?: string;
    }) => Promise<{
        ok: boolean;
        status?: number;
        json?: () => Promise<unknown>;
    }>;
}
interface MissionLinkedInGenerator {
    generateDraft(mission: MissionContent): Promise<LinkedInPost>;
    formatForPlatform(post: LinkedInPost, mission: MissionContent): Promise<FormattedPost>;
}
interface SkillWebsiteDeployer {
    buildSite(sourceFolder: string): Promise<BuildResult>;
    deployToVercel(buildOutput: string, options?: {
        preview?: boolean;
    }): Promise<DeploymentResult>;
    waitForDeploymentReady(deploymentId: string, options?: {
        maxAttempts?: number;
        delayMs?: number;
    }): Promise<DeploymentStatus>;
    verifyDeploymentUrl(url: string, options?: {
        maxAttempts?: number;
        delayMs?: number;
    }): Promise<DeploymentVerification>;
    sendNotification(result: DeploymentResult): Promise<void>;
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
    private getStageableGitHubFiles;
    private registerPredefinedWorkflows;
    private makeLogStep;
    private createMissionCollectStep;
    private createMissionAnalysisStep;
    private createMissionLinkedInDraftStep;
    private createMeetingReportStep;
    private createSkillSiteBuildStep;
    private createSkillVercelDeployStep;
    private createSkillDeployNotifyStep;
    private createWeeklyDigestScanStep;
    private createWeeklyDigestReportStep;
    private createWeeklyDigestGitHubCommitStep;
    private createWeeklyDigestNotifyStep;
    private createVaultScannerFromEnv;
    private collectLatestMissionData;
    private collectMeetingWeeklyData;
    private resolveMeetingDate;
    private createMissionOpenAIAnalysisEngine;
    private createWebsiteDeployerFromEnv;
    private resolveWebsiteDeploySourceFolder;
    private resolveDeploymentPollingOptions;
    private resolveDeploymentVerificationOptions;
    private verifyDeploymentAccess;
    private mergeDeploymentResult;
    private mapDeploymentStateToCommandStatus;
    private mapVerificationStatus;
    private parsePositiveIntEnv;
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
    private readSkillUpdatePayload;
    private getWeeklyDigestWebhookUrl;
    private buildWeeklyDigestNotificationPayload;
    private hasGitHubSyncEnv;
}
export {};
//# sourceMappingURL=orchestrator.d.ts.map