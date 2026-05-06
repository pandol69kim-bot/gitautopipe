# 수정내용_git

작성일: 2026-05-06

## 수정 목적

`node ./dist/cli/index.js sync --target github` 명령이 기존에는 `completed`만 출력하고 실제 Git remote push는 하지 않았습니다. 이 명령으로 변경 파일을 커밋하고 `origin/main`으로 push할 수 있도록 CLI GitHub sync 기능을 연결했습니다.

## 수정 파일

| 파일 | 내용 |
| --- | --- |
| `src/cli/commands.ts` | `sync --target github` 실행 시 실제 Git 상태를 읽고, 변경 파일을 커밋/푸시하도록 `GitHubSync` 연결 |
| `수정내용_git.md` | Git 기능 수정 내용 기록 |

## 동작 흐름

```text
node ./dist/cli/index.js sync --target github
  -> .env 로드
  -> CLI 보안 검사
  -> git status 확인
  -> 변경 파일 목록 생성
  -> origin remote URL에서 owner/repo 추출
  -> 현재 브랜치 확인
  -> GitHubSync.sync()
     -> git pull origin <branch>
     -> 충돌 확인
     -> git add <changed files>
     -> git commit -m "sync: <ISO timestamp>"
     -> git push origin <branch>
  -> 결과 출력
```

## 환경 변수

기본값은 Git 설정에서 자동 추론합니다.

| 변수 | 설명 |
| --- | --- |
| `GITHUB_TOKEN` | 필수. CLI 보안 검사 및 GitHubSync 설정에 사용 |
| `GITHUB_BRANCH` | 선택. 없으면 현재 로컬 브랜치 사용 |
| `GITHUB_REMOTE_URL` | 선택. 없으면 `origin` remote URL 사용 |
| `GITHUB_OWNER` | 선택. 없으면 remote URL에서 추출 |
| `GITHUB_REPO` | 선택. 없으면 remote URL에서 추출 |

## 주의 사항

- 변경 파일이 없으면 커밋/푸시하지 않고 성공 결과를 반환합니다.
- `.gitignore`에 포함되지 않은 미추적 파일은 커밋 대상이 될 수 있습니다.
- 기본 제외 대상: `.claude/`, `.git/`, `node_modules/`, `vault/.obsidian/`
- 현재 워킹트리에 새 meeting 파일, 문서 파일 등이 미추적 상태로 남아 있으므로 실제 sync 실행 전 포함/제외 범위를 확인하는 것이 좋습니다.
