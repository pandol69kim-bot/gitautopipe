import type { BuildResult, DeploymentResult, DeploymentStatus, DeploymentVerification, SiteCategory, WebsiteDeployerConfig } from '../types/deployer';
type FetchFn = (url: string, options?: RequestInit) => Promise<{
    ok: boolean;
    status?: number;
    json(): Promise<unknown>;
}>;
export interface DeployToVercelOptions {
    preview?: boolean;
}
export interface DeploymentPollingOptions {
    maxAttempts?: number;
    delayMs?: number;
}
export declare class WebsiteDeployer {
    private readonly config;
    private readonly fetch;
    constructor(config: WebsiteDeployerConfig, fetchFn: FetchFn);
    buildSite(sourceFolder: string): Promise<BuildResult>;
    deployToVercel(buildOutput: string, options?: DeployToVercelOptions): Promise<DeploymentResult>;
    getDeploymentStatus(deploymentId: string): Promise<DeploymentStatus>;
    waitForDeploymentReady(deploymentId: string, options?: DeploymentPollingOptions): Promise<DeploymentStatus>;
    verifyDeploymentUrl(url: string, options?: DeploymentPollingOptions): Promise<DeploymentVerification>;
    rollback(deploymentId: string): Promise<void>;
    sendNotification(result: DeploymentResult): Promise<void>;
    private collectDeploymentFiles;
    private extractErrorMessage;
    private renderIndexHtml;
    private renderPageHtml;
    private escapeHtml;
    private sleep;
    static classifyCategory(frontmatterCategory: string | undefined, title: string): SiteCategory;
    static markdownToHtml(markdown: string): string;
    private static inlineMarkdown;
    private titleFromSlug;
}
export {};
//# sourceMappingURL=website-deployer.d.ts.map