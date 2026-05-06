import type { AnalysisHistory, Document, KeywordResult, TrendResult, WeeklyData, WeeklySummary } from './claude';
export interface AnalysisEngine {
    generateSummary(weeklyData: WeeklyData): Promise<WeeklySummary>;
    extractKeywords(documents: Document[]): Promise<KeywordResult[]>;
    identifyTrends(history: AnalysisHistory[]): Promise<TrendResult>;
}
//# sourceMappingURL=analysis.d.ts.map