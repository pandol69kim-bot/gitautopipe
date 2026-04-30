export type AnalysisType = 'mission' | 'meeting' | 'skill' | 'sharing' | 'linkedin' | 'analysis';

export interface Document {
  content: string;
  title?: string;
  date?: Date;
  author?: string;
  folderType?: string;
}

export interface WeeklyData {
  weekNumber: number;
  documents: Document[];
  memberCount?: number;
}

export interface AnalysisHistory {
  weekNumber: number;
  keywords: string[];
  summary: string;
  participationRate?: number;
  analyzedAt: Date;
}

export interface KeywordResult {
  keyword: string;
  frequency: number;
  relevance: number;
}

export interface WeeklySummary {
  weekNumber: number;
  highlights: string[];
  summary: string;
  participationRate?: number;
  topKeywords: string[];
  markdownOutput: string;
}

export interface TrendResult {
  risingKeywords: string[];
  decliningKeywords: string[];
  consistentThemes: string[];
  weeklyGrowth: number;
  markdownOutput: string;
}

export interface AnalysisResult {
  type: AnalysisType;
  content: string;
  keywords: KeywordResult[];
  markdownOutput: string;
  tokensUsed: number;
  analyzedAt: Date;
}

export interface ClaudeConfig {
  apiKey: string;
  model: string;
  maxTokens: number;
  maxRetries: number;
  retryDelayMs: number;
}

export interface ChunkOptions {
  maxChunkSize: number;
  overlap: number;
}
