import { useMemo } from 'react';

// 반(과정) 단위 운영 뷰. 학생은 student.courseId로 반에 배정되며, 여기서는 반별로
// 소속 학생 명단·인원·반 평균(학생별 최근 성적 평균)과 연결된 교재를 한눈에 본다.
// 강사의 실제 운영 단위는 개별 학생이 아니라 "반"이라는 점을 반영한다.

// 학생의 가장 최근 성적 점수(숫자). 성적이 없으면 null.
const latestScore = (studentId, grades) => {
  const mine = grades
    .filter(g => g.studentId === studentId && g.score !== '' && g.score != null)
    .map(g => ({ date: String(g.date || ''), score: Number(g.score) }))
    .filter(g => !Number.isNaN(g.score))
    .sort((a, b) => b.date.localeCompare(a.date));
  return mine.length > 0 ? mine[0].score : null;
};

const classAverage = (members, grades) => {
  const scores = members.map(s => latestScore(s.id, grades)).filter(v => v != null);
  if (scores.length === 0) return null;
  return Math.round(scores.reduce((a, b) => a + b, 0) / scores.length);
};

function ClassView({ students, grades, master, onNavigate }) {
  const courseIds = new Set(master.courses.map(c => c.id));

  const groups = useMemo(() => {
    const byCourse = master.courses.map(c => ({
      course: c,
      members: students.filter(s => s.courseId === c.id)
    }));
    const unassigned = students.filter(s => !s.courseId || !courseIds.has(s.courseId));
    return { byCourse, unassigned };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [students, master.courses]);

  const textbooksOf = (courseId) => master.textbooks.filter(t => t.courseId === courseId);

  // 컴포넌트가 아니라 렌더 헬퍼 함수다(본문 안에서 컴포넌트를 정의하지 않기 위함).
  const renderMembers = (members) => (
    members.length === 0
      ? <p className="dash-empty">소속 학생이 없습니다.</p>
      : (
        <ul className="dash-list">
          {members.map(s => {
            const sc = latestScore(s.id, grades);
            return (
              <li key={s.id} className="dash-list-item">
                <span className="dash-item-main">
                  <span className="dash-item-name">{s.name}</span>
                  <span>{s.grade}{s.school ? ` · ${s.school}` : ''}</span>
                </span>
                <span className="dash-item-date">{sc != null ? `최근 ${sc}점` : '성적 없음'}</span>
              </li>
            );
          })}
        </ul>
      )
  );

  return (
    <div>
      <div className="content-header">
        <div className="header-title-wrapper">
          <h1>반별 운영</h1>
          <p>관리(기준정보)에서 등록한 과정(반)별로 학생 명단·반 평균·교재를 확인합니다. 반 배정은 학생 등록/수정에서 합니다.</p>
        </div>
      </div>

      {master.courses.length === 0 ? (
        <div className="card">
          <p className="dash-empty">
            등록된 과정(반)이 없습니다. <button type="button" className="dash-link-btn" onClick={() => onNavigate('admin')}>관리(기준정보) 탭</button>에서 과정을 먼저 등록해 주세요.
          </p>
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '24px', alignItems: 'start' }}>
          {groups.byCourse.map(({ course, members }) => {
            const avg = classAverage(members, grades);
            const books = textbooksOf(course.id);
            return (
              <div key={course.id} className="card">
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: '8px', flexWrap: 'wrap' }}>
                  <h3>{course.name} <span className="admin-tag">{course.stage}</span></h3>
                  <span style={{ fontSize: '12.5px', color: 'var(--text-color-secondary)' }}>
                    {members.length}명 · 반 평균 {avg != null ? `${avg}점` : '—'}
                  </span>
                </div>
                {books.length > 0 && (
                  <p style={{ fontSize: '12px', color: 'var(--text-color-light)', margin: '4px 0 8px' }}>
                    교재: {books.map(b => b.name).join(', ')}
                  </p>
                )}
                {renderMembers(members)}
              </div>
            );
          })}

          {groups.unassigned.length > 0 && (
            <div className="card" style={{ borderStyle: 'dashed' }}>
              <h3>미배정 학생 <span className="admin-tag">{groups.unassigned.length}명</span></h3>
              <p style={{ fontSize: '12px', color: 'var(--text-color-light)', margin: '4px 0 8px' }}>
                학생 등록/수정에서 수강 반을 지정하면 해당 반으로 이동합니다.
              </p>
              {renderMembers(groups.unassigned)}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default ClassView;
