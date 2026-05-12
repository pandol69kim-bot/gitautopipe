import type { LinkedInPost, LinkedInTone, LinkedInConfig, MissionContent, FormattedPost } from '../types/linkedin';
export interface LLMClient {
    messages: {
        create(params: {
            model: string;
            max_tokens: number;
            messages: Array<{
                role: string;
                content: string;
            }>;
        }): Promise<{
            content: Array<{
                type: string;
                text?: string;
            }>;
        }>;
    };
}
export declare class LinkedInContentGenerator {
    private readonly config;
    private readonly client;
    constructor(config: Partial<LinkedInConfig> & {
        apiKey: string;
    }, client: LLMClient);
    generateDraft(mission: MissionContent): Promise<LinkedInPost>;
    applyTone(draft: string, tone: LinkedInTone): Promise<string>;
    addHashtags(content: string, keywords: string[]): Promise<string>;
    formatForPlatform(post: LinkedInPost, mission: MissionContent): Promise<FormattedPost>;
    static buildHashtags(keywords: string[]): string[];
    private callWithRetry;
    private extractSection;
    private buildFileName;
    private sanitizeFileSegment;
    private buildFallbackDraft;
    private sleep;
}
//# sourceMappingURL=linkedin.d.ts.map