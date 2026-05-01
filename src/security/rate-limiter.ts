import type { RateLimitConfig, RateLimitResult } from '../types/security';

interface WindowState {
  count: number;
  resetAt: Date;
}

export class RateLimiter {
  private readonly windows = new Map<string, WindowState>();

  constructor(private readonly config: RateLimitConfig) {}

  check(key: string, now: Date = new Date()): RateLimitResult {
    this.pruneExpired(now);

    const current = this.windows.get(key);
    if (!current || now >= current.resetAt) {
      const resetAt = new Date(now.getTime() + this.config.windowMs);
      this.windows.set(key, { count: 1, resetAt });
      return {
        allowed: true,
        remaining: Math.max(this.config.limit - 1, 0),
        resetAt,
      };
    }

    if (current.count >= this.config.limit) {
      return {
        allowed: false,
        remaining: 0,
        resetAt: current.resetAt,
      };
    }

    current.count += 1;
    return {
      allowed: true,
      remaining: Math.max(this.config.limit - current.count, 0),
      resetAt: current.resetAt,
    };
  }

  private pruneExpired(now: Date): void {
    for (const [entryKey, state] of this.windows.entries()) {
      if (now >= state.resetAt) {
        this.windows.delete(entryKey);
      }
    }
  }
}