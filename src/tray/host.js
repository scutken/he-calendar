/**
 * 系统托盘宿主（运行在 uTools preload 里）
 *
 * 职责
 *   1. 用 src/shared/calendar-core.js 算出今天的农历/宜忌等数据
 *   2. 把配置 + 变量写成一个行式配置文件（helper 轮询它，实现热更新）
 *   3. 拉起 helper（public/helper/he-tray.exe）并读取它 stdout 的事件流
 *   4. 处理交互：左键 / 右键菜单 → 唤起 uTools 主窗口、跳设置页、关闭托盘
 *
 * 为什么用配置文件而不是 stdin 传数据：数据变化很稀疏（农历按天、天气按十分钟），
 * 而 helper 需要每秒刷新时间。配置文件让 helper 本地渲染时间，插件不必每秒写盘。
 *
 * 这个模块只在 preload 里被 import（依赖 node:child_process 等内置模块）。
 */
import { getDateInfo, getAlmanac } from '../shared/calendar-core.js'
import { buildVars, getField } from './fields.js'
import {
  loadConfig,
  saveConfig,
  normalizeConfig,
  resolveTemplate,
  resolveIconBg,
  serializeConfigFile,
  STORAGE_KEY,
} from './config.js'

/** 点"托盘设置"时置位的标记，App.vue 轮询它来决定跳到设置页 */
export const OPEN_SETTINGS_FLAG = 'he-calendar-tray-open-settings'

const MAX_TOOLTIP_CHARS = 127 // helper 用 NOTIFYICON_VERSION_4，szTip 上限 128
const RESTART_LIMIT = 5
const RESTART_WINDOW_MS = 60_000

export function createTrayHost({ utools, node, dirname, win = globalThis, options = {} }) {
  const fs = node.fs
  const path = node.path
  const os = node.os
  const cp = node.cp

  const platform = options.platform || process.platform
  const isWindows = platform === 'win32'
  const restartBudget = { count: 0, since: 0 }

  const state = {
    started: false,
    enabled: false,
    child: null,
    config: normalizeConfig(null),
    dataDir: '',
    helperPath: '',
    configPath: '',
    diagPath: '',
    lastTooltip: '',
    lastVars: {},
    lastIconBg: '',
    lastDataAt: 0,
    dateInfo: null,
    almanac: null,
    events: [],
    status: 'idle',
    lastError: '',
  }

  const ring = []
  function diag(event, data) {
    const record = { ts: new Date().toISOString(), event, data: safe(data) }
    ring.push(record)
    if (ring.length > 200) ring.shift()
    if (!state.diagPath) return
    try {
      fs.appendFileSync(state.diagPath, JSON.stringify(record) + '\n', 'utf8')
    } catch {
      /* 诊断失败不能影响主流程 */
    }
  }

  function safe(value) {
    try {
      return JSON.parse(JSON.stringify(value === undefined ? null : value))
    } catch {
      try {
        return String(value)
      } catch {
        return null
      }
    }
  }

  // ------------------------------------------------------------ 路径
  function resolveDataDir() {
    let base = ''
    try {
      base = utools?.getPluginLocalDataPath?.() || ''
    } catch {
      base = ''
    }
    if (!base) base = path.join(os.tmpdir(), 'he-calendar')
    try {
      if (!fs.existsSync(base)) fs.mkdirSync(base, { recursive: true })
    } catch {
      /* 落到 tmp 兜底 */
    }
    return base
  }

  /** 把 asar 内路径映射到 asar.unpacked（可执行文件必须走解包目录才能真正被 spawn） */
  function expandAsar(p) {
    const out = [p]
    if (p.includes('.asar' + path.sep) || p.includes('.asar/')) {
      out.push(p.replace('.asar' + path.sep, '.asar.unpacked' + path.sep).replace('.asar/', '.asar.unpacked/'))
    }
    return out
  }

  function helperCandidates() {
    const exe = 'he-tray.exe'
    const bases = [
      path.resolve(dirname, '..', 'helper', exe), // 常规：<root>/helper/he-tray.exe（dist 或打包根）
      path.join(dirname, 'helper', exe), // 万一 preload 与 helper 同层
      path.resolve(dirname, '..', '..', 'helper', exe), // 更深的目录结构兜底
      path.resolve(dirname, '..', '..', 'dist', 'helper', exe), // 开发模式兜底
    ]
    const all = []
    for (const b of bases) for (const p of expandAsar(b)) if (!all.includes(p)) all.push(p)
    return all
  }

  function findHelper() {
    const candidates = helperCandidates()
    for (const p of candidates) {
      let exists = false
      try {
        exists = fs.existsSync(p)
      } catch {
        exists = false
      }
      diag('helper-path-candidate', { path: p, exists })
      if (exists) return p
    }
    return ''
  }

  // ------------------------------------------------------------ 数据
  function refreshData() {
    try {
      state.dateInfo = getDateInfo()
      state.almanac = getAlmanac()
      state.lastDataAt = Date.now()
      return true
    } catch (e) {
      diag('data-failed', { message: String(e?.message || e) })
      return false
    }
  }

  function currentVars() {
    const template = resolveTemplate(state.config)
    return buildVars(state.config, { dateInfo: state.dateInfo, almanac: state.almanac }, template)
  }

  /** 原子写配置文件：先写临时文件再改名，避免 helper 读到写了一半的内容 */
  function writeConfigFile() {
    if (!state.configPath) return false
    try {
      const template = resolveTemplate(state.config)
      const vars = currentVars()
      const iconBg = resolveIconBg(state.config.iconBg, state.dateInfo)
      const logoPath =
        state.config.iconMode === 'logo' ? path.resolve(dirname, '..', 'logo.png') : ''
      const content = serializeConfigFile(state.config, {
        vars,
        iconBg,
        logoPath: logoPath && safeExists(logoPath) ? logoPath : '',
        maxChars: MAX_TOOLTIP_CHARS,
      })
      const tmp = state.configPath + '.tmp'
      fs.writeFileSync(tmp, content, 'utf8')
      fs.renameSync(tmp, state.configPath)
      state.lastVars = vars
      state.lastIconBg = iconBg
      diag('config-written', { template, vars, iconBg, enabled: state.config.enabled })
      return true
    } catch (e) {
      diag('config-write-failed', { message: String(e?.message || e) })
      return false
    }
  }

  function safeExists(p) {
    try {
      return fs.existsSync(p)
    } catch {
      return false
    }
  }

  // ------------------------------------------------------------ 子进程
  function spawnHelper() {
    if (state.child) return
    if (!state.helperPath) {
      state.status = 'helper-missing'
      diag('helper-not-found', { candidates: helperCandidates() })
      return
    }
    try {
      const child = cp.spawn(state.helperPath, ['--config', state.configPath, '--parent-pid', String(process.pid)], {
        stdio: ['ignore', 'pipe', 'pipe'],
        windowsHide: true,
        detached: false,
      })
      state.child = child
      state.status = 'running'
      diag('helper-spawned', { pid: child.pid, exe: state.helperPath })

      let buffer = ''
      child.stdout.setEncoding('utf8')
      child.stdout.on('data', (chunk) => {
        buffer += chunk
        let idx
        while ((idx = buffer.indexOf('\n')) >= 0) {
          const line = buffer.slice(0, idx).trim()
          buffer = buffer.slice(idx + 1)
          if (line) handleHelperEvent(line)
        }
        if (buffer.length > 64 * 1024) buffer = '' // 防御：畸形输出不让内存涨
      })
      child.stderr.setEncoding('utf8')
      child.stderr.on('data', (chunk) => diag('helper-stderr', { text: String(chunk).slice(0, 500) }))

      child.on('exit', (code, signal) => {
        diag('helper-exit', { code, signal })
        state.child = null
        state.status = state.enabled ? 'exited' : 'disabled'
        if (state.enabled) scheduleRestart()
      })
      child.on('error', (e) => {
        state.lastError = String(e?.message || e)
        diag('helper-error', { message: state.lastError })
        state.child = null
        state.status = 'error'
      })
    } catch (e) {
      state.lastError = String(e?.message || e)
      state.status = 'spawn-failed'
      diag('helper-spawn-failed', { message: state.lastError })
    }
  }

  /** helper 意外退出时自动重拉（有限次，避免疯狂重启） */
  function scheduleRestart() {
    const now = Date.now()
    if (now - restartBudget.since > RESTART_WINDOW_MS) {
      restartBudget.since = now
      restartBudget.count = 0
    }
    restartBudget.count += 1
    if (restartBudget.count > RESTART_LIMIT) {
      diag('helper-restart-given-up', { count: restartBudget.count })
      state.status = 'restart-given-up'
      return
    }
    diag('helper-restart', { attempt: restartBudget.count })
    setTimeout(() => {
      if (state.enabled && state.started) spawnHelper()
    }, 1500)
  }

  function killHelper() {
    const child = state.child
    state.child = null
    if (!child) return
    try {
      child.kill()
    } catch {
      /* 已退出 */
    }
    // Windows 上 kill 是 TerminateProcess，helper 的退出清理可能来不及跑；
    // 正常情况下 helper 自己会先 NIM_DELETE 再退出（父进程看门狗路径），
    // 强杀才会留下幽灵图标 —— 所以这里给它一点时间。
  }

  // ------------------------------------------------------------ 事件
  function handleHelperEvent(line) {
    let msg = null
    try {
      msg = JSON.parse(line)
    } catch {
      diag('helper-bad-line', { line: line.slice(0, 200) })
      return
    }
    state.events.push({ ts: Date.now(), ...msg })
    if (state.events.length > 50) state.events.shift()

    switch (msg.type) {
      case 'tooltip':
        state.lastTooltip = msg.text || ''
        diag('helper-event', msg)
        break
      case 'click':
        if (msg.button === 'left') {
          diag('helper-event', msg)
          showMainWindow()
        } else {
          diag('helper-event', msg)
        }
        break
      case 'menu':
        diag('helper-event', msg)
        if (msg.item === 'open') showMainWindow()
        else if (msg.item === 'settings') openSettings()
        else if (msg.item === 'quit') disable()
        break
      case 'error':
        state.lastError = msg.message || 'unknown'
        diag('helper-event', msg)
        break
      default:
        diag('helper-event', msg)
        break
    }
  }

  function showMainWindow() {
    try {
      utools?.showMainWindow?.()
      diag('show-main-window', { ok: true })
    } catch (e) {
      diag('show-main-window', { ok: false, message: String(e?.message || e) })
    }
  }

  /** 置标记 + 唤起主窗口；App.vue 轮询到标记后切到托盘设置页 */
  function openSettings() {
    try {
      utools?.dbStorage?.setItem?.(OPEN_SETTINGS_FLAG, true)
    } catch {
      /* 忽略 */
    }
    diag('open-settings-requested', {})
    showMainWindow()
  }

  // ------------------------------------------------------------ 生命周期
  let refreshTimer = null
  let midnightTimer = null

  function scheduleRefresh() {
    if (refreshTimer) clearInterval(refreshTimer)
    const ms = Math.max(1, state.config.refreshMinutes) * 60_000
    refreshTimer = setInterval(() => {
      if (!state.enabled) return
      if (refreshData()) writeConfigFile()
    }, ms)
    // 跨零点：农历/宜忌/图标日期都要换
    if (midnightTimer) clearTimeout(midnightTimer)
    const now = new Date()
    const next = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, 0, 0, 30)
    midnightTimer = setTimeout(() => {
      if (state.enabled && refreshData()) writeConfigFile()
      scheduleRefresh()
    }, Math.max(1000, next.getTime() - now.getTime()))
  }

  /** 应用新配置：落盘 + 写配置文件 + 需要时拉起/停掉 helper */
  function apply(rawConfig) {
    const cfg = saveConfig(utools, rawConfig)
    state.config = cfg
    state.enabled = cfg.enabled
    diag('apply', { enabled: cfg.enabled, template: resolveTemplate(cfg) })

    if (!cfg.enabled) {
      killHelper()
      state.status = 'disabled'
      return getStatus()
    }

    refreshData()
    writeConfigFile()
    if (!state.child) spawnHelper()
    scheduleRefresh()
    return getStatus()
  }

  function start() {
    if (state.started) return getStatus()
    state.started = true

    if (!isWindows) {
      state.status = 'unsupported-platform'
      diag('skip', { reason: 'not-windows', platform })
      return getStatus()
    }

    state.dataDir = resolveDataDir()
    state.configPath = path.join(state.dataDir, 'tray-config.conf')
    state.diagPath = path.join(state.dataDir, 'tray-diag.jsonl')
    state.config = loadConfig(utools)
    state.enabled = state.config.enabled
    diag('host-start', {
      dirname,
      dataDir: state.dataDir,
      configPath: state.configPath,
      enabled: state.enabled,
      utoolsVersion: safeCallU(() => utools.getAppVersion?.()),
      isDev: safeCallU(() => utools.isDev?.()),
    })

    if (!state.enabled) {
      state.status = 'disabled'
      diag('start-skipped', { reason: 'disabled-by-user' })
      return getStatus()
    }

    refreshData()
    writeConfigFile()
    state.helperPath = findHelper()
    spawnHelper()
    scheduleRefresh()
    return getStatus()
  }

  function stop() {
    if (refreshTimer) clearInterval(refreshTimer)
    if (midnightTimer) clearTimeout(midnightTimer)
    refreshTimer = null
    midnightTimer = null
    state.started = false
    killHelper()
    state.status = 'stopped'
    diag('host-stop', {})
  }

  function disable() {
    state.config = saveConfig(utools, { ...state.config, enabled: false })
    state.enabled = false
    killHelper()
    state.status = 'disabled'
    writeConfigFile() // 让 helper 下次启动就知道是关闭状态
    diag('disabled-by-menu', {})
  }

  function safeCallU(fn) {
    try {
      return fn()
    } catch {
      return null
    }
  }

  function getStatus() {
    return {
      platform,
      started: state.started,
      enabled: state.enabled,
      status: state.status,
      helperPath: state.helperPath,
      helperPid: state.child?.pid || 0,
      dataDir: state.dataDir,
      configPath: state.configPath,
      template: resolveTemplate(state.config),
      tooltip: state.lastTooltip,
      vars: state.lastVars,
      iconBg: state.lastIconBg,
      lastError: state.lastError,
      lastDataAt: state.lastDataAt,
      eventCount: state.events.length,
    }
  }

  return {
    start,
    stop,
    apply,
    disable,
    refresh: () => {
      if (refreshData()) writeConfigFile()
      return getStatus()
    },
    getConfig: () => state.config,
    getStatus,
    getLastEvents: (n = 20) => state.events.slice(-n),
    getDiag: (n = 60) => ring.slice(-n),
    /** 设置页需要按当前配置渲染预览 */
    getPreviewData: () => ({ dateInfo: state.dateInfo, almanac: state.almanac }),
    paths: { helperCandidates, dataDir: () => state.dataDir },
  }
}

/**
 * preload 入口：包一层 try/catch，任何失败都不影响插件本体（AI 工具注册等）
 * 并把控制接口挂到 window 上供设置页调用
 */
export function bootstrapFromPreload({ utools, require, dirname, options = {} }) {
  const node = {
    fs: require('node:fs'),
    path: require('node:path'),
    os: require('node:os'),
    cp: require('node:child_process'),
  }
  let host = null
  try {
    host = createTrayHost({ utools, node, dirname, win: globalThis, options })
    globalThis.heCalendarTray = {
      host,
      getConfig: () => host.getConfig(),
      getStatus: () => host.getStatus(),
      apply: (cfg) => host.apply(cfg),
      refresh: () => host.refresh(),
      disable: () => host.disable(),
      getLastEvents: (n) => host.getLastEvents(n),
      getDiag: (n) => host.getDiag(n),
      getPreviewData: () => host.getPreviewData(),
    }
    host.start()
  } catch (e) {
    try {
      console.error('[he-calendar] 托盘宿主启动失败', e)
    } catch {
      /* 忽略 */
    }
  }
  return host
}

export { STORAGE_KEY }
