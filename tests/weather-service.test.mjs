import test from 'node:test'
import assert from 'node:assert/strict'
import { fetchWeatherData } from '../src/services/weather-service.js'

test('无效经纬度在发请求前失败，避免生成错误天气地址', async () => {
  for (const location of [null, {}, { lat: 0 }, { lat: Number.NaN, lon: 0 }, { lat: '0', lon: 0 }]) {
    await assert.rejects(
      () => fetchWeatherData(location),
      (error) => error.code === 'NO_LOCATION_KEY' && /经纬度/.test(error.message),
    )
  }
})

test('赤道与本初子午线的零经纬度是有效输入', async (t) => {
  const originalFetch = globalThis.fetch
  let requestedUrl = ''
  t.after(() => { globalThis.fetch = originalFetch })
  globalThis.fetch = async (url) => {
    requestedUrl = String(url)
    return new Response('{}', {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  const result = await fetchWeatherData({ lat: 0, lon: 0, locationKey: 'zero' })
  assert.match(requestedUrl, /latitude=0/)
  assert.match(requestedUrl, /longitude=0/)
  assert.equal(result.current, null)
  assert.deepEqual(result.daily, [])
})
