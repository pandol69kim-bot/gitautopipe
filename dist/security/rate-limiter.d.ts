import type { RateLimitConfig, RateLimitResult } from '../types/security';
export declare class RateLimiter {
    private readonly config;
    private readonly windows;
    constructor(config: RateLimitConfig);
    check(key: string, now?: Date): RateLimitResult;
    private pruneExpired;
}
//# sourceMappingURL=rate-limiter.d.ts.map