# Notion 양방향 동기화 수정 내용

## 목적

프로젝트 기획 기준에 맞춰 Notion과 Obsidian Meetings 폴더를 양방향으로 동기화하도록 구현을 보완했다.

기존 상태:

- `sync --target notion` 명령은 완료 메시지만 반환하고 실제 양방향 동기화를 수행하지 않았다.
- Notion 조회는 `client.databases.query()`를 사용하고 있었는데, 현재 설치된 `@notionhq/client` 버전에서는 `dataSources.query()` 경로를 사용해야 한다.
- 워크플로우 `onNotionSync`는 Notion -> Obsidian 단방향 저장만 수행했다.

수정 후 상태:

- `sync --target notion`이 실제 양방향 동기화를 수행한다.
- `onNotionSync` 워크플로우도 같은 양방향 동기화 로직을 사용한다.
- 최신 Notion SDK 경로(`dataSources.query`)를 우선 사용하고, 필요 시 구형 `databases.query`도 fallback으로 지원한다.

## 수정 파일

- `src/integrations/notion.ts`
- `src/integrations/notion-sync.ts`
- `src/cli/commands.ts`
- `src/workflows/orchestrator.ts`
- `.env.example`

## 주요 변경 사항

### 0. Notion ID 진단 명령 추가

아래 명령을 추가했다.

```powershell
node .\dist\cli\index.js notion-check --output json
```

선택적으로 직접 ID나 URL을 넣을 수도 있다.

```powershell
node .\dist\cli\index.js notion-check --id https://www.notion.so/...
```

진단 항목:

- raw 입력값
- 정규화된 ID
- database 조회 가능 여부
- data source 조회 가능 여부
- 권한/공유 관련 가이드 메시지

### 1. Notion SDK 조회 경로 수정

`fetchMeetings()`가 아래 순서로 조회한다.

1. `client.dataSources.query({ data_source_id })`
2. fallback: `client.databases.query({ database_id })`

이제 최신 `@notionhq/client`에서도 조회가 가능하다.

추가로 `NOTION_DATABASE_ID`에 아래 형식이 들어와도 자동 정규화하도록 보완했다.

- 하이픈 없는 32자리 ID
- 하이픈 포함 UUID
- Notion 전체 URL

예:

```text
https://www.notion.so/356ce5bf5072808cb2f3ed6c2913e96f
```

위 값도 내부에서:

```text
356ce5bf-5072-808c-b2f3-ed6c2913e96f
```

형태로 변환해서 사용한다.

### 2. Obsidian -> Notion 업로드 시 create/update 모두 지원

`syncFromObsidian()` 동작:

- Markdown frontmatter에 `notionId`가 있으면 기존 Notion 페이지를 업데이트
- `notionId`가 없거나 기존 페이지를 찾지 못하면 새 페이지 생성
- 새 페이지를 만들면 로컬 Markdown frontmatter에 `notionId`를 다시 기록

### 3. 기존 Notion 페이지 업데이트 시 본문 교체

기존 페이지를 업데이트할 때:

- 페이지 title 업데이트
- 기존 child blocks 조회
- 가능한 경우 기존 blocks 삭제
- Markdown 본문을 다시 block으로 변환해 append

이제 같은 회의 문서가 중복 append만 되는 문제가 줄어든다.

### 4. 실제 양방향 동기화 로직 추가

새 파일 `src/integrations/notion-sync.ts` 추가.

동작 규칙:

- Notion에만 있는 문서: Obsidian으로 다운로드
- Obsidian에만 있는 문서: Notion으로 업로드
- 양쪽에 모두 있고 Notion이 더 최신: Obsidian 파일 갱신
- 양쪽에 모두 있고 Obsidian이 더 최신: Notion 페이지 갱신
- 수정 시간이 같으면 skip

기준 연결 키:

- Markdown frontmatter `notionId`

### 5. CLI 명령 수정

이제 아래 명령은 실제 양방향 동기화를 수행한다.

```powershell
node .\dist\cli\index.js sync --target notion
```

출력에는 다음 요약이 포함된다.

- `remoteFetched`
- `downloadedCreated`
- `downloadedUpdated`
- `uploadedCreated`
- `uploadedUpdated`
- `skipped`

또한:

```powershell
node .\dist\cli\index.js sync --target all
```

명령은 Notion sync와 GitHub sync를 함께 수행하도록 확장했다.

### 6. 워크플로우 수정

`onNotionSync` 워크플로우도 다운로드 전용이 아니라 양방향 sync helper를 사용하도록 변경했다.

## 환경 변수

필수:

- `NOTION_TOKEN`
- `NOTION_DATABASE_ID`

선택:

- `NOTION_OBSIDIAN_PATH`
- `VAULT_PATH`
- `VAULT_FOLDER_MEETINGS`

`.env.example`에도 `NOTION_DATABASE_ID`, `NOTION_OBSIDIAN_PATH` 예시를 추가했다.

## 검증 결과

로컬 검증:

- `npm run typecheck` 통과
- `npm run build` 통과
- `npm run lint` 통과 (기존 warning만 남음)

실행 검증:

```powershell
node .\dist\cli\index.js sync --target notion --output json
```

현재 결과:

- 구현 경로 자체는 실제 Notion API까지 호출됨
- 현재 `.env`에 설정된 `NOTION_DATABASE_ID`는 통합 앱 `gitautopipe`와 공유되지 않았거나 접근 권한이 없음
- Notion 응답: `object_not_found`

오류 메시지 핵심:

```text
Could not find database with ID: 356ce5bf-5072-808c-b2f3-ed6c2913e96f.
Make sure the relevant pages and databases are shared with your integration "gitautopipe".
```

즉 현재 남은 문제는 코드가 아니라 Notion 쪽 설정이다.

## 실제 사용 전 확인 사항

1. 대상 Notion 데이터소스 또는 데이터베이스를 integration `gitautopipe`에 공유
2. `.env`의 `NOTION_DATABASE_ID`가 실제 대상 ID와 일치하는지 확인
3. 다시 실행

```powershell
npm run build
node .\dist\cli\index.js sync --target notion --output json
```
