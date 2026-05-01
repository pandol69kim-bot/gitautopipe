import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as fs from 'fs';
import { ReportGenerator } from './report-generator';
import type { WeeklyData, AnalysisHistory } from '../types/claude';
import type { MemberContribution } from '../types/report';

vi.mock('fs');

const mockAnalyzer = {
  generateSummary: vi.fn(),
  extractKeywords: vi.fn(),
  identifyTrends: vi.fn(),
  analyzeContent: vi.fn(),
};

const sampleWeeklyData: WeeklyData = {
  weekNumber: 3,
  memberCount: 5,
  documents: [
    { content: '리액트 훅 학습 내용입니다.', title: 'React Hooks', author: 'alice' },
    { content: 'TypeScript 제네릭 정리입니다.', title: 'TS Generics', author: 'bob' },
  ],
};

const sampleSummary = {
  weekNumber: 3,
  highlights: ['리액트 훅 학습', 'TypeScript 심화'],
  summary: '### Week03 하이라이트\n- 리액트 훅\n- TypeScript',
  participationRate: 40,
  topKeywords: ['React', 'TypeScript', 'Hooks'],
  markdownOutput: '### Week03 하이라이트\n- 리액트 훅',
};

const sampleKeywords = [
  { keyword: 'React', frequency: 5, relevance: 0.9 },
  { keyword: 'TypeScript', frequency: 4, relevance: 0.8 },
  { keyword: 'Hooks', frequency: 3, relevance: 0.7 },
];

const sampleTrends = {
  risingKeywords: ['React', 'Next.js'],
  decliningKeywords: ['jQuery'],
  consistentThemes: ['JavaScript'],
  weeklyGrowth: 15,
  markdownOutput: '### 상승 트렌드\n- React\n- Next.js',
};

describe('ReportGenerator', () => {
  let generator: ReportGenerator;

  beforeEach(() => {
    vi.clearAllMocks();
    mockAnalyzer.generateSummary.mockResolvedValue(sampleSummary);
    mockAnalyzer.extractKeywords.mockResolvedValue(sampleKeywords);
    mockAnalyzer.identifyTrends.mockResolvedValue(sampleTrends);
    vi.mocked(fs.mkdirSync).mockReturnValue(undefined);
    vi.mocked(fs.writeFileSync).mockReturnValue(undefined);
    generator = new ReportGenerator(mockAnalyzer as never, { outputDir: '/reports' });
  });

  // ── Subtask 1: 타입 구조 검증 ──────────────────────────────────────

  describe('generateWeeklyReport', () => {
    it('Report 인터페이스 구조를 갖춘 객체를 반환한다', async () => {
      const report = await generator.generateWeeklyReport(sampleWeeklyData);

      expect(report).toMatchObject({
        title: expect.stringContaining('Week03'),
        type: 'weekly',
        generatedAt: expect.any(Date),
        sections: expect.any(Array),
        metadata: expect.any(Object),
        markdownOutput: expect.any(String),
      });
    });

    it('highlights, keywords, trends 섹션을 포함한다', async () => {
      const report = await generator.generateWeeklyReport(sampleWeeklyData);
      const sectionTypes = report.sections.map((s) => s.type);

      expect(sectionTypes).toContain('highlights');
      expect(sectionTypes).toContain('keywords');
      expect(sectionTypes).toContain('trends');
    });

    it('metadata에 weekNumber와 topKeywords가 포함된다', async () => {
      const report = await generator.generateWeeklyReport(sampleWeeklyData);

      expect(report.metadata.weekNumber).toBe(3);
      expect(report.metadata.topKeywords).toEqual(['React', 'TypeScript', 'Hooks']);
      expect(report.metadata.totalDocuments).toBe(2);
    });

    it('participationRate가 metadata에 포함된다', async () => {
      const report = await generator.generateWeeklyReport(sampleWeeklyData);
      expect(report.metadata.participationRate).toBe(40);
    });

    it('ClaudeAnalyzer.generateSummary를 호출한다', async () => {
      await generator.generateWeeklyReport(sampleWeeklyData);
      expect(mockAnalyzer.generateSummary).toHaveBeenCalledWith(sampleWeeklyData);
    });

    it('markdownOutput이 비어있지 않다', async () => {
      const report = await generator.generateWeeklyReport(sampleWeeklyData);
      expect(report.markdownOutput.length).toBeGreaterThan(0);
    });
  });

  // ── Subtask 4: 멤버별 보고서 ──────────────────────────────────────

  describe('generateMemberReport', () => {
    const memberContributions: MemberContribution[] = [
      {
        memberId: 'alice',
        documentCount: 3,
        keywords: sampleKeywords,
        summary: 'alice의 학습 요약',
      },
      {
        memberId: 'bob',
        documentCount: 2,
        keywords: [{ keyword: 'Vue', frequency: 2, relevance: 0.6 }],
        summary: 'bob의 학습 요약',
      },
    ];

    it('type이 member인 Report를 반환한다', async () => {
      const report = await generator.generateMemberReport('alice', memberContributions);
      expect(report.type).toBe('member');
    });

    it('title에 memberId가 포함된다', async () => {
      const report = await generator.generateMemberReport('alice', memberContributions);
      expect(report.title).toContain('alice');
    });

    it('metadata.memberId가 설정된다', async () => {
      const report = await generator.generateMemberReport('alice', memberContributions);
      expect(report.metadata.memberId).toBe('alice');
    });

    it('해당 멤버의 기여만 포함한다', async () => {
      const report = await generator.generateMemberReport('alice', memberContributions);
      expect(report.markdownOutput).toContain('alice');
      expect(report.metadata.totalDocuments).toBe(3);
    });
  });

  // ── Subtask 5: 팀 전체 개요 ──────────────────────────────────────

  describe('generateTeamOverview', () => {
    const history: AnalysisHistory[] = [
      { weekNumber: 1, keywords: ['JS', 'React'], summary: 'week1', participationRate: 80, analyzedAt: new Date() },
      { weekNumber: 2, keywords: ['TS', 'Node'], summary: 'week2', participationRate: 90, analyzedAt: new Date() },
      { weekNumber: 3, keywords: ['React', 'Next'], summary: 'week3', participationRate: 70, analyzedAt: new Date() },
    ];

    it('type이 team인 Report를 반환한다', async () => {
      const report = await generator.generateTeamOverview(history);
      expect(report.type).toBe('team');
    });

    it('team-overview 섹션을 포함한다', async () => {
      const report = await generator.generateTeamOverview(history);
      const sectionTypes = report.sections.map((s) => s.type);
      expect(sectionTypes).toContain('team-overview');
    });

    it('trends 섹션을 포함한다', async () => {
      const report = await generator.generateTeamOverview(history);
      const sectionTypes = report.sections.map((s) => s.type);
      expect(sectionTypes).toContain('trends');
    });

    it('ClaudeAnalyzer.identifyTrends를 history로 호출한다', async () => {
      await generator.generateTeamOverview(history);
      expect(mockAnalyzer.identifyTrends).toHaveBeenCalledWith(history);
    });
  });

  // ── Subtask 6: 파일 저장 (Frontmatter + 파일명) ───────────────────

  describe('saveReport', () => {
    it('출력 디렉토리가 없으면 mkdirSync로 생성한다', async () => {
      const report = await generator.generateWeeklyReport(sampleWeeklyData);
      await generator.saveReport(report, '/reports/week03.md');

      expect(fs.mkdirSync).toHaveBeenCalledWith('/reports', { recursive: true });
    });

    it('writeFileSync로 파일을 저장한다', async () => {
      const report = await generator.generateWeeklyReport(sampleWeeklyData);
      await generator.saveReport(report, '/reports/week03.md');

      expect(fs.writeFileSync).toHaveBeenCalledWith(
        '/reports/week03.md',
        expect.any(String),
        'utf-8'
      );
    });

    it('저장된 내용에 YAML frontmatter가 포함된다', async () => {
      const report = await generator.generateWeeklyReport(sampleWeeklyData);
      await generator.saveReport(report, '/reports/week03.md');

      const writtenContent = vi.mocked(fs.writeFileSync).mock.calls[0][1] as string;
      expect(writtenContent).toMatch(/^---\n/);
      expect(writtenContent).toContain('title:');
      expect(writtenContent).toContain('date:');
      expect(writtenContent).toContain('tags:');
    });
  });

  // ── generateFileName 헬퍼 ─────────────────────────────────────────

  describe('generateFileName', () => {
    it('weekly 보고서에 YYYY-WW_weekly_report.md 형식 파일명을 반환한다', () => {
      const name = generator.generateFileName('weekly', 3);
      expect(name).toMatch(/^\d{4}-03_weekly_report\.md$/);
    });

    it('member 보고서에 memberId가 포함된 파일명을 반환한다', () => {
      const name = generator.generateFileName('member', undefined, 'alice');
      expect(name).toContain('alice');
      expect(name).toContain('member_report');
    });

    it('team 보고서에 team_overview.md 형식 파일명을 반환한다', () => {
      const name = generator.generateFileName('team');
      expect(name).toContain('team_overview');
    });
  });
});
