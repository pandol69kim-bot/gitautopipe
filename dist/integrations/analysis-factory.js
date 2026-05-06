"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getAnalysisProviderFromEnv = getAnalysisProviderFromEnv;
exports.createAnalysisEngineFromEnv = createAnalysisEngineFromEnv;
const claude_factory_1 = require("./claude-factory");
const openai_1 = require("./openai");
function getAnalysisProviderFromEnv() {
    const rawProvider = process.env['ANALYSIS_AI_PROVIDER'] ?? process.env['ANALYSIS_PROVIDER'] ?? 'openai';
    return rawProvider.toLowerCase() === 'openai' ? 'openai' : 'claude';
}
function createAnalysisEngineFromEnv(deps = {}) {
    const provider = getAnalysisProviderFromEnv();
    if (provider === 'openai') {
        if (deps.createOpenAI) {
            return deps.createOpenAI();
        }
        const apiKey = process.env['OPENAI_API_KEY'];
        if (!apiKey) {
            throw new Error('OPENAI_API_KEY 환경변수가 필요합니다.');
        }
        return new openai_1.OpenAIAnalyzer({
            apiKey,
            model: process.env['OPENAI_MODEL'] ?? 'gpt-4o-mini',
        });
    }
    if (deps.createClaude) {
        return deps.createClaude();
    }
    const apiKey = process.env['CLAUDE_API_KEY'] ?? process.env['ANTHROPIC_API_KEY'];
    if (!apiKey) {
        throw new Error('CLAUDE_API_KEY 또는 ANTHROPIC_API_KEY 환경변수가 필요합니다.');
    }
    return (0, claude_factory_1.createClaudeAnalyzer)({
        apiKey,
        model: process.env['CLAUDE_MODEL'] ?? 'claude-3-5-sonnet-latest',
        maxTokens: parseNumber(process.env['CLAUDE_MAX_TOKENS'], 4096),
        maxRetries: parseNumber(process.env['CLAUDE_MAX_RETRIES'], 3),
        retryDelayMs: parseNumber(process.env['CLAUDE_RETRY_DELAY_MS'], 1000),
    });
}
function parseNumber(input, fallback) {
    const parsed = Number.parseInt(input ?? '', 10);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}
//# sourceMappingURL=analysis-factory.js.map