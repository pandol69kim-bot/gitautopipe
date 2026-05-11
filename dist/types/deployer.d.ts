export type SiteCategory = 'ai-tools' | 'platform' | 'insights' | 'uncategorized';
export type DeploymentState = 'INITIALIZING' | 'QUEUED' | 'BUILDING' | 'READY' | 'ERROR' | 'CANCELED';
export interface SitePage {
    slug: string;
    title: string;
    category: SiteCategory;
    htmlContent: string;
    markdownSource: string;
    searchText: string;
}
export interface SearchIndexEntry {
    slug: string;
    title: string;
    category: SiteCategory;
    excerpt: string;
}
export interface BuildResult {
    pages: SitePage[];
    searchIndex: SearchIndexEntry[];
    outputPath: string;
    pageCount: number;
    builtAt: Date;
}
export interface DeploymentResult {
    deploymentId: string;
    url: string;
    previewUrl: string;
    state: DeploymentState;
    createdAt: Date;
}
export interface DeploymentStatus {
    deploymentId: string;
    state: DeploymentState;
    url?: string;
    errorMessage?: string;
    readyAt?: Date;
}
export interface DeploymentVerification {
    url: string;
    reachable: boolean;
    statusCode?: number;
    checkedAt: Date;
}
export interface WebsiteDeployerConfig {
    vercelToken: string;
    projectId: string;
    teamId?: string;
    notificationWebhookUrl?: string;
}
//# sourceMappingURL=deployer.d.ts.map