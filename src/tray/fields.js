/**
 * 托盘悬停内容 · 字段目录与模板渲染
 *
 * 这个文件必须保持「无 Node 依赖」：它同时被 preload（Node 环境）和设置页（浏览器环境）引用。
 *
 * 约定：模板里用 %key% 表示一个字段，例如
 *   %lunar% · 宜:%yi% · %time%
 * 其中 time / date / weekday 这类字段由 helper 本地渲染（跟着系统时钟走），
 * 其余字段由插件算好后通过配置文件下发给 helper（见 host.js）。
 */
import { weekDayNames } from '../shared/calendar-core.js'

/** 字段目录：key 用于模板占位符，label 用于设置页，format 负责取值 */
export const FIELDS = [
  { key: 'lunar', label: '农历', sample: '八月二十', format: (d) => d.lunar_date_full || '' },
  {
    key: 'ganzhi',
    label: '干支',
    sample: '乙巳年 乙酉月 戊戌日',
    format: (d) => [d.gan_zhi?.year, d.gan_zhi?.month, d.gan_zhi?.day].filter(Boolean).join(' '),
  },
  { key: 'term', label: '节气（当天）', sample: '秋分', format: (d) => d.solar_term || '' },
  {
    key: 'nextTerm',
    label: '下一个节气',
    sample: '下个节气 寒露',
    format: (d) => (d.next_solar_term ? `下个节气 ${d.next_solar_term}` : ''),
  },
  {
    key: 'festival',
    label: '节日',
    sample: '中秋节',
    format: (d) => (d.festivals || []).map((f) => f.name).join(' '),
  },
  { key: 'zodiac', label: '生肖', sample: '巳蛇年', format: (d) => (d.zodiac ? `${d.zodiac}年` : '') },
  {
    key: 'yi',
    label: '今日宜',
    sample: '祭祀 祈福 求嗣 开光',
    // 只给裸列表，不带「宜:」前缀 —— 前缀由模板负责，
    // 否则用户自定义模板写 `宜:%yi%` 会得到「宜:宜:祭祀…」（已踩过）
    format: (d, a, cfg) => {
      const list = (a?.yi || []).slice(0, cfg?.yiLimit ?? 4)
      return list.join(' ')
    },
  },
  {
    key: 'ji',
    label: '今日忌',
    sample: '开市 动土',
    format: (d, a, cfg) => {
      const list = (a?.ji || []).slice(0, cfg?.jiLimit ?? 4)
      return list.join(' ')
    },
  },
  {
    key: 'chong',
    label: '冲煞',
    sample: '冲牛 煞西',
    format: (d, a) => [a?.chong, a?.sha ? `煞${a.sha}` : ''].filter(Boolean).join(' '),
  },
  { key: 'wuxing', label: '五行纳音', sample: '大驿土', format: (d, a) => a?.wu_xing || '' },
  { key: 'pengzu', label: '彭祖百忌', sample: '戊不受田 戌不吃犬', format: (d, a) => a?.peng_zu || '' },
  { key: 'taishen', label: '胎神方位', sample: '房床栖外正南', format: (d, a) => a?.tai_shen || '' },

  // ---- 以下由 helper 本地渲染（跟着系统时钟走，不需要插件每秒写配置）----
  { key: 'time', label: '时间 HH:mm', sample: '18:50', local: true },
  { key: 'timeSec', label: '时间 HH:mm:ss', sample: '18:50:12', local: true },
  { key: 'date', label: '公历日期', sample: '2026-09-30', local: true },
  { key: 'weekday', label: '星期', sample: '周三', local: true },
  { key: 'day', label: '日', sample: '30', local: true },
]

const FIELD_MAP = new Map(FIELDS.map((f) => [f.key, f]))

export function getField(key) {
  return FIELD_MAP.get(key) || null
}

/** helper 本地渲染的字段（不进配置文件，避免每秒写盘） */
export const LOCAL_FIELD_KEYS = FIELDS.filter((f) => f.local).map((f) => f.key)

/** 设置页推荐的默认组合 */
export const DEFAULT_FIELD_KEYS = ['lunar', 'yi', 'time']

/**
 * 模板里字段占位符的匹配规则。
 * 同时接受 `%yi%` 与 `%yi(任意参数)%`：后者统一归一成 `%yi%`。
 * 必须归一，因为 helper 只认 `%key%`，否则会把 `%yi(2)%` 当字面量印到托盘上（已踩过）。
 */
const PLACEHOLDER_RE = /%([A-Za-z0-9_]+)\s*(?:\([^)]*\))?%/g

/** 由字段列表生成模板，例如 ['lunar','yi','time'] → '%lunar% · 宜:%yi% · %time%' */
export function buildTemplate(keys) {
  const valid = (keys || []).filter((k) => FIELD_MAP.has(k))
  return valid.map((k) => (k === 'yi' ? '宜:%yi%' : k === 'ji' ? '忌:%ji%' : `%${k}%`)).join(' · ')
}

/** 归一化模板：`%key(x)%` → `%key%`，未收录字段的占位符直接删除 */
export function normalizeTemplate(template) {
  return String(template || '').replace(PLACEHOLDER_RE, (_m, key) => (FIELD_MAP.has(key) ? `%${key}%` : ''))
}

/** 取出模板里引用到的字段（helper 本地字段会被排除） */
export function templateFieldKeys(template) {
  const keys = []
  const re = new RegExp(PLACEHOLDER_RE.source, 'g')
  let m
  while ((m = re.exec(String(template || ''))) !== null) {
    if (FIELD_MAP.has(m[1]) && !keys.includes(m[1])) keys.push(m[1])
  }
  return keys
}

/**
 * 计算下发给 helper 的变量表
 * @param {object} cfg 生效配置
 * @param {object} data { dateInfo, almanac }
 * @param {string} template 模板
 */
export function buildVars(cfg, data, template) {
  const vars = {}
  const needed = templateFieldKeys(template).filter((k) => !LOCAL_FIELD_KEYS.includes(k))
  for (const key of needed) {
    const field = FIELD_MAP.get(key)
    if (!field) continue
    try {
      const value = field.format(data?.dateInfo || {}, data?.almanac || {}, cfg)
      if (value) vars[key] = String(value).replace(/[\r\n]+/g, ' ').trim()
    } catch {
      /* 单字段失败不影响其它字段 */
    }
  }
  return vars
}

/** 与 helper 完全一致的清洗逻辑（保证设置页预览 = 托盘实际显示） */
export function cleanTooltip(text, maxChars = 127) {
  let s = String(text || '')
  s = s.replace(/%[A-Za-z0-9_]+%/g, '')
  s = s.replace(/(\s*·\s*)+/g, ' · ')
  s = s.replace(/^[\s·]+|[\s·]+$/g, '')
  if (!s) s = '合社日历'
  if (s.length > maxChars) s = s.slice(0, maxChars - 1) + '…'
  return s
}

/** 设置页预览用的本地字段取值（helper 的渲染规则在这里复刻一份） */
export function renderLocalField(key, now = new Date()) {
  const pad = (n) => String(n).padStart(2, '0')
  switch (key) {
    case 'time':
      return `${pad(now.getHours())}:${pad(now.getMinutes())}`
    case 'timeSec':
      return `${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}`
    case 'date':
      return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`
    case 'weekday':
      return weekDayNames[now.getDay()] || ''
    case 'day':
      return String(now.getDate())
    default:
      return ''
  }
}

/**
 * 完整渲染一遍（设置页预览 + 无 helper 时的自检都用它）
 * 与 helper 的行为保持一致：先替换变量和本地字段，再清洗、再截断。
 */
export function renderTooltip(template, vars, { now = new Date(), maxChars = 127, cfg } = {}) {
  let out = String(template || '')
  for (const key of templateFieldKeys(out)) {
    if (LOCAL_FIELD_KEYS.includes(key)) {
      out = out.split(`%${key}%`).join(renderLocalField(key, now))
    } else if (vars && Object.prototype.hasOwnProperty.call(vars, key)) {
      out = out.split(`%${key}%`).join(vars[key])
    }
  }
  // 字段为空时会留下空占位，交给 cleanTooltip 处理分隔符
  return cleanTooltip(out, maxChars)
}
