# AGENTS

本文件用于记录面向代理/自动化编码助手的仓库级约束，避免后续会话重复踩坑。

## uTools / Electron 兼容性约束

- `uTools` 内置 Electron / WebView 对部分新 CSS 特性支持不稳定，尤其是 `color-mix()`。
- 如果关键界面（尤其右侧黄历面板）依赖 `color-mix()` 生成边框、浅底色、高亮色、阴影，可能出现：网页版正常，但 uTools 插件内样式失效或明显退化。
- 对关键 UI 不要直接依赖运行时 `color-mix()`；优先在 JS 中预计算派生色，再通过 CSS 变量写回，例如在 `applyTheme()` 中生成 `--almanac-line`、`--almanac-gold`、`--almanac-board-bg` 等变量。
- 如果必须使用新 CSS 语法，先提供兼容回退，再做渐进增强。
- 每次涉及主题色、黄历右栏、uTools 专属视图的样式调整后，都必须同时验证：
  1. 普通浏览器 dev 页面
  2. uTools 插件开发模式页面
  3. `npm run build` 构建结果

## API / 运行时双环境约束

- `uTools` Electron WebView **不限制 CORS**，可直接请求外部 API；普通浏览器严格限制 CORS。
- 涉及外部 API 请求时，必须在 API 封装层做**运行时环境检测**：
  `window.utools` 存在 → 直连上游 API；否则 → 走 `/api/` 代理（EdgeOne Edge Function 或 Vite dev proxy）。
- 每次改动 API 层（BASE_URL、请求参数、代理配置）后，必须同时验证：
  1. `npm run dev` 本地浏览器
  2. uTools 插件开发模式
  3. `npm run build` 构建后在 Web 端部署验证

## 版本发布检查清单

升级版本号时需同步以下 **5 个文件**，缺一不可：
- `package.json` → `version`
- `src/config.js` → `version`
- `版本说明.txt` → 新增版本条目
- `应用说明.txt` → 新功能描述（如功能有增减）
- `README.md` → 核心特色 / 技术栈 / 关键词（如功能有增减）
