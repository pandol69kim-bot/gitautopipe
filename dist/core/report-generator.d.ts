import type { AnalysisEngine } from '../types/analysis';
import type { WeeklyData, AnalysisHistory } from '../types/claude';
import type { Report, ReportType, ReportGeneratorConfig, MemberContribution } from '../types/report';
export declare class ReportGenerator {
    private readonly analyzer;
    private readonly config;
    constructor(analyzer: AnalysisEngine, config: ReportGeneratorConfig);
    generateWeeklyReport(weeklyData: WeeklyData): Promise<Report>;
    generateMemberReport(memberId: string, contributions: MemberContribution[]): Promise<Report>;
    generateTeamOverview(history: AnalysisHistory[]): Promise<Report>;
    saveReport(report: Report, outputPath: string): Promise<void>;
    generateFileName(type: ReportType, weekNumber?: number, memberId?: string): string;
    private buildMarkdown;
    private buildFileContent;
}
//# sourceMappingURL=report-generator.d.ts.map