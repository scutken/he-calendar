import {
  getDateInfo,
  getAlmanac,
  getFestivals,
  searchNextFestival,
  getShichen,
} from '../../src/shared/calendar-core.js'

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
