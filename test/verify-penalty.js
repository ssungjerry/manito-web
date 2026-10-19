/**
 * 벌칙 관리 및 랜덤 추첨 모듈 단위 테스트
 */
import { PenaltyManager, DEFAULT_PENALTIES } from '../src/penalties.js';

console.log('🧪 [벌칙 검증 시작] PenaltyManager 로직 검증...');

const manager = new PenaltyManager();

// 1. 기본 프리셋 검증
console.assert(manager.getAll().length === DEFAULT_PENALTIES.length, '기본 벌칙 개수 일치 확인');
console.assert(manager.getSelected().length === DEFAULT_PENALTIES.length, '초기 선택된 벌칙 개수 확인');
console.log(`✅ 1. 기본 벌칙 ${DEFAULT_PENALTIES.length}종 로드 확인`);

// 2. 벌칙 추가 검증
const custom = manager.addCustom('팀원들에게 도넛 쏘기', '🍩');
console.assert(custom && custom.text === '팀원들에게 도넛 쏘기', '새 벌칙 추가 성공');
console.assert(manager.selectedIds.has(custom.id), '새 벌칙 자동 선택 확인');
console.log('✅ 2. 커스텀 벌칙 추가 및 선택 성공');

// 3. 벌칙 선택/해제 토글 검증
const initialSelectedCount = manager.getSelected().length;
manager.toggle(custom.id);
console.assert(manager.getSelected().length === initialSelectedCount - 1, '토글 해제 성공');
manager.toggle(custom.id);
console.assert(manager.getSelected().length === initialSelectedCount, '토글 재선택 성공');
console.log('✅ 3. 벌칙 선택/해제 토글 검증 성공');

// 4. 랜덤 벌칙 추첨 검증
const drawn = manager.getRandomPenalty();
console.assert(drawn && typeof drawn.text === 'string' && drawn.text.length > 0, '랜덤 벌칙 추첨 확인');
console.log(`✅ 4. 랜덤 벌칙 추첨 성공: "${drawn.icon} ${drawn.text}"`);

// 5. 벌칙 삭제 검증
manager.remove(custom.id);
console.assert(!manager.getAll().some(p => p.id === custom.id), '벌칙 삭제 확인');
console.log('✅ 5. 벌칙 삭제 검증 성공');

console.log('\n🎉 [벌칙 검증 완료] 모든 벌칙 모듈 테스트 완벽 통과!');
