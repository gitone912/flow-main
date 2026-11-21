import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  // During development the Flow API (server/index.ts) runs on its own port; the browser keeps calling same-origin /api.
  // A deployed frontend on another host sets VITE_API_BASE_URL instead (read in src/api.ts).
  const target = env.API_PROXY_TARGET || 'http://localhost:' + (env.PORT || '3001')
  const proxy = { '/api': { target, changeOrigin: true } }
  return {
    plugins: [react(), tailwindcss()], server: { proxy }, preview: { proxy },
    build: { rolldownOptions: { output: { codeSplitting: { groups: [{ name: 'employee-roster', test: /[\/]src[\/]data[\/]roster\.json$/ }] } } } },
  }
})
