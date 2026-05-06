import { afterEach, describe, expect, it, vi } from 'vitest';

import { createAnalysisEngineFromEnv, getAnalysisProviderFromEnv } from './analysis-factory';

describe('analysis-factory', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('ANALYSIS_AI_PROVIDER=openai 이면 OpenAI 분석기를 선택한다', () => {
    const openAIAnalyzer = {
      generateSummary: vi.fn(),
      extractKeywords: vi.fn(),
      identifyTrends: vi.fn(),
    };

    vi.stubEnv('ANALYSIS_AI_PROVIDER', 'openai');

    const analyzer = createAnalysisEngineFromEnv({
      createOpenAI: () => openAIAnalyzer,
      createClaude: () => {
        throw new Error('claude should not be selected');
      },
    });

    expect(analyzer).toBe(openAIAnalyzer);
    expect(getAnalysisProviderFromEnv()).toBe('openai');
  });

  it('설정이 없으면 OpenAI 분석기를 기본값으로 선택한다', () => {
    const openAIAnalyzer = {
      generateSummary: vi.fn(),
      extractKeywords: vi.fn(),
      identifyTrends: vi.fn(),
    };

    const analyzer = createAnalysisEngineFromEnv({
      createOpenAI: () => openAIAnalyzer,
      createClaude: () => {
        throw new Error('claude should not be selected');
      },
    });

    expect(analyzer).toBe(openAIAnalyzer);
    expect(getAnalysisProviderFromEnv()).toBe('openai');
  });
});