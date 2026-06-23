/**
 * 小米天气 API 接口封装
 * 参考 breezy-weather 项目 ChinaApi.kt 设计
 */

// uTools Electron WebView 不限制 CORS，直接请求小米 API
// Web 环境通过 /api/weather/ 代理（EdgeOne Edge Function 或 Vite dev proxy）
const isUtoolsEnv = typeof window !== 'undefined' && !!window.utools
const BASE_URL = isUtoolsEnv
  ? 'https://weatherapi.market.xiaomi.com/wtr-v3/'
  : '/api/weather/'
const CHINA_APP_KEY = 'weather20151024'
const CHINA_SIGN = 'zUFJoAR2ZVrDy1vF3D07'

/** 请求超时时间（毫秒） */
const REQUEST_TIMEOUT = 15000

/**
 * 统一请求方法，附带超时控制
 * @param {string} url - 请求地址
 * @returns {Promise<any>} 响应 JSON 数据
 */
async function request(url) {
  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT)

  try {
    const response = await fetch(url, { signal: controller.signal })

    if (!response.ok) {
      throw new Error(`天气API请求失败: HTTP ${response.status}`)
    }

    return await response.json()
  } catch (error) {
    if (error.name === 'AbortError') {
      throw new Error('天气API请求超时')
    }
    if (error.message.startsWith('天气API')) {
      throw error
    }
    throw new Error(`天气API网络错误: ${error.message}`)
  } finally {
    clearTimeout(timeoutId)
  }
}

/**
 * 城市搜索
 * @param {string} name - 城市名称关键词
 * @param {string} [locale='zh_cn'] - 语言区域
 * @returns {Promise<Array>} ChinaLocationResult[] 原始API响应
 */
export async function searchCity(name, locale = 'zh_cn') {
  const url = `${BASE_URL}location/city/search?name=${encodeURIComponent(name)}&locale=${locale}`
  return await request(url)
}

/**
 * 反向地理编码（经纬度 → 城市信息）
 * @param {number} lat - 纬度
 * @param {number} lon - 经度
 * @param {string} [locale='zh_cn'] - 语言区域
 * @returns {Promise<Array>} ChinaLocationResult[] 原始API响应
 */
export async function getLocationByGeo(lat, lon, locale = 'zh_cn') {
  const url = `${BASE_URL}location/city/geo?latitude=${lat}&longitude=${lon}&locale=${locale}`
  return await request(url)
}

/**
 * 获取完整天气预报
 * @param {number} lat - 纬度
 * @param {number} lon - 经度
 * @param {string} locationKey - 位置标识（原始key，函数内部会格式化）
 * @param {object} [options] - 可选参数
 * @param {number} [options.days=15] - 预报天数
 * @param {boolean} [options.isLocated=true] - 是否已定位
 * @param {string} [options.locale='zh_cn'] - 语言区域
 * @returns {Promise<object>} ChinaForecastResult 原始API响应
 */
export async function getForecastWeather(lat, lon, locationKey, { days = 15, isLocated = true, locale = 'zh_cn' } = {}) {
  const params = new URLSearchParams({
    latitude: String(lat),
    longitude: String(lon),
    isLocated: String(isLocated),
    days: String(days),
    appKey: CHINA_APP_KEY,
    sign: CHINA_SIGN,
    isGlobal: 'false',
    locale
  })
  const url = `${BASE_URL}weather/all?${params.toString()}`
  return await request(url)
}
