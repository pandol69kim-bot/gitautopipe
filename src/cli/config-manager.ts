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
  logLevel: 'info',
};

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
}
