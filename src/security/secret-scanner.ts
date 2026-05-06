import type { SecretScanFinding } from '../types/security';

const SECRET_PATTERNS: Array<{ type: string; pattern: RegExp }> = [
  { type: 'github-token', pattern: /gh[pousr]_[A-Za-z0-9_]{30,255}|github_pat_[A-Za-z0-9_]{20,255}/g },
  { type: 'anthropic-key', pattern: /sk-ant-[A-Za-z0-9_-]{20,255}/g },
  { type: 'notion-token', pattern: /(?:secret_|ntn_)[A-Za-z0-9_-]{20,255}/g },
];

export function scanTextForSecrets(text: string): SecretScanFinding[] {
  const findings: SecretScanFinding[] = [];

  for (const entry of SECRET_PATTERNS) {
    for (const match of text.matchAll(entry.pattern)) {
      findings.push({
        type: entry.type,
        match: match[0],
        index: match.index ?? 0,
      });
    }
  }

  return findings.sort((left, right) => left.index - right.index);
}