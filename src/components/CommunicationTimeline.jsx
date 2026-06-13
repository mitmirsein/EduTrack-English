import { useMemo } from 'react';

// 학부모 소통 타임라인. 학생에게 나간 공식 문서(레벨테스트 상담지, 분기 리포트)를
// 시간순으로 모아 보여주고, 마지막 소통 후 오래 지났으면 환기한다.
// (카톡 피드백은 현재 저장되지 않으므로 타임라인에 포함하지 않는다.)
const REMIND_DAYS = 60;

const daysSince = (dateStr) => {
  if (!dateStr) return null;
  const d = new Date(dateStr);
  if (Number.isNaN(d.getTime())) return null;
  return Math.floor((Date.now() - d.getTime()) / 86400000);
};

function CommunicationTimeline({ studentId, consultations, quarterlyReports }) {
  const events = useMemo(() => {
    const fromConsult = consultations
      .filter(c => c.studentId === studentId)
      .map(c => ({ key: `c_${c.id}`, date: String(c.consultationDate || ''), type: '레벨테스트 상담지', detail: '' }));
    const fromReports = quarterlyReports
      .filter(r => r.studentId === studentId)
      .map(r => ({ key: `r_${r.id}`, date: String(r.createdAt || ''), type: '분기 리포트', detail: r.period || '' }));
    return [...fromConsult, ...fromReports]
      .filter(e => e.date)
      .sort((a, b) => b.date.localeCompare(a.date));
  }, [studentId, consultations, quarterlyReports]);

  const lastDays = events.length > 0 ? daysSince(events[0].date) : null;
  const overdue = lastDays != null && lastDays >= REMIND_DAYS;

  return (
    <div style={{ marginTop: '20px', borderTop: '1px solid var(--border-color)', paddingTop: '16px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', flexWrap: 'wrap', gap: '8px', marginBottom: '8px' }}>
        <h4 style={{ fontSize: '13.5px', color: 'var(--primary-accent)', fontWeight: 'bold' }}>학부모 소통 타임라인</h4>
        {events.length > 0 && (
          <span style={{ fontSize: '12px', fontWeight: 700, color: overdue ? 'var(--danger-color)' : 'var(--text-color-secondary)' }}>
            마지막 소통 {lastDays}일 전{overdue ? ` · ${REMIND_DAYS}일 이상 경과, 소통 권장` : ''}
          </span>
        )}
      </div>

      {events.length === 0 ? (
        <p style={{ fontSize: '12.5px', color: 'var(--text-color-light)', fontStyle: 'italic' }}>
          아직 학부모에게 발송된 상담지·리포트 이력이 없습니다.
        </p>
      ) : (
        <ul className="dash-list">
          {events.map(e => (
            <li key={e.key} className="dash-list-item">
              <span className="dash-item-main">
                <span className="dash-item-name">{e.type}</span>
                {e.detail && <span>{e.detail}</span>}
              </span>
              <span className="dash-item-date">{e.date}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export default CommunicationTimeline;
