import { createManitoMatch, parseParticipantsInput } from '../src/matcher.js';
import { encodeToken, decodeToken, inspectToken, encodeRoomBundle, inspectRoomBundle, decodeMemberFromBundle } from '../src/crypto.js';
import { DEFAULT_MISSIONS } from '../src/missions.js';

console.log('🧪 [테스트 시작] 시크릿 마니또 개인 보안 및 로직 검증...');

// 1. 참가자 명단 입력 및 PIN 파싱 검증
const rawParticipants = `
  김철수 1234
  이영희 (5678)
  박민수, 9999
  정지원
  최현우 : 4321
`;
const parsed = parseParticipantsInput(rawParticipants);
if (parsed.length !== 5) {
  throw new Error(`[오류] 파싱 개수 불일치: ${parsed.length}`);
}
if (parsed[0].name !== '김철수' || parsed[0].pin !== '1234') {
  throw new Error(`[오류] 김철수 PIN 파싱 실패: ${JSON.stringify(parsed[0])}`);
}
if (parsed[1].name !== '이영희' || parsed[1].pin !== '5678') {
  throw new Error(`[오류] 이영희 PIN 파싱 실패: ${JSON.stringify(parsed[1])}`);
}
if (parsed[2].name !== '박민수' || parsed[2].pin !== '9999') {
  throw new Error(`[오류] 박민수 PIN 파싱 실패: ${JSON.stringify(parsed[2])}`);
}
if (parsed[3].name !== '정지원' || parsed[3].pin !== '') {
  throw new Error(`[오류] 정지원(무PIN) 파싱 실패: ${JSON.stringify(parsed[3])}`);
}
console.log('✅ 1. 참가자 명단 및 4자리 PIN 파싱 검증 성공');

// 2. 매칭 알고리즘 검증
const matches = createManitoMatch(parsed, DEFAULT_MISSIONS, { roomTitle: '보안 테스트방' });
if (matches.length !== 5) {
  throw new Error('[오류] 매칭 수 불일치');
}
for (const m of matches) {
  if (m.giver === m.receiver) {
    throw new Error(`[오류] 본인 매칭 발생: ${m.giver}`);
  }
}
console.log('✅ 2. 마니또 매칭 알고리즘 검증 성공 (완전 순열 100% 보장)');

// 3. 개별 토큰 PIN 암호화 & 본인 열람 검증
const chulsooMatch = matches.find(m => m.giver === '김철수');
const tokenWithPin = encodeToken(chulsooMatch);

// 3-1. inspectToken으로 메타데이터 확인 (PIN 없이도 대상자 이름은 확인 가능)
const inspected = inspectToken(tokenWithPin);
if (!inspected.success || inspected.giver !== '김철수' || !inspected.hasPin) {
  throw new Error('[오류] 토큰 메타데이터 검사 실패');
}

// 3-2. PIN 없이 복호화 시도 -> needsPin 반환 확인
const tryWithoutPin = decodeToken(tokenWithPin);
if (tryWithoutPin.success || !tryWithoutPin.needsPin) {
  throw new Error('[오류] PIN 없이 복호화가 통과됨');
}

// 3-3. 틀린 PIN으로 복호화 시도 -> 차단 확인
const tryWrongPin = decodeToken(tokenWithPin, '0000');
if (tryWrongPin.success || !tryWrongPin.isPinError) {
  throw new Error('[오류] 틀린 PIN으로 복호화가 통과됨');
}

// 3-4. 올바른 PIN으로 복호화 시도 -> 성공 확인
const tryCorrectPin = decodeToken(tokenWithPin, '1234');
if (!tryCorrectPin.success || tryCorrectPin.data.receiver !== chulsooMatch.receiver) {
  throw new Error(`[오류] 올바른 PIN 복호화 실패: ${tryCorrectPin.error}`);
}
console.log('✅ 3. 개별 토큰 PIN 암호화/차단/복호화 검증 성공: 타인 열람 원천 차단');

// 4. 단일 룸 번들 검증 (단톡방 공용 링크)
const roomBundle = encodeRoomBundle(matches, { roomTitle: '테스트 룸', deadline: '2026-09-30' });
const roomInspected = inspectRoomBundle(roomBundle);
if (!roomInspected.success || roomInspected.members.length !== 5) {
  throw new Error('[오류] 룸 번들 정보 열람 실패');
}

// 이영희(PIN: 5678) 결과 복호화 테스트
const youngheeTryWrong = decodeMemberFromBundle(roomBundle, '이영희', '1234');
if (youngheeTryWrong.success) {
  throw new Error('[오류] 이영희 데이터가 타인의 PIN으로 열림');
}

const youngheeTryCorrect = decodeMemberFromBundle(roomBundle, '이영희', '5678');
if (!youngheeTryCorrect.success) {
  throw new Error(`[오류] 이영희 올바른 PIN 복호화 실패: ${youngheeTryCorrect.error}`);
}
console.log('✅ 4. 단일 룸 번들 검증 성공: 공용 링크에서도 본인 PIN 없이는 타인 결과 열람 불가');

// 5. 변조 토큰 방어 검증
const tampered = tokenWithPin.slice(0, -4) + 'zzzz';
const tamperedRes = decodeToken(tampered, '1234');
if (tamperedRes.success) {
  throw new Error('[오류] 변조된 토큰이 통과됨');
}
console.log('✅ 5. 변조 토큰 방어 검증 성공: 데이터 위변조 탐지');

// 6. 릴레이 체인 순환 정렬 검증
const { buildRelayChain } = await import('../src/matcher.js');
const relayChain = buildRelayChain(matches, '김철수');
if (relayChain.length !== matches.length) {
  throw new Error('[오류] 릴레이 체인 길이 불일치');
}
if (relayChain[0].giver !== '김철수') {
  throw new Error('[오류] 시작 주자 불일치');
}
for (let i = 0; i < relayChain.length - 1; i++) {
  if (relayChain[i].receiver !== relayChain[i + 1].giver) {
    throw new Error(`[오류] 릴레이 바통 터치 불일치: ${relayChain[i].receiver} != ${relayChain[i + 1].giver}`);
  }
}
// 마지막 사람의 receiver가 시작 주자인지 확인 (완전 원형 순환)
if (relayChain[relayChain.length - 1].receiver !== relayChain[0].giver) {
  throw new Error('[오류] 릴레이 마지막 연결 실패');
}
console.log('✅ 6. 릴레이 공개식 체인 정렬 검증 성공: 꼬리에 꼬리를 무는 순환 100% 보장');

console.log('\n🎉 [검증 완료] 모든 개인 보안 및 마니또 로직이 완벽하게 통과했습니다!');

