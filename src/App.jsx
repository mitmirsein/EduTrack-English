import { useState, useEffect, useRef } from 'react';
import { version as APP_VERSION } from '../package.json';
import {
  storage,
  backupData,
  readBackupFile,
  applyBackupData,
  generateRuleBasedDiagnosis,
  generateLLMDiagnosis,
  generateRuleBasedQuarterlyComment,
  generateLLMQuarterlyComment,
  getStorageUsage,
  setBrand
} from './utils/storage';
import RadarChart from './components/RadarChart';
import LineChart from './components/LineChart';
import Dashboard from './components/Dashboard';
import LockScreen from './components/LockScreen';
import AdminMaster from './components/AdminMaster';
import LectureLibrary from './components/LectureLibrary';
import WeaknessPanel from './components/WeaknessPanel';
import ClassView from './components/ClassView';
import CommunicationTimeline from './components/CommunicationTimeline';
import VocabGuide from './components/VocabGuide';
import { gradeTypeLabel, PASS_THRESHOLD } from './utils/appMeta';
import { getLockSettings, enableLock, verifyPin, disableLock, updateAutoLock, isValidPin } from './utils/lock';
import { achievementTestData } from './data/achievementTestData';
import { levelTestData } from './data/levelTestData';
import { levelTestMapping } from './data/levelTestMapping';
import { achievementTestMapping } from './data/achievementTestMapping';
import { appendixTestData } from './data/appendixTestData';
import { finalTestData1, finalTestData2, allFinalTestData, ACHIEVEMENT_CATALOG, makeFinalTestId, getFinalTestTitle } from './data/finalTestData';

export const APPENDIX_EXAM_MAPPING = {
  ft_elementary_lv1_r1: 'whats_up_plus_level1_1',
  ft_elementary_lv2_r1: 'elementary_set_a',
  ft_elementary_lv2_r2: 'elementary_set_b',
  ft_middle_lv1_r1: 'middle_basic_set_a',
  ft_middle_lv1_r2: 'middle_basic_set_b',
  ft_middle_lv2_r1: 'middle_intermediate_set_a',
  ft_middle_lv2_r2: 'middle_intermediate_set_b',
  ft_middle_lv3_r1: 'middle_advanced_set_a',
  ft_middle_lv3_r2: 'middle_advanced_set_b',
  ft_high_basic_r1: 'high_level_1_set_a',
  ft_high_basic_r2: 'high_level_1_set_b',
};


const SAVE_FAIL_MSG = '저장에 실패했습니다! 브라우저 저장 공간이 가득 찼을 수 있습니다. 즉시 [데이터 전체 백업]을 받아두고 오래된 데이터를 정리해 주세요.';

// 고유 ID 생성: 같은 밀리초에 두 건이 생성되어도 충돌하지 않도록 한다.
const genId = (prefix) => {
  const rand = (typeof crypto !== 'undefined' && crypto.randomUUID)
    ? crypto.randomUUID()
    : `${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
  return `${prefix}_${rand}`;
};

// === 성적 일자 처리 ===
// 저장 형식은 YYYY-MM-DD(정렬 가능), 화면 표시는 MM-DD로 줄인다.
const displayGradeDate = (date) => {
  if (typeof date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(date)) return date.slice(5);
  return date || '';
};

// 날짜순 정렬 사본 반환 (구형 MM-DD 데이터는 뒤로 보내 입력 순서 유지)
const sortGradesByDate = (gradeList) =>
  [...gradeList].sort((a, b) => String(a.date || '').localeCompare(String(b.date || '')));

// 구버전 MM-DD 데이터를 YYYY-MM-DD로 1회 변환한다.
// 연도 추정: 그 날짜가 오늘보다 미래가 되면 작년 성적으로 본다.
const migrateGradeDates = (gradeList) => {
  const today = new Date().toISOString().slice(0, 10);
  const thisYear = today.slice(0, 4);
  let changed = false;
  const migrated = gradeList.map(g => {
    if (typeof g.date === 'string' && /^\d{2}-\d{2}$/.test(g.date)) {
      let full = `${thisYear}-${g.date}`;
      if (full > today) full = `${Number(thisYear) - 1}-${g.date}`;
      changed = true;
      return { ...g, date: full };
    }
    return g;
  });
  return { migrated, changed };
};

// === 시험지 마크다운 파서 유틸리티 ===
const parseExamMarkdown = (mdContent) => {
  if (!mdContent) return { title: '', meta: {}, elements: [] };
  const lines = mdContent.split('\n');
  let title = "";
  const meta = {};
  const elements = [];
  
  let inBlockquote = false;
  let blockquoteLines = [];
  let currentQuestion = null;
  
  const commitCurrentQuestion = () => {
    if (currentQuestion) {
      elements.push(currentQuestion);
      currentQuestion = null;
    }
  };
  
  for (let line of lines) {
    const lineStrip = line.trim();
    
    // 블록쿼트 (지문 박스)
    if (lineStrip.startsWith('>')) {
      commitCurrentQuestion();
      if (!inBlockquote) {
        inBlockquote = true;
        blockquoteLines = [];
      }
      blockquoteLines.push(lineStrip.slice(1).trim());
      continue;
    } else {
      if (inBlockquote) {
        inBlockquote = false;
        elements.push({
          type: 'blockquote',
          content: blockquoteLines.join('\n')
        });
        blockquoteLines = [];
      }
    }
    
    // 타이틀 (# )
    if (line.startsWith('# ')) {
      commitCurrentQuestion();
      title = line.slice(2).trim().replace(/^\[.*?\]\s*/, '');
      continue;
    }
    
    // 메타데이터 (- **키**: 값)
    if (line.startsWith('- ')) {
      const metaMatch = line.match(/^-\s*\*\*([^*]+)\*\*:\s*(.*)/);
      if (metaMatch) {
        commitCurrentQuestion();
        meta[metaMatch[1].trim()] = metaMatch[2].trim();
        continue;
      }
    }
    
    // 수평선 건너뛰기
    if (lineStrip === '---' || lineStrip === '***') {
      commitCurrentQuestion();
      continue;
    }
    
    // 섹션 헤더 (##)
    if (line.startsWith('## ')) {
      commitCurrentQuestion();
      elements.push({
        type: 'section',
        content: line.slice(3).trim()
      });
      continue;
    }
    
    if (!lineStrip) continue;
    
    // 문항 파싱 (숫자. 내용 또는 **숫자. 내용**)
    const qMatch = lineStrip.match(/^(\*\*)?(\d+)\.\s*(.*)/);
    if (qMatch) {
      commitCurrentQuestion();
      let qText = qMatch[3].trim();
      // '**N. 내용**' 형태(문항 전체 볼드)일 때만 끝의 **를 제거한다.
      // 'N. **내용**' 형태에서 끝의 *를 일괄 제거하면 볼드 짝이 깨져 **가 그대로 표시된다.
      if (qMatch[1] && qText.endsWith('**')) {
        qText = qText.slice(0, -2).trimEnd();
      }
      currentQuestion = {
        type: 'question',
        num: qMatch[2],
        text: qText,
        body: [],
        choices: null,
        answer: null
      };
      continue;
    }
    
    // 이미지 마크다운 파싱 (![alt](src))
    const imgMatch = lineStrip.match(/^!\[(.*?)\]\((.*?)\)/);
    if (imgMatch) {
      const imgObj = {
        type: 'image',
        alt: imgMatch[1],
        src: imgMatch[2]
      };
      if (currentQuestion) {
        currentQuestion.body.push(imgObj);
      } else {
        elements.push(imgObj);
      }
      continue;
    }
    
    // 정답 및 모범답안 파싱 (*정답: 또는 *답안:)
    // 반드시 보기 파싱보다 먼저 처리해야 한다 — 정답 줄에는 '④' 같은 보기 기호가
    // 포함되는 경우가 많아, 순서가 바뀌면 정답이 보기로 흡수되어 학생용에 인쇄된다.
    if (lineStrip.startsWith('*정답:') || lineStrip.startsWith('*답안:') || lineStrip.startsWith('정답:') || lineStrip.startsWith('답안:')) {
      const ansMatch = lineStrip.match(/^\*?(정답|답안):\s*(.*)\*?$/);
      if (ansMatch) {
        const ansText = ansMatch[2].replace(/\*$/, '').trim();
        if (currentQuestion) {
          currentQuestion.answer = ansText;
        }
        // currentQuestion이 없으면 버린다 — 정답 줄을 text로 보존하면 학생용에 노출된다.
      }
      continue;
    }

    // 보기 파싱 (① ~ ⑤) — 여러 줄에 걸친 보기는 누적 결합
    if (['①', '②', '③', '④', '⑤'].some(char => lineStrip.includes(char))) {
      if (currentQuestion) {
        currentQuestion.choices = currentQuestion.choices
          ? `${currentQuestion.choices} ${lineStrip}`
          : lineStrip;
      } else {
        elements.push({
          type: 'text',
          content: lineStrip
        });
      }
      continue;
    }
    
    // 일반 안내 텍스트
    if (currentQuestion) {
      currentQuestion.body.push({
        type: 'text',
        content: lineStrip
      });
    } else {
      elements.push({
        type: 'text',
        content: lineStrip
      });
    }
  }
  
  commitCurrentQuestion();
  
  if (inBlockquote) {
    elements.push({
      type: 'blockquote',
      content: blockquoteLines.join('\n')
    });
  }
  
  return { title, meta, elements };
};

// === 시험지 인라인 마크다운 렌더링 (**굵게**, <u>밑줄</u>) ===
// 시험지 md가 쓰는 인라인 문법은 이 둘뿐이다. 변환 없이 그대로 출력하면
// 인쇄물에 **, <u> 기호가 노출되므로 JSX 요소로 변환한다.
const renderUnderlineSegments = (text, keyPrefix) => {
  return text.split(/(<u>.*?<\/u>)/g).map((seg, i) => (
    seg.startsWith('<u>') && seg.endsWith('</u>')
      ? <u key={`${keyPrefix}_${i}`}>{seg.slice(3, -4)}</u>
      : <span key={`${keyPrefix}_${i}`}>{seg}</span>
  ));
};

const renderExamInline = (text) => {
  if (typeof text !== 'string' || !text) return text;
  return text.split(/(\*\*[^*]+\*\*)/g).map((part, i) => {
    if (part.startsWith('**') && part.endsWith('**') && part.length > 4) {
      return <strong key={i}>{renderUnderlineSegments(part.slice(2, -2), i)}</strong>;
    }
    // 짝이 맞지 않아 남은 ** 는 마크다운 잔여물이므로 제거
    return <span key={i}>{renderUnderlineSegments(part.replaceAll('**', ''), i)}</span>;
  });
};

// === 레벨테스트 상담서 데이터로부터 인쇄 파일명용 테스트레벨 명칭 추출 ===
const getTestLevelTitle = (item) => {
  if (!item) return '레벨테스트';
  
  if (item.testId && levelTestMapping[item.testId]) {
    return levelTestMapping[item.testId].title;
  }
  
  if (item.diagnosis) {
    const firstLine = item.diagnosis.split('\n')[0] || '';
    if (firstLine.includes('레벨테스트')) {
      const match = firstLine.match(/\]\s*([^\s]+.*?)\s*레벨테스트/);
      if (match && match[1]) {
        return `${match[1]} 레벨테스트`;
      }
      return '레벨테스트';
    }
  }
  
  const grade = item.schoolGrade || '중1';
  if (grade.startsWith('초등')) return '초등 종합 레벨테스트';
  if (grade === '중1') return '중등 Starter 레벨테스트';
  if (grade === '중2') return '중등 Bridge 레벨테스트';
  if (grade === '중3') return '중등 Intermediate 레벨테스트';
  if (grade === '고1') return '고등 Bridge 레벨테스트';
  if (grade === '고2') return '고등 Intermediate/Advanced 레벨테스트';
  if (grade === '고3') return '고등 Advanced 레벨테스트';

  return '레벨테스트';
};

// === 오염된 진단서 텍스트 내 학년·이름 표기를 원생 현재 정보로 실시간 정밀 교정 ===
// previousName: 진단서 작성 당시의 옛 이름 스냅샷. 학생 카드에서 개명되어 현재 이름과
// 다르면, 본문 프로즈에 박힌 옛 이름을 현재 이름으로 치환한다 (학부모 발송물이므로).
const getCorrectedDiagnosis = (diagnosis, studentName, actualGrade, previousName) => {
  if (!diagnosis || !studentName) return diagnosis;

  let working = diagnosis;
  if (previousName && previousName !== studentName) {
    const escapedPrev = previousName.replace(/[-/\\^$*+?.()|[\]{}]/g, '\\$&');
    working = working.replace(new RegExp(escapedPrev, 'g'), studentName);
  }

  if (!actualGrade) return working;
  const diagnosisText = working;

  const escapedName = studentName.replace(/[-/\\^$*+?.()|[\]{}]/g, '\\$&');
  
  // 학년 정규 표현식 (초등 1~6, 중1~3, 고1~3 등)
  const gradePattern = /초등\s*[1-6]?|중[1-3]|고[1-3]/;
  
  // 1. "서현진 (중1)" -> "서현진 (중3)" 형태 치환
  const regex1 = new RegExp(`(${escapedName}\\s*\\()(${gradePattern.source})(\\))`, 'g');
  let corrected = diagnosisText.replace(regex1, `$1${actualGrade}$3`);
  
  // 2. "서현진(중1)" -> "서현진(중3)" 형태 치환 (괄호 앞 공백 없음)
  const regex2 = new RegExp(`(${escapedName}\\()(${gradePattern.source})(\\))`, 'g');
  corrected = corrected.replace(regex2, `$1${actualGrade}$3`);

  // 3. "학생명: 서현진 (중1)" 또는 "**학생명**: 서현진 (중1)" 형태 치환
  const regex3 = new RegExp(`(학생명\\s*:\\s*${escapedName}\\s*\\()(${gradePattern.source})(\\))`, 'g');
  corrected = corrected.replace(regex3, `$1${actualGrade}$3`);

  const regex4 = new RegExp(`(\\*\\*학생명\\*\\*\\s*:\\s*${escapedName}\\s*\\()(${gradePattern.source})(\\))`, 'g');
  corrected = corrected.replace(regex4, `$1${actualGrade}$3`);

  return corrected;
};

// === ACHIEVEMENT_CATALOG 기반 전체 성취도 평가 목록 추출 유틸리티 ===
const getAchievementTestOptions = () => {
  const options = [];
  Object.entries(ACHIEVEMENT_CATALOG).forEach(([schoolKey, schoolCfg]) => {
    Object.entries(schoolCfg.levels).forEach(([levelKey, levelCfg]) => {
      levelCfg.rounds.forEach((round) => {
        const id = makeFinalTestId(schoolKey, levelKey, round);
        options.push({
          id,
          title: `${schoolCfg.label} - ${levelCfg.label} (${round}차)`
        });
      });
    });
  });
  return options;
};

const shouldShowWritingLines = (elem, printExamMode) => {
  if (printExamMode !== 'student') return false;
  if (elem.choices) return false;

  // 본문 혹은 문항 바디에 빈칸 기호가 있으면 밑줄 제외
  const bodyTexts = elem.body ? elem.body.map(b => b.content || '').join(' ') : '';
  const fullBodyText = bodyTexts + ' ' + (elem.text || '');
  if (fullBodyText.includes('________') || fullBodyText.includes('____')) {
    return false;
  }

  // 정답 단어 수가 2개 이하이면 단답형으로 보고 밑줄 제외
  const answer = elem.answer || '';
  if (answer) {
    const cleanAns = answer.replace(/[*_`]/g, '').trim();
    if (cleanAns.split(/\s+/).length <= 2) {
      return false;
    }
  }

  return true;
};

// === 파이널 및 레벨테스트 시험지 ID로부터 제목 획득 유틸리티 ===
const getExamTitle = (examId) => {
  if (!examId) return '일반 평가';
  // 새 카탈로그 ID(ft_*) 우선 처리
  if (examId.startsWith('ft_')) return getFinalTestTitle(examId);
  // 레벨테스트 ID 처리
  if (levelTestMapping[examId]) {
    return `${levelTestMapping[examId].title} (레벨테스트)`;
  }
  // 구형 ID: 마크다운 파싱 fallback
  const rawMd = allFinalTestData[examId] || finalTestData1[examId] || finalTestData2[examId];
  if (rawMd) {
    const { title } = parseExamMarkdown(rawMd);
    return title;
  }
  return examId;
};


function App() {
  // === 상태 정의 ===
  const [activeTab, setActiveTab] = useState('dashboard');
  const [students, setStudents] = useState(() => storage.getStudents());
  
  // 분기 리포트 성적 목록 추출 헬퍼 (하위 호환성 및 동적 렌더링 지원)
  const getReportFinalTests = (rpt) => {
    if (!rpt) return [];
    if (rpt.finalTests && Array.isArray(rpt.finalTests)) {
      return rpt.finalTests;
    }
    const legacy = [];
    if (rpt.finalTest1) legacy.push({ ...rpt.finalTest1, label: 'Test 1' });
    if (rpt.finalTest2) legacy.push({ ...rpt.finalTest2, label: 'Test 2' });
    return legacy;
  };

  const [grades, setGrades] = useState(() => {
    // 구버전(MM-DD) 성적 일자를 YYYY-MM-DD로 1회 마이그레이션
    const { migrated, changed } = migrateGradeDates(storage.getGrades());
    if (changed) storage.saveGrades(migrated);
    return migrated;
  });
  const [consultations, setConsultations] = useState(() => storage.getConsultations());
  const [apiSettings, setApiSettings] = useState(() => storage.getApiSettings());

  // 기준정보(마스터 데이터)
  const [master, setMaster] = useState(() => storage.getMaster());
  const brandName = master.brandName;
  useEffect(() => { setBrand(brandName); }, [brandName]);
  const handleMasterChange = (nextMaster) => {
    setMaster(nextMaster);
    if (!persist(storage.saveMaster(nextMaster))) return;
  };

  // 교안 자료실 (메타데이터만 LocalStorage, 파일은 IndexedDB)
  const [lectures, setLectures] = useState(() => storage.getLectures());
  const handleLecturesChange = (nextLectures) => {
    setLectures(nextLectures);
    if (!persist(storage.saveLectures(nextLectures))) return;
  };

  // 단어 해설 (Voca Guide)
  const [vocab, setVocab] = useState(() => storage.getVocabGuides());
  const [printVocabId, setPrintVocabId] = useState(null);
  const handleVocabChange = (nextVocab) => {
    setVocab(nextVocab);
    if (!persist(storage.saveVocabGuides(nextVocab))) return;
  };

  // 실행 잠금 (4자리 PIN)
  const [lockEnabled, setLockEnabled] = useState(() => !!getLockSettings()?.enabled);
  const [isLocked, setIsLocked] = useState(() => !!getLockSettings()?.enabled);
  const [pinForm, setPinForm] = useState({ current: '', next: '', confirm: '' });
  const [autoLockMinutes, setAutoLockMinutes] = useState(() => getLockSettings()?.autoLockMinutes ?? 10);

  // 활성 선택 상태
  const [selectedStudentId, setSelectedStudentId] = useState('');
  const [printConsultationId, setPrintConsultationId] = useState(null);
  const [printStudentId, setPrintStudentId] = useState(null);
  const [printExamId, setPrintExamId] = useState(null);
  const [printExamMode, setPrintExamMode] = useState('student'); // 'student' or 'teacher'
  const [examCategory, setExamCategory] = useState('level'); // 'level' or 'achievement'
  // 성취도 테스트 3단 필터
  const [ftSchool, setFtSchool] = useState('elementary');   // elementary | middle | high
  const [ftLevel, setFtLevel]   = useState('lv1');          // lv1 | lv2 | lv3 | basic | essential
  const [ftRound, setFtRound]   = useState(1);              // 차수 번호

  const [isEditingStudent, setIsEditingStudent] = useState(false);
  const [editingStudentForm, setEditingStudentForm] = useState({
    name: '', school: '', grade: '중1', phone: '', parentPhone: '', status: '재원', memo: '', courseId: ''
  });

  // 레벨테스트 상담 수정용 ID 상태
  const [editingConsultationId, setEditingConsultationId] = useState(null);

  // 레벨테스트 채점 도우미용 상태
  const [selectedTestId, setSelectedTestId] = useState('');
  const [wrongAnswers, setWrongAnswers] = useState([]);

  // 파이널 테스트 1차 성적 등록 폼 상태
  const [final1Form, setFinal1Form] = useState({
    studentId: '',
    date: new Date().toISOString().slice(0, 10),
    score: '',
    memo: '',
    examId: '',
    wrongAnswers: []
  });

  // 파이널 테스트 2차 성적 등록 폼 상태
  const [final2Form, setFinal2Form] = useState({
    studentId: '',
    date: new Date().toISOString().slice(0, 10),
    score: '',
    memo: '',
    examId: '',
    wrongAnswers: []
  });

  // 분기 리포트 상태
  const [quarterlyReports, setQuarterlyReports] = useState(() => storage.getQuarterlyReports());
  const [printQuarterlyId, setPrintQuarterlyId] = useState(null);
  const [printAchievementId, setPrintAchievementId] = useState(null);
  const [isQLoading, setIsQLoading] = useState(false);
  const [quarterlyForm, setQuarterlyForm] = useState({
    studentId: '',
    period: '',          // 예: 3~5월
    textbook: '',        // 교재명
    chapters: '',        // 챕터 목록 (자유 입력, 줄바꿈 구분)
    teacherComment: ''   // 교사 코멘트 초안 (편집 가능)
  });

  // === 성적 평균 동적 계산 헬퍼 함수 ===
  const calculateAvgScore = (scores) => {
    if (!scores) return '0.0';
    const keys = ['vocab', 'grammar', 'syntax', 'reading', 'writing'];
    let sum = 0;
    let count = 0;
    for (let key of keys) {
      const val = scores[key];
      if (val !== undefined && val !== null && val !== 'N/A') {
        sum += Number(val);
        count++;
      }
    }
    return count > 0 ? (sum / count).toFixed(1) : '0.0';
  };

  // === 연동 기록의 학생 이름을 표시 시점에 라이브 조회 ===
  // 상담·분기 리포트는 저장 당시의 이름을 스냅샷으로 들고 있다. studentId로 현재
  // 학생을 찾아 그 이름을 우선 사용하고, 학생이 삭제됐거나 연결이 없으면 스냅샷으로
  // 폴백한다. (학년·학교가 이미 이 방식이라 이름만 어긋나던 문제를 해소)
  const resolveStudentName = (studentId, fallbackName) => {
    const dbStudent = studentId ? students.find(s => s.id === studentId) : null;
    return dbStudent ? dbStudent.name : (fallbackName || '(미연동 학생)');
  };

  // === 마크다운 렌더링 헬퍼 함수 ===
  const renderMarkdown = (text) => {
    if (!text) return null;
    const lines = text.split('\n');
    return lines.map((line, idx) => {
      const trimmed = line.trim();
      if (!trimmed) {
        return <div key={idx} style={{ height: '6px' }} />;
      }

      // 0. 수평선 (--, ---)
      if (trimmed === '--' || trimmed === '---') {
        return <hr key={idx} style={{ border: '0', borderTop: '1px dashed #cbd5e1', margin: '10px 0' }} />;
      }

      // 0-2. #### 제목
      if (trimmed.startsWith('####')) {
        const content = trimmed.replace(/^####\s*/, '');
        const parts = content.split(/(\*\*.*?\*\*)/g);
        return (
          <h4 key={idx} style={{ margin: '10px 0 4px 0', fontSize: '12.5px', color: 'var(--primary-accent-hover, #6d28d9)', fontWeight: 'bold' }}>
            {parts.map((part, pidx) => {
              if (part.startsWith('**') && part.endsWith('**')) {
                return <strong key={pidx} style={{ color: 'var(--primary-accent, #7c3aed)' }}>{part.slice(2, -2)}</strong>;
              }
              return <span key={pidx}>{part}</span>;
            })}
          </h4>
        );
      }

      // 0-1. ### 제목
      if (trimmed.startsWith('###')) {
        const content = trimmed.replace(/^###\s*/, '');
        const parts = content.split(/(\*\*.*?\*\*)/g);
        return (
          <h3 key={idx} style={{ margin: '12px 0 6px 0', fontSize: '14px', color: '#0f172a', fontWeight: 'bold' }}>
            {parts.map((part, pidx) => {
              if (part.startsWith('**') && part.endsWith('**')) {
                return <strong key={pidx} style={{ color: 'var(--primary-accent, #7c3aed)' }}>{part.slice(2, -2)}</strong>;
              }
              return <span key={pidx}>{part}</span>;
            })}
          </h3>
        );
      }

      // 1. 대괄호 제목 형태 (예: [영역별 성취 및 정밀 진단])
      if (trimmed.startsWith('[') && trimmed.endsWith(']')) {
        return (
          <h4 key={idx} style={{ margin: '10px 0 4px 0', fontSize: '13px', color: 'var(--primary-accent-hover, #6d28d9)', fontWeight: 'bold' }}>
            {trimmed.slice(1, -1)}
          </h4>
        );
      }

      // 2. 사각형 타이틀 형태 (예: ■ [자동 분석] ...)
      if (trimmed.startsWith('■')) {
        return (
          <h3 key={idx} style={{ margin: '12px 0 6px 0', fontSize: '13.5px', color: '#0f172a', fontWeight: 'bold' }}>
            {trimmed}
          </h3>
        );
      }

      // 3. 불릿 목록 형태 (예: - 어휘력 (Vocab): ...)
      if (trimmed.startsWith('-')) {
        const content = trimmed.slice(1).trim();
        const parts = content.split(/(\*\*.*?\*\*)/g);
        return (
          <li key={idx} style={{ marginLeft: '12px', marginBottom: '3px', listStyleType: 'disc', fontSize: '12px', color: '#1e293b' }}>
            {parts.map((part, pidx) => {
              if (part.startsWith('**') && part.endsWith('**')) {
                return <strong key={pidx} style={{ color: 'var(--primary-accent, #7c3aed)' }}>{part.slice(2, -2)}</strong>;
              }
              return <span key={pidx}>{part}</span>;
            })}
          </li>
        );
      }

      // 4. 일반 본문
      const parts = line.split(/(\*\*.*?\*\*)/g);
      return (
        <p key={idx} style={{ margin: '3px 0', fontSize: '12px', color: '#334155', lineHeight: '1.55' }}>
          {parts.map((part, pidx) => {
            if (part.startsWith('**') && part.endsWith('**')) {
              return <strong key={pidx} style={{ color: 'var(--primary-accent, #7c3aed)' }}>{part.slice(2, -2)}</strong>;
            }
            return <span key={pidx}>{part}</span>;
          })}
        </p>
      );
    });
  };

  // === 오답 마킹 변경 시 실시간 점수 및 피드백 갱신 ===
  const handleWrongAnswersChange = (testId, newWrongAnswers) => {
    setWrongAnswers(newWrongAnswers);
    if (!testId || !levelTestMapping[testId]) return;

    const testInfo = levelTestMapping[testId];
    const newScores = { vocab: 100, grammar: 100, syntax: 100, reading: 100, writing: 100 };
    
    // 유효하지 않은 영역은 N/A로 지정
    const activeSections = Object.keys(testInfo.sections);
    const allSections = ['vocab', 'grammar', 'syntax', 'reading', 'writing'];
    for (let sec of allSections) {
      if (!activeSections.includes(sec)) {
        newScores[sec] = 'N/A';
      }
    }

    // 영역별 백분율 성취도 계산
    for (let sec of activeSections) {
      const secInfo = testInfo.sections[sec];
      const totalSecQuestions = secInfo.questions.length;
      if (totalSecQuestions === 0) {
        newScores[sec] = 'N/A';
        continue;
      }
      const wrongCount = newWrongAnswers.filter(qNum => secInfo.questions.includes(qNum)).length;
      const scorePercentage = Math.round(((totalSecQuestions - wrongCount) / totalSecQuestions) * 100);
      newScores[sec] = scorePercentage;
    }

    // 1차 자동 분석 피드백 텍스트 조합
    let commentParts = [];
    commentParts.push(`■ [자동 분석] ${testInfo.title} 레벨테스트 결과`);
    
    let wrongListStr = newWrongAnswers.length > 0 
      ? `오답 문항 번호: ${newWrongAnswers.sort((a,b)=>a-b).join(', ')}번` 
      : '오답 없음 (모든 문항 정답)';
    commentParts.push(`■ ${wrongListStr}\n`);

    commentParts.push(`[영역별 성취 및 정밀 진단]`);
    for (let sec of activeSections) {
      const secInfo = testInfo.sections[sec];
      const wrongCount = newWrongAnswers.filter(qNum => secInfo.questions.includes(qNum)).length;
      if (wrongCount > 0) {
        commentParts.push(`- ${secInfo.name}: ${secInfo.warning} (성취 지수: ${newScores[sec]}%)`);
      } else {
        commentParts.push(`- ${secInfo.name}: ${secInfo.feedback} (성취 지수: 100% 완료)`);
      }
    }

    commentParts.push(`\n[강사 처방 가이드]`);
    const lowScoreSections = activeSections.filter(sec => newScores[sec] < 70);
    if (lowScoreSections.length > 0) {
      const lowNames = lowScoreSections.map(sec => testInfo.sections[sec].name.split(' ')[0]).join(', ');
      commentParts.push(`진단 결과, 점수 지수가 저조한 [${lowNames}] 영역에 대한 단기 핵심 개념 학습 및 집중 피드백이 강력히 요구됩니다.`);
    } else {
      commentParts.push(`전 영역에서 고른 성취 지수가 확인되었으며, 반 편성에 따라 바로 심화 학습이 가능한 상태로 진단됩니다.`);
    }

    const diagnosisText = commentParts.join('\n');

    setConsultationForm(prev => ({
      ...prev,
      scores: newScores,
      diagnosis: diagnosisText
    }));
  };

  // 로딩 상태 및 알림 메시지
  const [isLoading, setIsLoading] = useState(false);
  const [alertMsg, setAlertMsg] = useState({ type: '', text: '' });
  const alertTimerRef = useRef(null);

  // === 입력 폼 바인딩 상태 ===
  // 1. 학생 폼
  const [studentForm, setStudentForm] = useState({
    name: '', school: '', grade: '중1', phone: '', parentPhone: '', status: '재원', memo: '', courseId: ''
  });
  // 2. 성적 폼
  const [gradeForm, setGradeForm] = useState({
    date: new Date().toISOString().slice(0, 10), // YYYY-MM-DD (정렬 가능 형식)
    type: 'level_test',
    score: '',
    memo: '',
    examId: 'elementary_test'
  });
  // 3. 레벨 테스트 & 상담지 폼
  const [consultationForm, setConsultationForm] = useState({
    studentId: '',
    studentName: '',
    schoolName: '',
    schoolGrade: '중1',
    scores: { vocab: 60, grammar: 60, syntax: 60, reading: 60, writing: 60 },
    diagnosis: '',
    recommendedClass: '',
    recommendedBooks: '',
    consultationMemo: ''
  });
  const [autoRegister, setAutoRegister] = useState(true);
  const [statusFilter, setStatusFilter] = useState('all');

  // 레벨테스트 상담지(consultations)와 성적(grades) 테이블 간 실시간 자동 동기화 및 마이그레이션 훅
  useEffect(() => {
    let consultationsChanged = false;
    const nextConsultations = consultations.map(c => {
      let updated = { ...c };
      let localChanged = false;

      // 1. studentId 누락 시 이름 매칭 자동 보정
      if (!c.studentId && c.studentName) {
        const matched = students.find(s => s.name === c.studentName);
        if (matched) {
          updated.studentId = matched.id;
          localChanged = true;
        }
      }

      // 2. 서현진 학생의 testId 보정 (중등 고급 레벨테스트 middle_advanced로 강제 매핑하여 초등 기본 매핑 오류 방지)
      if (c.studentName === '서현진' && (!c.testId || c.testId === 'elementary_test')) {
        updated.testId = 'middle_advanced';
        localChanged = true;
      }

      if (localChanged) {
        consultationsChanged = true;
        return updated;
      }
      return c;
    });

    if (consultationsChanged) {
      setConsultations(nextConsultations);
      storage.saveConsultations(nextConsultations);
      return; // 변경사항을 즉시 반영하여 무한 루프를 방지하고 안전하게 다음 렌더 시점에 성적 동기화 진행
    }

    let changed = false;
    const nextGrades = [...grades];

    consultations.forEach(c => {
      if (!c.studentId) return; // studentId만 필수로 검증 (이전 데이터 연동율 향상)

      // 실제 존재하는 원생인지 검증 (삭제된 학생의 레벨테스트 성적이 자동 재생성되는 현상 차단)
      const hasStudent = students.some(s => s.id === c.studentId);
      if (!hasStudent) return;

      const safeTestId = c.testId || 'elementary_test'; // testId 누락 시 기본값 매핑

      // 평균 점수 계산 (초등 종합테스트는 서술형/영작 제외)
      const validScores = [];
      if (c.scores) {
        const isElementary = safeTestId.includes('elementary_test');
        Object.entries(c.scores).forEach(([key, val]) => {
          if (isElementary && key === 'writing') return;
          const num = Number(val);
          if (!isNaN(num) && num >= 0) {
            validScores.push(num);
          }
        });
      }
      const avg = validScores.length > 0 
        ? Math.round(validScores.reduce((a, b) => a + b, 0) / validScores.length)
        : 0;

      // 학생별 레벨테스트 기록 존재 여부 판별 (동시 중복 생성 차단)
      const existIdx = nextGrades.findIndex(g => g.studentId === c.studentId && g.type === 'level_test');
      
      if (existIdx >= 0) {
        // 이미 존재하는데 점수나 정보가 다르다면 업데이트
        if (nextGrades[existIdx].score !== avg || nextGrades[existIdx].examId !== safeTestId) {
          nextGrades[existIdx] = {
            ...nextGrades[existIdx],
            score: avg,
            memo: `[레벨테스트 자동 연동] 추천반: ${c.recommendedClass || '미지정'}`,
            date: c.consultationDate || nextGrades[existIdx].date,
            examId: safeTestId
          };
          changed = true;
        }
      } else {
        // 존재하지 않는다면 신규 생성
        nextGrades.push({
          id: genId('grd'),
          studentId: c.studentId,
          date: c.consultationDate || new Date().toISOString().slice(0, 10),
          type: 'level_test',
          score: avg,
          memo: `[레벨테스트 자동 연동] 추천반: ${c.recommendedClass || '미지정'}`,
          examId: safeTestId
        });
        changed = true;
      }
    });

    if (changed) {
      setGrades(nextGrades);
      storage.saveGrades(nextGrades);
    }
  }, [consultations, students]);

  // 무활동 자동 잠금: 설정된 시간 동안 입력이 없으면 잠금 화면으로 전환
  useEffect(() => {
    if (!lockEnabled) return;
    const minutes = getLockSettings()?.autoLockMinutes || 0;
    if (!minutes) return;

    let lastActivity = Date.now();
    const markActivity = () => { lastActivity = Date.now(); };
    const events = ['mousedown', 'keydown', 'touchstart'];
    events.forEach(ev => window.addEventListener(ev, markActivity));
    const timer = setInterval(() => {
      if (Date.now() - lastActivity >= minutes * 60 * 1000) setIsLocked(true);
    }, 30000);

    return () => {
      events.forEach(ev => window.removeEventListener(ev, markActivity));
      clearInterval(timer);
    };
  }, [lockEnabled, autoLockMinutes]);

  // 인쇄 및 PDF 저장 시 기본 파일명 추천 정책 반영을 위한 document.title 동적 제어
  useEffect(() => {
    const originalTitle = document.title;
    
    if (printConsultationId) {
      const item = consultations.find(c => c.id === printConsultationId);
      if (item) {
        const testLevel = getTestLevelTitle(item);
        const dbStudent = item.studentId ? students.find(s => s.id === item.studentId) : null;
        const studentName = (dbStudent ? dbStudent.name : item.studentName) || '학생';
        const safeLevel = testLevel.replace(/\s+/g, '');
        document.title = `${studentName}_${safeLevel}`;
      }
    } else if (printStudentId) {
      const student = students.find(s => s.id === printStudentId);
      if (student) {
        const studentName = student.name || '학생';
        document.title = `종합분석리포트_${studentName}`;
      }
    } else if (printAchievementId) {
      const g = grades.find(x => x.id === printAchievementId);
      if (g) {
        const student = students.find(s => s.id === g.studentId);
        const sName = student ? student.name : '학생';
        const examTitle = getExamTitle(g.examId).replace(/\s+/g, '');
        document.title = `성취도분석리포트_${sName}_${examTitle}`;
      }
    } else if (printExamId) {
      const rawMd = achievementTestData[printExamId] || levelTestData[printExamId] || appendixTestData[printExamId] || finalTestData1[printExamId] || finalTestData2[printExamId];
      if (rawMd) {
        const { title } = parseExamMarkdown(rawMd);
        const safeTitle = title.replace(/\s+/g, '');
        const modeSuffix = printExamMode === 'student' ? '학생용' : '교사용';
        document.title = `${safeTitle}_${modeSuffix}`;
      }
    }
    
    return () => {
      document.title = originalTitle;
    };
  }, [printConsultationId, printStudentId, printAchievementId, printExamId, consultations, students, grades, printExamMode]);

  // 성적 종합 관리에서 학생 선택 시 분기 리포트 작성 대상 학생을 자동으로 동기화
  useEffect(() => {
    if (selectedStudentId) {
      setQuarterlyForm(p => ({ ...p, studentId: selectedStudentId }));
    }
  }, [selectedStudentId]);

  // === 공통 유틸리티 ===
  const showAlert = (text, type = 'success') => {
    // 이전 알림 타이머가 새 알림을 조기에 지우지 않도록 항상 초기화
    if (alertTimerRef.current) clearTimeout(alertTimerRef.current);
    setAlertMsg({ text, type });
    alertTimerRef.current = setTimeout(() => setAlertMsg({ text: '', type: '' }), 4000);
  };

  // 저장 결과 확인 헬퍼: 실패 시 사용자에게 즉시 알리고 false 반환.
  // 호출부는 false면 성공 알림을 띄우지 말아야 한다 (조용한 데이터 유실 방지).
  const persist = (saved) => {
    if (!saved) showAlert(SAVE_FAIL_MSG, 'danger');
    return saved;
  };

  // === 실행 잠금 (PIN) 핸들러 ===
  const handleEnableLock = async (e) => {
    e.preventDefault();
    if (!isValidPin(pinForm.next)) return showAlert('PIN은 숫자 4자리여야 합니다.', 'danger');
    if (pinForm.next !== pinForm.confirm) return showAlert('PIN 확인 입력이 일치하지 않습니다.', 'danger');
    if (!(await enableLock(pinForm.next, Number(autoLockMinutes)))) return showAlert(SAVE_FAIL_MSG, 'danger');
    setLockEnabled(true);
    setPinForm({ current: '', next: '', confirm: '' });
    showAlert('실행 잠금이 활성화되었습니다. 다음 실행부터 PIN 입력이 필요합니다.');
  };

  const handleChangePin = async (e) => {
    e.preventDefault();
    if (!(await verifyPin(pinForm.current))) return showAlert('현재 PIN이 일치하지 않습니다.', 'danger');
    if (!isValidPin(pinForm.next)) return showAlert('새 PIN은 숫자 4자리여야 합니다.', 'danger');
    if (pinForm.next !== pinForm.confirm) return showAlert('새 PIN 확인 입력이 일치하지 않습니다.', 'danger');
    if (!(await enableLock(pinForm.next, Number(autoLockMinutes)))) return showAlert(SAVE_FAIL_MSG, 'danger');
    setPinForm({ current: '', next: '', confirm: '' });
    showAlert('PIN이 변경되었습니다.');
  };

  const handleDisableLock = async () => {
    if (!(await verifyPin(pinForm.current))) return showAlert('현재 PIN이 일치하지 않습니다.', 'danger');
    if (!disableLock()) return showAlert(SAVE_FAIL_MSG, 'danger');
    setLockEnabled(false);
    setPinForm({ current: '', next: '', confirm: '' });
    showAlert('실행 잠금이 해제되었습니다.', 'warning');
  };

  const handleAutoLockChange = (minutes) => {
    setAutoLockMinutes(minutes);
    if (lockEnabled) updateAutoLock(Number(minutes));
  };

  // === 1. 학생 관리 핸들러 ===
  const handleAddStudent = (e) => {
    e.preventDefault();
    if (!studentForm.name.trim()) return showAlert('이름을 입력해주세요.', 'danger');

    const newStudent = {
      id: genId('std'),
      ...studentForm,
      enrollDate: new Date().toISOString().slice(0, 10)
    };

    const nextStudents = [...students, newStudent];
    setStudents(nextStudents);
    if (!persist(storage.saveStudents(nextStudents))) return;

    // 폼 초기화
    setStudentForm({ name: '', school: '', grade: '중1', phone: '', parentPhone: '', status: '재원', memo: '' });
    setSelectedStudentId(newStudent.id);
    showAlert('학생이 등록되었습니다.');
  };

  const handleDeleteStudent = (id) => {
    if (!window.confirm('이 학생을 정말 삭제하시겠습니까?\n- 관련 성적 데이터도 함께 영구 유실됩니다.\n- 레벨테스트 상담 기록은 [레벨 테스트 및 상담지] 탭에 보존됩니다.')) return;
    
    const nextStudents = students.filter(s => s.id !== id);
    setStudents(nextStudents);
    const savedStudents = storage.saveStudents(nextStudents);

    const nextGrades = grades.filter(g => g.studentId !== id);
    setGrades(nextGrades);
    if (!persist(savedStudents && storage.saveGrades(nextGrades))) return;

    if (selectedStudentId === id) setSelectedStudentId('');
    showAlert('학생 정보 및 성적이 삭제되었습니다.', 'warning');
  };

  const handleEditStart = (student) => {
    setEditingStudentForm({
      name: student.name,
      school: student.school || '',
      grade: student.grade || '중1',
      phone: student.phone || '',
      parentPhone: student.parentPhone || '',
      status: student.status || '재원',
      memo: student.memo || '',
      courseId: student.courseId || ''
    });
    setIsEditingStudent(true);
  };

  const handleEditCancel = () => {
    setIsEditingStudent(false);
  };

  const handleUpdateStudent = (e, studentId) => {
    e.preventDefault();
    if (!editingStudentForm.name.trim()) return showAlert('이름을 입력해주세요.', 'danger');

    const nextStudents = students.map(s => {
      if (s.id === studentId) {
        return {
          ...s,
          ...editingStudentForm
        };
      }
      return s;
    });

    setStudents(nextStudents);
    if (!persist(storage.saveStudents(nextStudents))) return;

    // 학생 카드 변경을 연동 기록의 비정규화 필드에도 전파한다.
    // 상담 기록·분기 리포트는 저장 당시의 이름/학교/학년 스냅샷을 들고 있어,
    // 여기서 동기화하지 않으면 누적 상담 리스트와 인쇄물에 옛 정보가 남는다.
    const updated = nextStudents.find(s => s.id === studentId);
    if (consultations.some(c => c.studentId === studentId)) {
      const nextConsultations = consultations.map(c => (
        c.studentId === studentId
          ? { ...c, studentName: updated.name, schoolName: updated.school, schoolGrade: updated.grade }
          : c
      ));
      setConsultations(nextConsultations);
      if (!persist(storage.saveConsultations(nextConsultations))) return;
    }
    if (quarterlyReports.some(r => r.studentId === studentId)) {
      const nextReports = quarterlyReports.map(r => (
        r.studentId === studentId ? { ...r, studentName: updated.name } : r
      ));
      setQuarterlyReports(nextReports);
      if (!persist(storage.saveQuarterlyReports(nextReports))) return;
    }

    setIsEditingStudent(false);
    showAlert('학생 정보가 성공적으로 수정되었습니다. (연동된 상담·리포트 기록에도 반영)');
  };

  const handleToggleWrongAnswer = (qNum) => {
    const isLevel = gradeForm.type === 'level_test';
    const isAchieve = gradeForm.type === 'achievement_test';
    if (!isLevel && !isAchieve) return;

    const mapping = isLevel ? levelTestMapping : achievementTestMapping;
    const testInfo = mapping[gradeForm.examId];
    if (!testInfo) return;

    const totalQ = testInfo.totalQuestions || 30;
    
    // 오답 배열 토글
    let nextWrong = [];
    if (gradeForm.wrongAnswers.includes(qNum)) {
      nextWrong = gradeForm.wrongAnswers.filter(num => num !== qNum);
    } else {
      nextWrong = [...gradeForm.wrongAnswers, qNum].sort((a, b) => a - b);
    }

    // 점수 실시간 자동 계산
    const calculatedScore = Math.round(100 - (nextWrong.length * (100 / totalQ)));
    
    // 1차 자동 피드백 코멘트 생성
    const calculatedMemo = isLevel 
      ? generateLevelTestComment(gradeForm.examId, nextWrong)
      : generateAchievementComment(gradeForm.examId, nextWrong);

    setGradeForm({
      ...gradeForm,
      wrongAnswers: nextWrong,
      score: calculatedScore.toString(),
      memo: calculatedMemo
    });
  };

  const handleGradeTypeChange = (newType) => {
    let defaultExamId = '';
    let defaultWrong = [];
    let defaultScore = '100';
    let defaultMemo = '';
    
    if (newType === 'level_test') {
      defaultExamId = 'elementary_test';
      defaultMemo = generateLevelTestComment(defaultExamId, defaultWrong);
    } else if (newType === 'achievement_test') {
      defaultExamId = 'ft_elementary_lv1_r1';
      defaultMemo = generateAchievementComment(defaultExamId, defaultWrong);
    }
    
    setGradeForm({
      ...gradeForm,
      type: newType,
      examId: defaultExamId,
      wrongAnswers: defaultWrong,
      score: defaultScore,
      memo: defaultMemo
    });
  };

  const handleGradeExamChange = (newExamId) => {
    const isLevel = gradeForm.type === 'level_test';
    const defaultWrong = [];
    const defaultScore = '100';
    const defaultMemo = isLevel 
      ? generateLevelTestComment(newExamId, defaultWrong)
      : generateAchievementComment(newExamId, defaultWrong);

    setGradeForm({
      ...gradeForm,
      examId: newExamId,
      wrongAnswers: defaultWrong,
      score: defaultScore,
      memo: defaultMemo
    });
  };

  // === 2. 성적 관리 핸들러 ===
  const handleAddGrade = (e) => {
    e.preventDefault();
    if (!selectedStudentId) return showAlert('학생을 먼저 선택해주세요.', 'danger');
    if (gradeForm.score === '') return showAlert('점수를 입력해주세요.', 'danger');

    const newGrade = {
      id: genId('grd'),
      studentId: selectedStudentId,
      date: gradeForm.date,
      type: gradeForm.type,
      score: parseInt(gradeForm.score, 10),
      memo: gradeForm.memo,
      examId: gradeForm.examId || '',
      wrongAnswers: gradeForm.wrongAnswers || []
    };

    const nextGrades = [...grades, newGrade];
    setGrades(nextGrades);
    if (!persist(storage.saveGrades(nextGrades))) return;

    setGradeForm({ ...gradeForm, score: '', memo: '', examId: '', wrongAnswers: [] });
    showAlert('성적 점수가 기록되었습니다.');

    if (newGrade.type === 'achievement_test') {
      setPrintAchievementId(newGrade.id);
    }
  };

  const handleDeleteGrade = (id) => {
    if (!window.confirm('이 성적 기록을 삭제하시겠습니까? 삭제 후에는 되돌릴 수 없습니다.')) return;
    const nextGrades = grades.filter(g => g.id !== id);
    setGrades(nextGrades);
    if (!persist(storage.saveGrades(nextGrades))) return;
    showAlert('성적 기록이 삭제되었습니다.', 'warning');
  };

  // 파이널 테스트 1차/2차 성적 기록 핸들러
  const handleAddFinalTestGrade = (e, type, formState, setFormState) => {
    if (e) e.preventDefault();
    if (!formState.studentId) return showAlert('학생을 먼저 선택해주세요.', 'danger');
    if (!formState.examId) return showAlert('평가 시험지를 선택해주세요.', 'danger');
    if (formState.score === '') return showAlert('점수를 입력해주세요.', 'danger');

    const newGrade = {
      id: genId('grd'),
      studentId: formState.studentId,
      date: formState.date,
      type: type,
      score: parseInt(formState.score, 10),
      memo: formState.memo,
      examId: formState.examId,
      wrongAnswers: formState.wrongAnswers || []
    };

    const nextGrades = [...grades, newGrade];
    setGrades(nextGrades);
    if (!persist(storage.saveGrades(nextGrades))) return;

    setFormState({
      studentId: '',
      date: new Date().toISOString().slice(0, 10),
      score: '',
      memo: '',
      examId: '',
      wrongAnswers: []
    });
    showAlert(`${typeLabel(type)} 성적이 기록되었습니다.`);
  };

  // ─── 분기 리포트 핸들러 ───

  // 교사 코멘트 자동 초안 생성
  const handleGenerateQuarterlyComment = async (method) => {
    const student = students.find(s => s.id === quarterlyForm.studentId);
    if (!student) return showAlert('학생을 먼저 선택해주세요.', 'danger');

    // 해당 학생의 성취도 테스트 최근 2개 성적 자동 조회
    const finalGrades = grades.filter(g => g.studentId === student.id && g.type === 'achievement_test');
    const sorted = [...finalGrades].sort((a, b) => b.date.localeCompare(a.date));
    const t1 = sorted[0] || null;
    const t2 = sorted[1] || null;


    const t1Info = t1 ? { score: t1.score, examTitle: getExamTitle(t1.examId) } : null;
    const t2Info = t2 ? { score: t2.score, examTitle: getExamTitle(t2.examId) } : null;

    setIsQLoading(true);
    try {
      let draft = '';
      if (method === 'llm') {
        if (!apiSettings.apiKey) throw new Error('설정 탭에서 먼저 API Key를 설정해 주세요.');
        draft = await generateLLMQuarterlyComment(
          student.name, student.grade, t1Info, t2Info,
          quarterlyForm.textbook, quarterlyForm.period, apiSettings
        );
      } else {
        draft = generateRuleBasedQuarterlyComment(student.name, student.grade, t1Info, t2Info);
      }
      setQuarterlyForm(prev => ({ ...prev, teacherComment: draft }));
      showAlert('교사 코멘트 초안이 작성되었습니다. 내용을 검토 후 저장하세요.');
    } catch (err) {
      showAlert(err.message, 'danger');
    } finally {
      setIsQLoading(false);
    }
  };

  // 분기 리포트 저장
  const handleSaveQuarterlyReport = (e, andPrint = false) => {
    if (e) e.preventDefault();
    if (!quarterlyForm.studentId) return showAlert('학생을 선택해주세요.', 'danger');
    if (!quarterlyForm.period.trim()) return showAlert('분기(기간)를 입력해주세요.', 'danger');

    const student = students.find(s => s.id === quarterlyForm.studentId);
    if (!student) return showAlert('학생 정보를 찾을 수 없습니다.', 'danger');

    // 최신 성취도 성적 자동 연결 (최근 2건)
    const achieveGrades = grades.filter(g => g.studentId === student.id && g.type === 'achievement_test')
      .sort((a, b) => b.date.localeCompare(a.date));
    const t1 = achieveGrades[0] || null;
    const t2 = achieveGrades[1] || null;

    // DB 지향적 동적 성적 리스트 수집
    const finalTests = achieveGrades.map(g => ({
      id: g.id,
      score: g.score,
      date: g.date,
      examTitle: getExamTitle(g.examId)
    }));

    const newReport = {
      id: genId('qrp'),
      studentId: student.id,
      studentName: student.name,
      grade: student.grade,
      school: student.school,
      period: quarterlyForm.period,
      textbook: quarterlyForm.textbook,
      chapters: quarterlyForm.chapters,
      teacherComment: quarterlyForm.teacherComment,
      finalTest1: t1 ? { score: t1.score, date: t1.date, examTitle: getExamTitle(t1.examId) } : null,
      finalTest2: t2 ? { score: t2.score, date: t2.date, examTitle: getExamTitle(t2.examId) } : null,
      finalTests: finalTests, // 동적 배열 적재 추가
      createdAt: new Date().toISOString().slice(0, 10)
    };

    const nextReports = [newReport, ...quarterlyReports];
    setQuarterlyReports(nextReports);
    if (!persist(storage.saveQuarterlyReports(nextReports))) return;

    setQuarterlyForm({ studentId: '', period: '', textbook: '', chapters: '', teacherComment: '' });
    showAlert('분기 리포트가 저장되었습니다.');
    if (andPrint) setPrintQuarterlyId(newReport.id);
  };

  // 분기 리포트 삭제
  const handleDeleteQuarterlyReport = (id) => {
    if (!window.confirm('이 분기 리포트를 삭제하시겠습니까?')) return;
    const next = quarterlyReports.filter(r => r.id !== id);
    setQuarterlyReports(next);
    if (!persist(storage.saveQuarterlyReports(next))) return;
    showAlert('분기 리포트가 삭제되었습니다.', 'warning');
  };

  // 1단계 카카오톡 학부모 피드백 복사 핸들러

  const handleCopyFeedback = (grade) => {
    if (!selectedStudent) return;
    const passStatus = grade.score >= PASS_THRESHOLD ? '통과' : '재시험 대상';

    // 학생 관리 메모는 내부용일 수 있으므로 자동 포함하지 않고 매번 확인받는다.
    let memoSection = '';
    if (selectedStudent.memo) {
      const includeMemo = window.confirm(
        `학생 관리 메모를 학부모 피드백에 포함할까요?\n\n--- 메모 내용 ---\n${selectedStudent.memo}\n\n(내부 관리용 내용이라면 [취소]를 누르세요. 메모 없이 복사됩니다.)`
      );
      if (includeMemo) memoSection = `\n■ 강사 밀착 피드백:\n${selectedStudent.memo}\n`;
    }

    let wrongAnswersSection = '';
    if (grade.wrongAnswers && grade.wrongAnswers.length > 0) {
      wrongAnswersSection = `\n■ 오답 문항: ${grade.wrongAnswers.join(', ')}번 (총 ${grade.wrongAnswers.length}문항 오답)`;
    }

    const feedbackText = `[${brandName} - 일일 학습 피드백]

안녕하세요, ${selectedStudent.name} 학부모님.
${displayGradeDate(grade.date)}에 치러진 학습 평가 결과를 공유해 드립니다.

■ 평가 유형: ${grade.examId ? getExamTitle(grade.examId) : typeLabel(grade.type)}
■ 득점 점수: ${grade.score}점 (통과 기준: ${PASS_THRESHOLD}점)
■ 결과 상태: ${passStatus}${wrongAnswersSection}
■ 특이사항 및 지도내용: ${grade.memo || '특이사항 없음'}
${memoSection}
앞으로도 세밀한 지도와 피드백을 통해 보강을 철저히 진행하겠습니다. 궁금한 점이 있으시면 언제든 연락 주세요. 감사합니다.`;

    navigator.clipboard.writeText(feedbackText)
      .then(() => {
        showAlert('학부모 전송용 카톡 피드백이 복사되었습니다! 카카오톡에 붙여넣기 하세요.');
      })
      .catch(() => {
        showAlert('클립보드 복사에 실패했습니다. 브라우저 설정을 확인해 주세요.', 'danger');
      });
  };

  // === 3. 레벨 테스트 & 상담 핸들러 ===
  // 점수 슬라이더/인풋 변경 핸들러
  const handleScoreChange = (field, val) => {
    if (val === '') {
      setConsultationForm(prev => ({
        ...prev,
        scores: { ...prev.scores, [field]: '' }
      }));
      return;
    }
    const parsed = parseInt(val, 10);
    const cleanVal = isNaN(parsed) ? 0 : Math.max(0, Math.min(100, parsed));
    setConsultationForm(prev => ({
      ...prev,
      scores: { ...prev.scores, [field]: cleanVal }
    }));
  };

  // AI 1차 진단서 자동 작성 버튼 클릭
  const handleGenerateDiagnosis = async (method) => {
    const { studentId, studentName, schoolGrade, scores } = consultationForm;
    if (!studentName.trim()) {
      return showAlert('학생 이름을 먼저 입력해 주세요.', 'danger');
    }

    const dbStudent = studentId ? students.find(s => s.id === studentId) : null;
    const finalGrade = dbStudent ? dbStudent.grade : schoolGrade;

    const cleanScores = {
      vocab: Number(scores.vocab) || 0,
      grammar: Number(scores.grammar) || 0,
      syntax: Number(scores.syntax) || 0,
      reading: Number(scores.reading) || 0,
      writing: Number(scores.writing) || 0
    };

    setIsLoading(true);
    try {
      let draftText = '';
      if (method === 'llm') {
        if (!apiSettings.apiKey) {
          throw new Error('설정 탭에서 먼저 API Key를 설정해 주세요.');
        }
        draftText = await generateLLMDiagnosis(cleanScores, studentName, finalGrade, apiSettings);
      } else {
        // 규칙 기반 생성
        draftText = generateRuleBasedDiagnosis(cleanScores, studentName, finalGrade);
      }

      setConsultationForm(prev => ({ ...prev, diagnosis: draftText }));
      showAlert('1차 진단서 초안이 본문에 자동으로 입력되었습니다.');
    } catch (err) {
      showAlert(err.message, 'danger');
    } finally {
      setIsLoading(false);
    }
  };

  // 상담 정보 저장
  const handleSaveConsultation = (e, andPrint = false) => {
    if (e) e.preventDefault();
    if (!consultationForm.studentName.trim()) return showAlert('학생명을 입력해주세요.', 'danger');

    const newId = genId('con');
    let targetStudentId = consultationForm.studentId;

    if (!targetStudentId && autoRegister) {
      const newStudent = {
        id: genId('std'),
        name: consultationForm.studentName,
        school: consultationForm.schoolName || '',
        grade: consultationForm.schoolGrade,
        phone: '',
        parentPhone: '',
        status: '재원',
        memo: `[레벨테스트 자동 등록 원생]\n추천반: ${consultationForm.recommendedClass || '미지정'}\n추천교재: ${consultationForm.recommendedBooks || '미정'}`,
        enrollDate: new Date().toISOString().slice(0, 10)
      };
      
      const nextStudents = [...students, newStudent];
      setStudents(nextStudents);
      if (!persist(storage.saveStudents(nextStudents))) return;
      targetStudentId = newStudent.id;
      showAlert(`${consultationForm.studentName} 학생이 신규 원생으로 자동 등록되었습니다.`);
    }

    const finalScores = {
      vocab: Number(consultationForm.scores.vocab) || 0,
      grammar: Number(consultationForm.scores.grammar) || 0,
      syntax: Number(consultationForm.scores.syntax) || 0,
      reading: Number(consultationForm.scores.reading) || 0,
      writing: Number(consultationForm.scores.writing) || 0
    };

    const dbStudent = targetStudentId ? students.find(s => s.id === targetStudentId) : null;
    const finalGrade = dbStudent ? dbStudent.grade : consultationForm.schoolGrade;

    // 만약 수정 모드라면 기존 항목 업데이트
    if (editingConsultationId) {
      const nextConsultations = consultations.map(c => {
        if (c.id === editingConsultationId) {
          return {
            ...c,
            ...consultationForm,
            studentId: targetStudentId,
            testId: selectedTestId,
            schoolGrade: finalGrade,
            scores: finalScores
          };
        }
        return c;
      });
      setConsultations(nextConsultations);
      if (!persist(storage.saveConsultations(nextConsultations))) return;
      
      setConsultationForm({
        studentId: '',
        studentName: '',
        schoolName: '',
        schoolGrade: '중1',
        scores: { vocab: 60, grammar: 60, syntax: 60, reading: 60, writing: 60 },
        diagnosis: '',
        recommendedClass: '',
        recommendedBooks: '',
        consultationMemo: ''
      });
      setSelectedTestId('');
      setWrongAnswers([]);
      setEditingConsultationId(null);
      
      showAlert('레벨 테스트 및 상담 리포트가 성공적으로 수정 및 업데이트되었습니다.');
      if (andPrint) {
        setPrintConsultationId(editingConsultationId);
      }
      return;
    }

    const newConsultation = {
      id: newId,
      studentId: targetStudentId,
      consultationDate: new Date().toISOString().slice(0, 10),
      ...consultationForm,
      testId: selectedTestId, // 선택한 레벨테스트 식별용 ID 동시 보존
      schoolGrade: finalGrade, // 원생의 실제 현재 학년으로 오염 방지 및 강제 보정
      scores: finalScores
    };

    const nextConsultations = [newConsultation, ...consultations];
    setConsultations(nextConsultations);
    if (!persist(storage.saveConsultations(nextConsultations))) return;

    // 폼 초기화
    setConsultationForm({
      studentId: '',
      studentName: '',
      schoolName: '',
      schoolGrade: '중1',
      scores: { vocab: 60, grammar: 60, syntax: 60, reading: 60, writing: 60 },
      diagnosis: '',
      recommendedClass: '',
      recommendedBooks: '',
      consultationMemo: ''
    });
    setSelectedTestId('');
    setWrongAnswers([]);
    setAutoRegister(true);
    
    showAlert('레벨 테스트 및 상담 리포트가 성공적으로 저장되었습니다.');
    if (andPrint) {
      setPrintConsultationId(newId);
    }
  };

  const handleEditConsultationStart = (consultation) => {
    setConsultationForm({
      studentId: consultation.studentId || '',
      studentName: consultation.studentName || '',
      schoolName: consultation.schoolName || '',
      schoolGrade: consultation.schoolGrade || '중1',
      scores: {
        vocab: consultation.scores?.vocab !== undefined ? consultation.scores.vocab : 60,
        grammar: consultation.scores?.grammar !== undefined ? consultation.scores.grammar : 60,
        syntax: consultation.scores?.syntax !== undefined ? consultation.scores.syntax : 60,
        reading: consultation.scores?.reading !== undefined ? consultation.scores.reading : 60,
        writing: consultation.scores?.writing !== undefined ? consultation.scores.writing : 60
      },
      diagnosis: consultation.diagnosis || '',
      recommendedClass: consultation.recommendedClass || '',
      recommendedBooks: consultation.recommendedBooks || '',
      consultationMemo: consultation.consultationMemo || ''
    });
    
    if (consultation.testId) {
      setSelectedTestId(consultation.testId);
      setWrongAnswers([]);
    } else {
      setSelectedTestId('');
      setWrongAnswers([]);
    }
    
    setEditingConsultationId(consultation.id);
    setActiveTab('consultations');
    showAlert('상담 카드 수정 모드로 진입했습니다. 수정 후 저장해주세요.', 'warning');
  };

  const handleEditConsultationCancel = () => {
    setConsultationForm({
      studentId: '',
      studentName: '',
      schoolName: '',
      schoolGrade: '중1',
      scores: { vocab: 60, grammar: 60, syntax: 60, reading: 60, writing: 60 },
      diagnosis: '',
      recommendedClass: '',
      recommendedBooks: '',
      consultationMemo: ''
    });
    setSelectedTestId('');
    setWrongAnswers([]);
    setEditingConsultationId(null);
    showAlert('상담 수정을 취소했습니다.', 'info');
  };

  const handleDeleteConsultation = (id) => {
    if (!window.confirm('이 상담 기록을 삭제하시겠습니까?')) return;
    const nextConsultations = consultations.filter(c => c.id !== id);
    setConsultations(nextConsultations);
    if (!persist(storage.saveConsultations(nextConsultations))) return;
    showAlert('상담 카드가 삭제되었습니다.', 'warning');
  };

  // === 4. 백업 및 복구 핸들러 ===
  const handleRestoreFile = async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    try {
      // 1단계: 파일 검증 (아직 아무것도 덮어쓰지 않음)
      const { data, summary } = await readBackupFile(file);

      // 2단계: 사용자 확인 — 무엇을 불러오는지 건수로 보여준다
      const confirmed = window.confirm(
        `백업 파일에서 학생 ${summary.students}명, 성적 ${summary.grades}건, 상담 ${summary.consultations}건을 불러옵니다.\n\n` +
        `복원하면 현재 브라우저의 데이터를 덮어씁니다.\n` +
        `(안전을 위해 현재 데이터가 자동으로 백업 파일로 먼저 저장됩니다.)\n\n진행할까요?`
      );
      if (!confirmed) {
        e.target.value = null;
        return;
      }

      // 3단계: 복원 직전 현재 데이터 자동 백업 (실수 복원 대비)
      const hasExistingData = students.length > 0 || grades.length > 0 || consultations.length > 0;
      if (hasExistingData) {
        backupData('_복원전_자동백업');
      }

      // 4단계: 실제 적용 및 화면 동기화
      applyBackupData(data);
      setStudents(storage.getStudents());
      setGrades(storage.getGrades());
      setConsultations(storage.getConsultations());
      setApiSettings(storage.getApiSettings());
      showAlert('데이터 백업 복구가 완료되었습니다!');
    } catch (err) {
      showAlert(err.message, 'danger');
    }
    e.target.value = null; // 인풋 초기화
  };

  // API 설정 저장
  const handleSaveSettings = (e) => {
    e.preventDefault();
    if (!persist(storage.saveApiSettings(apiSettings))) return;
    showAlert('LLM 연동 설정이 저장되었습니다.');
  };

  // 선택된 학생의 성적 정보 필터링 (날짜순 정렬 — 과거 성적을 나중에 입력해도 추이가 어긋나지 않음)
  const selectedStudent = students.find(s => s.id === selectedStudentId);
  const selectedStudentGrades = sortGradesByDate(grades.filter(g => g.studentId === selectedStudentId));

  // 성적 유형 라벨 조회(기준정보 연동). 고정 5종이 아니라 강사가 등록한 유형을 따른다.
  const typeLabel = (type) => gradeTypeLabel(type, master.gradeTypes);

  // 추이 차트는 특정 유형 하드코딩 대신, 학생이 입력한 모든 성적 유형을 시간순으로 반영한다.
  // 유형별로 2회 이상 점수가 쌓인 것만 차트로(최근 7회). 화면·인쇄 리포트 공용.
  const computeGradeTrends = (gradeList) => {
    const byType = new Map();
    for (const g of gradeList) {
      if (g.score === '' || g.score == null) continue;
      const score = Number(g.score);
      if (Number.isNaN(score)) continue;
      if (!byType.has(g.type)) byType.set(g.type, []);
      byType.get(g.type).push({ date: displayGradeDate(g.date), score });
    }
    return Array.from(byType.entries())
      .filter(([, arr]) => arr.length >= 2)
      .map(([type, arr]) => ({ type, data: arr.slice(-7) }));
  };
  const gradeTrends = computeGradeTrends(selectedStudentGrades);

  // 실행 잠금: 해제 전에는 학생 데이터 UI를 아예 마운트하지 않는다
  if (isLocked) {
    return <LockScreen onUnlock={() => setIsLocked(false)} brandName={brandName} />;
  }

  // 기준정보 삭제 안전장치용: 각 항목명이 기존 기록에서 몇 번 참조되는지 집계.
  // 참조는 이름 스냅샷 기반이라 삭제해도 기존 표기는 깨지지 않지만, 강사에게 사용 현황을 경고한다.
  const countInto = (acc, arr, getName) => {
    arr.forEach(x => {
      const n = getName(x);
      if (n) acc[n] = (acc[n] || 0) + 1;
    });
    return acc;
  };
  const usageCounts = {
    schools: countInto({}, students, s => s.school),
    courses: countInto({}, consultations, c => c.recommendedClass),
    // 교재는 상담 추천교재 + 분기리포트 교재 양쪽에서 집계
    textbooks: countInto(
      countInto({}, consultations, c => c.recommendedBooks),
      quarterlyReports, r => r.textbook
    ),
    // 성적 유형은 grade.type(키) 기준 집계
    gradeTypes: countInto({}, grades, g => g.type)
  };

  // 사이드바 내비게이션 공통 속성 (마우스 + 키보드 접근성)
  const navProps = (tab) => ({
    role: 'button',
    tabIndex: 0,
    'aria-current': activeTab === tab ? 'page' : undefined,
    className: `nav-item ${activeTab === tab ? 'active' : ''}`,
    onClick: () => setActiveTab(tab),
    onKeyDown: (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        setActiveTab(tab);
      }
    }
  });

  return (
    <div className="app-container">
      {/* 알림 메시지 팝업 */}
      {alertMsg.text && (
        <div role="status" style={{
          position: 'fixed', top: '24px', right: '24px', zIndex: 1100,
          padding: '16px 24px', borderRadius: '8px', fontSize: '14px', fontWeight: 'bold',
          color: '#ffffff', boxShadow: '0 10px 25px rgba(0,0,0,0.25)',
          backgroundColor: alertMsg.type === 'danger' ? 'var(--danger-color)' : (alertMsg.type === 'warning' ? 'var(--warning-color)' : 'var(--success-color)'),
          transition: 'all 0.3s ease'
        }}>
          {alertMsg.text}
        </div>
      )}

      {/* LNB 사이드바 */}
      <aside className="sidebar">
        <div className="brand-section">
          <span className="brand-title">EduTrack EN</span>
          <span className="brand-subtitle">{brandName}</span>
        </div>

        <ul className="nav-menu">
          <li {...navProps('dashboard')}>
            📊 대시보드
          </li>
          <li {...navProps('students')}>
            👤 학생 등록 및 관리
          </li>
          <li {...navProps('grades')}>
            ✍️ 성적 처리 및 추적
          </li>
          <li {...navProps('consultations')}>
            🎯 레벨 테스트 및 상담지
          </li>

          <div style={{ margin: '15px 0 5px 0', borderTop: '1px solid var(--border-color)', opacity: 0.6 }} />
          <div style={{ padding: '0 12px 6px 12px', fontSize: '11px', fontWeight: 'bold', color: 'var(--text-color-light)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>평가 자료실 & 부록</div>

          <li {...navProps('achievement')}>
            📝 평가 시험지 인쇄
          </li>
          <li {...navProps('classes')}>
            🏫 반별 운영
          </li>
          <li {...navProps('lectures')}>
            📖 교안 자료실
          </li>
          <li {...navProps('vocab')}>
            📚 단어 해설
          </li>
          <li {...navProps('admin')}>
            🗂 관리 (기준정보)
          </li>
          <li {...navProps('settings')}>
            ⚙️ 시스템 및 LLM 설정
          </li>
        </ul>

        <div style={{ marginTop: 'auto', display: 'flex', flexDirection: 'column', gap: '8px' }}>
          {lockEnabled && (
            <button className="btn btn-secondary" onClick={() => setIsLocked(true)} style={{ width: '100%' }}>
              지금 화면 잠그기
            </button>
          )}
          <div style={{ fontSize: '11px', color: 'var(--text-color-light)', textAlign: 'center' }}>
            v{APP_VERSION} (오프라인 브라우저형)
          </div>
        </div>
      </aside>

      {/* 메인 뷰 */}
      <main className="main-content">

        {/* 탭 1: 대시보드 */}
        {activeTab === 'dashboard' && (
          <Dashboard
            students={students}
            grades={grades}
            consultations={consultations}
            master={master}
            onNavigate={setActiveTab}
            onBackup={backupData}
          />
        )}

        {/* 탭 2: 학생 등록 및 관리 */}
        {activeTab === 'students' && (
          <div>
            <div className="content-header">
              <div className="header-title-wrapper">
                <h1>학생 등록 및 목록 관리</h1>
                <p>새로운 원생을 등록하고, 인적사항 및 수강 상태를 개별 관리합니다.</p>
              </div>
            </div>

            <div className="student-manager-layout">
              {/* 왼쪽: 학생 리스트 */}
              <div className="card student-list-card">
                <h3>원생 목록 ({students.length}명)</h3>
                
                {/* 상태 필터 탭 */}
                <div style={{ display: 'flex', gap: '4px', marginBottom: '16px', overflowX: 'auto', paddingBottom: '4px' }}>
                  {[
                    { id: 'all', label: '전체' },
                    { id: 'enroll', label: '재원생' },
                    { id: 'consult', label: '상담생' },
                    { id: 'etc', label: '휴/퇴원' }
                  ].map(tab => (
                    <button
                      key={tab.id}
                      type="button"
                      className="btn"
                      style={{
                        padding: '6px 10px',
                        fontSize: '12px',
                        backgroundColor: statusFilter === tab.id ? 'var(--primary-accent)' : 'transparent',
                        color: statusFilter === tab.id ? '#ffffff' : 'var(--text-color-secondary)',
                        border: statusFilter === tab.id ? '1px solid var(--primary-accent)' : '1px solid var(--border-color)',
                        borderRadius: '20px',
                        cursor: 'pointer',
                        whiteSpace: 'nowrap'
                      }}
                      onClick={() => setStatusFilter(tab.id)}
                    >
                      {tab.label}
                    </button>
                  ))}
                </div>

                <div className="student-list-wrapper">
                  {(() => {
                    const filteredStudents = students.filter(s => {
                      if (statusFilter === 'all') return true;
                      if (statusFilter === 'enroll') return s.status === '재원';
                      if (statusFilter === 'consult') return s.status === '상담';
                      if (statusFilter === 'etc') return s.status === '휴원' || s.status === '퇴원';
                      return true;
                    });
                    
                    return filteredStudents.map(s => {
                      let badgeStyle = { backgroundColor: 'var(--success-color)', color: '#ffffff' };
                      if (s.status === '상담') {
                        badgeStyle = { backgroundColor: 'rgba(184, 134, 11, 0.1)', color: 'var(--warning-color)' };
                      } else if (s.status === '휴원' || s.status === '퇴원') {
                        badgeStyle = { backgroundColor: 'rgba(192, 57, 43, 0.1)', color: 'var(--danger-color)' };
                      }

                      // 레벨테스트 유무는 상담 기록과 실시간 연동 (기록 삭제 시 '미실시'로 복귀)
                      const hasLevelTest = consultations.some(c => c.studentId === s.id);

                      return (
                        <div
                          key={s.id}
                          className={`student-item ${selectedStudentId === s.id ? 'active' : ''}`}
                          onClick={() => {
                            setSelectedStudentId(s.id);
                            setIsEditingStudent(false);
                          }}
                        >
                          <div className="student-item-header">
                            <span className="student-item-name">{s.name}</span>
                            <span className="badge" style={badgeStyle}>{s.status}</span>
                          </div>
                          <span className="student-item-school">
                            {s.school || '학교 미지정'} · {s.grade} ·{' '}
                            <span style={{ fontWeight: 700, color: hasLevelTest ? 'var(--success-color)' : 'var(--warning-color)' }}>
                              {hasLevelTest ? '레벨테스트 완료' : '레벨테스트 미실시'}
                            </span>
                          </span>
                        </div>
                      );
                    });
                  })()}
                  {students.length === 0 && <p style={{ textAlign: 'center', color: 'var(--text-color-light)', padding: '20px 0' }}>등록된 원생이 없습니다.</p>}
                </div>
              </div>

              {/* 오른쪽: 상세 프로필 & 등록 폼 */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
                {/* 등록 폼 */}
                <div className="card">
                  <h3>신규 학생 등록</h3>
                  <form onSubmit={handleAddStudent} style={{ marginTop: '16px' }}>
                    <div className="form-row">
                      <div className="form-group">
                        <label>이름 *</label>
                        <input className="form-control" type="text" placeholder="예: 김민수" value={studentForm.name} onChange={e => setStudentForm({...studentForm, name: e.target.value})} />
                      </div>
                      <div className="form-group">
                        <label>학교</label>
                        <input 
                          className="form-control" 
                          type="text" 
                          list="school-options" 
                          placeholder="학교 선택 또는 직접 입력" 
                          value={studentForm.school} 
                          onChange={e => setStudentForm({...studentForm, school: e.target.value})} 
                        />
                      </div>
                      <div className="form-group">
                        <label>학년</label>
                        <select className="form-control" value={studentForm.grade} onChange={e => setStudentForm({...studentForm, grade: e.target.value})}>
                          {master.grades.map(g => <option key={g} value={g}>{g}</option>)}
                        </select>
                      </div>
                      <div className="form-group">
                        <label>수강 반(과정)</label>
                        <select className="form-control" value={studentForm.courseId} onChange={e => setStudentForm({...studentForm, courseId: e.target.value})}>
                          <option value="">미배정</option>
                          {master.courses.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                        </select>
                      </div>
                    </div>

                    <div className="form-row" style={{ marginTop: '12px' }}>
                      <div className="form-group">
                        <label>학생 연락처</label>
                        <input className="form-control" type="text" placeholder="예: 010-1234-5678" value={studentForm.phone} onChange={e => setStudentForm({...studentForm, phone: e.target.value})} />
                      </div>
                      <div className="form-group">
                        <label>학부모 연락처</label>
                        <input className="form-control" type="text" placeholder="예: 010-9876-5432" value={studentForm.parentPhone} onChange={e => setStudentForm({...studentForm, parentPhone: e.target.value})} />
                      </div>
                      <div className="form-group">
                        <label>상태</label>
                        <select className="form-control" value={studentForm.status} onChange={e => setStudentForm({...studentForm, status: e.target.value})}>
                          <option>재원</option><option>상담</option><option>휴원</option><option>퇴원</option>
                        </select>
                      </div>
                    </div>

                    <div className="form-group" style={{ marginTop: '12px' }}>
                      <label>학생 관리용 종합 메모</label>
                      <textarea className="form-control" style={{ minHeight: '80px', resize: 'vertical' }} placeholder="수강 이력, 학업 태도, 보완 필요 영역 등 자유롭게 기입" value={studentForm.memo} onChange={e => setStudentForm({...studentForm, memo: e.target.value})} />
                    </div>

                    <button type="submit" className="btn btn-primary" style={{ marginTop: '12px', width: '100%' }}>신규 원생 정보 추가</button>
                  </form>
                </div>

                {/* 개별 상세 정보 표기 */}
                {selectedStudent && (
                  <div className="card">
                    {isEditingStudent ? (
                      <form onSubmit={(e) => handleUpdateStudent(e, selectedStudent.id)}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                          <h2>[{selectedStudent.name}] 정보 수정</h2>
                          <div style={{ display: 'flex', gap: '8px' }}>
                            <button type="submit" className="btn btn-primary" style={{ padding: '8px 12px', fontSize: '12.5px', backgroundColor: 'var(--success-color)' }}>수정 완료</button>
                            <button type="button" className="btn btn-secondary" style={{ padding: '8px 12px', fontSize: '12.5px' }} onClick={handleEditCancel}>취소</button>
                          </div>
                        </div>

                        <div className="form-row">
                          <div className="form-group">
                            <label>학생 이름 *</label>
                            <input className="form-control" type="text" value={editingStudentForm.name} onChange={e => setEditingStudentForm({...editingStudentForm, name: e.target.value})} />
                          </div>
                          <div className="form-group">
                            <label>학교</label>
                            <input className="form-control" type="text" list="school-options" value={editingStudentForm.school} onChange={e => setEditingStudentForm({...editingStudentForm, school: e.target.value})} />
                          </div>
                          <div className="form-group">
                            <label>학년</label>
                            <select className="form-control" value={editingStudentForm.grade} onChange={e => setEditingStudentForm({...editingStudentForm, grade: e.target.value})}>
                              {master.grades.map(g => <option key={g} value={g}>{g}</option>)}
                            </select>
                          </div>
                          <div className="form-group">
                            <label>수강 반(과정)</label>
                            <select className="form-control" value={editingStudentForm.courseId} onChange={e => setEditingStudentForm({...editingStudentForm, courseId: e.target.value})}>
                              <option value="">미배정</option>
                              {master.courses.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                            </select>
                          </div>
                        </div>

                        <div className="form-row" style={{ marginTop: '12px' }}>
                          <div className="form-group">
                            <label>학생 연락처</label>
                            <input className="form-control" type="text" value={editingStudentForm.phone} onChange={e => setEditingStudentForm({...editingStudentForm, phone: e.target.value})} />
                          </div>
                          <div className="form-group">
                            <label>학부모 연락처</label>
                            <input className="form-control" type="text" value={editingStudentForm.parentPhone} onChange={e => setEditingStudentForm({...editingStudentForm, parentPhone: e.target.value})} />
                          </div>
                          <div className="form-group">
                            <label>상태</label>
                            <select className="form-control" value={editingStudentForm.status} onChange={e => setEditingStudentForm({...editingStudentForm, status: e.target.value})}>
                              <option>재원</option><option>상담</option><option>휴원</option><option>퇴원</option>
                            </select>
                          </div>
                        </div>

                        <div className="form-group" style={{ marginTop: '12px' }}>
                          <label>학생 관리용 종합 메모</label>
                          <textarea className="form-control" style={{ minHeight: '80px', resize: 'vertical' }} value={editingStudentForm.memo} onChange={e => setEditingStudentForm({...editingStudentForm, memo: e.target.value})} />
                        </div>
                      </form>
                    ) : (
                      <>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px', flexWrap: 'wrap', gap: '8px' }}>
                          <h2>[{selectedStudent.name}] 학생 상세 프로필</h2>
                          <div style={{ display: 'flex', gap: '8px' }}>
                            <button className="btn btn-secondary" style={{ padding: '8px 12px', fontSize: '12.5px', backgroundColor: 'var(--primary-accent-light)', color: 'var(--primary-accent)', border: 'none' }} onClick={() => handleEditStart(selectedStudent)}>정보 수정</button>
                            <button className="btn btn-primary" style={{ padding: '8px 12px', fontSize: '12.5px' }} onClick={() => setPrintStudentId(selectedStudent.id)}>종합 리포트 인쇄</button>
                            <button className="btn btn-secondary btn-danger" style={{ padding: '8px 12px', fontSize: '12.5px' }} onClick={() => handleDeleteStudent(selectedStudent.id)}>정보 삭제</button>
                          </div>
                        </div>

                        <div className="table-responsive">
                          <table className="table">
                            <tbody>
                              <tr><th>현재 분류 상태</th><td style={{ fontWeight: 'bold', color: selectedStudent.status === '재원' ? 'var(--success-color)' : 'var(--text-color-secondary)' }}>{selectedStudent.status}</td></tr>
                              <tr><th>레벨테스트</th><td>{(() => {
                                const count = consultations.filter(c => c.studentId === selectedStudent.id).length;
                                return count > 0
                                  ? <span style={{ fontWeight: 'bold', color: 'var(--success-color)' }}>완료 ({count}건)</span>
                                  : <span style={{ fontWeight: 'bold', color: 'var(--warning-color)' }}>미실시</span>;
                              })()}</td></tr>
                              <tr><th>학교 / 학년</th><td>{selectedStudent.school || '미지정'} · {selectedStudent.grade}</td></tr>
                              <tr><th>학생 연락처</th><td>{selectedStudent.phone || '미기입'}</td></tr>
                              <tr><th>학부모 연락처</th><td>{selectedStudent.parentPhone || '미기입'}</td></tr>
                              <tr><th>등록일자</th><td>{selectedStudent.enrollDate}</td></tr>
                              <tr><th>특이사항 메모</th><td style={{ whiteSpace: 'pre-wrap' }}>{selectedStudent.memo || '작성된 메모가 없습니다.'}</td></tr>
                            </tbody>
                          </table>
                        </div>
                      </>
                    )}

                    {/* 영역별 약점 진단 (오답 누적 분석) */}
                    <WeaknessPanel
                      studentId={selectedStudent.id}
                      grades={grades}
                      consultations={consultations}
                      lectures={lectures}
                      showAlert={showAlert}
                    />

                    {/* 학부모 소통 타임라인 (상담지·분기 리포트 발송 이력 + 경과 환기) */}
                    <CommunicationTimeline
                      studentId={selectedStudent.id}
                      consultations={consultations}
                      quarterlyReports={quarterlyReports}
                    />

                    {/* 레벨테스트 기록 이력 연동 */}
                    {(() => {
                      const studentConsultations = consultations.filter(c => c.studentId === selectedStudent.id);
                      return (
                        <div style={{ marginTop: '20px', borderTop: '1px solid var(--border-color)', paddingTop: '16px' }}>
                          <h4 style={{ marginBottom: '12px', fontSize: '13.5px', color: 'var(--primary-accent)', fontWeight: 'bold' }}>레벨 테스트 및 진단서 기록</h4>
                          {studentConsultations.length > 0 ? (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                              {studentConsultations.map(c => {
                                const avgScore = calculateAvgScore(c.scores);
                                return (
                                  <div key={c.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 14px', borderRadius: '8px', border: '1px solid var(--border-color)', backgroundColor: 'rgba(255,255,255,0.01)' }}>
                                    <div>
                                      <span style={{ fontWeight: 'bold', fontSize: '13px' }}>{c.consultationDate} 레벨테스트</span>
                                      <span style={{ fontSize: '11px', color: 'var(--text-color-secondary)', marginLeft: '8px' }}>
                                        (평균: {avgScore}점)
                                      </span>
                                    </div>
                                    <button className="btn btn-primary" style={{ padding: '6px 10px', fontSize: '11.5px' }} onClick={() => setPrintConsultationId(c.id)}>
                                      진단서 인쇄 / PDF
                                    </button>
                                  </div>
                                );
                              })}
                            </div>
                          ) : (
                            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
                              <p style={{ fontSize: '12.5px', color: 'var(--text-color-light)', fontStyle: 'italic', margin: 0 }}>연동된 레벨 테스트 기록이 존재하지 않습니다.</p>
                              <button className="btn btn-secondary" style={{ padding: '6px 10px', fontSize: '11.5px' }} onClick={() => setActiveTab('consultations')}>
                                레벨테스트 상담 작성하기 →
                              </button>
                            </div>
                          )}
                        </div>
                      );
                    })()}
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* 탭 3: 성적 처리 및 추적 */}
        {activeTab === 'grades' && (
          <div>
            <div className="content-header">
              <div className="header-title-wrapper">
                <h1>성적 관리 및 개인별 트래커</h1>
                <p>등록된 원생을 선택하여 단어 시험 및 정기 평가 성적을 누적 기입하고 성취 변화를 추적합니다.</p>
              </div>
            </div>

            <div className="student-manager-layout">
              {/* 왼쪽: 학생 리스트 */}
              <div className="card student-list-card">
                <h3>원생 선택</h3>
                <div className="student-list-wrapper">
                  {students.map(s => (
                    <div 
                      key={s.id} 
                      className={`student-item ${selectedStudentId === s.id ? 'active' : ''}`}
                      onClick={() => setSelectedStudentId(s.id)}
                    >
                      <div className="student-item-header">
                        <span className="student-item-name">{s.name}</span>
                        <span className="student-item-school">{s.grade}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* 오른쪽: 성적 입력 및 성적 그래프 추적 */}
              <div>
                {!selectedStudentId ? (
                  <div className="card" style={{ textAlign: 'center', padding: '60px' }}>
                    <p style={{ fontSize: '16px', color: 'var(--text-color-light)' }}>성적을 처리할 학생을 왼쪽 리스트에서 먼저 선택해 주세요.</p>
                  </div>
                ) : (
                  <div className="student-detail-wrapper">
                    {/* 성적 입력 폼 */}
                    <div className="card">
                      <h3>[{selectedStudent.name}] 성적 점수 등록</h3>
                      <form onSubmit={handleAddGrade} style={{ marginTop: '16px' }}>
                        <div className="form-row">
                          <div className="form-group">
                            <label>시험 일자</label>
                            <input className="form-control" type="date" value={gradeForm.date} onChange={e => setGradeForm({...gradeForm, date: e.target.value})} />
                          </div>
                          <div className="form-group">
                            <label>시험 종류</label>
                            <select className="form-control" value={gradeForm.type}
                              onChange={e => handleGradeTypeChange(e.target.value)}>
                              {master.gradeTypes.map(t => <option key={t.id} value={t.key}>{t.label}</option>)}
                            </select>
                          </div>
                          <div className="form-group">
                            <label>점수 (100점 만점 기준) *</label>
                            <input className="form-control" type="number" placeholder="예: 85" min="0" max="100" value={gradeForm.score} onChange={e => setGradeForm({...gradeForm, score: e.target.value})} />
                          </div>
                        </div>

                        {/* 신입 레벨 테스트 선택 서브 드롭다운 */}
                        {gradeForm.type === 'level_test' && (
                          <div className="form-group" style={{ marginTop: '12px', marginBottom: '12px' }}>
                            <label>세부 레벨테스트 시험지 선택 *</label>
                            <select className="form-control" value={gradeForm.examId} 
                              onChange={e => handleGradeExamChange(e.target.value)} required>
                              {Object.entries(levelTestMapping).map(([id, info]) => (
                                <option key={id} value={id}>{info.title}</option>
                              ))}
                            </select>
                          </div>
                        )}

                        {/* 정기 성취도 테스트 선택 서브 드롭다운 */}
                        {gradeForm.type === 'achievement_test' && (
                          <div className="form-group" style={{ marginTop: '12px', marginBottom: '12px' }}>
                            <label>세부 성취도 테스트 시험지 선택 *</label>
                            <select className="form-control" value={gradeForm.examId} 
                              onChange={e => handleGradeExamChange(e.target.value)} required>
                              {getAchievementTestOptions().map(opt => (
                                <option key={opt.id} value={opt.id}>{opt.title}</option>
                              ))}
                            </select>
                          </div>
                        )}

                        {/* 오답 문항 마킹 패널 */}
                        {(gradeForm.type === 'level_test' || gradeForm.type === 'achievement_test') && (() => {
                          const isLevel = gradeForm.type === 'level_test';
                          const mapping = isLevel ? levelTestMapping : achievementTestMapping;
                          const testInfo = mapping[gradeForm.examId];
                          if (!testInfo) return null;
                          const totalQ = testInfo.totalQuestions || 30;
                          const qRange = Array.from({ length: totalQ }, (_, i) => i + 1);

                          return (
                            <div className="form-group" style={{ marginTop: '16px', marginBottom: '16px' }}>
                              <label style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontWeight: 'bold' }}>
                                <span>오답 문항 마킹 (총 {totalQ}문항, 틀린 문항을 클릭하세요)</span>
                                <span style={{ fontSize: '12px', color: 'var(--text-color-light)' }}>
                                  개당 감점: {(100 / totalQ).toFixed(1)}점
                                </span>
                              </label>
                              <div style={{ 
                                display: 'grid', 
                                gridTemplateColumns: 'repeat(auto-fill, minmax(40px, 1fr))', 
                                gap: '8px', 
                                marginTop: '8px',
                                padding: '12px',
                                backgroundColor: 'var(--bg-color-light)',
                                border: '1px solid var(--border-color)',
                                borderRadius: '8px'
                              }}>
                                {qRange.map(qNum => {
                                  const isWrong = gradeForm.wrongAnswers && gradeForm.wrongAnswers.includes(qNum);
                                  return (
                                    <button
                                      type="button"
                                      key={qNum}
                                      onClick={() => handleToggleWrongAnswer(qNum)}
                                      style={{
                                        height: '40px',
                                        borderRadius: '50%',
                                        border: '1px solid',
                                        borderColor: isWrong ? '#ef4444' : 'var(--border-color)',
                                        backgroundColor: isWrong ? '#fee2e2' : 'var(--card-bg)',
                                        color: isWrong ? '#ef4444' : 'var(--text-color-primary)',
                                        fontWeight: isWrong ? 'bold' : 'normal',
                                        cursor: 'pointer',
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: 'center',
                                        fontSize: '14px',
                                        transition: 'all 0.15s ease'
                                      }}
                                    >
                                      {qNum}
                                    </button>
                                  );
                                })}
                              </div>
                            </div>
                          );
                        })()}

                        <div className="form-group" style={{ marginTop: '12px' }}>
                          <label style={{ fontWeight: 'bold' }}>1차 자동 분석 피드백 / 특이사항 및 오답 분석</label>
                          <textarea 
                            className="form-control" 
                            rows="6" 
                            style={{ fontFamily: 'monospace', fontSize: '12.5px', lineHeight: '1.5' }} 
                            placeholder="자동 생성된 피드백 코멘트 혹은 교사 메모를 작성하세요" 
                            value={gradeForm.memo} 
                            onChange={e => setGradeForm({...gradeForm, memo: e.target.value})} 
                          />
                        </div>

                        <button type="submit" className="btn btn-primary" style={{ marginTop: '12px', width: '100%' }}>성적 점수 기록하기</button>
                      </form>
                    </div>

                    {/* 성적 추이 그래프 렌더링 */}
                    <div className="card">
                      <h3>학습 성취 성적 추이</h3>
                      {gradeTrends.length === 0 ? (
                        <p className="dash-empty">추이를 표시할 성적이 부족합니다. 같은 유형으로 2회 이상 점수가 쌓이면 표시됩니다.</p>
                      ) : (
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '20px', marginTop: '16px' }}>
                          {gradeTrends.map(t => (
                            <LineChart key={t.type} data={t.data} title={`${typeLabel(t.type)} 추이 (최근 7회)`} />
                          ))}
                        </div>
                      )}
                    </div>

                    {/* 누적 데이터 리스트 테이블 */}
                    <div className="card">
                      <h3>누적 성적 이력</h3>
                      <div className="table-responsive" style={{ marginTop: '16px' }}>
                        <table className="table">
                          <thead>
                            <tr>
                              <th>시험 일자</th>
                              <th>유형</th>
                              <th>점수</th>
                              <th>상태</th>
                              <th>비고 및 오답노트</th>
                              <th>피드백 발송</th>
                              <th>관리</th>
                            </tr>
                          </thead>
                          <tbody>
                            {selectedStudentGrades.map(g => (
                              <tr key={g.id}>
                                <td>{displayGradeDate(g.date)}</td>
                                <td>
                                  {g.examId ? getExamTitle(g.examId) : typeLabel(g.type)}
                                </td>
                                <td style={{ fontWeight: 'bold', color: 'var(--primary-accent)' }}>{g.score}점</td>
                                <td>
                                  {g.score >= PASS_THRESHOLD ? (
                                    <span className="badge badge-success">통과</span>
                                  ) : (
                                    <span className="badge badge-danger">재시험 대상</span>
                                  )}
                                </td>
                                <td>{g.memo || '-'}</td>
                                <td>
                                  <div style={{ display: 'flex', gap: '6px' }}>
                                    <button className="btn btn-primary" style={{ padding: '6px 10px', fontSize: '11.5px', backgroundColor: 'var(--success-color)', border: 'none' }} onClick={() => handleCopyFeedback(g)}>
                                      피드백 복사
                                    </button>
                                    {g.type === 'achievement_test' && (
                                      <button className="btn btn-primary" style={{ padding: '6px 10px', fontSize: '11.5px', backgroundColor: '#6366f1', border: 'none' }} onClick={() => setPrintAchievementId(g.id)}>
                                        평가지 인쇄
                                      </button>
                                    )}
                                    {g.type === 'level_test' && (() => {
                                      const c = consultations.find(x => x.studentId === g.studentId);
                                      if (c) {
                                        return (
                                          <button className="btn btn-primary" style={{ padding: '6px 10px', fontSize: '11.5px', backgroundColor: '#0f172a', border: 'none' }} onClick={() => setPrintConsultationId(c.id)}>
                                            상담서 인쇄
                                          </button>
                                        );
                                      }
                                      return null;
                                    })()}
                                  </div>
                                </td>
                                <td>
                                  <button className="btn btn-secondary" style={{ padding: '6px 8px', fontSize: '11px' }} onClick={() => handleDeleteGrade(g.id)}>삭제</button>
                                </td>
                              </tr>
                            ))}
                            {selectedStudentGrades.length === 0 && (
                              <tr>
                                <td colSpan="7" style={{ textAlign: 'center', color: 'var(--text-color-light)', padding: '20px' }}>기록된 성적 데이터가 없습니다.</td>
                              </tr>
                            )}
                          </tbody>
                        </table>
                      </div>
                    </div>

                    {/* ── 분기 리포트 작성 패널 ── */}
                    <div className="card" style={{ marginTop: '30px', borderLeft: '4px solid var(--primary-accent)' }}>
                      <h3>분기 리포트 작성 (학부모 발행용)</h3>
                      <p style={{ fontSize: '13px', color: 'var(--text-color-secondary)', marginTop: '6px' }}>
                        현재 선택된 원생 <strong>[{selectedStudent.name}]</strong>의 최신 성취도 성적이 자동 연결됩니다.
                      </p>
                      <form onSubmit={(e) => handleSaveQuarterlyReport(e, false)} style={{ marginTop: '20px' }}>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginBottom: '16px' }}>
                          <div className="form-group">
                            <label className="form-label">분기 (기간) *</label>
                            <input className="form-control" type="text" placeholder="예: 3~5월" value={quarterlyForm.period}
                              onChange={e => setQuarterlyForm(p => ({ ...p, period: e.target.value }))} />
                          </div>
                          <div className="form-group">
                            <label className="form-label">사용 교재</label>
                            <input className="form-control" type="text" list="textbook-options" placeholder="교재 선택 또는 직접 입력" value={quarterlyForm.textbook}
                              onChange={e => setQuarterlyForm(p => ({ ...p, textbook: e.target.value }))} />
                          </div>
                        </div>
                        <div className="form-group" style={{ marginBottom: '16px' }}>
                          <label className="form-label">수업 챕터 목록 (줄바꿈으로 구분)</label>
                          {/* 선택한 교재에 등록된 챕터가 있으면 버튼으로 빠르게 추가(직접 편집도 가능) */}
                          {(() => {
                            const matched = master.textbooks.find(t => t.name === quarterlyForm.textbook);
                            if (!matched || matched.chapters.length === 0) return null;
                            const current = quarterlyForm.chapters.split('\n').map(l => l.trim()).filter(Boolean);
                            return (
                              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginBottom: '8px' }}>
                                <span style={{ fontSize: '12px', color: 'var(--text-color-light)', width: '100%' }}>'{matched.name}' 챕터에서 추가:</span>
                                {matched.chapters.map(ch => {
                                  const already = current.includes(ch);
                                  return (
                                    <button key={ch} type="button" className="btn btn-secondary"
                                      style={{ fontSize: '11.5px', padding: '4px 10px', opacity: already ? 0.4 : 1 }}
                                      disabled={already}
                                      onClick={() => setQuarterlyForm(p => ({ ...p, chapters: [...current, ch].join('\n') }))}>
                                      + {ch}
                                    </button>
                                  );
                                })}
                              </div>
                            );
                          })()}
                          <textarea className="form-control" rows={4}
                            placeholder={"Chapter 1 - 명사와 관사\nChapter 2 - 대명사"}
                            value={quarterlyForm.chapters}
                            onChange={e => setQuarterlyForm(p => ({ ...p, chapters: e.target.value }))}
                            style={{ fontFamily: 'inherit', resize: 'vertical' }} />
                        </div>
                        <div style={{ display: 'flex', gap: '10px', marginBottom: '12px', alignItems: 'center' }}>
                          <span style={{ fontSize: '13px', fontWeight: 'bold', color: 'var(--text-color-secondary)' }}>교사 코멘트 자동 초안:</span>
                          <button type="button" className="btn btn-secondary" style={{ fontSize: '13px', padding: '7px 14px' }}
                            onClick={() => handleGenerateQuarterlyComment('rule')} disabled={isQLoading}>규칙 기반</button>
                          <button type="button" className="btn btn-primary"
                            style={{ fontSize: '13px', padding: '7px 14px', opacity: apiSettings.apiKey ? 1 : 0.5 }}
                            onClick={() => handleGenerateQuarterlyComment('llm')} disabled={isQLoading || !apiSettings.apiKey}
                            title={!apiSettings.apiKey ? 'API Key를 먼저 설정하세요' : ''}>
                            AI (LLM){isQLoading ? ' 생성 중...' : ''}
                          </button>
                        </div>
                        <div className="form-group" style={{ marginBottom: '20px' }}>
                          <label className="form-label">Teacher's Comment — 직접 편집 가능</label>
                          <textarea className="form-control" rows={6}
                            placeholder="위 버튼으로 초안을 자동 생성하거나 직접 입력하세요."
                            value={quarterlyForm.teacherComment}
                            onChange={e => setQuarterlyForm(p => ({ ...p, teacherComment: e.target.value }))}
                            style={{ fontFamily: 'inherit', lineHeight: '1.7', resize: 'vertical' }} />
                        </div>
                        <div style={{ display: 'flex', gap: '12px' }}>
                          <button type="submit" className="btn btn-secondary" style={{ padding: '11px 22px' }}>저장만 하기</button>
                          <button type="button" className="btn btn-primary" style={{ padding: '11px 22px' }}
                            onClick={(e) => handleSaveQuarterlyReport(e, true)}>저장 후 리포트 인쇄</button>
                        </div>
                      </form>
                    </div>

                    {/* 기발행 리포트 목록 (이 학생 것만 필터링) */}
                    {(() => {
                      const studentReports = quarterlyReports.filter(r => r.studentId === selectedStudentId);
                      if (studentReports.length === 0) return null;
                      return (
                        <div className="card" style={{ marginTop: '24px' }}>
                          <h3>[{selectedStudent.name}] 원생의 기발행 분기 리포트 ({studentReports.length}건)</h3>
                          <div className="table-responsive" style={{ marginTop: '12px' }}>
                            <table className="table">
                              <thead>
                                <tr><th>발행일</th><th>분기</th><th>교재</th><th>관리</th></tr>
                              </thead>
                              <tbody>
                                {studentReports.map(r => (
                                  <tr key={r.id}>
                                    <td>{r.createdAt}</td>
                                    <td>{r.period}</td>
                                    <td style={{ fontSize: '12px', color: 'var(--text-color-secondary)' }}>{r.textbook || '-'}</td>
                                    <td style={{ display: 'flex', gap: '6px' }}>
                                      <button className="btn btn-primary" style={{ padding: '4px 10px', fontSize: '11px' }}
                                        onClick={() => setPrintQuarterlyId(r.id)}>인쇄</button>
                                      <button className="btn btn-secondary btn-danger" style={{ padding: '4px 10px', fontSize: '11px' }}
                                        onClick={() => handleDeleteQuarterlyReport(r.id)}>삭제</button>
                                    </td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        </div>
                      );
                    })()}

                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* 탭 4: 레벨 테스트 및 상담지 */}
        {activeTab === 'consultations' && (
          <div>
            <div className="content-header">
              <div className="header-title-wrapper">
                <h1>레벨 테스트 성적 분석 및 프리미엄 상담지</h1>
                <p>신규 학생 내방 시 5대 분야별 테스트 점수를 기입하고, LLM 1차 분석을 통해 학부모 대면용 A4 보고서를 즉시 편찬합니다.</p>
              </div>
            </div>

            {/* 상담서 작성 폼과 차트 미리보기 레이아웃 */}
            <div className="leveltest-editor-layout">
              {/* 왼쪽: 작성 폼 */}
              <div className="card">
                {editingConsultationId ? (
                  <h3 style={{ color: 'var(--primary-accent, #7c3aed)' }}>레벨 테스트 및 상담지 수정 중 (대상: {consultationForm.studentName})</h3>
                ) : (
                  <h3>신규 테스트 성적 및 진단지 작성</h3>
                )}
                <form onSubmit={handleSaveConsultation} style={{ marginTop: '20px' }}>
                  <div className="form-group" style={{ marginBottom: '16px' }}>
                    <label>기존 등록 원생 연동 (선택사항)</label>
                    <select 
                      className="form-control" 
                      value={consultationForm.studentId || ''} 
                      onChange={e => {
                        const selId = e.target.value;
                        if (selId === '') {
                          setConsultationForm(prev => ({ ...prev, studentId: '', studentName: '', schoolName: '', schoolGrade: '중1' }));
                        } else {
                          const target = students.find(s => s.id === selId);
                          if (target) {
                            setConsultationForm(prev => ({ 
                              ...prev, 
                              studentId: target.id, 
                              studentName: target.name, 
                              schoolName: target.school || '',
                              schoolGrade: target.grade 
                            }));
                          }
                        }
                      }}
                    >
                      <option value="">-- 직접 입력 (신규 학생) --</option>
                      {students.map(s => (
                        <option key={s.id} value={s.id}>{s.name} ({s.school || '학교미지정'} - {s.grade})</option>
                      ))}
                    </select>
                  </div>

                  <div className="form-row">
                    <div className="form-group">
                      <label>학생 이름 *</label>
                      <input 
                        className="form-control" 
                        type="text" 
                        placeholder="예: 이나영" 
                        value={consultationForm.studentName} 
                        onChange={e => setConsultationForm({...consultationForm, studentName: e.target.value})}
                        disabled={!!consultationForm.studentId}
                      />
                    </div>
                    <div className="form-group">
                      <label>학교</label>
                      <input 
                        className="form-control" 
                        type="text" 
                        list="school-options" 
                        placeholder="학교 선택 또는 직접 입력" 
                        value={consultationForm.schoolName} 
                        onChange={e => setConsultationForm({...consultationForm, schoolName: e.target.value})}
                        disabled={!!consultationForm.studentId}
                      />
                    </div>
                    <div className="form-group">
                      <label>학년</label>
                      <select 
                        className="form-control" 
                        value={consultationForm.schoolGrade} 
                        onChange={e => {
                          const grade = e.target.value;
                          setConsultationForm({...consultationForm, schoolGrade: grade});
                          if (grade === '초등') {
                            setSelectedTestId('elementary_test');
                            handleWrongAnswersChange('elementary_test', []);
                          }
                        }}
                        disabled={!!consultationForm.studentId}
                      >
                        {master.grades.map(g => <option key={g} value={g}>{g}</option>)}
                      </select>
                    </div>
                  </div>

                  {!consultationForm.studentId && (
                    <div style={{ margin: '8px 0 16px 0', display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <input 
                        type="checkbox" 
                        id="autoRegisterCheck" 
                        checked={autoRegister} 
                        onChange={e => setAutoRegister(e.target.checked)}
                      />
                      <label htmlFor="autoRegisterCheck" style={{ fontSize: '12.5px', color: 'var(--text-color-secondary)', cursor: 'pointer' }}>
                        레벨테스트 저장 시 학생 관리 목록에 자동 원생 등록
                      </label>
                    </div>
                  )}

                  {/* 레벨테스트 오답 마킹 채점 도우미 섹션 */}
                  <div style={{ padding: '16px', borderRadius: '12px', border: '1px solid var(--border-color)', backgroundColor: 'var(--card-bg-subtle)', marginBottom: '20px', marginTop: '20px' }}>
                    <h4 style={{ margin: '0 0 12px 0', fontSize: '14.5px', fontWeight: 'bold', display: 'flex', alignItems: 'center', gap: '6px' }}>
                      레벨테스트 오답 마킹 채점 도우미
                    </h4>
                    <div className="form-group" style={{ marginBottom: '12px' }}>
                      <label style={{ fontSize: '12.5px' }}>풀이한 레벨테스트 시험지 선택</label>
                      <select 
                        className="form-control"
                        value={selectedTestId}
                        onChange={e => {
                          const testId = e.target.value;
                          setSelectedTestId(testId);
                          handleWrongAnswersChange(testId, []);
                          
                          // 기존 등록 학생 연동이 아닐 때만 학년 자동 제안 수행
                          if (!consultationForm.studentId) {
                            if (testId === 'elementary_test') {
                              setConsultationForm(prev => ({ ...prev, schoolGrade: '초등' }));
                            } else if (testId && testId.startsWith('middle_')) {
                              setConsultationForm(prev => ({ ...prev, schoolGrade: '중1' }));
                            } else if (testId && testId.startsWith('high_')) {
                              setConsultationForm(prev => ({ ...prev, schoolGrade: '고1' }));
                            }
                          }
                        }}
                      >
                        <option value="">-- 시험지 선택 안 함 (수동 점수 기입) --</option>
                        {Object.entries(levelTestMapping).map(([key, val]) => (
                          <option key={key} value={key}>{val.title}</option>
                        ))}
                      </select>
                    </div>

                    {selectedTestId && levelTestMapping[selectedTestId] && (() => {
                      const testInfo = levelTestMapping[selectedTestId];
                      const qCount = testInfo.totalQuestions;
                      const wrongSet = new Set(wrongAnswers);
                      
                      return (
                        <div>
                          <p style={{ margin: '0 0 8px 0', fontSize: '12px', color: 'var(--text-color-secondary)', lineHeight: '1.4' }}>
                            <strong>오답 마킹</strong>: 아래 문항 번호 중 <strong>학생이 틀린 문제 번호만 클릭</strong>하세요. (자동 감점 및 1차 코멘트 연동)
                          </p>
                          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                            {Array.from({ length: qCount }, (_, i) => i + 1).map(num => {
                              const isWrong = wrongSet.has(num);
                              
                              let sectionName = '';
                              for (let sec of Object.keys(testInfo.sections)) {
                                if (testInfo.sections[sec].questions.includes(num)) {
                                  sectionName = testInfo.sections[sec].name.split(' ')[0];
                                  break;
                                }
                              }

                              return (
                                <button
                                  key={num}
                                  type="button"
                                  style={{
                                    width: '44px',
                                    height: '40px',
                                    borderRadius: '6px',
                                    border: isWrong ? '1.5px solid var(--danger-color)' : '1px solid var(--border-color)',
                                    backgroundColor: isWrong ? 'rgba(239, 68, 68, 0.15)' : 'var(--card-bg)',
                                    color: isWrong ? 'var(--danger-color)' : 'var(--text-color-primary)',
                                    fontWeight: 'bold',
                                    fontSize: '12px',
                                    cursor: 'pointer',
                                    display: 'flex',
                                    flexDirection: 'column',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    transition: 'all 0.2s ease',
                                    padding: '2px 0'
                                  }}
                                  onClick={() => {
                                    const updated = new Set(wrongAnswers);
                                    if (updated.has(num)) {
                                      updated.delete(num);
                                    } else {
                                      updated.add(num);
                                    }
                                    handleWrongAnswersChange(selectedTestId, Array.from(updated));
                                  }}
                                  title={`${num}번 - ${sectionName}`}
                                >
                                  <span>{num}</span>
                                  <span style={{ fontSize: '8.5px', fontWeight: 'normal', opacity: 0.75 }}>{sectionName}</span>
                                </button>
                              );
                            })}
                          </div>
                        </div>
                      );
                    })()}
                  </div>

                  <h4 style={{ margin: '20px 0 10px 0', fontSize: '13.5px', color: 'var(--text-color-secondary)' }}>영역별 득점율 (100점 만점 기준)</h4>
                  
                  {['vocab', 'grammar', 'syntax', 'reading', 'writing'].map(field => {
                    const isNa = consultationForm.scores[field] === 'N/A';
                    if (isNa) return null;

                    return (
                      <div key={field} style={{ display: 'flex', alignItems: 'center', gap: '16px', marginBottom: '10px' }}>
                        <label style={{ width: '110px', fontSize: '13px', fontWeight: 'bold' }}>
                          {field === 'vocab' ? '어휘력 (Vocab)' :
                           field === 'grammar' ? '문법/어법 (Grammar)' :
                           field === 'syntax' ? '구문분석 (Syntax)' :
                           field === 'reading' ? '논리독해 (Reading)' : '서술형영작 (Writing)'}
                        </label>
                        <input 
                          type="range" min="0" max="100" step="5"
                          style={{ flexGrow: 1 }}
                          value={consultationForm.scores[field]} 
                          onChange={e => handleScoreChange(field, e.target.value)} 
                        />
                        <input 
                          className="form-control" type="number" min="0" max="100" 
                          style={{ width: '70px', padding: '6px' }}
                          value={consultationForm.scores[field]} 
                          onChange={e => handleScoreChange(field, e.target.value)}
                        />
                      </div>
                    );
                  })}

                  {/* AI 1차 자동 작성 오케스트레이션 영역 */}
                  <div className="llm-action-box" style={{ marginTop: '24px' }}>
                    <div className="llm-status-text">
                      진단 의견 1차 생성 엔진
                    </div>
                    <p style={{ fontSize: '12px', color: 'var(--text-color-secondary)' }}>
                      레벨테스트 점수를 기반으로 평가 기준표에 입각한 진단 의견서 초안을 만듭니다. 
                      {apiSettings.apiKey ? ' 설정된 LLM API를 사용하여 맞춤형 소견을 생성합니다.' : ' API 키가 없으므로 시스템 내장 규칙(Rule)을 사용해 즉시 생성합니다.'}
                    </p>
                    <div style={{ display: 'flex', gap: '8px' }}>
                      <button 
                        type="button" className="btn btn-secondary" style={{ flexGrow: 1 }}
                        onClick={() => handleGenerateDiagnosis('rules')}
                        disabled={isLoading}
                      >
                        룰셋 기반 초안 즉시 생성
                      </button>
                      <button 
                        type="button" className="btn btn-primary" style={{ flexGrow: 1 }}
                        onClick={() => handleGenerateDiagnosis('llm')}
                        disabled={isLoading || apiSettings.provider === 'none'}
                      >
                        LLM AI 분석서 작성
                      </button>
                    </div>
                  </div>

                  <div className="form-group">
                    <label>종합 진단 보고서 내용 (강사 의견 포함 - 2차 수동 수정 가능) *</label>
                    <textarea 
                      className="form-control" 
                      style={{ minHeight: '300px', resize: 'vertical', fontFamily: 'monospace', fontSize: '13px', lineHeight: '1.6' }} 
                      placeholder="이곳에 AI 1차 초안이 작성되면 내용을 자유롭게 추가, 삭제, 정밀 편집해 주세요."
                      value={consultationForm.diagnosis} 
                      onChange={e => setConsultationForm({...consultationForm, diagnosis: e.target.value})} 
                    />
                  </div>

                  <div className="form-row" style={{ marginTop: '12px' }}>
                    <div className="form-group">
                      <label>추천 배정 수강반</label>
                      <input className="form-control" type="text" list="course-options" placeholder="과정 선택 또는 직접 입력" value={consultationForm.recommendedClass} onChange={e => setConsultationForm({...consultationForm, recommendedClass: e.target.value})} />
                    </div>
                    <div className="form-group">
                      <label>추천 교재</label>
                      <input className="form-control" type="text" list="textbook-options" placeholder="교재 선택 또는 직접 입력" value={consultationForm.recommendedBooks} onChange={e => setConsultationForm({...consultationForm, recommendedBooks: e.target.value})} />
                    </div>
                  </div>

                  <div className="form-group" style={{ marginTop: '12px' }}>
                    <label>상담관리용 내부 메모 (학부모 특이 성향 등 - PDF 출력안됨)</label>
                    <input className="form-control" type="text" placeholder="예: 주 3회 서술형 피드백을 매번 문자로 발송 요청함." value={consultationForm.consultationMemo} onChange={e => setConsultationForm({...consultationForm, consultationMemo: e.target.value})} />
                  </div>

                  <div style={{ display: 'flex', gap: '12px', marginTop: '20px' }}>
                    {editingConsultationId ? (
                      <>
                        <button type="submit" className="btn btn-primary" style={{ flexGrow: 1, padding: '14px', backgroundColor: 'var(--warning-color, #f59e0b)' }}>수정 완료</button>
                        <button type="button" className="btn btn-primary" style={{ flexGrow: 1, padding: '14px', backgroundColor: 'var(--success-color)' }} onClick={() => handleSaveConsultation(null, true)}>수정 완료 및 즉시 인쇄</button>
                        <button type="button" className="btn btn-secondary" style={{ flexGrow: 1, padding: '14px', backgroundColor: '#e2e8f0', color: '#0f172a' }} onClick={handleEditConsultationCancel}>수정 취소</button>
                      </>
                    ) : (
                      <>
                        <button type="submit" className="btn btn-primary" style={{ flexGrow: 1, padding: '14px' }}>최종 진단서 저장</button>
                        <button type="button" className="btn btn-primary" style={{ flexGrow: 1, padding: '14px', backgroundColor: 'var(--success-color)' }} onClick={() => handleSaveConsultation(null, true)}>저장 및 즉시 인쇄</button>
                      </>
                    )}
                  </div>
                </form>
              </div>

              {/* 오른쪽: 차트 실시간 렌더링 미리보기 */}
              <div className="leveltest-chart-preview">
                <div className="card" style={{ width: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                  <h3>실시간 방사형(Radar) 역량 분석 차트</h3>
                  <p style={{ fontSize: '12px', color: 'var(--text-color-light)', textAlign: 'center', marginTop: '4px' }}>점수 변경에 따라 5각형 모양이 유기적으로 실시간 변경됩니다.</p>
                  <RadarChart scores={consultationForm.scores} />
                </div>
              </div>
            </div>

            {/* 아래: 기저장된 상담 리스트 */}
            <div className="card" style={{ marginTop: '40px' }}>
              <h3>누적 상담 리스트 ({consultations.length}건)</h3>
              <div className="table-responsive" style={{ marginTop: '16px' }}>
                <table className="table">
                  <thead>
                    <tr>
                      <th>날짜</th>
                      <th>학생 이름</th>
                      <th>학년</th>
                      <th>배정 추천반</th>
                      <th>추천 교재</th>
                      <th>리포트 출력</th>
                      <th>관리</th>
                    </tr>
                  </thead>
                  <tbody>
                    {consultations.map(c => {
                      const dbStudent = students.find(s => s.id === c.studentId);
                      const displayGrade = dbStudent ? dbStudent.grade : c.schoolGrade;
                      return (
                        <tr key={c.id}>
                          <td>{c.consultationDate}</td>
                          <td style={{ fontWeight: 'bold' }}>{resolveStudentName(c.studentId, c.studentName)}</td>
                          <td>{displayGrade}</td>
                          <td>{c.recommendedClass || '-'}</td>
                          <td>{c.recommendedBooks || '-'}</td>
                          <td>
                            <button className="btn btn-primary" style={{ padding: '6px 12px', fontSize: '12px' }} onClick={() => setPrintConsultationId(c.id)}>
                              인쇄 / PDF 저장
                            </button>
                          </td>
                          <td>
                            <div style={{ display: 'flex', gap: '8px', justifyContent: 'center' }}>
                              <button className="btn btn-secondary" style={{ padding: '6px 12px', fontSize: '12px', backgroundColor: 'var(--primary-accent, #7c3aed)', color: '#ffffff' }} onClick={() => handleEditConsultationStart(c)}>
                                수정
                              </button>
                              <button className="btn btn-secondary btn-danger" style={{ padding: '6px 12px', fontSize: '12px' }} onClick={() => handleDeleteConsultation(c.id)}>
                                삭제
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                    {consultations.length === 0 && (
                      <tr>
                        <td colSpan="7" style={{ textAlign: 'center', color: 'var(--text-color-light)', padding: '20px' }}>저장된 상담지가 없습니다.</td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* 탭: 반별 운영 */}
        {activeTab === 'classes' && (
          <ClassView
            students={students}
            grades={grades}
            master={master}
            onNavigate={setActiveTab}
          />
        )}

        {/* 탭: 교안 자료실 */}
        {activeTab === 'lectures' && (
          <LectureLibrary
            lectures={lectures}
            onChange={handleLecturesChange}
            master={master}
            genId={genId}
            showAlert={showAlert}
          />
        )}

        {/* 탭: 단어 해설 */}
        {activeTab === 'vocab' && (
          <VocabGuide
            vocab={vocab}
            onChange={handleVocabChange}
            apiSettings={apiSettings}
            genId={genId}
            showAlert={showAlert}
            renderMarkdown={renderMarkdown}
            onPrint={setPrintVocabId}
          />
        )}

        {/* 탭: 관리 (기준정보) */}
        {activeTab === 'admin' && (
          <AdminMaster
            master={master}
            onChange={handleMasterChange}
            genId={genId}
            usageCounts={usageCounts}
            onBackup={backupData}
          />
        )}

        {/* 탭 5: 시스템 및 LLM 설정 */}
        {activeTab === 'settings' && (
          <div>
            <div className="content-header">
              <div className="header-title-wrapper">
                <h1>시스템 및 LLM 연동 설정</h1>
                <p>브라우저 환경 최적화, 데이터 백업 복구 및 레벨 테스트 진단서 자동 생성을 위한 API Key 정보를 등록합니다.</p>
              </div>
            </div>

            <div className="card" style={{ marginBottom: '24px' }}>
              <h3>브랜드 / 학원명</h3>
              <p style={{ fontSize: '13px', color: 'var(--text-color-secondary)', margin: '6px 0 12px 0' }}>
                화면 상단·인쇄물(상담지·리포트·시험지)·AI 분석서에 표시되는 이름입니다. 본인 학원명으로 바꿔 사용하세요.
              </p>
              <input className="form-control" value={brandName}
                onChange={e => handleMasterChange({ ...master, brandName: e.target.value })}
                placeholder="예: OO영어학원" />
            </div>

            <div className="settings-grid">
              {/* 왼쪽: LLM API 설정 */}
              <div className="card">
                <h3>LLM AI 분석 모델 설정</h3>
                <form onSubmit={handleSaveSettings} style={{ marginTop: '16px' }}>
                  <div className="form-group">
                    <label>제공업체 선택</label>
                    <select className="form-control" value={apiSettings.provider} onChange={e => setApiSettings({...apiSettings, provider: e.target.value})}>
                      <option value="none">사용 안 함 (시스템 규칙 기반 초안 작성)</option>
                      <option value="gemini">Google Gemini API (추천)</option>
                      <option value="openai">OpenAI API</option>
                    </select>
                  </div>

                  <div className="form-group" style={{ marginTop: '12px' }}>
                    <label>API Key 입력</label>
                    <input className="form-control" type="password" placeholder="sk-..." value={apiSettings.apiKey} onChange={e => setApiSettings({...apiSettings, apiKey: e.target.value})} />
                  </div>

                  <div className="form-group" style={{ marginTop: '12px' }}>
                    <label>모델 이름 (선택사항)</label>
                    <input className="form-control" type="text" placeholder={apiSettings.provider === 'gemini' ? 'gemini-2.5-flash' : 'gpt-4o-mini'} value={apiSettings.model} onChange={e => setApiSettings({...apiSettings, model: e.target.value})} />
                  </div>

                  <button type="submit" className="btn btn-primary" style={{ marginTop: '20px', width: '100%' }}>API 설정 저장</button>
                </form>
              </div>

              {/* 오른쪽: 데이터 백업 및 복구 */}
              <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
                <div>
                  <h3>데이터 백업 및 마이그레이션</h3>
                  <p style={{ fontSize: '13px', color: 'var(--text-color-secondary)', marginTop: '6px' }}>
                    작성한 데이터는 브라우저 내부 스토리지에만 저장됩니다. 데이터 분실 방지 및 타 윈도우 PC 마이그레이션을 위해 정기적으로 내보내기를 진행해 주세요.
                  </p>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                  <button className="btn btn-primary" onClick={backupData} style={{ width: '100%' }}>
                    JSON 백업 파일 내보내기 (.json)
                  </button>

                  <div style={{ border: '1px solid var(--border-color)', padding: '16px', borderRadius: '12px' }}>
                    <label style={{ fontSize: '12.5px', fontWeight: 'bold', display: 'block', marginBottom: '8px' }}>백업 파일 복구하기 (.json)</label>
                    <input type="file" accept=".json" onChange={handleRestoreFile} style={{ fontSize: '12px' }} />
                  </div>
                </div>

                {/* 스토리지 사용량 진단 바 */}
                {(() => {
                  const usage = getStorageUsage();
                  const isHigh = usage.percent >= 80;
                  return (
                    <div style={{ padding: '12px', border: '1px solid var(--border-color)', borderRadius: '12px', backgroundColor: 'var(--card-bg-subtle, rgba(0,0,0,0.02))' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px', fontSize: '12.5px', fontWeight: 'bold' }}>
                        <span>로컬 스토리지 사용 현황</span>
                        <span style={{ color: isHigh ? 'var(--danger-color)' : 'var(--primary-accent)' }}>
                          {usage.sizeMb} MB / {usage.maxMb.toFixed(2)} MB ({usage.percent}%)
                        </span>
                      </div>
                      <div style={{ width: '100%', height: '8px', backgroundColor: 'var(--border-color)', borderRadius: '4px', overflow: 'hidden' }}>
                        <div style={{ width: `${Math.min(100, usage.percent)}%`, height: '100%', backgroundColor: isHigh ? 'var(--danger-color)' : 'var(--primary-accent)', borderRadius: '4px', transition: 'width 0.3s ease' }}></div>
                      </div>
                      {isHigh && (
                        <p style={{ margin: '8px 0 0 0', fontSize: '11px', color: 'var(--danger-color)', fontWeight: 'bold' }}>
                          사용량이 80%를 초과했습니다. 조속히 백업을 내보내고 데이터를 정리하시기 바랍니다.
                        </p>
                      )}
                    </div>
                  );
                })()}

                <div style={{ borderLeft: '4px solid var(--warning-color)', paddingLeft: '12px', fontSize: '12px', color: 'var(--text-color-secondary)' }}>
                  <strong>주의</strong>: 백업 파일을 복구할 경우 기존 브라우저 내부의 모든 학생 관리 데이터는 덮어씌워져 유실됩니다.
                </div>
              </div>

              {/* 실행 잠금 (4자리 PIN) */}
              <div className="card">
                <h3>실행 잠금 (4자리 PIN)</h3>
                <p style={{ fontSize: '13px', color: 'var(--text-color-secondary)', margin: '6px 0 16px 0' }}>
                  앱을 열 때 4자리 PIN을 요구하여, 학원 공용 PC에서 학생·학부모 정보가 노출되는 것을 막습니다.
                </p>

                {!lockEnabled ? (
                  <form onSubmit={handleEnableLock}>
                    <div className="form-row">
                      <div className="form-group">
                        <label>새 PIN (숫자 4자리)</label>
                        <input className="form-control" type="password" inputMode="numeric" maxLength={4} autoComplete="off" value={pinForm.next} onChange={e => setPinForm({ ...pinForm, next: e.target.value.replace(/\D/g, '') })} />
                      </div>
                      <div className="form-group">
                        <label>새 PIN 확인</label>
                        <input className="form-control" type="password" inputMode="numeric" maxLength={4} autoComplete="off" value={pinForm.confirm} onChange={e => setPinForm({ ...pinForm, confirm: e.target.value.replace(/\D/g, '') })} />
                      </div>
                    </div>
                    <div className="form-group">
                      <label>무활동 자동 잠금</label>
                      <select className="form-control" value={autoLockMinutes} onChange={e => handleAutoLockChange(e.target.value)}>
                        <option value={0}>사용 안 함</option>
                        <option value={5}>5분</option>
                        <option value={10}>10분 (권장)</option>
                        <option value={30}>30분</option>
                      </select>
                    </div>
                    <button type="submit" className="btn btn-primary" style={{ marginTop: '8px', width: '100%' }}>실행 잠금 켜기</button>
                  </form>
                ) : (
                  <form onSubmit={handleChangePin}>
                    <div className="form-group">
                      <label>현재 PIN</label>
                      <input className="form-control" type="password" inputMode="numeric" maxLength={4} autoComplete="off" value={pinForm.current} onChange={e => setPinForm({ ...pinForm, current: e.target.value.replace(/\D/g, '') })} />
                    </div>
                    <div className="form-row">
                      <div className="form-group">
                        <label>새 PIN (변경 시)</label>
                        <input className="form-control" type="password" inputMode="numeric" maxLength={4} autoComplete="off" value={pinForm.next} onChange={e => setPinForm({ ...pinForm, next: e.target.value.replace(/\D/g, '') })} />
                      </div>
                      <div className="form-group">
                        <label>새 PIN 확인</label>
                        <input className="form-control" type="password" inputMode="numeric" maxLength={4} autoComplete="off" value={pinForm.confirm} onChange={e => setPinForm({ ...pinForm, confirm: e.target.value.replace(/\D/g, '') })} />
                      </div>
                    </div>
                    <div className="form-group">
                      <label>무활동 자동 잠금</label>
                      <select className="form-control" value={autoLockMinutes} onChange={e => handleAutoLockChange(e.target.value)}>
                        <option value={0}>사용 안 함</option>
                        <option value={5}>5분</option>
                        <option value={10}>10분 (권장)</option>
                        <option value={30}>30분</option>
                      </select>
                    </div>
                    <div style={{ display: 'flex', gap: '12px', marginTop: '8px' }}>
                      <button type="submit" className="btn btn-primary" style={{ flexGrow: 1 }}>PIN 변경</button>
                      <button type="button" className="btn btn-danger" style={{ flexGrow: 1 }} onClick={handleDisableLock}>잠금 해제 (현재 PIN 필요)</button>
                    </div>
                  </form>
                )}

                <div style={{ borderLeft: '4px solid var(--warning-color)', paddingLeft: '12px', fontSize: '12px', color: 'var(--text-color-secondary)', marginTop: '16px', lineHeight: 1.6 }}>
                  <strong>한계 안내</strong>: 이 잠금은 어깨너머 열람이나 잠깐 자리를 비울 때를 위한 보호 장치입니다.
                  데이터 자체는 암호화되지 않으므로, 개발자 도구를 다룰 줄 아는 사람의 접근까지 막지는 못합니다.
                  PIN은 백업 파일에 포함되지 않으며, PIN을 잊어도 데이터는 잃지 않습니다 (복구 절차는 README 참고).
                </div>
              </div>
            </div>
          </div>
        )}



        {/* 탭 6: 성취도 평가 및 레벨테스트 시험지 리스트 및 출력 */}
        {/* 탭 6: 성취도 평가 및 레벨테스트 시험지 리스트 및 출력 */}
        {activeTab === 'achievement' && (
          <div>
            <div className="content-header">
              <div className="header-title-wrapper">
                <h1>평가 시험지 및 정답지 인쇄 자료실</h1>
                <p>신입생 레벨테스트 및 정기 성취도 평가 문제지를 A4 2단 형태로 브라우저에서 즉시 미리보고 인쇄할 수 있습니다.</p>
              </div>
            </div>

            {/* 카테고리 선택 필터 탭 */}
            <div style={{ display: 'flex', gap: '8px', marginBottom: '24px', borderBottom: '1px solid var(--border-color)', paddingBottom: '12px', flexWrap: 'wrap' }}>
              <button
                type="button"
                className="btn"
                style={{
                  padding: '10px 20px',
                  fontSize: '13.5px',
                  fontWeight: 'bold',
                  backgroundColor: examCategory === 'level' ? 'var(--primary-accent)' : 'transparent',
                  color: examCategory === 'level' ? '#ffffff' : 'var(--text-color-secondary)',
                  border: examCategory === 'level' ? '1px solid var(--primary-accent)' : '1px solid var(--border-color)',
                  borderRadius: '8px',
                  cursor: 'pointer'
                }}
                onClick={() => setExamCategory('level')}
              >
                신입생 레벨테스트 ({Object.keys(levelTestData).length}종)
              </button>
              <button
                type="button"
                className="btn"
                style={{
                  padding: '10px 20px',
                  fontSize: '13.5px',
                  fontWeight: 'bold',
                  backgroundColor: examCategory === 'achievement' ? 'var(--primary-accent)' : 'transparent',
                  color: examCategory === 'achievement' ? '#ffffff' : 'var(--text-color-secondary)',
                  border: examCategory === 'achievement' ? '1px solid var(--primary-accent)' : '1px solid var(--border-color)',
                  borderRadius: '8px',
                  cursor: 'pointer'
                }}
                onClick={() => setExamCategory('achievement')}
              >
                정기 성취도 평가 ({Object.keys(achievementTestData).length}종)
              </button>
              <button
                type="button"
                className="btn"
                style={{
                  padding: '10px 20px',
                  fontSize: '13.5px',
                  fontWeight: 'bold',
                  backgroundColor: examCategory === 'appendix' ? 'var(--primary-accent)' : 'transparent',
                  color: examCategory === 'appendix' ? '#ffffff' : 'var(--text-color-secondary)',
                  border: examCategory === 'appendix' ? '1px solid var(--primary-accent)' : '1px solid var(--border-color)',
                  borderRadius: '8px',
                  cursor: 'pointer'
                }}
                onClick={() => setExamCategory('appendix')}
              >
                부록 평가 ({Object.keys(appendixTestData).length}종)
              </button>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: '20px' }}>
              {(() => {
                const testDataMap = {
                  level: levelTestData,
                  achievement: achievementTestData,
                  appendix: appendixTestData
                };
                const currentData = testDataMap[examCategory] || {};
                
                return Object.keys(currentData).map((key) => {
                  const rawMd = currentData[key];
                  const parsed = parseExamMarkdown(rawMd);
                  
                  let levelName = parsed.title || key;
                  let desc = parsed.meta['평가 대상'] || (
                    examCategory === 'level' 
                      ? '신원생 진단 테스트' 
                      : examCategory === 'achievement' 
                        ? '정기 성취도 평가' 
                        : '부록 평가'
                  );
                  let time = parsed.meta['시험 시간'] || '40분';
                  let totalScore = parsed.meta['총 배점'] || '100점';
                  
                  let badgeLabel = '부록평가';
                  if (examCategory === 'level') {
                    badgeLabel = '레벨테스트';
                  } else if (examCategory === 'achievement') {
                    badgeLabel = '정기평가';
                  } else {
                    badgeLabel = key.includes('set_a') ? '부록 Set A' : (key.includes('set_b') ? '부록 Set B' : '부록평가');
                  }
                  
                  return (
                    <div className="card" key={key} style={{ display: 'flex', flexDirection: 'column', justifyContent: 'space-between', height: '100%' }}>
                      <div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                          <span style={{ fontSize: '11px', fontWeight: 'bold', padding: '3px 8px', borderRadius: '12px', backgroundColor: 'var(--primary-accent-light)', color: 'var(--primary-accent)' }}>
                            {badgeLabel}
                          </span>
                          <span style={{ fontSize: '11px', color: 'var(--text-color-light)' }}>{time} | {totalScore}</span>
                        </div>
                        <h3 style={{ margin: '12px 0 6px 0', fontSize: '16px', color: 'var(--text-color-primary)' }}>{levelName}</h3>
                        <p style={{ fontSize: '12.5px', color: 'var(--text-color-secondary)', lineHeight: '1.5' }}>
                          <strong>대상 학년</strong>: {desc}<br />
                          <strong>문항 구성</strong>: {parsed.elements.filter(e => e.type === 'question').length}문항
                        </p>
                      </div>
                      
                      <div style={{ display: 'flex', gap: '8px', marginTop: '16px' }}>
                        <button
                          className="btn btn-primary"
                          style={{ flexGrow: 1, padding: '10px 0', fontSize: '12.5px' }}
                          onClick={() => {
                            setPrintExamId(key);
                            setPrintExamMode('student');
                          }}
                        >
                          학생용 인쇄
                        </button>
                        <button
                          className="btn btn-secondary"
                          style={{ flexGrow: 1, padding: '10px 0', fontSize: '12.5px' }}
                          onClick={() => {
                            setPrintExamId(key);
                            setPrintExamMode('teacher');
                          }}
                        >
                          교사용 정답지
                        </button>
                      </div>
                    </div>
                  );
                });
              })()}
            </div>
          </div>
        )}

      </main>

      {/* ==========================================
         A4 프린트 전용 및 PDF 미리보기 모달 팝업
         ========================================== */}
      {printConsultationId && (() => {
        const item = consultations.find(c => c.id === printConsultationId);
        if (!item) return null;
        return (
          <div className="print-preview-modal">
            <div className="print-preview-actions">
              <button className="btn btn-primary" onClick={() => window.print()}>인쇄 또는 PDF 저장 실행</button>
              <button className="btn btn-secondary" onClick={() => setPrintConsultationId(null)} style={{ backgroundColor: '#ffffff', color: '#0f172a' }}>창 닫기</button>
            </div>

            {/* A4 레이아웃 */}
            <div className="a4-document">
              <div className="a4-header">
                <div className="a4-brand">{brandName}</div>
                <div className="a4-title">레벨테스트 분석 및 학업 상담서</div>
              </div>

              <table className="a4-meta-table">
                <tbody>
                  <tr>
                    <th>원생 성명</th>
                    <td>{resolveStudentName(item.studentId, item.studentName)}</td>
                    <th>학교 및 학년</th>
                    <td>{(() => {
                      const dbStudent = students.find(s => s.id === item.studentId);
                      const displayGrade = dbStudent ? dbStudent.grade : item.schoolGrade;
                      return item.schoolName ? `${item.schoolName} ${displayGrade}` : displayGrade;
                    })()}</td>
                  </tr>
                  <tr>
                    <th>상담 일자</th>
                    <td>{item.consultationDate}</td>
                    <th>배정 추천반</th>
                    <td>{item.recommendedClass || '미지정'}</td>
                  </tr>
                  <tr>
                    <th>추천 교재</th>
                    <td colSpan="3">{item.recommendedBooks || '미지정'}</td>
                  </tr>
                </tbody>
              </table>

              <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr', gap: '30px', alignItems: 'center', margin: '20px 0' }}>
                <div>
                  <div className="a4-section-title">영역별 학습 역량 지수</div>
                  <table className="a4-meta-table" style={{ margin: 0 }}>
                    <thead>
                      <tr>
                        <th>영역</th>
                        <th>백분율 성취 지수</th>
                      </tr>
                    </thead>
                    <tbody>
                      {Object.entries({
                        '어휘력 (Vocab)': item.scores.vocab,
                        '문법/어법 (Grammar)': item.scores.grammar,
                        '구문분석 (Syntax)': item.scores.syntax,
                        '논리독해 (Reading)': item.scores.reading,
                        '서술형영작 (Writing)': item.scores.writing,
                      }).map(([label, val], idx) => {
                        if (val === undefined || val === null || val === 'N/A') return null;
                        return (
                          <tr key={idx}>
                            <th>{label}</th>
                            <td style={{ textAlign: 'center', fontWeight: 'bold' }}>{val}점</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
                
                {/* 인쇄용 Radar 차트 */}
                <div style={{ border: '1px solid #cbd5e1', borderRadius: '8px', padding: '10px', display: 'flex', justifyContent: 'center' }}>
                  <RadarChart scores={item.scores} />
                </div>
              </div>

              <div className="a4-section-title">종합 평가 및 피드백</div>
              <div className="a4-diagnosis-content">
                {/* 마크다운을 지원하도록 렌더링 및 학년 오염 실시간 복구 */}
                {(() => {
                  const dbStudent = students.find(s => s.id === item.studentId);
                  const displayGrade = dbStudent ? dbStudent.grade : item.schoolGrade;
                  const displayName = dbStudent ? dbStudent.name : item.studentName;
                  const correctedText = getCorrectedDiagnosis(item.diagnosis, displayName, displayGrade, item.studentName);
                  return renderMarkdown(correctedText);
                })()}
              </div>

              <div style={{ marginTop: '30px', textAlign: 'right', fontSize: '13px', fontStyle: 'italic', color: '#64748b' }}>
                {brandName} 드림
              </div>
            </div>
          </div>
        );
      })()}

      {/* ==========================================
         성취도 평가 결과 분석 보고서 인쇄 모달
         ========================================== */}
      {printAchievementId && (() => {
        const g = grades.find(x => x.id === printAchievementId);
        if (!g) return null;
        const student = students.find(s => s.id === g.studentId);
        if (!student) return null;
        const testInfo = achievementTestMapping[g.examId];
        if (!testInfo) return null;

        const wrongAnswers = g.wrongAnswers || [];
        const scores = {};
        Object.entries(testInfo.sections).forEach(([secKey, secInfo]) => {
          const secWrong = wrongAnswers.filter(qNum => secInfo.questions.includes(qNum));
          const secTotal = secInfo.questions.length;
          const secScore = Math.round(((secTotal - secWrong.length) / secTotal) * 100);
          scores[secKey] = secScore;
        });

        return (
          <div className="print-preview-modal">
            <div className="print-preview-actions">
              <button className="btn btn-primary" onClick={() => window.print()}>인쇄 또는 PDF 저장 실행</button>
              <button className="btn btn-secondary" onClick={() => setPrintAchievementId(null)} style={{ backgroundColor: '#ffffff', color: '#0f172a' }}>창 닫기</button>
            </div>

            <div className="a4-document">
              <div className="a4-header">
                <div className="a4-brand">{brandName}</div>
                <div className="a4-title">정기 성취도 평가 분석 보고서</div>
              </div>

              <table className="a4-meta-table">
                <tbody>
                  <tr>
                    <th>원생 성명</th>
                    <td>{student.name}</td>
                    <th>학교 및 학년</th>
                    <td>{student.school ? `${student.school} ${student.grade}` : student.grade}</td>
                  </tr>
                  <tr>
                    <th>평가 일자</th>
                    <td>{displayGradeDate(g.date)}</td>
                    <th>평가 시험지</th>
                    <td>{testInfo.title}</td>
                  </tr>
                  <tr>
                    <th>평가 점수</th>
                    <td style={{ fontWeight: 'bold', color: g.score >= PASS_THRESHOLD ? '#059669' : '#dc2626' }}>{g.score}점 (100점 만점)</td>
                    <th>오답 문항</th>
                    <td>{wrongAnswers.length > 0 ? `${wrongAnswers.sort((a,b)=>a-b).join(', ')}번` : '오답 없음 (만점)'}</td>
                  </tr>
                </tbody>
              </table>

              <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr', gap: '30px', alignItems: 'center', margin: '20px 0' }}>
                <div>
                  <div className="a4-section-title">영역별 세부 성취 지수</div>
                  <table className="a4-meta-table" style={{ margin: 0 }}>
                    <thead>
                      <tr>
                        <th>영역</th>
                        <th>총 문항</th>
                        <th>오답 문항</th>
                        <th>성취도</th>
                      </tr>
                    </thead>
                    <tbody>
                      {Object.entries(testInfo.sections).map(([secKey, secInfo]) => {
                        const secWrong = wrongAnswers.filter(qNum => secInfo.questions.includes(qNum));
                        const secTotal = secInfo.questions.length;
                        const secScore = scores[secKey];
                        return (
                          <tr key={secKey}>
                            <th style={{ textAlign: 'left' }}>{secInfo.name.split(' (')[0]}</th>
                            <td style={{ textAlign: 'center' }}>{secTotal}개</td>
                            <td style={{ textAlign: 'center' }}>{secWrong.length}개</td>
                            <td style={{ textAlign: 'center', fontWeight: 'bold', color: secScore >= PASS_THRESHOLD ? '#059669' : '#dc2626' }}>
                              {secScore}%
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
                
                {/* 인쇄용 Radar 차트 */}
                <div style={{ border: '1px solid #cbd5e1', borderRadius: '8px', padding: '10px', display: 'flex', justifyContent: 'center' }}>
                  <RadarChart scores={scores} type="achievement" />
                </div>
              </div>

              <div className="a4-section-title">영역 진단 및 강사 소견</div>
              <div className="a4-diagnosis-content">
                {renderMarkdown(g.memo)}
              </div>

              <div style={{ marginTop: '30px', textAlign: 'right', fontSize: '13px', fontStyle: 'italic', color: '#64748b' }}>
                {brandName} 드림
              </div>
            </div>
          </div>
        );
      })()}

      {/* ==========================================
         분기 리포트 인쇄 모달 (Monthly/Quarterly Report)
         ========================================== */}
      {printQuarterlyId && (() => {
        const rpt = quarterlyReports.find(r => r.id === printQuarterlyId);
        if (!rpt) return null;

        // 챕터 목록 파싱 (줄바꿈 구분 → 배열)
        const chapterLines = rpt.chapters
          ? rpt.chapters.split('\n').map(l => l.trim()).filter(Boolean)
          : [];

        return (
          <div className="print-preview-modal">
            <div className="print-preview-actions">
              <button className="btn btn-primary" onClick={() => window.print()}>인쇄 또는 PDF 저장 실행</button>
              <button className="btn btn-secondary" onClick={() => setPrintQuarterlyId(null)} style={{ backgroundColor: '#ffffff', color: '#0f172a' }}>창 닫기</button>
            </div>

            <div className="a4-document" style={{ fontFamily: "'Noto Serif KR', 'Noto Sans KR', serif", color: '#000' }}>
              {/* 헤더 */}
              <div className="a4-header" style={{ textAlign: 'center', borderBottom: '2px solid #1e293b', paddingBottom: '10px', marginBottom: '18px' }}>
                <div style={{ fontSize: '13px', letterSpacing: '2px', color: '#475569', marginBottom: '4px' }}>{brandName}</div>
                <div style={{ fontSize: '20px', fontWeight: 'bold', letterSpacing: '-0.5px' }}>{rpt.period} Monthly Report</div>
              </div>

              {/* ■ Personal Information */}
              <div style={{ marginBottom: '16px' }}>
                <div style={{ fontWeight: 'bold', fontSize: '13px', borderBottom: '1px solid #334155', paddingBottom: '4px', marginBottom: '8px' }}>■ Personal Information</div>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
                  <tbody>
                    <tr>
                      <td style={{ width: '80px', color: '#475569', fontWeight: 'bold', padding: '3px 0' }}>Name</td>
                      <td style={{ width: '160px', padding: '3px 8px' }}>{resolveStudentName(rpt.studentId, rpt.studentName)}</td>
                      <td style={{ width: '80px', color: '#475569', fontWeight: 'bold', padding: '3px 0' }}>Grade</td>
                      <td style={{ padding: '3px 8px' }}>{rpt.grade}</td>
                    </tr>
                    <tr>
                      <td style={{ color: '#475569', fontWeight: 'bold', padding: '3px 0' }}>Contents</td>
                      <td colSpan="3" style={{ padding: '3px 8px' }}>{rpt.textbook || '(교재 미기재)'}</td>
                    </tr>
                  </tbody>
                </table>
              </div>

              {/* ■ English Curriculum */}
              {chapterLines.length > 0 && (
                <div style={{ marginBottom: '16px' }}>
                  <div style={{ fontWeight: 'bold', fontSize: '13px', borderBottom: '1px solid #334155', paddingBottom: '4px', marginBottom: '8px' }}>■ English curriculum</div>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
                    <thead>
                      <tr style={{ backgroundColor: '#f1f5f9' }}>
                        <th style={{ padding: '5px 8px', border: '1px solid #cbd5e1', width: '60px', textAlign: 'center' }}>Chapter</th>
                        <th style={{ padding: '5px 8px', border: '1px solid #cbd5e1' }}>Contents</th>
                        <th style={{ padding: '5px 8px', border: '1px solid #cbd5e1' }}>Unit</th>
                      </tr>
                    </thead>
                    <tbody>
                      {chapterLines.map((line, idx) => {
                        // "Chapter N - 제목" 또는 "N. 제목" 형태 자동 파싱
                        const m = line.match(/^(?:Chapter\s*)?(\d+)[.\-–\s]+(.+?)(?:\s*[–\-]\s*(.+))?$/i);
                        const num = m ? m[1] : String(idx + 1);
                        const title = m ? (m[2] || '').trim() : line;
                        const unit = m ? (m[3] || '').trim() : '';
                        return (
                          <tr key={idx}>
                            <td style={{ padding: '4px 8px', border: '1px solid #cbd5e1', textAlign: 'center' }}>{num}</td>
                            <td style={{ padding: '4px 8px', border: '1px solid #cbd5e1' }}>{title}</td>
                            <td style={{ padding: '4px 8px', border: '1px solid #cbd5e1', color: '#475569' }}>{unit}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}

              {/* ■ Weekly Test */}
              <div style={{ marginBottom: '16px', fontSize: '13px' }}>
                <div style={{ fontWeight: 'bold', fontSize: '13px', borderBottom: '1px solid #334155', paddingBottom: '4px', marginBottom: '6px' }}>■ Weekly Test</div>
                <p style={{ margin: 0, color: '#475569' }}>배포된 Test sheet 참조</p>
              </div>

              {/* ■ Final Test Result */}
              <div style={{ marginBottom: '20px' }}>
                <div style={{ fontWeight: 'bold', fontSize: '13px', borderBottom: '1px solid #334155', paddingBottom: '4px', marginBottom: '8px' }}>■ Final Test Result</div>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
                  <thead>
                    <tr style={{ backgroundColor: '#f1f5f9' }}>
                      <th style={{ padding: '5px 10px', border: '1px solid #cbd5e1', width: '80px' }}></th>
                      <th style={{ padding: '5px 10px', border: '1px solid #cbd5e1' }}>Date</th>
                      <th style={{ padding: '5px 10px', border: '1px solid #cbd5e1' }}>Score</th>
                      <th style={{ padding: '5px 10px', border: '1px solid #cbd5e1' }}>contents</th>
                    </tr>
                  </thead>
                  <tbody>
                    {getReportFinalTests(rpt).map((ft, idx) => (
                      <tr key={ft.id || idx}>
                        <td style={{ padding: '5px 10px', border: '1px solid #cbd5e1', fontWeight: 'bold' }}>
                          {ft.label || `Test ${idx + 1}`}
                        </td>
                        <td style={{ padding: '5px 10px', border: '1px solid #cbd5e1' }}>{ft.date || '-'}</td>
                        <td style={{ padding: '5px 10px', border: '1px solid #cbd5e1', fontWeight: 'bold', color: ft.score >= PASS_THRESHOLD ? '#059669' : '#dc2626' }}>
                          {ft.score !== undefined && ft.score !== null ? `${ft.score}/100` : '미응시'}
                        </td>
                        <td style={{ padding: '5px 10px', border: '1px solid #cbd5e1', color: '#475569' }}>{ft.examTitle || '-'}</td>
                      </tr>
                    ))}
                    {getReportFinalTests(rpt).length === 0 && (
                      <tr>
                        <td colSpan="4" style={{ padding: '10px', textAlign: 'center', color: '#94a3b8', border: '1px solid #cbd5e1' }}>
                          연동된 성적 기록이 없습니다.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>

              {/* ■ Teacher's Comment */}
              <div>
                <div style={{ fontWeight: 'bold', fontSize: '13px', borderBottom: '1px solid #334155', paddingBottom: '4px', marginBottom: '10px' }}>■ Teacher's Comment</div>
                <div style={{ fontSize: '13px', lineHeight: '1.85', whiteSpace: 'pre-wrap', color: '#1e293b' }}>
                  {rpt.teacherComment || '(코멘트 없음)'}
                </div>
              </div>

              {/* 푸터 */}
              <div style={{ marginTop: '40px', textAlign: 'right', fontSize: '12px', color: '#64748b', fontStyle: 'italic' }}>
                발행일: {rpt.createdAt} &nbsp;|&nbsp; {brandName}
              </div>
            </div>
          </div>
        );
      })()}

      {/* ==========================================
         학생 종합 리포트 인쇄 모달 팝업
         ========================================== */}
      {printStudentId && (() => {
        const student = students.find(s => s.id === printStudentId);
        if (!student) return null;
        const studentGrades = sortGradesByDate(grades.filter(g => g.studentId === printStudentId));
        const reportTrends = computeGradeTrends(studentGrades);

        return (
          <div className="print-preview-modal">
            <div className="print-preview-actions">
              <button className="btn btn-primary" onClick={() => window.print()}>인쇄 또는 PDF 저장 실행</button>
              <button className="btn btn-secondary" onClick={() => setPrintStudentId(null)} style={{ backgroundColor: '#ffffff', color: '#0f172a' }}>창 닫기</button>
            </div>

            <div className="a4-document">
              <div className="a4-header">
                <div className="a4-brand">{brandName}</div>
                <div className="a4-title">원생 개인별 종합 학습 분석 리포트</div>
              </div>

              <table className="a4-meta-table">
                <tbody>
                  <tr>
                    <th>원생 성명</th>
                    <td>{student.name}</td>
                    <th>학교 및 학년</th>
                    <td>{student.school} · {student.grade}</td>
                  </tr>
                  <tr>
                    <th>연락처</th>
                    <td>{student.phone || '미기입'}</td>
                    <th>학부모 연락처</th>
                    <td>{student.parentPhone || '미기입'}</td>
                  </tr>
                  <tr>
                    <th>등록일자</th>
                    <td>{student.enrollDate}</td>
                    <th>학업 상태</th>
                    <td>{student.status}</td>
                  </tr>
                </tbody>
              </table>

              <div className="a4-section-title">성적 유형별 성적 추이</div>
              {reportTrends.length === 0 ? (
                <p style={{ fontSize: '12.5px', color: '#64748b', margin: '12px 0' }}>추이를 표시할 성적이 부족합니다. (유형별 2회 이상 입력 시 표시)</p>
              ) : (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '20px', margin: '20px 0' }}>
                  {reportTrends.map(t => (
                    <div key={t.type} style={{ border: '1px solid #cbd5e1', borderRadius: '8px', padding: '10px', backgroundColor: '#ffffff' }}>
                      <LineChart data={t.data} title={`${typeLabel(t.type)} 추이`} />
                    </div>
                  ))}
                </div>
              )}

              <div className="a4-section-title">누적 학업 이력 목록</div>
              <table className="a4-meta-table">
                <thead>
                  <tr>
                    <th>일자</th>
                    <th>유형</th>
                    <th>점수</th>
                    <th>평가 결과</th>
                    <th>비고 및 오답 유형</th>
                  </tr>
                </thead>
                <tbody>
                  {studentGrades.map(g => (
                    <tr key={g.id}>
                      <td style={{ textAlign: 'center' }}>{displayGradeDate(g.date)}</td>
                      <td style={{ textAlign: 'center' }}>
                        {g.examId ? getExamTitle(g.examId) : typeLabel(g.type)}
                      </td>
                      <td style={{ textAlign: 'center', fontWeight: 'bold' }}>{g.score}점</td>
                      <td style={{ textAlign: 'center' }}>
                        {g.score >= PASS_THRESHOLD ? '통과' : '재시험 대상'}
                      </td>
                      <td>{g.memo || '-'}</td>
                    </tr>
                  ))}
                  {studentGrades.length === 0 && (
                    <tr>
                      <td colSpan="5" style={{ textAlign: 'center', color: '#64748b', padding: '15px' }}>누적된 성적 데이터가 없습니다.</td>
                    </tr>
                  )}
                </tbody>
              </table>

              <div className="a4-section-title">강사 특이사항 및 지도 요령</div>
              <div className="a4-diagnosis-content" style={{ minHeight: '100px' }}>
                {student.memo || '작성된 지도용 종합 메모가 없습니다.'}
              </div>

              <div style={{ marginTop: '30px', textAlign: 'right', fontSize: '13px', fontStyle: 'italic', color: '#64748b' }}>
                {brandName}
              </div>
            </div>
          </div>
        );
      })()}

      {/* ==========================================
         성취도 평가 및 레벨테스트 시험지 전용 2단 조판 인쇄 모달 팝업
         ========================================== */}
      {printExamId && (() => {
        const rawMd = achievementTestData[printExamId] || levelTestData[printExamId] || appendixTestData[printExamId] || finalTestData1[printExamId] || finalTestData2[printExamId];
        if (!rawMd) return null;
        const { title, meta, elements } = parseExamMarkdown(rawMd);
        
        return (
          <div className="print-preview-modal">
            <div className="print-preview-actions">
              <span style={{ color: '#ffffff', fontWeight: 'bold', marginRight: '16px' }}>
                [미리보기] {title} ({printExamMode === 'student' ? '학생용' : '교사용 정답지'})
              </span>
              <button className="btn btn-primary" onClick={() => window.print()}>인쇄 또는 PDF 저장 실행</button>
              <button className="btn btn-secondary" onClick={() => setPrintExamId(null)} style={{ backgroundColor: '#ffffff', color: '#0f172a' }}>창 닫기</button>
            </div>

            {/* A4 시험지 레이아웃 */}
            <div className="a4-document" style={{ width: '210mm', minHeight: '297mm', padding: '12mm 12mm 12mm 12mm', boxSizing: 'border-box', backgroundColor: '#ffffff', color: '#000000' }}>
              
              {/* 상단 1단 헤더 영역 */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', border: '1.5px solid #000000', borderRadius: '4px', padding: '10px 20px', marginBottom: '15px' }}>
                <div style={{ flexGrow: 1 }}>
                  <div style={{ fontSize: '17px', fontWeight: 'bold', letterSpacing: '-0.5px' }}>{title}</div>
                  <div style={{ fontSize: '11px', color: '#4b5563', marginTop: '4px' }}>
                    {brandName} 평가원 &nbsp;|&nbsp; 평가 대상: {meta['평가 대상'] || '종합'} &nbsp;|&nbsp; 제한 시간: {meta['시험 시간'] || '40분'} ({meta['총 배점'] || '100점'} 만점)
                  </div>
                </div>
                {printExamMode === 'student' ? (
                  <div style={{ display: 'flex', gap: '8px', borderLeft: '1.5px solid #000000', paddingLeft: '20px', fontSize: '12px', height: '36px', alignItems: 'center' }}>
                    이름: <span style={{ borderBottom: '1px solid #000000', width: '80px', display: 'inline-block', height: '18px' }}></span>
                    점수: <span style={{ borderBottom: '1px solid #000000', width: '50px', display: 'inline-block', height: '18px' }}></span>
                  </div>
                ) : (
                  <div style={{ borderLeft: '1.5px solid #000000', paddingLeft: '20px', fontSize: '12px', height: '36px', display: 'flex', alignItems: 'center', color: '#dc2626', fontWeight: 'bold' }}>
                    교사용 정답지
                  </div>
                )}
              </div>

              {/* 本문 2단 다단 조판 영역 */}
              <div className="exam-print-body">
                {elements.map((elem, idx) => {
                  if (elem.type === 'section') {
                    return (
                      <div key={idx} style={{ marginTop: '22px', marginBottom: '10px', breakInside: 'avoid' }}>
                        <div style={{ fontSize: '14.5px', fontWeight: 'bold', borderBottom: '1px solid #000000', paddingBottom: '2px' }}>{renderExamInline(elem.content)}</div>
                      </div>
                    );
                  }

                  if (elem.type === 'text') {
                    return (
                      <p key={idx} style={{ marginTop: '14px', marginBottom: '6px', fontSize: '12px', lineHeight: '1.5', textIndent: '0px' }}>{renderExamInline(elem.content)}</p>
                    );
                  }

                  if (elem.type === 'image') {
                    return (
                      <div key={idx} style={{ display: 'flex', justifyContent: 'center', margin: '12px 0', breakInside: 'avoid' }}>
                        <img src={elem.src} alt={elem.alt} style={{ maxWidth: '100%', maxHeight: '180px', objectFit: 'contain', border: '1px solid #cbd5e1', borderRadius: '6px', padding: '4px' }} />
                      </div>
                    );
                  }
                  
                  if (elem.type === 'blockquote') {
                    return (
                      <div key={idx} style={{ border: '1px solid #9ca3af', borderRadius: '4px', padding: '8px', margin: '12px 0', backgroundColor: '#f9fafb', fontSize: '11.5px', lineHeight: '1.45', whiteSpace: 'pre-wrap', breakInside: 'avoid' }}>
                        {renderExamInline(elem.content)}
                      </div>
                    );
                  }
                  
                  if (elem.type === 'question') {
                    return (
                      <div key={idx} style={{ marginTop: '10px', marginBottom: '20px', fontSize: '12.5px', lineHeight: '1.5', breakInside: 'avoid' }}>
                        <div><strong>{elem.num}.</strong> {renderExamInline(elem.text)}</div>
                        
                        {/* 문항 body (이미지, 본문 텍스트 등) 렌더링 */}
                        {elem.body && elem.body.map((sub, sidx) => {
                          if (sub.type === 'image') {
                            return (
                              <div key={sidx} style={{ display: 'flex', justifyContent: 'center', margin: '8px 0', breakInside: 'avoid' }}>
                                <img src={sub.src} alt={sub.alt} style={{ maxWidth: '100%', maxHeight: '150px', objectFit: 'contain', border: '1px solid #cbd5e1', borderRadius: '4px', padding: '4px' }} />
                              </div>
                            );
                          }
                          if (sub.type === 'text') {
                            return (
                              <p key={sidx} style={{ margin: '4px 0', paddingLeft: '8px', fontSize: '12px', lineHeight: '1.5' }}>{renderExamInline(sub.content)}</p>
                            );
                          }
                          return null;
                        })}

                        {elem.choices && (
                          <div style={{ marginTop: '4px', fontSize: '11.5px', paddingLeft: '8px' }}>
                            {(() => {
                              const tokens = elem.choices.split(/(①|②|③|④|⑤)/);
                              const choicesList = [];
                              let currentSymbol = null;
                              for (let token of tokens) {
                                if (['①', '②', '③', '④', '⑤'].includes(token)) {
                                  currentSymbol = token;
                                } else if (currentSymbol) {
                                  choicesList.push({ symbol: currentSymbol, text: token.trim() });
                                  currentSymbol = null;
                                }
                              }
                              
                              if (choicesList.length === 0) {
                                return <div>{renderExamInline(elem.choices)}</div>;
                              }
                              
                              const totalTextLength = choicesList.reduce((sum, c) => sum + c.text.length, 0);
                              const isVertical = totalTextLength > 35;
                              
                              return (
                                <div style={{ display: 'flex', flexDirection: isVertical ? 'column' : 'row', flexWrap: 'wrap', justifyContent: isVertical ? 'flex-start' : 'space-between', gap: isVertical ? '4px' : '8px', marginTop: '2px' }}>
                                  {choicesList.map((c, cidx) => (
                                    <span key={cidx} style={{ display: 'inline-block' }}>
                                      <strong style={{ marginRight: '2px' }}>{c.symbol}</strong> {renderExamInline(c.text)}
                                    </span>
                                  ))}
                                </div>
                              );
                            })()}
                          </div>
                        )}
                        {printExamMode === 'teacher' && elem.answer && (
                          <div style={{ color: '#dc2626', fontWeight: 'bold', fontSize: '11px', marginTop: '4px', backgroundColor: '#fef2f2', padding: '2px 6px', borderRadius: '4px', display: 'inline-block' }}>
                            [정답: {renderExamInline(elem.answer)}]
                          </div>
                        )}
                        {shouldShowWritingLines(elem, printExamMode) && (
                          <div style={{ marginTop: '8px', paddingLeft: '8px' }}>
                            <div style={{ borderBottom: '1px dotted #9ca3af', height: '18px', width: '100%' }}></div>
                            <div style={{ borderBottom: '1px dotted #9ca3af', height: '18px', width: '100%', marginTop: '6px' }}></div>
                          </div>
                        )}
                      </div>
                    );
                  }
                  return null;
                })}
              </div>

              <div style={{ marginTop: '24px', borderTop: '1px solid #e5e7eb', paddingTop: '10px', textAlign: 'right', fontSize: '11px', color: '#9ca3af', fontStyle: 'italic' }}>
                {brandName} 드림
              </div>
            </div>
          </div>
        );
      })()}

      {/* 단어 해설 인쇄 모달 (A4) */}
      {printVocabId && (() => {
        const v = vocab.find(x => x.id === printVocabId);
        if (!v) return null;
        return (
          <div className="print-preview-modal">
            <div className="print-preview-actions">
              <button className="btn btn-primary" onClick={() => window.print()}>인쇄 또는 PDF 저장 실행</button>
              <button className="btn btn-secondary" onClick={() => setPrintVocabId(null)} style={{ backgroundColor: '#ffffff', color: '#0f172a' }}>창 닫기</button>
            </div>
            <div className="a4-document">
              <div className="a4-header">
                <div className="a4-brand">{brandName} · Voca Guide</div>
                <div className="a4-title">{v.word}</div>
              </div>
              <div className="a4-diagnosis-content vocab-content" style={{ border: 'none', padding: 0, background: 'none' }}>
                {renderMarkdown(v.markdown)}
              </div>
            </div>
          </div>
        );
      })()}

      {/* 기준정보(관리 탭)에서 등록한 목록을 입력 폼의 자동완성 source로 제공.
          datalist 방식이라 목록에 없는 값도 직접 입력 가능(기존 자유 텍스트와 하위호환). */}
      <datalist id="school-options">
        {master.schools.map(s => <option key={s.id} value={s.name} />)}
      </datalist>
      <datalist id="course-options">
        {master.courses.map(c => <option key={c.id} value={c.name} />)}
      </datalist>
      <datalist id="textbook-options">
        {master.textbooks.map(t => <option key={t.id} value={t.name} />)}
      </datalist>

    </div>
  );
}

// 영역별 1차 자동 코멘트 생성. 레벨테스트·성취도가 동일한 sections 구조
// ({name, questions, feedback, warning})를 쓰므로 한 구현으로 처리하고,
// 라벨(헤더)만 매핑 종류에 따라 달리한다.
const generateSectionComment = (examId, wrongAnswers, mapping, headerLabel) => {
  if (!examId || !mapping[examId]) return '';
  const testInfo = mapping[examId];
  const safeWrong = Array.isArray(wrongAnswers) ? wrongAnswers : [];

  const commentParts = [];
  const wrongListStr = safeWrong.length > 0
    ? `오답 문항: ${[...safeWrong].sort((a, b) => a - b).join(', ')}번`
    : '오답 없음 (만점)';
  commentParts.push(`■ [${headerLabel}] ${wrongListStr}`);

  const diagnosisList = [];
  for (const sec of Object.values(testInfo.sections)) {
    const secWrong = safeWrong.filter(qNum => sec.questions.includes(qNum));
    const secTotal = sec.questions.length;
    if (secWrong.length > 0) {
      const secScore = Math.round(((secTotal - secWrong.length) / secTotal) * 100);
      diagnosisList.push(`- ${sec.name}: ${sec.warning} (성취 지수: ${secScore}%)`);
    } else {
      diagnosisList.push(`- ${sec.name}: ${sec.feedback} (성취 지수: 100% 완료)`);
    }
  }

  if (diagnosisList.length > 0) {
    commentParts.push(`\n[영역별 성취 및 정밀 진단]\n${diagnosisList.join('\n')}`);
  }
  return commentParts.join('\n');
};

const generateLevelTestComment = (examId, wrongAnswers) =>
  generateSectionComment(examId, wrongAnswers, levelTestMapping, '레벨테스트 자동 분석');

const generateAchievementComment = (examId, wrongAnswers) =>
  generateSectionComment(examId, wrongAnswers, achievementTestMapping, '성취도 자동 분석');

export default App;
