# 커스텀 워크플로우 작성 가이드

이 가이드는 자신만의 자동화 워크플로우를 만드는 방법을 설명합니다.

---

## 워크플로우 기본 구조

워크플로우는 **트리거** + **스텝 배열** + **에러 처리 전략**으로 구성됩니다.

```typescript
import type { Workflow, WorkflowStep, WorkflowContext } from './src/types/workflow';

const myWorkflow: Workflow = {
  id: 'my-workflow',
  name: '나만의 워크플로우',
  steps: [step1, step2, step3],
  triggers: [{ type: 'event', event: 'my:event' }],
  errorHandling: { strategy: 'continue', notifyOnFailure: true },
};
```

---

## 트리거 유형

### 이벤트 트리거

특정 이벤트가 발생할 때 실행됩니다.

```typescript
triggers: [{ type: 'event', event: 'mission:updated' }]
```

이벤트를 직접 발행하려면:
```typescript
await orchestrator.emit('mission:updated', { filePath: '/vault/Mission/today.md' });
```

또는 CLI로:
```bash
selfish-club workflow myWorkflowId
```

### Cron 트리거

정해진 시간에 자동 실행됩니다.

```typescript
triggers: [{ type: 'cron', cron: '0 9 * * 1' }]  // 매주 월요일 09:00
```

| Cron 표현식 | 실행 시점 |
|------------|----------|
| `0 9 * * 1` | 매주 월요일 09:00 |
| `0 8 * * *` | 매일 08:00 |
| `0 0 1 * *` | 매월 1일 00:00 |
| `*/30 * * * *` | 30분마다 |

스케줄 등록:
```typescript
orchestrator.scheduleWorkflow('my-workflow', '0 9 * * 1');
```

---

## 스텝 작성

스텝은 `execute(context)` 함수를 구현합니다.

```typescript
const analyzeStep: WorkflowStep = {
  id: 'analyze',
  name: 'Claude 분석',
  execute: async (ctx: WorkflowContext) => {
    const { payload } = ctx;
    // 비즈니스 로직 구현
    const result = await analyzeFile(payload?.filePath as string);
    return { analyzed: true, summary: result.summary };
  },
};
```

### WorkflowContext 구조

```typescript
interface WorkflowContext {
  workflowId: string;    // 현재 워크플로우 ID
  executionId: string;   // 이번 실행 고유 ID
  triggeredAt: Date;     // 실행 시작 시각
  payload?: Record<string, unknown>;  // 트리거 시 전달된 데이터
}
```

스텝 간 데이터를 전달하려면 `payload`를 활용하거나 외부 상태(파일, DB)를 사용하세요.

---

## 에러 처리 전략

| 전략 | 동작 | 언제 사용하나 |
|------|------|--------------|
| `stop` | 실패 시 즉시 중단 | 이후 스텝이 이전 결과에 의존할 때 |
| `continue` | 실패해도 다음 스텝 진행 | 독립적인 스텝들로 구성될 때 |
| `retry` | 최대 N회 재시도 (지수 백오프) | 네트워크 오류 등 일시적 실패 가능성이 있을 때 |

```typescript
// retry 예시
errorHandling: {
  strategy: 'retry',
  maxRetries: 3,
  retryDelayMs: 1000,   // 1초, 2초, 4초로 지수 증가
  notifyOnFailure: true,
}
```

---

## 워크플로우 등록 및 실행

```typescript
import { WorkflowOrchestrator } from './src/workflows/orchestrator';

const orchestrator = new WorkflowOrchestrator();

// 등록
orchestrator.registerWorkflow(myWorkflow);

// 수동 실행
const result = await orchestrator.executeWorkflow('my-workflow', {
  source: 'manual',
  date: new Date().toISOString(),
});

console.log(result.status);        // 'completed' | 'failed'
console.log(result.stepResults);   // 각 스텝 결과 배열
console.log(result.totalDurationMs);
```

---

## 실전 예제: 블로그 자동 발행

```typescript
import { WorkflowOrchestrator } from './src/workflows/orchestrator';
import type { WorkflowStep } from './src/types/workflow';

const fetchInsightStep: WorkflowStep = {
  id: 'fetch-insight',
  name: '새 인사이트 조회',
  execute: async () => {
    // vault/Insights/ 에서 오늘 작성된 파일 조회
    return { files: ['insight-2026.md'] };
  },
};

const publishStep: WorkflowStep = {
  id: 'publish',
  name: '웹사이트 게시',
  execute: async () => {
    // WebsiteDeployer.buildSite() + deployToVercel() 호출
    return { deployed: true, url: 'https://my-site.vercel.app' };
  },
};

const orchestrator = new WorkflowOrchestrator();
orchestrator.registerWorkflow({
  id: 'auto-publish',
  name: '인사이트 자동 게시',
  steps: [fetchInsightStep, publishStep],
  triggers: [{ type: 'event', event: 'insight:created' }],
  errorHandling: { strategy: 'stop', notifyOnFailure: true },
});
```

---

## 더 알아보기

- [사전 정의 워크플로우 목록](../examples/example-workflow.json)
- [전체 타입 정의](../src/types/workflow.ts)
- [WorkflowOrchestrator API](../src/workflows/orchestrator.ts)
