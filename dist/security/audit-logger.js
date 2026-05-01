"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.AuditLogger = void 0;
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const crypto_1 = require("crypto");
class AuditLogger {
    logPath;
    constructor(logPath) {
        this.logPath = logPath;
    }
    async record(entry) {
        this.ensureDirectory();
        const record = {
            id: (0, crypto_1.randomUUID)(),
            timestamp: new Date().toISOString(),
            ...entry,
        };
        fs_1.default.appendFileSync(this.logPath, `${JSON.stringify(record)}\n`, 'utf8');
        return record;
    }
    async readAll() {
        if (!fs_1.default.existsSync(this.logPath)) {
            return [];
        }
        return fs_1.default
            .readFileSync(this.logPath, 'utf8')
            .split('\n')
            .filter((line) => line.trim().length > 0)
            .flatMap((line) => {
            try {
                return [JSON.parse(line)];
            }
            catch {
                return [];
            }
        });
    }
    ensureDirectory() {
        const dirPath = path_1.default.dirname(this.logPath);
        if (!fs_1.default.existsSync(dirPath)) {
            fs_1.default.mkdirSync(dirPath, { recursive: true });
        }
    }
}
exports.AuditLogger = AuditLogger;
//# sourceMappingURL=audit-logger.js.map