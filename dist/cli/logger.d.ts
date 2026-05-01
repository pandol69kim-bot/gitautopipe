export type LogLevel = 'debug' | 'info' | 'warn' | 'error';
export declare class Logger {
    private level;
    constructor(level?: LogLevel);
    setLevel(level: LogLevel): void;
    getLevel(): LogLevel;
    private shouldLog;
    debug(message: string): void;
    info(message: string): void;
    warn(message: string): void;
    error(message: string): void;
}
export declare const logger: Logger;
//# sourceMappingURL=logger.d.ts.map