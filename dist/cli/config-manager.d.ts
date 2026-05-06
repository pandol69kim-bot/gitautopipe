import { z } from 'zod';
declare const ConfigSchema: z.ZodObject<{
    vault: z.ZodObject<{
        rootPath: z.ZodString;
        folders: z.ZodArray<z.ZodString>;
    }, z.core.$strip>;
    github: z.ZodObject<{
        owner: z.ZodString;
        repo: z.ZodString;
        branch: z.ZodDefault<z.ZodString>;
    }, z.core.$strip>;
    notion: z.ZodOptional<z.ZodObject<{
        apiKey: z.ZodOptional<z.ZodString>;
        databaseId: z.ZodOptional<z.ZodString>;
    }, z.core.$strip>>;
    linkedin: z.ZodOptional<z.ZodObject<{
        tone: z.ZodDefault<z.ZodEnum<{
            professional: "professional";
            casual: "casual";
            "thought-leader": "thought-leader";
        }>>;
    }, z.core.$strip>>;
    workflows: z.ZodDefault<z.ZodObject<{
        schedules: z.ZodDefault<z.ZodRecord<z.ZodString, z.ZodObject<{
            cron: z.ZodString;
        }, z.core.$strip>>>;
    }, z.core.$strip>>;
    logLevel: z.ZodDefault<z.ZodEnum<{
        error: "error";
        debug: "debug";
        info: "info";
        warn: "warn";
    }>>;
}, z.core.$strip>;
export type AppConfig = z.infer<typeof ConfigSchema>;
export declare const CONFIG_FILENAME = "selfish-club.config.json";
export interface WorkflowScheduleConfig {
    workflowId: string;
    cron: string;
}
export declare class ConfigManager {
    private configPath;
    constructor(configDir?: string);
    load(): AppConfig;
    save(config: AppConfig): void;
    exists(): boolean;
    init(): AppConfig;
    getConfigPath(): string;
    listWorkflowSchedules(): WorkflowScheduleConfig[];
    setWorkflowSchedule(workflowId: string, cron: string): void;
    removeWorkflowSchedule(workflowId: string): boolean;
}
export {};
//# sourceMappingURL=config-manager.d.ts.map