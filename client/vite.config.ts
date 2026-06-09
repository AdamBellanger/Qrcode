import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// During development the Express API runs on :3001 and Vite on :5173.
// Proxy API + image routes so the frontend can call them on the same origin.
export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      '/api': 'http://localhost:3001',
      '/i': 'http://localhost:3001',
    },
  },
})
