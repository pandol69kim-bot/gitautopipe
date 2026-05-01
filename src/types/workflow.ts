export type TriggerType = 'event' | 'cron' | 'manual';
export type WorkflowStatus = 'idle' | 'running' | 'completed' | 'failed' | 'retrying';
export type StepStatus = 'pending' | 'running' | 'completed' | 'failed' | 'skipped';
export type ErrorStrategy = 'stop' | 'continue' | 'retry';

export interface WorkflowTrigger {
  type: TriggerType;
  event?: string;   // event 타입일 때 이벤트 이름
  cron?: string;    // cron 타입일 때 cron 표현식
}

export interface WorkflowContext {
  workflowId: string;
  executionId: string;
  triggeredAt: Date;
  payload?: Record<string, unknown>;
}

export interface StepResult {
  stepId: string;
  status: StepStatus;
  output?: unknown;
  error?: string;
  startedAt: Date;
  completedAt: Date;
  durationMs: number;
}

export interface WorkflowStep {
  id: string;
  name: string;
  execute(context: WorkflowContext): Promise<unknown>;
}

export interface ErrorHandlingConfig {
  strategy: ErrorStrategy;
  maxRetries?: number;
  retryDelayMs?: number;
  notifyOnFailure?: boolean;
}

export interface Workflow {
  id: string;
  name: string;
  steps: WorkflowStep[];
  triggers: WorkflowTrigger[];
  errorHandling: ErrorHandlingConfig;
}

export interface Execution {
  executionId: string;
  workflowId: string;
  status: WorkflowStatus;
  triggeredAt: Date;
  completedAt?: Date;
  stepResults: StepResult[];
  error?: string;
}

export interface ExecutionResult {
  executionId: string;
  workflowId: string;
  status: WorkflowStatus;
  stepResults: StepResult[];
  totalDurationMs: number;
}
