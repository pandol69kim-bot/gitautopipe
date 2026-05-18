# 수정작업 - 2026-05-18

## 개요
`node ./dist/cli/index.js workflow onGitHubSync` 실행 시 `.gitignore` 대상 파일인 `vault/.obsidian/workspace.json`까지 커밋 대상으로 잡혀 `git add` 단계에서 실패하던 문제를 수정했다.

## 수정 내용

### 1. ignore 파일 필터링 추가
- `src/integrations/github.ts`
- `filterIgnoredFiles()` 메서드 추가
- `simple-git`의 `checkIgnore()`를 사용해 `.gitignore` 대상 파일을 커밋 후보에서 제외하도록 수정

### 2. onGitHubSync 워크플로우 보강
- `src/workflows/orchestrator.ts`
- `github-status` 단계가 실제로 스테이징 가능한 파일만 집계하도록 수정
- `github-commit-push` 단계가 ignore 파일만 변경된 경우 `변경 사항 없음 — 커밋 생략`으로 종료하도록 수정
- 사전 정의된 GitHub 워크플로우가 주입된 `GitHubSync` 의존성을 사용하도록 정리

### 3. 회귀 테스트 추가
- `src/integrations/github.test.ts`
- `src/workflows/orchestrator.test.ts`
- ignore 대상 파일이 변경 목록에 있어도 커밋 대상에서 제외되는지 검증
- ignore 파일만 변경된 경우 `onGitHubSync`가 실패하지 않고 커밋을 건너뛰는지 검증

## 원인 분석
- `github-status` 단계에서 변경 파일 목록을 단순 수집
- `github-commit-push` 단계에서 해당 목록을 그대로 `git add`에 전달
- `.gitignore` 대상 파일이 포함되면 Git이 add 단계에서 오류를 반환하며 워크플로우가 실패

## 검증 내용

### 테스트
실행 명령
```bash
npm test -- src/integrations/github.test.ts src/workflows/orchestrator.test.ts
```

결과
- 관련 테스트 전체 통과

### 실제 명령 검증
실행 명령
```bash
npm run build
node ./dist/cli/index.js workflow onGitHubSync
```

결과
- 기존 ignore 파일 오류 재현되지 않음
- 워크플로우 정상 완료
- 실제 커밋/푸시 성공
- 커밋 SHA: `2442676aae3f0d384584e157ac7cae127bd964e8`

## 생성 파일
- `수정작업_2026_05_18_onGitHubSync_ignore_파일_제외.md`

## 비고
- 현재 작업 후 `git status --short` 기준으로 `.claude/worktrees/`는 untracked 상태로 남아 있다.
- 이번 수정으로 `.gitignore` 대상 파일만 변경된 경우에도 `onGitHubSync`가 불필요하게 실패하지 않는다.
