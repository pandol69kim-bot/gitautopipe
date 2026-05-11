import * as fs from 'fs';
import * as path from 'path';
import matter from 'gray-matter';
import type {
  BuildResult,
  DeploymentResult,
  DeploymentStatus,
  SiteCategory,
  SitePage,
  SearchIndexEntry,
  WebsiteDeployerConfig,
} from '../types/deployer';

const VERCEL_API = 'https://api.vercel.com';

const CATEGORY_KEYWORDS: Record<Exclude<SiteCategory, 'uncategorized'>, string[]> = {
  'ai-tools': [
    'ai',
    'gpt',
    'llm',
    'claude',
    'openai',
    '인공지능',
    '에이전트',
    'chatgpt',
    'prompt',
    '프롬프트',
  ],
  platform: [
    'vercel',
    'github',
    'docker',
    'aws',
    'gcp',
    'ci/cd',
    'deploy',
    '배포',
    'actions',
    'kubernetes',
  ],
  insights: ['회고', '인사이트', 'insight', '성장', '배움', 'retrospect', '학습', '경험', '정리'],
};

// fetch 타입 (테스트 주입용)
type FetchFn = (
  url: string,
  options?: RequestInit
) => Promise<{ ok: boolean; status?: number; json(): Promise<unknown> }>;

export interface DeployToVercelOptions {
  preview?: boolean;
}

// ── WebsiteDeployer 클래스 ────────────────────────────────────────────

export class WebsiteDeployer {
  private readonly config: WebsiteDeployerConfig;
  private readonly fetch: FetchFn;

  constructor(config: WebsiteDeployerConfig, fetchFn: FetchFn) {
    this.config = config;
    this.fetch = fetchFn;
  }

  // ── Subtask 2: 사이트 빌드 ────────────────────────────────────────

  async buildSite(sourceFolder: string): Promise<BuildResult> {
    const files = (fs.readdirSync(sourceFolder) as string[]).filter((f) => f.endsWith('.md'));
    const outputPath = path.join(sourceFolder, '.build');

    const pages: SitePage[] = files.map((fileName) => {
      const filePath = path.join(sourceFolder, fileName);
      const raw = fs.readFileSync(filePath, 'utf-8') as string;
      const { data: frontmatter, content } = matter(raw);

      const title = (frontmatter.title as string | undefined) ?? this.titleFromSlug(fileName);
      const category = WebsiteDeployer.classifyCategory(
        frontmatter.category as string | undefined,
        title
      );
      const htmlContent = WebsiteDeployer.markdownToHtml(content);
      const slug = fileName.replace(/\.md$/, '');

      return {
        slug,
        title,
        category,
        htmlContent,
        markdownSource: content,
        searchText: `${title} ${content}`.toLowerCase(),
      };
    });

    const searchIndex: SearchIndexEntry[] = pages.map((p) => ({
      slug: p.slug,
      title: p.title,
      category: p.category,
      excerpt: p.markdownSource.slice(0, 150).replace(/\n/g, ' ').trim(),
    }));

    fs.mkdirSync(outputPath, { recursive: true });

    for (const page of pages) {
      fs.writeFileSync(
        path.join(outputPath, `${page.slug}.html`),
        this.renderPageHtml(page),
        'utf-8'
      );
    }

    fs.writeFileSync(path.join(outputPath, 'index.html'), this.renderIndexHtml(pages), 'utf-8');
    fs.writeFileSync(
      path.join(outputPath, 'search-index.json'),
      JSON.stringify(searchIndex, null, 2),
      'utf-8'
    );

    return {
      pages,
      searchIndex,
      outputPath,
      pageCount: pages.length,
      builtAt: new Date(),
    };
  }

  // ── Subtask 5: Vercel 배포 ────────────────────────────────────────

  async deployToVercel(
    buildOutput: string,
    options: DeployToVercelOptions = {}
  ): Promise<DeploymentResult> {
    const url = `${VERCEL_API}/v13/deployments`;
    const params = this.config.teamId ? `?teamId=${this.config.teamId}` : '';
    const files = this.collectDeploymentFiles(buildOutput);

    if (files.length === 0) {
      throw new Error(`배포할 빌드 산출물이 없습니다: ${buildOutput}`);
    }

    const payload = {
      name: this.config.projectId,
      project: this.config.projectId,
      files,
      ...(options.preview ? {} : { target: 'production' }),
    };

    const response = await this.fetch(`${url}${params}`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.config.vercelToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      const err = (await response.json()) as Record<string, unknown>;
      throw new Error(
        `Vercel 배포 실패 (${response.status ?? 'unknown'}): ${this.extractErrorMessage(err)}`
      );
    }

    const data = (await response.json()) as {
      id: string;
      url: string;
      readyState: string;
      createdAt: number;
    };

    return {
      deploymentId: data.id,
      url: data.url,
      previewUrl: data.url,
      state: data.readyState as DeploymentResult['state'],
      createdAt: new Date(data.createdAt),
    };
  }

  // ── Subtask 6: 배포 상태 조회 ─────────────────────────────────────

  async getDeploymentStatus(deploymentId: string): Promise<DeploymentStatus> {
    const url = `${VERCEL_API}/v13/deployments/${deploymentId}`;
    const params = this.config.teamId ? `?teamId=${this.config.teamId}` : '';

    const response = await this.fetch(`${url}${params}`, {
      method: 'GET',
      headers: { Authorization: `Bearer ${this.config.vercelToken}` },
    });

    if (!response.ok) {
      const err = (await response.json()) as Record<string, unknown>;
      const message = this.extractErrorMessage(err);
      throw new Error(`배포 상태 조회 실패 (${response.status ?? 'unknown'}): ${message}`);
    }

    const data = (await response.json()) as {
      id: string;
      url?: string;
      readyState: string;
      readyAt?: number;
      errorMessage?: string;
    };

    return {
      deploymentId: data.id,
      state: data.readyState as DeploymentStatus['state'],
      url: data.url,
      errorMessage: data.errorMessage,
      readyAt: data.readyAt ? new Date(data.readyAt) : undefined,
    };
  }

  // ── Subtask 6: 롤백 ──────────────────────────────────────────────

  async rollback(deploymentId: string): Promise<void> {
    const url = `${VERCEL_API}/v13/deployments/${deploymentId}/rollback`;
    const params = this.config.teamId ? `?teamId=${this.config.teamId}` : '';

    const response = await this.fetch(`${url}${params}`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.config.vercelToken}`,
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) {
      throw new Error(`롤백 실패: deployment ${deploymentId}`);
    }
  }

  // ── Subtask 7: 배포 알림 ─────────────────────────────────────────

  async sendNotification(result: DeploymentResult): Promise<void> {
    const webhookUrl = this.config.notificationWebhookUrl;
    if (!webhookUrl) return;

    const payload = {
      text: `✅ 배포 완료: ${result.state}`,
      attachments: [
        {
          title: `Deployment ${result.deploymentId}`,
          url: `https://${result.url}`,
          fields: [
            { title: '상태', value: result.state, short: true },
            { title: 'URL', value: result.url, short: true },
          ],
        },
      ],
    };

    const response = await this.fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      throw new Error(`배포 알림 전송 실패 (${response.status ?? 'unknown'})`);
    }
  }

  private collectDeploymentFiles(
    buildOutput: string,
    currentPath: string = buildOutput
  ): Array<{ file: string; data: string; encoding: 'base64' }> {
    const entries = fs.readdirSync(currentPath, { withFileTypes: true });
    const deploymentFiles: Array<{ file: string; data: string; encoding: 'base64' }> = [];

    for (const entry of entries) {
      const entryName = typeof entry === 'string' ? entry : entry.name;
      const absolutePath = path.join(currentPath, entryName);
      const isDirectory = typeof entry === 'string' ? false : entry.isDirectory();

      if (isDirectory) {
        deploymentFiles.push(...this.collectDeploymentFiles(buildOutput, absolutePath));
        continue;
      }

      const relativePath = path.relative(buildOutput, absolutePath).replace(/\\/g, '/');
      const fileBuffer = fs.readFileSync(absolutePath);

      deploymentFiles.push({
        file: relativePath,
        data: fileBuffer.toString('base64'),
        encoding: 'base64',
      });
    }

    return deploymentFiles;
  }

  private extractErrorMessage(payload: Record<string, unknown>): string {
    const errorValue = payload['error'];
    const messageValue = payload['message'];

    if (typeof errorValue === 'string' && errorValue.trim().length > 0) {
      return errorValue;
    }

    if (errorValue && typeof errorValue === 'object') {
      const nestedMessage = (errorValue as Record<string, unknown>)['message'];
      if (typeof nestedMessage === 'string' && nestedMessage.trim().length > 0) {
        return nestedMessage;
      }

      return JSON.stringify(errorValue);
    }

    if (typeof messageValue === 'string' && messageValue.trim().length > 0) {
      return messageValue;
    }

    return '알 수 없는 오류';
  }

  private renderIndexHtml(pages: SitePage[]): string {
    const items = pages
      .map(
        (page) =>
          `<li><a href="./${page.slug}.html">${this.escapeHtml(page.title)}</a> <small>${page.category}</small></li>`
      )
      .join('\n');

    return [
      '<!DOCTYPE html>',
      '<html lang="ko">',
      '<head>',
      '  <meta charset="utf-8">',
      '  <meta name="viewport" content="width=device-width, initial-scale=1">',
      '  <title>Skill Insight</title>',
      '</head>',
      '<body>',
      '  <main>',
      '    <h1>Skill Insight</h1>',
      '    <ul>',
      items,
      '    </ul>',
      '  </main>',
      '</body>',
      '</html>',
    ].join('\n');
  }

  private renderPageHtml(page: SitePage): string {
    return [
      '<!DOCTYPE html>',
      '<html lang="ko">',
      '<head>',
      '  <meta charset="utf-8">',
      '  <meta name="viewport" content="width=device-width, initial-scale=1">',
      `  <title>${this.escapeHtml(page.title)}</title>`,
      '</head>',
      '<body>',
      '  <main>',
      `    <a href="./index.html">Back</a>`,
      `    <h1>${this.escapeHtml(page.title)}</h1>`,
      `    <p>${this.escapeHtml(page.category)}</p>`,
      `    ${page.htmlContent}`,
      '  </main>',
      '</body>',
      '</html>',
    ].join('\n');
  }

  private escapeHtml(text: string): string {
    return text
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  // ── Subtask 3: 카테고리 분류 (static) ────────────────────────────

  static classifyCategory(frontmatterCategory: string | undefined, title: string): SiteCategory {
    if (frontmatterCategory) {
      const valid: SiteCategory[] = ['ai-tools', 'platform', 'insights', 'uncategorized'];
      if (valid.includes(frontmatterCategory as SiteCategory)) {
        return frontmatterCategory as SiteCategory;
      }
    }

    const lowerTitle = title.toLowerCase();
    for (const [category, keywords] of Object.entries(CATEGORY_KEYWORDS)) {
      if (keywords.some((kw) => lowerTitle.includes(kw))) {
        return category as SiteCategory;
      }
    }

    return 'uncategorized';
  }

  // ── Subtask 4: 마크다운 → HTML 변환 (static) ─────────────────────

  static markdownToHtml(markdown: string): string {
    const lines = markdown.split('\n');
    const htmlLines: string[] = [];

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) continue;

      let html: string;

      if (/^### /.test(trimmed)) {
        html = `<h3>${this.inlineMarkdown(trimmed.slice(4))}</h3>`;
      } else if (/^## /.test(trimmed)) {
        html = `<h2>${this.inlineMarkdown(trimmed.slice(3))}</h2>`;
      } else if (/^# /.test(trimmed)) {
        html = `<h1>${this.inlineMarkdown(trimmed.slice(2))}</h1>`;
      } else if (/^- /.test(trimmed)) {
        html = `<li>${this.inlineMarkdown(trimmed.slice(2))}</li>`;
      } else if (/^\d+\. /.test(trimmed)) {
        html = `<li>${this.inlineMarkdown(trimmed.replace(/^\d+\. /, ''))}</li>`;
      } else {
        html = `<p>${this.inlineMarkdown(trimmed)}</p>`;
      }

      htmlLines.push(html);
    }

    return htmlLines.join('\n');
  }

  // ── 인라인 마크다운 변환 ─────────────────────────────────────────

  private static inlineMarkdown(text: string): string {
    return text
      .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
      .replace(/\*(.+?)\*/g, '<em>$1</em>')
      .replace(/`(.+?)`/g, '<code>$1</code>')
      .replace(/\[(.+?)\]\((.+?)\)/g, '<a href="$2">$1</a>');
  }

  private titleFromSlug(fileName: string): string {
    return fileName
      .replace(/\.md$/, '')
      .replace(/[-_]/g, ' ')
      .replace(/\b\w/g, (c) => c.toUpperCase());
  }
}
