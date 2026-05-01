import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import os from 'os';

// ── Logger ────────────────────────────────────────────────────────────────

import { Logger } from './logger';

describe('Logger', () => {
  it('기본 레벨은 info이다', () => {
    const logger = new Logger();
    expect(logger.getLevel()).toBe('info');
  });

  it('생성자로 레벨을 설정할 수 있다', () => {
    const logger = new Logger('debug');
    expect(logger.getLevel()).toBe('debug');
  });

  it('setLevel로 레벨을 변경할 수 있다', () => {
    const logger = new Logger('info');
    logger.setLevel('error');
    expect(logger.getLevel()).toBe('error');
  });

  it('현재 레벨보다 낮은 레벨 메시지는 출력되지 않는다', () => {
    const logger = new Logger('warn');
    const spy = vi.spyOn(console, 'debug').mockImplementation(() => {});
    logger.debug('test');
    expect(spy).not.toHaveBeenCalled();
    spy.mockRestore();
  });

  it('현재 레벨 이상의 메시지는 출력된다', () => {
    const logger = new Logger('warn');
    const spy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    logger.warn('test warning');
    expect(spy).toHaveBeenCalled();
    spy.mockRestore();
  });

  it('error 레벨은 항상 출력된다 (error 레벨 설정 시)', () => {
    const logger = new Logger('error');
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    logger.error('critical error');
    expect(spy).toHaveBeenCalled();
    spy.mockRestore();
  });

  it('debug 레벨 설정 시 모든 레벨이 출력된다', () => {
    const logger = new Logger('debug');
    const spyDebug = vi.spyOn(console, 'debug').mockImplementation(() => {});
    const spyInfo = vi.spyOn(console, 'info').mockImplementation(() => {});
    logger.debug('d');
    logger.info('i');
    expect(spyDebug).toHaveBeenCalled();
    expect(spyInfo).toHaveBeenCalled();
    spyDebug.mockRestore();
    spyInfo.mockRestore();
  });
});

// ── Formatter ─────────────────────────────────────────────────────────────

import { format } from './formatter';

describe('Formatter', () => {
  describe('json 포맷', () => {
    it('객체를 JSON 문자열로 변환한다', () => {
      const result = format({ key: 'value' }, 'json');
      expect(result).toBe(JSON.stringify({ key: 'value' }, null, 2));
    });

    it('배열을 JSON 문자열로 변환한다', () => {
      const result = format([1, 2, 3], 'json');
      expect(result).toContain('[');
    });
  });

  describe('table 포맷', () => {
    it('배열 데이터를 탭 구분 형태로 출력한다', () => {
      const data = [{ id: '1', name: 'alice' }, { id: '2', name: 'bob' }];
      const result = format(data, 'table');
      expect(result).toContain('id');
      expect(result).toContain('name');
      expect(result).toContain('alice');
    });

    it('빈 배열은 (no data)를 반환한다', () => {
      const result = format([], 'table');
      expect(result).toBe('(no data)');
    });

    it('객체 데이터를 key-value 형태로 출력한다', () => {
      const result = format({ status: 'ok', count: 3 }, 'table');
      expect(result).toContain('status');
      expect(result).toContain('ok');
    });
  });

  describe('minimal 포맷', () => {
    it('배열은 count만 반환한다', () => {
      const result = format([1, 2, 3], 'minimal');
      expect(result).toBe('count: 3');
    });

    it('객체는 key: value 쌍을 반환한다', () => {
      const result = format({ action: 'scan', status: 'done' }, 'minimal');
      expect(result).toContain('action: scan');
      expect(result).toContain('status: done');
    });

    it('원시값은 문자열로 반환한다', () => {
      const result = format('hello', 'minimal');
      expect(result).toBe('hello');
    });
  });
});

// ── ConfigManager ─────────────────────────────────────────────────────────

import { ConfigManager, CONFIG_FILENAME } from './config-manager';

describe('ConfigManager', () => {
  let tmpDir: string;
  let manager: ConfigManager;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'selfish-test-'));
    manager = new ConfigManager(tmpDir);
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('설정 파일이 없으면 기본 설정을 반환한다', () => {
    const config = manager.load();
    expect(config.vault.rootPath).toBe('./vault');
    expect(config.logLevel).toBe('info');
  });

  it('설정을 저장하면 파일이 생성된다', () => {
    manager.save(manager.load());
    expect(fs.existsSync(path.join(tmpDir, CONFIG_FILENAME))).toBe(true);
  });

  it('저장 후 다시 로드하면 동일한 값이다', () => {
    const config = manager.load();
    (config as { logLevel: string }).logLevel = 'debug';
    manager.save(config);
    const loaded = manager.load();
    expect(loaded.logLevel).toBe('debug');
  });

  it('exists()는 설정 파일 존재 여부를 반환한다', () => {
    expect(manager.exists()).toBe(false);
    manager.save(manager.load());
    expect(manager.exists()).toBe(true);
  });

  it('init()은 파일이 없으면 기본 설정으로 생성한다', () => {
    const config = manager.init();
    expect(manager.exists()).toBe(true);
    expect(config.vault.folders).toContain('Mission');
  });

  it('init()은 파일이 이미 있으면 기존 설정을 반환한다', () => {
    const original = manager.load();
    (original as { logLevel: string }).logLevel = 'warn';
    manager.save(original);
    const config = manager.init();
    expect(config.logLevel).toBe('warn');
  });

  it('getConfigPath()는 설정 파일 경로를 반환한다', () => {
    expect(manager.getConfigPath()).toContain(CONFIG_FILENAME);
  });

  it('잘못된 스키마의 설정 파일은 에러를 던진다', () => {
    fs.writeFileSync(
      path.join(tmpDir, CONFIG_FILENAME),
      JSON.stringify({ invalid: true }),
      'utf-8'
    );
    expect(() => manager.load()).toThrow();
  });
});

// ── Commands ──────────────────────────────────────────────────────────────

import { runScan, runSync, runAnalyze, runDeploy, runWorkflow, runStatus } from './commands';
import { WorkflowOrchestrator } from '../workflows/orchestrator';

describe('Commands', () => {
  let orchestrator: WorkflowOrchestrator;

  beforeEach(() => {
    orchestrator = new WorkflowOrchestrator();
  });

  const deps = () => ({ orchestrator, outputFormat: 'json' as const });

  it('runScan: 스캔 결과를 반환한다', async () => {
    const result = await runScan({ folder: 'Mission' }, deps());
    const parsed = JSON.parse(result);
    expect(parsed.action).toBe('scan');
    expect(parsed.folder).toBe('Mission');
    expect(parsed.status).toBe('completed');
  });

  it('runScan: folder 미지정 시 all로 처리된다', async () => {
    const result = await runScan({}, deps());
    const parsed = JSON.parse(result);
    expect(parsed.folder).toBe('all');
  });

  it('runSync: 동기화 결과를 반환한다', async () => {
    const result = await runSync({ target: 'github' }, deps());
    const parsed = JSON.parse(result);
    expect(parsed.action).toBe('sync');
    expect(parsed.target).toBe('github');
  });

  it('runSync: target 미지정 시 github으로 처리된다', async () => {
    const result = await runSync({}, deps());
    const parsed = JSON.parse(result);
    expect(parsed.target).toBe('github');
  });

  it('runAnalyze: 분석 결과를 반환한다', async () => {
    const result = await runAnalyze({ week: 12 }, deps());
    const parsed = JSON.parse(result);
    expect(parsed.action).toBe('analyze');
    expect(parsed.week).toBe(12);
  });

  it('runDeploy: 배포 결과를 반환한다', async () => {
    const result = await runDeploy({ preview: true }, deps());
    const parsed = JSON.parse(result);
    expect(parsed.action).toBe('deploy');
    expect(parsed.preview).toBe(true);
  });

  it('runWorkflow: 존재하는 워크플로우를 실행한다', async () => {
    const result = await runWorkflow({ workflowId: 'weeklyDigest' }, deps());
    const parsed = JSON.parse(result);
    expect(parsed.workflowId).toBe('weeklyDigest');
    expect(parsed.status).toBeDefined();
  });

  it('runWorkflow: 존재하지 않는 워크플로우는 에러를 던진다', async () => {
    await expect(runWorkflow({ workflowId: 'no-such' }, deps())).rejects.toThrow();
  });

  it('runStatus: 워크플로우 상태를 반환한다', () => {
    const result = runStatus(deps());
    const parsed = JSON.parse(result);
    expect(Array.isArray(parsed.workflows)).toBe(true);
    expect(parsed.schedules).toBeGreaterThanOrEqual(0);
  });

  it('runStatus: 사전 정의 워크플로우 4개가 포함된다', () => {
    const result = runStatus(deps());
    const parsed = JSON.parse(result);
    const ids = parsed.workflows.map((w: { id: string }) => w.id);
    expect(ids).toContain('onMissionUpdate');
    expect(ids).toContain('weeklyDigest');
  });
});

// ── Interactive ───────────────────────────────────────────────────────────

import { runInteractive } from './interactive';
import type { PromptFn } from './interactive';

describe('Interactive', () => {
  it('scan 선택 시 folder 옵션과 함께 scan 명령어를 반환한다', async () => {
    const prompt: PromptFn = vi.fn()
      .mockResolvedValueOnce({ command: 'scan' })
      .mockResolvedValueOnce({ folder: 'Mission' });

    const result = await runInteractive(prompt);
    expect(result.command).toBe('scan');
    expect(result.options).toMatchObject({ folder: 'Mission' });
  });

  it('status 선택 시 status 명령어를 반환한다', async () => {
    const prompt: PromptFn = vi.fn().mockResolvedValueOnce({ command: 'status' });
    const result = await runInteractive(prompt);
    expect(result.command).toBe('status');
  });

  it('workflow 선택 시 workflowId 옵션과 함께 반환한다', async () => {
    const prompt: PromptFn = vi.fn()
      .mockResolvedValueOnce({ command: 'workflow' })
      .mockResolvedValueOnce({ workflowId: 'weeklyDigest' });

    const result = await runInteractive(prompt);
    expect(result.command).toBe('workflow');
    expect((result.options as { workflowId: string }).workflowId).toBe('weeklyDigest');
  });

  it('exit 선택 시 exit 명령어를 반환한다', async () => {
    const prompt: PromptFn = vi.fn().mockResolvedValueOnce({ command: 'exit' });
    const result = await runInteractive(prompt);
    expect(result.command).toBe('exit');
  });
});
