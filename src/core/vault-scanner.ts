import * as fs from 'fs';
import * as path from 'path';
import matter from 'gray-matter';
import chokidar, { FSWatcher } from 'chokidar';
import { z } from 'zod';
import type {
  FolderType,
  VaultConfig,
  MarkdownFile,
  ParsedContent,
  FileEvent,
  WeekFolder,
  FrontmatterData,
} from '../types/vault';

const WEEK_FOLDER_PATTERN = /^[Ww]eek(\d+)$/;
const EXCERPT_LENGTH = 200;

const VaultConfigSchema = z.object({
  basePath: z.string().min(1, 'basePath는 필수입니다'),
  folders: z.object({
    mission: z.string().min(1),
    meetings: z.string().min(1),
    skillInsight: z.string().min(1),
    sharing: z.string().min(1),
    analysis: z.string().min(1),
    linkedin: z.string().min(1),
  }),
});

export class VaultScanner {
  private readonly config: VaultConfig;
  private watcher: FSWatcher | null = null;

  constructor(config: VaultConfig) {
    this.config = this.validateConfig(config);
  }

  async scanFolder(folderType: FolderType): Promise<MarkdownFile[]> {
    const folderPath = this.getFullPath(folderType);

    if (!fs.existsSync(folderPath)) {
      return [];
    }

    return this.collectMarkdownFiles(folderPath, folderType);
  }

  async parseMarkdown(filePath: string): Promise<ParsedContent> {
    const raw = fs.readFileSync(filePath, 'utf-8');
    const parsed = matter(raw);

    const frontmatter = this.normalizeFrontmatter(parsed.data);
    const content = parsed.content.trim();
    const excerpt =
      content.length > EXCERPT_LENGTH ? content.slice(0, EXCERPT_LENGTH) + '…' : content;

    return { frontmatter, content, excerpt };
  }

  async getWeekFolders(folderType: FolderType): Promise<WeekFolder[]> {
    const folderPath = this.getFullPath(folderType);

    if (!fs.existsSync(folderPath)) {
      return [];
    }

    const entries = fs.readdirSync(folderPath, { withFileTypes: true });
    const weekFolders: WeekFolder[] = [];

    for (const entry of entries) {
      if (!entry.isDirectory()) continue;

      const match = entry.name.match(WEEK_FOLDER_PATTERN);
      if (!match) continue;

      const weekNumber = parseInt(match[1], 10);
      const weekPath = path.join(folderPath, entry.name);
      const files = await this.collectMarkdownFiles(weekPath, folderType);

      weekFolders.push({ weekNumber, path: weekPath, files });
    }

    return weekFolders.sort((a, b) => a.weekNumber - b.weekNumber);
  }

  async watchChanges(callback: (event: FileEvent) => void): Promise<void> {
    if (this.watcher) {
      await this.stopWatching();
    }

    const watchPaths = Object.values(this.config.folders).map((folder) =>
      path.join(this.config.basePath, folder)
    );

    this.watcher = chokidar.watch(watchPaths, {
      persistent: true,
      ignoreInitial: true,
      awaitWriteFinish: { stabilityThreshold: 300, pollInterval: 100 },
    });

    const handler = (type: FileEvent['type']) => (filePath: string) => {
      if (!this.isMarkdownFile(filePath)) return;
      const folderType = this.detectFolderType(filePath);
      if (folderType) {
        callback({ type, path: filePath, folderType });
      }
    };

    this.watcher.on('add', handler('add'));
    this.watcher.on('change', handler('change'));
    this.watcher.on('unlink', handler('unlink'));
  }

  async stopWatching(): Promise<void> {
    if (this.watcher) {
      await this.watcher.close();
      this.watcher = null;
    }
  }

  getFullPath(folderType: FolderType): string {
    return path.join(this.config.basePath, this.config.folders[folderType]);
  }

  private validateConfig(config: VaultConfig): VaultConfig {
    const result = VaultConfigSchema.safeParse(config);
    if (!result.success) {
      const issues = result.error.issues
        .map((i) => `  - ${i.path.join('.')}: ${i.message}`)
        .join('\n');
      throw new Error(`VaultConfig 검증 실패:\n${issues}`);
    }

    if (!fs.existsSync(config.basePath)) {
      throw new Error(`볼트 경로가 존재하지 않습니다: ${config.basePath}`);
    }

    return config;
  }

  private isMarkdownFile(filePath: string): boolean {
    return path.extname(filePath).toLowerCase() === '.md';
  }

  private detectFolderType(filePath: string): FolderType | null {
    for (const [type, folder] of Object.entries(this.config.folders)) {
      const fullFolder = path.join(this.config.basePath, folder);
      if (filePath.startsWith(fullFolder)) {
        return type as FolderType;
      }
    }
    return null;
  }

  private async collectMarkdownFiles(
    dirPath: string,
    folderType: FolderType
  ): Promise<MarkdownFile[]> {
    const results: MarkdownFile[] = [];
    this.walkDir(dirPath, folderType, results);
    return results;
  }

  private walkDir(dirPath: string, folderType: FolderType, results: MarkdownFile[]): void {
    const entries = fs.readdirSync(dirPath, { withFileTypes: true });

    for (const entry of entries) {
      const fullPath = path.join(dirPath, entry.name);

      if (entry.isDirectory()) {
        this.walkDir(fullPath, folderType, results);
      } else if (entry.isFile() && this.isMarkdownFile(entry.name)) {
        const stat = fs.statSync(fullPath);
        results.push({
          filePath: fullPath,
          relativePath: path.relative(this.config.basePath, fullPath),
          folderType,
          fileName: entry.name,
          createdAt: stat.birthtime,
          modifiedAt: stat.mtime,
        });
      }
    }
  }

  private normalizeFrontmatter(data: Record<string, unknown>): FrontmatterData {
    return {
      title: typeof data['title'] === 'string' ? data['title'] : undefined,
      date:
        data['date'] instanceof Date
          ? data['date']
          : typeof data['date'] === 'string'
            ? new Date(data['date'])
            : undefined,
      author: typeof data['author'] === 'string' ? data['author'] : undefined,
      tags: Array.isArray(data['tags']) ? (data['tags'] as string[]) : undefined,
      week: typeof data['week'] === 'number' ? data['week'] : undefined,
      category: typeof data['category'] === 'string' ? data['category'] : undefined,
    };
  }
}
