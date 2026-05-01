export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

const LOG_LEVEL_ORDER: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
};

export class Logger {
  private level: LogLevel;

  constructor(level: LogLevel = 'info') {
    this.level = level;
  }

  setLevel(level: LogLevel): void {
    this.level = level;
  }

  getLevel(): LogLevel {
    return this.level;
  }

  private shouldLog(level: LogLevel): boolean {
    return LOG_LEVEL_ORDER[level] >= LOG_LEVEL_ORDER[this.level];
  }

  debug(message: string): void {
    if (this.shouldLog('debug')) console.debug(`[DEBUG] ${message}`);
  }

  info(message: string): void {
    if (this.shouldLog('info')) console.info(`[INFO] ${message}`);
  }

  warn(message: string): void {
    if (this.shouldLog('warn')) console.warn(`[WARN] ${message}`);
  }

  error(message: string): void {
    if (this.shouldLog('error')) console.error(`[ERROR] ${message}`);
  }
}

export const logger = new Logger((process.env['LOG_LEVEL'] as LogLevel | undefined) ?? 'info');
