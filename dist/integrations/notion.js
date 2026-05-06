"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.NotionMCPConnector = void 0;
exports.normalizeNotionId = normalizeNotionId;
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const gray_matter_1 = __importDefault(require("gray-matter"));
// ── NotionMCPConnector 클래스 ─────────────────────────────────────────
class NotionMCPConnector {
    config;
    client;
    constructor(config, client) {
        this.config = config;
        this.client = client;
    }
    // ── Subtask 2: Notion DB에서 미팅 페이지 목록 가져오기 ────────────
    async fetchMeetings(databaseId) {
        const response = await this.queryDatabase(databaseId);
        const pages = await Promise.all(response.results.map(async (raw) => {
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
            };
        }));
        return pages;
    }
    // ── Subtask 3: Notion → Obsidian 마크다운 변환 + 저장 ────────────
    async syncToObsidian(notionPage, targetPath) {
        const dir = path.dirname(targetPath);
        fs.mkdirSync(dir, { recursive: true });
        const content = this.buildMarkdownFromPage(notionPage);
        fs.writeFileSync(targetPath, content, 'utf-8');
    }
    // ── Subtask 4: Obsidian → Notion 역변환 + 업로드 ─────────────────
    async syncFromObsidian(markdownFile, databaseId) {
        const raw = fs.readFileSync(markdownFile.filePath, 'utf-8');
        const { data: frontmatter, content } = (0, gray_matter_1.default)(raw);
        const title = String(frontmatter['title'] ?? markdownFile.fileName.replace(/\.md$/i, ''));
        const notionId = typeof frontmatter['notionId'] === 'string' && frontmatter['notionId'].trim().length > 0
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
            }
            catch {
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
    buildSyncMetadata(notionPage, obsidianPath) {
        return {
            notionPageId: notionPage.id,
            obsidianPath,
            lastSyncedAt: new Date(),
            notionLastEditedAt: notionPage.lastEditedAt,
            obsidianLastEditedAt: new Date(),
        };
    }
    // ── Subtask 6: 충돌 감지 및 해결 ─────────────────────────────────
    async resolveConflicts(local, remote) {
        const notionIsNewer = remote.lastEditedAt >= local.modifiedAt;
        const resolution = notionIsNewer ? 'notion-wins' : 'obsidian-wins';
        let content;
        if (resolution === 'notion-wins') {
            content = this.buildMarkdownFromPage(remote);
        }
        else {
            content = fs.readFileSync(local.filePath, 'utf-8');
        }
        return {
            resolution,
            content,
            conflictDetails: resolution === 'notion-wins'
                ? `Notion (${remote.lastEditedAt.toISOString()}) > Obsidian (${local.modifiedAt.toISOString()})`
                : `Obsidian (${local.modifiedAt.toISOString()}) > Notion (${remote.lastEditedAt.toISOString()})`,
        };
    }
    // ── Subtask 3: static 블록 변환기 ────────────────────────────────
    static blockToMarkdown(block) {
        const { type } = block;
        const data = block[type];
        if (!data)
            return '';
        const text = NotionMCPConnector.extractPlainText(data.rich_text ?? []);
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
                const lang = data.language ?? '';
                return `\`\`\`${lang}\n${text}\n\`\`\``;
            }
            case 'divider':
                return '---';
            default:
                return '';
        }
    }
    // ── 내부 헬퍼 ────────────────────────────────────────────────────
    buildMarkdownFromPage(page) {
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
    async queryDatabase(databaseId) {
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
    async resolveParentId(databaseId) {
        const normalizedId = normalizeNotionId(databaseId);
        if (this.client.dataSources?.query) {
            return this.resolveDataSourceId(normalizedId);
        }
        return normalizedId;
    }
    async resolveDataSourceId(databaseId) {
        if (!this.client.databases?.retrieve) {
            return databaseId;
        }
        try {
            const database = await this.client.databases.retrieve({ database_id: databaseId });
            const dataSourceId = database.data_sources?.[0]?.id;
            return dataSourceId ? normalizeNotionId(dataSourceId) : databaseId;
        }
        catch {
            return databaseId;
        }
    }
    async replacePageChildren(pageId, blocks) {
        const existingBlocks = await this.client.blocks.children.list({ block_id: pageId });
        if (this.client.blocks.delete) {
            await Promise.all(existingBlocks.results.map((block) => this.client.blocks.delete({ block_id: block.id })));
        }
        if (blocks.length === 0) {
            return;
        }
        await this.client.blocks.children.append({
            block_id: pageId,
            children: blocks,
        });
    }
    writeBackNotionId(filePath, frontmatter, content, notionId) {
        const nextFrontmatter = { ...frontmatter, notionId };
        const nextContent = gray_matter_1.default.stringify(content.trimStart(), nextFrontmatter);
        fs.writeFileSync(filePath, nextContent, 'utf-8');
    }
    markdownToBlocks(content) {
        const lines = content.split('\n');
        const blocks = [];
        for (const line of lines) {
            const trimmed = line.trim();
            if (!trimmed)
                continue;
            if (/^### /.test(trimmed)) {
                blocks.push(this.makeHeadingBlock(trimmed.slice(4), 3));
            }
            else if (/^## /.test(trimmed)) {
                blocks.push(this.makeHeadingBlock(trimmed.slice(3), 2));
            }
            else if (/^# /.test(trimmed)) {
                blocks.push(this.makeHeadingBlock(trimmed.slice(2), 1));
            }
            else if (/^- \[x\] /.test(trimmed)) {
                blocks.push(this.makeToDoBlock(trimmed.slice(6), true));
            }
            else if (/^- \[ \] /.test(trimmed)) {
                blocks.push(this.makeToDoBlock(trimmed.slice(6), false));
            }
            else if (/^- /.test(trimmed)) {
                blocks.push(this.makeBulletBlock(trimmed.slice(2)));
            }
            else if (/^\d+\. /.test(trimmed)) {
                blocks.push(this.makeNumberedBlock(trimmed.replace(/^\d+\. /, '')));
            }
            else {
                blocks.push(this.makeParagraphBlock(trimmed));
            }
        }
        return blocks;
    }
    makeHeadingBlock(text, level) {
        const type = `heading_${level}`;
        return { object: 'block', type, [type]: { rich_text: [{ text: { content: text } }] } };
    }
    makeParagraphBlock(text) {
        return {
            object: 'block',
            type: 'paragraph',
            paragraph: { rich_text: [{ text: { content: text } }] },
        };
    }
    makeBulletBlock(text) {
        return {
            object: 'block',
            type: 'bulleted_list_item',
            bulleted_list_item: { rich_text: [{ text: { content: text } }] },
        };
    }
    makeNumberedBlock(text) {
        return {
            object: 'block',
            type: 'numbered_list_item',
            numbered_list_item: { rich_text: [{ text: { content: text } }] },
        };
    }
    makeToDoBlock(text, checked) {
        return {
            object: 'block',
            type: 'to_do',
            to_do: { rich_text: [{ text: { content: text } }], checked },
        };
    }
    normalizeBlock(raw) {
        return raw;
    }
    extractTitle(properties) {
        const name = properties['Name'];
        return name?.title?.[0]?.plain_text ?? '제목 없음';
    }
    static extractPlainText(richText) {
        return richText.map((rt) => rt.plain_text).join('');
    }
}
exports.NotionMCPConnector = NotionMCPConnector;
function normalizeNotionId(value) {
    const trimmed = value.trim();
    const urlMatch = trimmed.match(/([0-9a-fA-F]{32}|[0-9a-fA-F-]{36})(?:\?|$)/);
    const rawId = urlMatch?.[1] ?? trimmed;
    const compact = rawId.replace(/-/g, '');
    if (/^[0-9a-fA-F]{32}$/.test(compact)) {
        return `${compact.slice(0, 8)}-${compact.slice(8, 12)}-${compact.slice(12, 16)}-${compact.slice(16, 20)}-${compact.slice(20)}`.toLowerCase();
    }
    return rawId;
}
//# sourceMappingURL=notion.js.map