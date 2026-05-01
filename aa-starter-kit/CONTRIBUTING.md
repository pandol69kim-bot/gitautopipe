# 기여 가이드 (CONTRIBUTING)

셀피시 클럽 AA 스타터 키트에 기여해주셔서 감사합니다!

---

## 기여 방법

### 버그 리포트

1. [GitHub Issues](https://github.com/your-org/selfishclub-codex/issues) 접속
2. **New Issue** → **Bug Report** 선택
3. 아래 정보를 포함해 작성:
   - 운영체제 및 Node.js 버전
   - 재현 가능한 최소 코드 또는 명령어
   - 예상 동작 vs 실제 동작
   - 에러 메시지 전체

### 기능 제안

1. GitHub Issues → **Feature Request** 선택
2. 제안하는 기능과 사용 시나리오를 구체적으로 작성
3. 가능하면 유사 사례(링크)도 첨부

### Pull Request

1. **저장소 Fork**
2. 기능 브랜치 생성:
   ```bash
   git checkout -b feat/my-feature
   ```
3. 코드 작성 (아래 개발 가이드 참고)
4. 테스트 실행 및 통과 확인:
   ```bash
   npm test
   ```
5. 커밋 메시지 규칙 준수:
   ```
   feat: 새 기능 설명
   fix: 버그 수정 설명
   docs: 문서 업데이트
   test: 테스트 추가/수정
   refactor: 리팩토링
   chore: 빌드/설정 변경
   ```
6. PR 생성 → 설명 작성 → 리뷰 요청

---

## 개발 환경 설정

```bash
git clone https://github.com/your-org/selfishclub-codex.git
cd selfishclub-codex
npm install
cp .env.example .env
# .env에 테스트용 API 키 입력
```

---

## 코드 스타일

- **언어**: TypeScript (strict 모드)
- **포맷터**: Prettier (`npm run format`)
- **린터**: ESLint (`npm run lint`)
- **함수 크기**: 50줄 이하 권장
- **파일 크기**: 800줄 이하 권장
- **불변성**: 객체 직접 수정 금지, 새 객체 반환

---

## 테스트 가이드

- **최소 커버리지**: 80%
- **TDD**: 테스트 먼저 작성 후 구현
- **테스트 실행**:
  ```bash
  npm test              # 전체 테스트
  npm run test:watch    # 변경 감지 모드
  ```

---

## 리뷰 기준

PR이 병합되려면 다음을 충족해야 합니다:

- [ ] 모든 테스트 통과
- [ ] 새 기능에 테스트 포함
- [ ] 하드코딩된 비밀값 없음
- [ ] 기존 API와 호환성 유지
- [ ] 관련 문서 업데이트

---

## 행동 강령

- 서로 존중하고 건설적인 피드백을 주세요.
- 다양한 배경의 기여자를 환영합니다.
- 차별적 언어나 행동은 허용되지 않습니다.
