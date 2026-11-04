import react from '@vitejs/plugin-react'
import { defineConfig, loadEnv } from 'vite'

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  const env = { ...loadEnv(mode, process.cwd(), ''), ...process.env };
  const port = Number(new URL(env.APP_ORIGIN ?? 'http://localhost:5173').port) || 5173;
  return {
    plugins: [react()],
    server: { port, strictPort: true, proxy: { '/api': env.API_PROXY_TARGET ?? `http://127.0.0.1:${env.PORT ?? 3001}` } },
  };
})
