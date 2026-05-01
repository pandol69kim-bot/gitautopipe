import fs from 'fs';
import os from 'os';
import path from 'path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { authorizeAccess } from './access-control';
import { AuditLogger } from './audit-logger';
import { RateLimiter } from './rate-limiter';
import { SecretManager } from './secret-manager';
import { scanTextForSecrets } from './secret-scanner';

describe('SecretManager', () => {
  const env = {
    GITHUB_TOKEN: 'ghp_test_token',
    CLAUDE_API_KEY: 'sk-ant-test-key',
    NOTION_TOKEN: 'ntn_test_token',
  };

  it('env에서 시크릿을 로드하고 필수 키를 검증한다', async () => {
    const manager = new SecretManager({ env, encryptionKey: '0123456789abcdef0123456789abcdef' });

    const secrets = await manager.loadSecrets('env');
    const validation = await manager.validateSecrets();

    expect(secrets.GITHUB_TOKEN).toBe('ghp_test_token');
    expect(secrets.CLAUDE_API_KEY).toBe('sk-ant-test-key');
    expect(validation.isValid).toBe(true);
    expect(validation.missingKeys).toEqual([]);
  });

  it('시크릿을 암호화 저장 후 복호화할 수 있다', async () => {
    const manager = new SecretManager({ env, encryptionKey: '0123456789abcdef0123456789abcdef' });

    const encrypted = manager.encryptSecret('GITHUB_TOKEN', env.GITHUB_TOKEN);
    const decrypted = manager.decryptSecret(encrypted, 'GITHUB_TOKEN');

    expect(encrypted).not.toContain(env.GITHUB_TOKEN);
    expect(decrypted).toBe(env.GITHUB_TOKEN);
  });

  it('암호화 키 없이 암호화를 시도하면 실패한다', () => {
    const manager = new SecretManager({ env });
    expect(() => manager.encryptSecret('GITHUB_TOKEN', env.GITHUB_TOKEN)).toThrow(
      'encryptionKey가 설정되지 않았습니다.'
    );
  });

  it('rotateSecret으로 저장 값을 교체한다', async () => {
    const manager = new SecretManager({ env, encryptionKey: '0123456789abcdef0123456789abcdef' });

    await manager.loadSecrets('env');
    await manager.rotateSecret('GITHUB_TOKEN', 'ghp_rotated');

    const secrets = manager.getMaskedSecrets();
    expect(secrets.GITHUB_TOKEN).toContain('***');
    expect(manager.getSecret('GITHUB_TOKEN')).toBe('ghp_rotated');
  });
});

describe('authorizeAccess', () => {
  it('admin은 모든 경로에 write 권한이 있다', () => {
    const result = authorizeAccess(
      { id: 'admin-1', role: 'Admin' },
      { action: 'write', resourceOwnerId: 'member-1', resourcePath: 'vault/Mission/test.md' }
    );

    expect(result.allowed).toBe(true);
  });

  it('member는 자신의 경로만 write 가능하다', () => {
    const ownResult = authorizeAccess(
      { id: 'member-1', role: 'Member' },
      { action: 'write', resourceOwnerId: 'member-1', resourcePath: 'vault/Mission/member-1.md' }
    );
    const otherResult = authorizeAccess(
      { id: 'member-1', role: 'Member' },
      { action: 'write', resourceOwnerId: 'member-2', resourcePath: 'vault/Mission/member-2.md' }
    );

    expect(ownResult.allowed).toBe(true);
    expect(otherResult.allowed).toBe(false);
  });

  it('viewer는 read만 가능하다', () => {
    const readResult = authorizeAccess(
      { id: 'viewer-1', role: 'Viewer' },
      { action: 'read', resourceOwnerId: 'member-1', resourcePath: 'vault/Mission/member-1.md' }
    );
    const writeResult = authorizeAccess(
      { id: 'viewer-1', role: 'Viewer' },
      { action: 'write', resourceOwnerId: 'member-1', resourcePath: 'vault/Mission/member-1.md' }
    );

    expect(readResult.allowed).toBe(true);
    expect(writeResult.allowed).toBe(false);
  });
});

describe('AuditLogger', () => {
  let tempDir: string;
  let logPath: string;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'audit-log-'));
    logPath = path.join(tempDir, 'audit.log');
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  it('감사 로그를 파일에 기록하고 다시 읽을 수 있다', async () => {
    const logger = new AuditLogger(logPath);

    await logger.record({
      actorId: 'member-1',
      actorRole: 'Member',
      action: 'workflow.execute',
      resource: 'weeklyDigest',
      status: 'success',
      metadata: { trigger: 'manual' },
    });

    const logs = await logger.readAll();
    expect(logs).toHaveLength(1);
    expect(logs[0]?.actorId).toBe('member-1');
    expect(logs[0]?.action).toBe('workflow.execute');
  });
});

describe('RateLimiter', () => {
  it('제한 횟수 초과 전에는 허용하고 초과 후 차단한다', () => {
    const limiter = new RateLimiter({ limit: 2, windowMs: 60_000 });
    const now = new Date('2026-05-01T13:00:00.000Z');

    const first = limiter.check('member-1', now);
    const second = limiter.check('member-1', now);
    const third = limiter.check('member-1', now);

    expect(first.allowed).toBe(true);
    expect(second.allowed).toBe(true);
    expect(third.allowed).toBe(false);
    expect(third.remaining).toBe(0);
  });

  it('윈도우가 지나면 다시 허용한다', () => {
    const limiter = new RateLimiter({ limit: 1, windowMs: 1_000 });
    const first = limiter.check('member-1', new Date('2026-05-01T13:00:00.000Z'));
    const second = limiter.check('member-1', new Date('2026-05-01T13:00:00.500Z'));
    const third = limiter.check('member-1', new Date('2026-05-01T13:00:01.500Z'));

    expect(first.allowed).toBe(true);
    expect(second.allowed).toBe(false);
    expect(third.allowed).toBe(true);
  });
});

describe('scanTextForSecrets', () => {
  it('민감 정보 패턴을 탐지한다', () => {
    const findings = scanTextForSecrets(`GITHUB_TOKEN=ghp_1234567890abcdefghijklmnopqrstuv\nSAFE=value`);

    expect(findings).toHaveLength(1);
    expect(findings[0]?.type).toBe('github-token');
  });

  it('github_pat 형식도 탐지한다', () => {
    const findings = scanTextForSecrets(
      'TOKEN=github_pat_abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ1234567890'
    );

    expect(findings).toHaveLength(1);
    expect(findings[0]?.type).toBe('github-token');
  });

  it('일반 텍스트는 탐지하지 않는다', () => {
    const findings = scanTextForSecrets('HELLO_WORLD=example\nLOG_LEVEL=info');
    expect(findings).toEqual([]);
  });
});