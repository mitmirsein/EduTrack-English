// === 이탈 조기경보 ===
// 성적 시계열에서 "추세의 경고"를 감지한다. 재시험 위젯이 한 시점의 낮은 점수라면,
// 이쪽은 시간에 따른 하락 패턴이라 성격이 다르다. 출결 데이터가 없으므로 성적
// 신호만 사용한다(미응시 공백은 노이즈가 커서 1차 제외).
import { gradeTypeLabel } from './appMeta';

const DROP_STREAK = 3;     // 같은 유형 최근 N회 연속 하락
const DROP_DELTA = 20;     // 직전 대비 점수 급락 폭(이상)

// 같은 유형(daily_vocab/weekly_test 등)의 점수를 날짜순으로 정렬해 시계열을 만든다.
const seriesByType = (gradeList) => {
  const byType = new Map();
  for (const g of gradeList) {
    if (typeof g.score !== 'number' && !(typeof g.score === 'string' && g.score !== '')) continue;
    const score = Number(g.score);
    if (Number.isNaN(score)) continue;
    if (!byType.has(g.type)) byType.set(g.type, []);
    byType.get(g.type).push({ date: String(g.date || ''), score });
  }
  for (const arr of byType.values()) arr.sort((a, b) => a.date.localeCompare(b.date));
  return byType;
};

// 재원생 중 하락 추세/급락 신호가 있는 학생을 사유와 함께 추출한다.
// gradeTypes(master.gradeTypes)를 주면 사유 문구의 유형 라벨에 반영된다.
// 반환: [{ studentId, name, reasons: [string] }]
export const detectAttentionStudents = (students, grades, gradeTypes) => {
  const result = [];
  for (const s of students) {
    if (s.status !== '재원') continue;
    const series = seriesByType(grades.filter(g => g.studentId === s.id));
    const reasons = [];

    for (const [type, arr] of series.entries()) {
      if (arr.length < 2) continue;
      const label = gradeTypeLabel(type, gradeTypes);

      // 연속 하락: 최근 DROP_STREAK개가 단조 감소
      if (arr.length >= DROP_STREAK) {
        const tail = arr.slice(-DROP_STREAK);
        const strictlyDown = tail.every((p, i) => i === 0 || p.score < tail[i - 1].score);
        if (strictlyDown) {
          reasons.push(`${label} ${DROP_STREAK}회 연속 하락 (${tail.map(p => p.score).join('→')})`);
          continue; // 연속 하락이면 급락은 중복 보고하지 않음
        }
      }
      // 급락: 직전 대비 DROP_DELTA점 이상 하락
      const last = arr[arr.length - 1];
      const prev = arr[arr.length - 2];
      if (prev.score - last.score >= DROP_DELTA) {
        reasons.push(`${label} 급락 (${prev.score}→${last.score})`);
      }
    }

    if (reasons.length > 0) result.push({ studentId: s.id, name: s.name, reasons });
  }
  return result;
};
