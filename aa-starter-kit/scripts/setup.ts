#!/usr/bin/env ts-node
/**
 * AA 스타터 키트 초기 설정 스크립트
 * 실행: npx ts-node scripts/setup.ts
 */

import fs from 'fs';
import path from 'path';

const VAULT_FOLDERS = ['Mission', 'Meetings', 'Skills', 'Insights', 'Analysis', 'Archive'];
const currentFilePath = fs.realpathSync(process.argv[1]);
const currentDirPath = path.dirname(currentFilePath);
const TEMPLATE_DIR = path.join(currentDirPath, '..', 'templates');

function ensureDir(dirPath: string): void {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
    console.log(`  ✓ 폴더 생성: ${dirPath}`);
  } else {
    console.log(`  - 이미 존재: ${dirPath}`);
  }
}

function copyTemplates(vaultRoot: string): void {
  for (const folder of VAULT_FOLDERS) {
    const src = path.join(TEMPLATE_DIR, folder);
    const dest = path.join(vaultRoot, folder);
    ensureDir(dest);

    if (fs.existsSync(src)) {
      const files = fs.readdirSync(src);
      for (const file of files) {
        const srcFile = path.join(src, file);
        const destFile = path.join(dest, file);
        if (!fs.existsSync(destFile)) {
          fs.copyFileSync(srcFile, destFile);
          console.log(`  ✓ 템플릿 복사: ${folder}/${file}`);
        }
      }
    }
  }
}

function copyEnvExample(projectRoot: string): void {
  const src = path.join(currentDirPath, '..', '.env.example');
  const dest = path.join(projectRoot, '.env');
  if (!fs.existsSync(dest)) {
    fs.copyFileSync(src, dest);
    console.log(`  ✓ .env 파일 생성 (.env.example 복사)`);
    console.log(`  ⚠ .env 파일을 열어 API 키를 입력해주세요.`);
  } else {
    console.log(`  - .env 이미 존재 (건너뜀)`);
  }
}

function createConfigFile(projectRoot: string): void {
  const configPath = path.join(projectRoot, 'selfish-club.config.json');
  if (!fs.existsSync(configPath)) {
    const config = {
      vault: {
        rootPath: './vault',
        folders: VAULT_FOLDERS,
      },
      github: { owner: '', repo: '', branch: 'main' },
      logLevel: 'info',
    };
    fs.writeFileSync(configPath, JSON.stringify(config, null, 2), 'utf-8');
    console.log(`  ✓ selfish-club.config.json 생성`);
  } else {
    console.log(`  - selfish-club.config.json 이미 존재 (건너뜀)`);
  }
}

function main(): void {
  const projectRoot = process.cwd();
  const vaultRoot = path.join(projectRoot, 'vault');

  console.log('\n🚀 AA 스타터 키트 초기 설정을 시작합니다.\n');

  console.log('📁 볼트 폴더 생성 중...');
  ensureDir(vaultRoot);
  copyTemplates(vaultRoot);

  console.log('\n⚙️  환경 설정 파일 초기화 중...');
  copyEnvExample(projectRoot);
  createConfigFile(projectRoot);

  console.log('\n✅ 초기 설정 완료!');
  console.log('\n다음 단계:');
  console.log('  1. .env 파일을 열어 API 키를 입력하세요.');
  console.log('  2. selfish-club.config.json에서 GitHub 정보를 설정하세요.');
  console.log('  3. 저장소 루트에서 npm install 후 npm run dev -- status 로 확인하세요.');
  console.log('     참고: vault/ 폴더 안이 아니라 프로젝트 루트에서 실행해야 합니다.');
  console.log('\n자세한 내용은 docs/quickstart.md를 참고하세요.\n');
}

main();
