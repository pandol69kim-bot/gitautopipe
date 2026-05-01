import type { Workflow, Execution, ExecutionResult } from '../types/workflow';
interface ScheduleEntry {
    workflowId: string;
    cron: string;
    registeredAt: Date;
}
export declare class WorkflowOrchestrator {
    private readonly workflows;
    private readonly history;
    private readonly schedules;
    private readonly emitter;
    constructor();
    registerWorkflow(workflow: Workflow): void;
    getWorkflow(id: string): Workflow | undefined;
    executeWorkflow(workflowId: string, payload?: Record<string, unknown>): Promise<ExecutionResult>;
    getExecutionHistory(workflowId: string): Execution[];
    scheduleWorkflow(workflowId: string, cron: string): void;
    getSchedules(): ScheduleEntry[];
    emit(event: string, payload: Record<string, unknown>): Promise<void>;
    private executeStep;
    private sleep;
    private registerPredefinedWorkflows;
    private makeLogStep;
}
export {};
//# sourceMappingURL=orchestrator.d.ts.map