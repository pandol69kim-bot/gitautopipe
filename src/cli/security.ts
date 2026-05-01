import path from 'path';

import { AuditLogger } from '../security/audit-logger';
import { RateLimiter } from '../security/rate-limiter';
import { SecretManager } from '../security/secret-manager';
import { authorizeAccess } from '../security/access-control';
import type { PermissionAction, UserIdentity, UserRole } from '../types/security';

export type CliCommandName =
  | 'scan'
  | 'sync'
  | 'analyze'
  | 'deploy'
  | 'workflow'
  | 'status'
  | 'interactive';

export interface CliSecurityDeps {
  actor: UserIdentity;
  secretManager: SecretManager;
  auditLogger: AuditLogger;
  rateLimiter: RateLimiter;
  now?: () => Date;
}

export interface CliSecurityRequest {
  command: CliCommandName;
  resource: string;
  requiredSecrets?: string[];
}

export function createCliSecurityDeps(cwd: string = process.cwd()): CliSecurityDeps {
  const actorRole = normalizeRole(process.env['SELFISH_ACTOR_ROLE']);
  const actorId = process.env['SELFISH_ACTOR_ID']?.trim() || 'local-admin';
  const rateLimit = parsePositiveInt(process.env['SELFISH_RATE_LIMIT'], 30);
  const rateLimitWindowMs = parsePositiveInt(process.env['SELFISH_RATE_LIMIT_WINDOW_MS'], 60_000);

  return {
    actor: { id: actorId, role: actorRole },
    secretManager: new SecretManager({
      env: process.env,
      encryptionKey: process.env['SECURITY_ENCRYPTION_KEY'],
    }),
    auditLogger: new AuditLogger(path.join(cwd, 'audit', 'audit.log')),
    rateLimiter: new RateLimiter({ limit: rateLimit, windowMs: rateLimitWindowMs }),
  };
}

export async function executeSecuredCommand<T>(
  request: CliSecurityRequest,
  deps: CliSecurityDeps,
  handler: () => Promise<T>
): Promise<T> {
  const action = mapCommandToAction(request.command);
  const accessDecision = authorizeAccess(deps.actor, {
    action,
    resourceOwnerId: deps.actor.role === 'Admin' ? undefined : deps.actor.id,
    resourcePath: request.resource,
  });

  if (!accessDecision.allowed) {
    await deps.auditLogger.record({
      actorId: deps.actor.id,
      actorRole: deps.actor.role,
      action: request.command,
      resource: request.resource,
      status: 'failure',
      metadata: { reason: accessDecision.reason ?? 'access denied' },
    });
    throw new Error(accessDecision.reason ?? '권한이 없습니다.');
  }

  const rateLimit = deps.rateLimiter.check(
    `${deps.actor.id}:${request.command}`,
    deps.now?.() ?? new Date()
  );

  if (!rateLimit.allowed) {
    await deps.auditLogger.record({
      actorId: deps.actor.id,
      actorRole: deps.actor.role,
      action: request.command,
      resource: request.resource,
      status: 'failure',
      metadata: { reason: 'rate limited', resetAt: rateLimit.resetAt.toISOString() },
    });
    throw new Error(`요청 한도를 초과했습니다. resetAt=${rateLimit.resetAt.toISOString()}`);
  }

  await validateRequiredSecrets(request.requiredSecrets ?? [], deps.secretManager);

  try {
    const result = await handler();
    await deps.auditLogger.record({
      actorId: deps.actor.id,
      actorRole: deps.actor.role,
      action: request.command,
      resource: request.resource,
      status: 'success',
    });
    return result;
  } catch (error) {
    await deps.auditLogger.record({
      actorId: deps.actor.id,
      actorRole: deps.actor.role,
      action: request.command,
      resource: request.resource,
      status: 'failure',
      metadata: {
        error: error instanceof Error ? error.message : String(error),
      },
    });
    throw error;
  }
}

export function getRequiredSecretsForCommand(
  command: CliCommandName,
  options: Record<string, unknown> = {}
): string[] {
  switch (command) {
    case 'sync': {
      const target = String(options['target'] ?? 'github');
      if (target === 'all') {
        return ['GITHUB_TOKEN', 'NOTION_TOKEN'];
      }
      if (target === 'notion') {
        return ['NOTION_TOKEN'];
      }
      return ['GITHUB_TOKEN'];
    }
    case 'analyze':
      return ['CLAUDE_API_KEY|ANTHROPIC_API_KEY'];
    case 'deploy':
      return ['VERCEL_TOKEN'];
    case 'workflow': {
      const workflowId = String(options['workflowId'] ?? '');
      if (workflowId === 'onMeetingSync') {
        return ['NOTION_TOKEN'];
      }
      if (workflowId === 'onSkillUpdate') {
        return ['VERCEL_TOKEN'];
      }
      return ['CLAUDE_API_KEY|ANTHROPIC_API_KEY'];
    }
    default:
      return [];
  }
}

function mapCommandToAction(command: CliCommandName): PermissionAction {
  switch (command) {
    case 'status':
    case 'scan':
    case 'interactive':
      return 'read';
    case 'sync':
    case 'deploy':
      return 'manage';
    default:
      return 'write';
  }
}

async function validateRequiredSecrets(
  requirements: string[],
  secretManager: SecretManager
): Promise<void> {
  if (requirements.length === 0) {
    return;
  }

  await secretManager.loadSecrets('env');
  const missingGroups = requirements.filter((group) => {
    const candidates = group.split('|');
    return !candidates.some((candidate) => {
      const value = secretManager.getSecret(candidate);
      return typeof value === 'string' && value.trim().length > 0;
    });
  });

  if (missingGroups.length === 0) {
    return;
  }

  const validation = await secretManager.validateSecrets([]);
  throw new Error(
    `필수 시크릿이 없습니다: ${missingGroups.join(', ')}${
      validation.isValid ? '' : ` (현재 누락: ${validation.missingKeys.join(', ')})`
    }`
  );
}

function normalizeRole(role: string | undefined): UserRole {
  switch (role) {
    case 'Admin':
    case 'Member':
    case 'Viewer':
      return role;
    default:
      return 'Admin';
  }
}

function parsePositiveInt(input: string | undefined, fallback: number): number {
  const value = Number.parseInt(input ?? '', 10);
  return Number.isFinite(value) && value > 0 ? value : fallback;
}