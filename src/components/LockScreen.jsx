import { useState, useEffect, useRef } from 'react';
import { verifyPin } from '../utils/lock';

// 실행 잠금 화면. 잠금이 활성화된 동안 메인 UI 대신 렌더링되어
// 학생 데이터가 화면에 마운트되는 것 자체를 막는다.
function LockScreen({ onUnlock, brandName = 'EduTrack English' }) {
  const [pin, setPin] = useState('');
  const [error, setError] = useState('');
  const [checking, setChecking] = useState(false);
  const inputRef = useRef(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const handleChange = async (e) => {
    const next = e.target.value.replace(/\D/g, '').slice(0, 4);
    setPin(next);
    setError('');
    if (next.length === 4) {
      setChecking(true);
      const ok = await verifyPin(next);
      setChecking(false);
      if (ok) {
        onUnlock();
      } else {
        setPin('');
        setError('PIN이 일치하지 않습니다. 다시 입력해 주세요.');
        inputRef.current?.focus();
      }
    }
  };

  return (
    <div className="lock-screen">
      <div className="lock-panel">
        <div className="lock-brand">{brandName}</div>
        <div className="lock-title">잠금 해제</div>
        <p className="lock-desc">학생 정보 보호를 위해 잠겨 있습니다.<br />4자리 PIN을 입력하세요.</p>
        <input
          ref={inputRef}
          className="lock-pin-input"
          type="password"
          inputMode="numeric"
          autoComplete="off"
          aria-label="4자리 PIN 입력"
          value={pin}
          onChange={handleChange}
          disabled={checking}
        />
        <div className="lock-error" role="alert">{error}</div>
      </div>
    </div>
  );
}

export default LockScreen;
