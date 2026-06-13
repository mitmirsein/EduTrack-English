import { useMemo } from 'react';
import { analyzeStudentWeakness } from '../utils/weaknessAnalysis';
import { levelTestMapping } from '../data/levelTestMapping';
import { achievementTestMapping } from '../data/achievementTestMapping';
import { openLectureFile } from '../utils/lectureFiles';
import { areaLabel } from '../utils/appMeta';

// 학생 상세의 영역별 약점 진단 카드. 오답 마킹과 문항-영역 매핑을 교차한 파생 결과를
// 오답률 막대로 보여주고, 상위 약점을 강조한다. 약점 영역과 겹치는 교안을 추천한다.
function WeaknessPanel({ studentId, grades, consultations, lectures = [], showAlert }) {
  const rows = useMemo(
    () => analyzeStudentWeakness(studentId, grades, consultations, levelTestMapping, achievementTestMapping),
    [studentId, grades, consultations]
  );

  // 약점 강조: 오답이 한 건이라도 있는 영역 중 오답률 상위 2개
  const weakRows = rows.filter(r => r.totalWrong > 0);
  const weakNames = weakRows.slice(0, 2).map(r => r.name);

  // 약점 영역코드(상위 3개)와 겹치는 교안 추천
  const weakAreaCodes = new Set(weakRows.slice(0, 3).map(r => r.areaCode).filter(Boolean));
  const recommended = lectures.filter(l => (l.areas || []).some(a => weakAreaCodes.has(a)));

  const openLecture = async (id) => {
    try {
      await openLectureFile(id);
    } catch (err) {
      if (showAlert) showAlert(err.message || '교안을 여는 중 오류가 발생했습니다.', 'danger');
    }
  };

  return (
    <div style={{ marginTop: '20px', borderTop: '1px solid var(--border-color)', paddingTop: '16px' }}>
      <h4 style={{ marginBottom: '4px', fontSize: '13.5px', color: 'var(--primary-accent)', fontWeight: 'bold' }}>영역별 약점 진단 (오답 누적 분석)</h4>
      <p style={{ fontSize: '12px', color: 'var(--text-color-light)', marginBottom: '12px' }}>
        레벨테스트·성취도 평가에서 마킹한 오답을 문항 영역별로 누적해 자동 분석한 결과입니다.
      </p>

      {rows.length === 0 ? (
        <p style={{ fontSize: '12.5px', color: 'var(--text-color-light)', fontStyle: 'italic' }}>
          오답이 마킹된 시험 기록이 쌓이면 약점이 자동으로 분석됩니다.
        </p>
      ) : (
        <>
          {weakNames.length > 0 && (
            <div style={{ fontSize: '12.5px', marginBottom: '12px' }}>
              <strong>주요 보완 영역: </strong>
              {weakNames.map((n, i) => (
                <span key={n} style={{ color: 'var(--danger-color)', fontWeight: 700 }}>
                  {n}{i < weakNames.length - 1 ? ', ' : ''}
                </span>
              ))}
            </div>
          )}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            {rows.map(r => {
              const pct = Math.round(r.rate * 100);
              const barColor = r.rate >= 0.4 ? 'var(--danger-color)' : (r.rate >= 0.2 ? 'var(--warning-color)' : 'var(--success-color)');
              return (
                <div key={r.name}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12.5px', marginBottom: '4px' }}>
                    <span style={{ fontWeight: 600, color: 'var(--text-color-primary)' }}>{r.name}</span>
                    <span style={{ color: 'var(--text-color-secondary)' }}>
                      정답률 {r.correctPercent}% · 오답 {r.totalWrong}/{r.totalQuestions} · {r.testCount}회
                    </span>
                  </div>
                  <div style={{ width: '100%', height: '8px', backgroundColor: 'var(--border-color)', borderRadius: '4px', overflow: 'hidden' }}>
                    <div style={{ width: `${pct}%`, height: '100%', backgroundColor: barColor, borderRadius: '4px', transition: 'width 0.3s ease' }} />
                  </div>
                </div>
              );
            })}
          </div>
          <p style={{ fontSize: '11px', color: 'var(--text-color-light)', marginTop: '10px' }}>
            막대는 <strong>오답률</strong>입니다(길수록 약점). 빨강 ≥ 40%, 주황 ≥ 20%.
          </p>

          {/* 약점 보완 추천 교안 — 약점 영역과 태그가 겹치는 교안 자료실 항목 */}
          {weakAreaCodes.size > 0 && (
            <div style={{ marginTop: '16px', borderTop: '1px dashed var(--border-color)', paddingTop: '12px' }}>
              <h4 style={{ fontSize: '12.5px', fontWeight: 'bold', marginBottom: '8px', color: 'var(--text-color-primary)' }}>
                약점 보완 추천 교안
              </h4>
              {recommended.length === 0 ? (
                <p style={{ fontSize: '11.5px', color: 'var(--text-color-light)', fontStyle: 'italic' }}>
                  약점 영역({[...weakAreaCodes].map(areaLabel).join(', ')})에 해당하는 교안이 아직 없습니다. 교안 자료실에서 강화 영역을 지정해 등록하면 여기 추천됩니다.
                </p>
              ) : (
                <ul className="admin-list">
                  {recommended.map(lec => (
                    <li key={lec.id} className="admin-list-item">
                      <span style={{ minWidth: 0 }}>
                        <strong>{lec.title}</strong>
                        {(lec.areas || []).filter(a => weakAreaCodes.has(a)).map(a => (
                          <span key={a} className="admin-tag" style={{ color: 'var(--danger-color)', borderColor: 'var(--danger-color)' }}>{areaLabel(a)}</span>
                        ))}
                        <span className="admin-tag">{lec.level}</span>
                      </span>
                      <button type="button" className="dash-link-btn" onClick={() => openLecture(lec.id)}>열기</button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}

export default WeaknessPanel;
