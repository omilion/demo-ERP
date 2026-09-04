import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import process from 'node:process'

// El backend local de desarrollo escucha en 3001. VITE_API_PORT sigue
// permitiendo sobrescribirlo para Docker u otros entornos.
const API_TARGET = `http://127.0.0.1:${process.env.VITE_API_PORT || 3001}`

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
