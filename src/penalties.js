/**
 * 마니또 릴레이 공개식 실패 벌칙 프리셋 및 관리 모듈
 * 
 * 릴레이 공개식 세레머니 진행 중 미션 실패(BUSTED) 판정을 받았을 때
 * 수행할 랜덤 벌칙을 추첨하고, 주최자가 원하는 대로 벌칙을 추가/삭제/선택할 수 있습니다.
 */

export const DEFAULT_PENALTIES = [
  { id: 'p1', icon: '☕', text: '팀원들에게 커피/음료 한 잔씩 쏘기', tip: '가장 인기 만점인 클래식 벌칙!' },
  { id: 'p2', icon: '💃', text: '15초 동안 마니또를 위한 즉흥 댄스 또는 깜찍한 애교 보여주기', tip: '부끄러움은 15초, 추억은 영원히!' },
  { id: 'p3', icon: '🎤', text: '마니또에게 바치는 30초 무반주 감동 세레나데 부르기', tip: '마니또의 최애곡이나 애창곡 한 소절!' },
  { id: 'p4', icon: '💌', text: '팀 단톡방에 마니또 이름으로 정성스러운 3행시 찬양 올리기', tip: '모두가 감탄할 라임을 보여주세요.' },
  { id: 'p5', icon: '📸', text: '가장 유쾌한 표정으로 셀카 찍어서 단톡방 프로필 1시간 설정', tip: '캡처 각!' },
  { id: 'p6', icon: '🧹', text: '오늘 팀 사무실/모임 뒷정리 및 분리수거 도맡아 하기', tip: '훈훈한 미덕을 발휘할 기회' },
  { id: 'p7', icon: '🍫', text: '내일 마니또 자리 서랍에 몰래 맛있는 간식 가득 채워두기', tip: '끝나도 이어지는 제2의 마니또' },
  { id: 'p8', icon: '🏋️', text: '팔굽혀펴기(또는 스쿼트) 10회 정자세로 시범 보이기', tip: '건강도 챙기고 웃음도 챙기고!' },
  { id: 'p9', icon: '🤖', text: '마니또가 시키는 1회성 심부름(물 떠오기 등) 무조건 수행하기', tip: '오늘 하루 마니또의 든든한 비서!' },
  { id: 'p10', icon: '👏', text: '마니또의 장점 5가지 숨도 안 쉬고 릴레이로 칭찬하기', tip: '칭찬 폭격으로 마음 녹이기' },
  { id: 'p11', icon: '🍕', text: '다음 팀 모임에 깜짝 피자/치킨 사이드 메뉴 협찬하기', tip: '모두의 환호를 받을 수 있는 치트키' },
  { id: 'p12', icon: '🎙️', text: '모임 전원 앞에서 성대모사 또는 개인기 1개 선보이기', tip: '숨겨둔 끼를 대방출해보세요!' }
];

export class PenaltyManager {
  constructor() {
    this.storageKey = 'manito_penalties_v1';
    this.penalties = [];
    this.selectedIds = new Set();
    this.load();
  }

  load() {
    try {
      if (typeof localStorage !== 'undefined') {
        const saved = localStorage.getItem(this.storageKey);
        if (saved) {
          const parsed = JSON.parse(saved);
          if (Array.isArray(parsed.penalties) && parsed.penalties.length > 0) {
            this.penalties = parsed.penalties;
            this.selectedIds = new Set(parsed.selectedIds || this.penalties.map(p => p.id));
            return;
          }
        }
      }
    } catch (e) {
      console.warn('Failed to load penalties from localStorage:', e);
    }

    this.penalties = [...DEFAULT_PENALTIES];
    this.selectedIds = new Set(this.penalties.map(p => p.id));
  }

  save() {
    try {
      if (typeof localStorage !== 'undefined') {
        localStorage.setItem(this.storageKey, JSON.stringify({
          penalties: this.penalties,
          selectedIds: Array.from(this.selectedIds)
        }));
      }
    } catch (e) {
      console.warn('Failed to save penalties to localStorage:', e);
    }
  }

  getAll() {
    return this.penalties;
  }

  getSelected() {
    const selected = this.penalties.filter(p => this.selectedIds.has(p.id));
    return selected.length > 0 ? selected : this.penalties;
  }

  toggle(id) {
    if (this.selectedIds.has(id)) {
      this.selectedIds.delete(id);
    } else {
      this.selectedIds.add(id);
    }
    this.save();
  }

  selectAll() {
    this.penalties.forEach(p => this.selectedIds.add(p.id));
    this.save();
  }

  deselectAll() {
    this.selectedIds.clear();
    this.save();
  }

  addCustom(text, icon = '⚡') {
    const trimmed = text.trim();
    if (!trimmed) return null;

    const newPenalty = {
      id: 'penalty_' + Date.now() + '_' + Math.random().toString(36).substring(2, 6),
      icon: icon || '⚡',
      text: trimmed,
      tip: '내가 직접 등록한 맞춤 벌칙입니다!',
      isCustom: true
    };

    this.penalties.unshift(newPenalty);
    this.selectedIds.add(newPenalty.id);
    this.save();
    return newPenalty;
  }

  remove(id) {
    this.penalties = this.penalties.filter(p => p.id !== id);
    this.selectedIds.delete(id);
    this.save();
  }

  resetToDefault() {
    this.penalties = [...DEFAULT_PENALTIES];
    this.selectedIds = new Set(this.penalties.map(p => p.id));
    this.save();
  }

  getRandomPenalty() {
    const pool = this.getSelected();
    if (pool.length === 0) return DEFAULT_PENALTIES[0];
    const randomIndex = Math.floor(Math.random() * pool.length);
    return pool[randomIndex];
  }
}
