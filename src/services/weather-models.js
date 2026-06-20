/**
 * 天气数据模型转换层
 * 将小米天气 API 原始响应转换为应用内部格式
 */

/**
 * 天气代码 → 描述映射表
 * @type {Record<number, string>}
 */
const WEATHER_CODE_MAP = {
  0: '晴',
  1: '多云',
  2: '阴',
  3: '阵雨',
  4: '雷阵雨',
  5: '雷阵雨伴有冰雹',
  6: '雨夹雪',
  7: '小雨',
  8: '中雨',
  9: '大雨',
  10: '暴雨',
  11: '大暴雨',
  12: '特大暴雨',
  13: '阵雪',
  14: '小雪',
  15: '中雪',
  16: '大雪',
  17: '暴雪',
  18: '雾',
  19: '冻雨',
  20: '沙尘暴',
  21: '小到中雨',
  22: '中到大雨',
  23: '大到暴雨',
  24: '暴到大暴雨',
  25: '大暴到特大暴雨',
  26: '小到中雪',
  27: '中到大雪',
  28: '大到暴雪',
  29: '浮尘',
  30: '扬沙',
  31: '强沙尘暴',
  32: '霾',
  99: '未知'
}

/**
 * 天气描述 → 表情符号映射
 * @type {Array<[RegExp, string]>}
 */
const WEATHER_ICON_RULES = [
  [/^晴$/, '☀️'],
  [/多云/, '⛅'],
  [/^阴$/, '☁️'],
  [/雷阵雨/, '⛈️'],
  [/大雨|暴雨|大暴雨|特大暴雨/, '⛈️'],
  [/中雨/, '🌧️'],
  [/小雨|阵雨/, '🌦️'],
  [/雨夹雪/, '🌨️'],
  [/中雪|大雪|暴雪/, '❄️'],
  [/小雪|阵雪/, '🌨️'],
  [/雾|霾/, '🌫️'],
  [/扬沙|沙尘暴|浮尘/, '🌪️']
]

/**
 * 根据温度获取对应的颜色编码
 * @param {number} temp - 温度值（摄氏度）
 * @returns {string} 对应的 hex 颜色
 */
export function getTempColor(temp) {
  if (temp <= 0) return '#3b82f6'
  if (temp <= 10) return '#60a5fa'
  if (temp <= 20) return '#22c55e'
  if (temp <= 28) return '#eab308'
  if (temp <= 35) return '#f97316'
  return '#ef4444'
}

/**
 * 根据天气描述文本获取对应的天气 emoji
 * @param {string} weatherText - 天气描述文本（如"晴"、"多云"、"小雨"等）
 * @param {boolean} isNight - 是否为夜间（影响晴/多云图标）
 * @returns {string} 对应的天气 emoji
 */
export function getWeatherIcon(weatherText, isNight = false) {
  if (!weatherText) return isNight ? '🌙' : '🌤️'

  for (const [pattern, icon] of WEATHER_ICON_RULES) {
    if (pattern.test(weatherText)) {
      if (isNight) {
        if (icon === '☀️') return '🌙'
        if (icon === '⛅') return '☁️'
      }
      return icon
    }
  }
  return isNight ? '🌙' : '🌤️'
}

/**
 * 根据天气代码获取天气描述文本
 * @param {number} code - 天气代码整数
 * @returns {string} 天气描述文本
 */
export function getWeatherTextByCode(code) {
  return WEATHER_CODE_MAP[code] ?? '未知'
}

/**
 * 解析位置搜索/反向编码结果
 * @param {Array} rawList - API 返回的 location 数组
 * @returns {Array<{name: string, locationKey: string, lat: number, lon: number, affiliation: string}>}
 */
export function parseLocationResults(rawList) {
  if (!Array.isArray(rawList)) return []

  return rawList.map(item => ({
    name: item.name || '',
    locationKey: item.locationKey || item.key || '',
    lat: Number(item.latitude) || 0,
    lon: Number(item.longitude) || 0,
    affiliation: item.affiliation || ''
  }))
}

/**
 * 解析当前天气
 * @param {object} current - ChinaForecastResult.current 对象
 * @returns {{temp: number, feelsLike: number, humidity: number, pressure: number, visibility: number, uvIndex: string, weather: string, windDir: string, windSpeed: number, icon: string}}
 */
export function parseCurrentWeather(current) {
  if (!current) return null

  const weather = getWeatherTextByCode(Number(current.weather) || 0)
  const now = new Date()
  const hour = now.getHours()
  const isNight = hour < 6 || hour >= 18

  return {
    temp: Number(current.temperature?.value) || 0,
    feelsLike: Number(current.feelsLike?.value) || 0,
    humidity: Number(current.humidity?.value) || 0,
    pressure: Number(current.pressure?.value) || 0,
    visibility: Number(current.visibility?.value) || 0,
    uvIndex: String(current.uvIndex ?? ''),
    weather,
    windDir: String(current.wind?.direction?.value ?? ''),
    windSpeed: Number(current.wind?.speed?.value) || 0,
    icon: getWeatherIcon(weather, isNight)
  }
}

/**
 * 解析逐日预报
 * @param {object} forecastDaily - ChinaForecastResult.forecastDaily 对象
 * @returns {Array<{date: string, maxTemp: number, minTemp: number, weatherDay: string, weatherNight: string, icon: string, windDir: string, windSpeed: string}>}
 */
export function parseDailyForecast(forecastDaily) {
  if (!forecastDaily) return []

  const temperatures = forecastDaily.temperature?.value || []
  const weathers = forecastDaily.weather?.value || []
  const winds = forecastDaily.wind?.value || []
  const pubTime = forecastDaily.pubTime || new Date().toISOString()

  // 基准日期
  const baseDate = new Date(pubTime)
  baseDate.setHours(0, 0, 0, 0)

  return temperatures.map((tempItem, index) => {
    const date = new Date(baseDate)
    date.setDate(date.getDate() + index)
    const dateStr = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`

    const weatherDayCode = weathers[index]?.from || ''
    const weatherDay = getWeatherTextByCode(Number(weatherDayCode) || 0)
    const weatherNightCode = weathers[index]?.to || ''
    const weatherNight = getWeatherTextByCode(Number(weatherNightCode) || 0)
    const windItem = winds[index] || {}

    return {
      date: dateStr,
      maxTemp: Number(tempItem.to) || 0,
      minTemp: Number(tempItem.from) || 0,
      weatherDay,
      weatherNight,
      icon: getWeatherIcon(weatherDay),
      windDir: String(windItem.from?.direction ?? windItem.to?.direction ?? ''),
      windSpeed: String(windItem.from?.speed ?? windItem.to?.speed ?? '')
    }
  })
}

/**
 * 解析逐小时预报
 * @param {object} forecastHourly - ChinaForecastResult.forecastHourly 对象
 * @returns {Array<{hour: string, temp: number, weather: string, icon: string}>}
 */
export function parseHourlyForecast(forecastHourly) {
  if (!forecastHourly) return []

  const tempValues = forecastHourly.temperature?.value || []
  const weatherValues = forecastHourly.weather?.value || []
  const pubTime = forecastHourly.temperature?.pubTime || new Date().toISOString()

  const baseTime = new Date(pubTime)

  return tempValues.map((temp, index) => {
    const hourTime = new Date(baseTime)
    hourTime.setHours(hourTime.getHours() + index)
    const hour = hourTime.getHours()
    const hourStr = `${String(hour).padStart(2, '0')}:00`
    const isNight = hour < 6 || hour >= 18

    const weatherCode = Number(weatherValues[index]) || 0
    const weatherText = getWeatherTextByCode(weatherCode)

    return {
      hour: hourStr,
      temp: Number(temp) || 0,
      weather: weatherText,
      icon: getWeatherIcon(weatherText, isNight),
      isNight
    }
  })
}
