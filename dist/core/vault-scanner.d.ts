import type { FolderType, VaultConfig, MarkdownFile, ParsedContent, FileEvent, WeekFolder } from '../types/vault';
export declare class VaultScanner {
    private readonly config;
    private watcher;
    constructor(config: VaultConfig);
    scanFolder(folderType: FolderType): Promise<MarkdownFile[]>;
    parseMarkdown(filePath: string): Promise<ParsedContent>;
    getWeekFolders(folderType: FolderType): Promise<WeekFolder[]>;
    watchChanges(callback: (event: FileEvent) => void): Promise<void>;
    stopWatching(): Promise<void>;
    getFullPath(folderType: FolderType): string;
    private validateConfig;
    private isMarkdownFile;
    private detectFolderType;
    private collectMarkdownFiles;
    private walkDir;
    private normalizeFrontmatter;
}
//# sourceMappingURL=vault-scanner.d.ts.map