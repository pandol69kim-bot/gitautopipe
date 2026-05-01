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
        const response = await this.client.databases.query({ database_id: databaseId });
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
//# sourceMappingURL=notion.js.map