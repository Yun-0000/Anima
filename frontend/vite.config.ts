import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    port: 4173,
    proxy: {
      '/api': 'http://localhost:8001',
    },
  },
  build: {
    // three.js and three-vrm change rarely; a separate chunk stays cached across app updates.
    rollupOptions: { output: { manualChunks: { three: ['three', '@pixiv/three-vrm'] } } },
    chunkSizeWarningLimit: 900,
  },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: './src/setupTests.ts',
  },
})
