import * as fs from 'fs';
import * as path from 'path';
import matter from 'gray-matter';
import { VaultScanner } from '../core/vault-scanner';
import { NotionMCPConnector } from './notion';
import type { NotionPage } from '../types/notion';
import type { MarkdownFile } from '../types/vault';

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

export async function syncNotionBidirectional(params: {
  connector: NotionMCPConnector;
  databaseId: string;
  paths: NotionSyncPaths;
}): Promise<NotionSyncSummary> {
  const scanner = new VaultScanner({
    basePath: params.paths.vaultBasePath,
    folders: {
      mission: process.env['VAULT_FOLDER_MISSION'] ?? 'mission',
      meetings: params.paths.meetingsFolder ?? 'meetings',
      skillInsight: process.env['VAULT_FOLDER_SKILL_INSIGHT'] ?? 'skillInsight',
      sharing: process.env['VAULT_FOLDER_SHARING'] ?? 'sharing',
      analysis: process.env['VAULT_FOLDER_ANALYSIS'] ?? 'analysis',
      linkedin: process.env['VAULT_FOLDER_LINKEDIN'] ?? 'linkedin',
    },
  });

  const meetingsPath = params.paths.meetingsPath ?? scanner.getFullPath('meetings');
  fs.mkdirSync(meetingsPath, { recursive: true });

  const [remotePages, localFiles] = await Promise.all([
    params.connector.fetchMeetings(params.databaseId),
    scanner.scanFolder('meetings'),
  ]);

  const localMeetings = localFiles.map((file) => ({
    file,
    notionId: readNotionId(file.filePath),
  }));

  const localByNotionId = new Map(
    localMeetings
      .filter((meeting) => typeof meeting.notionId === 'string' && meeting.notionId.length > 0)
      .map((meeting) => [meeting.notionId!, meeting])
  );

  const remoteById = new Map(remotePages.map((page) => [page.id, page]));
  const summary: NotionSyncSummary = {
    remoteFetched: remotePages.length,
    downloadedCreated: 0,
    downloadedUpdated: 0,
    uploadedCreated: 0,
    uploadedUpdated: 0,
    skipped: 0,
  };

  for (const remotePage of remotePages) {
    const localMeeting = localByNotionId.get(remotePage.id);
    if (!localMeeting) {
      const targetPath = buildRemoteTargetPath(meetingsPath, remotePage, localFiles);
      await params.connector.syncToObsidian(remotePage, targetPath);
      summary.downloadedCreated += 1;
      continue;
    }

    if (remotePage.lastEditedAt > localMeeting.file.modifiedAt) {
      await params.connector.syncToObsidian(remotePage, localMeeting.file.filePath);
      summary.downloadedUpdated += 1;
      continue;
    }

    if (localMeeting.file.modifiedAt > remotePage.lastEditedAt) {
      const result = await params.connector.syncFromObsidian(localMeeting.file, params.databaseId);
      if (result.action === 'created') {
        summary.uploadedCreated += 1;
      } else {
        summary.uploadedUpdated += 1;
      }
      continue;
    }

    summary.skipped += 1;
  }

  for (const localMeeting of localMeetings) {
    if (localMeeting.notionId && remoteById.has(localMeeting.notionId)) {
      continue;
    }

    const result = await params.connector.syncFromObsidian(localMeeting.file, params.databaseId);
    if (result.action === 'created') {
      summary.uploadedCreated += 1;
    } else {
      summary.uploadedUpdated += 1;
    }
  }

  return summary;
}

function readNotionId(filePath: string): string | undefined {
  const raw = fs.readFileSync(filePath, 'utf-8') as string;
  const parsed = matter(raw);
  const notionId = parsed.data['notionId'];
  return typeof notionId === 'string' && notionId.trim().length > 0 ? notionId.trim() : undefined;
}

function buildRemoteTargetPath(
  meetingsPath: string,
  remotePage: NotionPage,
  existingFiles: MarkdownFile[]
): string {
  const safeName = sanitizeFileName(remotePage.title || remotePage.id);
  const basePath = path.join(meetingsPath, `${safeName}.md`);
  const normalizedBasePath = path.normalize(basePath);

  const collision = existingFiles.some((file) => path.normalize(file.filePath) === normalizedBasePath);
  if (!collision) {
    return basePath;
  }

  return path.join(meetingsPath, `${safeName}-${remotePage.id}.md`);
}

function sanitizeFileName(value: string): string {
  return value.replace(/[/\\:*?"<>|]/g, '_').trim() || 'untitled';
}
