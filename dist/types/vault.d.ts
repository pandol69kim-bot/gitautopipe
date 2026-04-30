export type FolderType = 'mission' | 'meetings' | 'skillInsight' | 'sharing' | 'analysis' | 'linkedin';
export interface VaultConfig {
    basePath: string;
    folders: Record<FolderType, string>;
}
export interface FrontmatterData {
    title?: string;
    date?: Date;
    author?: string;
    tags?: string[];
    week?: number;
    category?: string;
}
export interface MarkdownFile {
    filePath: string;
    relativePath: string;
    folderType: FolderType;
    fileName: string;
    createdAt: Date;
    modifiedAt: Date;
}
export interface ParsedContent {
    frontmatter: FrontmatterData;
    content: string;
    excerpt?: string;
}
export interface FileEvent {
    type: 'add' | 'change' | 'unlink';
    path: string;
    folderType: FolderType;
}
export interface WeekFolder {
    weekNumber: number;
    path: string;
    files: MarkdownFile[];
}
//# sourceMappingURL=vault.d.ts.map