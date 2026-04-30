import Anthropic from '@anthropic-ai/sdk';
import { Client as NotionClient } from '@notionhq/client';
import { Octokit } from '@octokit/rest';
import * as dotenv from 'dotenv';

dotenv.config();

type CheckStatus = 'pass' | 'fail' | 'skip';

interface CheckResult {
  name: string;
  status: CheckStatus;
  detail: string;
}

const PLACEHOLDER_PATTERNS = [
  /^$/,
  /^your_/i,
  /^YOUR_/,
  /_here$/i,
  /^sk-ant-api03-\.\.\.$/,
  /^ghp_\.\.\.$/,
  /^github_pat_\.\.\.$/,
  /^secret_\.\.\.$/,
];

function isUsableSecret(value: string | undefined): value is string {
  if (!value) return false;
  const trimmed = value.trim().replace(/^['"]|['"]$/g, '');
  return !PLACEHOLDER_PATTERNS.some((pattern) => pattern.test(trimmed));
}

function readEnv(name: string): string | undefined {
  const value = process.env[name];
  if (!isUsableSecret(value)) return undefined;
  return value.trim().replace(/^['"]|['"]$/g, '');
}

function formatError(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  return String(error);
}

async function checkClaude(): Promise<CheckResult> {
  const apiKey = readEnv('CLAUDE_API_KEY') ?? readEnv('ANTHROPIC_API_KEY');
  if (!apiKey) {
    return {
      name: 'Claude',
      status: 'skip',
      detail: 'CLAUDE_API_KEY or ANTHROPIC_API_KEY is not set.',
    };
  }

  try {
    const client = new Anthropic({ apiKey });
    const response = await client.messages.create({
      model: process.env.CLAUDE_MODEL ?? 'claude-sonnet-4-6',
      max_tokens: 32,
      messages: [{ role: 'user', content: 'Reply with: ok' }],
    });

    const text = response.content
      .map((block) => (block.type === 'text' ? block.text : ''))
      .join('')
      .trim();

    return {
      name: 'Claude',
      status: 'pass',
      detail: `message call succeeded; response="${text.slice(0, 80)}"`,
    };
  } catch (error) {
    return { name: 'Claude', status: 'fail', detail: formatError(error) };
  }
}

async function checkGitHub(): Promise<CheckResult> {
  const token = readEnv('GITHUB_TOKEN') ?? readEnv('GITHUB_API_KEY');
  if (!token) {
    return {
      name: 'GitHub',
      status: 'skip',
      detail: 'GITHUB_TOKEN or GITHUB_API_KEY is not set.',
    };
  }

  try {
    const octokit = new Octokit({ auth: token });
    const { data: viewer } = await octokit.rest.users.getAuthenticated();

    const owner = process.env.GITHUB_OWNER;
    const repo = process.env.GITHUB_REPO;
    if (owner && repo) {
      const { data: repoInfo } = await octokit.rest.repos.get({ owner, repo });
      return {
        name: 'GitHub',
        status: 'pass',
        detail: `authenticated as ${viewer.login}; repo ${repoInfo.full_name} reachable`,
      };
    }

    return {
      name: 'GitHub',
      status: 'pass',
      detail: `authenticated as ${viewer.login}; set GITHUB_OWNER and GITHUB_REPO for repo reachability check`,
    };
  } catch (error) {
    return { name: 'GitHub', status: 'fail', detail: formatError(error) };
  }
}

async function checkNotion(): Promise<CheckResult> {
  const auth = readEnv('NOTION_TOKEN');
  if (!auth) {
    return {
      name: 'Notion',
      status: 'skip',
      detail: 'NOTION_TOKEN is not set.',
    };
  }

  try {
    const notion = new NotionClient({ auth });
    const me = await notion.users.me({});
    return {
      name: 'Notion',
      status: 'pass',
      detail: `integration reachable; bot/user id=${me.id}`,
    };
  } catch (error) {
    return { name: 'Notion', status: 'fail', detail: formatError(error) };
  }
}

async function checkVercel(): Promise<CheckResult> {
  const token = readEnv('VERCEL_TOKEN');
  if (!token) {
    return {
      name: 'Vercel',
      status: 'skip',
      detail: 'VERCEL_TOKEN is not set.',
    };
  }

  try {
    const response = await fetch('https://api.vercel.com/v2/user', {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });

    const body = (await response.json()) as {
      user?: { username?: string; email?: string; id?: string };
      error?: { message?: string };
    };

    if (!response.ok) {
      throw new Error(body.error?.message ?? `HTTP ${response.status}`);
    }

    const userLabel = body.user?.username ?? body.user?.email ?? body.user?.id ?? 'unknown user';
    return {
      name: 'Vercel',
      status: 'pass',
      detail: `authenticated as ${userLabel}`,
    };
  } catch (error) {
    return { name: 'Vercel', status: 'fail', detail: formatError(error) };
  }
}

async function main(): Promise<void> {
  const checks = await Promise.all([checkClaude(), checkGitHub(), checkNotion(), checkVercel()]);

  console.log('\nAPI smoke test results');
  console.log('='.repeat(24));

  for (const check of checks) {
    const label = check.status.toUpperCase().padEnd(4, ' ');
    console.log(`[${label}] ${check.name}: ${check.detail}`);
  }

  const failed = checks.filter((check) => check.status === 'fail');
  if (failed.length > 0) {
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error(formatError(error));
  process.exitCode = 1;
});
