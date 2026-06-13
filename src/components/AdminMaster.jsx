import { useState } from 'react';

// 기준정보(마스터 데이터) 관리 페이지.
// 학교/학년/과정/교재·챕터를 강사가 직접 등록·수정·삭제하고, 모든 입력 폼이
// 이 목록을 드롭다운 source로 사용한다. 데이터는 props(master)로 받고,
// 변경은 onChange(nextMaster)로 상위(App)에 위임해 LocalStorage 영속을 일원화한다.
//
// usageCounts: 삭제 안전장치용. { schools: {name: n}, textbooks: {name: n}, courses: {name: n} }
function AdminMaster({ master, onChange, genId, usageCounts, onBackup }) {
  const [subTab, setSubTab] = useState('schools');

  const subTabs = [
    { key: 'schools', label: '학교' },
    { key: 'grades', label: '학년' },
    { key: 'courses', label: '과정(반)' },
    { key: 'textbooks', label: '교재·챕터' },
    { key: 'gradeTypes', label: '성적 유형' }
  ];

  return (
    <div>
      <div className="content-header">
        <div className="header-title-wrapper">
          <h1>관리 (기준정보)</h1>
          <p>학교·학년·과정·교재를 한 곳에서 관리합니다. 여기 등록한 항목이 학생 등록·상담·리포트 입력의 선택 목록이 됩니다.</p>
        </div>
        <div className="header-actions">
          <button className="btn btn-secondary" onClick={onBackup}>전체 백업</button>
        </div>
      </div>

      <div className="admin-subtabs">
        {subTabs.map(t => (
          <button
            key={t.key}
            type="button"
            className={`admin-subtab ${subTab === t.key ? 'active' : ''}`}
            onClick={() => setSubTab(t.key)}
          >
            {t.label}
          </button>
        ))}
      </div>

      {subTab === 'schools' && (
        <SchoolPanel master={master} onChange={onChange} genId={genId} usageCounts={usageCounts} />
      )}
      {subTab === 'grades' && (
        <GradePanel master={master} onChange={onChange} />
      )}
      {subTab === 'courses' && (
        <CoursePanel master={master} onChange={onChange} genId={genId} usageCounts={usageCounts} />
      )}
      {subTab === 'textbooks' && (
        <TextbookPanel master={master} onChange={onChange} genId={genId} usageCounts={usageCounts} />
      )}
      {subTab === 'gradeTypes' && (
        <GradeTypePanel master={master} onChange={onChange} genId={genId} usageCounts={usageCounts} />
      )}
    </div>
  );
}

// ── 성적 유형 ──────────────────────────────────────────
// key가 'level_test'/'achievement_test'인 시드 유형은 오답 마킹·약점 진단과 연동된다.
// 강사가 추가하는 유형은 임의 key의 점수형(특수 동작 없음)으로 동작한다.
const LINKED_KEYS = ['level_test', 'achievement_test'];

function GradeTypePanel({ master, onChange, genId, usageCounts }) {
  const [label, setLabel] = useState('');

  const add = (e) => {
    e.preventDefault();
    const v = label.trim();
    if (!v || master.gradeTypes.some(t => t.label === v)) { setLabel(''); return; }
    const gt = { id: genId('gt'), key: genId('gtk'), label: v };
    onChange({ ...master, gradeTypes: [...master.gradeTypes, gt] });
    setLabel('');
  };

  const remove = (gt) => {
    const used = (usageCounts.gradeTypes && usageCounts.gradeTypes[gt.key]) || 0;
    const linkedNote = LINKED_KEYS.includes(gt.key)
      ? '\n\n이 유형은 오답 마킹·약점 진단과 연동됩니다. 삭제하면 해당 기능의 성적 입력 경로가 사라집니다.'
      : '';
    const usedNote = used > 0
      ? `이 유형으로 입력된 성적이 ${used}건 있습니다. 목록에서 지워도 기존 성적은 남지만 '기타 평가'로 표시됩니다.`
      : `'${gt.label}' 유형을 삭제할까요?`;
    if (!window.confirm(usedNote + linkedNote)) return;
    onChange({ ...master, gradeTypes: master.gradeTypes.filter(t => t.id !== gt.id) });
  };

  const rename = (gt) => {
    const next = window.prompt('성적 유형 이름 변경', gt.label);
    if (next == null) return;
    const v = next.trim();
    if (!v) return;
    onChange({ ...master, gradeTypes: master.gradeTypes.map(t => t.id === gt.id ? { ...t, label: v } : t) });
  };

  return (
    <div className="admin-master-detail">
      <div className="card">
        <h3>성적 유형 ({master.gradeTypes.length}개)</h3>
        <p style={{ fontSize: '12.5px', color: 'var(--text-color-secondary)', marginBottom: '8px' }}>
          성적 입력 화면의 "시험 종류" 목록입니다. 추이 차트·이탈 경보는 유형과 무관하게 시간순으로 반영됩니다.
        </p>
        <ul className="admin-list">
          {master.gradeTypes.map(gt => (
            <li key={gt.id} className="admin-list-item">
              <span>
                <strong>{gt.label}</strong>
                {LINKED_KEYS.includes(gt.key) && <span className="admin-tag">약점 진단 연동</span>}
              </span>
              <span className="admin-row-actions">
                <button type="button" className="dash-link-btn" onClick={() => rename(gt)}>이름변경</button>
                <button type="button" className="dash-link-btn danger" onClick={() => remove(gt)}>삭제</button>
              </span>
            </li>
          ))}
          {master.gradeTypes.length === 0 && <li className="dash-empty">등록된 성적 유형이 없습니다.</li>}
        </ul>
      </div>
      <div className="card">
        <h3>성적 유형 추가</h3>
        <p style={{ fontSize: '12px', color: 'var(--text-color-light)', marginBottom: '12px' }}>
          여기서 추가하는 유형은 점수만 기록하는 일반 유형입니다(오답 마킹·약점 진단은 신입 레벨/정기 성취도 전용).
        </p>
        <form onSubmit={add}>
          <div className="form-group">
            <label>유형 이름</label>
            <input className="form-control" value={label} onChange={e => setLabel(e.target.value)} placeholder="예: 데일리 단어 테스트, 주간 종합 평가" />
          </div>
          <button type="submit" className="btn btn-primary" style={{ width: '100%' }}>추가</button>
        </form>
      </div>
    </div>
  );
}

// ── 학교 ──────────────────────────────────────────────
function SchoolPanel({ master, onChange, genId, usageCounts }) {
  const [form, setForm] = useState({ name: '', level: '중' });
  const [editingId, setEditingId] = useState(null);

  const submit = (e) => {
    e.preventDefault();
    const name = form.name.trim();
    if (!name) return;
    let schools;
    if (editingId) {
      schools = master.schools.map(s => s.id === editingId ? { ...s, name, level: form.level } : s);
    } else {
      if (master.schools.some(s => s.name === name)) { setForm({ name: '', level: form.level }); return; }
      schools = [...master.schools, { id: genId('sch'), name, level: form.level }];
    }
    onChange({ ...master, schools });
    setForm({ name: '', level: '중' });
    setEditingId(null);
  };

  const remove = (s) => {
    const used = (usageCounts.schools && usageCounts.schools[s.name]) || 0;
    const msg = used > 0
      ? `'${s.name}'을(를) 사용 중인 학생이 ${used}명 있습니다. 목록에서 지워도 기존 학생의 학교 표기는 그대로 유지됩니다. 삭제할까요?`
      : `'${s.name}'을(를) 목록에서 삭제할까요?`;
    if (!window.confirm(msg)) return;
    onChange({ ...master, schools: master.schools.filter(x => x.id !== s.id) });
    if (editingId === s.id) { setForm({ name: '', level: '중' }); setEditingId(null); }
  };

  return (
    <div className="admin-master-detail">
      <div className="card">
        <h3>학교 목록 ({master.schools.length}개)</h3>
        <ul className="admin-list">
          {master.schools.map(s => (
            <li key={s.id} className="admin-list-item">
              <span><strong>{s.name}</strong> <span className="admin-tag">{s.level}</span></span>
              <span className="admin-row-actions">
                <button type="button" className="dash-link-btn" onClick={() => { setForm({ name: s.name, level: s.level || '중' }); setEditingId(s.id); }}>수정</button>
                <button type="button" className="dash-link-btn danger" onClick={() => remove(s)}>삭제</button>
              </span>
            </li>
          ))}
          {master.schools.length === 0 && <li className="dash-empty">등록된 학교가 없습니다.</li>}
        </ul>
      </div>
      <div className="card">
        <h3>{editingId ? '학교 수정' : '학교 추가'}</h3>
        <form onSubmit={submit}>
          <div className="form-group">
            <label>학교명</label>
            <input className="form-control" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} placeholder="예: 수지중" />
          </div>
          <div className="form-group">
            <label>구분</label>
            <select className="form-control" value={form.level} onChange={e => setForm({ ...form, level: e.target.value })}>
              <option value="초">초등학교</option>
              <option value="중">중학교</option>
              <option value="고">고등학교</option>
            </select>
          </div>
          <div style={{ display: 'flex', gap: '8px' }}>
            <button type="submit" className="btn btn-primary" style={{ flexGrow: 1 }}>{editingId ? '수정 저장' : '추가'}</button>
            {editingId && <button type="button" className="btn btn-secondary" onClick={() => { setForm({ name: '', level: '중' }); setEditingId(null); }}>취소</button>}
          </div>
        </form>
      </div>
    </div>
  );
}

// ── 학년 (순서 있는 단순 문자열 목록) ─────────────────────
function GradePanel({ master, onChange }) {
  const [name, setName] = useState('');

  const add = (e) => {
    e.preventDefault();
    const v = name.trim();
    if (!v || master.grades.includes(v)) { setName(''); return; }
    onChange({ ...master, grades: [...master.grades, v] });
    setName('');
  };
  const remove = (g) => {
    if (!window.confirm(`학년 '${g}'을(를) 삭제할까요? 기존 학생/기록의 학년 표기는 유지됩니다.`)) return;
    onChange({ ...master, grades: master.grades.filter(x => x !== g) });
  };
  const move = (idx, dir) => {
    const next = [...master.grades];
    const j = idx + dir;
    if (j < 0 || j >= next.length) return;
    [next[idx], next[j]] = [next[j], next[idx]];
    onChange({ ...master, grades: next });
  };

  return (
    <div className="admin-master-detail">
      <div className="card">
        <h3>학년 목록 ({master.grades.length}개)</h3>
        <p style={{ fontSize: '12.5px', color: 'var(--text-color-secondary)', marginBottom: '8px' }}>목록 순서가 학생 등록·상담 폼의 드롭다운 순서가 됩니다.</p>
        <ul className="admin-list">
          {master.grades.map((g, idx) => (
            <li key={g} className="admin-list-item">
              <span><strong>{g}</strong></span>
              <span className="admin-row-actions">
                <button type="button" className="dash-link-btn" onClick={() => move(idx, -1)} disabled={idx === 0}>↑</button>
                <button type="button" className="dash-link-btn" onClick={() => move(idx, 1)} disabled={idx === master.grades.length - 1}>↓</button>
                <button type="button" className="dash-link-btn danger" onClick={() => remove(g)}>삭제</button>
              </span>
            </li>
          ))}
          {master.grades.length === 0 && <li className="dash-empty">등록된 학년이 없습니다.</li>}
        </ul>
      </div>
      <div className="card">
        <h3>학년 추가</h3>
        <form onSubmit={add}>
          <div className="form-group">
            <label>학년명</label>
            <input className="form-control" value={name} onChange={e => setName(e.target.value)} placeholder="예: 중1, 고2, 초등" />
          </div>
          <button type="submit" className="btn btn-primary" style={{ width: '100%' }}>추가</button>
        </form>
      </div>
    </div>
  );
}

// ── 과정(정규 반) ─────────────────────────────────────
function CoursePanel({ master, onChange, genId, usageCounts }) {
  const [form, setForm] = useState({ name: '', stage: '중' });
  const [editingId, setEditingId] = useState(null);

  const submit = (e) => {
    e.preventDefault();
    const name = form.name.trim();
    if (!name) return;
    let courses;
    if (editingId) {
      courses = master.courses.map(c => c.id === editingId ? { ...c, name, stage: form.stage } : c);
    } else {
      if (master.courses.some(c => c.name === name)) { setForm({ name: '', stage: form.stage }); return; }
      courses = [...master.courses, { id: genId('crs'), name, stage: form.stage }];
    }
    onChange({ ...master, courses });
    setForm({ name: '', stage: '중' });
    setEditingId(null);
  };
  const remove = (c) => {
    const used = (usageCounts.courses && usageCounts.courses[c.name]) || 0;
    const msg = used > 0
      ? `'${c.name}' 과정을 사용 중인 상담 기록이 ${used}건 있습니다. 목록에서 지워도 기존 기록 표기는 유지됩니다. 삭제할까요?`
      : `'${c.name}' 과정을 삭제할까요?`;
    if (!window.confirm(msg)) return;
    onChange({ ...master, courses: master.courses.filter(x => x.id !== c.id) });
    if (editingId === c.id) { setForm({ name: '', stage: '중' }); setEditingId(null); }
  };

  return (
    <div className="admin-master-detail">
      <div className="card">
        <h3>과정(반) 목록 ({master.courses.length}개)</h3>
        <ul className="admin-list">
          {master.courses.map(c => (
            <li key={c.id} className="admin-list-item">
              <span><strong>{c.name}</strong> <span className="admin-tag">{c.stage}</span></span>
              <span className="admin-row-actions">
                <button type="button" className="dash-link-btn" onClick={() => { setForm({ name: c.name, stage: c.stage || '중' }); setEditingId(c.id); }}>수정</button>
                <button type="button" className="dash-link-btn danger" onClick={() => remove(c)}>삭제</button>
              </span>
            </li>
          ))}
          {master.courses.length === 0 && <li className="dash-empty">등록된 과정이 없습니다. 예: "중등 중급반", "고등 구문 독해반"</li>}
        </ul>
      </div>
      <div className="card">
        <h3>{editingId ? '과정 수정' : '과정 추가'}</h3>
        <form onSubmit={submit}>
          <div className="form-group">
            <label>과정(반) 이름</label>
            <input className="form-control" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} placeholder="예: 중등 중급반" />
          </div>
          <div className="form-group">
            <label>대상 단계</label>
            <select className="form-control" value={form.stage} onChange={e => setForm({ ...form, stage: e.target.value })}>
              <option value="초">초등</option>
              <option value="중">중등</option>
              <option value="고">고등</option>
            </select>
          </div>
          <div style={{ display: 'flex', gap: '8px' }}>
            <button type="submit" className="btn btn-primary" style={{ flexGrow: 1 }}>{editingId ? '수정 저장' : '추가'}</button>
            {editingId && <button type="button" className="btn btn-secondary" onClick={() => { setForm({ name: '', stage: '중' }); setEditingId(null); }}>취소</button>}
          </div>
        </form>
      </div>
    </div>
  );
}

// ── 교재 · 챕터 (마스터-디테일) ────────────────────────
function TextbookPanel({ master, onChange, genId, usageCounts }) {
  const [selectedId, setSelectedId] = useState(null);
  const [form, setForm] = useState({ name: '', publisher: '', courseId: '' });
  const [chapterInput, setChapterInput] = useState('');

  const selected = master.textbooks.find(t => t.id === selectedId) || null;

  const addTextbook = (e) => {
    e.preventDefault();
    const name = form.name.trim();
    if (!name) return;
    if (master.textbooks.some(t => t.name === name)) { setForm({ name: '', publisher: '', courseId: '' }); return; }
    const tb = { id: genId('txb'), name, publisher: form.publisher.trim(), courseId: form.courseId, chapters: [] };
    onChange({ ...master, textbooks: [...master.textbooks, tb] });
    setForm({ name: '', publisher: '', courseId: '' });
    setSelectedId(tb.id);
  };

  const updateSelected = (patch) => {
    onChange({ ...master, textbooks: master.textbooks.map(t => t.id === selectedId ? { ...t, ...patch } : t) });
  };

  const removeTextbook = (tb) => {
    const used = (usageCounts.textbooks && usageCounts.textbooks[tb.name]) || 0;
    const msg = used > 0
      ? `'${tb.name}'을(를) 사용 중인 상담·리포트 기록이 ${used}건 있습니다. 목록에서 지워도 기존 기록 표기는 유지됩니다. 삭제할까요?`
      : `'${tb.name}'을(를) 삭제할까요?`;
    if (!window.confirm(msg)) return;
    onChange({ ...master, textbooks: master.textbooks.filter(t => t.id !== tb.id) });
    if (selectedId === tb.id) setSelectedId(null);
  };

  const addChapter = (e) => {
    e.preventDefault();
    const v = chapterInput.trim();
    if (!v || !selected) return;
    if (selected.chapters.includes(v)) { setChapterInput(''); return; }
    updateSelected({ chapters: [...selected.chapters, v] });
    setChapterInput('');
  };
  const removeChapter = (ch) => updateSelected({ chapters: selected.chapters.filter(c => c !== ch) });
  const moveChapter = (idx, dir) => {
    const next = [...selected.chapters];
    const j = idx + dir;
    if (j < 0 || j >= next.length) return;
    [next[idx], next[j]] = [next[j], next[idx]];
    updateSelected({ chapters: next });
  };

  const courseName = (id) => master.courses.find(c => c.id === id)?.name || '';

  return (
    <div className="admin-master-detail">
      <div className="card">
        <h3>교재 목록 ({master.textbooks.length}개)</h3>
        <ul className="admin-list">
          {master.textbooks.map(t => (
            <li key={t.id} className={`admin-list-item selectable ${selectedId === t.id ? 'active' : ''}`} onClick={() => setSelectedId(t.id)}>
              <span>
                <strong>{t.name}</strong>
                {t.publisher && <span className="admin-tag">{t.publisher}</span>}
                <span className="admin-chapter-count">챕터 {t.chapters.length}</span>
              </span>
              <button type="button" className="dash-link-btn danger" onClick={(e) => { e.stopPropagation(); removeTextbook(t); }}>삭제</button>
            </li>
          ))}
          {master.textbooks.length === 0 && <li className="dash-empty">등록된 교재가 없습니다.</li>}
        </ul>

        <form onSubmit={addTextbook} style={{ marginTop: '16px', borderTop: '1px solid var(--border-color)', paddingTop: '16px' }}>
          <div className="form-group">
            <label>새 교재명</label>
            <input className="form-control" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} placeholder="예: 천일문 기본" />
          </div>
          <div className="form-row">
            <div className="form-group">
              <label>출판사 (선택)</label>
              <input className="form-control" value={form.publisher} onChange={e => setForm({ ...form, publisher: e.target.value })} placeholder="예: 쎄듀" />
            </div>
            <div className="form-group">
              <label>소속 과정 (선택)</label>
              <select className="form-control" value={form.courseId} onChange={e => setForm({ ...form, courseId: e.target.value })}>
                <option value="">미지정</option>
                {master.courses.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>
          </div>
          <button type="submit" className="btn btn-primary" style={{ width: '100%' }}>교재 추가</button>
        </form>
      </div>

      <div className="card">
        {!selected ? (
          <p className="dash-empty">왼쪽에서 교재를 선택하면 챕터를 관리할 수 있습니다.</p>
        ) : (
          <>
            <h3>{selected.name} — 챕터 ({selected.chapters.length}개)</h3>
            <div className="form-row" style={{ marginBottom: '12px' }}>
              <div className="form-group">
                <label>출판사</label>
                <input className="form-control" value={selected.publisher || ''} onChange={e => updateSelected({ publisher: e.target.value })} />
              </div>
              <div className="form-group">
                <label>소속 과정</label>
                <select className="form-control" value={selected.courseId || ''} onChange={e => updateSelected({ courseId: e.target.value })}>
                  <option value="">미지정</option>
                  {master.courses.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </div>
            </div>
            {selected.courseId && <p style={{ fontSize: '12px', color: 'var(--text-color-light)', marginBottom: '8px' }}>소속 과정: {courseName(selected.courseId)}</p>}

            <ul className="admin-list">
              {selected.chapters.map((ch, idx) => (
                <li key={ch} className="admin-list-item">
                  <span>{ch}</span>
                  <span className="admin-row-actions">
                    <button type="button" className="dash-link-btn" onClick={() => moveChapter(idx, -1)} disabled={idx === 0}>↑</button>
                    <button type="button" className="dash-link-btn" onClick={() => moveChapter(idx, 1)} disabled={idx === selected.chapters.length - 1}>↓</button>
                    <button type="button" className="dash-link-btn danger" onClick={() => removeChapter(ch)}>삭제</button>
                  </span>
                </li>
              ))}
              {selected.chapters.length === 0 && <li className="dash-empty">등록된 챕터가 없습니다.</li>}
            </ul>
            <form onSubmit={addChapter} style={{ marginTop: '12px' }}>
              <div className="form-group">
                <label>챕터 추가</label>
                <input className="form-control" value={chapterInput} onChange={e => setChapterInput(e.target.value)} placeholder="예: Ch1. 문장의 형식" />
              </div>
              <button type="submit" className="btn btn-primary" style={{ width: '100%' }}>챕터 추가</button>
            </form>
          </>
        )}
      </div>
    </div>
  );
}

export default AdminMaster;
