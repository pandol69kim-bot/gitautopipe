import fs from 'fs';
import os from 'os';
import path from 'path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { AuditLogger } from '../security/audit-logger';
import { RateLimiter } from '../security/rate-limiter';
import { SecretManager } from '../security/secret-manager';
import {
  executeSecuredCommand,
  getRequiredSecretsForCommand,
  type CliSecurityDeps,
} from './security';

describe('CLI security', () => {
  let tempDir: string;
  let deps: CliSecurityDeps;
  const githubToken = 'ghp_' + '1234567890abcdefghijklmnopqrstuv';
  const claudeApiKey = 'sk-ant-' + '1234567890abcdefghijklmnopqrst';
  const notionToken = 'secret_' + '12345678901234567890';

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cli-security-'));
    deps = {
      actor: { id: 'member-1', role: 'Member' },
      secretManager: new SecretManager({
        env: {
          GITHUB_TOKEN: githubToken,
          CLAUDE_API_KEY: claudeApiKey,
          NOTION_TOKEN: notionToken,
          VERCEL_TOKEN: 'vercel_test_token',
          VERCEL_PROJECT_ID: 'selfish-club',
        },
        encryptionKey: '0123456789abcdef0123456789abcdef',
      }),
      auditLogger: new AuditLogger(path.join(tempDir, 'audit.log')),
      rateLimiter: new RateLimiter({ limit: 2, windowMs: 60_000 }),
      now: () => new Date('2026-05-01T13:40:00.000Z'),
    };
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  it('read 명령은 member가 실행할 수 있고 감사 로그가 남는다', async () => {
    const result = await executeSecuredCommand(
      { command: 'scan', resource: 'vault/Mission' },
      deps,
      async () => 'ok'
    );

    const logs = await deps.auditLogger.readAll();
    expect(result).toBe('ok');
    expect(logs).toHaveLength(1);
    expect(logs[0]?.status).toBe('success');
  });

  it('manage 명령은 member가 실행할 수 없다', async () => {
    await expect(
      executeSecuredCommand(
        { command: 'deploy', resource: 'vercel', requiredSecrets: ['VERCEL_TOKEN'] },
        deps,
        async () => 'ok'
      )
    ).rejects.toThrow('관리 권한이 없습니다.');
  });

  it('필수 시크릿이 없으면 실행을 차단한다', async () => {
    deps.secretManager = new SecretManager({ env: {}, encryptionKey: '0123456789abcdef0123456789abcdef' });

    await expect(
      executeSecuredCommand(
        { command: 'analyze', resource: 'workflow/onMissionUpdate', requiredSecrets: ['CLAUDE_API_KEY|ANTHROPIC_API_KEY'] },
        deps,
        async () => 'ok'
      )
    ).rejects.toThrow('필수 시크릿이 없습니다');
  });

  it('rate limit을 초과하면 차단한다', async () => {
    await executeSecuredCommand({ command: 'scan', resource: 'vault/Mission' }, deps, async () => 'first');
    await executeSecuredCommand({ command: 'scan', resource: 'vault/Mission' }, deps, async () => 'second');

    await expect(
      executeSecuredCommand({ command: 'scan', resource: 'vault/Mission' }, deps, async () => 'third')
    ).rejects.toThrow('요청 한도를 초과했습니다');
  });

  it('워크플로우별 필수 시크릿을 계산한다', () => {
    expect(getRequiredSecretsForCommand('sync', { target: 'all' })).toEqual([
      'GITHUB_TOKEN',
      'NOTION_TOKEN',
    ]);
    expect(getRequiredSecretsForCommand('workflow', { workflowId: 'onMeetingSync' })).toEqual([
      'NOTION_TOKEN',
      'CLAUDE_API_KEY|ANTHROPIC_API_KEY|OPENAI_API_KEY',
    ]);
    expect(getRequiredSecretsForCommand('workflow', { workflowId: 'onSkillUpdate' })).toEqual([
      'VERCEL_TOKEN',
      'VERCEL_PROJECT_ID',
    ]);
    expect(getRequiredSecretsForCommand('workflow', { workflowId: 'weeklyDigest' })).toEqual([
      'OPENAI_API_KEY|CLAUDE_API_KEY|ANTHROPIC_API_KEY',
    ]);
  });

  it('deploy 명령은 프로젝트 ID까지 필수 시크릿으로 요구한다', () => {
    expect(getRequiredSecretsForCommand('deploy')).toEqual(['VERCEL_TOKEN', 'VERCEL_PROJECT_ID']);
  });
});