/**
 * 开发模式 preload 垫片
 *
 * uTools 开发者工具解析 plugin.json 的 `preload` 字段时，可能以「工程根目录」为根；
 * 而本工程的 preload 真实产物是由 vite 的 bundlePreload 插件生成的
 * `dist/preload/services.js`（打包后插件根目录就是 dist）。
 *
 * 如果开发者工具取的是工程根，它会来要 `<工程根>/preload/services.js` —— 这个文件就是给它用的：
 * 直接把构建产物转出去。若 uTools 取的是 dist，本文件永远不会被用到，无副作用。
 *
 * 若尚未执行 `npm run build`，则友好提示并静默退出，不影响插件其它能力。
 */
try {
  require('../dist/preload/services.js')
} catch (e) {
  try {
    console.error(
      '[he-calendar] 未找到 preload 构建产物，请先执行 `npm run build`（开发模式需要 dist/ 存在）。',
      e && e.message
    )
  } catch {}
}
