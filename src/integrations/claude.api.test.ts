import { describe, it, expect } from 'vitest';
import { ClaudeAnalyzer } from './claude';
import type { AnthropicClient } from './claude';
import type { Document, WeeklyData, AnalysisHistory } from '../types/claude';

const MOCK_RESPONSE = [
  '### 핵심 인사이트',
  '- 인사이트 1',
  '- 인사이트 2',
  '',
  '### 상승 트렌드',
  '- TypeScript',
  '- AI',
  '',
  '### 하락 트렌드',
  '- jQuery',
  '',
  '### 핵심 지속 주제',
  '- 클린코드',
  '',
  '### 성장률 평가',
  '성장률: +15%',
  '',
  '{"keywords": [{"keyword": "TypeScript", "frequency": 3, "relevance": 0.9}, {"keyword": "React", "frequency": 2, "relevance": 0.8}]}',
].join('\n');

const DUP_RESPONSE =
  '{"keywords": [{"keyword": "TypeScript", "frequency": 2, "relevance": 0.8}, {"keyword": "TypeScript", "frequency": 3, "relevance": 0.9}]}';

function makeMockClient(
  text: string
): AnthropicClient & { callCount: number; lastCallArgs: unknown } {
  const mock = {
    callCount: 0,
    lastCallArgs: null as unknown,
    messages: {
      create(params: unknown): Promise<{ content: Array<{ type: string; text?: string }> }> {
        mock.callCount++;
        mock.lastCallArgs = params;
        return Promise.resolve({ content: [{ type: 'text', text }] });
      },
    },
  };
  return mock;
}

const makeAnalyzer = (responseText = MOCK_RESPONSE) => {
  const client = makeMockClient(responseText);
  return { analyzer: new ClaudeAnalyzer({ apiKey: 'sk-ant-test', maxRetries: 0 }, client), client };
};

const makeDocs = (): Document[] => [
  { content: 'TypeScript 제네릭을 활용한 타입 안전 코딩', title: '학습 노트', author: '홍길동' },
  { content: 'React 컴포넌트 최적화와 메모이제이션 전략', title: '인사이트', author: '김철수' },
];

const makeWeeklyData = (): WeeklyData => ({
  weekNumber: 3,
  documents: makeDocs(),
  memberCount: 5,
});

const makeHistory = (): AnalysisHistory[] => [
  { weekNumber: 1, keywords: ['TypeScript', 'React'], summary: '1주차', analyzedAt: new Date() },
  { weekNumber: 2, keywords: ['AI', 'TypeScript'], summary: '2주차', analyzedAt: new Date() },
  {
    weekNumber: 3,
    keywords: ['AI', 'Claude', 'TypeScript'],
    summary: '3주차',
    analyzedAt: new Date(),
  },
];

describe('ClaudeAnalyzer - API', () => {
  describe('생성자', () => {
    it('유효한 설정으로 인스턴스 생성', () => {
      expect(makeAnalyzer().analyzer).toBeInstanceOf(ClaudeAnalyzer);
    });

    it('빈 apiKey로 생성 시 에러', () => {
      expect(() => new ClaudeAnalyzer({ apiKey: '' }, makeMockClient(''))).toThrow();
    });
  });

  describe('chunkText (토큰 최적화)', () => {
    it('짧은 텍스트는 그대로 반환', () => {
      const chunks = makeAnalyzer().analyzer.chunkText('짧은 텍스트');
      expect(chunks).toHaveLength(1);
      expect(chunks[0]).toBe('짧은 텍스트');
    });

    it('긴 텍스트는 청크로 분할 (소형 maxChunkSize 사용)', () => {
      const text = 'ABCDEABCDEABCDEABCDEABCDEABCDEABCDEABCDEABCDEABCDEABCDEABCDEABCDEABCDEABCDE';
      const chunks = makeAnalyzer().analyzer.chunkText(text, { maxChunkSize: 30, overlap: 5 });
      expect(chunks.length).toBeGreaterThan(1);
      expect(chunks[0].length).toBeLessThanOrEqual(30);
    });

    it('청크 간 overlap 적용', () => {
      const text =
        '01234567890123456789012345678901234567890123456789012345678901234567890123456789';
      const chunks = makeAnalyzer().analyzer.chunkText(text, { maxChunkSize: 50, overlap: 10 });
      expect(chunks.length).toBeGreaterThan(1);
    });
  });

  describe('estimateTokens', () => {
    it('토큰 수 추정 반환', () => {
      expect(makeAnalyzer().analyzer.estimateTokens('안녕하세요 테스트')).toBeGreaterThan(0);
    });

    it('긴 텍스트는 더 많은 토큰', () => {
      const { analyzer } = makeAnalyzer();
      const longText =
        'This is a longer text for testing token estimation purposes in the analyzer module';
      expect(analyzer.estimateTokens(longText)).toBeGreaterThan(analyzer.estimateTokens('짧은'));
    });
  });

  describe('analyzeContent', () => {
    it('분석 결과 구조 반환', async () => {
      const { analyzer } = makeAnalyzer();
      const result = await analyzer.analyzeContent('테스트 콘텐츠', 'mission');
      expect(result.type).toBe('mission');
      expect(result.markdownOutput).toBeTruthy();
      expect(result.tokensUsed).toBeGreaterThan(0);
      expect(result.analyzedAt).toBeInstanceOf(Date);
    });

    it('모든 AnalysisType 동작', async () => {
      const types = ['mission', 'meeting', 'skill', 'sharing', 'linkedin', 'analysis'] as const;
      for (const type of types) {
        const { analyzer } = makeAnalyzer();
        expect((await analyzer.analyzeContent('내용', type)).type).toBe(type);
      }
    });

    it('prompt에 type 포함', async () => {
      const { analyzer, client } = makeAnalyzer();
      await analyzer.analyzeContent('콘텐츠', 'skill');
      expect(client.callCount).toBeGreaterThan(0);
      expect(
        (client.lastCallArgs as { messages: Array<{ content: string }> }).messages[0].content
      ).toContain('skill');
    });
  });

  describe('extractKeywords', () => {
    it('KeywordResult 배열 반환', async () => {
      expect(Array.isArray(await makeAnalyzer().analyzer.extractKeywords(makeDocs()))).toBe(true);
    });

    it('중복 키워드 병합', async () => {
      const keywords = await makeAnalyzer(DUP_RESPONSE).analyzer.extractKeywords(makeDocs());
      expect(keywords.filter((k) => k.keyword === 'TypeScript').length).toBe(1);
    });

    it('관련성 내림차순 정렬', async () => {
      const keywords = await makeAnalyzer().analyzer.extractKeywords(makeDocs());
      for (let i = 0; i < keywords.length - 1; i++) {
        expect(keywords[i].relevance).toBeGreaterThanOrEqual(keywords[i + 1].relevance);
      }
    });
  });

  describe('generateSummary', () => {
    it('WeeklySummary 구조 반환', async () => {
      const summary = await makeAnalyzer().analyzer.generateSummary(makeWeeklyData());
      expect(summary.weekNumber).toBe(3);
      expect(summary.markdownOutput).toBeTruthy();
      expect(Array.isArray(summary.topKeywords)).toBe(true);
    });

    it('participationRate 계산 (2/5 * 100 = 40)', async () => {
      expect(
        (await makeAnalyzer().analyzer.generateSummary(makeWeeklyData())).participationRate
      ).toBe(40);
    });

    it('memberCount 없으면 participationRate undefined', async () => {
      const data: WeeklyData = { weekNumber: 1, documents: makeDocs() };
      expect(
        (await makeAnalyzer().analyzer.generateSummary(data)).participationRate
      ).toBeUndefined();
    });
  });

  describe('identifyTrends', () => {
    it('TrendResult 구조 반환', async () => {
      const trend = await makeAnalyzer().analyzer.identifyTrends(makeHistory());
      expect(Array.isArray(trend.risingKeywords)).toBe(true);
      expect(Array.isArray(trend.decliningKeywords)).toBe(true);
      expect(Array.isArray(trend.consistentThemes)).toBe(true);
      expect(trend.markdownOutput).toBeTruthy();
    });

    it('성장률 숫자 파싱 (+15% → 15)', async () => {
      expect((await makeAnalyzer().analyzer.identifyTrends(makeHistory())).weeklyGrowth).toBe(15);
    });
  });

  describe('에러 핸들링 및 재시도', () => {
    it('API 실패 시 에러 throw', async () => {
      const failClient: AnthropicClient = {
        messages: {
          create(): Promise<never> {
            return Promise.reject(new Error('API 오류'));
          },
        },
      };
      const analyzer = new ClaudeAnalyzer({ apiKey: 'sk-ant-test', maxRetries: 0 }, failClient);
      await expect(analyzer.analyzeContent('내용', 'mission')).rejects.toThrow(
        'Claude API 호출 실패'
      );
    });

    it('재시도 후 성공하면 결과 반환', async () => {
      let callCount = 0;
      const retryClient: AnthropicClient = {
        messages: {
          create(): Promise<{ content: Array<{ type: string; text?: string }> }> {
            callCount++;
            if (callCount < 2) return Promise.reject(new Error('일시적 오류'));
            return Promise.resolve({ content: [{ type: 'text', text: MOCK_RESPONSE }] });
          },
        },
      };
      const analyzer = new ClaudeAnalyzer(
        { apiKey: 'sk-ant-test', maxRetries: 2, retryDelayMs: 1 },
        retryClient
      );
      const result = await analyzer.analyzeContent('내용', 'mission');
      expect(result.markdownOutput).toBeTruthy();
      // analyzeContent makes 2 calls: 1 content analysis (1 fail + 1 retry) + 1 extractKeywords
      expect(callCount).toBe(3);
    });
  });
});
