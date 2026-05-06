import { AuditLogger } from '../security/audit-logger';
import { RateLimiter } from '../security/rate-limiter';
import { SecretManager } from '../security/secret-manager';
import type { UserIdentity } from '../types/security';
export type CliCommandName = 'scan' | 'sync' | 'analyze' | 'deploy' | 'workflow' | 'status' | 'notion-check' | 'interactive';
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
export declare function createCliSecurityDeps(cwd?: string): CliSecurityDeps;
export declare function executeSecuredCommand<T>(request: CliSecurityRequest, deps: CliSecurityDeps, handler: () => Promise<T>): Promise<T>;
export declare function getRequiredSecretsForCommand(command: CliCommandName, options?: Record<string, unknown>): string[];
//# sourceMappingURL=security.d.ts.map