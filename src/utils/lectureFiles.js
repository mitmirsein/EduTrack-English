// === 교안 파일 보관소 (IndexedDB) ===
// 교안 PDF/퀴즈 HTML은 용량이 커서 LocalStorage(전체 5~10MB)에 부적합하다.
// 파일 바이너리는 IndexedDB에 Blob으로 저장하고, 목록 메타데이터(제목·코스·레벨)는
// LocalStorage(edutrack_lectures)에서 따로 관리한다.
// 새 npm 패키지 없이 브라우저 내장 IndexedDB만 사용한다.

const DB_NAME = 'edutrack';
const STORE = 'lectureFiles';
const DB_VERSION = 1;

let dbPromise = null;

const openDB = () => {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      reject(new Error('이 브라우저는 파일 보관(IndexedDB)을 지원하지 않습니다.'));
      return;
    }
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE);
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error || new Error('파일 보관소를 열지 못했습니다.'));
  });
  return dbPromise;
};

const tx = async (mode, fn) => {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const t = db.transaction(STORE, mode);
    const store = t.objectStore(STORE);
    const req = fn(store);
    t.oncomplete = () => resolve(req?.result);
    t.onerror = () => reject(t.error || new Error('파일 보관소 작업에 실패했습니다.'));
    t.onabort = () => reject(t.error || new Error('파일 보관소 작업이 중단되었습니다.'));
  });
};

// id 키로 교안 파일(Blob) 저장
export const putLectureFile = (id, blob) => tx('readwrite', (store) => store.put(blob, id));

// id 키로 교안 파일(Blob) 조회 (없으면 undefined)
export const getLectureFile = (id) => tx('readonly', (store) => store.get(id));

// id 키로 교안 파일 삭제
export const deleteLectureFile = (id) => tx('readwrite', (store) => store.delete(id));

// 교안 파일을 새 탭으로 연다. 보관된 Blob을 objectURL로 만들어 열고 잠시 후 해제한다.
// (즉시 revoke하면 빈 화면이 되므로 60초 후 정리)
export const openLectureFile = async (id) => {
  const blob = await getLectureFile(id);
  if (!blob) throw new Error('저장된 파일을 찾을 수 없습니다. 다시 등록해 주세요.');
  const url = URL.createObjectURL(blob);
  window.open(url, '_blank', 'noopener,noreferrer');
  setTimeout(() => URL.revokeObjectURL(url), 60000);
};
