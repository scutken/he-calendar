import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import { build as esbuild, context as createEsbuildContext } from 'esbuild'
import path from 'path'

const preloadEntry = path.resolve('src/preload/services.js')
const preloadBuildOptions = (outfile, minify) => ({
  entryPoints: [preloadEntry],
  bundle: true,
  platform: 'node',
  format: 'cjs',
  minify,
  outfile,
  external: ['electron'],
})

/**
 * 开发和发布都提供 CommonJS preload，避免 uTools 直接执行 ESM 源码。
 * 依赖内联到单文件，确保插件运行时无需 node_modules。
 */
const bundlePreload = () => ({
  name: 'bundle-preload',
  configureServer: async (server) => {
    const context = await createEsbuildContext(
      preloadBuildOptions(path.resolve('public/preload/services.js'), false),
    )
    await context.watch()
    server.httpServer?.once('close', () => context.dispose())
  },
  closeBundle: async () => {
    // 发布产物压缩；开发产物保留可读性，便于排查工具注册问题
    await esbuild(preloadBuildOptions(path.resolve('dist/preload/services.js'), true))
    console.log('✅ preload/services.js bundled with tyme4ts')
  },
})

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [vue(), bundlePreload()],
  build: {
    rollupOptions: {
      maxParallelFileOps: 3,
    },
  },
  base: './', // 保持相对路径，或者根据仓库名设置为 '/he-calendar/'
  server: {
    proxy: {
      // 代理小米天气 API，解决浏览器 CORS 跨域限制
      '/api/weather': {
        target: 'https://weatherapi.market.xiaomi.com',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api\/weather/, '/wtr-v3'),
      },
    },
  },
})
