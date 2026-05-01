"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.logger = exports.Logger = void 0;
const LOG_LEVEL_ORDER = {
    debug: 0,
    info: 1,
    warn: 2,
    error: 3,
};
class Logger {
    level;
    constructor(level = 'info') {
        this.level = level;
    }
    setLevel(level) {
        this.level = level;
    }
    getLevel() {
        return this.level;
    }
    shouldLog(level) {
        return LOG_LEVEL_ORDER[level] >= LOG_LEVEL_ORDER[this.level];
    }
    debug(message) {
        if (this.shouldLog('debug'))
            console.debug(`[DEBUG] ${message}`);
    }
    info(message) {
        if (this.shouldLog('info'))
            console.info(`[INFO] ${message}`);
    }
    warn(message) {
        if (this.shouldLog('warn'))
            console.warn(`[WARN] ${message}`);
    }
    error(message) {
        if (this.shouldLog('error'))
            console.error(`[ERROR] ${message}`);
    }
}
exports.Logger = Logger;
exports.logger = new Logger(process.env['LOG_LEVEL'] ?? 'info');
//# sourceMappingURL=logger.js.map