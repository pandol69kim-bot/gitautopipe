# onGitHubSync failed 원인파악 정리

## 대상 명령
```bash
node ./dist/cli/index.js workflow onGitHubSync
```

## 현상
명령 실행 시 워크플로우가 `failed` 상태로 종료됐다.

실패 당시 step 결과 요약
- `github-pull`: 완료
- `github-status`: 완료
- `github-commit-push`: 실패

실패 메시지
```text
The following paths are ignored by one of your .gitignore files:
vault/.obsidian
hint: Use -f if you really want to add them.
hint: Disable this message with "git config set advice.addIgnoredFile false"
```

## 직접 원인
`vault/.obsidian/workspace.json` 파일이 변경 목록에 포함되었고, 이후 커밋 단계에서 이 경로를 그대로 `git add` 하면서 Git이 `.gitignore` 대상 경로라며 오류를 반환했다.

## 상세 원인 흐름
1. `github-pull` 단계는 정상 수행됐다.
2. `github-status` 단계에서 변경 파일로 `vault/.obsidian/workspace.json`이 수집됐다.
3. 이 파일은 `.gitignore`에서 `vault/.obsidian/`로 제외되고 있었다.
4. `github-commit-push` 단계가 변경 목록을 그대로 `git add`에 넘겼다.
5. Git은 ignore 대상 파일을 add 할 수 없어 예외를 발생시켰다.
6. 그 결과 전체 `onGitHubSync` 워크플로우가 `failed`로 종료됐다.

## 코드상 문제 지점
- `src/workflows/orchestrator.ts`
- `onGitHubSync` 워크플로우의 `github-status`, `github-commit-push` 단계
- `src/integrations/github.ts`
- `commitAndPush()`가 전달된 파일 목록을 그대로 `git add` 하던 구조

## 왜 발생했는가
문제의 핵심은 "변경 파일"과 "실제로 커밋 가능한 파일"을 같은 것으로 취급한 점이다.

Git 상태 조회에서는 작업 디렉터리의 변경이 보일 수 있지만, 그 중 일부는 `.gitignore` 규칙 때문에 스테이징 대상이 아니다. 기존 구현은 이 구분 없이 수집된 경로를 전부 커밋 대상으로 넘기고 있었다.

## 조치 내용
다음 방식으로 수정했다.

### 1. ignore 파일 필터 추가
- `src/integrations/github.ts`
- `filterIgnoredFiles()` 추가
- `simple-git`의 `checkIgnore()`를 사용해 `.gitignore` 대상 파일 제외

### 2. 워크플로우 단계 보강
- `src/workflows/orchestrator.ts`
- `onGitHubSync`가 상태 확인 시 실제 스테이징 가능한 파일만 집계하도록 수정
- ignore 파일만 변경된 경우 `변경 사항 없음 — 커밋 생략`으로 종료하도록 수정

### 3. 회귀 테스트 추가
- `src/integrations/github.test.ts`
- `src/workflows/orchestrator.test.ts`
- ignore 파일 포함 시 실패하지 않는지 검증 추가

## 수정 후 검증 결과
실행한 검증
```bash
npm test -- src/integrations/github.test.ts src/workflows/orchestrator.test.ts
npm run build
node ./dist/cli/index.js workflow onGitHubSync
```

검증 결과
- 관련 테스트 통과
- 빌드 성공
- 동일 명령 재실행 시 더 이상 ignore 오류가 발생하지 않음
- 워크플로우 정상 완료
- 실제 커밋/푸시 성공

## 결론
이번 실패의 직접 원인은 `vault/.obsidian/workspace.json` 같은 `.gitignore` 대상 파일을 커밋 후보에 포함시킨 상태로 `git add`를 수행한 것이다.

근본 원인은 워크플로우가 "변경 감지"와 "커밋 가능 여부 판단"을 분리하지 않았던 설계에 있었다. 수정 후에는 ignore 대상 파일을 미리 걸러내도록 변경해 동일 문제가 재발하지 않도록 했다.
