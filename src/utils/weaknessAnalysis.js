// === 오답 유형 진단 (영역별 약점 누적) ===
// 이미 저장된 오답 마킹(wrongAnswers)과 문항-영역 매핑(levelTestMapping /
// achievementTestMapping)을 교차해, 학생별 영역 약점을 파생 계산한다.
// 추가 데이터 저장 없이 읽기 전용으로 동작한다.
//
// 누적 키는 section.name(예: "어휘력 (Vocab)"). 레벨테스트는 5대 영역으로
// 통일돼 회차끼리 합산되고, 성취도는 시험별 단원이 달라 단원별로 분리된다.

// 한 시험 기록(grade/consultation)에 대응하는 매핑 엔트리와 종류를 찾는다.
// kind: 'level'이면 section 키가 곧 표준 영역코드(vocab/grammar/…), 'achievement'면 문법 단원.
const resolveMapping = (record, levelMapping, achievementMapping) => {
  if (record.type === 'level_test' && record.examId && levelMapping[record.examId]) {
    return { entry: levelMapping[record.examId], kind: 'level' };
  }
  if (record.type === 'achievement_test' && record.examId && achievementMapping[record.examId]) {
    return { entry: achievementMapping[record.examId], kind: 'achievement' };
  }
  if (record.testId && levelMapping[record.testId]) {
    return { entry: levelMapping[record.testId], kind: 'level' };
  }
  return null;
};

// 학생의 모든 오답 기록을 영역명 기준으로 누적한다.
// 반환: [{ name, totalQuestions, totalWrong, rate(0~1), correctPercent(0~100), testCount }] (오답률 내림차순)
export const analyzeStudentWeakness = (studentId, grades, consultations, levelMapping, achievementMapping) => {
  const records = [
    ...grades.filter(g => g.studentId === studentId),
    ...consultations.filter(c => c.studentId === studentId)
  ];

  const acc = new Map(); // name -> { totalQuestions, totalWrong, testCount, areaCode }

  for (const rec of records) {
    const wrong = Array.isArray(rec.wrongAnswers) ? rec.wrongAnswers : [];
    const resolved = resolveMapping(rec, levelMapping, achievementMapping);
    if (!resolved || !resolved.entry.sections) continue;

    for (const [sectionKey, sec] of Object.entries(resolved.entry.sections)) {
      const total = sec.questions.length;
      if (total === 0) continue;
      const wrongInSec = wrong.filter(q => sec.questions.includes(q)).length;
      // 레벨테스트는 section 키가 표준 영역코드, 성취도 단원은 모두 문법(grammar)으로 귀속.
      const areaCode = resolved.kind === 'level' ? sectionKey : 'grammar';
      const prev = acc.get(sec.name) || { totalQuestions: 0, totalWrong: 0, testCount: 0, areaCode };
      acc.set(sec.name, {
        totalQuestions: prev.totalQuestions + total,
        totalWrong: prev.totalWrong + wrongInSec,
        testCount: prev.testCount + 1,
        areaCode: prev.areaCode || areaCode
      });
    }
  }

  return Array.from(acc.entries())
    .map(([name, v]) => {
      const rate = v.totalQuestions > 0 ? v.totalWrong / v.totalQuestions : 0;
      return {
        name,
        areaCode: v.areaCode,
        totalQuestions: v.totalQuestions,
        totalWrong: v.totalWrong,
        rate,
        correctPercent: Math.round((1 - rate) * 100),
        testCount: v.testCount
      };
    })
    .sort((a, b) => b.rate - a.rate);
};
