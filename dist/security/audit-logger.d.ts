import type { AuditRecord, AuditRecordInput } from '../types/security';
export declare class AuditLogger {
    private readonly logPath;
    constructor(logPath: string);
    record(entry: AuditRecordInput): Promise<AuditRecord>;
    readAll(): Promise<AuditRecord[]>;
    private ensureDirectory;
}
//# sourceMappingURL=audit-logger.d.ts.map