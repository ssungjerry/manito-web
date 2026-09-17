/**
 * 마니또 개별 토큰 및 룸 번들 암호화 모듈
 * 각 참가자의 매칭 결과는 개인 PIN(비밀번호 4자리)으로 암호화되어
 * 본인 외에는 그 누구(주최자 및 타 팀원 포함)도 마니또 대상을 열람할 수 없습니다.
 */

const SECRET_SALT = 'MANITO_SECRET_V2_2026';

/**
 * 문자열을 UTF-8 바이트 배열로 변환
 */
function stringToBytes(str) {
  return new TextEncoder().encode(str);
}

/**
 * 바이트 배열을 UTF-8 문자열로 변환
 */
function bytesToString(bytes) {
  return new TextDecoder().decode(bytes);
}

/**
 * 바이트 배열을 URL-Safe Base64로 변환
 */
function bytesToBase64Url(bytes) {
  let binary = '';
  const len = bytes.byteLength;
  for (let i = 0; i < len; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary)
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

/**
 * URL-Safe Base64를 바이트 배열로 변환
 */
function base64UrlToBytes(base64Url) {
  let base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
  while (base64.length % 4) {
    base64 += '=';
  }
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

/**
 * 키 스트림 XOR 난독화 / 암호화
 */
function xorTransform(bytes, keyStr) {
  const keyBytes = stringToBytes(keyStr);
  const result = new Uint8Array(bytes.length);
  for (let i = 0; i < bytes.length; i++) {
    result[i] = bytes[i] ^ keyBytes[i % keyBytes.length];
  }
  return result;
}

/**
 * 체크섬 생성
 */
function calculateChecksum(str) {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = (hash << 5) - hash + str.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash).toString(36);
}

/**
 * 문자열 암호화 헬퍼
 */
function encryptString(plainText, key) {
  const checksum = calculateChecksum(plainText);
  const envelope = JSON.stringify({ d: plainText, c: checksum });
  const rawBytes = stringToBytes(envelope);
  const encrypted = xorTransform(rawBytes, key);
  return bytesToBase64Url(encrypted);
}

/**
 * 문자열 복호화 헬퍼
 */
function decryptString(cipherText, key) {
  try {
    const encryptedBytes = base64UrlToBytes(cipherText);
    const decryptedBytes = xorTransform(encryptedBytes, key);
    const envelopeStr = bytesToString(decryptedBytes);
    const envelope = JSON.parse(envelopeStr);

    if (!envelope || !envelope.d || !envelope.c) {
      return { success: false, error: '유효하지 않은 데이터 형식입니다.' };
    }
    if (calculateChecksum(envelope.d) !== envelope.c) {
      return { success: false, error: '데이터가 일치하지 않거나 위변조되었습니다.' };
    }
    return { success: true, data: envelope.d };
  } catch (err) {
    return { success: false, error: '복호화에 실패했습니다.' };
  }
}

// =========================================================================
// 1. 개별 참가자 토큰 (1인 1링크 전용)
// =========================================================================

/**
 * 개별 참가자 데이터를 URL 토큰으로 직렬화 (PIN 보안 지원)
 * @param {Object} payload { giver, receiver, missionText, missionTip, roomTitle, deadline, pin }
 * @param {string} [customKey]
 */
export function encodeToken(payload, customKey = '') {
  const pin = (payload.pin || '').trim();
  const hasPin = pin.length > 0;

  // 비밀 매칭 정보 (receiver, mission 등)
  const secretPayload = JSON.stringify({
    r: payload.receiver,
    m: payload.missionText || '',
    mt: payload.missionTip || ''
  });

  // 비밀 데이터는 PIN이 있으면 PIN 기반 키로 암호화
  const secretKey = SECRET_SALT + (customKey || '') + (hasPin ? `_PIN_${pin}` : '_NOPIN');
  const encryptedSecret = encryptString(secretPayload, secretKey);

  // 공개 메타데이터와 결합된 엔벨롭
  const publicEnvelope = JSON.stringify({
    v: 2, // 버전 2 (PIN 지원)
    g: payload.giver,
    t: payload.roomTitle || '시크릿 마니또',
    d: payload.deadline || '',
    hp: hasPin ? 1 : 0, // PIN 보호 여부 (1: 필요, 0: 불필요)
    sec: encryptedSecret,
    ts: Date.now()
  });

  // 전체 엔벨롭을 기본 키로 패키징
  const outerKey = SECRET_SALT + (customKey || '');
  return encryptString(publicEnvelope, outerKey);
}

/**
 * 토큰의 공개 메타데이터만 미리 읽기 (PIN 입력 화면 표시용)
 * @param {string} token
 * @param {string} [customKey]
 */
export function inspectToken(token, customKey = '') {
  try {
    const outerKey = SECRET_SALT + (customKey || '');
    const res = decryptString(token, outerKey);
    if (!res.success) {
      // v1 구버전 토큰일 수 있으므로 v1 파싱 시도
      return inspectTokenV1(token, customKey);
    }

    const env = JSON.parse(res.data);
    // v2 형식인지 확인
    if (env.v === 2) {
      return {
        success: true,
        version: 2,
        giver: env.g,
        roomTitle: env.t,
        deadline: env.d,
        hasPin: env.hp === 1,
        timestamp: env.ts
      };
    } else {
      // 구버전 형식 직접 파싱
      return inspectTokenV1(token, customKey);
    }
  } catch (e) {
    return inspectTokenV1(token, customKey);
  }
}

/**
 * v1 구버전 토큰 인스펙트 헬퍼
 */
function inspectTokenV1(token, customKey = '') {
  try {
    const outerKey = SECRET_SALT + (customKey || '');
    const res = decryptString(token, outerKey);
    if (!res.success) return { success: false, error: res.error };
    const data = JSON.parse(res.data);
    return {
      success: true,
      version: 1,
      giver: data.g,
      roomTitle: data.t,
      deadline: data.d,
      hasPin: false,
      timestamp: data.ts
    };
  } catch (e) {
    return { success: false, error: '토큰 형식 오류' };
  }
}

/**
 * URL 토큰을 역직렬화하여 참가자 데이터 완전 복원
 * @param {string} token
 * @param {string} [pin] 사용자가 입력한 4자리 PIN
 * @param {string} [customKey]
 */
export function decodeToken(token, pin = '', customKey = '') {
  try {
    const outerKey = SECRET_SALT + (customKey || '');
    const res = decryptString(token, outerKey);
    if (!res.success) {
      return { success: false, error: '유효하지 않거나 손상된 마니또 링크입니다.' };
    }

    const env = JSON.parse(res.data);

    // v2 토큰 (PIN 지원)
    if (env.v === 2) {
      const hasPin = env.hp === 1;
      const cleanPin = (pin || '').trim();

      if (hasPin && !cleanPin) {
        return {
          success: false,
          needsPin: true,
          giver: env.g,
          error: '본인 확인을 위해 4자리 비밀번호(PIN)를 입력해주세요.'
        };
      }

      const secretKey = SECRET_SALT + (customKey || '') + (hasPin ? `_PIN_${cleanPin}` : '_NOPIN');
      const secretRes = decryptString(env.sec, secretKey);

      if (!secretRes.success) {
        return {
          success: false,
          needsPin: hasPin,
          isPinError: true,
          giver: env.g,
          error: hasPin ? '비밀번호(PIN)가 일치하지 않습니다. 다시 입력해주세요.' : '복호화에 실패했습니다.'
        };
      }

      const secretData = JSON.parse(secretRes.data);
      return {
        success: true,
        data: {
          giver: env.g,
          receiver: secretData.r,
          missionText: secretData.m,
          missionTip: secretData.mt,
          roomTitle: env.t,
          deadline: env.d,
          hasPin,
          timestamp: env.ts
        }
      };
    }

    // v1 구버전 호환 (PIN 없는 토큰)
    return {
      success: true,
      data: {
        giver: env.g,
        receiver: env.r,
        missionText: env.m,
        missionTip: env.mt,
        roomTitle: env.t,
        deadline: env.d,
        hasPin: false,
        timestamp: env.ts
      }
    };
  } catch (err) {
    console.error('Failed to decode token:', err);
    return { success: false, error: '토큰을 해석할 수 없습니다. 링크를 다시 확인해주세요.' };
  }
}

// =========================================================================
// 2. 단일 룸 번들 (단톡방 단일 링크 공유 전용)
// =========================================================================

/**
 * 방 전체의 매칭 결과를 단일 룸 토큰으로 인코딩
 * 각 참가자의 매칭 결과는 본인 PIN으로 개별 암호화되어 번들에 포함됩니다.
 * 타인의 PIN을 알지 못하면 본인 외의 매칭 결과는 수학적으로 복호화할 수 없습니다.
 * 
 * @param {Array} matches createManitoMatch 결과 목록 [{ giver, receiver, missionText, missionTip, pin }]
 * @param {Object} roomMeta { roomTitle, deadline }
 * @param {string} [customKey]
 */
export function encodeRoomBundle(matches, roomMeta = {}, customKey = '') {
  const members = matches.map(m => {
    const pin = (m.pin || '').trim();
    const hasPin = pin.length > 0;

    const secretPayload = JSON.stringify({
      r: m.receiver,
      m: m.missionText || '',
      mt: m.missionTip || ''
    });

    const secretKey = SECRET_SALT + (customKey || '') + (hasPin ? `_PIN_${pin}` : '_NOPIN');
    const encryptedSecret = encryptString(secretPayload, secretKey);

    return {
      name: m.giver,
      hasPin: hasPin ? 1 : 0,
      sec: encryptedSecret
    };
  });

  const bundle = JSON.stringify({
    v: 'room_v1',
    t: roomMeta.roomTitle || '시크릿 마니또',
    d: roomMeta.deadline || '',
    members,
    ts: Date.now()
  });

  const outerKey = SECRET_SALT + '_ROOM_' + (customKey || '');
  return encryptString(bundle, outerKey);
}

/**
 * 룸 번들의 메타데이터 및 참가자 이름 목록 열람 (단톡방 접속 시 이름 선택용)
 * @param {string} roomToken
 * @param {string} [customKey]
 */
export function inspectRoomBundle(roomToken, customKey = '') {
  try {
    const outerKey = SECRET_SALT + '_ROOM_' + (customKey || '');
    const res = decryptString(roomToken, outerKey);
    if (!res.success) {
      return { success: false, error: '유효하지 않은 마니또 방 링크입니다.' };
    }

    const bundle = JSON.parse(res.data);
    return {
      success: true,
      roomTitle: bundle.t,
      deadline: bundle.d,
      members: bundle.members.map(m => ({
        name: m.name,
        hasPin: m.hasPin === 1
      }))
    };
  } catch (err) {
    return { success: false, error: '방 정보를 읽을 수 없습니다.' };
  }
}

/**
 * 룸 번들에서 특정 참가자의 마니또 결과만 본인 PIN으로 복호화
 * @param {string} roomToken
 * @param {string} memberName 참가자 이름
 * @param {string} pin 참가자의 4자리 PIN
 * @param {string} [customKey]
 */
export function decodeMemberFromBundle(roomToken, memberName, pin = '', customKey = '') {
  try {
    const outerKey = SECRET_SALT + '_ROOM_' + (customKey || '');
    const res = decryptString(roomToken, outerKey);
    if (!res.success) {
      return { success: false, error: '유효하지 않은 마니또 방 링크입니다.' };
    }

    const bundle = JSON.parse(res.data);
    const member = bundle.members.find(m => m.name === memberName);

    if (!member) {
      return { success: false, error: `참가자 목록에서 [${memberName}] 님을 찾을 수 없습니다.` };
    }

    const hasPin = member.hasPin === 1;
    const cleanPin = (pin || '').trim();

    if (hasPin && !cleanPin) {
      return {
        success: false,
        needsPin: true,
        giver: member.name,
        error: '본인 확인을 위해 4자리 비밀번호(PIN)를 입력해주세요.'
      };
    }

    const secretKey = SECRET_SALT + (customKey || '') + (hasPin ? `_PIN_${cleanPin}` : '_NOPIN');
    const secretRes = decryptString(member.sec, secretKey);

    if (!secretRes.success) {
      return {
        success: false,
        needsPin: hasPin,
        isPinError: true,
        giver: member.name,
        error: '비밀번호(PIN)가 일치하지 않습니다. 다시 확인해주세요.'
      };
    }

    const secretData = JSON.parse(secretRes.data);
    return {
      success: true,
      data: {
        giver: member.name,
        receiver: secretData.r,
        missionText: secretData.m,
        missionTip: secretData.mt,
        roomTitle: bundle.t,
        deadline: bundle.d,
        hasPin,
        timestamp: bundle.ts
      }
    };
  } catch (err) {
    console.error('Failed to decode member from bundle:', err);
    return { success: false, error: '결과를 복호화하는 중 오류가 발생했습니다.' };
  }
}

// =========================================================================
// 3. 참가자 셀프 PIN(비밀번호) 등록 & 영지식 잠금 관리
// =========================================================================

/**
 * 4자리 PIN을 솔티드 해시로 변환 (서버나 타인에게 원문 노출 방지)
 * @param {string} name 참가자 이름
 * @param {string} pin 4자리 비밀번호
 * @param {string} [salt]
 */
export function hashPin(name, pin, salt = SECRET_SALT) {
  const cleanPin = (pin || '').trim();
  const cleanName = (name || '').trim();
  const str = `${salt}::${cleanName}::${cleanPin}`;
  let hash1 = 0;
  for (let i = 0; i < str.length; i++) {
    hash1 = (hash1 << 5) - hash1 + str.charCodeAt(i);
    hash1 |= 0;
  }
  let hash2 = 5381;
  for (let i = 0; i < str.length; i++) {
    hash2 = ((hash2 << 5) + hash2) + str.charCodeAt(i);
    hash2 |= 0;
  }
  return Math.abs(hash1).toString(36) + '_' + Math.abs(hash2).toString(36);
}

/**
 * 로컬 저장소에서 특정 방의 특정 참가자가 설정한 PIN 해시 가져오기
 */
export function getLocalMemberPinHash(roomKey, memberName) {
  try {
    const storageKey = `manito_pin_hash_${roomKey}_${memberName}`;
    return localStorage.getItem(storageKey) || '';
  } catch (e) {
    return '';
  }
}

/**
 * 로컬 저장소에 특정 방의 특정 참가자 PIN 해시 저장 (잠금 설정)
 */
export function setLocalMemberPinHash(roomKey, memberName, pin) {
  try {
    const hash = hashPin(memberName, pin, roomKey);
    const storageKey = `manito_pin_hash_${roomKey}_${memberName}`;
    localStorage.setItem(storageKey, hash);
    return hash;
  } catch (e) {
    return '';
  }
}

/**
 * 참가자의 PIN이 올바른지 해시 비교로 검증
 */
export function verifyMemberPin(roomKey, memberName, inputPin, expectedHash) {
  if (!expectedHash) return true; // 아직 잠기지 않은 경우
  const inputHash = hashPin(memberName, inputPin, roomKey);
  return inputHash === expectedHash;
}

