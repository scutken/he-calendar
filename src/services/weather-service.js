/**
 * 天气业务逻辑层
 * 参考 breezy-weather ChinaService.kt 的设计模式
 * 串联 API 调用层与数据模型转换层，提供上层业务所需的完整接口
 */

import { searchCity, getLocationByGeo, getForecastWeather } from './weather-api.js'
import { parseLocationResults, parseCurrentWeather, parseDailyForecast, parseHourlyForecast } from './weather-models.js'

// ─── 自定义错误类 ────────────────────────────────────────────

/**
 * 定位相关错误
 */
export class LocationError extends Error {
  /**
   * @param {string} message - 错误描述
   * @param {'PERMISSION_DENIED'|'POSITION_UNAVAILABLE'|'TIMEOUT'|'GEO_FAILED'} code - 错误码
   */
  constructor(message, code) {
    super(message)
    this.name = 'LocationError'
    this.code = code
  }
}

/**
 * 天气数据相关错误
 */
export class WeatherError extends Error {
  /**
   * @param {string} message - 错误描述
   * @param {'NO_LOCATION_KEY'|'FETCH_FAILED'|'PARSE_FAILED'} code - 错误码
   */
  constructor(message, code) {
    super(message)
    this.name = 'WeatherError'
    this.code = code
  }
}

// ─── 常量 ────────────────────────────────────────────────────

/** 地理定位超时时间（毫秒） */
const GEO_TIMEOUT = 8000

/** 地理定位缓存时间（毫秒），10 分钟 */
const GEO_MAX_AGE = 10 * 60 * 1000

// ─── 业务函数 ────────────────────────────────────────────────

/**
 * 城市搜索（替代 Nominatim 搜索）
 * @param {string} query - 搜索关键词（城市名）
 * @returns {Promise<Array<{name: string, locationKey: string, lat: number, lon: number, affiliation: string}>>}
 */
export async function searchLocations(query) {
  if (!query || query.trim().length < 2) {
    return []
  }

  try {
    const rawList = await searchCity(query.trim())
    return parseLocationResults(rawList)
  } catch (error) {
    console.warn('[weather-service] 城市搜索失败:', error.message)
    return []
  }
}

/**
 * 反向地理编码（经纬度 → 城市信息）
 * @param {number} lat - 纬度
 * @param {number} lon - 经度
 * @returns {Promise<{name: string, locationKey: string, lat: number, lon: number, affiliation: string}>}
 * @throws {LocationError} 当反向编码失败时抛出 GEO_FAILED
 */
export async function reverseGeocode(lat, lon) {
  try {
    const rawList = await getLocationByGeo(lat, lon)
    const results = parseLocationResults(rawList)

    if (results.length === 0) {
      throw new LocationError('反向地理编码未找到匹配的城市', 'GEO_FAILED')
    }

    return results[0]
  } catch (error) {
    if (error instanceof LocationError) {
      throw error
    }
    throw new LocationError(`反向地理编码失败: ${error.message}`, 'GEO_FAILED')
  }
}

/**
 * 获取完整天气数据
 * @param {{lat: number, lon: number, locationKey: string, name?: string}} location - 位置信息
 * @returns {Promise<{current: object|null, daily: Array, hourly: Array, locationName: string}>}
 * @throws {WeatherError} 当 locationKey 缺失或请求失败时
 */
export async function fetchWeatherData(location) {
  if (!location || !location.lat || !location.lon) {
    throw new WeatherError('缺少经纬度信息', 'NO_LOCATION_KEY')
  }

  let rawData
  try {
    rawData = await getForecastWeather(location.lat, location.lon)
  } catch (error) {
    throw new WeatherError(`天气数据获取失败: ${error.message}`, 'FETCH_FAILED')
  }

  // 优雅降级：各部分独立解析，某部分失败不影响其他
  let current = null
  let daily = []
  let hourly = []

  try {
    current = parseCurrentWeather(rawData?.current)
  } catch (error) {
    console.warn('[weather-service] 当前天气解析失败:', error.message)
  }

  try {
    daily = parseDailyForecast(rawData?.forecastDaily)
  } catch (error) {
    console.warn('[weather-service] 逐日预报解析失败:', error.message)
  }

  try {
    hourly = parseHourlyForecast(rawData?.forecastHourly)
  } catch (error) {
    console.warn('[weather-service] 逐小时预报解析失败:', error.message)
  }

  const locationName = location.name || ''

  return { current, daily, hourly, locationName }
}

/**
 * 获取浏览器地理定位
 * 封装 navigator.geolocation.getCurrentPosition 为 Promise
 * @returns {Promise<{lat: number, lon: number}>}
 * @throws {LocationError} 根据失败原因抛出对应错误码
 */
export function getGeolocation() {
  return new Promise((resolve, reject) => {
    if (!navigator || !navigator.geolocation) {
      reject(new LocationError('当前环境不支持地理定位', 'POSITION_UNAVAILABLE'))
      return
    }

    navigator.geolocation.getCurrentPosition(
      (position) => {
        resolve({
          lat: position.coords.latitude,
          lon: position.coords.longitude
        })
      },
      (error) => {
        switch (error.code) {
          case error.PERMISSION_DENIED:
            reject(new LocationError('用户拒绝了地理定位权限', 'PERMISSION_DENIED'))
            break
          case error.POSITION_UNAVAILABLE:
            reject(new LocationError('无法获取当前位置信息', 'POSITION_UNAVAILABLE'))
            break
          case error.TIMEOUT:
            reject(new LocationError('地理定位请求超时', 'TIMEOUT'))
            break
          default:
            reject(new LocationError(`地理定位失败: ${error.message}`, 'POSITION_UNAVAILABLE'))
        }
      },
      {
        enableHighAccuracy: false,
        timeout: GEO_TIMEOUT,
        maximumAge: GEO_MAX_AGE
      }
    )
  })
}

/**
 * 自动定位 + 获取天气的组合流程
 * 1. 浏览器定位获取经纬度
 * 2. 反向地理编码获取 locationKey 和城市名
 * 3. 获取天气数据
 * @returns {Promise<{weatherData: {current: object|null, daily: Array, hourly: Array, locationName: string}, location: {name: string, locationKey: string, lat: number, lon: number}}>}
 * @throws {LocationError} 定位或反向编码失败时
 * @throws {WeatherError} 天气数据获取失败时
 */
export async function autoLocateAndFetch() {
  // Step 1: 获取经纬度
  const coords = await getGeolocation()

  // Step 2: 反向地理编码
  const locationInfo = await reverseGeocode(coords.lat, coords.lon)

  // Step 3: 获取天气数据
  const weatherData = await fetchWeatherData(locationInfo)

  return {
    weatherData,
    location: {
      name: locationInfo.name,
      locationKey: locationInfo.locationKey,
      lat: locationInfo.lat,
      lon: locationInfo.lon
    }
  }
}
