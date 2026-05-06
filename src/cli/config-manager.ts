import fs from 'fs';
import path from 'path';
import { z } from 'zod';

const ConfigSchema = z.object({
  vault: z.object({
    rootPath: z.string(),
    folders: z.array(z.string()),
  }),
  github: z.object({
    owner: z.string(),
    repo: z.string(),
    branch: z.string().default('main'),
  }),
  notion: z
    .object({
      apiKey: z.string().optional(),
      databaseId: z.string().optional(),
    })
    .optional(),
  linkedin: z
    .object({
      tone: z.enum(['professional', 'casual', 'thought-leader']).default('professional'),
    })
    .optional(),
  workflows: z
    .object({
      schedules: z.record(z.string(), z.object({ cron: z.string().min(1) })).default({}),
    })
    .default({ schedules: {} }),
  logLevel: z.enum(['debug', 'info', 'warn', 'error']).default('info'),
});

export type AppConfig = z.infer<typeof ConfigSchema>;

export const CONFIG_FILENAME = 'selfish-club.config.json';

const DEFAULT_CONFIG: AppConfig = {
  vault: {
    rootPath: './vault',
    folders: ['Mission', 'Skills', 'Insights', 'Meetings'],
  },
  github: { owner: '', repo: '', branch: 'main' },
  workflows: { schedules: {} },
  logLevel: 'info',
};

export interface WorkflowScheduleConfig {
  workflowId: string;
  cron: string;
}

export class ConfigManager {
  private configPath: string;

  constructor(configDir: string = process.cwd()) {
    this.configPath = path.join(configDir, CONFIG_FILENAME);
  }

  load(): AppConfig {
    if (!fs.existsSync(this.configPath)) {
      return structuredClone(DEFAULT_CONFIG);
    }
    const raw = JSON.parse(fs.readFileSync(this.configPath, 'utf-8'));
    return ConfigSchema.parse(raw);
  }

  save(config: AppConfig): void {
    const validated = ConfigSchema.parse(config);
    fs.writeFileSync(this.configPath, JSON.stringify(validated, null, 2), 'utf-8');
  }

  exists(): boolean {
    return fs.existsSync(this.configPath);
  }

  init(): AppConfig {
    if (!this.exists()) {
      this.save(DEFAULT_CONFIG);
    }
    return this.load();
  }

  getConfigPath(): string {
    return this.configPath;
  }

  listWorkflowSchedules(): WorkflowScheduleConfig[] {
    const schedules = this.load().workflows.schedules as Record<string, { cron: string }>;
    return Object.entries(schedules).map(([workflowId, entry]) => ({ workflowId, cron: entry.cron }));
  }

  setWorkflowSchedule(workflowId: string, cron: string): void {
    const config = this.load();
    const nextConfig: AppConfig = {
      ...config,
      workflows: {
        ...config.workflows,
        schedules: {
          ...config.workflows.schedules,
          [workflowId]: { cron },
        },
      },
    };

    this.save(nextConfig);
  }

  removeWorkflowSchedule(workflowId: string): boolean {
    const config = this.load();
    if (!(workflowId in config.workflows.schedules)) {
      return false;
    }

    const nextSchedules = { ...config.workflows.schedules };
    delete nextSchedules[workflowId];

    const nextConfig: AppConfig = {
      ...config,
      workflows: {
        ...config.workflows,
        schedules: nextSchedules,
      },
    };

    this.save(nextConfig);
    return true;
  }
}
