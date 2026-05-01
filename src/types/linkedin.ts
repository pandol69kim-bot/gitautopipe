export type LinkedInTone = 'professional' | 'casual' | 'thought-leader';

export type LinkedInPostTemplate = 'lesson' | 'project-update' | 'weekly-story';

export interface MissionContent {
  title: string;
  body: string;
  author: string;
  date: Date;
  weekNumber?: number;
  keywords?: string[];
}

export interface LinkedInPost {
  headline: string;
  body: string;
  hashtags: string[];
  callToAction?: string;
  suggestedMedia?: string[];
}

export interface FormattedPost {
  content: string;
  charCount: number;
  isWithinLimit: boolean;
  hashtags: string[];
  fileName: string;
}

export interface LinkedInConfig {
  apiKey: string;
  model?: string;
  maxTokens?: number;
  maxRetries?: number;
  retryDelayMs?: number;
}

export const LINKEDIN_CHAR_LIMIT = 3000;
