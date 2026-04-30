import { loadEnv } from './utils/env';

async function main(): Promise<void> {
  loadEnv();
  console.log('셀피시 클럽 AI 에이전트 시스템 시작');
}

main().catch(console.error);
