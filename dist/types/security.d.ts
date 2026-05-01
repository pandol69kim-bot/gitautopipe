export type SecretSource = 'env' | 'vault';
export type UserRole = 'Admin' | 'Member' | 'Viewer';
export type PermissionAction = 'read' | 'write' | 'manage';
export interface Secrets {
    [key: string]: string;
}
export interface ValidationResult {
    isValid: boolean;
    missingKeys: string[];
}
export interface SecretVaultProvider {
    load(): Promise<Secrets>;
}
export interface SecretManagerOptions {
    env?: NodeJS.ProcessEnv;
    vaultProvider?: SecretVaultProvider;
    encryptionKey?: string;
    requiredKeys?: string[];
}
export interface UserIdentity {
    id: string;
    role: UserRole;
}
export interface AccessRequest {
    action: PermissionAction;
    resourceOwnerId?: string;
    resourcePath: string;
}
export interface AccessDecision {
    allowed: boolean;
    reason?: string;
}
export interface AuditRecordInput {
    actorId: string;
    actorRole: UserRole;
    action: string;
    resource: string;
    status: 'success' | 'failure';
    metadata?: Record<string, unknown>;
}
export interface AuditRecord extends AuditRecordInput {
    id: string;
    timestamp: string;
}
export interface RateLimitConfig {
    limit: number;
    windowMs: number;
}
export interface RateLimitResult {
    allowed: boolean;
    remaining: number;
    resetAt: Date;
}
export interface SecretScanFinding {
    type: string;
    match: string;
    index: number;
}
//# sourceMappingURL=security.d.ts.map