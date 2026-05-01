import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';

const KIT_ROOT = path.join(__dirname);

function exists(relative: string): boolean {
  return fs.existsSync(path.join(KIT_ROOT, relative));
}

function read(relative: string): string {
  return fs.readFileSync(path.join(KIT_ROOT, relative), 'utf-8');
}

// ── 디렉토리 구조 ─────────────────────────────────────────────────────────

describe('aa-starter-kit 디렉토리 구조', () => {
  it('templates/ 디렉토리가 존재한다', () => {
    expect(exists('templates')).toBe(true);
  });

  it('templates/Mission/ 디렉토리가 존재한다', () => {
    expect(exists('templates/Mission')).toBe(true);
  });

  it('templates/Meetings/ 디렉토리가 존재한다', () => {
    expect(exists('templates/Meetings')).toBe(true);
  });

  it('templates/Skills/ 디렉토리가 존재한다', () => {
    expect(exists('templates/Skills')).toBe(true);
  });

  it('templates/Insights/ 디렉토리가 존재한다', () => {
    expect(exists('templates/Insights')).toBe(true);
  });

  it('scripts/ 디렉토리가 존재한다', () => {
    expect(exists('scripts')).toBe(true);
  });

  it('docs/ 디렉토리가 존재한다', () => {
    expect(exists('docs')).toBe(true);
  });

  it('examples/ 디렉토리가 존재한다', () => {
    expect(exists('examples')).toBe(true);
  });
});

// ── 템플릿 파일 ───────────────────────────────────────────────────────────

describe('Obsidian 볼트 템플릿', () => {
  it('Mission 템플릿이 존재한다', () => {
    expect(exists('templates/Mission/daily-mission.md')).toBe(true);
  });

  it('Mission 템플릿에 frontmatter가 있다', () => {
    const content = read('templates/Mission/daily-mission.md');
    expect(content.startsWith('---')).toBe(true);
  });

  it('Meetings 템플릿이 존재한다', () => {
    expect(exists('templates/Meetings/meeting-template.md')).toBe(true);
  });

  it('Meetings 템플릿에 안건/결정사항 섹션이 있다', () => {
    const content = read('templates/Meetings/meeting-template.md');
    expect(content).toContain('안건');
    expect(content).toContain('결정 사항');
  });

  it('Skills 템플릿이 존재한다', () => {
    expect(exists('templates/Skills/skill-template.md')).toBe(true);
  });

  it('Insights 템플릿이 존재한다', () => {
    expect(exists('templates/Insights/insight-template.md')).toBe(true);
  });
});

// ── 환경 설정 ─────────────────────────────────────────────────────────────

describe('환경 설정 파일', () => {
  it('.env.example 파일이 존재한다', () => {
    expect(exists('.env.example')).toBe(true);
  });

  it('.env.example에 ANTHROPIC_API_KEY 항목이 있다', () => {
    const content = read('.env.example');
    expect(content).toContain('ANTHROPIC_API_KEY');
  });

  it('.env.example에 GITHUB_TOKEN 항목이 있다', () => {
    const content = read('.env.example');
    expect(content).toContain('GITHUB_TOKEN');
  });

  it('.env.example에 실제 API 키가 없다 (플레이스홀더만 존재)', () => {
    const content = read('.env.example');
    expect(content).not.toMatch(/sk-ant-api03-[A-Za-z0-9]{40,}/);
    expect(content).not.toMatch(/ghp_[A-Za-z0-9]{36}/);
  });
});

// ── 스크립트 ──────────────────────────────────────────────────────────────

describe('setup 스크립트', () => {
  it('scripts/setup.ts 파일이 존재한다', () => {
    expect(exists('scripts/setup.ts')).toBe(true);
  });

  it('setup.ts에 볼트 폴더 목록이 정의되어 있다', () => {
    const content = read('scripts/setup.ts');
    expect(content).toContain('Mission');
    expect(content).toContain('Meetings');
  });
});

// ── 문서 ──────────────────────────────────────────────────────────────────

describe('사용자 가이드 문서', () => {
  it('docs/quickstart.md가 존재한다', () => {
    expect(exists('docs/quickstart.md')).toBe(true);
  });

  it('quickstart.md에 단계별 설명이 있다', () => {
    const content = read('docs/quickstart.md');
    expect(content).toContain('1단계');
    expect(content).toContain('npm install');
  });

  it('docs/custom-workflow.md가 존재한다', () => {
    expect(exists('docs/custom-workflow.md')).toBe(true);
  });

  it('custom-workflow.md에 트리거 유형 설명이 있다', () => {
    const content = read('docs/custom-workflow.md');
    expect(content).toContain('이벤트 트리거');
    expect(content).toContain('Cron 트리거');
  });

  it('docs/faq.md가 존재한다', () => {
    expect(exists('docs/faq.md')).toBe(true);
  });

  it('docs/no-code-guide.md가 존재한다', () => {
    expect(exists('docs/no-code-guide.md')).toBe(true);
  });

  it('no-code-guide.md에 준비물 체크리스트가 있다', () => {
    const content = read('docs/no-code-guide.md');
    expect(content).toContain('체크리스트');
  });
});

// ── GitHub 파일 ───────────────────────────────────────────────────────────

describe('GitHub 오픈소스 파일', () => {
  it('README.md가 존재한다', () => {
    expect(exists('README.md')).toBe(true);
  });

  it('README.md에 프로젝트 설명이 있다', () => {
    const content = read('README.md');
    expect(content).toContain('셀피시 클럽');
    expect(content).toContain('빠른 시작');
  });

  it('CONTRIBUTING.md가 존재한다', () => {
    expect(exists('CONTRIBUTING.md')).toBe(true);
  });

  it('CONTRIBUTING.md에 PR 가이드가 있다', () => {
    const content = read('CONTRIBUTING.md');
    expect(content).toContain('Pull Request');
  });

  it('LICENSE 파일이 존재한다', () => {
    expect(exists('LICENSE')).toBe(true);
  });

  it('LICENSE는 MIT 라이선스이다', () => {
    const content = read('LICENSE');
    expect(content).toContain('MIT License');
  });
});

// ── 예제 워크플로우 ───────────────────────────────────────────────────────

describe('예제 워크플로우', () => {
  it('examples/example-workflow.json이 존재한다', () => {
    expect(exists('examples/example-workflow.json')).toBe(true);
  });

  it('유효한 JSON이다', () => {
    const content = read('examples/example-workflow.json');
    expect(() => JSON.parse(content)).not.toThrow();
  });

  it('4개의 예제 워크플로우가 있다', () => {
    const data = JSON.parse(read('examples/example-workflow.json'));
    expect(data.examples).toHaveLength(4);
  });

  it('각 예제에 cliUsage가 있다', () => {
    const data = JSON.parse(read('examples/example-workflow.json'));
    for (const ex of data.examples) {
      expect(ex.cliUsage).toBeDefined();
    }
  });
});
