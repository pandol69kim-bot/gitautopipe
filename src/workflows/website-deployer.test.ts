import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as fs from 'fs';
import { WebsiteDeployer } from './website-deployer';
import type { DeploymentResult } from '../types/deployer';

vi.mock('fs');

// ── fetch 목 ──────────────────────────────────────────────────────────

const mockFetch = vi.fn();

// ── 샘플 데이터 ──────────────────────────────────────────────────────

const sampleMarkdownFiles = [
  {
    name: 'gpt-api-guide.md',
    content: `---
title: GPT API 활용 가이드
category: ai-tools
tags: [AI, GPT, API]
---

# GPT API 활용 가이드

OpenAI의 GPT API를 활용하는 방법을 정리했습니다.

## 기본 사용법
API 키를 발급받고 요청을 전송합니다.
`,
  },
  {
    name: 'vercel-deployment.md',
    content: `---
title: Vercel 배포 자동화
category: platform
tags: [Vercel, CI/CD, 배포]
---

# Vercel 배포 자동화

GitHub Push 시 자동으로 Vercel에 배포하는 방법입니다.
`,
  },
  {
    name: 'learning-reflection.md',
    content: `---
title: 3개월 학습 회고
tags: [회고, 성장]
---

# 3개월 학습 회고

셀피시 클럽에서 3개월간 배운 내용을 정리합니다.
`,
  },
];

const mockVercelDeployResponse = {
  id: 'dpl-abc123',
  url: 'my-project-abc123.vercel.app',
  readyState: 'QUEUED',
  createdAt: 1746057600000,
};

const mockVercelStatusResponse = {
  id: 'dpl-abc123',
  url: 'my-project-abc123.vercel.app',
  readyState: 'READY',
  readyAt: 1746057900000,
};

describe('WebsiteDeployer', () => {
  let deployer: WebsiteDeployer;

  beforeEach(() => {
    vi.clearAllMocks();

    vi.mocked(fs.readdirSync).mockReturnValue(sampleMarkdownFiles.map((f) => f.name) as never);
    vi.mocked(fs.readFileSync).mockImplementation((filePath: unknown) => {
      const name = String(filePath).split(/[\\/]/).pop() ?? '';
      return sampleMarkdownFiles.find((f) => f.name === name)?.content ?? '';
    });
    vi.mocked(fs.existsSync).mockReturnValue(true);
    vi.mocked(fs.mkdirSync).mockReturnValue(undefined);
    vi.mocked(fs.writeFileSync).mockReturnValue(undefined);

    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => mockVercelDeployResponse,
    });

    deployer = new WebsiteDeployer(
      { vercelToken: 'test-token', projectId: 'my-project' },
      mockFetch
    );
  });

  // ── Subtask 2: buildSite ──────────────────────────────────────────

  describe('buildSite', () => {
    it('BuildResult 구조를 반환한다', async () => {
      const result = await deployer.buildSite('/vault/Skill_Insight');

      expect(result).toMatchObject({
        pages: expect.any(Array),
        searchIndex: expect.any(Array),
        outputPath: expect.any(String),
        pageCount: expect.any(Number),
        builtAt: expect.any(Date),
      });
    });

    it('마크다운 파일 수만큼 페이지를 생성한다', async () => {
      const result = await deployer.buildSite('/vault/Skill_Insight');
      expect(result.pageCount).toBe(3);
      expect(result.pages).toHaveLength(3);
    });

    it('각 페이지에 slug, title, htmlContent, category가 있다', async () => {
      const result = await deployer.buildSite('/vault/Skill_Insight');
      for (const page of result.pages) {
        expect(page).toMatchObject({
          slug: expect.any(String),
          title: expect.any(String),
          htmlContent: expect.any(String),
          category: expect.any(String),
        });
      }
    });

    it('htmlContent에 <h1> 태그가 포함된다', async () => {
      const result = await deployer.buildSite('/vault/Skill_Insight');
      const hasH1 = result.pages.some((p) => p.htmlContent.includes('<h1>'));
      expect(hasH1).toBe(true);
    });

    it('검색 인덱스가 페이지 수와 동일하게 생성된다', async () => {
      const result = await deployer.buildSite('/vault/Skill_Insight');
      expect(result.searchIndex).toHaveLength(3);
    });
  });

  // ── Subtask 3: 카테고리 자동 분류 ────────────────────────────────

  describe('classifyCategory (static)', () => {
    it('frontmatter category가 있으면 해당 카테고리를 사용한다', () => {
      expect(WebsiteDeployer.classifyCategory('ai-tools', 'GPT API 활용')).toBe('ai-tools');
      expect(WebsiteDeployer.classifyCategory('platform', 'Vercel 배포')).toBe('platform');
    });

    it('category 없고 제목에 AI/GPT 키워드가 있으면 ai-tools로 분류한다', () => {
      expect(WebsiteDeployer.classifyCategory(undefined, 'ChatGPT 프롬프트 작성법')).toBe(
        'ai-tools'
      );
      expect(WebsiteDeployer.classifyCategory(undefined, 'AI 에이전트 구축')).toBe('ai-tools');
    });

    it('category 없고 제목에 플랫폼 키워드가 있으면 platform으로 분류한다', () => {
      expect(WebsiteDeployer.classifyCategory(undefined, 'Vercel로 배포하기')).toBe('platform');
      expect(WebsiteDeployer.classifyCategory(undefined, 'GitHub Actions 설정')).toBe('platform');
    });

    it('category 없고 제목에 인사이트 키워드가 있으면 insights로 분류한다', () => {
      expect(WebsiteDeployer.classifyCategory(undefined, '3개월 학습 회고')).toBe('insights');
      expect(WebsiteDeployer.classifyCategory(undefined, '개발자 성장 인사이트')).toBe('insights');
    });

    it('분류 불가능하면 uncategorized를 반환한다', () => {
      expect(WebsiteDeployer.classifyCategory(undefined, '제목 없음')).toBe('uncategorized');
    });
  });

  // ── Subtask 4: 마크다운 → HTML 변환 ──────────────────────────────

  describe('markdownToHtml (static)', () => {
    it('# 제목을 <h1>으로 변환한다', () => {
      expect(WebsiteDeployer.markdownToHtml('# 제목')).toContain('<h1>제목</h1>');
    });

    it('## 제목을 <h2>로 변환한다', () => {
      expect(WebsiteDeployer.markdownToHtml('## 소제목')).toContain('<h2>소제목</h2>');
    });

    it('### 제목을 <h3>로 변환한다', () => {
      expect(WebsiteDeployer.markdownToHtml('### 작은 제목')).toContain('<h3>작은 제목</h3>');
    });

    it('- 목록을 <li>로 변환한다', () => {
      expect(WebsiteDeployer.markdownToHtml('- 항목')).toContain('<li>항목</li>');
    });

    it('**굵은** 텍스트를 <strong>으로 변환한다', () => {
      expect(WebsiteDeployer.markdownToHtml('**굵게**')).toContain('<strong>굵게</strong>');
    });

    it('`인라인 코드`를 <code>로 변환한다', () => {
      expect(WebsiteDeployer.markdownToHtml('`코드`')).toContain('<code>코드</code>');
    });

    it('일반 단락을 <p>로 감싼다', () => {
      expect(WebsiteDeployer.markdownToHtml('일반 텍스트입니다.')).toContain(
        '<p>일반 텍스트입니다.</p>'
      );
    });

    it('빈 줄은 건너뛴다', () => {
      const html = WebsiteDeployer.markdownToHtml('\n\n# 제목\n\n');
      expect(html).toContain('<h1>제목</h1>');
    });
  });

  // ── Subtask 5: Vercel API 배포 ────────────────────────────────────

  describe('deployToVercel', () => {
    it('DeploymentResult 구조를 반환한다', async () => {
      const result = await deployer.deployToVercel('/tmp/build');

      expect(result).toMatchObject({
        deploymentId: expect.any(String),
        url: expect.any(String),
        previewUrl: expect.any(String),
        state: expect.any(String),
        createdAt: expect.any(Date),
      });
    });

    it('Vercel API에 POST 요청을 보낸다', async () => {
      await deployer.deployToVercel('/tmp/build');
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('vercel.com'),
        expect.objectContaining({ method: 'POST' })
      );
    });

    it('Authorization 헤더에 Bearer 토큰을 포함한다', async () => {
      await deployer.deployToVercel('/tmp/build');
      const [, options] = mockFetch.mock.calls[0];
      expect(options.headers?.Authorization).toBe('Bearer test-token');
    });

    it('deploymentId가 응답에 포함된다', async () => {
      const result = await deployer.deployToVercel('/tmp/build');
      expect(result.deploymentId).toBe('dpl-abc123');
    });

    it('preview 배포 시 production target을 강제하지 않는다', async () => {
      await deployer.deployToVercel('/tmp/build', { preview: true });

      const [, options] = mockFetch.mock.calls[0] as [string, RequestInit];
      const body = JSON.parse(String(options.body)) as Record<string, unknown>;
      expect(body.target).toBeUndefined();
      expect(body.source).toBe('/tmp/build');
    });

    it('Vercel API 실패 시 에러를 던진다', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 403,
        json: async () => ({ error: 'Forbidden' }),
      });
      await expect(deployer.deployToVercel('/tmp/build')).rejects.toThrow();
    });
  });

  // ── Subtask 6: 배포 상태 모니터링 ────────────────────────────────

  describe('getDeploymentStatus', () => {
    it('DeploymentStatus 구조를 반환한다', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockVercelStatusResponse,
      });

      const status = await deployer.getDeploymentStatus('dpl-abc123');
      expect(status).toMatchObject({
        deploymentId: 'dpl-abc123',
        state: expect.any(String),
      });
    });

    it('READY 상태이면 url이 포함된다', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockVercelStatusResponse,
      });

      const status = await deployer.getDeploymentStatus('dpl-abc123');
      expect(status.state).toBe('READY');
      expect(status.url).toBeDefined();
    });
  });

  // ── Subtask 6: 롤백 ──────────────────────────────────────────────

  describe('rollback', () => {
    it('Vercel API에 롤백 POST 요청을 보낸다', async () => {
      mockFetch.mockResolvedValueOnce({ ok: true, json: async () => ({}) });

      await deployer.rollback('dpl-abc123');
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('dpl-abc123'),
        expect.objectContaining({ method: 'POST' })
      );
    });
  });

  // ── Subtask 7: 배포 알림 ─────────────────────────────────────────

  describe('sendNotification', () => {
    const deployResult: DeploymentResult = {
      deploymentId: 'dpl-abc123',
      url: 'my-project.vercel.app',
      previewUrl: 'my-project-abc123.vercel.app',
      state: 'READY',
      createdAt: new Date(),
    };

    it('webhookUrl이 없으면 아무것도 하지 않는다', async () => {
      await deployer.sendNotification(deployResult);
      expect(mockFetch).not.toHaveBeenCalled();
    });

    it('webhookUrl이 있으면 POST 요청을 보낸다', async () => {
      const deployerWithWebhook = new WebsiteDeployer(
        {
          vercelToken: 'test-token',
          projectId: 'my-project',
          notificationWebhookUrl: 'https://hooks.slack.com/test',
        },
        mockFetch
      );

      mockFetch.mockResolvedValueOnce({ ok: true, json: async () => ({}) });
      await deployerWithWebhook.sendNotification(deployResult);

      expect(mockFetch).toHaveBeenCalledWith(
        'https://hooks.slack.com/test',
        expect.objectContaining({ method: 'POST' })
      );
    });

    it('알림 payload에 배포 URL이 포함된다', async () => {
      const deployerWithWebhook = new WebsiteDeployer(
        {
          vercelToken: 'test-token',
          projectId: 'my-project',
          notificationWebhookUrl: 'https://hooks.slack.com/test',
        },
        mockFetch
      );

      mockFetch.mockResolvedValueOnce({ ok: true, json: async () => ({}) });
      await deployerWithWebhook.sendNotification(deployResult);

      const [, options] = mockFetch.mock.calls[0];
      const body = JSON.parse(options.body as string) as Record<string, unknown>;
      expect(JSON.stringify(body)).toContain('my-project.vercel.app');
    });

    it('webhook 응답이 실패면 에러를 던진다', async () => {
      const deployerWithWebhook = new WebsiteDeployer(
        {
          vercelToken: 'test-token',
          projectId: 'my-project',
          notificationWebhookUrl: 'https://hooks.slack.com/test',
        },
        mockFetch
      );

      mockFetch.mockResolvedValueOnce({ ok: false, status: 500, json: async () => ({}) });

      await expect(deployerWithWebhook.sendNotification(deployResult)).rejects.toThrow(
        '배포 알림 전송 실패'
      );
    });
  });
});
