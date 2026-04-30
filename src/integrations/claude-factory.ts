import Anthropic from '@anthropic-ai/sdk';
import { ClaudeAnalyzer } from './claude';
import type { AnthropicClient } from './claude';
import type { ClaudeConfig } from '../types/claude';

export function createClaudeAnalyzer(
  config: Partial<ClaudeConfig> & { apiKey: string }
): ClaudeAnalyzer {
  const client = new Anthropic({ apiKey: config.apiKey }) as unknown as AnthropicClient;
  return new ClaudeAnalyzer(config, client);
}
