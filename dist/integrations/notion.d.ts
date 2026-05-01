import type { NotionPage, NotionBlock, NotionRichText, SyncMetadata, MergeResult, NotionConnectorConfig } from '../types/notion';
import type { MarkdownFile } from '../types/vault';
export interface NotionClient {
    databases: {
        query(params: {
            database_id: string;
            [k: string]: unknown;
        }): Promise<{
            results: RawNotionPage[];
            has_more: boolean;
        }>;
    };
    pages: {
        create(params: unknown): Promise<{
            id: string;
        }>;
        update(params: unknown): Promise<void>;
    };
    blocks: {
        children: {
            list(params: {
                block_id: string;
            }): Promise<{
                results: RawBlock[];
                has_more: boolean;
            }>;
            append(params: {
                block_id: string;
                children: unknown[];
            }): Promise<void>;
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
export declare class NotionMCPConnector {
    private readonly config;
    private readonly client;
    constructor(config: NotionConnectorConfig, client: NotionClient);
    fetchMeetings(databaseId: string): Promise<NotionPage[]>;
    syncToObsidian(notionPage: NotionPage, targetPath: string): Promise<void>;
    syncFromObsidian(markdownFile: MarkdownFile, databaseId: string): Promise<void>;
    buildSyncMetadata(notionPage: NotionPage, obsidianPath: string): SyncMetadata;
    resolveConflicts(local: MarkdownFile, remote: NotionPage): Promise<MergeResult>;
    static blockToMarkdown(block: NotionBlock): string;
    private buildMarkdownFromPage;
    private markdownToBlocks;
    private makeHeadingBlock;
    private makeParagraphBlock;
    private makeBulletBlock;
    private makeNumberedBlock;
    private makeToDoBlock;
    private normalizeBlock;
    private extractTitle;
    static extractPlainText(richText: NotionRichText[]): string;
}
export {};
//# sourceMappingURL=notion.d.ts.map