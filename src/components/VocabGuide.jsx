import { useState } from 'react';
import { generateLLMVocabGuide } from '../utils/storage';

// 단어 해설(Voca Guide). 강사가 단어를 입력하면 어원 기반 친근한 해설을 LLM으로 생성하고,
// 단어별로 저장(LocalStorage)해 재열람·재인쇄·다운로드한다. 어원/의미 확장은 단어마다
// 달라 LLM 전용이며, 설정 탭의 API Key가 필요하다.
function VocabGuide({ vocab, onChange, apiSettings, genId, showAlert, renderMarkdown, onPrint }) {
  const [word, setWord] = useState('');
  const [context, setContext] = useState('');
  const [busy, setBusy] = useState(false);
  const [selectedId, setSelectedId] = useState(null);

  const hasKey = !!apiSettings.apiKey;
  const selected = vocab.find(v => v.id === selectedId) || null;

  const generate = async (e) => {
    e.preventDefault();
    const w = word.trim();
    if (!w) return showAlert('단어를 입력해 주세요.', 'danger');
    if (!hasKey) return showAlert('설정 탭에서 API Key를 먼저 등록해 주세요.', 'danger');

    setBusy(true);
    try {
      const markdown = await generateLLMVocabGuide(w, context.trim(), apiSettings);
      const entry = { id: genId('voc'), word: w, markdown, createdAt: new Date().toISOString().slice(0, 10) };
      onChange([entry, ...vocab]);
      setSelectedId(entry.id);
      setWord('');
      setContext('');
      showAlert(`'${w}' 단어 해설이 생성되었습니다.`);
    } catch (err) {
      showAlert(err.message || '단어 해설 생성에 실패했습니다.', 'danger');
    } finally {
      setBusy(false);
    }
  };

  const remove = (v) => {
    if (!window.confirm(`'${v.word}' 단어 해설을 삭제할까요?`)) return;
    onChange(vocab.filter(x => x.id !== v.id));
    if (selectedId === v.id) setSelectedId(null);
  };

  // 단어 해설을 .md 파일로 다운로드 (강사가 wordbank/ 폴더에 모을 수 있게)
  const download = (v) => {
    const safe = v.word.replace(/[^\w가-힣-]+/g, '_');
    const blob = new Blob([`# ${v.word}\n\n${v.markdown}\n`], { type: 'text/markdown;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${safe}.md`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  return (
    <div>
      <div className="content-header">
        <div className="header-title-wrapper">
          <h1>단어 해설</h1>
          <p>단어를 입력하면 어원 분석 기반의 친근한 해설이 생성됩니다. 단어별로 저장·인쇄하고 <code>.md</code>로 내려받아 wordbank 폴더에 모을 수 있습니다.</p>
        </div>
      </div>

      {!hasKey && (
        <div className="notice-banner">
          단어 해설은 AI로 생성되므로 <strong>설정 탭에서 Gemini 또는 OpenAI API Key를 먼저 등록</strong>해 주세요. (어원·의미 확장은 단어마다 달라 AI 생성이 필요합니다.)
        </div>
      )}

      <div className="admin-master-detail">
        {/* 생성 폼 + 목록 */}
        <div className="card">
          <h3>단어 해설 생성</h3>
          <form onSubmit={generate}>
            <div className="form-group">
              <label>단어</label>
              <input className="form-control" value={word} onChange={e => setWord(e.target.value)} placeholder="예: enormously" disabled={busy} />
            </div>
            <div className="form-group">
              <label>학습 맥락 (선택 — 예문 난이도 참고)</label>
              <input className="form-control" value={context} onChange={e => setContext(e.target.value)} placeholder="예: 고등 영어1 YBM Lesson 1" disabled={busy} />
            </div>
            <button type="submit" className="btn btn-primary" style={{ width: '100%' }} disabled={busy || !hasKey}>
              {busy ? 'AI 생성 중…' : '해설 생성'}
            </button>
          </form>

          <h3 style={{ marginTop: '20px', borderTop: '1px solid var(--border-color)', paddingTop: '16px' }}>저장된 단어 ({vocab.length}개)</h3>
          {vocab.length === 0 ? (
            <p className="dash-empty">아직 생성된 단어 해설이 없습니다.</p>
          ) : (
            <ul className="admin-list">
              {vocab.map(v => (
                <li key={v.id} className={`admin-list-item selectable ${selectedId === v.id ? 'active' : ''}`} onClick={() => setSelectedId(v.id)}>
                  <span><strong>{v.word}</strong><span className="admin-chapter-count">{v.createdAt}</span></span>
                  <span className="admin-row-actions">
                    <button type="button" className="dash-link-btn" onClick={(e) => { e.stopPropagation(); download(v); }}>.md</button>
                    <button type="button" className="dash-link-btn danger" onClick={(e) => { e.stopPropagation(); remove(v); }}>삭제</button>
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* 해설 표시 */}
        <div className="card">
          {!selected ? (
            <p className="dash-empty">왼쪽에서 단어를 선택하거나 새로 생성하면 해설이 여기 표시됩니다.</p>
          ) : (
            <>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', flexWrap: 'wrap', gap: '8px', marginBottom: '8px' }}>
                <h3 style={{ fontSize: '20px' }}>{selected.word}</h3>
                <div style={{ display: 'flex', gap: '8px' }}>
                  <button type="button" className="btn btn-secondary" style={{ padding: '6px 12px', fontSize: '12.5px' }} onClick={() => download(selected)}>.md 다운로드</button>
                  <button type="button" className="btn btn-primary" style={{ padding: '6px 12px', fontSize: '12.5px' }} onClick={() => onPrint(selected.id)}>인쇄 / PDF</button>
                </div>
              </div>
              <div className="vocab-content">
                {renderMarkdown(selected.markdown)}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

export default VocabGuide;
