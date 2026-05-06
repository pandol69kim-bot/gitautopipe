import OpenAI from 'openai';

import type { AnalysisEngine } from '../types/analysis';
import type {
  AnalysisHistory,
  Document,
  KeywordResult,
  TrendResult,
  WeeklyData,
  WeeklySummary,
} from '../types/claude';

export interface OpenAIClient {
  chat: {
    completions: {
      create(request: {
        model: string;
        temperature?: number;
        response_format?: { type: 'json_object' };
        messages: Array<{ role: 'system' | 'user'; content: string }>;
      }): Promise<{
        choices: Array<{
          message?: {
            content?: string | Array<{ type?: string; text?: string }>;
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

const DEFAULT_PARTICIPATION_RATE = 100;

export class OpenAIAnalyzer implements AnalysisEngine {
  private readonly config: OpenAIAnalyzerConfig;
  private readonly client: OpenAIClient;

  constructor(config: OpenAIAnalyzerConfig, client?: OpenAIClient) {
    this.config = config;
    this.client = client ?? (new OpenAI({ apiKey: config.apiKey }) as unknown as OpenAIClient);
  }

  async generateSummary(weeklyData: WeeklyData): Promise<WeeklySummary> {
    const fallback = this.buildFallbackSummary(weeklyData);
    const prompt = [
      `weekNumber: ${weeklyData.weekNumber}`,
      `memberCount: ${weeklyData.memberCount ?? weeklyData.documents.length}`,
      'documents:',
      ...weeklyData.documents.map((document, index) =>
        [
          `${index + 1}. title=${document.title ?? 'Untitled'}`,
          `date=${document.date?.toISOString() ?? 'unknown'}`,
          `author=${document.author ?? 'unknown'}`,
          document.content,
        ].join('\n')
      ),
    ].join('\n\n');

    const response = await this.requestJson<Partial<WeeklySummary> & { memberCount?: number }>(
      '주간 회의 문서를 요약해 JSON으로 반환한다. highlights는 배열, summary와 markdownOutput은 마크다운 문자열로 작성한다.',
      prompt,
      fallback
    );

    return {
      weekNumber: typeof response.weekNumber === 'number' ? response.weekNumber : fallback.weekNumber,
      highlights: Array.isArray(response.highlights) ? response.highlights : fallback.highlights,
      summary: typeof response.summary === 'string' ? response.summary : fallback.summary,
      participationRate:
        typeof response.participationRate === 'number'
          ? response.participationRate
          : fallback.participationRate,
      topKeywords: Array.isArray(response.topKeywords)
        ? response.topKeywords
        : fallback.topKeywords,
      markdownOutput:
        typeof response.markdownOutput === 'string'
          ? response.markdownOutput
          : fallback.markdownOutput,
    };
  }

  async extractKeywords(documents: Document[]): Promise<KeywordResult[]> {
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

    const response = await this.requestJson<{ keywords?: KeywordResult[]; items?: KeywordResult[] }>(
      '문서에서 핵심 키워드를 추출한다. JSON 객체만 반환하고, keywords 배열에 keyword, frequency, relevance를 담는다.',
      prompt,
      { keywords: fallback }
    );

    if (Array.isArray(response.keywords)) {
      return response.keywords;
    }

    if (Array.isArray(response.items)) {
      return response.items;
    }

    return fallback;
  }

  async identifyTrends(history: AnalysisHistory[]): Promise<TrendResult> {
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

    return this.requestJson<TrendResult>(
      '분석 이력의 트렌드를 요약한다. risingKeywords, decliningKeywords, consistentThemes, weeklyGrowth, markdownOutput을 포함한 JSON 객체만 반환한다.',
      prompt,
      fallback
    );
  }

  private async requestJson<T>(systemPrompt: string, userPrompt: string, fallback: T): Promise<T> {
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

      return this.parseJson<T>(content, fallback);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      process.emitWarning(`OpenAIAnalyzer fallback applied: ${message}`);
      return fallback;
    }
  }

  private extractContent(response: {
    choices: Array<{
      message?: {
        content?: string | Array<{ type?: string; text?: string }>;
      };
    }>;
  }): string {
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

  private parseJson<T>(content: string, fallback: T): T {
    try {
      return JSON.parse(content) as T;
    } catch {
      const fenced = content.match(/```(?:json)?\s*([\s\S]*?)```/i);
      if (fenced?.[1]) {
        try {
          return JSON.parse(fenced[1]) as T;
        } catch {
          return fallback;
        }
      }
      return fallback;
    }
  }

  private buildFallbackSummary(weeklyData: WeeklyData): WeeklySummary {
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

  private buildFallbackKeywords(documents: Document[]): KeywordResult[] {
    const tokenCounts = new Map<string, number>();

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

  private buildFallbackTrends(history: AnalysisHistory[]): TrendResult {
    const keywords = history.flatMap((entry) => entry.keywords);
    const consistentThemes = [...new Set(keywords)].slice(0, 5);

    return {
      risingKeywords: consistentThemes.slice(0, 3),
      decliningKeywords: [],
      consistentThemes,
      weeklyGrowth: 0,
      markdownOutput:
        consistentThemes.length > 0
          ? ['### 주요 흐름', ...consistentThemes.map((keyword) => `- ${keyword}`)].join('\n')
          : '### 주요 흐름\n- 추세 데이터가 부족합니다.',
    };
  }
}