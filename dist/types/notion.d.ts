export type NotionBlockType = 'paragraph' | 'heading_1' | 'heading_2' | 'heading_3' | 'bulleted_list_item' | 'numbered_list_item' | 'to_do' | 'code' | 'image' | 'divider';
export interface NotionRichText {
    plain_text: string;
    annotations?: {
        bold?: boolean;
        italic?: boolean;
        code?: boolean;
    };
}
export interface NotionBlock {
    id: string;
    type: NotionBlockType;
    [key: string]: unknown;
}
export interface NotionPage {
    id: string;
    url: string;
    createdAt: Date;
    lastEditedAt: Date;
    title: string;
    properties: Record<string, unknown>;
    blocks: NotionBlock[];
}
export interface SyncMetadata {
    notionPageId: string;
    obsidianPath: string;
    lastSyncedAt: Date;
    notionLastEditedAt: Date;
    obsidianLastEditedAt: Date;
}
export type ConflictResolution = 'notion-wins' | 'obsidian-wins' | 'manual';
export interface MergeResult {
    resolution: ConflictResolution;
    content: string;
    conflictDetails?: string;
}
export interface NotionConnectorConfig {
    token: string;
    defaultDatabaseId?: string;
    titlePropertyName?: string;
}
//# sourceMappingURL=notion.d.ts.map