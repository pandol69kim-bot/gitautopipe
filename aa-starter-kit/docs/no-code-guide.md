# 비개발자를 위한 가이드

코드를 몰라도 셀피시 클럽 AI 에이전트를 사용할 수 있습니다.  
이 가이드는 터미널 명령어만 복사·붙여넣기 하면 됩니다.

---

## 준비물 체크리스트

설치 전 아래 항목을 준비해주세요:

- [ ] **컴퓨터**: Windows 10 이상 또는 macOS 12 이상
- [ ] **인터넷 연결**
- [ ] **Claude API 키** (Anthropic 계정 필요 → [무료 시작](https://console.anthropic.com))
- [ ] **GitHub 계정** ([github.com](https://github.com)에서 무료 가입)
- [ ] **Obsidian** ([obsidian.md](https://obsidian.md)에서 무료 다운로드)
- [ ] 작업 시간: 약 30분

---

## 1단계: 필수 프로그램 설치

### Node.js 설치

1. [nodejs.org](https://nodejs.org) 접속
2. **LTS 버전** 다운로드 클릭 (왼쪽 버튼)
3. 다운로드된 파일 실행 → 계속 "Next" 클릭
4. 설치 완료 후 컴퓨터 재시작

### 터미널 열기

- **Windows**: 시작 메뉴 → `cmd` 검색 → 명령 프롬프트 실행
- **macOS**: Spotlight(Cmd+Space) → `terminal` 검색 → 터미널 실행

터미널에 아래를 입력해 설치 확인:
```
node --version
```
`v18.x.x` 형태의 숫자가 나오면 성공입니다.

---

## 2단계: 프로젝트 다운로드

터미널에 아래 명령어를 한 줄씩 복사해서 붙여넣고 Enter를 누르세요:

```
git clone https://github.com/your-org/selfishclub-codex.git
```
```
cd selfishclub-codex
```
```
npm install
```

`npm install`은 1~3분 정도 걸립니다. 완료되면 다음으로 진행하세요.

---

## 3단계: API 키 설정

### .env 파일 만들기

```
copy .env.example .env
```
(macOS/Linux는 `cp .env.example .env`)

### .env 파일 편집

1. 탐색기(파일 탐색기)에서 프로젝트 폴더 열기
2. `.env` 파일을 메모장으로 열기
   - 파일을 우클릭 → **연결 프로그램** → **메모장**
3. 아래 항목을 찾아 `=` 뒤에 발급받은 키 붙여넣기:

```
ANTHROPIC_API_KEY=여기에_Claude_API_키_붙여넣기
GITHUB_TOKEN=여기에_GitHub_토큰_붙여넣기
GITHUB_OWNER=GitHub_사용자명
GITHUB_REPO=저장소_이름
```

4. 저장(Ctrl+S) 후 메모장 닫기

> **주의**: API 키는 절대 다른 사람에게 공유하지 마세요.

---

## 4단계: 초기 설정 실행

터미널에 입력:

```
npx ts-node aa-starter-kit/scripts/setup.ts
```

아래와 같은 메시지가 나오면 성공입니다:
```
✓ 폴더 생성: vault/Mission
✓ 폴더 생성: vault/Meetings
✓ 초기 설정 완료!
```

---

## 5단계: Obsidian 연결

1. **Obsidian** 실행
2. **Open folder as vault** 클릭
3. 프로젝트 폴더 안의 **`vault`** 폴더 선택
4. 왼쪽 파일 목록에 Mission, Meetings 등 폴더가 보이면 성공

---

## 6단계: 시스템 동작 확인

터미널에 입력:

```
npx ts-node src/cli/index.ts status
```

아래와 같이 워크플로우 목록이 나오면 준비 완료입니다:
```
id              registered  historyCount
onMissionUpdate true        0
weeklyDigest    true        0
...
```

---

## 일상적인 사용법

### 미션 기록 후 LinkedIn 초안 자동 생성

1. Obsidian에서 `vault/Mission/` 에 오늘 미션 작성 및 저장
2. 터미널에 입력:
   ```
   npx ts-node src/cli/index.ts workflow onMissionUpdate
   ```
3. 생성된 LinkedIn 초안 확인

### 주간 다이제스트 수동 실행

```
npx ts-node src/cli/index.ts workflow weeklyDigest
```

### 도움말 보기

```
npx ts-node src/cli/index.ts --help
```

---

## 문제가 생겼을 때

1. [FAQ](./faq.md) 확인
2. 오류 메시지를 복사해서 GitHub Issues에 등록
3. 셀피시 클럽 운영자에게 문의

---

> 이 가이드로도 해결이 안 된다면 개발자 멤버에게 도움을 요청하세요. 처음에는 누구나 어렵습니다!
