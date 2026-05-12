import { z } from 'zod';
import type {
  LinkedInPost,
  LinkedInTone,
  LinkedInConfig,
  MissionContent,
  FormattedPost,
} from '../types/linkedin';
import { LINKEDIN_CHAR_LIMIT } from '../types/linkedin';

const DEFAULT_MODEL = 'gpt-4o-mini';
const DEFAULT_MAX_TOKENS = 2048;
const DEFAULT_MAX_RETRIES = 3;
const DEFAULT_RETRY_DELAY_MS = 1000;

const LinkedInConfigSchema = z.object({
  apiKey: z.string().min(1, 'apiKey는 필수입니다'),
  model: z.string().default(DEFAULT_MODEL),
  maxTokens: z.number().int().positive().default(DEFAULT_MAX_TOKENS),
  maxRetries: z.number().int().min(0).default(DEFAULT_MAX_RETRIES),
  retryDelayMs: z.number().int().positive().default(DEFAULT_RETRY_DELAY_MS),
});

export interface LLMClient {
  messages: {
    create(params: {
      model: string;
      max_tokens: number;
      messages: Array<{ role: string; content: string }>;
    }): Promise<{ content: Array<{ type: string; text?: string }> }>;
  };
}

// ── 프롬프트 템플릿 ────────────────────────────────────────────────────

const TONE_DESCRIPTIONS: Record<LinkedInTone, string> = {
  professional: '전문적이고 격식 있는 어조. 데이터와 인사이트 중심.',
  casual: '친근하고 편안한 어조. 대화하듯 자연스럽게.',
  'thought-leader': '업계 리더의 관점. 통찰력 있는 메시지와 미래 지향적 시각.',
};

const PROMPTS = {
  generateDraft: (mission: MissionContent) =>
    `
당신은 LinkedIn 콘텐츠 전문가입니다.
아래 Mission 학습 내용을 바탕으로 LinkedIn 게시물 초안을 작성해주세요.

## 미션 정보
- 제목: ${mission.title}
- 작성자: ${mission.author}
- 날짜: ${mission.date.toISOString().split('T')[0]}
${mission.weekNumber ? `- 주차: Week${String(mission.weekNumber).padStart(2, '0')}` : ''}

## 학습 내용
${mission.body}

## 작성 지침
- 1인칭 시점으로 개인적인 학습 경험을 공유
- 독자에게 실질적인 가치를 제공
- 진정성 있고 구체적으로 작성
- 단락 사이에 빈 줄 추가 (LinkedIn 가독성)

## 출력 형식
### 헤드라인
[한 줄 핵심 메시지]

### 본문
[3-5 단락의 게시물 내용]

### CTA
[독자 참여 유도 질문 또는 행동 촉구]
`.trim(),

  applyTone: (draft: string, tone: LinkedInTone) =>
    `
다음 LinkedIn 게시물을 "${TONE_DESCRIPTIONS[tone]}" 스타일로 다시 작성해주세요.
원본 메시지의 핵심 내용은 유지하되, 어조와 표현만 변경하세요.

## 원본
${draft}

## 지침
- 어조: ${TONE_DESCRIPTIONS[tone]}
- 내용 손실 없이 표현 방식만 변경
- 마크다운 없이 순수 텍스트로 출력
`.trim(),
};

// ── LinkedInContentGenerator 클래스 ───────────────────────────────────

export class LinkedInContentGenerator {
  private readonly config: z.infer<typeof LinkedInConfigSchema>;
  private readonly client: LLMClient;

  constructor(config: Partial<LinkedInConfig> & { apiKey: string }, client: LLMClient) {
    this.config = LinkedInConfigSchema.parse({
      model: DEFAULT_MODEL,
      maxTokens: DEFAULT_MAX_TOKENS,
      maxRetries: DEFAULT_MAX_RETRIES,
      retryDelayMs: DEFAULT_RETRY_DELAY_MS,
      ...config,
    });
    this.client = client;
  }

  // ── Subtask 2: 초안 생성 ──────────────────────────────────────────

  async generateDraft(mission: MissionContent): Promise<LinkedInPost> {
    const prompt = PROMPTS.generateDraft(mission);
    try {
      const raw = await this.callWithRetry(prompt);

      const headline = this.extractSection(raw, '헤드라인');
      const body = this.extractSection(raw, '본문');
      const callToAction = this.extractSection(raw, 'CTA');
      const hashtags = LinkedInContentGenerator.buildHashtags(mission.keywords ?? []);

      if (headline.length > 0 && body.length > 0) {
        return { headline, body, hashtags, callToAction, generationMode: 'llm' };
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      process.emitWarning(`LinkedIn draft fallback applied: ${message}`);
      return this.buildFallbackDraft(mission, message);
    }

    return this.buildFallbackDraft(mission, 'model-output-missing-required-sections');
  }

  // ── Subtask 3: 톤 적용 ────────────────────────────────────────────

  async applyTone(draft: string, tone: LinkedInTone): Promise<string> {
    const prompt = PROMPTS.applyTone(draft, tone);
    return this.callWithRetry(prompt);
  }

  // ── Subtask 4: 해시태그 추가 ──────────────────────────────────────

  async addHashtags(content: string, keywords: string[]): Promise<string> {
    if (keywords.length === 0) return content;

    const tags = LinkedInContentGenerator.buildHashtags(keywords);
    return `${content}\n\n${tags.join(' ')}`;
  }

  // ── Subtask 5: 플랫폼 포맷팅 & 파일명 생성 ───────────────────────

  async formatForPlatform(post: LinkedInPost, mission: MissionContent): Promise<FormattedPost> {
    const parts = [post.headline, '', post.body];

    if (post.callToAction) {
      parts.push('', post.callToAction);
    }

    if (post.hashtags.length > 0) {
      parts.push('', post.hashtags.join(' '));
    }

    const content = parts.join('\n');
    const charCount = content.length;

    return {
      content,
      charCount,
      isWithinLimit: charCount <= LINKEDIN_CHAR_LIMIT,
      hashtags: post.hashtags,
      fileName: this.buildFileName(mission),
    };
  }

  // ── static 헬퍼: 해시태그 빌드 ───────────────────────────────────

  static buildHashtags(keywords: string[]): string[] {
    const seen = new Set<string>();
    const result: string[] = [];

    for (const kw of keywords) {
      const tag =
        '#' +
        kw
          .split(/\s+/)
          .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
          .join('');

      if (!seen.has(tag)) {
        seen.add(tag);
        result.push(tag);
      }

      if (result.length >= 10) break;
    }

    return result;
  }

  // ── 내부 헬퍼 ────────────────────────────────────────────────────

  private async callWithRetry(prompt: string): Promise<string> {
    let lastError: Error | null = null;

    for (let attempt = 0; attempt <= this.config.maxRetries; attempt++) {
      try {
        const response = await this.client.messages.create({
          model: this.config.model,
          max_tokens: this.config.maxTokens,
          messages: [{ role: 'user', content: prompt }],
        });

        const block = response.content[0];
        if (block.type !== 'text' || !block.text) throw new Error('텍스트 응답이 아닙니다');
        return block.text;
      } catch (error: unknown) {
        lastError = error instanceof Error ? error : new Error('알 수 없는 오류');
        if (attempt < this.config.maxRetries) {
          await this.sleep(this.config.retryDelayMs * Math.pow(2, attempt));
        }
      }
    }

    throw new Error(
      `LinkedIn 생성 실패 (${this.config.maxRetries}회 재시도): ${lastError?.message}`
    );
  }

  private extractSection(text: string, sectionTitle: string): string {
    const regex = new RegExp(`###\\s*${sectionTitle}\\s*\\n([\\s\\S]*?)(?=###|$)`, 'i');
    const match = text.match(regex);
    return match ? match[1].trim() : '';
  }

  private buildFileName(mission: MissionContent): string {
    const date = mission.date.toISOString().split('T')[0];
    const title = this.sanitizeFileSegment(mission.title, 30);
    const author = this.sanitizeFileSegment(mission.author, 20);
    return `${date}_${title}_${author}.md`;
  }

  private sanitizeFileSegment(value: string, maxLength: number): string {
    const sanitized = value
      .replace(/[\\/.:*?"<>|]/g, '_')
      .replace(/\s+/g, '_')
      .replace(/_+/g, '_')
      .replace(/^_+|_+$/g, '')
      .slice(0, maxLength);

    return sanitized.length > 0 ? sanitized : 'unknown';
  }

  private buildFallbackDraft(mission: MissionContent, fallbackReason: string): LinkedInPost {
    const normalizedBody = mission.body
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => line.length > 0)
      .join(' ')
      .slice(0, 1200);

    const headline = `${mission.title}에서 배운 점`;
    const body = [
      `이번 주에는 ${mission.title}를 중심으로 학습하고 적용한 내용을 정리했습니다.`,
      normalizedBody.length > 0 ? normalizedBody : '실무에 바로 적용할 수 있는 포인트를 중심으로 정리했습니다.',
      '같은 주제를 다루는 분들과 시행착오와 개선 포인트를 더 나눠보고 싶습니다.',
    ].join('\n\n');

    return {
      headline,
      body,
      hashtags: LinkedInContentGenerator.buildHashtags(mission.keywords ?? []),
      callToAction: '비슷한 경험이나 더 좋은 접근이 있다면 공유해주세요.',
      generationMode: 'fallback',
      fallbackReason,
    };
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
