/**
 * 마니또 클라우드 DB 연동 모듈 (Firebase Firestore 기반)
 * 
 * 기능:
 * 1. 단체방 링크(#/room) 접속 시 모든 팀원의 비밀번호 등록(잠금) 및 확인 상태 실시간 동기화
 * 2. 한 팀원이 4자리 비밀번호를 등록하면 다른 모든 참가자의 기기에서 즉시 해당 이름이 '잠김(🔒)' 상태로 전환
 * 3. 다른 사람이 열람하려 할 때 클라우드 DB의 암호화 해시와 대조하여 본인만 열람 허용
 * 4. 주최자 대시보드(#/share)에서 전체 팀원의 확인 현황 실시간 모니터링
 * 5. DB 미설정 시 로컬 모드로 부드럽게 fallback 처리
 */

import { initializeApp, getApps, getApp } from 'firebase/app';
import { 
  getFirestore, 
  doc, 
  getDoc, 
  setDoc, 
  updateDoc, 
  onSnapshot, 
  serverTimestamp 
} from 'firebase/firestore';
import { 
  getActiveFirebaseConfig, 
  setStoredFirebaseConfig, 
  parseFirebaseConfigInput 
} from './firebase-config.js';
import { hashPin, setLocalMemberPinHash } from './crypto.js';

let firestoreInstance = null;
let currentAppInstance = null;
let activeConfigInfo = { config: null, source: 'none' };

/**
 * 룸 토큰으로부터 안전한 24자리 고유 Document ID 생성
 */
export function getRoomDocId(roomToken) {
  if (!roomToken) return 'default_room';
  let hash1 = 0;
  let hash2 = 5381;
  for (let i = 0; i < roomToken.length; i++) {
    const char = roomToken.charCodeAt(i);
    hash1 = ((hash1 << 5) - hash1) + char;
    hash1 |= 0;
    hash2 = ((hash2 << 5) + hash2) + char;
    hash2 |= 0;
  }
  const part1 = Math.abs(hash1).toString(36).padStart(8, '0');
  const part2 = Math.abs(hash2).toString(36).padStart(8, '0');
  const len = roomToken.length.toString(36);
  return `room_${part1}_${part2}_${len}`;
}

/**
 * DB 초기화
 */
export function initDatabase(explicitConfig = null) {
  try {
    if (explicitConfig) {
      activeConfigInfo = { config: explicitConfig, source: 'explicit' };
    } else {
      activeConfigInfo = getActiveFirebaseConfig();
    }

    if (!activeConfigInfo.config) {
      firestoreInstance = null;
      return { isReady: false, reason: 'NO_CONFIG' };
    }

    const cfg = activeConfigInfo.config;
    const appName = 'manito-firebase-app';

    const existingApps = getApps();
    const foundApp = existingApps.find(a => a.name === appName || a.name === '[DEFAULT]');

    if (foundApp) {
      currentAppInstance = foundApp;
    } else {
      currentAppInstance = initializeApp(cfg, appName);
    }

    firestoreInstance = getFirestore(currentAppInstance);
    return { 
      isReady: true, 
      projectId: cfg.projectId,
      source: activeConfigInfo.source
    };
  } catch (err) {
    console.error('Firebase DB initialization failed:', err);
    firestoreInstance = null;
    return { isReady: false, error: err.message };
  }
}

/**
 * DB 연결 여부 확인
 */
export function isDbConnected() {
  return firestoreInstance !== null;
}

/**
 * 현재 활성화된 DB 프로젝트 정보 반환
 */
export function getDbInfo() {
  return {
    isConnected: isDbConnected(),
    projectId: activeConfigInfo.config?.projectId || null,
    source: activeConfigInfo.source
  };
}

/**
 * DB 연결 해제
 */
export function disconnectDb() {
  setStoredFirebaseConfig(null);
  activeConfigInfo = { config: null, source: 'none' };
  firestoreInstance = null;
  currentAppInstance = null;
}

/**
 * 특정 방의 실시간 상태 구독 (onSnapshot)
 * @param {string} roomToken
 * @param {Object} inspectedBundle { roomTitle, deadline, members: [{ name, hasPin }] }
 * @param {Function} onUpdate (roomData) => void
 * @param {Function} onError (err) => void
 * @returns {Function} unsubscribe
 */
export function subscribeRoom(roomToken, inspectedBundle, onUpdate, onError) {
  if (!isDbConnected()) {
    // DB 미연결 시 즉시 로컬 정보 기반 콜백
    if (onUpdate) {
      onUpdate(null);
    }
    return () => {};
  }

  const roomId = getRoomDocId(roomToken);
  const docRef = doc(firestoreInstance, 'rooms', roomId);

  let isFirstLoad = true;

  const unsubscribe = onSnapshot(docRef, async (docSnap) => {
    try {
      if (!docSnap.exists()) {
        // 첫 방문 시 초기 문서 자동 생성
        const membersMap = {};
        if (inspectedBundle && inspectedBundle.members) {
          inspectedBundle.members.forEach(m => {
            membersMap[m.name] = {
              isClaimed: !!m.hasPin,
              isViewed: false,
              pinHash: '',
              claimedAt: null,
              viewedAt: null
            };
          });
        }

        const initialData = {
          title: inspectedBundle?.roomTitle || '우리팀 시크릿 마니또',
          deadline: inspectedBundle?.deadline || '',
          members: membersMap,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp()
        };

        await setDoc(docRef, initialData, { merge: true });
        if (onUpdate) onUpdate(initialData);
        return;
      }

      const data = docSnap.data();
      if (onUpdate) onUpdate(data);
      isFirstLoad = false;
    } catch (err) {
      console.warn('Firestore room snapshot error:', err);
      if (onError) onError(err);
    }
  }, (err) => {
    console.warn('Firestore subscription failed:', err);
    if (onError) onError(err);
  });

  return unsubscribe;
}

/**
 * 팀원이 본인 4자리 비밀번호를 등록(잠금)
 */
export async function claimMemberPin(roomToken, memberName, pin) {
  const cleanPin = (pin || '').trim();
  const roomId = getRoomDocId(roomToken);
  const pinHash = hashPin(memberName, cleanPin, roomId);

  // 로컬 브라우저에도 항상 동기화 저장
  setLocalMemberPinHash(roomToken, memberName, cleanPin);

  if (!isDbConnected()) {
    return { success: true, localOnly: true, pinHash };
  }

  try {
    const docRef = doc(firestoreInstance, 'rooms', roomId);
    const snap = await getDoc(docRef);

    if (snap.exists()) {
      const data = snap.data();
      const existingMember = data.members?.[memberName];

      // 이미 다른 곳에서 먼저 등록된 경우 방지
      if (existingMember && existingMember.isClaimed && existingMember.pinHash && existingMember.pinHash !== pinHash) {
        return { 
          success: false, 
          error: `이미 [${memberName}] 님의 비밀번호가 등록되어 있습니다. 본인이 맞다면 비밀번호로 잠금을 해제하세요.` 
        };
      }
    }

    const nowIso = new Date().toISOString();
    await updateDoc(docRef, {
      [`members.${memberName}.isClaimed`]: true,
      [`members.${memberName}.pinHash`]: pinHash,
      [`members.${memberName}.claimedAt`]: nowIso,
      updatedAt: serverTimestamp()
    });

    return { success: true, pinHash };
  } catch (err) {
    console.error('Failed to claim member PIN in DB:', err);
    // DB 실패 시에도 로컬에 저장되었으므로 진행 허용
    return { success: true, localFallback: true, pinHash, warning: err.message };
  }
}

/**
 * 팀원의 비밀번호 검증 (클라우드 DB 해시와 비교)
 */
export async function verifyMemberPinWithDb(roomToken, memberName, inputPin, liveRoomData = null) {
  const cleanPin = (inputPin || '').trim();
  const roomId = getRoomDocId(roomToken);
  const expectedInputHash = hashPin(memberName, cleanPin, roomId);

  let targetHash = '';

  // 1. 이미 실시간 구독 중인 데이터가 있으면 활용
  if (liveRoomData && liveRoomData.members?.[memberName]?.pinHash) {
    targetHash = liveRoomData.members[memberName].pinHash;
  } else if (isDbConnected()) {
    // 2. DB에서 최신 데이터 직접 조회
    try {
      const docRef = doc(firestoreInstance, 'rooms', roomId);
      const snap = await getDoc(docRef);
      if (snap.exists()) {
        const mem = snap.data().members?.[memberName];
        if (mem && mem.pinHash) {
          targetHash = mem.pinHash;
        }
      }
    } catch (e) {
      console.warn('DB verify fetch error:', e);
    }
  }

  // 3. DB에 해시가 있으면 DB 해시로 검증
  if (targetHash) {
    const isValid = (expectedInputHash === targetHash);
    return {
      isValid,
      isClaimed: true,
      error: isValid ? null : '비밀번호가 일치하지 않습니다. 다시 확인해주세요.'
    };
  }

  // 4. DB에 해시가 없으면 로컬 스토리지 확인
  const localHash = localStorage.getItem(`manito_pin_hash_${roomToken}_${memberName}`);
  if (localHash) {
    const isValid = (expectedInputHash === localHash);
    return {
      isValid,
      isClaimed: true,
      error: isValid ? null : '비밀번호가 일치하지 않습니다. 다시 확인해주세요.'
    };
  }

  // 아직 아무도 잠그지 않은 경우
  return {
    isValid: true,
    isClaimed: false
  };
}

/**
 * 마니또 결과를 확인(열람) 완료 상태로 갱신
 */
export async function markMemberViewed(roomToken, memberName) {
  if (!isDbConnected() || !roomToken || !memberName) return;

  try {
    const roomId = getRoomDocId(roomToken);
    const docRef = doc(firestoreInstance, 'rooms', roomId);
    const nowIso = new Date().toISOString();

    await updateDoc(docRef, {
      [`members.${memberName}.isViewed`]: true,
      [`members.${memberName}.viewedAt`]: nowIso,
      updatedAt: serverTimestamp()
    });
  } catch (err) {
    console.warn('Failed to mark member as viewed in DB:', err);
  }
}

/**
 * Firebase 설정 테스트 (연결 테스트용)
 */
export async function testFirebaseConnection(config) {
  try {
    const tempAppName = 'test-conn-' + Date.now();
    const app = initializeApp(config, tempAppName);
    const db = getFirestore(app);

    // 연결 테스트용 ping doc 조회
    const testDoc = doc(db, '_connection_test', 'ping');
    await getDoc(testDoc);

    return { success: true };
  } catch (err) {
    return { success: false, error: err.message };
  }
}
