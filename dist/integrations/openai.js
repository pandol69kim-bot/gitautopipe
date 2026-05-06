"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.OpenAIAnalyzer = void 0;
const openai_1 = __importDefault(require("openai"));
const DEFAULT_PARTICIPATION_RATE = 100;
class OpenAIAnalyzer {
    config;
    client;
    constructor(config, client) {
        this.config = config;
        this.client = client ?? new openai_1.default({ apiKey: config.apiKey });
    }
    async generateSummary(weeklyData) {
        const fallback = this.buildFallbackSummary(weeklyData);
        const prompt = [
            `weekNumber: ${weeklyData.weekNumber}`,
            `memberCount: ${weeklyData.memberCount ?? weeklyData.documents.length}`,
            'documents:',
            ...weeklyData.documents.map((document, index) => [
                `${index + 1}. title=${document.title ?? 'Untitled'}`,
                `date=${document.date?.toISOString() ?? 'unknown'}`,
                `author=${document.author ?? 'unknown'}`,
                document.content,
            ].join('\n')),
        ].join('\n\n');
        const response = await this.requestJson('주간 회의 문서를 요약해 JSON으로 반환한다. highlights는 배열, summary와 markdownOutput은 마크다운 문자열로 작성한다.', prompt, fallback);
        return {
            weekNumber: typeof response.weekNumber === 'number' ? response.weekNumber : fallback.weekNumber,
            highlights: Array.isArray(response.highlights) ? response.highlights : fallback.highlights,
            summary: typeof response.summary === 'string' ? response.summary : fallback.summary,
            participationRate: typeof response.participationRate === 'number'
                ? response.participationRate
                : fallback.participationRate,
            topKeywords: Array.isArray(response.topKeywords)
                ? response.topKeywords
                : fallback.topKeywords,
            markdownOutput: typeof response.markdownOutput === 'string'
                ? response.markdownOutput
                : fallback.markdownOutput,
        };
    }
    async extractKeywords(documents) {
        const fallback = this.buildFallbackKeywords(documents);
        const prompt = documents
            .map((document, index) => {
            return [
                `${index + 1}. title=${document.title ?? 'Untitled'}`,
                `author=${document.author ?? 'unknown'}`,
                document.content,
            ].join('\n');
        })
            .join('\n\n');
        const response = await this.requestJson('문서에서 핵심 키워드를 추출한다. JSON 객체만 반환하고, keywords 배열에 keyword, frequency, relevance를 담는다.', prompt, { keywords: fallback });
        if (Array.isArray(response.keywords)) {
            return response.keywords;
        }
        if (Array.isArray(response.items)) {
            return response.items;
        }
        return fallback;
    }
    async identifyTrends(history) {
        const fallback = this.buildFallbackTrends(history);
        const prompt = history
            .map((entry) => {
            return [
                `weekNumber=${entry.weekNumber}`,
                `keywords=${entry.keywords.join(', ')}`,
                `participationRate=${entry.participationRate ?? DEFAULT_PARTICIPATION_RATE}`,
                `summary=${entry.summary}`,
            ].join('\n');
        })
            .join('\n\n');
        return this.requestJson('분석 이력의 트렌드를 요약한다. risingKeywords, decliningKeywords, consistentThemes, weeklyGrowth, markdownOutput을 포함한 JSON 객체만 반환한다.', prompt, fallback);
    }
    async requestJson(systemPrompt, userPrompt, fallback) {
        try {
            const response = await this.client.chat.completions.create({
                model: this.config.model,
                temperature: 0.2,
                response_format: { type: 'json_object' },
                messages: [
                    { role: 'system', content: systemPrompt },
                    { role: 'user', content: userPrompt },
                ],
            });
            const content = this.extractContent(response);
            if (!content) {
                return fallback;
            }
            return this.parseJson(content, fallback);
        }
        catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            process.emitWarning(`OpenAIAnalyzer fallback applied: ${message}`);
            return fallback;
        }
    }
    extractContent(response) {
        const content = response.choices[0]?.message?.content;
        if (typeof content === 'string') {
            return content;
        }
        if (Array.isArray(content)) {
            return content
                .map((part) => (typeof part.text === 'string' ? part.text : ''))
                .join('')
                .trim();
        }
        return '';
    }
    parseJson(content, fallback) {
        try {
            return JSON.parse(content);
        }
        catch {
            const fenced = content.match(/```(?:json)?\s*([\s\S]*?)```/i);
            if (fenced?.[1]) {
                try {
                    return JSON.parse(fenced[1]);
                }
                catch {
                    return fallback;
                }
            }
            return fallback;
        }
    }
    buildFallbackSummary(weeklyData) {
        const highlights = weeklyData.documents
            .flatMap((document) => document.content.split(/\r?\n/))
            .map((line) => line.replace(/^[-*#\s]+/, '').trim())
            .filter((line) => line.length > 0)
            .slice(0, 3);
        const summary = highlights.length > 0 ? highlights.join('\n') : '이번 주 회의 요약을 생성할 내용이 부족합니다.';
        return {
            weekNumber: weeklyData.weekNumber,
            highlights,
            summary,
            participationRate: DEFAULT_PARTICIPATION_RATE,
            topKeywords: this.buildFallbackKeywords(weeklyData.documents).map((keyword) => keyword.keyword),
            markdownOutput: summary,
        };
    }
    buildFallbackKeywords(documents) {
        const tokenCounts = new Map();
        for (const document of documents) {
            const tokens = document.content
                .split(/[^\p{L}\p{N}_]+/u)
                .map((token) => token.trim())
                .filter((token) => token.length >= 2);
            for (const token of tokens) {
                tokenCounts.set(token, (tokenCounts.get(token) ?? 0) + 1);
            }
        }
        return [...tokenCounts.entries()]
            .sort((left, right) => right[1] - left[1])
            .slice(0, 10)
            .map(([keyword, frequency]) => ({
            keyword,
            frequency,
            relevance: Number((Math.min(1, 0.4 + frequency / 10)).toFixed(2)),
        }));
    }
    buildFallbackTrends(history) {
        const keywords = history.flatMap((entry) => entry.keywords);
        const consistentThemes = [...new Set(keywords)].slice(0, 5);
        return {
            risingKeywords: consistentThemes.slice(0, 3),
            decliningKeywords: [],
            consistentThemes,
            weeklyGrowth: 0,
            markdownOutput: consistentThemes.length > 0
                ? ['### 주요 흐름', ...consistentThemes.map((keyword) => `- ${keyword}`)].join('\n')
                : '### 주요 흐름\n- 추세 데이터가 부족합니다.',
        };
    }
}
exports.OpenAIAnalyzer = OpenAIAnalyzer;
//# sourceMappingURL=openai.js.map