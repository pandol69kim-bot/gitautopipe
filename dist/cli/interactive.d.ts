export interface PromptQuestion {
    type: string;
    name: string;
    message: string;
    choices?: string[];
}
export type PromptFn = (questions: PromptQuestion[]) => Promise<Record<string, unknown>>;
export type InteractiveResult = {
    command: 'scan';
    options: {
        folder?: string;
    };
} | {
    command: 'sync';
    options: {
        target?: string;
    };
} | {
    command: 'analyze';
    options: {
        week?: number;
    };
} | {
    command: 'deploy';
    options: {
        preview?: boolean;
    };
} | {
    command: 'workflow';
    options: {
        workflowId: string;
    };
} | {
    command: 'status';
    options: Record<string, never>;
} | {
    command: 'exit';
    options: Record<string, never>;
};
export declare function runInteractive(prompt: PromptFn): Promise<InteractiveResult>;
//# sourceMappingURL=interactive.d.ts.map