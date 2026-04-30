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
exports.VaultScanner = void 0;
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const gray_matter_1 = __importDefault(require("gray-matter"));
const chokidar_1 = __importDefault(require("chokidar"));
const zod_1 = require("zod");
const WEEK_FOLDER_PATTERN = /^[Ww]eek(\d+)$/;
const EXCERPT_LENGTH = 200;
const VaultConfigSchema = zod_1.z.object({
    basePath: zod_1.z.string().min(1, 'basePath는 필수입니다'),
    folders: zod_1.z.object({
        mission: zod_1.z.string().min(1),
        meetings: zod_1.z.string().min(1),
        skillInsight: zod_1.z.string().min(1),
        sharing: zod_1.z.string().min(1),
        analysis: zod_1.z.string().min(1),
        linkedin: zod_1.z.string().min(1),
    }),
});
class VaultScanner {
    config;
    watcher = null;
    constructor(config) {
        this.config = this.validateConfig(config);
    }
    async scanFolder(folderType) {
        const folderPath = this.getFullPath(folderType);
        if (!fs.existsSync(folderPath)) {
            return [];
        }
        return this.collectMarkdownFiles(folderPath, folderType);
    }
    async parseMarkdown(filePath) {
        const raw = fs.readFileSync(filePath, 'utf-8');
        const parsed = (0, gray_matter_1.default)(raw);
        const frontmatter = this.normalizeFrontmatter(parsed.data);
        const content = parsed.content.trim();
        const excerpt = content.length > EXCERPT_LENGTH ? content.slice(0, EXCERPT_LENGTH) + '…' : content;
        return { frontmatter, content, excerpt };
    }
    async getWeekFolders(folderType) {
        const folderPath = this.getFullPath(folderType);
        if (!fs.existsSync(folderPath)) {
            return [];
        }
        const entries = fs.readdirSync(folderPath, { withFileTypes: true });
        const weekFolders = [];
        for (const entry of entries) {
            if (!entry.isDirectory())
                continue;
            const match = entry.name.match(WEEK_FOLDER_PATTERN);
            if (!match)
                continue;
            const weekNumber = parseInt(match[1], 10);
            const weekPath = path.join(folderPath, entry.name);
            const files = await this.collectMarkdownFiles(weekPath, folderType);
            weekFolders.push({ weekNumber, path: weekPath, files });
        }
        return weekFolders.sort((a, b) => a.weekNumber - b.weekNumber);
    }
    async watchChanges(callback) {
        if (this.watcher) {
            await this.stopWatching();
        }
        const watchPaths = Object.values(this.config.folders).map((folder) => path.join(this.config.basePath, folder));
        this.watcher = chokidar_1.default.watch(watchPaths, {
            persistent: true,
            ignoreInitial: true,
            awaitWriteFinish: { stabilityThreshold: 300, pollInterval: 100 },
        });
        const handler = (type) => (filePath) => {
            if (!this.isMarkdownFile(filePath))
                return;
            const folderType = this.detectFolderType(filePath);
            if (folderType) {
                callback({ type, path: filePath, folderType });
            }
        };
        this.watcher.on('add', handler('add'));
        this.watcher.on('change', handler('change'));
        this.watcher.on('unlink', handler('unlink'));
    }
    async stopWatching() {
        if (this.watcher) {
            await this.watcher.close();
            this.watcher = null;
        }
    }
    getFullPath(folderType) {
        return path.join(this.config.basePath, this.config.folders[folderType]);
    }
    validateConfig(config) {
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
    isMarkdownFile(filePath) {
        return path.extname(filePath).toLowerCase() === '.md';
    }
    detectFolderType(filePath) {
        for (const [type, folder] of Object.entries(this.config.folders)) {
            const fullFolder = path.join(this.config.basePath, folder);
            if (filePath.startsWith(fullFolder)) {
                return type;
            }
        }
        return null;
    }
    async collectMarkdownFiles(dirPath, folderType) {
        const results = [];
        this.walkDir(dirPath, folderType, results);
        return results;
    }
    walkDir(dirPath, folderType, results) {
        const entries = fs.readdirSync(dirPath, { withFileTypes: true });
        for (const entry of entries) {
            const fullPath = path.join(dirPath, entry.name);
            if (entry.isDirectory()) {
                this.walkDir(fullPath, folderType, results);
            }
            else if (entry.isFile() && this.isMarkdownFile(entry.name)) {
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
    normalizeFrontmatter(data) {
        return {
            title: typeof data['title'] === 'string' ? data['title'] : undefined,
            date: data['date'] instanceof Date
                ? data['date']
                : typeof data['date'] === 'string'
                    ? new Date(data['date'])
                    : undefined,
            author: typeof data['author'] === 'string' ? data['author'] : undefined,
            tags: Array.isArray(data['tags']) ? data['tags'] : undefined,
            week: typeof data['week'] === 'number' ? data['week'] : undefined,
            category: typeof data['category'] === 'string' ? data['category'] : undefined,
        };
    }
}
exports.VaultScanner = VaultScanner;
//# sourceMappingURL=vault-scanner.js.map