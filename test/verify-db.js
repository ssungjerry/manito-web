import { parseFirebaseConfigInput } from '../src/firebase-config.js';
import { getRoomDocId, initDatabase, isDbConnected } from '../src/db.js';

console.log('🧪 [DB 검증 시작] Firebase 파서 및 DB 유틸 검증...');

// 1. JS snippet 파싱 검증
const jsSnippet = `
const firebaseConfig = {
  apiKey: "AIzaSyTest123",
  authDomain: "manito-test.firebaseapp.com",
  projectId: "manito-test",
  storageBucket: "manito-test.appspot.com",
  messagingSenderId: "123456789",
  appId: "1:123456789:web:abcdef"
};
`;
const parsedJs = parseFirebaseConfigInput(jsSnippet);
if (!parsedJs || parsedJs.projectId !== 'manito-test' || parsedJs.apiKey !== 'AIzaSyTest123') {
  throw new Error('[오류] JS snippet 파싱 실패: ' + JSON.stringify(parsedJs));
}
console.log('✅ 1. Firebase JS snippet 파싱 성공');

// 2. JSON 파싱 검증
const jsonSnippet = JSON.stringify({
  apiKey: "AIzaSyJsonKey",
  projectId: "manito-json-proj"
});
const parsedJson = parseFirebaseConfigInput(jsonSnippet);
if (!parsedJson || parsedJson.projectId !== 'manito-json-proj') {
  throw new Error('[오류] JSON 파싱 실패');
}
console.log('✅ 2. Firebase JSON 파싱 성공');

// 3. Room Document ID 일관성 검증
const tokenA = 'sample_room_token_abc_123';
const id1 = getRoomDocId(tokenA);
const id2 = getRoomDocId(tokenA);
if (id1 !== id2 || !id1.startsWith('room_')) {
  throw new Error('[오류] Room Doc ID 생성 실패: ' + id1);
}
console.log('✅ 3. Room Document ID 일관성 검증 성공:', id1);

// 4. 초기 DB 상태 (설정 미제공 시 graceful fallback)
const initRes = initDatabase(null);
if (initRes.isReady !== false) {
  throw new Error('[오류] 설정 없는 경우 미연결이어야 함');
}
console.log('✅ 4. DB 미설정 시 로컬 모드 Fallback 검증 성공');

console.log('\n🎉 [DB 검증 완료] 모든 DB 모듈 테스트 통과!');
