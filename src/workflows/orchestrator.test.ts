import { describe, it, expect, vi, beforeEach } from 'vitest';
import { WorkflowOrchestrator } from './orchestrator';
import type { Workflow, WorkflowStep, WorkflowContext } from '../types/workflow';

// ── 샘플 스텝 팩토리 ──────────────────────────────────────────────────

function makeStep(id: string, fn?: (ctx: WorkflowContext) => Promise<unknown>): WorkflowStep {
  return {
    id,
    name: `Step ${id}`,
    execute: fn ?? vi.fn().mockResolvedValue({ success: true }),
  };
}

function makeWorkflow(
  id: string,
  steps: WorkflowStep[],
  overrides: Partial<Workflow> = {}
): Workflow {
  return {
    id,
    name: `Workflow ${id}`,
    steps,
    triggers: [{ type: 'manual' }],
    errorHandling: { strategy: 'stop' },
    ...overrides,
  };
}

// ── 테스트 ────────────────────────────────────────────────────────────

describe('WorkflowOrchestrator', () => {
  let orchestrator: WorkflowOrchestrator;

  beforeEach(() => {
    orchestrator = new WorkflowOrchestrator();
  });

  // ── Subtask 2: 등록 ───────────────────────────────────────────────

  describe('registerWorkflow', () => {
    it('워크플로우를 등록하고 조회할 수 있다', () => {
      const wf = makeWorkflow('wf-1', [makeStep('s1')]);
      orchestrator.registerWorkflow(wf);
      expect(orchestrator.getWorkflow('wf-1')).toBe(wf);
    });

    it('동일 ID로 재등록하면 덮어쓴다', () => {
      const wf1 = makeWorkflow('wf-1', [makeStep('s1')]);
      const wf2 = makeWorkflow('wf-1', [makeStep('s2')]);
      orchestrator.registerWorkflow(wf1);
      orchestrator.registerWorkflow(wf2);
      expect(orchestrator.getWorkflow('wf-1')).toBe(wf2);
    });

    it('등록되지 않은 ID는 undefined를 반환한다', () => {
      expect(orchestrator.getWorkflow('no-such')).toBeUndefined();
    });
  });

  // ── Subtask 2: 실행 ───────────────────────────────────────────────

  describe('executeWorkflow', () => {
    it('ExecutionResult 구조를 반환한다', async () => {
      const wf = makeWorkflow('wf-1', [makeStep('s1')]);
      orchestrator.registerWorkflow(wf);
      const result = await orchestrator.executeWorkflow('wf-1');

      expect(result).toMatchObject({
        executionId: expect.any(String),
        workflowId: 'wf-1',
        status: 'completed',
        stepResults: expect.any(Array),
        totalDurationMs: expect.any(Number),
      });
    });

    it('모든 스텝을 순서대로 실행한다', async () => {
      const order: string[] = [];
      const s1 = makeStep('s1', async () => {
        order.push('s1');
      });
      const s2 = makeStep('s2', async () => {
        order.push('s2');
      });
      const s3 = makeStep('s3', async () => {
        order.push('s3');
      });

      orchestrator.registerWorkflow(makeWorkflow('wf-order', [s1, s2, s3]));
      await orchestrator.executeWorkflow('wf-order');
      expect(order).toEqual(['s1', 's2', 's3']);
    });

    it('각 스텝에 WorkflowContext를 전달한다', async () => {
      let capturedCtx: WorkflowContext | undefined;
      const step = makeStep('s1', async (ctx) => {
        capturedCtx = ctx;
      });

      orchestrator.registerWorkflow(makeWorkflow('wf-ctx', [step]));
      await orchestrator.executeWorkflow('wf-ctx', { source: 'test' });

      expect(capturedCtx).toMatchObject({
        workflowId: 'wf-ctx',
        executionId: expect.any(String),
        triggeredAt: expect.any(Date),
        payload: { source: 'test' },
      });
    });

    it('stepResults에 각 스텝의 결과가 기록된다', async () => {
      const step = makeStep('s1');
      orchestrator.registerWorkflow(makeWorkflow('wf-results', [step]));
      const result = await orchestrator.executeWorkflow('wf-results');

      expect(result.stepResults).toHaveLength(1);
      expect(result.stepResults[0]).toMatchObject({
        stepId: 's1',
        status: 'completed',
        startedAt: expect.any(Date),
        completedAt: expect.any(Date),
        durationMs: expect.any(Number),
      });
    });

    it('존재하지 않는 워크플로우 실행 시 에러를 던진다', async () => {
      await expect(orchestrator.executeWorkflow('no-such')).rejects.toThrow();
    });

    it('payload를 전달할 수 있다', async () => {
      const step = makeStep('s1');
      orchestrator.registerWorkflow(makeWorkflow('wf-payload', [step]));
      const result = await orchestrator.executeWorkflow('wf-payload', { key: 'value' });
      expect(result.status).toBe('completed');
    });
  });

  // ── Subtask 9: 실행 이력 ─────────────────────────────────────────

  describe('getExecutionHistory', () => {
    it('실행 후 이력에 저장된다', async () => {
      const wf = makeWorkflow('wf-hist', [makeStep('s1')]);
      orchestrator.registerWorkflow(wf);
      await orchestrator.executeWorkflow('wf-hist');

      const history = orchestrator.getExecutionHistory('wf-hist');
      expect(history).toHaveLength(1);
      expect(history[0].workflowId).toBe('wf-hist');
    });

    it('여러 번 실행하면 이력이 쌓인다', async () => {
      const wf = makeWorkflow('wf-multi', [makeStep('s1')]);
      orchestrator.registerWorkflow(wf);
      await orchestrator.executeWorkflow('wf-multi');
      await orchestrator.executeWorkflow('wf-multi');
      await orchestrator.executeWorkflow('wf-multi');

      expect(orchestrator.getExecutionHistory('wf-multi')).toHaveLength(3);
    });

    it('등록되지 않은 워크플로우 이력은 빈 배열이다', () => {
      expect(orchestrator.getExecutionHistory('no-such')).toEqual([]);
    });
  });

  // ── Subtask 10: 에러 처리 - stop 전략 ────────────────────────────

  describe('errorHandling - stop', () => {
    it('스텝 실패 시 status가 failed이다', async () => {
      const failStep = makeStep('fail', async () => {
        throw new Error('스텝 실패');
      });
      const nextStep = makeStep('next');
      const wf = makeWorkflow('wf-fail', [failStep, nextStep], {
        errorHandling: { strategy: 'stop' },
      });
      orchestrator.registerWorkflow(wf);
      const result = await orchestrator.executeWorkflow('wf-fail');

      expect(result.status).toBe('failed');
    });

    it('stop 전략에서 실패한 스텝 이후 스텝은 실행되지 않는다', async () => {
      const executed: string[] = [];
      const failStep = makeStep('fail', async () => {
        throw new Error('fail');
      });
      const nextStep = makeStep('next', async () => {
        executed.push('next');
      });

      orchestrator.registerWorkflow(
        makeWorkflow('wf-stop', [failStep, nextStep], { errorHandling: { strategy: 'stop' } })
      );
      await orchestrator.executeWorkflow('wf-stop');
      expect(executed).not.toContain('next');
    });

    it('실패한 스텝의 error가 stepResults에 기록된다', async () => {
      const failStep = makeStep('fail', async () => {
        throw new Error('오류 메시지');
      });
      orchestrator.registerWorkflow(makeWorkflow('wf-err', [failStep]));
      const result = await orchestrator.executeWorkflow('wf-err');

      expect(result.stepResults[0].status).toBe('failed');
      expect(result.stepResults[0].error).toContain('오류 메시지');
    });
  });

  // ── Subtask 10: 에러 처리 - continue 전략 ────────────────────────

  describe('errorHandling - continue', () => {
    it('continue 전략에서 스텝 실패 후 다음 스텝이 실행된다', async () => {
      const executed: string[] = [];
      const failStep = makeStep('fail', async () => {
        throw new Error('fail');
      });
      const nextStep = makeStep('next', async () => {
        executed.push('next');
      });

      orchestrator.registerWorkflow(
        makeWorkflow('wf-cont', [failStep, nextStep], { errorHandling: { strategy: 'continue' } })
      );
      await orchestrator.executeWorkflow('wf-cont');
      expect(executed).toContain('next');
    });
  });

  // ── Subtask 10: 에러 처리 - retry 전략 ───────────────────────────

  describe('errorHandling - retry', () => {
    it('retry 전략에서 실패 시 maxRetries만큼 재시도한다', async () => {
      let callCount = 0;
      const failStep = makeStep('fail', async () => {
        callCount++;
        throw new Error('일시적 오류');
      });

      orchestrator.registerWorkflow(
        makeWorkflow('wf-retry', [failStep], {
          errorHandling: { strategy: 'retry', maxRetries: 2, retryDelayMs: 0 },
        })
      );
      await orchestrator.executeWorkflow('wf-retry');
      expect(callCount).toBe(3); // 최초 1회 + 재시도 2회
    });

    it('재시도 성공 시 status가 completed이다', async () => {
      let callCount = 0;
      const flakyStep = makeStep('flaky', async () => {
        callCount++;
        if (callCount < 2) throw new Error('일시적 오류');
        return { success: true };
      });

      orchestrator.registerWorkflow(
        makeWorkflow('wf-flaky', [flakyStep], {
          errorHandling: { strategy: 'retry', maxRetries: 3, retryDelayMs: 0 },
        })
      );
      const result = await orchestrator.executeWorkflow('wf-flaky');
      expect(result.status).toBe('completed');
    });
  });

  // ── Subtask 3: 이벤트 트리거 ─────────────────────────────────────

  describe('event trigger', () => {
    it('이벤트 emit 시 해당 워크플로우가 실행된다', async () => {
      const step = makeStep('s1');
      orchestrator.registerWorkflow(
        makeWorkflow('wf-event', [step], {
          triggers: [{ type: 'event', event: 'mission:updated' }],
        })
      );

      await orchestrator.emit('mission:updated', { filePath: '/vault/mission.md' });
      expect(step.execute).toHaveBeenCalled();
    });

    it('다른 이벤트로는 실행되지 않는다', async () => {
      const step = makeStep('s1');
      orchestrator.registerWorkflow(
        makeWorkflow('wf-event2', [step], {
          triggers: [{ type: 'event', event: 'mission:updated' }],
        })
      );

      await orchestrator.emit('meeting:synced', {});
      expect(step.execute).not.toHaveBeenCalled();
    });
  });

  // ── Subtask 5~8: 사전 정의 워크플로우 ────────────────────────────

  describe('predefined workflows', () => {
    it('onGitHubSync 워크플로우가 등록된다', () => {
      expect(orchestrator.getWorkflow('onGitHubSync')).toBeDefined();
    });

    it('onGitHubSync는 github:sync 이벤트 트리거를 갖는다', () => {
      const wf = orchestrator.getWorkflow('onGitHubSync')!;
      expect(wf.triggers.some((t) => t.type === 'event' && t.event === 'github:sync')).toBe(true);
    });

    it('onGitHubSync는 3개의 스텝을 갖는다', () => {
      const wf = orchestrator.getWorkflow('onGitHubSync')!;
      expect(wf.steps).toHaveLength(3);
      expect(wf.steps.map((s) => s.id)).toEqual([
        'github-pull',
        'github-status',
        'github-commit-push',
      ]);
    });

    it('onNotionSync 워크플로우가 등록된다', () => {
      expect(orchestrator.getWorkflow('onNotionSync')).toBeDefined();
    });

    it('onNotionSync는 notion:sync 이벤트 트리거를 갖는다', () => {
      const wf = orchestrator.getWorkflow('onNotionSync')!;
      expect(wf.triggers.some((t) => t.type === 'event' && t.event === 'notion:sync')).toBe(true);
    });

    it('onNotionSync는 2개의 스텝을 갖는다', () => {
      const wf = orchestrator.getWorkflow('onNotionSync')!;
      expect(wf.steps).toHaveLength(2);
      expect(wf.steps.map((s) => s.id)).toEqual(['notion-fetch', 'notion-sync-obsidian']);
    });

    it('onMissionUpdate 워크플로우가 등록된다', () => {
      expect(orchestrator.getWorkflow('onMissionUpdate')).toBeDefined();
    });

    it('onMeetingSync 워크플로우가 등록된다', () => {
      expect(orchestrator.getWorkflow('onMeetingSync')).toBeDefined();
    });

    it('onSkillUpdate 워크플로우가 등록된다', () => {
      expect(orchestrator.getWorkflow('onSkillUpdate')).toBeDefined();
    });

    it('weeklyDigest 워크플로우가 등록된다', () => {
      expect(orchestrator.getWorkflow('weeklyDigest')).toBeDefined();
    });

    it('onMissionUpdate는 event 트리거를 갖는다', () => {
      const wf = orchestrator.getWorkflow('onMissionUpdate')!;
      expect(wf.triggers.some((t) => t.type === 'event')).toBe(true);
    });

    it('weeklyDigest는 cron 트리거를 갖는다', () => {
      const wf = orchestrator.getWorkflow('weeklyDigest')!;
      expect(wf.triggers.some((t) => t.type === 'cron')).toBe(true);
    });

    it('각 사전 정의 워크플로우는 최소 1개의 스텝을 갖는다', () => {
      const ids = ['onMissionUpdate', 'onMeetingSync', 'onSkillUpdate', 'weeklyDigest'];
      for (const id of ids) {
        expect(orchestrator.getWorkflow(id)!.steps.length).toBeGreaterThan(0);
      }
    });
  });

  // ── Subtask 4: Cron 스케줄러 ─────────────────────────────────────

  describe('scheduleWorkflow', () => {
    it('스케줄 등록 후 getSchedules에서 조회된다', () => {
      const wf = makeWorkflow('wf-sched', [makeStep('s1')]);
      orchestrator.registerWorkflow(wf);
      orchestrator.scheduleWorkflow('wf-sched', '0 9 * * 1');

      const schedules = orchestrator.getSchedules();
      expect(schedules.some((s) => s.workflowId === 'wf-sched')).toBe(true);
    });

    it('같은 워크플로우 재스케줄 시 기존 스케줄을 교체한다', () => {
      const wf = makeWorkflow('wf-resched', [makeStep('s1')]);
      orchestrator.registerWorkflow(wf);
      orchestrator.scheduleWorkflow('wf-resched', '0 9 * * 1');
      orchestrator.scheduleWorkflow('wf-resched', '0 10 * * 1');

      const schedules = orchestrator.getSchedules().filter((s) => s.workflowId === 'wf-resched');
      expect(schedules).toHaveLength(1);
      expect(schedules[0].cron).toBe('0 10 * * 1');
    });
  });
});
