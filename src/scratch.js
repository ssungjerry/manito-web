/**
 * 인터랙티브 스크래치 복권 캔버스 모듈
 * 모바일 터치 및 데스크톱 마우스 드래그를 지원하며,
 * 일정 비율 이상 긁히면 자동으로 잔여 레이어가 부드럽게 사라집니다.
 */

import { sound } from './sound.js';

export class ScratchCard {
  constructor(canvas, options = {}) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.options = {
      brushSize: 32,
      revealThreshold: 0.42, // 42% 이상 긁히면 자동 오픈
      onScratchStart: () => {},
      onComplete: () => {},
      ...options
    };

    this.isDrawing = false;
    this.isCompleted = false;
    this.lastCheck = 0;
    this.lastSoundTime = 0;

    this.initCanvas();
    this.bindEvents();
  }

  initCanvas() {
    const parent = this.canvas.parentElement;
    const rect = this.canvas.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    const width = rect.width || (parent ? parent.clientWidth : 380) || 380;
    const height = rect.height || (parent ? parent.clientHeight : 270) || 270;

    this.canvas.width = width * dpr;
    this.canvas.height = height * dpr;
    this.ctx.scale(dpr, dpr);

    this.drawFoil(width, height);
  }

  drawFoil(width, height) {
    this.ctx.save();
    this.ctx.globalCompositeOperation = 'source-over';

    // 럭셔리 골드 & 브론즈 메탈릭 그라디언트
    const grad = this.ctx.createLinearGradient(0, 0, width, height);
    grad.addColorStop(0, '#b45309');
    grad.addColorStop(0.2, '#f59e0b');
    grad.addColorStop(0.45, '#fef08a');
    grad.addColorStop(0.55, '#f59e0b');
    grad.addColorStop(0.8, '#d97706');
    grad.addColorStop(1, '#92400e');

    this.ctx.fillStyle = grad;
    this.ctx.fillRect(0, 0, width, height);

    // 반짝이 파티클 및 별 패턴 추가
    this.ctx.fillStyle = 'rgba(255, 255, 255, 0.3)';
    for (let i = 0; i < 45; i++) {
      const x = Math.random() * width;
      const y = Math.random() * height;
      const r = 1 + Math.random() * 2.5;
      this.ctx.beginPath();
      this.ctx.arc(x, y, r, 0, Math.PI * 2);
      this.ctx.fill();
    }

    // 은은한 사선 스트라이프 패턴
    this.ctx.strokeStyle = 'rgba(255, 255, 255, 0.12)';
    this.ctx.lineWidth = 3;
    for (let i = -width; i < width * 2; i += 20) {
      this.ctx.beginPath();
      this.ctx.moveTo(i, 0);
      this.ctx.lineTo(i + height, height);
      this.ctx.stroke();
    }

    // 중앙 안내 텍스트 & 아이콘
    this.ctx.fillStyle = '#78350f';
    this.ctx.font = 'bold 18px Pretendard, -apple-system, sans-serif';
    this.ctx.textAlign = 'center';
    this.ctx.textBaseline = 'middle';
    this.ctx.fillText('🪙 마니또 복권 스크래치 🪙', width / 2, height / 2 - 14);

    this.ctx.font = '600 13px Pretendard, -apple-system, sans-serif';
    this.ctx.fillStyle = '#451a03';
    this.ctx.fillText('✨ 손가락이나 마우스로 긁어 대상을 확인하세요 ✨', width / 2, height / 2 + 14);

    this.ctx.restore();
  }

  bindEvents() {
    const handleStart = (e) => {
      if (this.isCompleted) return;
      this.isDrawing = true;
      this.options.onScratchStart();
      this.scratch(e);
    };

    const handleMove = (e) => {
      if (!this.isDrawing || this.isCompleted) return;
      this.scratch(e);
      e.preventDefault();
    };

    const handleEnd = () => {
      this.isDrawing = false;
      this.checkProgress();
    };

    // 마우스 이벤트
    this.canvas.addEventListener('mousedown', handleStart);
    window.addEventListener('mousemove', handleMove);
    window.addEventListener('mouseup', handleEnd);

    // 터치 이벤트 (모바일)
    this.canvas.addEventListener('touchstart', handleStart, { passive: false });
    window.addEventListener('touchmove', handleMove, { passive: false });
    window.addEventListener('touchend', handleEnd);
  }

  scratch(e) {
    const rect = this.canvas.getBoundingClientRect();
    let clientX, clientY;

    if (e.touches && e.touches.length > 0) {
      clientX = e.touches[0].clientX;
      clientY = e.touches[0].clientY;
    } else {
      clientX = e.clientX;
      clientY = e.clientY;
    }

    const x = clientX - rect.left;
    const y = clientY - rect.top;

    this.ctx.save();
    this.ctx.globalCompositeOperation = 'destination-out';
    this.ctx.beginPath();
    this.ctx.arc(x, y, this.options.brushSize, 0, Math.PI * 2);
    this.ctx.fill();
    this.ctx.restore();

    // 사운드 쓰로틀링
    const now = Date.now();
    if (now - this.lastSoundTime > 90) {
      sound.playScratchTick();
      this.lastSoundTime = now;
    }

    // 진척도 확인 주기적 호출
    if (now - this.lastCheck > 250) {
      this.checkProgress();
      this.lastCheck = now;
    }
  }

  checkProgress() {
    if (this.isCompleted) return;

    const width = this.canvas.width;
    const height = this.canvas.height;
    if (width === 0 || height === 0) return;

    try {
      const imageData = this.ctx.getImageData(0, 0, width, height);
      const data = imageData.data;
      let clearPixels = 0;
      const step = 16; // 성능을 위해 16픽셀 단위 샘플링
      let totalSamples = 0;

      for (let i = 3; i < data.length; i += 4 * step) {
        totalSamples++;
        if (data[i] < 128) {
          clearPixels++;
        }
      }

      const ratio = clearPixels / totalSamples;

      if (ratio >= this.options.revealThreshold) {
        this.revealAll();
      }
    } catch (err) {
      console.warn('Canvas check error:', err);
    }
  }

  revealAll() {
    if (this.isCompleted) return;
    this.isCompleted = true;

    // 부드럽게 페이드아웃 효과
    this.canvas.style.transition = 'opacity 0.45s ease-out, transform 0.45s ease-out';
    this.canvas.style.opacity = '0';
    this.canvas.style.transform = 'scale(1.04)';
    this.canvas.style.pointerEvents = 'none';

    setTimeout(() => {
      this.options.onComplete();
    }, 300);
  }

  reset() {
    this.isCompleted = false;
    this.isDrawing = false;
    this.canvas.style.transition = 'none';
    this.canvas.style.opacity = '1';
    this.canvas.style.transform = 'none';
    this.canvas.style.pointerEvents = 'auto';
    this.initCanvas();
  }
}
