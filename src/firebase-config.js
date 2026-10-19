/**
 * Firebase 클라우드 DB 설정 모듈
 * 
 * GitHub Pages와 같은 정적 호스팅 환경에서도 팀원 간의 비밀번호 잠금 및 확인 상태를
 * 실시간으로 안전하게 동기화하기 위한 설정입니다.
 * 
 * 방법 1: 아래 DEFAULT_FIREBASE_CONFIG 객체에 Firebase 콘솔의 설정을 직접 입력
 * 방법 2: 사이트 우측 상단의 [☁️ DB 연동] 버튼을 눌러 웹 브라우저에서 직접 붙여넣기 (로컬 저장)
 */

export const DEFAULT_FIREBASE_CONFIG = {
  apiKey: "",
  authDomain: "",
  projectId: "",
  storageBucket: "",
  messagingSenderId: "",
  appId: ""
};

const STORAGE_KEY = 'manito_firebase_config_v1';

/**
 * 활성화된 Firebase 설정 가져오기 (로컬 저장소 우선, 없으면 기본값)
 */
export function getActiveFirebaseConfig() {
  try {
    if (typeof localStorage !== 'undefined') {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (parsed && parsed.projectId && parsed.apiKey) {
          return { config: parsed, source: 'localStorage' };
        }
      }
    }
  } catch (e) {
    console.warn('Failed to parse stored firebase config:', e);
  }

  if (DEFAULT_FIREBASE_CONFIG.projectId && DEFAULT_FIREBASE_CONFIG.apiKey) {
    return { config: DEFAULT_FIREBASE_CONFIG, source: 'code' };
  }

  return { config: null, source: 'none' };
}

/**
 * 브라우저 저장소에 Firebase 설정 저장
 */
export function setStoredFirebaseConfig(config) {
  if (typeof localStorage === 'undefined') return;
  if (!config) {
    localStorage.removeItem(STORAGE_KEY);
  } else {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(config));
  }
}

/**
 * 텍스트(JSON 또는 JS snippet)에서 firebaseConfig 파싱 헬퍼
 */
export function parseFirebaseConfigInput(text) {
  if (!text || typeof text !== 'string') return null;

  // 1. 순수 JSON 파싱 시도
  try {
    const parsed = JSON.parse(text.trim());
    if (parsed.projectId && parsed.apiKey) return parsed;
  } catch (e) {}

  // 2. JS const firebaseConfig = { ... } 형태 파싱
  try {
    const cleaned = text
      .replace(/const\s+firebaseConfig\s*=\s*/i, '')
      .replace(/var\s+firebaseConfig\s*=\s*/i, '')
      .replace(/let\s+firebaseConfig\s*=\s*/i, '')
      .replace(/;\s*$/, '')
      .trim();

    // 키값에 따옴표가 없는 JS 객체 리터럴 처리
    const jsonStr = cleaned
      .replace(/([{,]\s*)([a-zA-Z0-9_]+)\s*:/g, '$1"$2":')
      .replace(/'/g, '"')
      .replace(/,\s*([}\]])/g, '$1');

    const parsed = JSON.parse(jsonStr);
    if (parsed.projectId && parsed.apiKey) return parsed;
  } catch (e) {}

  // 3. 정규식 추출 fallback
  const apiKeyMatch = text.match(/apiKey\s*:\s*["']([^"']+)["']/);
  const projectIdMatch = text.match(/projectId\s*:\s*["']([^"']+)["']/);
  const authDomainMatch = text.match(/authDomain\s*:\s*["']([^"']+)["']/);
  const appIdMatch = text.match(/appId\s*:\s*["']([^"']+)["']/);
  const storageBucketMatch = text.match(/storageBucket\s*:\s*["']([^"']+)["']/);
  const messagingSenderIdMatch = text.match(/messagingSenderId\s*:\s*["']([^"']+)["']/);

  if (apiKeyMatch && projectIdMatch) {
    return {
      apiKey: apiKeyMatch[1],
      projectId: projectIdMatch[1],
      authDomain: authDomainMatch ? authDomainMatch[1] : `${projectIdMatch[1]}.firebaseapp.com`,
      appId: appIdMatch ? appIdMatch[1] : '',
      storageBucket: storageBucketMatch ? storageBucketMatch[1] : `${projectIdMatch[1]}.appspot.com`,
      messagingSenderId: messagingSenderIdMatch ? messagingSenderIdMatch[1] : ''
    };
  }

  return null;
}
