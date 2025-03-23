import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  optimizeDeps: {
    exclude: ['lucide-react'],
  },
  server: {
    host: true, // Слушаем все интерфейсы
    proxy: {
      '/api': {
        target: 'http://localhost:3000',
        changeOrigin: true,
      },
    },
    // Добавляем настройки для hot reload
    hmr: {
      overlay: true,
      // Добавляем поддержку HMR через WebSocket
      protocol: 'ws',
      host: 'localhost',
    },
    // Полностью отключаем автоматическое открытие браузера
    open: false,
    // Автоматически перезагружать при изменениях
    watch: {
      usePolling: true,
    },
  },
});