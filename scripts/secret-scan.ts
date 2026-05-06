import fs from 'fs';
import { execSync } from 'child_process';

import { scanTextForSecrets } from '../src/security/secret-scanner';

function getGitFileList(command: string, warningMessage: string): string[] {
  try {
    return execSync(command, { encoding: 'utf8' })
      .split(/\r?\n/)
      .map((line: string) => line.trim())
      .filter((line: string) => line.length > 0);
  } catch {
    console.warn(warningMessage);
    return [];
  }
}

function getTargetFiles(args: string[]): string[] {
  if (args.includes('--staged')) {
    return getGitFileList(
      'git diff --cached --name-only --diff-filter=ACM',
      'secret-scan: staged 파일 목록을 가져오지 못했습니다.'
    );
  }

  const explicitFiles = args.filter((arg) => !arg.startsWith('--'));
  if (explicitFiles.length > 0) {
    return explicitFiles;
  }

  return getGitFileList('git ls-files', 'secret-scan: 추적 중인 파일 목록을 가져오지 못했습니다.');
}

function isScannableFile(filePath: string): boolean {
  return !/node_modules|dist|package-lock\.json/i.test(filePath);
}

function main(): void {
  const targetFiles = getTargetFiles(process.argv.slice(2)).filter(isScannableFile);

  if (targetFiles.length === 0) {
    console.log('secret-scan: 검사할 파일이 없습니다.');
    return;
  }

  const findings = targetFiles.flatMap((filePath) => {
    try {
      const content = fs.readFileSync(filePath, 'utf8');
      return scanTextForSecrets(content).map((finding) => ({ filePath, ...finding }));
    } catch {
      return [];
    }
  });

  if (findings.length === 0) {
    console.log(`secret-scan: ${targetFiles.length}개 파일 검사, 민감정보 패턴 없음`);
    return;
  }

  console.error('secret-scan: 민감정보 패턴이 감지되었습니다.');
  for (const finding of findings) {
    console.error(`- ${finding.filePath} [${finding.type}] index=${finding.index}`);
  }

  process.exitCode = 1;
}

main();