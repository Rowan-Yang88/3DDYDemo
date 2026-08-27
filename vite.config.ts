import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import cesium from 'vite-plugin-cesium'

// vite-plugin-cesium 会自动处理 Cesium 的静态资源(Cesium.BaseUrl)与 widgets.css
export default defineConfig({
  plugins: [vue(), cesium()],
  // @cesium/engine 是 cesium 包的隐藏依赖（嵌套在 cesium/node_modules 下），
  // 这里明确加入 optimizeDeps，让 Vite 能解析。
  optimizeDeps: {
    include: ['@cesium/engine'],
  },
  server: {
    port: 5173,
    open: true,
  },
})
