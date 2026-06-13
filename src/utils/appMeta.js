// 앱 공용 메타 정보: 성적 유형 라벨과 실행 환경 감지.
// App.jsx와 Dashboard.jsx가 함께 사용한다.

// 성적 유형 표시 라벨. 기준정보(master.gradeTypes)가 1차 source이고,
// 아래 맵은 master에 없는 레거시 type 코드(과거 데이터)의 폴백이다.
export const GRADE_TYPE_LABELS = {
  daily_vocab: '데일리 단어 테스트',
  weekly_test: '주간 종합 고사',
  school_exam: '정기 내신 고사',
  achievement_test: '정기 성취도 테스트',
  level_test: '신입 레벨 테스트'
};

// gradeTypes(master.gradeTypes)를 주면 그 라벨을 우선 사용하고, 없으면 레거시 폴백.
export const gradeTypeLabel = (type, gradeTypes) => {
  if (Array.isArray(gradeTypes)) {
    const found = gradeTypes.find(t => t.key === type);
    if (found) return found.label;
  }
  return GRADE_TYPE_LABELS[type] || '기타 평가';
};

// 학원 규정: 이 점수 이상 = 통과, 미만 = 재시험 (2026-06-13 80→60으로 변경).
// 화면 배지·대시보드 위젯·인쇄 리포트·카톡 피드백이 모두 이 상수를 쓴다.
export const PASS_THRESHOLD = 60;

// 5대 평가 영역 — 레벨테스트 매핑의 section 키와 일치(표준 영역 코드).
// 약점 진단·교안 영역 태그·추천 매칭이 이 코드를 공통으로 쓴다.
export const AREA_LABELS = {
  vocab: '어휘',
  grammar: '문법',
  syntax: '구문',
  reading: '독해',
  writing: '영작'
};
export const AREA_CODES = Object.keys(AREA_LABELS);
export const areaLabel = (code) => AREA_LABELS[code] || code;

// === 실행 방식(데이터 저장 위치) 감지 ===
// LocalStorage는 실행 방식(origin)별로 완전히 분리되므로, 사용자가 방식을 바꾸면
// 데이터가 "사라진 것처럼" 보인다. 현재 방식을 화면에 명시해 오인을 막는다.
// 실행 중에 바뀌지 않는 값이므로 모듈 로드 시 1회만 평가한다.
const detectRunMode = () => {
  if (window.location.protocol === 'file:') {
    return { key: 'file', label: '파일 직접 실행 (더블클릭)' };
  }
  const host = window.location.hostname;
  if (host === 'localhost' || host === '127.0.0.1') {
    return { key: 'local', label: '내 컴퓨터 로컬 서버 (start_edutrack)' };
  }
  return { key: 'web', label: `온라인 웹사이트 (${host})` };
};

export const RUN_MODE = detectRunMode();

export const BROWSER_LABEL = /Edg\//.test(navigator.userAgent)
  ? 'Edge'
  : (/Chrome\//.test(navigator.userAgent) ? 'Chrome' : '기타');
