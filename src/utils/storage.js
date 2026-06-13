// 로컬 스토리지 키 정의
const STORAGE_KEYS = {
  STUDENTS: 'edutrack_students',
  GRADES: 'edutrack_grades',
  CONSULTATIONS: 'edutrack_consultations',
  API_SETTINGS: 'edutrack_api_settings',
  QUARTERLY_REPORTS: 'edutrack_quarterly_reports',
  MASTER: 'edutrack_master',
  LECTURES: 'edutrack_lectures',
  VOCAB: 'edutrack_vocab'
};

// === 기준정보(마스터 데이터) 기본값 ===
// 학교는 기존 하드코딩 datalist를 이관, 학년은 기존 select 옵션을 이관한다.
// 과정·교재는 빈 목록으로 시작하여 강사가 관리 페이지에서 직접 채운다.
export const DEFAULT_MASTER = {
  schools: [
    { id: 'sch_seed_1', name: '양지초', level: '초' },
    { id: 'sch_seed_2', name: '용동중', level: '중' },
    { id: 'sch_seed_3', name: '용인고', level: '고' },
    { id: 'sch_seed_4', name: '진덕고', level: '고' },
    { id: 'sch_seed_5', name: '포곡고', level: '고' }
  ],
  grades: ['초등', '중1', '중2', '중3', '고1', '고2', '고3'],
  courses: [],    // { id, name, stage }  stage: '초' | '중' | '고'
  textbooks: [],  // { id, name, courseId, publisher, chapters: [] }
  // 성적 유형. key가 'level_test'/'achievement_test'면 오답 마킹·약점 진단과 연동된다.
  // 강사가 추가하는 유형은 임의 key의 점수형(특수 동작 없음)으로 동작한다.
  gradeTypes: [
    { id: 'gt_level', key: 'level_test', label: '신입 레벨 테스트' },
    { id: 'gt_achieve', key: 'achievement_test', label: '정기 성취도 테스트' }
  ],
  // 브랜드(학원명) — 화면·인쇄물·AI 프롬프트가 공용으로 사용. 설정에서 변경.
  brandName: 'EduTrack English',
  schemaVersion: 1
};

// 마스터 데이터의 형태를 검증하고, 누락 섹션은 기본값으로 채워 항상 완전한 객체를 보장한다.
// 생성 함수(룰셋·LLM)가 참조하는 현재 브랜드명. App이 master 변경 시 setBrand로 동기화.
let appBrand = DEFAULT_MASTER.brandName;
export const setBrand = (b) => { if (typeof b === 'string' && b.trim()) appBrand = b; };

const isValidMaster = (v) => v && typeof v === 'object' && !Array.isArray(v);
const normalizeMaster = (m) => ({
  schools: Array.isArray(m.schools) ? m.schools : DEFAULT_MASTER.schools,
  grades: Array.isArray(m.grades) ? m.grades : DEFAULT_MASTER.grades,
  courses: Array.isArray(m.courses) ? m.courses : [],
  textbooks: Array.isArray(m.textbooks) ? m.textbooks : [],
  gradeTypes: Array.isArray(m.gradeTypes) && m.gradeTypes.length > 0 ? m.gradeTypes : DEFAULT_MASTER.gradeTypes,
  brandName: (typeof m.brandName === 'string' && m.brandName.trim()) ? m.brandName : DEFAULT_MASTER.brandName,
  schemaVersion: DEFAULT_MASTER.schemaVersion
});

// 기본 진단 기준표 정의
export const DIAGNOSIS_STANDARDS = `
[중고등부 영어 레벨테스트 평가 기준표]

1. 어휘 (Vocabulary)
- 85점 이상: 학년 수준의 필수 어휘 및 심화 어휘 완성도가 높음. 고난도 수능 독해 어휘 및 동의어/반의어 정리 단계 진입 권장.
- 60점~84점: 핵심 어휘는 인지하고 있으나 구동사나 다의어, 문맥상 알맞은 어휘 추론 능력이 다소 부족함. 매 수업 철저한 단어 테스트와 누적 암기 필요.
- 60점 미만: 기초 어휘 결손이 심각하여 독해 및 어법 학습의 발목을 잡고 있음. 중등 기초 어휘부터 품사 구분 학습 병행 필수.

2. 문법 (Grammar)
- 80점 이상: 고등 내신 수준의 응용 어법 문제와 서술형 영작에 대한 대처 능력이 있음. 논리적 오류를 스스로 감지하고 수정 가능.
- 50점~79점: 기본 어법 개념(형식, 관계사, 수동태 등)은 머리로 인지하고 있으나, 실제 문장 내 적용력 및 복합 어법 문제에서 오답률이 높음. 개념 구조화와 서술형 단원별 작문 연습 필요.
- 50점 미만: 8품사, 기본 문장 형식, 시제 등 기초 뼈대 문법의 재정립이 시급함. 구조 분석 연습과 쉬운 구문 훈련 선행 필수.

3. 구문독해 (Syntax)
- 80점 이상: 복잡한 단문 및 장문의 구조 분석이 정교함. 도치, 분사구문, 삽입절 등이 포함된 킬러 문장도 올바르게 해석 가능.
- 55점~79점: 단순 3형식 문장은 직독직해가 가능하나, 수식어가 붙거나 절이 길어지면 감에 의존한 '소설 독해' 경향을 보임. 구문 분석(주어/동사/수식어 끊어 읽기) 훈련 집중 배치 필요.
- 55점 미만: 단어의 나열만으로 문장의 의미를 대충 때려 맞추는 상태. 문장 5형식 기초 뼈대를 잡고 짧은 문장부터 정확히 해석하는 연습 필수.

4. 논리독해 (Reading)
- 80점 이상: 글의 대의 파악 및 문맥 흐름을 잡는 논리 구조 판단력이 우수함. 빈칸 추론, 순서 배열 등 수능 형 고난도 문항 해결 가능.
- 55점~79점: 주제 파악은 비교적 잘하나, 오답 매력도에 자주 빠짐. 지문 내 단서 찾기 훈련과 논리적 비약 방지 훈련 필요.
- 55점 미만: 글을 읽고 전체 맥락이나 요지를 잡지 못함. 한글 번역본을 읽고도 이해하지 못하는 경우가 있어, 문장 간 연결 관계를 파악하는 기초 독해 훈련 요구됨.

5. 서술형 (Writing)
- 80점 이상: 한글 조건에 맞춘 영작이 매끄러우며, 시제/수일치 등 감점 요인이 적음.
- 50점~79점: 단어 배열 수준은 가능하나, 전치사나 어법상 미세한 결손으로 감점이 잦음. 조건 충족 훈련과 한글 문장 성분과 영어 매핑 훈련 필요.
- 50점 미만: 기본적인 문장 배열 및 작문이 불가능함. 필수 50개 구문 패턴 암기 및 기본 뼈대 영작부터 점진적 훈련 필요.
`;

// === 로컬 스토리지 헬퍼 함수 ===
// 읽기: 손상된 JSON이 있어도 앱이 흰 화면으로 죽지 않도록 격리 후 기본값으로 기동한다.
// 손상 원본은 `<키>_corrupted_<시각>` 키로 보존하여 수동 복구 여지를 남긴다.
const safeGet = (key, fallback, validate) => {
  let raw = null;
  try {
    raw = localStorage.getItem(key);
    if (raw === null) return fallback;
    const parsed = JSON.parse(raw);
    if (validate && !validate(parsed)) throw new Error('invalid shape');
    return parsed;
  } catch {
    try {
      if (raw !== null) localStorage.setItem(`${key}_corrupted_${Date.now()}`, raw);
      localStorage.removeItem(key);
    } catch { /* 격리 보존마저 실패해도 기동은 계속한다 */ }
    return fallback;
  }
};

// 쓰기: 용량 초과(QuotaExceededError) 등 실패 시 false를 반환한다.
// 호출부는 반환값을 확인해 사용자에게 "저장 실패"를 반드시 알려야 한다.
const safeSet = (key, value) => {
  try {
    localStorage.setItem(key, JSON.stringify(value));
    return true;
  } catch {
    return false;
  }
};

export const storage = {
  getStudents: () => safeGet(STORAGE_KEYS.STUDENTS, [], Array.isArray),
  saveStudents: (students) => safeSet(STORAGE_KEYS.STUDENTS, students),

  getGrades: () => safeGet(STORAGE_KEYS.GRADES, [], Array.isArray),
  saveGrades: (grades) => safeSet(STORAGE_KEYS.GRADES, grades),

  getConsultations: () => safeGet(STORAGE_KEYS.CONSULTATIONS, [], Array.isArray),
  saveConsultations: (consultations) => safeSet(STORAGE_KEYS.CONSULTATIONS, consultations),

  getQuarterlyReports: () => safeGet(STORAGE_KEYS.QUARTERLY_REPORTS, [], Array.isArray),
  saveQuarterlyReports: (reports) => safeSet(STORAGE_KEYS.QUARTERLY_REPORTS, reports),

  getApiSettings: () => safeGet(
    STORAGE_KEYS.API_SETTINGS,
    { provider: 'none', apiKey: '', model: '' },
    (v) => v && typeof v === 'object' && !Array.isArray(v)
  ),
  saveApiSettings: (settings) => safeSet(STORAGE_KEYS.API_SETTINGS, settings),

  // 키가 없으면 기본 시드로, 일부 섹션만 있으면 나머지를 보강해 항상 완전한 객체를 돌려준다.
  getMaster: () => normalizeMaster(safeGet(STORAGE_KEYS.MASTER, DEFAULT_MASTER, isValidMaster)),
  saveMaster: (master) => safeSet(STORAGE_KEYS.MASTER, master),

  // 교안 목록 메타데이터(제목·코스·레벨·파일명). 실제 파일 바이너리는 IndexedDB(lectureFiles.js).
  getLectures: () => safeGet(STORAGE_KEYS.LECTURES, [], Array.isArray),
  saveLectures: (lectures) => safeSet(STORAGE_KEYS.LECTURES, lectures),

  // 단어 해설(Voca Guide). [{ id, word, markdown, createdAt }]
  getVocabGuides: () => safeGet(STORAGE_KEYS.VOCAB, [], Array.isArray),
  saveVocabGuides: (guides) => safeSet(STORAGE_KEYS.VOCAB, guides)
};

// === 백업 및 복구 ===
// 보안: 백업 파일은 카톡/메일 등으로 옮겨질 수 있는 개인정보 파일이므로
// API Key는 절대 백업에 포함하지 않는다 (provider/model 설정만 보존).
export const backupData = (filenameSuffix = '') => {
  // eslint-disable-next-line no-unused-vars
  const { apiKey, ...apiSettingsWithoutKey } = storage.getApiSettings();
  const data = {
    students: storage.getStudents(),
    grades: storage.getGrades(),
    consultations: storage.getConsultations(),
    quarterlyReports: storage.getQuarterlyReports(),
    master: storage.getMaster(),
    apiSettings: apiSettingsWithoutKey,
    exportedAt: new Date().toISOString()
  };

  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `edutrack_backup_${new Date().toISOString().slice(0, 10)}${filenameSuffix}.json`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
};

// 백업 파일 스키마 검증: 형식이 어긋난 파일로 기존 데이터를 덮어쓰지 않도록 막는다.
export const validateBackupData = (data) => {
  if (!data || typeof data !== 'object' || Array.isArray(data)) {
    throw new Error('백업 파일의 최상위 구조가 올바르지 않습니다.');
  }
  const sections = ['students', 'grades', 'consultations'];
  let hasAnySection = false;
  for (const key of sections) {
    if (data[key] === undefined) continue;
    if (!Array.isArray(data[key])) {
      throw new Error(`백업 파일의 "${key}" 항목이 목록 형식이 아닙니다.`);
    }
    hasAnySection = true;
  }
  if (!hasAnySection) {
    throw new Error('백업 파일에 학생/성적/상담 데이터가 하나도 없습니다. EduTrack 백업 파일이 맞는지 확인해 주세요.');
  }
  if (data.students && data.students.some(s => !s || typeof s.id !== 'string' || typeof s.name !== 'string')) {
    throw new Error('백업 파일의 학생 데이터에 필수 정보(id, 이름)가 빠진 항목이 있습니다.');
  }
  if (data.apiSettings !== undefined && (typeof data.apiSettings !== 'object' || Array.isArray(data.apiSettings))) {
    throw new Error('백업 파일의 설정(apiSettings) 항목이 올바르지 않습니다.');
  }
  // master는 선택 섹션(구버전 백업엔 없음). 있으면 객체 형식만 확인하고 통과시킨다.
  if (data.master !== undefined && (typeof data.master !== 'object' || Array.isArray(data.master))) {
    throw new Error('백업 파일의 기준정보(master) 항목이 올바르지 않습니다.');
  }
  return {
    students: data.students ? data.students.length : 0,
    grades: data.grades ? data.grades.length : 0,
    consultations: data.consultations ? data.consultations.length : 0
  };
};

// 1단계: 파일을 읽고 검증만 수행한다 (아직 아무것도 덮어쓰지 않음).
export const readBackupFile = (file) => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const data = JSON.parse(e.target.result);
        const summary = validateBackupData(data);
        resolve({ data, summary });
      } catch (err) {
        reject(new Error(err.message || '올바르지 않은 백업 파일 형식입니다.'));
      }
    };
    reader.onerror = () => reject(new Error('파일을 읽는 도중 오류가 발생했습니다.'));
    reader.readAsText(file);
  });
};

// 2단계: 검증된 데이터를 실제로 저장한다.
// API Key는 백업에 없으면 현재 브라우저에 저장된 키를 그대로 유지한다.
export const applyBackupData = (data) => {
  let ok = true;
  if (data.students) ok = storage.saveStudents(data.students) && ok;
  if (data.grades) ok = storage.saveGrades(data.grades) && ok;
  if (data.consultations) ok = storage.saveConsultations(data.consultations) && ok;
  if (data.quarterlyReports) ok = storage.saveQuarterlyReports(data.quarterlyReports) && ok;
  if (data.master) ok = storage.saveMaster(normalizeMaster(data.master)) && ok;
  if (data.apiSettings) {
    const current = storage.getApiSettings();
    ok = storage.saveApiSettings({
      ...current,
      ...data.apiSettings,
      apiKey: data.apiSettings.apiKey || current.apiKey
    }) && ok;
  }
  if (!ok) {
    throw new Error('복원 중 일부 데이터 저장에 실패했습니다. 브라우저 저장 공간을 확인해 주세요.');
  }
  return true;
};

// === 규칙 기반(Rule-based) 진단 룰셋 엔진 ===
export const generateRuleBasedDiagnosis = (scores, studentName, grade) => {
  const report = [];
  report.push(`### [${appBrand}] 레벨 테스트 분석 리포트`);
  report.push(`- **학생명**: ${studentName} (${grade})`);
  report.push(`- **분석 유형**: 시스템 규칙 기반 1차 자동 생성 진단서\n`);
  report.push(`---\n`);

  const { vocab, grammar, syntax, reading, writing } = scores;

  // 1. 어휘
  report.push(`#### 1. 어휘력 (Vocabulary) - 성취도: ${vocab}%`);
  if (vocab >= 85) {
    report.push(`- 현재 학년 대비 어휘 수준이 매우 완성도 높습니다. 고난도 수능 독해 및 빈칸 추론에 필요한 심화 어휘 및 동/반의어 정밀 정리 단계로 진입할 준비가 되어 있습니다.`);
  } else if (vocab >= 60) {
    report.push(`- 필수적인 핵심 어휘는 인지하고 있으나, 품사 변형이나 구동사, 다의어의 문맥적 활용력은 부족한 면이 보입니다. 매 수업 철저한 단어 시험과 누적 복습 암기 관리가 권장됩니다.`);
  } else {
    report.push(`- 기초 어휘 결손이 심각해 어법과 구문 독해 학습에 큰 걸림돌이 되고 있습니다. 고등 학습에 앞서 중등 필수/기초 단어 암기와 어원 중심의 어휘 학습을 최우선으로 배치해야 합니다.`);
  }

  // 2. 문법
  report.push(`\n#### 2. 문법 및 어법 (Grammar) - 성취도: ${grammar}%`);
  if (grammar >= 80) {
    report.push(`- 내신 수준의 응용 어법 문제 및 복합 구조의 문장에서 오법을 구별하는 논리적 판단력이 뛰어납니다. 틀린 원인을 분석하고 스스로 고치는 자가 교정 능력이 충분합니다.`);
  } else if (grammar >= 50) {
    report.push(`- 분사, 관계사 등 핵심 개념은 단편적으로 이해하고 있으나 문장 구조 속에서 복합적으로 출제되면 적용력이 크게 떨어집니다. 단원별 핵심 개념의 재정리와 주관식 서술형 연계 학습이 효과적입니다.`);
  } else {
    report.push(`- 8품사와 기초 문장 구성 성분, 5형식 등 뼈대 문법 개념이 정립되지 않은 상태입니다. 고등 어법 문제를 풀기 전 기초 개념 백지 복습 훈련과 함께 구조 분석 훈련이 시급합니다.`);
  }

  // 3. 구문독해
  report.push(`\n#### 3. 구문독해력 (Syntax) - 성취도: ${syntax}%`);
  if (syntax >= 80) {
    report.push(`- 수식어가 다수 얽혀 있는 복잡한 장문이나 도치, 분사구문 등 킬러 구문도 정밀하게 구조를 끊어 명확히 해석하는 능력을 갖추고 있습니다.`);
  } else if (syntax >= 55) {
    report.push(`- 짧고 전형적인 구조는 직독직해가 매끄러우나, 절이 길어지거나 수식 성분이 복잡해지면 단어의 뜻만 나열하여 대략적인 맥락을 추론하는 '소설 독해' 양상을 보입니다. 정확한 주어/동사 찾기 및 끊어 읽기 훈련이 시급합니다.`);
  } else {
    report.push(`- 문장의 구조적 뼈대를 보지 못하고 아는 단어 몇 개로 전체 해석을 끼워 맞추는 심각한 오독 습관이 있습니다. 짧고 쉬운 구문 텍스트로 철저한 끊어 읽기 훈련을 진행해야 합니다.`);
  }

  // 4. 논리독해
  report.push(`\n#### 4. 논리독해력 (Reading) - 성취도: ${reading}%`);
  if (reading >= 80) {
    report.push(`- 글의 대의(주제/요지)를 정확히 파악하며 문장 간 유기적 연결 고리를 읽어내는 능력이 훌륭합니다. 수능형 고난도 문항(빈칸, 순서, 삽입)도 논리적 단서를 기반으로 해결이 가능합니다.`);
  } else if (reading >= 55) {
    report.push(`- 지문의 대략적인 주제는 비교적 쉽게 찾으나 함정 선지에 빠지거나 논리적 비약을 하는 경우가 있습니다. 지문 내 핵심 단서에 기반한 객관적인 문제 해결 훈련이 뒷받침되어야 합니다.`);
  } else {
    report.push(`- 긴 한글 번역본을 읽고도 요지를 파악하지 못할 정도로 국어적/독해적 기본 역량이 다소 낮거나 글의 흐름을 놓칩니다. 문장 간 순서 맞추기 및 한 문장 요약 훈련을 병행할 것을 권장합니다.`);
  }

  // 5. 서술형
  report.push(`\n#### 5. 서술형 영작 (Writing) - 성취도: ${writing}%`);
  if (writing >= 80) {
    report.push(`- 한글 조건에 맞는 어법 배열 및 단어 변형 영작이 유려하며, 수일치나 시제 등의 세부 감점 요인이 거의 보이지 않는 탄탄한 영작 실력을 유지하고 있습니다.`);
  } else if (writing >= 50) {
    report.push(`- 기본적인 단어 나열은 가능하나, 전치사 사용 결손이나 수일치/시제 오류 등으로 인해 부분 감점이 빈번하게 발생하는 상태입니다. 내신 조건 충족 연습과 기출 서술형 빈출 패턴 훈련이 유효합니다.`);
  } else {
    report.push(`- 기본적인 한글 구조를 영어의 어순으로 변환하는 영작이 불가능한 수준입니다. 필수 핵심 문형 50개의 문장 암기 및 어순 감각 배양부터 기초부터 단계를 밟아 올라가야 합니다.`);
  }

  // 종합 추천
  report.push(`\n---\n`);
  report.push(`#### [종합 학습 로드맵 제안]`);
  const avg = (vocab + grammar + syntax + reading + writing) / 5;
  report.push(`- **영역별 평균 성취도**: ${avg.toFixed(1)}%`);
  if (avg >= 80) {
    report.push(`- **추천 단계**: [수능 대비 심화반] 또는 [고등 내신 1등급 공략반]\n- **학습 전략**: 오답의 근거를 지문에서 스스로 서술형으로 입증하는 오답 논증 노트 훈련 및 고난도 EBS 변형 문제 집중 공략.`);
  } else if (avg >= 55) {
    report.push(`- **추천 단계**: [구문 완성 및 어법 응용반]\n- **학습 전략**: 단원별 어법 핵심 정리 백지 테스트 진행, 천일문 식의 끊어 읽기 일일 과제 부여, 약점 영역별 집중 클리닉.`);
  } else {
    report.push(`- **추천 단계**: [기초 핵심 개념 정립반]\n- **학습 전략**: 매 수업 단어 백지 테스트 100개 엄격 시행, 5형식 뼈대 잡기, 짧은 문장의 완벽한 해석 중심 과제 부여.`);
  }

  return report.join('\n');
};

// === LLM 기반 1차 진단 작성 API 헬퍼 ===
export const generateLLMDiagnosis = async (scores, studentName, grade, apiSettings) => {
  const { provider, apiKey, model } = apiSettings;
  if (!apiKey) {
    throw new Error('API Key가 설정되어 있지 않습니다.');
  }

  const prompt = `
당신은 대한민국 최고 수준의 고등부/중등부 영어 전문 학원의 '${appBrand}' 수석 교수 강사입니다.
신규 학생의 영어 레벨테스트 성적 점수를 바탕으로, 동봉된 [평가 기준표]를 정밀하게 적용하여 학부모 상담에 즉시 사용 가능한 "프리미엄 레벨테스트 분석 리포트"의 초안(1차 진단서)을 마크다운 형식으로 공손하고 전문적으로 작성해 주세요.

[학생 정보]
- 이름: ${studentName}
- 학년: ${grade}

[레벨테스트 성적 성취도 (100점 만점 기준)]
- 어휘(Vocabulary): ${scores.vocab}점
- 문법/어법(Grammar): ${scores.grammar}점
- 구문독해(Syntax): ${scores.syntax}점
- 논리독해(Reading): ${scores.reading}점
- 서술형 영작(Writing): ${scores.writing}점

[평가 기준표]
${DIAGNOSIS_STANDARDS}

[작성 가이드라인]
1. 반드시 마크다운(Markdown) 문법을 사용해 깔끔하게 정돈해 주세요.
2. 각 영역별(어휘, 문법, 구문독해, 논리독해, 서술형)로 학생의 구체적인 약점 및 성취 성향을 평가 기준표를 기반으로 친절하게 진단해 주세요.
3. 평균 점수를 바탕으로 학생의 학습 추천 코스, 주요 공략 교재, 그리고 학부모에게 전달할 신뢰감 있는 코멘트(종합 의견)를 정성껏 작성해 주세요.
4. "${appBrand}" 소속 강사의 품격이 돋보이도록 신뢰와 격려를 담은 학부모 지향적 어조(~입니다, ~할 것을 적극 권장합니다)로 일관성 있게 작성해 주세요.
`;

  if (provider === 'gemini') {
    const defaultModel = model || 'gemini-2.5-flash';
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${defaultModel}:generateContent?key=${apiKey}`;
    
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        contents: [
          {
            parts: [
              { text: prompt }
            ]
          }
        ],
        generationConfig: {
          temperature: 0.7
        }
      })
    });

    if (!response.ok) {
      const errData = await response.json().catch(() => ({}));
      throw new Error(errData?.error?.message || `Gemini API 호출에 실패했습니다. (상태 코드: ${response.status})`);
    }

    const resJson = await response.json();
    const generatedText = resJson?.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!generatedText) {
      throw new Error('Gemini API 응답에서 텍스트를 찾을 수 없습니다.');
    }
    return generatedText;
  } 
  
  if (provider === 'openai') {
    const defaultModel = model || 'gpt-4o-mini';
    const url = 'https://api.openai.com/v1/chat/completions';

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model: defaultModel,
        messages: [
          { role: 'user', content: prompt }
        ],
        temperature: 0.7
      })
    });

    if (!response.ok) {
      const errData = await response.json().catch(() => ({}));
      throw new Error(errData?.error?.message || `OpenAI API 호출에 실패했습니다. (상태 코드: ${response.status})`);
    }

    const resJson = await response.json();
    const generatedText = resJson?.choices?.[0]?.message?.content;
    if (!generatedText) {
      throw new Error('OpenAI API 응답에서 텍스트를 찾을 수 없습니다.');
    }
    return generatedText;
  }

  throw new Error('지원하지 않는 LLM 제공업체입니다.');
};

// === 공통 LLM 호출 헬퍼 ===
// provider별 fetch를 한 곳에 모은다. 프롬프트를 받아 생성 텍스트를 반환한다.
const callLLM = async (prompt, apiSettings, temperature = 0.7) => {
  const { provider, apiKey, model } = apiSettings;
  if (!apiKey) throw new Error('API Key가 설정되어 있지 않습니다.');

  if (provider === 'gemini') {
    const defaultModel = model || 'gemini-2.5-flash';
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${defaultModel}:generateContent?key=${apiKey}`;
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: { temperature }
      })
    });
    if (!response.ok) {
      const errData = await response.json().catch(() => ({}));
      throw new Error(errData?.error?.message || `Gemini API 호출에 실패했습니다. (상태 코드: ${response.status})`);
    }
    const resJson = await response.json();
    const text = resJson?.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!text) throw new Error('Gemini API 응답에서 텍스트를 찾을 수 없습니다.');
    return text;
  }

  if (provider === 'openai') {
    const defaultModel = model || 'gpt-4o-mini';
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
      body: JSON.stringify({
        model: defaultModel,
        messages: [{ role: 'user', content: prompt }],
        temperature
      })
    });
    if (!response.ok) {
      const errData = await response.json().catch(() => ({}));
      throw new Error(errData?.error?.message || `OpenAI API 호출에 실패했습니다. (상태 코드: ${response.status})`);
    }
    const resJson = await response.json();
    const text = resJson?.choices?.[0]?.message?.content;
    if (!text) throw new Error('OpenAI API 응답에서 텍스트를 찾을 수 없습니다.');
    return text;
  }

  throw new Error('지원하지 않는 LLM 제공업체입니다. 설정에서 Gemini 또는 OpenAI를 선택하세요.');
};

// === 단어 해설(Voca Guide) LLM 생성 ===
// 어근을 분해해 1차 뜻이 2차(확장) 뜻으로 넓어지는 논리를 학생 눈높이로 설명한다.
// 어원·의미 확장은 단어마다 달라 규칙 기반 생성이 불가능하므로 LLM 전용이다.
export const generateLLMVocabGuide = async (word, context, apiSettings) => {
  if (!apiSettings.apiKey) throw new Error('API Key가 설정되어 있지 않습니다.');
  const trimmed = (word || '').trim();
  if (!trimmed) throw new Error('단어를 입력해 주세요.');

  const prompt = `당신은 '${appBrand}'의 어휘 전문 강사입니다.
학생이 영어 단어의 1차(기본) 뜻은 알지만, 왜 2차(확장) 뜻까지 갖는지 궁금해합니다.
어원(어근)을 분해해 의미가 어떻게 확장되는지를 학생에게 말하듯 친근하게 설명하는 "단어 해설"을 작성하세요.

대상 단어: ${trimmed}
${context ? `학습 맥락(예문 난이도 참고): ${context}` : ''}

아래 섹션 구조와 헤더(##)를 정확히 지켜 한국어 마크다운으로 작성하세요:

## 단어와 뜻
- 발음기호와 함께, ① 1차 뜻(구체적/일상적) ② 2차 뜻(추상적/확장)을 제시.

## 어원 분석
- 단어를 어근별로 분해(예: 어근 - 출처 언어: 의미). 어근이 합쳐져 핵심 의미가 어떻게 만들어지는지 설명.

## 의미 확장 (1차 → 2차)
- 1차 뜻에서 2차 뜻으로 넓어지는 논리를 화살표(→)로 단계적으로 풀어주기. 친근한 톤.

## 예문
- 1차 뜻 예문 2개와 2차 뜻 예문 2개. 각 영어 문장과 한글 해석을 함께.

## 핵심 이미지
- 단어의 본질을 한 줄로 기억하기 쉽게 정리.

## 시험 포인트
- 수능·내신 출제 포인트(동의어, 파생어 등) 1~2줄.

## 확인 퀴즈
- 빈칸 채우기 2문항과 정답.

학생에게 말하듯 친근하게 쓰되(이모지는 약간만), 어원과 의미 확장 논리를 정확하게 전달하세요.`;

  return callLLM(prompt, apiSettings);
};

// LocalStorage의 총 바이트 크기 및 사용량을 구하는 헬퍼 함수 (최대 5MB 기준)
export const getStorageUsage = () => {
  let totalBytes = 0;
  const keys = Object.keys(localStorage);
  for (let key of keys) {
    totalBytes += (localStorage[key].length + key.length) * 2; // UTF-16 기준 문자당 2바이트
  }
  const maxBytes = 5 * 1024 * 1024; // 5MB
  const percent = ((totalBytes / maxBytes) * 100).toFixed(2);
  const sizeMb = (totalBytes / (1024 * 1024)).toFixed(2);
  return {
    bytes: totalBytes,
    sizeMb,
    maxMb: 5.00,
    percent: parseFloat(percent)
  };
};

// === 분기 리포트 교사 코멘트 초안 생성 ===

// 규칙 기반: 파이널 성적(1차·2차) + 학생 정보로 자동 초안 생성
export const generateRuleBasedQuarterlyComment = (studentName, grade, test1, test2) => {
  const lines = [];

  const scoreLabel = (s) => {
    if (!s && s !== 0) return null;
    if (s >= 90) return '매우 우수';
    if (s >= 80) return '우수';
    if (s >= 70) return '양호';
    if (s >= 60) return '보통 (통과)';
    return '미흡 (재시험 대상)';
  };

  const t1Score = test1 ? test1.score : null;
  const t2Score = test2 ? test2.score : null;

  lines.push(`${studentName} 학생은 이번 분기 수업을 성실하게 마무리하였습니다.`);
  lines.push('');

  if (t1Score !== null) {
    const lbl = scoreLabel(t1Score);
    if (t1Score >= 80) {
      lines.push(`파이널 테스트 1차(${t1Score}점, ${lbl})에서 안정적인 실력을 보여주었습니다. 개념 이해와 문제 적용 모두 균형 잡혀 있으며, 꾸준한 복습 태도가 결과로 이어졌습니다.`);
    } else {
      lines.push(`파이널 테스트 1차(${t1Score}점, ${lbl})에서 아쉬운 결과가 나왔습니다. 특정 단원에서 반복적인 오류 패턴이 관찰되었으며, 2차 시험 전 보강 학습을 집중적으로 진행하였습니다.`);
    }
  }

  if (t2Score !== null) {
    const lbl = scoreLabel(t2Score);
    if (t1Score !== null && t2Score > t1Score) {
      lines.push(`파이널 테스트 2차(${t2Score}점, ${lbl})에서는 1차 대비 ${t2Score - t1Score}점 상승한 결과를 거두었습니다. 보강 후 성장이 확실히 수치로 드러났습니다.`);
    } else if (t1Score !== null && t2Score < t1Score) {
      lines.push(`파이널 테스트 2차(${t2Score}점, ${lbl})는 1차보다 다소 낮은 점수를 기록하였습니다. 시험 범위가 확대됨에 따라 복습 관리에 더욱 유의가 필요합니다.`);
    } else {
      lines.push(`파이널 테스트 2차(${t2Score}점, ${lbl}) 결과입니다.`);
    }
  }

  lines.push('');

  const allScores = [t1Score, t2Score].filter(s => s !== null);
  const avg = allScores.length ? allScores.reduce((a, b) => a + b, 0) / allScores.length : null;

  if (avg !== null) {
    if (avg >= 85) {
      lines.push(`이번 분기 전반적인 학업 수행도가 매우 높습니다. ${studentName} 학생의 자기 주도적 학습 태도를 높이 평가하며, 다음 분기에도 심화 과정에서 좋은 성과를 기대합니다.`);
    } else if (avg >= 70) {
      lines.push(`전반적으로 꾸준히 노력한 흔적이 보이는 분기였습니다. 몇 가지 취약 영역을 집중 보완한다면 다음 분기에 한 단계 도약할 수 있는 충분한 역량이 있습니다.`);
    } else {
      lines.push(`이번 분기는 기초 개념 정립에 집중한 기간으로, 앞으로 꾸준한 누적 학습을 통해 성취도를 높여 나갈 것을 당부드립니다. 앞으로도 세밀한 지도를 통해 빈틈없이 보강하겠습니다.`);
    }
  }

  lines.push('');
  lines.push('앞으로도 즐겁고 알찬 수업이 될 수 있도록 최선을 다하겠습니다. 감사합니다.');

  return lines.join('\n');
};

// LLM 기반: API 호출로 교사 코멘트 초안 생성
export const generateLLMQuarterlyComment = async (studentName, grade, test1, test2, textbook, period, apiSettings) => {
  const { provider, apiKey, model } = apiSettings;
  if (!apiKey) throw new Error('설정 탭에서 먼저 API Key를 설정해 주세요.');

  const t1line = test1 ? `- 1차: ${test1.score}점 (${test1.examTitle || ''})` : '- 1차: 미응시';
  const t2line = test2 ? `- 2차: ${test2.score}점 (${test2.examTitle || ''})` : '- 2차: 미응시';

  const prompt = `당신은 "${appBrand}" 소속 베테랑 영어 강사입니다.
아래 학생의 이번 분기(${period || '분기'}) 학습 결과를 바탕으로, 학부모에게 보내는 분기 리포트의 "Teacher's Comment(교사 코멘트)" 섹션 초안을 한국어로 작성해 주세요.

[학생 정보]
- 이름: ${studentName}
- 학년: ${grade}
- 사용 교재: ${textbook || '(미기재)'}

[파이널 테스트 성적]
${t1line}
${t2line}

[작성 지침]
1. 3~5문단, 총 150~250자 분량으로 간결하게 작성합니다.
2. 1차·2차 성적 결과를 언급하며 구체적인 성장·보완 포인트를 짚어주세요.
3. 학부모가 읽을 때 신뢰감과 따뜻함을 느낄 수 있도록 공손하고 전문적인 어조로 작성합니다.
4. 마크다운 없이 순수 텍스트로만 작성합니다.
`;

  const callGemini = async () => {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${model || 'gemini-2.5-flash'}:generateContent?key=${apiKey}`;
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }], generationConfig: { temperature: 0.75 } })
    });
    if (!res.ok) { const e = await res.json().catch(() => ({})); throw new Error(e?.error?.message || `Gemini API 오류 (${res.status})`); }
    const j = await res.json();
    return j?.candidates?.[0]?.content?.parts?.[0]?.text || '';
  };

  const callOpenAI = async () => {
    const res = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
      body: JSON.stringify({ model: model || 'gpt-4o-mini', messages: [{ role: 'user', content: prompt }], temperature: 0.75 })
    });
    if (!res.ok) { const e = await res.json().catch(() => ({})); throw new Error(e?.error?.message || `OpenAI API 오류 (${res.status})`); }
    const j = await res.json();
    return j?.choices?.[0]?.message?.content || '';
  };

  if (provider === 'gemini') return callGemini();
  if (provider === 'openai') return callOpenAI();
  throw new Error('지원하지 않는 LLM 제공업체입니다.');
};
