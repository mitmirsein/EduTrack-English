import { useState } from 'react';
import { putLectureFile, deleteLectureFile, openLectureFile } from '../utils/lectureFiles';
import { AREA_CODES, areaLabel } from '../utils/appMeta';

// 교안 자료실: eng-lecture가 발행한 교안(PDF)·퀴즈(HTML) 파일을 EduTrack 안에서
// 코스·레벨 카테고리로 분류해 등록·열람·삭제한다. 파일 바이너리는 IndexedDB,
// 목록 메타데이터는 LocalStorage(props lectures/onChange)로 관리한다.
const LEVELS = ['초급', '중급', '고급'];
const ACCEPT = '.pdf,.html,.htm';
const MAX_MB = 20;

function LectureLibrary({ lectures, onChange, master, genId, showAlert }) {
  const [form, setForm] = useState({ title: '', course: '', level: '중급', areas: [], file: null });
  const [busy, setBusy] = useState(false);
  const [filter, setFilter] = useState({ course: 'all', level: 'all' });

  const resetForm = () => setForm({ title: '', course: '', level: '중급', areas: [], file: null });

  const toggleArea = (code) => setForm(f => ({
    ...f,
    areas: f.areas.includes(code) ? f.areas.filter(a => a !== code) : [...f.areas, code]
  }));

  const submit = async (e) => {
    e.preventDefault();
    const title = form.title.trim();
    if (!title) return showAlert('교안 제목을 입력해주세요.', 'danger');
    if (!form.file) return showAlert('등록할 파일을 선택해주세요.', 'danger');
    if (form.file.size > MAX_MB * 1024 * 1024) return showAlert(`파일이 너무 큽니다(최대 ${MAX_MB}MB).`, 'danger');

    const lower = form.file.name.toLowerCase();
    const fileType = lower.endsWith('.pdf') ? 'pdf' : (lower.endsWith('.html') || lower.endsWith('.htm') ? 'html' : null);
    if (!fileType) return showAlert('PDF 또는 HTML 파일만 등록할 수 있습니다.', 'danger');

    const id = genId('lec');
    setBusy(true);
    try {
      await putLectureFile(id, form.file);
    } catch (err) {
      setBusy(false);
      return showAlert(err.message || '파일 보관에 실패했습니다.', 'danger');
    }
    setBusy(false);

    const meta = {
      id,
      title,
      course: form.course.trim(),
      level: form.level,
      areas: form.areas,
      fileName: form.file.name,
      fileType,
      addedAt: new Date().toISOString().slice(0, 10)
    };
    onChange([meta, ...lectures]);
    resetForm();
    // file input 초기화
    const fileInput = document.getElementById('lecture-file-input');
    if (fileInput) fileInput.value = '';
    showAlert('교안이 등록되었습니다.');
  };

  const open = async (lec) => {
    try {
      await openLectureFile(lec.id);
    } catch (err) {
      showAlert(err.message || '파일을 여는 중 오류가 발생했습니다.', 'danger');
    }
  };

  const remove = async (lec) => {
    if (!window.confirm(`교안 '${lec.title}'을(를) 삭제할까요? 등록된 파일도 함께 삭제됩니다.`)) return;
    try {
      await deleteLectureFile(lec.id);
    } catch { /* 파일 삭제 실패해도 목록에서는 제거한다 */ }
    onChange(lectures.filter(l => l.id !== lec.id));
    showAlert('교안이 삭제되었습니다.', 'warning');
  };

  const courseNames = master.courses.map(c => c.name);
  const visible = lectures.filter(l =>
    (filter.course === 'all' || l.course === filter.course) &&
    (filter.level === 'all' || l.level === filter.level)
  );

  return (
    <div>
      <div className="content-header">
        <div className="header-title-wrapper">
          <h1>교안 자료실</h1>
          <p>eng-lecture로 발행한 수업 교안(PDF)과 퀴즈(HTML)를 코스·레벨별로 등록해 관리합니다.</p>
        </div>
      </div>

      <div className="admin-master-detail">
        {/* 등록 폼 */}
        <div className="card">
          <h3>교안 등록</h3>
          <form onSubmit={submit}>
            <div className="form-group">
              <label>교안 제목</label>
              <input className="form-control" value={form.title} onChange={e => setForm({ ...form, title: e.target.value })} placeholder="예: 수능특강 영어 Unit 3 독해 분석" />
            </div>
            <div className="form-row">
              <div className="form-group">
                <label>코스</label>
                <input className="form-control" list="course-options" value={form.course} onChange={e => setForm({ ...form, course: e.target.value })} placeholder="과정 선택 또는 직접 입력" />
                {courseNames.length === 0 && (
                  <span style={{ fontSize: '11px', color: 'var(--text-color-light)' }}>관리(기준정보) 탭에서 과정을 등록하면 목록에 표시됩니다.</span>
                )}
              </div>
              <div className="form-group">
                <label>레벨</label>
                <select className="form-control" value={form.level} onChange={e => setForm({ ...form, level: e.target.value })}>
                  {LEVELS.map(l => <option key={l} value={l}>{l}</option>)}
                </select>
              </div>
            </div>
            <div className="form-group">
              <label>강화 영역 (선택, 약점 학생에게 추천됩니다)</label>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                {AREA_CODES.map(code => (
                  <button key={code} type="button"
                    className={`btn btn-secondary`}
                    style={{ fontSize: '12px', padding: '5px 12px', ...(form.areas.includes(code) ? { backgroundColor: 'var(--primary-accent)', color: '#fff', borderColor: 'var(--primary-accent)' } : {}) }}
                    onClick={() => toggleArea(code)}>
                    {areaLabel(code)}
                  </button>
                ))}
              </div>
            </div>
            <div className="form-group">
              <label>파일 (PDF 또는 HTML, 최대 {MAX_MB}MB)</label>
              <input id="lecture-file-input" className="form-control" type="file" accept={ACCEPT}
                onChange={e => setForm({ ...form, file: e.target.files[0] || null })} />
            </div>
            <button type="submit" className="btn btn-primary" style={{ width: '100%' }} disabled={busy}>
              {busy ? '등록 중…' : '교안 등록'}
            </button>
          </form>
        </div>

        {/* 등록 목록 */}
        <div className="card">
          <h3>등록된 교안 ({lectures.length}개)</h3>
          <div className="form-row" style={{ marginBottom: '12px' }}>
            <div className="form-group">
              <label>코스 필터</label>
              <select className="form-control" value={filter.course} onChange={e => setFilter({ ...filter, course: e.target.value })}>
                <option value="all">전체</option>
                {[...new Set(lectures.map(l => l.course).filter(Boolean))].map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
            <div className="form-group">
              <label>레벨 필터</label>
              <select className="form-control" value={filter.level} onChange={e => setFilter({ ...filter, level: e.target.value })}>
                <option value="all">전체</option>
                {LEVELS.map(l => <option key={l} value={l}>{l}</option>)}
              </select>
            </div>
          </div>

          {visible.length === 0 ? (
            <p className="dash-empty">{lectures.length === 0 ? '등록된 교안이 없습니다. 왼쪽에서 첫 교안을 등록해 보세요.' : '선택한 조건에 맞는 교안이 없습니다.'}</p>
          ) : (
            <ul className="admin-list">
              {visible.map(lec => (
                <li key={lec.id} className="admin-list-item">
                  <span style={{ minWidth: 0 }}>
                    <strong>{lec.title}</strong>
                    <span className="admin-tag">{lec.course || '코스 미지정'}</span>
                    <span className="admin-tag">{lec.level}</span>
                    <span className="admin-tag">{lec.fileType.toUpperCase()}</span>
                    {(lec.areas || []).map(a => <span key={a} className="admin-tag">{areaLabel(a)}</span>)}
                    <div style={{ fontSize: '11px', color: 'var(--text-color-light)', marginTop: '2px' }}>{lec.fileName} · {lec.addedAt}</div>
                  </span>
                  <span className="admin-row-actions">
                    <button type="button" className="dash-link-btn" onClick={() => open(lec)}>열기</button>
                    <button type="button" className="dash-link-btn danger" onClick={() => remove(lec)}>삭제</button>
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}

export default LectureLibrary;
