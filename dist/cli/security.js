"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.createCliSecurityDeps = createCliSecurityDeps;
exports.executeSecuredCommand = executeSecuredCommand;
exports.getRequiredSecretsForCommand = getRequiredSecretsForCommand;
const path_1 = __importDefault(require("path"));
const audit_logger_1 = require("../security/audit-logger");
const rate_limiter_1 = require("../security/rate-limiter");
const secret_manager_1 = require("../security/secret-manager");
const access_control_1 = require("../security/access-control");
function createCliSecurityDeps(cwd = process.cwd()) {
    const actorRole = normalizeRole(process.env['SELFISH_ACTOR_ROLE']);
    const actorId = process.env['SELFISH_ACTOR_ID']?.trim() || 'local-admin';
    const rateLimit = parsePositiveInt(process.env['SELFISH_RATE_LIMIT'], 30);
    const rateLimitWindowMs = parsePositiveInt(process.env['SELFISH_RATE_LIMIT_WINDOW_MS'], 60_000);
    return {
        actor: { id: actorId, role: actorRole },
        secretManager: new secret_manager_1.SecretManager({
            env: process.env,
            encryptionKey: process.env['SECURITY_ENCRYPTION_KEY'],
        }),
        auditLogger: new audit_logger_1.AuditLogger(path_1.default.join(cwd, 'audit', 'audit.log')),
        rateLimiter: new rate_limiter_1.RateLimiter({ limit: rateLimit, windowMs: rateLimitWindowMs }),
    };
}
async function executeSecuredCommand(request, deps, handler) {
    const action = mapCommandToAction(request.command);
    const accessDecision = (0, access_control_1.authorizeAccess)(deps.actor, {
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
    const rateLimit = deps.rateLimiter.check(`${deps.actor.id}:${request.command}`, deps.now?.() ?? new Date());
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
    }
    catch (error) {
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
function getRequiredSecretsForCommand(command, options = {}) {
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
        case 'notion-check':
            return ['NOTION_TOKEN'];
        case 'analyze':
            return ['OPENAI_API_KEY'];
        case 'deploy':
            return ['VERCEL_TOKEN', 'VERCEL_PROJECT_ID'];
        case 'workflow': {
            const workflowId = String(options['workflowId'] ?? '');
            if (workflowId === 'onNotionSync') {
                return ['NOTION_TOKEN'];
            }
            if (workflowId === 'onMeetingSync') {
                return ['NOTION_TOKEN', 'CLAUDE_API_KEY|ANTHROPIC_API_KEY|OPENAI_API_KEY'];
            }
            if (workflowId === 'onMissionUpdate') {
                return ['OPENAI_API_KEY'];
            }
            if (workflowId === 'onGitHubSync') {
                return ['GITHUB_TOKEN'];
            }
            if (workflowId === 'onSkillUpdate') {
                return ['VERCEL_TOKEN', 'VERCEL_PROJECT_ID'];
            }
            if (workflowId === 'weeklyDigest') {
                return ['OPENAI_API_KEY|CLAUDE_API_KEY|ANTHROPIC_API_KEY'];
            }
            return ['CLAUDE_API_KEY|ANTHROPIC_API_KEY'];
        }
        default:
            return [];
    }
}
function mapCommandToAction(command) {
    switch (command) {
        case 'status':
        case 'notion-check':
        case 'scan':
        case 'interactive':
            return 'read';
        case 'sync':
        case 'deploy':
        case 'schedule':
            return 'manage';
        default:
            return 'write';
    }
}
async function validateRequiredSecrets(requirements, secretManager) {
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
    throw new Error(`필수 시크릿이 없습니다: ${missingGroups.join(', ')}${validation.isValid ? '' : ` (현재 누락: ${validation.missingKeys.join(', ')})`}`);
}
function normalizeRole(role) {
    switch (role) {
        case 'Admin':
        case 'Member':
        case 'Viewer':
            return role;
        default:
            return 'Admin';
    }
}
function parsePositiveInt(input, fallback) {
    const value = Number.parseInt(input ?? '', 10);
    return Number.isFinite(value) && value > 0 ? value : fallback;
}
//# sourceMappingURL=security.js.map