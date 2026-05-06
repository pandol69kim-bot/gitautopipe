import type { AnalysisEngine } from '../types/analysis';
export type AnalysisProvider = 'claude' | 'openai';
export interface AnalysisFactoryDeps {
    createClaude?: () => AnalysisEngine;
    createOpenAI?: () => AnalysisEngine;
}
export declare function getAnalysisProviderFromEnv(): AnalysisProvider;
export declare function createAnalysisEngineFromEnv(deps?: AnalysisFactoryDeps): AnalysisEngine;
//# sourceMappingURL=analysis-factory.d.ts.map