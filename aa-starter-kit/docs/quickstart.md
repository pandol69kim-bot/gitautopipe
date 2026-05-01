# 빠른 시작 가이드

셀피시 클럽 AI 에이전트 협업 시스템을 5분 안에 시작하는 방법입니다.

---

## 사전 요구사항

- **Node.js** 18.0.0 이상
- **npm** 8.0.0 이상
- **Obsidian** (볼트 관리용)
- API 키: Anthropic, GitHub (Notion, Vercel은 선택)

---

## 1단계: 프로젝트 설치

```bash
# 저장소 클론
git clone https://github.com/your-org/selfishclub-codex.git
cd selfishclub-codex

# 의존성 설치
npm install
```

---

## 2단계: 환경 설정

```bash
# .env.example을 복사해 .env 파일 생성
cp .env.example .env
```

`.env` 파일을 열어 아래 항목을 필수로 입력하세요:

```env
ANTHROPIC_API_KEY=sk-ant-api03-...   # Claude API 키
GITHUB_TOKEN=ghp_...                 # GitHub Personal Access Token
GITHUB_OWNER=your-username
GITHUB_REPO=your-repo-name
```

> **API 키 발급 방법**은 [아래 섹션](#api-키-발급-방법)을 참고하세요.

---

## 3단계: 볼트 초기화

```bash
# 초기 설정 스크립트 실행
npx ts-node aa-starter-kit/scripts/setup.ts
```

실행하면 다음이 자동으로 생성됩니다:
- `vault/Mission/` — 미션 템플릿
- `vault/Meetings/` — 미팅 노트 템플릿
- `vault/Skills/` — 스킬 템플릿
- `vault/Insights/` — 인사이트 템플릿
- `selfish-club.config.json` — 시스템 설정

---

## 4단계: Obsidian 볼트 연결

1. Obsidian 실행 → **Open folder as vault**
2. 위에서 생성된 `vault/` 폴더 선택
3. 템플릿 확인: `vault/Mission/daily-mission.md` 등

---

## 5단계: 첫 번째 실행

```bash
# 시스템 상태 확인
npm run dev -- status

# 또는 CLI로 직접 실행
npx ts-node src/cli/index.ts status
```

정상 출력 예시:
```
workflows  4개 등록됨
schedules  1개 (weeklyDigest: 매주 월요일 09:00)
```

---

## 6단계: 첫 번째 워크플로우 실행

```bash
# 미션 업데이트 워크플로우 테스트
npx ts-node src/cli/index.ts workflow onMissionUpdate

# 시스템 상태 JSON으로 확인
npx ts-node src/cli/index.ts status --output json
```

---

## API 키 발급 방법

### Anthropic (Claude)
1. [console.anthropic.com](https://console.anthropic.com) 접속
2. **API Keys** 메뉴 → **Create Key**
3. 발급된 키를 `ANTHROPIC_API_KEY`에 입력

### GitHub Personal Access Token
1. GitHub → **Settings** → **Developer settings** → **Personal access tokens**
2. **Generate new token (classic)**
3. 권한 체크: `repo`, `workflow`
4. 발급된 토큰을 `GITHUB_TOKEN`에 입력

### Notion Integration Token (선택)
1. [notion.so/my-integrations](https://www.notion.so/my-integrations) 접속
2. **New integration** 생성
3. 발급된 토큰을 `NOTION_API_KEY`에 입력
4. Notion 미팅 데이터베이스에 Integration 연결

---

## 다음 단계

- [커스텀 워크플로우 작성](./custom-workflow.md)
- [문제 해결 FAQ](./faq.md)
- [비개발자 가이드](./no-code-guide.md)
