import type { AnalysisEngine } from '../types/analysis';
import type { AnalysisHistory, Document, KeywordResult, TrendResult, WeeklyData, WeeklySummary } from '../types/claude';
export interface OpenAIClient {
    chat: {
        completions: {
            create(request: {
                model: string;
                temperature?: number;
                response_format?: {
                    type: 'json_object';
                };
                messages: Array<{
                    role: 'system' | 'user';
                    content: string;
                }>;
            }): Promise<{
                choices: Array<{
                    message?: {
                        content?: string | Array<{
                            type?: string;
                            text?: string;
                        }>;
                    };
                }>;
            }>;
        };
    };
}
export interface OpenAIAnalyzerConfig {
    apiKey: string;
    model: string;
}
export declare class OpenAIAnalyzer implements AnalysisEngine {
    private readonly config;
    private readonly client;
    constructor(config: OpenAIAnalyzerConfig, client?: OpenAIClient);
    generateSummary(weeklyData: WeeklyData): Promise<WeeklySummary>;
    extractKeywords(documents: Document[]): Promise<KeywordResult[]>;
    identifyTrends(history: AnalysisHistory[]): Promise<TrendResult>;
    private requestJson;
    private extractContent;
    private parseJson;
    private buildFallbackSummary;
    private buildFallbackKeywords;
    private buildFallbackTrends;
}
//# sourceMappingURL=openai.d.ts.map