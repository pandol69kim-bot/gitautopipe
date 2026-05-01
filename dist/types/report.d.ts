import type { KeywordResult } from './claude';
export type ReportType = 'weekly' | 'member' | 'team';
export type SectionType = 'highlights' | 'keywords' | 'member-contributions' | 'trends' | 'team-overview' | 'summary';
export interface ReportSection {
    type: SectionType;
    title: string;
    content: string;
}
export interface ReportMetadata {
    weekNumber?: number;
    memberId?: string;
    totalDocuments: number;
    participationRate?: number;
    topKeywords: string[];
    tags: string[];
}
export interface Report {
    title: string;
    type: ReportType;
    generatedAt: Date;
    sections: ReportSection[];
    metadata: ReportMetadata;
    markdownOutput: string;
}
export interface MemberContribution {
    memberId: string;
    documentCount: number;
    keywords: KeywordResult[];
    summary: string;
}
export interface ReportGeneratorConfig {
    outputDir: string;
    weekNumber?: number;
}
//# sourceMappingURL=report.d.ts.map