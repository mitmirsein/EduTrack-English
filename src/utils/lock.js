// === 실행 잠금 (4자리 PIN) ===
// 학원 공용 PC에서 잠깐 자리를 비울 때 학생·학부모 정보가 노출되는 것을 막는
// "가벼운 접근 차단" 장치다. 데이터 자체는 암호화하지 않으므로, 개발자 도구를
// 아는 사람의 접근까지 막지는 못한다 (한계를 설정 화면과 README에 고지할 것).
// PIN 해시는 백업 JSON에 포함하지 않는다 (API Key와 동일 정책 — AGENTS.md 규칙 4).

const LOCK_KEY = 'edutrack_lock';
const PBKDF2_ITERATIONS = 150000;

export const getLockSettings = () => {
  try {
    const raw = localStorage.getItem(LOCK_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object' || !parsed.hash || !parsed.salt) return null;
    return parsed;
  } catch {
    return null;
  }
};

const saveLockSettings = (settings) => {
  try {
    localStorage.setItem(LOCK_KEY, JSON.stringify(settings));
    return true;
  } catch {
    return false;
  }
};

const randomSalt = () => {
  if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
    return Array.from(crypto.getRandomValues(new Uint8Array(16)), b => b.toString(16).padStart(2, '0')).join('');
  }
  return `${Date.now().toString(16)}${Math.random().toString(16).slice(2)}`;
};

// PBKDF2-SHA256 (브라우저 내장 Web Crypto). crypto.subtle이 없는 비보안 컨텍스트에서는
// 반복 djb2 해시로 폴백한다 — 4자리 PIN은 어차피 억지 차단용이므로 허용 가능한 강도.
const hashPin = async (pin, salt) => {
  if (typeof crypto !== 'undefined' && crypto.subtle) {
    const enc = new TextEncoder();
    const keyMaterial = await crypto.subtle.importKey('raw', enc.encode(pin), 'PBKDF2', false, ['deriveBits']);
    const bits = await crypto.subtle.deriveBits(
      { name: 'PBKDF2', hash: 'SHA-256', salt: enc.encode(salt), iterations: PBKDF2_ITERATIONS },
      keyMaterial,
      256
    );
    return Array.from(new Uint8Array(bits), b => b.toString(16).padStart(2, '0')).join('');
  }
  let h1 = 5381;
  let h2 = 52711;
  const input = `${salt}:${pin}`;
  for (let round = 0; round < 1000; round++) {
    for (let i = 0; i < input.length; i++) {
      const c = input.charCodeAt(i);
      h1 = ((h1 * 33) ^ c) >>> 0;
      h2 = ((h2 * 31) + c) >>> 0;
    }
  }
  return `fb_${h1.toString(16)}_${h2.toString(16)}`;
};

export const isValidPin = (pin) => /^\d{4}$/.test(pin);

export const enableLock = async (pin, autoLockMinutes = 10) => {
  if (!isValidPin(pin)) return false;
  const salt = randomSalt();
  const hash = await hashPin(pin, salt);
  return saveLockSettings({ enabled: true, salt, hash, autoLockMinutes });
};

export const verifyPin = async (pin) => {
  const settings = getLockSettings();
  if (!settings) return true;
  const hash = await hashPin(pin, settings.salt);
  return hash === settings.hash;
};

export const disableLock = () => {
  try {
    localStorage.removeItem(LOCK_KEY);
    return true;
  } catch {
    return false;
  }
};

export const updateAutoLock = (minutes) => {
  const settings = getLockSettings();
  if (!settings) return false;
  return saveLockSettings({ ...settings, autoLockMinutes: minutes });
};
