import { describe, it, expect, vi, beforeEach } from 'vitest';
import { LinkedInContentGenerator } from './linkedin';
import type { MissionContent, LinkedInPost } from '../types/linkedin';

const mockClient = {
  messages: {
    create: vi.fn(),
  },
};

const sampleMission: MissionContent = {
  title: 'React Hooks 심화 학습',
  body: 'useState와 useEffect를 실제 프로젝트에 적용하며 커스텀 훅을 만들어봤습니다. 상태 관리의 복잡성을 줄이는 방법을 익혔습니다.',
  author: 'alice',
  date: new Date('2026-05-01'),
  weekNumber: 3,
  keywords: ['React', 'Hooks', 'useState', 'useEffect'],
};

const mockLLMPost = `### 헤드라인
React Hooks로 상태 관리 혁신하기

### 본문
저는 이번 주 React의 useState와 useEffect를 실전 프로젝트에 깊이 적용해봤습니다.

커스텀 훅을 만들면서 코드 재사용성이 얼마나 올라가는지 직접 경험했습니다.

상태 관리의 복잡성을 줄이는 패턴을 익히며 한 단계 성장했습니다.

### CTA
여러분은 React Hooks를 어떻게 활용하고 계신가요?`;

function makeClient(text: string) {
  return {
    messages: {
      create: vi.fn().mockResolvedValue({
        content: [{ type: 'text', text }],
      }),
    },
  };
}

describe('LinkedInContentGenerator', () => {
  let generator: LinkedInContentGenerator;

  beforeEach(() => {
    vi.clearAllMocks();
    generator = new LinkedInContentGenerator(
      { apiKey: 'test-key' },
      makeClient(mockLLMPost)
    );
  });

  // ── Subtask 2: generateDraft ───────────────────────────────────────

  describe('generateDraft', () => {
    it('LinkedInPost 인터페이스 구조를 반환한다', async () => {
      const post = await generator.generateDraft(sampleMission);

      expect(post).toMatchObject({
        headline: expect.any(String),
        body: expect.any(String),
        hashtags: expect.any(Array),
      });
    });

    it('headline이 비어있지 않다', async () => {
      const post = await generator.generateDraft(sampleMission);
      expect(post.headline.length).toBeGreaterThan(0);
    });

    it('body가 비어있지 않다', async () => {
      const post = await generator.generateDraft(sampleMission);
      expect(post.body.length).toBeGreaterThan(0);
    });

    it('mission keywords에서 hashtags를 생성한다', async () => {
      const post = await generator.generateDraft(sampleMission);
      expect(post.hashtags.length).toBeGreaterThan(0);
      expect(post.hashtags.every((h) => h.startsWith('#'))).toBe(true);
    });

    it('callToAction이 포함된다', async () => {
      const post = await generator.generateDraft(sampleMission);
      expect(post.callToAction).toBeDefined();
      expect(typeof post.callToAction).toBe('string');
    });

    it('LLM 클라이언트를 1회 호출한다', async () => {
      const client = makeClient(mockLLMPost);
      const gen = new LinkedInContentGenerator({ apiKey: 'test' }, client);
      await gen.generateDraft(sampleMission);
      expect(client.messages.create).toHaveBeenCalledTimes(1);
    });
  });

  // ── Subtask 3: applyTone ──────────────────────────────────────────

  describe('applyTone', () => {
    const draft = '저는 React Hooks를 공부했습니다. 많은 것을 배웠습니다.';

    it('professional 톤 적용 시 LLM을 호출한다', async () => {
      const client = makeClient('전문적으로 수정된 내용입니다.');
      const gen = new LinkedInContentGenerator({ apiKey: 'test' }, client);
      const result = await gen.applyTone(draft, 'professional');

      expect(client.messages.create).toHaveBeenCalledTimes(1);
      expect(typeof result).toBe('string');
      expect(result.length).toBeGreaterThan(0);
    });

    it('casual 톤 적용 시 결과를 반환한다', async () => {
      const client = makeClient('편하게 쓴 내용입니다.');
      const gen = new LinkedInContentGenerator({ apiKey: 'test' }, client);
      const result = await gen.applyTone(draft, 'casual');
      expect(result).toBe('편하게 쓴 내용입니다.');
    });

    it('thought-leader 톤 적용 시 결과를 반환한다', async () => {
      const client = makeClient('리더십 관점의 내용입니다.');
      const gen = new LinkedInContentGenerator({ apiKey: 'test' }, client);
      const result = await gen.applyTone(draft, 'thought-leader');
      expect(result).toBe('리더십 관점의 내용입니다.');
    });
  });

  // ── Subtask 4: addHashtags ────────────────────────────────────────

  describe('addHashtags', () => {
    it('키워드에서 # 접두사 해시태그를 생성한다', async () => {
      const result = await generator.addHashtags('본문 내용', ['React', 'TypeScript']);

      expect(result).toContain('#React');
      expect(result).toContain('#TypeScript');
    });

    it('원본 본문 내용을 유지한다', async () => {
      const result = await generator.addHashtags('본문 내용', ['React']);
      expect(result).toContain('본문 내용');
    });

    it('해시태그는 본문 뒤에 추가된다', async () => {
      const result = await generator.addHashtags('본문', ['React']);
      const bodyIdx = result.indexOf('본문');
      const tagIdx = result.indexOf('#React');
      expect(tagIdx).toBeGreaterThan(bodyIdx);
    });

    it('빈 키워드 배열이면 본문만 반환한다', async () => {
      const result = await generator.addHashtags('본문 내용', []);
      expect(result).toBe('본문 내용');
    });

    it('키워드의 공백을 제거하고 CamelCase로 변환한다', async () => {
      const result = await generator.addHashtags('본문', ['next js', 'type script']);
      expect(result).toContain('#NextJs');
      expect(result).toContain('#TypeScript');
    });
  });

  // ── Subtask 5: formatForPlatform ──────────────────────────────────

  describe('formatForPlatform', () => {
    const samplePost: LinkedInPost = {
      headline: 'React Hooks로 상태 관리 혁신하기',
      body: '저는 이번 주 React Hooks를 공부했습니다.\n\n커스텀 훅으로 재사용성을 높였습니다.',
      hashtags: ['#React', '#Hooks', '#JavaScript'],
      callToAction: '여러분의 경험을 공유해주세요!',
    };

    it('FormattedPost 구조를 반환한다', async () => {
      const formatted = await generator.formatForPlatform(samplePost, sampleMission);

      expect(formatted).toMatchObject({
        content: expect.any(String),
        charCount: expect.any(Number),
        isWithinLimit: expect.any(Boolean),
        hashtags: expect.any(Array),
        fileName: expect.any(String),
      });
    });

    it('content에 headline, body, hashtags가 포함된다', async () => {
      const formatted = await generator.formatForPlatform(samplePost, sampleMission);

      expect(formatted.content).toContain(samplePost.headline);
      expect(formatted.content).toContain(samplePost.body);
      expect(formatted.content).toContain('#React');
    });

    it('charCount가 content 길이와 일치한다', async () => {
      const formatted = await generator.formatForPlatform(samplePost, sampleMission);
      expect(formatted.charCount).toBe(formatted.content.length);
    });

    it('3000자 이내이면 isWithinLimit이 true이다', async () => {
      const formatted = await generator.formatForPlatform(samplePost, sampleMission);
      expect(formatted.isWithinLimit).toBe(true);
    });

    it('3000자 초과이면 isWithinLimit이 false이다', async () => {
      const longPost: LinkedInPost = {
        ...samplePost,
        body: 'a'.repeat(3100),
      };
      const formatted = await generator.formatForPlatform(longPost, sampleMission);
      expect(formatted.isWithinLimit).toBe(false);
    });

    it('fileName이 {날짜}_{제목}_{작성자}.md 형식이다', async () => {
      const formatted = await generator.formatForPlatform(samplePost, sampleMission);
      expect(formatted.fileName).toMatch(/^\d{4}-\d{2}-\d{2}_.*_alice\.md$/);
    });
  });

  // ── 헬퍼: buildHashtags ───────────────────────────────────────────

  describe('buildHashtags (static helper)', () => {
    it('단어 배열을 #해시태그 배열로 변환한다', () => {
      const tags = LinkedInContentGenerator.buildHashtags(['React', 'TypeScript', 'Node']);
      expect(tags).toEqual(['#React', '#TypeScript', '#Node']);
    });

    it('중복을 제거한다', () => {
      const tags = LinkedInContentGenerator.buildHashtags(['React', 'React', 'TS']);
      expect(tags).toHaveLength(2);
    });

    it('최대 10개로 제한한다', () => {
      const many = Array.from({ length: 15 }, (_, i) => `Kw${i}`);
      const tags = LinkedInContentGenerator.buildHashtags(many);
      expect(tags).toHaveLength(10);
    });
  });
});
