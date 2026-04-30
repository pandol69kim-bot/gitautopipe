import * as dotenv from 'dotenv';
import { z } from 'zod';

const EnvSchema = z.object({
  GITHUB_TOKEN: z.string().min(1, 'GITHUB_TOKEN is required'),
  CLAUDE_API_KEY: z.string().min(1, 'CLAUDE_API_KEY is required'),
  NOTION_TOKEN: z.string().min(1, 'NOTION_TOKEN is required'),
  VERCEL_TOKEN: z.string().optional(),
});

export type EnvConfig = z.infer<typeof EnvSchema>;

let cachedEnv: EnvConfig | null = null;

export function loadEnv(): EnvConfig {
  if (cachedEnv) return cachedEnv;

  dotenv.config();

  const result = EnvSchema.safeParse(process.env);

  if (!result.success) {
    const missing = result.error.issues
      .map((e) => `  - ${e.path.join('.')}: ${e.message}`)
      .join('\n');
    throw new Error(`환경 변수 검증 실패:\n${missing}\n\n.env 파일을 확인하세요.`);
  }

  cachedEnv = result.data;
  return cachedEnv;
}

export function getEnv(): EnvConfig {
  if (!cachedEnv) {
    return loadEnv();
  }
  return cachedEnv;
}
