import { useMemo } from 'react';
import { gradeTypeLabel, RUN_MODE, BROWSER_LABEL, PASS_THRESHOLD } from '../utils/appMeta';
import { detectAttentionStudents } from '../utils/riskAlert';

const LEVEL_TEST_PDFS = [
  { name: '초등 종합', stem: 'elementary_test' },
  { name: '중등 초급', stem: 'middle_basic' },
  { name: '중등 중급', stem: 'middle_intermediate' },
  { name: '중등 고급', stem: 'middle_advanced' },
  { name: '중등 문법 별도', stem: 'middle_grammar' },
  { name: '고등 1', stem: 'high_level_1' },
  { name: '고등 2', stem: 'high_level_2' }
];

const formatToday = () => new Intl.DateTimeFormat('ko-KR', {
  year: 'numeric', month: 'long', day: 'numeric', weekday: 'long'
}).format(new Date());

function Dashboard({ students, grades, consultations, master, onNavigate, onBackup }) {
  const brandName = master?.brandName || 'EduTrack English';
  const gradeTypes = master?.gradeTypes;
  const enrolledCount = students.filter(s => s.status === '재원').length;
  const waitingCount = students.filter(s => s.status === '상담').length;

  const studentName = (id) => students.find(s => s.id === id)?.name || '(삭제된 학생)';

  // 이탈 조기경보: 재원생 중 성적 하락 추세/급락 신호가 있는 학생
  const attentionStudents = useMemo(
    () => detectAttentionStudents(students, grades, gradeTypes),
    [students, grades, gradeTypes]
  );

  // 재시험 대상: 통과 기준 미만 성적 (신입 레벨테스트는 재시험 개념이 아니므로 제외)
  const retestTargets = useMemo(() => (
    grades
      .filter(g => typeof g.score === 'number' && g.score < PASS_THRESHOLD && g.type !== 'level_test')
      .sort((a, b) => String(b.date || '').localeCompare(String(a.date || '')))
      .slice(0, 6)
  ), [grades]);

  // 최근 활동: 성적 입력 + 상담지 작성을 일자순으로 병합
  const recentActivities = useMemo(() => {
    const nameOf = (id) => students.find(s => s.id === id)?.name || '(삭제된 학생)';
    const gradeItems = grades.map(g => ({
      key: `g_${g.id}`,
      date: String(g.date || ''),
      name: nameOf(g.studentId),
      label: `${gradeTypeLabel(g.type, gradeTypes)} ${g.score}점`
    }));
    const consultItems = consultations.map(c => ({
      key: `c_${c.id}`,
      date: String(c.consultationDate || ''),
      name: c.studentName || '학생',
      label: '레벨테스트 상담지 작성'
    }));
    return [...gradeItems, ...consultItems]
      .sort((a, b) => b.date.localeCompare(a.date))
      .slice(0, 5);
  }, [grades, consultations, students, gradeTypes]);

  const metrics = [
    { label: '정식 재원생', value: enrolledCount, unit: '명', tab: 'students' },
    { label: '상담 대기생', value: waitingCount, unit: '명', tab: 'students' },
    { label: '누적 레벨테스트 상담', value: consultations.length, unit: '건', tab: 'consultations' },
    { label: '누적 성적 데이터', value: grades.length, unit: '개', tab: 'grades' }
  ];

  return (
    <div>
      <div className="content-header">
        <div className="header-title-wrapper">
          <h1>학습 현황 종합 대시보드</h1>
          <p>{brandName} 원생들의 전체 학업 요약을 확인합니다.</p>
        </div>
        <div className="header-actions">
          <button className="btn btn-primary" onClick={onBackup}>로컬 데이터 전체 백업</button>
        </div>
      </div>

      {/* 한 줄 명판: 날짜 · 데이터 저장 위치 (중요 정보라 상시 노출 유지) */}
      <div className="dash-nameplate">
        <span>{formatToday()}</span>
        <span>데이터 저장 위치: <strong>{RUN_MODE.label} · {BROWSER_LABEL} 브라우저</strong></span>
      </div>

      {/* 지표 스트립: 각 칸 클릭 시 해당 탭으로 이동 */}
      <div className="metric-strip">
        {metrics.map(m => (
          <button key={m.label} type="button" className="metric-cell" onClick={() => onNavigate(m.tab)}>
            <span className="metric-label">{m.label}</span>
            <span className="metric-value">{m.value}<span className="metric-unit">{m.unit}</span></span>
          </button>
        ))}
      </div>

      {/* 이탈 조기경보: 추세 경고가 있을 때만 맨 위에 강조 노출 */}
      {attentionStudents.length > 0 && (
        <div className="card alert-card">
          <h3>⚠ 주의가 필요한 학생 ({attentionStudents.length}명)</h3>
          <p style={{ fontSize: '12.5px', color: 'var(--text-color-secondary)', marginBottom: '8px' }}>
            최근 성적이 하락 추세이거나 급락한 재원생입니다. 점수가 낮지 않아도 흐름이 꺾이면 먼저 챙겨야 합니다.
          </p>
          <ul className="dash-list">
            {attentionStudents.map(a => (
              <li key={a.studentId} className="dash-list-item">
                <span className="dash-item-main">
                  <span className="dash-item-name">{a.name}</span>
                  <span>{a.reasons.join(' · ')}</span>
                </span>
              </li>
            ))}
          </ul>
          <div className="dash-widget-footer">
            <button type="button" className="dash-link-btn" onClick={() => onNavigate('grades')}>
              성적 탭에서 확인하기 →
            </button>
          </div>
        </div>
      )}

      {/* 2단 위젯: 재시험 대상 / 최근 활동 */}
      <div className="dash-columns">
        <div className="card">
          <h3>재시험 대상 ({PASS_THRESHOLD}점 미만)</h3>
          {retestTargets.length === 0 ? (
            <p className="dash-empty">현재 재시험 대상 성적이 없습니다.</p>
          ) : (
            <ul className="dash-list">
              {retestTargets.map(g => (
                <li key={g.id} className="dash-list-item">
                  <span className="dash-item-main">
                    <span className="dash-item-name">{studentName(g.studentId)}</span>
                    <span>{gradeTypeLabel(g.type, gradeTypes)}</span>
                  </span>
                  <span>
                    <span className="dash-score-low">{g.score}점</span>
                    <span className="dash-item-date"> · {g.date}</span>
                  </span>
                </li>
              ))}
            </ul>
          )}
          <div className="dash-widget-footer">
            <button type="button" className="dash-link-btn" onClick={() => onNavigate('grades')}>
              성적 탭에서 처리하기 →
            </button>
          </div>
        </div>

        <div className="card">
          <h3>최근 입력 활동</h3>
          {recentActivities.length === 0 ? (
            <p className="dash-empty">아직 입력된 활동이 없습니다. 첫 학생을 등록해 보세요.</p>
          ) : (
            <ul className="dash-list">
              {recentActivities.map(item => (
                <li key={item.key} className="dash-list-item">
                  <span className="dash-item-main">
                    <span className="dash-item-name">{item.name}</span>
                    <span>{item.label}</span>
                  </span>
                  <span className="dash-item-date">{item.date}</span>
                </li>
              ))}
            </ul>
          )}
          <div className="dash-widget-footer">
            <button type="button" className="dash-link-btn" onClick={() => onNavigate('consultations')}>
              첫 레벨 테스트 상담 작성하기 →
            </button>
          </div>
        </div>
      </div>

      {/* 평가 자료실 */}
      <div className="card">
        <h3 style={{ marginBottom: '12px' }}>{brandName} 평가 자료실</h3>
        <p style={{ fontSize: '13.5px', color: 'var(--text-color-secondary)', marginBottom: '16px' }}>
          아래에서 각 평가지를 바로 열어 <strong>출력 및 PDF 저장</strong>하여 실무에 사용하실 수 있습니다.
          (상대 경로로 파일이 연동되어 로컬 구동 및 깃허브 Pages에서 즉시 다운로드 가능합니다. 단일 <code>index.html</code> 배포 시에는 <code>level_test/</code> 폴더를 같은 위치에 함께 복사해야 합니다.)
        </p>
        <table className="table" style={{ fontSize: '12.5px', margin: 0 }}>
          <thead>
            <tr>
              <th>신입생 레벨테스트 (7종)</th>
              <th>학생용 PDF</th>
            </tr>
          </thead>
          <tbody>
            {LEVEL_TEST_PDFS.map(t => (
              <tr key={t.stem}>
                <td style={{ fontWeight: '500' }}>{t.name}</td>
                <td>
                  <a href={`./level_test/${t.stem}_student.pdf`} target="_blank" rel="noopener noreferrer" style={{ color: 'var(--primary-accent)', textDecoration: 'none', fontWeight: 'bold' }}>PDF 열기</a>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* 데이터 안전 안내 (접이식) */}
      <details className="dash-details">
        <summary>초심자 가이드 · 데이터 안전 안내 (저장 위치와 백업)</summary>
        <div className="dash-details-body">
          <p>
            데이터는 <strong>지금 이 실행 방식과 브라우저 안에만</strong> 저장됩니다. 더블클릭 실행 ↔ start_edutrack 실행 ↔ 웹주소 접속을 서로 바꾸거나,
            Chrome ↔ Edge를 바꾸면 <strong>기존 데이터가 보이지 않습니다</strong> (사라진 것이 아니라 저장 위치가 다른 것입니다).
            한 가지 방식을 정해 계속 사용하시고, 방식을 바꿀 때는 반드시 <strong>[백업] → 새 방식에서 [복원]</strong> 절차를 거치세요.
          </p>
          <p>
            본 프로그램은 <strong>단독 로컬형 웹 어플리케이션</strong>입니다. 입력하신 데이터는 학원 외부 서버가 아닌
            <strong> 강사님의 컴퓨터 브라우저 내부(LocalStorage)</strong>에 보관됩니다.
            브라우저 인터넷 캐시를 완전 삭제할 경우 데이터가 사라질 수 있으므로, 주기적으로 상단의
            <strong> [로컬 데이터 전체 백업]</strong> 버튼으로 백업 파일(<code>.json</code>)을 PC에 보관해 주세요.
            컴퓨터를 옮기거나 데이터를 합칠 때는 <strong>[설정 탭]</strong>의 백업 파일 불러오기로 언제든 복원됩니다.
          </p>
          <p>
            백업 파일에는 학생·학부모 연락처 등 <strong>개인정보가 포함</strong>되므로 메신저/메일 전송 시 취급에 주의해 주세요.
          </p>
        </div>
      </details>
    </div>
  );
}

export default Dashboard;
