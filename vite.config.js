import { defineConfig } from 'vite';

export default defineConfig({
  base: './', // GitHub Pages 등 서브디렉토리 호스팅을 위한 상대 경로 설정
  server: {
    host: '0.0.0.0',
    port: 5173,
    allowedHosts: true // 모든 외부 호스트(터널링, 로컬 IP 등) 접속 허용
  }
});
