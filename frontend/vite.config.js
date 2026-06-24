import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

const API_TARGET = `http://127.0.0.1:${process.env.VITE_API_PORT || 3005}`

export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      '/api': {
        target: API_TARGET,
        changeOrigin: true,
      },
      '/uploads': {
        target: API_TARGET,
        changeOrigin: true,
      },
    },
  },
  test: {
    environment: 'jsdom',
  },
})
