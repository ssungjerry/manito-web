/**
 * 마니또 매칭 알고리즘 및 참가자 파싱 모듈
 * 자신을 뽑지 않는 완전 순열(Derangement) 및 단일 순환(Hamiltonian Cycle) 지원
 * 개인별 4자리 PIN(비밀번호) 파싱 지원
 */

/**
 * 참가자 텍스트 입력값을 파싱하여 이름과 PIN(선택적) 객체 배열로 변환
 * 주최자는 비밀번호를 알 필요 없이 이름만 입력하면 되며,
 * 각 참가자가 링크에 접속해 본인만의 비밀번호를 직접 등록합니다.
 * 
 * 지원 형태:
 * - 민지
 * - 준호, 서연, 지훈
 * - 하은
 * 
 * @param {string} rawInput 
 * @returns {Array<{ name: string, pin: string }>}
 */
export function parseParticipantsInput(rawInput) {
  if (!rawInput || typeof rawInput !== 'string') return [];

  const lines = rawInput
    .split(/\r?\n/)
    .map(line => line.trim())
    .filter(line => line.length > 0);

  const result = [];
  const nameSet = new Set();

  for (const line of lines) {
    // 쉼표 뒤에 숫자가 바로 오는 형태(예: "박민수, 9999")는 한 사람의 이름과 PIN이므로 분리하지 않음
    const subParts = line.includes(',') && !line.match(/^[^\,]+\,\s*\d{3,8}\s*$/)
      ? line.split(/[,/]+/).map(s => s.trim()).filter(s => s.length > 0)
      : [line];

    for (const part of subParts) {
      // 혹시 이름 뒤에 숫자가 붙어있더라도 깔끔하게 파싱 지원
      const pinMatch = part.match(/^([^\d\(\,\:\/]+?)(?:[\s\(\,\:\/]+(\d{3,8}))?[\)\s]*$/);
      let name = '';
      let pin = '';

      if (pinMatch) {
        name = pinMatch[1].trim();
        pin = pinMatch[2] ? pinMatch[2].trim() : '';
      } else {
        name = part.trim();
      }

      name = name.replace(/[\(\)\[\]\{\}]/g, '').trim();

      if (name.length > 0 && !nameSet.has(name)) {
        nameSet.add(name);
        result.push({ name, pin });
      }
    }
  }

  return result;
}

/**
 * 배열을 무작위로 셔플 (Fisher-Yates)
 */
export function shuffle(array) {
  const arr = [...array];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

/**
 * 마니또 매칭 생성
 * @param {Array<string|{ name: string, pin?: string }>} participants 참가자 명단 (문자열 또는 객체)
 * @param {Array} missions 사용할 미션 객체 목록
 * @param {Object} options 설정 옵션 { allowMutual: boolean, roomTitle: string, deadline: string }
 */
export function createManitoMatch(participants, missions, options = {}) {
  // 정규화: 모든 항목을 { name, pin } 구조로 변환
  const normalized = [];
  const seenNames = new Set();

  for (const p of participants) {
    let name = '';
    let pin = '';
    if (typeof p === 'string') {
      name = p.trim();
    } else if (p && typeof p === 'object') {
      name = (p.name || '').trim();
      pin = (p.pin || '').trim();
    }

    if (name.length > 0 && !seenNames.has(name)) {
      seenNames.add(name);
      normalized.push({ name, pin });
    }
  }

  if (normalized.length < 2) {
    throw new Error('마니또 매칭을 위해서는 최소 2명 이상의 참가자가 필요합니다.');
  }

  // 1. 순환 경로(Hamiltonian Cycle) 기반 매칭 생성
  // 무작위 순서로 섞은 후, i번째 사람은 (i+1)%N 번째 사람의 마니또가 됨.
  const shuffled = shuffle(normalized);
  const n = shuffled.length;

  // 2. 미션 셔플 및 할당
  let shuffledMissions = [];
  if (missions && missions.length > 0) {
    shuffledMissions = shuffle(missions);
  }

  const matches = [];

  for (let i = 0; i < n; i++) {
    const giverObj = shuffled[i];
    const receiverObj = shuffled[(i + 1) % n];

    // 미션 선택 (미션이 참가자보다 적을 경우 순환)
    let assignedMission = null;
    if (shuffledMissions.length > 0) {
      assignedMission = shuffledMissions[i % shuffledMissions.length];
    }

    matches.push({
      id: 'm_' + (i + 1),
      giver: giverObj.name,
      receiver: receiverObj.name,
      pin: giverObj.pin || '', // 마니또 본인의 PIN (본인 확인용)
      missionText: assignedMission ? assignedMission.text : '자유롭게 따뜻한 마음과 서프라이즈를 전해보세요!',
      missionTip: assignedMission ? assignedMission.tip : '들키지 않는 것이 포인트!',
      roomTitle: options.roomTitle || '시크릿 마니또',
      deadline: options.deadline || ''
    });
  }

  // 주최자 뷰에서도 보기 편하도록 giver 이름 기준 가나다순으로 정렬하여 반환
  return matches.sort((a, b) => a.giver.localeCompare(b.giver, 'ko'));
}

/**
 * 릴레이 공개식을 위한 꼬리에 꼬리를 무는 순환 체인 정렬
 * 첫 번째 사람부터 시작하여, 선물을 받은 사람이 다음 주자가 되어 본인의 마니또를 지목하도록 순서를 정렬합니다.
 * @param {Array} matches 매칭 객체 배열
 * @param {string} [startGiverName] 첫 번째로 발표를 시작할 사람의 이름 (선택 사항)
 * @returns {Array} 릴레이 순서대로 정렬된 매칭 목록
 */
export function buildRelayChain(matches, startGiverName = '') {
  if (!matches || matches.length === 0) return [];
  if (matches.length === 1) return [...matches];

  const mapByGiver = new Map();
  matches.forEach(m => mapByGiver.set(m.giver, m));

  // 시작 주자 결정
  let currentGiver = startGiverName && mapByGiver.has(startGiverName)
    ? startGiverName
    : matches[0].giver;

  const chain = [];
  const visited = new Set();

  for (let i = 0; i < matches.length; i++) {
    const currentMatch = mapByGiver.get(currentGiver);
    if (!currentMatch || visited.has(currentGiver)) break;

    chain.push(currentMatch);
    visited.add(currentGiver);
    // 선물을 받은 receiver가 다음 릴레이의 giver가 됨!
    currentGiver = currentMatch.receiver;
  }

  // 혹시라도 방문하지 못한 매칭이 있다면(예: 고립된 분할 그룹) 뒤에 덧붙임
  if (chain.length < matches.length) {
    matches.forEach(m => {
      if (!visited.has(m.giver)) {
        chain.push(m);
        visited.add(m.giver);
      }
    });
  }

  return chain;
}

