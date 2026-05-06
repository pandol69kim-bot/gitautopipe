import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as fs from 'fs';
import { NotionMCPConnector } from './notion';
import type { NotionPage, NotionBlock } from '../types/notion';
import type { MarkdownFile } from '../types/vault';

vi.mock('fs');

// ── Notion API 클라이언트 목 ──────────────────────────────────────────

const mockNotionClient = {
  databases: {
    query: vi.fn(),
  },
  pages: {
    retrieve: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
  },
  blocks: {
    children: {
      list: vi.fn(),
      append: vi.fn(),
    },
  },
};

// ── 샘플 데이터 ──────────────────────────────────────────────────────

const makeBlock = (
  type: string,
  text: string,
  extras: Record<string, unknown> = {}
): NotionBlock => ({
  id: `block-${type}`,
  type: type as NotionBlock['type'],
  [type]: {
    rich_text: [{ plain_text: text, annotations: {} }],
    ...extras,
  },
});

const sampleBlocks: NotionBlock[] = [
  makeBlock('heading_1', '2026-05-01 팀 미팅'),
  makeBlock('heading_2', '안건'),
  makeBlock('bulleted_list_item', '프로젝트 진행 상황 공유'),
  makeBlock('bulleted_list_item', 'Task 분배 논의'),
  makeBlock('to_do', '다음 미팅 일정 확인', { checked: false }),
  makeBlock('to_do', '결과물 업로드', { checked: true }),
  makeBlock('paragraph', '전체적으로 순조롭게 진행 중입니다.'),
  makeBlock('code', 'console.log("hello")', { language: 'javascript' }),
];

const sampleNotionPage: NotionPage = {
  id: 'page-001',
  url: 'https://notion.so/page-001',
  createdAt: new Date('2026-05-01T10:00:00Z'),
  lastEditedAt: new Date('2026-05-01T12:00:00Z'),
  title: '2026-05-01 팀 미팅',
  properties: {},
  blocks: sampleBlocks,
};

const sampleMarkdownFile: MarkdownFile = {
  filePath: '/vault/Meetings/2026-05-01-팀미팅.md',
  relativePath: 'Meetings/2026-05-01-팀미팅.md',
  folderType: 'meetings',
  fileName: '2026-05-01-팀미팅.md',
  createdAt: new Date('2026-05-01T10:00:00Z'),
  modifiedAt: new Date('2026-05-01T11:00:00Z'),
};

const sampleMarkdownContent = `---
title: 2026-05-01 팀 미팅
notionId: page-001
date: 2026-05-01
---

# 2026-05-01 팀 미팅

## 안건

- 프로젝트 진행 상황 공유
- Task 분배 논의

- [ ] 다음 미팅 일정 확인
- [x] 결과물 업로드

전체적으로 순조롭게 진행 중입니다.
`;

// ── 테스트 ────────────────────────────────────────────────────────────

describe('NotionMCPConnector', () => {
  let connector: NotionMCPConnector;

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(fs.existsSync).mockReturnValue(false);
    vi.mocked(fs.mkdirSync).mockReturnValue(undefined);
    vi.mocked(fs.writeFileSync).mockReturnValue(undefined);
    vi.mocked(fs.readFileSync).mockReturnValue(sampleMarkdownContent);

    mockNotionClient.databases.query.mockResolvedValue({
      results: [
        {
          id: 'page-001',
          url: 'https://notion.so/page-001',
          created_time: '2026-05-01T10:00:00Z',
          last_edited_time: '2026-05-01T12:00:00Z',
          properties: {
            Name: { title: [{ plain_text: '2026-05-01 팀 미팅' }] },
          },
        },
      ],
      has_more: false,
    });

    mockNotionClient.blocks.children.list.mockResolvedValue({
      results: sampleBlocks.map((b) => ({
        ...b,
        has_children: false,
      })),
      has_more: false,
    });

    connector = new NotionMCPConnector({ token: 'test-token' }, mockNotionClient as never);
  });

  // ── Subtask 2: fetchMeetings ──────────────────────────────────────

  describe('fetchMeetings', () => {
    it('NotionPage 배열을 반환한다', async () => {
      const pages = await connector.fetchMeetings('db-001');
      expect(Array.isArray(pages)).toBe(true);
      expect(pages.length).toBeGreaterThan(0);
    });

    it('각 페이지에 id, title, blocks, lastEditedAt이 있다', async () => {
      const pages = await connector.fetchMeetings('db-001');
      const page = pages[0];
      expect(page).toMatchObject({
        id: expect.any(String),
        title: expect.any(String),
        lastEditedAt: expect.any(Date),
        blocks: expect.any(Array),
      });
    });

    it('databases.query를 해당 databaseId로 호출한다', async () => {
      await connector.fetchMeetings('db-001');
      expect(mockNotionClient.databases.query).toHaveBeenCalledWith(
        expect.objectContaining({ database_id: 'db-001' })
      );
    });

    it('blocks.children.list를 각 페이지 ID로 호출한다', async () => {
      await connector.fetchMeetings('db-001');
      expect(mockNotionClient.blocks.children.list).toHaveBeenCalledWith(
        expect.objectContaining({ block_id: 'page-001' })
      );
    });
  });

  // ── Subtask 3: Notion → Obsidian 변환 ───────────────────────────

  describe('syncToObsidian', () => {
    it('대상 디렉토리가 없으면 mkdirSync로 생성한다', async () => {
      await connector.syncToObsidian(sampleNotionPage, '/vault/Meetings/meeting.md');
      expect(fs.mkdirSync).toHaveBeenCalledWith('/vault/Meetings', { recursive: true });
    });

    it('writeFileSync로 마크다운 파일을 생성한다', async () => {
      await connector.syncToObsidian(sampleNotionPage, '/vault/Meetings/meeting.md');
      expect(fs.writeFileSync).toHaveBeenCalledWith(
        '/vault/Meetings/meeting.md',
        expect.any(String),
        'utf-8'
      );
    });

    it('저장된 파일에 YAML frontmatter가 포함된다', async () => {
      await connector.syncToObsidian(sampleNotionPage, '/vault/Meetings/meeting.md');
      const content = vi.mocked(fs.writeFileSync).mock.calls[0][1] as string;
      expect(content).toMatch(/^---\n/);
      expect(content).toContain('notionId: page-001');
      expect(content).toContain('title:');
    });

    it('heading_1 블록이 # 제목으로 변환된다', async () => {
      await connector.syncToObsidian(sampleNotionPage, '/vault/Meetings/meeting.md');
      const content = vi.mocked(fs.writeFileSync).mock.calls[0][1] as string;
      expect(content).toContain('# 2026-05-01 팀 미팅');
    });

    it('heading_2 블록이 ## 제목으로 변환된다', async () => {
      await connector.syncToObsidian(sampleNotionPage, '/vault/Meetings/meeting.md');
      const content = vi.mocked(fs.writeFileSync).mock.calls[0][1] as string;
      expect(content).toContain('## 안건');
    });

    it('bulleted_list_item이 - 목록으로 변환된다', async () => {
      await connector.syncToObsidian(sampleNotionPage, '/vault/Meetings/meeting.md');
      const content = vi.mocked(fs.writeFileSync).mock.calls[0][1] as string;
      expect(content).toContain('- 프로젝트 진행 상황 공유');
    });

    it('to_do 블록이 체크박스로 변환된다', async () => {
      await connector.syncToObsidian(sampleNotionPage, '/vault/Meetings/meeting.md');
      const content = vi.mocked(fs.writeFileSync).mock.calls[0][1] as string;
      expect(content).toContain('- [ ] 다음 미팅 일정 확인');
      expect(content).toContain('- [x] 결과물 업로드');
    });

    it('code 블록이 코드 펜스로 변환된다', async () => {
      await connector.syncToObsidian(sampleNotionPage, '/vault/Meetings/meeting.md');
      const content = vi.mocked(fs.writeFileSync).mock.calls[0][1] as string;
      expect(content).toContain('```javascript');
      expect(content).toContain('console.log("hello")');
    });
  });

  // ── Subtask 4: Obsidian → Notion 역변환 ─────────────────────────

  describe('syncFromObsidian', () => {
    beforeEach(() => {
      mockNotionClient.pages.create.mockResolvedValue({ id: 'new-page-001' });
      mockNotionClient.blocks.children.append.mockResolvedValue({});
    });

    it('readFileSync로 마크다운 파일을 읽는다', async () => {
      await connector.syncFromObsidian(sampleMarkdownFile, 'db-001');
      expect(fs.readFileSync).toHaveBeenCalledWith(sampleMarkdownFile.filePath, 'utf-8');
    });

    it('pages.create를 databaseId로 호출한다', async () => {
      vi.mocked(fs.readFileSync).mockReturnValue(
        sampleMarkdownContent.replace('notionId: page-001\n', '')
      );
      await connector.syncFromObsidian(sampleMarkdownFile, 'db-001');
      expect(mockNotionClient.pages.create).toHaveBeenCalledWith(
        expect.objectContaining({
          parent: { data_source_id: 'db-001' },
        })
      );
    });

    it('blocks.children.append로 블록을 추가한다', async () => {
      await connector.syncFromObsidian(sampleMarkdownFile, 'db-001');
      expect(mockNotionClient.blocks.children.append).toHaveBeenCalled();
    });
  });

  // ── Subtask 5: 동기화 메타데이터 ─────────────────────────────────

  describe('SyncMetadata', () => {
    it('buildSyncMetadata가 올바른 구조를 반환한다', () => {
      const meta = connector.buildSyncMetadata(sampleNotionPage, '/vault/Meetings/meeting.md');
      expect(meta).toMatchObject({
        notionPageId: 'page-001',
        obsidianPath: '/vault/Meetings/meeting.md',
        lastSyncedAt: expect.any(Date),
        notionLastEditedAt: expect.any(Date),
        obsidianLastEditedAt: expect.any(Date),
      });
    });
  });

  // ── Subtask 6: 충돌 감지 및 해결 ─────────────────────────────────

  describe('resolveConflicts', () => {
    it('Notion이 더 최신이면 notion-wins를 반환한다', async () => {
      const localFile = { ...sampleMarkdownFile, modifiedAt: new Date('2026-05-01T10:00:00Z') };
      const remotePage = { ...sampleNotionPage, lastEditedAt: new Date('2026-05-01T12:00:00Z') };

      const result = await connector.resolveConflicts(localFile, remotePage);
      expect(result.resolution).toBe('notion-wins');
    });

    it('Obsidian이 더 최신이면 obsidian-wins를 반환한다', async () => {
      const localFile = { ...sampleMarkdownFile, modifiedAt: new Date('2026-05-01T13:00:00Z') };
      const remotePage = { ...sampleNotionPage, lastEditedAt: new Date('2026-05-01T12:00:00Z') };

      const result = await connector.resolveConflicts(localFile, remotePage);
      expect(result.resolution).toBe('obsidian-wins');
    });

    it('동일 시간이면 notion-wins를 기본으로 한다', async () => {
      const sameTime = new Date('2026-05-01T12:00:00Z');
      const localFile = { ...sampleMarkdownFile, modifiedAt: sameTime };
      const remotePage = { ...sampleNotionPage, lastEditedAt: sameTime };

      const result = await connector.resolveConflicts(localFile, remotePage);
      expect(result.resolution).toBe('notion-wins');
    });

    it('MergeResult에 content가 포함된다', async () => {
      const result = await connector.resolveConflicts(sampleMarkdownFile, sampleNotionPage);
      expect(typeof result.content).toBe('string');
      expect(result.content.length).toBeGreaterThan(0);
    });
  });

  // ── Subtask 3/4: 블록 변환 유틸리티 ─────────────────────────────

  describe('NotionBlockConverter (static)', () => {
    it('paragraph 블록을 텍스트로 변환한다', () => {
      const block = makeBlock('paragraph', '안녕하세요');
      const md = NotionMCPConnector.blockToMarkdown(block);
      expect(md).toBe('안녕하세요');
    });

    it('heading_1을 # 제목으로 변환한다', () => {
      const block = makeBlock('heading_1', '제목 1');
      expect(NotionMCPConnector.blockToMarkdown(block)).toBe('# 제목 1');
    });

    it('heading_2를 ## 제목으로 변환한다', () => {
      const block = makeBlock('heading_2', '제목 2');
      expect(NotionMCPConnector.blockToMarkdown(block)).toBe('## 제목 2');
    });

    it('heading_3을 ### 제목으로 변환한다', () => {
      const block = makeBlock('heading_3', '제목 3');
      expect(NotionMCPConnector.blockToMarkdown(block)).toBe('### 제목 3');
    });

    it('bulleted_list_item을 - 목록으로 변환한다', () => {
      const block = makeBlock('bulleted_list_item', '항목');
      expect(NotionMCPConnector.blockToMarkdown(block)).toBe('- 항목');
    });

    it('numbered_list_item을 숫자 목록으로 변환한다', () => {
      const block = makeBlock('numbered_list_item', '항목');
      expect(NotionMCPConnector.blockToMarkdown(block)).toMatch(/^\d+\.\s항목/);
    });

    it('to_do(미완료)를 - [ ] 로 변환한다', () => {
      const block = makeBlock('to_do', '할 일', { checked: false });
      expect(NotionMCPConnector.blockToMarkdown(block)).toBe('- [ ] 할 일');
    });

    it('to_do(완료)를 - [x] 로 변환한다', () => {
      const block = makeBlock('to_do', '완료된 일', { checked: true });
      expect(NotionMCPConnector.blockToMarkdown(block)).toBe('- [x] 완료된 일');
    });

    it('code 블록을 ```언어\\n코드\\n``` 로 변환한다', () => {
      const block = makeBlock('code', 'const x = 1;', { language: 'typescript' });
      const md = NotionMCPConnector.blockToMarkdown(block);
      expect(md).toContain('```typescript');
      expect(md).toContain('const x = 1;');
      expect(md).toContain('```');
    });

    it('divider를 --- 로 변환한다', () => {
      const block: NotionBlock = { id: 'div', type: 'divider', divider: {} };
      expect(NotionMCPConnector.blockToMarkdown(block)).toBe('---');
    });

    it('알 수 없는 블록 타입은 빈 문자열을 반환한다', () => {
      const block = { id: 'unknown', type: 'unsupported' as NotionBlock['type'], unsupported: {} };
      expect(NotionMCPConnector.blockToMarkdown(block)).toBe('');
    });
  });
});
