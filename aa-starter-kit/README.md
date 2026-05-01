# AA Starter Kit — 셀피시 클럽 AI 에이전트 협업 시스템

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](./LICENSE)
[![Node.js](https://img.shields.io/badge/Node.js-18%2B-green)](https://nodejs.org)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.x-blue)](https://www.typescriptlang.org)

Obsidian 볼트 기반의 개인 지식 관리와 AI 자동화를 연결하는 스타터 키트입니다.  
Claude AI, GitHub, Notion, Vercel을 하나의 워크플로우로 통합합니다.

---

## 주요 기능

| 기능 | 설명 |
|------|------|
| **볼트 스캐너** | Obsidian 폴더 구조 자동 감지 및 파싱 |
| **Claude 분석** | 마크다운 문서 자동 분석 및 요약 |
| **LinkedIn 초안** | 미션/인사이트 기반 게시물 자동 생성 |
| **Notion 동기화** | 미팅 노트 양방향 동기화 |
| **Vercel 배포** | Skill/Insight 정적 사이트 자동 배포 |
| **워크플로우 오케스트레이터** | 이벤트·Cron 기반 자동화 파이프라인 |
| **CLI 인터페이스** | `selfish-club` 명령어로 전체 시스템 제어 |

---

## 빠른 시작

```bash
git clone https://github.com/your-org/selfishclub-codex.git
cd selfishclub-codex
npm install
cp .env.example .env   # API 키 입력
npx ts-node aa-starter-kit/scripts/setup.ts
npm run dev -- status
```

CLI 명령은 `vault/` 폴더가 아니라 저장소 루트에서 실행해야 합니다.

자세한 내용은 [빠른 시작 가이드](./docs/quickstart.md)를 참고하세요.

---

## 프로젝트 구조

```
aa-starter-kit/
├── templates/              # Obsidian 볼트 템플릿
│   ├── Mission/            # 미션 일지 템플릿
│   ├── Meetings/           # 미팅 노트 템플릿
│   ├── Skills/             # 스킬 문서 템플릿
│   └── Insights/           # 인사이트 템플릿
├── scripts/
│   └── setup.ts            # 초기 설정 스크립트
├── docs/
│   ├── quickstart.md       # 빠른 시작 가이드
│   ├── custom-workflow.md  # 커스텀 워크플로우 가이드
│   ├── faq.md              # 자주 묻는 질문
│   └── no-code-guide.md    # 비개발자 가이드
├── examples/
│   └── example-workflow.json  # 예제 워크플로우
└── .env.example            # 환경 변수 템플릿
```

---

## 사전 요구사항

- Node.js 18.0.0 이상
- Anthropic API 키 (Claude)
- GitHub Personal Access Token
- Obsidian (볼트 관리)
- Notion Integration Token (선택)
- Vercel Token (선택)

---

## 사전 정의 워크플로우

| ID | 트리거 | 설명 |
|----|--------|------|
| `onMissionUpdate` | `mission:updated` 이벤트 | 미션 변경 → Claude 분석 → LinkedIn 초안 |
| `onMeetingSync` | `meeting:synced` 이벤트 | Notion → Obsidian 미팅 동기화 |
| `onSkillUpdate` | `skill:updated` 이벤트 | Skill 문서 → Vercel 자동 배포 |
| `weeklyDigest` | 매주 월요일 09:00 | 주간 요약 보고서 생성 및 GitHub 커밋 |

---

## 문서

- [빠른 시작 가이드](./docs/quickstart.md)
- [커스텀 워크플로우 작성 가이드](./docs/custom-workflow.md)
- [자주 묻는 질문 (FAQ)](./docs/faq.md)
- [비개발자 가이드](./docs/no-code-guide.md)

---

## 기여하기

[CONTRIBUTING.md](./CONTRIBUTING.md)를 참고해주세요.

---

## 라이선스

[MIT License](./LICENSE) — 자유롭게 사용, 수정, 배포하실 수 있습니다.
