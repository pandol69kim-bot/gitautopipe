# FLOW CHART

작성일: 2026-05-01  
프로젝트: 셀피시 클럽 AI 에이전트 협업 시스템  
버전: v1.1

> 상세 실행 흐름은 `프로그램 흐름도.md` 참고. 본 문서는 비즈니스 레벨 플로우를 정의한다.

---

## 1. 전체 시스템 플로우

```mermaid
flowchart TB
    User[사용자] --> CLI[CLI 명령 입력]
    CLI --> Security{보안 검사}
    Security -- 실패 --> AuditFail[감사 로그 후 종료]
    Security -- 통과 --> Dispatch[명령 디스패치]

    Dispatch --> Scan[볼트 스캔]
    Dispatch --> Sync[동기화]
    Dispatch --> Analyze[AI 분석]
    Dispatch --> Deploy[배포]
    Dispatch --> Workflow[워크플로우]
    Dispatch --> Status[상태 조회]

    Scan --> Output[결과 포맷 출력]
    Sync --> Output
    Analyze --> Output
    Deploy --> Output
    Workflow --> Output
    Status --> Output

    Output --> AuditOK[감사 로그 기록]
    AuditOK --> User
```

---

## 2. Mission 업데이트 자동화 플로우 (`onMissionUpdate`)

```mermaid
flowchart LR
    MissionFile[Mission 파일 변경] --> Event[mission-updated 이벤트]
    Event --> Orchestrator[워크플로우 오케스트레이터]
    Orchestrator --> Step1[mission-log 수집]
    Step1 --> Step2[claude-analyze 분석]
    Step2 --> Step3[linkedin-draft 생성]
    Step3 --> Done[완료]
```

---

## 3. 미팅 동기화 플로우 (`onMeetingSync`)

```mermaid
flowchart LR
    NotionDB[(Notion DB)] --> Step1[notion-fetch 조회]
    Step1 --> Step2[obsidian-sync 동기화]
    Step2 --> Step3[report-update 업데이트]
    Step3 --> Done[완료]
```

---

## 4. 스킬 배포 플로우 (`onSkillUpdate`)

```mermaid
flowchart LR
    SkillFile[Skill 파일 변경] --> Event[skill-updated 이벤트]
    Event --> Step1[site-build 빌드]
    Step1 --> Step2[vercel-deploy 배포]
    Step2 --> Step3[deploy-notify 알림]
    Step3 --> Done[완료]
```

---

## 5. 주간 다이제스트 플로우 (`weeklyDigest` — 매주 월요일 09:00)

```mermaid
flowchart LR
    Cron[cron 매주 월 09시] --> Step1[vault-scan 수집]
    Step1 --> Step2[weekly-report 생성]
    Step2 --> Step3[github-commit 커밋]
    Step3 --> Step4[digest-notify 알림]
    Step4 --> Done[완료]
```

---

## 6. 보안 처리 플로우

```mermaid
flowchart TB
    CLI[CLI 명령] --> Auth[권한 확인 authorizeAccess]
    Auth -- denied --> Fail[에러 종료]
    Auth -- allowed --> Rate[Rate Limit 확인]
    Rate -- exceeded --> Fail
    Rate -- ok --> Secrets[필수 시크릿 검증]
    Secrets -- missing --> Fail
    Secrets -- valid --> Handler[명령 핸들러 실행]
    Handler -- error --> Fail
    Handler -- success --> AuditOK[감사 로그 success]
    Fail --> AuditFail[감사 로그 failure]
```

---

## 7. 워크플로우 Step 오류 처리 플로우

```mermaid
flowchart TB
    Step[Step 실행] --> Result{결과}
    Result -- 성공 --> Next[다음 Step]
    Result -- 실패 --> Policy{오류 처리 전략}
    Policy -- stop --> Fail[워크플로우 실패 종료]
    Policy -- continue --> Next
    Policy -- retry --> Retry[재시도]
    Retry --> Step
    Next --> Check{마지막 Step?}
    Check -- No --> Step
    Check -- Yes --> Done[워크플로우 완료]
```

---

## 8. 변경 이력

| 버전 | 날짜 | 변경 내용 | 작성자 |
|------|------|-----------|--------|
| v1.0 | 2026-05-01 | 최초 작성 | 피터판돌 |
| v1.1 | 2026-05-01 | Mermaid 문법 오류 수정 (콜론 라벨, \n 제거) | 피터판돌 |
