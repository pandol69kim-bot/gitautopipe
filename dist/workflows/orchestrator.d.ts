import type { Workflow, Execution, ExecutionResult } from '../types/workflow';
import type { AnalysisEngine } from '../types/analysis';
interface ScheduleEntry {
    workflowId: string;
    cron: string;
    registeredAt: Date;
}
interface WorkflowOrchestratorDeps {
    createAnalysisEngine?: () => AnalysisEngine;
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
    private createMeetingReportStep;
    private createVaultScannerFromEnv;
    private collectMeetingWeeklyData;
    private resolveMeetingDate;
}
export {};
//# sourceMappingURL=orchestrator.d.ts.map