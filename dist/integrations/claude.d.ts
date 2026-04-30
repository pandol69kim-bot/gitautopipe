import type { AnalysisType, Document, WeeklyData, AnalysisHistory, KeywordResult, WeeklySummary, TrendResult, AnalysisResult, ClaudeConfig, ChunkOptions } from '../types/claude';
export interface AnthropicClient {
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
export declare class ClaudeAnalyzer {
    private readonly config;
    private readonly client;
    constructor(config: Partial<ClaudeConfig> & {
        apiKey: string;
    }, client: AnthropicClient);
    extractKeywords(documents: Document[]): Promise<KeywordResult[]>;
    generateSummary(weeklyData: WeeklyData): Promise<WeeklySummary>;
    identifyTrends(history: AnalysisHistory[]): Promise<TrendResult>;
    analyzeContent(content: string, type: AnalysisType): Promise<AnalysisResult>;
    chunkText(text: string, options?: Partial<ChunkOptions>): string[];
    estimateTokens(text: string): number;
    private callWithRetry;
    private parseJsonResponse;
    private extractBulletPoints;
    private extractGrowthRate;
    private deduplicateKeywords;
    private sleep;
}
//# sourceMappingURL=claude.d.ts.map