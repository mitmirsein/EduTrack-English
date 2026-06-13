# EduTrack English — 에이전트 작업 규약

이 파일은 Antigravity, Claude Code 등 코딩 에이전트가 이 프로젝트에서 작업할 때 지켜야 할 규칙입니다.

## 프로젝트 개요

- 중고등 영어 학원 강사용 **로컬 단독 실행형 SPA** (React 19 + Vite, 단일 HTML 빌드).
- 모든 데이터는 브라우저 LocalStorage에 저장됨. 서버·DB 없음.
- 사용자는 **프로그래밍 초심자**이며 Windows 11에서 사용. 설명은 한국어로, 쉬운 용어로.

## 절대 규칙

1. **`src/data/achievementTestData.js`를 직접 수정하지 말 것.**
   자동 생성 파일이다. 시험지 내용을 고치려면 원본 `appendix_test/md/*.md`를 수정한 뒤
   `python3 agents/convert_appendix.py`를 실행해 재생성한다.
2. **`data/` 폴더의 내용을 커밋하지 말 것.** 학생 개인정보이며 `.gitignore`로 차단되어 있다.
3. **LocalStorage 키(`edutrack_*`)와 백업 JSON 구조를 바꾸지 말 것.**
   바꿔야 한다면 기존 데이터 마이그레이션 코드를 반드시 함께 작성한다.
4. **백업 파일에 API Key를 포함시키지 말 것.** (`src/utils/storage.js`의 `backupData` 참고)
5. **새 npm 패키지를 추가하지 말 것.** 의존성 최소(react, react-dom만)가 설계 원칙이다.
   꼭 필요하면 사용자에게 먼저 물어본다.
6. **`start_edutrack.bat`은 반드시 CRLF + UTF-8(chcp 65001 유지)로 저장할 것.**
   `.gitattributes`가 강제하지만, 직접 쓸 때도 깨뜨리지 않는다.

## 작업 후 검증 (필수)

```bash
npm run lint    # ESLint 통과 확인
npm run build   # dist/index.html 단일 파일 생성 확인
```

- `dist/`는 git에 커밋하지 않는다 (GitHub Actions가 Pages로 자동 배포).
- 시험지 md를 수정했다면 `python3 agents/validate_exams.py`로 콘텐츠 검사를 통과시킨다.

## 주요 구조

| 경로 | 역할 |
|------|------|
| `src/App.jsx` | 전체 UI (탭 6개 + 인쇄 모달 3개) |
| `src/utils/storage.js` | LocalStorage 저장/백업/복원 + 룰셋·LLM 진단 생성 |
| `src/components/` | 순수 SVG 차트 (RadarChart, LineChart) |
| `appendix_test/md/` | 성취도 시험지 **원본** (md) |
| `agents/*.py` | md→JS 변환, md→PDF 조판 스크립트 |
| `resource/` | 레벨테스트 PDF 자료실 |

## 도메인 주의사항

- 성적 60점 이상 = 통과, 미만 = 재시험 (학원 규정, 임의 변경 금지. 2026-06-13 80→60 변경, 기준값은 `src/utils/appMeta.js`의 `PASS_THRESHOLD` 한 곳에서 관리).
- 인쇄물(상담지·시험지)은 학부모·학생에게 그대로 나가는 자료 — 문구·영어 정확성이 코드만큼 중요.
- 학생 메모(`memo`)는 내부 관리용이다. 학부모 발송 문구에 자동 포함시키지 않는다.
