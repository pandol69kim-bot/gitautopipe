# API 설계서

작성일: 2026-05-01  
프로젝트: 셀피시 클럽 AI 에이전트 협업 시스템  
버전: v1.0

> 본 시스템은 외부 HTTP API 서버가 아닌 CLI + 내부 모듈 인터페이스 기반이다.  
> 이 문서는 각 모듈의 함수 인터페이스(내부 API)와 외부 서비스 API 연동 명세를 정의한다.

---

## 1. CLI 명령 인터페이스

| 명령 | 옵션 | 반환 타입 | 설명 |
|------|------|-----------|------|
| `scan` | `--output <format>` | `VaultScanResult` | 볼트 스캔 |
| `sync [target]` | `--output <format>` | `SyncResult` | GitHub/Notion 동기화 |
| `analyze` | `--output <format>` | `AnalysisReport` | Claude AI 분석 |
| `deploy` | `--output <format>` | `DeployResult` | Vercel 배포 |
| `workflow <id>` | `--output <format>`, `--payload <json>` | `ExecutionResult` | 워크플로우 실행 |
| `status` | `--output <format>` | `StatusResult` | 등록된 워크플로우 상태 |

---

## 2. 내부 모듈 API

### 2.1 VaultScanner (`src/core/vault-scanner.ts`)

```typescript
interface VaultScanner {
  scan(vaultPath: string): Promise<VaultScanResult>;
}

interface VaultScanResult {
  files: VaultFile[];
  totalCount: number;
  scannedAt: string; // ISO 8601
}

interface VaultFile {
  path: string;
  name: string;
  frontmatter: Record<string, unknown>;
  content: string;
  modifiedAt: string;
}
```

---

### 2.2 WorkflowOrchestrator (`src/workflows/orchestrator.ts`)

```typescript
interface WorkflowOrchestrator {
  registerWorkflow(workflow: WorkflowDefinition): void;
  executeWorkflow(workflowId: string, payload?: unknown): Promise<ExecutionResult>;
  emit(event: string, payload?: unknown): void;
  scheduleWorkflow(workflowId: string): void;
  getStatus(): StatusResult;
}

interface WorkflowDefinition {
  id: string;
  name: string;
  trigger: { type: 'event' | 'cron'; value: string };
  steps: WorkflowStep[];
  errorHandling: { strategy: 'stop' | 'continue' | 'retry' };
}

interface ExecutionResult {
  workflowId: string;
  executionId: string;
  status: 'completed' | 'failed';
  steps: StepResult[];
  triggeredAt: string;
  completedAt: string;
}
```

---

### 2.3 SecurityWrapper (`src/cli/security.ts`)

```typescript
interface SecurityWrapper {
  executeCliCommand<T>(
    command: string,
    resource: string,
    requiredSecrets: string[],
    handler: () => Promise<T>
  ): Promise<T>;
}
```

---

### 2.4 SecretManager (`src/security/secret-manager.ts`)

```typescript
interface SecretManager {
  loadSecrets(source: 'env'): Promise<Record<string, string>>;
  getSecret(key: string): string | undefined;
  validateRequired(keys: string[]): void; // throws if missing
}
```

---

### 2.5 AuditLogger (`src/security/audit-logger.ts`)

```typescript
interface AuditLogger {
  log(entry: AuditEntry): void;
}

interface AuditEntry {
  timestamp: string;
  actor: string;
  command: string;
  resource: string;
  status: 'success' | 'failure';
  reason?: string;
}
```

---

## 3. 외부 서비스 API 연동

### 3.1 Claude API (`src/integrations/claude.ts`)

| 항목 | 내용 |
|------|------|
| SDK | `@anthropic-ai/sdk` |
| 인증 | `CLAUDE_API_KEY` 환경변수 |
| 주요 호출 | `messages.create()` |
| 입력 | Mission 파일 텍스트 |
| 출력 | 분석 인사이트 텍스트 |

---

### 3.2 GitHub API (`src/integrations/github.ts`)

| 항목 | 내용 |
|------|------|
| SDK | `@octokit/rest` |
| 인증 | `GITHUB_TOKEN` 환경변수 |
| 주요 호출 | `repos.createOrUpdateFileContents()` |
| 입력 | 파일 경로, 내용, 커밋 메시지 |
| 출력 | 커밋 SHA |

---

### 3.3 Notion API (`src/integrations/notion.ts`)

| 항목 | 내용 |
|------|------|
| SDK | `@notionhq/client` |
| 인증 | `NOTION_API_KEY` 환경변수 |
| 주요 호출 | `databases.query()` |
| 입력 | `NOTION_DATABASE_ID` |
| 출력 | 미팅 페이지 목록 |

---

### 3.4 Vercel API (`src/workflows/website-deployer.ts`)

| 항목 | 내용 |
|------|------|
| 인증 | `VERCEL_TOKEN` 환경변수 |
| 주요 호출 | Vercel Deploy Hook URL POST |
| 입력 | 빌드 트리거 이벤트 |
| 출력 | 배포 ID, 배포 URL |

---

## 4. 환경변수 목록

| 변수명 | 필수 여부 | 설명 |
|--------|-----------|------|
| `CLAUDE_API_KEY` | 필수 | Anthropic Claude API 키 |
| `GITHUB_TOKEN` | 필수 | GitHub Personal Access Token |
| `GITHUB_REPO_OWNER` | 필수 | GitHub 레포지터리 오너 |
| `GITHUB_REPO_NAME` | 필수 | GitHub 레포지터리 이름 |
| `NOTION_API_KEY` | 필수 | Notion Integration 키 |
| `NOTION_DATABASE_ID` | 필수 | Notion 미팅 데이터베이스 ID |
| `VERCEL_TOKEN` | 선택 | Vercel 배포 토큰 |
| `VAULT_PATH` | 선택 | Obsidian 볼트 경로 (기본: `./vault`) |
| `LOG_LEVEL` | 선택 | 로그 레벨 (기본: `info`) |

---

## 5. 변경 이력

| 버전 | 날짜 | 변경 내용 | 작성자 |
|------|------|-----------|--------|
| v1.0 | 2026-05-01 | 최초 작성 | 피터판돌 |
