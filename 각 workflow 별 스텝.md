# 각 workflow 별 스텝

작성일: 2026-05-06
기준 파일: `src/workflows/orchestrator.ts`

---

## 1. onGitHubSync

- 이름: GitHub 동기화
- 트리거: `github:sync` 이벤트
- 에러 처리: `stop`

### 스텝

1. `github-pull`
   - 이름: 원격 최신화 (pull)
   - 설명: 원격 저장소에서 최신 변경을 pull
2. `github-status`
   - 이름: 변경 파일 확인
   - 설명: 수정/생성/삭제 파일 목록과 총 변경 건수 확인
3. `github-commit-push`
   - 이름: 커밋 및 푸시
   - 설명: 변경 파일이 있으면 커밋 메시지를 생성해 push, 없으면 커밋 생략

---

## 2. onNotionSync

- 이름: Notion 동기화
- 트리거: `notion:sync` 이벤트
- 에러 처리: `stop`

### 스텝

1. `notion-sync-bidirectional`
   - 이름: Notion-Obsidian 양방향 동기화
   - 설명: Notion DB와 Obsidian meetings 폴더를 양방향 동기화하고 summary를 payload에 반영

---

## 3. onMissionUpdate

- 이름: Mission 업데이트 처리
- 트리거: `mission:updated` 이벤트
- 에러 처리: `continue`

### 스텝

1. `mission-log`
   - 이름: Mission 파일 변경 감지
2. `claude-analyze`
   - 이름: Claude 분석 실행
3. `linkedin-draft`
   - 이름: LinkedIn 초안 생성

---

## 4. onMeetingSync

- 이름: Notion 미팅 동기화
- 트리거: `meeting:synced` 이벤트
- 에러 처리: `retry`
- 재시도 설정: 최대 2회, 지연 1000ms

### 스텝

1. `notion-fetch`
   - 이름: Notion 미팅 데이터 조회
2. `obsidian-sync`
   - 이름: Obsidian 동기화
3. `report-update`
   - 이름: Analysis 보고서 업데이트

---

## 5. onSkillUpdate

- 이름: Skill/Insight 게시물 배포
- 트리거: `skill:updated` 이벤트
- 에러 처리: `stop`

### 스텝

1. `site-build`
   - 이름: 정적 사이트 빌드
2. `vercel-deploy`
   - 이름: Vercel 배포
3. `deploy-notify`
   - 이름: 배포 알림 전송

---

## 6. weeklyDigest

- 이름: 주간 다이제스트 생성
- 트리거: cron `0 9 * * 1`
- 에러 처리: `continue`
- 기본 스케줄 자동 등록: `0 9 * * 1`

### 스텝

1. `vault-scan`
   - 이름: 볼트 주간 데이터 수집
   - 설명: meetings 폴더를 스캔해 대상 주차 문서를 수집하고 payload에 저장
2. `weekly-report`
   - 이름: 주간 보고서 생성
   - 설명: 수집한 주간 데이터로 Analysis 주간 보고서를 생성하고 `vault/analysis`에 저장
3. `github-commit`
   - 이름: GitHub 커밋
   - 설명: GitHub 환경 변수가 준비되어 있으면 생성된 보고서를 커밋/푸시하고, 없으면 skip
4. `digest-notify`
   - 이름: 다이제스트 알림 전송
   - 설명: 보고서 경로와 GitHub 처리 상태를 기준으로 알림용 요약 정보를 정리

### 실행 흐름

1. `node ./dist/cli/index.js workflow weeklyDigest` 실행
2. CLI 보안 검증에서 workflow 실행 권한과 AI 시크릿 그룹 확인
3. `runWorkflow()`가 `orchestrator.executeWorkflow('weeklyDigest')` 호출
4. `vault-scan`이 주간 meetings 데이터를 payload에 적재
5. `weekly-report`가 Analysis 주간 보고서 파일 생성
6. `github-commit`이 GitHub 설정 존재 시 커밋/푸시, 없으면 skip
7. `digest-notify`가 최종 요약 정보를 반환
8. CLI가 `executionId`, `status`, `stepResults`, `totalDurationMs`를 출력

---

## 요약 표

| Workflow ID | 스텝 수 | 주요 목적 |
| --- | ---: | --- |
| `onGitHubSync` | 3 | Git pull/status/commit-push |
| `onNotionSync` | 1 | Notion-Obsidian 양방향 동기화 |
| `onMissionUpdate` | 3 | Mission 분석 및 LinkedIn 초안 |
| `onMeetingSync` | 3 | 미팅 동기화 후 보고서 갱신 |
| `onSkillUpdate` | 3 | 사이트 빌드 및 배포 |
| `weeklyDigest` | 4 | 주간 데이터 수집 및 요약 생성 |
