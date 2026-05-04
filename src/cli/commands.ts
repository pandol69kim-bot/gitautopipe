import * as path from 'path';
import type { WorkflowOrchestrator } from '../workflows/orchestrator';
import type { OutputFormat } from './formatter';
import { format } from './formatter';
import { VaultScanner } from '../core/vault-scanner';
import type { FolderType } from '../types/vault';

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
