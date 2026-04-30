import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { VaultScanner } from './vault-scanner';
import type { VaultConfig } from '../types/vault';

function createTestVault(): string {
  const vaultPath = fs.mkdtempSync(path.join(os.tmpdir(), 'vault-test-'));

  const structure = {
    Mission: ['Week01/goals.md', 'Week01/review.md', 'Week02/goals.md'],
    Meetings: ['2024-01-15-standup.md'],
    'Skill-Insight': ['typescript-tips.md'],
    Sharing: ['blog-post.md'],
    Analysis: ['monthly-report.md'],
    LinkedIn: ['post-draft.md'],
  };

  for (const [folder, files] of Object.entries(structure)) {
    for (const file of files) {
      const fullPath = path.join(vaultPath, folder, file);
      fs.mkdirSync(path.dirname(fullPath), { recursive: true });
      fs.writeFileSync(
        fullPath,
        `---\ntitle: ${path.basename(file, '.md')}\ndate: 2024-01-15\nauthor: 테스트\ntags:\n  - test\nweek: 1\n---\n\n# 테스트 내용\n\n이것은 테스트 마크다운 파일입니다. 내용이 여기에 있습니다.`
      );
    }
  }

  return vaultPath;
}

function makeConfig(basePath: string): VaultConfig {
  return {
    basePath,
    folders: {
      mission: 'Mission',
      meetings: 'Meetings',
      skillInsight: 'Skill-Insight',
      sharing: 'Sharing',
      analysis: 'Analysis',
      linkedin: 'LinkedIn',
    },
  };
}

describe('VaultScanner', () => {
  let vaultPath: string;
  let scanner: VaultScanner;

  beforeEach(() => {
    vaultPath = createTestVault();
    scanner = new VaultScanner(makeConfig(vaultPath));
  });

  afterEach(() => {
    fs.rmSync(vaultPath, { recursive: true, force: true });
  });

  describe('생성자', () => {
    it('유효한 설정으로 인스턴스 생성', () => {
      expect(scanner).toBeInstanceOf(VaultScanner);
    });

    it('존재하지 않는 basePath로 생성 시 에러', () => {
      expect(
        () => new VaultScanner({ ...makeConfig(vaultPath), basePath: '/nonexistent/path' })
      ).toThrow('볼트 경로가 존재하지 않습니다');
    });

    it('빈 basePath로 생성 시 에러', () => {
      expect(() => new VaultScanner({ ...makeConfig(vaultPath), basePath: '' })).toThrow(
        'VaultConfig 검증 실패'
      );
    });
  });

  describe('scanFolder', () => {
    it('mission 폴더의 마크다운 파일 목록 반환', async () => {
      const files = await scanner.scanFolder('mission');
      expect(files).toHaveLength(3);
      expect(files.every((f) => f.folderType === 'mission')).toBe(true);
      expect(files.every((f) => f.fileName.endsWith('.md'))).toBe(true);
    });

    it('meetings 폴더 파일 반환', async () => {
      const files = await scanner.scanFolder('meetings');
      expect(files).toHaveLength(1);
      expect(files[0].fileName).toBe('2024-01-15-standup.md');
    });

    it('존재하지 않는 폴더 스캔 시 빈 배열 반환', async () => {
      const config = makeConfig(vaultPath);
      config.folders.sharing = 'NonExistentFolder';
      const s = new VaultScanner(config);
      const files = await s.scanFolder('sharing');
      expect(files).toEqual([]);
    });

    it('각 파일에 filePath, relativePath, createdAt, modifiedAt 포함', async () => {
      const files = await scanner.scanFolder('meetings');
      const file = files[0];
      expect(file.filePath).toBeTruthy();
      expect(file.relativePath).toBeTruthy();
      expect(file.createdAt).toBeInstanceOf(Date);
      expect(file.modifiedAt).toBeInstanceOf(Date);
    });
  });

  describe('parseMarkdown', () => {
    it('frontmatter와 content 정상 파싱', async () => {
      const files = await scanner.scanFolder('meetings');
      const parsed = await scanner.parseMarkdown(files[0].filePath);

      expect(parsed.frontmatter.title).toBe('2024-01-15-standup');
      expect(parsed.frontmatter.author).toBe('테스트');
      expect(parsed.frontmatter.tags).toContain('test');
      expect(parsed.content).toContain('테스트 마크다운');
    });

    it('excerpt 생성 (200자 초과 시 자름)', async () => {
      const longFile = path.join(vaultPath, 'Meetings', 'long.md');
      const longContent = '가'.repeat(300);
      fs.writeFileSync(longFile, `---\ntitle: long\n---\n\n${longContent}`);

      const parsed = await scanner.parseMarkdown(longFile);
      expect(parsed.excerpt).toBeDefined();
      expect(parsed.excerpt!.endsWith('…')).toBe(true);
      expect(parsed.excerpt!.length).toBeLessThanOrEqual(201);
    });

    it('frontmatter 없는 파일도 파싱', async () => {
      const bareFile = path.join(vaultPath, 'Meetings', 'bare.md');
      fs.writeFileSync(bareFile, '# 제목만 있는 파일\n\n내용');

      const parsed = await scanner.parseMarkdown(bareFile);
      expect(parsed.content).toContain('제목만 있는 파일');
      expect(parsed.frontmatter.title).toBeUndefined();
    });
  });

  describe('getWeekFolders', () => {
    it('주차별 폴더 오름차순 반환', async () => {
      const weeks = await scanner.getWeekFolders('mission');
      expect(weeks).toHaveLength(2);
      expect(weeks[0].weekNumber).toBe(1);
      expect(weeks[1].weekNumber).toBe(2);
    });

    it('각 주차 폴더에 파일 목록 포함', async () => {
      const weeks = await scanner.getWeekFolders('mission');
      expect(weeks[0].files).toHaveLength(2);
      expect(weeks[1].files).toHaveLength(1);
    });

    it('주차 폴더 없는 경우 빈 배열', async () => {
      const weeks = await scanner.getWeekFolders('meetings');
      expect(weeks).toEqual([]);
    });
  });

  describe('getFullPath', () => {
    it('폴더 타입으로 전체 경로 반환', () => {
      const fullPath = scanner.getFullPath('mission');
      expect(fullPath).toBe(path.join(vaultPath, 'Mission'));
    });
  });
});
