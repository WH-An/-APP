import { defineConfig } from 'vite'
export default defineConfig({
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://localhost:3001',
        changeOrigin: true,
        // 如果后端没有 /api 前缀（比如真实是 /users/me），可用：
        // rewrite: (p) => p.replace(/^\/api/, '')
      }
    }
  }
})
