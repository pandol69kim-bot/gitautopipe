import { z } from 'zod';
import type {
  AnalysisType,
  Document,
  WeeklyData,
  AnalysisHistory,
  KeywordResult,
  WeeklySummary,
  TrendResult,
  AnalysisResult,
  ClaudeConfig,
  ChunkOptions,
} from '../types/claude';

const DEFAULT_MODEL = 'claude-sonnet-4-6';
const DEFAULT_MAX_TOKENS = 4096;
const DEFAULT_MAX_RETRIES = 3;
const DEFAULT_RETRY_DELAY_MS = 1000;
const DEFAULT_CHUNK_SIZE = 6000;
const DEFAULT_CHUNK_OVERLAP = 200;

const ClaudeConfigSchema = z.object({
  apiKey: z.string().min(1, 'apiKey는 필수입니다'),
  model: z.string().default(DEFAULT_MODEL),
  maxTokens: z.number().int().positive().default(DEFAULT_MAX_TOKENS),
  maxRetries: z.number().int().min(0).default(DEFAULT_MAX_RETRIES),
  retryDelayMs: z.number().int().positive().default(DEFAULT_RETRY_DELAY_MS),
});

// ── 4.3 프롬프트 템플릿 ───────────────────────────────────────────────

const PROMPTS = {
  analyzeContent: (type: AnalysisType, content: string) =>
    `
당신은 셀피시 클럽의 AI 분석 어시스턴트입니다.
아래 ${type} 콘텐츠를 분석하여 핵심 인사이트를 추출해주세요.

## 콘텐츠
${content}

## 분석 지침
- 핵심 주제와 학습 포인트를 명확히 식별
- 실행 가능한 인사이트 도출
- 마크다운 형식으로 구조화하여 출력

## 출력 형식
### 핵심 인사이트
- [인사이트 목록]

### 주요 포인트
- [포인트 목록]

### 다음 단계 제안
- [제안 목록]
`.trim(),

  extractKeywords: (documents: string) =>
    `
다음 문서들에서 핵심 키워드를 추출해주세요.

## 문서 내용
${documents}

## 지침
- 기술적 키워드, 개념, 주제를 식별
- 중복 제거 후 관련성 순으로 정렬
- 각 키워드의 빈도와 관련성 점수(0-1) 평가

## 출력 형식 (JSON)
{"keywords": [{"keyword": "키워드", "frequency": 3, "relevance": 0.9}]}
`.trim(),

  generateWeeklySummary: (data: WeeklyData) =>
    `
셀피시 클럽 Week${String(data.weekNumber).padStart(2, '0')} 활동을 요약해주세요.

## 이번 주 제출 자료 (${data.documents.length}개)
${data.documents.map((d, i) => `### ${i + 1}. ${d.title ?? '무제'}\n${d.content.slice(0, 500)}`).join('\n\n')}

## 지침
- 전체 활동의 하이라이트 3-5개 추출
- 공통 학습 주제 파악
- 참여도 및 퀄리티 평가
- 다음 주 제안 사항 포함

## 출력 형식
### Week${String(data.weekNumber).padStart(2, '0')} 하이라이트
- [목록]

### 공통 학습 주제
[내용]

### 다음 주 제안
- [목록]
`.trim(),

  identifyTrends: (history: AnalysisHistory[]) =>
    `
셀피시 클럽 ${history.length}주 간의 활동 데이터를 분석하여 트렌드를 파악해주세요.

## 주차별 데이터
${history.map((h) => `Week${String(h.weekNumber).padStart(2, '0')}: 키워드=[${h.keywords.slice(0, 5).join(', ')}]`).join('\n')}

## 지침
- 상승 트렌드 키워드 (최근 증가)
- 하락 트렌드 키워드 (최근 감소)
- 지속적으로 등장하는 핵심 주제
- 주간 성장률 평가 (-100 ~ 100)

## 출력 형식
### 상승 트렌드
- [목록]

### 하락 트렌드
- [목록]

### 핵심 지속 주제
- [목록]

### 성장률 평가
[내용]
`.trim(),
} as const;

// 테스트 주입을 위한 최소 클라이언트 인터페이스
export interface AnthropicClient {
  messages: {
    create(params: {
      model: string;
      max_tokens: number;
      messages: Array<{ role: string; content: string }>;
    }): Promise<{ content: Array<{ type: string; text?: string }> }>;
  };
}

// ── ClaudeAnalyzer 클래스 ─────────────────────────────────────────────

export class ClaudeAnalyzer {
  private readonly config: ClaudeConfig;
  private readonly client: AnthropicClient;

  constructor(config: Partial<ClaudeConfig> & { apiKey: string }, client: AnthropicClient) {
    const parsed = ClaudeConfigSchema.parse({
      model: DEFAULT_MODEL,
      maxTokens: DEFAULT_MAX_TOKENS,
      maxRetries: DEFAULT_MAX_RETRIES,
      retryDelayMs: DEFAULT_RETRY_DELAY_MS,
      ...config,
    });
    this.config = parsed;
    this.client = client;
  }

  // ── 4.4 키워드 추출 ──────────────────────────────────────────────────

  async extractKeywords(documents: Document[]): Promise<KeywordResult[]> {
    const combined = documents
      .map((d) => `[${d.title ?? '무제'}]\n${d.content}`)
      .join('\n\n---\n\n');

    const chunks = this.chunkText(combined);
    const allKeywords: KeywordResult[] = [];

    for (const chunk of chunks) {
      const prompt = PROMPTS.extractKeywords(chunk);
      const response = await this.callWithRetry(prompt, 1024);

      const parsed = this.parseJsonResponse<{ keywords: KeywordResult[] }>(response);
      if (parsed?.keywords) {
        allKeywords.push(...parsed.keywords);
      }
    }

    return this.deduplicateKeywords(allKeywords);
  }

  // ── 4.5 주차별 요약 ──────────────────────────────────────────────────

  async generateSummary(weeklyData: WeeklyData): Promise<WeeklySummary> {
    const prompt = PROMPTS.generateWeeklySummary(weeklyData);
    const markdownOutput = await this.callWithRetry(prompt, this.config.maxTokens);

    const keywords = await this.extractKeywords(weeklyData.documents);
    const highlights = this.extractBulletPoints(markdownOutput, '하이라이트');

    return {
      weekNumber: weeklyData.weekNumber,
      highlights,
      summary: markdownOutput,
      participationRate: weeklyData.memberCount
        ? (weeklyData.documents.length / weeklyData.memberCount) * 100
        : undefined,
      topKeywords: keywords.slice(0, 5).map((k) => k.keyword),
      markdownOutput,
    };
  }

  // ── 4.6 트렌드 분석 ──────────────────────────────────────────────────

  async identifyTrends(history: AnalysisHistory[]): Promise<TrendResult> {
    const prompt = PROMPTS.identifyTrends(history);
    const markdownOutput = await this.callWithRetry(prompt, this.config.maxTokens);

    return {
      risingKeywords: this.extractBulletPoints(markdownOutput, '상승 트렌드'),
      decliningKeywords: this.extractBulletPoints(markdownOutput, '하락 트렌드'),
      consistentThemes: this.extractBulletPoints(markdownOutput, '핵심 지속 주제'),
      weeklyGrowth: this.extractGrowthRate(markdownOutput),
      markdownOutput,
    };
  }

  // ── 4.2 콘텐츠 분석 (범용) ───────────────────────────────────────────

  async analyzeContent(content: string, type: AnalysisType): Promise<AnalysisResult> {
    const chunks = this.chunkText(content);
    const results: string[] = [];
    let totalTokens = 0;

    for (const chunk of chunks) {
      const prompt = PROMPTS.analyzeContent(type, chunk);
      const response = await this.callWithRetry(prompt, this.config.maxTokens);
      results.push(response);
      totalTokens += this.estimateTokens(prompt + response);
    }

    const markdownOutput = results.join('\n\n---\n\n');
    const keywords = await this.extractKeywords([{ content, title: type }]);

    return {
      type,
      content: markdownOutput,
      keywords,
      markdownOutput,
      tokensUsed: totalTokens,
      analyzedAt: new Date(),
    };
  }

  // ── 4.7 토큰 최적화: 청킹 ────────────────────────────────────────────

  chunkText(text: string, options: Partial<ChunkOptions> = {}): string[] {
    const { maxChunkSize = DEFAULT_CHUNK_SIZE, overlap = DEFAULT_CHUNK_OVERLAP } = options;

    if (text.length <= maxChunkSize) return [text];

    const chunks: string[] = [];
    let start = 0;

    while (start < text.length) {
      const end = Math.min(start + maxChunkSize, text.length);
      chunks.push(text.slice(start, end));
      if (end >= text.length) break;
      start = end - overlap;
    }

    return chunks;
  }

  estimateTokens(text: string): number {
    // 한국어 포함 텍스트: 문자 수 / 2.5 근사치
    return Math.ceil(text.length / 2.5);
  }

  // ── 4.8 재시도 로직 (Exponential Backoff) ────────────────────────────

  private async callWithRetry(prompt: string, maxTokens: number): Promise<string> {
    let lastError: Error | null = null;

    for (let attempt = 0; attempt <= this.config.maxRetries; attempt++) {
      try {
        const response = await this.client.messages.create({
          model: this.config.model,
          max_tokens: maxTokens,
          messages: [{ role: 'user', content: prompt }],
        });

        const block = response.content[0];
        if (block.type !== 'text' || !block.text) throw new Error('텍스트 응답이 아닙니다');
        return block.text;
      } catch (error: unknown) {
        lastError = error instanceof Error ? error : new Error('알 수 없는 오류');

        if (attempt < this.config.maxRetries) {
          const delay = this.config.retryDelayMs * Math.pow(2, attempt);
          await this.sleep(delay);
        }
      }
    }

    throw new Error(
      `Claude API 호출 실패 (${this.config.maxRetries}회 재시도): ${lastError?.message}`
    );
  }

  // ── 헬퍼 메서드 ──────────────────────────────────────────────────────

  private parseJsonResponse<T>(text: string): T | null {
    const match = text.match(/\{[\s\S]*\}/);
    if (!match) return null;
    try {
      return JSON.parse(match[0]) as T;
    } catch {
      return null;
    }
  }

  private extractBulletPoints(markdown: string, sectionTitle: string): string[] {
    const sectionRegex = new RegExp(`###\\s*${sectionTitle}[\\s\\S]*?(?=###|$)`, 'i');
    const section = markdown.match(sectionRegex)?.[0] ?? '';
    const bullets = section.match(/^[-*]\s+(.+)$/gm) ?? [];
    return bullets.map((b) => b.replace(/^[-*]\s+/, '').trim());
  }

  private extractGrowthRate(markdown: string): number {
    const match = markdown.match(/([+-]?\d+(?:\.\d+)?)\s*%/);
    return match ? parseFloat(match[1]) : 0;
  }

  private deduplicateKeywords(keywords: KeywordResult[]): KeywordResult[] {
    const map = new Map<string, KeywordResult>();

    for (const kw of keywords) {
      const existing = map.get(kw.keyword);
      if (existing) {
        map.set(kw.keyword, {
          keyword: kw.keyword,
          frequency: existing.frequency + kw.frequency,
          relevance: Math.max(existing.relevance, kw.relevance),
        });
      } else {
        map.set(kw.keyword, { ...kw });
      }
    }

    return Array.from(map.values()).sort(
      (a, b) => b.relevance - a.relevance || b.frequency - a.frequency
    );
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
