import { z } from 'zod';
declare const EnvSchema: z.ZodObject<{
    GITHUB_TOKEN: z.ZodString;
    CLAUDE_API_KEY: z.ZodString;
    NOTION_TOKEN: z.ZodString;
    VERCEL_TOKEN: z.ZodOptional<z.ZodString>;
}, z.core.$strip>;
export type EnvConfig = z.infer<typeof EnvSchema>;
export declare function loadEnv(): EnvConfig;
export declare function getEnv(): EnvConfig;
export {};
//# sourceMappingURL=env.d.ts.map