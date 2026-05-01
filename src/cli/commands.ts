import type { WorkflowOrchestrator } from '../workflows/orchestrator';
import type { OutputFormat } from './formatter';
import { format } from './formatter';

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
  const result = {
    action: 'scan',
    folder: opts.folder ?? 'all',
    status: 'completed',
    timestamp: new Date().toISOString(),
  };
  return format(result, deps.outputFormat);
}

export async function runSync(opts: SyncOptions, deps: CommandDeps): Promise<string> {
  const target = opts.target ?? 'github';
  await deps.orchestrator.emit(`${target}:sync`, { target });
  const result = {
    action: 'sync',
    target,
    status: 'completed',
    timestamp: new Date().toISOString(),
  };
  return format(result, deps.outputFormat);
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
