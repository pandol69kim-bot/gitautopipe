import { Client } from '@notionhq/client';
import * as dotenv from 'dotenv';

dotenv.config();

interface NotionApiErrorLike {
  code?: string;
  message?: string;
  request_id?: string;
  additional_data?: {
    integration_id?: string;
  };
}

const PLACEHOLDER_PATTERNS = [/^$/, /^your_/i, /^YOUR_/, /_here$/i];

interface RetrievedDatabaseLike {
  id: string;
  title?: Array<{ plain_text?: string }>;
  data_sources?: Array<{ id: string }>;
}

function readRequiredEnv(name: string): string {
  const rawValue = process.env[name]?.trim().replace(/^['"]|['"]$/g, '');
  if (!rawValue || PLACEHOLDER_PATTERNS.some((pattern) => pattern.test(rawValue))) {
    throw new Error(`${name} 환경변수가 필요합니다.`);
  }
  return rawValue;
}

function normalizeNotionId(value: string): string {
  const trimmed = value.trim();
  const urlMatch = trimmed.match(/([0-9a-fA-F]{32}|[0-9a-fA-F-]{36})(?:\?|$)/);
  const rawId = urlMatch?.[1] ?? trimmed;
  const compact = rawId.replace(/-/g, '');

  if (/^[0-9a-fA-F]{32}$/.test(compact)) {
    return `${compact.slice(0, 8)}-${compact.slice(8, 12)}-${compact.slice(12, 16)}-${compact.slice(16, 20)}-${compact.slice(20)}`.toLowerCase();
  }

  return rawId;
}

function formatUnknownError(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  return String(error);
}

function formatNotionAccessError(error: unknown, databaseId: string): string {
  const notionError = error as NotionApiErrorLike;
  if (notionError?.code !== 'object_not_found') {
    return formatUnknownError(error);
  }

  const lines = [
    `Notion 데이터베이스에 접근할 수 없습니다: ${databaseId}`,
    '확인 사항:',
    '1. 대상 데이터베이스 또는 상위 페이지를 integration "gitautopipe"와 공유했는지 확인',
    '2. NOTION_DATABASE_ID가 실제 대상 데이터베이스 ID 또는 URL과 일치하는지 확인',
  ];

  if (notionError.additional_data?.integration_id) {
    lines.push(`integration_id=${notionError.additional_data.integration_id}`);
  }
  if (notionError.request_id) {
    lines.push(`request_id=${notionError.request_id}`);
  }

  return lines.join('\n');
}

async function main(): Promise<void> {
  const token = readRequiredEnv('NOTION_TOKEN');
  const databaseId = normalizeNotionId(readRequiredEnv('NOTION_DATABASE_ID'));
  const notion = new Client({ auth: token });

  try {
    const database = (await notion.databases.retrieve({
      database_id: databaseId,
    })) as RetrievedDatabaseLike;
    logDatabaseSuccess(database);
  } catch (error) {
    const notionError = error as NotionApiErrorLike;
    if (notionError?.code !== 'object_not_found') {
      console.error(formatNotionAccessError(error, databaseId));
      process.exitCode = 1;
      return;
    }

    try {
      await notion.dataSources.query({ data_source_id: databaseId, page_size: 1 });
      console.log('Notion access check passed');
      console.log(`data_source_id=${databaseId}`);
      console.log('type=data_source');
      return;
    } catch (dataSourceError) {
      console.error(formatNotionAccessError(dataSourceError, databaseId));
      process.exitCode = 1;
      return;
    }
  }
}

function logDatabaseSuccess(database: RetrievedDatabaseLike): void {
  const dataSourceCount = Array.isArray(database.data_sources) ? database.data_sources.length : 0;
  const title = Array.isArray(database.title)
    ? database.title.map((item) => item.plain_text ?? '').join('')
    : '';

  console.log('Notion access check passed');
  console.log(`database_id=${database.id}`);
  console.log(`title=${title || '(untitled)'}`);
  console.log(`data_sources=${dataSourceCount}`);
  console.log('type=database');
}

main().catch((error) => {
  console.error(formatUnknownError(error));
  process.exitCode = 1;
});