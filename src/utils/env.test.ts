import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

vi.mock('dotenv', () => ({ config: vi.fn() }));

describe('loadEnv', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.stubEnv('GITHUB_TOKEN', '');
    vi.stubEnv('CLAUDE_API_KEY', '');
    vi.stubEnv('NOTION_TOKEN', '');
    delete process.env.VERCEL_TOKEN;
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('유효한 환경 변수로 정상 로드', async () => {
    vi.stubEnv('GITHUB_TOKEN', 'ghp_test');
    vi.stubEnv('CLAUDE_API_KEY', 'sk-ant-test');
    vi.stubEnv('NOTION_TOKEN', 'secret_test');

    const { loadEnv } = await import('./env');
    const env = loadEnv();

    expect(env.GITHUB_TOKEN).toBe('ghp_test');
    expect(env.CLAUDE_API_KEY).toBe('sk-ant-test');
    expect(env.NOTION_TOKEN).toBe('secret_test');
  });

  it('필수 환경 변수 누락 시 에러 발생', async () => {
    const { loadEnv } = await import('./env');
    expect(() => loadEnv()).toThrow('환경 변수 검증 실패');
  });

  it('VERCEL_TOKEN은 선택 사항', async () => {
    vi.stubEnv('GITHUB_TOKEN', 'ghp_test');
    vi.stubEnv('CLAUDE_API_KEY', 'sk-ant-test');
    vi.stubEnv('NOTION_TOKEN', 'secret_test');

    const { loadEnv } = await import('./env');
    const env = loadEnv();

    expect(env.VERCEL_TOKEN).toBeUndefined();
  });
});
