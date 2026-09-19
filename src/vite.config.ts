import { fileURLToPath, URL } from 'node:url'
import { configDefaults, defineConfig } from 'vitest/config'
import vue from '@vitejs/plugin-vue'
import tailwindcss from '@tailwindcss/vite'

const apiProxyTarget = (process.env.VITE_API_PROXY_TARGET ?? '').trim()

export default defineConfig({
  plugins: [vue(), tailwindcss()],
  resolve: {
    alias: { '@': fileURLToPath(new URL('./app', import.meta.url)) }
  },
  ...(apiProxyTarget
    ? { server: { proxy: { '/api': { target: apiProxyTarget, changeOrigin: true } } } }
    : {}),
  build: {
    rollupOptions: {
      input: {
        main: fileURLToPath(new URL('./index.html', import.meta.url)),
        bootstrap: fileURLToPath(new URL('./bootstrap/index.html', import.meta.url))
      }
    }
  },
  test: {
    exclude: [...configDefaults.exclude, 'e2e/**']
  }
})
