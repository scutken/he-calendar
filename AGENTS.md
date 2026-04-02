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
