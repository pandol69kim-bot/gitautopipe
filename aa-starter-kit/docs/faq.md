# 자주 묻는 질문 (FAQ)

---

## 설치 / 환경 설정

### Q. `npm install` 실행 시 오류가 발생합니다.

**A.** Node.js 버전을 확인하세요.

```bash
node --version  # v18.0.0 이상 필요
```

버전이 낮다면 [Node.js 공식 사이트](https://nodejs.org)에서 LTS 버전을 설치하세요.

---

### Q. `.env` 파일을 만들었는데 API 키가 인식되지 않습니다.

**A.** 다음을 확인하세요:

1. `.env` 파일이 프로젝트 루트에 있는지 확인 (`package.json`과 같은 위치)
2. 키 값에 공백이나 따옴표가 없는지 확인
   ```env
   # 잘못된 예
   ANTHROPIC_API_KEY = "sk-ant-..."
   
   # 올바른 예
   ANTHROPIC_API_KEY=sk-ant-...
   ```
3. `.env` 파일을 수정한 후 서버를 재시작하세요.

---

### Q. `selfish-club.config.json`에 GitHub 정보를 입력했는데 동기화가 안 됩니다.

**A.** GitHub Token 권한을 확인하세요:
- `repo` 권한 (저장소 읽기/쓰기)
- `workflow` 권한 (GitHub Actions 사용 시)

Token 재발급: GitHub → Settings → Developer settings → Personal access tokens

---

## 워크플로우 실행

### Q. `selfish-club workflow weeklyDigest` 실행 시 에러가 납니다.

**A.** 에러 메시지를 확인하세요:

- `워크플로우를 찾을 수 없습니다` → 워크플로우 ID가 올바른지 확인
  ```bash
  selfish-club status  # 등록된 워크플로우 목록 확인
  ```

- `API 오류` → `.env`의 API 키가 유효한지 확인

- 로그 레벨을 높여 상세 오류 확인:
  ```bash
  selfish-club --log-level debug workflow weeklyDigest
  ```

---

### Q. 워크플로우가 중간에 실패하면 어떻게 되나요?

**A.** 에러 처리 전략에 따라 다릅니다:

| 전략 | 동작 |
|------|------|
| `stop` | 실패한 스텝에서 즉시 중단 |
| `continue` | 실패해도 다음 스텝 계속 실행 |
| `retry` | 설정한 횟수만큼 재시도 후 실패 처리 |

실행 이력 확인:
```bash
selfish-club status --output json
```

---

## Notion 연동

### Q. Notion 미팅 데이터가 동기화되지 않습니다.

**A.** 다음 순서로 확인하세요:

1. `NOTION_API_KEY`가 `.env`에 올바르게 설정되어 있는지 확인
2. Notion 데이터베이스에 Integration이 연결되어 있는지 확인
   - Notion 데이터베이스 페이지 → 우측 상단 `...` → **Connections** → Integration 추가
3. `NOTION_MEETINGS_DB_ID`가 올바른지 확인
   - 데이터베이스 URL에서 복사: `notion.so/.../{DATABASE_ID}?v=...`

---

## Vercel 배포

### Q. `selfish-club deploy` 명령어 실행 시 401 오류가 납니다.

**A.** Vercel 토큰을 확인하세요:
1. [vercel.com/account/tokens](https://vercel.com/account/tokens) 에서 토큰 재발급
2. `.env`의 `VERCEL_TOKEN` 업데이트
3. `VERCEL_PROJECT_ID`가 올바른지 확인

---

### Q. LinkedIn 게시물 초안이 3000자를 초과합니다.

**A.** LinkedIn 최대 글자 수는 3000자입니다. 시스템이 자동으로 잘라내지만, 원하는 경우 `src/integrations/linkedin.ts`의 `LINKEDIN_CHAR_LIMIT` 상수를 확인하세요.

---

## 기타

### Q. 로그를 파일로 저장하고 싶습니다.

**A.** CLI 출력을 리다이렉션하세요:

```bash
selfish-club workflow weeklyDigest >> logs/weekly.log 2>&1
```

---

### Q. 기여하거나 버그를 제보하고 싶습니다.

**A.** [CONTRIBUTING.md](../CONTRIBUTING.md)를 참고하거나 GitHub Issues에 등록해주세요.
