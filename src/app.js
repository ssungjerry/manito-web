/**
 * 시크릿 마니또 (Secret Manito) 메인 애플리케이션 진입점
 * 각자 본인만 마니또 결과를 확인할 수 있는 암호화 & 블라인드 시스템
 * 및 꼬리에 꼬리를 무는 마니또 릴레이 공개식 세레머니 기능 포함
 */

import { MissionManager, MISSION_CATEGORIES } from './missions.js';
import { 
  encodeToken, 
  decodeToken, 
  inspectToken, 
  encodeRoomBundle, 
  inspectRoomBundle, 
  decodeMemberFromBundle,
  getLocalMemberPinHash,
  setLocalMemberPinHash,
  verifyMemberPin
} from './crypto.js';
import { createManitoMatch, parseParticipantsInput, buildRelayChain } from './matcher.js';
import { sound } from './sound.js';
import { ConfettiExplosion } from './confetti.js';
import { ScratchCard } from './scratch.js';
import { exportResultCard } from './card-export.js';

class ManitoApp {
  constructor() {
    this.missionManager = new MissionManager();
    this.activeCategory = 'all';
    this.activeRoom = null;
    this.activeRevealData = null;
    this.confetti = null;
    this.scratchCard = null;
    this.activeRevealMode = 'scratch';
    this.sentStatus = JSON.parse(localStorage.getItem('manito_sent_status') || '{}');

    // PIN 보안 관련 상태 (영지식 셀프 등록 지원)
    this.pendingToken = null;
    this.pendingRoomToken = null;
    this.pendingMemberName = null;
    this.currentPin = '';
    this.pinSetupMode = false;
    this.pinSetupStep = 1;
    this.pinFirstInput = '';
    this.expectedPinHash = '';

    // 릴레이 공개식 세레머니 상태
    this.ceremonyChain = [];
    this.ceremonyIndex = 0;
    this.ceremonyJudgments = [];
    this.selectedStarter = '';

    this.init();
  }

  init() {
    const confettiCanvas = document.getElementById('confetti-canvas');
    if (confettiCanvas) {
      this.confetti = new ConfettiExplosion(confettiCanvas);
    }

    // 로컬 스토리지에서 마지막 방 복원 시도
    const savedRoom = localStorage.getItem('manito_current_room');
    if (savedRoom) {
      try {
        this.activeRoom = JSON.parse(savedRoom);
      } catch (e) {
        console.warn('Saved room parse error:', e);
      }
    }

    this.setupEventListeners();
    this.renderCategoryTabs();
    this.renderMissionList();
    this.initBaseUrlInput();
    this.updateSoundIcon();

    // 초기 라우팅 처리
    window.addEventListener('hashchange', () => this.handleRouting());
    this.handleRouting();
  }

  // =========================================================================
  // 라우팅 (해시 기반 네비게이션)
  // =========================================================================
  handleRouting() {
    const hash = window.location.hash || '';
    const search = window.location.search || '';

    // 1. 마니또 릴레이 공개식 세레머니 (#/ceremony)
    if (hash.startsWith('#/ceremony')) {
      if (this.activeRoom && this.activeRoom.matches && this.activeRoom.matches.length > 0) {
        this.switchView('view-ceremony');
        this.initCeremonyLobby();
        return;
      } else {
        window.location.hash = '#/setup';
        return;
      }
    }

    // 2. 단체방 공용 룸 접속 (#/room?r=... 또는 ?r=...)
    if (hash.startsWith('#/room') || hash.includes('r=') || search.includes('r=')) {
      let roomToken = '';
      if (hash.includes('r=')) {
        const queryPart = hash.split('?')[1] || '';
        const params = new URLSearchParams(queryPart);
        roomToken = params.get('r') || '';
      } else if (search.includes('r=')) {
        const params = new URLSearchParams(search);
        roomToken = params.get('r') || '';
      }

      if (roomToken) {
        this.switchView('view-room');
        this.loadRoomView(roomToken);
        return;
      }
    }

    // 3. 1인 1링크 결과 확인 링크 (#/reveal?t=... 또는 ?t=...)
    if (hash.startsWith('#/reveal') || hash.includes('t=') || search.includes('t=')) {
      let token = '';
      if (hash.includes('t=')) {
        const queryPart = hash.split('?')[1] || '';
        const params = new URLSearchParams(queryPart);
        token = params.get('t') || '';
      } else if (search.includes('t=')) {
        const params = new URLSearchParams(search);
        token = params.get('t') || '';
      }

      if (token) {
        this.switchView('view-reveal');
        this.loadIndividualReveal(token);
        return;
      }
    }

    // 4. 링크 공유 대시보드 (#/share)
    if (hash.startsWith('#/share')) {
      if (this.activeRoom && this.activeRoom.matches && this.activeRoom.matches.length > 0) {
        this.switchView('view-share');
        this.renderShareDashboard();
        return;
      } else {
        window.location.hash = '#/setup';
        return;
      }
    }

    // 5. 기본값: 주최자 설정 화면 (#/setup)
    this.switchView('view-setup');
  }

  switchView(viewId) {
    const routeName = viewId.replace('view-', '');
    document.documentElement.className = 'page-' + routeName;

    document.querySelectorAll('.view-section').forEach(sec => {
      sec.classList.remove('active');
    });
    const target = document.getElementById(viewId);
    if (target) {
      target.classList.add('active');
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  }

  // =========================================================================
  // 이벤트 리스너 바인딩
  // =========================================================================
  setupEventListeners() {
    // 효과음 토글
    const btnSound = document.getElementById('btn-sound-toggle');
    if (btnSound) {
      btnSound.addEventListener('click', () => {
        const isMuted = sound.toggleMute();
        this.updateSoundIcon();
        this.showToast(isMuted ? '🔇 효과음이 꺼졌습니다.' : '🔊 효과음이 켜졌습니다.');
      });
    }

    // 이용 안내 가이드 모달
    const btnOpenGuide = document.getElementById('btn-open-guide');
    const btnCloseGuide = document.getElementById('btn-close-guide');
    const btnConfirmGuide = document.getElementById('btn-confirm-guide');
    const guideModal = document.getElementById('guide-modal');

    if (btnOpenGuide && guideModal) {
      btnOpenGuide.addEventListener('click', () => {
        sound.playPop();
        guideModal.classList.remove('hidden');
      });
    }
    if (btnCloseGuide && guideModal) {
      btnCloseGuide.addEventListener('click', () => {
        guideModal.classList.add('hidden');
      });
    }
    if (btnConfirmGuide && guideModal) {
      btnConfirmGuide.addEventListener('click', () => {
        guideModal.classList.add('hidden');
      });
    }

    // 새 마니또 만들기 버튼 (헤더)
    const btnNavNew = document.getElementById('btn-nav-new');
    if (btnNavNew) {
      btnNavNew.addEventListener('click', () => {
        sound.playPop();
        if (confirm('새로운 마니또를 만드시겠습니까? 기존 결과가 초기화될 수 있습니다.')) {
          window.location.hash = '#/setup';
        }
      });
    }

    // 참가자 인풋 글자 수/인원수 동적 업데이트
    const inputParticipants = document.getElementById('input-participants');
    if (inputParticipants) {
      inputParticipants.addEventListener('input', () => {
        this.updateParticipantCount();
      });
    }

    // 예시 팀원 채우기
    const btnFillSample = document.getElementById('btn-fill-sample');
    if (btnFillSample && inputParticipants) {
      btnFillSample.addEventListener('click', () => {
        sound.playPop();
        const sampleNames = [
          '민지',
          '준호',
          '서연',
          '지훈',
          '하은',
          '수빈'
        ];
        inputParticipants.value = sampleNames.join('\n');
        this.updateParticipantCount();
        this.showToast('✨ 예시 팀원 6명이 입력되었습니다.');
      });
    }

    // 팀원 모두 지우기
    const btnClearNames = document.getElementById('btn-clear-names');
    if (btnClearNames && inputParticipants) {
      btnClearNames.addEventListener('click', () => {
        sound.playPop();
        inputParticipants.value = '';
        this.updateParticipantCount();
      });
    }

    // 미션 전체 선택 / 해제
    const btnSelectAll = document.getElementById('btn-select-all-missions');
    const btnDeselectAll = document.getElementById('btn-deselect-all-missions');
    if (btnSelectAll) {
      btnSelectAll.addEventListener('click', () => {
        sound.playPop();
        this.missionManager.selectAll();
        this.renderMissionList();
      });
    }
    if (btnDeselectAll) {
      btnDeselectAll.addEventListener('click', () => {
        sound.playPop();
        this.missionManager.deselectAll();
        this.renderMissionList();
      });
    }

    // 커스텀 미션 추가
    const btnAddCustom = document.getElementById('btn-add-custom-mission');
    const inputCustom = document.getElementById('input-custom-mission');
    if (btnAddCustom && inputCustom) {
      const handleAdd = () => {
        const text = inputCustom.value.trim();
        if (!text) {
          this.showToast('미션 내용을 입력해주세요.');
          return;
        }
        const created = this.missionManager.addCustom(text);
        if (created) {
          inputCustom.value = '';
          sound.playChime();
          this.renderMissionList();
          this.showToast('🎯 커스텀 미션이 추가되었습니다!');
        }
      };
      btnAddCustom.addEventListener('click', handleAdd);
      inputCustom.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') handleAdd();
      });
    }

    // 마니또 매칭 및 링크 생성 버튼
    const btnGenerate = document.getElementById('btn-generate-matches');
    if (btnGenerate) {
      btnGenerate.addEventListener('click', () => this.handleGenerateMatches());
    }

    // 🎊 마니또 릴레이 공개식 시작 배너 버튼
    const btnOpenCeremonyRoom = document.getElementById('btn-open-ceremony-room');
    if (btnOpenCeremonyRoom) {
      btnOpenCeremonyRoom.addEventListener('click', () => {
        sound.playPop();
        window.location.hash = '#/ceremony';
      });
    }

    // 공유 방식 탭 전환 (공용 룸 vs 1:1 개별)
    const tabBtnGroup = document.getElementById('tab-btn-group');
    const tabBtnIndividual = document.getElementById('tab-btn-individual');
    const panelGroup = document.getElementById('panel-group-share');
    const panelIndividual = document.getElementById('panel-individual-share');

    if (tabBtnGroup && tabBtnIndividual) {
      tabBtnGroup.addEventListener('click', () => {
        sound.playPop();
        tabBtnGroup.classList.add('active');
        tabBtnIndividual.classList.remove('active');
        if (panelGroup) panelGroup.classList.remove('hidden');
        if (panelIndividual) panelIndividual.classList.add('hidden');
      });

      tabBtnIndividual.addEventListener('click', () => {
        sound.playPop();
        tabBtnIndividual.classList.add('active');
        tabBtnGroup.classList.remove('active');
        if (panelIndividual) panelIndividual.classList.remove('hidden');
        if (panelGroup) panelGroup.classList.add('hidden');
      });
    }

    // 단체방 공용 링크 복사 버튼들
    const btnCopyRoomLinkOnly = document.getElementById('btn-copy-room-link-only');
    if (btnCopyRoomLinkOnly) {
      btnCopyRoomLinkOnly.addEventListener('click', () => {
        if (!this.activeRoom || !this.activeRoom.roomLink) return;
        sound.playPop();
        this.copyToClipboard(this.activeRoom.roomLink, '🔗 단체방 마니또 링크가 복사되었습니다!');
      });
    }

    const btnCopyRoomNotice = document.getElementById('btn-copy-room-notice');
    if (btnCopyRoomNotice) {
      btnCopyRoomNotice.addEventListener('click', () => this.copyRoomNoticeToClipboard());
    }

    // 전체 명단 일괄 복사 버튼
    const btnCopyAll = document.getElementById('btn-copy-all-links');
    if (btnCopyAll) {
      btnCopyAll.addEventListener('click', () => this.copyAllLinksToClipboard());
    }

    // 설정 수정 / 다시 뽑기 버튼
    const btnModifySetup = document.getElementById('btn-modify-setup');
    if (btnModifySetup) {
      btnModifySetup.addEventListener('click', () => {
        sound.playPop();
        window.location.hash = '#/setup';
      });
    }

    // 팀원 검색
    const inputSearch = document.getElementById('input-search-member');
    if (inputSearch) {
      inputSearch.addEventListener('input', (e) => {
        this.filterMemberCards(e.target.value);
      });
    }

    // 주최자 마스터 뷰 토글
    const btnToggleMaster = document.getElementById('btn-toggle-master-view');
    const spoilerContent = document.getElementById('master-spoiler-content');
    if (btnToggleMaster && spoilerContent) {
      btnToggleMaster.addEventListener('click', () => {
        sound.playPop();
        const isHidden = spoilerContent.classList.contains('hidden');
        if (isHidden) {
          const warning = this.activeRoom && this.activeRoom.isBlindMode
            ? '⚠️ [주최자 블라인드 모드 알림]\n\n현재 전체 매칭이 비공개로 잠겨 있습니다. 전체 결과를 열람하면 주최자 본인의 마니또 대상도 미리 알게 됩니다.\n\n정말 결과를 강제로 열람하시겠습니까?'
            : '주최자 본인의 마니또 대상도 미리 보일 수 있습니다. 전체 결과를 열람하시겠습니까?';

          if (confirm(warning)) {
            spoilerContent.classList.remove('hidden');
            document.getElementById('master-toggle-text').textContent = '전체 결과 숨기기';
            document.getElementById('master-toggle-icon').textContent = '🙈';
          }
        } else {
          spoilerContent.classList.add('hidden');
          document.getElementById('master-toggle-text').textContent = '전체 결과 열람하기';
          document.getElementById('master-toggle-icon').textContent = '👁️';
        }
      });
    }

    // 결과 확인 화면: 선물상자 개봉
    const unboxWrap = document.getElementById('unbox-box-wrap');
    if (unboxWrap) {
      unboxWrap.addEventListener('click', () => this.openGiftBox());
    }

    // 결과 확인 화면: 개봉 방식 모드 탭 (스크래치 / 선물상자)
    const btnModeUnbox = document.getElementById('btn-mode-unbox');
    const btnModeScratch = document.getElementById('btn-mode-scratch');
    if (btnModeUnbox && btnModeScratch) {
      btnModeUnbox.addEventListener('click', () => {
        sound.playPop();
        this.setRevealMode('unbox');
      });
      btnModeScratch.addEventListener('click', () => {
        sound.playPop();
        this.setRevealMode('scratch');
      });
    }

    // 사생활 보호 방패
    const btnPrivacyShield = document.getElementById('btn-privacy-shield');
    const privacyOverlay = document.getElementById('privacy-shield-overlay');
    const btnUnlockPrivacy = document.getElementById('btn-unlock-privacy');

    if (btnPrivacyShield && privacyOverlay) {
      btnPrivacyShield.addEventListener('click', () => {
        sound.playPop();
        privacyOverlay.classList.remove('hidden');
      });
    }
    if (btnUnlockPrivacy && privacyOverlay) {
      btnUnlockPrivacy.addEventListener('click', () => {
        sound.playPop();
        privacyOverlay.classList.add('hidden');
      });
    }

    // 결과 카드 이미지 다운로드
    const btnSaveImage = document.getElementById('btn-save-image-card');
    if (btnSaveImage) {
      btnSaveImage.addEventListener('click', () => {
        if (!this.activeRevealData) return;
        sound.playPop();
        this.showToast('📸 마니또 카드를 고화질 이미지로 저장합니다...');
        setTimeout(() => {
          exportResultCard(this.activeRevealData);
        }, 100);
      });
    }

    // 가상 키패드 이벤트 연동
    const pinKeypad = document.getElementById('pin-keypad');
    if (pinKeypad) {
      pinKeypad.querySelectorAll('.key-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
          const key = e.currentTarget.dataset.key;
          this.handlePinKeyInput(key);
        });
      });
    }

    // 물리 키보드 숫자 입력 지원
    window.addEventListener('keydown', (e) => {
      const pinGate = document.getElementById('reveal-pin-gate');
      if (pinGate && !pinGate.classList.contains('hidden')) {
        if (e.key >= '0' && e.key <= '9') {
          this.handlePinKeyInput(e.key);
        } else if (e.key === 'Backspace') {
          this.handlePinKeyInput('back');
        } else if (e.key === 'Escape') {
          this.handlePinKeyInput('clear');
        }
      }
    });

    // =======================================================================
    // 🎊 세레머니 뷰 전용 이벤트 리스너 바인딩
    // =======================================================================
    const btnStartCeremonyRun = document.getElementById('btn-start-ceremony-run');
    if (btnStartCeremonyRun) {
      btnStartCeremonyRun.addEventListener('click', () => this.startCeremony());
    }

    const btnBackToShare = document.getElementById('btn-back-to-share');
    if (btnBackToShare) {
      btnBackToShare.addEventListener('click', () => {
        sound.playPop();
        window.location.hash = '#/share';
      });
    }

    const btnCReveal = document.getElementById('btn-c-reveal-target');
    if (btnCReveal) {
      btnCReveal.addEventListener('click', () => this.revealCeremonyTarget());
    }

    const btnJudgeSuccess = document.getElementById('btn-judge-success');
    const btnJudgeEffort = document.getElementById('btn-judge-effort');
    const btnJudgeFail = document.getElementById('btn-judge-fail');

    if (btnJudgeSuccess) btnJudgeSuccess.addEventListener('click', () => this.judgeCeremonyMission('success'));
    if (btnJudgeEffort) btnJudgeEffort.addEventListener('click', () => this.judgeCeremonyMission('effort'));
    if (btnJudgeFail) btnJudgeFail.addEventListener('click', () => this.judgeCeremonyMission('fail'));

    const btnCNextStep = document.getElementById('btn-c-next-step');
    if (btnCNextStep) {
      btnCNextStep.addEventListener('click', () => this.advanceCeremonyStep());
    }

    const btnExitCeremony = document.getElementById('btn-exit-ceremony');
    if (btnExitCeremony) {
      btnExitCeremony.addEventListener('click', () => {
        if (confirm('마니또 공개식을 종료하고 대시보드로 돌아가시겠습니까?')) {
          sound.playPop();
          window.location.hash = '#/share';
        }
      });
    }

    const btnRestartCeremony = document.getElementById('btn-restart-ceremony');
    if (btnRestartCeremony) {
      btnRestartCeremony.addEventListener('click', () => {
        sound.playPop();
        this.initCeremonyLobby();
      });
    }

    const btnFinishCeremony = document.getElementById('btn-finish-ceremony');
    if (btnFinishCeremony) {
      btnFinishCeremony.addEventListener('click', () => {
        sound.playPop();
        window.location.hash = '#/share';
      });
    }
  }

  updateSoundIcon() {
    const icon = document.getElementById('sound-icon');
    if (icon) {
      icon.textContent = sound.isMuted ? '🔇' : '🔊';
    }
  }

  // =========================================================================
  // VIEW 1: 주최자 설정 화면 로직
  // =========================================================================
  renderCategoryTabs() {
    const container = document.getElementById('mission-category-tabs');
    if (!container) return;

    container.innerHTML = MISSION_CATEGORIES.map(cat => `
      <button type="button" class="mission-tab ${cat.id === this.activeCategory ? 'active' : ''}" data-cat="${cat.id}">
        ${cat.name}
      </button>
    `).join('');

    container.querySelectorAll('.mission-tab').forEach(btn => {
      btn.addEventListener('click', (e) => {
        sound.playPop();
        this.activeCategory = e.currentTarget.dataset.cat;
        this.renderCategoryTabs();
        this.renderMissionList();
      });
    });
  }

  renderMissionList() {
    const container = document.getElementById('mission-items-container');
    const countBadge = document.getElementById('selected-mission-count');
    if (!container) return;

    const allMissions = this.missionManager.getAll();
    const filtered = this.activeCategory === 'all'
      ? allMissions
      : allMissions.filter(m => m.category === this.activeCategory);

    const selectedCount = this.missionManager.getSelected().length;
    if (countBadge) countBadge.textContent = selectedCount;

    container.innerHTML = filtered.map(m => {
      const isSelected = this.missionManager.selectedIds.has(m.id);
      return `
        <label class="mission-card-item ${isSelected ? 'selected' : ''}" data-id="${m.id}">
          <input type="checkbox" ${isSelected ? 'checked' : ''}>
          <div class="mission-text-content">
            <div class="mission-item-text">
              ${m.isCustom ? '<span class="mission-custom-badge">CUSTOM</span>' : ''}
              ${m.text}
            </div>
            ${m.tip ? `<div class="mission-item-tip">💡 ${m.tip}</div>` : ''}
          </div>
        </label>
      `;
    }).join('');

    container.querySelectorAll('.mission-card-item').forEach(card => {
      const checkbox = card.querySelector('input[type="checkbox"]');
      card.addEventListener('click', (e) => {
        if (e.target !== checkbox) {
          checkbox.checked = !checkbox.checked;
        }
        const id = card.dataset.id;
        this.missionManager.toggle(id);
        sound.playPop();
        card.classList.toggle('selected', checkbox.checked);
        if (countBadge) {
          countBadge.textContent = this.missionManager.getSelected().length;
        }
      });
    });
  }

  updateParticipantCount() {
    const textarea = document.getElementById('input-participants');
    const badge = document.getElementById('participant-badge');
    const pinBadge = document.getElementById('pin-status-badge');
    if (!textarea || !badge) return;

    const parsed = parseParticipantsInput(textarea.value);
    badge.textContent = `${parsed.length}명 입력됨`;

    const pinCount = parsed.filter(p => p.pin.length > 0).length;
    if (pinBadge) {
      if (pinCount > 0) {
        pinBadge.classList.remove('hidden');
        pinBadge.textContent = `🔒 ${pinCount}명 PIN 암호 보호`;
      } else {
        pinBadge.classList.add('hidden');
      }
    }
  }

  initBaseUrlInput() {
    const inputBaseUrl = document.getElementById('input-base-url');
    const badge = document.getElementById('base-url-status');
    const hint = document.getElementById('base-url-hint');
    if (!inputBaseUrl) return;

    const isLocal = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
    let saved = localStorage.getItem('manito_custom_base_url');
    const activePublicTunnel = 'https://2b673ae3507dbe.lhr.life/';

    // 예전 만료된 죽은 터널 주소 정리
    if (saved && saved.includes('d2fb4502a52fc3')) {
      localStorage.removeItem('manito_custom_base_url');
      saved = null;
    }

    if (saved) {
      inputBaseUrl.value = saved;
      if (badge) {
        badge.textContent = '설정된 주소';
        badge.style.color = '#38bdf8';
        badge.style.background = 'rgba(56, 189, 248, 0.15)';
      }
    } else if (isLocal) {
      // 로컬호스트 접속 중일 때는 다른 팀원이 스마트폰으로 열 수 있는 실시간 공개 주소 기본 제안
      inputBaseUrl.value = activePublicTunnel;
      if (badge) {
        badge.textContent = '🌐 팀원 공유용 공개 주소 활성';
        badge.style.color = '#10b981';
        badge.style.background = 'rgba(16, 185, 129, 0.15)';
      }
      if (hint) {
        hint.innerHTML = `🌐 <strong>다른 사람(스마트폰/카카오톡)도 바로 누를 수 있는 공개 주소(${activePublicTunnel})</strong>가 적용되었습니다!`;
      }
    } else {
      inputBaseUrl.value = window.location.origin + window.location.pathname;
    }

    inputBaseUrl.addEventListener('change', (e) => {
      localStorage.setItem('manito_custom_base_url', e.target.value.trim());
    });
  }

  handleGenerateMatches() {
    sound.playPop();
    const roomTitle = (document.getElementById('input-room-title')?.value || '우리팀 시크릿 마니또').trim();
    const deadline = (document.getElementById('input-deadline')?.value || '').trim();
    const participantsRaw = document.getElementById('input-participants')?.value || '';
    const isBlindMode = document.getElementById('chk-blind-mode')?.checked ?? true;

    const parsedParticipants = parseParticipantsInput(participantsRaw);

    if (parsedParticipants.length < 2) {
      alert('마니또를 진행하려면 최소 2명 이상의 팀원이 필요합니다.');
      return;
    }

    const selectedMissions = this.missionManager.getSelected();

    try {
      // 1. 순환 매칭 생성
      const matches = createManitoMatch(parsedParticipants, selectedMissions, {
        roomTitle,
        deadline
      });

      // 2. 기본 URL 확보
      const inputBaseUrl = document.getElementById('input-base-url');
      let baseUrl = (inputBaseUrl?.value || '').trim();
      if (!baseUrl) {
        baseUrl = window.location.origin + window.location.pathname;
      }
      if (!baseUrl.endsWith('/')) {
        baseUrl += '/';
      }

      // 3. 각 참가자별 1인 1링크 토큰 생성 (개인 PIN 암호화)
      const enrichedMatches = matches.map(match => {
        const token = encodeToken({
          giver: match.giver,
          receiver: match.receiver,
          missionText: match.missionText,
          missionTip: match.missionTip,
          roomTitle: match.roomTitle,
          deadline: match.deadline,
          pin: match.pin
        });

        const link = `${baseUrl}#/reveal?t=${token}`;

        return {
          ...match,
          token,
          link,
          hasPin: (match.pin || '').length > 0
        };
      });

      // 4. 단체방 공용 룸 번들 토큰 생성 (단일 링크 공유용)
      const roomToken = encodeRoomBundle(enrichedMatches, {
        roomTitle,
        deadline
      });
      const roomLink = `${baseUrl}#/room?r=${roomToken}`;

      this.activeRoom = {
        roomTitle,
        deadline,
        isBlindMode,
        roomToken,
        roomLink,
        createdAt: new Date().toISOString(),
        matches: enrichedMatches
      };

      // 로컬 스토리지에 저장
      localStorage.setItem('manito_current_room', JSON.stringify(this.activeRoom));

      // 팡파레 및 파티클 발사
      sound.playFanfare();
      if (this.confetti) {
        this.confetti.fire(120);
      }

      // 공유 뷰로 이동
      window.location.hash = '#/share';
      this.showToast('🎉 마니또 매칭 및 시크릿 암호화 링크 생성이 완료되었습니다!');
    } catch (err) {
      alert(err.message || '매칭 생성 중 오류가 발생했습니다.');
    }
  }

  // =========================================================================
  // VIEW 2: 공유 & 링크 관리 대시보드 로직
  // =========================================================================
  renderShareDashboard() {
    if (!this.activeRoom || !this.activeRoom.matches) return;

    // 만료되었던 옛날 주소(d2fb4502a52fc3)가 남아있다면 현재 활성 공개 터널 주소로 자동 교정
    const activeBase = 'https://2b673ae3507dbe.lhr.life/';
    let needsSave = false;

    if (this.activeRoom.roomLink && this.activeRoom.roomLink.includes('d2fb4502a52fc3')) {
      this.activeRoom.roomLink = this.activeRoom.roomLink.replace(/^https?:\/\/[^\/#]+[\/]*/, activeBase);
      needsSave = true;
    }
    if (this.activeRoom.matches) {
      this.activeRoom.matches.forEach(m => {
        if (m.link && m.link.includes('d2fb4502a52fc3')) {
          m.link = m.link.replace(/^https?:\/\/[^\/#]+[\/]*/, activeBase);
          needsSave = true;
        }
      });
    }
    if (needsSave) {
      localStorage.setItem('manito_current_room', JSON.stringify(this.activeRoom));
    }

    const summaryText = document.getElementById('share-summary-text');
    if (summaryText) {
      const pinProtectedCount = this.activeRoom.matches.filter(m => m.hasPin).length;
      summaryText.innerHTML = `
        <strong>${this.activeRoom.roomTitle}</strong> (총 <strong>${this.activeRoom.matches.length}명</strong> 참가)
        ${pinProtectedCount > 0 ? `• <strong>${pinProtectedCount}명</strong> 개인 암호 보호 적용` : ''}<br>
        팀원들이 각자 본인의 마니또만 확인할 수 있도록 안전하게 암호화되었습니다.
      `;
    }

    // 단체방 공용 링크 UI 채우기
    const roomDisplay = document.getElementById('room-link-display');
    if (roomDisplay && this.activeRoom.roomLink) {
      roomDisplay.textContent = this.activeRoom.roomLink;
      roomDisplay.title = this.activeRoom.roomLink;
    }

    // 팀원별 1:1 목록 채우기
    const container = document.getElementById('members-links-container');
    if (container) {
      container.innerHTML = this.activeRoom.matches.map(match => {
        const isSent = !!this.sentStatus[match.giver];
        return `
          <div class="member-link-card ${isSent ? 'sent' : ''}" data-name="${match.giver}">
            <div class="member-card-top">
              <div class="member-name-wrap">
                <div class="member-avatar">${match.giver.charAt(0)}</div>
                <div>
                  <div class="member-name">${match.giver}</div>
                  ${match.hasPin ? '<span class="member-pin-badge">🔒 PIN 보호됨</span>' : '<span class="member-nopin-badge">일반</span>'}
                </div>
              </div>
              <label class="sent-checkbox-label">
                <input type="checkbox" class="chk-sent" data-giver="${match.giver}" ${isSent ? 'checked' : ''}>
                <span>전송 완료</span>
              </label>
            </div>
            
            <div class="member-link-box" title="${match.link}">
              ${match.link}
            </div>

            <div class="member-card-actions">
              <button type="button" class="action-mini-btn btn-copy-dm" data-name="${match.giver}" data-link="${match.link}">
                <span>💬 1:1 DM 문구 복사</span>
              </button>
              <button type="button" class="action-mini-btn ghost btn-copy-single" data-link="${match.link}" data-name="${match.giver}">
                <span>🔗 링크만 복사</span>
              </button>
              ${!this.activeRoom.isBlindMode ? `
                <button type="button" class="preview-link-btn btn-preview-single" data-link="${match.link}">
                  <span>미리보기</span>
                </button>
              ` : `
                <button type="button" class="preview-link-btn btn-preview-single" data-link="${match.link}">
                  <span>본인 확인</span>
                </button>
              `}
            </div>
          </div>
        `;
      }).join('');

      // 1:1 DM 문구 복사 이벤트
      container.querySelectorAll('.btn-copy-dm').forEach(btn => {
        btn.addEventListener('click', (e) => {
          sound.playPop();
          const name = e.currentTarget.dataset.name;
          const link = e.currentTarget.dataset.link;
          const msg = `[시크릿 마니또] ${name} 님 전용 비밀 링크입니다 🤫\n아래 링크로 접속하여 마니또 대상과 비밀 미션을 확인하세요!\n\n🔗 ${link}\n${this.activeRoom.deadline ? `⏰ 활동 기간: ${this.activeRoom.deadline}\n` : ''}\n※ 절대 타인에게 링크나 대상을 발설하지 마세요!`;
          this.copyToClipboard(msg, `[${name}] 님을 위한 1:1 맞춤 DM 문구가 복사되었습니다! 카톡이나 슬랙에 붙여넣으세요.`);
        });
      });

      // 단일 링크 복사
      container.querySelectorAll('.btn-copy-single').forEach(btn => {
        btn.addEventListener('click', (e) => {
          sound.playPop();
          const link = e.currentTarget.dataset.link;
          const name = e.currentTarget.dataset.name;
          this.copyToClipboard(link, `[${name}] 님의 마니또 링크가 복사되었습니다!`);
        });
      });

      // 미리보기 / 본인 확인 이동
      container.querySelectorAll('.btn-preview-single').forEach(btn => {
        btn.addEventListener('click', (e) => {
          sound.playPop();
          const link = e.currentTarget.dataset.link;
          window.open(link, '_blank');
        });
      });

      // 전송 완료 체크박스
      container.querySelectorAll('.chk-sent').forEach(chk => {
        chk.addEventListener('change', (e) => {
          sound.playPop();
          const giver = e.target.dataset.giver;
          const checked = e.target.checked;
          this.sentStatus[giver] = checked;
          localStorage.setItem('manito_sent_status', JSON.stringify(this.sentStatus));
          const card = e.target.closest('.member-link-card');
          if (card) card.classList.toggle('sent', checked);
        });
      });
    }

    // 마스터 뷰 블라인드 처리
    const blindNotice = document.getElementById('master-blind-notice');
    const masterSub = document.getElementById('master-spoiler-sub');
    if (this.activeRoom.isBlindMode) {
      if (blindNotice) blindNotice.classList.remove('hidden');
      if (masterSub) masterSub.textContent = '현재 블라인드 모드가 활성화되어 있습니다. 주최자도 스포일러 방지를 위해 가려져 있습니다.';
    } else {
      if (blindNotice) blindNotice.classList.add('hidden');
      if (masterSub) masterSub.textContent = '마니또 주최자가 전체 매칭 상황을 점검해야 할 때만 열어보세요.';
    }

    this.renderMasterTable();
  }

  renderMasterTable() {
    const tbody = document.getElementById('master-table-body');
    if (!tbody || !this.activeRoom) return;

    tbody.innerHTML = this.activeRoom.matches.map(m => `
      <tr>
        <td><strong>${m.giver}</strong></td>
        <td>👉</td>
        <td><strong style="color: var(--accent-amber);">${m.receiver}</strong> 님</td>
        <td>${m.pin ? `<code class="pin-code">${m.pin}</code>` : '<span style="color: var(--text-dim);">-</span>'}</td>
        <td style="color: var(--text-muted);">${m.missionText}</td>
      </tr>
    `).join('');
  }

  filterMemberCards(query) {
    const q = query.trim().toLowerCase();
    document.querySelectorAll('.member-link-card').forEach(card => {
      const name = card.dataset.name.toLowerCase();
      if (!q || name.includes(q)) {
        card.style.display = 'flex';
      } else {
        card.style.display = 'none';
      }
    });
  }

  copyRoomNoticeToClipboard() {
    if (!this.activeRoom || !this.activeRoom.roomLink) return;
    sound.playPop();

    let text = `🎁 [${this.activeRoom.roomTitle} 초대장]\n`;
    text += `우리팀 시크릿 마니또 매칭이 완료되었습니다! 🤫\n\n`;
    text += `아래 링크로 접속하여 [본인 이름]을 선택하고 본인 확인(비밀번호 4자리) 후 마니또 대상을 확인하세요!\n\n`;
    text += `🔗 참여 링크: ${this.activeRoom.roomLink}\n`;
    if (this.activeRoom.deadline) {
      text += `⏰ 활동 기간: ${this.activeRoom.deadline}\n`;
    }
    text += `\n✨ 각자 본인만 대상을 확인할 수 있도록 암호화되어 있습니다. 절대 비밀 유지! 🤐`;

    this.copyToClipboard(text, '📋 단체방 안내 공지문구가 클립보드에 복사되었습니다! 카카오톡이나 슬랙에 바로 붙여넣으세요.');
  }

  copyAllLinksToClipboard() {
    if (!this.activeRoom || !this.activeRoom.matches) return;
    sound.playPop();

    let text = `🎁 [${this.activeRoom.roomTitle} 개별 링크 안내]\n`;
    text += `쉿! 본인의 이름 옆 링크로만 접속하여 대상과 비밀 미션을 확인하세요. (절대 비밀 유지! 🤫)\n\n`;

    this.activeRoom.matches.forEach(m => {
      text += `👤 ${m.giver} 님: ${m.link}\n`;
    });

    if (this.activeRoom.deadline) {
      text += `\n⏰ 마니또 활동 기간: ${this.activeRoom.deadline}\n`;
    }
    text += `\n✨ 들키지 않고 즐겁게 팀원에게 따뜻한 마음을 전해보세요!`;

    this.copyToClipboard(text, '📋 전체 명단 링크 안내문이 복사되었습니다!');
  }

  // =========================================================================
  // VIEW 5: 🎊 마니또 릴레이 공개식 세레머니 로직 (#/ceremony)
  // =========================================================================
  initCeremonyLobby() {
    const lobby = document.getElementById('ceremony-lobby');
    const stage = document.getElementById('ceremony-stage');
    const finale = document.getElementById('ceremony-finale');

    if (lobby) lobby.classList.remove('hidden');
    if (stage) stage.classList.add('hidden');
    if (finale) finale.classList.add('hidden');

    if (!this.activeRoom || !this.activeRoom.matches) return;

    // 첫 주자 선택 버튼 그리드 렌더링
    const startersGrid = document.getElementById('ceremony-starters-grid');
    if (startersGrid) {
      const defaultStarter = this.activeRoom.matches[0].giver;
      this.selectedStarter = defaultStarter;

      startersGrid.innerHTML = this.activeRoom.matches.map(m => `
        <button type="button" class="starter-chip-btn ${m.giver === defaultStarter ? 'selected' : ''}" data-name="${m.giver}">
          <span class="starter-avatar">${m.giver.charAt(0)}</span>
          <span class="starter-name">${m.giver}</span>
        </button>
      `).join('');

      startersGrid.querySelectorAll('.starter-chip-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
          sound.playPop();
          startersGrid.querySelectorAll('.starter-chip-btn').forEach(b => b.classList.remove('selected'));
          e.currentTarget.classList.add('selected');
          this.selectedStarter = e.currentTarget.dataset.name;
        });
      });
    }
  }

  startCeremony() {
    if (!this.activeRoom || !this.activeRoom.matches) return;
    sound.playPop();

    // 꼬리에 꼬리를 무는 순환 릴레이 체인 생성
    this.ceremonyChain = buildRelayChain(this.activeRoom.matches, this.selectedStarter);
    this.ceremonyIndex = 0;
    this.ceremonyJudgments = [];

    const lobby = document.getElementById('ceremony-lobby');
    const stage = document.getElementById('ceremony-stage');
    const finale = document.getElementById('ceremony-finale');

    if (lobby) lobby.classList.add('hidden');
    if (stage) stage.classList.remove('hidden');
    if (finale) finale.classList.add('hidden');

    this.renderCeremonyCurrentStep();
  }

  renderCeremonyCurrentStep() {
    const total = this.ceremonyChain.length;
    const currentMatch = this.ceremonyChain[this.ceremonyIndex];
    if (!currentMatch) return;

    // 프로그레스 바 & 카운터 갱신
    const currentIdxEl = document.getElementById('ceremony-current-idx');
    const totalCountEl = document.getElementById('ceremony-total-count');
    const progressFill = document.getElementById('ceremony-progress-fill');

    if (currentIdxEl) currentIdxEl.textContent = this.ceremonyIndex + 1;
    if (totalCountEl) totalCountEl.textContent = total;
    if (progressFill) {
      const pct = Math.round(((this.ceremonyIndex + 1) / total) * 100);
      progressFill.style.width = `${pct}%`;
    }

    // 상단 릴레이 순환 경로 칩 렌더링
    const chainChipsEl = document.getElementById('ceremony-chain-chips');
    if (chainChipsEl) {
      chainChipsEl.innerHTML = this.ceremonyChain.map((m, idx) => {
        let statusClass = 'pending';
        if (idx < this.ceremonyIndex) statusClass = 'completed';
        else if (idx === this.ceremonyIndex) statusClass = 'current';

        return `
          <div class="chain-chip ${statusClass}">
            <span>${m.giver}</span>
            <span class="chain-arrow">👉</span>
          </div>
        `;
      }).join('') + `<div class="chain-chip loop-end"><span>${this.ceremonyChain[0].giver}</span></div>`;
    }

    // 발표자 정보 세팅
    const giverAvatarEl = document.getElementById('c-giver-avatar');
    const giverNameEl = document.getElementById('c-giver-name');
    if (giverAvatarEl) giverAvatarEl.textContent = currentMatch.giver.charAt(0);
    if (giverNameEl) giverNameEl.textContent = currentMatch.giver;

    // 무대 초기화 (마니또 가리기)
    const boxUnrevealed = document.getElementById('c-box-unrevealed');
    const boxRevealed = document.getElementById('c-box-revealed');
    if (boxUnrevealed) boxUnrevealed.classList.remove('hidden');
    if (boxRevealed) boxRevealed.classList.add('hidden');

    // 판정 UI 초기화
    const judgmentSection = document.getElementById('c-judgment-section');
    const stampResultBox = document.getElementById('c-stamp-result-box');
    if (judgmentSection) judgmentSection.classList.remove('hidden');
    if (stampResultBox) stampResultBox.classList.add('hidden');
  }

  revealCeremonyTarget() {
    const currentMatch = this.ceremonyChain[this.ceremonyIndex];
    if (!currentMatch) return;

    sound.playDrumroll();

    const boxUnrevealed = document.getElementById('c-box-unrevealed');
    const boxRevealed = document.getElementById('c-box-revealed');

    setTimeout(() => {
      sound.playFanfare();
      if (this.confetti) {
        this.confetti.fire(90);
      }

      if (boxUnrevealed) boxUnrevealed.classList.add('hidden');
      if (boxRevealed) boxRevealed.classList.remove('hidden');

      // 대상자 정보 채우기
      const receiverNameEl = document.getElementById('c-receiver-name');
      const promptGiverEl = document.getElementById('c-prompt-giver');
      const promptReceiverEl = document.getElementById('c-prompt-receiver');
      const judgeReceiverEl = document.getElementById('c-judge-receiver-name');

      if (receiverNameEl) receiverNameEl.textContent = currentMatch.receiver;
      if (promptGiverEl) promptGiverEl.textContent = currentMatch.giver;
      if (promptReceiverEl) promptReceiverEl.textContent = currentMatch.receiver;
      if (judgeReceiverEl) judgeReceiverEl.textContent = currentMatch.receiver;

      // 미션 정보 채우기
      const missionTextEl = document.getElementById('c-mission-text');
      const missionTipEl = document.getElementById('c-mission-tip');
      if (missionTextEl) missionTextEl.textContent = `"${currentMatch.missionText}"`;
      if (missionTipEl) {
        if (currentMatch.missionTip) {
          missionTipEl.textContent = `💡 TIP: ${currentMatch.missionTip}`;
          missionTipEl.classList.remove('hidden');
        } else {
          missionTipEl.classList.add('hidden');
        }
      }
    }, 600);
  }

  judgeCeremonyMission(resultType) {
    const currentMatch = this.ceremonyChain[this.ceremonyIndex];
    if (!currentMatch) return;

    sound.playStamp();

    // 결과 기록
    this.ceremonyJudgments[this.ceremonyIndex] = {
      giver: currentMatch.giver,
      receiver: currentMatch.receiver,
      missionText: currentMatch.missionText,
      result: resultType
    };

    // 도장 스탬프 마크 UI 업데이트
    const stampMark = document.getElementById('c-stamp-mark');
    if (stampMark) {
      stampMark.className = `stamp-mark stamp-${resultType}`;
      if (resultType === 'success') {
        stampMark.textContent = '💮 SUCCESS';
        if (this.confetti) this.confetti.fire(120);
      } else if (resultType === 'effort') {
        stampMark.textContent = '🤔 EFFORT';
      } else {
        stampMark.textContent = '😂 BUSTED';
      }
    }

    // 다음 바통 주자 안내 (마지막 사람인지 확인)
    const isLast = this.ceremonyIndex === this.ceremonyChain.length - 1;
    const nextGiverNameEl = document.getElementById('c-next-giver-name');
    const btnNextNameEl = document.getElementById('c-btn-next-name');
    const btnCNextStep = document.getElementById('btn-c-next-step');

    if (isLast) {
      if (nextGiverNameEl) nextGiverNameEl.textContent = '모든 릴레이 완료!';
      if (btnCNextStep) {
        btnCNextStep.innerHTML = '<span>🏆 최종 릴레이 완주 축하 피날레 보기! 🎊</span>';
      }
    } else {
      const nextGiver = currentMatch.receiver;
      if (nextGiverNameEl) nextGiverNameEl.textContent = nextGiver;
      if (btnNextNameEl) btnNextNameEl.textContent = nextGiver;
      if (btnCNextStep) {
        btnCNextStep.innerHTML = `<span>다음 주자(<strong>${nextGiver}</strong>)에게 바통 넘기기 ➡️</span>`;
      }
    }

    // 판정 섹션 전환
    const judgmentSection = document.getElementById('c-judgment-section');
    const stampResultBox = document.getElementById('c-stamp-result-box');
    if (judgmentSection) judgmentSection.classList.add('hidden');
    if (stampResultBox) stampResultBox.classList.remove('hidden');
  }

  advanceCeremonyStep() {
    sound.playPop();
    this.ceremonyIndex++;

    if (this.ceremonyIndex < this.ceremonyChain.length) {
      this.renderCeremonyCurrentStep();
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } else {
      this.renderCeremonyFinale();
    }
  }

  renderCeremonyFinale() {
    const stage = document.getElementById('ceremony-stage');
    const finale = document.getElementById('ceremony-finale');

    if (stage) stage.classList.add('hidden');
    if (finale) finale.classList.remove('hidden');

    sound.playCheer();
    if (this.confetti) {
      this.confetti.fire(200);
      setTimeout(() => this.confetti.fire(150), 600);
    }

    // 통계 계산
    const successCount = this.ceremonyJudgments.filter(j => j && j.result === 'success').length;
    const effortCount = this.ceremonyJudgments.filter(j => j && j.result === 'effort').length;
    const failCount = this.ceremonyJudgments.filter(j => j && j.result === 'fail').length;

    const elSuccess = document.getElementById('stat-success-count');
    const elEffort = document.getElementById('stat-effort-count');
    const elFail = document.getElementById('stat-fail-count');

    if (elSuccess) elSuccess.textContent = successCount;
    if (elEffort) elEffort.textContent = effortCount;
    if (elFail) elFail.textContent = failCount;

    // 히스토리 테이블 채우기
    const tbody = document.getElementById('finale-history-tbody');
    if (tbody) {
      tbody.innerHTML = this.ceremonyJudgments.map(j => {
        let badge = '';
        if (j.result === 'success') {
          badge = '<span class="history-badge success">💮 완벽 성공</span>';
        } else if (j.result === 'effort') {
          badge = '<span class="history-badge effort">🤔 노력 인정</span>';
        } else {
          badge = '<span class="history-badge fail">😂 실패</span>';
        }

        return `
          <tr>
            <td><strong>${j.giver}</strong></td>
            <td>👉</td>
            <td><strong style="color: var(--accent-amber);">${j.receiver}</strong> 님</td>
            <td style="color: var(--text-muted);">${j.missionText}</td>
            <td>${badge}</td>
          </tr>
        `;
      }).join('');
    }
  }

  // =========================================================================
  // VIEW 4: 단체방 공용 룸 접속 로직 (#/room)
  // =========================================================================
  loadRoomView(roomToken) {
    const inspected = inspectRoomBundle(roomToken);
    if (!inspected.success) {
      alert(inspected.error || '유효하지 않은 마니또 방 링크입니다.');
      window.location.hash = '#/setup';
      return;
    }

    const titleEl = document.getElementById('room-view-title');
    const infoEl = document.getElementById('room-view-info');
    if (titleEl) titleEl.textContent = inspected.roomTitle || '우리팀 시크릿 마니또';
    if (infoEl) infoEl.textContent = inspected.deadline ? `활동 기간: ${inspected.deadline}` : '쉿! 본인의 이름을 선택하여 마니또 대상을 확인하세요.';

    const grid = document.getElementById('room-members-grid');
    if (!grid) return;

    grid.innerHTML = inspected.members.map(m => `
      <button type="button" class="room-member-btn" data-name="${m.name}">
        <span class="room-member-avatar">${m.name.charAt(0)}</span>
        <span class="room-member-name">${m.name}</span>
        <span class="room-lock-icon">${m.hasPin ? '🔒' : '👉'}</span>
      </button>
    `).join('');

    grid.querySelectorAll('.room-member-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        sound.playPop();
        const memberName = e.currentTarget.dataset.name;
        this.selectRoomMember(roomToken, memberName);
      });
    });
  }

  selectRoomMember(roomToken, memberName) {
    this.pendingRoomToken = roomToken;
    this.pendingMemberName = memberName;
    this.pendingToken = null;

    this.switchView('view-reveal');

    const inspected = inspectRoomBundle(roomToken);
    const member = inspected.members?.find(m => m.name === memberName);
    const existingPinHash = getLocalMemberPinHash(roomToken, memberName);

    if (member && member.hasPin) {
      // 주최자가 사전에 PIN을 정했던 경우 (하위 호환)
      this.showPinGate(memberName, false, '');
    } else if (existingPinHash) {
      // 이미 본인 비밀번호를 설정한 경우 -> 잠금 해제 입력
      this.showPinGate(memberName, false, existingPinHash);
    } else {
      // 아직 비밀번호가 등록되지 않은 신규 참가자 -> 본인 비밀번호 셀프 등록 모드!
      this.showPinGate(memberName, true, '');
    }
  }

  // =========================================================================
  // VIEW 3: 참가자 마니또 개봉 & PIN 잠금 게이트 로직
  // =========================================================================
  loadIndividualReveal(token) {
    this.pendingToken = token;
    this.pendingRoomToken = null;
    this.pendingMemberName = null;

    const inspected = inspectToken(token);
    if (!inspected.success) {
      alert(inspected.error || '유효하지 않은 마니또 링크입니다.');
      window.location.hash = '#/setup';
      return;
    }

    this.pendingMemberName = inspected.giver;
    const existingPinHash = getLocalMemberPinHash('single', inspected.giver);

    if (inspected.hasPin) {
      this.showPinGate(inspected.giver, false, '');
    } else if (existingPinHash) {
      this.showPinGate(inspected.giver, false, existingPinHash);
    } else {
      this.showPinGate(inspected.giver, true, '');
    }
  }

  showPinGate(memberName, isSetupMode = false, expectedHash = '') {
    this.currentPin = '';
    this.pinSetupMode = isSetupMode;
    this.pinSetupStep = 1;
    this.pinFirstInput = '';
    this.expectedPinHash = expectedHash;
    this.updatePinDots();

    const gate = document.getElementById('reveal-pin-gate');
    const stage = document.getElementById('reveal-content-stage');
    const targetNameEl = document.getElementById('pin-target-user-name');
    const errorText = document.getElementById('pin-error-text');

    if (targetNameEl) targetNameEl.textContent = memberName;
    if (errorText) errorText.classList.add('hidden');
    if (gate) gate.classList.remove('hidden');
    if (stage) stage.classList.add('hidden');

    const giverNameEl = document.getElementById('reveal-giver-name');
    if (giverNameEl) giverNameEl.textContent = memberName;

    const badgeEl = document.getElementById('pin-gate-badge');
    const titleEl = document.getElementById('pin-gate-title');
    const descEl = document.getElementById('pin-gate-desc');
    const stepGuide = document.getElementById('pin-step-guide');
    const footerHint = document.getElementById('pin-footer-hint');
    const iconWrap = document.getElementById('pin-icon-wrap');

    if (isSetupMode) {
      if (iconWrap) iconWrap.textContent = '✨';
      if (badgeEl) badgeEl.textContent = '🔒 본인 비밀번호 신규 설정';
      if (titleEl) titleEl.textContent = `${memberName}님, 비밀번호를 설정해주세요`;
      if (descEl) {
        descEl.innerHTML = `
          오직 <strong>${memberName}</strong>님만 마니또를 열어볼 수 있도록 <strong>본인만의 4자리 비밀번호</strong>를 등록합니다.<br>
          <span style="color: var(--accent-amber); font-size: 0.85rem;">※ 주최자나 타인은 이 비밀번호를 절대 알 수 없습니다.</span>
        `;
      }
      if (stepGuide) {
        stepGuide.textContent = '✨ 1단계: 사용할 4자리 비밀번호를 입력해주세요';
        stepGuide.classList.remove('hidden');
      }
      if (footerHint) footerHint.textContent = '💡 앞으로 본인 마니또를 확인할 때 사용할 4자리 번호입니다.';
    } else {
      if (iconWrap) iconWrap.textContent = '🔒';
      if (badgeEl) badgeEl.textContent = '🔒 개인 비밀번호 확인';
      if (titleEl) titleEl.textContent = '본인 확인이 필요합니다';
      if (descEl) {
        descEl.innerHTML = `
          <strong>${memberName}</strong>님 본인만 결과를 볼 수 있도록 암호화되어 있습니다.<br>
          설정하신 <strong>4자리 비밀번호</strong>를 입력해주세요.
        `;
      }
      if (stepGuide) stepGuide.classList.add('hidden');
      if (footerHint) footerHint.textContent = '💡 본인만 알 수 있는 4자리 비밀번호입니다. (주최자도 알 수 없습니다)';
    }
  }

  handlePinKeyInput(key) {
    sound.playPop();

    if (key === 'clear') {
      this.currentPin = '';
      if (this.pinSetupMode && this.pinSetupStep === 2) {
        this.pinSetupStep = 1;
        this.pinFirstInput = '';
        const stepGuide = document.getElementById('pin-step-guide');
        if (stepGuide) stepGuide.textContent = '✨ 1단계: 사용할 4자리 비밀번호를 입력해주세요';
      }
    } else if (key === 'back') {
      this.currentPin = this.currentPin.slice(0, -1);
    } else if (key >= '0' && key <= '9') {
      if (this.currentPin.length < 4) {
        this.currentPin += key;
      }
    }

    this.updatePinDots();

    if (this.currentPin.length === 4) {
      setTimeout(() => {
        this.verifyAndUnlockPin(this.currentPin);
      }, 120);
    }
  }

  updatePinDots() {
    for (let i = 0; i < 4; i++) {
      const dot = document.getElementById(`p-dot-${i}`);
      if (dot) {
        dot.classList.toggle('filled', i < this.currentPin.length);
      }
    }
  }

  verifyAndUnlockPin(pin) {
    const errorText = document.getElementById('pin-error-text');
    const gateCard = document.querySelector('.pin-gate-card');
    const stepGuide = document.getElementById('pin-step-guide');

    // 1. 신규 셀프 비밀번호 설정 모드인 경우
    if (this.pinSetupMode) {
      if (this.pinSetupStep === 1) {
        // 1단계 완료 -> 2단계(확인 재입력)로 이동
        sound.playChime();
        this.pinFirstInput = pin;
        this.pinSetupStep = 2;
        this.currentPin = '';
        this.updatePinDots();
        if (errorText) errorText.classList.add('hidden');
        if (stepGuide) stepGuide.textContent = '✨ 2단계: 확인을 위해 한 번 더 입력해주세요';
        return;
      } else if (this.pinSetupStep === 2) {
        // 2단계 완료 -> 두 입력값 일치 여부 검사
        if (pin === this.pinFirstInput) {
          // 일치! 로컬스토리지에 해시 저장
          const roomKey = this.pendingRoomToken || 'single';
          setLocalMemberPinHash(roomKey, this.pendingMemberName, pin);

          // 데이터 복호화 진행
          let result = null;
          if (this.pendingRoomToken && this.pendingMemberName) {
            result = decodeMemberFromBundle(this.pendingRoomToken, this.pendingMemberName, pin);
          } else if (this.pendingToken) {
            result = decodeToken(this.pendingToken, pin);
          }

          if (result && result.success) {
            sound.playFanfare();
            if (this.confetti) this.confetti.fire(120);
            if (errorText) errorText.classList.add('hidden');

            const gate = document.getElementById('reveal-pin-gate');
            const stage = document.getElementById('reveal-content-stage');
            if (gate) gate.classList.add('hidden');
            if (stage) stage.classList.remove('hidden');

            this.showToast(`🎉 ${this.pendingMemberName}님의 4자리 비밀번호가 안전하게 등록되었습니다!`);
            this.displayRevealResult(result.data);
            return;
          }
        }

        // 불일치 시
        sound.playPop();
        if (errorText) {
          errorText.textContent = '❌ 비밀번호가 일치하지 않습니다. 처음부터 다시 설정해주세요.';
          errorText.classList.remove('hidden');
        }
        if (gateCard) {
          gateCard.classList.remove('shake');
          void gateCard.offsetWidth;
          gateCard.classList.add('shake');
        }
        this.pinSetupStep = 1;
        this.pinFirstInput = '';
        this.currentPin = '';
        this.updatePinDots();
        if (stepGuide) stepGuide.textContent = '✨ 1단계: 사용할 4자리 비밀번호를 입력해주세요';
        return;
      }
    }

    // 2. 이미 등록된 비밀번호 확인(잠금 해제) 모드인 경우
    if (this.expectedPinHash) {
      const roomKey = this.pendingRoomToken || 'single';
      const isValid = verifyMemberPin(roomKey, this.pendingMemberName, pin, this.expectedPinHash);
      if (!isValid) {
        sound.playPop();
        if (errorText) {
          errorText.textContent = '❌ 비밀번호가 일치하지 않습니다. 다시 확인해주세요.';
          errorText.classList.remove('hidden');
        }
        if (gateCard) {
          gateCard.classList.remove('shake');
          void gateCard.offsetWidth;
          gateCard.classList.add('shake');
        }
        this.currentPin = '';
        this.updatePinDots();
        return;
      }
    }

    // 복호화 실행
    let result = null;
    if (this.pendingRoomToken && this.pendingMemberName) {
      result = decodeMemberFromBundle(this.pendingRoomToken, this.pendingMemberName, pin);
    } else if (this.pendingToken) {
      result = decodeToken(this.pendingToken, pin);
    }

    if (result && result.success) {
      sound.playFanfare();
      if (errorText) errorText.classList.add('hidden');

      const gate = document.getElementById('reveal-pin-gate');
      const stage = document.getElementById('reveal-content-stage');

      if (gate) gate.classList.add('hidden');
      if (stage) stage.classList.remove('hidden');

      this.displayRevealResult(result.data);
    } else {
      sound.playPop();
      if (errorText) {
        errorText.textContent = '❌ 비밀번호가 일치하지 않습니다. 다시 확인해주세요.';
        errorText.classList.remove('hidden');
      }

      if (gateCard) {
        gateCard.classList.remove('shake');
        void gateCard.offsetWidth;
        gateCard.classList.add('shake');
      }

      this.currentPin = '';
      this.updatePinDots();
    }
  }

  displayRevealResult(data) {
    this.activeRevealData = data;

    const giverNameEl = document.getElementById('reveal-giver-name');
    if (giverNameEl) giverNameEl.textContent = data.giver;

    const roomInfoEl = document.getElementById('reveal-room-info');
    if (roomInfoEl) {
      roomInfoEl.textContent = `${data.roomTitle || '우리팀 시크릿 마니또'} ${data.deadline ? `• ${data.deadline}` : ''}`;
    }

    const targetNameEl = document.getElementById('result-target-name');
    if (targetNameEl) targetNameEl.textContent = data.receiver;

    const missionTextEl = document.getElementById('result-mission-text');
    if (missionTextEl) missionTextEl.textContent = `"${data.missionText}"`;

    const scratchUnderTarget = document.getElementById('scratch-under-target');
    if (scratchUnderTarget) scratchUnderTarget.textContent = data.receiver;

    const scratchUnderMission = document.getElementById('scratch-under-mission');
    if (scratchUnderMission) scratchUnderMission.textContent = `"${data.missionText}"`;

    const missionTipEl = document.getElementById('result-mission-tip');
    if (missionTipEl) {
      if (data.missionTip) {
        missionTipEl.textContent = `💡 TIP: ${data.missionTip}`;
        missionTipEl.classList.remove('hidden');
      } else {
        missionTipEl.classList.add('hidden');
      }
    }

    const deadlineWrap = document.getElementById('result-deadline-wrap');
    const deadlineText = document.getElementById('result-deadline-text');
    if (deadlineWrap && deadlineText) {
      if (data.deadline) {
        deadlineText.textContent = `활동 기간: ${data.deadline}`;
        deadlineWrap.classList.remove('hidden');
      } else {
        deadlineWrap.classList.add('hidden');
      }
    }

    this.resetRevealStage();
  }

  resetRevealStage() {
    const unboxWrap = document.getElementById('unbox-box-wrap');
    const scratchWrap = document.getElementById('scratch-box-wrap');
    const resultCard = document.getElementById('revealed-result-card');
    const giftBox = document.getElementById('interactive-gift-box');

    if (resultCard) resultCard.classList.add('hidden');
    if (giftBox) giftBox.classList.remove('opened');

    if (this.activeRevealMode === 'unbox') {
      if (unboxWrap) unboxWrap.classList.remove('hidden');
      if (scratchWrap) scratchWrap.classList.add('hidden');
    } else {
      if (unboxWrap) unboxWrap.classList.add('hidden');
      if (scratchWrap) scratchWrap.classList.remove('hidden');
      setTimeout(() => {
        this.initScratchCard();
      }, 50);
    }
  }

  setRevealMode(mode) {
    this.activeRevealMode = mode;
    const btnUnbox = document.getElementById('btn-mode-unbox');
    const btnScratch = document.getElementById('btn-mode-scratch');

    if (btnUnbox) btnUnbox.classList.toggle('active', mode === 'unbox');
    if (btnScratch) btnScratch.classList.toggle('active', mode === 'scratch');

    this.resetRevealStage();
  }

  openGiftBox() {
    const giftBox = document.getElementById('interactive-gift-box');
    const unboxWrap = document.getElementById('unbox-box-wrap');
    const resultCard = document.getElementById('revealed-result-card');

    if (!giftBox || giftBox.classList.contains('opened')) return;

    sound.playFanfare();
    giftBox.classList.add('opened');

    setTimeout(() => {
      if (unboxWrap) unboxWrap.classList.add('hidden');
      if (resultCard) resultCard.classList.remove('hidden');
      if (this.confetti) {
        this.confetti.fire(150);
      }
    }, 450);
  }

  initScratchCard() {
    const canvas = document.getElementById('scratch-canvas');
    if (!canvas) return;

    if (this.scratchCard) {
      this.scratchCard.reset();
    } else {
      this.scratchCard = new ScratchCard(canvas, {
        brushSize: 34,
        revealThreshold: 0.38,
        onComplete: () => {
          sound.playFanfare();
          const scratchWrap = document.getElementById('scratch-box-wrap');
          const resultCard = document.getElementById('revealed-result-card');
          if (scratchWrap) scratchWrap.classList.add('hidden');
          if (resultCard) resultCard.classList.remove('hidden');
          if (this.confetti) {
            this.confetti.fire(150);
          }
        }
      });
    }
  }

  // =========================================================================
  // 클립보드 & 유틸리티
  // =========================================================================
  copyToClipboard(text, successMsg = '클립보드에 복사되었습니다.') {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(() => {
        this.showToast(successMsg);
      }).catch(() => {
        this.fallbackCopy(text, successMsg);
      });
    } else {
      this.fallbackCopy(text, successMsg);
    }
  }

  fallbackCopy(text, successMsg) {
    const textarea = document.createElement('textarea');
    textarea.value = text;
    textarea.style.position = 'fixed';
    textarea.style.opacity = '0';
    document.body.appendChild(textarea);
    textarea.select();
    try {
      document.execCommand('copy');
      this.showToast(successMsg);
    } catch (e) {
      prompt('다음 텍스트를 복사하세요:', text);
    }
    document.body.removeChild(textarea);
  }

  showToast(message) {
    const container = document.getElementById('toast-container');
    if (!container) return;

    const toast = document.createElement('div');
    toast.className = 'toast';
    toast.textContent = message;
    container.appendChild(toast);

    setTimeout(() => {
      if (toast.parentElement) {
        toast.parentElement.removeChild(toast);
      }
    }, 3000);
  }
}

// 애플리케이션 진입
window.addEventListener('DOMContentLoaded', () => {
  window.manitoApp = new ManitoApp();
});
