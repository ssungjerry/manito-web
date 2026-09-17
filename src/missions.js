/**
 * 마니또 미션 프리셋 및 관리 모듈
 */

export const MISSION_CATEGORIES = [
  { id: 'all', name: '전체' },
  { id: 'praise', name: '칭찬 & 응원' },
  { id: 'snack', name: '간식 & 서프라이즈' },
  { id: 'support', name: '배려 & 서포트' },
  { id: 'wit', name: '센스 & 위트' },
];

export const DEFAULT_MISSIONS = [
  // 칭찬 & 응원
  { id: 'm1', category: 'praise', text: '하루에 한 번 이상 상대방의 업무 센스나 장점 구체적으로 칭찬하기', tip: '예: "이 부분 정리 정말 깔끔해요!"' },
  { id: 'm2', category: 'praise', text: '슬랙이나 사내 메신저에서 상대방 글에 정성스러운 이모지 3종 달아주기', tip: '마니또인 것을 들키지 않게 자연스러운 타이밍을 노려보세요.' },
  { id: 'm3', category: 'praise', text: '하루 한 번 자연스럽게 오늘 기분이나 컨디션 물어보고 공감해주기', tip: '따뜻한 안부 인사는 언제나 힘이 됩니다.' },
  { id: 'm4', category: 'praise', text: '퇴근할 때 "오늘도 정말 고생 많으셨어요!" 진심 담아 인사 건네기', tip: '퇴근길 기분 좋은 한마디가 최고의 힐링!' },
  { id: 'm5', category: 'praise', text: '상대방이 잘하고 있는 점 1가지를 다른 동료 앞에서 넌지시 칭찬하기', tip: '간접 칭찬이 전해졌을 때 감동이 2배가 됩니다.' },

  // 간식 & 서프라이즈
  { id: 'm6', category: 'snack', text: '상대방 책상에 좋아하는 음료나 간식을 모르게 살포시 올려두기', tip: 'CCTV나 주변 동료들의 시선을 주의하세요 🕵️' },
  { id: 'm7', category: 'snack', text: '오후 3~4시 나른한 시간에 활력 비타민이나 캔디 몰래 건네기', tip: '포스트잇에 익명의 응원 문구를 적어두면 더욱 좋습니다.' },
  { id: 'm8', category: 'snack', text: '함께 커피나 티타임 갈 기회를 자연스럽게 만들어 음료 챙겨주기', tip: '자연스럽게 법카/개인카 찬스를 써보세요.' },
  { id: 'm9', category: 'snack', text: '상대방이 평소 좋아하는 간식 취향이나 음료 취향 은근슬쩍 알아내기', tip: '스몰토크 중에 자연스럽게 물어보는 센스!' },

  // 배려 & 서포트
  { id: 'm10', category: 'support', text: '상대방의 자리가 비었을 때 의자 밀어넣기나 사소한 정리 도와주기', tip: '작은 배려가 큰 감동을 만듭니다.' },
  { id: 'm11', category: 'support', text: '회의나 미팅 때 상대방의 의견에 적극적으로 고개 끄덕이며 호응하기', tip: '든든한 아군이 되어주세요.' },
  { id: 'm12', category: 'support', text: '상대방이 바빠 보일 때 "제가 도와드릴 일 있을까요?" 먼저 물어보기', tip: '부담 없는 선에서 도움의 손길을 내밀어보세요.' },
  { id: 'm13', category: 'support', text: '상대방이 찾고 있는 물건이나 자료 먼저 찾아서 슬쩍 공유해주기', tip: '센스 있는 정보 공유는 최고의 서포트입니다.' },

  // 센스 & 위트
  { id: 'm14', category: 'wit', text: '복도나 엘리베이터에서 마주칠 때 따뜻한 눈웃음과 함께 반갑게 인사하기', tip: '눈이 마주쳤을 때 0.5초 더 밝게 미소 짓기!' },
  { id: 'm15', category: 'wit', text: '상대방과 대화 중에 특정 키워드(예: "대박", "역시")를 자연스럽게 2회 유도하기', tip: '추리 게임처럼 은밀하게 즐겨보세요.' },
  { id: 'm16', category: 'wit', text: '마니또 기간 동안 상대방과 함께 찍힌 단체 사진 1장 이상 자연스럽게 남기기', tip: '팀 전체 회식이나 미팅 때 찰칵!' },
  { id: 'm17', category: 'wit', text: '자연스러운 타이밍에 멋진 하이파이브나 주먹 인사 한 번 성공하기', tip: '좋은 아이디어가 나왔을 때 "오 나이스!" 하며 시도!' },
  { id: 'm18', category: 'wit', text: '상대방의 오늘의 착장이나 헤어스타일, 액세서리 원포인트 칭찬하기', tip: '"오늘 니트 색상 정말 잘 어울리세요!"' }
];

export class MissionManager {
  constructor() {
    this.missions = [...DEFAULT_MISSIONS];
    this.selectedIds = new Set(this.missions.map(m => m.id));
  }

  getAll() {
    return this.missions;
  }

  getSelected() {
    return this.missions.filter(m => this.selectedIds.has(m.id));
  }

  toggle(id) {
    if (this.selectedIds.has(id)) {
      this.selectedIds.delete(id);
    } else {
      this.selectedIds.add(id);
    }
  }

  selectAll() {
    this.missions.forEach(m => this.selectedIds.add(m.id));
  }

  deselectAll() {
    this.selectedIds.clear();
  }

  addCustom(text, tip = '내가 직접 등록한 특별 미션입니다!') {
    const trimmed = text.trim();
    if (!trimmed) return null;
    const newMission = {
      id: 'custom_' + Date.now() + '_' + Math.random().toString(36).substring(2, 6),
      category: 'wit',
      text: trimmed,
      tip: tip,
      isCustom: true
    };
    this.missions.unshift(newMission);
    this.selectedIds.add(newMission.id);
    return newMission;
  }

  remove(id) {
    this.missions = this.missions.filter(m => m.id !== id);
    this.selectedIds.delete(id);
  }
}
