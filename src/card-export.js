/**
 * 마니또 결과 카드 고해상도 이미지(PNG) 내보내기 모듈
 * 참가자가 본인 기기 갤러리에 안전하게 저장할 수 있도록 미려한 그래픽 카드를 렌더링합니다.
 */

export function exportResultCard(data) {
  const canvas = document.createElement('canvas');
  const width = 800;
  const height = 1050;
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');

  // 1. 다크 프리미엄 배경 그라디언트
  const bgGrad = ctx.createLinearGradient(0, 0, width, height);
  bgGrad.addColorStop(0, '#0f172a');
  bgGrad.addColorStop(0.4, '#1e1b4b');
  bgGrad.addColorStop(1, '#0b0f19');
  ctx.fillStyle = bgGrad;
  ctx.fillRect(0, 0, width, height);

  // 2. 부드러운 네온 오브(Glow Orbs)
  const glow1 = ctx.createRadialGradient(200, 200, 10, 200, 200, 350);
  glow1.addColorStop(0, 'rgba(139, 92, 246, 0.28)');
  glow1.addColorStop(1, 'rgba(139, 92, 246, 0)');
  ctx.fillStyle = glow1;
  ctx.fillRect(0, 0, width, height);

  const glow2 = ctx.createRadialGradient(650, 750, 10, 650, 750, 350);
  glow2.addColorStop(0, 'rgba(236, 72, 153, 0.22)');
  glow2.addColorStop(1, 'rgba(236, 72, 153, 0)');
  ctx.fillStyle = glow2;
  ctx.fillRect(0, 0, width, height);

  // 3. 카드 테두리 및 글래스 프레임
  ctx.save();
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.18)';
  ctx.lineWidth = 2;
  ctx.fillStyle = 'rgba(255, 255, 255, 0.04)';
  roundRect(ctx, 40, 40, width - 80, height - 80, 28);
  ctx.fill();
  ctx.stroke();
  ctx.restore();

  // 4. 헤더 뱃지
  ctx.save();
  ctx.fillStyle = 'rgba(139, 92, 246, 0.25)';
  ctx.strokeStyle = '#8b5cf6';
  ctx.lineWidth = 1.5;
  roundRect(ctx, width / 2 - 130, 75, 260, 44, 22);
  ctx.fill();
  ctx.stroke();

  ctx.font = 'bold 16px Pretendard, sans-serif';
  ctx.fillStyle = '#c4b5fd';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('SECRET MANITO CARD', width / 2, 97);
  ctx.restore();

  // 5. 방 제목 & 참가자 인사
  ctx.font = 'bold 36px Pretendard, sans-serif';
  ctx.fillStyle = '#ffffff';
  ctx.textAlign = 'center';
  ctx.fillText(data.roomTitle || '우리팀 시크릿 마니또', width / 2, 175);

  ctx.font = '500 20px Pretendard, sans-serif';
  ctx.fillStyle = '#94a3b8';
  ctx.fillText(`${data.giver} 님의 마니또 지령서`, width / 2, 215);

  // 구분선
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.1)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(90, 250);
  ctx.lineTo(width - 90, 250);
  ctx.stroke();

  // 6. 마니또 대상 섹션 (타겟)
  ctx.font = 'bold 18px Pretendard, sans-serif';
  ctx.fillStyle = '#f59e0b';
  ctx.fillText('👑 나의 마니또 대상 (챙겨줄 사람)', width / 2, 305);

  // 타겟 이름 하이라이트 박스
  ctx.save();
  const nameGrad = ctx.createLinearGradient(120, 335, width - 120, 435);
  nameGrad.addColorStop(0, 'rgba(245, 158, 11, 0.15)');
  nameGrad.addColorStop(1, 'rgba(236, 72, 153, 0.15)');
  ctx.fillStyle = nameGrad;
  ctx.strokeStyle = 'rgba(245, 158, 11, 0.4)';
  ctx.lineWidth = 2;
  roundRect(ctx, 120, 335, width - 240, 100, 20);
  ctx.fill();
  ctx.stroke();

  ctx.font = 'bold 44px Pretendard, sans-serif';
  ctx.fillStyle = '#ffffff';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(`${data.receiver} 님`, width / 2, 385);
  ctx.restore();

  // 7. 비밀 미션 섹션
  ctx.font = 'bold 18px Pretendard, sans-serif';
  ctx.fillStyle = '#38bdf8';
  ctx.textAlign = 'center';
  ctx.fillText('🎯 나의 비밀 미션', width / 2, 490);

  // 미션 박스
  ctx.save();
  ctx.fillStyle = 'rgba(15, 23, 42, 0.6)';
  ctx.strokeStyle = 'rgba(56, 189, 248, 0.3)';
  ctx.lineWidth = 1.5;
  roundRect(ctx, 90, 520, width - 180, 210, 20);
  ctx.fill();
  ctx.stroke();

  // 미션 텍스트 줄바꿈 렌더링
  ctx.font = 'bold 22px Pretendard, sans-serif';
  ctx.fillStyle = '#f8fafc';
  ctx.textAlign = 'center';
  wrapText(ctx, `"${data.missionText}"`, width / 2, 590, width - 240, 32);

  if (data.missionTip) {
    ctx.font = '16px Pretendard, sans-serif';
    ctx.fillStyle = '#94a3b8';
    wrapText(ctx, `💡 TIP: ${data.missionTip}`, width / 2, 675, width - 250, 24);
  }
  ctx.restore();

  // 8. 활동 기간 및 규칙
  if (data.deadline) {
    ctx.font = '16px Pretendard, sans-serif';
    ctx.fillStyle = '#a855f7';
    ctx.textAlign = 'center';
    ctx.fillText(`⏰ 활동 기간: ${data.deadline}`, width / 2, 780);
  }

  // 9. 주의사항 푸터
  ctx.font = '14px Pretendard, sans-serif';
  ctx.fillStyle = '#64748b';
  ctx.textAlign = 'center';
  ctx.fillText('🤫 마니또가 끝날 때까지 절대 들키지 마세요!', width / 2, 850);
  ctx.fillText('본 이미지는 본인만 보관하는 개인 비밀 카드입니다.', width / 2, 875);

  // 10. 파일 다운로드 트리거
  const link = document.createElement('a');
  link.download = `마니또_지령서_${data.giver}.png`;
  link.href = canvas.toDataURL('image/png');
  link.click();
}

function roundRect(ctx, x, y, width, height, radius) {
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.lineTo(x + width - radius, y);
  ctx.quadraticCurveTo(x + width, y, x + width, y + radius);
  ctx.lineTo(x + width, y + height - radius);
  ctx.quadraticCurveTo(x + width, y + height, x + width - radius, y + height);
  ctx.lineTo(x + radius, y + height);
  ctx.quadraticCurveTo(x, y + height, x, y + height - radius);
  ctx.lineTo(x, y + radius);
  ctx.quadraticCurveTo(x, y, x + radius, y);
  ctx.closePath();
}

function wrapText(ctx, text, x, y, maxWidth, lineHeight) {
  const words = text.split(' ');
  let line = '';
  let curY = y;

  for (let n = 0; n < words.length; n++) {
    const testLine = line + words[n] + ' ';
    const metrics = ctx.measureText(testLine);
    const testWidth = metrics.width;
    if (testWidth > maxWidth && n > 0) {
      ctx.fillText(line.trim(), x, curY);
      line = words[n] + ' ';
      curY += lineHeight;
    } else {
      line = testLine;
    }
  }
  ctx.fillText(line.trim(), x, curY);
}
