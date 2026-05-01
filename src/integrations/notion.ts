import * as fs from 'fs';
import * as path from 'path';
import matter from 'gray-matter';
import type {
  NotionPage,
  NotionBlock,
  NotionRichText,
  SyncMetadata,
  MergeResult,
  NotionConnectorConfig,
} from '../types/notion';
import type { MarkdownFile } from '../types/vault';

// Notion 클라이언트 최소 인터페이스 (테스트 주입용)
export interface NotionClient {
  databases: {
    query(params: { database_id: string; [k: string]: unknown }): Promise<{
      results: RawNotionPage[];
      has_more: boolean;
    }>;
  };
  pages: {
    create(params: unknown): Promise<{ id: string }>;
    update(params: unknown): Promise<void>;
  };
  blocks: {
    children: {
      list(params: { block_id: string }): Promise<{ results: RawBlock[]; has_more: boolean }>;
      append(params: { block_id: string; children: unknown[] }): Promise<void>;
    };
  };
}

interface RawNotionPage {
  id: string;
  url: string;
  created_time: string;
  last_edited_time: string;
  properties: Record<string, unknown>;
}

interface RawBlock {
  id: string;
  type: string;
  has_children: boolean;
  [key: string]: unknown;
}

// ── NotionMCPConnector 클래스 ─────────────────────────────────────────

export class NotionMCPConnector {
  private readonly config: NotionConnectorConfig;
  private readonly client: NotionClient;

  constructor(config: NotionConnectorConfig, client: NotionClient) {
    this.config = config;
    this.client = client;
  }

  // ── Subtask 2: Notion DB에서 미팅 페이지 목록 가져오기 ────────────

  async fetchMeetings(databaseId: string): Promise<NotionPage[]> {
    const response = await this.client.databases.query({ database_id: databaseId });

    const pages = await Promise.all(
      response.results.map(async (raw) => {
        const blocksResponse = await this.client.blocks.children.list({ block_id: raw.id });
        const blocks = blocksResponse.results.map((b) => this.normalizeBlock(b));

        return {
          id: raw.id,
          url: raw.url,
          createdAt: new Date(raw.created_time),
          lastEditedAt: new Date(raw.last_edited_time),
          title: this.extractTitle(raw.properties),
          properties: raw.properties,
          blocks,
        } satisfies NotionPage;
      })
    );

    return pages;
  }

  // ── Subtask 3: Notion → Obsidian 마크다운 변환 + 저장 ────────────

  async syncToObsidian(notionPage: NotionPage, targetPath: string): Promise<void> {
    const dir = path.dirname(targetPath);
    fs.mkdirSync(dir, { recursive: true });

    const content = this.buildMarkdownFromPage(notionPage);
    fs.writeFileSync(targetPath, content, 'utf-8');
  }

  // ── Subtask 4: Obsidian → Notion 역변환 + 업로드 ─────────────────

  async syncFromObsidian(markdownFile: MarkdownFile, databaseId: string): Promise<void> {
    const raw = fs.readFileSync(markdownFile.filePath, 'utf-8') as string;
    const { data: frontmatter, content } = matter(raw);

    const page = await this.client.pages.create({
      parent: { database_id: databaseId },
      properties: {
        Name: {
          title: [{ text: { content: frontmatter.title ?? markdownFile.fileName } }],
        },
      },
    });

    const blocks = this.markdownToBlocks(content);
    if (blocks.length > 0) {
      await this.client.blocks.children.append({
        block_id: page.id,
        children: blocks,
      });
    }
  }

  // ── Subtask 5: 동기화 메타데이터 빌드 ───────────────────────────

  buildSyncMetadata(notionPage: NotionPage, obsidianPath: string): SyncMetadata {
    return {
      notionPageId: notionPage.id,
      obsidianPath,
      lastSyncedAt: new Date(),
      notionLastEditedAt: notionPage.lastEditedAt,
      obsidianLastEditedAt: new Date(),
    };
  }

  // ── Subtask 6: 충돌 감지 및 해결 ─────────────────────────────────

  async resolveConflicts(local: MarkdownFile, remote: NotionPage): Promise<MergeResult> {
    const notionIsNewer = remote.lastEditedAt >= local.modifiedAt;
    const resolution = notionIsNewer ? 'notion-wins' : 'obsidian-wins';

    let content: string;
    if (resolution === 'notion-wins') {
      content = this.buildMarkdownFromPage(remote);
    } else {
      content = fs.readFileSync(local.filePath, 'utf-8') as string;
    }

    return {
      resolution,
      content,
      conflictDetails:
        resolution === 'notion-wins'
          ? `Notion (${remote.lastEditedAt.toISOString()}) > Obsidian (${local.modifiedAt.toISOString()})`
          : `Obsidian (${local.modifiedAt.toISOString()}) > Notion (${remote.lastEditedAt.toISOString()})`,
    };
  }

  // ── Subtask 3: static 블록 변환기 ────────────────────────────────

  static blockToMarkdown(block: NotionBlock): string {
    const { type } = block;
    const data = block[type] as Record<string, unknown> | undefined;

    if (!data) return '';

    const text = NotionMCPConnector.extractPlainText(
      (data.rich_text as NotionRichText[] | undefined) ?? []
    );

    switch (type) {
      case 'paragraph':
        return text;
      case 'heading_1':
        return `# ${text}`;
      case 'heading_2':
        return `## ${text}`;
      case 'heading_3':
        return `### ${text}`;
      case 'bulleted_list_item':
        return `- ${text}`;
      case 'numbered_list_item':
        return `1. ${text}`;
      case 'to_do': {
        const checked = data.checked === true;
        return `- [${checked ? 'x' : ' '}] ${text}`;
      }
      case 'code': {
        const lang = (data.language as string | undefined) ?? '';
        return `\`\`\`${lang}\n${text}\n\`\`\``;
      }
      case 'divider':
        return '---';
      default:
        return '';
    }
  }

  // ── 내부 헬퍼 ────────────────────────────────────────────────────

  private buildMarkdownFromPage(page: NotionPage): string {
    const dateStr = page.lastEditedAt.toISOString().split('T')[0];
    const frontmatter = [
      '---',
      `title: ${page.title}`,
      `notionId: ${page.id}`,
      `date: ${dateStr}`,
      '---',
    ].join('\n');

    const body = page.blocks
      .map((b) => NotionMCPConnector.blockToMarkdown(b))
      .filter((line) => line !== '')
      .join('\n\n');

    return `${frontmatter}\n\n${body}\n`;
  }

  private markdownToBlocks(content: string): unknown[] {
    const lines = content.split('\n');
    const blocks: unknown[] = [];

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) continue;

      if (/^### /.test(trimmed)) {
        blocks.push(this.makeHeadingBlock(trimmed.slice(4), 3));
      } else if (/^## /.test(trimmed)) {
        blocks.push(this.makeHeadingBlock(trimmed.slice(3), 2));
      } else if (/^# /.test(trimmed)) {
        blocks.push(this.makeHeadingBlock(trimmed.slice(2), 1));
      } else if (/^- \[x\] /.test(trimmed)) {
        blocks.push(this.makeToDoBlock(trimmed.slice(6), true));
      } else if (/^- \[ \] /.test(trimmed)) {
        blocks.push(this.makeToDoBlock(trimmed.slice(6), false));
      } else if (/^- /.test(trimmed)) {
        blocks.push(this.makeBulletBlock(trimmed.slice(2)));
      } else if (/^\d+\. /.test(trimmed)) {
        blocks.push(this.makeNumberedBlock(trimmed.replace(/^\d+\. /, '')));
      } else {
        blocks.push(this.makeParagraphBlock(trimmed));
      }
    }

    return blocks;
  }

  private makeHeadingBlock(text: string, level: 1 | 2 | 3): unknown {
    const type = `heading_${level}` as const;
    return { object: 'block', type, [type]: { rich_text: [{ text: { content: text } }] } };
  }

  private makeParagraphBlock(text: string): unknown {
    return {
      object: 'block',
      type: 'paragraph',
      paragraph: { rich_text: [{ text: { content: text } }] },
    };
  }

  private makeBulletBlock(text: string): unknown {
    return {
      object: 'block',
      type: 'bulleted_list_item',
      bulleted_list_item: { rich_text: [{ text: { content: text } }] },
    };
  }

  private makeNumberedBlock(text: string): unknown {
    return {
      object: 'block',
      type: 'numbered_list_item',
      numbered_list_item: { rich_text: [{ text: { content: text } }] },
    };
  }

  private makeToDoBlock(text: string, checked: boolean): unknown {
    return {
      object: 'block',
      type: 'to_do',
      to_do: { rich_text: [{ text: { content: text } }], checked },
    };
  }

  private normalizeBlock(raw: RawBlock): NotionBlock {
    return raw as unknown as NotionBlock;
  }

  private extractTitle(properties: Record<string, unknown>): string {
    const name = properties['Name'] as { title?: Array<{ plain_text: string }> } | undefined;
    return name?.title?.[0]?.plain_text ?? '제목 없음';
  }

  static extractPlainText(richText: NotionRichText[]): string {
    return richText.map((rt) => rt.plain_text).join('');
  }
}
