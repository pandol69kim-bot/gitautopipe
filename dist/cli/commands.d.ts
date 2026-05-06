import type { WorkflowOrchestrator } from '../workflows/orchestrator';
import type { OutputFormat } from './formatter';
import { ConfigManager } from './config-manager';
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
export declare function runScan(opts: ScanOptions, deps: CommandDeps): Promise<string>;
export declare function runSync(opts: SyncOptions, deps: CommandDeps): Promise<string>;
export declare function mapNotionSyncError(error: unknown, databaseId: string): Error;
export declare function runAnalyze(opts: AnalyzeOptions, deps: CommandDeps): Promise<string>;
export declare function runDeploy(opts: DeployOptions, deps: CommandDeps): Promise<string>;
export declare function runWorkflow(opts: WorkflowRunOptions, deps: CommandDeps): Promise<string>;
export declare function runScheduleList(deps: CommandDeps): string;
export declare function runScheduleAdd(opts: ScheduleAddOptions, deps: CommandDeps): string;
export declare function runScheduleRemove(opts: ScheduleRemoveOptions, deps: CommandDeps): string;
export declare function runScheduleRunDue(opts: ScheduleRunDueOptions, deps: CommandDeps): Promise<string>;
export declare function runScheduleStart(opts: ScheduleStartOptions, deps: CommandDeps): Promise<string>;
export declare function runNotionCheck(opts: NotionCheckOptions, deps: CommandDeps): Promise<string>;
export declare function runStatus(deps: CommandDeps): string;
//# sourceMappingURL=commands.d.ts.map