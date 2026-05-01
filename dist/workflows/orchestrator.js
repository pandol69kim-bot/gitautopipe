"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.WorkflowOrchestrator = void 0;
const events_1 = require("events");
const crypto_1 = require("crypto");
// ── WorkflowOrchestrator 클래스 ───────────────────────────────────────
class WorkflowOrchestrator {
    workflows = new Map();
    history = new Map();
    schedules = new Map();
    emitter = new events_1.EventEmitter();
    constructor() {
        this.registerPredefinedWorkflows();
    }
    // ── Subtask 2: 등록 ───────────────────────────────────────────────
    registerWorkflow(workflow) {
        this.workflows.set(workflow.id, workflow);
        for (const trigger of workflow.triggers) {
            if (trigger.type === 'event' && trigger.event) {
                this.emitter.removeAllListeners(trigger.event);
                this.emitter.on(trigger.event, async (payload) => {
                    await this.executeWorkflow(workflow.id, payload).catch(() => { });
                });
            }
        }
    }
    getWorkflow(id) {
        return this.workflows.get(id);
    }
    // ── Subtask 2: 실행 ───────────────────────────────────────────────
    async executeWorkflow(workflowId, payload) {
        const workflow = this.workflows.get(workflowId);
        if (!workflow)
            throw new Error(`워크플로우를 찾을 수 없습니다: ${workflowId}`);
        const executionId = (0, crypto_1.randomUUID)();
        const triggeredAt = new Date();
        const stepResults = [];
        let status = 'running';
        const context = {
            workflowId,
            executionId,
            triggeredAt,
            payload,
        };
        for (const step of workflow.steps) {
            const stepResult = await this.executeStep(step, context, workflow.errorHandling);
            stepResults.push(stepResult);
            if (stepResult.status === 'failed') {
                if (workflow.errorHandling.strategy === 'stop') {
                    status = 'failed';
                    break;
                }
            }
        }
        if (status === 'running') {
            status = stepResults.some((r) => r.status === 'failed') ? 'failed' : 'completed';
        }
        const completedAt = new Date();
        const totalDurationMs = completedAt.getTime() - triggeredAt.getTime();
        const execution = {
            executionId,
            workflowId,
            status,
            triggeredAt,
            completedAt,
            stepResults,
        };
        const existing = this.history.get(workflowId) ?? [];
        this.history.set(workflowId, [...existing, execution]);
        return { executionId, workflowId, status, stepResults, totalDurationMs };
    }
    // ── Subtask 9: 실행 이력 ─────────────────────────────────────────
    getExecutionHistory(workflowId) {
        return this.history.get(workflowId) ?? [];
    }
    // ── Subtask 4: Cron 스케줄러 ─────────────────────────────────────
    scheduleWorkflow(workflowId, cron) {
        this.schedules.set(workflowId, {
            workflowId,
            cron,
            registeredAt: new Date(),
        });
    }
    getSchedules() {
        return Array.from(this.schedules.values());
    }
    // ── Subtask 3: 이벤트 emit ────────────────────────────────────────
    async emit(event, payload) {
        const listeners = this.emitter.listeners(event);
        await Promise.all(listeners.map((fn) => fn(payload)));
    }
    // ── Subtask 10: 스텝 실행 + 에러 처리 ────────────────────────────
    async executeStep(step, context, errorHandling) {
        const startedAt = new Date();
        const maxAttempts = errorHandling.strategy === 'retry' ? 1 + (errorHandling.maxRetries ?? 0) : 1;
        let lastError = null;
        let output;
        for (let attempt = 0; attempt < maxAttempts; attempt++) {
            try {
                if (attempt > 0 && errorHandling.retryDelayMs) {
                    await this.sleep(errorHandling.retryDelayMs * Math.pow(2, attempt - 1));
                }
                output = await step.execute(context);
                lastError = null;
                break;
            }
            catch (err) {
                lastError = err instanceof Error ? err : new Error(String(err));
            }
        }
        const completedAt = new Date();
        const durationMs = completedAt.getTime() - startedAt.getTime();
        if (lastError) {
            return {
                stepId: step.id,
                status: 'failed',
                error: lastError.message,
                startedAt,
                completedAt,
                durationMs,
            };
        }
        return {
            stepId: step.id,
            status: 'completed',
            output,
            startedAt,
            completedAt,
            durationMs,
        };
    }
    sleep(ms) {
        return new Promise((resolve) => setTimeout(resolve, ms));
    }
    // ── Subtask 5~8: 사전 정의 워크플로우 ────────────────────────────
    registerPredefinedWorkflows() {
        // onMissionUpdate: Mission 파일 변경 → 분석 → LinkedIn 초안
        this.registerWorkflow({
            id: 'onMissionUpdate',
            name: 'Mission 업데이트 처리',
            steps: [
                this.makeLogStep('mission-log', 'Mission 파일 변경 감지'),
                this.makeLogStep('claude-analyze', 'Claude 분석 실행'),
                this.makeLogStep('linkedin-draft', 'LinkedIn 초안 생성'),
            ],
            triggers: [{ type: 'event', event: 'mission:updated' }],
            errorHandling: { strategy: 'continue', notifyOnFailure: true },
        });
        // onMeetingSync: Notion 동기화 → Analysis 보고서 업데이트
        this.registerWorkflow({
            id: 'onMeetingSync',
            name: 'Notion 미팅 동기화',
            steps: [
                this.makeLogStep('notion-fetch', 'Notion 미팅 데이터 조회'),
                this.makeLogStep('obsidian-sync', 'Obsidian 동기화'),
                this.makeLogStep('report-update', 'Analysis 보고서 업데이트'),
            ],
            triggers: [{ type: 'event', event: 'meeting:synced' }],
            errorHandling: {
                strategy: 'retry',
                maxRetries: 2,
                retryDelayMs: 1000,
                notifyOnFailure: true,
            },
        });
        // onSkillUpdate: Skill/Insight 변경 → 배포
        this.registerWorkflow({
            id: 'onSkillUpdate',
            name: 'Skill/Insight 게시물 배포',
            steps: [
                this.makeLogStep('site-build', '정적 사이트 빌드'),
                this.makeLogStep('vercel-deploy', 'Vercel 배포'),
                this.makeLogStep('deploy-notify', '배포 알림 전송'),
            ],
            triggers: [{ type: 'event', event: 'skill:updated' }],
            errorHandling: { strategy: 'stop', notifyOnFailure: true },
        });
        // weeklyDigest: 주간 요약 보고서 (매주 월요일 09:00)
        this.registerWorkflow({
            id: 'weeklyDigest',
            name: '주간 다이제스트 생성',
            steps: [
                this.makeLogStep('vault-scan', '볼트 주간 데이터 수집'),
                this.makeLogStep('weekly-report', '주간 보고서 생성'),
                this.makeLogStep('github-commit', 'GitHub 커밋'),
                this.makeLogStep('digest-notify', '다이제스트 알림 전송'),
            ],
            triggers: [{ type: 'cron', cron: '0 9 * * 1' }],
            errorHandling: { strategy: 'continue', notifyOnFailure: true },
        });
        // weeklyDigest에 cron 스케줄 자동 등록
        this.scheduleWorkflow('weeklyDigest', '0 9 * * 1');
    }
    makeLogStep(id, name) {
        return {
            id,
            name,
            execute: async (_ctx) => {
                return { stepId: id, message: `${name} 완료` };
            },
        };
    }
}
exports.WorkflowOrchestrator = WorkflowOrchestrator;
//# sourceMappingURL=orchestrator.js.map