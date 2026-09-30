/**
 * 托盘配置 · 默认值 / 持久化 / 配置文件序列化
 *
 * 与 fields.js 一样必须保持「无 Node 依赖」：设置页（浏览器环境）也要引用它。
 * 落盘由 host.js 负责（host 在 preload 里，能拿到 node:fs）。
 */
import { DEFAULT_FIELD_KEYS, buildTemplate, getField, normalizeTemplate } from './fields.js'

/** uTools dbStorage 的键名（改这里要同步设置页的说明文案） */
export const STORAGE_KEY = 'he-calendar-tray'

export const DEFAULT_CONFIG = {
  /** 是否显示系统托盘图标 */
  enabled: true,
  /** 悬停显示哪些字段（顺序即显示顺序）；template 非空时以 template 为准 */
  fields: [...DEFAULT_FIELD_KEYS],
  /** 自定义模板，留空则用 fields 生成 */
  template: '',
  /** 宜 / 忌 各显示几项 */
  yiLimit: 4,
  jiLimit: 4,
  /** 日历数据刷新间隔（分钟）：农历/宜忌按天变化，不需要频繁刷新 */
  refreshMinutes: 5,
  /** 图标形态：date=圆角底+今天几号，logo=用 logo 图标 */
  iconMode: 'date',
  /** 图标上的文字，留空=自动用今天的日期数字 */
  iconText: '',
  /** 图标底色：auto=按季节/节气自动，或 #RRGGBB */
  iconBg: 'auto',
  /** 图标文字颜色 */
  iconFg: '#FFFFFF',
  /** 右键菜单项开关 */
  menu: { open: true, settings: true, quit: true },
}

/** 24 节气 → 季节，用于 iconBg=auto 时的配色 */
const SEASON_BY_TERM = {
  立春: 'spring', 雨水: 'spring', 惊蛰: 'spring', 春分: 'spring', 清明: 'spring', 谷雨: 'spring',
  立夏: 'summer', 小满: 'summer', 芒种: 'summer', 夏至: 'summer', 小暑: 'summer', 大暑: 'summer',
  立秋: 'autumn', 处暑: 'autumn', 白露: 'autumn', 秋分: 'autumn', 寒露: 'autumn', 霜降: 'autumn',
  立冬: 'winter', 小雪: 'winter', 大雪: 'winter', 冬至: 'winter', 小寒: 'winter', 大寒: 'winter',
}

/** 季节配色（不用 color-mix，直接给死值，避免 uTools WebView 兼容性问题） */
export const SEASON_COLORS = {
  spring: '#4A7C59',
  summer: '#A8443A',
  autumn: '#8C4A3C',
  winter: '#3F5B7C',
  term: '#A8842C', // 节气当天用金色点缀
}

/** 由月份兜底判断季节（当天不是节气时用） */
function seasonByMonth(month) {
  if (month >= 3 && month <= 5) return 'spring'
  if (month >= 6 && month <= 8) return 'summer'
  if (month >= 9 && month <= 11) return 'autumn'
  return 'winter'
}

/**
 * 解析图标底色
 * @param {string} value 配置值：'auto' 或 #RRGGBB
 * @param {object} dateInfo getDateInfo 的结果（可为空）
 */
export function resolveIconBg(value, dateInfo) {
  if (value && value !== 'auto') return value
  const term = dateInfo?.solar_term
  if (term && SEASON_BY_TERM[term]) {
    // 节气当天：金色，给一点仪式感
    return SEASON_COLORS.term
  }
  const current = dateInfo?.current_solar_term
  if (current && SEASON_BY_TERM[current]) return SEASON_COLORS[SEASON_BY_TERM[current]]
  const month = new Date().getMonth() + 1
  return SEASON_COLORS[seasonByMonth(month)]
}

/** 合并默认值 + 容错（用户手改过 storage 或老版本配置都能兜住） */
export function normalizeConfig(raw) {
  const cfg = { ...DEFAULT_CONFIG, ...(raw || {}) }
  if (!Array.isArray(cfg.fields) || cfg.fields.length === 0) cfg.fields = [...DEFAULT_FIELD_KEYS]
  cfg.fields = cfg.fields.filter((k) => getField(k))
  if (cfg.fields.length === 0) cfg.fields = [...DEFAULT_FIELD_KEYS]
  cfg.template = typeof cfg.template === 'string' ? cfg.template : ''
  cfg.iconMode = cfg.iconMode === 'logo' ? 'logo' : 'date'
  cfg.iconText = typeof cfg.iconText === 'string' ? cfg.iconText.slice(0, 4) : ''
  cfg.iconFg = /^#[0-9a-fA-F]{6}$/.test(cfg.iconFg) ? cfg.iconFg : '#FFFFFF'
  cfg.iconBg = cfg.iconBg === 'auto' || /^#[0-9a-fA-F]{6}$/.test(cfg.iconBg) ? cfg.iconBg : 'auto'
  cfg.refreshMinutes = Math.min(120, Math.max(1, Number(cfg.refreshMinutes) || 5))
  cfg.yiLimit = Math.min(12, Math.max(1, Number(cfg.yiLimit) || 4))
  cfg.jiLimit = Math.min(12, Math.max(1, Number(cfg.jiLimit) || 4))
  cfg.menu = { ...DEFAULT_CONFIG.menu, ...(cfg.menu || {}) }
  cfg.enabled = cfg.enabled !== false
  return cfg
}

export function loadConfig(utools) {
  try {
    return normalizeConfig(utools?.dbStorage?.getItem?.(STORAGE_KEY))
  } catch {
    return normalizeConfig(null)
  }
}

export function saveConfig(utools, cfg) {
  const normalized = normalizeConfig(cfg)
  try {
    utools?.dbStorage?.setItem?.(STORAGE_KEY, normalized)
  } catch {
    /* 存储失败不阻塞本次生效 */
  }
  return normalized
}

/** 最终生效的模板：自定义优先，否则由字段列表拼；统一归一化后再下发 */
export function resolveTemplate(cfg) {
  const custom = (cfg?.template || '').trim()
  if (custom) return normalizeTemplate(custom)
  return buildTemplate(cfg?.fields || DEFAULT_FIELD_KEYS)
}

/** 生成给 helper 的行式配置文件内容（格式见 tools/tray-helper/he-tray.cs 头部注释） */
export function serializeConfigFile(cfg, { vars = {}, iconBg = '', logoPath = '', maxChars = 127 } = {}) {
  const lines = [
    '# 合社日历 · 托盘 helper 配置',
    '# 由插件 src/tray/host.js 自动生成，请勿手工编辑（下次刷新会被覆盖）',
    `enabled=${cfg.enabled ? 1 : 0}`,
    `maxTooltipChars=${maxChars}`,
    'timeFormat=HH:mm',
    `tooltip=${resolveTemplate(cfg).replace(/[\r\n]+/g, ' ')}`,
  ]

  for (const [key, value] of Object.entries(vars || {})) {
    const clean = String(value ?? '').replace(/[\r\n]+/g, ' ').trim()
    if (clean) lines.push(`var.${key}=${clean}`)
  }

  lines.push(`icon.mode=${cfg.iconMode}`)
  if (cfg.iconText) lines.push(`icon.text=${cfg.iconText}`)
  if (iconBg) lines.push(`icon.bg=${iconBg}`)
  lines.push(`icon.fg=${cfg.iconFg}`)
  if (logoPath) lines.push(`icon.logo=${logoPath}`)

  const menu = cfg.menu || {}
  if (menu.open !== false) lines.push('menu=open|打开合社日历')
  if (menu.settings !== false) lines.push('menu=settings|托盘设置')
  if (menu.quit !== false) {
    lines.push('menu=-|-') // 分隔线
    lines.push('menu=quit|关闭托盘图标')
  }

  return lines.join('\n') + '\n'
}

/** 供设置页展示的字段勾选状态 */
export function toggleField(cfg, key, checked) {
  const set = new Set(cfg.fields || [])
  if (checked) set.add(key)
  else set.delete(key)
  // 保持 FIELDS 的顺序稳定
  const ordered = []
  for (const k of cfg.fields || []) if (set.has(k)) ordered.push(k)
  for (const k of set) if (!ordered.includes(k)) ordered.push(k)
  return { ...cfg, fields: ordered.length ? ordered : [...DEFAULT_FIELD_KEYS] }
}
