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
exports.WebsiteDeployer = void 0;
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const gray_matter_1 = __importDefault(require("gray-matter"));
const VERCEL_API = 'https://api.vercel.com';
const CATEGORY_KEYWORDS = {
    'ai-tools': [
        'ai',
        'gpt',
        'llm',
        'claude',
        'openai',
        '인공지능',
        '에이전트',
        'chatgpt',
        'prompt',
        '프롬프트',
    ],
    platform: [
        'vercel',
        'github',
        'docker',
        'aws',
        'gcp',
        'ci/cd',
        'deploy',
        '배포',
        'actions',
        'kubernetes',
    ],
    insights: ['회고', '인사이트', 'insight', '성장', '배움', 'retrospect', '학습', '경험', '정리'],
};
// ── WebsiteDeployer 클래스 ────────────────────────────────────────────
class WebsiteDeployer {
    config;
    fetch;
    constructor(config, fetchFn) {
        this.config = config;
        this.fetch = fetchFn;
    }
    // ── Subtask 2: 사이트 빌드 ────────────────────────────────────────
    async buildSite(sourceFolder) {
        const files = fs.readdirSync(sourceFolder).filter((f) => f.endsWith('.md'));
        const pages = files.map((fileName) => {
            const filePath = path.join(sourceFolder, fileName);
            const raw = fs.readFileSync(filePath, 'utf-8');
            const { data: frontmatter, content } = (0, gray_matter_1.default)(raw);
            const title = frontmatter.title ?? this.titleFromSlug(fileName);
            const category = WebsiteDeployer.classifyCategory(frontmatter.category, title);
            const htmlContent = WebsiteDeployer.markdownToHtml(content);
            const slug = fileName.replace(/\.md$/, '');
            return {
                slug,
                title,
                category,
                htmlContent,
                markdownSource: content,
                searchText: `${title} ${content}`.toLowerCase(),
            };
        });
        const searchIndex = pages.map((p) => ({
            slug: p.slug,
            title: p.title,
            category: p.category,
            excerpt: p.markdownSource.slice(0, 150).replace(/\n/g, ' ').trim(),
        }));
        return {
            pages,
            searchIndex,
            outputPath: path.join(sourceFolder, '.build'),
            pageCount: pages.length,
            builtAt: new Date(),
        };
    }
    // ── Subtask 5: Vercel 배포 ────────────────────────────────────────
    async deployToVercel(buildOutput, options = {}) {
        const url = `${VERCEL_API}/v13/deployments`;
        const params = this.config.teamId ? `?teamId=${this.config.teamId}` : '';
        const payload = {
            name: this.config.projectId,
            source: buildOutput,
            ...(options.preview ? {} : { target: 'production' }),
        };
        const response = await this.fetch(`${url}${params}`, {
            method: 'POST',
            headers: {
                Authorization: `Bearer ${this.config.vercelToken}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(payload),
        });
        if (!response.ok) {
            const err = (await response.json());
            throw new Error(`Vercel 배포 실패 (${response.status ?? 'unknown'}): ${err.error ?? '알 수 없는 오류'}`);
        }
        const data = (await response.json());
        return {
            deploymentId: data.id,
            url: data.url,
            previewUrl: data.url,
            state: data.readyState,
            createdAt: new Date(data.createdAt),
        };
    }
    // ── Subtask 6: 배포 상태 조회 ─────────────────────────────────────
    async getDeploymentStatus(deploymentId) {
        const url = `${VERCEL_API}/v13/deployments/${deploymentId}`;
        const params = this.config.teamId ? `?teamId=${this.config.teamId}` : '';
        const response = await this.fetch(`${url}${params}`, {
            method: 'GET',
            headers: { Authorization: `Bearer ${this.config.vercelToken}` },
        });
        if (!response.ok) {
            const err = (await response.json());
            const message = typeof err.error === 'string'
                ? err.error
                : err.error?.message ?? '알 수 없는 오류';
            throw new Error(`배포 상태 조회 실패 (${response.status ?? 'unknown'}): ${message}`);
        }
        const data = (await response.json());
        return {
            deploymentId: data.id,
            state: data.readyState,
            url: data.url,
            errorMessage: data.errorMessage,
            readyAt: data.readyAt ? new Date(data.readyAt) : undefined,
        };
    }
    // ── Subtask 6: 롤백 ──────────────────────────────────────────────
    async rollback(deploymentId) {
        const url = `${VERCEL_API}/v13/deployments/${deploymentId}/rollback`;
        const params = this.config.teamId ? `?teamId=${this.config.teamId}` : '';
        const response = await this.fetch(`${url}${params}`, {
            method: 'POST',
            headers: {
                Authorization: `Bearer ${this.config.vercelToken}`,
                'Content-Type': 'application/json',
            },
        });
        if (!response.ok) {
            throw new Error(`롤백 실패: deployment ${deploymentId}`);
        }
    }
    // ── Subtask 7: 배포 알림 ─────────────────────────────────────────
    async sendNotification(result) {
        const webhookUrl = this.config.notificationWebhookUrl;
        if (!webhookUrl)
            return;
        const payload = {
            text: `✅ 배포 완료: ${result.state}`,
            attachments: [
                {
                    title: `Deployment ${result.deploymentId}`,
                    url: `https://${result.url}`,
                    fields: [
                        { title: '상태', value: result.state, short: true },
                        { title: 'URL', value: result.url, short: true },
                    ],
                },
            ],
        };
        const response = await this.fetch(webhookUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
        });
        if (!response.ok) {
            throw new Error(`배포 알림 전송 실패 (${response.status ?? 'unknown'})`);
        }
    }
    // ── Subtask 3: 카테고리 분류 (static) ────────────────────────────
    static classifyCategory(frontmatterCategory, title) {
        if (frontmatterCategory) {
            const valid = ['ai-tools', 'platform', 'insights', 'uncategorized'];
            if (valid.includes(frontmatterCategory)) {
                return frontmatterCategory;
            }
        }
        const lowerTitle = title.toLowerCase();
        for (const [category, keywords] of Object.entries(CATEGORY_KEYWORDS)) {
            if (keywords.some((kw) => lowerTitle.includes(kw))) {
                return category;
            }
        }
        return 'uncategorized';
    }
    // ── Subtask 4: 마크다운 → HTML 변환 (static) ─────────────────────
    static markdownToHtml(markdown) {
        const lines = markdown.split('\n');
        const htmlLines = [];
        for (const line of lines) {
            const trimmed = line.trim();
            if (!trimmed)
                continue;
            let html;
            if (/^### /.test(trimmed)) {
                html = `<h3>${this.inlineMarkdown(trimmed.slice(4))}</h3>`;
            }
            else if (/^## /.test(trimmed)) {
                html = `<h2>${this.inlineMarkdown(trimmed.slice(3))}</h2>`;
            }
            else if (/^# /.test(trimmed)) {
                html = `<h1>${this.inlineMarkdown(trimmed.slice(2))}</h1>`;
            }
            else if (/^- /.test(trimmed)) {
                html = `<li>${this.inlineMarkdown(trimmed.slice(2))}</li>`;
            }
            else if (/^\d+\. /.test(trimmed)) {
                html = `<li>${this.inlineMarkdown(trimmed.replace(/^\d+\. /, ''))}</li>`;
            }
            else {
                html = `<p>${this.inlineMarkdown(trimmed)}</p>`;
            }
            htmlLines.push(html);
        }
        return htmlLines.join('\n');
    }
    // ── 인라인 마크다운 변환 ─────────────────────────────────────────
    static inlineMarkdown(text) {
        return text
            .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
            .replace(/\*(.+?)\*/g, '<em>$1</em>')
            .replace(/`(.+?)`/g, '<code>$1</code>')
            .replace(/\[(.+?)\]\((.+?)\)/g, '<a href="$2">$1</a>');
    }
    titleFromSlug(fileName) {
        return fileName
            .replace(/\.md$/, '')
            .replace(/[-_]/g, ' ')
            .replace(/\b\w/g, (c) => c.toUpperCase());
    }
}
exports.WebsiteDeployer = WebsiteDeployer;
//# sourceMappingURL=website-deployer.js.map