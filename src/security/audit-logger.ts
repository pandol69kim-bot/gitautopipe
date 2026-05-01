import fs from 'fs';
import path from 'path';
import { randomUUID } from 'crypto';

import type { AuditRecord, AuditRecordInput } from '../types/security';

export class AuditLogger {
  constructor(private readonly logPath: string) {}

  async record(entry: AuditRecordInput): Promise<AuditRecord> {
    this.ensureDirectory();

    const record: AuditRecord = {
      id: randomUUID(),
      timestamp: new Date().toISOString(),
      ...entry,
    };

    fs.appendFileSync(this.logPath, `${JSON.stringify(record)}\n`, 'utf8');
    return record;
  }

  async readAll(): Promise<AuditRecord[]> {
    if (!fs.existsSync(this.logPath)) {
      return [];
    }

    return fs
      .readFileSync(this.logPath, 'utf8')
      .split('\n')
      .filter((line) => line.trim().length > 0)
      .flatMap((line) => {
        try {
          return [JSON.parse(line) as AuditRecord];
        } catch {
          return [];
        }
      });
  }

  private ensureDirectory(): void {
    const dirPath = path.dirname(this.logPath);
    if (!fs.existsSync(dirPath)) {
      fs.mkdirSync(dirPath, { recursive: true });
    }
  }
}