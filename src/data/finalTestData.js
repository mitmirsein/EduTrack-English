// ============================================================
// 성취도 테스트 카탈로그
// 구조: schoolLevel → levelKey → rounds[]
// ============================================================

export const ACHIEVEMENT_CATALOG = {
  elementary: {
    label: '초등 문법',
    levels: {
      lv1: { label: '레벨 1', rounds: [1, 2] },
      lv2: { label: '레벨 2', rounds: [1, 2] },
      lv3: { label: '레벨 3', rounds: [1, 2] },
    },
  },
  middle: {
    label: '중등 문법',
    levels: {
      lv1: { label: '레벨 1', rounds: [1, 2, 3, 4, 5] },
      lv2: { label: '레벨 2', rounds: [1, 2, 3, 4, 5] },
      lv3: { label: '레벨 3', rounds: [1, 2, 3, 4, 5] },
    },
  },
  high: {
    label: '고등 문법',
    levels: {
      basic: { label: '기본', rounds: [1, 2] },
      essential: { label: '필수', rounds: [1, 2] },
    },
  },
};

// ID 생성 헬퍼: "ft_elementary_lv1_r1" 형태
export const makeFinalTestId = (school, level, round) =>
  `ft_${school}_${level}_r${round}`;

// ID → 표시 제목 변환 헬퍼
export const getFinalTestTitle = (id) => {
  if (!id) return '(미선택)';
  // ft_{school}_{level}_r{round}
  const m = id.match(/^ft_(\w+)_(\w+)_r(\d+)$/);
  if (!m) return id;
  const [, school, level, round] = m;
  const schoolCfg = ACHIEVEMENT_CATALOG[school];
  if (!schoolCfg) return id;
  const levelCfg = schoolCfg.levels[level];
  const levelLabel = levelCfg ? levelCfg.label : level;
  return `${schoolCfg.label} ${levelLabel} ${round}차`;
};

// ──────────────────────────────────────────────────────────────
// 시험지 내용 저장소 (key = makeFinalTestId 반환값)
// 내용이 없으면 빈 템플릿으로 표시됨.
// ──────────────────────────────────────────────────────────────

const makeBlankExam = (title, target, time = '45분') => `# ${title}
- **평가 대상**: ${target}
- **시험 시간**: ${time}
- **총 배점**: 100점

---
## 시험 문항

*(아직 문항이 등록되지 않았습니다. 이 슬롯에 문제를 추가해 주세요.)*
`;

export const finalTestData1 = {
  // ── 초등 문법 ──
  ft_elementary_lv1_r1: makeBlankExam('[성취도] 초등 문법 레벨 1 — 1차', '초등 레벨 1'),
  ft_elementary_lv1_r2: makeBlankExam('[성취도] 초등 문법 레벨 1 — 2차', '초등 레벨 1'),
  ft_elementary_lv2_r1: makeBlankExam('[성취도] 초등 문법 레벨 2 — 1차', '초등 레벨 2'),
  ft_elementary_lv2_r2: makeBlankExam('[성취도] 초등 문법 레벨 2 — 2차', '초등 레벨 2'),
  ft_elementary_lv3_r1: makeBlankExam('[성취도] 초등 문법 레벨 3 — 1차', '초등 레벨 3'),
  ft_elementary_lv3_r2: makeBlankExam('[성취도] 초등 문법 레벨 3 — 2차', '초등 레벨 3'),

  // ── 중등 문법 ──
  ft_middle_lv1_r1: makeBlankExam('[성취도] 중등 문법 레벨 1 — 1차', '중등 레벨 1', '45분'),
  ft_middle_lv1_r2: makeBlankExam('[성취도] 중등 문법 레벨 1 — 2차', '중등 레벨 1', '45분'),
  ft_middle_lv1_r3: makeBlankExam('[성취도] 중등 문법 레벨 1 — 3차', '중등 레벨 1', '45분'),
  ft_middle_lv1_r4: makeBlankExam('[성취도] 중등 문법 레벨 1 — 4차', '중등 레벨 1', '45분'),
  ft_middle_lv1_r5: makeBlankExam('[성취도] 중등 문법 레벨 1 — 5차', '중등 레벨 1', '45분'),

  ft_middle_lv2_r1: makeBlankExam('[성취도] 중등 문법 레벨 2 — 1차', '중등 레벨 2', '50분'),
  ft_middle_lv2_r2: makeBlankExam('[성취도] 중등 문법 레벨 2 — 2차', '중등 레벨 2', '50분'),
  ft_middle_lv2_r3: makeBlankExam('[성취도] 중등 문법 레벨 2 — 3차', '중등 레벨 2', '50분'),
  ft_middle_lv2_r4: makeBlankExam('[성취도] 중등 문법 레벨 2 — 4차', '중등 레벨 2', '50분'),
  ft_middle_lv2_r5: makeBlankExam('[성취도] 중등 문법 레벨 2 — 5차', '중등 레벨 2', '50분'),

  ft_middle_lv3_r1: makeBlankExam('[성취도] 중등 문법 레벨 3 — 1차', '중등 레벨 3', '50분'),
  ft_middle_lv3_r2: makeBlankExam('[성취도] 중등 문법 레벨 3 — 2차', '중등 레벨 3', '50분'),
  ft_middle_lv3_r3: makeBlankExam('[성취도] 중등 문법 레벨 3 — 3차', '중등 레벨 3', '50분'),
  ft_middle_lv3_r4: makeBlankExam('[성취도] 중등 문법 레벨 3 — 4차', '중등 레벨 3', '50분'),
  ft_middle_lv3_r5: makeBlankExam('[성취도] 중등 문법 레벨 3 — 5차', '중등 레벨 3', '50분'),

  // ── 고등 문법 ──
  ft_high_basic_r1: makeBlankExam('[성취도] 고등 문법 기본 — 1차', '고등 기본', '50분'),
  ft_high_basic_r2: makeBlankExam('[성취도] 고등 문법 기본 — 2차', '고등 기본', '50분'),
  ft_high_essential_r1: makeBlankExam('[성취도] 고등 문법 필수 — 1차', '고등 필수', '55분'),
  ft_high_essential_r2: makeBlankExam('[성취도] 고등 문법 필수 — 2차', '고등 필수', '55분'),
};

// finalTestData2는 현재 finalTestData1과 동일한 슬롯을 공유하므로 별도 유지
// (성적 입력 시 type 필드로 1차/2차 구분)
export const finalTestData2 = { ...finalTestData1 };

// 하위 호환: getExamTitle이 참조하는 통합 맵
export const allFinalTestData = { ...finalTestData1 };
