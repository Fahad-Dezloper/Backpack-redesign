import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import { resolve } from 'node:path'

// Dev only: serves /api/rpc from the same handler Vercel runs, reading HELIUS_API_KEY from .env.local.
const apiDev = (env: Record<string, string>) => ({
  name: 'api-dev',
  configureServer(server: { middlewares: { use: (path: string, fn: (req: any, res: any) => void) => void }; ssrLoadModule: (p: string) => Promise<any> }) {
    server.middlewares.use('/api/rpc', async (req, res) => {
      process.env.HELIUS_API_KEY = env.HELIUS_API_KEY || ''
      const mod = await server.ssrLoadModule('/api/rpc.js')
      await mod.default(req, res)
    })
  }
})

export default defineConfig(({ mode }) => ({
  plugins: [react(), apiDev(loadEnv(mode, process.cwd(), ''))],
  build: { rollupOptions: { input: { main: resolve(__dirname, 'index.html'), backpack: resolve(__dirname, 'backpack.html'), helius: resolve(__dirname, 'helius.html') } } }
}))
