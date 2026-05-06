import { NotionMCPConnector } from './notion';
export interface NotionSyncPaths {
    vaultBasePath: string;
    meetingsFolder?: string;
    meetingsPath?: string;
}
export interface NotionSyncSummary {
    remoteFetched: number;
    downloadedCreated: number;
    downloadedUpdated: number;
    uploadedCreated: number;
    uploadedUpdated: number;
    skipped: number;
}
export declare function syncNotionBidirectional(params: {
    connector: NotionMCPConnector;
    databaseId: string;
    paths: NotionSyncPaths;
}): Promise<NotionSyncSummary>;
//# sourceMappingURL=notion-sync.d.ts.map