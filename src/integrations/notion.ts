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
  databases?: {
    query?(params: { database_id: string; [k: string]: unknown }): Promise<{
      results: RawNotionPage[];
      has_more: boolean;
    }>;
    retrieve?(params: { database_id: string }): Promise<{
      id: string;
      data_sources?: Array<{ id: string }>;
    }>;
  };
  dataSources?: {
    query?(params: { data_source_id: string; [k: string]: unknown }): Promise<{
      results: RawNotionPage[];
      has_more: boolean;
    }>;
  };
  pages: {
    create(params: unknown): Promise<{ id: string }>;
    update(params: unknown): Promise<void>;
  };
  blocks: {
    delete?(params: { block_id: string }): Promise<void>;
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
    const response = await this.queryDatabase(databaseId);

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

  async syncFromObsidian(
    markdownFile: MarkdownFile,
    databaseId: string
  ): Promise<{ pageId: string; action: 'created' | 'updated' }> {
    const raw = fs.readFileSync(markdownFile.filePath, 'utf-8') as string;
    const { data: frontmatter, content } = matter(raw);
    const title = String(frontmatter['title'] ?? markdownFile.fileName.replace(/\.md$/i, ''));
    const notionId =
      typeof frontmatter['notionId'] === 'string' && frontmatter['notionId'].trim().length > 0
        ? frontmatter['notionId'].trim()
        : undefined;
    const blocks = this.markdownToBlocks(content);

    if (notionId) {
      try {
        await this.client.pages.update({
          page_id: notionId,
          properties: {
            Name: {
              title: [{ text: { content: title } }],
            },
          },
        });

        await this.replacePageChildren(notionId, blocks);

        return { pageId: notionId, action: 'updated' };
      } catch {
        // Fall back to create when the stored notionId no longer resolves.
      }
    }

    const parentId = await this.resolveParentId(databaseId);
    const page = await this.client.pages.create({
      parent: { data_source_id: parentId },
      properties: {
        Name: {
          title: [{ text: { content: title } }],
        },
      },
    });

    if (blocks.length > 0) {
      await this.client.blocks.children.append({
        block_id: page.id,
        children: blocks,
      });
    }

    this.writeBackNotionId(markdownFile.filePath, frontmatter, content, page.id);
    return { pageId: page.id, action: 'created' };
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

  private async queryDatabase(databaseId: string): Promise<{
    results: RawNotionPage[];
    has_more: boolean;
  }> {
    const normalizedId = normalizeNotionId(databaseId);

    if (this.client.dataSources?.query) {
      const dataSourceId = await this.resolveDataSourceId(normalizedId);
      return this.client.dataSources.query({ data_source_id: dataSourceId });
    }

    if (this.client.databases?.query) {
      return this.client.databases.query({ database_id: normalizedId });
    }

    throw new Error('Notion client does not support dataSources.query or databases.query.');
  }

  private async resolveParentId(databaseId: string): Promise<string> {
    const normalizedId = normalizeNotionId(databaseId);
    if (this.client.dataSources?.query) {
      return this.resolveDataSourceId(normalizedId);
    }

    return normalizedId;
  }

  private async resolveDataSourceId(databaseId: string): Promise<string> {
    if (!this.client.databases?.retrieve) {
      return databaseId;
    }

    try {
      const database = await this.client.databases.retrieve({ database_id: databaseId });
      const dataSourceId = database.data_sources?.[0]?.id;
      return dataSourceId ? normalizeNotionId(dataSourceId) : databaseId;
    } catch {
      return databaseId;
    }
  }

  private async replacePageChildren(pageId: string, blocks: unknown[]): Promise<void> {
    const existingBlocks = await this.client.blocks.children.list({ block_id: pageId });

    if (this.client.blocks.delete) {
      await Promise.all(
        existingBlocks.results.map((block) => this.client.blocks.delete!({ block_id: block.id }))
      );
    }

    if (blocks.length === 0) {
      return;
    }

    await this.client.blocks.children.append({
      block_id: pageId,
      children: blocks,
    });
  }

  private writeBackNotionId(
    filePath: string,
    frontmatter: Record<string, unknown>,
    content: string,
    notionId: string
  ): void {
    const nextFrontmatter = { ...frontmatter, notionId };
    const nextContent = matter.stringify(content.trimStart(), nextFrontmatter);
    fs.writeFileSync(filePath, nextContent, 'utf-8');
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

export function normalizeNotionId(value: string): string {
  const trimmed = value.trim();
  const urlMatch = trimmed.match(/([0-9a-fA-F]{32}|[0-9a-fA-F-]{36})(?:\?|$)/);
  const rawId = urlMatch?.[1] ?? trimmed;
  const compact = rawId.replace(/-/g, '');

  if (/^[0-9a-fA-F]{32}$/.test(compact)) {
    return `${compact.slice(0, 8)}-${compact.slice(8, 12)}-${compact.slice(12, 16)}-${compact.slice(16, 20)}-${compact.slice(20)}`.toLowerCase();
  }

  return rawId;
}
