import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    // Bind on all interfaces, not just localhost -- needed for the dev
    // server to be reachable through GitHub Codespaces' port forwarding
    // (or any other remote/container environment).
    host: true,
    // Forward /api requests to the Express backend during development,
    // so the frontend can call fetch('/api/...') without worrying about
    // ports or CORS.
    proxy: {
      '/api': 'http://localhost:3001',
    },
  },
})
