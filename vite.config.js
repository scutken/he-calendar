import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [vue()],
  base: './' // 保持相对路径，或者根据仓库名设置为 '/he-calendar/'
})
