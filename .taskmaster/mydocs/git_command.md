# Git 수정에 사용된 명령어

아래 명령은 `.env_bk`를 추적 제외하고, 기존 히스토리에서 제거한 뒤 검증할 때 사용했다.

## 1. 현재 상태 확인

```powershell
git rev-parse --abbrev-ref HEAD
git log --oneline --decorate --graph --max-count=6
git show --name-status --oneline a0ca434 -- .env_bk
git rev-list --all --objects | Select-String ".env_bk"
git status -sb
```

## 2. 히스토리 재작성 전 임시 보관

```powershell
git stash push -m "temp-before-history-rewrite" .gitignore
```

## 3. `.env_bk`를 히스토리에서 제거

```powershell
git filter-branch --force --index-filter 'git rm --cached --ignore-unmatch .env_bk' --prune-empty --tag-name-filter cat -- main
```

## 4. 백업 참조 정리 및 변경 복원

```powershell
git update-ref -d refs/original/refs/heads/main
git stash pop
git reflog expire --expire=now --all
git gc --prune=now
```

## 5. 최종 검증

```powershell
git status -sb
git check-ignore -v .env_bk
git log --oneline --decorate --graph --max-count=4
git rev-list --left-right --count origin/main...main
git rev-list --all --objects | Select-String " \.env_bk$"
```

## 참고

- 현재 워크트리에 남아 있는 변경은 `.gitignore`의 `.env_bk` ignore 규칙 추가다.
- 원격 반영이 필요하면 이후 `git add .gitignore`, `git commit`, `git push --force-with-lease` 순서로 진행하면 된다.
