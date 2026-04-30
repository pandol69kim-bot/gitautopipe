import { describe, it, expect, vi, beforeEach } from 'vitest';
import { GitHubSync } from './github';
import type { GitHubConfig, ChangedFile, CommitContext } from '../types/github';

// simple-git과 Octokit는 외부 의존성이므로 mock 처리
vi.mock('simple-git', () => {
  const mockGit = {
    fetch: vi.fn().mockResolvedValue(undefined),
    status: vi.fn().mockResolvedValue({ conflicted: [], staged: [], modified: [] }),
    add: vi.fn().mockResolvedValue(undefined),
    commit: vi.fn().mockResolvedValue({ commit: 'abc123def456' }),
    push: vi.fn().mockResolvedValue(undefined),
    pull: vi.fn().mockResolvedValue(undefined),
    log: vi.fn().mockResolvedValue({ all: [] }),
    diff: vi.fn().mockResolvedValue(''),
  };
  return { default: vi.fn(() => mockGit) };
});

vi.mock('@octokit/rest', () => {
  const mockOctokit = {
    pulls: {
      create: vi.fn().mockResolvedValue({
        data: {
          number: 42,
          html_url: 'https://github.com/owner/repo/pull/42',
          title: '테스트 PR',
          state: 'open',
        },
      }),
      list: vi.fn().mockResolvedValue({ data: [] }),
    },
  };
  return {
    Octokit: function () {
      return mockOctokit;
    },
  };
});

const makeConfig = (): GitHubConfig => ({
  owner: 'selfisclub',
  repo: 'codex',
  branch: 'main',
  token: 'ghp_test_token',
  localRepoPath: '/tmp/test-repo',
});

const makeChangedFiles = (): ChangedFile[] => [
  {
    filePath: '/tmp/test-repo/Mission/Week01/goals.md',
    relativePath: 'Mission/Week01/goals.md',
    folderType: 'mission',
    changeType: 'modify',
  },
];

describe('GitHubSync', () => {
  let sync: GitHubSync;

  beforeEach(() => {
    vi.clearAllMocks();
    sync = new GitHubSync(makeConfig());
  });

  describe('생성자', () => {
    it('유효한 설정으로 인스턴스 생성', () => {
      expect(sync).toBeInstanceOf(GitHubSync);
    });

    it('빈 owner로 생성 시 에러', () => {
      expect(() => new GitHubSync({ ...makeConfig(), owner: '' })).toThrow(
        'GitHubConfig 검증 실패'
      );
    });

    it('빈 token으로 생성 시 에러', () => {
      expect(() => new GitHubSync({ ...makeConfig(), token: '' })).toThrow(
        'GitHubConfig 검증 실패'
      );
    });
  });

  describe('buildCommitMessage (정적 메서드)', () => {
    const cases: Array<[CommitContext, string]> = [
      [
        { type: 'mission', weekNumber: 1, memberName: '홍길동' },
        '[Mission] Week01 - 홍길동 과제 업데이트',
      ],
      [{ type: 'meetings', date: '2024-01-15' }, '[Meetings] 2024-01-15 위클리 회의록 추가'],
      [
        { type: 'skillInsight', topic: 'TypeScript 제네릭' },
        '[Skill/Insight] TypeScript 제네릭 인사이트 추가',
      ],
      [
        { type: 'sharing', title: '리액트 최적화 가이드' },
        '[Sharing] 리액트 최적화 가이드 공유 콘텐츠 추가',
      ],
      [{ type: 'analysis', period: '2024년 1월' }, '[Analysis] 2024년 1월 분석 리포트 업데이트'],
      [
        { type: 'linkedin', title: 'AI 에이전트 활용기' },
        '[LinkedIn] AI 에이전트 활용기 포스트 초안 추가',
      ],
      [{ type: 'generic', description: '기타 업데이트' }, '기타 업데이트'],
    ];

    it.each(cases)('context %# → 올바른 커밋 메시지 생성', (context, expected) => {
      expect(GitHubSync.buildCommitMessage(context)).toBe(expected);
    });

    it('week 번호 한 자리는 두 자리로 패딩', () => {
      const msg = GitHubSync.buildCommitMessage({
        type: 'mission',
        weekNumber: 3,
        memberName: '김철수',
      });
      expect(msg).toContain('Week03');
    });

    it('week 번호 두 자리는 그대로', () => {
      const msg = GitHubSync.buildCommitMessage({
        type: 'mission',
        weekNumber: 12,
        memberName: '이영희',
      });
      expect(msg).toContain('Week12');
    });
  });

  describe('commitAndPush', () => {
    it('파일 커밋 후 CommitResult 반환', async () => {
      const result = await sync.commitAndPush(makeChangedFiles(), '[Mission] Week01 - 테스트');
      expect(result.sha).toBe('abc123def456');
      expect(result.filesChanged).toBe(1);
      expect(result.timestamp).toBeInstanceOf(Date);
    });
  });

  describe('detectConflicts', () => {
    it('충돌 없는 경우 빈 배열 반환', async () => {
      const conflicts = await sync.detectConflicts();
      expect(conflicts).toEqual([]);
    });
  });

  describe('createPullRequest', () => {
    it('PR 생성 후 PullRequestResult 반환', async () => {
      const pr = await sync.createPullRequest('테스트 PR', '## 변경 내용\n- 테스트');
      expect(pr.number).toBe(42);
      expect(pr.url).toContain('github.com');
      expect(pr.state).toBe('open');
    });
  });

  describe('sync', () => {
    it('충돌 없을 때 성공 결과 반환', async () => {
      const result = await sync.sync(makeChangedFiles(), {
        type: 'mission',
        weekNumber: 1,
        memberName: '홍길동',
      });
      expect(result.success).toBe(true);
      expect(result.conflicts).toEqual([]);
      expect(result.commit).toBeDefined();
      expect(result.commit?.message).toBe('[Mission] Week01 - 홍길동 과제 업데이트');
    });
  });
});
