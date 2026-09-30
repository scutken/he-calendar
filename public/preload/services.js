import {
  getDateInfo,
  getAlmanac,
  getFestivals,
  searchNextFestival,
  getShichen,
} from '../../src/shared/calendar-core.js'
import { bootstrapFromPreload } from '../../src/tray/host.js'

// ============================================================
// 工具注册
// ============================================================

/**
 * get_date_info — 完整日历信息
 */
utools.registerTool('get_date_info', getDateInfo)

/**
 * get_almanac — 黄历宜忌
 */
utools.registerTool('get_almanac', getAlmanac)

/**
 * get_festivals — 日期范围内的节日
 */
utools.registerTool('get_festivals', getFestivals)

/**
 * search_next_festival — 查找下一个指定节日
 */
utools.registerTool('search_next_festival', searchNextFestival)

utools.registerTool('get_shichen', getShichen)

// ============================================================
// 系统托盘宿主
//
// 托盘图标必须由一个独立的 Win32 进程创建（uTools 没有 Tray API，插件进程也没有 FFI），
// 所以这里拉起插件包里的 public/helper/he-tray.exe，由它负责图标 + 原生 tooltip，
// 交互事件（左键 / 右键菜单）通过它的 stdout 回来，由这里唤起主窗口。
//
// 只在 uTools 主窗口的 preload 里启动，避免多窗口重复拉起（helper 自身也有单实例互斥兜底）。
// 任何失败都被吞掉，绝不影响上面的 5 个 AI 工具。
// ============================================================
try {
  if (typeof utools !== 'undefined' && utools) {
    const windowType = typeof utools.getWindowType === 'function' ? utools.getWindowType() : 'main'
    if (windowType === 'main' || !windowType) {
      bootstrapFromPreload({ utools, require, dirname: __dirname, options: {} })
    }
  }
} catch (e) {
  try {
    console.error('[he-calendar] 托盘宿主初始化失败', e)
  } catch {
    /* 忽略 */
  }
}
