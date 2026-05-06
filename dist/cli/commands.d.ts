import type { WorkflowOrchestrator } from '../workflows/orchestrator';
import type { OutputFormat } from './formatter';
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
export interface NotionCheckOptions {
    id?: string;
}
export declare function runScan(opts: ScanOptions, deps: CommandDeps): Promise<string>;
export declare function runSync(opts: SyncOptions, deps: CommandDeps): Promise<string>;
export declare function mapNotionSyncError(error: unknown, databaseId: string): Error;
export declare function runAnalyze(opts: AnalyzeOptions, deps: CommandDeps): Promise<string>;
export declare function runDeploy(opts: DeployOptions, deps: CommandDeps): Promise<string>;
export declare function runWorkflow(opts: WorkflowRunOptions, deps: CommandDeps): Promise<string>;
export declare function runNotionCheck(opts: NotionCheckOptions, deps: CommandDeps): Promise<string>;
export declare function runStatus(deps: CommandDeps): string;
//# sourceMappingURL=commands.d.ts.map