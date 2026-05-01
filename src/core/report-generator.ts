import * as fs from 'fs';
import * as path from 'path';
import type { ClaudeAnalyzer } from '../integrations/claude';
import type { WeeklyData, AnalysisHistory } from '../types/claude';
import type {
  Report,
  ReportSection,
  ReportType,
  ReportGeneratorConfig,
  MemberContribution,
} from '../types/report';

// ClaudeAnalyzer의 공개 인터페이스만 의존
type Analyzer = Pick<
  ClaudeAnalyzer,
  'generateSummary' | 'extractKeywords' | 'identifyTrends'
>;

export class ReportGenerator {
  private readonly analyzer: Analyzer;
  private readonly config: ReportGeneratorConfig;

  constructor(analyzer: Analyzer, config: ReportGeneratorConfig) {
    this.analyzer = analyzer;
    this.config = config;
  }

  // ── Subtask 3: 주차별 보고서 ──────────────────────────────────────

  async generateWeeklyReport(weeklyData: WeeklyData): Promise<Report> {
    const [summary, keywords, trends] = await Promise.all([
      this.analyzer.generateSummary(weeklyData),
      this.analyzer.extractKeywords(weeklyData.documents),
      this.analyzer.identifyTrends([
        {
          weekNumber: weeklyData.weekNumber,
          keywords: [],
          summary: '',
          analyzedAt: new Date(),
        },
      ]),
    ]);

    const weekLabel = `Week${String(weeklyData.weekNumber).padStart(2, '0')}`;

    const sections: ReportSection[] = [
      {
        type: 'highlights',
        title: `${weekLabel} 하이라이트`,
        content: summary.highlights.map((h) => `- ${h}`).join('\n'),
      },
      {
        type: 'keywords',
        title: '핵심 키워드',
        content: keywords
          .slice(0, 10)
          .map((k) => `- **${k.keyword}** (빈도: ${k.frequency}, 관련성: ${k.relevance.toFixed(2)})`)
          .join('\n'),
      },
      {
        type: 'trends',
        title: '트렌드 분석',
        content: trends.markdownOutput,
      },
      {
        type: 'summary',
        title: '전체 요약',
        content: summary.summary,
      },
    ];

    const markdownOutput = this.buildMarkdown(`${weekLabel} 활동 보고서`, sections);

    return {
      title: `${weekLabel} 활동 보고서`,
      type: 'weekly',
      generatedAt: new Date(),
      sections,
      metadata: {
        weekNumber: weeklyData.weekNumber,
        totalDocuments: weeklyData.documents.length,
        participationRate: summary.participationRate,
        topKeywords: summary.topKeywords,
        tags: ['weekly', `week${String(weeklyData.weekNumber).padStart(2, '0')}`, 'selfishy'],
      },
      markdownOutput,
    };
  }

  // ── Subtask 4: 멤버별 보고서 ──────────────────────────────────────

  async generateMemberReport(
    memberId: string,
    contributions: MemberContribution[]
  ): Promise<Report> {
    const member = contributions.find((c) => c.memberId === memberId);
    const topKeywords = (member?.keywords ?? []).slice(0, 5).map((k) => k.keyword);

    const sections: ReportSection[] = [
      {
        type: 'member-contributions',
        title: `${memberId} 기여 현황`,
        content: [
          `- 제출 문서 수: ${member?.documentCount ?? 0}개`,
          `- 핵심 키워드: ${topKeywords.join(', ')}`,
          '',
          '### 학습 요약',
          member?.summary ?? '요약 없음',
        ].join('\n'),
      },
      {
        type: 'keywords',
        title: '핵심 키워드 분석',
        content: (member?.keywords ?? [])
          .map((k) => `- **${k.keyword}** (빈도: ${k.frequency})`)
          .join('\n'),
      },
    ];

    const markdownOutput = this.buildMarkdown(`${memberId} 멤버 보고서`, sections);

    return {
      title: `${memberId} 멤버 보고서`,
      type: 'member',
      generatedAt: new Date(),
      sections,
      metadata: {
        memberId,
        totalDocuments: member?.documentCount ?? 0,
        topKeywords,
        tags: ['member', memberId, 'selfishy'],
      },
      markdownOutput,
    };
  }

  // ── Subtask 5: 팀 전체 개요 ──────────────────────────────────────

  async generateTeamOverview(history: AnalysisHistory[]): Promise<Report> {
    const trends = await this.analyzer.identifyTrends(history);

    const avgParticipation =
      history.reduce((sum, h) => sum + (h.participationRate ?? 0), 0) / history.length;

    const allKeywords = history.flatMap((h) => h.keywords);
    const keywordFreq = new Map<string, number>();
    for (const kw of allKeywords) {
      keywordFreq.set(kw, (keywordFreq.get(kw) ?? 0) + 1);
    }
    const topKeywords = [...keywordFreq.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([kw]) => kw);

    const sections: ReportSection[] = [
      {
        type: 'team-overview',
        title: '팀 전체 현황',
        content: [
          `- 분석 기간: ${history.length}주`,
          `- 평균 참여율: ${avgParticipation.toFixed(1)}%`,
          `- 누적 트렌드 키워드: ${topKeywords.slice(0, 5).join(', ')}`,
        ].join('\n'),
      },
      {
        type: 'trends',
        title: '트렌드 분석',
        content: trends.markdownOutput,
      },
    ];

    const markdownOutput = this.buildMarkdown('셀피시 클럽 팀 전체 개요', sections);

    return {
      title: '셀피시 클럽 팀 전체 개요',
      type: 'team',
      generatedAt: new Date(),
      sections,
      metadata: {
        totalDocuments: history.length,
        topKeywords,
        tags: ['team', 'overview', 'selfishy'],
      },
      markdownOutput,
    };
  }

  // ── Subtask 6: frontmatter 자동 생성 및 파일 저장 ─────────────────

  async saveReport(report: Report, outputPath: string): Promise<void> {
    const dir = path.dirname(outputPath);
    fs.mkdirSync(dir, { recursive: true });

    const content = this.buildFileContent(report);
    fs.writeFileSync(outputPath, content, 'utf-8');
  }

  // ── 파일명 생성 헬퍼 ──────────────────────────────────────────────

  generateFileName(type: ReportType, weekNumber?: number, memberId?: string): string {
    const year = new Date().getFullYear();

    if (type === 'weekly' && weekNumber !== undefined) {
      const wk = String(weekNumber).padStart(2, '0');
      return `${year}-${wk}_weekly_report.md`;
    }
    if (type === 'member' && memberId) {
      return `${year}_member_report_${memberId}.md`;
    }
    return `${year}_team_overview.md`;
  }

  // ── 내부 헬퍼 ────────────────────────────────────────────────────

  private buildMarkdown(title: string, sections: ReportSection[]): string {
    const parts = [`# ${title}`, ''];
    for (const section of sections) {
      parts.push(`## ${section.title}`, '', section.content, '');
    }
    return parts.join('\n');
  }

  private buildFileContent(report: Report): string {
    const { metadata, title, generatedAt } = report;
    const dateStr = generatedAt.toISOString().split('T')[0];
    const tagsYaml = metadata.tags.map((t) => `  - ${t}`).join('\n');
    const keywordsYaml = metadata.topKeywords.map((k) => `  - ${k}`).join('\n');

    const weekLine =
      metadata.weekNumber !== undefined ? `week: ${metadata.weekNumber}\n` : '';
    const memberLine = metadata.memberId ? `member: ${metadata.memberId}\n` : '';

    const frontmatter = [
      '---',
      `title: "${title}"`,
      `date: ${dateStr}`,
      `tags:\n${tagsYaml}`,
      `keywords:\n${keywordsYaml}`,
      weekLine.trimEnd(),
      memberLine.trimEnd(),
      '---',
    ]
      .filter((line) => line !== '')
      .join('\n');

    return `${frontmatter}\n\n${report.markdownOutput}`;
  }
}
