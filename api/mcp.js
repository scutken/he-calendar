import { McpServer } from '@modelcontextprotocol/server'
import { NodeStreamableHTTPServerTransport } from '@modelcontextprotocol/node'
import { z } from 'zod'
import {
  getDateInfo,
  getAlmanac,
  getFestivals,
  searchNextFestival,
  getShichen,
} from '../src/shared/calendar-core.js'

const MCP_API_KEY = process.env.HE_CALENDAR_MCP_API_KEY

function createToolResult(data) {
  return {
    content: [{ type: 'text', text: JSON.stringify(data, null, 2) }],
    structuredContent: data,
  }
}

function getParsedBody(body) {
  if (body == null) return undefined
  if (typeof body === 'string') return JSON.parse(body)
  if (Buffer.isBuffer(body)) return JSON.parse(body.toString('utf8'))
  return body
}

function buildServer() {
  const server = new McpServer({
    name: 'he-calendar-remote-mcp',
    version: '1.4.0',
  })

  server.registerTool(
    'get_date_info',
    {
      description: '查询指定日期的完整日历信息，包括公历、农历、生肖、干支、节气、节日、法定假日等。',
      inputSchema: z.object({
        date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().describe('公历日期，格式 YYYY-MM-DD。'),
      }),
    },
    async input => createToolResult(getDateInfo(input)),
  )

  server.registerTool(
    'get_almanac',
    {
      description: '查询指定日期的黄历信息，包括宜、忌、彭祖百忌、五行纳音、冲煞、胎神方位等。',
      inputSchema: z.object({
        date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().describe('公历日期，格式 YYYY-MM-DD。'),
      }),
    },
    async input => createToolResult(getAlmanac(input)),
  )

  server.registerTool(
    'get_festivals',
    {
      description: '查询指定日期范围内的所有节日，默认从今天起未来 30 天。',
      inputSchema: z.object({
        start_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().describe('起始日期，格式 YYYY-MM-DD。'),
        end_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().describe('结束日期，格式 YYYY-MM-DD。'),
      }),
    },
    async input => createToolResult(getFestivals(input)),
  )

  server.registerTool(
    'search_next_festival',
    {
      description: '查找下一个指定名称的节日或节气，支持模糊匹配。',
      inputSchema: z.object({
        festival_name: z.string().min(1).describe('节日或节气名称，例如中秋、春节、清明、冬至。'),
      }),
    },
    async input => createToolResult(searchNextFestival(input)),
  )

  server.registerTool(
    'get_shichen',
    {
      description: '查询指定日期的十二时辰吉凶信息。',
      inputSchema: z.object({
        date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().describe('公历日期，格式 YYYY-MM-DD。'),
      }),
    },
    async input => createToolResult(getShichen(input)),
  )

  return server
}

function setCorsHeaders(res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type, Mcp-Protocol-Version, Mcp-Session-Id')
  res.setHeader('Access-Control-Expose-Headers', 'Mcp-Protocol-Version, Mcp-Session-Id, WWW-Authenticate')
}

function unauthorized(res) {
  setCorsHeaders(res)
  res.setHeader('WWW-Authenticate', 'Bearer realm="he-calendar-mcp"')
  return res.status(401).json({ error: 'Unauthorized', message: '请在 Authorization 中提供固定 Bearer Token。' })
}

function configMissing(res) {
  setCorsHeaders(res)
  return res.status(500).json({ error: 'Server Misconfigured', message: '缺少 HE_CALENDAR_MCP_API_KEY。' })
}

export default async function handler(req, res) {
  setCorsHeaders(res)

  if (req.method === 'OPTIONS') {
    return res.status(204).end()
  }

  if (!['GET', 'POST', 'DELETE'].includes(req.method)) {
    return res.status(405).json({ error: 'Method Not Allowed', allow: ['GET', 'POST', 'DELETE', 'OPTIONS'] })
  }

  if (!MCP_API_KEY) {
    return configMissing(res)
  }

  const authHeader = req.headers.authorization || ''
  const expected = `Bearer ${MCP_API_KEY}`
  if (authHeader !== expected) {
    return unauthorized(res)
  }

  const server = buildServer()
  const transport = new NodeStreamableHTTPServerTransport({
    sessionIdGenerator: undefined,
    enableJsonResponse: true,
  })

  try {
    await server.connect(transport)
    res.on('close', () => {
      transport.close().catch(() => {})
    })
    await transport.handleRequest(req, res, getParsedBody(req.body))
  } catch (error) {
    console.error('MCP request failed:', error)
    if (!res.headersSent) {
      res.status(500).json({ error: 'Internal Server Error', message: error instanceof Error ? error.message : 'Unknown error' })
    }
  }
}
