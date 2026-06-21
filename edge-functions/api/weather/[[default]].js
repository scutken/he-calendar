/**
 * EdgeOne Edge Function - 小米天气 API 代理
 * 转发 /api/weather/* 到 https://weatherapi.market.xiaomi.com/wtr-v3/*
 * 解决生产环境 CORS 跨域问题
 *
 * 路由: /api/weather/location/city/search?name=广州
 *    →  https://weatherapi.market.xiaomi.com/wtr-v3/location/city/search?name=广州
 */

// 目标上游 API
const UPSTREAM = 'https://weatherapi.market.xiaomi.com/wtr-v3'

export function onRequest(context) {
  const { request } = context

  // 从 URL 路径中提取 /api/weather/ 后面的部分
  const url = new URL(request.url)
  const pathAfterPrefix = url.pathname.replace(/^\/api\/weather/, '')
  const targetUrl = `${UPSTREAM}${pathAfterPrefix}${url.search}`

  // 构建代理请求（保留原始 method + headers 中必要的部分）
  const proxyHeaders = new Headers(request.headers)
  // 删除浏览器自动添加的 Host/Origin/Referer header，避免暴露
  proxyHeaders.delete('host')
  proxyHeaders.delete('origin')
  proxyHeaders.delete('referer')

  const proxyRequest = new Request(targetUrl, {
    method: request.method,
    headers: proxyHeaders,
    body: request.method !== 'GET' && request.method !== 'HEAD' ? request.body : undefined,
    redirect: 'follow'
  })

  return fetch(proxyRequest)
}
